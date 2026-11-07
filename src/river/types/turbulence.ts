/**
 * Depth-Averaged RANS Turbulence Modelling Types
 *
 * Supports:
 * - None (constant eddy viscosity = 0)
 * - Mixing Length (algebraic depth-averaged Nezu & Rodi)
 * - k-ε (Standard two-equation depth-averaged model)
 * - k-ω SST (Shear Stress Transport two-equation model for separated flows)
 */

export type TurbulenceModelType =
  | 'none'
  | 'mixing-length'
  | 'k-epsilon'
  | 'k-omega-sst';

export interface TurbulenceParameters {
  model: TurbulenceModelType;

  // Algebraic Mixing Length parameters
  kappa: number; // von Karman constant (default 0.41)

  // k-ε Constants
  cMu: number; // default 0.09
  c1Eps: number; // default 1.44
  c2Eps: number; // default 1.92
  sigmaK: number; // default 1.0
  sigmaEps: number; // default 1.3

  // k-ω SST Constants
  a1: number; // default 0.31
  betaStar: number; // default 0.09
  sigmaK1: number; // default 0.85
  sigmaK2: number; // default 1.0
  sigmaOmega1: number; // default 0.50
  sigmaOmega2: number; // default 0.856
  alpha1: number; // default 5/9 = 0.556
  alpha2: number; // default 0.44
  beta1: number; // default 0.075
  beta2: number; // default 0.0828

  // Numerical Limiters & Safeguards
  eddyViscosityCapM2s: number; // Upper bound to prevent numerical explosion in shallow water (default 10.0 m^2/s)
  wallFunctionsEnabled: boolean; // Prescribe bed boundary values from friction velocity u*
  schmidtNumberSediment: number; // Turbulent Schmidt number sigma_c for sediment diffusion (default 1.0)
}

export const DEFAULT_TURBULENCE_PARAMETERS: TurbulenceParameters = {
  model: 'k-epsilon',
  kappa: 0.41,
  cMu: 0.09,
  c1Eps: 1.44,
  c2Eps: 1.92,
  sigmaK: 1.0,
  sigmaEps: 1.3,
  a1: 0.31,
  betaStar: 0.09,
  sigmaK1: 0.85,
  sigmaK2: 1.0,
  sigmaOmega1: 0.50,
  sigmaOmega2: 0.856,
  alpha1: 0.5556,
  alpha2: 0.44,
  beta1: 0.075,
  beta2: 0.0828,
  eddyViscosityCapM2s: 5.0,
  wallFunctionsEnabled: true,
  schmidtNumberSediment: 1.0,
};

/**
 * Spatial State Buffers for Turbulence Fields
 */
export interface TurbulenceState {
  k: Float32Array; // Turbulent kinetic energy k (m^2/s^2)
  epsOrOmega: Float32Array; // Dissipation rate epsilon (m^2/s^3) or specific rate omega (1/s)
  nuT: Float32Array; // Depth-averaged kinematic eddy viscosity nu_t (m^2/s)
  pK: Float32Array; // Shear production of turbulent kinetic energy P_k (m^2/s^3)
}

/**
 * Turbulence Diagnostics
 */
export interface TurbulenceDiagnostics {
  maxNuT: number;
  meanNuT: number;
  maxK: number;
  maxPk: number;
  residualK: number;
  residualEpsOrOmega: number;
}
