import React, { useState } from 'react';
import {
  WastewaterNetworkElement,
  WastewaterNetwork,
  WastewaterManhole,
  WastewaterConduit,
  WastewaterWetWell,
  WastewaterPump,
  WastewaterOutfall,
} from '../../types/wastewater';
import { X, Table, Search, Download, Trash2, FileSpreadsheet } from 'lucide-react';

interface WastewaterFlexTablesProps {
  network: WastewaterNetwork;
  onUpdateElement: (elem: WastewaterNetworkElement) => void;
  onSelectElement: (elem: WastewaterNetworkElement) => void;
  onDeleteElement: (id: string, type: WastewaterNetworkElement['type']) => void;
  onClose: () => void;
  onExportExcel?: () => void;
}

type ActiveTableTab = 'manholes' | 'conduits' | 'pumps' | 'outfalls';

export const WastewaterFlexTables: React.FC<WastewaterFlexTablesProps> = ({
  network,
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
          <div className="flex items-center gap-1 bg-[#0a0a0a] p-0.5 rounded-lg border border-[#222]">
            {(
              [
                ['manholes', `Manholes (${network.manholes.length})`],
                ['conduits', `Conduits (${network.conduits.length})`],
                ['pumps', `Lift & Sump (${network.wetWells.length + network.pumps.length})`],
                ['outfalls', `Outfalls (${network.outfalls.length})`],
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

      {/* Grid Content */}
      <div className="flex-1 overflow-auto font-mono text-xs">
        {activeTab === 'manholes' && (
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="bg-[#141414] sticky top-0 text-[#888] text-[11px] font-tech uppercase border-b border-[#222]">
              <tr>
                <th className="p-2 border-r border-[#222]">ID</th>
                <th className="p-2 border-r border-[#222]">Label</th>
                <th className="p-2 border-r border-[#222]">Rim (m MSL)</th>
                <th className="p-2 border-r border-[#222]">Invert (m MSL)</th>
                <th className="p-2 border-r border-[#222]">Depth (m)</th>
                <th className="p-2 border-r border-[#222]">Dia (mm)</th>
                <th className="p-2 border-r border-[#222]">Population</th>
                <th className="p-2 border-r border-[#222]">Peak Flow (L/s)</th>
                <th className="p-2 border-r border-[#222]">HGL Water (m)</th>
                <th className="p-2 border-r border-[#222]">Surcharge Status</th>
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
                    <td className="p-2 text-white border-r border-[#1e1e1e]">{m.label}</td>
                    <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{m.rimElevation.toFixed(2)}</td>
                    <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{m.invertElevation.toFixed(2)}</td>
                    <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{m.depth.toFixed(2)}</td>
                    <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{m.diameterMm}</td>
                    <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{m.population.toLocaleString()}</td>
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
                        className="text-[#666] hover:text-red-400 p-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {activeTab === 'conduits' && (
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-[#141414] sticky top-0 text-[#888] text-[11px] font-tech uppercase border-b border-[#222]">
              <tr>
                <th className="p-2 border-r border-[#222]">ID</th>
                <th className="p-2 border-r border-[#222]">From → To</th>
                <th className="p-2 border-r border-[#222]">Length (m)</th>
                <th className="p-2 border-r border-[#222]">Dia (mm)</th>
                <th className="p-2 border-r border-[#222]">Material</th>
                <th className="p-2 border-r border-[#222]">Slope (%)</th>
                <th className="p-2 border-r border-[#222]">Qfull (L/s)</th>
                <th className="p-2 border-r border-[#222]">Design Q (L/s)</th>
                <th className="p-2 border-r border-[#222]">Fullness (d/D)</th>
                <th className="p-2 border-r border-[#222]">Velocity (m/s)</th>
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
                    <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{c.lengthM.toFixed(1)}</td>
                    <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{c.diameterMm}</td>
                    <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{c.material}</td>
                    <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{(c.slopeMPerM * 100).toFixed(3)}</td>
                    <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{c.fullCapacityLs?.toFixed(1) ?? '-'}</td>
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
                        className="text-[#666] hover:text-red-400 p-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {activeTab === 'pumps' && (
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead className="bg-[#141414] sticky top-0 text-[#888] text-[11px] font-tech uppercase border-b border-[#222]">
              <tr>
                <th className="p-2 border-r border-[#222]">ID</th>
                <th className="p-2 border-r border-[#222]">Type</th>
                <th className="p-2 border-r border-[#222]">Label</th>
                <th className="p-2 border-r border-[#222]">Ground Rim (m)</th>
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
                  <td className="p-2 text-white border-r border-[#1e1e1e]">{w.label}</td>
                  <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{w.rimElevation.toFixed(2)}</td>
                  <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{w.floorElevation.toFixed(2)}</td>
                  <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{w.storageVolumeM3} m³ ({w.diameterM}m Dia)</td>
                  <td className="p-2 text-[#888] border-r border-[#1e1e1e]">-</td>
                  <td className="p-2 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteElement(w.id, 'wet-well');
                      }}
                      className="text-[#666] hover:text-red-400 p-0.5"
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
                  <td className="p-2 text-white border-r border-[#1e1e1e]">{p.label}</td>
                  <td className="p-2 text-[#888] border-r border-[#1e1e1e]">-</td>
                  <td className="p-2 text-[#888] border-r border-[#1e1e1e]">-</td>
                  <td className="p-2 text-white font-bold border-r border-[#1e1e1e]">{p.ratedDischargeLs} L/s</td>
                  <td className="p-2 text-amber-400 font-bold border-r border-[#1e1e1e]">{p.dynamicHeadM} m ({p.powerKw ?? 0} kW)</td>
                  <td className="p-2 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteElement(p.id, 'pump');
                      }}
                      className="text-[#666] hover:text-red-400 p-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'outfalls' && (
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead className="bg-[#141414] sticky top-0 text-[#888] text-[11px] font-tech uppercase border-b border-[#222]">
              <tr>
                <th className="p-2 border-r border-[#222]">ID</th>
                <th className="p-2 border-r border-[#222]">Label</th>
                <th className="p-2 border-r border-[#222]">Latitude</th>
                <th className="p-2 border-r border-[#222]">Longitude</th>
                <th className="p-2 border-r border-[#222]">Invert Elev (m)</th>
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
                  <td className="p-2 text-white border-r border-[#1e1e1e]">{o.label}</td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{o.lat.toFixed(6)}</td>
                  <td className="p-2 text-[#aaa] border-r border-[#1e1e1e]">{o.lng.toFixed(6)}</td>
                  <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{o.invertElevation.toFixed(2)}</td>
                  <td className="p-2 text-[#e5e7eb] border-r border-[#1e1e1e]">{o.receivingWaterElevation.toFixed(2)}</td>
                  <td className="p-2 text-emerald-400 font-bold border-r border-[#1e1e1e]">
                    {o.totalDischargeLs?.toFixed(2) ?? '-'}
                  </td>
                  <td className="p-2 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteElement(o.id, 'outfall');
                      }}
                      className="text-[#666] hover:text-red-400 p-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
