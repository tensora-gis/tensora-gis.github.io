/**
 * Spatially Distributed Green-Ampt Infiltration Engine
 *
 * Implements physical Green-Ampt infiltration physics:
 * 1. Potential infiltration capacity f(t) = Ks * (1 + (psi * Delta_theta) / F(t))  [Eq. 1.1]
 * 2. Implicit Newton-Raphson advancement for cumulative depth F(t + Delta_t) [Eq. 1.2]
 * 3. Surface ponding initiation criterion & time-to-ponding tp = Fp / i [Eq. 1.3]
 * 4. USDA soil texture parameters (Ks, suction head psi, porosity theta_s, wilting point theta_r)
 * 5. Partitioning of gross hyetograph i(t) into infiltration f(t) and excess overland runoff i_eff(t)
 */

export type UsdaSoilTexture =
  | 'Sand'
  | 'Loamy Sand'
  | 'Sandy Loam'
  | 'Silt Loam'
  | 'Clay Loam'
  | 'Silty Clay'
  | 'Clay';

export interface GreenAmptSoilParameters {
  texture: UsdaSoilTexture;
  ksMPerSec: number;        // Saturated hydraulic conductivity [m/s]
  ksMmPerHour: number;      // Ks in [mm/hr]
  suctionHeadM: number;     // Capillary suction head psi [m]
  porosityThetaS: number;   // Saturated volumetric water content theta_s [-]
  residualThetaR: number;   // Residual moisture content theta_r [-]
  overlandManningN: number; // Surface overland roughness n [-]
}

/**
 * Standard USDA Soil Texture Characteristics (Rawls, Brakensiek, & Miller, 1983)
 */
export const USDA_SOIL_TEXTURE_PARAMETERS: Record<UsdaSoilTexture, GreenAmptSoilParameters> = {
  Sand: {
    texture: 'Sand',
    ksMPerSec: 3.27e-5,
    ksMmPerHour: 117.8,
    suctionHeadM: 0.0495,
    porosityThetaS: 0.437,
    residualThetaR: 0.02,
    overlandManningN: 0.025,
  },
  'Loamy Sand': {
    texture: 'Loamy Sand',
    ksMPerSec: 8.31e-6,
    ksMmPerHour: 29.9,
    suctionHeadM: 0.0613,
    porosityThetaS: 0.437,
    residualThetaR: 0.035,
    overlandManningN: 0.03,
  },
  'Sandy Loam': {
    texture: 'Sandy Loam',
    ksMPerSec: 3.03e-6,
    ksMmPerHour: 10.9,
    suctionHeadM: 0.1101,
    porosityThetaS: 0.453,
    residualThetaR: 0.041,
    overlandManningN: 0.035,
  },
  'Silt Loam': {
    texture: 'Silt Loam',
    ksMPerSec: 9.44e-7,
    ksMmPerHour: 3.4,
    suctionHeadM: 0.1668,
    porosityThetaS: 0.501,
    residualThetaR: 0.13,
    overlandManningN: 0.04,
  },
  'Clay Loam': {
    texture: 'Clay Loam',
    ksMPerSec: 2.78e-7,
    ksMmPerHour: 1.0,
    suctionHeadM: 0.2088,
    porosityThetaS: 0.464,
    residualThetaR: 0.197,
    overlandManningN: 0.045,
  },
  'Silty Clay': {
    texture: 'Silty Clay',
    ksMPerSec: 1.39e-7,
    ksMmPerHour: 0.5,
    suctionHeadM: 0.273,
    porosityThetaS: 0.479,
    residualThetaR: 0.25,
    overlandManningN: 0.05,
  },
  Clay: {
    texture: 'Clay',
    ksMPerSec: 8.33e-8,
    ksMmPerHour: 0.3,
    suctionHeadM: 0.3163,
    porosityThetaS: 0.475,
    residualThetaR: 0.272,
    overlandManningN: 0.055,
  },
};

export interface GreenAmptCellState {
  cumulativeInfiltrationM: number; // F(t) [m]
  isPonded: boolean;               // True if surface ponding has occurred
  actualInfiltrationRateMPerSec: number; // f(t) [m/s]
  netExcessRainfallRateMPerSec: number;  // i_eff(t) = max(0, i(t) - f(t)) [m/s]
}

/**
 * Creates initial Green-Ampt state for a cell.
 */
export function createInitialGreenAmptState(): GreenAmptCellState {
  return {
    cumulativeInfiltrationM: 1e-6, // Small seed to avoid division by zero
    isPonded: false,
    actualInfiltrationRateMPerSec: 0.0,
    netExcessRainfallRateMPerSec: 0.0,
  };
}

/**
 * Advances Green-Ampt infiltration across a single timestep Delta_t (seconds)
 * for a cell with given soil parameters and gross rainfall intensity i(t) [m/s].
 *
 * Implements Eq. 1.1, 1.2, and 1.3 with Newton-Raphson convergence.
 */
