/**
 * Wastewater Collection & Sewer Network Modeling Types
 *
 * Implements standard sanitary sewer engineering components, gravity Manning
 * hydraulics, lift station pumping, and real-world DEM elevation references.
 */

export type WastewaterElementType =
  | 'manhole'
  | 'conduit'
  | 'wet-well'
  | 'pump'
  | 'force-main'
  | 'outfall';

export interface BaseWastewaterElement {
  id: string;
  label: string;
  type: WastewaterElementType;
  description?: string;
}

/**
 * Sewer Manhole / Access Chamber Node
 */
export interface WastewaterManhole extends BaseWastewaterElement {
  type: 'manhole';
  lat: number;
  lng: number;
  /** Ground surface elevation from real Earth DEM (m MSL) */
  rimElevation: number;
  /** Channel bottom elevation at the manhole invert (m MSL) */
  invertElevation: number;
  /** Chamber drop/depth: rimElevation - invertElevation (m) */
  depth: number;
  /** Circular chamber diameter in millimeters (default: 1000mm or 1200mm) */
  diameterMm: number;
  /** Contributing tributary population */
  population: number;
  /** Per-capita sewage contribution rate in Liters/capita/day (standard: 135-150 lpcd) */
  unitLoadingLpcd: number;
  /** Peaking factor formulation applied for diurnal max flow */
  peakingFormula: 'babbitt' | 'harmon' | 'ten-states' | 'constant';
  /** Constant peaking multiplier if constant is chosen */
  customPeakingFactor?: number;
  /** Direct additional dry weather base flow (L/s) */
  baseDryWeatherFlowLs: number;
  /** Wet-weather Inflow & Infiltration allowance (L/s) */
  inflowInfiltrationLs: number;

  // Computed hydraulic simulation outputs
  averageSanitaryFlowLs?: number;
  peakSanitaryFlowLs?: number;
  totalInflowLs?: number;
  waterElevationM?: number;
  waterDepthM?: number;
  surchargeDepthM?: number;
  isSurcharged?: boolean;
  isFlooding?: boolean;
}

/**
 * Gravity Sewer Conduit (Circular Pipe)
 */
export interface WastewaterConduit extends BaseWastewaterElement {
  type: 'conduit';
  startNodeId: string;
  endNodeId: string;
  /** Internal barrel diameter (mm) */
  diameterMm: number;
  /** Pipe material */
  material: 'PVC' | 'RCC' | 'HDPE' | 'DI' | 'Clay';
  /** Manning's roughness coefficient n (default 0.010 for PVC, 0.013 for RCC) */
  manningN: number;
  /** Upstream pipe invert elevation (m MSL) */
  upstreamInvertM: number;
  /** Downstream pipe invert elevation (m MSL) */
  downstreamInvertM: number;
  /** Geodesic 3D terrain distance in meters */
  lengthM: number;
  /** Slope of the pipe bed: (upstreamInvert - downstreamInvert) / length (m/m) */
  slopeMPerM: number;

  // Computed hydraulic simulation outputs
  designFlowLs?: number;
  fullCapacityLs?: number;
  actualVelocityMs?: number;
  fullVelocityMs?: number;
  flowDepthM?: number;
  flowDepthRatio?: number; // d/D ratio (0 to 1.0+)
  hydraulicRadiusM?: number;
  froudeNumber?: number;
  selfCleansingOk?: boolean; // V >= 0.6 m/s
  scourVelocityOk?: boolean; // V <= 3.0 m/s
  isSurcharged?: boolean; // d/D > 1.0
  isReverseSlope?: boolean; // slope <= 0
}

/**
 * Lift Station Wet Well / Sump
 */
