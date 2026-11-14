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

import { RiverReachDefinition, CrossSectionStation, CrossSectionPoint } from '../types/riverReach';
import { createDefaultEmpiricalStation } from '../geometry/empiricalSection';
import { GLOBAL_RIVER_DATABASE, convertEntryToReachDefinition } from './globalRiverDatabase';

function getReachFromDb(id: string, fallbackFn: () => RiverReachDefinition): RiverReachDefinition {
  const entry = GLOBAL_RIVER_DATABASE.find((r) => r.id === id);
  return entry ? convertEntryToReachDefinition(entry) : fallbackFn();
}

/**
 * Rhine River Reach (Basel, Switzerland / Germany)
 */
export function createRhineReach(): RiverReachDefinition {
  return getReachFromDb('reach-rhine-basel', () => {
    const centerline = [
      { lat: 47.557535, lng: 7.640673, stationM: 0, widthM: 200, bedElevationM: 245.5 },
      { lat: 47.558522, lng: 7.639458, stationM: 143, widthM: 200, bedElevationM: 245.4 },
      { lat: 47.559723, lng: 7.637743, stationM: 328, widthM: 200, bedElevationM: 245.27 },
      { lat: 47.560172, lng: 7.636917, stationM: 408, widthM: 200, bedElevationM: 245.21 },
      { lat: 47.560570, lng: 7.635941, stationM: 493, widthM: 200, bedElevationM: 245.15 },
      { lat: 47.561117, lng: 7.633956, stationM: 654, widthM: 200, bedElevationM: 245.03 },
      { lat: 47.561514, lng: 7.632330, stationM: 782, widthM: 200, bedElevationM: 244.94 },
      { lat: 47.561629, lng: 7.629432, stationM: 1000, widthM: 200, bedElevationM: 244.79 },
      { lat: 47.561558, lng: 7.627703, stationM: 1130, widthM: 200, bedElevationM: 244.69 },
      { lat: 47.561130, lng: 7.625597, stationM: 1294, widthM: 200, bedElevationM: 244.58 },
      { lat: 47.561084, lng: 7.625437, stationM: 1307, widthM: 200, bedElevationM: 244.57 },
      { lat: 47.560409, lng: 7.622899, stationM: 1512, widthM: 200, bedElevationM: 244.42 },
      { lat: 47.559731, lng: 7.620823, stationM: 1686, widthM: 200, bedElevationM: 244.3 },
      { lat: 47.558833, lng: 7.617234, stationM: 1979, widthM: 200, bedElevationM: 244.09 },
      { lat: 47.558638, lng: 7.616476, stationM: 2042, widthM: 200, bedElevationM: 244.04 },
      { lat: 47.558280, lng: 7.615128, stationM: 2152, widthM: 200, bedElevationM: 243.96 },
      { lat: 47.557625, lng: 7.612660, stationM: 2353, widthM: 200, bedElevationM: 243.82 },
      { lat: 47.556582, lng: 7.607578, stationM: 2758, widthM: 185, bedElevationM: 243.53 },
      { lat: 47.556159, lng: 7.603167, stationM: 3093, widthM: 185, bedElevationM: 243.29 },
      { lat: 47.556040, lng: 7.600266, stationM: 3312, widthM: 185, bedElevationM: 243.14 },
      { lat: 47.555992, lng: 7.599087, stationM: 3401, widthM: 185, bedElevationM: 243.07 },
      { lat: 47.556325, lng: 7.596699, stationM: 3584, widthM: 185, bedElevationM: 242.94 },
      { lat: 47.556337, lng: 7.596615, stationM: 3591, widthM: 185, bedElevationM: 242.94 },
      { lat: 47.557143, lng: 7.594058, stationM: 3804, widthM: 185, bedElevationM: 242.78 },
      { lat: 47.558715, lng: 7.591418, stationM: 4048, widthM: 185, bedElevationM: 242.61 },
      { lat: 47.558868, lng: 7.591160, stationM: 4072, widthM: 185, bedElevationM: 242.59 },
      { lat: 47.560180, lng: 7.589791, stationM: 4252, widthM: 185, bedElevationM: 242.46 },
      { lat: 47.560721, lng: 7.589231, stationM: 4323, widthM: 185, bedElevationM: 242.41 },
      { lat: 47.561141, lng: 7.588792, stationM: 4378, widthM: 185, bedElevationM: 242.37 },
      { lat: 47.561841, lng: 7.588058, stationM: 4474, widthM: 185, bedElevationM: 242.3 },
      { lat: 47.563355, lng: 7.586472, stationM: 4688, widthM: 210, bedElevationM: 242.15 },
      { lat: 47.565195, lng: 7.585279, stationM: 4923, widthM: 210, bedElevationM: 241.98 },
      { lat: 47.567668, lng: 7.584682, stationM: 5202, widthM: 210, bedElevationM: 241.78 },
      { lat: 47.569853, lng: 7.584853, stationM: 5445, widthM: 210, bedElevationM: 241.61 },
      { lat: 47.574278, lng: 7.584799, stationM: 5937, widthM: 210, bedElevationM: 241.26 },
      { lat: 47.575528, lng: 7.584653, stationM: 6076, widthM: 210, bedElevationM: 241.16 },
    ];
    return {
      id: 'reach-rhine-basel',
      name: 'Rhine River (Basel, Switzerland / Germany)',
      description: 'Upper Rhine reach with gravel bed, high discharge capacity, and flood defense levees.',
      source: 'hydrorivers',
      centerline,
      crossSections: [
        createDefaultEmpiricalStation(0, 245.5, 1050.0, 0.028, 200),
        createDefaultEmpiricalStation(3500, 243.0, 1050.0, 0.028, 185),
        createDefaultEmpiricalStation(6076, 241.16, 1050.0, 0.028, 210),
      ],
      bounds: [47.552, 7.580, 47.578, 7.644],
      reachLengthM: 6076,
      meanWidthM: 195,
      defaultManningN: 0.028,
      upstreamDischargeEstimateM3s: 1050.0,
    };
  });
}

