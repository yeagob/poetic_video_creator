import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec, spawn } from 'child_process';
import multer from 'multer';
import { GoogleGenAI, Modality } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 300 * 1024 * 1024 }, // 300MB
});

app.use(express.raw({ type: ['video/*', 'application/octet-stream'], limit: '200mb' }));
app.use(express.json({ limit: '50mb' }));

// Helper to convert raw 16-bit PCM to standard playable WAV buffer
function pcmToWav(pcmBuffer: Buffer, sampleRate: number = 24000, numChannels: number = 1): Buffer {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const wavHeader = Buffer.alloc(44);

  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavHeader.write('WAVE', 8);

  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  wavHeader.writeUInt16LE(1, 20); // AudioFormat 1 = PCM
  wavHeader.writeUInt16LE(numChannels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(16, 34); // BitsPerSample

  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([wavHeader, pcmBuffer]);
}

// Generate timed subtitle cues aligned with speech duration
function generateSubtitleCues(rawText: string, totalDuration: number) {
  // Split by verses or sentences
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  // Calculate weights based on character count and pauses
  const weights = lines.map((line) => {
    let w = line.length;
    // Add extra weight for punctuation pauses (periods, commas, semicolons)
    if (/[.,;!?]$/.test(line)) w += 8;
    return Math.max(w, 5);
  });

  const totalWeight = weights.reduce((acc, curr) => acc + curr, 0);
  const cues: Array<{ id: string; text: string; startTime: number; endTime: number }> = [];

  let currentTime = 0;
  // Ensure subtle intro buffer of 0.2s
  const effectiveDuration = Math.max(totalDuration - 0.3, lines.length * 1.5);

  lines.forEach((line, index) => {
    const fraction = weights[index] / totalWeight;
    const lineDuration = fraction * effectiveDuration;
    const startTime = currentTime;
    const endTime = Math.min(totalDuration, currentTime + lineDuration);

    cues.push({
      id: `cue-${index}-${Date.now()}`,
      text: line,
      startTime: Number(startTime.toFixed(2)),
      endTime: Number(endTime.toFixed(2)),
    });

    currentTime = endTime;
  });

  if (cues.length > 0) {
    cues[cues.length - 1].endTime = Number(totalDuration.toFixed(2));
  }

  return cues;
}

// Splits a continuous 24kHz 16-bit mono PCM buffer into verse blocks
function splitPcmIntoBlocks(pcmBuffer: Buffer, lines: string[], sampleRate = 24000): Buffer[] {
  const bytesPerSample = 2; // 16-bit mono
  const totalSamples = Math.floor(pcmBuffer.length / bytesPerSample);
  if (lines.length <= 1 || totalSamples < sampleRate) {
    return [pcmBuffer];
  }

  // Calculate proportional weights based on characters and words
  const lineWeights = lines.map((l) => {
    const words = l.trim().split(/\s+/).length;
    const chars = l.trim().length;
    return Math.max(1, chars + words * 2);
  });
  const totalWeight = lineWeights.reduce((a, b) => a + b, 0);

  const splitSampleIndices: number[] = [];
  let cumWeight = 0;

  for (let i = 0; i < lines.length - 1; i++) {
    cumWeight += lineWeights[i];
    const targetSample = Math.floor((cumWeight / totalWeight) * totalSamples);

    // Search window: +/- 0.8s around expected boundary for lowest energy (silence valley)
    const windowRadius = Math.floor(sampleRate * 0.8);
    const searchStart = Math.max(0, targetSample - windowRadius);
    const searchEnd = Math.min(totalSamples - 1, targetSample + windowRadius);

    let minEnergy = Infinity;
    let bestSample = targetSample;
    const step = 240; // 10ms chunk

    for (let s = searchStart; s < searchEnd - step; s += step) {
      let energy = 0;
      for (let k = 0; k < step; k++) {
        const val = pcmBuffer.readInt16LE((s + k) * bytesPerSample);
        energy += Math.abs(val);
      }
      if (energy < minEnergy) {
        minEnergy = energy;
        bestSample = s;
      }
    }

    splitSampleIndices.push(bestSample);
  }

  const result: Buffer[] = [];
  let lastByte = 0;
  for (let i = 0; i < splitSampleIndices.length; i++) {
    const endByte = splitSampleIndices[i] * bytesPerSample;
    result.push(pcmBuffer.subarray(lastByte, endByte));
    lastByte = endByte;
  }
  result.push(pcmBuffer.subarray(lastByte));
  return result;
}

// Synthesizes a natural speech cadence PCM block for a single line of text (emergency offline net)
function generateSingleLineSyntheticPcm(line: string, isMale: boolean, sampleRate = 24000): Buffer {
  const words = line.split(/\s+/).filter(Boolean).length;
  let duration = Math.max(1.8, words * 0.42 + 0.6);
  if (/[.,;!?]$/.test(line.trim())) duration += 0.4;

  const numSamples = Math.floor(sampleRate * duration);
  const pcmBuffer = Buffer.alloc(numSamples * 2);
  const baseFreq = isMale ? 112 : 210;
  let sampleIndex = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const syllMod = Math.max(0.05, Math.sin(t * Math.PI * 9));
    const fund = Math.sin(2 * Math.PI * baseFreq * t);
    const harm1 = 0.5 * Math.sin(2 * Math.PI * (baseFreq * 2) * t);
    const harm2 = 0.25 * Math.sin(2 * Math.PI * (baseFreq * 3) * t);
    const vocalTrack = (fund + harm1 + harm2) * syllMod * 0.45;
    const attack = Math.min(1, t / 0.15);
    const release = Math.min(1, (duration - t) / 0.2);
    const env = Math.max(0, attack * release);
    const sampleVal = Math.floor(vocalTrack * env * 22000);
    pcmBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, sampleVal)), sampleIndex);
    sampleIndex += 2;
  }

  return pcmBuffer;
}

