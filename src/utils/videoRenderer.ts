import {
  ColorGradeType,
  ImageItem,
  PanEffectType,
  SubtitleCue,
  TransitionEffectType,
  ZoomEffectType,
} from '../types';

export interface RenderState {
  currentTime: number;
  totalDuration: number;
  progress: number; // 0 to 1
  isPlaying: boolean;
  activeSubtitle?: SubtitleCue;
  currentImageIndex?: number;
}

export interface LoadedMediaItem {
  id: string;
  type: 'image' | 'video';
  imageElement?: HTMLImageElement;
  videoElement?: HTMLVideoElement;
  frameImages?: HTMLImageElement[];
  naturalWidth: number;
  naturalHeight: number;
  duration: number; // For video: duration in seconds; for image: 0
  url: string;
}

export interface SceneSlot {
  index: number;
  imageIndex: number; // Alias for backward compatibility
  mediaIndex: number;
  startTime: number;
  duration: number; // individual duration (for video: full video duration; for image: fixed or random)
  endTime: number;
  transitionDuration: number;
  zoomEffect: ZoomEffectType;
  panEffect: PanEffectType;
  colorGrade: ColorGradeType;
  transitionEffect: TransitionEffectType;
}

/**
 * High-performance Canvas 2D + Web Audio videoclip rendering engine.
 * Renders smooth Ken-Burns zooms, pans, complex transitions (light leaks, glitch, crossfade),
 * color grading, synchronized subtitles, and supports both images and video clips (muted).
 */
