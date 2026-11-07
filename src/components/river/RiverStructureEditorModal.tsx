/**
 * River Hydraulic Structures Editor Modal
 *
 * Allows civil and hydraulic engineers to inspect, toggle, configure,
 * add, and remove structures (levees, weirs, bridges, culverts, gates, embankments)
 * to evaluate flood defense and backwater scenarios.
 */

import React, { useState } from 'react';
import {
  RiverStructure,
  RiverStructureType,
  RiverLeveeStructure,
  RiverWeirStructure,
  RiverBridgeStructure,
  RiverCulvertStructure,
  RiverGateStructure,
  RiverEmbankmentStructure,
  RiverMesh,
} from '../../types/riverAnalysis';
import {
  X,
  Trash2,
  Building,
} from 'lucide-react';

interface RiverStructureEditorModalProps {
  structures: RiverStructure[];
  mesh: RiverMesh;
  onUpdateStructures: (structures: RiverStructure[]) => void;
  onClose: () => void;
}

export const RiverStructureEditorModal: React.FC<RiverStructureEditorModalProps> = ({
  structures,
  mesh,
  onUpdateStructures,
  onClose,
}) => {
  const [selectedStructureId, setSelectedStructureId] = useState<string>(
    structures[0]?.id || ''
  );

  const selectedStruct = structures.find((s) => s.id === selectedStructureId);

  const handleToggleEnable = (id: string) => {
    const updated = structures.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    );
    onUpdateStructures(updated);
  };

  const handleDeleteStructure = (id: string) => {
    const updated = structures.filter((s) => s.id !== id);
    onUpdateStructures(updated);
    if (selectedStructureId === id) {
      setSelectedStructureId(updated[0]?.id || '');
    }
  };

  const handleUpdateParameter = (field: string, value: any) => {
    if (!selectedStruct) return;
    const updated = structures.map((s) => {
      if (s.id === selectedStruct.id) {
        return {
          ...s,
          [field]: value,
        };
      }
      return s;
    });
    onUpdateStructures(updated as RiverStructure[]);
  };

  const handleAddNewStructure = (type: RiverStructureType) => {
    const id = `${type}-${Date.now().toString().slice(-4)}`;
    const midRow = Math.floor(mesh.nx / 2);
    const affectedCells = Array.from({ length: mesh.ny }, (_, k) => midRow * mesh.ny + k);
    const midCenterline = mesh.centerline[Math.floor(mesh.centerline.length / 2)] || {
      lat: 47.126,
      lng: 9.513,
      meanBedElevationM: 100,
    };

    let newStruct: RiverStructure;

    if (type === 'levee') {
      newStruct = {
        id,
        name: `New Earth Levee ${id}`,
        type: 'levee',
        enabled: true,
        crestElevationM: Math.round((midCenterline.meanBedElevationM + 3.0) * 10) / 10,
        topWidthM: 3.0,
        sideSlopeHtoV: 2.0,
        coordinates: [
          { lat: midCenterline.lat, lng: midCenterline.lng },
          { lat: midCenterline.lat + 0.001, lng: midCenterline.lng + 0.001 },
        ],
        cellIndices: affectedCells.slice(0, 4),
        description: 'New flood defense levee',
      };
    } else if (type === 'weir') {
      newStruct = {
        id,
        name: `New Broad-Crested Weir ${id}`,
        type: 'weir',
        enabled: true,
        weirType: 'broad-crested',
        crestElevationM: Math.round((midCenterline.meanBedElevationM + 1.2) * 10) / 10,
        crestLengthM: mesh.meanWidthM,
        dischargeCoefficient: 1.70,
        coordinates: [
          { lat: midCenterline.lat, lng: midCenterline.lng },
          { lat: midCenterline.lat + 0.0005, lng: midCenterline.lng + 0.0005 },
        ],
        cellIndices: affectedCells,
        description: 'New drop control weir',
      };
    } else if (type === 'bridge') {
      newStruct = {
        id,
        name: `New Bridge Crossing ${id}`,
        type: 'bridge',
        enabled: true,
        deckElevationM: Math.round((midCenterline.meanBedElevationM + 5.0) * 10) / 10,
        lowChordElevationM: Math.round((midCenterline.meanBedElevationM + 3.8) * 10) / 10,
        pierCount: 2,
        pierWidthM: 1.2,
        pierDragCoeff: 1.2,
        coordinates: [
          { lat: midCenterline.lat, lng: midCenterline.lng },
          { lat: midCenterline.lat + 0.0005, lng: midCenterline.lng + 0.0005 },
        ],
        cellIndices: affectedCells,
        description: 'Highway crossing bridge with pier drag',
      };
    } else if (type === 'culvert') {
      newStruct = {
        id,
        name: `New Road Culvert ${id}`,
        type: 'culvert',
        enabled: true,
        barrelCount: 2,
        diameterOrSpanM: 2.0,
        riseM: 2.0,
        lengthM: 25.0,
        inletInvertM: midCenterline.meanBedElevationM,
        outletInvertM: midCenterline.meanBedElevationM - 0.2,
        manningN: 0.014,
        inletLossCoeff: 0.5,
        coordinates: [
          { lat: midCenterline.lat, lng: midCenterline.lng },
          { lat: midCenterline.lat + 0.0004, lng: midCenterline.lng + 0.0004 },
        ],
        cellIndices: affectedCells.slice(0, 3),
        description: 'Twin barrel road embankment culvert',
      };
    } else if (type === 'gate') {
      newStruct = {
        id,
        name: `New Regulating Gate ${id}`,
        type: 'gate',
        enabled: true,
        gateType: 'sluice',
        gateWidthM: 15.0,
        openingM: 1.5,
        crestElevationM: midCenterline.meanBedElevationM,
        dischargeCoefficient: 0.60,
        coordinates: [
          { lat: midCenterline.lat, lng: midCenterline.lng },
          { lat: midCenterline.lat + 0.0004, lng: midCenterline.lng + 0.0004 },
        ],
        cellIndices: affectedCells,
        description: 'Controllable undershot sluice gate',
      };
    } else {
      newStruct = {
        id,
        name: `New Embankment ${id}`,
        type: 'embankment',
        enabled: true,
        crestElevationM: Math.round((midCenterline.meanBedElevationM + 2.5) * 10) / 10,
        topWidthM: 4.0,
        overtopDischargeCoeff: 1.45,
        coordinates: [
          { lat: midCenterline.lat, lng: midCenterline.lng },
          { lat: midCenterline.lat + 0.0005, lng: midCenterline.lng + 0.0005 },
        ],
        cellIndices: affectedCells,
        description: 'Road embankment crossing',
      };
    }

    onUpdateStructures([...structures, newStruct]);
    setSelectedStructureId(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-[#111] border border-[#262626] rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-[#e5e7eb]">
        {/* Header */}
        <div className="h-12 px-5 border-b border-[#222] flex items-center justify-between bg-[#141414]">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-bold text-white font-tech">
              Hydraulic Structures Manager (2D Mesh Coupled)
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#222] text-[#888] hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body: Left List + Right Parameters */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Structure List */}
          <div className="w-72 border-r border-[#222] p-3 flex flex-col justify-between bg-[#0e0e0e]">
            <div>
              <div className="text-[11px] font-mono text-[#737373] uppercase mb-2">
                Configured Structures ({structures.length})
              </div>
              <div className="space-y-1.5 overflow-y-auto max-h-[50vh]">
                {structures.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedStructureId(s.id)}
                    className={`p-2 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                      selectedStructureId === s.id
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                        : 'bg-[#141414] border-[#222] text-[#a3a3a3] hover:text-white hover:bg-[#1a1a1a]'
                    }`}
                  >
                    <div>
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-[10px] text-[#666] font-mono uppercase">{s.type}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggleEnable(s.id);
                      }}
                      className="accent-amber-500 cursor-pointer"
                      title={s.enabled ? 'Enabled' : 'Disabled'}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Add New Structure Dropdown / Buttons */}
            <div className="pt-3 border-t border-[#222]">
              <div className="text-[10px] font-mono text-[#666] uppercase mb-1.5">Add Structure to Mesh:</div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <button
                  onClick={() => handleAddNewStructure('levee')}
                  className="px-2 py-1 rounded bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] text-[#ddd] cursor-pointer text-left"
                >
                  + Levee
                </button>
                <button
                  onClick={() => handleAddNewStructure('weir')}
                  className="px-2 py-1 rounded bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] text-[#ddd] cursor-pointer text-left"
                >
                  + Weir
                </button>
                <button
                  onClick={() => handleAddNewStructure('bridge')}
                  className="px-2 py-1 rounded bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] text-[#ddd] cursor-pointer text-left"
                >
                  + Bridge
                </button>
                <button
                  onClick={() => handleAddNewStructure('culvert')}
                  className="px-2 py-1 rounded bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] text-[#ddd] cursor-pointer text-left"
                >
                  + Culvert
                </button>
                <button
                  onClick={() => handleAddNewStructure('gate')}
                  className="px-2 py-1 rounded bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] text-[#ddd] cursor-pointer text-left"
                >
                  + Gate
                </button>
                <button
                  onClick={() => handleAddNewStructure('embankment')}
                  className="px-2 py-1 rounded bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] text-[#ddd] cursor-pointer text-left"
                >
                  + Roadway
                </button>
              </div>
            </div>
          </div>

          {/* Right: Structure Properties Form */}
          <div className="flex-1 p-5 overflow-y-auto bg-[#111]">
            {selectedStruct ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#222]">
                  <div>
                    <h3 className="text-base font-bold text-white font-tech">{selectedStruct.name}</h3>
                    <span className="text-[11px] text-amber-400 font-mono uppercase font-semibold">
                      Type: {selectedStruct.type} • Status: {selectedStruct.enabled ? 'ACTIVE' : 'BYPASSED'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteStructure(selectedStruct.id)}
                    className="p-1.5 rounded hover:bg-red-500/20 text-[#888] hover:text-red-400 border border-transparent hover:border-red-500/30 transition-colors cursor-pointer"
                    title="Delete Structure"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Common Name & Description */}
                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                  <div>
                    <label className="text-[#888] block mb-1">Structure Label</label>
                    <input
                      type="text"
                      value={selectedStruct.name}
                      onChange={(e) => handleUpdateParameter('name', e.target.value)}
                      className="w-full bg-[#171717] border border-[#333] rounded px-3 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[#888] block mb-1">Description / Notes</label>
                    <input
                      type="text"
                      value={selectedStruct.description || ''}
                      onChange={(e) => handleUpdateParameter('description', e.target.value)}
                      className="w-full bg-[#171717] border border-[#333] rounded px-3 py-1.5 text-white"
                    />
                  </div>
                </div>

                {/* Specific Parameters based on Structure Type */}
                <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 space-y-3">
                  <div className="text-xs font-bold text-white font-tech uppercase tracking-wider mb-2">
                    Physical Hydraulics Parameters
                  </div>

                  {selectedStruct.type === 'levee' && (
                    <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                      <div>
                        <label className="text-[#888] block mb-1">Crest Elevation (m MSL)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={(selectedStruct as RiverLeveeStructure).crestElevationM}
                          onChange={(e) => handleUpdateParameter('crestElevationM', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[#888] block mb-1">Top Width (m)</label>
                        <input
                          type="number"
                          step="0.5"
                          value={(selectedStruct as RiverLeveeStructure).topWidthM}
                          onChange={(e) => handleUpdateParameter('topWidthM', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[#888] block mb-1">Side Slope (H:1V)</label>
                        <input
                          type="number"
                          step="0.5"
                          value={(selectedStruct as RiverLeveeStructure).sideSlopeHtoV}
                          onChange={(e) => handleUpdateParameter('sideSlopeHtoV', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                    </div>
                  )}

                  {selectedStruct.type === 'weir' && (
                    <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                      <div>
                        <label className="text-[#888] block mb-1">Crest Elevation (m MSL)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={(selectedStruct as RiverWeirStructure).crestElevationM}
                          onChange={(e) => handleUpdateParameter('crestElevationM', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[#888] block mb-1">Weir Crest Length (m)</label>
                        <input
                          type="number"
                          step="1"
                          value={(selectedStruct as RiverWeirStructure).crestLengthM}
                          onChange={(e) => handleUpdateParameter('crestLengthM', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[#888] block mb-1">Discharge Coeff (Cd)</label>
                        <input
                          type="number"
                          step="0.05"
                          value={(selectedStruct as RiverWeirStructure).dischargeCoefficient}
                          onChange={(e) => handleUpdateParameter('dischargeCoefficient', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                    </div>
                  )}

                  {selectedStruct.type === 'bridge' && (
                    <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                      <div>
                        <label className="text-[#888] block mb-1">Deck Elevation (m MSL)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={(selectedStruct as RiverBridgeStructure).deckElevationM}
                          onChange={(e) => handleUpdateParameter('deckElevationM', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[#888] block mb-1">Low-Chord Elevation (m)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={(selectedStruct as RiverBridgeStructure).lowChordElevationM}
                          onChange={(e) => handleUpdateParameter('lowChordElevationM', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[#888] block mb-1">Pier Count & Width (m)</label>
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            step="1"
                            value={(selectedStruct as RiverBridgeStructure).pierCount}
                            onChange={(e) => handleUpdateParameter('pierCount', parseInt(e.target.value, 10))}
                            className="w-1/2 bg-[#111] border border-[#333] rounded px-2 py-1.5 text-white"
                            title="Number of piers"
                          />
                          <input
                            type="number"
                            step="0.1"
                            value={(selectedStruct as RiverBridgeStructure).pierWidthM}
                            onChange={(e) => handleUpdateParameter('pierWidthM', parseFloat(e.target.value))}
                            className="w-1/2 bg-[#111] border border-[#333] rounded px-2 py-1.5 text-white"
                            title="Width per pier in meters"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedStruct.type === 'culvert' && (
                    <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                      <div>
                        <label className="text-[#888] block mb-1">Barrel Count & Span (m)</label>
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            step="1"
                            value={(selectedStruct as RiverCulvertStructure).barrelCount}
                            onChange={(e) => handleUpdateParameter('barrelCount', parseInt(e.target.value, 10))}
                            className="w-1/2 bg-[#111] border border-[#333] rounded px-2 py-1.5 text-white"
                          />
                          <input
                            type="number"
                            step="0.1"
                            value={(selectedStruct as RiverCulvertStructure).diameterOrSpanM}
                            onChange={(e) => handleUpdateParameter('diameterOrSpanM', parseFloat(e.target.value))}
                            className="w-1/2 bg-[#111] border border-[#333] rounded px-2 py-1.5 text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[#888] block mb-1">Inlet Invert (m MSL)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={(selectedStruct as RiverCulvertStructure).inletInvertM}
                          onChange={(e) => handleUpdateParameter('inletInvertM', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[#888] block mb-1">Outlet Invert (m MSL)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={(selectedStruct as RiverCulvertStructure).outletInvertM}
                          onChange={(e) => handleUpdateParameter('outletInvertM', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                    </div>
                  )}

                  {selectedStruct.type === 'gate' && (
                    <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                      <div>
                        <label className="text-[#888] block mb-1">Gate Opening Height (m)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={(selectedStruct as RiverGateStructure).openingM}
                          onChange={(e) => handleUpdateParameter('openingM', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[#888] block mb-1">Gate Width (m)</label>
                        <input
                          type="number"
                          step="0.5"
                          value={(selectedStruct as RiverGateStructure).gateWidthM}
                          onChange={(e) => handleUpdateParameter('gateWidthM', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[#888] block mb-1">Sill Elevation (m MSL)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={(selectedStruct as RiverGateStructure).crestElevationM}
                          onChange={(e) => handleUpdateParameter('crestElevationM', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                    </div>
                  )}

                  {selectedStruct.type === 'embankment' && (
                    <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                      <div>
                        <label className="text-[#888] block mb-1">Roadway Crest Elevation (m MSL)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={(selectedStruct as RiverEmbankmentStructure).crestElevationM}
                          onChange={(e) => handleUpdateParameter('crestElevationM', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[#888] block mb-1">Roadway Width (m)</label>
                        <input
                          type="number"
                          step="0.5"
                          value={(selectedStruct as RiverEmbankmentStructure).topWidthM}
                          onChange={(e) => handleUpdateParameter('topWidthM', parseFloat(e.target.value))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-300">
                  💡 Note: Modifying structure parameters automatically adjusts flux conditions in the next 2D CFD time-step.
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-[#666]">
                <Building className="w-8 h-8 mb-2 opacity-50" />
                <p>Select or create a structure to modify parameters</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="h-12 px-5 border-t border-[#222] flex items-center justify-between bg-[#141414] text-xs">
          <span className="text-[#737373]">Coupled to 2D Shallow-Water Saint-Venant Mesh</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-semibold cursor-pointer"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
