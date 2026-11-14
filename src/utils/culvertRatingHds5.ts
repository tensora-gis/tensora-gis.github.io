/**
 * FHWA HDS-5 Culvert Hydraulics & Rating Curve Solver
 *
 * Implements the Federal Highway Administration (FHWA) Hydraulic Design of
 * Highway Culverts (HDS-5) formulation for:
 * 1. Unsubmerged & Submerged Inlet Control rating equations (Form 1 & Form 2)
 * 2. Full-barrel / Part-full Outlet Control energy balance [Eq. 1.7]
 * 3. Entrance loss Ke, friction loss (Manning), and velocity head
 * 4. Governing headwater calculation: HW = max(HWinlet, HWoutlet)
 * 5. Bidirectional rating curve lookup: Q(HW) and HW(Q)
 */

export type CulvertShape = 'circular' | 'box';

export type CulvertMaterial =
  | 'concrete-pipe'
  | 'corrugated-metal-pipe'
  | 'concrete-box'
  | 'smooth-hdpe';

export interface CulvertBarrelsDefinition {
  shape: CulvertShape;
  material: CulvertMaterial;
  diameterM?: number;       // For circular barrels (internal diameter D [m])
  spanM?: number;           // For box culverts (internal width B [m])
  riseM?: number;           // For box culverts (internal height D [m])
  numberOfBarrels: number;  // Number of parallel barrels
  lengthM: number;          // Total barrel length through formation L [m]
  slopeMPerM: number;       // Longitudinal culvert invert slope S0 [m/m]
  invertInletElevM: number; // Upstream inlet invert elevation [m]
  invertOutletElevM: number;// Downstream outlet invert elevation [m]
  manningN?: number;        // Barrel roughness n
  entranceLossKe?: number;  // Entrance loss coefficient Ke
}

export interface Hds5Coefficients {
  K: number;
  M: number;
  c: number;
  Y: number;
}

/**
 * Standard FHWA HDS-5 Inlet Control Design Coefficients (Table A.1)
 */
export const HDS5_INLET_COEFFICIENTS: Record<CulvertMaterial, Hds5Coefficients> = {
  'concrete-pipe': {
    K: 0.0098,
    M: 2.0,
    c: 0.0398,
    Y: 0.67,
  },
  'corrugated-metal-pipe': {
    K: 0.0078,
    M: 2.0,
    c: 0.034,
    Y: 0.74,
  },
  'concrete-box': {
    K: 0.026,
    M: 1.0,
    c: 0.0385,
    Y: 0.81,
  },
  'smooth-hdpe': {
    K: 0.0098,
    M: 2.0,
    c: 0.0398,
    Y: 0.67,
  },
};

const G = 9.80665; // m/s^2

/**
 * Default Manning n roughness values for culvert materials
 */
export function getDefaultManningN(material: CulvertMaterial): number {
  switch (material) {
    case 'concrete-pipe':
    case 'concrete-box':
      return 0.013;
    case 'corrugated-metal-pipe':
      return 0.024;
    case 'smooth-hdpe':
      return 0.010;
  }
}

/**
 * Default entrance loss coefficient Ke
 */
export function getDefaultEntranceLossKe(material: CulvertMaterial): number {
  switch (material) {
    case 'concrete-pipe':
      return 0.50; // Square edge with headwall
    case 'concrete-box':
      return 0.50; // Wingwall flare 30 to 75 deg
    case 'corrugated-metal-pipe':
      return 0.90; // Projecting barrel
    case 'smooth-hdpe':
      return 0.50;
  }
}

export interface CulvertRatingPoint {
  dischargeM3s: number;
  headwaterInletM: number;
  headwaterOutletM: number;
  governingHeadwaterM: number;
  governingRegime: 'inlet-control' | 'outlet-control';
  barrelVelocityMPerSec: number;
  outletVelocityMPerSec: number;
}

/**
 * Computes the culvert hydraulic performance for a specified total discharge Q [m^3/s]
 * and downstream tailwater depth h_tw [m].
 */
