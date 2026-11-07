/**
 * HydroRIVERS & NASA SWOT Observations Data Service
 *
 * Provides:
 * 1. Global HydroRIVERS reach catalog & metadata (Stream order, discharge, gradient, path)
 * 2. NASA SWOT satellite radar altimetry observations (WSE, width, slope, uncertainty)
 * 3. SWOT vs. 2D CFD hydrodynamic calibration & validation metrics
 * 4. Surveyed bathymetry text/CSV import parsers
 */

import {
  HydroRiverReach,
  SwotObservation,
  SurveyedSoundingPoint,
  RiverSimulationSummary,
} from '../types/riverAnalysis';

/**
 * Pre-compiled Global HydroRIVERS Benchmark River Reaches
 */
export const GLOBAL_HYDRORIVERS_CATALOG: HydroRiverReach[] = [
  {
    reachId: 20458192,
    riverName: 'Danube River (Wachau Valley Reach)',
    mainBasin: 'Danube Basin',
    continent: 'Europe',
    streamOrder: 7,
    meanDischargeM3s: 1920.0,
    gradientPercent: 0.042,
    lengthKm: 0.52,
    upAreaKm2: 96800,
    centerCoordinates: { lat: 48.3842, lng: 15.4215 },
    pathCoordinates: [
      { lat: 48.3855, lng: 15.4182 },
      { lat: 48.3848, lng: 15.4201 },
      { lat: 48.3842, lng: 15.4215 },
      { lat: 48.3835, lng: 15.4234 },
      { lat: 48.3828, lng: 15.4251 },
    ],
  },
  {
    reachId: 10294812,
    riverName: 'Mississippi River (Baton Rouge Meander Reach)',
    mainBasin: 'Mississippi Basin',
    continent: 'North America',
    streamOrder: 9,
    meanDischargeM3s: 16790.0,
    gradientPercent: 0.009,
    lengthKm: 0.55,
    upAreaKm2: 2980000,
    centerCoordinates: { lat: 30.4515, lng: -91.1925 },
    pathCoordinates: [
      { lat: 30.4538, lng: -91.1942 },
      { lat: 30.4526, lng: -91.1933 },
      { lat: 30.4515, lng: -91.1925 },
      { lat: 30.4502, lng: -91.1915 },
      { lat: 30.4491, lng: -91.1904 },
    ],
  },
  {
    reachId: 20114092,
    riverName: 'Rhine River (Upper Middle Gorge Reach)',
    mainBasin: 'Rhine Basin',
    continent: 'Europe',
    streamOrder: 7,
    meanDischargeM3s: 2150.0,
    gradientPercent: 0.038,
    lengthKm: 0.50,
    upAreaKm2: 145000,
    centerCoordinates: { lat: 50.1422, lng: 7.7185 },
    pathCoordinates: [
      { lat: 50.1441, lng: 7.7162 },
      { lat: 50.1432, lng: 7.7173 },
      { lat: 50.1422, lng: 7.7185 },
      { lat: 50.1412, lng: 7.7196 },
      { lat: 50.1402, lng: 7.7208 },
    ],
  },
  {
    reachId: 40381921,
    riverName: 'Ganges River (Varanasi Ghats Reach)',
    mainBasin: 'Ganges-Brahmaputra Basin',
    continent: 'Asia',
    streamOrder: 8,
    meanDischargeM3s: 12500.0,
    gradientPercent: 0.015,
    lengthKm: 0.54,
    upAreaKm2: 840000,
    centerCoordinates: { lat: 25.3085, lng: 83.0112 },
    pathCoordinates: [
      { lat: 25.3106, lng: 83.0094 },
      { lat: 25.3095, lng: 83.0103 },
      { lat: 25.3085, lng: 83.0112 },
      { lat: 25.3074, lng: 83.0121 },
      { lat: 25.3062, lng: 83.0132 },
    ],
  },
  {
    reachId: 20649201,
    riverName: 'River Thames (Oxford Meander Reach)',
    mainBasin: 'Thames Basin',
    continent: 'Europe',
    streamOrder: 5,
    meanDischargeM3s: 65.8,
    gradientPercent: 0.025,
    lengthKm: 0.50,
    upAreaKm2: 9948,
    centerCoordinates: { lat: 51.7482, lng: -1.2585 },
    pathCoordinates: [
      { lat: 51.7501, lng: -1.2602 },
      { lat: 51.7491, lng: -1.2593 },
      { lat: 51.7482, lng: -1.2585 },
      { lat: 51.7473, lng: -1.2576 },
      { lat: 51.7462, lng: -1.2565 },
    ],
  },
  {
    reachId: 30192841,
    riverName: 'Amazon River (Solimões Reach)',
    mainBasin: 'Amazon Basin',
    continent: 'South America',
    streamOrder: 10,
    meanDischargeM3s: 175000.0,
    gradientPercent: 0.002,
    lengthKm: 0.58,
    upAreaKm2: 4600000,
    centerCoordinates: { lat: -3.1252, lng: -60.0152 },
    pathCoordinates: [
      { lat: -3.1232, lng: -60.0175 },
      { lat: -3.1242, lng: -60.0163 },
      { lat: -3.1252, lng: -60.0152 },
      { lat: -3.1263, lng: -60.0141 },
      { lat: -3.1274, lng: -60.0129 },
    ],
  },
];

