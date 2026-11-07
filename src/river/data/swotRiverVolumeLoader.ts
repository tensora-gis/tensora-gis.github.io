/**
 * NASA SWOT Radar Satellite Observations & Altimetry Loader
 *
 * Provides SWOT RiverSP water surface elevation (WSE), width, and slope
 * observations for validation and calibration.
 */

import { SwotRiverObservation } from '../types/riverReach';

export const SAMPLE_SWOT_OBSERVATIONS: Record<string, SwotRiverObservation> = {
  'reach-benchmark-500m': {
    reachId: 'reach-benchmark-500m',
    satellitePassDate: '2024-06-12',
    observedWseM: 101.45,
    observedWidthM: 24.2,
    observedSlope: 0.00098,
    observedDischargeM3s: 34.8,
    uncertaintyWseM: 0.08,
    notes: 'High confidence KaRIn radar pass under clear calm conditions',
  },
  'reach-rhine-basel': {
    reachId: 'reach-rhine-basel',
    satellitePassDate: '2024-05-18',
    observedWseM: 247.85,
    observedWidthM: 198.0,
    observedSlope: 0.00085,
    observedDischargeM3s: 1025.0,
    uncertaintyWseM: 0.12,
    notes: 'SWOT KaRIn Cycle 14 Pass 228',
  },
  'reach-danube-wachau': {
    reachId: 'reach-danube-wachau',
    satellitePassDate: '2024-07-04',
    observedWseM: 202.15,
    observedWidthM: 292.0,
    observedSlope: 0.00042,
    observedDischargeM3s: 1810.0,
    uncertaintyWseM: 0.10,
    notes: 'Wachau gauge tandem cross-calibration',
  },
  'reach-mississippi-memphis': {
    reachId: 'reach-mississippi-memphis',
    satellitePassDate: '2024-04-29',
    observedWseM: 59.4,
    observedWidthM: 875.0,
    observedSlope: 0.00009,
    observedDischargeM3s: 14200.0,
    uncertaintyWseM: 0.15,
    notes: 'USGS Memphis gauge validation',
  },
};

export function fetchSwotObservationForReach(reachId: string): SwotRiverObservation | null {
  return SAMPLE_SWOT_OBSERVATIONS[reachId] || null;
}
