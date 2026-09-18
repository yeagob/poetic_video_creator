import React, { useRef, useState } from 'react';
import { Music, Upload, Play, Square, Volume2, Sparkles, Check, FileAudio } from 'lucide-react';
import { MusicTrack } from '../types';
import { PRESET_MUSIC_TRACKS } from '../data/presets';
import { generateAtmosphericMusicBuffer, getAudioContext } from '../utils/audioSynthesizer';

interface MusicSectionProps {
  selectedTrack: MusicTrack;
  onSelectTrack: (track: MusicTrack) => void;
  musicEnabled?: boolean;
  onChangeMusicEnabled?: (enabled: boolean) => void;
}

export const MusicSection: React.FC<MusicSectionProps> = ({
  selectedTrack,
  onSelectTrack,
  musicEnabled = true,
  onChangeMusicEnabled,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);

  // Web Audio preview node ref
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stopPreview = () => {
    if (previewSourceRef.current) {
      try {
        previewSourceRef.current.stop();
        previewSourceRef.current.disconnect();
      } catch {
        // Ignored
      }
      previewSourceRef.current = null;
    }
    setIsPlayingPreview(false);
    setPreviewTrackId(null);
  };

  const handleTogglePreview = async (track: MusicTrack) => {
    if (isPlayingPreview && previewTrackId === track.id) {
      stopPreview();
      return;
    }

    stopPreview();

    try {
      const ctx = getAudioContext();
      let buffer: AudioBuffer;

      if (track.type === 'custom' && track.file) {
        const arrayBuffer = await track.file.arrayBuffer();
        buffer = await ctx.decodeAudioData(arrayBuffer);
      } else {
        // Generate or fetch procedural sample
        buffer = await generateAtmosphericMusicBuffer(track.id, 20);
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setIsPlayingPreview(false);
        setPreviewTrackId(null);
      };
      source.start();

      previewSourceRef.current = source;
      setIsPlayingPreview(true);
      setPreviewTrackId(track.id);
    } catch (err) {
      console.error('Error al reproducir vista previa de música:', err);
      setIsPlayingPreview(false);
      setPreviewTrackId(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopPreview();
    const customTrack: MusicTrack = {
      id: `custom-track-${Date.now()}`,
      name: file.name.replace(/\.[^/.]+$/, ''),
      artist: 'Canción Adjuntada por el Usuario',
      category: 'Audio Personalizado',
      type: 'custom',
      file: file,
      url: URL.createObjectURL(file),
    };

    onSelectTrack(customTrack);
  };

  return (
    <section className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-1.5 rounded-lg border transition-colors ${
              musicEnabled
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-neutral-800 border-neutral-700 text-neutral-500'
            }`}
          >
            <Music className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
              3. Música de Fondo
              <span
                className={`text-xs font-normal px-2.5 py-0.5 rounded-full border ${
                  musicEnabled
                    ? 'text-amber-400/90 bg-amber-500/10 border-amber-500/20'
                    : 'text-neutral-400 bg-neutral-800 border-neutral-700'
                }`}
              >
                {musicEnabled ? 'Música Activada (ON)' : 'Música Desactivada (OFF)'}
              </span>
            </h2>
            <p className="text-xs text-neutral-400">
              {musicEnabled
                ? 'Sube tu propia canción o elige una composición atmosférica orquestal o de piano.'
                : 'Música apagada: El videoclip no contendrá música de fondo.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Music On/Off Toggle Button */}
          {onChangeMusicEnabled && (
            <div className="flex items-center gap-2.5 bg-neutral-950/80 px-3.5 py-2 rounded-xl border border-neutral-800">
              <span className="text-xs font-medium text-neutral-300">
                {musicEnabled ? 'Música: Sí' : 'Música: No'}
              </span>
              <button
                type="button"
                id="toggle-music-button"
                onClick={() => {
                  stopPreview();
                  onChangeMusicEnabled(!musicEnabled);
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  musicEnabled ? 'bg-amber-500' : 'bg-neutral-800'
                }`}
                title={musicEnabled ? 'Desactivar música de fondo' : 'Activar música de fondo'}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    musicEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Upload Custom File Button */}
          {musicEnabled && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-medium transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Subir Mi Canción</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {!musicEnabled && (
        <div className="mb-4 p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800 flex items-center gap-3 text-neutral-300 text-xs">
          <Volume2 className="w-5 h-5 text-neutral-500 shrink-0" />
          <p>
            <strong className="text-neutral-200">Música desactivada:</strong> El videoclip se creará en silencio de fondo o solo con voz y subtítulos.
          </p>
        </div>
      )}

      <div className={!musicEnabled ? 'opacity-40 pointer-events-none transition-opacity' : 'transition-opacity'}>
        {/* Selected custom track banner if active */}
      {selectedTrack.type === 'custom' && (
        <div className="mb-3.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300">
              <FileAudio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-300">Canción Personalizada:</span>
                <span className="text-xs text-neutral-200 font-medium">{selectedTrack.name}</span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Archivo de audio cargado correctamente para la mezcla con la voz.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleTogglePreview(selectedTrack)}
            className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-300 border border-neutral-700 transition-colors"
            title="Escuchar audio"
          >
            {isPlayingPreview && previewTrackId === selectedTrack.id ? (
              <Square className="w-4 h-4 fill-amber-400" />
            ) : (
              <Play className="w-4 h-4 fill-amber-400" />
            )}
          </button>
        </div>
      )}

      {/* Preset Tracks Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {PRESET_MUSIC_TRACKS.map((track) => {
          const isSelected = selectedTrack.id === track.id;
          const isPlayingThis = isPlayingPreview && previewTrackId === track.id;

          return (
            <div
              key={track.id}
              className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${
                isSelected
                  ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/40'
                  : 'bg-neutral-950/50 border-neutral-800/80 hover:border-neutral-700'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-1 mb-1.5">
                  <span className="text-xs font-semibold text-neutral-100 line-clamp-1">
                    {track.name}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                </div>
                <p className="text-[11px] text-neutral-400 mb-2">{track.category}</p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-neutral-800/60 mt-1">
                <button
                  type="button"
                  onClick={() => onSelectTrack(track)}
                  className={`text-[11px] px-2 py-0.5 rounded font-medium transition-colors ${
                    isSelected
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                  }`}
                >
                  {isSelected ? 'Seleccionada' : 'Seleccionar'}
                </button>

                <button
                  type="button"
                  onClick={() => handleTogglePreview(track)}
                  className="p-1.5 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-amber-300 transition-colors"
                  title="Escuchar muestra"
                >
                  {isPlayingThis ? (
                    <Square className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-neutral-400 hover:fill-amber-300" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </section>
  );
};
