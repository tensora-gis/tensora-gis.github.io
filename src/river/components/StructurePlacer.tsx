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
  RiverSpurdikeStructure,
  RiverBridgePierStructure,
  RiverCustomDeflectorStructure,
} from '../structures/structureTypes';
import { RiverGridMesh } from '../types/riverReach';
import {
  updateStructureLiveParameters,
  expandPolylineToSolidPolygon,
  createSolidPierFootprint,
  createSolidGroyneFootprint,
  createBroadCrestedWeirFootprint,
  createSolidLeveeFootprint,
  queryCellsInPolygon,
} from '../structures/cadStructureBuilder';

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
  const [inspectingStructureId, setInspectingStructureId] = useState<string | null>(null);

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

  // Spur Dike parameters
  const [spurLengthM, setSpurLengthM] = useState(30.0);
  const [spurPermeability, setSpurPermeability] = useState(0.0);
  const [spurAngleDeg, setSpurAngleDeg] = useState(90.0);
  const [spurBank, setSpurBank] = useState<'left' | 'right'>('left');

  // Bridge Pier parameters
  const [pierShape, setPierShape] = useState<'round-nose' | 'circular' | 'sharp-nose' | 'square'>('round-nose');
  const [standalonePierWidthM, setStandalonePierWidthM] = useState(1.8);
  const [standalonePierLengthM, setStandalonePierLengthM] = useState(6.0);
  const [pierDragCd, setPierDragCd] = useState(1.0);

  // Custom Deflector parameters
  const [deflectorHeightM, setDeflectorHeightM] = useState(3.0);
  const [deflectorThicknessM, setDeflectorThicknessM] = useState(1.0);
  const [deflectorEfficiency, setDeflectorEfficiency] = useState(0.85);

  if (!isOpen) return null;

  const handleModifyStructure = (id: string, updates: Record<string, any>) => {
    const updated = structures.map((s) =>
      s.id === id ? updateStructureLiveParameters(s, updates, mesh) : s
    );
    onUpdateStructures(updated);
  };

  const handleToggleStructure = (id: string) => {
    const updated = structures.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    onUpdateStructures(updated);
  };

  const handleDeleteStructure = (id: string) => {
    onUpdateStructures(structures.filter((s) => s.id !== id));
    if (inspectingStructureId === id) setInspectingStructureId(null);
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
    } else if (type === 'spurdike') {
      setStructureName('Rock Armor Spur Dike / Groyne');
      setCadLayer('RIVER_TRAINING');
      setCadColor('#10b981');
      setCrestElevM(parseFloat((localBedElev + 2.5).toFixed(2)));
      setSpurLengthM(35.0);
      setSpurPermeability(0.0);
      setSpurAngleDeg(90.0);
    } else if (type === 'bridge-pier') {
      setStructureName('Hydrodynamic Bridge Pier (Round-Nose)');
      setCadLayer('BRIDGE_SUBSTRUCTURE');
      setCadColor('#8b5cf6');
      setCrestElevM(parseFloat((localBedElev + 8.0).toFixed(2)));
      setStandalonePierWidthM(1.8);
      setPierShape('round-nose');
      setPierDragCd(1.0);
    } else if (type === 'custom-deflector') {
      setStructureName('Curved Flow Training Guide Bank');
      setCadLayer('GUIDE_BANKS');
      setCadColor('#06b6d4');
      setDeflectorHeightM(3.5);
      setDeflectorEfficiency(0.85);
    } else {
      setStructureName('Riverbank Training Embankment');
      setCadLayer('ROAD_NETWORK');
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
      const solidCoords = createSolidLeveeFootprint(coords, topWidthM, sideSlopeHtoV, 3.5);
      const solidCells = queryCellsInPolygon(solidCoords, mesh);
      const levee: RiverLeveeStructure = {
        id: `levee-${Date.now()}`,
        name: structureName || 'Custom Levee',
        type: 'levee',
        enabled: true,
        coordinates: solidCoords.length > 0 ? solidCoords : coords,
        generatorPoints: [...coords],
        cellIndices: solidCells.length > 0 ? solidCells : affectedCells,
        stationM,
        crestElevationM: crestElevM,
        topWidthM,
        sideSlopeHtoV,
        solidMasking: true,
        cadProperties: { layerName: cadLayer, color: cadColor },
      };
      structObj = levee;
    } else if (selectedType === 'weir') {
      const solidCoords = createBroadCrestedWeirFootprint(coords[0], coords[coords.length - 1], 6.0);
      const solidCells = queryCellsInPolygon(solidCoords, mesh);
      const weir: RiverWeirStructure = {
        id: `weir-${Date.now()}`,
        name: structureName || 'Custom Weir',
        type: 'weir',
        enabled: true,
        coordinates: solidCoords.length > 0 ? solidCoords : coords,
        generatorPoints: [coords[0], coords[coords.length - 1]],
        cellIndices: solidCells.length > 0 ? solidCells : affectedCells,
        stationM,
        weirType,
        crestElevationM: crestElevM,
        crestLengthM: mesh.meanWidthM,
        crestWidthM: 6.0,
        dischargeCoefficient: weirCd,
        solidMasking: true,
        cadProperties: { layerName: cadLayer, color: cadColor },
      };
      structObj = weir;
    } else if (selectedType === 'bridge') {
      const solidCoords = expandPolylineToSolidPolygon(coords, 10.0);
      const solidCells = queryCellsInPolygon(solidCoords, mesh);
      const bridge: RiverBridgeStructure = {
        id: `bridge-${Date.now()}`,
        name: structureName || 'Custom Bridge',
        type: 'bridge',
        enabled: true,
        coordinates: solidCoords.length > 0 ? solidCoords : coords,
        generatorPoints: [...coords],
        cellIndices: solidCells.length > 0 ? solidCells : affectedCells,
        stationM,
        deckElevationM: deckElevM,
        lowChordElevationM: lowChordM,
        pierCount,
        pierWidthM,
        pierDragCoeff: 1.25,
        solidMasking: false,
        cadProperties: { layerName: cadLayer, color: cadColor },
      };
      structObj = bridge;
    } else if (selectedType === 'culvert') {
      const solidCoords = expandPolylineToSolidPolygon(coords, spanM * barrels + 2.0);
      const solidCells = queryCellsInPolygon(solidCoords, mesh);
      const culvert: RiverCulvertStructure = {
        id: `culvert-${Date.now()}`,
        name: structureName || 'Custom Culvert',
        type: 'culvert',
        enabled: true,
        coordinates: solidCoords.length > 0 ? solidCoords : coords,
        generatorPoints: [...coords],
        cellIndices: solidCells.length > 0 ? solidCells : affectedCells,
        stationM,
        barrelCount: barrels,
        diameterOrSpanM: spanM,
        riseM,
        lengthM: culvertLenM,
        inletInvertM: crestElevM - riseM,
        outletInvertM: crestElevM - riseM - 0.2,
        manningN: 0.013,
        inletLossCoeff: 0.5,
        solidMasking: false,
        cadProperties: { layerName: cadLayer, color: cadColor },
      };
      structObj = culvert;
    } else if (selectedType === 'gate') {
      const solidCoords = expandPolylineToSolidPolygon(coords, 3.5);
      const solidCells = queryCellsInPolygon(solidCoords, mesh);
      const gate: RiverGateStructure = {
        id: `gate-${Date.now()}`,
        name: structureName || 'Custom Gate',
        type: 'gate',
        enabled: true,
        coordinates: solidCoords.length > 0 ? solidCoords : coords,
        generatorPoints: [...coords],
        cellIndices: solidCells.length > 0 ? solidCells : affectedCells,
        stationM,
        gateType,
        gateWidthM,
        openingM,
        crestElevationM: crestElevM,
        dischargeCoefficient: 0.6,
        solidMasking: true,
        cadProperties: { layerName: cadLayer, color: cadColor },
      };
      structObj = gate;
    } else if (selectedType === 'spurdike') {
      const spurCells = affectedCells.slice(0, Math.max(1, Math.floor(mesh.ny * 0.4)));
      const bankPt = coords[0];
      const spurHead = coords[Math.min(coords.length - 1, Math.floor(mesh.ny * 0.4))];
      const solidCoords = createSolidGroyneFootprint(bankPt, spurHead, 3.5);
      const solidCells = queryCellsInPolygon(solidCoords, mesh);
      const spur: RiverSpurdikeStructure = {
        id: `spurdike-${Date.now()}`,
        name: structureName || 'Custom Spur Dike',
        type: 'spurdike',
        enabled: true,
        coordinates: solidCoords.length > 0 ? solidCoords : coords.slice(0, spurCells.length),
        generatorPoints: [bankPt, spurHead],
        cellIndices: solidCells.length > 0 ? solidCells : spurCells,
        stationM,
        crestElevationM: crestElevM,
        lengthM: spurLengthM,
        crestWidthM: 3.5,
        topWidthM: 3.5,
        permeability: spurPermeability,
        deflectionAngleDeg: spurAngleDeg,
        bank: spurBank,
        headSlopeHtoV: 2.0,
        headScourDepthM: 1.85,
        solidMasking: true,
        cadProperties: { layerName: cadLayer, color: cadColor },
      };
      structObj = spur;
    } else if (selectedType === 'bridge-pier') {
      const midIdx = Math.floor(affectedCells.length / 2);
      const pierCell = affectedCells[midIdx] || affectedCells[0];
      const pierCenter = coords[midIdx] || coords[0];
      const solidCoords = createSolidPierFootprint(pierCenter, standalonePierLengthM, standalonePierWidthM, pierShape, 0);
      const solidCells = queryCellsInPolygon(solidCoords, mesh);
      const pier: RiverBridgePierStructure = {
        id: `pier-${Date.now()}`,
        name: structureName || 'Custom Bridge Pier',
        type: 'bridge-pier',
        enabled: true,
        coordinates: solidCoords.length > 0 ? solidCoords : [pierCenter],
        generatorPoints: [pierCenter],
        cellIndices: solidCells.length > 0 ? solidCells : [pierCell],
        stationM,
        shape: pierShape,
        widthM: standalonePierWidthM,
        lengthM: standalonePierLengthM,
        topElevationM: crestElevM,
        crestElevationM: crestElevM,
        dragCoefficientCd: pierDragCd,
        scourDepthM: 2.1,
        solidMasking: true,
        cadProperties: { layerName: cadLayer, color: cadColor },
      };
      structObj = pier;
    } else if (selectedType === 'custom-deflector') {
      const solidCoords = expandPolylineToSolidPolygon(coords, deflectorThicknessM);
      const solidCells = queryCellsInPolygon(solidCoords, mesh);
      const deflector: RiverCustomDeflectorStructure = {
        id: `deflector-${Date.now()}`,
        name: structureName || 'Custom Deflector',
        type: 'custom-deflector',
        enabled: true,
        coordinates: solidCoords.length > 0 ? solidCoords : coords,
        generatorPoints: [...coords],
        cellIndices: solidCells.length > 0 ? solidCells : affectedCells,
        stationM,
        heightM: deflectorHeightM,
        wallThicknessM: deflectorThicknessM,
        crestElevationM: crestElevM,
        deflectionEfficiency: deflectorEfficiency,
        dragCoeff: 1.2,
        solidMasking: true,
        cadProperties: { layerName: cadLayer, color: cadColor },
      };
      structObj = deflector;
    } else {
      const solidCoords = expandPolylineToSolidPolygon(coords, topWidthM + 2.0 * sideSlopeHtoV * 3.0);
      const solidCells = queryCellsInPolygon(solidCoords, mesh);
      const emb: RiverEmbankmentStructure = {
        id: `emb-${Date.now()}`,
        name: structureName || 'Custom Embankment',
        type: 'embankment',
        enabled: true,
        coordinates: solidCoords.length > 0 ? solidCoords : coords,
        generatorPoints: [...coords],
        cellIndices: solidCells.length > 0 ? solidCells : affectedCells,
        stationM,
        crestElevationM: crestElevM,
        topWidthM,
        sideSlopeHtoV,
        overtopDischargeCoeff: 1.45,
        solidMasking: true,
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
                      type="button"
                      onClick={() => setInspectingStructureId(inspectingStructureId === s.id ? null : s.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                        inspectingStructureId === s.id
                          ? 'bg-cyan-600 text-white shadow'
                          : 'bg-slate-800 text-cyan-400 hover:bg-slate-700'
                      }`}
                    >
                      {inspectingStructureId === s.id ? 'Close' : 'Tune / Modify'}
                    </button>
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

          {/* Solid Civil Structure Live Inspector & Parameter Tuning */}
          {inspectingStructureId && (() => {
            const cur = structures.find((s) => s.id === inspectingStructureId);
            if (!cur) return null;
            const crestVal = cur.crestElevationM ?? (cur as any).topElevationM ?? 100.0;
            const thickVal = (cur as any).wallThicknessM ?? (cur as any).topWidthM ?? (cur as any).widthM ?? (cur as any).crestWidthM ?? 3.5;
            const slopeVal = (cur as any).sideSlopeHtoV ?? 2.0;
            const lenVal = (cur as any).lengthM ?? (cur as any).crestLengthM ?? 25.0;
            const rotVal = (cur as any).rotationDeg ?? (cur as any).deflectionAngleDeg ?? 0;
            const permVal = (cur as any).permeability ?? 0.0;
            const isSolid = (cur as any).solidMasking !== false;

            return (
              <div className="mt-3 p-4 bg-slate-900 border border-cyan-500/50 rounded-xl shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-xs font-bold text-cyan-300 uppercase tracking-wide">
                      Live Parameter Tuning: {cur.name} ({cur.type})
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 text-xs">
                    <input
                      type="checkbox"
                      checked={isSolid}
                      onChange={(e) => handleModifyStructure(cur.id, { solidMasking: e.target.checked })}
                      className="rounded accent-cyan-500"
                    />
                    <span className={isSolid ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                      Solid Masking (CFD h=0, u=0, v=0)
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {/* Crest Elevation */}
                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Crest Elevation</span>
                      <span className="text-cyan-300 font-mono">{crestVal.toFixed(2)} m</span>
                    </div>
                    <input
                      type="range"
                      min={(crestVal - 5).toFixed(1)}
                      max={(crestVal + 5).toFixed(1)}
                      step="0.05"
                      value={crestVal}
                      onChange={(e) => handleModifyStructure(cur.id, { crestElevationM: parseFloat(e.target.value), topElevationM: parseFloat(e.target.value) })}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>

                  {/* Thickness / Width */}
                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Thickness / Top Width</span>
                      <span className="text-cyan-300 font-mono">{thickVal.toFixed(1)} m</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="20.0"
                      step="0.2"
                      value={thickVal}
                      onChange={(e) => handleModifyStructure(cur.id, { topWidthM: parseFloat(e.target.value), wallThicknessM: parseFloat(e.target.value), widthM: parseFloat(e.target.value), crestWidthM: parseFloat(e.target.value) })}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>

                  {/* Side Slope H:V */}
                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Side Slope H:V</span>
                      <span className="text-cyan-300 font-mono">{slopeVal.toFixed(1)}:1</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="5.0"
                      step="0.1"
                      value={slopeVal}
                      onChange={(e) => handleModifyStructure(cur.id, { sideSlopeHtoV: parseFloat(e.target.value) })}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>

                  {/* Length */}
                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Structure Length</span>
                      <span className="text-cyan-300 font-mono">{lenVal.toFixed(1)} m</span>
                    </div>
                    <input
                      type="range"
                      min="2.0"
                      max="100.0"
                      step="1.0"
                      value={lenVal}
                      onChange={(e) => handleModifyStructure(cur.id, { lengthM: parseFloat(e.target.value), crestLengthM: parseFloat(e.target.value) })}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>

                  {/* Orientation Angle */}
                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Orientation / Angle</span>
                      <span className="text-cyan-300 font-mono">{rotVal.toFixed(0)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="5"
                      value={rotVal}
                      onChange={(e) => handleModifyStructure(cur.id, { rotationDeg: parseFloat(e.target.value), deflectionAngleDeg: parseFloat(e.target.value) })}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>

                  {/* Permeability */}
                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Permeability</span>
                      <span className="text-cyan-300 font-mono">{(permVal * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="0.8"
                      step="0.05"
                      value={permVal}
                      onChange={(e) => handleModifyStructure(cur.id, { permeability: parseFloat(e.target.value) })}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>

                  {/* Interactive Spatial Relocation */}
                  <div className="col-span-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 flex flex-col justify-between">
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Interactive Station Repositioning</span>
                      <span className="text-cyan-300 font-mono">{(cur.stationM ?? 0).toFixed(0)} m</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleModifyStructure(cur.id, { stationM: Math.max(0, (cur.stationM ?? 0) - 10) })}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-[11px]"
                      >
                        -10m
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModifyStructure(cur.id, { stationM: Math.max(0, (cur.stationM ?? 0) - 2) })}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-[11px]"
                      >
                        -2m
                      </button>
                      <input
                        type="range"
                        min="0"
                        max={mesh.reachLengthM}
                        step="2"
                        value={cur.stationM ?? 0}
                        onChange={(e) => handleModifyStructure(cur.id, { stationM: parseFloat(e.target.value) })}
                        className="flex-1 accent-cyan-500 cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() => handleModifyStructure(cur.id, { stationM: Math.min(mesh.reachLengthM, (cur.stationM ?? 0) + 2) })}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-[11px]"
                      >
                        +2m
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModifyStructure(cur.id, { stationM: Math.min(mesh.reachLengthM, (cur.stationM ?? 0) + 10) })}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-[11px]"
                      >
                        +10m
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
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

          <div className="grid grid-cols-3 md:grid-cols-9 gap-2 mb-3">
            {[
              { type: 'levee', label: '🧱 Levee', desc: 'Overbank flood barrier' },
              { type: 'weir', label: '🌊 Weir', desc: 'Stage control overflow' },
              { type: 'bridge', label: '🌉 Bridge', desc: 'Deck & pier contraction' },
              { type: 'culvert', label: '🕳️ Culvert', desc: 'FHWA HDS-5 barrel' },
              { type: 'gate', label: '🚪 Gate', desc: 'Sluice & radial orifice' },
              { type: 'embankment', label: '🛡️ Embankment', desc: 'Highway river dyke' },
              { type: 'spurdike', label: '📐 Spur Dike', desc: 'Groyne flow deflection' },
              { type: 'bridge-pier', label: '🏛️ Bridge Pier', desc: 'Pier scour & wake' },
              { type: 'custom-deflector', label: '🧭 Deflector', desc: 'Guide wall training' },
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

            {selectedType === 'spurdike' && (
              <div className="grid grid-cols-4 gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <label className="text-slate-400 block mb-1">Spur Length (m)</label>
                  <input
                    type="number"
                    step="1"
                    value={spurLengthM}
                    onChange={(e) => setSpurLengthM(parseFloat(e.target.value) || 20)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Permeability (0 = Rock, 0.4 = Piles)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="0.8"
                    value={spurPermeability}
                    onChange={(e) => setSpurPermeability(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Deflection Angle (°)</label>
                  <input
                    type="number"
                    step="5"
                    value={spurAngleDeg}
                    onChange={(e) => setSpurAngleDeg(parseFloat(e.target.value) || 90)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Anchor Bank</label>
                  <select
                    value={spurBank}
                    onChange={(e) => setSpurBank(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="left">Left Bank Groyne</option>
                    <option value="right">Right Bank Groyne</option>
                  </select>
                </div>
              </div>
            )}

            {selectedType === 'bridge-pier' && (
              <div className="grid grid-cols-4 gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <label className="text-slate-400 block mb-1">Pier Nose Shape</label>
                  <select
                    value={pierShape}
                    onChange={(e) => setPierShape(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="round-nose">Round Nose (Cd ≈ 1.0, K1 = 1.0)</option>
                    <option value="sharp-nose">Sharp Aerodynamic Nose (Cd ≈ 0.7, K1 = 0.9)</option>
                    <option value="circular">Circular Cylinder (Cd ≈ 1.2, K1 = 1.0)</option>
                    <option value="square">Square / Blunt (Cd ≈ 2.0, K1 = 1.1)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Pier Width a (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={standalonePierWidthM}
                    onChange={(e) => setStandalonePierWidthM(parseFloat(e.target.value) || 1.5)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Pier Length L (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={standalonePierLengthM}
                    onChange={(e) => setStandalonePierLengthM(parseFloat(e.target.value) || 6.0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Drag Coeff Cd</label>
                  <input
                    type="number"
                    step="0.1"
                    value={pierDragCd}
                    onChange={(e) => setPierDragCd(parseFloat(e.target.value) || 1.0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
              </div>
            )}

            {selectedType === 'custom-deflector' && (
              <div className="grid grid-cols-3 gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <label className="text-slate-400 block mb-1">Wall Height (m)</label>
                  <input
                    type="number"
                    step="0.2"
                    value={deflectorHeightM}
                    onChange={(e) => setDeflectorHeightM(parseFloat(e.target.value) || 3.0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Thickness (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={deflectorThicknessM}
                    onChange={(e) => setDeflectorThicknessM(parseFloat(e.target.value) || 1.0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Deflection Efficiency (0 - 1)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1.0"
                    value={deflectorEfficiency}
                    onChange={(e) => setDeflectorEfficiency(parseFloat(e.target.value) || 0.85)}
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
