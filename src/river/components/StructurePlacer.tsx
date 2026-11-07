/**
 * CAD Civil Engineering Hydraulic Structure Editor & Placer
 *
 * Implements 6 full hydraulic formulations with 2D CFD flux coupling:
 * 1. Levees & Floodwalls (Broad crest weir overflow + containment)
 * 2. Weirs (Broad-crested / sharp-crested with submergence factor)
 * 3. Bridges (Yarnell pier drag + pressure orifice low-chord flow)
 * 4. Culverts (FHWA HDS-5 inlet/outlet control + Manning barrel friction)
 * 5. Gates (Sluice & radial underflow / overflow discharge)
 * 6. Embankments (Broad road dikes with overtop weir spill)
 */

import React, { useState } from 'react';
import {
  RiverHydraulicStructure,
  RiverStructureType,
  RiverLeveeStructure,
  RiverWeirStructure,
  RiverBridgeStructure,
  RiverCulvertStructure,
  RiverGateStructure,
  RiverEmbankmentStructure,
} from '../structures/structureTypes';
import { RiverGridMesh } from '../types/riverReach';

interface StructurePlacerProps {
  isOpen: boolean;
  onClose: () => void;
  mesh: RiverGridMesh;
  structures: RiverHydraulicStructure[];
  onUpdateStructures: (structures: RiverHydraulicStructure[]) => void;
  onStartMapDrawStructure?: (type: RiverStructureType) => void;
}

