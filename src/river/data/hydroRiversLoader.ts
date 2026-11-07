/**
 * Global River Network (HydroRIVERS / FAO Reaches) Data Loader
 *
 * Bundles calibrated global reach definitions for major world rivers:
 * 1. Rhine River (Upper Rhine corridor near Basel, Switzerland/Germany)
 * 2. Danube River (Wachau corridor near Krems, Austria)
 * 3. Mississippi River (Meander corridor near Memphis, USA)
 * 4. Ganges River (Alluvial reach near Patna, India)
 * 5. Thames River (Tideway corridor near London, UK)
 * 6. Seine River (Historic corridor near Paris, France)
 * 7. Amazon River (Deep-trench corridor near Óbidos, Brazil)
 * 8. Colorado River (Grand Canyon rapid reach, USA)
 * 9. Nile River (Aswan regulated corridor, Egypt)
 * 10. Hudson River (Manhattan estuary corridor, USA)
 * 11. 500-Metre Canonical Benchmark Reach (Prismatic flume validation)
 */

import { RiverReachDefinition } from '../types/riverReach';
import { createDefaultEmpiricalStation } from '../geometry/empiricalSection';

/**
 * Rhine River Reach (Basel, Switzerland / Germany)
 */
export function createRhineReach(): RiverReachDefinition {
  const centerline = [
    { lat: 47.555, lng: 7.585, stationM: 0, widthM: 180, bedElevationM: 245.0 },
    { lat: 47.562, lng: 7.592, stationM: 950, widthM: 195, bedElevationM: 244.1 },
    { lat: 47.571, lng: 7.594, stationM: 1980, widthM: 210, bedElevationM: 243.2 },
    { lat: 47.583, lng: 7.589, stationM: 3350, widthM: 220, bedElevationM: 242.0 },
  ];

  return {
    id: 'reach-rhine-basel',
    name: 'Rhine River (Basel, Switzerland / Germany)',
    description: 'Upper Rhine reach with gravel bed, high discharge capacity, and flood defense levees.',
    source: 'hydrorivers',
    centerline,
    crossSections: [
      createDefaultEmpiricalStation(0, 245.0, 1050.0, 0.028),
      createDefaultEmpiricalStation(1980, 243.2, 1050.0, 0.028),
      createDefaultEmpiricalStation(3350, 242.0, 1050.0, 0.028),
    ],
    bounds: [47.545, 7.565, 47.595, 7.615],
    reachLengthM: 3350,
    meanWidthM: 200,
    defaultManningN: 0.028,
    upstreamDischargeEstimateM3s: 1050.0,
  };
}

/**
 * Danube River Reach (Wachau corridor, Austria)
 */
export function createDanubeReach(): RiverReachDefinition {
  const centerline = [
    { lat: 48.395, lng: 15.512, stationM: 0, widthM: 280, bedElevationM: 198.5 },
    { lat: 48.402, lng: 15.535, stationM: 1850, widthM: 310, bedElevationM: 197.8 },
    { lat: 48.411, lng: 15.568, stationM: 4400, widthM: 290, bedElevationM: 196.6 },
  ];

  return {
    id: 'reach-danube-wachau',
    name: 'Danube River (Wachau Valley, Austria)',
    description: 'European major waterway corridor with regulated floodplain dykes and riprap revetments.',
    source: 'hydrorivers',
    centerline,
    crossSections: [
      createDefaultEmpiricalStation(0, 198.5, 1850.0, 0.032),
      createDefaultEmpiricalStation(1850, 197.8, 1850.0, 0.032),
      createDefaultEmpiricalStation(4400, 196.6, 1850.0, 0.032),
    ],
    bounds: [48.375, 15.485, 48.435, 15.595],
    reachLengthM: 4400,
    meanWidthM: 295,
    defaultManningN: 0.032,
    upstreamDischargeEstimateM3s: 1850.0,
  };
}

/**
 * Mississippi River (Memphis Reach, USA)
 */
