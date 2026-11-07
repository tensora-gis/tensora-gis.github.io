/**
 * Depth-Averaged RANS Turbulence Configuration & Diagnostics Panel
 */

import React from 'react';
import {
  TurbulenceParameters,
  TurbulenceModelType,
} from '../types/turbulence';

interface TurbulencePanelProps {
  isOpen: boolean;
  onClose: () => void;
  parameters: TurbulenceParameters;
  onUpdateParameters: (params: TurbulenceParameters) => void;
  currentMaxNuT?: number;
  currentMeanNuT?: number;
  currentMaxK?: number;
}

export const TurbulencePanel: React.FC<TurbulencePanelProps> = ({
  isOpen,
  onClose,
  parameters,
  onUpdateParameters,
  currentMaxNuT = 0,
  currentMeanNuT = 0,
  currentMaxK = 0,
}) => {
  if (!isOpen) return null;

  const handleChange = (key: keyof TurbulenceParameters, val: any) => {
    onUpdateParameters({
      ...parameters,
      [key]: val,
    });
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 shadow-2xl text-slate-100 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-purple-500/20 text-purple-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </span>
            <h3 className="text-base font-semibold">Depth-Averaged RANS Turbulence Modelling</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            ✕
          </button>
        </div>

        {/* Live Diagnostics Card */}
        <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-medium">Max Eddy Viscosity ν_t</div>
            <div className="text-sm font-bold text-purple-400">{currentMaxNuT.toFixed(4)} m²/s</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-medium">Mean Channel ν_t</div>
            <div className="text-sm font-bold text-cyan-400">{currentMeanNuT.toFixed(4)} m²/s</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-medium">Max TKE k</div>
            <div className="text-sm font-bold text-emerald-400">{currentMaxK.toFixed(4)} m²/s²</div>
          </div>
        </div>

        {/* Model Selection */}
        <div>
          <label className="text-xs text-slate-300 block mb-1.5 font-medium">Turbulence Closure Model</label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { id: 'none', label: 'None (ν_t = 0)', desc: 'Fast inviscid/pure shallow water' },
              { id: 'mixing-length', label: 'Algebraic Mixing Length', desc: 'Nezu & Rodi parabolic profile' },
              { id: 'k-epsilon', label: 'Standard k-ε (2-Equation)', desc: 'Engineering default for shear layers' },
              { id: 'k-omega-sst', label: 'k-ω SST (2-Equation)', desc: 'Optimized for separated flows near piers' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => handleChange('model', m.id as TurbulenceModelType)}
                className={`p-2.5 rounded-lg border text-left transition ${
                  parameters.model === m.id
                    ? 'bg-purple-950/60 border-purple-500 text-white'
                    : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="font-semibold text-xs">{m.label}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Closure Constants */}
        <div className="border-t border-slate-800 pt-3">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Model Closure Parameters & Limiters
          </h4>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">von Kármán Constant κ</label>
              <input
                type="number"
                step="0.01"
                value={parameters.kappa}
                onChange={(e) => handleChange('kappa', parseFloat(e.target.value) || 0.41)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Eddy Viscosity Cap (m²/s)</label>
              <input
                type="number"
                step="0.5"
                value={parameters.eddyViscosityCapM2s}
                onChange={(e) => handleChange('eddyViscosityCapM2s', parseFloat(e.target.value) || 5.0)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">c_μ (k-ε closure)</label>
              <input
                type="number"
                step="0.01"
                value={parameters.cMu}
                onChange={(e) => handleChange('cMu', parseFloat(e.target.value) || 0.09)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Turbulent Schmidt σ_c (Sediment)</label>
              <input
                type="number"
                step="0.1"
                value={parameters.schmidtNumberSediment}
                onChange={(e) => handleChange('schmidtNumberSediment', parseFloat(e.target.value) || 1.0)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between p-2 bg-slate-800/40 border border-slate-700/60 rounded text-xs">
            <div>
              <div className="font-medium text-slate-200">Equilibrium Bed Wall Functions</div>
              <div className="text-[10px] text-slate-400">Prescribe k, ε from bed friction velocity u*</div>
            </div>
            <input
              type="checkbox"
              checked={parameters.wallFunctionsEnabled}
              onChange={(e) => handleChange('wallFunctionsEnabled', e.target.checked)}
              className="w-4 h-4 rounded text-purple-600 focus:ring-0 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold transition"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
