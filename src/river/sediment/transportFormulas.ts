/**
 * Classical Sediment Transport Formulas & Settling Velocities
 *
 * Implements:
 * 1. Ferguson & Church (2004) & Stokes settling velocity
 * 2. Soulsby (1997) critical Shields parameter
 * 3. Engelund & Hansen (1967) total load
 * 4. Meyer-Peter & Müller (1948) bedload
 * 5. van Rijn (1984) bedload + suspended load
 * 6. Toffaleti (1969) multi-zone total load approximation
 */

import { SedimentFormula } from '../types/sediment';

export const G = 9.81; // Gravity (m/s^2)
export const KINEMATIC_VISCOSITY_WATER = 1.0e-6; // m^2/s at 20 deg C

/**
 * Dimensionless grain diameter D*
 */
export function computeDimensionlessGrainDiameter(
  d50M: number,
  specificGravity: number = 2.65,
  nu: number = KINEMATIC_VISCOSITY_WATER
): number {
  const R = specificGravity - 1.0;
  return d50M * Math.cbrt((R * G) / (nu * nu));
}

/**
 * Ferguson & Church (2004) settling velocity ws (m/s)
 * Universal formulation valid across laminar Stokes through turbulent drag regimes.
 */
export function computeSettlingVelocity(
  d50M: number,
  specificGravity: number = 2.65,
  nu: number = KINEMATIC_VISCOSITY_WATER
): number {
  const R = specificGravity - 1.0;
  const c1 = 18.0;
  const c2 = 1.0; // Sieve diameter constant
  const num = R * G * d50M * d50M;
  const den = c1 * nu + Math.sqrt(0.75 * c2 * R * G * d50M * d50M * d50M);
  return num / Math.max(den, 1.0e-9);
}

/**
 * Soulsby (1997) critical Shields parameter theta_cr
 */
export function computeCriticalShields(dStar: number): number {
  const term1 = 0.30 / (1.0 + 1.2 * dStar);
  const term2 = 0.055 * (1.0 - Math.exp(-0.02 * dStar));
  return term1 + term2;
}

/**
 * Bed shear stress tau_b (Pa) from Manning formulation
 * tau_b = rho_w * g * n^2 * |V|^2 / h^(1/3)
 */
export function computeBedShearStress(
  h: number,
  u: number,
  v: number,
  manningN: number,
  waterDensity: number = 1000
): number {
  if (h <= 0.005) return 0.0;
  const velSq = u * u + v * v;
  if (velSq < 1.0e-8) return 0.0;
  const hCbrt = Math.cbrt(h);
  return (waterDensity * G * manningN * manningN * velSq) / Math.max(hCbrt, 0.01);
}

/**
 * Dimensionless Shields parameter theta = tau_b / ((rho_s - rho_w) * g * d50)
 */
export function computeShieldsParameter(
  tauB: number,
  d50M: number,
  specificGravity: number = 2.65,
  waterDensity: number = 1000
): number {
  const submergedWeight = (specificGravity - 1.0) * waterDensity * G * d50M;
  return tauB / Math.max(submergedWeight, 1.0e-9);
}

/**
 * Engelund & Hansen (1967) Total Sediment Transport Capacity (m^2/s volumetric per unit width)
 *
 * q_t = 0.05 * U^5 / [ (s - 1)^2 * g^(1/2) * d50 * C_f^(3/2) ]
 * Or via Shields parameter:
 * q_t = 0.05 * c_f^(-1) * theta^(5/2) * sqrt((s - 1) * g * d50^3)
 */
export function computeEngelundHansenTransport(
  h: number,
  velMag: number,
  tauB: number,
  d50M: number,
  specificGravity: number = 2.65,
  waterDensity: number = 1000
): number {
  if (h <= 0.01 || velMag <= 0.01 || tauB <= 0.0) return 0.0;
  const R = specificGravity - 1.0;
  const theta = computeShieldsParameter(tauB, d50M, specificGravity, waterDensity);
  if (theta <= 0.0) return 0.0;

  // Friction coefficient c_f = 2 * tauB / (rho * V^2)
  const cf = (2.0 * tauB) / (waterDensity * velMag * velMag + 1.0e-6);
  const factor = 0.05 / Math.max(cf, 0.001);
  const sqrtGravD = Math.sqrt(R * G * d50M * d50M * d50M);

  return factor * Math.pow(theta, 2.5) * sqrtGravD;
}

/**
 * Meyer-Peter & Müller (1948) Bedload Transport Capacity (m^2/s)
 *
 * Phi = 8 * (theta - theta_cr)^(3/2)
 * q_b = Phi * sqrt((s - 1) * g * d50^3)
 */