export function createMississippiReach(): RiverReachDefinition {
  const centerline = [
    { lat: 35.132, lng: -90.075, stationM: 0, widthM: 850, bedElevationM: 52.0 },
    { lat: 35.151, lng: -90.062, stationM: 2400, widthM: 920, bedElevationM: 51.5 },
    { lat: 35.178, lng: -90.048, stationM: 5600, widthM: 880, bedElevationM: 50.8 },
  ];

  return {
    id: 'reach-mississippi-memphis',
    name: 'Mississippi River (Memphis, USA)',
    description: 'Massive alluvial low-gradient sand-bed river with extensive USACE navigation levees.',
    source: 'hydrorivers',
    centerline,
    crossSections: [
      createDefaultEmpiricalStation(0, 52.0, 14500.0, 0.030),
      createDefaultEmpiricalStation(2400, 51.5, 14500.0, 0.030),
      createDefaultEmpiricalStation(5600, 50.8, 14500.0, 0.030),
    ],
    bounds: [35.105, -90.115, 35.205, -90.015],
    reachLengthM: 5600,
    meanWidthM: 880,
    defaultManningN: 0.030,
    upstreamDischargeEstimateM3s: 14500.0,
  };
}

/**
 * Ganges River Reach (Patna, India)
 */
export function createGangesReach(): RiverReachDefinition {
  const centerline = [
    { lat: 25.602, lng: 85.145, stationM: 0, widthM: 1050, bedElevationM: 48.0 },
    { lat: 25.615, lng: 85.178, stationM: 3500, widthM: 1150, bedElevationM: 47.6 },
    { lat: 25.626, lng: 85.215, stationM: 7400, widthM: 1100, bedElevationM: 47.1 },
  ];

  return {
    id: 'reach-ganges-patna',
    name: 'Ganges River (Patna Reach, India)',
    description: 'Wide Himalayan alluvial braided channel with heavy monsoon discharge and sandbars.',
    source: 'hydrorivers',
    centerline,
    crossSections: [
      createDefaultEmpiricalStation(0, 48.0, 12000.0, 0.033),
      createDefaultEmpiricalStation(3500, 47.6, 12000.0, 0.033),
      createDefaultEmpiricalStation(7400, 47.1, 12000.0, 0.033),
    ],
    bounds: [25.58, 85.12, 25.65, 85.24],
    reachLengthM: 7400,
    meanWidthM: 1100,
    defaultManningN: 0.033,
    upstreamDischargeEstimateM3s: 12000.0,
  };
}

/**
 * Thames River Reach (London, UK)
 */
export function createThamesReach(): RiverReachDefinition {
  const centerline = [
    { lat: 51.502, lng: -0.108, stationM: 0, widthM: 175, bedElevationM: -3.5 },
    { lat: 51.505, lng: -0.075, stationM: 2400, widthM: 185, bedElevationM: -4.0 },
    { lat: 51.508, lng: -0.035, stationM: 5200, widthM: 190, bedElevationM: -4.5 },
  ];

  return {
    id: 'reach-thames-london',
    name: 'Thames River (London Tideway, UK)',
    description: 'Historic urban tideway corridor with flood containment walls, docks, and bridges.',
    source: 'hydrorivers',
    centerline,
    crossSections: [
      createDefaultEmpiricalStation(0, -3.5, 65.0, 0.026),
      createDefaultEmpiricalStation(2400, -4.0, 65.0, 0.026),
      createDefaultEmpiricalStation(5200, -4.5, 65.0, 0.026),
    ],
    bounds: [51.49, -0.12, 51.52, -0.02],
    reachLengthM: 5200,
    meanWidthM: 180,
    defaultManningN: 0.026,
    upstreamDischargeEstimateM3s: 65.0,
  };
}

/**
 * Seine River Reach (Paris, France)
 */
export function createSeineReach(): RiverReachDefinition {
  const centerline = [
    { lat: 48.845, lng: 2.375, stationM: 0, widthM: 140, bedElevationM: 26.0 },
    { lat: 48.856, lng: 2.348, stationM: 2200, widthM: 150, bedElevationM: 25.6 },
    { lat: 48.864, lng: 2.312, stationM: 5100, widthM: 145, bedElevationM: 25.1 },
  ];

  return {
    id: 'reach-seine-paris',
    name: 'Seine River (Paris Historic Reach, France)',
    description: 'Iconic regulated urban river channel flanked by stone quays, weir barrages, and historic bridges.',
    source: 'hydrorivers',
    centerline,
    crossSections: [
      createDefaultEmpiricalStation(0, 26.0, 280.0, 0.027),
      createDefaultEmpiricalStation(2200, 25.6, 280.0, 0.027),
      createDefaultEmpiricalStation(5100, 25.1, 280.0, 0.027),
    ],
    bounds: [48.835, 2.295, 48.875, 2.395],
    reachLengthM: 5100,
    meanWidthM: 145,
    defaultManningN: 0.027,
    upstreamDischargeEstimateM3s: 280.0,
  };
}

