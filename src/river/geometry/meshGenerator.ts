/**
 * 2D Curvilinear Structured Quad Mesh Generator for River Reaches
 *
 * Generates an orthogonal-curvilinear finite-volume computational grid along
 * the river centerline with exact outward face normals, metric cell areas,
 * topological neighbor connectivity, and boundary condition flags.
 */

import {
  RiverCenterlinePoint,
  RiverGridCell,
  RiverGridMesh,
  RiverReachDefinition,
  CrossSectionStation,
} from '../types/riverReach';
import { sampleCrossSectionElevation } from './empiricalSection';
import { RiverHydraulicStructure } from '../structures/structureTypes';

const METERS_PER_DEG_LAT = 111320.0;

/**
 * Convert lat/lng coordinates to local metric coordinates (meters)
 * centered at a reference origin (originLat, originLng).
 */
export function geoToLocalMeters(
  lat: number,
  lng: number,
  originLat: number,
  originLng: number
): [number, number] {
  const y = (lat - originLat) * METERS_PER_DEG_LAT;
  const rad = (originLat * Math.PI) / 180.0;
  const x = (lng - originLng) * METERS_PER_DEG_LAT * Math.cos(rad);
  return [x, y];
}

/**
 * Convert local metric coordinates (x, y in meters) back to lat/lng.
 */
export function localMetersToGeo(
  x: number,
  y: number,
  originLat: number,
  originLng: number
): [number, number] {
  const lat = originLat + y / METERS_PER_DEG_LAT;
  const rad = (originLat * Math.PI) / 180.0;
  const lng = originLng + x / (METERS_PER_DEG_LAT * Math.cos(rad));
  return [lat, lng];
}

/**
 * Resample a river centerline to uniform station spacing ds (meters)
 */
export function resampleCenterline(
  rawPoints: RiverCenterlinePoint[],
  targetSpacingM: number = 20.0
): RiverCenterlinePoint[] {
  if (rawPoints.length <= 1) return rawPoints;

  const originLat = rawPoints[0].lat;
  const originLng = rawPoints[0].lng;

  // Compute cumulative stations
  const metricPoints: { x: number; y: number; station: number; raw: RiverCenterlinePoint }[] = [];
  let currentStation = 0;

  for (let i = 0; i < rawPoints.length; i++) {
    const pt = rawPoints[i];
    const [x, y] = geoToLocalMeters(pt.lat, pt.lng, originLat, originLng);
    if (i > 0) {
      const prev = metricPoints[i - 1];
      const dist = Math.hypot(x - prev.x, y - prev.y);
      currentStation += dist;
    }
    metricPoints.push({ x, y, station: currentStation, raw: pt });
  }

  const totalLength = currentStation;
function evalCatmullRomSpline(v0: number, v1: number, v2: number, v3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * v1) +
    (-v0 + v2) * t +
    (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
    (-v0 + 3 * v1 - 3 * v2 + v3) * t3
  );
}

  const numSegments = Math.max(2, Math.round(totalLength / targetSpacingM));
  const actualSpacing = totalLength / numSegments;

  const resampled: RiverCenterlinePoint[] = [];

  for (let k = 0; k <= numSegments; k++) {
    const sTarget = k * actualSpacing;

    // Find bounding segment in metricPoints
    let segIdx = 0;
    while (segIdx < metricPoints.length - 2 && metricPoints[segIdx + 1].station < sTarget) {
      segIdx++;
    }

    const pA = metricPoints[segIdx];
    const pB = metricPoints[segIdx + 1] || pA;
    const segLen = Math.max(1.0e-5, pB.station - pA.station);
    const t = Math.max(0, Math.min(1, (sTarget - pA.station) / segLen));

    let interpX: number;
    let interpY: number;
    let interpBed: number | undefined;
    let interpWidth: number | undefined;

    if (metricPoints.length > 2) {
      const p0 = metricPoints[Math.max(0, segIdx - 1)];
      const p1 = pA;
      const p2 = pB;
      const p3 = metricPoints[Math.min(metricPoints.length - 1, segIdx + 2)];

      interpX = evalCatmullRomSpline(p0.x, p1.x, p2.x, p3.x, t);
      interpY = evalCatmullRomSpline(p0.y, p1.y, p2.y, p3.y, t);

      if (p1.raw.bedElevationM !== undefined && p2.raw.bedElevationM !== undefined) {
        const z0 = p0.raw.bedElevationM ?? p1.raw.bedElevationM;
        const z1 = p1.raw.bedElevationM;
        const z2 = p2.raw.bedElevationM;
        const z3 = p3.raw.bedElevationM ?? p2.raw.bedElevationM;
        interpBed = evalCatmullRomSpline(z0, z1, z2, z3, t);
      }

      if (p1.raw.widthM !== undefined && p2.raw.widthM !== undefined) {
        const w0 = p0.raw.widthM ?? p1.raw.widthM;
        const w1 = p1.raw.widthM;
        const w2 = p2.raw.widthM;
        const w3 = p3.raw.widthM ?? p2.raw.widthM;
        interpWidth = Math.max(5.0, evalCatmullRomSpline(w0, w1, w2, w3, t));
      }
    } else {
      interpX = pA.x + t * (pB.x - pA.x);
      interpY = pA.y + t * (pB.y - pA.y);
      interpBed =
        pA.raw.bedElevationM !== undefined && pB.raw.bedElevationM !== undefined
          ? pA.raw.bedElevationM + t * (pB.raw.bedElevationM - pA.raw.bedElevationM)
          : undefined;
      interpWidth =
        pA.raw.widthM !== undefined && pB.raw.widthM !== undefined
          ? pA.raw.widthM + t * (pB.raw.widthM - pA.raw.widthM)
          : undefined;
    }

    const [interpLat, interpLng] = localMetersToGeo(interpX, interpY, originLat, originLng);

    resampled.push({
      lat: interpLat,
      lng: interpLng,
      stationM: sTarget,
      bedElevationM: interpBed,
      widthM: interpWidth,
    });
  }

  return resampled;
}

