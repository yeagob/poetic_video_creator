import React, { useRef, useState } from 'react';
import {
  Image as ImageIcon,
  ImageOff,
  Upload,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Plus,
  Sparkles,
  Video,
  GripVertical,
} from 'lucide-react';
import { ImageItem } from '../types';
import { PRESET_IMAGE_COLLECTIONS } from '../data/presets';

interface ImagesSectionProps {
  images: ImageItem[];
  onChangeImages: (newImages: ImageItem[]) => void;
  imagesEnabled?: boolean;
  onChangeImagesEnabled?: (enabled: boolean) => void;
}

export const ImagesSection: React.FC<ImagesSectionProps> = ({
  images,
  onChangeImages,
  imagesEnabled = true,
  onChangeImagesEnabled,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isProcessingUpload, setIsProcessingUpload] = useState<boolean>(false);
  const [uploadStatusText, setUploadStatusText] = useState<string | null>(null);

  // Client-side fallback extraction if server-side FFmpeg is unavailable
  const extractVideoFramesClientSide = (
    file: File,
    url: string
  ): Promise<{ duration: number; thumbnailUrl: string; frames: string[]; fps: number }> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.src = url;
      video.muted = true;
      video.playsInline = true;

      let resolved = false;
      const fallback = () => {
        if (!resolved) {
          resolved = true;
          resolve({ duration: 5.0, thumbnailUrl: '', frames: [], fps: 10 });
        }
      };

      video.onloadedmetadata = async () => {
        try {
          const duration = Math.max(1.0, video.duration && isFinite(video.duration) ? video.duration : 5.0);
          const fps = Math.max(4, Math.min(10, Math.round(50 / duration)));
          const totalFrames = Math.max(4, Math.min(50, Math.round(duration * fps)));
          const frames: string[] = [];

          const canvas = document.createElement('canvas');
          canvas.width = Math.min(960, video.videoWidth || 960);
          canvas.height = Math.min(540, video.videoHeight || 540);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            fallback();
            return;
          }

          for (let i = 0; i < totalFrames; i++) {
            const targetTime = (i / totalFrames) * duration;
            video.currentTime = targetTime;
            await new Promise<void>((res) => {
              const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                res();
              };
              video.addEventListener('seeked', onSeeked, { once: true });
              setTimeout(res, 80);
            });
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push(canvas.toDataURL('image/jpeg', 0.8));
          }

          resolved = true;
          resolve({
            duration,
            thumbnailUrl: frames[0] || '',
            frames,
            fps,
          });
        } catch (err) {
          console.warn('[ImagesSection] Extracción local falló:', err);
          fallback();
        }
      };

      video.onerror = fallback;
      setTimeout(fallback, 8000);
    });
  };

  // Primary extractor: uses server FFmpeg for broadcast-quality frame extraction
  const extractVideoFramesAndMetadata = async (
    file: File,
    url: string
  ): Promise<{ duration: number; thumbnailUrl: string; frames: string[]; fps: number }> => {
    try {
      setUploadStatusText(`Extrayendo fotogramas con FFmpeg: ${file.name}...`);
      const formData = new FormData();
      formData.append('video', file);

      const resp = await fetch('/api/extract-video-frames', {
        method: 'POST',
        body: formData,
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.frames && data.frames.length > 0) {
          return {
            duration: data.duration || 5.0,
            thumbnailUrl: data.thumbnailUrl || data.frames[0],
            frames: data.frames,
            fps: data.fps || 12,
          };
        }
      } else {
        const errJson = await resp.json().catch(() => ({}));
        console.warn('[ImagesSection] FFmpeg servidor avisó:', errJson.error);
      }
    } catch (serverErr) {
      console.warn('[ImagesSection] Error contactando con /api/extract-video-frames, usando extractor local:', serverErr);
    }

    // Fallback to client-side extraction
    setUploadStatusText(`Procesando fotogramas localmente: ${file.name}...`);
    return extractVideoFramesClientSide(file, url);
  };

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsProcessingUpload(true);
    const fileArray = Array.from(files);
    const newItems: ImageItem[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const url = URL.createObjectURL(file);
      const id = `media-user-${Date.now()}-${i}`;

      if (file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mov|m4v|avi)$/i)) {
        const meta = await extractVideoFramesAndMetadata(file, url);
        newItems.push({
          id,
          name: file.name,
          url: meta.thumbnailUrl || url,
          type: 'video',
          duration: meta.duration,
          thumbnailUrl: meta.thumbnailUrl,
          frames: meta.frames,
          fps: meta.fps,
          file,
        });
      } else if (file.type.startsWith('image/')) {
        newItems.push({
          id,
          name: file.name,
          url,
          type: 'image',
          file,
        });
      }
    }

    setIsProcessingUpload(false);
    setUploadStatusText(null);
    if (newItems.length > 0) {
      onChangeImages([...images, ...newItems]);
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    onChangeImages(images.filter((_, idx) => idx !== indexToRemove));
  };

  const handleMoveImage = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const updated = [...images];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    onChangeImages(updated);
  };

  // Drag and Drop reordering
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${index}`);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const updated = [...images];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, movedItem);
    setDraggedIndex(null);
    onChangeImages(updated);
  };

  const videoCount = images.filter((img) => img.type === 'video').length;
  const imageCount = images.filter((img) => img.type !== 'video').length;

  return (
    <section className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-1.5 rounded-lg border transition-colors ${
              imagesEnabled
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-neutral-800 border-neutral-700 text-neutral-500'
            }`}
          >
            {imagesEnabled ? <ImageIcon className="w-4 h-4" /> : <ImageOff className="w-4 h-4" />}
          </div>
          <div>
            <h2 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
              4. Colección de Medios (Fotos y Vídeos)
              <span
                className={`text-xs font-normal px-2.5 py-0.5 rounded-full border ${
                  imagesEnabled
                    ? 'text-amber-400/90 bg-amber-500/10 border-amber-500/20'
                    : 'text-neutral-400 bg-neutral-800 border-neutral-700'
                }`}
              >
                {imagesEnabled
                  ? `${images.length} medios (${imageCount} fotos, ${videoCount} vídeos)`
                  : 'Medios Desactivados (OFF)'}
              </span>
            </h2>
            <p className="text-xs text-neutral-400">
              {imagesEnabled
                ? 'Arrastra para reordenar fácilmente. Los vídeos se reproducen íntegros y sin sonido propio (respetando la voz y música).'
                : 'Modo minimalista: Fondo poético ambiental cinemático con partículas y subtítulos.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Images On/Off Toggle Button */}
          {onChangeImagesEnabled && (
            <div className="flex items-center gap-2.5 bg-neutral-950/80 px-3.5 py-2 rounded-xl border border-neutral-800">
              <span className="text-xs font-medium text-neutral-300">
                {imagesEnabled ? 'Visual: ON' : 'Visual: OFF'}
              </span>
              <button
                type="button"
                id="toggle-images-button"
                onClick={() => onChangeImagesEnabled(!imagesEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  imagesEnabled ? 'bg-amber-500' : 'bg-neutral-800'
                }`}
                title={imagesEnabled ? 'Desactivar fotos y vídeos' : 'Activar fotos y vídeos'}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    imagesEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Upload Button */}
          {imagesEnabled && (
            <div className="flex flex-col items-end">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={(e) => handleUploadFiles(e.target.files)}
                className="hidden"
              />
              <button
                type="button"
                disabled={isProcessingUpload}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-medium transition-all disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isProcessingUpload ? 'Extrayendo fotogramas...' : 'Subir Fotos o Vídeos'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {uploadStatusText && (
        <div className="mb-4 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-center gap-2.5 text-amber-300 text-xs animate-pulse">
          <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <span>{uploadStatusText}</span>
        </div>
      )}

      {!imagesEnabled && (
        <div className="mb-4 p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800 flex items-center gap-3 text-neutral-300 text-xs">
          <ImageIcon className="w-5 h-5 text-amber-400 shrink-0" />
          <p>
            <strong className="text-amber-300">Modo de fondo cinemático activo:</strong> No se mostrarán fotografías ni vídeos. El reproductor y el vídeo generado utilizarán un elegante fondo celestial con auras de luz cálida y polvo estelar dinámico, destacando los versos y la música.
          </p>
        </div>
      )}

      <div className={!imagesEnabled ? 'opacity-40 pointer-events-none transition-opacity' : 'transition-opacity'}>
        {/* Preset Collections Chips */}
        <div className="mb-4 p-3 rounded-xl bg-neutral-950/40 border border-neutral-800/80 flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-400 flex items-center gap-1.5 mr-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Galerías Temáticas:
          </span>
          {PRESET_IMAGE_COLLECTIONS.map((col) => (
            <button
              key={col.name}
              type="button"
              onClick={() => onChangeImages(col.images)}
              className="text-xs px-2.5 py-1 rounded-md bg-neutral-800/80 hover:bg-neutral-800 hover:text-amber-300 text-neutral-300 border border-neutral-700/60 transition-colors"
            >
              {col.name} ({col.images.length})
            </button>
          ))}
        </div>

        {/* Media Strip / Grid */}
        {images.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-neutral-800 hover:border-amber-500/50 rounded-xl p-8 text-center cursor-pointer transition-colors bg-neutral-950/20"
          >
            <ImageIcon className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
            <p className="text-sm text-neutral-300 font-medium">
              Arrastra tus fotos o vídeos aquí o haz clic para seleccionarlos
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Sube fotos y vídeos en el mismo selector; puedes ordenarlos arrastrándolos fácilmente
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {images.map((img, idx) => {
              const isVideo = img.type === 'video';
              const isBeingDragged = draggedIndex === idx;

              return (
                <div
                  key={img.id}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                  onDragEnd={() => setDraggedIndex(null)}
                  className={`group relative rounded-xl overflow-hidden border bg-neutral-950 aspect-video shadow-md transition-all cursor-grab active:cursor-grabbing ${
                    isBeingDragged
                      ? 'border-amber-400 scale-95 opacity-50'
                      : 'border-neutral-800 hover:border-amber-500/60'
                  }`}
                  title="Arrastra para reordenar o usa los botones al pasar el ratón"
                >
                  {isVideo ? (
                    img.thumbnailUrl ? (
                      <img
                        src={img.thumbnailUrl}
                        alt={img.name}
                        className="w-full h-full object-cover pointer-events-none transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <video
                        src={img.url}
                        className="w-full h-full object-cover pointer-events-none"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    )
                  ) : (
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full h-full object-cover pointer-events-none transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  )}

                  {/* Drag Handle Icon (top right) */}
                  <div className="absolute top-2 right-2 p-1 rounded bg-neutral-950/70 text-neutral-400 group-hover:text-amber-300 pointer-events-none backdrop-blur-xs">
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>

                  {/* Order Badge & Media Type (top left) */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 pointer-events-none">
                    <div className="px-2 py-0.5 rounded-full bg-neutral-950/85 backdrop-blur-sm text-[11px] font-bold text-amber-400 border border-amber-500/30">
                      #{idx + 1}
                    </div>
                    {isVideo && (
                      <div className="px-2 py-0.5 rounded-full bg-amber-500 text-neutral-950 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                        <Video className="w-3 h-3" />
                        <span>{Math.round(img.duration || 0)}s</span>
                        {img.frames && img.frames.length > 0 && <span className="opacity-80 font-mono">•HD</span>}
                      </div>
                    )}
                  </div>

                  {/* Action Controls on Hover */}
                  <div className="absolute inset-0 bg-neutral-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-2 backdrop-blur-xs">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveImage(idx, 'left');
                      }}
                      className="p-1.5 rounded-md bg-neutral-800/90 text-neutral-200 hover:text-amber-300 disabled:opacity-30 disabled:hover:text-neutral-200 transition-colors"
                      title="Mover a la izquierda"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveImage(idx);
                      }}
                      className="p-1.5 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 transition-colors"
                      title="Eliminar elemento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === images.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveImage(idx, 'right');
                      }}
                      className="p-1.5 rounded-md bg-neutral-800/90 text-neutral-200 hover:text-amber-300 disabled:opacity-30 disabled:hover:text-neutral-200 transition-colors"
                      title="Mover a la derecha"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add more button */}
            <button
              type="button"
              disabled={isProcessingUpload}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border border-dashed border-neutral-800 hover:border-amber-500/50 bg-neutral-950/30 hover:bg-neutral-900/50 flex flex-col items-center justify-center p-3 text-neutral-400 hover:text-amber-300 transition-all aspect-video cursor-pointer"
            >
              <Plus className="w-5 h-5 mb-1" />
              <span className="text-xs font-medium">Añadir más fotos/vídeos</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