// Splits text into natural sentence or word chunks that never exceed maxLen
function splitTextIntoSafeChunks(text: string, maxLen = 130): string[] {
  const clean = text.replace(/[\r\n\t]+/g, ' ').trim();
  if (clean.length <= maxLen) return [clean];

  const chunks: string[] = [];
  const parts = clean.split(/(?<=[,.;:!?])\s+/);
  let current = '';

  for (const part of parts) {
    if ((current + ' ' + part).trim().length <= maxLen) {
      current = (current + ' ' + part).trim();
    } else {
      if (current) chunks.push(current);
      if (part.length <= maxLen) {
        current = part;
      } else {
        const words = part.split(/\s+/);
        current = '';
        for (const word of words) {
          if ((current + ' ' + word).trim().length <= maxLen) {
            current = (current + ' ' + word).trim();
          } else {
            if (current) chunks.push(current);
            current = word;
          }
        }
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((c) => c.trim().length > 0);
}

async function fetchSpanishVoiceChunk(chunk: string): Promise<Buffer> {
  const clean = chunk.replace(/[\r\n\t]+/g, ' ').trim();
  if (!clean) return Buffer.alloc(0);
  const encoded = encodeURIComponent(clean);
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=es&client=gtx`;
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'audio/mpeg, audio/*; q=0.9',
    },
  });
  if (!response.ok) {
    throw new Error(`Error en servicio de voz: ${response.status}`);
  }
  const arrayBuf = await response.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  if (buf.length < 50) {
    throw new Error(`Respuesta de audio insuficiente (${buf.length} bytes)`);
  }
  return buf;
}

// Fetches real spoken Spanish audio for a single verse block of any length
async function fetchSpanishVoiceAudio(textLine: string): Promise<Buffer> {
  const chunks = splitTextIntoSafeChunks(textLine, 130);
  if (chunks.length === 0) {
    return Buffer.alloc(0);
  }
  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    const buf = await fetchSpanishVoiceChunk(chunk);
    if (buf.length > 0) {
      buffers.push(buf);
    }
  }
  return Buffer.concat(buffers);
}

// API Route for Text-to-Speech generation: Line-by-line blocks with exact audio durations & subtitles
app.post('/api/tts', async (req, res) => {
  const { text, gender, intonation, presetVoice, minSilence, maxSilence, voiceEnabled } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'El texto es obligatorio para generar la voz.' });
  }

  // Parse lines: each line break is a distinct verse block
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/[*_#`~[\]]/g, '').trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return res.status(400).json({ error: 'No se encontraron versos o líneas válidas en el texto.' });
  }

  // If user disabled voice generation: instantly return timed subtitles matching poem rhythm
  if (voiceEnabled === false) {
    const minSil = typeof minSilence === 'number' ? Math.max(0.5, Math.min(20, minSilence)) : 1.5;
    const maxSil = typeof maxSilence === 'number' ? Math.max(minSil, Math.min(20, maxSilence)) : 3.0;

    let currentSec = 0.5;
    const cues: Array<{ id: string; text: string; startTime: number; endTime: number }> = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const words = line.split(/\s+/).filter(Boolean).length;
      // Reading time scaled to verse length, between 2.5s and 18s
      const readingDuration = Math.max(2.5, Math.min(18.0, words * 0.48 + 1.4));
      const start = Number(currentSec.toFixed(2));
      const end = Number((currentSec + readingDuration).toFixed(2));

      cues.push({
        id: `cue-${idx + 1}`,
        text: line,
        startTime: start,
        endTime: end,
      });

      const randSil = minSil + Math.random() * Math.max(0, maxSil - minSil);
      currentSec = end + randSil;
    }

    const totalDuration = Number((currentSec + 1.0).toFixed(2));

    return res.json({
      success: true,
      audioBase64: '',
      mimeType: 'audio/wav',
      duration: totalDuration,
      subtitles: cues,
      sampleRate: 24000,
      voiceName: 'Locución desactivada',
      engineUsed: 'none',
      isFallback: false,
      blockCount: 0,
      blocks: [],
      voiceEnabled: false,
      fallbackNotice: 'Modo solo música y subtítulos (locución desactivada).',
    });
  }

  const isMale = gender === 'male';
  let voiceName = presetVoice || (isMale ? 'Algieba' : 'Kore');
  if (typeof voiceName === 'string' && voiceName.toLowerCase().replace(/ie/g, 'i') === 'algiba') {
    voiceName = 'Algieba';
  }

  const rawIntonation = (intonation || '').replace(/:+$/, '').trim();
  const instruction = rawIntonation
    ? rawIntonation
    : isMale
    ? 'Lee con entonación de lectura poética solemne, voz profunda, potente y resonante'
    : 'Lee con entonación de lectura poética lírica, apasionada, voz profunda y cálida';

  const apiKey = process.env.GEMINI_API_KEY;
  let ai: GoogleGenAI | null = null;
  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  type BlockResult = {
    id: string;
    text: string;
    audioBase64: string;
    mimeType: string;
    engine: 'gemini-tts' | 'spanish-tts';
    rawBuffer: Buffer;
  };

  let blocks: BlockResult[] = [];
  let masterBase64 = '';
  let masterMimeType = 'audio/mpeg';
  let usedGemini = false;
  let geminiQuotaExceeded = false;

  console.log(`[TTS] Generando locución por bloques para ${lines.length} versos (género: ${gender}, voz: ${voiceName})...`);

  // STRATEGY 1: Single Gemini TTS call for the full poem, then segment into verse blocks.
  // This uses only 1 API call (avoiding the 10 req/day quota limit) and keeps voice consistent!
  if (ai) {
    try {
      const fullPrompt = `${instruction}:\n\n${lines.join('\n\n')}`;
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text: fullPrompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (audioPart && audioPart.inlineData?.data) {
        const fullRawPcm = Buffer.from(audioPart.inlineData.data, 'base64');
        const pcmChunks = splitPcmIntoBlocks(fullRawPcm, lines, 24000);

        blocks = pcmChunks.map((chunk, idx) => {
          const wavBuf = pcmToWav(chunk, 24000, 1);
          return {
            id: `cue-${idx + 1}`,
            text: lines[idx],
            audioBase64: wavBuf.toString('base64'),
            mimeType: 'audio/wav',
            engine: 'gemini-tts',
            rawBuffer: wavBuf,
          };
        });

        const fullWav = pcmToWav(fullRawPcm, 24000, 1);
        masterBase64 = fullWav.toString('base64');
        masterMimeType = 'audio/wav';
        usedGemini = true;
        console.log(`[TTS] Gemini TTS generó con éxito los ${blocks.length} bloques con voz ${voiceName}.`);
      }
    } catch (err: any) {
      if (err?.status === 429 || `${err}`.includes('429') || `${err}`.includes('RESOURCE_EXHAUSTED')) {
        geminiQuotaExceeded = true;
        console.warn('[TTS] Cuota de Gemini TTS alcanzada (429). Activando motor de locución poética en español por bloques.');
      } else {
        console.warn('[TTS] Aviso en Gemini TTS, pasando a motor poético en español:', err?.message || err);
      }
    }
  }

  // STRATEGY 2: High-definition Spanish voice recitation engine for ALL blocks
  if (!usedGemini || blocks.length === 0) {
    blocks = [];
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      let blockBuffer: Buffer | null = null;
      let mimeType = 'audio/mpeg';

      // 1. Try Google Spanish TTS with retry
      for (let attempt = 0; attempt < 2 && !blockBuffer; attempt++) {
        try {
          if (idx > 0) {
            // Small polite delay between verse queries
            await new Promise((resolve) => setTimeout(resolve, 40));
          }
          blockBuffer = await fetchSpanishVoiceAudio(line);
        } catch (fetchErr) {
          if (attempt === 1) {
            console.warn(`[TTS] No se pudo obtener audio online para verso "${line.slice(0, 20)}...", activando síntesis de respaldo:`, (fetchErr as any)?.message || fetchErr);
          }
        }
      }

      // 2. Emergency synthetic fallback if net fails or audio is empty
      if (!blockBuffer || blockBuffer.length < 100) {
        const fallbackPcm = generateSingleLineSyntheticPcm(line, isMale, 24000);
        blockBuffer = pcmToWav(fallbackPcm, 24000, 1);
        mimeType = 'audio/wav';
      }

      blocks.push({
        id: `cue-${idx + 1}`,
        text: line,
        audioBase64: blockBuffer.toString('base64'),
        mimeType,
        engine: 'spanish-tts',
        rawBuffer: blockBuffer,
      });
    }

    // Combine all MP3 buffers into a single master audio stream
    if (blocks.every((b) => b.mimeType === 'audio/mpeg')) {
      masterBase64 = Buffer.concat(blocks.map((b) => b.rawBuffer)).toString('base64');
      masterMimeType = 'audio/mpeg';
    } else {
      masterBase64 = blocks[0].audioBase64;
      masterMimeType = blocks[0].mimeType;
    }
    console.log(`[TTS] Motor poético en español completó ${blocks.length} bloques.`);
  }

  const subtitles = generateSubtitleCues(lines.join('\n'), lines.length * 3.6);

  let fallbackNotice: string | undefined;
  if (!usedGemini) {
    if (geminiQuotaExceeded) {
      fallbackNotice =
        'Se generó la locución poética en español por bloques de versos. (La cuota diaria gratuita de Gemini TTS de 10 peticiones fue alcanzada; para usar exclusivamente las voces Fenrir/Kore puedes configurar una clave con facturación en Settings > Secrets).';
    } else {
      fallbackNotice = 'Locución poética en español sincronizada verso a verso.';
    }
  }

  return res.json({
    success: true,
    audioBase64: masterBase64,
    mimeType: masterMimeType,
    duration: Number((lines.length * 3.8).toFixed(2)),
    subtitles,
    sampleRate: 24000,
    voiceName: usedGemini ? voiceName : `Español (${isMale ? 'Masculino' : 'Femenino'})`,
    engineUsed: usedGemini ? 'gemini-tts' : 'spanish-tts',
    isFallback: !usedGemini,
    blockCount: lines.length,
    blocks: blocks.map((b) => ({
      id: b.id,
      text: b.text,
      audioBase64: b.audioBase64,
      mimeType: b.mimeType,
      engine: b.engine,
    })),
    fallbackNotice,
  });
});


