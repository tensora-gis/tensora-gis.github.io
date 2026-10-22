import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CorridorAlignment, HydrologyReport, HydrologyRunFailure, ChainageRecord } from '../types/hydrology';
import { ReportCard } from './ReportCard';
import {
  readKmlOrKmzFile,
  parseKMLString,
  parseChainageFile,
  extractChainageFromString,
} from '../utils/fileParsers';
import { parseCoordinateInput, isValidLat, isValidLng } from '../utils/geoUtils';
import { REFERENCE_CORRIDOR_NOTICE } from '../data/defaultSample';
import {
  UploadCloud,
  FileCode,
  FileSpreadsheet,
  Search,
  CheckCircle2,
  AlertTriangle,
  Play,
  ListOrdered,
  Layers,
  Trash2,
  MapPin,
  Ruler,
} from 'lucide-react';

type TargetMode = 'chainage' | 'coordinates';

interface InputPanelProps {
  report: HydrologyReport | null;
  failure: HydrologyRunFailure | null;
  alignment: CorridorAlignment | null;
  onSelectChainage: (ch: number) => void;
  onSelectCoordinates: (lat: number, lng: number) => void;
  onAlignmentUpdated: (alignment: CorridorAlignment) => void;
  onChainagesUpdated: (records: ChainageRecord[], fileName?: string) => void;
  isLoading: boolean;
  onOpenRegister: () => void;
  onClearData: () => void;
  onLoadDemo: () => void;
  onUpdateReport?: (updated: HydrologyReport) => void;
}

const MAX_CHIP_COUNT = 120;