/**
 * NASA SWOT Radar Satellite Observations Catalog for River Validation
 */
export const SAMPLE_SWOT_OBSERVATIONS: Record<string, SwotObservation> = {
  'danube-wachau': {
    reachId: '20458192',
    satellitePassDate: '2024-06-18T10:42:00Z (Cycle 14, Pass 22)',
    observedWseM: 201.42,
    observedWidthM: 278.5,
    observedSlope: 0.00041,
    observedDischargeM3s: 1890,
    uncertaintyWseM: 0.08,
    notes: 'NASA SWOT KaRIn Ka-band radar interferometer pass. High coherence surface.',
  },
  'mississippi-batonrouge': {
    reachId: '10294812',
    satellitePassDate: '2024-05-24T14:15:00Z (Cycle 12, Pass 08)',
    observedWseM: 8.65,
    observedWidthM: 710.0,
    observedSlope: 0.000085,
    observedDischargeM3s: 16400,
    uncertaintyWseM: 0.05,
    notes: 'SWOT River Single Pass Vector Product. Verified against USGS Gauge #07374000.',
  },
  'rhine-gorge': {
    reachId: '20114092',
    satellitePassDate: '2024-07-02T08:33:00Z (Cycle 15, Pass 19)',
    observedWseM: 71.85,
    observedWidthM: 235.0,
    observedSlope: 0.00036,
    observedDischargeM3s: 2110,
    uncertaintyWseM: 0.07,
    notes: 'NASA/CNES SWOT observation. Calibrated against Kaub gauging station.',
  },
  'benchmark-500m': {
    reachId: '500m-reach',
    satellitePassDate: '2024-09-12T11:20:00Z (Pass 04)',
    observedWseM: 101.88,
    observedWidthM: 40.0,
    observedSlope: 0.0012,
    observedDischargeM3s: 45.0,
    uncertaintyWseM: 0.06,
    notes: 'Hydrometric field validation control station for 500m benchmark channel.',
  },
};

/**
 * Validates simulated water surface elevations against NASA SWOT satellite observations.
 */
export function validateAgainstSwotObservations(
  simulatedMeanWseM: number,
  swot: SwotObservation
): NonNullable<RiverSimulationSummary['swotCalibrationComparison']> {
  const diffM = Math.round((simulatedMeanWseM - swot.observedWseM) * 100) / 100;
  const absDiff = Math.abs(diffM);

  let agreementStatus: 'EXCELLENT' | 'GOOD' | 'NEEDS_BATHYMETRY_CALIBRATION';
  if (absDiff <= 0.15) {
    agreementStatus = 'EXCELLENT';
  } else if (absDiff <= 0.45) {
    agreementStatus = 'GOOD';
  } else {
    agreementStatus = 'NEEDS_BATHYMETRY_CALIBRATION';
  }

  return {
    observedWseM: swot.observedWseM,
    simulatedWseM: Math.round(simulatedMeanWseM * 100) / 100,
    differenceM: diffM,
    wseRmseM: absDiff,
    agreementStatus,
  };
}

/**
 * Parses surveyed bathymetric sounding data from CSV or plain XYZ text.
 * Accepts formats:
 * - "lat,lng,elevation"
 * - "lat,lng,depth"
 * - "x,y,z"
 */
export function parseSurveyedBathymetryCSV(text: string): SurveyedSoundingPoint[] {
  const lines = text.trim().split(/\r?\n/);
  const soundings: SurveyedSoundingPoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    // Check if header row
    if (i === 0 && (line.toLowerCase().includes('lat') || line.toLowerCase().includes('x'))) {
      continue;
    }

    const parts = line.split(/[,\t; ]+/);
    if (parts.length >= 3) {
      const p0 = parseFloat(parts[0]);
      const p1 = parseFloat(parts[1]);
      const p2 = parseFloat(parts[2]);

      if (isFinite(p0) && isFinite(p1) && isFinite(p2)) {
        soundings.push({
          lat: p0,
          lng: p1,
          elevationM: p2,
        });
      }
    }
  }

  return soundings;
}
