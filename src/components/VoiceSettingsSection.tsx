import React from 'react';
import { Mic, MicOff, User, Sparkles, CheckCircle2, VolumeX, Award } from 'lucide-react';
import { VoiceGender, VoicePreset } from '../types';
import {
  INTONATION_OPTIONS,
  RECOMMENDED_MALE_VOICES,
  RECOMMENDED_FEMALE_VOICES,
} from '../data/presets';

interface VoiceSettingsSectionProps {
  gender: VoiceGender;
  onChangeGender: (gender: VoiceGender) => void;
  presetVoice: string;
  onChangePresetVoice: (voice: string) => void;
  intonation: string;
  onChangeIntonation: (intonation: string) => void;
  voiceEnabled?: boolean;
  onChangeVoiceEnabled?: (enabled: boolean) => void;
}

export const VoiceSettingsSection: React.FC<VoiceSettingsSectionProps> = ({
  gender,
  onChangeGender,
  presetVoice,
  onChangePresetVoice,
  intonation,
  onChangeIntonation,
  voiceEnabled = true,
  onChangeVoiceEnabled,
}) => {
  const activePresets: VoicePreset[] =
    gender === 'male' ? RECOMMENDED_MALE_VOICES : RECOMMENDED_FEMALE_VOICES;

  const currentPreset =
    activePresets.find((p) => p.geminiVoice === presetVoice) || activePresets[0];

  return (
    <section className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-1.5 rounded-lg border transition-colors ${
              voiceEnabled
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-neutral-800 border-neutral-700 text-neutral-500'
            }`}
          >
            {voiceEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </div>
          <div>
            <h2 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
              2. Configuración de Voz y Locución
              <span
                className={`text-xs font-normal px-2.5 py-0.5 rounded-full border ${
                  voiceEnabled
                    ? 'text-amber-400/90 bg-amber-500/10 border-amber-500/20'
                    : 'text-neutral-400 bg-neutral-800 border-neutral-700'
                }`}
              >
                {voiceEnabled ? 'Voz Activada (ON)' : 'Solo Música y Subtítulos (OFF)'}
              </span>
            </h2>
            <p className="text-xs text-neutral-400">
              {voiceEnabled
                ? 'Elige voz masculina o femenina con presets recomendados para español y dicción poética.'
                : 'Locución apagada: Disfruta del vídeo solo con música ambiental y subtítulos sincronizados.'}
            </p>
          </div>
        </div>

        {/* On/Off Toggle Button */}
        {onChangeVoiceEnabled && (
          <div className="flex items-center gap-2.5 bg-neutral-950/80 px-3.5 py-2 rounded-xl border border-neutral-800">
            <span className="text-xs font-medium text-neutral-300">
              {voiceEnabled ? 'Voz: Sí' : 'Voz: No'}
            </span>
            <button
              type="button"
              id="toggle-voice-button"
              onClick={() => onChangeVoiceEnabled(!voiceEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                voiceEnabled ? 'bg-amber-500' : 'bg-neutral-800'
              }`}
              title={voiceEnabled ? 'Desactivar locución de voz' : 'Activar locución de voz'}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  voiceEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {!voiceEnabled && (
        <div className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-amber-200 text-xs">
          <VolumeX className="w-5 h-5 text-amber-400 shrink-0" />
          <p>
            <strong className="text-amber-300">Modo Solo Música y Subtítulos:</strong> La locución está desactivada. Los versos aparecerán en pantalla como subtítulos sincronizados con el ritmo y pausas poéticas, acompañados únicamente por la música.
          </p>
        </div>
      )}

      <div className={!voiceEnabled ? 'opacity-40 pointer-events-none transition-opacity' : 'transition-opacity'}>
        {/* Gender Selection */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-neutral-300 uppercase tracking-wider mb-2">
            Género de la Voz
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Masculina */}
            <button
              type="button"
              id="voice-male-button"
              onClick={() => {
                onChangeGender('male');
                onChangePresetVoice(RECOMMENDED_MALE_VOICES[0].geminiVoice);
              }}
              className={`relative p-3.5 rounded-xl border text-left transition-all ${
                gender === 'male'
                  ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/40 shadow-lg shadow-amber-500/5'
                  : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      gender === 'male'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-100">Voz Masculina</h3>
                    <p className="text-xs text-amber-400 font-medium">
                      Activa: {gender === 'male' ? currentPreset.name : 'Algieba (Por defecto)'}
                    </p>
                  </div>
                </div>
                {gender === 'male' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
              </div>
            </button>

            {/* Femenina */}
            <button
              type="button"
              id="voice-female-button"
              onClick={() => {
                onChangeGender('female');
                onChangePresetVoice(RECOMMENDED_FEMALE_VOICES[0].geminiVoice);
              }}
              className={`relative p-3.5 rounded-xl border text-left transition-all ${
                gender === 'female'
                  ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/40 shadow-lg shadow-amber-500/5'
                  : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      gender === 'female'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-100">Voz Femenina</h3>
                    <p className="text-xs text-amber-400 font-medium">
                      Activa: {gender === 'female' ? currentPreset.name : 'Kore (Por defecto)'}
                    </p>
                  </div>
                </div>
                {gender === 'female' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
              </div>
            </button>
          </div>
        </div>

        {/* Recommended Presets for Selected Gender */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              Presets recomendados para Español ({gender === 'male' ? 'Masculinos' : 'Femeninos'})
            </label>
            <span className="text-[11px] text-amber-400/90 font-medium bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
              Calibrados para poesía
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {activePresets.map((preset) => {
              const isSelected = presetVoice === preset.geminiVoice;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onChangePresetVoice(preset.geminiVoice)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500 ring-1 ring-amber-500/50 shadow-md shadow-amber-500/10'
                      : 'bg-neutral-950/60 border-neutral-800/90 hover:border-neutral-700 hover:bg-neutral-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold ${isSelected ? 'text-amber-300' : 'text-neutral-200'}`}>
                        {preset.name}
                      </span>
                      {preset.isDefault && (
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500 text-neutral-950 font-bold">
                          Por defecto
                        </span>
                      )}
                    </div>
                    {isSelected ? (
                      <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-neutral-700 block flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    {preset.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Intonation Selection */}
        <div>
          <label className="block text-xs font-medium text-neutral-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Entonación de la locución
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {INTONATION_OPTIONS.map((opt) => {
              const isSelected = intonation === opt.promptInstruction;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeIntonation(opt.promptInstruction)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/60 text-neutral-100'
                      : 'bg-neutral-950/40 border-neutral-800/80 hover:border-neutral-700 text-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-medium mb-1">
                    <span className={isSelected ? 'text-amber-300 font-semibold' : ''}>
                      {opt.label}
                    </span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-tight">
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