/**
 * Danube River Reach (Wachau corridor, Austria)
 */
export function createDanubeReach(): RiverReachDefinition {
  return getReachFromDb('reach-danube-wachau', () => {
    const centerline = [
      { lat: 48.3620, lng: 15.4420, stationM: 0, widthM: 280, bedElevationM: 198.5 },
      { lat: 48.3750, lng: 15.4580, stationM: 1850, widthM: 290, bedElevationM: 197.8 },
      { lat: 48.3950, lng: 15.4720, stationM: 4400, widthM: 310, bedElevationM: 196.8 },
      { lat: 48.3960, lng: 15.5210, stationM: 7800, widthM: 290, bedElevationM: 195.6 },
      { lat: 48.3880, lng: 15.5480, stationM: 9900, widthM: 285, bedElevationM: 194.8 },
      { lat: 48.4030, lng: 15.5820, stationM: 12500, widthM: 300, bedElevationM: 193.9 },
      { lat: 48.4060, lng: 15.6020, stationM: 14200, widthM: 305, bedElevationM: 193.4 },
    ];
    return {
      id: 'reach-danube-wachau',
      name: 'Danube River (Wachau Valley, Austria)',
      description: 'European major waterway corridor with regulated floodplain dykes and riprap revetments.',
      source: 'hydrorivers',
      centerline,
      crossSections: [
        createDefaultEmpiricalStation(0, 198.5, 1850.0, 0.032, 280),
        createDefaultEmpiricalStation(7800, 195.6, 1850.0, 0.032, 290),
        createDefaultEmpiricalStation(14200, 193.4, 1850.0, 0.032, 305),
      ],
      bounds: [48.355, 15.435, 48.415, 15.615],
      reachLengthM: 14200,
      meanWidthM: 295,
      defaultManningN: 0.032,
      upstreamDischargeEstimateM3s: 1850.0,
    };
  });
}

/**
 * Mississippi River (Memphis Reach, USA)
 */
export function createMississippiReach(): RiverReachDefinition {
  return getReachFromDb('reach-mississippi-memphis', () => {
    const centerline = [
      { lat: 35.2150, lng: -90.0550, stationM: 0, widthM: 850, bedElevationM: 53.0 },
      { lat: 35.1850, lng: -90.0520, stationM: 3340, widthM: 900, bedElevationM: 52.3 },
      { lat: 35.1620, lng: -90.0560, stationM: 5920, widthM: 880, bedElevationM: 51.8 },
      { lat: 35.1530, lng: -90.0610, stationM: 7050, widthM: 860, bedElevationM: 51.5 },
      { lat: 35.1410, lng: -90.0630, stationM: 8400, widthM: 840, bedElevationM: 51.2 },
      { lat: 35.1270, lng: -90.0760, stationM: 10450, widthM: 920, bedElevationM: 50.8 },
      { lat: 35.1250, lng: -90.0780, stationM: 10700, widthM: 950, bedElevationM: 50.7 },
      { lat: 35.1100, lng: -90.0910, stationM: 12850, widthM: 940, bedElevationM: 50.3 },
      { lat: 35.0920, lng: -90.0990, stationM: 14950, widthM: 900, bedElevationM: 49.9 },
      { lat: 35.0750, lng: -90.1080, stationM: 16852, widthM: 880, bedElevationM: 49.5 },
    ];
    return {
      id: 'reach-mississippi-memphis',
      name: 'Mississippi River (Memphis, USA)',
      description: 'Massive alluvial low-gradient sand-bed river with extensive USACE navigation levees.',
      source: 'hydrorivers',
      centerline,
      crossSections: [
        createDefaultEmpiricalStation(0, 53.0, 14500.0, 0.030, 850),
        createDefaultEmpiricalStation(8400, 51.2, 14500.0, 0.030, 840),
        createDefaultEmpiricalStation(16852, 49.5, 14500.0, 0.030, 880),
      ],
      bounds: [35.070, -90.115, 35.220, -90.045],
      reachLengthM: 16852,
      meanWidthM: 880,
      defaultManningN: 0.030,
      upstreamDischargeEstimateM3s: 14500.0,
    };
  });
}