export interface RiverMeshOptions {
  targetStreamwiseSpacingM?: number;     // Target Δx spacing in meters
  streamwiseCellsCount?: number;         // Explicit nx cell count
  transverseCellsCount?: number;         // Explicit ny lateral cells
  domainWidthMultiplier?: number;        // Active channel width scale
  channelWidthScaling?: number;          // Alias for domainWidthMultiplier
  lateralFloodplainWidthM?: number;      // Lateral floodplain width on both banks (meters)
  localRefinementStructures?: RiverHydraulicStructure[]; // Structures around which to refine
  localRefinementRatio?: number;         // Local grading/refinement ratio (e.g. 1.5 - 3.0)
  localRefinementRadiusM?: number;       // Radius around structure to apply refinement (m)
  originOffsetXM?: number;               // Mesh translation East (m)
  originOffsetYM?: number;               // Mesh translation North (m)
  rotationAngleDeg?: number;             // Mesh rotation (deg)

  // Full-River Coverage & Intelligent Curvilinear Shortening along River Shape:
  shortenReachFraction?: number;         // Fraction of full river reach (0.05 to 1.0, default 1.0 = 100% full river)
  startStationM?: number;                // Starting longitudinal station along river (meters, default 0)
  endStationM?: number;                  // Ending longitudinal station along river (meters, default full river reach length)

  // Advanced Arbitrary Shape Generation, Elongation & Compression along River Shape:
  streamwiseStretchRatio?: number;       // Stretch (>1.0) or Compress/Shorten (<1.0) along river path (0.1x to 5.0x)
  longitudinalTaperRatio?: number;       // Linear width taper from inlet to outlet (0.2x convergent to 5.0x divergent)
  meanderCurvatureScale?: number;        // Amplify (>1.0) or straighten (0=straight flume) river centerline sinuosity
  asymmetricBankRatio?: number;          // Asymmetric lateral bank bias (-1.0 left heavy to +1.0 right heavy)
  sinusoidalWaveAmplitudeM?: number;     // Superimpose sinusoidal meandering wave amplitude (meters)
  sinusoidalWavePeriods?: number;        // Number of meandering wave cycles along reach
}

/**
 * Intelligent adaptive 2D shallow water mesh resolution estimator.
 * Calculates optimal streamwise cell count nx and spacing Δx so that
 * the aspect ratio (Δx / Δy) is ideally conditioned (~1.0 - 2.0) and
 * total cells remain computationally efficient (60 FPS on WebGPU / CPU).
 */
export function computeIntelligentMeshResolution(
  reachLengthM: number,
  meanWidthM: number,
  transverseCells: number = 8,
  options: { targetSpacingM?: number; explicitNx?: number; fullReachLengthM?: number } = {}
): { nx: number; targetSpacingM: number } {
  if (options.explicitNx && options.explicitNx > 1) {
    const nx = Math.max(2, Math.round(options.explicitNx));
    return { nx, targetSpacingM: reachLengthM / nx };
  }

  if (options.targetSpacingM && options.targetSpacingM > 0) {
    const nx = Math.max(2, Math.round(reachLengthM / options.targetSpacingM));
    return { nx, targetSpacingM: reachLengthM / nx };
  }

  const ny = Math.max(3, transverseCells);
  const deltaY = Math.max(2.0, (meanWidthM || 30.0) / ny);
  const idealDeltaX = Math.max(12.0, Math.min(120.0, deltaY * 1.5));

  const totalLength = options.fullReachLengthM && options.fullReachLengthM > 0
    ? options.fullReachLengthM
    : reachLengthM;

  const baseNx = Math.max(30, Math.min(160, Math.round(totalLength / idealDeltaX)));
  const spanRatio = Math.max(0.05, Math.min(1.0, reachLengthM / totalLength));
  const nx = Math.max(15, Math.round(baseNx * spanRatio));
  const actualSpacingM = reachLengthM / nx;

  return { nx, targetSpacingM: actualSpacingM };
}

/**
 * Generate 2D RiverGridMesh from reach definition with arbitrary shape deformation,
 * intelligent full-river coverage, curvilinear shortening along the river channel,
 * tapering, and sinuosity modulation.
 */
