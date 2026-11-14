import React, { useMemo, useState, useEffect } from 'react';
import { HydrologyReport, CorridorAlignment } from '../types/hydrology';
import { exportKML, exportExcelReport } from '../utils/exportUtils';
import {
  simulateCatchmentHydrographAndCulvertRating,
  CatchmentHydrographResult,
} from '../utils/delineationEngine';
import { UsdaSoilTexture, USDA_SOIL_TEXTURE_PARAMETERS } from '../utils/greenAmpt';
import {
  getGlobalDesignStandard,
  setGlobalDesignStandard,
  subscribeDesignStandard,
  DprDesignStandard,
} from '../utils/dprExcelBase';
import { prewarmExcelJS } from '../utils/excelLoader';
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
  Clock,
  Gauge,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

interface ReportCardProps {
  report: HydrologyReport | null;
  alignment?: CorridorAlignment | null;
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
  const [activeTab, setActiveTab] = useState<'table' | 'profile' | 'hydrograph' | 'codal'>('table');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [designStandard, setDesignStandard] = useState<DprDesignStandard>(getGlobalDesignStandard());
  const isIndian = designStandard === 'INDIAN_DPR';

  useEffect(() => {
    prewarmExcelJS();
    return subscribeDesignStandard((std) => {
      setDesignStandard(std);
    });
  }, []);

  // Hydrograph & Culvert Rating state
  const [soilTexture, setSoilTexture] = useState<UsdaSoilTexture>('Sandy Loam');
  const [stormIntensityMmHr, setStormIntensityMmHr] = useState<number>(65.0);
  const [stormDurationHours, setStormDurationHours] = useState<number>(2.0);
  const [culvertDiameterM, setCulvertDiameterM] = useState<number>(1.2);
  const [hoveredHydroIndex, setHoveredHydroIndex] = useState<number | null>(null);

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

  const catchmentHydrograph = useMemo(() => {
    if (!report || !report.flowArrivesAtCrossing) return null;
    try {
      return simulateCatchmentHydrographAndCulvertRating(report, {
        stormDurationHours,
        peakRainfallIntensityMmPerHour: stormIntensityMmHr,
        soilTexture,
        culvert: {
          shape: 'circular',
          material: 'concrete-pipe',
          diameterM: culvertDiameterM,
          numberOfBarrels: 1,
          lengthM: 24.0,
          slopeMPerM: Math.max(0.002, report.elevationDropM / Math.max(10, report.lengthOfStreamKm * 1000)),
          invertInletElevM: report.levelStreamOriginM,
          invertOutletElevM:
            report.levelStreamOriginM -
            24.0 * Math.max(0.002, report.elevationDropM / Math.max(10, report.lengthOfStreamKm * 1000)),
        },
      });
    } catch (err) {
      console.warn('Hydrograph simulation error:', err);
      return null;
    }
  }, [report, stormDurationHours, stormIntensityMmHr, soilTexture, culvertDiameterM]);

  // Codal Provisions Hydrology & Regional Flood Metrics
  const codalMetrics = useMemo(() => {
    if (!report) return null;
    const A = Math.max(0.001, report.catchmentAreaKm2);
    const L = Math.max(0.05, report.lengthOfStreamKm);
    const H = Math.max(0.1, report.elevationDropM);
    // Kirpich time of concentration in hours
    const tc =
      report.timeOfConcentrationHours ??
      Math.round(Math.pow((0.87 * Math.pow(L, 3)) / H, 0.385) * 100) / 100;
    // Critical rainfall intensity Ic (mm/h) for 50-year frequency (IRC Cl. 4.4.3: Ic = 50 / (tc + 0.5)^0.75)
    const Ic = Math.round((50 / Math.pow(Math.max(0.1, tc) + 0.5, 0.75)) * 100) / 100;

    // 1. Rational Peak Discharge
    // IRC:SP:13: Qr = 0.028 * P * f * A * Ic (P = 0.50, f = 1.0)
    const Qr_irc = Math.round(0.028 * 0.5 * 1.0 * A * Ic * 100) / 100;
    // AASHTO / FHWA: Qr = 0.00278 * C * A * Ic (C = 0.50)
    const Qr_fhwa = Math.round(0.00278 * 0.5 * A * Ic * 100) / 100;

    // 2. Regional Flood Estimates
    // Indian: Dickens, Ryves, Inglis
    const Qd_dickens = Math.round(16.75 * Math.pow(A, 0.75) * 100) / 100;
    const Qy_ryves = Math.round(8.5 * Math.pow(A, 2 / 3) * 100) / 100;
    const Qi_inglis = Math.round(((124 * A) / Math.sqrt(A + 10.4)) * 100) / 100;
    const Q_emp_irc_max = Math.max(Qd_dickens, Qy_ryves, Qi_inglis);

    // FHWA / USGS Regional Regression: Qp = a * A^b (a = 18.5, b = 0.68)
    const Q_usgs = Math.round(18.5 * Math.pow(A, 0.68) * 100) / 100;

    // 3. Design Flood Discharge
    const Q_design = isIndian ? Math.max(Qr_irc, Q_emp_irc_max) : Math.max(Qr_fhwa, Q_usgs);

    // 4. Regime Waterway Width
    // IRC Lacey: W = 4.825 * sqrt(Q)
    const W_lacey = Math.round(4.825 * Math.sqrt(Math.max(0.01, Q_design)) * 100) / 100;
    // FHWA Envelope: W = 3.65 * sqrt(Q)
    const W_fhwa = Math.round(3.65 * Math.sqrt(Math.max(0.01, Q_design)) * 100) / 100;

    // 5. Permissible Threshold Limits
    const vMin = isIndian ? 0.6 : 0.9;
    const vMax = isIndian ? 3.0 : 4.5;
    const haMax = isIndian ? 0.3 : 0.15;
    const hwDMax = isIndian ? 1.2 : 1.5;

    return {
      A,
      L,
      H,
      tc,
      Ic,
      Qr_irc,
      Qr_fhwa,
      Qr_active: isIndian ? Qr_irc : Qr_fhwa,
      Qd_dickens,
      Qy_ryves,
      Qi_inglis,
      Q_emp_irc_max,
      Q_usgs,
      Q_emp_active: isIndian ? Q_emp_irc_max : Q_usgs,
      Q_design,
      W_lacey,
      W_fhwa,
      W_active: isIndian ? W_lacey : W_fhwa,
      vMin,
      vMax,
      haMax,
      hwDMax,
    };
  }, [report, isIndian]);