/**
 * Ganges River Reach (Patna, India)
 */
export function createGangesReach(): RiverReachDefinition {
  return getReachFromDb('reach-ganges-patna', () => {
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
  });
}

/**
 * Thames River Reach (London, UK)
 */
export function createThamesReach(): RiverReachDefinition {
  return getReachFromDb('reach-thames-london', () => {
    const centerline = [
      { lat: 51.4985, lng: -0.1245, stationM: 0, widthM: 220, bedElevationM: -3.5 },
      { lat: 51.5035, lng: -0.1195, stationM: 650, widthM: 240, bedElevationM: -3.7 },
      { lat: 51.5080, lng: -0.1170, stationM: 1200, widthM: 250, bedElevationM: -3.9 },
      { lat: 51.5105, lng: -0.1035, stationM: 2180, widthM: 240, bedElevationM: -4.1 },
      { lat: 51.5095, lng: -0.0985, stationM: 2550, widthM: 230, bedElevationM: -4.2 },
      { lat: 51.5085, lng: -0.0935, stationM: 2920, widthM: 220, bedElevationM: -4.3 },
      { lat: 51.5075, lng: -0.0875, stationM: 3370, widthM: 220, bedElevationM: -4.4 },
      { lat: 51.5050, lng: -0.0760, stationM: 4250, widthM: 210, bedElevationM: -4.6 },
      { lat: 51.5030, lng: -0.0630, stationM: 5200, widthM: 230, bedElevationM: -4.8 },
      { lat: 51.5010, lng: -0.0510, stationM: 6100, widthM: 250, bedElevationM: -5.0 },
      { lat: 51.5065, lng: -0.0380, stationM: 7200, widthM: 260, bedElevationM: -5.2 },
      { lat: 51.5045, lng: -0.0270, stationM: 8100, widthM: 280, bedElevationM: -5.4 },
      { lat: 51.4960, lng: -0.0250, stationM: 9100, widthM: 300, bedElevationM: -5.6 },
      { lat: 51.4855, lng: -0.0090, stationM: 10700, widthM: 320, bedElevationM: -5.9 },
      { lat: 51.4840, lng: -0.0060, stationM: 11000, widthM: 320, bedElevationM: -6.0 },
      { lat: 51.4920, lng: 0.0030, stationM: 12100, widthM: 330, bedElevationM: -6.3 },
      { lat: 51.5030, lng: 0.0050, stationM: 12975, widthM: 340, bedElevationM: -6.5 },
    ];
    return {
      id: 'reach-thames-london',
      name: 'Thames River (London Tideway, UK)',
      description: 'Historic urban tideway corridor with flood containment walls, docks, and bridges.',
      source: 'hydrorivers',
      centerline,
      crossSections: [
        createDefaultEmpiricalStation(0, -3.5, 65.0, 0.026, 220),
        createDefaultEmpiricalStation(4250, -4.6, 65.0, 0.026, 210),
        createDefaultEmpiricalStation(12975, -6.5, 65.0, 0.026, 340),
      ],
      bounds: [51.480, -0.130, 51.515, 0.010],
      reachLengthM: 12975,
      meanWidthM: 240,
      defaultManningN: 0.026,
      upstreamDischargeEstimateM3s: 65.0,
    };
  });
}

/**
 * Seine River Reach (Paris, France)
 */
