/**
 * NASA SWOT Radar Satellite Calibration & Parameter Assimilation
 *
 * Compares simulated water surface elevations (WSE) against SWOT RiverSP
 * satellite altimetry passes and calibrates effective Manning's roughness n.
 */

import {
  RiverGridMesh,
  HydrodynamicsState,
  SwotRiverObservation,
} from '../types/riverReach';

export interface SwotCalibrationResult {
  observedWseM: number;
  simulatedMeanWseM: number;
  differenceM: number;
  wseRmseM: number;
  originalManningN: number;
  calibratedManningN: number;
  agreementStatus: 'EXCELLENT' | 'GOOD' | 'NEEDS_CALIBRATION';
  recommendation: string;
}

export function evaluateSwotCalibration(
  mesh: RiverGridMesh,
  hydro: HydrodynamicsState,
  swotObs: SwotRiverObservation
): SwotCalibrationResult {
  const numCells = mesh.cells.length;
  let sumWse = 0;
  let wetCount = 0;
  let sumSqErr = 0;

  for (let c = 0; c < numCells; c++) {
    if (hydro.isWet[c]) {
      const wse = hydro.wse[c];
      sumWse += wse;
      wetCount++;
      const err = wse - swotObs.observedWseM;
      sumSqErr += err * err;
    }
  }

  const meanSimWse = wetCount > 0 ? sumWse / wetCount : 0;
  const rmse = wetCount > 0 ? Math.sqrt(sumSqErr / wetCount) : 0;
  const diff = meanSimWse - swotObs.observedWseM;

  const currentN = mesh.cells[0]?.manningN || 0.035;

  // Calibrate Manning's n:
  // If simulated WSE is higher than observed, n is too high; if lower, n is too low.
  // Using Strickler ratio: n_new = n_old * (H_obs / H_sim)^(5/3) approx
  let calibratedN = currentN;
  if (Math.abs(diff) > 0.05 && meanSimWse > 0) {
    const factor = Math.max(0.5, Math.min(2.0, 1.0 - diff * 0.15));
    calibratedN = Number((currentN * factor).toFixed(4));
  }

  let agreementStatus: 'EXCELLENT' | 'GOOD' | 'NEEDS_CALIBRATION' = 'NEEDS_CALIBRATION';
  let recommendation = '';

  if (rmse <= Math.max(0.15, swotObs.uncertaintyWseM * 1.5)) {
    agreementStatus = 'EXCELLENT';
    recommendation = 'Model WSE is within NASA SWOT sensor uncertainty bounds. High hydraulic fidelity.';
  } else if (rmse <= 0.40) {
    agreementStatus = 'GOOD';
    recommendation = 'Acceptable agreement for regional hydraulic flood studies. Minor Manning n adjustment advised.';
  } else {
    agreementStatus = 'NEEDS_CALIBRATION';
    recommendation = `Substantial WSE divergence (${diff.toFixed(2)} m). Adopt calibrated Manning n = ${calibratedN} or adjust upstream boundary discharge.`;
  }

  return {
    observedWseM: swotObs.observedWseM,
    simulatedMeanWseM: meanSimWse,
    differenceM: diff,
    wseRmseM: rmse,
    originalManningN: currentN,
    calibratedManningN: calibratedN,
    agreementStatus,
    recommendation,
  };
}
