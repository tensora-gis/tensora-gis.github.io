import React from 'react';
import {
  WastewaterNetworkElement,
  WastewaterManhole,
  WastewaterConduit,
  WastewaterWetWell,
  WastewaterPump,
  WastewaterForceMain,
  WastewaterOutfall,
} from '../../types/wastewater';
import { sampleWastewaterGroundElevation } from '../../utils/wastewaterTerrainService';
import {
  X,
  Mountain,
  CircleDot,
  GitCommit,
  Waves,
  Database,
  Zap,
  ArrowRightCircle,
} from 'lucide-react';

interface WastewaterPropertyInspectorProps {
  element: WastewaterNetworkElement | null;
  onClose: () => void;
  onUpdateElement: (updated: WastewaterNetworkElement) => void;
  onDeleteElement: (id: string, type: WastewaterNetworkElement['type']) => void;
}

export const WastewaterPropertyInspector: React.FC<WastewaterPropertyInspectorProps> = ({
  element,
  onClose,
  onUpdateElement,
  onDeleteElement,
}) => {
  if (!element) return null;

  const handleSampleDem = async () => {
    if ('lat' in element && 'lng' in element) {
      const elev = await sampleWastewaterGroundElevation(element.lat, element.lng);
      if (elev !== null) {
        const roundedRim = Math.round(elev * 10) / 10;
        if (element.type === 'manhole') {
          const m = element as WastewaterManhole;
          onUpdateElement({
            ...m,
            rimElevation: roundedRim,
            invertElevation: Math.round((roundedRim - m.depth) * 10) / 10,
          });
        } else if (element.type === 'wet-well') {
          const w = element as WastewaterWetWell;
          onUpdateElement({
            ...w,
            rimElevation: roundedRim,
            floorElevation: Math.round((roundedRim - 6.0) * 10) / 10,
          });
        } else if (element.type === 'outfall') {
          const o = element as WastewaterOutfall;
          const inv = Math.round((roundedRim - 1.0) * 10) / 10;
          onUpdateElement({
            ...o,
            invertElevation: inv,
            receivingWaterElevation: Math.round((inv + 0.5) * 10) / 10,
          });
        }
      }
    }
  };

  return (
    <div className="w-80 bg-[#111] border-l border-[#222] flex flex-col h-full z-20 select-none shadow-2xl shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-[#222] flex items-center justify-between bg-[#141414]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[#1c1c1c] border border-[#262626] flex items-center justify-center text-amber-500">
            {element.type === 'manhole' && <CircleDot className="w-3.5 h-3.5" />}
            {element.type === 'conduit' && <GitCommit className="w-3.5 h-3.5" />}
            {element.type === 'wet-well' && <Database className="w-3.5 h-3.5" />}
            {element.type === 'pump' && <Zap className="w-3.5 h-3.5" />}
            {element.type === 'force-main' && <ArrowRightCircle className="w-3.5 h-3.5" />}
            {element.type === 'outfall' && <Waves className="w-3.5 h-3.5" />}
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

        {/* --- MANHOLE --- */}
        {element.type === 'manhole' && (
          <>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase font-tech text-[#737373]">
                  Rim Elevation (m MSL)
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
                value={(element as WastewaterManhole).rimElevation}
                onChange={(e) => {
                  const rim = parseFloat(e.target.value) || 0;
                  const m = element as WastewaterManhole;
                  onUpdateElement({
                    ...m,
                    rimElevation: rim,
                    invertElevation: Math.round((rim - m.depth) * 10) / 10,
                  });
                }}
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Depth (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={(element as WastewaterManhole).depth}
                  onChange={(e) => {
                    const depth = parseFloat(e.target.value) || 1.5;
                    const m = element as WastewaterManhole;
                    onUpdateElement({
                      ...m,
                      depth,
                      invertElevation: Math.round((m.rimElevation - depth) * 10) / 10,
                    });
                  }}
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Invert (m MSL)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={(element as WastewaterManhole).invertElevation}
                  onChange={(e) => {
                    const inv = parseFloat(e.target.value) || 0;
                    const m = element as WastewaterManhole;
                    onUpdateElement({
                      ...m,
                      invertElevation: inv,
                      depth: Math.round((m.rimElevation - inv) * 10) / 10,
                    });
                  }}
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Diameter (mm)
                </label>
                <input
                  type="number"
                  step="100"
                  value={(element as WastewaterManhole).diameterMm}
                  onChange={(e) =>
                    onUpdateElement({
                      ...element,
                      diameterMm: parseInt(e.target.value) || 1000,
                    })
                  }
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Population (Cap)
                </label>
                <input
                  type="number"
                  step="50"
                  value={(element as WastewaterManhole).population}
                  onChange={(e) =>
                    onUpdateElement({
                      ...element,
                      population: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Peaking Formula
              </label>
              <select
                value={(element as WastewaterManhole).peakingFormula}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    peakingFormula: e.target.value as any,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="harmon">Harmon</option>
                <option value="babbitt">Babbitt</option>
                <option value="ten-states">Ten-States</option>
                <option value="constant">Constant</option>
              </select>
            </div>

            {/* Computed Results */}
            {(element as WastewaterManhole).peakSanitaryFlowLs !== undefined && (
              <div className="mt-4 p-3 rounded-lg bg-[#0a0a0a] border border-[#222] space-y-1.5">
                <span className="text-[10px] font-tech font-bold uppercase tracking-wider text-amber-400">
                  Computed Hydraulic Results
                </span>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Peak Sanitary Flow:</span>
                  <span className="text-white font-bold">
                    {(element as WastewaterManhole).peakSanitaryFlowLs?.toFixed(2)} L/s
                  </span>
                </div>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>HGL Water Elev:</span>
                  <span className="text-white font-bold">
                    {(element as WastewaterManhole).waterElevationM?.toFixed(2) ?? '-'} m MSL
                  </span>
                </div>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Status:</span>
                  <span
                    className={
                      (element as WastewaterManhole).isFlooding
                        ? 'text-red-400 font-bold'
                        : (element as WastewaterManhole).isSurcharged
                        ? 'text-amber-400 font-bold'
                        : 'text-emerald-400 font-bold'
                    }
                  >
                    {(element as WastewaterManhole).isFlooding
                      ? 'SURFACE FLOOD'
                      : (element as WastewaterManhole).isSurcharged
                      ? 'SURCHARGED'
                      : 'FREE-FLOW'}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* --- CONDUIT --- */}
        {element.type === 'conduit' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Diameter (mm)
                </label>
                <input
                  type="number"
                  step="25"
                  value={(element as WastewaterConduit).diameterMm}
                  onChange={(e) =>
                    onUpdateElement({
                      ...element,
                      diameterMm: parseInt(e.target.value) || 250,
                    })
                  }
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Material
                </label>
                <select
                  value={(element as WastewaterConduit).material}
                  onChange={(e) => {
                    const mat = e.target.value as any;
                    const n = mat === 'PVC' || mat === 'HDPE' ? 0.010 : 0.013;
                    onUpdateElement({
                      ...element,
                      material: mat,
                      manningN: n,
                    });
                  }}
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="PVC">PVC</option>
                  <option value="HDPE">HDPE</option>
                  <option value="RCC">RCC</option>
                  <option value="DI">DI</option>
                  <option value="Clay">Clay</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Length (m)
                </label>
                <input
                  type="number"
                  step="1"
                  value={(element as WastewaterConduit).lengthM}
                  onChange={(e) => {
                    const len = parseFloat(e.target.value) || 10;
                    const c = element as WastewaterConduit;
                    const slope = (c.upstreamInvertM - c.downstreamInvertM) / Math.max(1, len);
                    onUpdateElement({ ...c, lengthM: len, slopeMPerM: slope });
                  }}
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Manning's n
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={(element as WastewaterConduit).manningN}
                  onChange={(e) =>
                    onUpdateElement({
                      ...element,
                      manningN: parseFloat(e.target.value) || 0.01,
                    })
                  }
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Up Invert (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={(element as WastewaterConduit).upstreamInvertM}
                  onChange={(e) => {
                    const up = parseFloat(e.target.value) || 0;
                    const c = element as WastewaterConduit;
                    const slope = (up - c.downstreamInvertM) / Math.max(1, c.lengthM);
                    onUpdateElement({ ...c, upstreamInvertM: up, slopeMPerM: slope });
                  }}
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Dn Invert (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={(element as WastewaterConduit).downstreamInvertM}
                  onChange={(e) => {
                    const dn = parseFloat(e.target.value) || 0;
                    const c = element as WastewaterConduit;
                    const slope = (c.upstreamInvertM - dn) / Math.max(1, c.lengthM);
                    onUpdateElement({ ...c, downstreamInvertM: dn, slopeMPerM: slope });
                  }}
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Computed Results */}
            {(element as WastewaterConduit).designFlowLs !== undefined && (
              <div className="mt-4 p-3 rounded-lg bg-[#0a0a0a] border border-[#222] space-y-1.5">
                <span className="text-[10px] font-tech font-bold uppercase tracking-wider text-amber-400">
                  Computed Hydraulic Results
                </span>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Bed Slope:</span>
                  <span className="text-white font-bold">
                    {(((element as WastewaterConduit).slopeMPerM || 0) * 100).toFixed(3)} %
                  </span>
                </div>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Flow Q:</span>
                  <span className="text-amber-400 font-bold">
                    {(element as WastewaterConduit).designFlowLs?.toFixed(2)} L/s
                  </span>
                </div>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Velocity:</span>
                  <span className="text-white font-bold">
                    {(element as WastewaterConduit).actualVelocityMs?.toFixed(2)} m/s
                  </span>
                </div>
                <div className="flex justify-between text-xs text-[#a3a3a3]">
                  <span>Fullness (d/D):</span>
                  <span
                    className={
                      ((element as WastewaterConduit).flowDepthRatio ?? 0) > 1.0
                        ? 'text-red-400 font-bold'
                        : 'text-emerald-400 font-bold'
                    }
                  >
                    {(element as WastewaterConduit).flowDepthRatio?.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* --- WET WELL --- */}
        {element.type === 'wet-well' && (
          <>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase font-tech text-[#737373]">
                  Rim Elevation (m MSL)
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
                value={(element as WastewaterWetWell).rimElevation}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    rimElevation: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Floor Elev (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={(element as WastewaterWetWell).floorElevation}
                  onChange={(e) =>
                    onUpdateElement({
                      ...element,
                      floorElevation: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Volume (m³)
                </label>
                <input
                  type="number"
                  step="5"
                  value={(element as WastewaterWetWell).storageVolumeM3}
                  onChange={(e) =>
                    onUpdateElement({
                      ...element,
                      storageVolumeM3: parseFloat(e.target.value) || 20,
                    })
                  }
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </>
        )}

        {/* --- PUMP --- */}
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
                    status: (element as WastewaterPump).status === 'ON' ? 'OFF' : 'ON',
                  })
                }
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                  (element as WastewaterPump).status === 'ON'
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                    : 'bg-red-500/10 border-red-500/40 text-red-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      (element as WastewaterPump).status === 'ON'
                        ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse'
                        : 'bg-red-500'
                    }`}
                  />
                  <span>
                    {(element as WastewaterPump).status === 'ON' ? 'RUNNING (ONLINE)' : 'STOPPED (OFFLINE)'}
                  </span>
                </div>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#111] border border-[#222]">
                  {(element as WastewaterPump).status === 'ON' ? 'Switch OFF' : 'Switch ON'}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Rated Q (L/s)
                </label>
                <input
                  type="number"
                  step="5"
                  value={(element as WastewaterPump).ratedDischargeLs}
                  onChange={(e) =>
                    onUpdateElement({
                      ...element,
                      ratedDischargeLs: parseFloat(e.target.value) || 30,
                    })
                  }
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                  Head TDH (m)
                </label>
                <input
                  type="number"
                  step="1"
                  value={(element as WastewaterPump).dynamicHeadM}
                  onChange={(e) =>
                    onUpdateElement({
                      ...element,
                      dynamicHeadM: parseFloat(e.target.value) || 20,
                    })
                  }
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#0a0a0a] border border-[#222] flex justify-between text-xs text-[#a3a3a3]">
              <span>Motor Power:</span>
              <span className="text-amber-400 font-bold">{(element as WastewaterPump).powerKw ?? 0} kW</span>
            </div>
          </>
        )}

        {/* --- OUTFALL --- */}
        {element.type === 'outfall' && (
          <>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase font-tech text-[#737373]">
                  Invert Elev (m MSL)
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
                value={(element as WastewaterOutfall).invertElevation}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    invertElevation: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-tech text-[#737373] mb-1">
                Receiving Water (m MSL)
              </label>
              <input
                type="number"
                step="0.1"
                value={(element as WastewaterOutfall).receivingWaterElevation}
                onChange={(e) =>
                  onUpdateElement({
                    ...element,
                    receivingWaterElevation: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          </>
        )}

        {/* Delete button (identical placement and styling to WaterPropertyInspector) */}
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