import React from 'react';
import {
  ActiveTool,
  MapThematicDisplay,
  SimulationSummary,
} from '../../types/waterDistribution';
import {
  MousePointer,
  CircleDot,
  GitCommit,
  Waves,
  Database,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Play,
  Mountain,
  Layers,
  Table,
  FileSpreadsheet,
  Download,
  Upload,
  FolderOpen,
  Activity,
  Wrench,
  Clock,
  Zap,
} from 'lucide-react';

const PumpToolIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="8" />
    <polygon points="9,8 16,12 9,16" fill="currentColor" stroke="none" />
  </svg>
);

interface WaterToolbarProps {
  activeTool: ActiveTool;
  onSelectTool: (tool: ActiveTool) => void;
  thematicDisplay: MapThematicDisplay;
  onSelectThematic: (thematic: MapThematicDisplay) => void;
  onRunSimulation: () => void;
  onSampleElevations: () => void;
  onToggleFlexTables: () => void;
  onToggleProfile: () => void;
  onExportExcel: () => void;
  onExportInp: () => void;
  onImportInp: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLoadDemo: () => void;
  onClear: () => void;
  onOpenReport?: () => void;
  onApplyAutoDesign?: () => void;
  epsHour?: number;
  onSelectEpsHour?: (hour: number) => void;
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
    valves?: number;
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
  onExportExcel,
  onExportInp,
  onImportInp,
  onLoadDemo,
  onClear,
  onOpenReport,
  onApplyAutoDesign,
  epsHour = 12,
  onSelectEpsHour,
  simulationSummary,
  isSimulating,
  isSamplingElevation,
  isFlexTablesOpen,
  isProfileOpen,
  elementCounts,
}) => {
  const tools: { id: ActiveTool; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'select', label: 'Select / Move', icon: MousePointer },
    { id: 'add-junction', label: 'Junction', icon: CircleDot },
    { id: 'add-pipe', label: 'Pipe', icon: GitCommit },
    { id: 'add-reservoir', label: 'Reservoir', icon: Waves },
    { id: 'add-tank', label: 'Tank', icon: Database },
    { id: 'add-pump', label: 'Pump', icon: PumpToolIcon },
    { id: 'add-valve', label: 'Valve', icon: SlidersHorizontal },
    { id: 'delete', label: 'Delete', icon: Trash2 },
    { id: 'profile-select', label: 'Profile Route', icon: TrendingUp },
  ];

  return (
    <div className="bg-[#111] border-b border-[#222] px-3 py-2 flex flex-wrap items-center justify-between gap-2 z-20 select-none">
      {/* 1. CAD / Modelling Tool Palette */}
      <div className="flex items-center gap-1 bg-[#0a0a0a] p-1 rounded-lg border border-[#222]">
        {tools.map((t) => {
          const Icon = t.icon;
          const isActive = activeTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelectTool(t.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-amber-500 text-[#0a0a0a] font-bold shadow-xs'
                  : 'text-[#888] hover:text-white hover:bg-[#1a1a1a]'
              }`}
              title={t.label}
              aria-label={t.label}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline font-tech text-[11px]">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Simulation & Analysis Trigger */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onRunSimulation}
          disabled={isSimulating || (elementCounts.junctions === 0 && elementCounts.pipes === 0)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md disabled:opacity-50 transition-all cursor-pointer"
          title="Compute EPANET GGA hydraulics, fire flow, water quality, and transient surge calculations"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isSimulating ? 'Computing...' : 'Compute Hydraulics'}</span>
        </button>

        {/* DEM Elevation Query */}
        <button
          onClick={onSampleElevations}
          disabled={isSamplingElevation}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-amber-400 hover:text-amber-300 font-medium text-xs transition-colors cursor-pointer"
          title="Query true Earth DEM elevations (Copernicus GLO-30 / Open-Meteo) for all network nodes"
        >
          <Mountain className="w-3.5 h-3.5" />
          <span className="hidden lg:inline text-[11px] font-tech">
            {isSamplingElevation ? 'Sampling Open-Meteo DEM...' : 'Sync Real Earth DEM'}
          </span>
        </button>

        {/* Thematic Visualization Mode */}
        <div className="flex items-center gap-1 bg-[#0a0a0a] px-2 py-1 rounded-lg border border-[#222] text-xs">
          <Layers className="w-3.5 h-3.5 text-[#737373]" />
          <span className="text-[10px] text-[#737373] uppercase font-tech mr-1">Thematic:</span>
          <select
            value={thematicDisplay}
            onChange={(e) => onSelectThematic(e.target.value as MapThematicDisplay)}
            className="bg-transparent text-white text-[11px] font-mono focus:outline-none cursor-pointer"
          >
            <option value="none" className="bg-[#111]">Standard</option>
            <option value="pressure" className="bg-[#111]">Pressure (Nodes)</option>
            <option value="velocity" className="bg-[#111]">Velocity (Pipes)</option>
            <option value="flow" className="bg-[#111]">Flow (Pipes)</option>
            <option value="diameter" className="bg-[#111]">Diameter (Pipes)</option>
            <option value="elevation" className="bg-[#111]">Elevation (DEM)</option>
            <option value="water-age" className="bg-[#111]">Water Age (Hours)</option>
            <option value="fire-flow" className="bg-[#111]">Fire Flow (L/s)</option>
            <option value="transient-surge" className="bg-[#111]">Surge Envelope (Joukowsky/Hammer)</option>
          </select>
        </div>

        {/* EPS 24-hr Diurnal Scrubber */}
        {onSelectEpsHour && simulationSummary && (
          <div className="flex items-center gap-1.5 bg-[#0a0a0a] px-2.5 py-1 rounded-lg border border-[#222] text-xs">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] text-[#737373] uppercase font-tech">EPS Hour:</span>
            <span className="text-cyan-300 font-mono font-bold text-[11px] w-10 text-right">
              {String(epsHour).padStart(2, '0')}:00
            </span>
            <input
              type="range"
              min="0"
              max="23"
              step="1"
              value={epsHour}
              onChange={(e) => onSelectEpsHour(parseInt(e.target.value, 10))}
              className="w-16 accent-cyan-400 h-1 bg-[#222] rounded cursor-pointer"
              title="Extended Period Simulation 24-Hour Diurnal Scrubber"
            />
          </div>
        )}
      </div>

      {/* 3. Hydraulic Workspace Tools: Calculation Export, FlexTables, Profile, EPANET Import/Export */}
      <div className="flex items-center gap-1.5">
        {/* Auto-Design Pipe Sizing */}
        {onApplyAutoDesign && (
          <button
            onClick={onApplyAutoDesign}
            disabled={!simulationSummary}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:text-purple-200 font-medium text-xs transition-colors cursor-pointer disabled:opacity-40"
            title="Auto-Design pipe diameters to satisfy minimum velocity and pressure constraints"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span className="font-tech text-[11px]">Auto-Design</span>
          </button>
        )}

        {/* Detailed Engineering Calculation Report Modal */}
        {onOpenReport && (
          <button
            onClick={onOpenReport}
            disabled={!simulationSummary}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-amber-200 font-medium text-xs transition-colors cursor-pointer disabled:opacity-40"
            title="Open complete detailed engineering calculation report (EPANET GGA & Transient Water Hammer)"
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="font-tech text-[11px]">Detailed Report</span>
          </button>
        )}

        {/* Direct Calculation Excel Export */}
        <button
          onClick={onExportExcel}
          disabled={!simulationSummary}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-emerald-400 hover:text-emerald-300 font-medium text-xs transition-colors cursor-pointer disabled:opacity-40"
          title="Export detailed calculation sheet to Microsoft Excel (.xlsx)"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span className="hidden sm:inline font-tech text-[11px]">Export (.xlsx)</span>
        </button>

        <button
          onClick={onToggleFlexTables}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
            isFlexTablesOpen
              ? 'bg-amber-500/20 border-amber-500 text-amber-400 font-bold'
              : 'bg-[#171717] hover:bg-[#202020] border-[#262626] text-[#999] hover:text-white'
          }`}
          title="Open Hydraulic FlexTables"
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
          title="View Longitudinal Hydraulic Grade Line (HGL) Profile & Surge Envelopes"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span className="hidden md:inline font-tech text-[11px]">HGL Profile</span>
        </button>

        {/* EPANET Export */}
        <button
          onClick={onExportInp}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#171717] hover:bg-[#202020] border border-[#262626] text-[#999] hover:text-white text-xs transition-colors cursor-pointer"
          title="Export EPANET .INP model"
        >
          <Download className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden lg:inline text-[10px] font-mono">.INP</span>
        </button>

        {/* EPANET Import */}
        <label
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#171717] hover:bg-[#202020] border border-[#262626] text-[#999] hover:text-white text-xs transition-colors cursor-pointer"
          title="Import EPANET .INP model"
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

        {/* Reference Demo Network */}
        <button
          onClick={onLoadDemo}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-[#aaa] hover:text-white text-xs transition-colors cursor-pointer"
          title="Load Highland Municipal Network model on real terrain"
        >
          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px] font-tech">Sample Network</span>
        </button>

        {/* Clear */}
        <button
          onClick={onClear}
          className="p-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/30 text-[#737373] hover:text-red-400 transition-colors cursor-pointer"
          title="Clear current model"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