export function computeMeyerPeterMullerTransport(
  h: number,
  tauB: number,
  thetaCr: number,
  d50M: number,
  specificGravity: number = 2.65,
  waterDensity: number = 1000
): number {
  if (h <= 0.01 || tauB <= 0.0) return 0.0;
  const R = specificGravity - 1.0;
  const theta = computeShieldsParameter(tauB, d50M, specificGravity, waterDensity);

  const excessShields = theta - thetaCr;
  if (excessShields <= 0.0) return 0.0;

  const phi = 8.0 * Math.pow(excessShields, 1.5);
  const sqrtGravD = Math.sqrt(R * G * d50M * d50M * d50M);

  return phi * sqrtGravD;
}

/**
 * van Rijn (1984) Bedload & Suspended Sediment Transport
 */
export function computeVanRijnTransport(
  h: number,
  velMag: number,
  tauB: number,
  thetaCr: number,
  dStar: number,
  d50M: number,
  specificGravity: number = 2.65,
  waterDensity: number = 1000
): { qBedloadM2s: number; qSuspendedM2s: number; qTotalM2s: number } {
  if (h <= 0.01 || velMag <= 0.01 || tauB <= 0.0) {
    return { qBedloadM2s: 0.0, qSuspendedM2s: 0.0, qTotalM2s: 0.0 };
  }
  const R = specificGravity - 1.0;
  const theta = computeShieldsParameter(tauB, d50M, specificGravity, waterDensity);
  const T = Math.max(0.0, (theta - thetaCr) / Math.max(thetaCr, 1.0e-6));
  if (T <= 0.0) {
    return { qBedloadM2s: 0.0, qSuspendedM2s: 0.0, qTotalM2s: 0.0 };
  }

  const sqrtGravD = Math.sqrt(R * G * d50M * d50M * d50M);

  // Bedload formula: q_b = 0.053 * sqrt((s-1)*g*d50^3) * D_*^(-0.3) * T^2.1
  const qB = 0.053 * sqrtGravD * Math.pow(dStar, -0.3) * Math.pow(T, 2.1);

  // Suspended load formula: q_s = 0.012 * V * h * (d50 / h) * D_*^(-0.6) * T^2.4
  const qS = 0.012 * velMag * d50M * Math.pow(dStar, -0.6) * Math.pow(T, 2.4);

  return {
    qBedloadM2s: qB,
    qSuspendedM2s: qS,
    qTotalM2s: qB + qS,
  };
}

/**
 * Toffaleti (1969) Multi-Zone Total Load Approximation
 */
export function computeToffaletiTransport(
  h: number,
  velMag: number,
  tauB: number,
  thetaCr: number,
  d50M: number,
  specificGravity: number = 2.65,
  waterDensity: number = 1000
): number {
  if (h <= 0.01 || velMag <= 0.01 || tauB <= 0.0) return 0.0;
  const R = specificGravity - 1.0;
  const theta = computeShieldsParameter(tauB, d50M, specificGravity, waterDensity);
  if (theta <= thetaCr) return 0.0;

  // Empirical power relation representation
  const excess = (theta - thetaCr) / Math.max(thetaCr, 1.0e-5);
  const sqrtGravD = Math.sqrt(R * G * d50M * d50M * d50M);
  const coeff = 0.035 * Math.pow(h / Math.max(d50M, 0.0001), 0.15);

  return coeff * sqrtGravD * Math.pow(excess, 2.2);
}

/**
 * Master dispatcher for sediment transport capacity q_s (m^2/s)
 */
export function computeUnitSedimentTransportCapacity(
  formula: SedimentFormula,
  h: number,
  u: number,
  v: number,
  tauB: number,
  d50M: number,
  specificGravity: number = 2.65,
  waterDensity: number = 1000
): number {
  if (h <= 0.01) return 0.0;
  const velMag = Math.hypot(u, v);
  if (velMag <= 0.005) return 0.0;

  const dStar = computeDimensionlessGrainDiameter(d50M, specificGravity);
  const thetaCr = computeCriticalShields(dStar);

  switch (formula) {
    case 'engelund-hansen':
      return computeEngelundHansenTransport(
        h,
        velMag,
        tauB,
        d50M,
        specificGravity,
        waterDensity
      );
    case 'meyer-peter-muller':
      return computeMeyerPeterMullerTransport(
        h,
        tauB,
        thetaCr,
        d50M,
        specificGravity,
        waterDensity
      );
    case 'van-rijn':
      return computeVanRijnTransport(
        h,
        velMag,
        tauB,
        thetaCr,
        dStar,
        d50M,
        specificGravity,
        waterDensity
      ).qTotalM2s;
    case 'toffaleti':
      return computeToffaletiTransport(
        h,
        velMag,
        tauB,
        thetaCr,
        d50M,
        specificGravity,
        waterDensity
      );
    default:
      return computeEngelundHansenTransport(
        h,
        velMag,
        tauB,
        d50M,
        specificGravity,
        waterDensity
      );
  }
}