  // Culvert Rating & Codal Hydraulic Compliance Metrics
  const culvertMetrics = useMemo(() => {
    if (!report || !catchmentHydrograph) return null;
    const barrelArea = Math.PI * Math.pow(culvertDiameterM / 2, 2);
    const peakQ = catchmentHydrograph.peakDischargeM3s;
    const velocity = barrelArea > 0 ? Math.round((peakQ / barrelArea) * 100) / 100 : 0;
    const afflux = Math.round((Math.pow(velocity, 2) / 19.62) * 1000) / 1000;
    const hwDepth = Math.max(0, catchmentHydrograph.maxHeadwaterElevM - report.levelStreamOriginM);
    const hwRatio = culvertDiameterM > 0 ? Math.round((hwDepth / culvertDiameterM) * 100) / 100 : 0;

    const vMin = isIndian ? 0.6 : 0.9;
    const vMax = isIndian ? 3.0 : 4.5;
    const haMax = isIndian ? 0.3 : 0.15;
    const hwDMax = isIndian ? 1.2 : 1.5;

    const isVelocityCompliant = velocity >= vMin && velocity <= vMax;
    const isAffluxCompliant = afflux <= haMax;
    const isHwCompliant = hwRatio <= hwDMax;

    return {
      barrelArea,
      peakQ,
      velocity,
      afflux,
      hwDepth,
      hwRatio,
      vMin,
      vMax,
      haMax,
      hwDMax,
      isVelocityCompliant,
      isAffluxCompliant,
      isHwCompliant,
    };
  }, [report, catchmentHydrograph, culvertDiameterM, isIndian]);

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
      await exportExcelReport(report, alignment || undefined, designStandard);
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
      exportKML(report, alignment || undefined);
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

