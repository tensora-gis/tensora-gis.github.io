import { HydrologyReport, HydrologyRunFailure, AnalysisScopeM } from '../types/hydrology';
import { decimalToDMS, formatChainageNumber } from './geoUtils';
import {
  buildDemGrid,
  demGridSamplePoints,
  delineateUpstreamCatchment,
  DemUnavailableError,
  DelineationResult,
  MIN_REQUIRED_DROP_M,
} from './flowDelineation';
import { fetchBulkElevations, PROVIDER_LABELS } from './elevationService';

/**
 * CULVERT CATCHMENT ANALYSIS
 *
 * Implements the specified rule:
 *
 *   - Find the ground that actually drains TO the specified chainage point.
 *   - Report the drop between the culvert invert and the highest ground in the
 *     contributing catchment.
 *   - If that drop is less than 5 m the catchment is inadequate, so the
 *     analysis scope is widened and re-run until a real catchment with at
 *     least 5 m of drop is found, or the search is exhausted.
 *
 * Distance is NOT fixed: the source of the flow is wherever the divide is, and
 * that may be a few hundred metres or a few kilometres away. Every figure is
 * measured. The drop is never rounded up to meet the threshold - if no
 * catchment with 5 m of drop exists, that is reported as a finding.
 */

/** Scope ladder. Each step is attempted only if the previous one fell short. */
const SCOPE_LADDER: number[] = [500, 1000, 2000];

export interface DelineationOptions {
  targetChainage: number;
  /** The chainage point. Stormwater must arrive here. */
  lat: number;
  lng: number;
  corridorBearing?: number;
  /** Ground-truth reduced level from an uploaded survey file, if available. */
  surveyElevation?: number;
  chainageLabel?: string;
  /** Corridor alignment, needed to model the formation. */
  corridor?: [number, number][];
  corridorStartChainage?: number;
}

export interface DelineationOutcome {
  report: HydrologyReport | null;
  failure: HydrologyRunFailure | null;
}

/**
 * Samples the DEM over a scope and reports its relief.
 * The DEM cache is shared and deduplicated, so widening the scope only costs
 * the newly added outer ring.
 */
async function sampleScope(
  lat: number,
  lng: number,
  bearing: number,
  radiusM: number
): Promise<{
  grid: ReturnType<typeof buildDemGrid>;
  elevations: (number | null)[];
  cellIndices: number[];
  reliefM: number | null;
  providerLabels: string[];
}> {
  const grid = buildDemGrid(lat, lng, bearing, radiusM);
  const { points, cellIndices } = demGridSamplePoints(grid);
  const bulk = await fetchBulkElevations(points);

  const valid = bulk.elevations.filter((v): v is number => v !== null);
  const reliefM = valid.length > 0 ? Math.max(...valid) - Math.min(...valid) : null;

  return {
    grid,
    elevations: bulk.elevations,
    cellIndices,
    reliefM,
    providerLabels: bulk.providers.map((p) => PROVIDER_LABELS[p]).filter(Boolean),
  };
}

function describeProviders(labels: string[]): string {
  const unique = [...new Set(labels)].filter(Boolean);
  if (unique.length === 0) return 'None';
  return unique.join(' / ');
}

function coverageOf(elevations: (number | null)[]): number {
  const valid = elevations.filter((v): v is number => v !== null).length;
  return elevations.length > 0 ? valid / elevations.length : 0;
}

/**
 * Runs the analysis for one target point.
 * Returns either a measured report or an explicit failure - never a report
 * containing substituted numbers.
 */