export interface WastewaterWetWell extends BaseWastewaterElement {
  type: 'wet-well';
  lat: number;
  lng: number;
  rimElevation: number; // Ground level from DEM (m MSL)
  floorElevation: number; // Sump invert floor (m MSL)
  diameterM: number;
  minWaterLevelM: number; // Low water cut-off level (m MSL)
  maxWaterLevelM: number; // Lead pump duty start level (m MSL)
  alarmLevelM: number; // High water alarm level (m MSL)
  storageVolumeM3: number;
  inflowLs?: number;
}

/**
 * Wastewater Submersible Sewage Pump
 */
export interface WastewaterPump extends BaseWastewaterElement {
  type: 'pump';
  startNodeId: string; // Wet well ID
  endNodeId: string; // Discharge node or force main inlet
  status: 'ON' | 'OFF';
  ratedDischargeLs: number; // Rated discharge (L/s)
  dynamicHeadM: number; // Total dynamic pumping head TDH (m)
  efficiencyPercent: number; // Standard: 70-80%
  powerKw?: number;
}

/**
 * Pressurized Force Main (Pumping Main)
 */
export interface WastewaterForceMain extends BaseWastewaterElement {
  type: 'force-main';
  startNodeId: string;
  endNodeId: string;
  diameterMm: number;
  material: 'DI' | 'HDPE' | 'PVC';
  lengthM: number;
  cFactor: number; // Hazen-Williams C (120-130)
  velocityMs?: number;
  frictionHeadlossM?: number;
}

/**
 * Sewer Network Outfall (Discharge to STP / Receiving Waters)
 */
export interface WastewaterOutfall extends BaseWastewaterElement {
  type: 'outfall';
  lat: number;
  lng: number;
  invertElevation: number; // Outfall discharge invert (m MSL)
  receivingWaterElevation: number; // Boundary water level (m MSL)
  totalDischargeLs?: number;
}

export type WastewaterNetworkElement =
  | WastewaterManhole
  | WastewaterConduit
  | WastewaterWetWell
  | WastewaterPump
  | WastewaterForceMain
  | WastewaterOutfall;

/**
 * Complete Wastewater Collection Network Model
 */
export interface WastewaterNetwork {
  name: string;
  description?: string;
  units: 'SI';
  manholes: WastewaterManhole[];
  conduits: WastewaterConduit[];
  wetWells: WastewaterWetWell[];
  pumps: WastewaterPump[];
  forceMains: WastewaterForceMain[];
  outfalls: WastewaterOutfall[];
}

/**
 * Wastewater Simulation Executive Summary
 */
export interface WastewaterSimulationSummary {
  converged: boolean;
  runTimestamp: string;
  totalPopulation: number;
  totalDryWeatherFlowLs: number;
  totalPeakSanitaryFlowLs: number;
  totalInflowInfiltrationLs: number;
  totalOutfallDischargeLs: number;
  flowImbalanceLs: number;
  totalGravityConduitLengthM: number;
  totalForceMainLengthM: number;
  maxCapacityUtilizationRatio: number; // max d/D
  criticalConduitId?: string;
  minVelocityMs: number;
  minVelocityConduitId?: string;
  maxVelocityMs: number;
  maxVelocityConduitId?: string;
  totalPumpingPowerKw: number;
  surchargedConduitIds: string[];
  subCleansingConduitIds: string[]; // V < 0.6 m/s
  scourWarningConduitIds: string[]; // V > 3.0 m/s
  reverseSlopeConduitIds: string[];
  floodedManholeIds: string[];
}

export type ActiveWastewaterTool =
  | 'select'
  | 'add-manhole'
  | 'add-conduit'
  | 'add-wetwell'
  | 'add-pump'
  | 'add-forcemain'
  | 'add-outfall'
  | 'delete'
  | 'profile-select';

export type WastewaterThematicDisplay =
  | 'none'
  | 'capacity' // pipe d/D ratio
  | 'velocity' // pipe velocity
  | 'depth' // manhole invert depth
  | 'slope' // pipe slope %
  | 'surcharge'; // surcharged / flood status
