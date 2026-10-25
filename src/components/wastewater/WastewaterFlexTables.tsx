import React, { useState } from 'react';
import {
  WastewaterNetworkElement,
  WastewaterNetwork,
  WastewaterSimulationSummary,
} from '../../types/wastewater';
import { X, Table, Search, Download, Trash2, FileSpreadsheet } from 'lucide-react';

interface WastewaterFlexTablesProps {
  network: WastewaterNetwork;
  summary?: WastewaterSimulationSummary | null;
  onUpdateElement: (elem: WastewaterNetworkElement) => void;
  onSelectElement: (elem: WastewaterNetworkElement) => void;
  onDeleteElement: (id: string, type: WastewaterNetworkElement['type']) => void;
  onClose: () => void;
  onExportExcel?: () => void;
}

type ActiveTableTab =
  | 'manholes'
  | 'conduits'
  | 'pumps'
  | 'forcemains'
  | 'outfalls'
  | 'sizing'
  | 'h2s'
  | 'eps';

export const WastewaterFlexTables: React.FC<WastewaterFlexTablesProps> = ({
  network,
  summary,
  onUpdateElement,
  onSelectElement,
  onDeleteElement,
  onClose,
  onExportExcel,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTableTab>('manholes');
  const [filterText, setFilterText] = useState('');

  const filter = filterText.toLowerCase();

  // CSV Exporter for current table
  const handleExportCsv = () => {
    let csv = '';
    if (activeTab === 'manholes') {
      csv = 'ID,Label,Latitude,Longitude,RimElev(m),InvertElev(m),Depth(m),Diameter(mm),Population,PeakFlow(L/s),HGL(m),Surcharged\n';
      network.manholes.forEach((m) => {
        csv += `${m.id},${m.label},${m.lat},${m.lng},${m.rimElevation},${m.invertElevation},${m.depth},${m.diameterMm},${m.population},${m.peakSanitaryFlowLs ?? ''},${m.waterElevationM ?? ''},${m.isSurcharged ?? false}\n`;
      });
    } else if (activeTab === 'conduits') {
      csv = 'ID,Label,FromNode,ToNode,Length(m),Diameter(mm),Material,Slope(%),Qfull(L/s),DesignQ(L/s),Velocity(m/s),Fullness(d/D)\n';
      network.conduits.forEach((c) => {
        csv += `${c.id},${c.label},${c.startNodeId},${c.endNodeId},${c.lengthM},${c.diameterMm},${c.material},${(c.slopeMPerM * 100).toFixed(3)},${c.fullCapacityLs ?? ''},${c.designFlowLs ?? ''},${c.actualVelocityMs ?? ''},${c.flowDepthRatio ?? ''}\n`;
      });
    } else if (activeTab === 'pumps') {
      csv = 'ID,Type,Label,RimElev(m),FloorElev(m),RatedFlow(L/s),Head(m),Power(kW)\n';
      network.wetWells.forEach((w) => {
        csv += `${w.id},WetWell,${w.label},${w.rimElevation},${w.floorElevation},-,ActiveVol:${w.storageVolumeM3},-\n`;
      });
      network.pumps.forEach((p) => {
        csv += `${p.id},Pump,${p.label},-,-,${p.ratedDischargeLs},${p.dynamicHeadM},${p.powerKw ?? 0}\n`;
      });
    } else if (activeTab === 'forcemains') {
      csv = 'ID,Label,FromNode,ToNode,Length(m),Diameter(mm),Material,Velocity(m/s),FrictionLoss(m)\n';
      network.forceMains.forEach((fm) => {
        csv += `${fm.id},${fm.label},${fm.startNodeId},${fm.endNodeId},${fm.lengthM},${fm.diameterMm},${fm.material},${fm.velocityMs ?? ''},${fm.frictionHeadlossM ?? ''}\n`;
      });
    } else if (activeTab === 'outfalls') {
      csv = 'ID,Label,Latitude,Longitude,InvertElev(m),WaterLevel(m),Discharge(L/s)\n';
      network.outfalls.forEach((o) => {
        csv += `${o.id},${o.label},${o.lat},${o.lng},${o.invertElevation},${o.receivingWaterElevation},${o.totalDischargeLs ?? ''}\n`;
      });
    } else if (activeTab === 'sizing') {
      csv = 'ConduitID,CurrentDia(mm),RecommendedDia(mm),CurrentSlope(%),RecommendedSlope(%),CoverDepth(m),DesignStatus,Note\n';
      (summary?.constraintDesignResults || []).forEach((s) => {
        csv += `${s.conduitId},${s.currentDiameterMm},${s.recommendedDiameterMm},${s.currentSlopePercent},${s.recommendedSlopePercent},${s.coverDepthM},${s.designStatus},"${s.designNote}"\n`;
      });
    } else if (activeTab === 'h2s') {
      csv = 'ConduitID,BOD5(mg/L),Temp(C),ZFactor,SulfideRate(mg/L.hr),OdorRisk,CrownLoss(mm/yr),CorrosionPotential\n';
      (summary?.h2sCorrosionResults || []).forEach((h) => {
        csv += `${h.conduitId},${h.bod5MgL},${h.temperatureC},${h.zFactor},${h.sulfideBuildupRateMgLHr},${h.odorRisk},${h.crownLossMmPerYear},${h.corrosionPotential}\n`;
      });
    } else if (activeTab === 'eps') {
      csv = 'Hour,Time,Multiplier,TotalFlow(L/s),CriticalConduit,MaxCapacity(d/D),WetWellLevel(m),PumpState\n';
      (summary?.hourlySimulationPoints || []).forEach((e) => {
        csv += `${e.hour},${e.timeLabel},${e.diurnalMultiplier},${e.totalFlowLs},${e.criticalConduitId},${e.maxCapacityUtilization},${e.wetWellWaterLevelM},${e.pumpOperatingState}\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Wastewater_${activeTab}_FlexTable.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-72 bg-[#0d0d0d] border-t border-[#222] flex flex-col z-30 select-none shadow-2xl shrink-0">
      {/* FlexTable Header Bar */}
      <div className="px-4 py-2 border-b border-[#222] bg-[#141414] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-white font-tech text-xs uppercase font-bold">
            <Table className="w-4 h-4 text-amber-500" />
            <span>Wastewater FlexTables</span>
          </div>

          {/* Table Tab Switcher */}
          <div className="flex items-center gap-1 bg-[#0a0a0a] p-0.5 rounded-lg border border-[#222] overflow-x-auto max-w-2xl">
            {(
              [
                ['manholes', `Manholes (${network.manholes.length})`],
                ['conduits', `Conduits (${network.conduits.length})`],
                ['pumps', `Pumps & Lift (${network.wetWells.length + network.pumps.length})`],
                ['forcemains', `Force Mains (${network.forceMains.length})`],
                ['outfalls', `Outfalls (${network.outfalls.length})`],
                ['sizing', `Pipe Sizing (${summary?.constraintDesignResults?.length || 0})`],
                ['h2s', `H2S Risk (${summary?.h2sCorrosionResults?.length || 0})`],
                ['eps', `24-Hr Dynamic (${summary?.hourlySimulationPoints?.length || 0}h)`],
              ] as const
            ).map(([tabId, label]) => (
              <button
                key={tabId}
                onClick={() => setActiveTab(tabId)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === tabId
                    ? 'bg-amber-500 text-[#0a0a0a] font-bold'
                    : 'text-[#888] hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#666] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter elements..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="bg-[#0a0a0a] border border-[#222] rounded pl-8 pr-2 py-1 text-xs text-white placeholder:text-[#555] font-mono focus:outline-none focus:border-amber-500 w-36"
            />
          </div>

          {onExportExcel && (
            <button
              onClick={onExportExcel}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-emerald-400 text-xs font-semibold transition-colors cursor-pointer"
              title="Export complete calculation workbook (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-tech text-[11px]">Export .XLSX</span>
            </button>
          )}

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-amber-400 text-xs font-semibold transition-colors cursor-pointer"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-tech text-[11px]">CSV</span>
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#222] text-[#737373] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid Content with Editable Cells */}
      <div className="flex-1 overflow-auto font-mono text-xs">
        {/* 1. Manholes Table */}
        {activeTab === 'manholes' && (
          <table className="w-full text-left border-collapse min-w-[980px]">
            <thead className="bg-[#141414] sticky top-0 text-[#888] text-[11px] font-tech uppercase border-b border-[#222]">
              <tr>
                <th className="p-2 border-r border-[#222] w-20">ID</th>
                <th className="p-2 border-r border-[#222] w-36">Label</th>
                <th className="p-2 border-r border-[#222] w-24">Rim (m)</th>
                <th className="p-2 border-r border-[#222] w-24">Invert (m)</th>
                <th className="p-2 border-r border-[#222] w-20">Depth (m)</th>
                <th className="p-2 border-r border-[#222] w-20">Dia (mm)</th>
                <th className="p-2 border-r border-[#222] w-24">Pop (Cap)</th>
                <th className="p-2 border-r border-[#222] w-20">I&I (L/s)</th>
                <th className="p-2 border-r border-[#222] w-24">Peak Q (L/s)</th>
                <th className="p-2 border-r border-[#222] w-24">HGL (m)</th>
                <th className="p-2 border-r border-[#222]">Status</th>
                <th className="p-2 text-center w-12">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e1e] text-[11px]">
              {network.manholes
                .filter((m) => m.id.toLowerCase().includes(filter) || m.label.toLowerCase().includes(filter))
                .map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => onSelectElement(m)}
                    className="hover:bg-[#1a1a1a] cursor-pointer transition-colors"
                  >
                    <td className="p-2 font-bold text-amber-500 border-r border-[#1e1e1e]">{m.id}</td>
                    <td className="p-1 border-r border-[#1e1e1e]">
                      <input
                        type="text"
                        value={m.label}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onUpdateElement({ ...m, label: e.target.value })}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-[#1e1e1e]">
                      <input
                        type="number"
                        step="0.1"
                        value={m.rimElevation}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const rim = parseFloat(e.target.value) || 0;
                          onUpdateElement({
                            ...m,
                            rimElevation: rim,
                            invertElevation: Math.round((rim - m.depth) * 10) / 10,
                          });
                        }}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-[#1e1e1e]">
                      <input
                        type="number"
                        step="0.1"
                        value={m.invertElevation}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const inv = parseFloat(e.target.value) || 0;
                          onUpdateElement({
                            ...m,
                            invertElevation: inv,
                            depth: Math.round((m.rimElevation - inv) * 10) / 10,
                          });
                        }}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-[#1e1e1e]">
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        value={m.depth}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const d = parseFloat(e.target.value) || 1.5;
                          onUpdateElement({
                            ...m,
                            depth: d,
                            invertElevation: Math.round((m.rimElevation - d) * 10) / 10,
                          });
                        }}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-[#1e1e1e]">
                      <input
                        type="number"
                        step="100"
                        value={m.diameterMm}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onUpdateElement({ ...m, diameterMm: parseInt(e.target.value) || 1000 })}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-[#1e1e1e]">
                      <input
                        type="number"
                        step="50"
                        min="0"
                        value={m.population}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onUpdateElement({ ...m, population: parseInt(e.target.value) || 0 })}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-[#1e1e1e]">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={m.inflowInfiltrationLs}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onUpdateElement({ ...m, inflowInfiltrationLs: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-2 text-white font-bold border-r border-[#1e1e1e]">
                      {m.peakSanitaryFlowLs?.toFixed(2) ?? '-'}
                    </td>
                    <td className="p-2 text-white font-bold border-r border-[#1e1e1e]">
                      {m.waterElevationM?.toFixed(2) ?? '-'}
                    </td>
                    <td className="p-2 border-r border-[#1e1e1e]">
                      {m.isFlooding ? (
                        <span className="text-red-400 font-bold">SURFACE FLOOD</span>
                      ) : m.isSurcharged ? (
                        <span className="text-amber-400 font-bold">Surcharged (+{m.surchargeDepthM?.toFixed(2)}m)</span>
                      ) : (
                        <span className="text-emerald-400">Gravity Free-Flow</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteElement(m.id, 'manhole');
                        }}
                        className="text-[#666] hover:text-red-400 p-0.5 cursor-pointer"
                        title="Delete manhole"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {/* 2. Conduits Table */}
        {activeTab === 'conduits' && (
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead className="bg-[#141414] sticky top-0 text-[#888] text-[11px] font-tech uppercase border-b border-[#222]">
              <tr>
                <th className="p-2 border-r border-[#222] w-20">ID</th>
                <th className="p-2 border-r border-[#222] w-28">From → To</th>
                <th className="p-2 border-r border-[#222] w-24">Length (m)</th>
                <th className="p-2 border-r border-[#222] w-24">Dia (mm)</th>
                <th className="p-2 border-r border-[#222] w-24">Material</th>
                <th className="p-2 border-r border-[#222] w-24">Up Inv (m)</th>
                <th className="p-2 border-r border-[#222] w-24">Dn Inv (m)</th>
                <th className="p-2 border-r border-[#222] w-20">Slope (%)</th>
                <th className="p-2 border-r border-[#222] w-24">Design Q (L/s)</th>
                <th className="p-2 border-r border-[#222] w-20">d/D</th>
                <th className="p-2 border-r border-[#222] w-20">Vel (m/s)</th>
                <th className="p-2 border-r border-[#222]">Compliance</th>
                <th className="p-2 text-center w-12">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e1e] text-[11px]">
              {network.conduits
                .filter((c) => c.id.toLowerCase().includes(filter) || c.label.toLowerCase().includes(filter))
                .map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => onSelectElement(c)}
                    className="hover:bg-[#1a1a1a] cursor-pointer transition-colors"
                  >
                    <td className="p-2 font-bold text-amber-500 border-r border-[#1e1e1e]">{c.id}</td>
                    <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">
                      {c.startNodeId} → {c.endNodeId}
                    </td>
                    <td className="p-1 border-r border-[#1e1e1e]">
                      <input
                        type="number"
                        step="1"
                        value={c.lengthM}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const len = parseFloat(e.target.value) || 10;
                          const slope = (c.upstreamInvertM - c.downstreamInvertM) / Math.max(1, len);
                          onUpdateElement({ ...c, lengthM: len, slopeMPerM: slope });
                        }}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-[#1e1e1e]">
                      <input
                        type="number"
                        step="25"
                        value={c.diameterMm}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onUpdateElement({ ...c, diameterMm: parseInt(e.target.value) || 250 })}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-[#1e1e1e]">
                      <select
                        value={c.material}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const mat = e.target.value as any;
                          const n = mat === 'PVC' || mat === 'HDPE' ? 0.010 : 0.013;
                          onUpdateElement({ ...c, material: mat, manningN: n });
                        }}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1 py-0.5 text-white"
                      >
                        <option value="PVC">PVC</option>
                        <option value="HDPE">HDPE</option>
                        <option value="RCC">RCC</option>
                        <option value="DI">DI</option>
                        <option value="Clay">Clay</option>
                      </select>
                    </td>
                    <td className="p-1 border-r border-[#1e1e1e]">
                      <input
                        type="number"
                        step="0.1"
                        value={c.upstreamInvertM}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const up = parseFloat(e.target.value) || 0;
                          const slope = (up - c.downstreamInvertM) / Math.max(1, c.lengthM);
                          onUpdateElement({ ...c, upstreamInvertM: up, slopeMPerM: slope });
                        }}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-[#1e1e1e]">
                      <input
                        type="number"
                        step="0.1"
                        value={c.downstreamInvertM}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const dn = parseFloat(e.target.value) || 0;
                          const slope = (c.upstreamInvertM - dn) / Math.max(1, c.lengthM);
                          onUpdateElement({ ...c, downstreamInvertM: dn, slopeMPerM: slope });
                        }}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{(c.slopeMPerM * 100).toFixed(3)}%</td>
                    <td className="p-2 text-amber-400 font-bold border-r border-[#1e1e1e]">
                      {c.designFlowLs?.toFixed(2) ?? '-'}
                    </td>
                    <td className="p-2 font-bold border-r border-[#1e1e1e]">
                      <span className={(c.flowDepthRatio ?? 0) > 1.0 ? 'text-red-400' : (c.flowDepthRatio ?? 0) > 0.75 ? 'text-amber-400' : 'text-emerald-400'}>
                        {c.flowDepthRatio?.toFixed(2) ?? '-'}
                      </span>
                    </td>
                    <td className="p-2 text-white font-bold border-r border-[#1e1e1e]">
                      {c.actualVelocityMs?.toFixed(2) ?? '-'}
                    </td>
                    <td className="p-2 border-r border-[#1e1e1e]">
                      {c.isReverseSlope ? (
                        <span className="text-red-400 font-bold">REVERSE SLOPE</span>
                      ) : !c.selfCleansingOk ? (
                        <span className="text-amber-400">Sub-Cleansing</span>
                      ) : (
                        <span className="text-emerald-400">Compliant</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteElement(c.id, 'conduit');
                        }}
                        className="text-[#666] hover:text-red-400 p-0.5 cursor-pointer"
                        title="Delete conduit"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {/* 3. Pumps & Wet Wells Table */}
        {activeTab === 'pumps' && (
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-[#141414] sticky top-0 text-[#888] text-[11px] font-tech uppercase border-b border-[#222]">
              <tr>
                <th className="p-2 border-r border-[#222]">ID</th>
                <th className="p-2 border-r border-[#222]">Type</th>
                <th className="p-2 border-r border-[#222]">Label</th>
                <th className="p-2 border-r border-[#222]">Pump Switch</th>
                <th className="p-2 border-r border-[#222]">Rim (m MSL)</th>
                <th className="p-2 border-r border-[#222]">Floor / Invert (m)</th>
                <th className="p-2 border-r border-[#222]">Rated Flow / Vol</th>
                <th className="p-2 border-r border-[#222]">TDH / Power</th>
                <th className="p-2 text-center w-12">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e1e] text-[11px]">
              {network.wetWells.map((w) => (
                <tr
                  key={w.id}
                  onClick={() => onSelectElement(w)}
                  className="hover:bg-[#1a1a1a] cursor-pointer"
                >
                  <td className="p-2 font-bold text-sky-400 border-r border-[#1e1e1e]">{w.id}</td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">Wet Well</td>
                  <td className="p-1 border-r border-[#1e1e1e]">
                    <input
                      type="text"
                      value={w.label}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateElement({ ...w, label: e.target.value })}
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                    />
                  </td>
                  <td className="p-2 text-[#666] border-r border-[#1e1e1e] font-mono text-[10px]">—</td>
                  <td className="p-1 border-r border-[#1e1e1e]">
                    <input
                      type="number"
                      step="0.1"
                      value={w.rimElevation}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateElement({ ...w, rimElevation: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                    />
                  </td>
                  <td className="p-1 border-r border-[#1e1e1e]">
                    <input
                      type="number"
                      step="0.1"
                      value={w.floorElevation}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateElement({ ...w, floorElevation: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                    />
                  </td>
                  <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">
                    {w.storageVolumeM3} m³ ({w.diameterM}m Dia)
                  </td>
                  <td className="p-2 text-[#888] border-r border-[#1e1e1e]">-</td>
                  <td className="p-2 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteElement(w.id, 'wet-well');
                      }}
                      className="text-[#666] hover:text-red-400 p-0.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {network.pumps.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => onSelectElement(p)}
                  className="hover:bg-[#1a1a1a] cursor-pointer"
                >
                  <td className="p-2 font-bold text-amber-500 border-r border-[#1e1e1e]">{p.id}</td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">Lift Pump</td>
                  <td className="p-1 border-r border-[#1e1e1e]">
                    <input
                      type="text"
                      value={p.label}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateElement({ ...p, label: e.target.value })}
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                    />
                  </td>
                  <td className="p-2 border-r border-[#1e1e1e]" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateElement({
                          ...p,
                          status: p.status === 'ON' ? 'OFF' : 'ON',
                        })
                      }
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                        p.status === 'ON'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                      }`}
                      title="Click to toggle sewage pump operational switch"
                    >
                      {p.status === 'ON' ? '⚡ RUNNING' : '⭘ OFFLINE'}
                    </button>
                  </td>
                  <td className="p-2 text-[#888] border-r border-[#1e1e1e]">-</td>
                  <td className="p-2 text-[#888] border-r border-[#1e1e1e]">-</td>
                  <td className="p-1 border-r border-[#1e1e1e]">
                    <input
                      type="number"
                      step="5"
                      value={p.ratedDischargeLs}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateElement({ ...p, ratedDischargeLs: parseFloat(e.target.value) || 30 })}
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                    />
                  </td>
                  <td className="p-1 border-r border-[#1e1e1e]">
                    <input
                      type="number"
                      step="1"
                      value={p.dynamicHeadM}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateElement({ ...p, dynamicHeadM: parseFloat(e.target.value) || 20 })}
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteElement(p.id, 'pump');
                      }}
                      className="text-[#666] hover:text-red-400 p-0.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 4. Outfalls Table */}
        {activeTab === 'outfalls' && (
          <table className="w-full text-left border-collapse min-w-[750px]">
            <thead className="bg-[#141414] sticky top-0 text-[#888] text-[11px] font-tech uppercase border-b border-[#222]">
              <tr>
                <th className="p-2 border-r border-[#222]">ID</th>
                <th className="p-2 border-r border-[#222]">Label</th>
                <th className="p-2 border-r border-[#222]">Latitude</th>
                <th className="p-2 border-r border-[#222]">Longitude</th>
                <th className="p-2 border-r border-[#222]">Invert (m)</th>
                <th className="p-2 border-r border-[#222]">Water Level (m)</th>
                <th className="p-2 border-r border-[#222]">Total Discharge (L/s)</th>
                <th className="p-2 text-center w-12">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e1e] text-[11px]">
              {network.outfalls.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => onSelectElement(o)}
                  className="hover:bg-[#1a1a1a] cursor-pointer"
                >
                  <td className="p-2 font-bold text-emerald-400 border-r border-[#1e1e1e]">{o.id}</td>
                  <td className="p-1 border-r border-[#1e1e1e]">
                    <input
                      type="text"
                      value={o.label}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateElement({ ...o, label: e.target.value })}
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                    />
                  </td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{o.lat.toFixed(6)}</td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{o.lng.toFixed(6)}</td>
                  <td className="p-1 border-r border-[#1e1e1e]">
                    <input
                      type="number"
                      step="0.1"
                      value={o.invertElevation}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateElement({ ...o, invertElevation: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                    />
                  </td>
                  <td className="p-1 border-r border-[#1e1e1e]">
                    <input
                      type="number"
                      step="0.1"
                      value={o.receivingWaterElevation}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateElement({ ...o, receivingWaterElevation: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                    />
                  </td>
                  <td className="p-2 text-emerald-400 font-bold border-r border-[#1e1e1e]">
                    {o.totalDischargeLs?.toFixed(2) ?? '-'}
                  </td>
                  <td className="p-2 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteElement(o.id, 'outfall');
                      }}
                      className="text-[#666] hover:text-red-400 p-0.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 5. Force Mains Table */}
        {activeTab === 'forcemains' && (
          <table className="w-full text-left border-collapse min-w-[750px]">
            <thead className="bg-[#141414] sticky top-0 text-[#888] text-[11px] font-tech uppercase border-b border-[#222]">
              <tr>
                <th className="p-2 border-r border-[#222]">ID</th>
                <th className="p-2 border-r border-[#222]">Label</th>
                <th className="p-2 border-r border-[#222]">From Station</th>
                <th className="p-2 border-r border-[#222]">To Node</th>
                <th className="p-2 border-r border-[#222]">Diameter (mm)</th>
                <th className="p-2 border-r border-[#222]">Material</th>
                <th className="p-2 border-r border-[#222]">Length (m)</th>
                <th className="p-2 border-r border-[#222]">Velocity (m/s)</th>
                <th className="p-2 border-r border-[#222]">Headloss (m)</th>
                <th className="p-2 text-center w-12">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e1e] text-[11px]">
              {network.forceMains.map((fm) => (
                <tr
                  key={fm.id}
                  onClick={() => onSelectElement(fm)}
                  className="hover:bg-[#1a1a1a] cursor-pointer"
                >
                  <td className="p-2 font-bold text-sky-400 border-r border-[#1e1e1e]">{fm.id}</td>
                  <td className="p-1 border-r border-[#1e1e1e]">
                    <input
                      type="text"
                      value={fm.label}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateElement({ ...fm, label: e.target.value })}
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                    />
                  </td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{fm.startNodeId}</td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{fm.endNodeId}</td>
                  <td className="p-1 border-r border-[#1e1e1e]">
                    <input
                      type="number"
                      step="25"
                      value={fm.diameterMm}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateElement({ ...fm, diameterMm: parseInt(e.target.value) || 150 })}
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                    />
                  </td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{fm.material}</td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{fm.lengthM}m</td>
                  <td className="p-2 text-white font-mono border-r border-[#1e1e1e]">{fm.velocityMs?.toFixed(2) ?? '-'}</td>
                  <td className="p-2 text-amber-400 font-mono border-r border-[#1e1e1e]">{fm.frictionHeadlossM?.toFixed(1) ?? '-'}</td>
                  <td className="p-2 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteElement(fm.id, 'force-main');
                      }}
                      className="text-[#666] hover:text-red-400 p-0.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 6. Pipe Sizing & Optimization Table */}
        {activeTab === 'sizing' && (
          <table className="w-full text-left border-collapse min-w-[750px]">
            <thead className="bg-[#141414] sticky top-0 text-[#888] text-[11px] font-tech uppercase border-b border-[#222]">
              <tr>
                <th className="p-2 border-r border-[#222]">Conduit ID</th>
                <th className="p-2 border-r border-[#222]">Current Diam (mm)</th>
                <th className="p-2 border-r border-[#222]">Optimized Diam (mm)</th>
                <th className="p-2 border-r border-[#222]">Slope (%)</th>
                <th className="p-2 border-r border-[#222]">Soil Cover (m)</th>
                <th className="p-2 border-r border-[#222]">Design Status</th>
                <th className="p-2">Engineering Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e1e] text-[11px]">
              {(summary?.constraintDesignResults || []).map((s) => (
                <tr key={s.conduitId} className="hover:bg-[#1a1a1a]">
                  <td className="p-2 font-bold text-sky-400 border-r border-[#1e1e1e]">{s.conduitId}</td>
                  <td className="p-2 text-white border-r border-[#1e1e1e]">{s.currentDiameterMm} mm</td>
                  <td className="p-2 font-bold text-amber-400 border-r border-[#1e1e1e]">{s.recommendedDiameterMm} mm</td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{s.currentSlopePercent.toFixed(3)}%</td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{s.coverDepthM.toFixed(2)} m</td>
                  <td className="p-2 border-r border-[#1e1e1e]">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        s.designStatus === 'Optimal'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : s.designStatus.includes('Upsize')
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {s.designStatus}
                    </span>
                  </td>
                  <td className="p-2 text-[#bbb] font-mono text-[10px]">{s.designNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 7. H2S Corrosion & Odor Table */}
        {activeTab === 'h2s' && (
          <table className="w-full text-left border-collapse min-w-[750px]">
            <thead className="bg-[#141414] sticky top-0 text-[#888] text-[11px] font-tech uppercase border-b border-[#222]">
              <tr>
                <th className="p-2 border-r border-[#222]">Conduit ID</th>
                <th className="p-2 border-r border-[#222]">BOD5 (mg/L)</th>
                <th className="p-2 border-r border-[#222]">Temp (°C)</th>
                <th className="p-2 border-r border-[#222]">Pomeroy Z-Factor</th>
                <th className="p-2 border-r border-[#222]">Sulfide Buildup (mg/L·hr)</th>
                <th className="p-2 border-r border-[#222]">Odor Potential</th>
                <th className="p-2 border-r border-[#222]">Crown Loss (mm/yr)</th>
                <th className="p-2">Corrosion Potential</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e1e] text-[11px]">
              {(summary?.h2sCorrosionResults || []).map((h) => (
                <tr key={h.conduitId} className="hover:bg-[#1a1a1a]">
                  <td className="p-2 font-bold text-sky-400 border-r border-[#1e1e1e]">{h.conduitId}</td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{h.bod5MgL} mg/L</td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{h.temperatureC}°C</td>
                  <td className="p-2 font-mono font-bold text-white border-r border-[#1e1e1e]">{h.zFactor}</td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{h.sulfideBuildupRateMgLHr.toFixed(3)}</td>
                  <td className="p-2 border-r border-[#1e1e1e]">{h.odorRisk}</td>
                  <td className="p-2 font-mono text-amber-400 border-r border-[#1e1e1e]">{h.crownLossMmPerYear.toFixed(2)} mm/yr</td>
                  <td className="p-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        h.corrosionPotential === 'Severe'
                          ? 'bg-red-500/20 text-red-400'
                          : h.corrosionPotential === 'Moderate'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {h.corrosionPotential}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 8. 24-Hour Diurnal SWMM Table */}
        {activeTab === 'eps' && (
          <table className="w-full text-left border-collapse min-w-[750px]">
            <thead className="bg-[#141414] sticky top-0 text-[#888] text-[11px] font-tech uppercase border-b border-[#222]">
              <tr>
                <th className="p-2 border-r border-[#222]">Hour</th>
                <th className="p-2 border-r border-[#222]">Time</th>
                <th className="p-2 border-r border-[#222]">Multiplier</th>
                <th className="p-2 border-r border-[#222]">System Flow (L/s)</th>
                <th className="p-2 border-r border-[#222]">Critical Conduit</th>
                <th className="p-2 border-r border-[#222]">Peak d/D</th>
                <th className="p-2 border-r border-[#222]">Wet Well Water Level</th>
                <th className="p-2">Lift Pump Duty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e1e] text-[11px]">
              {(summary?.hourlySimulationPoints || []).map((e) => (
                <tr key={e.hour} className="hover:bg-[#1a1a1a]">
                  <td className="p-2 font-mono text-[#aaa] border-r border-[#1e1e1e]">{e.hour}</td>
                  <td className="p-2 font-bold text-white border-r border-[#1e1e1e]">{e.timeLabel}</td>
                  <td className="p-2 font-mono text-sky-400 border-r border-[#1e1e1e]">{e.diurnalMultiplier.toFixed(2)}x</td>
                  <td className="p-2 text-white font-mono border-r border-[#1e1e1e]">{e.totalFlowLs.toFixed(2)} L/s</td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{e.criticalConduitId}</td>
                  <td className="p-2 font-mono font-bold text-amber-400 border-r border-[#1e1e1e]">{e.maxCapacityUtilization.toFixed(2)}</td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{e.wetWellWaterLevelM.toFixed(2)} m MSL</td>
                  <td className="p-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        e.pumpOperatingState === 'ON'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-zinc-800 text-[#888]'
                      }`}
                    >
                      {e.pumpOperatingState === 'ON' ? '● RUNNING' : 'OFFLINE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};