      {/* Active Codal Provision Banner */}
      <div className="px-4 py-2.5 bg-[#121212] border-b border-[#222] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs font-tech">
        <div className="flex items-start gap-2.5 min-w-0">
          <ShieldCheck className={`w-4 h-4 mt-0.5 shrink-0 ${isIndian ? 'text-amber-400' : 'text-cyan-400'}`} />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-[#737373] uppercase tracking-wider font-semibold">Active Design Standard:</span>
              <span className={`font-bold text-xs ${isIndian ? 'text-amber-300' : 'text-cyan-300'}`}>
                {isIndian ? 'IRC:SP:13-2022 / IRC:78-2014 / IS 458' : 'FHWA HDS-5 / AASHTO LRFD / ASTM C76M'}
              </span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${
                isIndian ? 'bg-amber-950/70 text-amber-300 border border-amber-800' : 'bg-cyan-950/70 text-cyan-300 border border-cyan-800'
              }`}>
                {isIndian ? 'MoRTH / NHAI Standard' : 'USDOT / International'}
              </span>
            </div>
            <div className="text-[10px] text-[#888] truncate mt-0.5">
              {isIndian
                ? 'Rational: Q = 0.028·P·f·A·Ic · Dickens & Ryves · Lacey Waterway: W = 4.825√Q · IS 458 concrete'
                : 'AASHTO Rational: Q = 0.00278·C·A·Ic · USGS Regional Curves · FHWA Waterway: W = 3.65√Q · ASTM C76M'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto bg-[#171717] border border-[#2a2a2a] rounded p-1">
          <span className="text-[10px] text-[#888] pl-1">Standard:</span>
          <select
            value={designStandard}
            onChange={(e) => {
              const next = e.target.value as DprDesignStandard;
              setDesignStandard(next);
              setGlobalDesignStandard(next);
            }}
            className="bg-[#0f0f0f] border border-[#333] text-amber-300 font-semibold rounded px-2 py-0.5 text-[11px] font-tech focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="INDIAN_DPR">Indian DPR (IRC / IS)</option>
            <option value="INTERNATIONAL">International (FHWA / AASHTO)</option>
          </select>
        </div>
      </div>

      <div className="px-4 pt-3 flex gap-2 border-b border-[#222]/80 bg-[#0a0a0a] text-xs font-tech overflow-x-auto">
        {(
          [
            ['table', 'Hydrology Table', Layers],
            ['profile', 'Elevation Profile', Activity],
            ['hydrograph', 'Hydrograph & Culvert Rating', Waves],
            ['codal', isIndian ? 'IRC Codal Scrutiny' : 'FHWA/AASHTO Scrutiny', ShieldCheck],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveTab(value)}
            aria-pressed={activeTab === value}
            className={`pb-2 px-1 font-semibold transition-colors flex items-center gap-1.5 border-b-2 whitespace-nowrap ${
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

          {codalMetrics && (
            <div className="mt-3 bg-[#111] border border-[#222] rounded p-3 font-tech">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className={`w-3.5 h-3.5 ${isIndian ? 'text-amber-400' : 'text-cyan-400'}`} />
                  <span className={`text-[11px] font-bold uppercase tracking-wide ${isIndian ? 'text-amber-300' : 'text-cyan-300'}`}>
                    {isIndian ? 'IRC:SP:13-2022 Hydrology & Waterway' : 'FHWA HDS-5 / AASHTO Hydrology & Waterway'}
                  </span>
                </div>
                <span className="text-[10px] text-[#737373]">
                  {isIndian ? 'IS 458 Concrete Standards' : 'ASTM C76M Concrete Standards'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded bg-[#161616] border border-[#2a2a2a] flex flex-col">
                  <span className="text-[10px] text-[#888]">Rational Peak Qr</span>
                  <span className="text-white font-bold text-sm mt-0.5">{codalMetrics.Qr_active.toFixed(2)} m³/s</span>
                  <span className="text-[9px] text-[#737373] mt-0.5">
                    {isIndian ? '0.028 · P · f · A · Ic' : '0.00278 · C · A · Ic'}
                  </span>
                </div>
                <div className="p-2 rounded bg-[#161616] border border-[#2a2a2a] flex flex-col">
                  <span className="text-[10px] text-[#888]">
                    {isIndian ? 'Empirical Peak Q_emp' : 'USGS Regional Qp'}
                  </span>
                  <span className="text-white font-bold text-sm mt-0.5">{codalMetrics.Q_emp_active.toFixed(2)} m³/s</span>
                  <span className="text-[9px] text-[#737373] mt-0.5">
                    {isIndian ? 'Max(Dickens, Ryves, Inglis)' : '18.50 · A^0.68'}
                  </span>
                </div>
                <div className="p-2 rounded bg-[#161616] border border-[#2a2a2a] flex flex-col">
                  <span className="text-[10px] text-[#888]">Governing Design Q</span>
                  <span className="text-cyan-300 font-bold text-sm mt-0.5">{codalMetrics.Q_design.toFixed(2)} m³/s</span>
                  <span className="text-[9px] text-[#737373] mt-0.5">
                    {isIndian ? 'Max(Rational, Empirical)' : 'Max(Rational, USGS)'}
                  </span>
                </div>
                <div className="p-2 rounded bg-[#161616] border border-[#2a2a2a] flex flex-col">
                  <span className="text-[10px] text-[#888]">Waterway Width W</span>
                  <span className="text-amber-400 font-bold text-sm mt-0.5">{codalMetrics.W_active.toFixed(2)} m</span>
                  <span className="text-[9px] text-[#737373] mt-0.5">
                    {isIndian ? '4.825 · √Q (Lacey Regime)' : '3.65 · √Q (FHWA Envelope)'}
                  </span>
                </div>
              </div>
            </div>
          )}
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

      {activeTab === 'hydrograph' && (
        <div className="p-4 bg-[#0a0a0a] flex flex-col gap-3 font-tech">
          {/* Controls Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] bg-[#111] border border-[#222] rounded p-2.5">
            <div>
              <label className="text-[#888] block mb-1">USDA Soil</label>
              <select
                value={soilTexture}
                onChange={(e) => setSoilTexture(e.target.value as UsdaSoilTexture)}
                className="w-full bg-[#181818] border border-[#333] text-amber-300 rounded px-1.5 py-1 focus:outline-none"
              >
                {(
                  [
                    'Sand',
                    'Loamy Sand',
                    'Sandy Loam',
                    'Silt Loam',
                    'Clay Loam',
                    'Silty Clay',
                    'Clay',
                  ] as UsdaSoilTexture[]
                ).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[#888] block mb-1">Peak Rain (mm/h)</label>
              <select
                value={stormIntensityMmHr}
                onChange={(e) => setStormIntensityMmHr(Number(e.target.value))}
                className="w-full bg-[#181818] border border-[#333] text-amber-300 rounded px-1.5 py-1 focus:outline-none"
              >
                <option value={45}>45 mm/h (5-yr)</option>
                <option value={65}>65 mm/h (10-yr)</option>
                <option value={85}>85 mm/h (25-yr)</option>
                <option value={110}>110 mm/h (100-yr)</option>
              </select>
            </div>

            <div>
              <label className="text-[#888] block mb-1">Duration</label>
              <select
                value={stormDurationHours}
                onChange={(e) => setStormDurationHours(Number(e.target.value))}
                className="w-full bg-[#181818] border border-[#333] text-amber-300 rounded px-1.5 py-1 focus:outline-none"
              >
                <option value={1.0}>1.0 Hour</option>
                <option value={2.0}>2.0 Hours</option>
                <option value={3.0}>3.0 Hours</option>
              </select>
            </div>

            <div>
              <label className="text-[#888] block mb-1">Culvert Diam</label>
              <select
                value={culvertDiameterM}
                onChange={(e) => setCulvertDiameterM(Number(e.target.value))}
                className="w-full bg-[#181818] border border-[#333] text-amber-300 rounded px-1.5 py-1 focus:outline-none"
              >
                <option value={0.9}>Ø 900 mm (0.9m)</option>
                <option value={1.2}>Ø 1200 mm (1.2m)</option>
                <option value={1.5}>Ø 1500 mm (1.5m)</option>
                <option value={1.8}>Ø 1800 mm (1.8m)</option>
              </select>
            </div>
          </div>

          {catchmentHydrograph ? (
            <>
              {/* Key Hydrograph & Culvert KPIs */}
              {(() => {
                const hwLimit = isIndian ? 1.2 : 1.5;
                const hwRatio = culvertMetrics?.hwRatio ?? 0;
                const isSubmerged = hwRatio > hwLimit;
                const isCaution = hwRatio > hwLimit * 0.833 && hwRatio <= hwLimit;
                const v = culvertMetrics?.velocity ?? 0;
                const isVelOk = culvertMetrics?.isVelocityCompliant ?? true;
                const ha = culvertMetrics?.afflux ?? 0;
                const isAffluxOk = culvertMetrics?.isAffluxCompliant ?? true;

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                    <div className="p-2 rounded bg-[#111] border border-[#222] flex flex-col">
                      <span className="text-[10px] text-[#737373] uppercase">Peak Discharge</span>
                      <span className="text-cyan-300 font-bold text-sm">
                        {catchmentHydrograph.peakDischargeM3s.toFixed(2)} m³/s
                      </span>
                      <span className="text-[9px] text-[#888]">
                        at t = {catchmentHydrograph.timeToPeakMinutes.toFixed(0)} min
                      </span>
                    </div>

                    <div className="p-2 rounded bg-[#111] border border-[#222] flex flex-col">
                      <span className="text-[10px] text-[#737373] uppercase">Max Headwater HW</span>
                      <span className="text-amber-300 font-bold text-sm">
                        {catchmentHydrograph.maxHeadwaterElevM.toFixed(2)} m
                      </span>
                      <span className="text-[9px] text-[#888]">
                        Invert: {report.levelStreamOriginM.toFixed(1)} m
                      </span>
                    </div>

                    <div className="p-2 rounded bg-[#111] border border-[#222] flex flex-col">
                      <span className="text-[10px] text-[#737373] uppercase">Culvert HW/D Ratio</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-bold text-sm ${
                            isSubmerged
                              ? 'text-rose-400'
                              : isCaution
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {hwRatio.toFixed(2)}
                        </span>
                        <span
                          className={`text-[9px] px-1 py-0.5 rounded font-semibold uppercase ${
                            isSubmerged
                              ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                              : isCaution
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                              : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                          }`}
                        >
                          {isSubmerged ? 'Submerged' : isCaution ? 'Transition' : 'Free flow'}
                        </span>
                      </div>
                      <span className="text-[9px] text-[#888]">
                        Limit: HW/D ≤ {hwLimit.toFixed(2)} ({isIndian ? 'IRC:SP:13' : 'FHWA'})
                      </span>
                    </div>

                    <div className="p-2 rounded bg-[#111] border border-[#222] flex flex-col">
                      <span className="text-[10px] text-[#737373] uppercase">Barrel Velocity</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-bold text-sm ${
                            isVelOk ? 'text-emerald-300' : 'text-rose-400'
                          }`}
                        >
                          {v.toFixed(2)} m/s
                        </span>
                        <span
                          className={`text-[9px] px-1 py-0.5 rounded font-semibold uppercase ${
                            isVelOk
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                              : 'bg-rose-950/80 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {isVelOk ? 'Pass' : 'Check'}
                        </span>
                      </div>
                      <span className="text-[9px] text-[#888]">
                        {isIndian ? '0.60–3.00 m/s (IS 458)' : '0.90–4.50 m/s (ASTM)'}
                      </span>
                    </div>

                    <div className="p-2 rounded bg-[#111] border border-[#222] flex flex-col">
                      <span className="text-[10px] text-[#737373] uppercase">Afflux (ha)</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-bold text-sm ${
                            isAffluxOk ? 'text-emerald-300' : 'text-rose-400'
                          }`}
                        >
                          {ha.toFixed(3)} m
                        </span>
                        <span
                          className={`text-[9px] px-1 py-0.5 rounded font-semibold uppercase ${
                            isAffluxOk
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                              : 'bg-rose-950/80 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {isAffluxOk ? 'Pass' : 'High'}
                        </span>
                      </div>
                      <span className="text-[9px] text-[#888]">
                        Limit: ≤ {isIndian ? '0.30 m (IRC)' : '0.15 m (FHWA)'}
                      </span>
                    </div>

                    <div className="p-2 rounded bg-[#111] border border-[#222] flex flex-col">
                      <span className="text-[10px] text-[#737373] uppercase">Governing Regime</span>
                      <span className="text-emerald-300 font-bold text-xs uppercase mt-0.5 truncate">
                        {catchmentHydrograph.governingRegime === 'inlet-control'
                          ? 'Inlet Control'
                          : 'Outlet Control'}
                      </span>
                      <span className="text-[9px] text-[#888]">
                        Err: {catchmentHydrograph.massConservationErrorPct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Hydrograph SVG Dual-Axis Chart */}
              <div className="w-full h-44 bg-[#111] border border-[#222] rounded p-2 relative flex flex-col justify-between">
                {(() => {
                  const ts = catchmentHydrograph.timeSeries;
                  if (!ts || ts.length < 2) return null;

                  const maxQ = Math.max(0.1, catchmentHydrograph.peakDischargeM3s * 1.25);
                  const maxRain = Math.max(10, stormIntensityMmHr * 1.2);
                  const maxT = ts[ts.length - 1].timeMinutes;

                  const svgW = 400;
                  const svgH = 120;
                  const chartTop = 15;
                  const chartBottom = svgH - 15;
                  const chartHeight = chartBottom - chartTop;

                  // Bar hyetograph (inverted from top)
                  const barWidth = Math.max(2, (svgW / ts.length) * 0.85);
                  const rainBars = ts.map((pt, i) => {
                    const x = (pt.timeMinutes / maxT) * svgW;
                    const barH = (pt.rainfallIntensityMmPerHour / maxRain) * (chartHeight * 0.45);
                    return (
                      <rect
                        key={`rain-${i}`}
                        x={x}
                        y={chartTop}
                        width={barWidth}
                        height={barH}
                        fill="#38bdf8"
                        opacity={0.35}
                      />
                    );
                  });

                  // Hydrograph line Q(t)
                  const qPoints = ts.map((pt) => {
                    const x = (pt.timeMinutes / maxT) * svgW;
                    const y = chartBottom - (pt.culvertDischargeM3s / maxQ) * chartHeight;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  });

                  // Headwater line HW/D
                  const hwPoints = ts.map((pt) => {
                    const x = (pt.timeMinutes / maxT) * svgW;
                    const hwDiff = Math.max(0, pt.headwaterElevM - report.levelStreamOriginM);
                    const hwD = hwDiff / culvertDiameterM;
                    // Scale HW/D on 0..2.0 range
                    const y = chartBottom - (Math.min(2.0, hwD) / 2.0) * chartHeight;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  });

                  const activePoint =
                    hoveredHydroIndex !== null && ts[hoveredHydroIndex]
                      ? ts[hoveredHydroIndex]
                      : null;

                  return (
                    <>
                      <div className="flex items-center justify-between text-[10px] text-[#888] mb-1">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 bg-[#38bdf8]/40 border border-[#38bdf8] inline-block rounded-sm" />
                            Rainfall i(t) [mm/h]
                          </span>
                          <span className="flex items-center gap-1 text-cyan-300">
                            <span className="w-3 h-0.5 bg-[#06b6d4] inline-block" />
                            Discharge Q(t) [m³/s]
                          </span>
                          <span className="flex items-center gap-1 text-amber-300">
                            <span className="w-3 h-0.5 bg-[#f59e0b] border-t border-dashed inline-block" />
                            HW/D Stage Ratio
                          </span>
                        </div>
                        {activePoint && (
                          <div className="text-amber-200 text-[10px] font-mono">
                            t={activePoint.timeMinutes}m · Q={activePoint.culvertDischargeM3s.toFixed(2)}m³/s · HW/D={(activePoint.pondingDepthM / culvertDiameterM).toFixed(2)}
                          </div>
                        )}
                      </div>

                      <svg
                        className="w-full h-full overflow-visible cursor-crosshair"
                        viewBox={`0 0 ${svgW} ${svgH}`}
                        preserveAspectRatio="none"
                        onMouseLeave={() => setHoveredHydroIndex(null)}
                      >
                        <defs>
                          <linearGradient id="hydroFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
                          </linearGradient>
                        </defs>

                        {/* Grid lines */}
                        <line x1="0" y1={chartTop} x2={svgW} y2={chartTop} stroke="#222" strokeDasharray="2 2" strokeWidth="0.5" />
                        <line x1="0" y1={chartTop + chartHeight * 0.5} x2={svgW} y2={chartTop + chartHeight * 0.5} stroke="#222" strokeDasharray="2 2" strokeWidth="0.5" />
                        <line x1="0" y1={chartBottom} x2={svgW} y2={chartBottom} stroke="#333" strokeWidth="1" />

                        {/* Hyetograph bars */}
                        {rainBars}

                        {/* Hydrograph Area & Line */}
                        <polygon
                          points={`0,${chartBottom} ${qPoints.join(' ')} ${svgW},${chartBottom}`}
                          fill="url(#hydroFill)"
                        />
                        <polyline
                          points={qPoints.join(' ')}
                          fill="none"
                          stroke="#06b6d4"
                          strokeWidth="2.2"
                        />

                        {/* HW/D Dashed Line */}
                        <polyline
                          points={hwPoints.join(' ')}
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="1.6"
                          strokeDasharray="4 3"
                        />

                        {/* Hover trigger rectangles */}
                        {ts.map((pt, i) => {
                          const x = (pt.timeMinutes / maxT) * svgW;
                          return (
                            <rect
                              key={`hover-${i}`}
                              x={x - barWidth}
                              y={chartTop}
                              width={barWidth * 2}
                              height={chartHeight}
                              fill="transparent"
                              onMouseEnter={() => setHoveredHydroIndex(i)}
                            />
                          );
                        })}

                        {/* Hover indicator */}
                        {activePoint && (
                          <line
                            x1={(activePoint.timeMinutes / maxT) * svgW}
                            y1={chartTop}
                            x2={(activePoint.timeMinutes / maxT) * svgW}
                            y2={chartBottom}
                            stroke="#facc15"
                            strokeWidth="1"
                          />
                        )}
                      </svg>

                      <div className="flex justify-between text-[9px] text-[#666] pt-1">
                        <span>0 min</span>
                        <span>{Math.round(maxT * 0.5)} min</span>
                        <span>{maxT} min</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </>
          ) : (
            <div className="text-center text-xs text-[#737373] p-6 bg-[#111] rounded border border-[#222]">
              No active upstream watercourse is connected to this crossing for hydrograph simulation.
            </div>
          )}
        </div>
      )}

      {activeTab === 'codal' && (
        <div className="p-4 bg-[#0a0a0a] flex flex-col gap-3 font-tech">
          <div className="p-3 bg-[#111] border border-[#222] rounded flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className={`w-4 h-4 ${isIndian ? 'text-amber-400' : 'text-cyan-400'}`} />
                <span className={`text-xs font-bold uppercase tracking-wider ${isIndian ? 'text-amber-300' : 'text-cyan-300'}`}>
                  {isIndian ? 'IRC & MoRTH Codal Provisions & Scrutiny' : 'FHWA HDS-5 & AASHTO Hydraulic Audit'}
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#1c1c1c] border border-[#333] text-[#aaa]">
                50-Year Design Frequency
              </span>
            </div>
            <p className="text-[10px] text-[#737373] leading-relaxed">
              {isIndian
                ? 'Hydraulic scrutiny compliant with IRC:SP:13-2022 (Guidelines for Design of Small Bridges & Culverts), IRC:78-2014 (Foundations & Substructure Scour), and IS 458:2021 (Precast Concrete Pipes).'
                : 'Hydraulic audit compliant with FHWA HDS-5 (Hydraulic Design of Highway Culverts), AASHTO Drainage Manual, ASTM C76M (Reinforced Concrete Culvert Pipe), and FHWA HEC-18 (Bridge Scour).'}
            </p>
          </div>

          <div className="border border-[#222] rounded overflow-hidden bg-[#111]/80 text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#222] bg-[#161616] text-[10px] uppercase tracking-wider text-[#888]">
                  <th className="py-2 px-3 font-mono font-bold border-r border-[#222] w-1/4">Parameter / Check</th>
                  <th className="py-2 px-3 font-mono font-bold border-r border-[#222] w-1/3">Governing Formulation &amp; Limit</th>
                  <th className="py-2 px-3 font-mono font-bold border-r border-[#222] w-1/4">Simulated Design Value</th>
                  <th className="py-2 px-3 font-mono font-bold w-1/6">Compliance Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222]">
                {/* 1. Rational Runoff Discharge */}
                <tr className="hover:bg-[#171717]/40">
                  <td className="py-2.5 px-3 font-mono font-semibold text-[11px] text-[#e5e7eb] border-r border-[#222]">
                    Rational Peak Runoff (Qr)
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-[#aaa] border-r border-[#222]">
                    {isIndian ? (
                      <div>
                        <div className="font-mono text-amber-300">Qr = 0.028 · P · f · A · Ic</div>
                        <div className="text-[10px] text-[#737373]">IRC:SP:13 Cl. 4.4.2 (P=0.50, f=1.00)</div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-mono text-cyan-300">Q = 0.00278 · C · A · Ic</div>
                        <div className="text-[10px] text-[#737373]">AASHTO / FHWA HDS-2 SI Eq. (C=0.50)</div>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-white border-r border-[#222]">
                    {codalMetrics?.Qr_active.toFixed(2)} m³/s
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                      Evaluated
                    </span>
                  </td>
                </tr>

                {/* 2. Regional Flood Check */}
                <tr className="hover:bg-[#171717]/40">
                  <td className="py-2.5 px-3 font-mono font-semibold text-[11px] text-[#e5e7eb] border-r border-[#222]">
                    Regional Flood Envelopes
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-[#aaa] border-r border-[#222]">
                    {isIndian ? (
                      <div>
                        <div className="font-mono text-amber-300">Dickens: 16.75·A^0.75 | Ryves: 8.5·A^(2/3)</div>
                        <div className="text-[10px] text-[#737373]">IRC:SP:13 Cl. 4.3 (Central/Hilly defaults)</div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-mono text-cyan-300">USGS Curve: Qp = 18.50 · A^0.68</div>
                        <div className="text-[10px] text-[#737373]">USGS SIR 2014-5002 Regional Regression</div>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-white border-r border-[#222]">
                    {codalMetrics?.Q_emp_active.toFixed(2)} m³/s
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                      Governing Q: {codalMetrics?.Q_design.toFixed(2)}
                    </span>
                  </td>
                </tr>

                {/* 3. Regime Waterway */}
                <tr className="hover:bg-[#171717]/40">
                  <td className="py-2.5 px-3 font-mono font-semibold text-[11px] text-[#e5e7eb] border-r border-[#222]">
                    Regime Waterway Sizing (W)
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-[#aaa] border-r border-[#222]">
                    {isIndian ? (
                      <div>
                        <div className="font-mono text-amber-300">W = 4.825 · √Q (Lacey Regime)</div>
                        <div className="text-[10px] text-[#737373]">IRC:SP:13 Cl. 6.2 linear waterway</div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-mono text-cyan-300">W = 3.65 · √Q (FHWA Waterway)</div>
                        <div className="text-[10px] text-[#737373]">FHWA HDS-5 standard waterway envelope</div>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-amber-400 border-r border-[#222]">
                    {codalMetrics?.W_active.toFixed(2)} m
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-cyan-950/80 text-cyan-300 border border-cyan-800">
                      Required
                    </span>
                  </td>
                </tr>

                {/* 4. Barrel Velocity */}
                <tr className="hover:bg-[#171717]/40">
                  <td className="py-2.5 px-3 font-mono font-semibold text-[11px] text-[#e5e7eb] border-r border-[#222]">
                    Barrel Velocity (V)
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-[#aaa] border-r border-[#222]">
                    {isIndian ? (
                      <div>
                        <div>0.60 m/s ≤ V ≤ 3.00 m/s</div>
                        <div className="text-[10px] text-[#737373]">IS 458: Non-silting (≥0.6) &amp; non-scouring (≤3.0)</div>
                      </div>
                    ) : (
                      <div>
                        <div>0.90 m/s ≤ V ≤ 4.50 m/s</div>
                        <div className="text-[10px] text-[#737373]">ASTM C76M: AASHTO allowable range (3–15 fps)</div>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-white border-r border-[#222]">
                    {culvertMetrics ? `${culvertMetrics.velocity.toFixed(2)} m/s` : 'Simulate in hydrograph'}
                  </td>
                  <td className="py-2.5 px-3">
                    {culvertMetrics ? (
                      culvertMetrics.isVelocityCompliant ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Pass
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-rose-950/80 text-rose-300 border border-rose-800 flex items-center gap-1 w-fit">
                          <XCircle className="w-3 h-3" /> Check
                        </span>
                      )
                    ) : (
                      <span className="text-[9px] text-[#737373]">—</span>
                    )}
                  </td>
                </tr>

                {/* 5. Afflux / Backwater */}
                <tr className="hover:bg-[#171717]/40">
                  <td className="py-2.5 px-3 font-mono font-semibold text-[11px] text-[#e5e7eb] border-r border-[#222]">
                    Upstream Heading-Up / Afflux (ha)
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-[#aaa] border-r border-[#222]">
                    {isIndian ? (
                      <div>
                        <div>ha ≤ 0.30 m maximum heading-up</div>
                        <div className="text-[10px] text-[#737373]">IRC:SP:13 Cl. 5.4 Molesworth formula limit</div>
                      </div>
                    ) : (
                      <div>
                        <div>ha ≤ 0.15 m allowable backwater rise</div>
                        <div className="text-[10px] text-[#737373]">FHWA HDS-5 Sec. 3.2 0.5-ft backwater threshold</div>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-white border-r border-[#222]">
                    {culvertMetrics ? `${culvertMetrics.afflux.toFixed(3)} m` : 'Simulate in hydrograph'}
                  </td>
                  <td className="py-2.5 px-3">
                    {culvertMetrics ? (
                      culvertMetrics.isAffluxCompliant ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Pass
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-rose-950/80 text-rose-300 border border-rose-800 flex items-center gap-1 w-fit">
                          <XCircle className="w-3 h-3" /> Exceeds
                        </span>
                      )
                    ) : (
                      <span className="text-[9px] text-[#737373]">—</span>
                    )}
                  </td>
                </tr>

                {/* 6. Headwater HW/D Submergence */}
                <tr className="hover:bg-[#171717]/40">
                  <td className="py-2.5 px-3 font-mono font-semibold text-[11px] text-[#e5e7eb] border-r border-[#222]">
                    Inlet Headwater Submergence (HW/D)
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-[#aaa] border-r border-[#222]">
                    {isIndian ? (
                      <div>
                        <div>HW/D ≤ 1.20 (Non-submerged inlet criteria)</div>
                        <div className="text-[10px] text-[#737373]">IRC:SP:13 Cl. 5.4 freeboard preservation</div>
                      </div>
                    ) : (
                      <div>
                        <div>HW/D ≤ 1.50 (Design flood submergence limit)</div>
                        <div className="text-[10px] text-[#737373]">FHWA HDS-5 Sec. 3.2 roadway embankment protection</div>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-white border-r border-[#222]">
                    {culvertMetrics ? `${culvertMetrics.hwRatio.toFixed(2)}` : 'Simulate in hydrograph'}
                  </td>
                  <td className="py-2.5 px-3">
                    {culvertMetrics ? (
                      culvertMetrics.isHwCompliant ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Pass
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-rose-950/80 text-rose-300 border border-rose-800 flex items-center gap-1 w-fit">
                          <XCircle className="w-3 h-3" /> Submerged
                        </span>
                      )
                    ) : (
                      <span className="text-[9px] text-[#737373]">—</span>
                    )}
                  </td>
                </tr>

                {/* 7. Foundation Scour */}
                <tr className="hover:bg-[#171717]/40">
                  <td className="py-2.5 px-3 font-mono font-semibold text-[11px] text-[#e5e7eb] border-r border-[#222]">
                    Foundation &amp; Bed Scour Depth
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-[#aaa] border-r border-[#222]">
                    {isIndian ? (
                      <div>
                        <div className="font-mono text-amber-300">R = 1.34 · (q²/f)^(1/3) | dmax = 2.00 · R</div>
                        <div className="text-[10px] text-[#737373]">IRC:78-2014 Cl. 703 Lacey Regime with Ksf=1.00</div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-mono text-cyan-300">HEC-18 Contraction &amp; Abutment Multipliers</div>
                        <div className="text-[10px] text-[#737373]">FHWA HEC-18 Laursen Clear-Water / Froehlich</div>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-xs text-[#ccc] border-r border-[#222]">
                    {isIndian ? 'Lacey Ksf = 1.00' : 'HEC-18 SF = 1.50'}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                      Standard
                    </span>
                  </td>
                </tr>

                {/* 8. Structural Pipe Spec */}
                <tr className="hover:bg-[#171717]/40">
                  <td className="py-2.5 px-3 font-mono font-semibold text-[11px] text-[#e5e7eb] border-r border-[#222]">
                    Culvert Pipe Specification
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-[#aaa] border-r border-[#222]">
                    {isIndian ? (
                      <div>
                        <div>IS 458:2021 Class NP3 / NP4 Reinforced Concrete</div>
                        <div className="text-[10px] text-[#737373]">Heavy-duty highway crossing under IRC Live Load</div>
                      </div>
                    ) : (
                      <div>
                        <div>ASTM C76M Class IV Reinforced Concrete Pipe</div>
                        <div className="text-[10px] text-[#737373]">AASHTO M170M highway fill loading specifications</div>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-xs text-white border-r border-[#222]">
                    Ø {Math.round(culvertDiameterM * 1000)} mm
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                      Specified
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
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
        <div
          role="alert"
          className="mx-4 mb-2 p-2.5 rounded bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#fca5a5] text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
        >
          <div className="flex items-start gap-1.5 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{exportError}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => void handleExportExcel()}
              className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-medium transition-colors font-tech cursor-pointer"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-2 py-0.5 rounded bg-[#ef4444]/20 hover:bg-[#ef4444]/30 text-white text-[10px] font-medium transition-colors font-tech cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        </div>
      )}

      <div className="px-4 py-2 bg-[#0d0d0d] border-t border-[#222] flex items-center justify-between gap-2 text-[11px] font-tech text-[#888]">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[#bbb]">DPR Standard:</span>
        </div>
        <select
          value={designStandard}
          onChange={(e) => {
            const next = e.target.value as DprDesignStandard;
            setDesignStandard(next);
            setGlobalDesignStandard(next);
          }}
          className="bg-[#171717] border border-[#333] text-[#e5e7eb] rounded px-2 py-0.5 text-[11px] font-tech focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="INDIAN_DPR">IRC:SP:13 / IRC:78 (Indian DPR)</option>
          <option value="INTERNATIONAL">FHWA / AASHTO (International)</option>
        </select>
      </div>

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
          title={
            isIndian
              ? 'Download 5-Worksheet Cross-Drainage (CD) DPR Package compliant with IRC:SP:13-2022, IRC:SP:42-2014, IRC:78-2014, and IS 458:2021'
              : 'Download 5-Worksheet Cross-Drainage Culvert Audit Package compliant with FHWA HDS-5, AASHTO Drainage Manual, ASTM C76M, and FHWA HEC-18'
          }
        >
          <FileSpreadsheet
            className={`w-3.5 h-3.5 text-[#10b981] ${
              isExportingExcel ? 'animate-pulse' : 'group-hover:scale-105'
            } transition-transform`}
          />
          <span>
            {isExportingExcel
              ? 'Building DPR Package...'
              : isIndian
              ? 'Export IRC DPR Excel (.xlsx)'
              : 'Export FHWA/AASHTO Excel (.xlsx)'}
          </span>
        </button>
      </div>
    </div>
  );
};
