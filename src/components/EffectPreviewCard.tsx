import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RefreshCw, Wand2, Sparkles, Layers, Sliders, Eye } from 'lucide-react';
import {
  ColorGradeType,
  ImageItem,
  PanEffectType,
  TransitionEffectType,
  ZoomEffectType,
} from '../types';
import {
  COLOR_GRADE_OPTIONS,
  PAN_EFFECT_OPTIONS,
  TRANSITION_OPTIONS,
  ZOOM_EFFECT_OPTIONS,
} from '../data/presets';

interface EffectPreviewCardProps {
  images: ImageItem[];
  currentZoom: ZoomEffectType;
  currentPan: PanEffectType;
  currentColor: ColorGradeType;
  currentTransition: TransitionEffectType;
  onApplyEffects: (effects: {
    zoom: ZoomEffectType;
    pan: PanEffectType;
    color: ColorGradeType;
    transition: TransitionEffectType;
  }) => void;
}

export const EffectPreviewCard: React.FC<EffectPreviewCardProps> = ({
  images,
  currentZoom,
  currentPan,
  currentColor,
  currentTransition,
  onApplyEffects,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Local effect preview settings
  const [selectedZoom, setSelectedZoom] = useState<ZoomEffectType>(currentZoom);
  const [selectedPan, setSelectedPan] = useState<PanEffectType>(currentPan);
  const [selectedColor, setSelectedColor] = useState<ColorGradeType>(currentColor);
  const [selectedTransition, setSelectedTransition] = useState<TransitionEffectType>(currentTransition);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isTransitionDemo, setIsTransitionDemo] = useState<boolean>(false);
  const [transitionProgress, setTransitionProgress] = useState<number>(0);

  const [activeTab, setActiveTab] = useState<'transitions' | 'color' | 'zoom' | 'pan'>('transitions');

  // Images loaded for canvas preview
  const loadedImagesRef = useRef<HTMLImageElement[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(performance.now());

  // Keep in sync with parent when changed outside
  useEffect(() => {
    setSelectedZoom(currentZoom);
    setSelectedPan(currentPan);
    setSelectedColor(currentColor);
    setSelectedTransition(currentTransition);
  }, [currentZoom, currentPan, currentColor, currentTransition]);

  // Preload preview images
  useEffect(() => {
    const urls = images.length >= 2 ? [images[0].url, images[1].url] : images.length === 1 ? [images[0].url, images[0].url] : [];
    if (urls.length === 0) return;

    let mounted = true;
    const loaded: HTMLImageElement[] = [];

    const promises = urls.map((url) => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          loaded.push(img);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url;
      });
    });

    Promise.all(promises).then(() => {
      if (mounted) {
        loadedImagesRef.current = loaded;
      }
    });

    return () => {
      mounted = false;
    };
  }, [images]);

  // Main interactive preview loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = (now: number) => {
      const elapsed = (now - startTimeRef.current) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      ctx.save();
      ctx.fillStyle = '#0a0a0e';
      ctx.fillRect(0, 0, w, h);

      const imgs = loadedImagesRef.current;
      if (imgs.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Cargando previsualización...', w / 2, h / 2);
        ctx.restore();
        animId = requestAnimationFrame(render);
        return;
      }

      // Multi-scene continuous cycle with seamless alternating images and continuous zoom
      const sceneDuration = 3.5;
      const transDuration = 1.0;
      const stepTime = sceneDuration - transDuration; // 2.5s progression before next transition
      const numImgs = imgs.length;

      const totalSteps = Math.floor(elapsed / stepTime);
      const idxA = totalSteps % numImgs;
      const idxB = (totalSteps + 1) % numImgs;

      const imgA = imgs[idxA];
      const imgB = imgs[idxB];

      const timeInStep = elapsed - totalSteps * stepTime;
      const progressA = Math.min(1.0, timeInStep / sceneDuration);

      // Color filter
      applyColorFilter(ctx, selectedColor);

      // Check transition demonstration mode or regular cycle transition
      let transT = 0;
      let inTrans = false;

      if (isTransitionDemo) {
        // Run a dedicated 2.5s transition
        const tDuration = 2.5;
        const tTime = (elapsed % tDuration) / tDuration;
        transT = tTime;
        inTrans = true;
        setTransitionProgress(Math.round(tTime * 100));
      } else if (timeInStep >= stepTime) {
        // Smooth transition overlap to Image B
        transT = Math.min(1.0, (timeInStep - stepTime) / transDuration);
        inTrans = true;
      }

      // Draw primary image A - zoom runs smoothly across its full scene duration
      const { scale: scaleA, panX: panXA, panY: panYA } = calculateTransform(selectedZoom, selectedPan, progressA);
      drawImageCover(ctx, imgA, w, h, scaleA, panXA, panYA, 1.0);

      // Draw secondary image with selected transition effect
      if (inTrans) {
        const progressB = Math.min(1.0, (transT * transDuration) / sceneDuration);
        const { scale: scaleB, panX: panXB, panY: panYB } = calculateTransform(selectedZoom, selectedPan, progressB);
        renderTransition(ctx, imgB, w, h, scaleB, panXB, panYB, transT, selectedTransition);
      }

      ctx.filter = 'none';
      ctx.restore();

      // Top label overlay showing active effects
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(8, 8, 220, 24);
      ctx.fillStyle = '#fbbf24';
      ctx.font = '11px sans-serif';
      ctx.fillText(`FX: ${selectedTransition} | ${selectedColor}`, 14, 24);
      ctx.restore();

      if (isPlaying) {
        animId = requestAnimationFrame(render);
      }
    };

    if (isPlaying) {
      animId = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, isTransitionDemo, selectedZoom, selectedPan, selectedColor, selectedTransition]);

  const calculateTransform = (zoom: ZoomEffectType, pan: PanEffectType, p: number) => {
    let scale = 1.0;
    if (zoom === 'zoom-in') scale = 1.0 + 0.16 * p;
    else if (zoom === 'zoom-out') scale = 1.16 - 0.16 * p;
    else if (zoom === 'dramatic-pulse') scale = 1.0 + 0.1 * Math.sin(p * Math.PI);
    else if (zoom === 'slow-drift') scale = 1.03 + 0.05 * p;

    let panX = 0;
    let panY = 0;
    if (pan === 'diagonal-drift') {
      panX = (p - 0.5) * 35;
      panY = (p - 0.5) * 20;
    } else if (pan === 'pan-left') {
      panX = (0.5 - p) * 45;
    } else if (pan === 'pan-right') {
      panX = (p - 0.5) * 45;
    } else if (pan === 'drift-up') {
      panY = (0.5 - p) * 30;
    }

    return { scale, panX, panY };
  };

  const applyColorFilter = (ctx: CanvasRenderingContext2D, color: ColorGradeType) => {
    if (color === 'golden-hour') {
      ctx.filter = 'brightness(1.06) contrast(1.08) saturate(1.25)';
    } else if (color === 'vintage-film') {
      ctx.filter = 'sepia(0.28) contrast(1.12) brightness(0.98)';
    } else if (color === 'noir-monochrome') {
      ctx.filter = 'grayscale(1) contrast(1.35) brightness(0.92)';
    } else if (color === 'ethereal-dream') {
      ctx.filter = 'brightness(1.1) contrast(0.92) saturate(1.1)';
    } else if (color === 'twilight-cool') {
      ctx.filter = 'hue-rotate(185deg) contrast(1.1) saturate(1.18)';
    } else {
      ctx.filter = 'none';
    }
  };

  const drawImageCover = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    canvasW: number,
    canvasH: number,
    scale: number,
    panX: number,
    panY: number,
    opacity: number
  ) => {
    if (!img.complete || img.naturalWidth === 0) return;
    ctx.globalAlpha = opacity;
    const imgRatio = img.naturalWidth / img.naturalHeight;
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
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  };

  const renderTransition = (
    ctx: CanvasRenderingContext2D,
    nextImg: HTMLImageElement,
    w: number,
    h: number,
    scaleB: number,
    panXB: number,
    panYB: number,
    t: number,
    transType: TransitionEffectType
  ) => {
    const smoothT = Math.sin((t * Math.PI) / 2);

    if (transType === 'light-leaks') {
      ctx.save();
      ctx.globalAlpha = smoothT;
      drawImageCover(ctx, nextImg, w, h, scaleB, panXB, panYB, 1.0);
      ctx.restore();

      ctx.save();
      const leakIntensity = Math.sin(t * Math.PI);
      ctx.globalAlpha = leakIntensity * 0.85;
      ctx.globalCompositeOperation = 'screen';

      const sweepX = w * (0.15 + t * 0.85);
      const sweepY = h * (0.1 + t * 0.4);
      const leakGrad = ctx.createRadialGradient(sweepX, sweepY, 10, sweepX, sweepY, w * 0.7);
      leakGrad.addColorStop(0, 'rgba(255, 245, 200, 0.95)');
      leakGrad.addColorStop(0.3, 'rgba(251, 146, 60, 0.7)');
      leakGrad.addColorStop(0.7, 'rgba(244, 63, 94, 0.35)');
      leakGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = leakGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    } else if (transType === 'glitch') {
      ctx.save();
      ctx.globalAlpha = smoothT;
      if (t > 0.15 && t < 0.85) {
        const jitter = Math.sin(t * 70) * 16;
        drawImageCover(ctx, nextImg, w, h, scaleB, panXB + jitter, panYB, 1.0);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.fillRect(0, (h * (t * 1.5)) % h, w, 7);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.4)';
        ctx.fillRect(0, (h * (1 - t * 1.2)) % h, w, 5);
      } else {
        drawImageCover(ctx, nextImg, w, h, scaleB, panXB, panYB, 1.0);
      }
      ctx.restore();
    } else if (transType === 'zoom-blur') {
      const warpScale = scaleB * (1.0 + (1 - t) * 0.28);
      ctx.save();
      ctx.globalAlpha = smoothT;
      drawImageCover(ctx, nextImg, w, h, warpScale, panXB, panYB, 1.0);
      ctx.restore();
    } else if (transType === 'film-burn') {
      ctx.save();
      ctx.globalAlpha = smoothT;
      drawImageCover(ctx, nextImg, w, h, scaleB, panXB, panYB, 1.0);
      ctx.restore();

      ctx.save();
      const burnIntensity = Math.sin(t * Math.PI);
      ctx.globalAlpha = burnIntensity * 0.85;
      ctx.globalCompositeOperation = 'lighter';
      const burnGrad = ctx.createLinearGradient(0, 0, w, h);
      burnGrad.addColorStop(0, 'rgba(255, 130, 0, 0.85)');
      burnGrad.addColorStop(0.5, 'rgba(255, 230, 110, 0.95)');
      burnGrad.addColorStop(1, 'rgba(230, 50, 20, 0.65)');
      ctx.fillStyle = burnGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = smoothT;
      drawImageCover(ctx, nextImg, w, h, scaleB, panXB, panYB, 1.0);
      ctx.restore();
    }
  };

  const handleApply = () => {
    onApplyEffects({
      zoom: selectedZoom,
      pan: selectedPan,
      color: selectedColor,
      transition: selectedTransition,
    });
  };

  return (
    <div
      id="effect-preview-card"
      className="p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 shadow-xl space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
              Efectos Dinámicos & Previsualizador de Vídeo
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Tiempo Real
              </span>
            </h3>
            <p className="text-xs text-neutral-400">
              Prueba transiciones complejas (light leaks, glitch), zoom continuo y gradación de color antes del render final.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleApply}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 text-xs font-bold transition-all shadow-md flex items-center gap-2"
        >
          <Wand2 className="w-3.5 h-3.5" />
          Aplicar al Proyecto
        </button>
      </div>

      {/* Main Interactive Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Canvas Monitor */}
        <div className="lg:col-span-6 space-y-3">
          <div className="relative aspect-video rounded-xl overflow-hidden bg-neutral-950 border border-neutral-800 shadow-2xl group">
            <canvas
              ref={canvasRef}
              width={640}
              height={360}
              className="w-full h-full object-cover"
            />

            {/* Play/Pause Overlay Controls */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between bg-neutral-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-700/50">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-1 rounded-md text-neutral-200 hover:text-amber-400 transition-colors"
                  title={isPlaying ? 'Pausar animación' : 'Reproducir'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    startTimeRef.current = performance.now();
                    setIsTransitionDemo(!isTransitionDemo);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all flex items-center gap-1 ${
                    isTransitionDemo
                      ? 'bg-amber-500 text-neutral-950'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  <RefreshCw className={`w-3 h-3 ${isTransitionDemo ? 'animate-spin' : ''}`} />
                  {isTransitionDemo ? 'Probando Transición...' : 'Probar Transición'}
                </button>
              </div>

              <div className="text-[11px] text-neutral-400 flex items-center gap-1 font-mono">
                <Eye className="w-3 h-3 text-amber-400" />
                <span>640x360 Live</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabbed Effect Selectors */}
        <div className="lg:col-span-6 space-y-3">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 p-1 bg-neutral-950/60 rounded-xl border border-neutral-800">
            <button
              type="button"
              onClick={() => setActiveTab('transitions')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'transitions'
                  ? 'bg-neutral-800 text-amber-400 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Transiciones
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('color')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'color'
                  ? 'bg-neutral-800 text-amber-400 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Color / Filtro
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('zoom')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'zoom'
                  ? 'bg-neutral-800 text-amber-400 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Zoom Cinemático
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pan')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'pan'
                  ? 'bg-neutral-800 text-amber-400 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Paneo & Cámara
            </button>
          </div>

          {/* Tab 1: Transitions */}
          {activeTab === 'transitions' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {TRANSITION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setSelectedTransition(opt.id as TransitionEffectType);
                    setIsTransitionDemo(true);
                    startTimeRef.current = performance.now();
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    selectedTransition === opt.id
                      ? 'bg-amber-500/15 border-amber-500/50 text-neutral-100 shadow-sm'
                      : 'bg-neutral-950/40 border-neutral-800/80 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-200">{opt.label}</span>
                    {selectedTransition === opt.id && (
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2">{opt.description}</p>
                </button>
              ))}
            </div>
          )}

          {/* Tab 2: Color Grade */}
          {activeTab === 'color' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {COLOR_GRADE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedColor(opt.id as ColorGradeType)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    selectedColor === opt.id
                      ? 'bg-amber-500/15 border-amber-500/50 text-neutral-100 shadow-sm'
                      : 'bg-neutral-950/40 border-neutral-800/80 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-200">{opt.label}</span>
                    {selectedColor === opt.id && (
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2">{opt.description}</p>
                </button>
              ))}
            </div>
          )}

          {/* Tab 3: Zoom */}
          {activeTab === 'zoom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {ZOOM_EFFECT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedZoom(opt.id as ZoomEffectType)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    selectedZoom === opt.id
                      ? 'bg-amber-500/15 border-amber-500/50 text-neutral-100 shadow-sm'
                      : 'bg-neutral-950/40 border-neutral-800/80 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-200">{opt.label}</span>
                    {selectedZoom === opt.id && (
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2">{opt.description}</p>
                </button>
              ))}
            </div>
          )}

          {/* Tab 4: Pan */}
          {activeTab === 'pan' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {PAN_EFFECT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedPan(opt.id as PanEffectType)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    selectedPan === opt.id
                      ? 'bg-amber-500/15 border-amber-500/50 text-neutral-100 shadow-sm'
                      : 'bg-neutral-950/40 border-neutral-800/80 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-200">{opt.label}</span>
                    {selectedPan === opt.id && (
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2">{opt.description}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
