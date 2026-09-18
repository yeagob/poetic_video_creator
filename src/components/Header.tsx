import React from 'react';
import { Sparkles, Video, Volume2 } from 'lucide-react';

interface HeaderProps {
  onLoadSample: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onLoadSample }) => {
  return (
    <header className="border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-neutral-900 border border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/5">
            <Video className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold font-cinzel tracking-wide text-neutral-100 flex items-center gap-2">
              Poetic Videoclip <span className="text-amber-400 text-lg">Studio</span>
            </h1>
            <p className="text-xs text-neutral-400 font-sans-ui hidden sm:block">
              Generador cinematográfico de videoclips con TTS poético, música, transiciones y subtítulos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onLoadSample}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-medium border border-neutral-700/70 transition-all hover:border-amber-500/40 active:scale-95 shadow-sm"
            title="Cargar texto poético, música y colección de fotos de ejemplo"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Cargar Ejemplo Completo</span>
          </button>
        </div>
      </div>
    </header>
  );
};
