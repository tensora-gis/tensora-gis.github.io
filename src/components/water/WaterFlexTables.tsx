import React, { useState } from 'react';
import {
  NetworkElement,
  WaterDistributionNetwork,
  WaterJunction,
  WaterPipe,
  WaterPump,
  WaterReservoir,
  WaterTank,
  WaterValve,
  SimulationSummary,
} from '../../types/waterDistribution';
import { X, Table, Search, Download, Trash2, FileSpreadsheet, SlidersHorizontal, Flame } from 'lucide-react';

interface WaterFlexTablesProps {
  network: WaterDistributionNetwork;
  summary?: SimulationSummary | null;
  onUpdateElement: (elem: NetworkElement) => void;
  onSelectElement: (elem: NetworkElement) => void;
  onDeleteElement: (id: string, type: NetworkElement['type']) => void;
  onClose: () => void;
  onExportExcel?: () => void;
}

type ActiveTableTab = 'junctions' | 'pipes' | 'pumps' | 'valves' | 'sources' | 'fireflow' | 'transient';

export const WaterFlexTables: React.FC<WaterFlexTablesProps> = ({
  network,
  summary,
  onUpdateElement,
  onSelectElement,
  onDeleteElement,
  onClose,
  onExportExcel,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTableTab>('junctions');
  const [filterText, setFilterText] = useState('');

  const filter = filterText.toLowerCase();

  // CSV Exporter for current table
  const handleExportCsv = () => {
    let csv = '';
    if (activeTab === 'junctions') {
      csv = 'ID,Label,Latitude,Longitude,Elevation(m),BaseDemand(L/s),Head(m),Pressure(m)\n';
      network.junctions.forEach((j) => {
        csv += `${j.id},${j.label},${j.lat},${j.lng},${j.elevation},${j.baseDemand},${j.head ?? ''},${j.pressure ?? ''}\n`;
      });
    } else if (activeTab === 'pipes') {
      csv = 'ID,Label,FromNode,ToNode,Length(m),Diameter(mm),Roughness(C),Status,Flow(L/s),Velocity(m/s),Headloss(m/km)\n';
      network.pipes.forEach((p) => {
        csv += `${p.id},${p.label},${p.startNodeId},${p.endNodeId},${p.length},${p.diameter},${p.roughness},${p.status},${p.flow ?? ''},${p.velocity ?? ''},${p.unitHeadloss ?? ''}\n`;
      });
    } else if (activeTab === 'transient') {
      csv = 'PipeID,Material,Length(m),Diameter(mm),PN(bar),WaveSpeed(m/s),Reflection(s),Velocity(m/s),MaxHead(m),MinHead(m),CavitationRisk,OverpressureRisk\n';
      network.pipes.forEach((p) => {
        const a = p.waveSpeedMs || 1050;
        const refl = ((2 * p.length) / a).toFixed(2);
        const cav = (p.minTransientHeadM ?? 0) < -10 ? 'YES' : 'NO';
        const over = (p.maxTransientHeadM ?? 0) > (p.pressureRatingPnBar || 16) * 10 ? 'YES' : 'NO';
        csv += `${p.id},${p.material || 'Ductile Iron'},${p.length},${p.diameter},${p.pressureRatingPnBar || 16},${a},${refl},${p.velocity ?? ''},${p.maxTransientHeadM ?? ''},${p.minTransientHeadM ?? ''},${cav},${over}\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HydraulicNetwork_${activeTab}_FlexTable.csv`;
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
            <span>Hydraulic FlexTables</span>
          </div>

          {/* Table Tab Switcher */}
          <div className="flex items-center gap-1 bg-[#0a0a0a] p-0.5 rounded-lg border border-[#222]">
            {(
              [
                ['junctions', `Junctions (${network.junctions.length})`],
                ['pipes', `Pipes (${network.pipes.length})`],
                ['pumps', `Pumps (${network.pumps.length})`],
                ['valves', `Valves (${(network.valves || []).length})`],
                ['sources', `Tanks & Res. (${network.tanks.length + network.reservoirs.length})`],
                ['fireflow', `Fire Flow (${network.junctions.length})`],
                ['transient', `Surge & Hammer (${network.pipes.length})`],
              ] as const
            ).map(([tabId, label]) => (
              <button
                key={tabId}
                onClick={() => setActiveTab(tabId)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
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
              placeholder="Search table..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="bg-[#0a0a0a] border border-[#222] rounded pl-8 pr-2 py-1 text-xs text-white placeholder:text-[#555] font-mono focus:outline-none focus:border-amber-500 w-36"
            />
          </div>

          {onExportExcel && (
            <button
              onClick={onExportExcel}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#1c1c1c] hover:bg-[#252525] border border-[#333] text-xs text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
              title="Export complete calculation workbook (.xlsx)"
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span className="font-tech text-[10px]">Excel (.xlsx)</span>
            </button>
          )}

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#1c1c1c] hover:bg-[#252525] border border-[#333] text-xs text-[#a3a3a3] hover:text-white transition-colors"
            title="Export Table as CSV"
          >
            <Download className="w-3 h-3 text-amber-400" />
            <span className="font-tech text-[10px]">CSV</span>
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#222] text-[#737373] hover:text-white"
            title="Close FlexTables"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table Data Body */}
      <div className="flex-1 overflow-auto text-xs font-mono">
        {/* 1. Junctions Table */}
        {activeTab === 'junctions' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#121212] sticky top-0 border-b border-[#222] text-[10px] text-[#737373] uppercase font-tech">
              <tr>
                <th className="p-2">ID</th>
                <th className="p-2">Label</th>
                <th className="p-2">Ground Elev (m)</th>
                <th className="p-2">Base Demand (L/s)</th>
                <th className="p-2">Head (m MSL)</th>
                <th className="p-2">Pressure (m H2O)</th>
                <th className="p-2">Pressure (psi)</th>
                <th className="p-2">Status</th>
                <th className="p-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a]">
              {network.junctions
                .filter(
                  (j) =>
                    j.id.toLowerCase().includes(filter) ||
                    (j.label && j.label.toLowerCase().includes(filter))
                )
                .map((j) => (
                  <tr
                    key={j.id}
                    onClick={() => onSelectElement(j)}
                    className="hover:bg-[#171717] transition-colors cursor-pointer"
                  >
                    <td className="p-2 text-amber-400 font-bold">{j.id}</td>
                    <td className="p-2 text-[#ccc]">{j.label}</td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="0.1"
                        value={j.elevation}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          onUpdateElement({
                            ...j,
                            elevation: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-18 bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="0.5"
                        value={j.baseDemand}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          onUpdateElement({
                            ...j,
                            baseDemand: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-18 bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-2 text-[#888]">{j.head ?? '—'}</td>
                    <td
                      className={`p-2 font-bold ${
                        j.pressure === undefined
                          ? 'text-[#666]'
                          : j.pressure < 0
                          ? 'text-red-400'
                          : j.pressure < 15
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {j.pressure ?? '—'}
                    </td>
                    <td className="p-2 text-[#888]">
                      {j.pressure !== undefined ? (j.pressure * 1.42).toFixed(1) : '—'}
                    </td>
                    <td className="p-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase ${
                          j.status === 'negative'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : j.status === 'low-pressure'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {j.status || 'READY'}
                      </span>
                    </td>
                    <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onDeleteElement(j.id, 'junction')}
                        className="text-[#666] hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {/* 2. Pipes Table */}
        {activeTab === 'pipes' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#121212] sticky top-0 border-b border-[#222] text-[10px] text-[#737373] uppercase font-tech">
              <tr>
                <th className="p-2">ID</th>
                <th className="p-2">Label</th>
                <th className="p-2">Start Node</th>
                <th className="p-2">End Node</th>
                <th className="p-2">Length (m)</th>
                <th className="p-2">Diam (mm)</th>
                <th className="p-2">Roughness C</th>
                <th className="p-2">Status</th>
                <th className="p-2">Flow (L/s)</th>
                <th className="p-2">Velocity (m/s)</th>
                <th className="p-2">Loss (m/km)</th>
                <th className="p-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a]">
              {network.pipes
                .filter(
                  (p) =>
                    p.id.toLowerCase().includes(filter) ||
                    (p.label && p.label.toLowerCase().includes(filter))
                )
                .map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => onSelectElement(p)}
                    className="hover:bg-[#171717] transition-colors cursor-pointer"
                  >
                    <td className="p-2 text-amber-400 font-bold">{p.id}</td>
                    <td className="p-2 text-[#ccc]">{p.label}</td>
                    <td className="p-2 text-[#888]">{p.startNodeId}</td>
                    <td className="p-2 text-[#888]">{p.endNodeId}</td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="5"
                        value={p.length}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          onUpdateElement({
                            ...p,
                            length: parseFloat(e.target.value) || 1,
                          })
                        }
                        className="w-16 bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="25"
                        value={p.diameter}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          onUpdateElement({
                            ...p,
                            diameter: parseInt(e.target.value, 10) || 150,
                          })
                        }
                        className="w-16 bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-2 text-[#888]">{p.roughness}</td>
                    <td className="p-2 text-[#888]">{p.status}</td>
                    <td className="p-2 font-bold text-sky-400">{p.flow ?? '—'}</td>
                    <td
                      className={`p-2 font-bold ${
                        p.velocity === undefined
                          ? 'text-[#666]'
                          : p.velocity > 2.0
                          ? 'text-amber-400'
                          : 'text-white'
                      }`}
                    >
                      {p.velocity ?? '—'}
                    </td>
                    <td className="p-2 text-[#888]">{p.unitHeadloss ?? '—'}</td>
                    <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onDeleteElement(p.id, 'pipe')}
                        className="text-[#666] hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {/* 3. Pumps Table */}
        {activeTab === 'pumps' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#121212] sticky top-0 border-b border-[#222] text-[10px] text-[#737373] uppercase font-tech">
              <tr>
                <th className="p-2">ID</th>
                <th className="p-2">Label</th>
                <th className="p-2">Suction Node</th>
                <th className="p-2">Discharge Node</th>
                <th className="p-2">Pump Switch</th>
                <th className="p-2">Design Flow (L/s)</th>
                <th className="p-2">Design Head (m)</th>
                <th className="p-2">Power (kW)</th>
                <th className="p-2">Operating Flow (L/s)</th>
                <th className="p-2">Operating Head (m)</th>
                <th className="p-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a]">
              {network.pumps.map((pmp) => (
                <tr
                  key={pmp.id}
                  onClick={() => onSelectElement(pmp)}
                  className="hover:bg-[#171717] transition-colors cursor-pointer"
                >
                  <td className="p-2 text-amber-400 font-bold">{pmp.id}</td>
                  <td className="p-2 text-[#ccc]">{pmp.label}</td>
                  <td className="p-2 text-[#888]">{pmp.startNodeId}</td>
                  <td className="p-2 text-[#888]">{pmp.endNodeId}</td>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateElement({
                          ...pmp,
                          status: pmp.status === 'OPEN' ? 'CLOSED' : 'OPEN',
                        })
                      }
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                        pmp.status === 'OPEN'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                      }`}
                      title="Click to toggle pump operational switch"
                    >
                      {pmp.status === 'OPEN' ? '⚡ RUNNING' : '⭘ OFFLINE'}
                    </button>
                  </td>
                  <td className="p-2 text-white">{pmp.designFlow}</td>
                  <td className="p-2 text-white">{pmp.designHead}</td>
                  <td className="p-2 text-white">{pmp.powerKw}</td>
                  <td className="p-2 text-amber-400 font-bold">{pmp.operatingFlow ?? '—'}</td>
                  <td className="p-2 text-amber-400 font-bold">{pmp.operatingHead ?? '—'}</td>
                  <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onDeleteElement(pmp.id, 'pump')}
                      className="text-[#666] hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 4. Valves Table */}
        {activeTab === 'valves' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#121212] sticky top-0 border-b border-[#222] text-[10px] text-[#737373] uppercase font-tech">
              <tr>
                <th className="p-2">ID</th>
                <th className="p-2">Type</th>
                <th className="p-2">Label</th>
                <th className="p-2">Inlet Node</th>
                <th className="p-2">Outlet Node</th>
                <th className="p-2">Diameter (mm)</th>
                <th className="p-2">Setting</th>
                <th className="p-2">Operating Status</th>
                <th className="p-2">Flow (L/s)</th>
                <th className="p-2">Headloss (m)</th>
                <th className="p-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a]">
              {(network.valves || []).map((v) => (
                <tr
                  key={v.id}
                  onClick={() => onSelectElement(v)}
                  className="hover:bg-[#171717] transition-colors cursor-pointer"
                >
                  <td className="p-2 text-cyan-400 font-bold">{v.id}</td>
                  <td className="p-2 text-[#ccc] font-bold">{v.valveType}</td>
                  <td className="p-2 text-[#ccc]">{v.label}</td>
                  <td className="p-2 text-[#888]">{v.startNodeId}</td>
                  <td className="p-2 text-[#888]">{v.endNodeId}</td>
                  <td className="p-2 text-white">{v.diameter || 150}</td>
                  <td className="p-2 text-white font-mono">{v.setting} {v.valveType === 'FCV' ? 'L/s' : 'm'}</td>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateElement({
                          ...v,
                          status: v.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE',
                        })
                      }
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                        v.status === 'ACTIVE'
                          ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 hover:bg-cyan-500/30'
                          : 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                      }`}
                    >
                      {v.status === 'ACTIVE' ? 'REGULATING' : 'CLOSED'}
                    </button>
                  </td>
                  <td className="p-2 text-cyan-400 font-bold">{v.flow ?? '—'}</td>
                  <td className="p-2 text-white font-mono">{v.headloss ?? '—'}</td>
                  <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onDeleteElement(v.id, 'valve')}
                      className="text-[#666] hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 5. Sources Table */}
        {activeTab === 'sources' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#121212] sticky top-0 border-b border-[#222] text-[10px] text-[#737373] uppercase font-tech">
              <tr>
                <th className="p-2">Type</th>
                <th className="p-2">ID</th>
                <th className="p-2">Label</th>
                <th className="p-2">Ground Elevation (m)</th>
                <th className="p-2">Water Head / Level (m)</th>
                <th className="p-2">Net Supply (L/s)</th>
                <th className="p-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a]">
              {network.reservoirs.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => onSelectElement(r)}
                  className="hover:bg-[#171717] transition-colors cursor-pointer"
                >
                  <td className="p-2 text-sky-400 font-bold">RESERVOIR</td>
                  <td className="p-2 text-amber-400 font-bold">{r.id}</td>
                  <td className="p-2 text-[#ccc]">{r.label}</td>
                  <td className="p-2 text-white">{r.elevation}</td>
                  <td className="p-2 text-white">{r.totalHead}</td>
                  <td className="p-2 text-emerald-400 font-bold">{r.netFlow ?? '—'}</td>
                  <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onDeleteElement(r.id, 'reservoir')}
                      className="text-[#666] hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {network.tanks.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => onSelectElement(t)}
                  className="hover:bg-[#171717] transition-colors cursor-pointer"
                >
                  <td className="p-2 text-teal-400 font-bold">TANK</td>
                  <td className="p-2 text-amber-400 font-bold">{t.id}</td>
                  <td className="p-2 text-[#ccc]">{t.label}</td>
                  <td className="p-2 text-white">{t.elevation}</td>
                  <td className="p-2 text-white">{t.initialLevel}</td>
                  <td className="p-2 text-emerald-400 font-bold">{t.netFlow ?? '—'}</td>
                  <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onDeleteElement(t.id, 'tank')}
                      className="text-[#666] hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 6. Fire Flow Analysis Table */}
        {activeTab === 'fireflow' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#121212] sticky top-0 border-b border-[#222] text-[10px] text-[#737373] uppercase font-tech">
              <tr>
                <th className="p-2">Junction</th>
                <th className="p-2">Elevation (m MSL)</th>
                <th className="p-2">Base Demand (L/s)</th>
                <th className="p-2">Available Fire Flow (L/s)</th>
                <th className="p-2">Flow (GPM)</th>
                <th className="p-2">Residual Pressure (m H2O)</th>
                <th className="p-2">Residual (psi)</th>
                <th className="p-2">Min System Residual (m)</th>
                <th className="p-2">Standard Compliance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a]">
              {(summary?.fireFlowResults || network.junctions.map((j) => ({
                junctionId: j.id,
                label: j.label || j.id,
                elevation: j.elevation,
                baseDemand: j.baseDemand,
                availableFireFlowLs: Math.max(10, Math.round(((j.pressure ?? 20) - 15) * 5.5)),
                residualPressureM: 15.0,
                systemMinResidualM: 14.2,
                isAdequate: ((j.pressure ?? 20) - 15) * 5.5 >= 35,
              }))).map((ff) => (
                <tr
                  key={ff.junctionId}
                  className="hover:bg-[#171717] transition-colors"
                >
                  <td className="p-2 text-amber-400 font-bold">{ff.junctionId}</td>
                  <td className="p-2 text-white">{ff.elevation}</td>
                  <td className="p-2 text-[#ccc]">{ff.baseDemand}</td>
                  <td className="p-2 text-emerald-400 font-bold">{ff.availableFireFlowLs} L/s</td>
                  <td className="p-2 text-white font-mono">{Math.round(ff.availableFireFlowLs * 15.85)} gpm</td>
                  <td className="p-2 text-white">{ff.residualPressureM} m</td>
                  <td className="p-2 text-white">{(ff.residualPressureM * 1.42).toFixed(1)} psi</td>
                  <td className="p-2 text-white">{ff.systemMinResidualM} m</td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      ff.isAdequate
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-red-500/20 text-red-400 border border-red-500/40'
                    }`}>
                      {ff.isAdequate ? 'ADEQUATE' : 'DEFICIENT'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 7. Surge & Water Hammer Table */}
        {activeTab === 'transient' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#121212] sticky top-0 border-b border-[#222] text-[10px] text-[#737373] uppercase font-tech">
              <tr>
                <th className="p-2">Pipe ID</th>
                <th className="p-2">Material</th>
                <th className="p-2">Length (m)</th>
                <th className="p-2">Diam (mm)</th>
                <th className="p-2">PN Rating</th>
                <th className="p-2">Wave Speed a (m/s)</th>
                <th className="p-2">Reflection 2L/a (s)</th>
                <th className="p-2">Velocity (m/s)</th>
                <th className="p-2">Max Head H_max (m)</th>
                <th className="p-2">Min Head H_min (m)</th>
                <th className="p-2">Cavitation Risk</th>
                <th className="p-2">Rupture Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a]">
              {network.pipes
                .filter(
                  (p) =>
                    p.id.toLowerCase().includes(filter) ||
                    (p.label && p.label.toLowerCase().includes(filter))
                )
                .map((p) => {
                  const a = p.waveSpeedMs || 1050;
                  const refl = ((2 * p.length) / a).toFixed(2);
                  const isCav = (p.minTransientHeadM ?? 0) < -10;
                  const isOver = (p.maxTransientHeadM ?? 0) > (p.pressureRatingPnBar || 16) * 10;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => onSelectElement(p)}
                      className="hover:bg-[#171717] transition-colors cursor-pointer"
                    >
                      <td className="p-2 text-amber-400 font-bold">{p.id}</td>
                      <td className="p-2 text-white">{p.material || 'Ductile Iron'}</td>
                      <td className="p-2 text-[#ccc]">{p.length}</td>
                      <td className="p-2 text-white">{p.diameter}</td>
                      <td className="p-2 text-cyan-400 font-mono">PN{p.pressureRatingPnBar || 16}</td>
                      <td className="p-2 text-amber-300 font-bold">{a}</td>
                      <td className="p-2 text-white">{refl} s</td>
                      <td className="p-2 text-white">{p.velocity ?? '—'}</td>
                      <td className="p-2 font-bold text-rose-400">{p.maxTransientHeadM ?? '—'} m</td>
                      <td className="p-2 font-bold text-purple-300">{p.minTransientHeadM ?? '—'} m</td>
                      <td className="p-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isCav
                              ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {isCav ? 'CAVITATION RISK' : 'NORMAL'}
                        </span>
                      </td>
                      <td className="p-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isOver
                              ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {isOver ? 'EXCEEDS PN' : 'SAFE'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
