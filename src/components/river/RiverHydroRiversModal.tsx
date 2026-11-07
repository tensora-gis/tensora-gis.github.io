/**
 * Global HydroRIVERS Explorer & NASA SWOT Ingestion Modal
 *
 * Browses and loads global river reaches from the HydroRIVERS vector network
 * with hydrometric basin metadata (Stream order, discharge, gradient) and NASA SWOT observations.
 */

import React, { useState } from 'react';
import {
  HydroRiverReach,
  RiverMesh,
  RiverBoundaryConditions,
  SwotObservation,
} from '../../types/riverAnalysis';
import {
  GLOBAL_HYDRORIVERS_CATALOG,
  SAMPLE_SWOT_OBSERVATIONS,
} from '../../utils/riverHydroDataService';
import { generateCurvilinearRiverMesh } from '../../utils/riverMeshGenerator';
import { X, Globe, Satellite, ArrowRight } from 'lucide-react';

interface RiverHydroRiversModalProps {
  onLoadHydroRiverReach: (
    mesh: RiverMesh,
    boundaries: RiverBoundaryConditions,
    swotObs?: SwotObservation
  ) => void;
  onClose: () => void;
}

export const RiverHydroRiversModal: React.FC<RiverHydroRiversModalProps> = ({
  onLoadHydroRiverReach,
  onClose,
}) => {
  const [selectedReach, setSelectedReach] = useState<HydroRiverReach>(
    GLOBAL_HYDRORIVERS_CATALOG[0]
  );

  const handleSelectAndLoad = (reach: HydroRiverReach) => {
    // Generate appropriate 2D finite-volume mesh
    const meanWidth =
      reach.streamOrder >= 9 ? 450 : reach.streamOrder >= 7 ? 180 : reach.streamOrder >= 5 ? 40 : 25;

    const mesh = generateCurvilinearRiverMesh(
      reach.riverName,
      reach.pathCoordinates,
      35,
      10,
      150.0,
      reach.gradientPercent / 100,
      0.030,
      meanWidth
    );

    const boundaries: RiverBoundaryConditions = {
      upstreamType: 'constant-discharge',
      upstreamDischargeM3s: Math.max(10, Math.min(25000, reach.meanDischargeM3s)),
      downstreamType: 'normal-depth',
      downstreamSlope: Math.max(0.0001, reach.gradientPercent / 100),
      downstreamStageM: 149.0,
      rainfallIntensityMmPerHr: 0,
      initialWaterDepthM: reach.streamOrder >= 8 ? 4.0 : 2.0,
      manningRoughnessDefault: 0.030,
    };

    let swotObs: SwotObservation | undefined = undefined;
    if (reach.riverName.includes('Danube')) {
      swotObs = SAMPLE_SWOT_OBSERVATIONS['danube-wachau'];
    } else if (reach.riverName.includes('Mississippi')) {
      swotObs = SAMPLE_SWOT_OBSERVATIONS['mississippi-batonrouge'];
    } else if (reach.riverName.includes('Rhine')) {
      swotObs = SAMPLE_SWOT_OBSERVATIONS['rhine-gorge'];
    }

    onLoadHydroRiverReach(mesh, boundaries, swotObs);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-[#111] border border-[#262626] rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-[#e5e7eb]">
        {/* Header */}
        <div className="h-12 px-5 border-b border-[#222] flex items-center justify-between bg-[#141414]">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white font-tech">
              Global HydroRIVERS Network & NASA SWOT Radar Explorer
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#222] text-[#888] hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Left reach list + Right Reach metadata */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Reaches list */}
          <div className="w-80 border-r border-[#222] p-3 overflow-y-auto bg-[#0e0e0e] space-y-1.5">
            <div className="text-[11px] font-mono text-[#737373] uppercase mb-2">
              Available Global River Reaches ({GLOBAL_HYDRORIVERS_CATALOG.length})
            </div>
            {GLOBAL_HYDRORIVERS_CATALOG.map((reach) => (
              <div
                key={reach.reachId}
                onClick={() => setSelectedReach(reach)}
                className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                  selectedReach.reachId === reach.reachId
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                    : 'bg-[#141414] border-[#222] text-[#a3a3a3] hover:text-white hover:bg-[#1a1a1a]'
                }`}
              >
                <div className="font-semibold">{reach.riverName}</div>
                <div className="text-[10px] text-[#666] font-mono mt-0.5">
                  {reach.continent} • Stream Order {reach.streamOrder} • Q: {reach.meanDischargeM3s.toLocaleString()} m³/s
                </div>
              </div>
            ))}
          </div>

          {/* Right: Reach Details & SWOT Data */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-[#111]">
            <div className="pb-3 border-b border-[#222]">
              <h3 className="text-lg font-bold text-white font-tech">{selectedReach.riverName}</h3>
              <span className="text-xs text-cyan-400 font-mono">
                HydroRIVERS Reach ID: #{selectedReach.reachId} • Main Basin: {selectedReach.mainBasin}
              </span>
            </div>

            {/* Basin & Hydraulics Parameters Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="bg-[#171717] border border-[#262626] rounded p-2.5">
                <span className="text-[#666] text-[10px] block">STRAHLER STREAM ORDER</span>
                <span className="text-white font-bold text-sm">Order {selectedReach.streamOrder}</span>
              </div>

              <div className="bg-[#171717] border border-[#262626] rounded p-2.5">
                <span className="text-[#666] text-[10px] block">MEAN ANNUAL DISCHARGE</span>
                <span className="text-cyan-400 font-bold text-sm">
                  {selectedReach.meanDischargeM3s.toLocaleString()} m³/s
                </span>
              </div>

              <div className="bg-[#171717] border border-[#262626] rounded p-2.5">
                <span className="text-[#666] text-[10px] block">LONGITUDINAL GRADIENT</span>
                <span className="text-white font-bold text-sm">{selectedReach.gradientPercent.toFixed(3)} %</span>
              </div>

              <div className="bg-[#171717] border border-[#262626] rounded p-2.5">
                <span className="text-[#666] text-[10px] block">UPSTREAM BASIN AREA</span>
                <span className="text-white font-bold text-sm">
                  {selectedReach.upAreaKm2.toLocaleString()} km²
                </span>
              </div>

              <div className="bg-[#171717] border border-[#262626] rounded p-2.5">
                <span className="text-[#666] text-[10px] block">REACH SECTION LENGTH</span>
                <span className="text-white font-bold text-sm">{(selectedReach.lengthKm * 1000).toFixed(0)} m</span>
              </div>

              <div className="bg-[#171717] border border-[#262626] rounded p-2.5">
                <span className="text-[#666] text-[10px] block">CENTER COORDINATES</span>
                <span className="text-emerald-400 font-bold text-sm">
                  {selectedReach.centerCoordinates.lat.toFixed(4)}°, {selectedReach.centerCoordinates.lng.toFixed(4)}°
                </span>
              </div>
            </div>

            {/* NASA SWOT Observations Card if available */}
            <div className="bg-[#171717] border border-cyan-500/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Satellite className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white font-tech uppercase">
                  NASA SWOT Satellite Orbit Reference
                </span>
              </div>
              <p className="text-[11px] text-[#aaa] font-mono leading-relaxed">
                KaRIn (Ka-band Radar Interferometer) surface water altimetry observations are available for this reach.
                Running 2D CFD automatically benchmarks simulated water levels against SWOT radar passes.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-12 px-5 border-t border-[#222] flex items-center justify-between bg-[#141414] text-xs">
          <span className="text-[#737373]">HydroRIVERS Global River Topology Dataset (v1.0)</span>
          <button
            onClick={() => handleSelectAndLoad(selectedReach)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold cursor-pointer shadow-sm"
          >
            <span>Load Reach & Build 2D Mesh</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