export const InputPanel: React.FC<InputPanelProps> = ({
  report,
  failure,
  alignment,
  onSelectChainage,
  onSelectCoordinates,
  onAlignmentUpdated,
  onChainagesUpdated,
  isLoading,
  onOpenRegister,
  onClearData,
  onLoadDemo,
  onUpdateReport,
}) => {
  const [mode, setMode] = useState<TargetMode>('chainage');
  const [typedChainage, setTypedChainage] = useState<string>('');
  const [typedLat, setTypedLat] = useState<string>('');
  const [typedLng, setTypedLng] = useState<string>('');
  const [stationFilter, setStationFilter] = useState<string>('');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = useCallback((type: 'success' | 'error', message: string, ttl = 5000) => {
    setFeedback({ type, message });
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), ttl);
  }, []);

  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
  }, []);

  useEffect(() => {
    if (report) {
      setTypedChainage(report.targetChainage ? String(report.targetChainage) : '');
    }
  }, [report]);

  const handleChainageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const chNum = extractChainageFromString(typedChainage);
    if (chNum === null) {
      showFeedback(
        'error',
        'Enter a chainage as a plain number, or in station form (for example 69340.000 or 69+340).',
        4000
      );
      return;
    }
    onSelectChainage(chNum);
  };

  const handleCoordinateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseCoordinateInput(typedLat);
    const lng = parseCoordinateInput(typedLng);

    if (lat === null || !isValidLat(lat)) {
      showFeedback('error', 'Latitude could not be read. Use decimal degrees or DMS.', 4000);
      return;
    }
    if (lng === null || !isValidLng(lng)) {
      showFeedback('error', 'Longitude could not be read. Use decimal degrees or DMS.', 4000);
      return;
    }

    if (alignment && alignment.coordinates.length >= 2) {
      showFeedback('success', 'Locating the nearest chainage on the corridor...', 3000);
    }
    onSelectCoordinates(lat, lng);
  };

  const handleKmlOrKmzUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      showFeedback('success', `Reading ${file.name}...`, 30000);
      const kmlText = await readKmlOrKmzFile(file);
      const parsed = parseKMLString(kmlText, file.name);

      if (parsed.coordinates.length === 0 && parsed.chainages.length === 0) {
        throw new Error('No coordinates or placemarks found in the file.');
      }

      await onAlignmentUpdated(parsed);
      showFeedback(
        'success',
        `Loaded ${file.name}: ${parsed.chainages.length} stations ` +
          `(${parsed.startChainage.toFixed(0)} m to ${parsed.endChainage.toFixed(0)} m).`
      );
    } catch (err) {
      console.error('KML/KMZ load error:', err);
      showFeedback(
        'error',
        `Could not open ${file.name}: ${(err as Error).message || 'check the file structure'}`,
        8000
      );
    }
  };

  const handleChainageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      const isText = /\.(csv|txt|tsv)$/i.test(file.name);
      const records = isText
        ? await parseChainageFile(await file.text(), alignment ?? undefined)
        : await parseChainageFile(await file.arrayBuffer(), alignment ?? undefined);

      if (records.length === 0) {
        showFeedback(
          'error',
          `No chainage rows could be identified in ${file.name}. ` +
            `A chainage column, or coordinates that can be projected onto a corridor, is required.`,
          8000
        );
        return;
      }

      await onChainagesUpdated(records, file.name);
      showFeedback('success', `Loaded ${records.length} chainages from ${file.name}.`);
    } catch (err) {
      console.error('Chainage upload error:', err);
      showFeedback('error', `Failed to read ${file.name}: ${(err as Error).message}`, 8000);
    }
  };

  const filterTerm = stationFilter.trim().toLowerCase();
  const filteredStations = alignment
    ? filterTerm === ''
      ? alignment.chainages
      : alignment.chainages.filter(
          (c) =>
            c.formatted.toLowerCase().includes(filterTerm) ||
            c.chainage.toString().includes(filterTerm) ||
            c.dmsLat.toLowerCase().includes(filterTerm) ||
            c.dmsLng.toLowerCase().includes(filterTerm)
        )
    : [];

  const chips = filteredStations.slice(0, MAX_CHIP_COUNT);

  return (
    <div className="w-full md:w-[460px] bg-[#0a0a0a] border-r border-[#222] flex flex-col h-full overflow-y-auto select-none shrink-0">
      {/* 1. File ingestion */}
      <div className="p-4 border-b border-[#222] bg-[#111]/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#737373] flex items-center gap-1.5 font-tech">
            <UploadCloud className="w-3.5 h-3.5 text-amber-400" />
            <span>{alignment ? 'Corridor Files' : 'Upload Corridor Data'}</span>
          </span>
          {alignment && (
            <button
              onClick={onClearData}
              className="text-[10px] text-[#737373] hover:text-[#ef4444] flex items-center gap-1 transition-colors"
              title="Clear all data"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clean</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col items-center justify-center p-3 rounded border-2 border-dashed border-[#222] hover:border-amber-500 bg-[#171717] hover:bg-[#171717]/80 cursor-pointer transition-colors group text-center focus-within:border-amber-500">
            <FileCode className="w-5 h-5 text-amber-400 mb-1 group-hover:scale-105 transition-transform" />
            <span className="text-xs font-bold text-white font-tech">Upload KML / KMZ</span>
            <span className="text-[10px] text-[#737373] truncate max-w-[150px] mt-0.5">
              {alignment?.filename ? alignment.filename : 'Corridor alignment'}
            </span>
            <input
              type="file"
              accept=".kml,.kmz,.xml"
              onChange={handleKmlOrKmzUpload}
              className="sr-only"
              aria-label="Upload corridor KML or KMZ file"
            />
          </label>

          <label className="flex flex-col items-center justify-center p-3 rounded border border-dashed border-[#333] hover:border-[#737373] bg-[#171717] hover:bg-[#171717]/80 cursor-pointer transition-colors group text-center focus-within:border-amber-500">
            <FileSpreadsheet className="w-5 h-5 text-[#737373] group-hover:text-[#10b981] mb-1" />
            <span className="text-xs font-medium text-[#737373] font-tech">Chainage Sheet</span>
            <span className="text-[10px] text-[#737373] truncate max-w-[150px] mt-0.5">
              {alignment?.chainages?.length
                ? `${alignment.chainages.length} stations loaded`
                : 'CSV / XLSX / XLS'}
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.tsv,.txt"
              onChange={handleChainageFileUpload}
              className="sr-only"
              aria-label="Upload chainage CSV or XLSX file"
            />
          </label>
        </div>

        {!alignment && (
          <div className="mt-3 p-3 bg-[#111] border border-[#222] rounded text-xs text-[#737373]">
            <div className="flex items-center gap-1.5 font-semibold text-[#e5e7eb] mb-1">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>No project loaded</span>
            </div>
            <p className="text-[11px] text-[#737373] mb-2 leading-relaxed">
              Upload a KML/KMZ alignment or a chainage spreadsheet. Coordinates are
              projected perpendicularly onto the alignment, and every station gets its
              latitude and longitude resolved.
            </p>
            <div className="pt-2 border-t border-[#222] flex items-center justify-between gap-2">
              <span className="text-[10px] text-[#737373]">Want to see it work first?</span>
              <button
                type="button"
                onClick={onLoadDemo}
                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium transition-colors whitespace-nowrap font-tech"
              >
                <MapPin className="w-3 h-3" />
                <span>Load Demo</span>
              </button>
            </div>
            <p className="text-[10px] text-[#737373] mt-2 italic leading-relaxed">
              {REFERENCE_CORRIDOR_NOTICE}
            </p>
          </div>
        )}

        {feedback && (
          <div
            role="status"
            className={`mt-2.5 p-2 rounded text-[11px] flex items-start gap-1.5 transition-all ${
              feedback.type === 'success'
                ? 'bg-[#111] border border-amber-900/60 text-amber-200'
                : 'bg-[#111] border border-red-900/60 text-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-px" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-[#ef4444] shrink-0 mt-px" />
            )}
            <span className="font-tech">{feedback.message}</span>
          </div>
        )}
      </div>

      {/* 2. Target selection: chainage OR direct latitude/longitude */}
      {alignment && (
        <div className="p-4 border-b border-[#222] bg-[#111]/60">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5 font-tech">
              {mode === 'chainage' ? (
                <Search className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>{mode === 'chainage' ? 'Target Chainage' : 'Target Coordinates'}</span>
            </span>
            <span className="text-[10px] text-[#737373] font-mono tabular-nums">
              {alignment.startChainage.toFixed(0)} m – {alignment.endChainage.toFixed(0)} m
            </span>
          </div>

          <div className="flex gap-1 mb-2 p-0.5 bg-[#0a0a0a] rounded border border-[#222]">
            {(
              [
                ['chainage', 'By Chainage', Ruler],
                ['coordinates', 'By Lat / Long', MapPin],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  mode === value
                    ? 'bg-amber-500 text-[#0a0a0a] font-bold'
                    : 'text-[#737373] hover:text-[#e5e7eb]'
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {mode === 'chainage' ? (
            <form onSubmit={handleChainageSubmit} className="flex flex-col gap-2">
              <p className="text-[11px] text-[#737373]">
                Enter a chainage to delineate the upstream catchment at that station.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={typedChainage}
                  onChange={(e) => setTypedChainage(e.target.value)}
                  placeholder="e.g. 69340 or 69+340"
                  aria-label="Target chainage"
                  className="flex-1 bg-[#0a0a0a] border-2 border-[#222] focus:border-amber-500 rounded px-3.5 py-2 text-base text-white tabular-nums font-bold focus:outline-none shadow-inner focus-tech"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 active:bg-[#d97706] text-[#0a0a0a] font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-sm whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isLoading ? 'Tracing...' : 'Delineate'}</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCoordinateSubmit} className="flex flex-col gap-2">
              <p className="text-[11px] text-[#737373]">
                Enter a point directly, in decimal degrees or DMS. With a corridor loaded
                the nearest chainage on the alignment is identified automatically.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="target-lat"
                    className="block text-[10px] uppercase tracking-wider text-[#737373] mb-1 font-tech"
                  >
                    Latitude
                  </label>
                  <input
                    id="target-lat"
                    type="text"
                    value={typedLat}
                    onChange={(e) => setTypedLat(e.target.value)}
                    placeholder={'27.244844 or 27°14\'41.44"N'}
                    className="w-full bg-[#0a0a0a] border-2 border-[#222] focus:border-amber-500 rounded px-3 py-2 text-sm text-white font-mono-numbers focus:outline-none shadow-inner focus-tech"
                  />
                </div>
                <div>
                  <label
                    htmlFor="target-lng"
                    className="block text-[10px] uppercase tracking-wider text-[#737373] mb-1 font-tech"
                  >
                    Longitude
                  </label>
                  <input
                    id="target-lng"
                    type="text"
                    value={typedLng}
                    onChange={(e) => setTypedLng(e.target.value)}
                    placeholder={'77.825867 or 77°49\'33.12"E'}
                    className="w-full bg-[#0a0a0a] border-2 border-[#222] focus:border-amber-500 rounded px-3 py-2 text-sm text-white font-mono-numbers focus:outline-none shadow-inner focus-tech"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 active:bg-[#d97706] text-[#0a0a0a] font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isLoading ? 'Tracing...' : 'Locate & Delineate'}</span>
              </button>
            </form>
          )}

          {alignment.chainages.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] text-[#737373]">
                <span className="font-tech">Loaded stations ({alignment.chainages.length})</span>
                <button
                  type="button"
                  onClick={onOpenRegister}
                  className="text-amber-400 hover:underline flex items-center gap-1 tabular-nums text-[10px] font-tech"
                >
                  <ListOrdered className="w-3 h-3" />
                  <span>Open full coordinate register</span>
                </button>
              </div>

              {alignment.chainages.length > 10 && (
                <div className="relative">
                  <Search className="w-3 h-3 text-[#737373] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filter by chainage or DMS..."
                    value={stationFilter}
                    onChange={(e) => setStationFilter(e.target.value)}
                    aria-label="Filter stations"
                    className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 pl-7 py-1 text-[11px] text-[#e5e7eb] placeholder:text-[#737373] focus:outline-none focus:border-amber-500 font-mono-numbers focus-tech"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto py-1 pr-1">
                {chips.map((ch) => {
                  const isCurrent =
                    report !== null && Math.abs(ch.chainage - report.targetChainage) < 0.1;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        setTypedChainage(ch.chainage.toString());
                        onSelectChainage(ch.chainage);
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] tabular-nums transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-amber-500 text-[#0a0a0a] font-bold border border-amber-400 shadow-sm'
                          : 'bg-[#171717] hover:bg-[#171717]/80 text-[#e5e7eb] border border-[#222] hover:border-[#737373]'
                      }`}
                    >
                      {ch.formatted}
                    </button>
                  );
                })}
                {filteredStations.length === 0 && (
                  <div className="text-[11px] text-[#737373] py-1">
                    No stations match &ldquo;{stationFilter}&rdquo;
                  </div>
                )}
                {filteredStations.length > MAX_CHIP_COUNT && (
                  <div className="text-[10px] text-[#737373] py-1 self-center">
                    Showing first {MAX_CHIP_COUNT} of {filteredStations.length} — use the
                    register for the full list.
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* 3. Scope status, failure notice, and the hydrology report */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        {failure && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#fca5a5]"
          >
            <div className="flex items-center gap-1.5 font-bold text-xs mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-[#ef4444]" />
              <span>Delineation could not be completed</span>
            </div>
            <p className="text-[11px] leading-relaxed">{failure.message}</p>
            <p className="text-[10px] mt-2 pt-2 border-t border-[#ef4444]/20 text-[#fca5a5]/80 leading-relaxed">
              No catchment figures are reported for this station. Elevations are never
              substituted with assumed values.
            </p>
          </div>
        )}

        {report && (
          <div
            className={`p-2.5 rounded-lg border text-[11px] ${
              report.scopeExpandedDueToFlatRelief
                ? 'bg-[#451a03]/30 border-[#78350f]/50 text-[#fdba74]'
                : 'bg-[#111]/70 border-[#222] text-[#d1d5db]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold uppercase tracking-wider text-[10px] font-tech">
                Analysis scope: {report.scopeAppliedM} m
              </span>
              {report.scopeExpandedDueToFlatRelief && (
                <span className="px-1.5 py-0.5 rounded bg-[#78350f]/40 text-[9px] font-bold uppercase text-[#fdba74]">
                  Auto-expanded
                </span>
              )}
            </div>
            <p className="mt-1 leading-relaxed">
              {report.scopeExpandedDueToFlatRelief
                ? `Relief across the 500 m scope was ${report.reliefWithinScopeM} m, below the 5 m threshold, so the scope was automatically widened to ${report.scopeAppliedM} m.`
                : `Relief across the ${report.scopeAppliedM} m scope was ${report.reliefWithinScopeM} m, meeting the 5 m threshold.`}
            </p>
            {!report.meetsReliefThreshold && (
              <p className="mt-1.5 pt-1.5 border-t border-[#78350f]/30 text-[#fdba74]/90">
                Note: relief inside the delineated catchment is {report.elevationDropM} m,
                which is below the 5 m design threshold even at the expanded scope. The
                catchment is real but may be truncated at the scope boundary.
              </p>
            )}
          </div>
        )}

        <ReportCard
          report={report}
          alignment={alignment || undefined}
          isLoading={isLoading}
          onUpdateReport={onUpdateReport}
        />
      </div>
    </div>
  );
};
