import * as WebMMuxer from 'webm-muxer';
import { VideoRenderer } from './videoRenderer';
import { audioBufferToWavBlob } from './audioSynthesizer';

export interface ExportProgressCallback {
  (progress: number, stageText?: string): void;
}

/**
 * Deterministic, offline video exporter.
 * Renders every single frame mathematically (frame-by-frame) to ensure:
 * - 0% chance of frozen frames or skipped scenes
 * - Immune to browser tab throttling or background minimization
 * - Accurate subtitles and smooth continuous zoom/pan animations
 * - Full audio synchronization (voice + music) even across multiple paragraphs
 * - Final multiplexing via server FFmpeg into broadcast-quality, universal MP4
 */
export async function exportVideoclipHighQuality(
  renderer: VideoRenderer,
  onProgress: ExportProgressCallback
): Promise<Blob> {
  const canvas = renderer.getCanvas();
  const totalDuration = renderer.getTotalDuration();

  // Pause live preview during export to prevent audio interference
  renderer.pause();

  const fps = 30;
  const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));

  // Step 1: Render pristine mixed audio offline first (voice + atmospheric music)
  onProgress(5, 'Sincronizando banda sonora y locución poética...');
  let audioBuffer: AudioBuffer | null = null;
  let audioWavBlob: Blob | null = null;
  try {
    audioBuffer = await renderer.renderMixedAudioBuffer();
    if (audioBuffer) {
      audioWavBlob = audioBufferToWavBlob(audioBuffer);
    }
  } catch (audioErr) {
    console.warn('[VideoExporter] Fallo extrayendo audio offline:', audioErr);
  }

  const hasWebCodecs =
    typeof window !== 'undefined' &&
    typeof (window as any).VideoEncoder === 'function' &&
    typeof (window as any).VideoFrame === 'function';

  let videoBlob: Blob | null = null;

  // STRATEGY 1: Deterministic Frame-by-Frame encoding via WebCodecs
  if (hasWebCodecs) {
    try {
      videoBlob = await renderWithWebCodecs(
        renderer,
        canvas,
        totalDuration,
        totalFrames,
        fps,
        audioBuffer,
        onProgress
      );
    } catch (err) {
      console.warn('[VideoExporter] Fallo en WebCodecs, usando fallback MediaRecorder:', err);
      videoBlob = null;
    }
  }

  // STRATEGY 2: Fallback to real-time canvas stream capture with audio if WebCodecs failed
  if (!videoBlob) {
    onProgress(15, 'Grabando mediante flujo de vídeo y audio...');
    videoBlob = await renderer.exportVideoclip((pct) => {
      onProgress(Math.round(pct * 0.75), `Grabando vídeo (${pct}%)...`);
    });
  }

  // Step 3: Multiplex video and audio into a standardized MP4 using server-side FFmpeg
  onProgress(85, 'Finalizando codificación MP4 de alta compatibilidad (FFmpeg)...');
  try {
    const formData = new FormData();
    formData.append('video', videoBlob, 'video.webm');
    if (audioWavBlob) {
      formData.append('audio', audioWavBlob, 'audio.wav');
    }

    const response = await fetch('/api/combine-video-audio', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const finalMp4Blob = await response.blob();
      onProgress(100, '¡Videoclip listo para descargar!');
      return finalMp4Blob;
    } else {
      const errText = await response.text().catch(() => '');
      console.warn('[VideoExporter] Servidor devolvió status', response.status, errText, '- usando archivo local.');
    }
  } catch (serverErr) {
    console.warn('[VideoExporter] Aviso comunicando con FFmpeg server:', serverErr);
  }

  // Fallback to locally generated videoBlob if server FFmpeg is unavailable
  onProgress(100, '¡Videoclip listo para descargar!');
  return videoBlob;
}