export function generateRiverGridMesh(
  reach: RiverReachDefinition,
  options: RiverMeshOptions = {}
): RiverGridMesh {
  const rawCenterline = reach.centerline;
  if (!rawCenterline || rawCenterline.length === 0) {
    throw new Error(`Reach ${reach.id} has an empty centerline`);
  }

  const originLat = rawCenterline[0].lat;
  const originLng = rawCenterline[0].lng;

  // 1. Build cumulative station distance metric coordinates along raw physical centerline
  const metricRaw: { x: number; y: number; station: number; raw: RiverCenterlinePoint }[] = [];
  let cumStation = 0;
  for (let i = 0; i < rawCenterline.length; i++) {
    const pt = rawCenterline[i];
    const [x, y] = geoToLocalMeters(pt.lat, pt.lng, originLat, originLng);
    if (i > 0) {
      const prev = metricRaw[i - 1];
      cumStation += Math.hypot(x - prev.x, y - prev.y);
    }
    metricRaw.push({ x, y, station: cumStation, raw: pt });
  }

  const rawTotalStation = Math.max(1.0, cumStation);
  const fullRiverLengthM = reach.reachLengthM && reach.reachLengthM > 0 ? reach.reachLengthM : rawTotalStation;
  // Station scale ensures stations match calibrated reachLengthM perfectly
  const stationScale = fullRiverLengthM / rawTotalStation;
  for (const p of metricRaw) {
    p.station *= stationScale;
  }
  const scaledTotalStation = fullRiverLengthM;

  // Determine reach coverage fraction & shortening along the true river channel
  let reachFraction = 1.0;
  if (options.shortenReachFraction !== undefined) {
    reachFraction = Math.max(0.05, Math.min(1.0, options.shortenReachFraction));
  } else if (options.streamwiseStretchRatio !== undefined && options.streamwiseStretchRatio < 1.0) {
    reachFraction = Math.max(0.05, Math.min(1.0, options.streamwiseStretchRatio));
  }

  const stretchRatio = Math.max(0.05, Math.min(10.0, options.streamwiseStretchRatio ?? 1.0));
  const isElongated = stretchRatio > 1.0 && options.shortenReachFraction === undefined;

  const startStationM = Math.max(0.0, Math.min(fullRiverLengthM - 10.0, options.startStationM ?? 0.0));
  let endStationM = options.endStationM !== undefined
    ? Math.max(startStationM + 10.0, Math.min(fullRiverLengthM, options.endStationM))
    : startStationM + (fullRiverLengthM - startStationM) * reachFraction;

  let effectiveReachLengthM = endStationM - startStationM;
  if (isElongated) {
    effectiveReachLengthM = fullRiverLengthM * stretchRatio;
  }

  const ny = Math.max(3, options.transverseCellsCount || 8);
  const widthMult = (options.channelWidthScaling ?? 1.0) * (options.domainWidthMultiplier ?? 1.0);
  const floodplainW = Math.max(0.0, options.lateralFloodplainWidthM ?? 0.0);
  const refStructures = options.localRefinementStructures || [];
  const refRatio = Math.max(1.0, options.localRefinementRatio ?? 1.0);
  const refRadiusM = Math.max(10.0, options.localRefinementRadiusM ?? 30.0);

  const taperRatio = Math.max(0.1, Math.min(10.0, options.longitudinalTaperRatio ?? 1.0));
  const curvatureScale = options.meanderCurvatureScale ?? 1.0;
  const bankSkew = Math.max(-1.0, Math.min(1.0, options.asymmetricBankRatio ?? 0.0));
  const waveAmpM = options.sinusoidalWaveAmplitudeM ?? 0.0;
  const wavePeriods = options.sinusoidalWavePeriods ?? 1.0;

  // Intelligent CFD discretization
  const res = computeIntelligentMeshResolution(
    effectiveReachLengthM,
    reach.meanWidthM * widthMult,
    ny,
    {
      explicitNx: options.streamwiseCellsCount,
      targetSpacingM: options.targetStreamwiseSpacingM,
      fullReachLengthM: fullRiverLengthM,
    }
  );
  const nx = res.nx;
  const targetSpacingM = res.targetSpacingM;

  function evalCatmullRomSpline(v0: number, v1: number, v2: number, v3: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      (2 * v1) +
      (-v0 + v2) * t +
      (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
      (-v0 + 3 * v1 - 3 * v2 + v3) * t3
    );
  }

  // Direction vector at outlet for tangential extrapolation when elongated
  const pEnd = metricRaw[metricRaw.length - 1];
  const pPrev = metricRaw[Math.max(0, metricRaw.length - 2)];
  const termDx = pEnd.x - pPrev.x;
  const termDy = pEnd.y - pPrev.y;
  const termLen = Math.hypot(termDx, termDy) || 1.0;
  const termUx = termDx / termLen;
  const termUy = termDy / termLen;

  // Resample centerline points along the curved river centerline spline
  const centerline: RiverCenterlinePoint[] = [];

  for (let k = 0; k <= nx; k++) {
    const sTarget = startStationM + k * targetSpacingM;

    let interpX: number;
    let interpY: number;
    let interpBed: number | undefined;
    let interpWidth: number | undefined;

    if (sTarget <= scaledTotalStation) {
      let segIdx = 0;
      while (segIdx < metricRaw.length - 2 && metricRaw[segIdx + 1].station < sTarget) {
        segIdx++;
      }
      const pA = metricRaw[segIdx];
      const pB = metricRaw[segIdx + 1] || pA;
      const segLen = Math.max(1.0e-5, pB.station - pA.station);
      const t = Math.max(0, Math.min(1, (sTarget - pA.station) / segLen));

      if (metricRaw.length > 2) {
        const p0 = metricRaw[Math.max(0, segIdx - 1)];
        const p1 = pA;
        const p2 = pB;
        const p3 = metricRaw[Math.min(metricRaw.length - 1, segIdx + 2)];

        interpX = evalCatmullRomSpline(p0.x, p1.x, p2.x, p3.x, t);
        interpY = evalCatmullRomSpline(p0.y, p1.y, p2.y, p3.y, t);

        if (p1.raw.bedElevationM !== undefined && p2.raw.bedElevationM !== undefined) {
          const z0 = p0.raw.bedElevationM ?? p1.raw.bedElevationM;
          const z1 = p1.raw.bedElevationM;
          const z2 = p2.raw.bedElevationM;
          const z3 = p3.raw.bedElevationM ?? p2.raw.bedElevationM;
          interpBed = evalCatmullRomSpline(z0, z1, z2, z3, t);
        }

        if (p1.raw.widthM !== undefined && p2.raw.widthM !== undefined) {
          const w0 = p0.raw.widthM ?? p1.raw.widthM;
          const w1 = p1.raw.widthM;
          const w2 = p2.raw.widthM;
          const w3 = p3.raw.widthM ?? p2.raw.widthM;
          interpWidth = Math.max(5.0, evalCatmullRomSpline(w0, w1, w2, w3, t));
        }
      } else {
        interpX = pA.x + t * (pB.x - pA.x);
        interpY = pA.y + t * (pB.y - pA.y);
        interpBed = pA.raw.bedElevationM;
        interpWidth = pA.raw.widthM;
      }
    } else {
      // Extrapolate smoothly beyond downstream terminus along outlet vector
      const excessDist = (sTarget - scaledTotalStation) / stationScale;
      interpX = pEnd.x + termUx * excessDist;
      interpY = pEnd.y + termUy * excessDist;
      interpBed = pEnd.raw.bedElevationM;
      interpWidth = pEnd.raw.widthM;
    }

    const [interpLat, interpLng] = localMetersToGeo(interpX, interpY, originLat, originLng);
    centerline.push({
      lat: interpLat,
      lng: interpLng,
      stationM: sTarget - startStationM,
      bedElevationM: interpBed,
      widthM: interpWidth,
    });
  }

  // Apply meander curvature modulation or harmonic sine wave only when explicitly modified from 1.0 / 0.0
  if ((curvatureScale !== 1.0 || waveAmpM > 0.0) && centerline.length > 1) {
    const pStart = centerline[0];
    const pTerminal = centerline[centerline.length - 1];
    const [startLocalX, startLocalY] = geoToLocalMeters(pStart.lat, pStart.lng, originLat, originLng);
    const [endLocalX, endLocalY] = geoToLocalMeters(pTerminal.lat, pTerminal.lng, originLat, originLng);
    const chordDx = endLocalX - startLocalX;
    const chordDy = endLocalY - startLocalY;
    const chordLen = Math.max(1.0, Math.hypot(chordDx, chordDy));
    const chordUx = chordDx / chordLen;
    const chordUy = chordDy / chordLen;
    const chordNormX = -chordUy;
    const chordNormY = chordUx;

    for (let k = 0; k < centerline.length; k++) {
      const pt = centerline[k];
      const [mX, mY] = geoToLocalMeters(pt.lat, pt.lng, originLat, originLng);
      const frac = k / Math.max(1, centerline.length - 1);
      const chordX = startLocalX + frac * chordDx;
      const chordY = startLocalY + frac * chordDy;
      const devX = mX - chordX;
      const devY = mY - chordY;

      let shapedX = chordX + devX * curvatureScale;
      let shapedY = chordY + devY * curvatureScale;

      if (waveAmpM > 0.0) {
        const sineOffset = waveAmpM * Math.sin(2.0 * Math.PI * wavePeriods * frac);
        shapedX += sineOffset * chordNormX;
        shapedY += sineOffset * chordNormY;
      }

      const [newLat, newLng] = localMetersToGeo(shapedX, shapedY, originLat, originLng);
      pt.lat = newLat;
      pt.lng = newLng;
    }
  }

  // 2. Generate mesh nodes (nx + 1 stations by ny + 1 lateral points)
  interface MeshNode {
    lat: number;
    lng: number;
    x: number;
    y: number;
    bedElevation: number;
  }

  const nodes: MeshNode[][] = [];

  for (let i = 0; i <= nx; i++) {
    const pt = centerline[i];
    const [cx, cy] = geoToLocalMeters(pt.lat, pt.lng, originLat, originLng);
    const stationFrac = i / Math.max(1, nx);

    // Dynamic longitudinal width taper (TaperRatio: 0.5 = converging gorge, 2.0 = expanding delta)
    const localTaper = 1.0 + (taperRatio - 1.0) * stationFrac;

    // Centered tangent vector for smooth curvilinear mesh grid alignment
    let tx = 1.0;
    let ty = 0.0;

    if (i > 0 && i < nx) {
      const nextPt = centerline[i + 1];
      const prevPt = centerline[i - 1];
      const [nxX, nxY] = geoToLocalMeters(nextPt.lat, nextPt.lng, originLat, originLng);
      const [pxX, pxY] = geoToLocalMeters(prevPt.lat, prevPt.lng, originLat, originLng);
      tx = nxX - pxX;
      ty = nxY - pxY;
    } else if (i < nx) {
      const nextPt = centerline[i + 1];
      const [nxX, nxY] = geoToLocalMeters(nextPt.lat, nextPt.lng, originLat, originLng);
      tx = nxX - cx;
      ty = nxY - cy;
    } else if (i > 0) {
      const prevPt = centerline[i - 1];
      const [pxX, pxY] = geoToLocalMeters(prevPt.lat, prevPt.lng, originLat, originLng);
      tx = cx - pxX;
      ty = cy - pxY;
    }

    const tLen = Math.max(1.0e-5, Math.hypot(tx, ty));
    tx /= tLen;
    ty /= tLen;

    // Outward unit normal vector to the right
    const normX = -ty;
    const normY = tx;

    // Cross-section width at this station + lateral floodplain extension with tapering
    const baseChannelWidth = (pt.widthM || reach.meanWidthM || 30.0) * widthMult * localTaper;
    const totalWidth = baseChannelWidth + 2.0 * floodplainW * localTaper;
    const halfWidth = totalWidth / 2.0;

    // Check proximity to solid structures for OpenFOAM-style boundary layer refinement / grading
    let structureDistM = Infinity;
    let targetEta = 0.0;

    if (refStructures.length > 0 && refRatio > 1.0) {
      for (const s of refStructures) {
        if (!s.enabled) continue;
        const actualStation = (pt.stationM ?? 0) + startStationM;
        const sDist = Math.abs(actualStation - (s.stationM ?? 0));
        if (sDist < structureDistM) {
          structureDistM = sDist;
          if (s.type === 'spurdike') {
            targetEta = (s as any).bank === 'right' ? 0.65 : -0.65;
          } else if (s.type === 'levee') {
            targetEta = -0.75;
          } else {
            targetEta = 0.0;
          }
        }
      }
    }

    const inRefinementZone = structureDistM < refRadiusM;
    const refineWeight = inRefinementZone
      ? (1.0 - structureDistM / refRadiusM) * ((refRatio - 1.0) / (refRatio + 1.0))
      : 0.0;

    // Continuous longitudinal cross-section interpolation
    const sections = reach.crossSections;
    let csA: CrossSectionStation | null = null;
    let csB: CrossSectionStation | null = null;
    let blendT = 0.0;

    if (sections && sections.length > 0) {
      const baseStation = (pt.stationM ?? 0) + startStationM;
      if (sections.length === 1 || baseStation <= sections[0].stationM) {
        csA = sections[0];
        csB = sections[0];
        blendT = 0.0;
      } else if (baseStation >= sections[sections.length - 1].stationM) {
        csA = sections[sections.length - 1];
        csB = sections[sections.length - 1];
        blendT = 1.0;
      } else {
        for (let k = 0; k < sections.length - 1; k++) {
          if (baseStation >= sections[k].stationM && baseStation <= sections[k + 1].stationM) {
            csA = sections[k];
            csB = sections[k + 1];
            const dS = Math.max(1.0, csB.stationM - csA.stationM);
            blendT = (baseStation - csA.stationM) / dS;
            break;
          }
        }
      }
    }

    const stationInvert = pt.bedElevationM ?? csA?.invertElevM ?? 100.0;

    // Centerline curvature for authentic thalweg migration in bends
    let bendShiftM = 0.0;
    if (i > 0 && i < nx) {
      const prevPt = centerline[i - 1];
      const nextPt = centerline[i + 1];
      const [pxX, pxY] = geoToLocalMeters(prevPt.lat, prevPt.lng, originLat, originLng);
      const [nxX, nxY] = geoToLocalMeters(nextPt.lat, nextPt.lng, originLat, originLng);
      const d1x = cx - pxX, d1y = cy - pxY;
      const d2x = nxX - cx, d2y = nxY - cy;
      const cross = d1x * d2y - d1y * d2x;
      const l1 = Math.max(1, Math.hypot(d1x, d1y));
      const l2 = Math.max(1, Math.hypot(d2x, d2y));
      const kappa = cross / (l1 * l2);
      bendShiftM = Math.max(-0.35, Math.min(0.35, kappa * 2.0)) * halfWidth;
    }

    const rowNodes: MeshNode[] = [];
    for (let j = 0; j <= ny; j++) {
      // Base lateral fraction from -1 (left bank) to +1 (right bank)
      let eta = -1.0 + (2.0 * j) / ny;

      // Apply asymmetric bank skew (-1.0 left heavy to +1.0 right heavy)
      if (bankSkew !== 0.0) {
        eta = eta + bankSkew * (1.0 - eta * eta) * 0.45;
      }

      // Apply boundary layer cell grading towards solid structures
      if (refineWeight > 0.0) {
        const dEta = (targetEta - eta) * refineWeight * (1.0 - Math.abs(eta) * 0.4);
        eta = Math.max(-1.0, Math.min(1.0, eta + dEta));
      }

      const lateralDistM = eta * halfWidth;

      const nodeX = cx + lateralDistM * normX;
      const nodeY = cy + lateralDistM * normY;
      const [nodeLat, nodeLng] = localMetersToGeo(nodeX, nodeY, originLat, originLng);

      // Bed elevation calculation across section & floodplain with authentic thalweg and bank benches
      let nodeBed = stationInvert;
      if (csA && csB && csA.points.length > 0 && csB.points.length > 0) {
        const shiftedLateralM = lateralDistM - bendShiftM;
        const dzA = sampleCrossSectionElevation(csA.points, shiftedLateralM, csA.invertElevM) - csA.invertElevM;
        const dzB = sampleCrossSectionElevation(csB.points, shiftedLateralM, csB.invertElevM) - csB.invertElevM;
        const dz = (1.0 - blendT) * dzA + blendT * dzB;
        nodeBed = stationInvert + Math.max(0.0, dz);
      } else if (csA && csA.points.length > 0) {
        const shiftedLateralM = lateralDistM - bendShiftM;
        const dz = sampleCrossSectionElevation(csA.points, shiftedLateralM, csA.invertElevM) - csA.invertElevM;
        nodeBed = stationInvert + Math.max(0.0, dz);
      } else {
        const channelHalfW = baseChannelWidth * 0.5;
        const depth = Math.max(1.0, baseChannelWidth * 0.06);
        const relX = lateralDistM - bendShiftM;
        if (Math.abs(lateralDistM) <= channelHalfW) {
          const frac = relX / Math.max(1.0, channelHalfW);
          nodeBed = stationInvert + depth * Math.min(1.0, frac * frac);
        } else {
          // Elevated floodplain terrace
          const overbankDist = Math.abs(lateralDistM) - channelHalfW;
          nodeBed = stationInvert + depth + 0.35 + overbankDist * 0.015;
        }
      }

      rowNodes.push({
        lat: nodeLat,
        lng: nodeLng,
        x: nodeX,
        y: nodeY,
        bedElevation: nodeBed,
      });
    }
    nodes.push(rowNodes);
  }

  // 3. Assemble finite-volume quad cells
  const cells: RiverGridCell[] = [];
  let cellIdCounter = 0;

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      // 4 corners of the quad: (i, j), (i+1, j), (i+1, j+1), (i, j+1)
      const n00 = nodes[i][j];
      const n10 = nodes[i + 1][j];
      const n11 = nodes[i + 1][j + 1];
      const n01 = nodes[i][j + 1];

      const corners: [number, number][] = [
        [n00.lat, n00.lng],
        [n10.lat, n10.lng],
        [n11.lat, n11.lng],
        [n01.lat, n01.lng],
      ];

      // Centroid
      const centerX = 0.25 * (n00.x + n10.x + n11.x + n01.x);
      const centerY = 0.25 * (n00.y + n10.y + n11.y + n01.y);
      const [centerLat, centerLng] = localMetersToGeo(centerX, centerY, originLat, originLng);

      // Average bed elevation & Manning roughness
      const avgBed = 0.25 * (n00.bedElevation + n10.bedElevation + n11.bedElevation + n01.bedElevation);
      const manningN = reach.defaultManningN || 0.035;

      // Area of quad via shoelace formula
      const areaM2 = Math.abs(
        0.5 *
          ((n00.x * n10.y - n10.x * n00.y) +
            (n10.x * n11.y - n11.x * n10.y) +
            (n11.x * n01.y - n01.x * n11.y) +
            (n01.x * n00.y - n00.x * n01.y))
      );

      // 4 Faces:
      // Face 0: n00 -> n10 (Left bank / bottom side)
      // Face 1: n10 -> n11 (Downstream side)
      // Face 2: n11 -> n01 (Right bank / top side)
      // Face 3: n01 -> n00 (Upstream side)
      const faceSegments: [MeshNode, MeshNode][] = [
        [n00, n10],
        [n10, n11],
        [n11, n01],
        [n01, n00],
      ];

      const faceLengths: number[] = [];
      const faceNormals: [number, number][] = [];

      for (const [pA, pB] of faceSegments) {
        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const len = Math.max(1.0e-5, Math.hypot(dx, dy));
        faceLengths.push(len);
        // Outward normal: (dy, -dx) / len
        faceNormals.push([dy / len, -dx / len]);
      }

      // Neighbor cell IDs:
      // Index mapping: cellId = i * ny + j
      // Face 0 (j-1): internal neighbor or -3 (left boundary)
      const nbr0 = j > 0 ? i * ny + (j - 1) : -3;
      // Face 1 (i+1): internal neighbor or -2 (downstream boundary)
      const nbr1 = i < nx - 1 ? (i + 1) * ny + j : -2;
      // Face 2 (j+1): internal neighbor or -4 (right boundary)
      const nbr2 = j < ny - 1 ? i * ny + (j + 1) : -4;
      // Face 3 (i-1): internal neighbor or -1 (upstream boundary)
      const nbr3 = i > 0 ? (i - 1) * ny + j : -1;

      let isBoundary: RiverGridCell['isBoundary'] = undefined;
      if (i === 0) isBoundary = 'upstream';
      else if (i === nx - 1) isBoundary = 'downstream';
      else if (j === 0) isBoundary = 'left_bank';
      else if (j === ny - 1) isBoundary = 'right_bank';

      cells.push({
        id: cellIdCounter++,
        i,
        j,
        centerLat,
        centerLng,
        centerX,
        centerY,
        bedElevation: avgBed,
        manningN,
        areaM2: Math.max(areaM2, 1.0),
        corners,
        neighbors: [nbr0, nbr1, nbr2, nbr3],
        faceLengths,
        faceNormals,
        isBoundary,
      });
    }
  }

  // Compute bounding box [minLat, minLng, maxLat, maxLng]
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const cell of cells) {
    for (const [cLat, cLng] of cell.corners) {
      if (cLat < minLat) minLat = cLat;
      if (cLat > maxLat) maxLat = cLat;
      if (cLng < minLng) minLng = cLng;
      if (cLng > maxLng) maxLng = cLng;
    }
  }

  let finalMesh: RiverGridMesh = {
    id: reach.id,
    name: reach.name,
    description: reach.description,
    source: reach.source,
    reachLengthM: effectiveReachLengthM,
    meanWidthM: (reach.meanWidthM || 30.0) * widthMult + 2.0 * floodplainW,
    nx,
    ny,
    cells,
    centerline,
    bounds: [minLat, minLng, maxLat, maxLng],
    surveyedBathymetryApplied: false,
  };

  if ((options.originOffsetXM && options.originOffsetXM !== 0) || (options.originOffsetYM && options.originOffsetYM !== 0)) {
    finalMesh = translateMesh(finalMesh, options.originOffsetXM || 0, options.originOffsetYM || 0);
  }

  if (options.rotationAngleDeg && options.rotationAngleDeg !== 0) {
    finalMesh = rotateMesh(finalMesh, options.rotationAngleDeg);
  }

  return finalMesh;
}

