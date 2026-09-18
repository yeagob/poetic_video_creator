/**
 * Audio Synthesizer & Web Audio helper
 * Generates rich, meditative ambient procedural tracks for presets
 * and decodes custom uploaded audio files or Gemini TTS audio.
 */
import { SubtitleCue } from '../types';

let sharedAudioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

/**
 * Creates an AudioBuffer containing a rich, procedural musical composition
 * based on selected atmospheric style.
 */
export async function generateAtmosphericMusicBuffer(
  trackId: string,
  durationSeconds: number = 60
): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const sampleRate = ctx.sampleRate;
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const buffer = ctx.createBuffer(2, totalSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Musical scales (chords in Hz)
  let rootFreqs: number[] = [110, 130.81, 146.83, 164.81, 196, 220]; // A minor / C major chords
  if (trackId === 'track-ambient-celestial') {
    rootFreqs = [130.81, 146.83, 164.81, 196, 246.94, 261.63]; // C lydian/ambient
  } else if (trackId === 'track-acoustic-guitar') {
    rootFreqs = [82.41, 110, 123.47, 146.83, 164.81, 196]; // E minor acoustic
  } else if (trackId === 'track-orchestral-epic') {
    rootFreqs = [73.42, 98, 110, 130.81, 146.83, 174.61]; // D minor dramatic
  }

  // Pre-generate rich musical pads and arpeggio notes
  const notesCount = Math.floor(durationSeconds * 1.5);
  const chordCycleDuration = 6.0; // seconds per chord

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const chordIndex = Math.floor(t / chordCycleDuration) % rootFreqs.length;
    const baseFreq = rootFreqs[chordIndex];

    // Warm pad fundamental and 3rd / 5th / 7th harmonics
    const f1 = baseFreq;
    const f2 = baseFreq * 1.5; // fifth
    const f3 = baseFreq * (chordIndex % 2 === 0 ? 1.2 : 1.25); // minor / major third
    const f4 = baseFreq * 2.0;

    // Slow LFO for dreamy breathing dynamics
    const lfo1 = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.15 * t);
    const lfo2 = 0.5 + 0.5 * Math.cos(2 * Math.PI * 0.11 * t);

    // Warm strings / pad tone
    const pad =
      (Math.sin(2 * Math.PI * f1 * t) * 0.4 +
       Math.sin(2 * Math.PI * f2 * t + 0.4) * 0.25 +
       Math.sin(2 * Math.PI * f3 * t + 0.8) * 0.2 +
       Math.sin(2 * Math.PI * f4 * t + 1.2) * 0.15) *
      lfo1;

    // Subtle gentle bell/piano arpeggio touch every 1.5 seconds
    const arpPhase = (t % 1.5) / 1.5;
    const arpDecay = Math.exp(-arpPhase * 4.5);
    const arpNoteIdx = Math.floor(t / 1.5) % 4;
    const arpMultipliers = [2.0, 2.5, 3.0, 4.0];
    const arpF = baseFreq * arpMultipliers[arpNoteIdx];
    const arpTone = Math.sin(2 * Math.PI * arpF * t) * arpDecay * 0.18;

    // Sub-bass resonance for cinematic fullness
    const subBass = Math.sin(2 * Math.PI * (baseFreq * 0.5) * t) * 0.25;

    // Subtle vinyl/tape warmth
    const tapeNoise = (Math.random() * 2 - 1) * 0.004;

    const sample = (pad * 0.45 + arpTone + subBass * 0.35 + tapeNoise) * 0.65;

    // Slight stereo widening
    left[i] = sample * (0.85 + 0.15 * Math.sin(2 * Math.PI * 0.08 * t));
    right[i] = sample * (0.85 + 0.15 * Math.cos(2 * Math.PI * 0.08 * t));
  }

  // Smooth fade-in (2s) and fade-out (3s)
  const fadeInSamples = Math.min(totalSamples, sampleRate * 2);
  const fadeOutSamples = Math.min(totalSamples, sampleRate * 3);
  for (let i = 0; i < fadeInSamples; i++) {
    const factor = i / fadeInSamples;
    left[i] *= factor;
    right[i] *= factor;
  }
  for (let i = 0; i < fadeOutSamples; i++) {
    const factor = i / fadeOutSamples;
    const idx = totalSamples - 1 - i;
    left[idx] *= factor;
    right[idx] *= factor;
  }

  return buffer;
}

/**
 * Decodes an uploaded Audio File (mp3, wav, etc.) into an AudioBuffer.
 */
export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const arrayBuffer = await file.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
}

/**
 * Decodes base64 WAV or audio data into an AudioBuffer.
 */
export async function decodeBase64Audio(base64Data: string): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  if (!base64Data || typeof base64Data !== 'string' || base64Data.trim().length < 50) {
    return ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
  }
  try {
    const binaryString = atob(base64Data.trim());
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const bufferCopy = bytes.buffer.slice(0);
    return await new Promise<AudioBuffer>((resolve) => {
      ctx.decodeAudioData(
        bufferCopy,
        (decoded) => resolve(decoded),
        (err) => {
          console.warn('[AudioSynthesizer] decodeAudioData falló, proveyendo buffer de respaldo:', err);
          resolve(ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate));
        }
      );
    });
  } catch (err) {
    console.warn('[AudioSynthesizer] Error decodificando base64, proveyendo buffer de respaldo:', err);
    return ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
  }
}