export class VideoRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private loadedMedia: LoadedMediaItem[] = [];
  private loadedImages: HTMLImageElement[] = [];
  private subtitles: SubtitleCue[] = [];
  private sceneSlots: SceneSlot[] = [];

  // Configuration
  private imageTimingMode: 'random' | 'fixed' = 'random';
  private fixedSceneDuration: number = 4.0;
  private minSceneDuration: number = 2.0;
  private maxSceneDuration: number = 4.5;
  private totalDuration: number = 30;
  private speechVol: number = 0.95;
  private musicVol: number = 0.35;

  private zoomEffectConfig: ZoomEffectType = 'random';
  private panEffectConfig: PanEffectType = 'random';
  private colorGradeConfig: ColorGradeType = 'golden-hour';
  private transitionConfig: TransitionEffectType = 'light-leaks';

  // State
  private isPlaying: boolean = false;
  private currentTime: number = 0;
  private animFrameId: number | null = null;
  private lastTimestamp: number = 0;

  // Web Audio Graph
  private audioCtx: AudioContext | null = null;
  private speechBuffer: AudioBuffer | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private speechSource: AudioBufferSourceNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private speechGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;

  // Callbacks
  private onTimeUpdate?: (state: RenderState) => void;
  private onEnded?: () => void;

  // Recording
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('No se pudo inicializar el contexto 2D de Canvas.');
    this.ctx = context;
  }

  public setConfig(options: {
    imageTimingMode?: 'random' | 'fixed';
    fixedSceneDuration?: number;
    minSceneDuration?: number;
    maxSceneDuration?: number;
    sceneDuration?: number;
    totalDuration: number;
    subtitles: SubtitleCue[];
    speechVolume: number;
    musicVolume: number;
    zoomEffect?: ZoomEffectType;
    panEffect?: PanEffectType;
    colorGrade?: ColorGradeType;
    transitionEffect?: TransitionEffectType;
  }) {
    if (options.imageTimingMode) {
      this.imageTimingMode = options.imageTimingMode;
    }
    if (typeof options.fixedSceneDuration === 'number') {
      this.fixedSceneDuration = Math.max(1, Math.min(20, options.fixedSceneDuration));
    }

    // Configurable random range between 1 and 20 seconds
    if (typeof options.minSceneDuration === 'number') {
      this.minSceneDuration = Math.max(1, Math.min(20, options.minSceneDuration));
    } else if (typeof options.sceneDuration === 'number') {
      this.minSceneDuration = Math.max(1, Math.min(20, options.sceneDuration));
    }

    if (typeof options.maxSceneDuration === 'number') {
      this.maxSceneDuration = Math.max(this.minSceneDuration, Math.min(20, options.maxSceneDuration));
    } else {
      this.maxSceneDuration = Math.max(this.minSceneDuration, Math.min(20, this.minSceneDuration + 2.0));
    }

    this.totalDuration = Math.max(1, options.totalDuration);
    this.subtitles = options.subtitles;

    this.speechVol = Math.max(0, Math.min(1, options.speechVolume));
    this.musicVol = Math.max(0, Math.min(1, options.musicVolume));

    if (options.zoomEffect) this.zoomEffectConfig = options.zoomEffect;
    if (options.panEffect) this.panEffectConfig = options.panEffect;
    if (options.colorGrade) this.colorGradeConfig = options.colorGrade;
    if (options.transitionEffect) this.transitionConfig = options.transitionEffect;

    this.rebuildTimeline();
    this.applyVolumesToAudioNodes();
  }

  public setVolumes(speechVolume: number, musicVolume: number) {
    this.speechVol = Math.max(0, Math.min(1, speechVolume));
    this.musicVol = Math.max(0, Math.min(1, musicVolume));
    this.applyVolumesToAudioNodes();
  }

  private getEffectiveGain(vol: number, isMusic: boolean = false): number {
    const clamped = Math.max(0, Math.min(1, vol));
    if (isMusic) {
      // Perceptual exponential curve for background music
      // Keeps ambient pad in comfortable background while slider gives broad dynamic range
      return Math.pow(clamped, 1.8) * 0.72;
    }
    // Speech: clear, forward and punchy
    return Math.pow(clamped, 1.15);
  }

  private applyVolumesToAudioNodes() {
    if (!this.audioCtx || this.audioCtx.state === 'closed') return;
    const now = this.audioCtx.currentTime;

    if (this.speechGain) {
      this.speechGain.gain.cancelScheduledValues(now);
      this.speechGain.gain.setValueAtTime(this.getEffectiveGain(this.speechVol, false), now);
    }
    if (this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(this.getEffectiveGain(this.musicVol, true), now);
    }
  }

  public async preloadMedia(mediaItems: (string | ImageItem)[]): Promise<void> {
    const promises = mediaItems.map((item, index) => {
      const isObject = typeof item === 'object' && item !== null;
      const url = isObject ? item.url : item;
      const id = isObject && item.id ? item.id : `media-${index}`;
      const isVideo =
        (isObject && item.type === 'video') ||
        (typeof item === 'string' &&
          (item.includes('.mp4') || item.includes('.webm') || item.includes('.mov') || item.startsWith('blob:')));

      if (isVideo) {
        // Option A: If pre-extracted frames are available (best fidelity, 0 latency, 0 seeking drops)
        if (isObject && item.frames && item.frames.length > 0) {
          const framePromises = item.frames.map((frameUrl) => {
            return new Promise<HTMLImageElement>((res) => {
              const fImg = new Image();
              fImg.crossOrigin = 'anonymous';
              fImg.onload = () => res(fImg);
              fImg.onerror = () => res(fImg);
              fImg.src = frameUrl;
            });
          });

          return Promise.all(framePromises).then((frameImages) => {
            const firstFrame = frameImages[0];
            const dur = item.duration && item.duration > 0 ? item.duration : 5.0;
            return {
              id,
              type: 'video' as const,
              frameImages,
              imageElement: firstFrame,
              naturalWidth: firstFrame?.naturalWidth || 1280,
              naturalHeight: firstFrame?.naturalHeight || 720,
              duration: dur,
              url,
            };
          });
        }

        // Option B: HTMLVideoElement fallback
        return new Promise<LoadedMediaItem>((resolve) => {
          const video = document.createElement('video');
          video.src = url;
          video.muted = true;
          video.volume = 0;
          video.playsInline = true;
          video.crossOrigin = 'anonymous';
          video.preload = 'auto';

          let resolved = false;
          const done = () => {
            if (resolved) return;
            resolved = true;
            const dur =
              isObject && item.duration && item.duration > 0
                ? item.duration
                : video.duration && isFinite(video.duration) && video.duration > 0
                ? video.duration
                : 5.0;
            resolve({
              id,
              type: 'video',
              videoElement: video,
              naturalWidth: video.videoWidth || 1280,
              naturalHeight: video.videoHeight || 720,
              duration: dur,
              url,
            });
          };

          video.onloadedmetadata = done;
          video.oncanplay = done;
          video.onerror = () => {
            console.warn('[VideoRenderer] Error cargando vídeo clip:', url);
            done();
          };
          setTimeout(done, 4000);
        });
      } else {
        // Image
        return new Promise<LoadedMediaItem>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            resolve({
              id,
              type: 'image',
              imageElement: img,
              naturalWidth: img.naturalWidth || 1280,
              naturalHeight: img.naturalHeight || 720,
              duration: 0,
              url,
            });
          };
          img.onerror = () => {
            const placeholder = document.createElement('canvas');
            placeholder.width = 1280;
            placeholder.height = 720;
            const pCtx = placeholder.getContext('2d')!;
            const grad = pCtx.createLinearGradient(0, 0, 1280, 720);
            grad.addColorStop(0, '#1e1b4b');
            grad.addColorStop(1, '#0f172a');
            pCtx.fillStyle = grad;
            pCtx.fillRect(0, 0, 1280, 720);
            const fallbackImg = new Image();
            fallbackImg.src = placeholder.toDataURL();
            fallbackImg.onload = () => {
              resolve({
                id,
                type: 'image',
                imageElement: fallbackImg,
                naturalWidth: 1280,
                naturalHeight: 720,
                duration: 0,
                url,
              });
            };
          };
          img.src = url;
        });
      }
    });

    this.loadedMedia = await Promise.all(promises);
    this.loadedImages = this.loadedMedia
      .map((m) => {
        if (m.frameImages && m.frameImages.length > 0) return m.frameImages[0];
        return m.imageElement;
      })
      .filter(Boolean) as HTMLImageElement[];
    this.rebuildTimeline();
    this.renderFrame(this.currentTime);
  }

  public async preloadImages(imageUrls: (string | ImageItem)[]): Promise<void> {
    return this.preloadMedia(imageUrls);
  }

  /**
   * Pre-calculates a deterministic timeline of SceneSlots.
   * - If an item is a video clip, its duration is strictly its full video duration!
   * - If an item is an image, its duration is either fixed or randomly chosen from [minSceneDuration, maxSceneDuration].
   * - Ken-Burns and transitions smoothly span the entire duration without jumping.
   */
  private rebuildTimeline() {
    if (this.loadedMedia.length === 0) {
      this.sceneSlots = [];
      return;
    }

    const slots: SceneSlot[] = [];
    const n = this.loadedMedia.length;
    const targetEnd = this.totalDuration + 15; // Buffer beyond speech end

    const zoomChoices: ZoomEffectType[] = ['zoom-in', 'zoom-out', 'dramatic-pulse', 'slow-drift'];
    const panChoices: PanEffectType[] = ['diagonal-drift', 'pan-left', 'pan-right', 'drift-up'];
    const transChoices: TransitionEffectType[] = ['light-leaks', 'glitch', 'crossfade', 'zoom-blur', 'film-burn'];

    let cursor = 0;
    let slotIdx = 0;

    // Deterministic pseudo-random seed generator based on slot index
    const pseudoRand = (seed: number) => {
      const x = Math.sin(seed * 9999 + 1) * 10000;
      return x - Math.floor(x);
    };

    while (cursor < targetEnd) {
      const media = this.loadedMedia[slotIdx % n];
      let duration: number;

      if (media.type === 'video' && media.duration > 0) {
        // "The video, in any case, will always be the full duration of the video."
        duration = media.duration;
      } else {
        // Image timing: fixed or random
        if (this.imageTimingMode === 'fixed') {
          duration = Math.max(1.0, Math.min(20.0, this.fixedSceneDuration || 4.0));
        } else {
          const r = pseudoRand(slotIdx * 7 + 13);
          duration = this.minSceneDuration + r * (this.maxSceneDuration - this.minSceneDuration);
        }
      }

      // Transition overlap: ~25% of duration, between 0.6s and 1.2s
      const transDuration = Math.min(duration * 0.25, 1.2);

      const zoom =
        this.zoomEffectConfig === 'random'
          ? zoomChoices[slotIdx % zoomChoices.length]
          : this.zoomEffectConfig;

      const pan =
        this.panEffectConfig === 'random'
          ? panChoices[slotIdx % panChoices.length]
          : this.panEffectConfig;

      const trans =
        this.transitionConfig === 'random'
          ? transChoices[slotIdx % transChoices.length]
          : this.transitionConfig;

      slots.push({
        index: slotIdx,
        imageIndex: slotIdx % n,
        mediaIndex: slotIdx % n,
        startTime: cursor,
        duration,
        endTime: cursor + duration,
        transitionDuration: transDuration,
        zoomEffect: zoom,
        panEffect: pan,
        colorGrade: this.colorGradeConfig,
        transitionEffect: trans,
      });

      // Contiguous non-overlapping timeline: next slot starts exactly when current ends
      cursor += duration;
      slotIdx++;
    }

    this.sceneSlots = slots;
  }

  public getSlots(): SceneSlot[] {
    return [...this.sceneSlots];
  }

  public getLoadedMedia(): LoadedMediaItem[] {
    return [...this.loadedMedia];
  }

  public getAudioBuffers(): { speech: AudioBuffer | null; music: AudioBuffer | null } {
    return { speech: this.speechBuffer, music: this.musicBuffer };
  }

  public updateSlotDuration(slotIndex: number, newDuration: number): void {
    if (slotIndex < 0 || slotIndex >= this.sceneSlots.length) return;
    const clamped = Math.max(1.0, Math.min(30.0, Number(newDuration.toFixed(1))));
    this.sceneSlots[slotIndex].duration = clamped;
    this.recalculateSlotTimings();
    this.renderFrame(this.currentTime);
    this.notifyState();
  }

  public moveBoundary(slotIndex: number, deltaSeconds: number): void {
    if (slotIndex < 0 || slotIndex >= this.sceneSlots.length) return;
    const slotA = this.sceneSlots[slotIndex];
    const slotB = this.sceneSlots[slotIndex + 1];

    if (slotB) {
      const targetDurA = Math.max(1.0, Math.min(30.0, slotA.duration + deltaSeconds));
      const actualDelta = targetDurA - slotA.duration;
      const targetDurB = Math.max(1.0, Math.min(30.0, slotB.duration - actualDelta));
      const finalDelta = slotB.duration - targetDurB;

      slotA.duration = Number((slotA.duration + finalDelta).toFixed(1));
      slotB.duration = Number(targetDurB.toFixed(1));
    } else {
      slotA.duration = Math.max(1.0, Math.min(30.0, Number((slotA.duration + deltaSeconds).toFixed(1))));
    }

    this.recalculateSlotTimings();
    this.renderFrame(this.currentTime);
    this.notifyState();
  }

  public reorderSlots(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= this.sceneSlots.length ||
      toIndex < 0 ||
      toIndex >= this.sceneSlots.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const moved = this.sceneSlots.splice(fromIndex, 1)[0];
    this.sceneSlots.splice(toIndex, 0, moved);
    this.recalculateSlotTimings();
    this.renderFrame(this.currentTime);
    this.notifyState();
  }

  private recalculateSlotTimings(): void {
    let cursor = 0;
    for (let i = 0; i < this.sceneSlots.length; i++) {
      const slot = this.sceneSlots[i];
      slot.index = i;
      slot.startTime = Number(cursor.toFixed(2));
      slot.duration = Number(slot.duration.toFixed(1));
      slot.endTime = Number((cursor + slot.duration).toFixed(2));
      slot.transitionDuration = Math.min(slot.duration * 0.25, 1.2);
      cursor += slot.duration;
    }

    const targetEnd = this.totalDuration + 15;
    const n = this.loadedMedia.length;
    if (n > 0) {
      const zoomChoices: ZoomEffectType[] = ['zoom-in', 'zoom-out', 'dramatic-pulse', 'slow-drift'];
      const panChoices: PanEffectType[] = ['diagonal-drift', 'pan-left', 'pan-right', 'drift-up'];
      const transChoices: TransitionEffectType[] = ['light-leaks', 'glitch', 'crossfade', 'zoom-blur', 'film-burn'];

      let slotIdx = this.sceneSlots.length;
      while (cursor < targetEnd) {
        const media = this.loadedMedia[slotIdx % n];
        let duration = media.type === 'video' && media.duration > 0 ? media.duration : 4.0;
        const transDuration = Math.min(duration * 0.25, 1.2);
        this.sceneSlots.push({
          index: slotIdx,
          imageIndex: slotIdx % n,
          mediaIndex: slotIdx % n,
          startTime: Number(cursor.toFixed(2)),
          duration: Number(duration.toFixed(1)),
          endTime: Number((cursor + duration).toFixed(2)),
          transitionDuration: transDuration,
          zoomEffect: this.zoomEffectConfig === 'random' ? zoomChoices[slotIdx % zoomChoices.length] : this.zoomEffectConfig,
          panEffect: this.panEffectConfig === 'random' ? panChoices[slotIdx % panChoices.length] : this.panEffectConfig,
          colorGrade: this.colorGradeConfig,
          transitionEffect: this.transitionConfig === 'random' ? transChoices[slotIdx % transChoices.length] : this.transitionConfig,
        });
        cursor += duration;
        slotIdx++;
      }
    }
  }

  public setAudioBuffers(speech: AudioBuffer | null, music: AudioBuffer | null) {
    this.speechBuffer = speech;
    this.musicBuffer = music;
  }

  public setCallbacks(callbacks: {
    onTimeUpdate?: (state: RenderState) => void;
    onEnded?: () => void;
  }) {
    this.onTimeUpdate = callbacks.onTimeUpdate;
    this.onEnded = callbacks.onEnded;
  }

  public seek(timeSeconds: number) {
    const wasPlaying = this.isPlaying;
    if (this.isPlaying) {
      this.pauseAudio();
    }
    this.currentTime = Math.max(0, Math.min(this.totalDuration, timeSeconds));
    this.renderFrame(this.currentTime);
    this.notifyState();

    if (wasPlaying && this.currentTime < this.totalDuration) {
      this.play();
    }
  }

  public play() {
    if (this.isPlaying) return;
    if (this.currentTime >= this.totalDuration) {
      this.currentTime = 0;
    }
    this.isPlaying = true;
    this.startAudio(this.currentTime);
    this.lastTimestamp = performance.now();
    this.loop();
    this.notifyState();
  }

  public pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.pauseAudio();
    this.notifyState();
  }

  public togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  private initAudioNodes() {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    if (!this.masterGain) {
      this.masterGain = this.audioCtx.createGain();
      this.speechGain = this.audioCtx.createGain();
      this.musicGain = this.audioCtx.createGain();

      this.speechGain.gain.setValueAtTime(this.getEffectiveGain(this.speechVol, false), this.audioCtx.currentTime);
      this.musicGain.gain.setValueAtTime(this.getEffectiveGain(this.musicVol, true), this.audioCtx.currentTime);

      this.speechGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);

      this.masterGain.connect(this.audioCtx.destination);
      this.mediaStreamDest = this.audioCtx.createMediaStreamDestination();
      this.masterGain.connect(this.mediaStreamDest);
    } else {
      // Ensure volume is synchronized
      this.applyVolumesToAudioNodes();
    }
  }

  private startAudio(offsetSeconds: number) {
    this.initAudioNodes();
    if (!this.audioCtx) return;

    this.stopAudioNodes();
    const now = this.audioCtx.currentTime;

    // Re-verify exact volume levels
    if (this.speechGain) {
      this.speechGain.gain.cancelScheduledValues(now);
      this.speechGain.gain.setValueAtTime(this.getEffectiveGain(this.speechVol, false), now);
    }
    if (this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(this.getEffectiveGain(this.musicVol, true), now);
    }

    // Start speech audio
    if (this.speechBuffer && offsetSeconds < this.speechBuffer.duration) {
      this.speechSource = this.audioCtx.createBufferSource();
      this.speechSource.buffer = this.speechBuffer;
      this.speechSource.connect(this.speechGain!);
      this.speechSource.start(0, offsetSeconds);
    }

    // Start background music audio (seamless loop with mandatory fade-in and fade-out)
    if (this.musicBuffer && this.musicGain) {
      this.musicSource = this.audioCtx.createBufferSource();
      this.musicSource.buffer = this.musicBuffer;
      this.musicSource.loop = true;
      this.musicSource.connect(this.musicGain);

      const targetGain = this.getEffectiveGain(this.musicVol, true);
      const totalDur = this.totalDuration;
      const fadeInDur = Math.min(2.5, Math.max(0.5, totalDur * 0.12));
      const fadeOutDur = Math.min(3.0, Math.max(0.5, totalDur * 0.18));
      const fadeOutStart = Math.max(fadeInDur, totalDur - fadeOutDur);

      this.musicGain.gain.cancelScheduledValues(now);

      if (offsetSeconds < fadeInDur) {
        const currentGainRatio = fadeInDur > 0 ? offsetSeconds / fadeInDur : 1;
        const currentGain = targetGain * currentGainRatio;
        this.musicGain.gain.setValueAtTime(currentGain, now);
        const timeUntilFadeInEnd = fadeInDur - offsetSeconds;
        this.musicGain.gain.linearRampToValueAtTime(targetGain, now + timeUntilFadeInEnd);

        const timeUntilFadeOutStart = fadeOutStart - offsetSeconds;
        const timeUntilEnd = totalDur - offsetSeconds;
        if (timeUntilFadeOutStart > timeUntilFadeInEnd) {
          this.musicGain.gain.setValueAtTime(targetGain, now + timeUntilFadeOutStart);
        }
        this.musicGain.gain.linearRampToValueAtTime(0, now + timeUntilEnd);
      } else if (offsetSeconds >= fadeOutStart) {
        const fadeOutElapsed = offsetSeconds - fadeOutStart;
        const remainingFadeRatio = Math.max(0, 1 - fadeOutElapsed / fadeOutDur);
        const currentGain = targetGain * remainingFadeRatio;
        this.musicGain.gain.setValueAtTime(currentGain, now);
        const timeUntilEnd = totalDur - offsetSeconds;
        this.musicGain.gain.linearRampToValueAtTime(0, now + timeUntilEnd);
      } else {
        this.musicGain.gain.setValueAtTime(targetGain, now);
        const timeUntilFadeOutStart = fadeOutStart - offsetSeconds;
        const timeUntilEnd = totalDur - offsetSeconds;
        this.musicGain.gain.setValueAtTime(targetGain, now + timeUntilFadeOutStart);
        this.musicGain.gain.linearRampToValueAtTime(0, now + timeUntilEnd);
      }

      const musicOffset = offsetSeconds % this.musicBuffer.duration;
      this.musicSource.start(0, musicOffset);
    }
  }

  private stopAudioNodes() {
    if (this.speechSource) {
      try {
        this.speechSource.stop();
        this.speechSource.disconnect();
      } catch {
        // already stopped
      }
      this.speechSource = null;
    }

    if (this.musicSource) {
      try {
        this.musicSource.stop();
        this.musicSource.disconnect();
      } catch {
        // already stopped
      }
      this.musicSource = null;
    }
  }

  private pauseAudio() {
    this.stopAudioNodes();
    // Also pause any playing video elements
    this.loadedMedia.forEach((m) => {
      if (m.videoElement && !m.videoElement.paused) {
        try {
          m.videoElement.pause();
        } catch {
          // ignore
        }
      }
    });
  }

  private loop = () => {
    if (!this.isPlaying) return;

    const now = performance.now();
    const deltaSeconds = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;

    this.currentTime += deltaSeconds;

    if (this.currentTime >= this.totalDuration) {
      this.currentTime = this.totalDuration;
      this.renderFrame(this.currentTime);
      this.pause();
      if (this.onEnded) this.onEnded();
      return;
    }

    this.renderFrame(this.currentTime);
    this.notifyState();

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  private notifyState() {
    if (this.onTimeUpdate) {
      const activeSubtitle = this.subtitles.find(
        (sub) => this.currentTime >= sub.startTime && this.currentTime <= sub.endTime
      );
      this.onTimeUpdate({
        currentTime: this.currentTime,
        totalDuration: this.totalDuration,
        progress: this.totalDuration > 0 ? this.currentTime / this.totalDuration : 0,
        isPlaying: this.isPlaying,
        activeSubtitle,
      });
    }
  }

  /**
   * Main frame renderer: Computes smooth Ken-Burns zooms across the FULL scene duration (no jumps),
   * executes organic transitions (light leaks, glitch, crossfade, zoom-blur), applies cinematic color
   * grading, and paints subtitles.
   */
  public renderFrame(time: number) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, w, h);

    if (this.loadedMedia.length === 0 || this.sceneSlots.length === 0) {
      // Atmospheric minimalist poetic background when images are disabled (solo música y subtítulos)
      this.renderAmbientPoeticBackground(ctx, w, h, time);
      this.renderSubtitlesOnCanvas(ctx, w, h, time);
      ctx.restore();
      return;
    }

    // Find the primary scene slot for current time
    let slotA = this.sceneSlots.find((s) => time >= s.startTime && time < s.endTime);
    if (!slotA) {
      // Loop or fallback to last slot
      slotA = this.sceneSlots[this.sceneSlots.length - 1];
    }

    const mediaA = this.loadedMedia[slotA.mediaIndex % this.loadedMedia.length];

    // Check if within transition overlap with next slot B
    const slotB = this.sceneSlots.find((s) => s.index === slotA!.index + 1);
    const inTransition = slotB && time >= slotB.startTime && time < slotA.endTime;
    const mediaB = inTransition ? this.loadedMedia[slotB.mediaIndex % this.loadedMedia.length] : null;

    // Pause inactive video elements to keep CPU/GPU performance high
    this.loadedMedia.forEach((m) => {
      if (m.type === 'video' && m.videoElement) {
        const isActive = m === mediaA || m === mediaB;
        if (!isActive && !m.videoElement.paused) {
          try {
            m.videoElement.pause();
          } catch {
            // ignore
          }
        }
      }
    });

    // Synchronize mediaA video element without sound
    if (mediaA && mediaA.type === 'video' && mediaA.videoElement) {
      const vidA = mediaA.videoElement;
      vidA.muted = true;
      const targetTimeA = Math.max(0, Math.min(mediaA.duration - 0.04, time - slotA.startTime));
      if (Math.abs(vidA.currentTime - targetTimeA) > 0.35) {
        vidA.currentTime = targetTimeA;
      }
      if (this.isPlaying && vidA.paused) {
        vidA.play().catch(() => {});
      } else if (!this.isPlaying && !vidA.paused) {
        vidA.pause();
      }
    }

    // Synchronize mediaB video element during transition without sound
    if (inTransition && mediaB && mediaB.type === 'video' && mediaB.videoElement && slotB) {
      const vidB = mediaB.videoElement;
      vidB.muted = true;
      const targetTimeB = Math.max(0, Math.min(mediaB.duration - 0.04, time - slotB.startTime));
      if (Math.abs(vidB.currentTime - targetTimeB) > 0.35) {
        vidB.currentTime = targetTimeB;
      }
      if (this.isPlaying && vidB.paused) {
        vidB.play().catch(() => {});
      } else if (!this.isPlaying && !vidB.paused) {
        vidB.pause();
      }
    }

    // Apply color grade filter
    this.applyColorFilter(ctx, slotA.colorGrade);

    // 1. Draw Slot A (Primary Image or Video)
    const progressA = Math.max(0, Math.min(1, (time - slotA.startTime) / slotA.duration));
    const { scale: scaleA, panX: panXA, panY: panYA } = this.calculateTransform(
      slotA.zoomEffect,
      slotA.panEffect,
      progressA
    );

    ctx.save();
    const sourceA: CanvasImageSource = this.getFrameSource(mediaA, time - slotA.startTime, slotA.duration);
    this.drawImageCover(ctx, sourceA, w, h, scaleA, panXA, panYA, 1.0);
    ctx.restore();

    // 2. Draw Slot B during transition overlap
    if (inTransition && slotB && mediaB) {
      const sourceB: CanvasImageSource = this.getFrameSource(mediaB, time - slotB.startTime, slotB.duration);
      const transDuration = slotB.transitionDuration;
      // Transition progress in [0, 1]
      const transT = Math.max(0, Math.min(1, (time - slotB.startTime) / transDuration));

      // Slot B's own progress pB starts smoothly at 0.0 without jumping!
      const progressB = Math.max(0, Math.min(1, (time - slotB.startTime) / slotB.duration));
      const { scale: scaleB, panX: panXB, panY: panYB } = this.calculateTransform(
        slotB.zoomEffect,
        slotB.panEffect,
        progressB
      );

      this.renderTransition(ctx, sourceB, w, h, scaleB, panXB, panYB, transT, slotA.transitionEffect);
    }

    // Reset filter
    ctx.filter = 'none';
    ctx.restore();

    // Cinematic vignette
    this.drawCinematicVignette(ctx, w, h);

    // Subtitles
    this.renderSubtitlesOnCanvas(ctx, w, h, time);
  }

  /**
   * Continuous zoom & pan calculation across the full scene duration (no jumps)
   */
  private calculateTransform(
    zoomType: ZoomEffectType,
    panType: PanEffectType,
    p: number
  ): { scale: number; panX: number; panY: number } {
    let scale = 1.0;
    switch (zoomType) {
      case 'zoom-in':
        scale = 1.0 + 0.14 * p;
        break;
      case 'zoom-out':
        scale = 1.14 - 0.14 * p;
        break;
      case 'dramatic-pulse':
        scale = 1.0 + 0.08 * Math.sin(p * Math.PI);
        break;
      case 'slow-drift':
        scale = 1.02 + 0.05 * p;
        break;
      case 'none':
      default:
        scale = 1.0;
        break;
    }

    let panX = 0;
    let panY = 0;
    switch (panType) {
      case 'diagonal-drift':
        panX = (p - 0.5) * 36;
        panY = (p - 0.5) * 22;
        break;
      case 'pan-left':
        panX = (0.5 - p) * 44;
        break;
      case 'pan-right':
        panX = (p - 0.5) * 44;
        break;
      case 'drift-up':
        panY = (0.5 - p) * 32;
        break;
      case 'none':
      default:
        panX = 0;
        panY = 0;
        break;
    }

    return { scale, panX, panY };
  }

  /**
   * Applies cinematic color grading on canvas
   */
  private applyColorFilter(ctx: CanvasRenderingContext2D, colorGrade: ColorGradeType) {
    switch (colorGrade) {
      case 'golden-hour':
        ctx.filter = 'brightness(1.05) contrast(1.08) saturate(1.22)';
        break;
      case 'vintage-film':
        ctx.filter = 'sepia(0.24) contrast(1.12) brightness(0.98)';
        break;
      case 'noir-monochrome':
        ctx.filter = 'grayscale(1) contrast(1.35) brightness(0.92)';
        break;
      case 'ethereal-dream':
        ctx.filter = 'brightness(1.09) contrast(0.92) saturate(1.08)';
        break;
      case 'twilight-cool':
        ctx.filter = 'hue-rotate(185deg) contrast(1.1) saturate(1.15)';
        break;
      case 'natural':
      default:
        ctx.filter = 'none';
        break;
    }
  }

  /**
   * Retrieves the precise frame image (extracted frame image sequence or video element) for any time.
   */
  private getFrameSource(
    media: LoadedMediaItem,
    localTime: number,
    slotDuration: number
  ): CanvasImageSource {
    if (media.type === 'video' && media.frameImages && media.frameImages.length > 0) {
      const effectiveDur = Math.max(0.1, media.duration || slotDuration);
      const progress = Math.max(0, Math.min(0.999, (localTime % effectiveDur) / effectiveDur));
      const frameIndex = Math.min(
        media.frameImages.length - 1,
        Math.floor(progress * media.frameImages.length)
      );
      return media.frameImages[frameIndex] || media.frameImages[0];
    }
    if (media.type === 'video' && media.videoElement) {
      return media.videoElement;
    }
    return media.imageElement || this.createFallbackImage();
  }

  private createFallbackImage(): HTMLImageElement {
    const placeholder = document.createElement('canvas');
    placeholder.width = 1280;
    placeholder.height = 720;
    const pCtx = placeholder.getContext('2d')!;
    pCtx.fillStyle = '#0f172a';
    pCtx.fillRect(0, 0, 1280, 720);
    const img = new Image();
    img.src = placeholder.toDataURL();
    return img;
  }

  /**
   * Prepares media (seeking video elements frame-by-frame if not pre-extracted) before capturing frame for offline export.
   */
  public async prepareFrameForExport(time: number): Promise<void> {
    if (this.loadedMedia.length === 0 || this.sceneSlots.length === 0) return;

    let slotA = this.sceneSlots.find((s) => time >= s.startTime && time < s.endTime);
    if (!slotA) slotA = this.sceneSlots[this.sceneSlots.length - 1];
    if (!slotA) return;

    const mediaA = this.loadedMedia[slotA.mediaIndex % this.loadedMedia.length];
    const promises: Promise<void>[] = [];

    // Only seek video element if frames are NOT pre-extracted as image sequence
    if (
      mediaA &&
      mediaA.type === 'video' &&
      mediaA.videoElement &&
      (!mediaA.frameImages || mediaA.frameImages.length === 0)
    ) {
      const targetTimeA = Math.max(0, Math.min(mediaA.duration - 0.04, time - slotA.startTime));
      promises.push(this.seekVideoElement(mediaA.videoElement, targetTimeA));
    }

    const slotB = this.sceneSlots.find((s) => s.index === slotA!.index + 1);
    const inTransition = slotB && time >= slotB.startTime && time < slotA.endTime;
    if (inTransition && slotB) {
      const mediaB = this.loadedMedia[slotB.mediaIndex % this.loadedMedia.length];
      if (
        mediaB &&
        mediaB.type === 'video' &&
        mediaB.videoElement &&
        (!mediaB.frameImages || mediaB.frameImages.length === 0)
      ) {
        const targetTimeB = Math.max(0, Math.min(mediaB.duration - 0.04, time - slotB.startTime));
        promises.push(this.seekVideoElement(mediaB.videoElement, targetTimeB));
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  private seekVideoElement(video: HTMLVideoElement, targetTime: number): Promise<void> {
    if (Math.abs(video.currentTime - targetTime) < 0.02) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let resolved = false;
      const onSeeked = () => {
        if (!resolved) {
          resolved = true;
          video.removeEventListener('seeked', onSeeked);
          resolve();
        }
      };
      video.addEventListener('seeked', onSeeked, { once: true });
      video.currentTime = targetTime;
      setTimeout(onSeeked, 80);
    });
  }

  /**
   * Renders dynamic video transitions (Light Leaks, Glitch, Crossfade, Zoom-Blur, Film-Burn)
   */
  private renderTransition(
    ctx: CanvasRenderingContext2D,
    nextImg: CanvasImageSource,
    w: number,
    h: number,
    scaleB: number,
    panXB: number,
    panYB: number,
    t: number,
    transitionType: TransitionEffectType
  ) {
    // Smooth sinusoidal alpha curve
    const smoothT = Math.sin((t * Math.PI) / 2);

    switch (transitionType) {
      case 'light-leaks': {
        // Draw incoming image with smooth fade
        ctx.save();
        ctx.globalAlpha = smoothT;
        this.drawImageCover(ctx, nextImg, w, h, scaleB, panXB, panYB, 1.0);
        ctx.restore();

        // Anamorphic sweeping warm light leak flare
        ctx.save();
        const leakIntensity = Math.sin(t * Math.PI); // Peak at t = 0.5
        ctx.globalAlpha = leakIntensity * 0.75;
        ctx.globalCompositeOperation = 'screen';

        const sweepX = w * (0.2 + t * 0.8);
        const sweepY = h * (0.1 + t * 0.4);

        const leakGrad = ctx.createRadialGradient(sweepX, sweepY, 10, sweepX, sweepY, w * 0.65);
        leakGrad.addColorStop(0, 'rgba(255, 245, 200, 0.9)');
        leakGrad.addColorStop(0.3, 'rgba(251, 146, 60, 0.65)');
        leakGrad.addColorStop(0.7, 'rgba(244, 63, 94, 0.3)');
        leakGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = leakGrad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
        break;
      }

      case 'glitch': {
        // Digital cyber RGB chromatic aberration split
        ctx.save();
        ctx.globalAlpha = smoothT;

        if (t > 0.15 && t < 0.85) {
          // Horizontal jitter offset with cover aspect ratio & zoom preservation
          const jitter = Math.sin(t * 80) * 18;
          this.drawImageCover(ctx, nextImg, w, h, scaleB, panXB + jitter, panYB, 1.0);

          // Horizontal scanline glitch bands
          ctx.fillStyle = 'rgba(239, 68, 68, 0.35)'; // Red split
          ctx.fillRect(0, (h * (t * 1.5)) % h, w, 8);
          ctx.fillStyle = 'rgba(6, 182, 212, 0.35)'; // Cyan split
          ctx.fillRect(0, (h * (1 - t * 1.2)) % h, w, 6);
        } else {
          this.drawImageCover(ctx, nextImg, w, h, scaleB, panXB, panYB, 1.0);
        }
        ctx.restore();
        break;
      }

      case 'zoom-blur': {
        // Dynamic speed warp zoom
        const warpScale = scaleB * (1.0 + (1 - t) * 0.25);
        ctx.save();
        ctx.globalAlpha = smoothT;
        this.drawImageCover(ctx, nextImg, w, h, warpScale, panXB, panYB, 1.0);
        ctx.restore();
        break;
      }

      case 'film-burn': {
        ctx.save();
        ctx.globalAlpha = smoothT;
        this.drawImageCover(ctx, nextImg, w, h, scaleB, panXB, panYB, 1.0);
        ctx.restore();

        // Projector film burn flare
        ctx.save();
        const burnIntensity = Math.sin(t * Math.PI);
        ctx.globalAlpha = burnIntensity * 0.8;
        ctx.globalCompositeOperation = 'lighter';

        const burnGrad = ctx.createLinearGradient(0, 0, w, h);
        burnGrad.addColorStop(0, 'rgba(255, 120, 0, 0.8)');
        burnGrad.addColorStop(0.5, 'rgba(255, 220, 100, 0.9)');
        burnGrad.addColorStop(1, 'rgba(230, 40, 20, 0.6)');
        ctx.fillStyle = burnGrad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
        break;
      }

      case 'crossfade':
      default: {
        ctx.save();
        ctx.globalAlpha = smoothT;
        this.drawImageCover(ctx, nextImg, w, h, scaleB, panXB, panYB, 1.0);
        ctx.restore();
        break;
      }
    }
  }

  private drawImageCover(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    canvasW: number,
    canvasH: number,
    scale: number = 1.0,
    panX: number = 0,
    panY: number = 0,
    opacity: number = 1.0
  ) {
    let naturalWidth = 0;
    let naturalHeight = 0;

    if (source instanceof HTMLVideoElement) {
      naturalWidth = source.videoWidth;
      naturalHeight = source.videoHeight;
    } else if (source instanceof HTMLImageElement) {
      if (!source.complete || source.naturalWidth === 0) return;
      naturalWidth = source.naturalWidth;
      naturalHeight = source.naturalHeight;
    } else if ('width' in source && 'height' in source) {
      naturalWidth = (source as HTMLCanvasElement).width;
      naturalHeight = (source as HTMLCanvasElement).height;
    }

    if (!naturalWidth || !naturalHeight) return;

    ctx.globalAlpha = opacity;
    const imgRatio = naturalWidth / naturalHeight;
    const canvasRatio = canvasW / canvasH;

    let drawW: number;
    let drawH: number;

    if (canvasRatio > imgRatio) {
      drawW = canvasW * scale;
      drawH = (canvasW / imgRatio) * scale;
    } else {
      drawH = canvasH * scale;
      drawW = (canvasH * imgRatio) * scale;
    }

    const drawX = (canvasW - drawW) / 2 + panX;
    const drawY = (canvasH - drawH) / 2 + panY;

    ctx.drawImage(source, drawX, drawY, drawW, drawH);
  }

  private drawCinematicVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.save();
    const bottomGrad = ctx.createLinearGradient(0, h - 220, 0, h);
    bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bottomGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.45)');
    bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, h - 220, w, 220);

    const topGrad = ctx.createLinearGradient(0, 0, 0, 120);
    topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
    topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 120);
    ctx.restore();
  }

  private renderSubtitlesOnCanvas(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    time: number
  ) {
    const activeCue = this.subtitles.find(
      (sub) => time >= sub.startTime && time <= sub.endTime
    );

    if (!activeCue) return;

    ctx.save();
    const elapsedInCue = time - activeCue.startTime;
    const remainingInCue = activeCue.endTime - time;

    let subAlpha = 1.0;
    if (elapsedInCue < 0.25) {
      subAlpha = elapsedInCue / 0.25;
    } else if (remainingInCue < 0.3) {
      subAlpha = remainingInCue / 0.3;
    }

    ctx.globalAlpha = Math.max(0, Math.min(1, subAlpha));

    ctx.font = '600 32px "Playfair Display", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = activeCue.text;
    const maxWidth = w * 0.84;
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = 44;
    const totalTextH = lines.length * lineHeight;
    const centerY = h - 90 - (lines.length - 1) * 20;

    const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const paddingX = 36;
    const paddingY = 16;
    const boxX = w / 2 - maxLineW / 2 - paddingX;
    const boxY = centerY - totalTextH / 2 - paddingY;
    const boxW = maxLineW + paddingX * 2;
    const boxH = totalTextH + paddingY * 2;

    ctx.fillStyle = 'rgba(10, 10, 15, 0.68)';
    this.roundRect(ctx, boxX, boxY, boxW, boxH, 12);
    ctx.fill();

    ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    lines.forEach((line, idx) => {
      const lineY = centerY - ((lines.length - 1) * lineHeight) / 2 + idx * lineHeight;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, w / 2, lineY);
    });

    ctx.restore();
  }

  private renderAmbientPoeticBackground(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
    // Atmospheric celestial gradient
    const grad = ctx.createRadialGradient(
      w * 0.5 + Math.sin(time * 0.18) * (w * 0.12),
      h * 0.45 + Math.cos(time * 0.22) * (h * 0.09),
      w * 0.05,
      w * 0.5,
      h * 0.5,
      w * 0.85
    );
    grad.addColorStop(0, '#1c1917');
    grad.addColorStop(0.42, '#0f172a');
    grad.addColorStop(1, '#050508');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle warm poetic breathing aura
    const auraGrad = ctx.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, w * 0.55);
    const pulse = 0.12 + 0.04 * Math.sin(time * 0.8);
    auraGrad.addColorStop(0, `rgba(245, 158, 11, ${pulse})`);
    auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = auraGrad;
    ctx.fillRect(0, 0, w, h);

    // Floating subtle luminous celestial dust
    const particleCount = 28;
    for (let i = 0; i < particleCount; i++) {
      const px = ((i * 137.5 + time * 14 * (0.3 + (i % 4) * 0.2)) % w);
      const py = ((i * 219.3 + Math.sin(time * 0.5 + i) * 35 + h) % h);
      const alpha = 0.15 + 0.25 * Math.sin(time * 1.1 + i);
      const radius = 1.0 + (i % 3) * 0.7;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(251, 191, 36, ${Math.max(0, alpha)})`;
      ctx.fill();
    }
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  public getTotalDuration(): number {
    return this.totalDuration;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Renders the complete mixed audio track (speech + background music) offline with exact sample accuracy.
   */
  public async renderMixedAudioBuffer(): Promise<AudioBuffer | null> {
    const totalDuration = this.totalDuration;
    if (!totalDuration || totalDuration <= 0) return null;

    const sampleRate = this.speechBuffer?.sampleRate || this.musicBuffer?.sampleRate || 48000;
    const totalSamples = Math.max(1, Math.ceil(totalDuration * sampleRate));
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
    let hasAudio = false;

    if (this.speechBuffer && this.speechVol > 0.001) {
      const sSrc = offlineCtx.createBufferSource();
      sSrc.buffer = this.speechBuffer;
      const sGain = offlineCtx.createGain();
      sGain.gain.value = this.getEffectiveGain(this.speechVol, false);
      sSrc.connect(sGain);
      sGain.connect(offlineCtx.destination);
      sSrc.start(0);
      hasAudio = true;
    }

    if (this.musicBuffer && this.musicVol > 0.001) {
      const mSrc = offlineCtx.createBufferSource();
      mSrc.buffer = this.musicBuffer;
      mSrc.loop = true;
      const mGain = offlineCtx.createGain();
      const targetGain = this.getEffectiveGain(this.musicVol, true);

      // Mandatory smooth fade-in at the start and fade-out at the end
      const fadeInDuration = Math.min(2.5, Math.max(0.5, totalDuration * 0.12));
      const fadeOutDuration = Math.min(3.0, Math.max(0.5, totalDuration * 0.18));
      const fadeOutStart = Math.max(fadeInDuration, totalDuration - fadeOutDuration);

      mGain.gain.setValueAtTime(0, 0);
      mGain.gain.linearRampToValueAtTime(targetGain, fadeInDuration);
      mGain.gain.setValueAtTime(targetGain, fadeOutStart);
      mGain.gain.linearRampToValueAtTime(0, totalDuration);

      mSrc.connect(mGain);
      mGain.connect(offlineCtx.destination);
      mSrc.start(0);
      hasAudio = true;
    }

    if (!hasAudio) {
      // Return a clean silent buffer so video export always has an audio track
      return offlineCtx.createBuffer(2, totalSamples, sampleRate);
    }

    return await offlineCtx.startRendering();
  }

  /**
   * Records the entire videoclip (visual canvas + mixed audio stream) into a downloadable Video file.
   */
  public async exportVideoclip(onProgress: (progress: number) => void): Promise<Blob> {
    this.initAudioNodes();
    this.pause();
    this.seek(0);

    const canvasStream = this.canvas.captureStream(30);
    const audioStream = this.mediaStreamDest!.stream;

    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioStream.getAudioTracks(),
    ]);

    let mimeType = 'video/webm;codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/mp4';
      }
    }

    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
      videoBitsPerSecond: 4500000,
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    return new Promise<Blob>((resolve, reject) => {
      if (!this.mediaRecorder) return reject(new Error('MediaRecorder no disponible'));

      this.mediaRecorder.onstop = () => {
        const finalBlob = new Blob(this.recordedChunks, {
          type: this.mediaRecorder?.mimeType || 'video/webm',
        });
        resolve(finalBlob);
      };

      this.mediaRecorder.onerror = (e) => reject(e);

      this.mediaRecorder.start(100);
      this.play();

      const checkInterval = setInterval(() => {
        const progress = Math.min(100, Math.round((this.currentTime / this.totalDuration) * 100));
        onProgress(progress);

        if (!this.isPlaying || this.currentTime >= this.totalDuration) {
          clearInterval(checkInterval);
          this.pause();
          setTimeout(() => {
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
              this.mediaRecorder.stop();
            }
          }, 350);
        }
      }, 100);
    });
  }

  public destroy() {
    this.pause();
    this.stopAudioNodes();
    this.loadedMedia.forEach((m) => {
      if (m.videoElement) {
        try {
          m.videoElement.pause();
          m.videoElement.removeAttribute('src');
          m.videoElement.load();
        } catch {
          // ignore
        }
      }
    });
    this.loadedMedia = [];
    this.loadedImages = [];
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
  }
}