function findClosestCrossSection(
  sections: CrossSectionStation[],
  stationM: number
): CrossSectionStation | null {
  if (!sections || sections.length === 0) return null;
  let closest = sections[0];
  let minDiff = Math.abs(sections[0].stationM - stationM);

  for (let k = 1; k < sections.length; k++) {
    const diff = Math.abs(sections[k].stationM - stationM);
    if (diff < minDiff) {
      minDiff = diff;
      closest = sections[k];
    }
  }

  return closest;
}

/**
 * Interactively translate the entire computational mesh by offsetXM and offsetYM (meters)
 */
export function translateMesh(
  mesh: RiverGridMesh,
  offsetXM: number,
  offsetYM: number
): RiverGridMesh {
  if (offsetXM === 0 && offsetYM === 0) return mesh;

  const originLat = mesh.centerline[0]?.lat || (mesh.bounds[0] + mesh.bounds[2]) * 0.5;
  const dLat = offsetYM / METERS_PER_DEG_LAT;
  const dLng = offsetXM / (METERS_PER_DEG_LAT * Math.max(0.1, Math.cos((originLat * Math.PI) / 180.0)));

  const updatedCells: RiverGridCell[] = mesh.cells.map((cell) => {
    const updatedCorners: [number, number][] = cell.corners.map(([cLat, cLng]) => [
      cLat + dLat,
      cLng + dLng,
    ]);

    return {
      ...cell,
      centerX: cell.centerX + offsetXM,
      centerY: cell.centerY + offsetYM,
      centerLat: cell.centerLat + dLat,
      centerLng: cell.centerLng + dLng,
      corners: updatedCorners,
    };
  });

  const updatedCenterline: RiverCenterlinePoint[] = mesh.centerline.map((pt) => ({
    ...pt,
    lat: pt.lat + dLat,
    lng: pt.lng + dLng,
  }));

  // Strictly recompute bounding box from all shifted cell corners
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const c of updatedCells) {
    for (const [lat, lng] of c.corners) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }

  const bounds: [number, number, number, number] = isFinite(minLat)
    ? [minLat, minLng, maxLat, maxLng]
    : [mesh.bounds[0] + dLat, mesh.bounds[1] + dLng, mesh.bounds[2] + dLat, mesh.bounds[3] + dLng];

  return {
    ...mesh,
    cells: updatedCells,
    centerline: updatedCenterline,
    bounds,
  };
}

