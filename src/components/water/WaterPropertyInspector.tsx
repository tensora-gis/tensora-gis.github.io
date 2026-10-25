import React from 'react';
import {
  NetworkElement,
  WaterJunction,
  WaterPipe,
  WaterPump,
  WaterReservoir,
  WaterTank,
  WaterValve,
  ValveType,
} from '../../types/waterDistribution';
import { sampleGroundElevation } from '../../utils/waterTerrainService';
import {
  X,
  Mountain,
  SlidersHorizontal,
  AlertTriangle,
  CircleDot,
  GitCommit,
  Waves,
  Database,
  Zap,
  ShieldAlert,
  ShieldCheck,
  Flame,
  Droplets,
  Clock,
} from 'lucide-react';

const PumpInspectorIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="8" />
    <polygon points="9,8 16,12 9,16" fill="currentColor" stroke="none" />
  </svg>
);

interface WaterPropertyInspectorProps {
  element: NetworkElement | null;
  onClose: () => void;
  onUpdateElement: (updated: NetworkElement) => void;
  onDeleteElement: (id: string, type: NetworkElement['type']) => void;
}

export const WaterPropertyInspector: React.FC<WaterPropertyInspectorProps> = ({
  element,
  onClose,
  onUpdateElement,
  onDeleteElement,
}) => {
  if (!element) return null;

  const handleSampleDem = async () => {
    if ('lat' in element && 'lng' in element) {
      const elev = await sampleGroundElevation(element.lat, element.lng);
      if (elev !== null) {
        onUpdateElement({ ...element, elevation: Math.round(elev * 10) / 10 });
      }
    }
  };

  return (
    <div className="w-80 bg-[#111] border-l border-[#222] flex flex-col h-full z-20 select-none shadow-2xl shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-[#222] flex items-center justify-between bg-[#141414]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[#1c1c1c] border border-[#262626] flex items-center justify-center text-amber-500">
            {element.type === 'junction' && <CircleDot className="w-3.5 h-3.5" />}
            {element.type === 'pipe' && <GitCommit className="w-3.5 h-3.5" />}
            {element.type === 'reservoir' && <Waves className="w-3.5 h-3.5" />}
            {element.type === 'tank' && <Database className="w-3.5 h-3.5" />}
            {element.type === 'pump' && <PumpInspectorIcon className="w-3.5 h-3.5" />}
            {element.type === 'valve' && <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white font-tech uppercase tracking-wider">
              {element.type} Properties
            </span>
            <span className="text-[10px] text-[#737373] font-mono">{element.id}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[#222] text-[#737373] hover:text-white transition-colors"
          title="Close Inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Property Fields */}
      <div className="p-4 space-y-3.5 text-xs">
        {/* Label */}
        <div>
          <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
            Element Label / Tag
          </label>
          <input
            type="text"
            value={element.label || ''}
            onChange={(e) => onUpdateElement({ ...element, label: e.target.value })}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* --- JUNCTION SPECIFIC --- */}
        {element.type === 'junction' && (
          <>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase font-tech text-[#737373]">
                  Ground Elevation (m MSL)
                </label>
                <button
                  type="button"
                  onClick={handleSampleDem}
                  className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-tech"
                >
                  <Mountain className="w-3 h-3" />
                  <span>Sample DEM</span>
                </button>
              </div>
              <input
                type="number"
                step="0.1"
                value={(element as WaterJunction).elevation}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    elevation: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Base Demand (L/s)
              </label>
              <input
                type="number"
                step="0.5"
                value={(element as WaterJunction).baseDemand}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    baseDemand: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Simulation Results (if computed) */}
            {(element as WaterJunction).pressure !== undefined && (
              <div className="mt-4 p-3 rounded-lg bg-[#0a0a0a] border border-[#222] space-y-1.5">
                <span className="text-[10px] font-tech font-bold uppercase tracking-wider text-amber-400">
                  Computed Hydraulic Results
                </span>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Hydraulic Head:</span>
                  <span className="font-mono text-white">{(element as WaterJunction).head} m MSL</span>
                </div>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Service Pressure:</span>
                  <span
                    className={`font-mono font-bold ${(element as WaterJunction).pressure! < 0 ? 'text-red-400' : (element as WaterJunction).pressure! < 15 ? 'text-amber-400' : 'text-emerald-400'}`}
                  >
                    {(element as WaterJunction).pressure} m H2O
                  </span>
                </div>
                <div className="flex justify-between text-xs text-[#737373] font-mono">
                  <span>In PSI:</span>
                  <span>{((element as WaterJunction).pressure! * 1.42).toFixed(1)} psi</span>
                </div>

                {/* Fire Flow */}
                {(element as WaterJunction).actualFireFlowLs !== undefined && (
                  <div className="flex justify-between text-xs text-[#a3a3a3] pt-1 border-t border-[#1a1a1a]">
                    <span className="flex items-center gap-1 text-orange-400">
                      <Flame className="w-3 h-3" />
                      <span>Fire Flow Available:</span>
                    </span>
                    <span className="font-mono text-white font-bold">
                      {(element as WaterJunction).actualFireFlowLs} L/s
                    </span>
                  </div>
                )}

                {/* Water Age */}
                {(element as WaterJunction).waterAgeHours !== undefined && (
                  <div className="flex justify-between text-xs text-[#a3a3a3]">
                    <span className="flex items-center gap-1 text-cyan-400">
                      <Clock className="w-3 h-3" />
                      <span>Water Age:</span>
                    </span>
                    <span className="font-mono text-white font-bold">
                      {(element as WaterJunction).waterAgeHours} hrs
                    </span>
                  </div>
                )}

                {/* Chlorine Residual */}
                {(element as WaterJunction).chlorineResidualMgL !== undefined && (
                  <div className="flex justify-between text-xs text-[#a3a3a3]">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <Droplets className="w-3 h-3" />
                      <span>Chlorine Residual:</span>
                    </span>
                    <span className="font-mono text-white font-bold">
                      {(element as WaterJunction).chlorineResidualMgL} mg/L
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* --- PIPE SPECIFIC --- */}
        {element.type === 'pipe' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Start Node
                </label>
                <div className="p-1.5 bg-[#0a0a0a] border border-[#222] rounded text-white font-mono text-xs truncate">
                  {(element as WaterPipe).startNodeId}
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  End Node
                </label>
                <div className="p-1.5 bg-[#0a0a0a] border border-[#222] rounded text-white font-mono text-xs truncate">
                  {(element as WaterPipe).endNodeId}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Length (meters)
              </label>
              <input
                type="number"
                step="1"
                value={(element as WaterPipe).length}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    length: parseFloat(e.target.value) || 1,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Diameter (mm)
              </label>
              <select
                value={(element as WaterPipe).diameter}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    diameter: parseInt(e.target.value, 10) || 150,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              >
                {[50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 750, 900, 1000].map(
                  (d) => (
                    <option key={d} value={d}>
                      {d} mm (DN{d})
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Hazen-Williams Roughness (C)
              </label>
              <input
                type="number"
                step="5"
                value={(element as WaterPipe).roughness}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    roughness: parseFloat(e.target.value) || 130,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Operational Status
              </label>
              <select
                value={(element as WaterPipe).status}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    status: e.target.value as WaterPipe['status'],
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="OPEN">OPEN (Normal flow)</option>
                <option value="CLOSED">CLOSED (Isolated valve)</option>
                <option value="CV">CV (Check valve / Non-return)</option>
              </select>
            </div>

            {/* Transient Material & Pressure Class */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Pipe Material
                </label>
                <select
                  value={(element as WaterPipe).material || 'Ductile Iron'}
                  onChange={(e) => {
                    const mat = e.target.value as WaterPipe['material'];
                    const defaultWave =
                      mat === 'Steel'
                        ? 1150
                        : mat === 'PVC'
                        ? 400
                        : mat === 'HDPE'
                        ? 320
                        : mat === 'Concrete'
                        ? 950
                        : 1050;
                    onUpdateElement({
                      ...element,
                      material: mat,
                      waveSpeedMs: defaultWave,
                    });
                  }}
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="Ductile Iron">Ductile Iron (DI)</option>
                  <option value="Steel">Mild Steel (MS)</option>
                  <option value="PVC">uPVC</option>
                  <option value="HDPE">HDPE PE100</option>
                  <option value="Concrete">Prestressed Concrete</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Pressure Class
                </label>
                <select
                  value={(element as WaterPipe).pressureRatingPnBar || 16}
                  onChange={(e) =>
                    onUpdateElement({
                      ...element,
                      pressureRatingPnBar: parseInt(e.target.value, 10) || 16,
                    })
                  }
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value={6}>PN6 (6 bar / 60m)</option>
                  <option value={10}>PN10 (10 bar / 100m)</option>
                  <option value={16}>PN16 (16 bar / 160m)</option>
                  <option value={20}>PN20 (20 bar / 200m)</option>
                  <option value={25}>PN25 (25 bar / 250m)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Acoustic Wave Speed (a, m/s)
              </label>
              <input
                type="number"
                step="10"
                value={(element as WaterPipe).waveSpeedMs || 1050}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    waveSpeedMs: parseFloat(e.target.value) || 1050,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Results */}
            {(element as WaterPipe).flow !== undefined && (
              <div className="mt-4 p-3 rounded-lg bg-[#0a0a0a] border border-[#222] space-y-1.5">
                <span className="text-[10px] font-tech font-bold uppercase tracking-wider text-amber-400">
                  Computed Flow Dynamics
                </span>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Discharge Flow:</span>
                  <span className="font-mono text-white font-bold">{(element as WaterPipe).flow} L/s</span>
                </div>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Velocity:</span>
                  <span
                    className={`font-mono ${(element as WaterPipe).velocity! > 2.0 ? 'text-amber-400 font-bold' : 'text-white'}`}
                  >
                    {(element as WaterPipe).velocity} m/s
                  </span>
                </div>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Headloss Gradient:</span>
                  <span className="font-mono text-white">{(element as WaterPipe).unitHeadloss} m/km</span>
                </div>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Total Headloss:</span>
                  <span className="font-mono text-white">{(element as WaterPipe).totalHeadloss} m</span>
                </div>
              </div>
            )}

            {/* Transient Surge Results */}
            {((element as WaterPipe).maxTransientHeadM !== undefined ||
              (element as WaterPipe).waveSpeedMs !== undefined) && (
              <div className="mt-3 p-3 rounded-lg bg-rose-950/20 border border-rose-900/30 space-y-1.5">
                <div className="flex items-center gap-1.5 text-rose-400 font-tech font-bold text-[10px] uppercase tracking-wider">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Surge & Water Hammer (Joukowsky)</span>
                </div>

                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Acoustic Wave Speed:</span>
                  <span className="font-mono text-white font-bold">
                    {(element as WaterPipe).waveSpeedMs || 1050} m/s
                  </span>
                </div>

                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Pipeline Reflection (2L/a):</span>
                  <span className="font-mono text-white">
                    {(
                      (2 * (element as WaterPipe).length) /
                      ((element as WaterPipe).waveSpeedMs || 1050)
                    ).toFixed(2)}{' '}
                    s
                  </span>
                </div>

                {(element as WaterPipe).maxTransientHeadM !== undefined && (
                  <>
                    <div className="flex justify-between text-xs text-[#a3a3a3]">
                      <span>Max Transient Head (H_max):</span>
                      <span className="font-mono text-rose-300 font-bold">
                        {(element as WaterPipe).maxTransientHeadM} m
                      </span>
                    </div>

                    <div className="flex justify-between text-xs text-[#a3a3a3]">
                      <span>Min Transient Head (H_min):</span>
                      <span className="font-mono text-purple-300 font-bold">
                        {(element as WaterPipe).minTransientHeadM} m
                      </span>
                    </div>

                    {/* Cavitation and Rupture Status Badges */}
                    <div className="pt-2 border-t border-rose-900/40 flex flex-wrap gap-1.5">
                      {((element as WaterPipe).minTransientHeadM ?? 0) < -10 ? (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 border border-red-500/50 text-red-300 text-[10px] font-tech font-bold">
                          <ShieldAlert className="w-3 h-3 text-red-400" />
                          <span>Vapor Cavitation Risk</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-tech">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          <span>No Cavitation</span>
                        </div>
                      )}

                      {((element as WaterPipe).maxTransientHeadM ?? 0) >
                      ((element as WaterPipe).pressureRatingPnBar || 16) * 10 ? (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-tech font-bold">
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          <span>Exceeds PN Rating</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-tech">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          <span>Within PN Limits</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* --- PUMP SPECIFIC --- */}
        {element.type === 'pump' && (
          <>
            {/* Prominent Operational Switch */}
            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1.5">
                Pump Operational Switch
              </label>
              <button
                type="button"
                onClick={() =>
                  onUpdateElement({
                    ...element,
                    status: (element as WaterPump).status === 'OPEN' ? 'CLOSED' : 'OPEN',
                  })
                }
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                  (element as WaterPump).status === 'OPEN'
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                    : 'bg-red-500/10 border-red-500/40 text-red-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      (element as WaterPump).status === 'OPEN'
                        ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse'
                        : 'bg-red-500'
                    }`}
                  />
                  <span>
                    {(element as WaterPump).status === 'OPEN' ? 'RUNNING (ONLINE)' : 'STOPPED (OFFLINE)'}
                  </span>
                </div>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#111] border border-[#222]">
                  {(element as WaterPump).status === 'OPEN' ? 'Switch OFF' : 'Switch ON'}
                </span>
              </button>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Design Flow (L/s)
              </label>
              <input
                type="number"
                step="1"
                value={(element as WaterPump).designFlow}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    designFlow: parseFloat(e.target.value) || 1,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Design Head (m)
              </label>
              <input
                type="number"
                step="1"
                value={(element as WaterPump).designHead}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    designHead: parseFloat(e.target.value) || 1,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Computed Results */}
            {(element as WaterPump).operatingFlow !== undefined && (
              <div className="mt-3 p-3 rounded-lg bg-[#0a0a0a] border border-[#222] space-y-1.5">
                <span className="text-[10px] font-tech font-bold uppercase tracking-wider text-amber-400">
                  Computed Pump Performance
                </span>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Operating Flow:</span>
                  <span className="font-mono text-white font-bold">{(element as WaterPump).operatingFlow} L/s</span>
                </div>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Operating Head:</span>
                  <span className="font-mono text-white">{(element as WaterPump).operatingHead} m</span>
                </div>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Power Consumed:</span>
                  <span className="font-mono text-amber-400 font-bold">{(element as WaterPump).powerKw} kW</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* --- RESERVOIR SPECIFIC --- */}
        {element.type === 'reservoir' && (
          <>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase font-tech text-[#737373]">
                  Ground Elevation (m MSL)
                </label>
                <button
                  type="button"
                  onClick={handleSampleDem}
                  className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-tech"
                >
                  <Mountain className="w-3 h-3" />
                  <span>Sample DEM</span>
                </button>
              </div>
              <input
                type="number"
                step="0.1"
                value={(element as WaterReservoir).elevation}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    elevation: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Total Water Surface Head (m MSL)
              </label>
              <input
                type="number"
                step="0.5"
                value={(element as WaterReservoir).totalHead}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    totalHead: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            {(element as WaterReservoir).netFlow !== undefined && (
              <div className="mt-4 p-3 rounded-lg bg-[#0a0a0a] border border-[#222] text-xs">
                <span className="text-[10px] font-tech text-amber-400 uppercase font-bold block mb-1">
                  Source Discharge
                </span>
                <span className="font-mono text-white text-sm font-bold">
                  {(element as WaterReservoir).netFlow} L/s
                </span>
              </div>
            )}
          </>
        )}

        {/* --- TANK SPECIFIC --- */}
        {element.type === 'tank' && (
          <>
            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Tank Base Elevation (m MSL)
              </label>
              <input
                type="number"
                step="0.1"
                value={(element as WaterTank).elevation}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    elevation: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Initial Lvl (m)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={(element as WaterTank).initialLevel}
                  onChange={(e) =>
                    onUpdateElement({
                      ...element,
                      initialLevel: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Max Lvl (m)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={(element as WaterTank).maxLevel}
                  onChange={(e) =>
                    onUpdateElement({
                      ...element,
                      maxLevel: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Diameter (m)
              </label>
              <input
                type="number"
                step="1"
                value={(element as WaterTank).diameter}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    diameter: parseFloat(e.target.value) || 1,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          </>
        )}

        {/* --- VALVE SPECIFIC --- */}
        {element.type === 'valve' && (
          <>
            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Valve Type
              </label>
              <select
                value={(element as WaterValve).valveType}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    valveType: e.target.value as ValveType,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="PRV">PRV (Pressure Reducing Valve)</option>
                <option value="PSV">PSV (Pressure Sustaining Valve)</option>
                <option value="PBV">PBV (Pressure Breaker Valve)</option>
                <option value="FCV">FCV (Flow Control Valve)</option>
                <option value="TCV">TCV (Throttle Control Valve)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                {(element as WaterValve).valveType === 'FCV'
                  ? 'Target Flow Rate (L/s)'
                  : (element as WaterValve).valveType === 'TCV'
                  ? 'Minor Loss Coeff (K)'
                  : 'Pressure Setting (m H2O)'}
              </label>
              <input
                type="number"
                step="0.5"
                value={(element as WaterValve).setting}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    setting: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Valve Diameter (mm)
              </label>
              <input
                type="number"
                step="25"
                value={(element as WaterValve).diameter || 150}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    diameter: parseFloat(e.target.value) || 150,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Operating Status
              </label>
              <select
                value={(element as WaterValve).status}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    status: e.target.value as WaterValve['status'],
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="ACTIVE">ACTIVE (Regulating)</option>
                <option value="OPEN">OPEN (Full Bypass)</option>
                <option value="CLOSED">CLOSED (Isolated)</option>
              </select>
            </div>

            {/* Results */}
            {(element as WaterValve).flow !== undefined && (
              <div className="mt-3 p-3 rounded-lg bg-[#0a0a0a] border border-[#222] space-y-1.5">
                <span className="text-[10px] font-tech font-bold uppercase tracking-wider text-cyan-400">
                  Computed Valve Hydraulics
                </span>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Discharge Through Flow:</span>
                  <span className="font-mono text-white font-bold">{(element as WaterValve).flow} L/s</span>
                </div>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Valve Headloss:</span>
                  <span className="font-mono text-white">{(element as WaterValve).headloss} m</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Delete button */}
        <div className="pt-4 border-t border-[#222]">
          <button
            type="button"
            onClick={() => onDeleteElement(element.id, element.type)}
            className="w-full py-1.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold transition-colors cursor-pointer"
          >
            Delete Element
          </button>
        </div>
      </div>
    </div>
  );
};
