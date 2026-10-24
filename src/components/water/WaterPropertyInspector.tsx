import React from 'react';
import {
  NetworkElement,
  WaterJunction,
  WaterPipe,
  WaterPump,
  WaterReservoir,
  WaterTank,
} from '../../types/waterDistribution';
import { sampleGroundElevation } from '../../utils/waterTerrainService';
import {
  X,
  Mountain,
  Ruler,
  Activity,
  Layers,
  Sliders,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

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
          <span className="text-base">
            {element.type === 'junction'
              ? '📍'
              : element.type === 'pipe'
              ? '〰️'
              : element.type === 'reservoir'
              ? '⛲'
              : element.type === 'tank'
              ? '🛢️'
              : '⚡'}
          </span>
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
          </>
        )}

        {/* --- PUMP SPECIFIC --- */}
        {element.type === 'pump' && (
          <>
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
            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Pump Status
              </label>
              <select
                value={(element as WaterPump).status}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    status: e.target.value as WaterPump['status'],
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="OPEN">RUNNING (Open)</option>
                <option value="CLOSED">OFFLINE (Closed)</option>
              </select>
            </div>
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
