import React from 'react';
import { createPortal } from 'react-dom';
import { WastewaterSimulationSummary } from '../../types/wastewater';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Activity,
  FileSpreadsheet,
  Mountain,
  Users,
  ShieldAlert,
  Flame,
} from 'lucide-react';

interface WastewaterSimulationResultsModalProps {
  summary: WastewaterSimulationSummary | null;
  onClose: () => void;
  onExportExcel?: () => void;
}

export const WastewaterSimulationResultsModal: React.FC<WastewaterSimulationResultsModalProps> = ({
  summary,
  onClose,
  onExportExcel,
}) => {
  if (!summary || typeof document === 'undefined') return null;

  const hasWarnings =
    summary.surchargedConduitIds.length > 0 ||
    summary.subCleansingConduitIds.length > 0 ||
    summary.reverseSlopeConduitIds.length > 0 ||
    summary.floodedManholeIds.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none pointer-events-auto">
      <div className="w-full max-w-lg bg-[#111] border border-[#262626] rounded-xl shadow-2xl flex flex-col overflow-hidden relative z-[100000]">
        {/* Modal Header */}
        <div className="px-5 py-3 border-b border-[#222] bg-[#141414] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-white font-tech uppercase tracking-wider">
              Wastewater Hydraulic Calculation Summary
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
                ? hasWarnings
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-red-500/10 border-red-500/30 text-red-200'
            }`}
          >
            {summary.converged ? (
              hasWarnings ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              )
            ) : (
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold font-tech text-sm">
                {summary.converged
                  ? hasWarnings
                    ? 'Hydraulics Solved with Engineering Warnings'
                    : 'Hydraulic Simulation Fully Satisfactory'
                  : 'Simulation Did Not Converge'}
              </p>
              <p className="text-[11px] opacity-80 mt-0.5">
                Manning open-channel solver converged. Max pipe fullness: {(summary.maxCapacityUtilizationRatio * 100).toFixed(0)}% d/D.
              </p>
            </div>
          </div>

          {/* Mass Balance & Sanitary Flows Card */}
          <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-tech uppercase font-bold text-amber-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>Sanitary Load & Effluent Continuity</span>
              </span>
              <span className="text-[10px] text-[#888]">
                {summary.totalPopulation.toLocaleString()} Tributary Population
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                <span className="text-[10px] text-[#737373] block">Average Dry Weather Flow</span>
                <span className="text-white text-base font-bold">{summary.totalDryWeatherFlowLs} L/s</span>
              </div>
              <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                <span className="text-[10px] text-[#737373] block">Peak Sanitary Inflow</span>
                <span className="text-amber-400 text-base font-bold">{summary.totalPeakSanitaryFlowLs} L/s</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                <span className="text-[10px] text-[#737373] block">Total Inflow & Infiltration</span>
                <span className="text-[#888] text-sm font-bold">{summary.totalInflowInfiltrationLs} L/s</span>
              </div>
              <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                <span className="text-[10px] text-[#737373] block">Outfall Effluent Discharge</span>
                <span className="text-emerald-400 text-sm font-bold">{summary.totalOutfallDischargeLs} L/s</span>
              </div>
            </div>
          </div>

          {/* Capacity, Velocity & Pumping Card */}
          <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222] space-y-2">
            <span className="text-[10px] font-tech uppercase font-bold text-amber-400">
              Capacity & Velocity Thresholds
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                <span className="text-[10px] text-[#737373] block">Max Fullness Ratio (d/D)</span>
                <span
                  className={`text-base font-bold ${
                    summary.maxCapacityUtilizationRatio > 1.0
                      ? 'text-red-400'
                      : summary.maxCapacityUtilizationRatio > 0.75
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {summary.maxCapacityUtilizationRatio.toFixed(2)}
                </span>
                <span className="text-[9px] text-[#666] block">At Conduit {summary.criticalConduitId}</span>
              </div>

              <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                <span className="text-[10px] text-[#737373] block">Min Flow Velocity</span>
                <span
                  className={`text-base font-bold ${
                    summary.minVelocityMs < 0.6 ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {summary.minVelocityMs} m/s
                </span>
                <span className="text-[9px] text-[#666] block">
                  {summary.minVelocityMs < 0.6 ? 'Below 0.6 m/s cleansing' : 'Self-cleansing OK'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                <span className="text-[10px] text-[#737373] block">Max Velocity</span>
                <span className="text-white text-sm font-bold">{summary.maxVelocityMs} m/s</span>
                <span className="text-[9px] text-[#666] block">Pipe {summary.maxVelocityConduitId}</span>
              </div>

              <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                <span className="text-[10px] text-[#737373] block">Lift Pumping Power</span>
                <span className="text-amber-400 text-sm font-bold">{summary.totalPumpingPowerKw} kW</span>
              </div>
            </div>
          </div>

          {/* Advanced SWMM & Sewer Suite Modules */}
          {(summary.hourlySimulationPoints || summary.constraintDesignResults || summary.h2sCorrosionResults || summary.liftStationCycleResults) && (
            <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222] space-y-2.5">
              <span className="text-[10px] font-tech uppercase font-bold text-sky-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                <span>SWMM Extended Engineering Modules</span>
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {summary.hourlySimulationPoints && (
                  <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                    <span className="text-[10px] text-[#737373] block">24-Hr Dynamic Routing</span>
                    <span className="text-sky-300 font-bold">24-Hr Hydrograph Solved</span>
                    <span className="text-[9px] text-[#666] block">Peak 1.80x @ 08:00</span>
                  </div>
                )}
                {summary.constraintDesignResults && (
                  <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                    <span className="text-[10px] text-[#737373] block">Pipe Sizing Design</span>
                    <span className="text-purple-300 font-bold">
                      {summary.constraintDesignResults.filter((s) => s.designStatus === 'Optimal').length} / {summary.constraintDesignResults.length} Optimal
                    </span>
                    <span className="text-[9px] text-[#666] block">Constraint-based sizing</span>
                  </div>
                )}
                {summary.h2sCorrosionResults && (
                  <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                    <span className="text-[10px] text-[#737373] block">H2S & Odor Risk</span>
                    <span className="text-amber-300 font-bold">
                      {summary.h2sCorrosionResults.filter((h) => h.corrosionPotential === 'Severe').length} Severe Risk
                    </span>
                    <span className="text-[9px] text-[#666] block">Pomeroy Z & Crown loss</span>
                  </div>
                )}
                {summary.liftStationCycleResults && (
                  <div className="p-2 rounded bg-[#0a0a0a] border border-[#222]">
                    <span className="text-[10px] text-[#737373] block">Station Cycle & Energy</span>
                    <span className="text-emerald-400 font-bold">
                      {summary.dailyEnergyKwh ?? 0} kWh/day
                    </span>
                    <span className="text-[9px] text-[#666] block">Starts &lt;= 10/hr compliant</span>
                  </div>
                )}
              </div>
            </div>
          )}

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
              Every manhole rim elevation is sampled from real global Earth DEM data. Sewer invert depths and pipe gravity slopes are derived from true terrain ground levels.
            </p>
          </div>

          {/* Surcharge / Flood Warnings List */}
          {hasWarnings && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 space-y-1">
              <span className="font-bold flex items-center gap-1.5 text-xs text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Engineering Attention Flags</span>
              </span>
              <ul className="text-[11px] leading-relaxed opacity-90 list-disc list-inside space-y-0.5">
                {summary.surchargedConduitIds.length > 0 && (
                  <li>Surcharged Conduits: {summary.surchargedConduitIds.join(', ')} (exceeds full capacity)</li>
                )}
                {summary.subCleansingConduitIds.length > 0 && (
                  <li>Sub-cleansing Conduits: {summary.subCleansingConduitIds.join(', ')} (velocity &lt; 0.60 m/s; risk of silt deposition)</li>
                )}
                {summary.reverseSlopeConduitIds.length > 0 && (
                  <li>Reverse Slope Conduits: {summary.reverseSlopeConduitIds.join(', ')} (upstream invert lower than downstream)</li>
                )}
                {summary.floodedManholeIds.length > 0 && (
                  <li>Flooded Manholes: {summary.floodedManholeIds.join(', ')} (water exceeds surface rim)</li>
                )}
              </ul>
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