/**
 * Amazon River (Óbidos Narrows, Brazil)
 */
export function createAmazonReach(): RiverReachDefinition {
  const centerline = [
    { lat: -1.905, lng: -55.535, stationM: 0, widthM: 2250, bedElevationM: -45.0 },
    { lat: -1.916, lng: -55.518, stationM: 2800, widthM: 2350, bedElevationM: -48.0 },
    { lat: -1.928, lng: -55.495, stationM: 6200, widthM: 2300, bedElevationM: -52.0 },
  ];

  return {
    id: 'reach-amazon-obidos',
    name: 'Amazon River (Óbidos Narrows, Brazil)',
    description: 'World’s most voluminous river, confined through the Óbidos constriction reaching depths over 60m.',
    source: 'hydrorivers',
    centerline,
    crossSections: [
      createDefaultEmpiricalStation(0, -45.0, 210000.0, 0.035),
      createDefaultEmpiricalStation(2800, -48.0, 210000.0, 0.035),
      createDefaultEmpiricalStation(6200, -52.0, 210000.0, 0.035),
    ],
    bounds: [-1.95, -55.56, -1.88, -55.47],
    reachLengthM: 6200,
    meanWidthM: 2300,
    defaultManningN: 0.035,
    upstreamDischargeEstimateM3s: 210000.0,
  };
}

/**
 * Colorado River (Grand Canyon, USA)
 */
export function createColoradoReach(): RiverReachDefinition {
  const centerline = [
    { lat: 36.115, lng: -112.115, stationM: 0, widthM: 90, bedElevationM: 730.0 },
    { lat: 36.107, lng: -112.095, stationM: 2100, widthM: 95, bedElevationM: 726.0 },
    { lat: 36.098, lng: -112.072, stationM: 4600, widthM: 92, bedElevationM: 721.0 },
  ];

  return {
    id: 'reach-colorado-canyon',
    name: 'Colorado River (Grand Canyon, USA)',
    description: 'High-gradient bedrock canyon flume with steep riverbed slope, boulder bars, and rapids.',
    source: 'hydrorivers',
    centerline,
    crossSections: [
      createDefaultEmpiricalStation(0, 730.0, 450.0, 0.038),
      createDefaultEmpiricalStation(2100, 726.0, 450.0, 0.038),
      createDefaultEmpiricalStation(4600, 721.0, 450.0, 0.038),
    ],
    bounds: [36.08, -112.13, 36.13, -112.05],
    reachLengthM: 4600,
    meanWidthM: 95,
    defaultManningN: 0.038,
    upstreamDischargeEstimateM3s: 450.0,
  };
}

/**
 * Nile River (Aswan Reach, Egypt)
 */
export function createNileReach(): RiverReachDefinition {
  const centerline = [
    { lat: 24.075, lng: 32.892, stationM: 0, widthM: 540, bedElevationM: 88.0 },
    { lat: 24.088, lng: 32.899, stationM: 1600, widthM: 560, bedElevationM: 87.5 },
    { lat: 24.108, lng: 32.905, stationM: 3900, widthM: 550, bedElevationM: 86.8 },
  ];

  return {
    id: 'reach-nile-aswan',
    name: 'Nile River (Aswan Reach, Egypt)',
    description: 'Arid climate alluvial river corridor downstream of Lake Nasser and the Aswan High Dam.',
    source: 'hydrorivers',
    centerline,
    crossSections: [
      createDefaultEmpiricalStation(0, 88.0, 2800.0, 0.029),
      createDefaultEmpiricalStation(1600, 87.5, 2800.0, 0.029),
      createDefaultEmpiricalStation(3900, 86.8, 2800.0, 0.029),
    ],
    bounds: [24.06, 32.88, 24.12, 32.92],
    reachLengthM: 3900,
    meanWidthM: 550,
    defaultManningN: 0.029,
    upstreamDischargeEstimateM3s: 2800.0,
  };
}

