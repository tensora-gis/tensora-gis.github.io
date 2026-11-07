/**
 * CAD-Style Civil Engineering Hydraulic Structure Editor & Placer
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
import { createCustomCadStructure } from '../structures/structureFlux';

interface StructurePlacerProps {
  isOpen: boolean;
  onClose: () => void;
  mesh: RiverGridMesh;
  structures: RiverHydraulicStructure[];
  onUpdateStructures: (structures: RiverHydraulicStructure[]) => void;
}

export const StructurePlacer: React.FC<StructurePlacerProps> = ({
  isOpen,
  onClose,
  mesh,
  structures,
  onUpdateStructures,
}) => {
  const [selectedType, setSelectedType] = useState<RiverStructureType>('levee');
  const [structureName, setStructureName] = useState('New Levee Barrier');
  const [cadLayer, setCadLayer] = useState('CIVIL_DEFENSE');
  const [cadColor, setCadColor] = useState('#f59e0b');
  const [stationM, setStationM] = useState(250);

  // Common parameters
  const [crestElevM, setCrestElevM] = useState(103.5);
  const [topWidthM, setTopWidthM] = useState(4.0);
  const [sideSlopeHtoV, setSideSlopeHtoV] = useState(2.0);

  // Weir parameters
  const [weirType, setWeirType] = useState<'broad-crested' | 'sharp-crested'>('broad-crested');
  const [weirCd, setWeirCd] = useState(1.7);

  // Bridge parameters
  const [deckElevM, setDeckElevM] = useState(105.0);
  const [lowChordM, setLowChordM] = useState(103.0);
  const [pierCount, setPierCount] = useState(2);
  const [pierWidthM, setPierWidthM] = useState(1.2);

  // Culvert parameters
  const [barrels, setBarrels] = useState(2);
  const [spanM, setSpanM] = useState(2.0);
  const [riseM, setRiseM] = useState(2.0);
  const [culvertLenM, setCulvertLenM] = useState(20.0);

  // Gate parameters
  const [gateType, setGateType] = useState<'sluice' | 'radial'>('sluice');
  const [openingM, setOpeningM] = useState(1.5);
  const [gateWidthM, setGateWidthM] = useState(12.0);

  if (!isOpen) return null;

  const handleToggleStructure = (id: string) => {
    const updated = structures.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    );
    onUpdateStructures(updated);
  };

  const handleDeleteStructure = (id: string) => {
    onUpdateStructures(structures.filter((s) => s.id !== id));
  };

  const handleAddStructure = () => {
    // Map station to cell indices (span across the transverse cells at that streamwise station)
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

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full p-5 shadow-2xl text-slate-100 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </span>
            <h3 className="text-base font-semibold">CAD Hydraulic Structures Placer & Formulations</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            ✕
          </button>
        </div>

        {/* Existing Structures List */}
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Placed Hydraulic Structures ({structures.length})
          </h4>
          {structures.length === 0 ? (
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-slate-400 text-center">
              No hydraulic structures currently in reach. Add one below to model levees, weirs, or bridges.
            </div>
          ) : (
            <div className="space-y-2">
              {structures.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-2.5 bg-slate-800/60 border border-slate-700/60 rounded-lg text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: s.cadProperties?.color || '#38bdf8' }}
                    />
                    <div>
                      <div className="font-semibold text-slate-200">
                        {s.name} <span className="text-[10px] text-cyan-400 uppercase">({s.type})</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Station: {s.stationM ? `${s.stationM.toFixed(0)}m` : 'Transect'} | Layer:{' '}
                        {s.cadProperties?.layerName || 'CIVIL'} | Cells: {s.cellIndices.length}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleStructure(s.id)}
                      className={`px-2.5 py-1 rounded font-medium transition ${
                        s.enabled
                          ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {s.enabled ? 'ACTIVE' : 'BYPASSED'}
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

        {/* Add Structure Section */}
        <div className="border-t border-slate-800 pt-3">
          <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-2">
            Add New CAD Hydraulic Structure
          </h4>

          <div className="grid grid-cols-3 gap-3 text-xs mb-3">
            <div>
              <label className="text-slate-400 block mb-1">Structure Type (Formulation)</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as RiverStructureType)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="levee">Levee / Floodwall (Broad Crest)</option>
                <option value="weir">Weir (Broad / Sharp Crest)</option>
                <option value="bridge">Bridge Piers (Yarnell Formulation)</option>
                <option value="culvert">Culvert (FHWA HDS-5 Inlet/Outlet)</option>
                <option value="gate">Sluice / Radial Gate</option>
                <option value="embankment">Road Transportation Embankment</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Structure Name</label>
              <input
                type="text"
                value={structureName}
                onChange={(e) => setStructureName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Reach Station (m from origin)</label>
              <input
                type="number"
                value={stationM}
                onChange={(e) => setStationM(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">CAD Layer Name</label>
              <input
                type="text"
                value={cadLayer}
                onChange={(e) => setCadLayer(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">CAD Color</label>
              <input
                type="color"
                value={cadColor}
                onChange={(e) => setCadColor(e.target.value)}
                className="w-full h-8 bg-slate-800 border border-slate-700 rounded p-0.5 cursor-pointer"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Crest / Primary Elev (m MSL)</label>
              <input
                type="number"
                step="0.1"
                value={crestElevM}
                onChange={(e) => setCrestElevM(parseFloat(e.target.value) || 100)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Type-Specific Parameters */}
          {selectedType === 'bridge' && (
            <div className="grid grid-cols-4 gap-3 text-xs bg-slate-950/40 p-3 rounded-lg border border-slate-800 mb-3">
              <div>
                <label className="text-slate-400 block mb-1">Deck Elevation (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={deckElevM}
                  onChange={(e) => setDeckElevM(parseFloat(e.target.value) || 105)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Low Chord Elev (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={lowChordM}
                  onChange={(e) => setLowChordM(parseFloat(e.target.value) || 103)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Pier Count</label>
                <input
                  type="number"
                  value={pierCount}
                  onChange={(e) => setPierCount(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Pier Width (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={pierWidthM}
                  onChange={(e) => setPierWidthM(parseFloat(e.target.value) || 1.0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
                />
              </div>
            </div>
          )}

          {selectedType === 'culvert' && (
            <div className="grid grid-cols-4 gap-3 text-xs bg-slate-950/40 p-3 rounded-lg border border-slate-800 mb-3">
              <div>
                <label className="text-slate-400 block mb-1">Barrels</label>
                <input
                  type="number"
                  value={barrels}
                  onChange={(e) => setBarrels(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Span (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={spanM}
                  onChange={(e) => setSpanM(parseFloat(e.target.value) || 2.0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Rise (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={riseM}
                  onChange={(e) => setRiseM(parseFloat(e.target.value) || 2.0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Length (m)</label>
                <input
                  type="number"
                  step="1"
                  value={culvertLenM}
                  onChange={(e) => setCulvertLenM(parseFloat(e.target.value) || 20.0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
                />
              </div>
            </div>
          )}

          {selectedType === 'gate' && (
            <div className="grid grid-cols-3 gap-3 text-xs bg-slate-950/40 p-3 rounded-lg border border-slate-800 mb-3">
              <div>
                <label className="text-slate-400 block mb-1">Gate Pattern</label>
                <select
                  value={gateType}
                  onChange={(e) => setGateType(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
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
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Gate Width (m)</label>
                <input
                  type="number"
                  step="0.5"
                  value={gateWidthM}
                  onChange={(e) => setGateWidthM(parseFloat(e.target.value) || 10.0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={handleAddStructure}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold transition shadow-md"
            >
              + Place Structure in Reach
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