/**
 * Interactively rotate the computational mesh by angleDeg (degrees) around a pivot
 */
export function rotateMesh(
  mesh: RiverGridMesh,
  angleDeg: number,
  pivot?: [number, number] // [pivotLat, pivotLng]
): RiverGridMesh {
  if (angleDeg === 0 || mesh.cells.length === 0) return mesh;

  const rad = (angleDeg * Math.PI) / 180.0;
  const cosT = Math.cos(rad);
  const sinT = Math.sin(rad);

  const pivotLat = pivot ? pivot[0] : (mesh.bounds[0] + mesh.bounds[2]) * 0.5;
  const pivotLng = pivot ? pivot[1] : (mesh.bounds[1] + mesh.bounds[3]) * 0.5;
  const cosLat = Math.cos((pivotLat * Math.PI) / 180.0);

  const meshCenterLat = (mesh.bounds[0] + mesh.bounds[2]) * 0.5;
  const meshCenterLng = (mesh.bounds[1] + mesh.bounds[3]) * 0.5;

  let minCellX = Infinity, maxCellX = -Infinity;
  let minCellY = Infinity, maxCellY = -Infinity;
  for (const c of mesh.cells) {
    if (c.centerX < minCellX) minCellX = c.centerX;
    if (c.centerX > maxCellX) maxCellX = c.centerX;
    if (c.centerY < minCellY) minCellY = c.centerY;
    if (c.centerY > maxCellY) maxCellY = c.centerY;
  }
  const metricCenterXM = (minCellX + maxCellX) * 0.5;
  const metricCenterYM = (minCellY + maxCellY) * 0.5;

  const dPivotLat = pivotLat - meshCenterLat;
  const dPivotLng = pivotLng - meshCenterLng;
  const dPivotYM = dPivotLat * METERS_PER_DEG_LAT;
  const dPivotXM = dPivotLng * METERS_PER_DEG_LAT * cosLat;
  const pivotXM = metricCenterXM + dPivotXM;
  const pivotYM = metricCenterYM + dPivotYM;

  const rotateCoord = (lat: number, lng: number): [number, number] => {
    const yM = (lat - pivotLat) * METERS_PER_DEG_LAT;
    const xM = (lng - pivotLng) * METERS_PER_DEG_LAT * cosLat;
    const rotXM = xM * cosT - yM * sinT;
    const rotYM = xM * sinT + yM * cosT;
    const newLat = pivotLat + rotYM / METERS_PER_DEG_LAT;
    const newLng = pivotLng + rotXM / (METERS_PER_DEG_LAT * cosLat);
    return [newLat, newLng];
  };

  const updatedCells: RiverGridCell[] = mesh.cells.map((cell) => {
    const [cLat, cLng] = rotateCoord(cell.centerLat, cell.centerLng);
    const updatedCorners: [number, number][] = cell.corners.map(([lat, lng]) => rotateCoord(lat, lng));

    // Rotate face normals
    const updatedNormals: [number, number][] = cell.faceNormals.map(([nx, ny]) => [
      nx * cosT - ny * sinT,
      nx * sinT + ny * cosT,
    ]);

    // Rigidly rotate metric centerX, centerY around pivotXM, pivotYM
    const relX = cell.centerX - pivotXM;
    const relY = cell.centerY - pivotYM;
    const newCenterX = pivotXM + (relX * cosT - relY * sinT);
    const newCenterY = pivotYM + (relX * sinT + relY * cosT);

    return {
      ...cell,
      centerX: newCenterX,
      centerY: newCenterY,
      centerLat: cLat,
      centerLng: cLng,
      corners: updatedCorners,
      faceNormals: updatedNormals,
    };
  });

  const updatedCenterline: RiverCenterlinePoint[] = mesh.centerline.map((pt) => {
    const [rLat, rLng] = rotateCoord(pt.lat, pt.lng);
    return { ...pt, lat: rLat, lng: rLng };
  });

  // Recompute bounding box
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const c of updatedCells) {
    for (const [lat, lng] of c.corners) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }

  const bounds: [number, number, number, number] = isFinite(minLat)
    ? [minLat, minLng, maxLat, maxLng]
    : [mesh.bounds[0], mesh.bounds[1], mesh.bounds[2], mesh.bounds[3]];

  return {
    ...mesh,
    cells: updatedCells,
    centerline: updatedCenterline,
    bounds,
  };
}

