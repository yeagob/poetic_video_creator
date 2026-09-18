import React from 'react';
import { Sliders, Clock, Volume2, Info, Shuffle, Sparkles } from 'lucide-react';
import { VideoProjectConfig } from '../types';

interface TimingAndMixingSectionProps {
  config: VideoProjectConfig;
  onChangeConfig: (newConfig: VideoProjectConfig) => void;
}

export const TimingAndMixingSection: React.FC<TimingAndMixingSectionProps> = ({
  config,
  onChangeConfig,
}) => {
  const baseScene = config.sceneDuration ?? 3.5;
  const minScene = config.minSceneDuration ?? Math.max(1, baseScene - 1);
  const maxScene = config.maxSceneDuration ?? Math.min(7, baseScene + 1.5);

  const minSilence = config.minSilence ?? 1.0;
  const maxSilence = config.maxSilence ?? 2.4;
  const fixedSilence = config.fixedSilenceDuration ?? 2.0;

  const handleMinSceneChange = (val: number) => {
    const newMin = Math.max(1.0, Math.min(20.0, val));
    const newMax = Math.max(newMin, maxScene);
    onChangeConfig({
      ...config,
      minSceneDuration: newMin,
      maxSceneDuration: newMax,
      sceneDuration: Number(((newMin + newMax) / 2).toFixed(1)),
    });
  };

  const handleMaxSceneChange = (val: number) => {
    const newMax = Math.max(1.0, Math.min(20.0, val));
    const newMin = Math.min(newMax, minScene);
    onChangeConfig({
      ...config,
      minSceneDuration: newMin,
      maxSceneDuration: newMax,
      sceneDuration: Number(((newMin + newMax) / 2).toFixed(1)),
    });
  };

  const handleMinSilenceChange = (val: number) => {
    const newMin = Math.max(0.5, Math.min(20.0, val));
    const newMax = Math.max(newMin, maxSilence);
    onChangeConfig({
      ...config,
      minSilence: newMin,
      maxSilence: newMax,
    });
  };

  const handleMaxSilenceChange = (val: number) => {
    const newMax = Math.max(0.5, Math.min(20.0, val));
    const newMin = Math.min(newMax, minSilence);
    onChangeConfig({
      ...config,
      minSilence: newMin,
      maxSilence: newMax,
    });
  };

  return (
    <section
      id="timing-mixing-section"
      className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-5 shadow-xl space-y-5"
    >
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
          <Sliders className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
            5. Tiempos de Escena, Pausas y Mezcla de Audio
            <span className="text-xs font-normal text-amber-400/90 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
              Hasta 20 Segundos
            </span>
          </h2>
          <p className="text-xs text-neutral-400">
            Configura el ritmo de las pausas de la narración y la permanencia de fotos/vídeos en pantalla (aleatorio o fijo), además de calibrar los volúmenes.
          </p>
        </div>
      </div>

      {/* Bloques de tiempos en paralelo con la misma estructura simétrica */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 1. Silencios y Pausas de la Narración */}
        <div className="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800/80 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                <Shuffle className="w-3.5 h-3.5 text-amber-400" />
                Silencios y Pausas (0.5 a 20 seg)
              </label>
              <span className="text-xs font-bold text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                {config.silenceTimingMode === 'fixed'
                  ? `${fixedSilence.toFixed(1)}s (Fijo)`
                  : `${minSilence.toFixed(1)}s - ${maxSilence.toFixed(1)}s (Random)`}
              </span>
            </div>

            {/* Mode Selector Toggle: Random vs Fixed */}
            <div className="flex rounded-lg bg-neutral-900 p-0.5 border border-neutral-800 text-xs mb-3">
              <button
                type="button"
                id="silence-mode-random"
                onClick={() => onChangeConfig({ ...config, silenceTimingMode: 'random' })}
                className={`flex-1 py-1.5 px-2 rounded-md font-medium transition-all ${
                  config.silenceTimingMode !== 'fixed'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Aleatorio (Random)
              </button>
              <button
                type="button"
                id="silence-mode-fixed"
                onClick={() => onChangeConfig({ ...config, silenceTimingMode: 'fixed' })}
                className={`flex-1 py-1.5 px-2 rounded-md font-medium transition-all ${
                  config.silenceTimingMode === 'fixed'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Tiempo Fijo
              </button>
            </div>

            <p className="text-[11px] text-neutral-400 mb-3">
              {config.silenceTimingMode === 'fixed'
                ? 'Cada verso tendrá una pausa exactamente uniforme del tiempo fijo seleccionado antes del siguiente.'
                : 'Cada verso genera una pausa aleatoria dentro de este rango para una cadencia poética natural y pausada.'}
            </p>
          </div>

          {config.silenceTimingMode === 'fixed' ? (
            <div className="space-y-2 pt-1">
              <div className="flex justify-between text-[11px] text-neutral-400">
                <span>Pausa Fija entre Versos:</span>
                <span className="font-mono text-amber-300 font-semibold">
                  {fixedSilence.toFixed(1)} seg
                </span>
              </div>
              <input
                id="fixed-silence-slider"
                type="range"
                min="0.5"
                max="20.0"
                step="0.5"
                value={fixedSilence}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    fixedSilenceDuration: parseFloat(e.target.value),
                  })
                }
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div>
                <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                  <span>Pausa Mínima:</span>
                  <span className="font-mono text-amber-300 font-semibold">{minSilence.toFixed(1)} seg</span>
                </div>
                <input
                  id="min-silence-slider"
                  type="range"
                  min="0.5"
                  max="20.0"
                  step="0.5"
                  value={minSilence}
                  onChange={(e) => handleMinSilenceChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                  <span>Pausa Máxima:</span>
                  <span className="font-mono text-amber-300 font-semibold">{maxSilence.toFixed(1)} seg</span>
                </div>
                <input
                  id="max-silence-slider"
                  type="range"
                  min="0.5"
                  max="20.0"
                  step="0.5"
                  value={maxSilence}
                  onChange={(e) => handleMaxSilenceChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* 2. Tiempo en Pantalla por Foto / Vídeo (1 a 20 seg) */}
        <div className="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800/80 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Tiempo en Pantalla (Fotos) (1 a 20 seg)
              </label>
              <span className="text-xs font-bold text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                {config.imageTimingMode === 'fixed'
                  ? `${(config.fixedSceneDuration ?? 4.0).toFixed(1)}s (Fijo)`
                  : `${minScene.toFixed(1)}s - ${maxScene.toFixed(1)}s (Random)`}
              </span>
            </div>

            {/* Mode Selector Toggle: Random vs Fixed */}
            <div className="flex rounded-lg bg-neutral-900 p-0.5 border border-neutral-800 text-xs mb-3">
              <button
                type="button"
                id="timing-mode-random"
                onClick={() => onChangeConfig({ ...config, imageTimingMode: 'random' })}
                className={`flex-1 py-1.5 px-2 rounded-md font-medium transition-all ${
                  config.imageTimingMode !== 'fixed'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Aleatorio (Random)
              </button>
              <button
                type="button"
                id="timing-mode-fixed"
                onClick={() => onChangeConfig({ ...config, imageTimingMode: 'fixed' })}
                className={`flex-1 py-1.5 px-2 rounded-md font-medium transition-all ${
                  config.imageTimingMode === 'fixed'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Tiempo Fijo
              </button>
            </div>

            <p className="text-[11px] text-neutral-400 mb-3">
              {config.imageTimingMode === 'fixed'
                ? 'Todas las fotos durarán exactamente los segundos fijados. Los vídeos siempre se reproducen con su duración completa.'
                : 'Cada foto permanecerá un tiempo aleatorio en este rango (hasta 20s). Los vídeos siempre se reproducen completos.'}
            </p>
          </div>

          {config.imageTimingMode === 'fixed' ? (
            <div className="space-y-2 pt-1">
              <div className="flex justify-between text-[11px] text-neutral-400">
                <span>Duración Fija por Foto:</span>
                <span className="font-mono text-amber-300 font-semibold">
                  {(config.fixedSceneDuration ?? 4.0).toFixed(1)} seg
                </span>
              </div>
              <input
                id="fixed-scene-slider"
                type="range"
                min="1.0"
                max="20.0"
                step="0.5"
                value={config.fixedSceneDuration ?? 4.0}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    fixedSceneDuration: parseFloat(e.target.value),
                    sceneDuration: parseFloat(e.target.value),
                  })
                }
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div>
                <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                  <span>Tiempo Mínimo en Escena:</span>
                  <span className="font-mono text-amber-300 font-semibold">{minScene.toFixed(1)} seg</span>
                </div>
                <input
                  id="min-scene-slider"
                  type="range"
                  min="1.0"
                  max="20.0"
                  step="0.5"
                  value={minScene}
                  onChange={(e) => handleMinSceneChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                  <span>Tiempo Máximo en Escena:</span>
                  <span className="font-mono text-amber-300 font-semibold">{maxScene.toFixed(1)} seg</span>
                </div>
                <input
                  id="max-scene-slider"
                  type="range"
                  min="1.0"
                  max="20.0"
                  step="0.5"
                  value={maxScene}
                  onChange={(e) => handleMaxSceneChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Sección de Calibración de Volúmenes - Justo debajo ocupando todo el ancho */}
      <div className="w-full p-5 rounded-xl bg-neutral-950/80 border border-neutral-800 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-neutral-800/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-200">
                Calibración de Volúmenes (Mezcla Maestra de Audio)
              </h3>
              <p className="text-[11px] text-neutral-400">
                Ajuste directo de los nodos Web Audio para un equilibrio perfecto entre la voz y la atmósfera musical.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-end sm:self-auto bg-neutral-900 px-3 py-1 rounded-lg border border-neutral-800 font-mono text-xs">
            <span className="text-neutral-400">
              Voz: <strong className="text-amber-400">{Math.round(config.speechVolume * 100)}%</strong>
            </span>
            <span className="text-neutral-700">|</span>
            <span className="text-neutral-400">
              Música: <strong className="text-amber-400">{Math.round(config.musicVolume * 100)}%</strong>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
          {/* Volumen Voz Poética */}
          <div className="p-3.5 rounded-xl bg-neutral-900/50 border border-neutral-800/60 space-y-2">
            <div className="flex justify-between text-xs text-neutral-200">
              <span className="font-medium flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                Volumen Voz Poética (Speech)
              </span>
              <span className="font-mono text-amber-300 font-bold text-xs bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                {Math.round(config.speechVolume * 100)}%
              </span>
            </div>
            <input
              id="speech-volume-slider"
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={config.speechVolume}
              onChange={(e) =>
                onChangeConfig({
                  ...config,
                  speechVolume: parseFloat(e.target.value),
                })
              }
              className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
              <span>10% (Suave)</span>
              <span>100% (Máxima Presencia)</span>
            </div>
          </div>

          {/* Volumen Música de Fondo */}
          <div className="p-3.5 rounded-xl bg-neutral-900/50 border border-neutral-800/60 space-y-2">
            <div className="flex justify-between text-xs text-neutral-200">
              <span className="font-medium flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                Volumen Música de Fondo (Background Pad)
              </span>
              <span className="font-mono text-amber-300 font-bold text-xs bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                {Math.round(config.musicVolume * 100)}%
              </span>
            </div>
            <input
              id="music-volume-slider"
              type="range"
              min="0.05"
              max="1.0"
              step="0.05"
              value={config.musicVolume}
              onChange={(e) =>
                onChangeConfig({
                  ...config,
                  musicVolume: parseFloat(e.target.value),
                })
              }
              className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
              <span>5% (Apenas perceptible)</span>
              <span>100% (Pleno ambiente)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Synchronized Block Generation Rule Notification */}
      <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-neutral-300 leading-relaxed">
          <span className="font-semibold text-amber-300">Generación por Bloques Sincronizados:</span> Cada salto de línea
          en tu texto se procesa como un bloque de TTS independiente y genera un bloque de subtítulos que dura con precisión
          exacta lo que dura ese bloque de voz. Entre cada verso se insertará un silencio aleatorio dentro de tu rango seleccionado.
        </div>
      </div>
    </section>
  );
};