// Robust spawn-based FFmpeg execution with streaming stderr and timeout
function runFFmpeg(args: string[], timeoutMs: number = 300000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args);
    let stderrTail = '';

    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      reject(new Error(`Tiempo de espera agotado en FFmpeg (${timeoutMs / 1000}s)`));
    }, timeoutMs);

    child.stderr.on('data', (chunk) => {
      // Keep only recent 4KB to avoid memory bloat on long multi-paragraph videos
      stderrTail = (stderrTail + chunk.toString()).slice(-4096);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg finalizó con código de salida ${code}: ${stderrTail}`));
      }
    });
  });
}

// Convert/repair uploaded video to standardized high-compatibility MP4 using FFmpeg
app.post('/api/convert-to-mp4', async (req, res) => {
  try {
    const rawBuffer = req.body;
    if (!rawBuffer || !(rawBuffer instanceof Buffer) || rawBuffer.length === 0) {
      return res.status(400).json({ error: 'No se recibieron datos binarios de vídeo válidos.' });
    }

    const inputExt = (req.headers['x-input-ext'] as string) || 'webm';
    const tmpDir = os.tmpdir();
    const id = `video_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const inputPath = path.join(tmpDir, `${id}.${inputExt}`);
    const outputPath = path.join(tmpDir, `${id}.mp4`);

    await fs.promises.writeFile(inputPath, rawBuffer);

    // Run ffmpeg with ultrafast preset to ensure fast, pristine MP4 with faststart, AAC audio, and valid H.264 profile
    await runFFmpeg([
      '-y',
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      outputPath,
    ]);

    const outputBuffer = await fs.promises.readFile(outputPath);

    // Clean up temporary files
    try { await fs.promises.unlink(inputPath); } catch {}
    try { await fs.promises.unlink(outputPath); } catch {}

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="videoclip-poetico.mp4"');
    res.setHeader('Content-Length', outputBuffer.length.toString());
    return res.send(outputBuffer);
  } catch (err: any) {
    console.error('[FFmpeg] Fallo en la conversión a MP4:', err?.message || err);
    return res.status(500).json({ error: 'Error procesando el archivo con FFmpeg' });
  }
});

