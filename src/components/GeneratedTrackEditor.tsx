import React, { useRef, useState, useEffect } from 'react';
import {
  Film,
  Image as ImageIcon,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Clock,
  Music,
  ZoomIn,
  ZoomOut,
  Sparkles,
  GripVertical,
  ArrowLeftRight,
} from 'lucide-react';
import { SceneSlot, LoadedMediaItem } from '../utils/videoRenderer';
import { SubtitleCue } from '../types';

interface GeneratedTrackEditorProps {
  slots: SceneSlot[];
  loadedMedia: LoadedMediaItem[];
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  subtitles: SubtitleCue[];
  onSeek: (seconds: number) => void;
  onTogglePlay: () => void;
  onUpdateSlotDuration: (slotIndex: number, newDuration: number) => void;
  onReorderSlots: (fromIndex: number, toIndex: number) => void;
  onMoveBoundary: (slotIndex: number, deltaSeconds: number) => void;
}

interface DragState {
  type: 'boundary' | 'playhead';
  slotIndex?: number;
  startX: number;
  accumulatedDelta: number;
}

export const GeneratedTrackEditor: React.FC<GeneratedTrackEditorProps> = ({
  slots,
  loadedMedia,
  currentTime,
  totalDuration,
  isPlaying,
  subtitles,
  onSeek,
  onTogglePlay,
  onReorderSlots,
  onMoveBoundary,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);

  // Zoom scale: pixels per second (default 48px/s)
  const [pxPerSec, setPxPerSec] = useState<number>(48);

  // Explicit user selection of a clip (tap/click to select)
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);

  // Dragging interaction state
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragTooltip, setDragTooltip] = useState<string | null>(null);
  const lastEmittedDeltaRef = useRef<number>(0);

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    const tenths = Math.floor((sec % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
  };

  // Timeline effective width in pixels
  const timelineWidth = Math.max(860, Math.ceil((totalDuration + 2) * pxPerSec));

  // Determine current playing slot index based on time
  const currentPlayingIndex = slots.findIndex(
    (s) => currentTime >= s.startTime && currentTime < s.endTime
  );

  // The active slot is either explicitly selected by user or the currently playing one
  const activeHighlightedIndex =
    selectedSlotIndex !== null ? selectedSlotIndex : currentPlayingIndex;

  // Handle clicking on the ruler or audio track to seek
  const handleSeekFromEvent = (clientX: number) => {
    if (!timelineContentRef.current || totalDuration <= 0) return;
    const rect = timelineContentRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const targetSeconds = Math.max(0, Math.min(totalDuration, clickX / pxPerSec));
    onSeek(Number(targetSeconds.toFixed(2)));
  };

  // Start dragging a junction/boundary between clip i and clip i+1 (mouse or touch)
  const handleStartBoundaryDrag = (clientX: number, slotIndex: number, e: React.SyntheticEvent) => {
    e.stopPropagation();
    setSelectedSlotIndex(slotIndex);
    setDragState({
      type: 'boundary',
      slotIndex,
      startX: clientX,
      accumulatedDelta: 0,
    });
    lastEmittedDeltaRef.current = 0;
  };

  // Start dragging the playhead cursor (mouse or touch)
  const handleStartPlayheadDrag = (clientX: number, e: React.SyntheticEvent) => {
    e.stopPropagation();
    setDragState({
      type: 'playhead',
      startX: clientX,
      accumulatedDelta: 0,
    });
  };

  // Drag interaction with Mouse and Touch event listeners
  useEffect(() => {
    if (!dragState) return;

    let rafId: number;

    const getClientX = (e: MouseEvent | TouchEvent): number => {
      if ('touches' in e && e.touches.length > 0) {
        return e.touches[0].clientX;
      }
      return (e as MouseEvent).clientX;
    };

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      // Prevent screen scrolling while dragging junction or playhead
      if (e.cancelable) {
        e.preventDefault();
      }

      const clientX = getClientX(e);

      rafId = requestAnimationFrame(() => {
        if (!timelineContentRef.current) return;

        if (dragState.type === 'playhead') {
          const rect = timelineContentRef.current.getBoundingClientRect();
          const targetX = clientX - rect.left;
          const targetSeconds = Math.max(0, Math.min(totalDuration, targetX / pxPerSec));
          onSeek(Number(targetSeconds.toFixed(2)));
        } else if (dragState.type === 'boundary' && dragState.slotIndex !== undefined) {
          const deltaX = clientX - dragState.startX;
          const deltaSec = deltaX / pxPerSec;
          const incrementalDelta = deltaSec - lastEmittedDeltaRef.current;

          // Emit when movement exceeds ~0.08s
          if (Math.abs(incrementalDelta) >= 0.08) {
            onMoveBoundary(dragState.slotIndex, incrementalDelta);
            lastEmittedDeltaRef.current = deltaSec;

            const slotA = slots[dragState.slotIndex];
            const slotB = slots[dragState.slotIndex + 1];
            if (slotA) {
              const info = slotB
                ? `Corte: ${slotA.endTime.toFixed(1)}s (Clip ${dragState.slotIndex + 1}: ${slotA.duration.toFixed(1)}s | Clip ${dragState.slotIndex + 2}: ${slotB.duration.toFixed(1)}s)`
                : `Final de clip: ${slotA.endTime.toFixed(1)}s (${slotA.duration.toFixed(1)}s)`;
              setDragTooltip(info);
            }
          }
        }
      });
    };

    const handlePointerEnd = () => {
      setDragState(null);
      setDragTooltip(null);
      cancelAnimationFrame(rafId);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerEnd);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerEnd);
    window.addEventListener('touchcancel', handlePointerEnd);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerEnd);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerEnd);
      window.removeEventListener('touchcancel', handlePointerEnd);
      cancelAnimationFrame(rafId);
    };
  }, [dragState, pxPerSec, totalDuration, onSeek, onMoveBoundary, slots]);

  // Keep slots within active duration
  const activeSlots = slots.filter((s) => s.startTime < totalDuration + 1.0);

  // Time ruler ticks
  const tickInterval = pxPerSec >= 50 ? 2 : 5;
  const tickCount = Math.ceil(totalDuration / tickInterval) + 1;

  return (
    <section
      id="generated-linear-track-editor"
      className="w-full bg-neutral-900/95 border border-neutral-800 rounded-2xl p-3 sm:p-4 shadow-2xl space-y-3"
    >
      {/* Header and Controls - Highly Mobile Responsive */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 flex-shrink-0">
            <Film className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2 flex-wrap">
              Línea de Tiempo Multimodal
              <span className="text-[10px] font-medium text-amber-300 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 font-mono">
                Escala 1:1
              </span>
            </h3>
            <p className="text-[11px] text-neutral-400 leading-snug">
              Toca un clip para seleccionarlo. Arrastra su barra lateral derecha para mover el corte con el siguiente clip.
            </p>
          </div>
        </div>

        {/* Playback Controls and Zoom - Mobile Touch Friendly */}
        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          {/* Zoom Buttons with 36px+ Touch Target */}
          <div className="flex items-center bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-xs shadow-inner">
            <button
              type="button"
              onClick={() => setPxPerSec((prev) => Math.max(28, prev - 8))}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-amber-300 active:bg-neutral-800 transition-colors"
              title="Alejar Zoom horizontal"
              aria-label="Alejar Zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="font-mono text-[10px] text-neutral-400 px-2 select-none">
              {pxPerSec}px/s
            </span>
            <button
              type="button"
              onClick={() => setPxPerSec((prev) => Math.min(84, prev + 8))}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-amber-300 active:bg-neutral-800 transition-colors"
              title="Acercar Zoom horizontal"
              aria-label="Acercar Zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Play / Pause Button with minimum 38px height */}
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition-transform active:scale-95 shadow-md shadow-amber-500/10 min-h-[38px]"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-neutral-950" />
                <span>Pausar</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-neutral-950 translate-x-0.5" />
                <span>Reproducir</span>
              </>
            )}
          </button>

          {/* Current Time Badge */}
          <div className="flex items-center gap-1.5 font-mono text-xs bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-800 min-h-[38px]">
            <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span className="text-amber-300 font-bold">{formatTime(currentTime)}</span>
            <span className="text-neutral-600">/</span>
            <span className="text-neutral-400">{formatTime(totalDuration)}</span>
          </div>
        </div>
      </div>

      {/* Floating Active Drag Tooltip */}
      {dragTooltip && (
        <div className="bg-amber-500 text-neutral-950 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xl border border-amber-300 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-100">
          <ArrowLeftRight className="w-4 h-4" />
          <span>{dragTooltip}</span>
        </div>
      )}

      {/* Single Scrollable Multi-Track Timeline Container */}
      <div
        ref={containerRef}
        className="w-full bg-neutral-950 rounded-xl border border-neutral-800/90 overflow-x-auto overflow-y-hidden select-none scrollbar-thin shadow-inner touch-pan-x"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div
          ref={timelineContentRef}
          style={{ width: `${timelineWidth}px` }}
          className="relative flex flex-col py-2 px-3 select-none"
        >
          {/* TRACK 0: Time Ruler & Grid Marks */}
          <div
            onClick={(e) => handleSeekFromEvent(e.clientX)}
            onTouchStart={(e) => handleSeekFromEvent(e.touches[0].clientX)}
            className="relative h-6 w-full border-b border-neutral-800/80 cursor-pointer group mb-1.5"
            title="Haz clic o toca en la regla para posicionar el cabezal"
          >
            {Array.from({ length: tickCount }).map((_, i) => {
              const tickSec = i * tickInterval;
              const leftPx = tickSec * pxPerSec;
              return (
                <div
                  key={`tick-${tickSec}`}
                  style={{ left: `${leftPx}px` }}
                  className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none"
                >
                  <span className="text-[9px] font-mono text-neutral-500 font-medium leading-none">
                    {formatTime(tickSec)}
                  </span>
                  <div className="w-[1px] h-2 bg-neutral-700 mt-1" />
                </div>
              );
            })}
          </div>

          {/* TRACK 1: Visual Media Track (Fotos y Vídeos) - Height 92px for clear spacing */}
          <div className="relative h-[92px] w-full bg-neutral-900/60 rounded-lg border border-neutral-800/80 mb-2 overflow-hidden">
            {/* Track label watermark */}
            <div className="absolute top-1 left-2 z-0 flex items-center gap-1.5 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider pointer-events-none">
              <ImageIcon className="w-3 h-3 text-amber-400/80" />
              Pista Visual (Fotos y Vídeos)
            </div>

            {/* Clips placed along linear timeline with exact contiguous placement */}
            {activeSlots.map((slot, idx) => {
              const media = loadedMedia[slot.mediaIndex % (loadedMedia.length || 1)];
              const isVideo = media?.type === 'video';
              const isSelected = activeHighlightedIndex === idx;
              const isCurrentPlaying = currentPlayingIndex === idx;

              // Calculate start pixel and width in direct proportion to duration
              const clipLeft = slot.startTime * pxPerSec;
              const clipWidth = Math.max(44, (slot.endTime - slot.startTime) * pxPerSec);

              const thumbnailSrc =
                media?.frameImages?.[0]?.src ||
                media?.imageElement?.src ||
                media?.url;

              // Only show the draggable junction handle if this slot is selected or being dragged
              const showDragHandle =
                isSelected ||
                (dragState?.type === 'boundary' && dragState.slotIndex === idx);

              return (
                <div
                  key={`slot-${slot.index}-${idx}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSlotIndex(idx);
                    onSeek(slot.startTime);
                  }}
                  style={{
                    left: `${clipLeft}px`,
                    width: `${clipWidth}px`,
                  }}
                  className={`absolute top-1 bottom-1 rounded-md flex flex-col justify-between overflow-hidden cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-amber-500/15 border-2 border-amber-400 ring-2 ring-amber-400/30 z-20 shadow-lg'
                      : isCurrentPlaying
                      ? 'bg-neutral-850 border border-amber-500/60 z-10'
                      : 'bg-neutral-900 border border-neutral-800 hover:border-neutral-700 z-0'
                  }`}
                >
                  {/* Subtle Background Thumbnail */}
                  {thumbnailSrc && (
                    <img
                      src={thumbnailSrc}
                      alt={media?.id || 'Media'}
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none"
                    />
                  )}

                  {/* Dark gradient overlay for clear text contrast */}
                  <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/80 via-transparent to-neutral-950/90 pointer-events-none" />

                  {/* Clip Header: Badge, Title & Mobile-Friendly Reorder Buttons (< and >) */}
                  <div className="relative z-10 flex items-center justify-between px-1.5 pt-1 gap-1">
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex items-center gap-1 leading-none ${
                        isVideo
                          ? 'bg-purple-500/30 text-purple-200 border border-purple-500/40'
                          : 'bg-amber-500/30 text-amber-200 border border-amber-500/40'
                      }`}
                    >
                      {isVideo ? <Film className="w-2.5 h-2.5" /> : <ImageIcon className="w-2.5 h-2.5" />}
                      #{idx + 1}
                    </span>

                    {/* Reorder Buttons (< and >): Enlarged for effortless mobile tap */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSlotIndex(idx - 1);
                          onReorderSlots(idx, idx - 1);
                        }}
                        className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center rounded-md bg-neutral-950/90 hover:bg-neutral-800 active:bg-amber-500/20 border border-neutral-700/80 disabled:opacity-20 text-neutral-200 hover:text-amber-300 transition-colors shadow-xs"
                        title="Mover clip hacia la izquierda"
                        aria-label="Mover a la izquierda"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        disabled={idx === activeSlots.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSlotIndex(idx + 1);
                          onReorderSlots(idx, idx + 1);
                        }}
                        className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center rounded-md bg-neutral-950/90 hover:bg-neutral-800 active:bg-amber-500/20 border border-neutral-700/80 disabled:opacity-20 text-neutral-200 hover:text-amber-300 transition-colors shadow-xs"
                        title="Mover clip hacia la derecha"
                        aria-label="Mover a la derecha"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Center info: Clean duration and time range */}
                  <div className="relative z-10 flex-1 flex flex-col justify-center items-center px-1 pb-1">
                    <span className="font-mono text-[11px] text-amber-300 font-bold drop-shadow-xs leading-none">
                      {slot.duration.toFixed(1)}s
                    </span>
                    <span className="text-[8px] font-mono text-neutral-400 mt-0.5">
                      {slot.startTime.toFixed(1)}s - {slot.endTime.toFixed(1)}s
                    </span>
                  </div>

                  {/* DRAGGABLE JUNCTION / BOUNDARY HANDLE ON RIGHT EDGE */}
                  {/* Rendered ONLY on the selected clip to eliminate visual clutter and overlap */}
                  {showDragHandle && (
                    <div
                      onMouseDown={(e) => handleStartBoundaryDrag(e.clientX, idx, e)}
                      onTouchStart={(e) =>
                        handleStartBoundaryDrag(e.touches[0].clientX, idx, e)
                      }
                      className="absolute top-0 bottom-0 right-0 w-5 bg-transparent hover:bg-amber-400/20 cursor-col-resize flex items-center justify-center group/handle z-30 touch-none"
                      title="Arrastra para mover el punto de corte con el clip siguiente"
                    >
                      <div className="w-[3px] h-full bg-amber-400 shadow-md shadow-amber-500/50" />
                      <div className="absolute w-4 h-6 bg-amber-500 rounded-md flex items-center justify-center shadow-md border border-amber-200">
                        <GripVertical className="w-3 h-3 text-neutral-950" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* TRACK 2: Audio & Speech Track (Locución poética y música) */}
          <div
            onClick={(e) => handleSeekFromEvent(e.clientX)}
            onTouchStart={(e) => handleSeekFromEvent(e.touches[0].clientX)}
            className="relative h-20 w-full bg-neutral-900/60 rounded-lg border border-neutral-800/80 overflow-hidden cursor-crosshair group"
            title="Haz clic o toca en cualquier punto de la pista de audio para posicionar la reproducción"
          >
            {/* Track label watermark */}
            <div className="absolute top-1 left-2 z-0 flex items-center gap-1.5 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider pointer-events-none">
              <Music className="w-3 h-3 text-amber-400/80" />
              Pista de Audio & Locución (Subtítulos y Pausas)
            </div>

            {/* Stylized background waveform bars across linear time */}
            <div className="absolute inset-0 flex items-end gap-[2px] px-1 pointer-events-none opacity-30">
              {Array.from({ length: Math.ceil(timelineWidth / 5) }).map((_, i) => {
                const heightPct = 15 + Math.abs(Math.sin(i * 0.35) * 55 + Math.cos(i * 0.9) * 20);
                return (
                  <div
                    key={i}
                    style={{ height: `${heightPct}%`, width: '3px' }}
                    className="bg-amber-400/70 rounded-t-xs flex-shrink-0"
                  />
                );
              })}
            </div>

            {/* Subtitle / Speech blocks positioned at their exact seconds */}
            {subtitles.map((cue, idx) => {
              const cueLeft = cue.startTime * pxPerSec;
              const cueWidth = Math.max(24, (cue.endTime - cue.startTime) * pxPerSec);
              const isActive = currentTime >= cue.startTime && currentTime <= cue.endTime;

              return (
                <div
                  key={cue.id}
                  style={{
                    left: `${cueLeft}px`,
                    width: `${cueWidth}px`,
                  }}
                  className={`absolute top-5 bottom-1 rounded-md border px-1.5 py-0.5 overflow-hidden transition-all pointer-events-none ${
                    isActive
                      ? 'bg-amber-500/35 border-amber-400 shadow-sm'
                      : 'bg-neutral-900/90 border-neutral-700/80'
                  }`}
                >
                  <div className="text-[9px] font-mono text-amber-300 font-semibold truncate leading-none mb-0.5">
                    #{idx + 1} ({cue.startTime.toFixed(1)}s)
                  </div>
                  <div className="text-[9px] text-neutral-300 truncate font-serif italic leading-tight">
                    {cue.text}
                  </div>
                </div>
              );
            })}
          </div>

          {/* GLOBAL LINEAR PLAYHEAD CURSOR SPANNING BOTH TRACKS */}
          {totalDuration > 0 && (
            <div
              style={{
                left: `${currentTime * pxPerSec + 12}px`,
              }}
              className="absolute top-2 bottom-2 w-[2px] bg-rose-500 shadow-md shadow-rose-500/60 pointer-events-none z-40 transition-none"
            >
              {/* Playhead handle at top: Enlarged for comfortable touch grabbing on mobile */}
              <div
                onMouseDown={(e) => handleStartPlayheadDrag(e.clientX, e)}
                onTouchStart={(e) => handleStartPlayheadDrag(e.touches[0].clientX, e)}
                className="absolute -top-3 -left-3 w-6 h-6 bg-rose-500 rounded-full border-2 border-white shadow-xl pointer-events-auto cursor-ew-resize flex items-center justify-center hover:scale-110 active:scale-125 transition-transform touch-none"
                title={`Cabezal: ${currentTime.toFixed(2)}s (Arrastra para desplazarte)`}
              >
                <div className="w-1.5 h-1.5 bg-white rounded-full" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Instructions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] text-neutral-500 gap-1 px-1">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span>
            <strong>En móvil o escritorio:</strong> Toca cualquier fotografía o vídeo para seleccionarlo y arrastra su barra amarilla lateral para ajustar la unión.
          </span>
        </span>
        <span className="font-mono text-neutral-400 self-end sm:self-auto">
          Tiempo actual: <strong className="text-amber-400">{currentTime.toFixed(2)}s</strong>
        </span>
      </div>
    </section>
  );
};