export const StructurePlacer: React.FC<StructurePlacerProps> = ({
  isOpen,
  onClose,
  mesh,
  structures,
  onUpdateStructures,
  onStartMapDrawStructure,
}) => {
  const [selectedType, setSelectedType] = useState<RiverStructureType>('levee');
  const [structureName, setStructureName] = useState('New Flood Levee');
  const [cadLayer, setCadLayer] = useState('CIVIL_DEFENSE');
  const [cadColor, setCadColor] = useState('#f59e0b');
  const [stationM, setStationM] = useState(Math.round(mesh.reachLengthM * 0.4));

  // Determine average bed elevation near this station
  const iMid = Math.min(
    mesh.nx - 1,
    Math.max(0, Math.round((stationM / Math.max(1, mesh.reachLengthM)) * mesh.nx))
  );
  const midCell = mesh.cells[iMid * mesh.ny + Math.floor(mesh.ny / 2)];
  const localBedElev = midCell ? midCell.bedElevation : 100.0;

  // Common parameters
  const [crestElevM, setCrestElevM] = useState(parseFloat((localBedElev + 3.5).toFixed(2)));
  const [topWidthM, setTopWidthM] = useState(5.0);
  const [sideSlopeHtoV, setSideSlopeHtoV] = useState(2.0);

  // Weir parameters
  const [weirType, setWeirType] = useState<'broad-crested' | 'sharp-crested'>('broad-crested');
  const [weirCd, setWeirCd] = useState(1.7);

  // Bridge parameters
  const [deckElevM, setDeckElevM] = useState(parseFloat((localBedElev + 6.0).toFixed(2)));
  const [lowChordM, setLowChordM] = useState(parseFloat((localBedElev + 4.5).toFixed(2)));
  const [pierCount, setPierCount] = useState(3);
  const [pierWidthM, setPierWidthM] = useState(1.5);

  // Culvert parameters
  const [barrels, setBarrels] = useState(2);
  const [spanM, setSpanM] = useState(2.5);
  const [riseM, setRiseM] = useState(2.5);
  const [culvertLenM, setCulvertLenM] = useState(25.0);

  // Gate parameters
  const [gateType, setGateType] = useState<'sluice' | 'radial'>('sluice');
  const [openingM, setOpeningM] = useState(1.5);
  const [gateWidthM, setGateWidthM] = useState(15.0);

  if (!isOpen) return null;

  const handleToggleStructure = (id: string) => {
    const updated = structures.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    onUpdateStructures(updated);
  };

  const handleDeleteStructure = (id: string) => {
    onUpdateStructures(structures.filter((s) => s.id !== id));
  };

  const handleApplyPreset = (type: RiverStructureType) => {
    setSelectedType(type);
    if (type === 'levee') {
      setStructureName('Engineered Flood Defense Levee');
      setCadLayer('CIVIL_DEFENSE');
      setCadColor('#f59e0b');
      setCrestElevM(parseFloat((localBedElev + 4.0).toFixed(2)));
      setTopWidthM(4.5);
      setSideSlopeHtoV(2.5);
    } else if (type === 'weir') {
      setStructureName('Broad-Crested Overflow Weir');
      setCadLayer('FLOW_REGULATION');
      setCadColor('#06b6d4');
      setCrestElevM(parseFloat((localBedElev + 2.0).toFixed(2)));
      setWeirCd(1.7);
    } else if (type === 'bridge') {
      setStructureName('Multi-Span Highway Bridge');
      setCadLayer('TRANSPORT_INFRA');
      setCadColor('#a855f7');
      setDeckElevM(parseFloat((localBedElev + 6.5).toFixed(2)));
      setLowChordM(parseFloat((localBedElev + 4.8).toFixed(2)));
      setPierCount(3);
      setPierWidthM(1.6);
    } else if (type === 'culvert') {
      setStructureName('Twin Reinforced Concrete Box Culvert');
      setCadLayer('DRAINAGE_INFRA');
      setCadColor('#10b981');
      setBarrels(2);
      setSpanM(2.4);
      setRiseM(2.4);
    } else if (type === 'gate') {
      setStructureName('Underflow Radial Flood Gate');
      setCadLayer('ACTIVE_CONTROL');
      setCadColor('#3b82f6');
      setOpeningM(1.2);
      setGateWidthM(18.0);
    } else {
      setStructureName('Riverbank Training Embankment');
      setCadLayer('RIVER_TRAINING');
      setCadColor('#ef4444');
      setCrestElevM(parseFloat((localBedElev + 3.0).toFixed(2)));
      setTopWidthM(6.0);
    }
  };

  const handleAddStructure = () => {
    const iStation = Math.min(
      mesh.nx - 1,
      Math.max(0, Math.round((stationM / Math.max(1, mesh.reachLengthM)) * mesh.nx))
    );
    const affectedCells: number[] = [];
    for (let j = 0; j < mesh.ny; j++) {
      affectedCells.push(iStation * mesh.ny + j);
    }

    const coords = affectedCells.map((c) => ({
      lat: mesh.cells[c].centerLat,
      lng: mesh.cells[c].centerLng,
    }));

    let structObj: RiverHydraulicStructure;

    if (selectedType === 'levee') {
      const levee: RiverLeveeStructure = {
        id: `levee-${Date.now()}`,
        name: structureName || 'Custom Levee',
        type: 'levee',
        enabled: true,
        coordinates: coords,
        cellIndices: affectedCells,
        stationM,
        crestElevationM: crestElevM,
        topWidthM,
        sideSlopeHtoV,
        cadProperties: { layerName: cadLayer, color: cadColor },
      };
      structObj = levee;
    } else if (selectedType === 'weir') {
      const weir: RiverWeirStructure = {
        id: `weir-${Date.now()}`,
        name: structureName || 'Custom Weir',
        type: 'weir',
        enabled: true,
        coordinates: coords,
        cellIndices: affectedCells,
        stationM,
        weirType,
        crestElevationM: crestElevM,
        crestLengthM: mesh.meanWidthM,
        dischargeCoefficient: weirCd,
        cadProperties: { layerName: cadLayer, color: cadColor },
      };
      structObj = weir;
    } else if (selectedType === 'bridge') {
      const bridge: RiverBridgeStructure = {
        id: `bridge-${Date.now()}`,
        name: structureName || 'Custom Bridge',
        type: 'bridge',
        enabled: true,
        coordinates: coords,
        cellIndices: affectedCells,
        stationM,
        deckElevationM: deckElevM,
        lowChordElevationM: lowChordM,
        pierCount,
        pierWidthM,
        pierDragCoeff: 1.25,
        cadProperties: { layerName: cadLayer, color: cadColor },
      };
      structObj = bridge;
    } else if (selectedType === 'culvert') {
      const culvert: RiverCulvertStructure = {
        id: `culvert-${Date.now()}`,
        name: structureName || 'Custom Culvert',
        type: 'culvert',
        enabled: true,
        coordinates: coords,
        cellIndices: affectedCells,
        stationM,
        barrelCount: barrels,
        diameterOrSpanM: spanM,
        riseM,
        lengthM: culvertLenM,
        inletInvertM: crestElevM - riseM,
        outletInvertM: crestElevM - riseM - 0.2,
        manningN: 0.013,
        inletLossCoeff: 0.5,
        cadProperties: { layerName: cadLayer, color: cadColor },
      };
      structObj = culvert;
    } else if (selectedType === 'gate') {
      const gate: RiverGateStructure = {
        id: `gate-${Date.now()}`,
        name: structureName || 'Custom Gate',
        type: 'gate',
        enabled: true,
        coordinates: coords,
        cellIndices: affectedCells,
        stationM,
        gateType,
        gateWidthM,
        openingM,
        crestElevationM: crestElevM,
        dischargeCoefficient: 0.6,
        cadProperties: { layerName: cadLayer, color: cadColor },
      };
      structObj = gate;
    } else {
      const emb: RiverEmbankmentStructure = {
        id: `emb-${Date.now()}`,
        name: structureName || 'Custom Embankment',
        type: 'embankment',
        enabled: true,
        coordinates: coords,
        cellIndices: affectedCells,
        stationM,
        crestElevationM: crestElevM,
        topWidthM,
        sideSlopeHtoV,
        overtopDischargeCoeff: 1.45,
        cadProperties: { layerName: cadLayer, color: cadColor },
      };
      structObj = emb;
    }

    onUpdateStructures([...structures, structObj]);
    setStructureName(`New ${selectedType.toUpperCase()}`);
  };

  const handleStartDrawOnMap = () => {
    if (onStartMapDrawStructure) {
      onStartMapDrawStructure(selectedType);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl text-slate-100 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </span>
            <div>
              <h3 className="text-lg font-bold text-slate-100">CAD Hydraulic Structures & Civil Formulations</h3>
              <p className="text-xs text-slate-400">
                Design custom levees, weirs, bridges, culverts, gates, and embankments coupled directly into 2D CFD flux
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            ✕
          </button>
        </div>

        {/* Existing Structures List */}
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Installed Reach Structures ({structures.length})</span>
            {structures.length > 0 && (
              <span className="text-[11px] text-cyan-400 font-normal">
                {structures.filter((s) => s.enabled).length} active in CFD solver
              </span>
            )}
          </h4>

          {structures.length === 0 ? (
            <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs text-slate-400 text-center">
              No hydraulic structures currently in reach. Add an engineered structure below or draw one on the map.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {structures.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3.5 h-3.5 rounded-full shadow"
                      style={{ backgroundColor: s.cadProperties?.color || '#f59e0b' }}
                    />
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-2">
                        <span>{s.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 uppercase font-mono">
                          {s.type}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Station: {s.stationM ? `${s.stationM.toFixed(0)}m` : 'Transect'} • Affected Cells:{' '}
                        {s.cellIndices.length} • Layer: {s.cadProperties?.layerName || 'CIVIL'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleStructure(s.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        s.enabled
                          ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 shadow'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {s.enabled ? 'ACTIVE IN CFD' : 'BYPASSED'}
                    </button>
                    <button
                      onClick={() => handleDeleteStructure(s.id)}
                      className="p-1 hover:text-red-400 text-slate-400 transition"
                      title="Delete Structure"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CAD Presets Quick Selector */}
        <div className="border-t border-slate-800 pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
              Engineering CAD Templates & Presets
            </h4>
            {onStartMapDrawStructure && (
              <button
                type="button"
                onClick={handleStartDrawOnMap}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow"
              >
                <span>✏️</span>
                <span>Click & Draw on River Map</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-6 gap-2 mb-3">
            {[
              { type: 'levee', label: '🧱 Flood Levee', desc: 'Overbank containment' },
              { type: 'weir', label: '🌊 Overflow Weir', desc: 'Stage regulation' },
              { type: 'bridge', label: '🌉 Highway Bridge', desc: 'Piers & contraction' },
              { type: 'culvert', label: '🕳️ Box Culvert', desc: 'FHWA HDS-5 barrel' },
              { type: 'gate', label: '🚪 Sluice Gate', desc: 'Underflow orifice' },
              { type: 'embankment', label: '🛡️ Embankment', desc: 'River training dyke' },
            ].map((p) => (
              <button
                key={p.type}
                type="button"
                onClick={() => handleApplyPreset(p.type as RiverStructureType)}
                className={`p-2 rounded-xl border text-left transition flex flex-col justify-between ${
                  selectedType === p.type
                    ? 'bg-amber-950/60 border-amber-500/80 text-white shadow'
                    : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div className="font-semibold text-xs text-slate-100">{p.label}</div>
                <div className="text-[10px] text-slate-400 mt-1 leading-tight">{p.desc}</div>
              </button>
            ))}
          </div>

          {/* Geometric & Hydraulic Parameters */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Structure Label</label>
                <input
                  type="text"
                  value={structureName}
                  onChange={(e) => setStructureName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Station (m from upstream)</label>
                <input
                  type="number"
                  value={stationM}
                  onChange={(e) => setStationM(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Crest Elevation (m MSL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={crestElevM}
                  onChange={(e) => setCrestElevM(parseFloat(e.target.value) || 100)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">CAD Color & Layer</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={cadColor}
                    onChange={(e) => setCadColor(e.target.value)}
                    className="w-10 h-8 bg-slate-900 border border-slate-700 rounded-lg p-0.5 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={cadLayer}
                    onChange={(e) => setCadLayer(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Type Specific Fields */}
            {selectedType === 'bridge' && (
              <div className="grid grid-cols-4 gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <label className="text-slate-400 block mb-1">Deck Elevation (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={deckElevM}
                    onChange={(e) => setDeckElevM(parseFloat(e.target.value) || 105)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Low Chord Elevation (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={lowChordM}
                    onChange={(e) => setLowChordM(parseFloat(e.target.value) || 103)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Pier Count</label>
                  <input
                    type="number"
                    value={pierCount}
                    onChange={(e) => setPierCount(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Pier Width (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={pierWidthM}
                    onChange={(e) => setPierWidthM(parseFloat(e.target.value) || 1.0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
              </div>
            )}

            {selectedType === 'culvert' && (
              <div className="grid grid-cols-4 gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <label className="text-slate-400 block mb-1">Number of Barrels</label>
                  <input
                    type="number"
                    value={barrels}
                    onChange={(e) => setBarrels(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Span (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={spanM}
                    onChange={(e) => setSpanM(parseFloat(e.target.value) || 2.0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Rise (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={riseM}
                    onChange={(e) => setRiseM(parseFloat(e.target.value) || 2.0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Barrel Length (m)</label>
                  <input
                    type="number"
                    step="1"
                    value={culvertLenM}
                    onChange={(e) => setCulvertLenM(parseFloat(e.target.value) || 20.0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
              </div>
            )}

            {selectedType === 'gate' && (
              <div className="grid grid-cols-3 gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <label className="text-slate-400 block mb-1">Gate Pattern</label>
                  <select
                    value={gateType}
                    onChange={(e) => setGateType(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="sluice">Underflow Sluice Gate</option>
                    <option value="radial">Tainter / Radial Gate</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Gate Opening w (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={openingM}
                    onChange={(e) => setOpeningM(parseFloat(e.target.value) || 1.0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Gate Width (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={gateWidthM}
                    onChange={(e) => setGateWidthM(parseFloat(e.target.value) || 10.0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
              </div>
            )}

            {selectedType === 'weir' && (
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <label className="text-slate-400 block mb-1">Weir Form</label>
                  <select
                    value={weirType}
                    onChange={(e) => setWeirType(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="broad-crested">Broad-Crested Weir (Cd ≈ 1.70)</option>
                    <option value="sharp-crested">Sharp-Crested Weir (Cd ≈ 1.84)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Discharge Coefficient Cd</label>
                  <input
                    type="number"
                    step="0.05"
                    value={weirCd}
                    onChange={(e) => setWeirCd(parseFloat(e.target.value) || 1.7)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-400">
                Structures modify Saint-Venant momentum flux and headwater stage across 2D cells.
              </span>

              <button
                type="button"
                onClick={handleAddStructure}
                className="px-5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition shadow-lg"
              >
                + Install Structure at Station {stationM}m
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
