/**
 * Empirical Hydraulic Geometry Gap-Filler
 *
 * Implements Section 4.2 of the Global River Digital Twin Plan.
 * When surveyed bathymetry is unavailable, computes channel geometry using
 * classical empirical hydraulic geometry laws (Leopold-Maddock 1953):
 *   Width:   w = a * Q^b  (default b ≈ 0.50)
 *   Depth:   h = c * Q^d  (default c ≈ 0.27, d ≈ 0.39, h ∝ Q^0.4)
 *   Velocity: v = k * Q^m  (default m ≈ 0.10)
 *
 * Flags accuracy tier as 'Estimated (Global)' with no fabricated bathymetry.
 */

export interface EmpiricalGeometry {
  widthM: number;
  depthM: number;
  velocityMs: number;
  bottomWidthM: number;
  sideSlopeHtoV: number;
  tier: 'Estimated (Global)';
}

export function computeEmpiricalHydraulicGeometry(
  dischargeM3s: number,
  knownWidthM?: number,
  coefficients: {
    depthCoeffC?: number;
    depthExpD?: number;
    sideSlopeHtoV?: number;
  } = {}
): EmpiricalGeometry {
  const Q = Math.max(0.1, dischargeM3s);
  const c = coefficients.depthCoeffC || 0.27;
  const d = coefficients.depthExpD || 0.39;
  const sideSlopeHtoV = coefficients.sideSlopeHtoV || 1.5;

  // 1. River width from GRWL if known, otherwise empirical power law
  const widthM = knownWidthM && knownWidthM > 5 ? knownWidthM : Math.max(6.0, 7.2 * Math.pow(Q, 0.5));

  // 2. Active channel depth (h ∝ Q^0.4)
  const depthM = Math.max(0.8, c * Math.pow(Q, d));

  // 3. Trapezoidal bottom width: W_bottom = max(2.0, W_top - 2 * sideSlope * depth)
  const bottomWidthM = Math.max(2.0, widthM - 2.0 * sideSlopeHtoV * depthM);

  // 4. Mean velocity continuity check: v = Q / A
  const channelAreaM2 = (bottomWidthM + sideSlopeHtoV * depthM) * depthM;
  const velocityMs = Math.max(0.1, Math.min(6.0, Q / Math.max(1.0, channelAreaM2)));

  return {
    widthM: parseFloat(widthM.toFixed(1)),
    depthM: parseFloat(depthM.toFixed(2)),
    velocityMs: parseFloat(velocityMs.toFixed(2)),
    bottomWidthM: parseFloat(bottomWidthM.toFixed(1)),
    sideSlopeHtoV,
    tier: 'Estimated (Global)',
  };
}