/**
 * Center the entire computational mesh at a given target latitude and longitude
 */
export function centerMeshAt(
  mesh: RiverGridMesh,
  targetLat: number,
  targetLng: number
): RiverGridMesh {
  const currentCenterLat = (mesh.bounds[0] + mesh.bounds[2]) * 0.5;
  const currentCenterLng = (mesh.bounds[1] + mesh.bounds[3]) * 0.5;
  const cosLat = Math.cos((0.5 * (currentCenterLat + targetLat) * Math.PI) / 180.0);
  const dxM = (targetLng - currentCenterLng) * METERS_PER_DEG_LAT * cosLat;
  const dyM = (targetLat - currentCenterLat) * METERS_PER_DEG_LAT;
  return translateMesh(mesh, dxM, dyM);
}

/**
 * Shifts the mesh along the reach thalweg (stationShiftM) and laterally (lateralShiftM)
 */
export function shiftMeshAlongThalweg(
  reach: RiverReachDefinition,
  stationShiftM: number,
  lateralShiftM: number,
  targetSpacingM: number = 20.0,
  ny: number = 8
): RiverGridMesh {
  const baseMesh = generateRiverGridMesh(reach, {
    targetStreamwiseSpacingM: targetSpacingM,
    transverseCellsCount: ny,
  });
  if (stationShiftM === 0 && lateralShiftM === 0) return baseMesh;

  // Approximate metric vector based on centerline tangent
  const p0 = baseMesh.centerline[0];
  const p1 = baseMesh.centerline[baseMesh.centerline.length - 1];
  const dLat = p1.lat - p0.lat;
  const dLng = p1.lng - p0.lng;
  const len = Math.hypot(dLat, dLng) || 1e-5;

  const unitTx = dLng / len;
  const unitTy = dLat / len;
  const unitNx = -unitTy;
  const unitNy = unitTx;

  const totalShiftX = unitTx * stationShiftM + unitNx * lateralShiftM;
  const totalShiftY = unitTy * stationShiftM + unitNy * lateralShiftM;

  return translateMesh(baseMesh, totalShiftX, totalShiftY);
}