export async function delineateCatchment(
  options: DelineationOptions
): Promise<DelineationOutcome> {
  const {
    targetChainage,
    lat,
    lng,
    corridorBearing,
    surveyElevation,
    chainageLabel,
    corridor,
    corridorStartChainage = 0,
  } = options;

  const bearing =
    typeof corridorBearing === 'number' && isFinite(corridorBearing)
      ? ((corridorBearing % 360) + 360) % 360
      : 0;
  const targetChainageFormatted = chainageLabel || formatChainageNumber(targetChainage);

  let scopeM = SCOPE_LADDER[0];
  let expanded = false;
  let best: {
    sampled: Awaited<ReturnType<typeof sampleScope>>;
    result: DelineationResult;
  } | null = null;
  let lastError = '';
  let providerLabels: string[] = [];
  let lastCoverage = 0;

  // Widen the scope until a catchment with adequate drop is found. Each step is
  // attempted only when the previous one could not satisfy the rule.
  for (const candidateScope of SCOPE_LADDER) {
    const sampled = await sampleScope(lat, lng, bearing, candidateScope);
    providerLabels = sampled.providerLabels;
    lastCoverage = coverageOf(sampled.elevations);
    scopeM = candidateScope;

    if (sampled.reliefM === null) {
      lastError =
        `Elevation service is unreachable, so no terrain could be sampled ` +
        `(DEM coverage 0%). Connect to the internet and retry, or upload a survey sheet.`;
      continue;
    }

    try {
      const result = delineateUpstreamCatchment({
        targetLat: lat,
        targetLng: lng,
        corridorBearingDeg: bearing,
        radiusM: candidateScope,
        elevations: sampled.elevations,
        cellIndices: sampled.cellIndices,
        corridor,
        corridorStartChainage,
      });

      // Record the scope actually used before deciding whether to stop. Setting
      // this only on the failure path left the flag false whenever the wider
      // search succeeded, so the report claimed a 500 m scope at 2,000 m.
      if (candidateScope !== SCOPE_LADDER[0]) expanded = true;

      // Keep the first result that meets the design rule.
      if (result.reliefM >= MIN_REQUIRED_DROP_M) {
        best = { sampled, result };
        break;
      }

      // Otherwise remember it in case nothing better is found, and widen.
      if (!best) best = { sampled, result };
    } catch (err) {
      lastError =
        err instanceof DemUnavailableError
          ? err.message
          : `Delineation failed: ${(err as Error)?.message ?? 'unknown error'}`;
    }
  }

  const scopeNote =
    scopeM === SCOPE_LADDER[0]
      ? `Analysed over a ${scopeM} m scope.`
      : `Analysed over a ${scopeM} m scope, widened from ${SCOPE_LADDER[0]} m because the smaller scope did not yield a catchment with at least ${MIN_REQUIRED_DROP_M} m of drop.`;

  if (!best) {
    return {
      report: null,
      failure: {
        targetChainage,
        targetChainageFormatted,
        latitudeDD: lat,
        longitudeDD: lng,
        scopeAppliedM: Math.min(scopeM, 2000) as AnalysisScopeM,
        scopeExpandedDueToFlatRelief: expanded,
        demCoverage: lastCoverage,
        message:
          `${lastError || 'The catchment could not be delineated.'} ${scopeNote} ` +
          `No stormwater was found draining to this chainage.`,
      },
    };
  }

  const { result } = best;

  // --- Derived hydraulic metrics (measured, then reported) ----------------
  const streamLengthM = result.streamLengthKm * 1000;
  const streamSlopePercent =
    streamLengthM > 0
      ? Math.round(((result.reliefM / streamLengthM) * 100) * 100) / 100
      : null;

  const L = Math.max(0.05, result.streamLengthKm);
  const H = Math.max(0.1, result.reliefM);
  const timeOfConcentrationHours = Math.round(Math.pow((0.87 * Math.pow(L, 3)) / H, 0.385) * 100) / 100;

  // The invert is the surveyed level when one was supplied, otherwise the
  // measured drainage invert at the crossing.
  let originElevationM = result.originElevationM;
  let elevationOriginKind: HydrologyReport['elevationOriginKind'] = 'dem';
  if (typeof surveyElevation === 'number' && isFinite(surveyElevation)) {
    originElevationM = Math.round(surveyElevation * 10) / 10;
    elevationOriginKind = 'survey';
  }

  const reliefFromChosenOrigin = Math.round((result.highestContourM - originElevationM) * 10) / 10;
  const finalMeetsThreshold = reliefFromChosenOrigin >= MIN_REQUIRED_DROP_M;

  const crossVerifyGoogleEarthUrl =
    `https://earth.google.com/web/@${lat.toFixed(6)},${lng.toFixed(6)},${originElevationM.toFixed(1)}a,` +
    `${Math.max(400, Math.round(scopeM * 2))}d,35y,0h,0t,0r`;

  const arrivalSide =
    result.flowArrivalBearingDeg === null
      ? ''
      : ` Flow arrives from bearing ${result.flowArrivalBearingDeg}°.`;

  const report: HydrologyReport = {
    targetChainage,
    targetChainageFormatted,
    latitudeDMS: decimalToDMS(lat, true),
    longitudeDMS: decimalToDMS(lng, false),
    latitudeDD: Math.round(lat * 1000000) / 1000000,
    longitudeDD: Math.round(lng * 1000000) / 1000000,

    catchmentAreaKm2: result.catchmentAreaKm2,
    lengthOfStreamKm: result.streamLengthKm,
    levelStreamOriginM: originElevationM,
    highestContourM: result.highestContourM,

    elevationDropM: reliefFromChosenOrigin,
    scopeAppliedM: Math.min(scopeM, 2000) as AnalysisScopeM,
    scopeExpandedDueToFlatRelief: expanded,
    reliefWithinScopeM: result.reliefM,
    meetsReliefThreshold: finalMeetsThreshold,

    streamCoordinates: result.streamPath,
    catchmentPolygon: result.catchmentPolygon,
    tributaryPaths: result.tributaryPaths,
    contours: result.contours.map((c) => ({ elevation: c.elevationM, coordinates: c.coordinates })),
    elevationProfile: result.elevationProfile,

    elevationSource: describeProviders(providerLabels),
    elevationOriginKind,
    demCoverage: result.demCoverage,
    contributingCells: result.contributingCells,
    flowArrivesAtCrossing: result.flowArrivesAtCrossing,
    flowArrivalBearingDeg: result.flowArrivalBearingDeg,
    streamHeadElevationM: result.streamHeadElevationM,
    headDistanceM: result.headDistanceM,
    headCoordinates: result.headCoordinates,
    analysisCellSizeM: result.cellSizeM,

    streamSlopePercent,
    timeOfConcentrationHours,
    flowDirectionDeg: bearing,

    crossVerifyGoogleEarthUrl,
    processedTimestamp: new Date().toISOString(),
    notes:
      `${scopeNote} ` +
      `Catchment delineated by D8 flow routing over a ${result.gridSize}×${result.gridSize} grid at ` +
      `${result.cellSizeM} m cell spacing (${(result.demCoverage * 100).toFixed(1)}% DEM coverage). ` +
      `${result.contributingCells} natural-ground cells contribute; the corridor formation is excluded ` +
      `because it is impervious and sheds no runoff. ` +
      `Culvert invert (Level Stream Origin) ${originElevationM} m MSL ` +
      `(${elevationOriginKind === 'survey' ? 'survey sheet' : 'measured drainage invert'}); ` +
      `highest ground in the catchment ${result.highestContourM} m MSL; drop ${reliefFromChosenOrigin} m ` +
      `(${finalMeetsThreshold ? 'meets' : 'does NOT meet'} the ${MIN_REQUIRED_DROP_M} m rule). ` +
      `The head of the watercourse is the highest ground within 1,000 m that drains here, ` +
      `${result.headDistanceM} m away at ${result.streamHeadElevationM} m MSL.${arrivalSide}`,
  };

  return { report, failure: null };
}