export function solveCulvertRating(
  culvert: CulvertBarrelsDefinition,
  totalDischargeM3s: number,
  tailwaterDepthM: number = 0.5
): CulvertRatingPoint {
  const numBarrels = Math.max(1, culvert.numberOfBarrels);
  const qPerBarrel = Math.max(1e-5, totalDischargeM3s / numBarrels);

  const D = culvert.shape === 'circular'
    ? (culvert.diameterM || 1.0)
    : (culvert.riseM || 1.0);
  const B = culvert.shape === 'circular'
    ? D
    : (culvert.spanM || 1.0);

  const fullArea = culvert.shape === 'circular'
    ? (Math.PI * D * D) / 4.0
    : B * D;

  const fullWettedPerimeter = culvert.shape === 'circular'
    ? Math.PI * D
    : 2.0 * (B + D);

  const fullHydraulicRadius = fullArea / fullWettedPerimeter;

  const manningN = culvert.manningN || getDefaultManningN(culvert.material);
  const Ke = culvert.entranceLossKe || getDefaultEntranceLossKe(culvert.material);
  const L = Math.max(1.0, culvert.lengthM);
  const S = Math.max(0.0001, culvert.slopeMPerM);

  const coeffs = HDS5_INLET_COEFFICIENTS[culvert.material];

  // Parameter for inlet equations: AD^0.5
  const adSqrt = fullArea * Math.sqrt(D);
  const dischargeIntensity = qPerBarrel / adSqrt;

  // 1. INLET CONTROL
  // Form 1 (Unsubmerged): HW_i / D = Hc/D + K * (Q / (A*D^0.5))^M - 0.5*S
  // Hc is critical depth specific head ~ 1.5 * (q^2 / (g*B^2))^(1/3)
  const qUnitWidth = qPerBarrel / B;
  const criticalDepth = Math.pow((qUnitWidth * qUnitWidth) / G, 1.0 / 3.0);
  const Hc = criticalDepth + (qPerBarrel * qPerBarrel) / (2 * G * Math.pow(Math.max(0.01, criticalDepth * B), 2));

  const hwUnsubmerged = D * (
    (Hc / D) + coeffs.K * Math.pow(dischargeIntensity, coeffs.M) - 0.5 * S
  );

  // Form 2 (Submerged): HW_i / D = c * (Q / (A*D^0.5))^2 + Y - 0.5*S
  const hwSubmerged = D * (
    coeffs.c * Math.pow(dischargeIntensity, 2.0) + coeffs.Y - 0.5 * S
  );

  // Smooth blending across transition zone [3.5, 4.0]
  let hwInletAboveInvert: number;
  if (dischargeIntensity <= 3.5) {
    hwInletAboveInvert = hwUnsubmerged;
  } else if (dischargeIntensity >= 4.0) {
    hwInletAboveInvert = hwSubmerged;
  } else {
    const blend = (dischargeIntensity - 3.5) / 0.5;
    hwInletAboveInvert = (1.0 - blend) * hwUnsubmerged + blend * hwSubmerged;
  }

  const headwaterInletElevM = culvert.invertInletElevM + Math.max(0.01, hwInletAboveInvert);

  // 2. OUTLET CONTROL (Eq. 1.7)
  // HL = [Ke + 19.63 * n^2 * L / Rh^(4/3) + 1] * (V^2 / (2g))
  const barrelVelocity = qPerBarrel / fullArea;
  const frictionLossCoeff = (19.63 * manningN * manningN * L) / Math.pow(fullHydraulicRadius, 4.0 / 3.0);
  const totalLossCoeff = Ke + frictionLossCoeff + 1.0;
  const totalHeadLoss = totalLossCoeff * (barrelVelocity * barrelVelocity) / (2.0 * G);

  // Tailwater elevation or ho equivalent: ho = (dc + D)/2
  const ho = Math.min(D, (criticalDepth + D) * 0.5);
  const tailwaterDatum = culvert.invertOutletElevM + Math.max(tailwaterDepthM, ho);
  const headwaterOutletElevM = tailwaterDatum + totalHeadLoss;

  // 3. GOVERNING REGIME: Maximum required headwater
  const governingRegime = headwaterInletElevM >= headwaterOutletElevM
    ? ('inlet-control' as const)
    : ('outlet-control' as const);

  const governingHeadwaterM = Math.max(headwaterInletElevM, headwaterOutletElevM);

  return {
    dischargeM3s: totalDischargeM3s,
    headwaterInletM: headwaterInletElevM,
    headwaterOutletM: headwaterOutletElevM,
    governingHeadwaterM,
    governingRegime,
    barrelVelocityMPerSec: barrelVelocity,
    outletVelocityMPerSec: barrelVelocity,
  };
}

/**
 * Computes the culvert discharge Q [m^3/s] given an allowable headwater elevation HW [m]
 * using bisection search.
 */
export function solveCulvertDischargeForHeadwater(
  culvert: CulvertBarrelsDefinition,
  targetHeadwaterElevM: number,
  tailwaterDepthM: number = 0.5
): number {
  if (targetHeadwaterElevM <= culvert.invertInletElevM) {
    return 0.0;
  }

  let qLow = 0.001;
  let qHigh = 100.0; // Initial high guess

  // Expand high bracket if needed
  while (solveCulvertRating(culvert, qHigh, tailwaterDepthM).governingHeadwaterM < targetHeadwaterElevM) {
    qHigh *= 2.0;
    if (qHigh > 5000.0) break;
  }

  // Bisection
  for (let iter = 0; iter < 40; iter++) {
    const qMid = 0.5 * (qLow + qHigh);
    const res = solveCulvertRating(culvert, qMid, tailwaterDepthM);
    const diff = res.governingHeadwaterM - targetHeadwaterElevM;

    if (Math.abs(diff) < 0.001 || (qHigh - qLow) < 0.001) {
      return qMid;
    }

    if (diff > 0) {
      qHigh = qMid;
    } else {
      qLow = qMid;
    }
  }

  return 0.5 * (qLow + qHigh);
}
