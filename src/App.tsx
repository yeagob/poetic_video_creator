import React, { useState } from 'react';
import {
  Sparkles,
  Play,
  Clock,
  Mic,
  Music as MusicIcon,
  Image as ImageIcon,
  AlertCircle,
  Shuffle,
  Wand2,
} from 'lucide-react';
import { Header } from './components/Header';
import { TextInputSection } from './components/TextInputSection';
import { VoiceSettingsSection } from './components/VoiceSettingsSection';
import { MusicSection } from './components/MusicSection';
import { ImagesSection } from './components/ImagesSection';
import { TimingAndMixingSection } from './components/TimingAndMixingSection';
import { EffectPreviewCard } from './components/EffectPreviewCard';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import {
  ColorGradeType,
  ImageItem,
  MusicTrack,
  PanEffectType,
  TransitionEffectType,
  VideoProjectConfig,
  VoiceGender,
  ZoomEffectType,
} from './types';
import {
  INTONATION_OPTIONS,
  PRESET_IMAGE_COLLECTIONS,
  PRESET_MUSIC_TRACKS,
  SAMPLE_TEXTS,
  VOICE_PRESETS,
} from './data/presets';

export default function App() {
  // 1. Poetic Text State (initial value from sample)
  const [text, setText] = useState<string>(SAMPLE_TEXTS[0].text);

  // 2. Collection of N Images State (initial value from thematic preset)
  const [images, setImages] = useState<ImageItem[]>(
    PRESET_IMAGE_COLLECTIONS[0].images
  );

  // 3. Background Music Track State
  const [music, setMusic] = useState<MusicTrack>(PRESET_MUSIC_TRACKS[0]);

  // 4. Video Project Config with dynamic effects, random silence ranges, and volume balance
  const [config, setConfig] = useState<VideoProjectConfig>({
    imageTimingMode: 'random',
    fixedSceneDuration: 4.0,
    sceneDuration: 3.5,
    minSceneDuration: 2.0,
    maxSceneDuration: 5.0,
    silenceTimingMode: 'random',
    fixedSilenceDuration: 2.0,
    minSilence: 1.0,
    maxSilence: 2.5,
    voiceEnabled: true,
    musicEnabled: true,
    imagesEnabled: true,
    gender: 'male',
    presetVoice: 'Algieba',
    intonation: INTONATION_OPTIONS[0].promptInstruction, // Poetic solemn & deep
    speechVolume: 0.95,
    musicVolume: 0.35,
    durationMode: 'speech',
    zoomEffect: 'zoom-in',
    panEffect: 'diagonal-drift',
    colorGrade: 'golden-hour',
    transitionEffect: 'light-leaks',
  });

  // Modal Player State
  const [isVideoModalOpen, setIsVideoModalOpen] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Handle Voice Gender change (preselects appropriate preset)
  const handleGenderChange = (newGender: VoiceGender) => {
    const preset = VOICE_PRESETS[newGender];
    setConfig((prev) => ({
      ...prev,
      gender: newGender,
      presetVoice: preset.geminiVoice as 'Algieba' | 'Fenrir' | 'Kore',
    }));
  };

  // Load a complete sample scenario
  const handleLoadCompleteSample = () => {
    const randomText = SAMPLE_TEXTS[Math.floor(Math.random() * SAMPLE_TEXTS.length)];
    const randomCollection =
      PRESET_IMAGE_COLLECTIONS[
        Math.floor(Math.random() * PRESET_IMAGE_COLLECTIONS.length)
      ];
    const randomMusic =
      PRESET_MUSIC_TRACKS[
        Math.floor(Math.random() * PRESET_MUSIC_TRACKS.length)
      ];

    setText(randomText.text);
    setImages(randomCollection.images);
    setMusic(randomMusic);
    setConfig((prev) => ({
      ...prev,
      voiceEnabled: true,
      musicEnabled: true,
      imagesEnabled: true,
      minSceneDuration: 2.0,
      maxSceneDuration: 5.0,
      minSilence: 1.0,
      maxSilence: 2.5,
      intonation: INTONATION_OPTIONS[0].promptInstruction,
    }));
    setValidationError(null);
  };

  // Handle effects applied from EffectPreviewCard
  const handleApplyEffects = (fx: {
    zoom: ZoomEffectType;
    pan: PanEffectType;
    color: ColorGradeType;
    transition: TransitionEffectType;
  }) => {
    setConfig((prev) => ({
      ...prev,
      zoomEffect: fx.zoom,
      panEffect: fx.pan,
      colorGrade: fx.color,
      transitionEffect: fx.transition,
    }));
  };

  // Validate and open videoclip generation
  const handleCreateVideoclip = () => {
    if (!text.trim()) {
      setValidationError('Por favor ingresa un texto poético o selecciona uno de los ejemplos.');
      return;
    }
    const isImagesActive = config.imagesEnabled ?? true;
    if (isImagesActive && images.length === 0) {
      setValidationError('Debes añadir al menos 1 imagen a la colección para generar el videoclip (o desactiva la opción de imágenes para usar el fondo minimalista).');
      return;
    }

    setValidationError(null);
    setIsVideoModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans-ui selection:bg-amber-500/30 selection:text-amber-200">
      <Header onLoadSample={handleLoadCompleteSample} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Intro banner */}
        <div className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-neutral-900 via-neutral-900/90 to-amber-950/20 border border-neutral-800/80 shadow-2xl relative overflow-hidden">
          <div className="absolute right-0 top-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Estudio Poético de Alta Calibración
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-neutral-100 font-cinzel tracking-tight leading-tight">
              Videoclips Poéticos con TTS por Bloques y Efectos Dinámicos
            </h2>
            <p className="mt-2 text-sm text-neutral-300 leading-relaxed font-sans-ui">
              Convierte versos en videoclips cinematográficos. Generación de voz por bloques (cada salto de línea un verso TTS sincronizado), silencios aleatorios entre frases, zoom continuo sin saltos durante toda la escena, transiciones dinámicas como fugas de luz o glitch digital, y balance de volumen calibrado.
            </p>

            {/* Quick specifications indicator */}
            <div className="mt-4 flex flex-wrap items-center gap-2.5 text-xs text-neutral-400">
              <span
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
                  config.voiceEnabled
                    ? 'bg-neutral-950/60 border-neutral-800 text-neutral-300'
                    : 'bg-neutral-950/40 border-neutral-800/60 text-neutral-500 line-through'
                }`}
              >
                <Mic className="w-3.5 h-3.5 text-amber-400" />
                Voz: {config.voiceEnabled ? `${config.presetVoice} (${config.gender === 'male' ? 'M' : 'F'})` : 'Desactivada'}
              </span>
              <span
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
                  config.musicEnabled
                    ? 'bg-neutral-950/60 border-neutral-800 text-neutral-300'
                    : 'bg-neutral-950/40 border-neutral-800/60 text-neutral-500 line-through'
                }`}
              >
                <MusicIcon className="w-3.5 h-3.5 text-amber-400" />
                Música: {config.musicEnabled ? music.name : 'Desactivada'}
              </span>
              <span
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
                  config.imagesEnabled
                    ? 'bg-neutral-950/60 border-neutral-800 text-neutral-300'
                    : 'bg-neutral-950/40 border-neutral-800/60 text-neutral-500'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                Fotos: {config.imagesEnabled ? `${images.length} fotos` : 'Fondo Minimalista'}
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-950/60 border border-neutral-800">
                <Shuffle className="w-3.5 h-3.5 text-amber-400" />
                Silencios:{' '}
                {config.silenceTimingMode === 'fixed'
                  ? `${(config.fixedSilenceDuration ?? 2.0).toFixed(1)}s (Fijo)`
                  : `${config.minSilence?.toFixed(1)}s - ${config.maxSilence?.toFixed(1)}s`}
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-950/60 border border-neutral-800">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Escena: {config.minSceneDuration?.toFixed(1)}s - {config.maxSceneDuration?.toFixed(1)}s
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-950/60 border border-neutral-800">
                <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                Transición: {config.transitionEffect}
              </span>
            </div>
          </div>
        </div>

        {/* Validation Error if any */}
        {validationError && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Form Sections Grid */}
        <div className="space-y-6">
          {/* 1. Text Input */}
          <TextInputSection text={text} onChangeText={setText} />

          {/* 2. Voice Settings (Male / Female only + Intonation + Voice On/Off) */}
          <VoiceSettingsSection
            gender={config.gender}
            onChangeGender={handleGenderChange}
            intonation={config.intonation}
            onChangeIntonation={(newIntonation) =>
              setConfig((prev) => ({ ...prev, intonation: newIntonation }))
            }
            voiceEnabled={config.voiceEnabled ?? true}
            onChangeVoiceEnabled={(val) =>
              setConfig((prev) => ({ ...prev, voiceEnabled: val }))
            }
          />

          {/* 3. Music Section (Music On/Off) */}
          <MusicSection
            selectedTrack={music}
            onSelectTrack={(newTrack) => setMusic(newTrack)}
            musicEnabled={config.musicEnabled ?? true}
            onChangeMusicEnabled={(val) =>
              setConfig((prev) => ({ ...prev, musicEnabled: val }))
            }
          />

          {/* 4. Images Collection Section (N images + Images On/Off) */}
          <ImagesSection
            images={images}
            onChangeImages={setImages}
            imagesEnabled={config.imagesEnabled ?? true}
            onChangeImagesEnabled={(val) =>
              setConfig((prev) => ({ ...prev, imagesEnabled: val }))
            }
          />

          {/* 5. Effect Preview Card: Test Transitions (Light Leaks, Glitch), Color Grading, Zooms */}
          <EffectPreviewCard
            images={images}
            currentZoom={config.zoomEffect || 'zoom-in'}
            currentPan={config.panEffect || 'diagonal-drift'}
            currentColor={config.colorGrade || 'golden-hour'}
            currentTransition={config.transitionEffect || 'light-leaks'}
            onApplyEffects={handleApplyEffects}
          />

          {/* 6. Random Silence Ranges, Scene Timing (1-20s) & Audio Mixing */}
          <TimingAndMixingSection config={config} onChangeConfig={setConfig} />
        </div>

        {/* Bottom Action Bar */}
        <div className="mt-10 p-6 rounded-2xl bg-neutral-900/90 border border-neutral-800/90 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-4 z-30 backdrop-blur-xl">
          <div>
            <h3 className="text-base font-bold text-neutral-100 flex items-center gap-2 font-cinzel">
              ¿Listo para componer el videoclip?
            </h3>
            <p className="text-xs text-neutral-400">
              {config.voiceEnabled
                ? `Voz poética por versos con pausas (${config.minSilence}s-${config.maxSilence}s)`
                : 'Modo solo música y subtítulos sincronizados'}
              {config.musicEnabled ? ' + banda sonora ambiental' : ' (sin música)'}
              {config.imagesEnabled ? ` + fotos (${config.minSceneDuration}s-${config.maxSceneDuration}s)` : ' + fondo minimalista cinemático'}
              .
            </p>
          </div>

          <button
            type="button"
            id="create-videoclip-button"
            onClick={handleCreateVideoclip}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-bold text-sm tracking-wide shadow-xl shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-98 cursor-pointer"
          >
            <Play className="w-5 h-5 fill-neutral-950" />
            <span>Crear Videoclip Poético</span>
          </button>
        </div>
      </main>

      {/* Videoclip Cinema Presentation & Export Modal */}
      <VideoPlayerModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        text={text}
        images={images}
        music={music}
        config={config}
      />
    </div>
  );
}