import {
  GreenAmptSoilParameters,
  USDA_SOIL_TEXTURE_PARAMETERS,
  UsdaSoilTexture,
} from './greenAmptInfiltration';
import {
  CulvertBarrelsDefinition,
  solveCulvertRating,
  solveCulvertDischargeForHeadwater,
  CulvertRatingPoint,
} from './culvertRatingHds5';
import {
  OverlandGridDefinition,
  createInitialOverlandState,
  stepOverlandDiffusiveSimulation,
  OverlandSimulationState,
} from './overlandDiffusiveSolver';

export interface CatchmentHydrographOptions {
  stormDurationHours: number;
  peakRainfallIntensityMmPerHour: number;
  soilTexture?: UsdaSoilTexture;
  culvert?: CulvertBarrelsDefinition;
}

export interface CatchmentHydrographResult {
  peakDischargeM3s: number;
  timeToPeakMinutes: number;
  maxHeadwaterElevM: number;
  governingRegime: 'inlet-control' | 'outlet-control';
  totalRainfallVolumeM3: number;
  totalInfiltrationVolumeM3: number;
  totalCulvertDischargedVolumeM3: number;
  massConservationErrorPct: number;
  timeSeries: {
    timeMinutes: number;
    rainfallIntensityMmPerHour: number;
    culvertDischargeM3s: number;
    headwaterElevM: number;
    pondingDepthM: number;
  }[];
}

/**
 * Simulates transient rainfall-runoff on a delineated catchment using
 * Green-Ampt infiltration, 2D diffusive-wave overland routing, and FHWA HDS-5 culvert rating.
 */
