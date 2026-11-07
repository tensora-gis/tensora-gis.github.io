/**
 * River Analysis & Modelling Workspace Toolbar
 *
 * Provides simulation controls, structure tools, thematic map layers,
 * and dialog launchers for 2D CFD river modeling.
 */

import React from 'react';
import {
  RiverThematicDisplay,
} from '../../types/riverAnalysis';
import {
  Play,
  Pause,
  RotateCcw,
  Sliders,
  FileSpreadsheet,
  Globe,
  Upload,
  GitBranch,
  Mountain,
  Building,
  Anchor,
} from 'lucide-react';

interface RiverToolbarProps {
  thematicDisplay: RiverThematicDisplay;
  onSelectThematic: (thematic: RiverThematicDisplay) => void;
  isSimulating: boolean;
  onToggleSimulation: () => void;
  onResetSimulation: () => void;
  simSpeed: number;
  onChangeSimSpeed: (speed: number) => void;
  onOpenBoundaries: () => void;
  onOpenStructures: () => void;
  onOpenCrossSection: () => void;
  onOpenBathymetry: () => void;
  onOpenHydroRivers: () => void;
  onOpenResults: () => void;
  onSampleElevation: () => void;
  isSamplingElevation: boolean;
  onCycleDemo: () => void;
  demoReachName: string;
}

export const RiverToolbar: React.FC<RiverToolbarProps> = ({
  thematicDisplay,
  onSelectThematic,
  isSimulating,
  onToggleSimulation,
  onResetSimulation,
  simSpeed,
  onChangeSimSpeed,
  onOpenBoundaries,
  onOpenStructures,
  onOpenCrossSection,
  onOpenBathymetry,
  onOpenHydroRivers,
  onOpenResults,
  onSampleElevation,
  isSamplingElevation,
  onCycleDemo,
  demoReachName,
}) => {
  return (
    <div className="bg-[#111] border-b border-[#222] px-3 py-2 flex flex-wrap items-center justify-between gap-2 z-20 select-none text-xs text-[#e5e7eb]">
      {/* Zone 1: Simulation Run / Pause / Reset & Time Controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleSimulation}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold transition-all cursor-pointer shadow-sm ${
            isSimulating
              ? 'bg-amber-600 hover:bg-amber-500 text-white'
              : 'bg-cyan-600 hover:bg-cyan-500 text-white'
          }`}
          title={isSimulating ? 'Pause 2D CFD Solver' : 'Compute 2D Shallow-Water Hydraulics'}
        >
          {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          <span>{isSimulating ? 'Pause CFD' : 'Run 2D CFD'}</span>
        </button>

        <button
          onClick={onResetSimulation}
          className="p-1.5 rounded bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] text-[#a3a3a3] hover:text-white transition-colors cursor-pointer"
          title="Reset Flow Field to Initial State"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center bg-[#171717] border border-[#262626] rounded px-1.5 py-0.5 text-[11px] font-mono text-[#a3a3a3]">
          <span className="text-[#666] mr-1">Speed:</span>
          {[1, 5, 20].map((s) => (
            <button
              key={s}
              onClick={() => onChangeSimSpeed(s)}
              className={`px-1 rounded cursor-pointer ${
                simSpeed === s ? 'text-cyan-400 font-bold bg-[#262626]' : 'hover:text-white'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Zone 2: Thematic View Mode */}
      <div className="flex items-center gap-1 bg-[#171717] border border-[#262626] p-0.5 rounded">
        <span className="text-[10px] text-[#666] px-1 font-mono uppercase">View:</span>
        {(
          [
            { id: 'depth', label: 'Depth (h)' },
            { id: 'velocity', label: 'Velocity (|V|)' },
            { id: 'wse', label: 'WSE (η)' },
            { id: 'froude', label: 'Froude (Fr)' },
            { id: 'shear-stress', label: 'Shear (τ)' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectThematic(item.id)}
            className={`px-2 py-1 rounded text-[11px] transition-colors cursor-pointer ${
              thematicDisplay === item.id
                ? 'bg-cyan-500/20 text-cyan-400 font-semibold border border-cyan-500/30'
                : 'text-[#888] hover:text-white hover:bg-[#222]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Zone 3: Structure & Boundary Tools */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onOpenStructures}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] text-[#e5e7eb] hover:text-cyan-400 transition-colors cursor-pointer"
          title="Add/Edit Levees, Weirs, Bridges, Culverts, Gates, Embankments"
        >
          <Building className="w-3.5 h-3.5 text-amber-500" />
          <span>Structures</span>
        </button>

        <button
          onClick={onOpenBoundaries}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] text-[#e5e7eb] hover:text-cyan-400 transition-colors cursor-pointer"
          title="Configure Upstream Inflow Q(t), Downstream Stage, Rainfall"
        >
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span>Boundaries</span>
        </button>

        <button
          onClick={onOpenCrossSection}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] text-[#e5e7eb] hover:text-cyan-400 transition-colors cursor-pointer"
          title="View Longitudinal Bed/WSE/EGL Profile & Cross-Sections"
        >
          <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
          <span>Profiles</span>
        </button>

        <button
          onClick={onOpenBathymetry}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] text-[#aaa] hover:text-white transition-colors cursor-pointer"
          title="Import Surveyed Bathymetric Soundings / XYZ Cross-Sections"
        >
          <Upload className="w-3.5 h-3.5 text-blue-400" />
          <span>Bathymetry</span>
        </button>
      </div>

      {/* Zone 4: DEM Sampling, HydroRIVERS, Demos & Reports */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onSampleElevation}
          disabled={isSamplingElevation}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#171717] hover:bg-[#222] border border-[#333] text-[#e5e7eb] hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-50"
          title="Sample True Copernicus GLO-30 / SRTM 30m Elevations"
        >
          <Mountain className="w-3.5 h-3.5 text-amber-500" />
          <span>{isSamplingElevation ? 'Sampling DEM...' : 'Sample DEM'}</span>
        </button>

        <button
          onClick={onOpenHydroRivers}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#171717] hover:bg-[#222] border border-[#333] text-[#e5e7eb] hover:text-cyan-400 transition-colors cursor-pointer"
          title="Explore Global HydroRIVERS Reaches & NASA SWOT Data"
        >
          <Globe className="w-3.5 h-3.5 text-cyan-400" />
          <span>HydroRIVERS</span>
        </button>

        <button
          onClick={onCycleDemo}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[#171717] hover:bg-[#222] border border-[#333] text-[#aaa] hover:text-white transition-colors cursor-pointer"
          title="Cycle Through Benchmark Demo Reaches"
        >
          <Anchor className="w-3.5 h-3.5 text-purple-400" />
          <span className="truncate max-w-[110px]">{demoReachName}</span>
        </button>

        <button
          onClick={onOpenResults}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600/90 hover:bg-emerald-500 text-white font-semibold transition-colors cursor-pointer shadow-sm"
          title="Detailed 2D CFD Report, SWOT Verification & GeoJSON/GeoTIFF/CSV Exports"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>CFD Report & Export</span>
        </button>
      </div>
    </div>
  );
};
