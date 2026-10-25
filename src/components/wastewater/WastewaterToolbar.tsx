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
  Wrench,
  Clock,
  Cpu,
} from 'lucide-react';

const PumpToolIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="8" />
    <polygon points="9,8 16,12 9,16" fill="currentColor" stroke="none" />
  </svg>
);

interface WastewaterToolbarProps {
  activeTool: ActiveWastewaterTool;
  onSelectTool: (tool: ActiveWastewaterTool) => void;
  thematicDisplay: WastewaterThematicDisplay;
  onSelectThematic: (thematic: WastewaterThematicDisplay) => void;
  routingMethod?: 'DYNAMICWAVE' | 'KINEMATIC' | 'STEADY';
  onSelectRoutingMethod?: (method: 'DYNAMICWAVE' | 'KINEMATIC' | 'STEADY') => void;
  onRunSimulation: () => void;
  onSampleElevations: () => void;
  onToggleFlexTables: () => void;
  onToggleProfile: () => void;
  onApplyAutoDesign?: () => void;
  onExportExcel: () => void;
  onExportInp: () => void;
  onImportInp: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLoadDemo: () => void;
  onClear: () => void;
  epsHour?: number;
  onSelectEpsHour?: (hour: number) => void;
  simulationSummary: WastewaterSimulationSummary | null;
  isSimulating: boolean;
  isSamplingElevation: boolean;
  isFlexTablesOpen: boolean;
  isProfileOpen: boolean;
  demoIndex?: number;
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
  routingMethod = 'DYNAMICWAVE',
  onSelectRoutingMethod,
  onRunSimulation,
  onSampleElevations,
  onToggleFlexTables,
  onToggleProfile,
  onApplyAutoDesign,
  onExportExcel,
  onExportInp,
  onImportInp,
  onLoadDemo,
  onClear,
  epsHour = 12,
  onSelectEpsHour,
  simulationSummary,
  isSimulating,
  isSamplingElevation,
  isFlexTablesOpen,
  isProfileOpen,
  demoIndex,
  elementCounts,
}) => {
  const tools: { id: ActiveWastewaterTool; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'select', label: 'Select / Move', icon: MousePointer },
    { id: 'add-manhole', label: 'Manhole', icon: CircleDot },
    { id: 'add-conduit', label: 'Pipe', icon: GitCommit },
    { id: 'add-wetwell', label: 'Wet Well', icon: Database },
    { id: 'add-pump', label: 'Pump', icon: PumpToolIcon },
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
          title="Compute SWMM gravity Manning hydraulics, velocities, capacity and export calculations"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isSimulating ? 'Computing...' : 'Compute Hydraulics'}</span>
        </button>

        {/* SWMM Flow Routing Solver Option */}
        {onSelectRoutingMethod && (
          <div className="flex items-center gap-1 bg-[#0a0a0a] px-2 py-1 rounded-lg border border-[#222] text-xs">
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[10px] text-[#737373] uppercase font-tech mr-1">Solver:</span>
            <select
              value={routingMethod}
              onChange={(e) => onSelectRoutingMethod(e.target.value as any)}
              className="bg-transparent text-sky-300 font-bold text-[11px] font-mono focus:outline-none cursor-pointer"
            >
              <option value="DYNAMICWAVE" className="bg-[#111]">Dynamic Wave (SWMM)</option>
              <option value="KINEMATIC" className="bg-[#111]">Kinematic Wave</option>
              <option value="STEADY" className="bg-[#111]">Steady State / EPS</option>
            </select>
          </div>
        )}

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

      {/* 3. Hydraulic Workspace Tools & Advanced Modules */}
      <div className="flex items-center gap-1.5">
        {/* Auto-Design Pipe Sizing */}
        {onApplyAutoDesign && (
          <button
            onClick={onApplyAutoDesign}
            disabled={!simulationSummary}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:text-purple-200 font-medium text-xs transition-colors cursor-pointer disabled:opacity-40"
            title="Auto-Design gravity sewer pipe diameters and slopes to satisfy velocity and capacity constraints"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span className="font-tech text-[11px]">Auto-Design</span>
          </button>
        )}

        {/* Direct Calculation Excel Export */}
        <button
          onClick={onExportExcel}
          disabled={!simulationSummary}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-emerald-400 hover:text-emerald-300 font-medium text-xs transition-colors cursor-pointer disabled:opacity-40"
          title="Export detailed 10-sheet calculation sheet to Microsoft Excel (.xlsx)"
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
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-[#aaa] hover:text-white text-xs transition-colors cursor-pointer"
          title="Cycle through 4 engineering demo models on real terrain (Municipal, Hillside, Coastal Dual-Lift, Industrial)"
        >
          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px] font-tech">Demo Model ({typeof demoIndex === 'number' ? (demoIndex % 4) + 1 : 1}/4)</span>
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

      {/* EPS 24-Hour Diurnal Timeline Bar (displayed when Steady/EPS mode or when simulation has hourly points) */}
      {routingMethod === 'STEADY' && simulationSummary?.hourlySimulationPoints && onSelectEpsHour && (
        <div className="w-full flex items-center justify-between gap-3 px-3 py-1.5 mt-1 bg-[#0a0a0c] border border-[#222] rounded-lg text-xs font-mono">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-white font-bold font-tech text-[11px] uppercase">
              EPS Diurnal Time: {epsHour.toString().padStart(2, '0')}:00
            </span>
            <span className="text-amber-400 font-bold">
              ({simulationSummary.hourlySimulationPoints[epsHour]?.diurnalMultiplier.toFixed(2)}x Diurnal)
            </span>
          </div>

          <div className="flex-1 max-w-md flex items-center gap-2">
            <span className="text-[10px] text-[#666]">00:00</span>
            <input
              type="range"
              min="0"
              max="23"
              step="1"
              value={epsHour}
              onChange={(e) => onSelectEpsHour(parseInt(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <span className="text-[10px] text-[#666]">23:00</span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-[#888]">
              Flow:{' '}
              <strong className="text-white">
                {simulationSummary.hourlySimulationPoints[epsHour]?.totalFlowLs.toFixed(1)} L/s
              </strong>
            </span>
            <span className="text-[#888]">
              Pump:{' '}
              <strong
                className={
                  simulationSummary.hourlySimulationPoints[epsHour]?.pumpOperatingState === 'ON'
                    ? 'text-emerald-400'
                    : 'text-[#666]'
                }
              >
                {simulationSummary.hourlySimulationPoints[epsHour]?.pumpOperatingState}
              </strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