export function createSeineReach(): RiverReachDefinition {
  return getReachFromDb('reach-seine-paris', () => {
    const centerline = [
      { lat: 48.8390, lng: 2.3730, stationM: 0, widthM: 130, bedElevationM: 26.5 },
      { lat: 48.8495, lng: 2.3590, stationM: 1540, widthM: 140, bedElevationM: 26.1 },
      { lat: 48.8525, lng: 2.3490, stationM: 2350, widthM: 120, bedElevationM: 25.8 },
      { lat: 48.8570, lng: 2.3410, stationM: 3040, widthM: 135, bedElevationM: 25.6 },
      { lat: 48.8590, lng: 2.3360, stationM: 3470, widthM: 145, bedElevationM: 25.5 },
      { lat: 48.8610, lng: 2.3280, stationM: 4100, widthM: 150, bedElevationM: 25.3 },
      { lat: 48.8630, lng: 2.3190, stationM: 4800, widthM: 155, bedElevationM: 25.1 },
      { lat: 48.8635, lng: 2.3125, stationM: 5300, widthM: 160, bedElevationM: 25.0 },
      { lat: 48.8640, lng: 2.3080, stationM: 5650, widthM: 160, bedElevationM: 24.9 },
      { lat: 48.8635, lng: 2.3010, stationM: 6200, widthM: 155, bedElevationM: 24.7 },
      { lat: 48.8615, lng: 2.2960, stationM: 6650, widthM: 150, bedElevationM: 24.6 },
      { lat: 48.8595, lng: 2.2925, stationM: 7000, widthM: 145, bedElevationM: 24.5 },
      { lat: 48.8555, lng: 2.2875, stationM: 7550, widthM: 140, bedElevationM: 24.4 },
      { lat: 48.8505, lng: 2.2795, stationM: 8300, widthM: 145, bedElevationM: 24.2 },
      { lat: 48.8465, lng: 2.2730, stationM: 9006, widthM: 140, bedElevationM: 24.0 },
    ];
    return {
      id: 'reach-seine-paris',
      name: 'Seine River (Paris Historic Reach, France)',
      description: 'Iconic regulated urban river channel flanked by stone quays, weir barrages, and historic bridges.',
      source: 'hydrorivers',
      centerline,
      crossSections: [
        createDefaultEmpiricalStation(0, 26.5, 280.0, 0.027, 130),
        createDefaultEmpiricalStation(4800, 25.1, 280.0, 0.027, 155),
        createDefaultEmpiricalStation(9006, 24.0, 280.0, 0.027, 140),
      ],
      bounds: [48.835, 2.265, 48.870, 2.380],
      reachLengthM: 9006,
      meanWidthM: 145,
      defaultManningN: 0.027,
      upstreamDischargeEstimateM3s: 280.0,
    };
  });
}

/**
 * Amazon River (Óbidos Narrows, Brazil)
 */
export function createAmazonReach(): RiverReachDefinition {
  return getReachFromDb('reach-amazon-obidos', () => {
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
  });
}

/**
 * Colorado River (Grand Canyon, USA)
 */
export function createColoradoReach(): RiverReachDefinition {
  return getReachFromDb('reach-colorado-canyon', () => {
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
  });
}

/**
 * Nile River (Aswan Reach, Egypt)
 */
export function createNileReach(): RiverReachDefinition {
  return getReachFromDb('reach-nile-aswan', () => {
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
  });
}

/**
 * Hudson River (New York, USA)
 */
export function createHudsonReach(): RiverReachDefinition {
  return getReachFromDb('reach-hudson-nyc', () => {
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
  });
}


/**
 * 500m Canonical Engineering Benchmark Reach (Prismatic flume validation)
 */
