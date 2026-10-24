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
import { X, Trash2, Activity, Mountain, ShieldCheck, AlertTriangle } from 'lucide-react';

interface WastewaterPropertyInspectorProps {
  element: WastewaterNetworkElement | null;
  onClose: () => void;
  onUpdateElement: (elem: WastewaterNetworkElement) => void;
  onDeleteElement: (id: string, type: WastewaterNetworkElement['type']) => void;
}

export const WastewaterPropertyInspector: React.FC<WastewaterPropertyInspectorProps> = ({
  element,
  onClose,
  onUpdateElement,
  onDeleteElement,
}) => {
  if (!element) return null;

  const renderManholeFields = (m: WastewaterManhole) => (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
          Chamber Label
        </label>
        <input
          type="text"
          value={m.label}
          onChange={(e) => onUpdateElement({ ...m, label: e.target.value })}
          className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-amber-400 uppercase font-tech flex items-center gap-1 mb-1">
            <Mountain className="w-3 h-3" />
            <span>Rim Elev (m MSL)</span>
          </label>
          <input
            type="number"
            step="0.1"
            value={m.rimElevation}
            onChange={(e) => {
              const rim = parseFloat(e.target.value) || 0;
              onUpdateElement({
                ...m,
                rimElevation: rim,
                invertElevation: Math.round((rim - m.depth) * 10) / 10,
              });
            }}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Chamber Depth (m)
          </label>
          <input
            type="number"
            step="0.1"
            min="1.0"
            value={m.depth}
            onChange={(e) => {
              const depth = parseFloat(e.target.value) || 2.0;
              onUpdateElement({
                ...m,
                depth,
                invertElevation: Math.round((m.rimElevation - depth) * 10) / 10,
              });
            }}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Invert Elev (m MSL)
          </label>
          <input
            type="number"
            step="0.1"
            value={m.invertElevation}
            onChange={(e) => {
              const inv = parseFloat(e.target.value) || 0;
              onUpdateElement({
                ...m,
                invertElevation: inv,
                depth: Math.round((m.rimElevation - inv) * 10) / 10,
              });
            }}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Diameter (mm)
          </label>
          <input
            type="number"
            step="100"
            value={m.diameterMm}
            onChange={(e) => onUpdateElement({ ...m, diameterMm: parseInt(e.target.value) || 1000 })}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      <div className="pt-2 border-t border-[#222]">
        <span className="text-[10px] text-amber-500 font-tech uppercase font-bold block mb-2">
          Sanitary Flow Generation
        </span>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
              Population (Cap)
            </label>
            <input
              type="number"
              step="50"
              min="0"
              value={m.population}
              onChange={(e) => onUpdateElement({ ...m, population: parseInt(e.target.value) || 0 })}
              className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
              Rate (Lpcd)
            </label>
            <input
              type="number"
              step="5"
              value={m.unitLoadingLpcd}
              onChange={(e) => onUpdateElement({ ...m, unitLoadingLpcd: parseFloat(e.target.value) || 135 })}
              className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
              Peaking Formula
            </label>
            <select
              value={m.peakingFormula}
              onChange={(e) => onUpdateElement({ ...m, peakingFormula: e.target.value as any })}
              className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
            >
              <option value="harmon">Harmon</option>
              <option value="babbitt">Babbitt</option>
              <option value="ten-states">Ten-States</option>
              <option value="constant">Constant</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
              I&I Flow (L/s)
            </label>
            <input
              type="number"
              step="0.1"
              value={m.inflowInfiltrationLs}
              onChange={(e) => onUpdateElement({ ...m, inflowInfiltrationLs: parseFloat(e.target.value) || 0 })}
              className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Hydraulic Calculation Results Card */}
      <div className="p-2.5 rounded bg-[#141414] border border-[#222] space-y-1.5 text-[11px] font-mono">
        <span className="text-[10px] text-emerald-400 font-tech uppercase font-bold block">
          Computed Hydraulics
        </span>
        <div className="flex justify-between text-[#888]">
          <span>Peak Sanitary Flow:</span>
          <span className="text-white font-bold">{m.peakSanitaryFlowLs?.toFixed(2) ?? '0.00'} L/s</span>
        </div>
        <div className="flex justify-between text-[#888]">
          <span>Total Peak Inflow:</span>
          <span className="text-white font-bold">{m.totalInflowLs?.toFixed(2) ?? '0.00'} L/s</span>
        </div>
        <div className="flex justify-between text-[#888]">
          <span>HGL Water Elevation:</span>
          <span className="text-white font-bold">{m.waterElevationM?.toFixed(2) ?? '-'} m</span>
        </div>
        <div className="flex justify-between text-[#888]">
          <span>Surcharge Status:</span>
          <span className={m.isFlooding ? 'text-red-400 font-bold' : m.isSurcharged ? 'text-amber-400' : 'text-emerald-400'}>
            {m.isFlooding ? 'SURFACE FLOOD' : m.isSurcharged ? `Surcharged (+${m.surchargeDepthM?.toFixed(2)}m)` : 'Gravity Free-Flow'}
          </span>
        </div>
      </div>
    </div>
  );

  const renderConduitFields = (c: WastewaterConduit) => (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
          Pipe Label
        </label>
        <input
          type="text"
          value={c.label}
          onChange={(e) => onUpdateElement({ ...c, label: e.target.value })}
          className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Diameter (mm)
          </label>
          <input
            type="number"
            step="25"
            value={c.diameterMm}
            onChange={(e) => onUpdateElement({ ...c, diameterMm: parseInt(e.target.value) || 250 })}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Material
          </label>
          <select
            value={c.material}
            onChange={(e) => {
              const mat = e.target.value as any;
              const n = mat === 'PVC' || mat === 'HDPE' ? 0.010 : 0.013;
              onUpdateElement({ ...c, material: mat, manningN: n });
            }}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          >
            <option value="PVC">PVC (n=0.010)</option>
            <option value="HDPE">HDPE (n=0.010)</option>
            <option value="RCC">RCC (n=0.013)</option>
            <option value="DI">DI (n=0.012)</option>
            <option value="Clay">Vitrified Clay (n=0.013)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Up Invert (m MSL)
          </label>
          <input
            type="number"
            step="0.1"
            value={c.upstreamInvertM}
            onChange={(e) => {
              const up = parseFloat(e.target.value) || 0;
              const slope = (up - c.downstreamInvertM) / Math.max(1, c.lengthM);
              onUpdateElement({ ...c, upstreamInvertM: up, slopeMPerM: slope });
            }}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Dn Invert (m MSL)
          </label>
          <input
            type="number"
            step="0.1"
            value={c.downstreamInvertM}
            onChange={(e) => {
              const dn = parseFloat(e.target.value) || 0;
              const slope = (c.upstreamInvertM - dn) / Math.max(1, c.lengthM);
              onUpdateElement({ ...c, downstreamInvertM: dn, slopeMPerM: slope });
            }}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Length (m)
          </label>
          <input
            type="number"
            step="1"
            value={c.lengthM}
            onChange={(e) => {
              const len = parseFloat(e.target.value) || 10;
              const slope = (c.upstreamInvertM - c.downstreamInvertM) / Math.max(1, len);
              onUpdateElement({ ...c, lengthM: len, slopeMPerM: slope });
            }}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Manning's n
          </label>
          <input
            type="number"
            step="0.001"
            value={c.manningN}
            onChange={(e) => onUpdateElement({ ...c, manningN: parseFloat(e.target.value) || 0.01 })}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Hydraulic Calculation Output Card */}
      <div className="p-2.5 rounded bg-[#141414] border border-[#222] space-y-1.5 text-[11px] font-mono">
        <span className="text-[10px] text-emerald-400 font-tech uppercase font-bold block">
          Computed Pipe Hydraulics
        </span>
        <div className="flex justify-between text-[#888]">
          <span>Bed Slope:</span>
          <span className="text-white font-bold">{(c.slopeMPerM * 100).toFixed(3)} %</span>
        </div>
        <div className="flex justify-between text-[#888]">
          <span>Full Capacity Qfull:</span>
          <span className="text-white font-bold">{c.fullCapacityLs?.toFixed(1) ?? '0.0'} L/s</span>
        </div>
        <div className="flex justify-between text-[#888]">
          <span>Design Flow Q:</span>
          <span className="text-amber-400 font-bold">{c.designFlowLs?.toFixed(2) ?? '0.00'} L/s</span>
        </div>
        <div className="flex justify-between text-[#888]">
          <span>Fullness Ratio (d/D):</span>
          <span className={(c.flowDepthRatio ?? 0) > 1.0 ? 'text-red-400 font-bold' : (c.flowDepthRatio ?? 0) > 0.75 ? 'text-amber-400' : 'text-emerald-400'}>
            {c.flowDepthRatio?.toFixed(2) ?? '0.00'}
          </span>
        </div>
        <div className="flex justify-between text-[#888]">
          <span>Flow Velocity:</span>
          <span className={c.selfCleansingOk ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
            {c.actualVelocityMs?.toFixed(2) ?? '0.00'} m/s
          </span>
        </div>
        <div className="flex justify-between text-[#888]">
          <span>Self-Cleansing (≥0.6m/s):</span>
          <span className={c.selfCleansingOk ? 'text-emerald-400' : 'text-amber-400 font-bold'}>
            {c.selfCleansingOk ? 'COMPLIANT' : 'SUB-CLEANSING'}
          </span>
        </div>
      </div>
    </div>
  );

  const renderWetWellFields = (w: WastewaterWetWell) => (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
          Wet Well Label
        </label>
        <input
          type="text"
          value={w.label}
          onChange={(e) => onUpdateElement({ ...w, label: e.target.value })}
          className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-amber-400 uppercase font-tech flex items-center gap-1 mb-1">
            <Mountain className="w-3 h-3" />
            <span>Rim Elev (m MSL)</span>
          </label>
          <input
            type="number"
            step="0.1"
            value={w.rimElevation}
            onChange={(e) => onUpdateElement({ ...w, rimElevation: parseFloat(e.target.value) || 0 })}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Floor Elev (m MSL)
          </label>
          <input
            type="number"
            step="0.1"
            value={w.floorElevation}
            onChange={(e) => onUpdateElement({ ...w, floorElevation: parseFloat(e.target.value) || 0 })}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Sump Diameter (m)
          </label>
          <input
            type="number"
            step="0.5"
            value={w.diameterM}
            onChange={(e) => onUpdateElement({ ...w, diameterM: parseFloat(e.target.value) || 3.0 })}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Active Volume (m³)
          </label>
          <input
            type="number"
            step="5"
            value={w.storageVolumeM3}
            onChange={(e) => onUpdateElement({ ...w, storageVolumeM3: parseFloat(e.target.value) || 20.0 })}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>
    </div>
  );

  const renderPumpFields = (p: WastewaterPump) => (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
          Pump Label
        </label>
        <input
          type="text"
          value={p.label}
          onChange={(e) => onUpdateElement({ ...p, label: e.target.value })}
          className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Rated Flow (L/s)
          </label>
          <input
            type="number"
            step="5"
            value={p.ratedDischargeLs}
            onChange={(e) => onUpdateElement({ ...p, ratedDischargeLs: parseFloat(e.target.value) || 30 })}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Dynamic Head TDH (m)
          </label>
          <input
            type="number"
            step="1"
            value={p.dynamicHeadM}
            onChange={(e) => onUpdateElement({ ...p, dynamicHeadM: parseFloat(e.target.value) || 20 })}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      <div className="p-2.5 rounded bg-[#141414] border border-[#222] flex justify-between text-xs font-mono">
        <span className="text-[#888]">Estimated Motor Power:</span>
        <span className="text-amber-400 font-bold">{p.powerKw ?? 0} kW</span>
      </div>
    </div>
  );

  const renderOutfallFields = (o: WastewaterOutfall) => (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
          Outfall Label
        </label>
        <input
          type="text"
          value={o.label}
          onChange={(e) => onUpdateElement({ ...o, label: e.target.value })}
          className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Invert Elev (m MSL)
          </label>
          <input
            type="number"
            step="0.1"
            value={o.invertElevation}
            onChange={(e) => onUpdateElement({ ...o, invertElevation: parseFloat(e.target.value) || 0 })}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="text-[10px] text-[#737373] uppercase font-tech block mb-1">
            Receiving Water (m MSL)
          </label>
          <input
            type="number"
            step="0.1"
            value={o.receivingWaterElevation}
            onChange={(e) => onUpdateElement({ ...o, receivingWaterElevation: parseFloat(e.target.value) || 0 })}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      <div className="p-2.5 rounded bg-[#141414] border border-[#222] flex justify-between text-xs font-mono">
        <span className="text-[#888]">Total Effluent Flow:</span>
        <span className="text-emerald-400 font-bold">{o.totalDischargeLs?.toFixed(2) ?? '0.00'} L/s</span>
      </div>
    </div>
  );

  return (
    <div className="w-80 h-full bg-[#111] border-l border-[#222] flex flex-col z-20 select-none shrink-0 shadow-2xl">
      {/* Inspector Header */}
      <div className="px-4 py-3 border-b border-[#222] bg-[#141414] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-bold text-white font-tech uppercase tracking-wider">
            {element.type} Inspector ({element.id})
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[#222] text-[#737373] hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Inspector Form Body */}
      <div className="p-4 flex-1 overflow-y-auto">
        {element.type === 'manhole' && renderManholeFields(element as WastewaterManhole)}
        {element.type === 'conduit' && renderConduitFields(element as WastewaterConduit)}
        {element.type === 'wet-well' && renderWetWellFields(element as WastewaterWetWell)}
        {element.type === 'pump' && renderPumpFields(element as WastewaterPump)}
        {element.type === 'outfall' && renderOutfallFields(element as WastewaterOutfall)}
      </div>

      {/* Inspector Footer Actions */}
      <div className="p-3 border-t border-[#222] bg-[#141414] flex items-center justify-between">
        <button
          onClick={() => onDeleteElement(element.id, element.type)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold border border-red-500/30 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete Element</span>
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded bg-[#222] hover:bg-[#333] text-white text-xs font-semibold transition-colors cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
};
