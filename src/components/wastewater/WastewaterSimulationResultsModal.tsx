import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  WastewaterNetwork,
  WastewaterSimulationSummary,
} from '../../types/wastewater';
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
  Download,
  Printer,
  Wrench,
  Clock,
  Database,
  TrendingUp,
  Droplets,
} from 'lucide-react';

interface WastewaterSimulationResultsModalProps {
  network: WastewaterNetwork;
  summary: WastewaterSimulationSummary | null;
  onClose: () => void;
  onExportExcel?: () => void;
  onExportInp?: () => void;
  onApplyAutoDesign?: () => void;
}

type ReportTab =
  | 'summary'
  | 'conduits'
  | 'manholes'
  | 'liftstations'
  | 'autodesign'
  | 'h2s'
  | 'rdii'
  | 'eps';

export const WastewaterSimulationResultsModal: React.FC<WastewaterSimulationResultsModalProps> = ({
  network,
  summary,
  onClose,
  onExportExcel,
  onExportInp,
  onApplyAutoDesign,
}) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('summary');

  if (!summary || typeof document === 'undefined') return null;

  const hasWarnings =
    summary.surchargedConduitIds.length > 0 ||
    summary.subCleansingConduitIds.length > 0 ||
    summary.reverseSlopeConduitIds.length > 0 ||
    summary.floodedManholeIds.length > 0;

  const handlePrint = () => {
    window.print();
  };

  const tabs: { id: ReportTab; label: string; icon: React.FC<{ className?: string }>; count?: number }[] = [
    { id: 'summary', label: 'Executive Summary', icon: Activity },
    { id: 'conduits', label: 'Gravity Conduits', icon: TrendingUp, count: network.conduits.length },
    { id: 'manholes', label: 'Manhole Schedule', icon: Users, count: network.manholes.length },
    { id: 'liftstations', label: 'Lift Stations & Pumps', icon: Database, count: network.wetWells.length + network.pumps.length },
    {
      id: 'autodesign',
      label: 'Auto-Design Sizing',
      icon: Wrench,
      count: (summary.constraintDesignResults || []).filter((s) => s.designStatus !== 'Optimal').length,
    },
    {
      id: 'h2s',
      label: 'H2S & Corrosion',
      icon: Flame,
      count: (summary.h2sCorrosionResults || []).filter((h) => h.corrosionPotential === 'Severe').length,
    },
    { id: 'rdii', label: 'I&I / RDII Hydrology', icon: Droplets },
    { id: 'eps', label: '24-Hr Diurnal EPS', icon: Clock },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md select-none pointer-events-auto">
      <div className="w-full max-w-6xl max-h-[92vh] bg-[#0f0f10] border border-[#262626] rounded-xl shadow-2xl flex flex-col overflow-hidden relative z-[100000]">
        {/* Modal Top Header */}
        <div className="px-5 py-3 border-b border-[#222] bg-[#141416] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white font-tech uppercase tracking-wider">
                  Detailed Wastewater Hydraulic Calculation & SWMM Report
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300">
                  {summary.routingMethod || 'DYNAMICWAVE'}
                </span>
              </div>
              <span className="text-[11px] text-[#737373] font-mono">
                Model: {network.name} | Datum: Copernicus GLO-30 DEM | Timestamp: {summary.runTimestamp}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-1.5 rounded hover:bg-[#222] text-[#888] hover:text-white transition-colors cursor-pointer"
              title="Print Calculation Report (PDF)"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[#222] text-[#888] hover:text-white transition-colors cursor-pointer"
              title="Close Report"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div className="flex items-center gap-1 px-4 py-2 bg-[#121214] border-b border-[#222] overflow-x-auto shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-tech tracking-wide transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-amber-500 text-[#0a0a0a] font-bold shadow-xs'
                    : 'text-[#888] hover:text-white hover:bg-[#1c1c1f]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                      isActive ? 'bg-black text-amber-300 font-bold' : 'bg-[#222] text-amber-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div className="p-5 flex-1 overflow-y-auto text-xs font-mono space-y-4">
          {/* TAB 1: SUMMARY */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              {/* Convergence Alert Banner */}
              <div
                className={`p-3.5 rounded-lg border flex items-start gap-3 ${
                  summary.converged
                    ? hasWarnings
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-red-500/10 border-red-500/30 text-red-200'
                }`}
              >
                {summary.converged ? (
                  hasWarnings ? (
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  )
                ) : (
                  <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-bold font-tech text-sm uppercase tracking-wide">
                    {summary.converged
                      ? hasWarnings
                        ? 'Hydraulic Solver Converged with Design Warnings'
                        : 'SWMM Manning Hydraulic Simulation Satisfactory'
                      : 'Hydraulic Solution Did Not Converge'}
                  </p>
                  <p className="text-[11px] opacity-80 mt-0.5 leading-relaxed">
                    St. Venant open-channel Manning equations solved. Max pipe capacity utilization is{' '}
                    {(summary.maxCapacityUtilizationRatio * 100).toFixed(0)}% (d/D={summary.maxCapacityUtilizationRatio.toFixed(2)}) at conduit {summary.criticalConduitId}. Effluent outfall discharge: {summary.totalOutfallDischargeLs} L/s.
                  </p>
                </div>
              </div>

              {/* Grid Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Flow Balance */}
                <div className="p-3.5 rounded-lg bg-[#141416] border border-[#222] space-y-2.5">
                  <span className="text-[10px] font-tech uppercase font-bold text-amber-400 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>Sanitary Mass Balance</span>
                  </span>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#888]">Tributary Population:</span>
                      <span className="text-white font-bold">{summary.totalPopulation.toLocaleString()} Capita</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Average Dry Weather (ADWF):</span>
                      <span className="text-white font-bold">{summary.totalDryWeatherFlowLs} L/s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Peak Diurnal Sanitary Inflow:</span>
                      <span className="text-amber-400 font-bold">{summary.totalPeakSanitaryFlowLs} L/s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Rainfall & Infiltration (I&I):</span>
                      <span className="text-[#888] font-bold">{summary.totalInflowInfiltrationLs} L/s</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-[#222]">
                      <span className="text-emerald-400 font-bold">Effluent Discharge:</span>
                      <span className="text-emerald-400 font-bold">{summary.totalOutfallDischargeLs} L/s</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-[#666]">Continuity Imbalance:</span>
                      <span className="text-[#666]">{summary.flowImbalanceLs} L/s</span>
                    </div>
                  </div>
                </div>

                {/* 2. Hydraulics & Velocities */}
                <div className="p-3.5 rounded-lg bg-[#141416] border border-[#222] space-y-2.5">
                  <span className="text-[10px] font-tech uppercase font-bold text-amber-400 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Hydraulic Thresholds</span>
                  </span>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#888]">Max Fullness (d/D):</span>
                      <span
                        className={`font-bold ${
                          summary.maxCapacityUtilizationRatio > 1.0
                            ? 'text-red-400'
                            : summary.maxCapacityUtilizationRatio > 0.8
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {summary.maxCapacityUtilizationRatio.toFixed(2)} ({summary.criticalConduitId})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Min Flow Velocity:</span>
                      <span
                        className={`font-bold ${
                          summary.minVelocityMs < 0.6 ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {summary.minVelocityMs} m/s ({summary.minVelocityConduitId})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Max Flow Velocity:</span>
                      <span className="text-white font-bold">
                        {summary.maxVelocityMs} m/s ({summary.maxVelocityConduitId})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Min Tractive Shear Stress:</span>
                      <span
                        className={`font-bold ${
                          (summary.minTractiveForcePa ?? 0) < 1.5 ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {summary.minTractiveForcePa ?? 0} Pa ({summary.minTractiveForceConduitId || '-'})
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-[#222]">
                      <span className="text-[#888]">Drop Structures:</span>
                      <span className="text-white font-bold">{summary.dropManholeCount ?? 0} chambers</span>
                    </div>
                  </div>
                </div>

                {/* 3. Pumping & Energy */}
                <div className="p-3.5 rounded-lg bg-[#141416] border border-[#222] space-y-2.5">
                  <span className="text-[10px] font-tech uppercase font-bold text-amber-400 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    <span>Station Energy & Costing</span>
                  </span>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#888]">Pumping Installed:</span>
                      <span className="text-white font-bold">{network.pumps.length} units</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Total Power Connected:</span>
                      <span className="text-amber-400 font-bold">{summary.totalPumpingPowerKw} kW</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Daily Energy Consumed:</span>
                      <span className="text-emerald-400 font-bold">{summary.dailyEnergyKwh ?? 0} kWh/day</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Annual Power Cost:</span>
                      <span className="text-white font-bold">
                        ${(summary.annualEnergyCostUsd ?? 0).toLocaleString()} USD/yr
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-[#222]">
                      <span className="text-[#888]">Force Main Length:</span>
                      <span className="text-white font-bold">{summary.totalForceMainLengthM} m</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* DEM Elevation Reference Card */}
              <div className="p-3.5 rounded-lg bg-[#141416] border border-[#222] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Mountain className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="text-[11px] font-bold text-white font-tech uppercase tracking-wide block">
                      True Earth DEM Elevation Reference Datum
                    </span>
                    <span className="text-[10px] text-[#888]">
                      Global Copernicus GLO-30 / SRTM 30m terrain elevations sampled via Open-Meteo elevation service.
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded font-mono">
                  GLO-30 Synchronized
                </span>
              </div>

              {/* Engineering Warnings Box */}
              {hasWarnings && (
                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-1.5">
                  <span className="font-bold flex items-center gap-1.5 text-xs text-amber-400 font-tech uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Hydraulic & Structural Warnings</span>
                  </span>
                  <ul className="text-[11px] list-disc list-inside space-y-1 opacity-90">
                    {summary.surchargedConduitIds.length > 0 && (
                      <li>
                        <strong>Surcharged Conduits ({summary.surchargedConduitIds.length}):</strong>{' '}
                        {summary.surchargedConduitIds.join(', ')} exceed full-pipe gravity capacity (d/D &gt; 1.0). Upsizing required.
                      </li>
                    )}
                    {summary.subCleansingConduitIds.length > 0 && (
                      <li>
                        <strong>Sub-Cleansing Velocity ({summary.subCleansingConduitIds.length}):</strong>{' '}
                        {summary.subCleansingConduitIds.join(', ')} operate below 0.60 m/s minimum self-cleansing threshold. Silt deposition risk.
                      </li>
                    )}
                    {summary.scourWarningConduitIds.length > 0 && (
                      <li>
                        <strong>High Scour Velocity ({summary.scourWarningConduitIds.length}):</strong>{' '}
                        {summary.scourWarningConduitIds.join(', ')} exceed 3.0 m/s velocity limit. Install drop manholes or flatten slopes.
                      </li>
                    )}
                    {summary.reverseSlopeConduitIds.length > 0 && (
                      <li>
                        <strong>Reverse Slope Conduits ({summary.reverseSlopeConduitIds.length}):</strong>{' '}
                        {summary.reverseSlopeConduitIds.join(', ')} have adverse or zero invert grades. Correct upstream/downstream inverts.
                      </li>
                    )}
                    {summary.floodedManholeIds.length > 0 && (
                      <li>
                        <strong>Surface Flooding ({summary.floodedManholeIds.length}):</strong>{' '}
                        {summary.floodedManholeIds.join(', ')} experience water elevation exceeding ground surface rim.
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GRAVITY CONDUITS TABLE */}
          {activeTab === 'conduits' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-tech text-white uppercase font-bold tracking-wider">
                  Gravity Conduit Manning Hydraulic Schedule ({network.conduits.length} pipes)
                </span>
                <span className="text-[#888]">Manning Manning-Colebrook Open Channel Flow</span>
              </div>
              <div className="overflow-x-auto border border-[#222] rounded-lg">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#141416] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                      <th className="p-2">ID</th>
                      <th className="p-2">From / To</th>
                      <th className="p-2">Dia (mm)</th>
                      <th className="p-2">Material</th>
                      <th className="p-2">Length (m)</th>
                      <th className="p-2">Slope (%)</th>
                      <th className="p-2">Flow Q (L/s)</th>
                      <th className="p-2">Full Q (L/s)</th>
                      <th className="p-2">Velocity (m/s)</th>
                      <th className="p-2">Fullness (d/D)</th>
                      <th className="p-2">Tractive tau (Pa)</th>
                      <th className="p-2">Froude</th>
                      <th className="p-2">Compliance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e20]">
                    {network.conduits.map((c) => {
                      const dOverD = c.flowDepthRatio ?? 0;
                      const vel = c.actualVelocityMs ?? 0;
                      const tau = c.tractiveForcePa ?? 0;
                      return (
                        <tr key={c.id} className="hover:bg-[#151518] transition-colors">
                          <td className="p-2 font-bold text-white">{c.id}</td>
                          <td className="p-2 text-[#aaa]">{c.startNodeId} → {c.endNodeId}</td>
                          <td className="p-2 text-white font-mono">{c.diameterMm}</td>
                          <td className="p-2 text-[#888]">{c.material}</td>
                          <td className="p-2 text-[#aaa] font-mono">{c.lengthM.toFixed(1)}</td>
                          <td className="p-2 text-white font-mono">{(c.slopeMPerM * 100).toFixed(3)}%</td>
                          <td className="p-2 text-amber-400 font-bold font-mono">{c.designFlowLs?.toFixed(2)}</td>
                          <td className="p-2 text-[#888] font-mono">{c.fullCapacityLs?.toFixed(1)}</td>
                          <td
                            className={`p-2 font-mono font-bold ${
                              vel < 0.6 ? 'text-amber-400' : vel > 3.0 ? 'text-red-400' : 'text-emerald-400'
                            }`}
                          >
                            {vel.toFixed(2)}
                          </td>
                          <td
                            className={`p-2 font-mono font-bold ${
                              dOverD > 1.0 ? 'text-red-400' : dOverD > 0.8 ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            {dOverD.toFixed(2)}
                          </td>
                          <td
                            className={`p-2 font-mono ${
                              tau < 1.5 ? 'text-amber-400 font-bold' : 'text-[#aaa]'
                            }`}
                          >
                            {tau.toFixed(2)}
                          </td>
                          <td className="p-2 text-[#888] font-mono">{c.froudeNumber?.toFixed(2)}</td>
                          <td className="p-2">
                            {c.isSurcharged ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-bold">
                                SURCHARGED
                              </span>
                            ) : !c.selfCleansingOk ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                                V &lt; 0.6 m/s
                              </span>
                            ) : !c.scourVelocityOk ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
                                SCOUR &gt; 3m/s
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                                OPTIMAL
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: MANHOLES SCHEDULE */}
          {activeTab === 'manholes' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-tech text-white uppercase font-bold tracking-wider">
                  Manhole Chamber & Inflow Schedule ({network.manholes.length} structures)
                </span>
                <span className="text-[#888]">Real Earth DEM Ground Elevations</span>
              </div>
              <div className="overflow-x-auto border border-[#222] rounded-lg">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#141416] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                      <th className="p-2">ID</th>
                      <th className="p-2">Rim (m MSL)</th>
                      <th className="p-2">Invert (m MSL)</th>
                      <th className="p-2">Depth (m)</th>
                      <th className="p-2">Population</th>
                      <th className="p-2">Formula</th>
                      <th className="p-2">ADWF (L/s)</th>
                      <th className="p-2">Peak Sanitary (L/s)</th>
                      <th className="p-2">Total Inflow (L/s)</th>
                      <th className="p-2">HGL Elev (m)</th>
                      <th className="p-2">Drop Structure</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e20]">
                    {network.manholes.map((m) => (
                      <tr key={m.id} className="hover:bg-[#151518] transition-colors">
                        <td className="p-2 font-bold text-white">{m.id}</td>
                        <td className="p-2 text-emerald-400 font-mono">{m.rimElevation.toFixed(2)}</td>
                        <td className="p-2 text-amber-400 font-mono">{m.invertElevation.toFixed(2)}</td>
                        <td className="p-2 text-white font-mono">{m.depth.toFixed(2)}</td>
                        <td className="p-2 text-[#aaa] font-mono">{m.population.toLocaleString()}</td>
                        <td className="p-2 text-[#888] uppercase">{m.peakingFormula}</td>
                        <td className="p-2 text-[#aaa] font-mono">{m.averageSanitaryFlowLs?.toFixed(2) ?? '-'}</td>
                        <td className="p-2 text-amber-400 font-bold font-mono">{m.peakSanitaryFlowLs?.toFixed(2) ?? '-'}</td>
                        <td className="p-2 text-white font-bold font-mono">{m.totalInflowLs?.toFixed(2) ?? '-'}</td>
                        <td className="p-2 text-sky-400 font-mono">{m.waterElevationM?.toFixed(2) ?? '-'}</td>
                        <td className="p-2 font-mono">
                          {m.hasDropConnection ? (
                            <span className="text-amber-400 text-[10px]">Drop ({m.dropHeightM?.toFixed(2)}m)</span>
                          ) : (
                            <span className="text-[#666] text-[10px]">None</span>
                          )}
                        </td>
                        <td className="p-2">
                          {m.isFlooding ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-bold">
                              SURFACE FLOOD
                            </span>
                          ) : m.isSurcharged ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                              SURCHARGED
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                              NORMAL
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: LIFT STATIONS & PUMPS */}
          {activeTab === 'liftstations' && (
            <div className="space-y-4">
              <span className="font-tech text-white uppercase font-bold tracking-wider text-xs block">
                Lift Stations, Wet Wells & Sewage Pumps
              </span>

              {/* Wet Wells */}
              <div className="border border-[#222] rounded-lg overflow-hidden">
                <div className="p-2.5 bg-[#141416] border-b border-[#222] text-amber-400 font-tech font-bold uppercase text-[11px]">
                  Wet Well Sump Inflow & Cycling Schedule
                </div>
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#101012] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                      <th className="p-2">Sump ID</th>
                      <th className="p-2">Rim Elev</th>
                      <th className="p-2">Floor Elev</th>
                      <th className="p-2">Diameter (m)</th>
                      <th className="p-2">Volume (m³)</th>
                      <th className="p-2">Inflow (L/s)</th>
                      <th className="p-2">Cycle Time (min)</th>
                      <th className="p-2">Starts/Hour</th>
                      <th className="p-2">Cycle Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e20]">
                    {network.wetWells.map((w) => {
                      const cyc = (summary.liftStationCycleResults || []).find((c) => c.wetWellId === w.id);
                      return (
                        <tr key={w.id} className="hover:bg-[#151518]">
                          <td className="p-2 font-bold text-white">{w.id}</td>
                          <td className="p-2 text-emerald-400 font-mono">{w.rimElevation.toFixed(2)}m</td>
                          <td className="p-2 text-amber-400 font-mono">{w.floorElevation.toFixed(2)}m</td>
                          <td className="p-2 text-white font-mono">{w.diameterM}m</td>
                          <td className="p-2 text-sky-400 font-mono">{w.storageVolumeM3} m³</td>
                          <td className="p-2 text-amber-400 font-bold font-mono">{w.inflowLs?.toFixed(2) ?? '-'}</td>
                          <td className="p-2 text-white font-mono">{cyc?.cycleTimeMinutes ?? '-'} min</td>
                          <td className="p-2 font-bold text-white font-mono">{cyc?.startsPerHour ?? '-'}</td>
                          <td className="p-2">
                            {cyc && cyc.isCyclingAcceptable ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                                COMPLIANT (&le;10/hr)
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                                RAPID CYCLING
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pumps */}
              <div className="border border-[#222] rounded-lg overflow-hidden">
                <div className="p-2.5 bg-[#141416] border-b border-[#222] text-amber-400 font-tech font-bold uppercase text-[11px]">
                  Sewage Pump Head-Capacity & Operating Duty Points
                </div>
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#101012] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                      <th className="p-2">Pump ID</th>
                      <th className="p-2">From Node</th>
                      <th className="p-2">To Node</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Rated Q (L/s)</th>
                      <th className="p-2">Rated Head (m)</th>
                      <th className="p-2">Operating Q (L/s)</th>
                      <th className="p-2">Operating Head (m)</th>
                      <th className="p-2">Efficiency (%)</th>
                      <th className="p-2">Motor Power (kW)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e20]">
                    {network.pumps.map((p) => (
                      <tr key={p.id} className="hover:bg-[#151518]">
                        <td className="p-2 font-bold text-white">{p.id}</td>
                        <td className="p-2 text-[#aaa]">{p.startNodeId}</td>
                        <td className="p-2 text-[#aaa]">{p.endNodeId}</td>
                        <td className="p-2">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                              p.status === 'ON' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {p.status === 'ON' ? 'RUNNING' : 'STANDBY'}
                          </span>
                        </td>
                        <td className="p-2 text-white font-mono">{p.ratedDischargeLs}</td>
                        <td className="p-2 text-white font-mono">{p.dynamicHeadM}m</td>
                        <td className="p-2 text-emerald-400 font-bold font-mono">{p.operatingFlowLs ?? p.ratedDischargeLs}</td>
                        <td className="p-2 text-emerald-400 font-bold font-mono">{p.operatingHeadM ?? p.dynamicHeadM}m</td>
                        <td className="p-2 text-[#aaa] font-mono">{p.efficiencyPercent}%</td>
                        <td className="p-2 text-amber-400 font-bold font-mono">{p.powerKw ?? '-'} kW</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: AUTO-DESIGN SIZING */}
          {activeTab === 'autodesign' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-tech text-white uppercase font-bold tracking-wider text-xs block">
                    Automated Constraint-Based Gravity Sewer Sizing & Grade Optimization
                  </span>
                  <span className="text-[11px] text-[#888]">
                    Standard sizing criteria: Capacity d/D &le; 0.80, Self-cleansing V &ge; 0.60 m/s, Scour V &le; 3.00 m/s, Cover &ge; 1.20m.
                  </span>
                </div>
                {onApplyAutoDesign && (
                  <button
                    onClick={onApplyAutoDesign}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer font-tech"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Apply Recommended Sizing to Model</span>
                  </button>
                )}
              </div>

              <div className="overflow-x-auto border border-[#222] rounded-lg">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#141416] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                      <th className="p-2">Conduit</th>
                      <th className="p-2">Current Dia</th>
                      <th className="p-2">Sized Dia</th>
                      <th className="p-2">Current Slope</th>
                      <th className="p-2">Sized Slope</th>
                      <th className="p-2">Cover Depth</th>
                      <th className="p-2">Design Status</th>
                      <th className="p-2">Engineering Justification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e20]">
                    {(summary.constraintDesignResults || []).map((opt) => (
                      <tr key={opt.conduitId} className="hover:bg-[#151518]">
                        <td className="p-2 font-bold text-white">{opt.conduitId}</td>
                        <td className="p-2 text-[#aaa] font-mono">{opt.currentDiameterMm}mm</td>
                        <td
                          className={`p-2 font-mono font-bold ${
                            opt.recommendedDiameterMm !== opt.currentDiameterMm ? 'text-purple-400' : 'text-emerald-400'
                          }`}
                        >
                          {opt.recommendedDiameterMm}mm
                        </td>
                        <td className="p-2 text-[#aaa] font-mono">{opt.currentSlopePercent.toFixed(3)}%</td>
                        <td className="p-2 text-white font-mono">{opt.recommendedSlopePercent.toFixed(3)}%</td>
                        <td className="p-2 text-white font-mono">{opt.coverDepthM.toFixed(2)}m</td>
                        <td className="p-2">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                              opt.designStatus === 'Optimal'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {opt.designStatus}
                          </span>
                        </td>
                        <td className="p-2 text-[#aaa] text-[10px] max-w-xs">{opt.designNote}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: H2S & CORROSION */}
          {activeTab === 'h2s' && (
            <div className="space-y-4">
              <div>
                <span className="font-tech text-white uppercase font-bold tracking-wider text-xs block">
                  Pomeroy-Parkhurst Hydrogen Sulfide (H2S) & Concrete Crown Corrosion
                </span>
                <span className="text-[11px] text-[#888]">
                  Predicts dissolved sulfide generation, odor potential, Pomeroy Z-index, and annual concrete crown loss rate (mm/yr).
                </span>
              </div>

              <div className="overflow-x-auto border border-[#222] rounded-lg">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#141416] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                      <th className="p-2">Conduit</th>
                      <th className="p-2">BOD5 (mg/L)</th>
                      <th className="p-2">Temp (°C)</th>
                      <th className="p-2">Pomeroy Z-Index</th>
                      <th className="p-2">Sulfide Buildup (mg/L·hr)</th>
                      <th className="p-2">Odor Risk</th>
                      <th className="p-2">Crown Loss (mm/yr)</th>
                      <th className="p-2">Corrosion Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e20]">
                    {(summary.h2sCorrosionResults || []).map((h) => (
                      <tr key={h.conduitId} className="hover:bg-[#151518]">
                        <td className="p-2 font-bold text-white">{h.conduitId}</td>
                        <td className="p-2 text-[#aaa] font-mono">{h.bod5MgL}</td>
                        <td className="p-2 text-[#aaa] font-mono">{h.temperatureC}°C</td>
                        <td className="p-2 text-white font-bold font-mono">{h.zFactor}</td>
                        <td className="p-2 text-amber-400 font-mono">{h.sulfideBuildupRateMgLHr.toFixed(3)}</td>
                        <td className="p-2 text-[#aaa]">{h.odorRisk}</td>
                        <td className="p-2 text-white font-bold font-mono">{h.crownLossMmPerYear.toFixed(2)} mm/yr</td>
                        <td className="p-2">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                              h.corrosionPotential === 'Severe'
                                ? 'bg-red-500/20 text-red-300'
                                : h.corrosionPotential === 'Moderate'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {h.corrosionPotential}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: INFLOW & INFILTRATION */}
          {activeTab === 'rdii' && (
            <div className="space-y-4">
              <div>
                <span className="font-tech text-white uppercase font-bold tracking-wider text-xs block">
                  Inflow & Infiltration (I&I) & Groundwater Infiltration (GWI) Analysis
                </span>
                <span className="text-[11px] text-[#888]">
                  Separates dry-weather sanitary flow from structural groundwater infiltration and rainfall-derived inflow (RDII).
                </span>
              </div>

              <div className="overflow-x-auto border border-[#222] rounded-lg">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#141416] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                      <th className="p-2">Manhole ID</th>
                      <th className="p-2">Base Sanitary (L/s)</th>
                      <th className="p-2">Groundwater GWI (L/s)</th>
                      <th className="p-2">Storm RDII (L/s)</th>
                      <th className="p-2">Total Wet Peak (L/s)</th>
                      <th className="p-2">Dilution Ratio</th>
                      <th className="p-2">Infiltration Priority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e20]">
                    {(summary.inflowInfiltrationResults || []).map((ii) => (
                      <tr key={ii.manholeId} className="hover:bg-[#151518]">
                        <td className="p-2 font-bold text-white">{ii.manholeId}</td>
                        <td className="p-2 text-[#aaa] font-mono">{ii.dryWeatherFlowLs.toFixed(2)}</td>
                        <td className="p-2 text-sky-400 font-mono">{ii.gwiFlowLs.toFixed(2)}</td>
                        <td className="p-2 text-amber-400 font-mono">{ii.rdiiFlowLs.toFixed(2)}</td>
                        <td className="p-2 text-white font-bold font-mono">{ii.totalWetWeatherPeakLs.toFixed(2)}</td>
                        <td className="p-2 text-purple-300 font-bold font-mono">{ii.dilutionRatio.toFixed(1)}x</td>
                        <td className="p-2">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                              ii.dilutionRatio > 4.0
                                ? 'bg-red-500/20 text-red-300'
                                : ii.dilutionRatio > 2.5
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {ii.dilutionRatio > 4.0 ? 'High Infiltration' : ii.dilutionRatio > 2.5 ? 'Moderate' : 'Low / Sealed'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 8: 24-HR DIURNAL EPS */}
          {activeTab === 'eps' && (
            <div className="space-y-4">
              <div>
                <span className="font-tech text-white uppercase font-bold tracking-wider text-xs block">
                  Extended Period Simulation (EPS) 24-Hour Diurnal Dynamic Routing
                </span>
                <span className="text-[11px] text-[#888]">
                  Hour-by-hour dynamic diurnal wastewater generation, conduit capacity utilization, and lift station cycling.
                </span>
              </div>

              <div className="overflow-x-auto border border-[#222] rounded-lg">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#141416] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                      <th className="p-2">Hour</th>
                      <th className="p-2">Time</th>
                      <th className="p-2">Diurnal Mult</th>
                      <th className="p-2">Network Flow (L/s)</th>
                      <th className="p-2">Volume (m³/h)</th>
                      <th className="p-2">Max Fullness (d/D)</th>
                      <th className="p-2">Wet Well Level (m)</th>
                      <th className="p-2">Pump Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e20]">
                    {(summary.hourlySimulationPoints || []).map((pt) => (
                      <tr key={pt.hour} className="hover:bg-[#151518]">
                        <td className="p-2 font-mono text-[#888]">{pt.hour}</td>
                        <td className="p-2 font-bold text-white font-mono">{pt.timeLabel}</td>
                        <td className="p-2 text-amber-400 font-mono">{pt.diurnalMultiplier.toFixed(2)}x</td>
                        <td className="p-2 text-white font-bold font-mono">{pt.totalFlowLs.toFixed(1)} L/s</td>
                        <td className="p-2 text-sky-400 font-mono">{(pt.totalFlowLs * 3.6).toFixed(1)} m³/h</td>
                        <td
                          className={`p-2 font-mono font-bold ${
                            pt.maxCapacityUtilization > 0.8 ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {pt.maxCapacityUtilization.toFixed(2)}
                        </td>
                        <td className="p-2 text-sky-300 font-mono">{pt.wetWellWaterLevelM.toFixed(2)}m MSL</td>
                        <td className="p-2">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                              pt.pumpOperatingState === 'ON'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-[#222] text-[#777]'
                            }`}
                          >
                            {pt.pumpOperatingState}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-[#222] bg-[#141416] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {onExportExcel && (
              <button
                onClick={onExportExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1f] hover:bg-[#252528] border border-[#333] text-emerald-400 hover:text-emerald-300 text-xs font-semibold transition-colors cursor-pointer"
                title="Download complete multi-sheet calculation workbook (.xlsx)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Calculation (.xlsx)</span>
              </button>
            )}

            {onExportInp && (
              <button
                onClick={onExportInp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1f] hover:bg-[#252528] border border-[#333] text-amber-400 hover:text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
                title="Export EPA SWMM 5.2 input file (.inp)"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export SWMM (.inp)</span>
              </button>
            )}

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1f] hover:bg-[#252528] border border-[#333] text-[#aaa] hover:text-white text-xs font-semibold transition-colors cursor-pointer"
              title="Print Calculation Report"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Report</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-[#0a0a0a] font-bold text-xs transition-colors cursor-pointer"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