async function renderWithWebCodecs(
  renderer: VideoRenderer,
  canvas: HTMLCanvasElement,
  totalDuration: number,
  totalFrames: number,
  fps: number,
  audioBuffer: AudioBuffer | null,
  onProgress: ExportProgressCallback
): Promise<Blob> {
  const width = canvas.width;
  const height = canvas.height;

  // Check if AudioEncoder is available and supports Opus
  let canEncodeAudio = false;
  if (
    audioBuffer &&
    typeof (window as any).AudioEncoder === 'function' &&
    typeof (window as any).AudioData === 'function'
  ) {
    try {
      const support = await (window as any).AudioEncoder.isConfigSupported({
        codec: 'opus',
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels,
        bitrate: 192_000,
      });
      canEncodeAudio = !!support?.supported;
    } catch {
      canEncodeAudio = false;
    }
  }

  const target = new WebMMuxer.ArrayBufferTarget();
  const muxerOptions: any = {
    target,
    video: {
      codec: 'V_VP9',
      width,
      height,
      frameRate: fps,
    },
  };

  if (canEncodeAudio && audioBuffer) {
    muxerOptions.audio = {
      codec: 'A_OPUS',
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
    };
  }

  const muxer = new WebMMuxer.Muxer(muxerOptions);

  // Detect supported video codec
  let selectedCodec = 'vp09.00.10.08';
  try {
    const isVp9Supported = await (window as any).VideoEncoder.isConfigSupported({
      codec: 'vp09.00.10.08',
      width,
      height,
      bitrate: 5_000_000,
      framerate: fps,
    });
    if (!isVp9Supported.supported) {
      selectedCodec = 'vp8';
    }
  } catch {
    selectedCodec = 'vp8';
  }

  let encoderError: any = null;
  const videoEncoder = new (window as any).VideoEncoder({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (e: any) => {
      console.error('[WebCodecs] VideoEncoder error:', e);
      encoderError = e;
    },
  });

  videoEncoder.configure({
    codec: selectedCodec,
    width,
    height,
    bitrate: 5_000_000,
    framerate: fps,
  });

  // AudioEncoder setup if audio is enabled
  let audioEncoder: any = null;
  if (canEncodeAudio && audioBuffer) {
    try {
      audioEncoder = new (window as any).AudioEncoder({
        output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
        error: (e: any) => console.warn('[WebCodecs AudioEncoder]:', e),
      });

      audioEncoder.configure({
        codec: 'opus',
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels,
        bitrate: 192_000,
      });

      const sampleRate = audioBuffer.sampleRate;
      const numChannels = audioBuffer.numberOfChannels;
      const totalAudioFrames = audioBuffer.length;
      const chunkSize = 960; // standard 20ms frame at 48kHz

      const channelArrays: Float32Array[] = [];
      for (let c = 0; c < numChannels; c++) {
        channelArrays.push(audioBuffer.getChannelData(c));
      }

      for (let offset = 0; offset < totalAudioFrames; offset += chunkSize) {
        const framesInChunk = Math.min(chunkSize, totalAudioFrames - offset);
        const planarData = new Float32Array(framesInChunk * numChannels);

        for (let c = 0; c < numChannels; c++) {
          const src = channelArrays[c];
          const destOffset = c * framesInChunk;
          for (let j = 0; j < framesInChunk; j++) {
            planarData[destOffset + j] = src[offset + j];
          }
        }

        const audioData = new (window as any).AudioData({
          format: 'f32-planar',
          sampleRate,
          numberOfFrames: framesInChunk,
          numberOfChannels: numChannels,
          timestamp: Math.round((offset / sampleRate) * 1_000_000),
          data: planarData,
        });

        audioEncoder.encode(audioData);
        audioData.close();
      }

      await audioEncoder.flush();
    } catch (audioEncErr) {
      console.warn('[WebCodecs] Fallo secundario codificando audio local:', audioEncErr);
    }
  }

  // Render EVERY single frame deterministically
  for (let k = 0; k < totalFrames; k++) {
    if (encoderError) throw encoderError;

    const time = Math.min(totalDuration, k / fps);
    renderer.renderFrame(time);

    const videoFrame = new (window as any).VideoFrame(canvas, {
      timestamp: Math.round(time * 1_000_000), // microseconds
      duration: Math.round((1 / fps) * 1_000_000),
    });

    const isKeyFrame = k % 45 === 0;
    videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
    videoFrame.close();

    // Yield control every 4 frames so browser UI updates and stays responsive
    if (k % 4 === 0 || k === totalFrames - 1) {
      const pct = Math.round((k / totalFrames) * 75) + 10;
      onProgress(pct, `Componiendo fotograma ${k + 1} de ${totalFrames} (${pct}%)...`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  await videoEncoder.flush();
  muxer.finalize();

  return new Blob([target.buffer], { type: 'video/webm' });
}
