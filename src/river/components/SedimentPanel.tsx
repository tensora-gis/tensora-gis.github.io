/**
 * Sediment Transport & Morphodynamics Configuration Panel
 */

import React from 'react';
import {
  SedimentParameters,
  SedimentFormula,
} from '../types/sediment';

interface SedimentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  parameters: SedimentParameters;
  onUpdateParameters: (params: SedimentParameters) => void;
  cumulativeScourM3?: number;
  cumulativeDepoM3?: number;
}

export const SedimentPanel: React.FC<SedimentPanelProps> = ({
  isOpen,
  onClose,
  parameters,
  onUpdateParameters,
  cumulativeScourM3 = 0,
  cumulativeDepoM3 = 0,
}) => {
  if (!isOpen) return null;

  const handleChange = (key: keyof SedimentParameters, val: any) => {
    onUpdateParameters({
      ...parameters,
      [key]: val,
    });
  };

  const netBedShiftM3 = cumulativeDepoM3 - cumulativeScourM3;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 shadow-2xl text-slate-100 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
              </svg>
            </span>
            <h3 className="text-base font-semibold">Sediment Transport & Exner Morphodynamics</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            ✕
          </button>
        </div>

        {/* Live Diagnostics */}
        <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-medium">Cumulative Scour</div>
            <div className="text-sm font-bold text-rose-400">{cumulativeScourM3.toFixed(2)} m³</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-medium">Cumulative Siltation</div>
            <div className="text-sm font-bold text-amber-400">{cumulativeDepoM3.toFixed(2)} m³</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-medium">Net Bed Shift</div>
            <div className={`text-sm font-bold ${netBedShiftM3 >= 0 ? 'text-amber-300' : 'text-rose-300'}`}>
              {netBedShiftM3 > 0 ? '+' : ''}{netBedShiftM3.toFixed(2)} m³
            </div>
          </div>
        </div>

        {/* Master Toggle */}
        <div className="flex items-center justify-between p-2.5 bg-slate-800/60 border border-slate-700/60 rounded-lg text-xs">
          <div>
            <div className="font-semibold text-slate-200">Coupled Morphodynamic Bed Evolution</div>
            <div className="text-[10px] text-slate-400">Advance Exner equation & adjust channel bathymetry dynamically</div>
          </div>
          <input
            type="checkbox"
            checked={parameters.enabled}
            onChange={(e) => handleChange('enabled', e.target.checked)}
            className="w-4 h-4 rounded text-amber-600 focus:ring-0 cursor-pointer"
          />
        </div>

        {/* Transport Formula Selection */}
        <div>
          <label className="text-xs text-slate-300 block mb-1.5 font-medium">Sediment Transport Capacity Formula</label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { id: 'engelund-hansen', label: 'Engelund & Hansen (1967)', desc: 'Total load, sand channels (default)' },
              { id: 'van-rijn', label: 'van Rijn (1984)', desc: 'Separate bedload & suspended load' },
              { id: 'meyer-peter-muller', label: 'Meyer-Peter & Müller (1948)', desc: 'Gravel & coarse bedload transport' },
              { id: 'toffaleti', label: 'Toffaleti (1969)', desc: 'Multi-zone large river total load' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => handleChange('formula', f.id as SedimentFormula)}
                className={`p-2.5 rounded-lg border text-left transition ${
                  parameters.formula === f.id
                    ? 'bg-amber-950/60 border-amber-500 text-white'
                    : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="font-semibold text-xs">{f.label}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{f.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Physical Grain & Bed Parameters */}
        <div className="border-t border-slate-800 pt-3">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Physical Granular Parameters
          </h4>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Median Grain Size d_50 (mm)</label>
              <input
                type="number"
                step="0.05"
                value={parameters.d50Mm}
                onChange={(e) => handleChange('d50Mm', parseFloat(e.target.value) || 0.5)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Specific Gravity s = ρ_s / ρ_w</label>
              <input
                type="number"
                step="0.05"
                value={parameters.specificGravity}
                onChange={(e) => handleChange('specificGravity', parseFloat(e.target.value) || 2.65)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Bed Packing Porosity p</label>
              <input
                type="number"
                step="0.02"
                value={parameters.bedPorosity}
                onChange={(e) => handleChange('bedPorosity', parseFloat(e.target.value) || 0.4)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Decoupled Sub-Step Interval</label>
              <input
                type="number"
                value={parameters.decoupledIntervalSteps}
                onChange={(e) => handleChange('decoupledIntervalSteps', parseInt(e.target.value) || 5)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold transition"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
