import React from 'react';
import { AlignLeft, BookOpen, Sparkles } from 'lucide-react';
import { SAMPLE_TEXTS } from '../data/presets';

interface TextInputSectionProps {
  text: string;
  onChangeText: (newText: string) => void;
}

export const TextInputSection: React.FC<TextInputSectionProps> = ({ text, onChangeText }) => {
  const wordsCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  // Estimated poetic speech duration: approx 110-120 words per minute (with dramatic pauses)
  const estSeconds = Math.max(3, Math.round((wordsCount / 115) * 60));

  return (
    <section className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <AlignLeft className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
              1. Texto Poético / Discurso
              <span className="text-xs font-normal text-amber-400/90 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                Define la duración del vídeo
              </span>
            </h2>
            <p className="text-xs text-neutral-400">
              Escribe o pega los versos que la voz TTS declamará mientras se muestran los subtítulos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="px-2 py-1 rounded bg-neutral-800/80 border border-neutral-700/50">
            {wordsCount} palabras
          </span>
          <span className="px-2 py-1 rounded bg-neutral-800/80 border border-neutral-700/50 text-amber-300">
            ~{estSeconds}s de locución
          </span>
        </div>
      </div>

      <div className="relative">
        <textarea
          id="poetic-text-input"
          value={text}
          onChange={(e) => onChangeText(e.target.value)}
          rows={5}
          placeholder="Escribe aquí los versos poéticos, líricas o reflexiones que serán narrados..."
          className="w-full bg-neutral-950/80 border border-neutral-800 rounded-xl p-3.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/50 transition-all font-playfair leading-relaxed resize-y"
        />
      </div>

      {/* Preset poem chips */}
      <div className="mt-3 pt-3 border-t border-neutral-800/60 flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-400 flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5 text-amber-400" />
          Inspiración poética:
        </span>
        {SAMPLE_TEXTS.map((sample) => (
          <button
            key={sample.title}
            type="button"
            onClick={() => onChangeText(sample.text)}
            className="text-xs px-2.5 py-1 rounded-md bg-neutral-800/70 hover:bg-neutral-800 hover:text-amber-300 text-neutral-300 border border-neutral-700/60 transition-colors flex items-center gap-1"
          >
            <Sparkles className="w-2.5 h-2.5 text-amber-400/80" />
            {sample.title}
          </button>
        ))}
      </div>
    </section>
  );
};
