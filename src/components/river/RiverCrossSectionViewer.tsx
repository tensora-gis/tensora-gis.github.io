/**
 * River Cross-Section & Longitudinal Hydraulic Profile Viewer
 *
 * Visualizes:
 * 1. Longitudinal Profile (Bed z, Water Surface η, Energy Grade Line EGL, Structures)
 * 2. Transverse Cross-Section Profile at any station along the river reach
 */

import React, { useState, useMemo } from 'react';
import {
  RiverMesh,
  RiverFlowState,
  RiverStructure,
} from '../../types/riverAnalysis';
import { X, GitBranch } from 'lucide-react';

interface RiverCrossSectionViewerProps {
  mesh: RiverMesh;
  state: RiverFlowState;
  structures: RiverStructure[];
  onClose: () => void;
}

export const RiverCrossSectionViewer: React.FC<RiverCrossSectionViewerProps> = ({
  mesh,
  state,
  structures,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'longitudinal' | 'cross-section'>('longitudinal');
  const [selectedStationIdx, setSelectedStationIdx] = useState<number>(
    Math.floor(mesh.nx / 2)
  );

  const nx = mesh.nx;
  const ny = mesh.ny;

  // Longitudinal profile points calculation
  const longProfile = useMemo(() => {
    const pts: {
      stationM: number;
      minBedM: number;
      meanBedM: number;
      wseM: number;
      eglM: number;
      depthM: number;
      velocityMs: number;
      structureName?: string;
    }[] = [];

    for (let i = 0; i < nx; i++) {
      const stationM = (i / nx) * mesh.reachLengthM;
      let bedSum = 0;
      let minBed = 9999;
      let maxWse = -9999;
      let maxVel = 0;
      let structureName: string | undefined = undefined;

      for (let j = 0; j < ny; j++) {
        const idx = i * ny + j;
        const cell = mesh.cells[idx];
        const wse = state.wse[idx];
        const vel = state.velocityMag[idx];

        bedSum += cell.bedElevation;
        if (cell.bedElevation < minBed) minBed = cell.bedElevation;
        if (wse > maxWse) maxWse = wse;
        if (vel > maxVel) maxVel = vel;

        if (cell.structureId && !structureName) {
          const s = structures.find((st) => st.id === cell.structureId);
          if (s) structureName = s.name;
        }
      }

      const meanBed = bedSum / ny;
      const finalWse = maxWse > -9000 ? maxWse : minBed;
      const velocityHead = Math.pow(maxVel, 2) / (2 * 9.80665);
      const egl = finalWse + velocityHead;

      pts.push({
        stationM: Math.round(stationM * 10) / 10,
        minBedM: Math.round(minBed * 100) / 100,
        meanBedM: Math.round(meanBed * 100) / 100,
        wseM: Math.round(finalWse * 100) / 100,
        eglM: Math.round(egl * 100) / 100,
        depthM: Math.round((finalWse - minBed) * 100) / 100,
        velocityMs: Math.round(maxVel * 100) / 100,
        structureName,
      });
    }

    return pts;
  }, [mesh, state, structures, nx, ny]);

  // Transverse cross-section profile points for selected station
  const crossSectionProfile = useMemo(() => {
    const i = Math.max(0, Math.min(nx - 1, selectedStationIdx));
    const pts: {
      offsetM: number;
      bedM: number;
      wseM: number;
      depthM: number;
      velocityMs: number;
    }[] = [];

    const halfWidth = mesh.meanWidthM / 2;

    for (let j = 0; j < ny; j++) {
      const idx = i * ny + j;
      const cell = mesh.cells[idx];
      const offsetM = ((j + 0.5) / ny) * mesh.meanWidthM - halfWidth;
      const h = state.depth[idx];
      const wse = state.wse[idx];
      const vel = state.velocityMag[idx];

      pts.push({
        offsetM: Math.round(offsetM * 10) / 10,
        bedM: Math.round(cell.bedElevation * 100) / 100,
        wseM: Math.round(wse * 100) / 100,
        depthM: Math.round(h * 100) / 100,
        velocityMs: Math.round(vel * 100) / 100,
      });
    }

    return pts;
  }, [mesh, state, selectedStationIdx, nx, ny]);

  // SVG Chart Dimensions & Scaling
  const svgWidth = 760;
  const svgHeight = 280;
  const padding = { top: 30, right: 30, bottom: 40, left: 55 };
  const plotW = svgWidth - padding.left - padding.right;
  const plotH = svgHeight - padding.top - padding.bottom;

  // Longitudinal Profile Min/Max for Scaling
  const longElevations = longProfile.flatMap((p) => [p.minBedM, p.wseM, p.eglM]);
  const minElev = Math.min(...longElevations) - 1.0;
  const maxElev = Math.max(...longElevations) + 1.5;
  const elevRange = Math.max(1, maxElev - minElev);
  const maxStation = Math.max(10, mesh.reachLengthM);

  const getLongX = (station: number) => padding.left + (station / maxStation) * plotW;
  const getLongY = (elev: number) => padding.top + plotH - ((elev - minElev) / elevRange) * plotH;

  // Cross-Section Profile Min/Max for Scaling
  const csElevations = crossSectionProfile.flatMap((p) => [p.bedM, p.wseM]);
  const csMinElev = Math.min(...csElevations) - 0.8;
  const csMaxElev = Math.max(...csElevations) + 1.2;
  const csElevRange = Math.max(1, csMaxElev - csMinElev);
  const halfW = mesh.meanWidthM / 2;

  const getCsX = (offset: number) => padding.left + ((offset + halfW) / (mesh.meanWidthM || 1)) * plotW;
  const getCsY = (elev: number) => padding.top + plotH - ((elev - csMinElev) / csElevRange) * plotH;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-[#111] border border-[#262626] rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-[#e5e7eb]">
        {/* Header */}
        <div className="h-12 px-5 border-b border-[#222] flex items-center justify-between bg-[#141414]">
          <div className="flex items-center gap-3">
            <GitBranch className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white font-tech">
              River Hydraulic Profiles & Water Surface Elevations
            </h2>
            <div className="flex items-center bg-[#171717] border border-[#262626] rounded p-0.5 text-xs">
              <button
                onClick={() => setActiveTab('longitudinal')}
                className={`px-2.5 py-1 rounded cursor-pointer ${
                  activeTab === 'longitudinal'
                    ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                    : 'text-[#888] hover:text-white'
                }`}
              >
                Longitudinal Profile
              </button>
              <button
                onClick={() => setActiveTab('cross-section')}
                className={`px-2.5 py-1 rounded cursor-pointer ${
                  activeTab === 'cross-section'
                    ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                    : 'text-[#888] hover:text-white'
                }`}
              >
                Cross-Section Cut
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#222] text-[#888] hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {activeTab === 'longitudinal' ? (
            <div>
              <div className="flex items-center justify-between text-xs text-[#888] font-mono mb-2">
                <span>Reach Longitudinal Energy Grade Line (EGL), Water Surface (WSE) & Bed Profile</span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-red-400 inline-block" /> EGL
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-cyan-400 inline-block" /> Water Surface (η)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-amber-600 inline-block" /> Channel Bed
                  </span>
                </div>
              </div>

              {/* SVG Longitudinal Profile Plot */}
              <div className="bg-[#141414] border border-[#222] rounded-lg p-2">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-64 font-mono text-[10px]">
                  {/* Grid Lines */}
                  {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
                    const y = padding.top + plotH * (1 - frac);
                    const val = minElev + frac * elevRange;
                    return (
                      <g key={frac}>
                        <line
                          x1={padding.left}
                          y1={y}
                          x2={padding.left + plotW}
                          y2={y}
                          stroke="#222"
                          strokeDasharray="4 4"
                        />
                        <text x={padding.left - 8} y={y + 3} textAnchor="end" fill="#666">
                          {val.toFixed(1)}m
                        </text>
                      </g>
                    );
                  })}

                  {/* Water Fill Area */}
                  {longProfile.length >= 2 && (
                    <polygon
                      points={[
                        ...longProfile.map((p) => `${getLongX(p.stationM)},${getLongY(p.wseM)}`),
                        ...[...longProfile].reverse().map((p) => `${getLongX(p.stationM)},${getLongY(p.minBedM)}`),
                      ].join(' ')}
                      fill="rgba(6, 182, 212, 0.22)"
                    />
                  )}

                  {/* Bed Polygon / Earth Fill */}
                  {longProfile.length >= 2 && (
                    <polygon
                      points={[
                        ...longProfile.map((p) => `${getLongX(p.stationM)},${getLongY(p.minBedM)}`),
                        `${getLongX(longProfile[longProfile.length - 1].stationM)},${padding.top + plotH}`,
                        `${getLongX(longProfile[0].stationM)},${padding.top + plotH}`,
                      ].join(' ')}
                      fill="rgba(180, 83, 9, 0.15)"
                    />
                  )}

                  {/* Bed Line */}
                  {longProfile.length >= 2 && (
                    <polyline
                      points={longProfile.map((p) => `${getLongX(p.stationM)},${getLongY(p.minBedM)}`).join(' ')}
                      fill="none"
                      stroke="#d97706"
                      strokeWidth="2"
                    />
                  )}

                  {/* Water Surface Line */}
                  {longProfile.length >= 2 && (
                    <polyline
                      points={longProfile.map((p) => `${getLongX(p.stationM)},${getLongY(p.wseM)}`).join(' ')}
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="2.5"
                    />
                  )}

                  {/* EGL Line */}
                  {longProfile.length >= 2 && (
                    <polyline
                      points={longProfile.map((p) => `${getLongX(p.stationM)},${getLongY(p.eglM)}`).join(' ')}
                      fill="none"
                      stroke="#f87171"
                      strokeWidth="1.5"
                      strokeDasharray="5 3"
                    />
                  )}

                  {/* Structures Annotations */}
                  {longProfile.map((p, idx) => {
                    if (p.structureName) {
                      const sx = getLongX(p.stationM);
                      return (
                        <g key={idx}>
                          <line x1={sx} y1={padding.top} x2={sx} y2={padding.top + plotH} stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" />
                          <circle cx={sx} cy={getLongY(p.wseM)} r="4" fill="#f59e0b" />
                          <text x={sx} y={padding.top - 6} fill="#f59e0b" textAnchor="middle" fontWeight="bold">
                            {p.structureName}
                          </text>
                        </g>
                      );
                    }
                    return null;
                  })}

                  {/* X-Axis Ticks */}
                  {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
                    const x = padding.left + plotW * frac;
                    const st = frac * maxStation;
                    return (
                      <g key={frac}>
                        <line x1={x} y1={padding.top + plotH} x2={x} y2={padding.top + plotH + 5} stroke="#555" />
                        <text x={x} y={padding.top + plotH + 18} textAnchor="middle" fill="#666">
                          {st.toFixed(0)}m
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          ) : (
            <div>
              {/* Cross-Section Station Slider Selector */}
              <div className="flex items-center justify-between bg-[#171717] border border-[#222] rounded p-3 text-xs font-mono mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-white font-bold">Select Station:</span>
                  <input
                    type="range"
                    min={0}
                    max={nx - 1}
                    value={selectedStationIdx}
                    onChange={(e) => setSelectedStationIdx(parseInt(e.target.value, 10))}
                    className="w-64 accent-emerald-500 cursor-pointer"
                  />
                  <span className="text-emerald-400 font-bold">
                    Station: {((selectedStationIdx / nx) * mesh.reachLengthM).toFixed(1)} m
                  </span>
                </div>
                <div className="text-[#888]">
                  Channel Width: <span className="text-white">{mesh.meanWidthM.toFixed(1)} m</span>
                </div>
              </div>

              {/* Cross-Section SVG Plot */}
              <div className="bg-[#141414] border border-[#222] rounded-lg p-2">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-64 font-mono text-[10px]">
                  {/* Grid Lines */}
                  {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
                    const y = padding.top + plotH * (1 - frac);
                    const val = csMinElev + frac * csElevRange;
                    return (
                      <g key={frac}>
                        <line x1={padding.left} y1={y} x2={padding.left + plotW} y2={y} stroke="#222" strokeDasharray="4 4" />
                        <text x={padding.left - 8} y={y + 3} textAnchor="end" fill="#666">
                          {val.toFixed(1)}m
                        </text>
                      </g>
                    );
                  })}

                  {/* Water Fill Polygon */}
                  {crossSectionProfile.length >= 2 && (
                    <polygon
                      points={[
                        ...crossSectionProfile.map((p) => `${getCsX(p.offsetM)},${getCsY(p.wseM)}`),
                        ...[...crossSectionProfile].reverse().map((p) => `${getCsX(p.offsetM)},${getCsY(p.bedM)}`),
                      ].join(' ')}
                      fill="rgba(6, 182, 212, 0.35)"
                    />
                  )}

                  {/* Bed Line */}
                  {crossSectionProfile.length >= 2 && (
                    <polyline
                      points={crossSectionProfile.map((p) => `${getCsX(p.offsetM)},${getCsY(p.bedM)}`).join(' ')}
                      fill="none"
                      stroke="#d97706"
                      strokeWidth="2.5"
                    />
                  )}

                  {/* Water Surface Line */}
                  {crossSectionProfile.length >= 2 && (
                    <polyline
                      points={crossSectionProfile.map((p) => `${getCsX(p.offsetM)},${getCsY(p.wseM)}`).join(' ')}
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="2"
                    />
                  )}

                  {/* Velocity Bar Columns */}
                  {crossSectionProfile.map((p, k) => {
                    const x = getCsX(p.offsetM);
                    const barH = Math.min(60, p.velocityMs * 25);
                    return (
                      <g key={k}>
                        <rect x={x - 6} y={padding.top + plotH - barH} width={12} height={barH} fill="rgba(34, 197, 94, 0.4)" stroke="#22c55e" strokeWidth="0.5" />
                        <text x={x} y={padding.top + plotH - barH - 4} textAnchor="middle" fill="#22c55e" fontSize="8px">
                          {p.velocityMs.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Offset X-Axis */}
                  {[-halfW, 0, halfW].map((off) => {
                    const x = getCsX(off);
                    return (
                      <g key={off}>
                        <line x1={x} y1={padding.top + plotH} x2={x} y2={padding.top + plotH + 5} stroke="#555" />
                        <text x={x} y={padding.top + plotH + 18} textAnchor="middle" fill="#888">
                          {off === 0 ? 'CL' : `${off.toFixed(0)}m`}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 px-5 border-t border-[#222] flex items-center justify-between bg-[#141414] text-xs">
          <span className="text-[#737373]">Real-time 2D Hydrodynamic Grade Calculations</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
