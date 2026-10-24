import React from 'react';
import { createPortal } from 'react-dom';
import { SimulationSummary } from '../../types/waterDistribution';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Activity,
  Gauge,
  Droplets,
  TrendingDown,
  FileSpreadsheet,
  Mountain,
} from 'lucide-react';

interface WaterSimulationResultsModalProps {
  summary: SimulationSummary | null;
  onClose: () => void;
  onExportExcel?: () => void;
}

export const WaterSimulationResultsModal: React.FC<WaterSimulationResultsModalProps> = ({
  summary,
  onClose,
  onExportExcel,
}) => {
  if (!summary || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none pointer-events-auto">
      <div className="w-full max-w-lg bg-[#111] border border-[#262626] rounded-xl shadow-2xl flex flex-col overflow-hidden relative z-[100000]">
        {/* Modal Header */}
        <div className="px-5 py-3 border-b border-[#222] bg-[#141414] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-white font-tech uppercase tracking-wider">
              WaterGEMS Hydraulic Calculation Summary
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#222] text-[#737373] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-xs font-mono">
          {/* Status Alert Banner */}
          <div
            className={`p-3 rounded-lg border flex items-start gap-2.5 ${
              summary.converged
                ? summary.negativePressureNodes.length > 0
                  ? 'bg-red-500/10 border-red-500/30 text-red-200'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            }`}
          >
            {summary.converged ? (
              summary.negativePressureNodes.length > 0 ? (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              )
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold font-tech text-sm">
                {summary.converged
                  ? summary.negativePressureNodes.length > 0
                    ? 'Converged with Negative Pressure Warnings'
                    : 'Simulation Converged Successfully'
                  : 'Simulation Did Not Fully Converge'}
              </p>
              <p className="text-[11px] opacity-80 mt-0.5">
                Solved in {summary.iterations} iterations. Relative flow error: {summary.relativeFlowError} L/s.
              </p>
            </div>
          </div>

          {/* Mass Balance Card */}
          <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222] space-y-2">
            <span className="text-[10px] font-tech uppercase font-bold text-amber-400">
              System Mass Balance (Continuity)
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                <span className="text-[10px] text-[#737373] block">Total Consumer Demand</span>
                <span className="text-white text-base font-bold">{summary.totalDemandLs} L/s</span>
              </div>
              <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                <span className="text-[10px] text-[#737373] block">Total Source Supply</span>
                <span className="text-emerald-400 text-base font-bold">{summary.totalSupplyLs} L/s</span>
              </div>
            </div>
            <div className="flex justify-between text-[11px] text-[#737373] pt-1 border-t border-[#222]">
              <span>Flow Imbalance:</span>
              <span className="text-white">{summary.flowImbalanceLs} L/s</span>
            </div>
          </div>

          {/* Critical Pressures & Velocities */}
          <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222] space-y-2">
            <span className="text-[10px] font-tech uppercase font-bold text-amber-400">
              Pressure & Velocity Extremes
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                <span className="text-[10px] text-[#737373] block">Minimum Service Pressure</span>
                <span
                  className={`text-base font-bold ${
                    summary.minPressureM < 0
                      ? 'text-red-400'
                      : summary.minPressureM < 15
                      ? 'text-amber-400'
                      : 'text-white'
                  }`}
                >
                  {summary.minPressureM} m
                </span>
                <span className="text-[9px] text-[#666] block">At Node {summary.minPressureNodeId}</span>
              </div>

              <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                <span className="text-[10px] text-[#737373] block">Maximum Pressure</span>
                <span className="text-white text-base font-bold">{summary.maxPressureM} m</span>
                <span className="text-[9px] text-[#666] block">At Node {summary.maxPressureNodeId}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                <span className="text-[10px] text-[#737373] block">Max Pipe Velocity</span>
                <span className="text-white text-sm font-bold">{summary.maxVelocityMs} m/s</span>
                <span className="text-[9px] text-[#666] block">Pipe {summary.maxVelocityPipeId}</span>
              </div>

              <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                <span className="text-[10px] text-[#737373] block">Pump Power Usage</span>
                <span className="text-amber-400 text-sm font-bold">{summary.totalPumpPowerKw} kW</span>
              </div>
            </div>
          </div>

          {/* Real Earth Terrain DEM Reference */}
          <div className="p-3 rounded-lg bg-[#141414] border border-[#222] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-tech uppercase font-bold text-amber-400 flex items-center gap-1.5">
                <Mountain className="w-3.5 h-3.5" />
                <span>Real Earth Terrain DEM Reference</span>
              </span>
              <span className="text-[9px] text-emerald-400 font-mono bg-[#0a0a0a] px-2 py-0.5 rounded border border-[#262626]">
                Copernicus GLO-30 / SRTM (Open-Meteo)
              </span>
            </div>
            <p className="text-[11px] text-[#888] leading-relaxed">
              Every node elevation is sampled from real global Earth DEM data. Pressure heads are solved against true ground datum: P = (HGL - zDEM) m H2O.
            </p>
          </div>

          {/* Warnings list if negative pressures exist */}
          {summary.negativePressureNodes.length > 0 && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 space-y-1">
              <span className="font-bold flex items-center gap-1.5 text-xs text-red-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Negative Pressure Nodes Detected ({summary.negativePressureNodes.length})</span>
              </span>
              <p className="text-[11px] leading-relaxed opacity-90">
                Nodes {summary.negativePressureNodes.join(', ')} experience sub-atmospheric pressure.
                Consider increasing source head, resizing feeder pipes, or adding a booster pump.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-[#222] bg-[#141414] flex items-center justify-between">
          {onExportExcel ? (
            <button
              onClick={onExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-emerald-400 hover:text-emerald-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Download Calculation (.xlsx)</span>
            </button>
          ) : <div />}
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-[#0a0a0a] font-bold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