/**
 * Hudson River (New York, USA)
 */
export function createHudsonReach(): RiverReachDefinition {
  const centerline = [
    { lat: 40.718, lng: -74.022, stationM: 0, widthM: 1100, bedElevationM: -14.0 },
    { lat: 40.735, lng: -74.015, stationM: 2100, widthM: 1150, bedElevationM: -15.0 },
    { lat: 40.758, lng: -74.008, stationM: 4800, widthM: 1080, bedElevationM: -15.5 },
  ];

  return {
    id: 'reach-hudson-nyc',
    name: 'Hudson River (New York City Reach, USA)',
    description: 'Major estuarine corridor separating Manhattan and New Jersey, flanked by deep navigation channels.',
    source: 'hydrorivers',
    centerline,
    crossSections: [
      createDefaultEmpiricalStation(0, -14.0, 620.0, 0.028),
      createDefaultEmpiricalStation(2100, -15.0, 620.0, 0.028),
      createDefaultEmpiricalStation(4800, -15.5, 620.0, 0.028),
    ],
    bounds: [40.70, -74.04, 40.77, -73.99],
    reachLengthM: 4800,
    meanWidthM: 1100,
    defaultManningN: 0.028,
    upstreamDischargeEstimateM3s: 620.0,
  };
}

/**
 * 500m Canonical Engineering Benchmark Reach
 */
export function createBenchmark500mReach(): RiverReachDefinition {
  const reachLengthM = 500.0;
  const meanWidthM = 24.0;
  const slope = 0.001;
  const baseInvertM = 100.0;
  const dischargeM3s = 35.0;
  const manningN = 0.030;

  const latStart = 47.558;
  const lngStart = 7.573;
  const dLat = 0.0045;

  const centerline = [
    { lat: latStart, lng: lngStart, stationM: 0, widthM: meanWidthM, bedElevationM: baseInvertM },
    {
      lat: latStart + dLat * 0.25,
      lng: lngStart + 0.0005,
      stationM: 125,
      widthM: meanWidthM,
      bedElevationM: baseInvertM - 125 * slope,
    },
    {
      lat: latStart + dLat * 0.5,
      lng: lngStart + 0.0008,
      stationM: 250,
      widthM: meanWidthM,
      bedElevationM: baseInvertM - 250 * slope,
    },
    {
      lat: latStart + dLat * 0.75,
      lng: lngStart + 0.0004,
      stationM: 375,
      widthM: meanWidthM,
      bedElevationM: baseInvertM - 375 * slope,
    },
    {
      lat: latStart + dLat,
      lng: lngStart,
      stationM: reachLengthM,
      widthM: meanWidthM,
      bedElevationM: baseInvertM - reachLengthM * slope,
    },
  ];

  const crossSections = [
    createDefaultEmpiricalStation(0, baseInvertM, dischargeM3s, manningN),
    createDefaultEmpiricalStation(250, baseInvertM - 250 * slope, dischargeM3s, manningN),
    createDefaultEmpiricalStation(500, baseInvertM - 500 * slope, dischargeM3s, manningN),
  ];

  return {
    id: 'reach-benchmark-500m',
    name: '500m Canonical Flume Benchmark (CFD Flume)',
    description: 'Controlled 500-meter river reach for 2D shallow water and turbulence validation.',
    source: 'user-drawn',
    centerline,
    crossSections,
    bounds: [latStart - 0.001, lngStart - 0.002, latStart + dLat + 0.001, lngStart + 0.003],
    reachLengthM,
    meanWidthM,
    defaultManningN: manningN,
    upstreamDischargeEstimateM3s: dischargeM3s,
  };
}

export const GLOBAL_BUNDLED_REACHES: RiverReachDefinition[] = [
  createRhineReach(), // Default real-world river on first load
  createDanubeReach(),
  createMississippiReach(),
  createGangesReach(),
  createThamesReach(),
  createSeineReach(),
  createAmazonReach(),
  createColoradoReach(),
  createNileReach(),
  createHudsonReach(),
  createBenchmark500mReach(),
];
