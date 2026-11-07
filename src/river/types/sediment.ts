/**
 * Sediment Transport & Bed Evolution Morphodynamics Types
 *
 * Supports:
 * - Suspended sediment advection-diffusion coupled with RANS eddy viscosity nu_t
 * - Total load formulas: Engelund-Hansen (default), van Rijn, Meyer-Peter & Müller, Toffaleti
 * - Exner bed evolution equation with decoupled sub-stepping
 */

export type SedimentFormula =
  | 'engelund-hansen'
  | 'van-rijn'
  | 'meyer-peter-muller'
  | 'toffaleti';

export interface SedimentParameters {
  enabled: boolean;
  formula: SedimentFormula;
  d50Mm: number; // Median grain size in mm (e.g. 0.50 mm)
  specificGravity: number; // Relative density s = rho_s / rho_w (default 2.65)
  bedPorosity: number; // Bed packing porosity p (default 0.40)
  waterDensityKgM3: number; // default 1000 kg/m^3
  bedChangeCapPct: number; // Maximum bed change allowed per morphodynamic step (default 0.05 = 5% of h)
  decoupledIntervalSteps: number; // N hydrodynamic steps per bed evolution update (default 5)
  settlingVelocityMs?: number; // ws (m/s), if undefined computed from Ferguson-Church or Stokes
}

export const DEFAULT_SEDIMENT_PARAMETERS: SedimentParameters = {
  enabled: true,
  formula: 'engelund-hansen',
  d50Mm: 0.50,
  specificGravity: 2.65,
  bedPorosity: 0.40,
  waterDensityKgM3: 1000,
  bedChangeCapPct: 0.05,
  decoupledIntervalSteps: 5,
};

/**
 * Spatial State Buffers for Sediment Transport & Morphology
 */
export interface SedimentState {
  concentrationKgM3: Float32Array; // Depth-averaged suspended concentration C (kg/m^3)
  transportRateM2s: Float32Array; // Total sediment transport rate q_s (m^2/s)
  shields: Float32Array; // Dimensionless Shields parameter theta
  criticalShearStressPa: Float32Array; // Critical shear stress tau_cr (Pa)
  bedElevationChangeM: Float32Array; // Cumulative bed level shift Delta z_b (m: <0 scour, >0 siltation)
  cumulativeScourVolumeM3: number;
  cumulativeDepositionVolumeM3: number;
}