export function simulateCatchmentHydrographAndCulvertRating(
  report: HydrologyReport,
  options: CatchmentHydrographOptions
): CatchmentHydrographResult {
  const soilType: UsdaSoilTexture = options.soilTexture || 'Sandy Loam';
  const soil = USDA_SOIL_TEXTURE_PARAMETERS[soilType];

  const slopeMPerM = Math.max(0.002, (report.elevationDropM / Math.max(10, report.lengthOfStreamKm * 1000)));
  const originElev = report.levelStreamOriginM;
  const highestElev = report.highestContourM;

  const culvert: CulvertBarrelsDefinition = options.culvert || {
    shape: 'circular',
    material: 'concrete-pipe',
    diameterM: 1.2,
    numberOfBarrels: 1,
    lengthM: 24.0, // Across 12 m half-width formation
    slopeMPerM,
    invertInletElevM: originElev,
    invertOutletElevM: originElev - 24.0 * slopeMPerM,
  };

  // Build a synthetic 15x15 representative overland catchment grid
  const nx = 15;
  const ny = 15;
  const dxM = Math.max(10.0, Math.sqrt((report.catchmentAreaKm2 * 1e6) / (nx * ny)));
  const dyM = dxM;

  const bedElevation = new Float32Array(nx * ny);
  const manningN = new Float32Array(nx * ny);
  const soilParams: GreenAmptSoilParameters[] = [];
  const initialMoisture = new Float32Array(nx * ny);

  // Set slope towards center-bottom cell (culvert inlet)
  const culvertCellIdx = Math.floor(nx / 2); // Center of bottom row
  const inletElev = originElev;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const idx = j * nx + i;
      const distFromInlet = Math.hypot(i - (nx / 2), j);
      const maxDist = Math.hypot(nx / 2, ny);
      const frac = distFromInlet / maxDist;
      bedElevation[idx] = inletElev + frac * Math.max(2.0, highestElev - inletElev);
      manningN[idx] = soil.overlandManningN;
      soilParams.push(soil);
      initialMoisture[idx] = soil.residualThetaR + 0.1 * (soil.porosityThetaS - soil.residualThetaR);
    }
  }

  const grid: OverlandGridDefinition = {
    nx,
    ny,
    dxM,
    dyM,
    bedElevation,
    manningN,
    soilParameters: soilParams,
    initialMoisture,
    culvertLocation: {
      cellIdx: culvertCellIdx,
      culvert,
      tailwaterDepthM: 0.3,
    },
  };

  let state = createInitialOverlandState(grid);

  const durationSec = options.stormDurationHours * 3600.0;
  const simStepSec = 30.0;
  const numSteps = Math.ceil(durationSec / simStepSec);

  let peakQ = 0.0;
  let timeToPeakSec = 0.0;
  let maxHW = culvert.invertInletElevM;
  let governingRegime: 'inlet-control' | 'outlet-control' = 'inlet-control';

  const timeSeries: CatchmentHydrographResult['timeSeries'] = [];

  for (let step = 0; step < numSteps; step++) {
    const t = step * simStepSec;
    // Triangular hyetograph peaking at 35% storm duration
    const peakTimeSec = 0.35 * durationSec;
    let rainIntensity: number;
    if (t <= peakTimeSec) {
      rainIntensity = options.peakRainfallIntensityMmPerHour * (t / Math.max(1, peakTimeSec));
    } else {
      rainIntensity = Math.max(0.0, options.peakRainfallIntensityMmPerHour * (1.0 - (t - peakTimeSec) / (durationSec - peakTimeSec)));
    }

    state = stepOverlandDiffusiveSimulation(grid, state, rainIntensity, simStepSec);

    const culvertDepth = state.depthM[culvertCellIdx];
    const headwaterElev = bedElevation[culvertCellIdx] + culvertDepth;
    const rating = solveCulvertRating(culvert, Math.max(1e-4, (state.cumulativeCulvertDischargeM3 - (timeSeries.length > 0 ? timeSeries[timeSeries.length - 1].culvertDischargeM3s * simStepSec : 0)) / simStepSec), 0.3);

    const instantaneousQ = solveCulvertDischargeForHeadwater(culvert, headwaterElev, 0.3);

    if (instantaneousQ > peakQ) {
      peakQ = instantaneousQ;
      timeToPeakSec = t;
      maxHW = headwaterElev;
      governingRegime = rating.governingRegime;
    }

    // Sample every 2 minutes for output timeseries
    if (step % 4 === 0) {
      timeSeries.push({
        timeMinutes: Math.round(t / 60.0),
        rainfallIntensityMmPerHour: Math.round(rainIntensity * 10) / 10,
        culvertDischargeM3s: Math.round(instantaneousQ * 1000) / 1000,
        headwaterElevM: Math.round(headwaterElev * 100) / 100,
        pondingDepthM: Math.round(culvertDepth * 100) / 100,
      });
    }
  }

  return {
    peakDischargeM3s: peakQ,
    timeToPeakMinutes: Math.round(timeToPeakSec / 60.0),
    maxHeadwaterElevM: maxHW,
    governingRegime,
    totalRainfallVolumeM3: state.cumulativeRainfallVolumeM3,
    totalInfiltrationVolumeM3: state.cumulativeInfiltratedVolumeM3,
    totalCulvertDischargedVolumeM3: state.cumulativeCulvertDischargeM3,
    massConservationErrorPct: state.massConservationErrorPct,
    timeSeries,
  };
}

