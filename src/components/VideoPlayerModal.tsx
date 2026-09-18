import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Download,
  X,
  Volume2,
  Sparkles,
  Loader2,
  AlertCircle,
  FileCheck,
  Sliders,
  Wand2,
} from 'lucide-react';
import {
  ColorGradeType,
  GeneratedSpeechData,
  ImageItem,
  MusicTrack,
  PanEffectType,
  SubtitleCue,
  TransitionEffectType,
  VideoProjectConfig,
  ZoomEffectType,
} from '../types';
import { RenderState, VideoRenderer } from '../utils/videoRenderer';
import { exportVideoclipHighQuality } from '../utils/videoExporter';
import {
  assembleSpeechTimeline,
  decodeAudioFile,
  decodeBase64Audio,
  generateAtmosphericMusicBuffer,
} from '../utils/audioSynthesizer';
import {
  COLOR_GRADE_OPTIONS,
  TRANSITION_OPTIONS,
  ZOOM_EFFECT_OPTIONS,
} from '../data/presets';

interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  text: string;
  images: ImageItem[];
  music: MusicTrack;
  config: VideoProjectConfig;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  isOpen,
  onClose,
  text,
  images,
  music,
  config,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VideoRenderer | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingStep, setLoadingStep] = useState<string>('Generando locución poética por bloques...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [renderState, setRenderState] = useState<RenderState>({
    currentTime: 0,
    totalDuration: 30,
    progress: 0,
    isPlaying: false,
    activeSubtitle: undefined,
  });

  const [subtitlesList, setSubtitlesList] = useState<SubtitleCue[]>([]);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStage, setExportStage] = useState<string>('Iniciando exportación...');
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState<number>(0);

  // Live real-time audio volumes in player
  const [localSpeechVol, setLocalSpeechVol] = useState<number>(config.speechVolume);
  const [localMusicVol, setLocalMusicVol] = useState<number>(config.musicVolume);

  // Live effect controls in player
  const [localTransition, setLocalTransition] = useState<TransitionEffectType>(config.transitionEffect || 'light-leaks');
  const [localColor, setLocalColor] = useState<ColorGradeType>(config.colorGrade || 'golden-hour');
  const [localZoom, setLocalZoom] = useState<ZoomEffectType>(config.zoomEffect || 'zoom-in');
  const [showFxDrawer, setShowFxDrawer] = useState<boolean>(false);

  useEffect(() => {
    setLocalSpeechVol(config.speechVolume);
    setLocalMusicVol(config.musicVolume);
    if (config.transitionEffect) setLocalTransition(config.transitionEffect);
    if (config.colorGrade) setLocalColor(config.colorGrade);
    if (config.zoomEffect) setLocalZoom(config.zoomEffect);
  }, [config]);

  // Sync volume adjustments to Web Audio nodes immediately
  const handleSpeechVolChange = (val: number) => {
    setLocalSpeechVol(val);
    if (engineRef.current) {
      engineRef.current.setVolumes(val, localMusicVol);
    }
  };

  const handleMusicVolChange = (val: number) => {
    setLocalMusicVol(val);
    if (engineRef.current) {
      engineRef.current.setVolumes(localSpeechVol, val);
    }
  };

  // Re-apply live effect changes to renderer
  const handleUpdateEffect = (newTrans: TransitionEffectType, newColor: ColorGradeType, newZoom: ZoomEffectType) => {
    setLocalTransition(newTrans);
    setLocalColor(newColor);
    setLocalZoom(newZoom);
    if (engineRef.current) {
      engineRef.current.setConfig({
        minSceneDuration: config.minSceneDuration,
        maxSceneDuration: config.maxSceneDuration,
        sceneDuration: config.sceneDuration,
        totalDuration: renderState.totalDuration,
        subtitles: subtitlesList,
        speechVolume: localSpeechVol,
        musicVolume: localMusicVol,
        zoomEffect: newZoom,
        panEffect: config.panEffect || 'diagonal-drift',
        colorGrade: newColor,
        transitionEffect: newTrans,
      });
      engineRef.current.renderFrame(renderState.currentTime);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
      return;
    }

    let isMounted = true;

    async function initVideoclip() {
      setIsLoading(true);
      setErrorMessage(null);
      setFallbackNotice(null);

      try {
        const isVoiceEnabled = config.voiceEnabled ?? true;
        const isMusicEnabled = config.musicEnabled ?? true;
        const isImagesEnabled = config.imagesEnabled ?? true;

        // Step 1: Request TTS block-by-block with random silences and exact subtitles
        setLoadingStep(
          isVoiceEnabled
            ? 'Sintetizando versos poéticos por bloques y sincronizando subtítulos...'
            : 'Sincronizando subtítulos y tiempos poéticos...'
        );
        const ttsResponse = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            gender: config.gender,
            intonation: config.intonation,
            presetVoice: config.presetVoice,
            minSilence: config.minSilence ?? 1.0,
            maxSilence: config.maxSilence ?? 2.4,
            voiceEnabled: isVoiceEnabled,
          }),
        });

        if (!ttsResponse.ok) {
          const errData = await ttsResponse.json().catch(() => ({}));
          throw new Error(errData.error || 'Error al generar el discurso TTS.');
        }

        const ttsData: GeneratedSpeechData = await ttsResponse.json();
        if (!isMounted) return;

        if (ttsData.isFallback && ttsData.fallbackNotice) {
          setFallbackNotice(ttsData.fallbackNotice);
        }

        // Step 2: Decode speech audio buffer with exact block durations & natural silences
        let speechAudioBuffer: AudioBuffer | null = null;
        let activeSubtitles: SubtitleCue[] = ttsData.subtitles;
        let totalDuration = ttsData.duration;

        if (isVoiceEnabled) {
          setLoadingStep('Decodificando bloques de voz poética y sincronizando subtítulos...');

          if (ttsData.blocks && ttsData.blocks.length > 0) {
            const decodedBlocks: { buffer: AudioBuffer; text: string; id: string }[] = [];
            for (let i = 0; i < ttsData.blocks.length; i++) {
              const b = ttsData.blocks[i];
              try {
                const buf = await decodeBase64Audio(b.audioBase64);
                decodedBlocks.push({ buffer: buf, text: b.text, id: b.id });
              } catch (decErr) {
                console.warn(`[Audio] Error al decodificar bloque ${i + 1} ("${b.text.slice(0, 15)}..."):`, decErr);
              }
            }

            if (decodedBlocks.length > 0) {
              const assembled = assembleSpeechTimeline(
                decodedBlocks,
                config.minSilence ?? 1.0,
                config.maxSilence ?? 2.4,
                config.gender === 'male'
              );

              speechAudioBuffer = assembled.masterBuffer;
              activeSubtitles = assembled.subtitles;
              totalDuration = assembled.totalDuration;
            } else if (ttsData.audioBase64) {
              speechAudioBuffer = await decodeBase64Audio(ttsData.audioBase64);
            }
          } else if (ttsData.audioBase64) {
            speechAudioBuffer = await decodeBase64Audio(ttsData.audioBase64);
          }
        }

        setSubtitlesList(activeSubtitles);

        // Step 3: Decode / synthesize background music
        let musicAudioBuffer: AudioBuffer | null = null;
        if (isMusicEnabled) {
          setLoadingStep('Calibrando música atmosférica y balance de volumen...');
          if (music.type === 'custom' && music.file) {
            musicAudioBuffer = await decodeAudioFile(music.file);
          } else {
            musicAudioBuffer = await generateAtmosphericMusicBuffer(
              music.id,
              Math.max(60, totalDuration + 10)
            );
          }
        }

        if (!isMounted) return;

        // Step 4: Preload N images and initialize VideoRenderer
        setLoadingStep(
          isImagesEnabled
            ? 'Cargando colección de imágenes y componiendo transiciones fluidas...'
            : 'Componiendo visualizador poético y subtítulos...'
        );
        if (!canvasRef.current) throw new Error('El lienzo de vídeo no está disponible.');

        const engine = new VideoRenderer(canvasRef.current);
        engineRef.current = engine;

        if (isImagesEnabled && images.length > 0) {
          await engine.preloadMedia(images);
        } else {
          await engine.preloadMedia([]);
        }

        if (!isMounted) return;

        engine.setConfig({
          minSceneDuration: config.minSceneDuration,
          maxSceneDuration: config.maxSceneDuration,
          sceneDuration: config.sceneDuration,
          totalDuration,
          subtitles: activeSubtitles,
          speechVolume: isVoiceEnabled ? localSpeechVol : 0,
          musicVolume: isMusicEnabled ? localMusicVol : 0,
          zoomEffect: localZoom,
          panEffect: config.panEffect || 'diagonal-drift',
          colorGrade: localColor,
          transitionEffect: localTransition,
        });

        engine.setAudioBuffers(
          isVoiceEnabled ? speechAudioBuffer : null,
          isMusicEnabled ? musicAudioBuffer : null
        );

        engine.setCallbacks({
          onTimeUpdate: (state) => {
            if (isMounted) setRenderState(state);
          },
          onEnded: () => {
            if (isMounted) {
              setRenderState((prev) => ({ ...prev, isPlaying: false }));
            }
          },
        });

        setIsLoading(false);

        // Autoplay
        setTimeout(() => {
          if (isMounted && engineRef.current) {
            engineRef.current.play();
          }
        }, 250);
      } catch (err: any) {
        console.error('Error inicializando videoclip:', err);
        if (isMounted) {
          setErrorMessage(err.message || 'Ocurrió un error inesperado al generar el videoclip.');
          setIsLoading(false);
        }
      }
    }

    initVideoclip();

    return () => {
      isMounted = false;
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [isOpen, text, images, music, config, retryKey]);

  const handleTogglePlay = () => {
    if (!engineRef.current) return;
    engineRef.current.togglePlay();
  };

  const handleRestart = () => {
    if (!engineRef.current) return;
    engineRef.current.seek(0);
    engineRef.current.play();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!engineRef.current) return;
    const target = parseFloat(e.target.value);
    engineRef.current.seek(target);
  };

  const handleExport = async () => {
    if (!engineRef.current || isExporting) return;
    setIsExporting(true);
    setExportProgress(0);
    setExportStage('Iniciando renderizado determinista fotograma a fotograma...');

    try {
      const blob = await exportVideoclipHighQuality(engineRef.current, (progress, stage) => {
        setExportProgress(progress);
        if (stage) setExportStage(stage);
      });

      const isMp4 = blob.type.includes('mp4');
      const ext = isMp4 ? 'mp4' : 'webm';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `videoclip-poetico-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Error al exportar vídeo:', err);
      alert('Error al generar la descarga: ' + (err?.message || 'intenta de nuevo'));
    } finally {
      setIsExporting(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div
      id="video-player-modal"
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col justify-between p-3 sm:p-6 overflow-y-auto"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-4 max-w-6xl w-full mx-auto pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-neutral-100 font-cinzel">
              Videoclip Poético
            </h2>
            <p className="text-xs text-neutral-400">
              Voz: {config.presetVoice} ({config.gender === 'male' ? 'Masculina' : 'Femenina'}) • {images.length} Medios (Fotos/Vídeos) • Transición: {localTransition} • FX: {localColor}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isLoading && !errorMessage && (
            <>
              <button
                type="button"
                onClick={() => setShowFxDrawer(!showFxDrawer)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  showFxDrawer
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:text-neutral-100'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Efectos en Vivo</span>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={handleExport}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-bold text-xs transition-all shadow-lg shadow-amber-500/10 active:scale-95 disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Grabando ({exportProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar Videoclip</span>
                  </>
                )}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100 border border-neutral-700/60 transition-colors"
            title="Cerrar y volver al editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Player Area */}
      <div className="flex-1 flex flex-col items-center justify-center my-4 max-w-5xl w-full mx-auto">
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-amber-500/5 border border-neutral-800 bg-neutral-950 flex items-center justify-center">
          {/* Canvas */}
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="w-full h-full object-contain"
          />

          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-neutral-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
              <div className="relative mb-4">
                <div className="w-16 h-16 rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin" />
                <Sparkles className="w-6 h-6 text-amber-400 absolute inset-0 m-auto" />
              </div>
              <h3 className="text-base font-semibold text-neutral-100 mb-1 font-cinzel">
                Componiendo Videoclip Poético
              </h3>
              <p className="text-xs text-amber-400 font-medium animate-pulse max-w-md">
                {loadingStep}
              </p>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-neutral-500">
                <span>Voz por bloques exactos</span>
                <span>•</span>
                <span>Zoom continuo sin saltos</span>
                <span>•</span>
                <span>Subtítulos sincronizados</span>
              </div>
            </div>
          )}

          {/* Error Overlay */}
          {errorMessage && (
            <div className="absolute inset-0 bg-neutral-950/95 flex flex-col items-center justify-center p-6 text-center">
              <div className="p-3 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 mb-3">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-neutral-100 mb-1">
                No se pudo generar el videoclip
              </h3>
              <p className="text-xs text-rose-300 max-w-md mb-4">{errorMessage}</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setRetryKey((k) => k + 1)}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-all shadow-md"
                >
                  Reintentar ahora
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-100 text-xs font-semibold transition-colors"
                >
                  Volver al editor
                </button>
              </div>
            </div>
          )}

          {/* Fallback Notice Pill */}
          {!isLoading && !errorMessage && fallbackNotice && (
            <div className="absolute top-3 left-3 right-3 sm:right-auto max-w-md px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 backdrop-blur-md text-[11px] text-amber-200 flex items-center justify-between gap-2 shadow-lg">
              <span>{fallbackNotice}</span>
              <button
                type="button"
                onClick={() => setRetryKey((k) => k + 1)}
                className="text-[10px] font-bold underline hover:text-amber-100 uppercase"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Export recording overlay */}
          {isExporting && (
            <div className="absolute inset-0 bg-neutral-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-40">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mb-4 animate-pulse">
                <Download className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-neutral-100 mb-1 font-cinzel">
                Exportando Videoclip en Alta Calidad
              </h3>
              <p className="text-xs text-amber-400 font-medium mb-3 max-w-md">
                {exportStage}
              </p>
              <div className="w-72 h-2.5 bg-neutral-900 rounded-full overflow-hidden border border-neutral-700/80 mb-2">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300 rounded-full"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                <span>{exportProgress}% completado</span>
                <span>•</span>
                <span>Sin saltos ni fotogramas congelados</span>
              </div>
            </div>
          )}
        </div>

        {/* Live Effect Switcher Drawer (if opened) */}
        {showFxDrawer && !isLoading && !errorMessage && (
          <div className="w-full mt-2 p-3 rounded-xl bg-neutral-900/95 border border-neutral-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* Quick Transition */}
            <div>
              <span className="font-semibold text-neutral-300 block mb-1">Transición:</span>
              <div className="flex flex-wrap gap-1">
                {TRANSITION_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleUpdateEffect(t.id as TransitionEffectType, localColor, localZoom)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                      localTransition === t.id
                        ? 'bg-amber-500 text-neutral-950 font-bold'
                        : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Color */}
            <div>
              <span className="font-semibold text-neutral-300 block mb-1">Filtro de Color:</span>
              <div className="flex flex-wrap gap-1">
                {COLOR_GRADE_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleUpdateEffect(localTransition, c.id as ColorGradeType, localZoom)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                      localColor === c.id
                        ? 'bg-amber-500 text-neutral-950 font-bold'
                        : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Zoom */}
            <div>
              <span className="font-semibold text-neutral-300 block mb-1">Zoom Cinemático:</span>
              <div className="flex flex-wrap gap-1">
                {ZOOM_EFFECT_OPTIONS.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => handleUpdateEffect(localTransition, localColor, z.id as ZoomEffectType)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                      localZoom === z.id
                        ? 'bg-amber-500 text-neutral-950 font-bold'
                        : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Player Controls Bar */}
        {!isLoading && !errorMessage && (
          <div className="w-full mt-3 p-3.5 rounded-xl bg-neutral-900/90 border border-neutral-800 backdrop-blur-md flex flex-col gap-3">
            {/* Timeline Progress Slider */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-neutral-400 w-12 text-right">
                {formatTime(renderState.currentTime)}
              </span>
              <input
                id="timeline-seek-slider"
                type="range"
                min="0"
                max={renderState.totalDuration || 1}
                step="0.05"
                value={renderState.currentTime}
                onChange={handleSeek}
                className="flex-1 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <span className="text-xs font-mono text-neutral-400 w-12">
                {formatTime(renderState.totalDuration)}
              </span>
            </div>

            {/* Controls Row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 flex items-center justify-center transition-transform active:scale-95 shadow-md shadow-amber-500/20"
                  title={renderState.isPlaying ? 'Pausar' : 'Reproducir'}
                >
                  {renderState.isPlaying ? (
                    <Pause className="w-5 h-5 fill-neutral-950" />
                  ) : (
                    <Play className="w-5 h-5 fill-neutral-950 translate-x-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleRestart}
                  className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-amber-300 transition-colors"
                  title="Reiniciar desde el principio"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* Current Subtitle Preview in Bar */}
              <div className="flex-1 px-4 text-center hidden md:block truncate">
                <span className="text-xs text-amber-200/90 font-playfair italic">
                  {renderState.activeSubtitle?.text || '...'}
                </span>
              </div>

              {/* Real-time Volume Calibration Sliders in Player */}
              <div className="flex items-center gap-4 bg-neutral-950/70 px-3 py-1.5 rounded-xl border border-neutral-800">
                <div className="flex items-center gap-1.5 text-xs text-neutral-300">
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] text-neutral-400">Voz:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={localSpeechVol}
                    onChange={(e) => handleSpeechVolChange(parseFloat(e.target.value))}
                    className="w-16 h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-amber-500"
                    title={`Volumen voz: ${Math.round(localSpeechVol * 100)}%`}
                  />
                  <span className="font-mono text-[10px] text-amber-400 w-7">{Math.round(localSpeechVol * 100)}%</span>
                </div>

                <div className="w-[1px] h-4 bg-neutral-800" />

                <div className="flex items-center gap-1.5 text-xs text-neutral-300">
                  <span className="text-[11px] text-neutral-400">Música:</span>
                  <input
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    value={localMusicVol}
                    onChange={(e) => handleMusicVolChange(parseFloat(e.target.value))}
                    className="w-16 h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-amber-500"
                    title={`Volumen música: ${Math.round(localMusicVol * 100)}%`}
                  />
                  <span className="font-mono text-[10px] text-amber-400 w-7">{Math.round(localMusicVol * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Subtitles Timeline Drawer / Cues Preview */}
      {!isLoading && !errorMessage && subtitlesList.length > 0 && (
        <div className="max-w-5xl w-full mx-auto bg-neutral-900/40 border border-neutral-800/80 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-amber-400" />
              Bloques de Locución y Subtítulos Sincronizados ({subtitlesList.length} versos)
            </span>
            <span className="text-[11px] text-neutral-500">
              Duración total de locución: {renderState.totalDuration.toFixed(1)}s
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {subtitlesList.map((cue, idx) => {
              const isActive =
                renderState.currentTime >= cue.startTime &&
                renderState.currentTime <= cue.endTime;

              return (
                <div
                  key={cue.id}
                  onClick={() => {
                    if (engineRef.current) engineRef.current.seek(cue.startTime);
                  }}
                  className={`flex-shrink-0 cursor-pointer p-2 rounded-lg border text-left transition-all max-w-[200px] ${
                    isActive
                      ? 'bg-amber-500/20 border-amber-500/60 ring-1 ring-amber-500/40'
                      : 'bg-neutral-950/60 border-neutral-800/80 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1 font-mono">
                    <span>Verso #{idx + 1}</span>
                    <span>{formatTime(cue.startTime)}</span>
                  </div>
                  <p
                    className={`text-xs font-playfair line-clamp-2 ${
                      isActive ? 'text-amber-200 font-semibold' : 'text-neutral-300'
                    }`}
                  >
                    {cue.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