export function createBenchmark500mReach(): RiverReachDefinition {
  const reachLengthM = 500.0;
  const meanWidthM = 24.0;
  const slope = 0.001;
  const baseInvertM = 100.0;
  const dischargeM3s = 35.0;
  const manningN = 0.030;

  // Located on the wide open Rhine river corridor in Basel (47.560°N, 7.590°E)
  // Guarantees bright, high-resolution satellite imagery and crisp contrast
  const latStart = 47.560;
  const lngStart = 7.590;
  const dLat = 0.0045;

  const centerline = [
    { lat: latStart, lng: lngStart, stationM: 0, widthM: meanWidthM, bedElevationM: baseInvertM },
    {
      lat: latStart + dLat * 0.25,
      lng: lngStart + 0.0003,
      stationM: 125,
      widthM: meanWidthM,
      bedElevationM: baseInvertM - 125 * slope,
    },
    {
      lat: latStart + dLat * 0.5,
      lng: lngStart + 0.0005,
      stationM: 250,
      widthM: meanWidthM,
      bedElevationM: baseInvertM - 250 * slope,
    },
    {
      lat: latStart + dLat * 0.75,
      lng: lngStart + 0.0003,
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
    bounds: [latStart - 0.002, lngStart - 0.003, latStart + dLat + 0.002, lngStart + 0.003],
    reachLengthM,
    meanWidthM,
    defaultManningN: manningN,
    upstreamDischargeEstimateM3s: dischargeM3s,
  };
}

/**
 * Conical Flume Benchmark Reach (IAHR / USACE 500m Flume with central conical obstacle)
 *
 * Implements the classic Conical Flume benchmark:
 * - 500m long, 30m wide hydraulic testing basin
 * - Central conical bed elevation island (radius 8m, height 1.8m, peak at station 250m)
 * - Produces standing bow wave, supercritical flow on flanks, and recirculating wake
 */
export function createConicalFlumeReach(): RiverReachDefinition {
  const reachLengthM = 500.0;
  const meanWidthM = 30.0;
  const slope = 0.001;
  const baseInvertM = 100.0;
  const dischargeM3s = 35.0;
  const manningN = 0.025;

  // Located on the wide open Rhine river corridor in Basel (47.560°N, 7.590°E)
  // Guarantees bright, high-resolution satellite imagery and crisp contrast
  const latStart = 47.560;
  const lngStart = 7.590;
  const dLat = 0.0045;

  const centerline = [
    { lat: latStart, lng: lngStart, stationM: 0, widthM: meanWidthM, bedElevationM: baseInvertM },
    {
      lat: latStart + dLat * 0.25,
      lng: lngStart + 0.0003,
      stationM: 125,
      widthM: meanWidthM,
      bedElevationM: baseInvertM - 125 * slope,
    },
    {
      lat: latStart + dLat * 0.5,
      lng: lngStart + 0.0005,
      stationM: 250,
      widthM: meanWidthM,
      bedElevationM: baseInvertM - 250 * slope + 1.8, // Conical apex rising 1.8m above bed
    },
    {
      lat: latStart + dLat * 0.75,
      lng: lngStart + 0.0003,
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

  // Upstream inlet station (flat flume bed)
  const cs0 = createDefaultEmpiricalStation(0, baseInvertM, dischargeM3s, manningN);

  // Mid station at 250m with conical island obstacle (radius 8m, height 1.8m)
  const cs250Invert = baseInvertM - 250 * slope;
  const coneApex = cs250Invert + 1.8;
  const cs250Points: CrossSectionPoint[] = [
    { xM: -22, zM: cs250Invert + 3.0 },
    { xM: -15, zM: cs250Invert },
    { xM: -8, zM: cs250Invert },
    { xM: -4, zM: cs250Invert + 0.9 },
    { xM: 0, zM: coneApex },
    { xM: 4, zM: cs250Invert + 0.9 },
    { xM: 8, zM: cs250Invert },
    { xM: 15, zM: cs250Invert },
    { xM: 22, zM: cs250Invert + 3.0 },
  ];
  const cs250: CrossSectionStation = {
    stationM: 250,
    template: {
      type: 'trapezoidal',
      bottomWidthM: 30.0,
      bankSlopeHtoV: 1.5,
      depthM: 3.0,
      leftFloodplainWidthM: 5.0,
      rightFloodplainWidthM: 5.0,
    },
    points: cs250Points,
    invertElevM: cs250Invert,
    leftBankElevM: cs250Invert + 3.0,
    rightBankElevM: cs250Invert + 3.0,
    manningN,
  };

  // Downstream outlet station
  const cs500 = createDefaultEmpiricalStation(500, baseInvertM - 500 * slope, dischargeM3s, manningN);

  return {
    id: 'conical-flume',
    name: 'Conical Flume Benchmark (CFD Flume)',
    description: 'Controlled 500-meter laboratory flume with central conical obstacle for 2D/3D CFD validation, bow wave shock, and turbulent wake.',
    source: 'user-drawn',
    centerline,
    crossSections: [cs0, cs250, cs500],
    bounds: [latStart - 0.005, lngStart - 0.007, latStart + dLat + 0.005, lngStart + 0.007],
    reachLengthM,
    meanWidthM,
    defaultManningN: manningN,
    upstreamDischargeEstimateM3s: dischargeM3s,
  };
}

export const GLOBAL_BUNDLED_REACHES: RiverReachDefinition[] = [
  ...GLOBAL_RIVER_DATABASE.map((entry) => convertEntryToReachDefinition(entry)),
  createBenchmark500mReach(),
  createConicalFlumeReach(),
];
