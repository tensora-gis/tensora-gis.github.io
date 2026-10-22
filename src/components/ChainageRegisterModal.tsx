import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChainageRecord } from '../types/hydrology';
import { X, Search, Download, FileSpreadsheet, MapPin } from 'lucide-react';
import { downloadBlob } from '../utils/exportUtils';

interface ChainageRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  chainages: ChainageRecord[];
  activeChainage: number;
  onSelectChainage: (ch: number) => void;
  corridorName: string;
}

const RENDER_LIMIT = 1500;

export const ChainageRegisterModal: React.FC<ChainageRegisterModalProps> = ({
  isOpen,
  onClose,
  chainages,
  activeChainage,
  onSelectChainage,
  corridorName,
}) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    searchRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, input, a[href], [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const filteredChainages = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (term === '') return chainages;
    return chainages.filter((c) => {
      return (
        c.formatted.toLowerCase().includes(term) ||
        c.chainage.toString().includes(term) ||
        c.dmsLat.toLowerCase().includes(term) ||
        c.dmsLng.toLowerCase().includes(term) ||
        (c.decLat ?? c.lat).toFixed(6).includes(term) ||
        (c.decLng ?? c.lng).toFixed(6).includes(term)
      );
    });
  }, [chainages, searchTerm]);

  if (!isOpen) return null;

  const handleExportRegisterExcel = async () => {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const rows: (string | number)[][] = [
      ['CORRIDOR CHAINAGE COORDINATE REGISTER'],
      ['PROJECT / ALIGNMENT', corridorName],
      ['TOTAL POINTS', chainages.length],
      [],
      [
        'Chainage',
        'Formatted Chainage',
        'Latitude (DMS)',
        'Longitude (DMS)',
        'Latitude (DD)',
        'Longitude (DD)',
        'Elevation (m MSL)',
        'Elevation Source',
        'Distance from Start (m)',
      ],
      ...chainages.map((ch) => [
        ch.chainage,
        ch.formatted,
        ch.dmsLat,
        ch.dmsLng,
        ch.decLat ?? ch.lat,
        ch.decLng ?? ch.lng,
        ch.elevation !== undefined && ch.elevation !== null ? ch.elevation : 'Not available',
        ch.elevationSource === 'survey'
          ? 'Survey sheet'
          : ch.elevationSource === 'dem'
            ? 'DEM (30 m)'
            : 'Not available',
        Math.round(ch.distanceFromStartM),
      ]),
    ];
    const ws = wb.addWorksheet('Chainage_Register');
    ws.addRows(rows);
    ws.columns = [
      { width: 14 }, { width: 18 }, { width: 22 }, { width: 22 },
      { width: 15 }, { width: 15 }, { width: 18 }, { width: 16 }, { width: 22 },
    ];

    const buffer = await wb.xlsx.writeBuffer();
    const safeName = (corridorName || 'corridor').replace(/[^a-zA-Z0-9_-]/g, '_') || 'corridor';
    downloadBlob(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${safeName}_Chainages.xlsx`
    );
  };

  const visible = filteredChainages.slice(0, RENDER_LIMIT);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Corridor chainage coordinate register"
        className="bg-[#0a0a0a] border border-[#222] rounded-lg max-w-5xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 bg-[#111] border-b border-[#222] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded bg-[#171717] border border-[#222] flex items-center justify-center text-amber-400 shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-tech">
                Corridor Chainage Coordinate Register
              </h3>
              <p className="text-xs text-[#737373] truncate font-tech">
                Latitude &amp; longitude for every chainage ({chainages.length} stations)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExportRegisterExcel}
              disabled={chainages.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#10b981]/20 hover:bg-[#10b981]/30 border border-[#10b981]/40 text-[#86efac] rounded text-xs font-medium transition-colors disabled:opacity-50 font-tech"
              title="Download the complete register as an Excel workbook"
            >
              <Download className="w-3.5 h-3.5 text-[#10b981]" />
              <span>Export Register</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close register"
              className="p-1.5 text-[#737373] hover:text-white rounded hover:bg-[#171717] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-3 bg-[#111]/60 border-b border-[#222] flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Filter by chainage, latitude or longitude..."
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#222] rounded pl-9 pr-3 py-1.5 text-xs text-[#e5e7eb] placeholder:text-[#737373] focus:outline-none focus:border-amber-500 font-mono-numbers focus-tech font-tech"
            />
          </div>
          <div className="text-xs text-[#737373] tabular-nums shrink-0 font-tech">
            Showing <strong className="text-white">{filteredChainages.length}</strong> of{' '}
            {chainages.length}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2">
          {chainages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MapPin className="w-8 h-8 text-[#4b5563] mb-2" />
              <p className="text-sm text-[#e5e7eb] font-semibold font-tech">No chainage stations</p>
              <p className="text-xs text-[#737373] mt-1 max-w-sm font-tech">
                This corridor was loaded from geometry only, so no stations could be
                derived. Upload a chainage spreadsheet to populate the register.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse font-tech">
              <thead className="sticky top-0 bg-[#0a0a0a] text-[#737373] font-mono text-[11px] uppercase tracking-wider border-b border-[#222] z-10">
                <tr>
                  <th className="py-2.5 px-3">Chainage</th>
                  <th className="py-2.5 px-3">Latitude (DMS)</th>
                  <th className="py-2.5 px-3">Longitude (DMS)</th>
                  <th className="py-2.5 px-3">Latitude (DD)</th>
                  <th className="py-2.5 px-3">Longitude (DD)</th>
                  <th className="py-2.5 px-3">Elevation</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222] font-mono-numbers text-[#d1d5db]">
                {visible.map((ch) => {
                  const isSelected = Math.abs(ch.chainage - activeChainage) < 0.001;
                  const hasElevation =
                    ch.elevation !== undefined && ch.elevation !== null && isFinite(ch.elevation);
                  return (
                    <tr
                      key={ch.id}
                      className={`hover:bg-[#171717]/40 transition-colors ${
                        isSelected ? 'bg-amber-950/20 text-amber-200' : ''
                      }`}
                    >
                      <td className="py-2 px-3 font-semibold text-white">
                        <div className="flex items-center gap-1.5">
                          {isSelected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          )}
                          <span>{ch.formatted}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3">{ch.dmsLat}</td>
                      <td className="py-2 px-3">{ch.dmsLng}</td>
                      <td className="py-2 px-3 text-[#737373]">
                        {(ch.decLat ?? ch.lat).toFixed(6)}°
                      </td>
                      <td className="py-2 px-3 text-[#737373]">
                        {(ch.decLng ?? ch.lng).toFixed(6)}°
                      </td>
                      <td className="py-2 px-3 text-[#737373]">
                        {hasElevation ? (
                          <>
                            {ch.elevation!.toFixed(1)} m
                            <span className="ml-1 text-[9px] text-[#737373]">
                              {ch.elevationSource === 'survey' ? 'survey' : 'DEM'}
                            </span>
                          </>
                        ) : (
                          <span className="text-[#4b5563]">not available</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={() => {
                            onSelectChainage(ch.chainage);
                            onClose();
                          }}
                          className={`px-2.5 py-1 text-[11px] rounded transition-colors font-medium ${
                            isSelected
                              ? 'bg-amber-500 text-[#0a0a0a] font-bold'
                              : 'bg-[#171717] hover:bg-[#171717]/80 hover:border-amber-900/50 text-[#737373] border border-[#222]'
                          } font-tech`}
                        >
                          {isSelected ? 'Active' : 'Delineate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {filteredChainages.length > RENDER_LIMIT && (
            <p className="text-[11px] text-[#737373] py-3 text-center font-tech">
              Showing the first {RENDER_LIMIT} matches. Use the search box to narrow the
              list, or export the register for the complete set.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
