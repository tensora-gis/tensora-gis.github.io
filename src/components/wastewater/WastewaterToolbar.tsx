import React from 'react';
import {
  ActiveWastewaterTool,
  WastewaterThematicDisplay,
  WastewaterSimulationSummary,
} from '../../types/wastewater';
import {
  MousePointer,
  CircleDot,
  GitCommit,
  Database,
  Zap,
  Waves,
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
  ArrowRightCircle,
} from 'lucide-react';

interface WastewaterToolbarProps {
  activeTool: ActiveWastewaterTool;
  onSelectTool: (tool: ActiveWastewaterTool) => void;
  thematicDisplay: WastewaterThematicDisplay;
  onSelectThematic: (thematic: WastewaterThematicDisplay) => void;
  onRunSimulation: () => void;
  onSampleElevations: () => void;
  onToggleFlexTables: () => void;
  onToggleProfile: () => void;
  onExportExcel: () => void;
  onExportInp: () => void;
  onImportInp: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLoadDemo: () => void;
  onClear: () => void;
  simulationSummary: WastewaterSimulationSummary | null;
  isSimulating: boolean;
  isSamplingElevation: boolean;
  isFlexTablesOpen: boolean;
  isProfileOpen: boolean;
  elementCounts: {
    manholes: number;
    conduits: number;
    wetWells: number;
    pumps: number;
    outfalls: number;
  };
}

export const WastewaterToolbar: React.FC<WastewaterToolbarProps> = ({
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
  simulationSummary,
  isSimulating,
  isSamplingElevation,
  isFlexTablesOpen,
  isProfileOpen,
  elementCounts,
}) => {
  const tools: { id: ActiveWastewaterTool; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'select', label: 'Select / Move', icon: MousePointer },
    { id: 'add-manhole', label: 'Manhole', icon: CircleDot },
    { id: 'add-conduit', label: 'Pipe', icon: GitCommit },
    { id: 'add-wetwell', label: 'Wet Well', icon: Database },
    { id: 'add-pump', label: 'Pump', icon: Zap },
    { id: 'add-forcemain', label: 'Force Main', icon: ArrowRightCircle },
    { id: 'add-outfall', label: 'Outfall', icon: Waves },
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
          disabled={isSimulating || (elementCounts.manholes === 0 && elementCounts.conduits === 0)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md disabled:opacity-50 transition-all cursor-pointer"
          title="Compute gravity Manning hydraulics, velocities, capacity and export calculations to Excel (.xlsx)"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isSimulating ? 'Computing...' : 'Compute Hydraulics'}</span>
        </button>

        {/* DEM Elevation Query */}
        <button
          onClick={onSampleElevations}
          disabled={isSamplingElevation}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-amber-400 hover:text-amber-300 font-medium text-xs transition-colors cursor-pointer"
          title="Query true Earth DEM elevations (Copernicus GLO-30 / Open-Meteo) for all manholes and outfalls"
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
            onChange={(e) => onSelectThematic(e.target.value as WastewaterThematicDisplay)}
            className="bg-transparent text-white text-[11px] font-mono focus:outline-none cursor-pointer"
          >
            <option value="none" className="bg-[#111]">Standard</option>
            <option value="capacity" className="bg-[#111]">Fullness (d/D)</option>
            <option value="velocity" className="bg-[#111]">Velocity (Pipes)</option>
            <option value="depth" className="bg-[#111]">Invert Depth (Manholes)</option>
            <option value="slope" className="bg-[#111]">Slope % (Pipes)</option>
            <option value="surcharge" className="bg-[#111]">Surcharge & Flooding</option>
            <option value="h2s-risk" className="bg-[#111]">H2S Corrosion Risk</option>
            <option value="sizing-status" className="bg-[#111]">Sizing Compliance</option>
          </select>
        </div>
      </div>

      {/* 3. Hydraulic Workspace Tools */}
      <div className="flex items-center gap-1.5">
        {/* Direct Calculation Excel Export */}
        <button
          onClick={onExportExcel}
          disabled={!simulationSummary}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-emerald-400 hover:text-emerald-300 font-medium text-xs transition-colors cursor-pointer disabled:opacity-40"
          title="Export detailed calculation sheet to Microsoft Excel (.xlsx)"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span className="font-tech text-[11px]">Export Calculation (.xlsx)</span>
        </button>

        <button
          onClick={onToggleFlexTables}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
            isFlexTablesOpen
              ? 'bg-amber-500/20 border-amber-500 text-amber-400 font-bold'
              : 'bg-[#171717] hover:bg-[#202020] border-[#262626] text-[#999] hover:text-white'
          }`}
          title="Open Sewer FlexTables"
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
          title="View Longitudinal Sewer Hydraulic Grade Line (HGL) Profile"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span className="hidden md:inline font-tech text-[11px]">HGL Profile</span>
        </button>

        {/* EPA SWMM Export */}
        <button
          onClick={onExportInp}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#171717] hover:bg-[#202020] border border-[#262626] text-[#999] hover:text-white text-xs transition-colors cursor-pointer"
          title="Export EPA SWMM / Sewer .INP model"
        >
          <Download className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden lg:inline text-[10px] font-mono">.INP</span>
        </button>

        {/* EPA SWMM Import */}
        <label
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#171717] hover:bg-[#202020] border border-[#262626] text-[#999] hover:text-white text-xs transition-colors cursor-pointer"
          title="Import EPA SWMM / Sewer .INP model"
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
          title="Load Municipal Wastewater Network model on real terrain"
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
