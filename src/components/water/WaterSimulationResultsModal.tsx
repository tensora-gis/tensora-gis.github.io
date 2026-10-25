import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  WaterDistributionNetwork,
  SimulationSummary,
} from '../../types/waterDistribution';
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
  Waves,
  Database,
  TrendingUp,
  Droplets,
  Zap,
  Gauge,
  Shield,
  Layers,
} from 'lucide-react';

interface WaterSimulationResultsModalProps {
  network: WaterDistributionNetwork;
  summary: SimulationSummary | null;
  onClose: () => void;
  onExportExcel?: () => void;
  onExportInp?: () => void;
  onApplyAutoDesign?: () => void;
}

type WaterReportTab =
  | 'summary'
  | 'pipes'
  | 'junctions'
  | 'assets'
  | 'autodesign'
  | 'fireflow'
  | 'quality'
  | 'transient';

export const WaterSimulationResultsModal: React.FC<WaterSimulationResultsModalProps> = ({
  network,
  summary,
  onClose,
  onExportExcel,
  onExportInp,
  onApplyAutoDesign,
}) => {
  const [activeTab, setActiveTab] = useState<WaterReportTab>('summary');

  if (!summary || typeof document === 'undefined') return null;

  const hasWarnings =
    summary.negativePressureNodes.length > 0 ||
    summary.lowPressureNodes.length > 0 ||
    summary.highVelocityPipes.length > 0;

  const tSummary = summary.transientSurgeSummary;

  const handlePrint = () => {
    window.print();
  };

  const tabs: { id: WaterReportTab; label: string; icon: React.FC<{ className?: string }>; count?: number }[] = [
    { id: 'summary', label: 'Executive Summary', icon: Activity },
    { id: 'pipes', label: 'Pipe Hydraulics', icon: TrendingUp, count: network.pipes.length },
    { id: 'junctions', label: 'Junction Pressures', icon: Gauge, count: network.junctions.length },
    {
      id: 'assets',
      label: 'Tanks, Reservoirs & Pumps',
      icon: Database,
      count: network.tanks.length + network.reservoirs.length + network.pumps.length,
    },
    {
      id: 'autodesign',
      label: 'Pipe Auto-Design',
      icon: Wrench,
      count: (summary.pipeOptimizations || []).filter((p) => p.reason !== 'Optimal').length,
    },
    {
      id: 'fireflow',
      label: 'Fire Flow Assessment',
      icon: Flame,
      count: (summary.fireFlowResults || []).filter((f) => !f.isAdequate).length,
    },
    {
      id: 'quality',
      label: 'Water Quality & Age',
      icon: Droplets,
      count: (summary.waterQualityResults || []).filter((w) => w.qualityStatus !== 'Good').length,
    },
    {
      id: 'transient',
      label: 'Surge & Water Hammer',
      icon: Zap,
      count: (tSummary?.pipesAtCavitationRisk.length || 0) + (tSummary?.pipesAtRuptureRisk.length || 0),
    },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md select-none pointer-events-auto">
      <div className="w-full max-w-6xl max-h-[92vh] bg-[#0f0f10] border border-[#262626] rounded-xl shadow-2xl flex flex-col overflow-hidden relative z-[100000]">
        {/* Modal Header */}
        <div className="px-5 py-3 border-b border-[#222] bg-[#141416] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white font-tech uppercase tracking-wider">
                  Water Distribution Hydraulic Calculation & Transient Surge Report
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                  EPANET GGA & Surge Engine
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
                    ? 'bg-emerald-500 text-[#0a0a0a] font-bold shadow-xs'
                    : 'text-[#888] hover:text-white hover:bg-[#1c1c1f]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                      isActive ? 'bg-black text-emerald-300 font-bold' : 'bg-[#222] text-amber-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Tab Body */}
        <div className="p-5 flex-1 overflow-y-auto text-xs font-mono space-y-4">
          {/* TAB 1: EXECUTIVE SUMMARY */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              {/* Convergence Alert Banner */}
              <div
                className={`p-3.5 rounded-lg border flex items-start gap-3 ${
                  summary.converged
                    ? summary.negativePressureNodes.length > 0
                      ? 'bg-red-500/10 border-red-500/30 text-red-200'
                      : hasWarnings
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-red-500/10 border-red-500/30 text-red-200'
                }`}
              >
                {summary.converged ? (
                  summary.negativePressureNodes.length > 0 ? (
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  ) : hasWarnings ? (
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
                      ? summary.negativePressureNodes.length > 0
                        ? 'Simulation Converged with Negative Pressure Warnings'
                        : hasWarnings
                        ? 'Simulation Converged with Hydraulic Compliance Alerts'
                        : 'EPANET GGA Network Simulation Fully Satisfactory'
                      : 'Simulation Did Not Converge'}
                  </p>
                  <p className="text-[11px] opacity-80 mt-0.5 leading-relaxed">
                    Solved in {summary.iterations} iterations (flow residual: {summary.relativeFlowError} L/s). System demand: {summary.totalDemandLs} L/s, Supply inflow: {summary.totalSupplyLs} L/s. Minimum pressure: {summary.minPressureM} m H2O at node {summary.minPressureNodeId}.
                  </p>
                </div>
              </div>

              {/* Metric Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Flow Balance */}
                <div className="p-3.5 rounded-lg bg-[#141416] border border-[#222] space-y-2.5">
                  <span className="text-[10px] font-tech uppercase font-bold text-emerald-400 flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5" />
                    <span>Mass Continuity Balance</span>
                  </span>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#888]">Consumer Demand:</span>
                      <span className="text-white font-bold">{summary.totalDemandLs} L/s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Source Inflow Supply:</span>
                      <span className="text-emerald-400 font-bold">{summary.totalSupplyLs} L/s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Hourly Flow Rate:</span>
                      <span className="text-sky-300 font-mono">{(summary.totalDemandLs * 3.6).toFixed(1)} m³/h</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-[#222]">
                      <span className="text-[#888]">Continuity Imbalance:</span>
                      <span className="text-[#aaa] font-bold">{summary.flowImbalanceLs} L/s</span>
                    </div>
                  </div>
                </div>

                {/* 2. Pressure & Velocity Extremes */}
                <div className="p-3.5 rounded-lg bg-[#141416] border border-[#222] space-y-2.5">
                  <span className="text-[10px] font-tech uppercase font-bold text-emerald-400 flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5" />
                    <span>Pressure & Velocity Extremes</span>
                  </span>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#888]">Minimum Pressure:</span>
                      <span
                        className={`font-bold ${
                          summary.minPressureM < 0
                            ? 'text-red-400'
                            : summary.minPressureM < 15
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {summary.minPressureM} m ({(summary.minPressureM * 0.098).toFixed(2)} bar) [{summary.minPressureNodeId}]
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Maximum Pressure:</span>
                      <span className="text-white font-bold">
                        {summary.maxPressureM} m ({(summary.maxPressureM * 0.098).toFixed(2)} bar) [{summary.maxPressureNodeId}]
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Maximum Velocity:</span>
                      <span
                        className={`font-bold ${
                          summary.maxVelocityMs > 2.0 ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {summary.maxVelocityMs} m/s [{summary.maxVelocityPipeId}]
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-[#222]">
                      <span className="text-[#888]">Pipes &gt; 2.0 m/s:</span>
                      <span className="text-white font-bold">{summary.highVelocityPipes.length} pipes</span>
                    </div>
                  </div>
                </div>

                {/* 3. Pumping & Water Hammer Overview */}
                <div className="p-3.5 rounded-lg bg-[#141416] border border-[#222] space-y-2.5">
                  <span className="text-[10px] font-tech uppercase font-bold text-emerald-400 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Pumping & Water Hammer</span>
                  </span>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#888]">Pump Power Connected:</span>
                      <span className="text-amber-400 font-bold">{summary.totalPumpPowerKw} kW</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Daily Pumping Energy:</span>
                      <span className="text-emerald-400 font-bold">{summary.dailyEnergyKwh} kWh/day</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">Max Transient Head:</span>
                      <span className="text-amber-400 font-bold font-mono">
                        {tSummary?.maxSystemSurgeHeadM ?? '-'} m MSL
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-[#222]">
                      <span className="text-[#888]">Vapor Cavitation Risk:</span>
                      <span
                        className={`font-bold ${
                          tSummary?.vaporCavitationOccurred ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        {tSummary?.vaporCavitationOccurred ? 'DETECTED' : 'None (Safe)'}
                      </span>
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
                      Copernicus GLO-30 Digital Elevation Model Ground Datum
                    </span>
                    <span className="text-[10px] text-[#888]">
                      Node ground elevations are queried from high-resolution satellite Earth DEMs, establishing true barometric pressures.
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded font-mono">
                  GLO-30 Ground Reference
                </span>
              </div>

              {/* Engineering Warnings Box */}
              {hasWarnings && (
                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-1.5">
                  <span className="font-bold flex items-center gap-1.5 text-xs text-amber-400 font-tech uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Hydraulic Design Attention Required</span>
                  </span>
                  <ul className="text-[11px] list-disc list-inside space-y-1 opacity-90">
                    {summary.negativePressureNodes.length > 0 && (
                      <li>
                        <strong>Negative Pressure Nodes ({summary.negativePressureNodes.length}):</strong>{' '}
                        {summary.negativePressureNodes.join(', ')} experience pressure &lt; 0 m H2O (back-siphonage risk).
                      </li>
                    )}
                    {summary.lowPressureNodes.length > 0 && (
                      <li>
                        <strong>Low Pressure Nodes ({summary.lowPressureNodes.length}):</strong>{' '}
                        {summary.lowPressureNodes.join(', ')} fall below 15 m H2O minimum municipal service standard.
                      </li>
                    )}
                    {summary.highVelocityPipes.length > 0 && (
                      <li>
                        <strong>High Velocity Pipes ({summary.highVelocityPipes.length}):</strong>{' '}
                        {summary.highVelocityPipes.join(', ')} exceed 2.0 m/s scouring and friction loss threshold. Upsizing recommended.
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PIPE HYDRAULICS TABLE */}
          {activeTab === 'pipes' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-tech text-white uppercase font-bold tracking-wider">
                  Pipe Link Hydraulic Performance Schedule ({network.pipes.length} pipes)
                </span>
                <span className="text-[#888]">Hazen-Williams Headloss Formulation</span>
              </div>
              <div className="overflow-x-auto border border-[#222] rounded-lg">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#141416] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                      <th className="p-2">ID</th>
                      <th className="p-2">From / To</th>
                      <th className="p-2">Diameter (mm)</th>
                      <th className="p-2">Material</th>
                      <th className="p-2">Length (m)</th>
                      <th className="p-2">Roughness C</th>
                      <th className="p-2">Flow (L/s)</th>
                      <th className="p-2">Velocity (m/s)</th>
                      <th className="p-2">Headloss (m/km)</th>
                      <th className="p-2">Total Loss (m)</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e20]">
                    {network.pipes.map((p) => {
                      const v = p.velocity ?? 0;
                      const hl = p.unitHeadloss ?? 0;
                      return (
                        <tr key={p.id} className="hover:bg-[#151518] transition-colors">
                          <td className="p-2 font-bold text-white">{p.id}</td>
                          <td className="p-2 text-[#aaa]">{p.startNodeId} → {p.endNodeId}</td>
                          <td className="p-2 text-white font-mono">{p.diameter}</td>
                          <td className="p-2 text-[#888]">{p.material || 'DI'}</td>
                          <td className="p-2 text-[#aaa] font-mono">{p.length.toFixed(1)}</td>
                          <td className="p-2 text-[#888] font-mono">{p.roughness}</td>
                          <td className="p-2 text-emerald-400 font-bold font-mono">{p.flow?.toFixed(2)}</td>
                          <td
                            className={`p-2 font-mono font-bold ${
                              v > 2.0 ? 'text-amber-400' : v < 0.3 ? 'text-[#888]' : 'text-emerald-400'
                            }`}
                          >
                            {v.toFixed(2)}
                          </td>
                          <td className="p-2 text-[#aaa] font-mono">{hl.toFixed(2)}</td>
                          <td className="p-2 text-white font-mono">{p.totalHeadloss?.toFixed(2)}</td>
                          <td className="p-2">
                            {p.status === 'CLOSED' ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-bold">CLOSED</span>
                            ) : v > 2.0 ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">HIGH VEL</span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">OPEN (OK)</span>
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

          {/* TAB 3: JUNCTIONS SCHEDULE */}
          {activeTab === 'junctions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-tech text-white uppercase font-bold tracking-wider">
                  Junction Demand & Pressure Schedule ({network.junctions.length} nodes)
                </span>
                <span className="text-[#888]">1 m H2O &asymp; 0.098 bar &asymp; 1.42 psi</span>
              </div>
              <div className="overflow-x-auto border border-[#222] rounded-lg">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#141416] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                      <th className="p-2">ID</th>
                      <th className="p-2">Elevation (m MSL)</th>
                      <th className="p-2">Base Demand (L/s)</th>
                      <th className="p-2">Actual Demand (L/s)</th>
                      <th className="p-2">Head (m MSL)</th>
                      <th className="p-2">Pressure (m H2O)</th>
                      <th className="p-2">Pressure (bar)</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e20]">
                    {network.junctions.map((j) => {
                      const p = j.pressure ?? 0;
                      return (
                        <tr key={j.id} className="hover:bg-[#151518] transition-colors">
                          <td className="p-2 font-bold text-white">{j.id}</td>
                          <td className="p-2 text-emerald-400 font-mono">{j.elevation.toFixed(2)}</td>
                          <td className="p-2 text-[#aaa] font-mono">{j.baseDemand.toFixed(2)}</td>
                          <td className="p-2 text-white font-mono">{j.actualDemand?.toFixed(2) ?? j.baseDemand.toFixed(2)}</td>
                          <td className="p-2 text-sky-400 font-mono">{j.head?.toFixed(2)}</td>
                          <td
                            className={`p-2 font-mono font-bold ${
                              p < 0 ? 'text-red-400' : p < 15 ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            {p.toFixed(2)}
                          </td>
                          <td className="p-2 text-[#aaa] font-mono">{(p * 0.098).toFixed(2)}</td>
                          <td className="p-2">
                            {p < 0 ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-bold">NEGATIVE</span>
                            ) : p < 15 ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">LOW (&lt;15m)</span>
                            ) : p > 60 ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">HIGH (&gt;60m)</span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">NORMAL</span>
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

          {/* TAB 4: TANKS, RESERVOIRS & PUMPS */}
          {activeTab === 'assets' && (
            <div className="space-y-4">
              <span className="font-tech text-white uppercase font-bold tracking-wider text-xs block">
                Storage Tanks, Sources & Pumping Stations
              </span>

              {/* Pumps */}
              {network.pumps.length > 0 && (
                <div className="border border-[#222] rounded-lg overflow-hidden">
                  <div className="p-2.5 bg-[#141416] border-b border-[#222] text-emerald-400 font-tech font-bold uppercase text-[11px]">
                    Booster Pump Operating Duty Points
                  </div>
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-[#101012] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                        <th className="p-2">ID</th>
                        <th className="p-2">Suction Node</th>
                        <th className="p-2">Discharge Node</th>
                        <th className="p-2">Design Q (L/s)</th>
                        <th className="p-2">Design Head (m)</th>
                        <th className="p-2">Operating Q (L/s)</th>
                        <th className="p-2">Operating Head (m)</th>
                        <th className="p-2">Motor Power (kW)</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e1e20]">
                      {network.pumps.map((p) => (
                        <tr key={p.id} className="hover:bg-[#151518]">
                          <td className="p-2 font-bold text-white">{p.id}</td>
                          <td className="p-2 text-[#aaa]">{p.startNodeId}</td>
                          <td className="p-2 text-[#aaa]">{p.endNodeId}</td>
                          <td className="p-2 text-white font-mono">{p.designFlow}</td>
                          <td className="p-2 text-white font-mono">{p.designHead}</td>
                          <td className="p-2 text-emerald-400 font-bold font-mono">{p.operatingFlow?.toFixed(2)}</td>
                          <td className="p-2 text-emerald-400 font-bold font-mono">{p.operatingHead?.toFixed(2)}</td>
                          <td className="p-2 text-amber-400 font-bold font-mono">{p.powerKw} kW</td>
                          <td className="p-2">
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tanks & Reservoirs */}
              <div className="border border-[#222] rounded-lg overflow-hidden">
                <div className="p-2.5 bg-[#141416] border-b border-[#222] text-sky-400 font-tech font-bold uppercase text-[11px]">
                  Water Reservoirs & Elevated Storage Tanks
                </div>
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#101012] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                      <th className="p-2">Asset ID</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Base Elev (m MSL)</th>
                      <th className="p-2">Operating Head (m MSL)</th>
                      <th className="p-2">Dimensions</th>
                      <th className="p-2">Net Supply Flow (L/s)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e20]">
                    {network.reservoirs.map((r) => (
                      <tr key={r.id} className="hover:bg-[#151518]">
                        <td className="p-2 font-bold text-white">{r.id}</td>
                        <td className="p-2 text-sky-400 font-bold">Reservoir (Infinite Source)</td>
                        <td className="p-2 text-emerald-400 font-mono">{r.elevation.toFixed(2)}</td>
                        <td className="p-2 text-sky-300 font-mono font-bold">{r.totalHead.toFixed(2)}</td>
                        <td className="p-2 text-[#777]">Natural Storage Basin</td>
                        <td className="p-2 text-emerald-400 font-bold font-mono">{r.netFlow?.toFixed(2) ?? '-'}</td>
                      </tr>
                    ))}
                    {network.tanks.map((t) => (
                      <tr key={t.id} className="hover:bg-[#151518]">
                        <td className="p-2 font-bold text-white">{t.id}</td>
                        <td className="p-2 text-amber-400 font-bold">Elevated Storage Tank</td>
                        <td className="p-2 text-emerald-400 font-mono">{t.elevation.toFixed(2)}</td>
                        <td className="p-2 text-amber-300 font-mono font-bold">{(t.elevation + t.initialLevel).toFixed(2)}</td>
                        <td className="p-2 text-white font-mono">{t.diameter}m Dia (Depth: {t.initialLevel}m)</td>
                        <td className="p-2 text-emerald-400 font-bold font-mono">{t.netFlow?.toFixed(2) ?? '-'}</td>
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
                    Darwin-Style Automated Pipe Sizing & Rehabilitation Optimization
                  </span>
                  <span className="text-[11px] text-[#888]">
                    Evaluates commercial standard diameters to eliminate high friction headlosses and scouring velocities.
                  </span>
                </div>
                {onApplyAutoDesign && (
                  <button
                    onClick={onApplyAutoDesign}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer font-tech"
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
                      <th className="p-2">Pipe ID</th>
                      <th className="p-2">Current Dia</th>
                      <th className="p-2">Sized Dia</th>
                      <th className="p-2">Velocity (m/s)</th>
                      <th className="p-2">Loss (m/km)</th>
                      <th className="p-2">Design Evaluation</th>
                      <th className="p-2">Engineering Recommendation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e20]">
                    {(summary.pipeOptimizations || []).map((opt) => (
                      <tr key={opt.pipeId} className="hover:bg-[#151518]">
                        <td className="p-2 font-bold text-white">{opt.pipeId}</td>
                        <td className="p-2 text-[#aaa] font-mono">{opt.currentDiameterMm}mm</td>
                        <td
                          className={`p-2 font-mono font-bold ${
                            opt.recommendedDiameterMm !== opt.currentDiameterMm ? 'text-emerald-400' : 'text-[#888]'
                          }`}
                        >
                          DN{opt.recommendedDiameterMm}
                        </td>
                        <td className="p-2 text-white font-mono">{opt.velocityMs.toFixed(2)}</td>
                        <td className="p-2 text-white font-mono">{opt.unitHeadlossMkm.toFixed(2)}</td>
                        <td className="p-2">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                              opt.reason === 'Optimal'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {opt.reason}
                          </span>
                        </td>
                        <td className="p-2 text-[#aaa] text-[10px] max-w-sm">{opt.estimatedCostSavingOrUpgrade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: FIRE FLOW ASSESSMENT */}
          {activeTab === 'fireflow' && (
            <div className="space-y-4">
              <div>
                <span className="font-tech text-white uppercase font-bold tracking-wider text-xs block">
                  Municipal Fire Flow Capacity Assessment
                </span>
                <span className="text-[11px] text-[#888]">
                  Determines maximum available hydrant fire flow while maintaining at least 15.0 m H2O (21.3 psi) residual service pressure.
                </span>
              </div>

              <div className="overflow-x-auto border border-[#222] rounded-lg">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#141416] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                      <th className="p-2">Junction</th>
                      <th className="p-2">Base Demand (L/s)</th>
                      <th className="p-2">Available Fire Flow (L/s)</th>
                      <th className="p-2">Flow (GPM)</th>
                      <th className="p-2">Residual P (m)</th>
                      <th className="p-2">System Min Residual (m)</th>
                      <th className="p-2">Adequacy (&ge;35 L/s)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e20]">
                    {(summary.fireFlowResults || []).map((ff) => (
                      <tr key={ff.junctionId} className="hover:bg-[#151518]">
                        <td className="p-2 font-bold text-white">{ff.junctionId}</td>
                        <td className="p-2 text-[#aaa] font-mono">{ff.baseDemand.toFixed(2)}</td>
                        <td className="p-2 text-amber-400 font-bold font-mono">{ff.availableFireFlowLs.toFixed(1)}</td>
                        <td className="p-2 text-sky-400 font-mono">{Math.round(ff.availableFireFlowLs * 15.85)}</td>
                        <td className="p-2 text-emerald-400 font-mono">{ff.residualPressureM.toFixed(1)}</td>
                        <td className="p-2 text-white font-mono">{ff.systemMinResidualM.toFixed(1)}</td>
                        <td className="p-2">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                              ff.isAdequate ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                            }`}
                          >
                            {ff.isAdequate ? 'PASS: Municipal Class A' : 'DEFICIENT'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: WATER QUALITY & AGE */}
          {activeTab === 'quality' && (
            <div className="space-y-4">
              <div>
                <span className="font-tech text-white uppercase font-bold tracking-wider text-xs block">
                  Water Quality, Residence Age & Free Chlorine Decay
                </span>
                <span className="text-[11px] text-[#888]">
                  Models disinfectant chlorine residual decay and hydraulic travel residence time from distribution sources.
                </span>
              </div>

              <div className="overflow-x-auto border border-[#222] rounded-lg">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#141416] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                      <th className="p-2">Node ID</th>
                      <th className="p-2">Water Age (Hours)</th>
                      <th className="p-2">Free Chlorine (mg/L)</th>
                      <th className="p-2">Disinfection Status</th>
                      <th className="p-2">Recommended Operational Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e20]">
                    {(summary.waterQualityResults || []).map((wq) => (
                      <tr key={wq.nodeId} className="hover:bg-[#151518]">
                        <td className="p-2 font-bold text-white">{wq.nodeId}</td>
                        <td className="p-2 text-sky-300 font-mono font-bold">{wq.waterAgeHours.toFixed(1)} hrs</td>
                        <td
                          className={`p-2 font-mono font-bold ${
                            wq.chlorineResidualMgL < 0.2
                              ? 'text-red-400'
                              : wq.chlorineResidualMgL < 0.5
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {wq.chlorineResidualMgL.toFixed(2)} mg/L
                        </td>
                        <td className="p-2">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                              wq.qualityStatus === 'Good'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : wq.qualityStatus === 'Fair'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-red-500/20 text-red-300'
                            }`}
                          >
                            {wq.qualityStatus}
                          </span>
                        </td>
                        <td className="p-2 text-[#aaa] text-[10px]">
                          {wq.qualityStatus === 'Low-Chlorine'
                            ? 'Booster chlorination dosing required'
                            : wq.qualityStatus === 'Stagnant'
                            ? 'Periodic distribution main dead-end flushing'
                            : 'Optimal disinfection residual maintained'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 8: TRANSIENT SURGE & WATER HAMMER (HAMMER ENGINE) */}
          {activeTab === 'transient' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-tech text-white uppercase font-bold tracking-wider text-xs block">
                    Hydraulic Transient Surge & Water Hammer Analysis (Surge Engine)
                  </span>
                  <span className="text-[11px] text-[#888]">
                    Joukowsky & Allievi pressure wave propagation, acoustic wave speeds, column separation cavitation, and protection device sizing.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-tech text-[#888]">Scenario:</span>
                  <span className="text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded text-[11px] font-mono font-bold">
                    {tSummary?.scenario === 'PUMP_TRIP' ? 'Pump Power Trip' : 'Rapid Valve Closure'}
                  </span>
                </div>
              </div>

              {/* Transient Headline Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-[#141416] border border-[#222]">
                  <span className="text-[10px] text-[#737373] block uppercase font-tech">Maximum Transient Head</span>
                  <span className="text-amber-400 text-base font-bold font-mono">
                    {tSummary?.maxSystemSurgeHeadM ?? 0} m MSL
                  </span>
                  <span className="text-[10px] text-[#888] block">At Node {tSummary?.criticalHighPressureNodeId}</span>
                </div>
                <div className="p-3 rounded-lg bg-[#141416] border border-[#222]">
                  <span className="text-[10px] text-[#737373] block uppercase font-tech">Minimum Transient Head</span>
                  <span
                    className={`text-base font-bold font-mono ${
                      (tSummary?.minSystemSurgeHeadM ?? 0) < 0 ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {tSummary?.minSystemSurgeHeadM ?? 0} m MSL
                  </span>
                  <span className="text-[10px] text-[#888] block">At Node {tSummary?.criticalCavitationNodeId}</span>
                </div>
                <div className="p-3 rounded-lg bg-[#141416] border border-[#222]">
                  <span className="text-[10px] text-[#737373] block uppercase font-tech">Vapor Cavitation Risk</span>
                  <span
                    className={`text-sm font-bold font-tech uppercase ${
                      tSummary?.vaporCavitationOccurred ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {tSummary?.vaporCavitationOccurred ? 'Severe Column Separation' : 'None Detected'}
                  </span>
                  <span className="text-[10px] text-[#888] block">P_vap &lt; -10m H2O threshold</span>
                </div>
                <div className="p-3 rounded-lg bg-[#141416] border border-[#222]">
                  <span className="text-[10px] text-[#737373] block uppercase font-tech">Air Vessel Protection</span>
                  <span className="text-emerald-400 text-base font-bold font-mono">
                    {tSummary?.airVesselRecommendedVolumeM3 ?? 0} m³
                  </span>
                  <span className="text-[10px] text-[#888] block">Recommended vessel sizing</span>
                </div>
              </div>

              {/* Surge Protection Device Sizing Schedule */}
              {(tSummary?.protectionDevices || []).length > 0 && (
                <div className="border border-[#222] rounded-lg overflow-hidden">
                  <div className="p-2.5 bg-[#141416] border-b border-[#222] text-amber-400 font-tech font-bold uppercase text-[11px] flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Surge Protection Device Sizing & Mitigation Schedule</span>
                  </div>
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-[#101012] text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                        <th className="p-2">Device Type</th>
                        <th className="p-2">Location Node</th>
                        <th className="p-2">Recommended Capacity / Specification</th>
                        <th className="p-2">Mitigated Max Head</th>
                        <th className="p-2">Mitigated Min Head</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e1e20]">
                      {tSummary?.protectionDevices.map((dev, idx) => (
                        <tr key={idx} className="hover:bg-[#151518]">
                          <td className="p-2 font-bold text-white uppercase">{dev.type.replace('_', ' ')}</td>
                          <td className="p-2 text-amber-400 font-mono">{dev.locationNodeId}</td>
                          <td className="p-2 text-white font-mono">{dev.recommendedSize}</td>
                          <td className="p-2 text-emerald-400 font-mono font-bold">{dev.mitigatedMaxHeadM} m MSL</td>
                          <td className="p-2 text-emerald-400 font-mono font-bold">{dev.mitigatedMinHeadM} m MSL</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pipe-by-Pipe Transient Surge Schedule */}
              <div className="border border-[#222] rounded-lg overflow-hidden">
                <div className="p-2.5 bg-[#141416] border-b border-[#222] text-sky-400 font-tech font-bold uppercase text-[11px]">
                  Pipeline Acoustic Celerity & Joukowsky Surge Schedule
                </div>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="sticky top-0 bg-[#141416] z-10">
                      <tr className="text-[#888] font-tech uppercase text-[10px] border-b border-[#222]">
                        <th className="p-2">Pipe</th>
                        <th className="p-2">Material</th>
                        <th className="p-2">Wave Speed a</th>
                        <th className="p-2">Period 2L/a</th>
                        <th className="p-2">V0 (m/s)</th>
                        <th className="p-2">Surge &Delta;H</th>
                        <th className="p-2">Max Head</th>
                        <th className="p-2">Max Bar</th>
                        <th className="p-2">Min Head</th>
                        <th className="p-2">PN Rating</th>
                        <th className="p-2">Overpressure</th>
                        <th className="p-2">Cavitation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e1e20]">
                      {(tSummary?.pipeResults || []).map((t) => (
                        <tr key={t.pipeId} className="hover:bg-[#151518]">
                          <td className="p-2 font-bold text-white">{t.pipeId}</td>
                          <td className="p-2 text-[#aaa]">{t.pipeMaterial}</td>
                          <td className="p-2 text-white font-mono">{t.waveSpeedMs} m/s</td>
                          <td className="p-2 text-[#888] font-mono">{t.acousticPeriodSec.toFixed(2)}s</td>
                          <td className="p-2 text-white font-mono">{t.initialVelocityMs.toFixed(2)}</td>
                          <td className="p-2 text-amber-400 font-bold font-mono">+{t.joukowskySurgeM.toFixed(1)}m</td>
                          <td className="p-2 text-white font-mono font-bold">{t.maxTransientHeadM.toFixed(1)}m</td>
                          <td className="p-2 text-amber-300 font-mono">{t.maxTransientPressureBar.toFixed(1)}</td>
                          <td
                            className={`p-2 font-mono font-bold ${
                              t.minTransientHeadM < 0 ? 'text-red-400' : 'text-[#aaa]'
                            }`}
                          >
                            {t.minTransientHeadM.toFixed(1)}m
                          </td>
                          <td className="p-2 text-[#888] font-mono">PN{t.pressureRatingPnBar}</td>
                          <td className="p-2">
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                t.overpressureRisk.includes('Severe')
                                  ? 'bg-red-500/20 text-red-300'
                                  : t.overpressureRisk.includes('Warning')
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {t.overpressureRisk}
                            </span>
                          </td>
                          <td className="p-2">
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                t.cavitationRisk.includes('Severe')
                                  ? 'bg-red-500/20 text-red-300'
                                  : t.cavitationRisk.includes('Sub')
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {t.cavitationRisk}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                title="Download 11-sheet calculation workbook (.xlsx)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Calculation (.xlsx)</span>
              </button>
            )}

            {onExportInp && (
              <button
                onClick={onExportInp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1f] hover:bg-[#252528] border border-[#333] text-amber-400 hover:text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
                title="Export EPANET 2.2 input file (.inp)"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export EPANET (.inp)</span>
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
            className="px-5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-[#0a0a0a] font-bold text-xs transition-colors cursor-pointer"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
