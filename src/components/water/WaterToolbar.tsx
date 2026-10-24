import React from 'react';
import {
  ActiveTool,
  MapThematicDisplay,
  SimulationSummary,
} from '../../types/waterDistribution';
import {
  MousePointer,
  Plus,
  Play,
  RotateCcw,
  Download,
  Upload,
  Table,
  TrendingUp,
  Mountain,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  Trash2,
} from 'lucide-react';

interface WaterToolbarProps {
  activeTool: ActiveTool;
  onSelectTool: (tool: ActiveTool) => void;
  thematicDisplay: MapThematicDisplay;
  onSelectThematic: (thematic: MapThematicDisplay) => void;
  onRunSimulation: () => void;
  onSampleElevations: () => void;
  onToggleFlexTables: () => void;
  onToggleProfile: () => void;
  onExportInp: () => void;
  onImportInp: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLoadDemo: () => void;
  onClear: () => void;
  simulationSummary: SimulationSummary | null;
  isSimulating: boolean;
  isSamplingElevation: boolean;
  isFlexTablesOpen: boolean;
  isProfileOpen: boolean;
  elementCounts: {
    junctions: number;
    pipes: number;
    tanks: number;
    reservoirs: number;
    pumps: number;
  };
}

export const WaterToolbar: React.FC<WaterToolbarProps> = ({
  activeTool,
  onSelectTool,
  thematicDisplay,
  onSelectThematic,
  onRunSimulation,
  onSampleElevations,
  onToggleFlexTables,
  onToggleProfile,
  onExportInp,
  onImportInp,
  onLoadDemo,
  onClear,
  simulationSummary,
  isSimulating,
  isSamplingElevation,
  isFlexTablesOpen,
  isProfileOpen,
  elementCounts,
}) => {
  const tools: { id: ActiveTool; label: string; icon: string }[] = [
    { id: 'select', label: 'Select & Move', icon: '👆' },
    { id: 'add-junction', label: 'Junction', icon: '📍' },
    { id: 'add-pipe', label: 'Pipe', icon: '〰️' },
    { id: 'add-reservoir', label: 'Reservoir', icon: '⛲' },
    { id: 'add-tank', label: 'Tank', icon: '🛢️' },
    { id: 'add-pump', label: 'Pump', icon: '⚡' },
    { id: 'delete', label: 'Delete', icon: '✂️' },
    { id: 'profile-select', label: 'HGL Profile', icon: '🏔️' },
  ];

  return (
    <div className="bg-[#111] border-b border-[#222] px-3 py-2 flex flex-wrap items-center justify-between gap-2 z-20 select-none">
      {/* 1. CAD / Modelling Tool Palette */}
      <div className="flex items-center gap-1 bg-[#0a0a0a] p-1 rounded-lg border border-[#222]">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelectTool(t.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeTool === t.id
                ? 'bg-amber-500 text-[#0a0a0a] font-bold shadow-xs'
                : 'text-[#888] hover:text-white hover:bg-[#1c1c1c]'
            }`}
            title={t.label}
          >
            <span>{t.icon}</span>
            <span className="hidden xl:inline font-tech text-[11px]">{t.label}</span>
          </button>
        ))}
      </div>

      {/* 2. Simulation & Analysis Trigger */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onRunSimulation}
          disabled={isSimulating || (elementCounts.junctions === 0 && elementCounts.pipes === 0)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md disabled:opacity-50 transition-all cursor-pointer"
          title="Compute hydraulic pressures, flows, and headlosses"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isSimulating ? 'Computing...' : 'Compute Hydraulics'}</span>
        </button>

        {/* DEM Elevation Query */}
        <button
          onClick={onSampleElevations}
          disabled={isSamplingElevation}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-amber-400 hover:text-amber-300 font-medium text-xs transition-colors cursor-pointer"
          title="Sample real ground elevation from global DEM for all nodes"
        >
          <Mountain className="w-3.5 h-3.5" />
          <span className="hidden lg:inline text-[11px] font-tech">
            {isSamplingElevation ? 'Sampling DEM...' : 'Sample DEM Elev.'}
          </span>
        </button>

        {/* Thematic Visualization Mode */}
        <div className="flex items-center gap-1 bg-[#0a0a0a] px-2 py-1 rounded-lg border border-[#222] text-xs">
          <Layers className="w-3 h-3 text-[#737373]" />
          <span className="text-[10px] text-[#737373] uppercase font-tech mr-1">Render:</span>
          <select
            value={thematicDisplay}
            onChange={(e) => onSelectThematic(e.target.value as MapThematicDisplay)}
            className="bg-transparent text-white text-[11px] font-mono focus:outline-none cursor-pointer"
          >
            <option value="none" className="bg-[#111]">Standard GIS</option>
            <option value="pressure" className="bg-[#111]">Pressure (Nodes)</option>
            <option value="velocity" className="bg-[#111]">Velocity (Pipes)</option>
            <option value="flow" className="bg-[#111]">Flow (Pipes)</option>
            <option value="diameter" className="bg-[#111]">Diameter (Pipes)</option>
            <option value="elevation" className="bg-[#111]">Elevation (DEM)</option>
          </select>
        </div>
      </div>

      {/* 3. WaterGEMS Workspace Tools: FlexTables, Profile, Import/Export */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleFlexTables}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
            isFlexTablesOpen
              ? 'bg-amber-500/20 border-amber-500 text-amber-400 font-bold'
              : 'bg-[#171717] hover:bg-[#202020] border-[#262626] text-[#999] hover:text-white'
          }`}
          title="Open WaterGEMS FlexTables (tabular element editor)"
        >
          <Table className="w-3.5 h-3.5" />
          <span className="hidden md:inline font-tech text-[11px]">FlexTables</span>
        </button>

        <button
          onClick={onToggleProfile}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
            isProfileOpen
              ? 'bg-amber-500/20 border-amber-500 text-amber-400 font-bold'
              : 'bg-[#171717] hover:bg-[#202020] border-[#262626] text-[#999] hover:text-white'
          }`}
          title="View Longitudinal Hydraulic Grade Line (HGL) Profile"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span className="hidden md:inline font-tech text-[11px]">HGL Profile</span>
        </button>

        {/* EPANET / WaterGEMS Export */}
        <button
          onClick={onExportInp}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#171717] hover:bg-[#202020] border border-[#262626] text-[#999] hover:text-white text-xs transition-colors cursor-pointer"
          title="Export model as EPANET / WaterGEMS .INP file"
        >
          <Download className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden lg:inline text-[10px] font-mono">.INP</span>
        </button>

        {/* EPANET / WaterGEMS Import */}
        <label
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#171717] hover:bg-[#202020] border border-[#262626] text-[#999] hover:text-white text-xs transition-colors cursor-pointer"
          title="Import EPANET / WaterGEMS .INP file"
        >
          <Upload className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden lg:inline text-[10px] font-mono">Import</span>
          <input
            type="file"
            accept=".inp,.txt"
            onChange={onImportInp}
            className="sr-only"
          />
        </label>

        {/* Demo Network */}
        <button
          onClick={onLoadDemo}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold transition-colors cursor-pointer"
          title="Load Highland Municipal Demo Network on real DEM"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="text-[11px] font-tech">Demo Model</span>
        </button>

        {/* Clear */}
        <button
          onClick={onClear}
          className="p-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/30 text-[#737373] hover:text-red-400 transition-colors cursor-pointer"
          title="Clear water distribution network"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
