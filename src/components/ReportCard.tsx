import React, { useMemo, useState } from 'react';
import { HydrologyReport, CorridorAlignment } from '../types/hydrology';
import { exportKML, exportExcelReport } from '../utils/exportUtils';
import {
  Download,
  FileSpreadsheet,
  Waves,
  ExternalLink,
  Edit3,
  Check,
  Activity,
  Layers,
  AlertTriangle,
} from 'lucide-react';

interface ReportCardProps {
  report: HydrologyReport | null;
  alignment?: CorridorAlignment;
  isLoading?: boolean;
  onUpdateReport?: (updated: HydrologyReport) => void;
}

const numberFmt = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(digits);

export const ReportCard: React.FC<ReportCardProps> = ({
  report,
  alignment,
  isLoading,
  onUpdateReport,
}) => {
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibOrigin, setCalibOrigin] = useState('');
  const [calibHighest, setCalibHighest] = useState('');
  const [activeTab, setActiveTab] = useState<'table' | 'profile'>('table');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleApplyCalibration = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateReport || !report) return;

    const newOrigin = parseFloat(calibOrigin);
    const newHighest = parseFloat(calibHighest);
    if (!isFinite(newOrigin) || !isFinite(newHighest)) return;

    const drop = Math.round((newHighest - newOrigin) * 10) / 10;
    const streamLengthM = report.lengthOfStreamKm * 1000;
    const slope =
      streamLengthM > 0 ? Math.round((drop / streamLengthM) * 10000) / 100 : null;

    const L = Math.max(0.05, report.lengthOfStreamKm);
    const H = Math.max(0.1, drop);
    const tc = Math.round(Math.pow((0.87 * Math.pow(L, 3)) / H, 0.385) * 100) / 100;

    onUpdateReport({
      ...report,
      levelStreamOriginM: newOrigin,
      highestContourM: newHighest,
      elevationDropM: drop,
      meetsReliefThreshold: drop >= 5,
      streamSlopePercent: slope,
      timeOfConcentrationHours: drop > 0 ? tc : null,
      elevationOriginKind: 'survey',
      notes:
        `Level stream origin and highest contour supplied as surveyed reduced levels ` +
        `(Δh = ${drop} m). Catchment geometry was delineated from the DEM and is unchanged.`,
    });
    setIsCalibrating(false);
  };

  const profile = useMemo(() => report?.elevationProfile ?? [], [report]);
  const profileStats = useMemo(() => {
    if (profile.length === 0) return null;
    let minD = Infinity;
    let maxD = -Infinity;
    let minE = Infinity;
    let maxE = -Infinity;
    for (const p of profile) {
      if (p.distanceM < minD) minD = p.distanceM;
      if (p.distanceM > maxD) maxD = p.distanceM;
      if (p.elevationM < minE) minE = p.elevationM;
      if (p.elevationM > maxE) maxE = p.elevationM;
    }
    return { minD, maxD, minE, maxE };
  }, [profile]);

  if (isLoading) {
    return (
      <div className="bg-[#111] border border-[#222] rounded-lg p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
        <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
        <div className="text-sm font-semibold text-white font-tech">
          Sampling terrain &amp; routing flow
        </div>
        <div className="text-xs text-[#737373] mt-1 max-w-xs font-tech">
          Downloading global DEM samples for the analysis grid, then running D8 flow
          routing to derive the upstream contributing area. This may take up to a minute
          on first use while the DEM is downloaded and cached.
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="bg-[#111]/60 border border-[#222] rounded-lg p-6 text-center text-[#737373] text-xs flex flex-col items-center justify-center min-h-[220px] font-tech">
        <Waves className="w-8 h-8 text-[#4b5563] mb-2" />
        <div className="font-semibold text-[#e5e7eb] mb-1">No delineation active</div>
        <div className="text-[11px] text-[#737373] max-w-xs">
          Upload a corridor KML/KMZ, then enter a target chainage or coordinates to
          delineate the upstream catchment.
        </div>
      </div>
    );
  }

  const earthUrl =
    report.crossVerifyGoogleEarthUrl ??
    `https://earth.google.com/web/@${report.latitudeDD},${report.longitudeDD},${report.levelStreamOriginM}a,2500d,35y,0h,0t,0r`;

  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    setExportError(null);
    try {
      await exportExcelReport(report, alignment);
    } catch (err) {
      console.error('Excel export failed:', err);
      setExportError(
        `Excel export failed: ${(err as Error).message || 'unknown error'}. The report has not been downloaded.`
      );
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportKml = () => {
    try {
      exportKML(report, alignment);
    } catch (err) {
      console.error('KML export failed:', err);
      setExportError(`KML export failed: ${(err as Error).message || 'unknown error'}.`);
    }
  };

  const row = (
    label: string,
    value: React.ReactNode,
    aside?: React.ReactNode,
    valueClass = 'text-white'
  ) => (
    <tr className="border-b border-[#222] hover:bg-[#171717]/40 transition-colors">
      <td className="py-2.5 px-4 font-mono font-bold text-xs uppercase tracking-wide text-[#737373] border-r border-[#222]">
        {label}
      </td>
      <td className={`py-2.5 px-4 tabular-nums font-semibold text-sm ${valueClass}`}>
        {value}
        {aside && <span className="text-[10px] text-[#737373] font-normal ml-2">{aside}</span>}
      </td>
    </tr>
  );

  return (
    <div className="bg-[#0a0a0a] border border-[#222] rounded-lg overflow-hidden shadow-2xl flex flex-col">
      <div className="bg-[#111]/90 border-b border-[#222] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Waves className="w-4 h-4 text-amber-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-white font-tech">
            Catchment &amp; Hydrology Report
          </h2>
        </div>
        <span className="text-[11px] tabular-nums px-2 py-0.5 rounded bg-amber-950/20 border border-amber-900/50 text-amber-300 font-semibold font-tech">
          CH: {report.targetChainageFormatted}
        </span>
      </div>

      <div
        className={`px-4 py-2 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b ${
          report.meetsReliefThreshold
            ? 'bg-[#111] border-[#222] text-[#d1d5db]'
            : 'bg-[#451a03]/20 border-[#78350f]/40 text-[#fdba74]'
        }`}
      >
        <div className="flex items-start gap-1.5">
          {report.meetsReliefThreshold ? (
            <Check className="w-3.5 h-3.5 text-[#10b981] shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          )}
          <span className="font-tech">
            Δh = <strong>{report.elevationDropM} m</strong>
            {report.meetsReliefThreshold
              ? ' — meets the 5 m design threshold.'
              : ' — below the 5 m design threshold; the catchment may be truncated at the scope boundary.'}
          </span>
        </div>
        <a
          href={earthUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 hover:underline font-medium whitespace-nowrap font-tech"
          title="Open this location in Google Earth to compare the terrain visually"
        >
          <span>Cross-verify in Google Earth</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="px-4 py-1.5 bg-[#111]/80 border-b border-[#222] flex items-center justify-between gap-2 text-[11px] text-[#737373] font-tech">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[#737373] shrink-0">Source:</span>
          <span className="text-[#e5e7eb] truncate">
            {report.elevationSource || 'Not recorded'}
          </span>
          <span className="text-[#737373] shrink-0">
            · origin {report.elevationOriginKind === 'survey' ? 'survey sheet' : 'DEM'}
          </span>
        </div>
        {onUpdateReport && (
          <button
            type="button"
            onClick={() => {
              setCalibOrigin(String(report.levelStreamOriginM));
              setCalibHighest(String(report.highestContourM));
              setIsCalibrating((v) => !v);
            }}
            className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[10px] font-medium shrink-0 font-tech"
          >
            <Edit3 className="w-3 h-3" />
            <span>{isCalibrating ? 'Cancel' : 'Apply Survey RL'}</span>
          </button>
        )}
      </div>

      {isCalibrating && (
        <form
          onSubmit={handleApplyCalibration}
          className="p-3 bg-[#111] border-b border-amber-900/40 flex flex-col gap-2 text-xs font-tech"
        >
          <div className="text-[11px] font-semibold text-amber-300">
            Surveyed reduced levels (m MSL)
          </div>
          <p className="text-[10px] text-[#737373] leading-relaxed">
            Enter the benchmark levels exactly as surveyed. They are recorded as
            given — a drop under 5 m is reported as such rather than adjusted.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="calib-origin" className="text-[10px] text-[#737373] block mb-0.5">
                Level Stream Origin (m MSL)
              </label>
              <input
                id="calib-origin"
                type="number"
                step="0.01"
                value={calibOrigin}
                onChange={(e) => setCalibOrigin(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2 py-1 text-xs tabular-nums text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label htmlFor="calib-highest" className="text-[10px] text-[#737373] block mb-0.5">
                Highest Contour (m MSL)
              </label>
              <input
                id="calib-highest"
                type="number"
                step="0.01"
                value={calibHighest}
                onChange={(e) => setCalibHighest(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2 py-1 text-xs tabular-nums text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>
          </div>
          {(() => {
            const o = parseFloat(calibOrigin);
            const h = parseFloat(calibHighest);
            const below = isFinite(o) && isFinite(h) && h - o < 5;
            return below ? (
              <p className="text-[10px] text-[#fdba74] bg-[#451a03]/20 border border-[#78350f]/40 rounded px-2 py-1 font-tech">
                These levels give Δh = {(h - o).toFixed(1)} m, below the 5 m design
                threshold. The values will still be applied as entered.
              </p>
            ) : null;
          })()}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCalibrating(false)}
              className="px-2.5 py-1 rounded bg-[#171717] hover:bg-[#171717]/80 text-[#e5e7eb] text-[11px] font-tech"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-[#0a0a0a] font-bold text-[11px] flex items-center gap-1 font-tech"
            >
              <Check className="w-3 h-3" />
              <span>Apply Levels</span>
            </button>
          </div>
        </form>
      )}

      <div className="px-4 pt-3 flex gap-2 border-b border-[#222]/80 bg-[#0a0a0a] text-xs font-tech">
        {(
          [
            ['table', 'Hydrology Table', Layers],
            ['profile', 'Elevation Profile', Activity],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveTab(value)}
            aria-pressed={activeTab === value}
            className={`pb-2 px-1 font-semibold transition-colors flex items-center gap-1.5 border-b-2 ${
              activeTab === value
                ? 'border-amber-500 text-amber-300'
                : 'border-transparent text-[#737373] hover:text-[#e5e7eb]'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'table' && (
        <div className="p-4 bg-[#0a0a0a]">
          <div className="border-2 border-[#222] rounded overflow-hidden bg-[#111]/70">
            <table className="w-full text-left border-collapse">
              <tbody>
                {row(
                  'LATITUDE :',
                  report.latitudeDMS,
                  `(${report.latitudeDD.toFixed(6)}°)`,
                  'text-amber-300'
                )}
                {row(
                  'LONGITUDE :',
                  report.longitudeDMS,
                  `(${report.longitudeDD.toFixed(6)}°)`,
                  'text-amber-300'
                )}
                {row(
                  'CATCHMENT AREA (A):',
                  <>
                    {report.catchmentAreaKm2}{' '}
                    <span className="text-xs font-normal text-[#737373]">km²</span>
                  </>,
                  `(${(report.catchmentAreaKm2 * 100).toFixed(2)} ha)`
                )}
                {row(
                  'LENGTH OF STREAM (L):',
                  <>
                    {report.lengthOfStreamKm}{' '}
                    <span className="text-xs font-normal text-[#737373]">km</span>
                  </>,
                  `(${Math.round(report.lengthOfStreamKm * 1000)} m along channel)`
                )}
                {row(
                  'LEVEL STREAM ORIGIN:',
                  <>
                    {report.levelStreamOriginM}{' '}
                    <span className="text-xs font-normal text-[#737373]">m MSL</span>
                  </>,
                  `(${
                    report.elevationOriginKind === 'survey'
                      ? 'survey sheet'
                      : 'sampled from DEM'
                  })`
                )}
                <tr className="hover:bg-[#171717]/40 transition-colors">
                  <td className="py-2.5 px-4 font-mono font-bold text-xs uppercase tracking-wide text-[#737373] border-r border-[#222]">
                    HIGHEST CONTOUR:
                  </td>
                  <td className="py-2.5 px-4 tabular-nums font-semibold text-sm text-[#e5e7eb]">
                    {report.highestContourM}{' '}
                    <span className="text-xs font-normal text-[#737373]">m MSL</span>
                    <span
                      className={`text-[10px] font-mono ml-2 font-normal ${
                        report.meetsReliefThreshold ? 'text-[#10b981]' : 'text-amber-400'
                      }`}
                    >
                      (Δh = {report.elevationDropM} m
                      {report.meetsReliefThreshold ? '' : ' — below 5 m'})
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="p-4 bg-[#0a0a0a] flex flex-col gap-2">
          <div className="text-[11px] text-[#737373] flex items-center justify-between font-tech">
            <span>Longitudinal profile of the delineated channel</span>
            <span className="tabular-nums text-[10px] text-amber-400">
              Δz = {report.elevationDropM} m
            </span>
          </div>

          <div className="w-full h-36 bg-[#111] border border-[#222] rounded p-2 relative flex flex-col justify-between">
            {profileStats && profile.length >= 2 ? (
              <svg
                className="w-full h-full overflow-visible"
                viewBox="0 0 400 100"
                preserveAspectRatio="none"
                role="img"
                aria-label="Channel elevation profile"
              >
                <line x1="0" y1="20" x2="400" y2="20" stroke="#334155" strokeDasharray="3 3" strokeWidth="0.5" />
                <line x1="0" y1="50" x2="400" y2="50" stroke="#334155" strokeDasharray="3 3" strokeWidth="0.5" />
                <line x1="0" y1="80" x2="400" y2="80" stroke="#334155" strokeDasharray="3 3" strokeWidth="0.5" />

                {(() => {
                  const span = Math.max(1, profileStats.maxD - profileStats.minD);
                  const range = Math.max(0.1, profileStats.maxE - profileStats.minE);
                  const pts = profile.map((p) => {
                    const x = ((p.distanceM - profileStats.minD) / span) * 400;
                    const y = 90 - ((p.elevationM - profileStats.minE) / range) * 75;
                    return `${x.toFixed(2)},${y.toFixed(2)}`;
                  });
                  return (
                    <>
                      <polygon points={`0,100 ${pts.join(' ')} 400,100`} fill="rgba(6,182,212,0.15)" />
                      <polyline points={pts.join(' ')} fill="none" stroke="#06b6d4" strokeWidth="2.5" />
                    </>
                  );
                })()}
              </svg>
            ) : (
              <div className="text-center text-xs text-[#737373] m-auto font-tech">
                No profile samples were resolved for this channel.
              </div>
            )}
          </div>

          <div className="flex justify-between text-[10px] tabular-nums text-[#737373] px-1 font-tech">
            <span>Origin: {report.levelStreamOriginM} m MSL</span>
            <span>Head: {report.highestContourM} m MSL</span>
          </div>
        </div>
      )}

      <div className="px-4 pb-3 grid grid-cols-3 gap-2 text-[11px] tabular-nums text-[#737373] font-tech">
        <div className="p-2 rounded bg-[#111] border border-[#222] flex flex-col">
          <span className="text-[10px] text-[#737373] uppercase">Thalweg slope</span>
          <span className="text-[#e5e7eb] font-semibold">
            {report.streamSlopePercent === null || report.streamSlopePercent === undefined
              ? '—'
              : `${report.streamSlopePercent}%`}
          </span>
        </div>
        <div className="p-2 rounded bg-[#111] border border-[#222] flex flex-col">
          <span className="text-[10px] text-[#737373] uppercase">Kirpich tc</span>
          <span className="text-[#e5e7eb] font-semibold">
            {report.timeOfConcentrationHours === null ||
            report.timeOfConcentrationHours === undefined
              ? '—'
              : `${report.timeOfConcentrationHours} h`}
          </span>
        </div>
        <div className="p-2 rounded bg-[#111] border border-[#222] flex flex-col">
          <span className="text-[10px] text-[#737373] uppercase">DEM coverage</span>
          <span className="text-[#e5e7eb] font-semibold">
            {numberFmt(report.demCoverage * 100, 1)}%
          </span>
        </div>
      </div>

      <div className="px-4 pb-3 text-[10px] text-[#737373] leading-relaxed border-t border-[#222]/80 pt-2 font-tech">
        <div>
          {report.flowArrivesAtCrossing ? (
            <>
              Stormwater reaches this chainage
              {report.flowArrivalBearingDeg !== null && (
                <> from bearing {report.flowArrivalBearingDeg}°</>
              )}
              . The head of the watercourse is the highest ground within 1 km that drains
              here — {report.streamHeadElevationM} m MSL, {report.headDistanceM} m away.
              {report.contributingCells} natural-ground cells at {report.analysisCellSizeM} m
              spacing contribute; the formation is excluded because it is impervious.
            </>
          ) : (
            <>No watercourse was found draining to this chainage, so no catchment is claimed.</>
          )}
        </div>
        {report.notes && <div className="mt-1 opacity-80">{report.notes}</div>}
      </div>

      {exportError && (
        <div role="alert" className="mx-4 mb-2 p-2 rounded bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#fca5a5] text-[11px]">
          {exportError}
        </div>
      )}

      <div className="p-4 pt-1 bg-[#0a0a0a] flex flex-col sm:flex-row gap-2 border-t border-[#222]/80">
        <button
          onClick={handleExportKml}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 border border-[#ef4444]/40 hover:border-[#ef4444] text-[#fca5a5] rounded text-xs font-semibold transition-all shadow-sm group font-tech"
          title="Download a Google Earth KML with the yellow placemark, red stream, cyan catchment, contours and alignment"
        >
          <Download className="w-3.5 h-3.5 text-[#ef4444] group-hover:scale-105 transition-transform" />
          <span>Export KML</span>
        </button>

        <button
          disabled={isExportingExcel}
          onClick={() => void handleExportExcel()}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-[#10b981]/10 hover:bg-[#10b981]/20 border border-[#10b981]/40 hover:border-[#10b981] text-[#86efac] rounded text-xs font-semibold transition-all shadow-sm group disabled:opacity-50 font-tech"
          title="Download a three-sheet workbook: hydrology summary, complete chainage register, and catchment boundary vertices"
        >
          <FileSpreadsheet
            className={`w-3.5 h-3.5 text-[#10b981] ${
              isExportingExcel ? 'animate-pulse' : 'group-hover:scale-105'
            } transition-transform`}
          />
          <span>{isExportingExcel ? 'Building...' : 'Export Excel (.xlsx)'}</span>
        </button>
      </div>
    </div>
  );
};
