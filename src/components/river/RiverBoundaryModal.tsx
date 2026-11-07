/**
 * River Hydrodynamic Boundary Conditions Modal
 *
 * Configures:
 * 1. Upstream Inflow (Steady discharge or multi-temporal hydrograph Q(t))
 * 2. Downstream Boundary (Normal depth slope S0, Fixed stage, or Critical depth)
 * 3. Meteorological Rain Hyetograph (Uniform rainfall intensity mm/hr)
 * 4. Initial Channel Baseflow Water Depth (m)
 */

import React, { useState } from 'react';
import { RiverBoundaryConditions } from '../../types/riverAnalysis';
import { X, Sliders, CloudRain, ArrowDownRight, ArrowUpRight } from 'lucide-react';

interface RiverBoundaryModalProps {
  boundaries: RiverBoundaryConditions;
  onUpdateBoundaries: (b: RiverBoundaryConditions) => void;
  onClose: () => void;
}

export const RiverBoundaryModal: React.FC<RiverBoundaryModalProps> = ({
  boundaries,
  onUpdateBoundaries,
  onClose,
}) => {
  const [bState, setBState] = useState<RiverBoundaryConditions>({ ...boundaries });
  const [hydrographText, setHydrographText] = useState<string>(() => {
    if (bState.upstreamHydrograph && bState.upstreamHydrograph.length > 0) {
      return bState.upstreamHydrograph
        .map((pt) => `${pt.timeSec}, ${pt.dischargeM3s}`)
        .join('\n');
    }
    return '0, 45\n60, 95\n120, 160\n180, 80\n240, 45';
  });

  const handleSave = () => {
    // Parse hydrograph text if in hydrograph mode
    let hydroPoints = bState.upstreamHydrograph;
    if (bState.upstreamType === 'hydrograph') {
      const parsed: { timeSec: number; dischargeM3s: number }[] = [];
      const lines = hydrographText.split('\n');
      for (const l of lines) {
        const parts = l.split(/[, \t]+/);
        if (parts.length >= 2) {
          const t = parseFloat(parts[0]);
          const q = parseFloat(parts[1]);
          if (isFinite(t) && isFinite(q)) {
            parsed.push({ timeSec: t, dischargeM3s: q });
          }
        }
      }
      if (parsed.length > 0) {
        hydroPoints = parsed.sort((a, b) => a.timeSec - b.timeSec);
      }
    }

    onUpdateBoundaries({
      ...bState,
      upstreamHydrograph: hydroPoints,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-[#111] border border-[#262626] rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-[#e5e7eb]">
        {/* Header */}
        <div className="h-12 px-5 border-b border-[#222] flex items-center justify-between bg-[#141414]">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white font-tech">
              River Boundary Conditions & Hydrometeorology
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#222] text-[#888] hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs font-mono">
          {/* 1. Upstream Boundary Condition */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-white font-tech font-bold uppercase tracking-wider">
              <ArrowUpRight className="w-4 h-4 text-cyan-400" />
              <span>Upstream Inflow Boundary</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[#888] block mb-1">Inflow Condition Type</label>
                <select
                  value={bState.upstreamType}
                  onChange={(e) =>
                    setBState({
                      ...bState,
                      upstreamType: e.target.value as RiverBoundaryConditions['upstreamType'],
                    })
                  }
                  className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                >
                  <option value="constant-discharge">Constant Steady Inflow</option>
                  <option value="hydrograph">Time-Varying Flood Hydrograph Q(t)</option>
                </select>
              </div>

              <div>
                <label className="text-[#888] block mb-1">
                  {bState.upstreamType === 'constant-discharge' ? 'Discharge Q (m³/s)' : 'Peak Discharge (m³/s)'}
                </label>
                <input
                  type="number"
                  step="1"
                  value={bState.upstreamDischargeM3s}
                  onChange={(e) =>
                    setBState({
                      ...bState,
                      upstreamDischargeM3s: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-cyan-400 font-bold"
                />
              </div>
            </div>

            {bState.upstreamType === 'hydrograph' && (
              <div className="mt-2">
                <label className="text-[#888] block mb-1">
                  Hydrograph Points (Time [sec], Discharge [m³/s] - 1 pair per line):
                </label>
                <textarea
                  value={hydrographText}
                  onChange={(e) => setHydrographText(e.target.value)}
                  rows={4}
                  className="w-full bg-[#111] border border-[#333] rounded p-2 text-white font-mono text-[11px]"
                />
              </div>
            )}
          </div>

          {/* 2. Downstream Boundary Condition */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-white font-tech font-bold uppercase tracking-wider">
              <ArrowDownRight className="w-4 h-4 text-emerald-400" />
              <span>Downstream Outflow Boundary</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[#888] block mb-1">Outflow Condition Type</label>
                <select
                  value={bState.downstreamType}
                  onChange={(e) =>
                    setBState({
                      ...bState,
                      downstreamType: e.target.value as RiverBoundaryConditions['downstreamType'],
                    })
                  }
                  className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                >
                  <option value="normal-depth">Normal Depth (Manning Energy Slope S₀)</option>
                  <option value="fixed-stage">Fixed Water Level / Tidal Stage η (m MSL)</option>
                  <option value="critical-depth">Critical Depth Outfall (Fr = 1.0)</option>
                </select>
              </div>

              {bState.downstreamType === 'normal-depth' ? (
                <div>
                  <label className="text-[#888] block mb-1">Downstream Friction Slope S₀ (m/m)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={bState.downstreamSlope}
                    onChange={(e) =>
                      setBState({
                        ...bState,
                        downstreamSlope: parseFloat(e.target.value) || 0.001,
                      })
                    }
                    className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-[#888] block mb-1">Downstream Stage η (m MSL)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={bState.downstreamStageM}
                    onChange={(e) =>
                      setBState({
                        ...bState,
                        downstreamStageM: parseFloat(e.target.value) || 100,
                      })
                    }
                    className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 3. Precipitation & Domain Initial Conditions */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-white font-tech font-bold uppercase tracking-wider">
              <CloudRain className="w-4 h-4 text-purple-400" />
              <span>Meteorology & Channel Initialization</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[#888] block mb-1">Rainfall Intensity (mm/hr)</label>
                <input
                  type="number"
                  step="5"
                  value={bState.rainfallIntensityMmPerHr}
                  onChange={(e) =>
                    setBState({
                      ...bState,
                      rainfallIntensityMmPerHr: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                />
              </div>

              <div>
                <label className="text-[#888] block mb-1">Initial Water Depth (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={bState.initialWaterDepthM}
                  onChange={(e) =>
                    setBState({
                      ...bState,
                      initialWaterDepthM: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                />
              </div>

              <div>
                <label className="text-[#888] block mb-1">Default Manning Roughness n</label>
                <input
                  type="number"
                  step="0.002"
                  value={bState.manningRoughnessDefault}
                  onChange={(e) =>
                    setBState({
                      ...bState,
                      manningRoughnessDefault: parseFloat(e.target.value) || 0.03,
                    })
                  }
                  className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-12 px-5 border-t border-[#222] flex items-center justify-between bg-[#141414] text-xs">
          <span className="text-[#737373]">Coupled to 2D Saint-Venant Solver</span>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold cursor-pointer"
          >
            Save Boundaries
          </button>
        </div>
      </div>
    </div>
  );
};