/**
 * Assembles multiple decoded speech blocks (each verse with its actual duration)
 * into a single unified AudioBuffer with randomized silences between verses,
 * and calculates exact subtitle cues matching the real audio durations.
 */
export function assembleSpeechTimeline(
  decodedBlocks: { buffer: AudioBuffer; text: string; id: string }[],
  minSilence: number = 1.0,
  maxSilence: number = 2.4,
  isMale: boolean = false
): { masterBuffer: AudioBuffer; subtitles: SubtitleCue[]; totalDuration: number } {
  const ctx = getAudioContext();
  const sampleRate = ctx.sampleRate;

  if (decodedBlocks.length === 0) {
    const emptyBuf = ctx.createBuffer(2, Math.floor(sampleRate * 2), sampleRate);
    return { masterBuffer: emptyBuf, subtitles: [], totalDuration: 2.0 };
  }

  // Voice DSP parameters:
  // Male: pitch lowered by ~20% (0.80 ratio) for solemn baritone depth & slower poetic cadence
  // Female: gentle 0.94 ratio for lyrical warmth
  const pitchRatio = isMale ? 0.80 : 0.94;

  // Process each block with pitch adjustment and analog warmth
  const processedBlocks: {
    leftData: Float32Array;
    rightData: Float32Array;
    duration: number;
    text: string;
    id: string;
  }[] = [];

  for (const block of decodedBlocks) {
    const srcLeft = block.buffer.getChannelData(0);
    const srcRight =
      block.buffer.numberOfChannels > 1
        ? block.buffer.getChannelData(1)
        : srcLeft;

    const srcLength = block.buffer.length;
    // Resample length
    const outLength = Math.max(1, Math.round(srcLength / pitchRatio));
    const outLeft = new Float32Array(outLength);
    const outRight = new Float32Array(outLength);

    for (let d = 0; d < outLength; d++) {
      const srcIdx = d * pitchRatio;
      const i0 = Math.floor(srcIdx);
      const i1 = Math.min(srcLength - 1, i0 + 1);
      const frac = srcIdx - i0;

      // Linear interpolation
      let valL = srcLeft[i0] * (1 - frac) + srcLeft[i1] * frac;
      let valR = srcRight[i0] * (1 - frac) + srcRight[i1] * frac;

      if (isMale) {
        // Warm baritone resonance & soft-knee analog saturation
        valL = Math.tanh(valL * 1.28) * 0.94;
        valR = Math.tanh(valR * 1.28) * 0.94;
      } else {
        // Lyrical silky clarity
        valL = valL * 0.96;
        valR = valR * 0.96;
      }

      outLeft[d] = valL;
      outRight[d] = valR;
    }

    const duration = outLength / sampleRate;
    processedBlocks.push({
      leftData: outLeft,
      rightData: outRight,
      duration,
      text: block.text,
      id: block.id,
    });
  }

  let currentSec = 0.4; // breathing pre-roll
  const placedBlocks: {
    leftData: Float32Array;
    rightData: Float32Array;
    text: string;
    id: string;
    startTime: number;
    endTime: number;
  }[] = [];

  for (let i = 0; i < processedBlocks.length; i++) {
    const item = processedBlocks[i];
    const startTime = currentSec;
    const endTime = startTime + item.duration;

    placedBlocks.push({
      leftData: item.leftData,
      rightData: item.rightData,
      text: item.text,
      id: item.id,
      startTime,
      endTime,
    });

    currentSec = endTime;

    if (i < processedBlocks.length - 1) {
      // Pick random silence within user configured range
      const randomSilence =
        minSilence + Math.random() * Math.max(0, maxSilence - minSilence);
      currentSec += randomSilence;
    }
  }

  currentSec += 0.8; // final poetic outro pause
  const totalDuration = Number(currentSec.toFixed(2));
  const totalSamples = Math.ceil(totalDuration * sampleRate);

  const masterBuffer = ctx.createBuffer(2, totalSamples, sampleRate);
  const leftChannel = masterBuffer.getChannelData(0);
  const rightChannel = masterBuffer.getChannelData(1);

  const subtitles: SubtitleCue[] = [];

  for (const item of placedBlocks) {
    subtitles.push({
      id: item.id,
      text: item.text,
      startTime: Number(item.startTime.toFixed(2)),
      endTime: Number(item.endTime.toFixed(2)),
    });

    const startSample = Math.floor(item.startTime * sampleRate);
    const len = item.leftData.length;

    for (let s = 0; s < len; s++) {
      const destIndex = startSample + s;
      if (destIndex < totalSamples) {
        leftChannel[destIndex] = item.leftData[s];
        rightChannel[destIndex] = item.rightData[s];
      }
    }
  }

  return { masterBuffer, subtitles, totalDuration };
}

/**
 * Encodes an in-memory AudioBuffer into a clean 16-bit PCM stereo WAV Blob.
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const left = buffer.getChannelData(0);
  const right = numChannels > 1 ? buffer.getChannelData(1) : left;
  const numSamples = buffer.length;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sL = Math.max(-1, Math.min(1, left[i]));
    view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7fff, true);
    offset += 2;
    if (numChannels > 1) {
      const sR = Math.max(-1, Math.min(1, right[i]));
      view.setInt16(offset, sR < 0 ? sR * 0x8000 : sR * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