/**
 * Directly scales or elongates/compresses an existing computational mesh along its
 * longitudinal (streamwise) and lateral directions, recalculating quad cell areas,
 * face lengths, and updated geodetic bounds.
 */
export function scaleMesh(
  mesh: RiverGridMesh,
  streamwiseScale: number = 1.0,
  lateralScale: number = 1.0
): RiverGridMesh {
  if (streamwiseScale === 1.0 && lateralScale === 1.0) return mesh;

  const originLat = mesh.centerline[0]?.lat || (mesh.bounds[0] + mesh.bounds[2]) * 0.5;
  const originLng = mesh.centerline[0]?.lng || (mesh.bounds[1] + mesh.bounds[3]) * 0.5;
  const pEnd = mesh.centerline[mesh.centerline.length - 1] || mesh.centerline[0];
  const [endX, endY] = geoToLocalMeters(pEnd.lat, pEnd.lng, originLat, originLng);
  const reachLength = Math.max(1.0, Math.hypot(endX, endY));
  const tX = endX / reachLength;
  const tY = endY / reachLength;
  const nX = -tY;
  const nY = tX;

  const updatedCells: RiverGridCell[] = mesh.cells.map((cell) => {
    // Project cell corners into local longitudinal (s) and lateral (n) coordinates
    const updatedCorners: [number, number][] = cell.corners.map(([cLat, cLng]) => {
      const [mX, mY] = geoToLocalMeters(cLat, cLng, originLat, originLng);
      const s = mX * tX + mY * tY;
      const n = mX * nX + mY * nY;
      const sScaled = s * streamwiseScale;
      const nScaled = n * lateralScale;
      const scaledX = sScaled * tX + nScaled * nX;
      const scaledY = sScaled * tY + nScaled * nY;
      return localMetersToGeo(scaledX, scaledY, originLat, originLng);
    });

    // Scaled centroid
    const [cMX, cMY] = geoToLocalMeters(cell.centerLat, cell.centerLng, originLat, originLng);
    const cs = cMX * tX + cMY * tY;
    const cn = cMX * nX + cMY * nY;
    const csScaled = cs * streamwiseScale;
    const cnScaled = cn * lateralScale;
    const scaledCX = csScaled * tX + cnScaled * nX;
    const scaledCY = csScaled * tY + cnScaled * nY;
    const [newCenterLat, newCenterLng] = localMetersToGeo(scaledCX, scaledCY, originLat, originLng);

    // Recompute face lengths
    const faceLengths: number[] = [];
    for (let f = 0; f < 4; f++) {
      const pA = updatedCorners[f];
      const pB = updatedCorners[(f + 1) % 4];
      const [ax, ay] = geoToLocalMeters(pA[0], pA[1], originLat, originLng);
      const [bx, by] = geoToLocalMeters(pB[0], pB[1], originLat, originLng);
      faceLengths.push(Math.max(1.0e-4, Math.hypot(bx - ax, by - ay)));
    }

    return {
      ...cell,
      centerX: scaledCX,
      centerY: scaledCY,
      centerLat: newCenterLat,
      centerLng: newCenterLng,
      corners: updatedCorners,
      areaM2: Math.max(1.0, cell.areaM2 * streamwiseScale * lateralScale),
      faceLengths,
    };
  });

  const updatedCenterline: RiverCenterlinePoint[] = mesh.centerline.map((pt) => {
    const [mX, mY] = geoToLocalMeters(pt.lat, pt.lng, originLat, originLng);
    const s = mX * tX + mY * tY;
    const n = mX * nX + mY * nY;
    const scaledX = s * streamwiseScale * tX + n * lateralScale * nX;
    const scaledY = s * streamwiseScale * tY + n * lateralScale * nY;
    const [newLat, newLng] = localMetersToGeo(scaledX, scaledY, originLat, originLng);
    return {
      ...pt,
      lat: newLat,
      lng: newLng,
      stationM: (pt.stationM ?? 0) * streamwiseScale,
    };
  });

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const c of updatedCells) {
    for (const [lat, lng] of c.corners) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }

  return {
    ...mesh,
    reachLengthM: mesh.reachLengthM * streamwiseScale,
    meanWidthM: mesh.meanWidthM * lateralScale,
    cells: updatedCells,
    centerline: updatedCenterline,
    bounds: [minLat, minLng, maxLat, maxLng],
  };
}