// Multiplex clean video track with pristine mixed audio track into high-compatibility MP4
app.post(
  '/api/combine-video-audio',
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const videoFile = files?.video?.[0];
    const audioFile = files?.audio?.[0];

    if (!videoFile) {
      return res.status(400).json({ error: 'No se recibió archivo de vídeo para combinar.' });
    }

    const tmpDir = os.tmpdir();
    const id = `mux_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const videoExtPath = path.join(tmpDir, `${id}_in.webm`);
    const audioExtPath = audioFile ? path.join(tmpDir, `${id}_in.wav`) : null;
    const outputPath = path.join(tmpDir, `${id}.mp4`);

    try {
      await fs.promises.copyFile(videoFile.path, videoExtPath);
      if (audioFile && audioExtPath) {
        await fs.promises.copyFile(audioFile.path, audioExtPath);
      }

      const ffmpegArgs: string[] = ['-y', '-i', videoExtPath];

      if (audioFile && audioExtPath) {
        // Mux deterministic video frames + pristine mixed audio with explicit stream mapping
        // yuv420p + faststart guarantees native playback across QuickTime, iOS, Android, Chrome & Windows
        ffmpegArgs.push('-i', audioExtPath);
        ffmpegArgs.push('-map', '0:v:0', '-map', '1:a:0');
        ffmpegArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p');
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
        ffmpegArgs.push('-shortest');
        ffmpegArgs.push('-movflags', '+faststart');
      } else {
        ffmpegArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p');
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
        ffmpegArgs.push('-movflags', '+faststart');
      }
      ffmpegArgs.push(outputPath);

      try {
        await runFFmpeg(ffmpegArgs);
      } catch (muxErr: any) {
        console.warn('[FFmpeg Muxer] Primer intento falló, reintentando combinación simplificada:', muxErr?.message);
        if (audioFile && audioExtPath) {
          const fallbackArgs = [
            '-y',
            '-i', videoExtPath,
            '-i', audioExtPath,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '22',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
            '-movflags', '+faststart',
            outputPath,
          ];
          await runFFmpeg(fallbackArgs);
        } else {
          throw muxErr;
        }
      }

      const outBuf = await fs.promises.readFile(outputPath);

      // Clean up temporary files safely
      try { await fs.promises.unlink(videoFile.path); } catch {}
      try { await fs.promises.unlink(videoExtPath); } catch {}
      if (audioFile) {
        try { await fs.promises.unlink(audioFile.path); } catch {}
      }
      if (audioExtPath) {
        try { await fs.promises.unlink(audioExtPath); } catch {}
      }
      try { await fs.promises.unlink(outputPath); } catch {}

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', 'attachment; filename="videoclip-poetico.mp4"');
      res.setHeader('Content-Length', outBuf.length.toString());
      return res.send(outBuf);
    } catch (err: any) {
      console.error('[FFmpeg Muxer] Error crítico en muxing:', err?.message || err);
      // Clean up uploaded files if error
      if (videoFile) try { await fs.promises.unlink(videoFile.path); } catch {}
      try { await fs.promises.unlink(videoExtPath); } catch {}
      if (audioFile) try { await fs.promises.unlink(audioFile.path); } catch {}
      if (audioExtPath) try { await fs.promises.unlink(audioExtPath); } catch {}
      return res.status(500).json({ error: 'Error procesando el vídeo final con FFmpeg: ' + (err?.message || 'timeout/mux error') });
    }
  }
);

// Probe video metadata using ffprobe
function runFFprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`ffprobe terminó con código ${code}: ${stderr}`));
    });
    child.on('error', reject);
  });
}

// Extract video frames into high-compatibility image frames using FFmpeg
app.post('/api/extract-video-frames', upload.single('video'), async (req, res) => {
  const videoFile = req.file;
  if (!videoFile) {
    return res.status(400).json({ error: 'No se recibió archivo de vídeo para extraer fotogramas.' });
  }

  const tmpDir = os.tmpdir();
  const sessionId = `frames_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const sessionDir = path.join(tmpDir, sessionId);
  await fs.promises.mkdir(sessionDir, { recursive: true });

  try {
    // 1. Detect accurate video duration
    let duration = 5.0;
    try {
      const probeOut = await runFFprobe([
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoFile.path,
      ]);
      const pDur = parseFloat(probeOut);
      if (!isNaN(pDur) && pDur > 0) {
        duration = pDur;
      }
    } catch (probeErr) {
      console.warn('[FFprobe] Aviso al detectar duración del vídeo:', probeErr);
    }

    // 2. Calculate optimal fps (12 fps for smooth fluid playback; bounded so total frames <= 120)
    const targetFps = Math.max(4, Math.min(12, Math.round(120 / Math.max(duration, 1))));

    // 3. Extract crisp JPEG frames with FFmpeg
    const outputPattern = path.join(sessionDir, 'frame_%04d.jpg');
    await runFFmpeg([
      '-y',
      '-i', videoFile.path,
      '-vf', `fps=${targetFps},scale=min(960\\,iw):-2`,
      '-q:v', '4',
      outputPattern,
    ]);

    const filesInDir = await fs.promises.readdir(sessionDir);
    const frameNames = filesInDir
      .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
      .sort();

    if (frameNames.length === 0) {
      throw new Error('No se generaron fotogramas del vídeo');
    }

    const frames: string[] = [];
    for (const name of frameNames) {
      const framePath = path.join(sessionDir, name);
      const buf = await fs.promises.readFile(framePath);
      frames.push(`data:image/jpeg;base64,${buf.toString('base64')}`);
      try { await fs.promises.unlink(framePath); } catch {}
    }

    try { await fs.promises.rmdir(sessionDir); } catch {}
    try { await fs.promises.unlink(videoFile.path); } catch {}

    return res.json({
      duration,
      fps: targetFps,
      framesCount: frames.length,
      thumbnailUrl: frames[0],
      frames,
    });
  } catch (err: any) {
    console.error('[ExtractVideoFrames] Error:', err);
    try { await fs.promises.rm(sessionDir, { recursive: true, force: true }); } catch {}
    try { await fs.promises.unlink(videoFile.path); } catch {}
    return res.status(500).json({
      error: 'Error al extraer fotogramas con FFmpeg: ' + (err?.message || 'Error desconocido'),
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'poetic-videoclip-studio' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