export function stepGreenAmptCell(
  state: GreenAmptCellState,
  soil: GreenAmptSoilParameters,
  initialMoistureContentThetaI: number,
  rainfallIntensityMPerSec: number,
  dtSec: number
): GreenAmptCellState {
  const i = Math.max(0, rainfallIntensityMPerSec);
  const Ks = soil.ksMPerSec;
  const psi = soil.suctionHeadM;
  // Moisture deficit Delta_theta = theta_s - theta_i
  const deltaTheta = Math.max(0.01, soil.porosityThetaS - initialMoistureContentThetaI);
  const psiDeltaTheta = psi * deltaTheta;

  let F_old = state.cumulativeInfiltrationM;
  let isPonded = state.isPonded;

  // 1. Check ponding criterion if not yet ponded (Eq. 1.3)
  if (!isPonded) {
    if (i <= Ks) {
      // Rainfall intensity is below saturated conductivity; all rain infiltrates
      const deltaF = i * dtSec;
      const F_new = F_old + deltaF;
      return {
        cumulativeInfiltrationM: F_new,
        isPonded: false,
        actualInfiltrationRateMPerSec: i,
        netExcessRainfallRateMPerSec: 0.0,
      };
    }

    // Rainfall exceeds Ks: check if cumulative depth exceeds ponding threshold F_p
    const F_p = (Ks * psiDeltaTheta) / (i - Ks);
    if (F_old + i * dtSec < F_p) {
      // Not yet ponded within this timestep
      const deltaF = i * dtSec;
      return {
        cumulativeInfiltrationM: F_old + deltaF,
        isPonded: false,
        actualInfiltrationRateMPerSec: i,
        netExcessRainfallRateMPerSec: 0.0,
      };
    } else {
      // Ponding occurs during this timestep
      isPonded = true;
      // Advance to ponding point
      const dtBeforePonding = Math.max(0, (F_p - F_old) / i);
      const dtAfterPonding = Math.max(0, dtSec - dtBeforePonding);
      F_old = F_p;
      // Now solve ponded infiltration for dtAfterPonding
      if (dtAfterPonding <= 0) {
        return {
          cumulativeInfiltrationM: F_p,
          isPonded: true,
          actualInfiltrationRateMPerSec: i,
          netExcessRainfallRateMPerSec: 0.0,
        };
      }
      dtSec = dtAfterPonding;
    }
  }

  // 2. Ponded conditions: solve Eq. 1.2 via Newton-Raphson
  // F_{t+dt} - F_t - psi*Delta_theta * ln((F_{t+dt} + psi*Delta_theta)/(F_t + psi*Delta_theta)) = Ks * dt
  const target = Ks * dtSec;
  const denomConst = F_old + psiDeltaTheta;

  // Initial guess: Taylor expansion F_{new,0} = F_old + f(F_old)*dt
  const f_initial = Ks * (1.0 + psiDeltaTheta / Math.max(1e-5, F_old));
  let F_new = F_old + Math.min(f_initial * dtSec, (i + 1e-4) * dtSec);

  const maxIter = 25;
  const tol = 1e-9; // Machine precision tolerance [m]

  for (let iter = 0; iter < maxIter; iter++) {
    // Residual function: g(F) = (F - F_old) - psiDeltaTheta * ln((F + psiDeltaTheta)/denomConst) - Ks*dt
    const numer = Math.max(1e-6, F_new + psiDeltaTheta);
    const g = (F_new - F_old) - psiDeltaTheta * Math.log(numer / denomConst) - target;

    if (Math.abs(g) < tol) {
      break;
    }

    // Derivative: g'(F) = 1 - psiDeltaTheta / (F + psiDeltaTheta) = F / (F + psiDeltaTheta)
    const gPrime = Math.max(1e-5, F_new / numer);
    const dF = g / gPrime;
    F_new -= dF;

    if (F_new < F_old) {
      F_new = F_old + 1e-6;
    }
  }

  const deltaF = Math.max(0, F_new - F_old);
  const actualInfilRate = deltaF / Math.max(1e-4, dtSec);
  const excessRate = Math.max(0, i - actualInfilRate);

  return {
    cumulativeInfiltrationM: F_new,
    isPonded: true,
    actualInfiltrationRateMPerSec: actualInfilRate,
    netExcessRainfallRateMPerSec: excessRate,
  };
}

/**
 * Convenience function to step an entire spatially distributed 2D grid of Green-Ampt cells.
 */
export function stepGreenAmptGrid(
  gridStates: GreenAmptCellState[],
  soilMap: GreenAmptSoilParameters[],
  moistureMap: number[],
  rainfallRateMPerSec: number,
  dtSec: number
): GreenAmptCellState[] {
  const n = gridStates.length;
  const nextStates: GreenAmptCellState[] = new Array(n);
  for (let idx = 0; idx < n; idx++) {
    nextStates[idx] = stepGreenAmptCell(
      gridStates[idx],
      soilMap[idx],
      moistureMap[idx],
      rainfallRateMPerSec,
      dtSec
    );
  }
  return nextStates;
}
