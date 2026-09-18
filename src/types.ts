export type VoiceGender = 'male' | 'female';

export type ZoomEffectType =
  | 'zoom-in'
  | 'zoom-out'
  | 'dramatic-pulse'
  | 'slow-drift'
  | 'random'
  | 'none';

export type PanEffectType =
  | 'pan-left'
  | 'pan-right'
  | 'drift-up'
  | 'diagonal-drift'
  | 'random'
  | 'none';

export type ColorGradeType =
  | 'golden-hour'
  | 'noir-monochrome'
  | 'vintage-film'
  | 'ethereal-dream'
  | 'twilight-cool'
  | 'natural';

export type TransitionEffectType =
  | 'light-leaks'
  | 'glitch'
  | 'crossfade'
  | 'zoom-blur'
  | 'film-burn'
  | 'random';

export interface VoicePreset {
  id: string;
  name: string;
  gender: VoiceGender;
  geminiVoice: 'Algieba' | 'Fenrir' | 'Kore' | 'Charon' | 'Zephyr' | 'Puck';
  description: string;
  badge: string;
}

export interface IntonationOption {
  id: string;
  label: string;
  description: string;
  promptInstruction: string;
}

export interface ImageItem {
  id: string;
  url: string;
  name: string;
  type?: 'image' | 'video';
  duration?: number; // In seconds for video clips
  aspectRatio?: number;
  thumbnailUrl?: string; // Preview snapshot for videos
  frames?: string[]; // Array of extracted image frames (data URLs)
  fps?: number; // Frame rate of extracted frames
  file?: File;
}

export interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  category: string;
  duration?: number;
  url?: string;
  type: 'preset' | 'custom';
  file?: File;
}

export interface SubtitleCue {
  id: string;
  text: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
}

export interface VideoProjectConfig {
  // Image Timing Mode: 'random' | 'fixed'
  imageTimingMode?: 'random' | 'fixed';
  fixedSceneDuration?: number; // In seconds (1 to 20s) when in fixed mode

  // Silence Timing Mode: 'random' | 'fixed'
  silenceTimingMode?: 'random' | 'fixed';
  fixedSilenceDuration?: number; // In seconds (0.5 to 20s) when in fixed mode

  // Random duration range per image in scene (between 1 and 20 seconds)
  minSceneDuration: number;
  maxSceneDuration: number;
  // Random silence range between verses/lines (between 0.5 and 20 seconds)
  minSilence: number;
  maxSilence: number;
  sceneDuration?: number; // legacy fallback

  // Feature Toggles (Voice, Music, Images On/Off)
  voiceEnabled: boolean;
  musicEnabled: boolean;
  imagesEnabled: boolean;

  gender: VoiceGender;
  presetVoice: 'Algieba' | 'Fenrir' | 'Kore';
  intonation: string;

  // Audio balance
  speechVolume: number; // 0 to 1
  musicVolume: number; // 0 to 1

  // Dynamic visual effects
  zoomEffect: ZoomEffectType;
  panEffect: PanEffectType;
  colorGrade: ColorGradeType;
  transitionEffect: TransitionEffectType;

  durationMode: 'speech' | 'max'; // Speech defines duration by default
}

export interface SpeechBlockItem {
  id: string;
  text: string;
  audioBase64: string;
  mimeType: string;
  engine: 'gemini-tts' | 'spanish-tts';
}

export interface GeneratedSpeechData {
  audioBase64: string;
  mimeType: string;
  duration: number; // in seconds
  subtitles: SubtitleCue[];
  sampleRate: number;
  voiceName?: string;
  isFallback?: boolean;
  fallbackNotice?: string;
  blockCount?: number;
  engineUsed?: 'gemini-tts' | 'spanish-tts';
  blocks?: SpeechBlockItem[];
}
