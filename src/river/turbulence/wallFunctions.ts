/**
 * Near-Bed Turbulence Wall Functions & Friction Velocity
 *
 * Implements standard logarithmic boundary layer physics:
 * - Friction velocity u* from Manning bed shear stress
 * - Equivalent sand grain roughness height ks and roughness length y0
 * - Equilibrium bed boundary conditions for k, epsilon, and omega
 */

const G = 9.80665;
const KAPPA = 0.41;

/**
 * Computes shear friction velocity u* = sqrt(tau_b / rho) = n * sqrt(g) * |V| / h^(1/6)
 */
export function computeFrictionVelocity(
  velMag: number,
  h: number,
  manningN: number
): number {
  if (h <= 1e-4 || velMag <= 1e-4) return 1e-5;
  const hEff = Math.max(0.01, h);
  const uStar = (manningN * Math.sqrt(G) * velMag) / Math.pow(hEff, 1 / 6);
  return Math.max(1e-5, uStar);
}

/**
 * Roughness length y0 from Manning roughness n (Strickler approximation)
 */
export function computeRoughnessLength(manningN: number): number {
  // ks ≈ (8.25 * sqrt(g) * n)^6; y0 = ks / 30
  const ks = Math.max(1e-4, Math.pow(25.8 * manningN, 6));
  return Math.max(1e-5, ks / 30);
}

/**
 * Prescribes equilibrium bed values for k, epsilon, and omega
 */
export function computeEquilibriumBedTurbulence(
  uStar: number,
  y0: number,
  cMu = 0.09
): { kBed: number; epsBed: number; omegaBed: number } {
  const kBed = Math.max(1e-6, Math.pow(uStar, 2) / Math.sqrt(cMu));
  const epsBed = Math.max(1e-6, Math.pow(uStar, 3) / (KAPPA * y0));
  const omegaBed = Math.max(1e-4, uStar / (Math.sqrt(cMu) * KAPPA * y0));
  return { kBed, epsBed, omegaBed };
}
