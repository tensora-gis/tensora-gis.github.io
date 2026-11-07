/**
 * River Reach, Geometry, Grid Mesh and Boundary Condition Types
 */

export interface RiverCoordinate {
  lat: number;
  lng: number;
}

export interface RiverCenterlinePoint {
  lat: number;
  lng: number;
  stationM: number;
  widthM?: number;
  bedElevationM?: number;
}

export interface CrossSectionPoint {
  xM: number;
  zM: number;
  roughnessN?: number;
}

export type CrossSectionTemplateType =
  | 'trapezoidal'
  | 'rectangular'
  | 'compound'
  | 'freeform';

export interface CrossSectionTemplate {
  type: CrossSectionTemplateType;
  bottomWidthM: number;
  bankSlopeHtoV: number;
  depthM: number;
  leftFloodplainWidthM?: number;
  rightFloodplainWidthM?: number;
  freeformPoints?: CrossSectionPoint[];
}

export interface CrossSectionStation {
  stationM: number;
  template: CrossSectionTemplate;
  points: CrossSectionPoint[];
  invertElevM: number;
  leftBankElevM: number;
  rightBankElevM: number;
  manningN: number;
}

export type RiverGeometrySource =
  | 'swot-inversion'
  | 'user-drawn'
  | 'swot-calibrated'
  | 'hydrorivers';

export interface RiverReachDefinition {
  id: string;
  name: string;
  description?: string;
  source: RiverGeometrySource;
  centerline: RiverCenterlinePoint[];
  crossSections: CrossSectionStation[];
  bounds: [number, number, number, number]; // [minLat, minLng, maxLat, maxLng]
  reachLengthM: number;
  meanWidthM: number;
  defaultManningN: number;
  upstreamDischargeEstimateM3s?: number;
}

/**
 * 2D Finite-Volume Computational Cell
 */
export interface RiverGridCell {
  id: number;
  i: number;
  j: number;
  centerLat: number;
  centerLng: number;
  centerX: number; // Local metric coordinates in meters
  centerY: number;
  bedElevation: number; // $z_{bed}$ (m MSL)
  manningN: number; // Roughness coefficient
  areaM2: number; // Cell area
  corners: [number, number][]; // [lat, lng] array of 4 corners
  neighbors: number[]; // Neighbor cell IDs [-1, -2, -3, -4 for boundary / domain edge]
  faceLengths: number[]; // Length of each face in meters
  faceNormals: [number, number][]; // Unit normal vectors [nx, ny] for each face
  isBoundary?: 'upstream' | 'downstream' | 'left_bank' | 'right_bank';
}

/**
 * 2D River Computational Mesh
 */
export interface RiverGridMesh {
  id: string;
  name: string;
  description?: string;
  source: RiverGeometrySource;
  reachLengthM: number;
  meanWidthM: number;
  nx: number; // Streamwise cells
  ny: number; // Transverse cells
  cells: RiverGridCell[];
  centerline: RiverCenterlinePoint[];
  bounds: [number, number, number, number];
  surveyedBathymetryApplied?: boolean;
}

/**
 * Boundary Conditions
 */
export interface RiverBoundaryConditions {
  upstreamType: 'constant-discharge' | 'hydrograph';
  upstreamDischargeM3s: number;
  upstreamHydrograph?: { timeSec: number; dischargeM3s: number }[];
  downstreamType: 'normal-depth' | 'fixed-stage' | 'critical-depth';
  downstreamSlope: number;
  downstreamStageM: number;
  rainfallMmPerHour: number;
  initialWaterDepthM: number;
  manningRoughnessDefault: number;
}

/**
 * Monitoring Gauge Station
 */
export interface RiverMonitoringGauge {
  id: string;
  name: string;
  lat: number;
  lng: number;
  cellIndex: number;
  stationChainageM: number;
}

/**
 * Hydrodynamics Flow State
 */
export interface HydrodynamicsState {
  timeSec: number;
  stepCount: number;
  depth: Float32Array; // Water depth h (m)
  wse: Float32Array; // Water surface elevation h + z_bed (m MSL)
  u: Float32Array; // x-velocity component (m/s)
  v: Float32Array; // y-velocity component (m/s)
  velocityMag: Float32Array; // sqrt(u^2 + v^2) (m/s)
  froude: Float32Array; // Froude number
  shearStress: Float32Array; // Boundary shear stress tau (N/m^2)
  isWet: Uint8Array; // 1 = wet, 0 = dry
}

/**
 * Time-History Point for Monitoring Gauges
 */
export interface GaugeTimePoint {
  timeSec: number;
  wseM: number;
  depthM: number;
  velocityMs: number;
  dischargeM3s: number;
  nuT?: number;
  concentrationKgM3?: number;
  bedChangeM?: number;
}

/**
 * NASA SWOT Satellite Altimetry Observation Record
 */
export interface SwotRiverObservation {
  reachId: string;
  satellitePassDate: string;
  observedWseM: number;
  observedWidthM: number;
  observedSlope: number;
  observedDischargeM3s?: number;
  uncertaintyWseM: number;
  notes?: string;
}

/**
 * Comprehensive Simulation Summary
 */
export interface RiverCfdSummary {
  converged: boolean;
  totalTimeSimulatedSec: number;
  totalSteps: number;
  backendUsed: 'webgpu' | 'webgl2' | 'cpu';
  maxWaterDepthM: number;
  maxVelocityMs: number;
  maxWseM: number;
  meanVelocityMs: number;
  totalInundationAreaHa: number;
  totalWaterVolumeM3: number;
  massConservationErrorPercent: number;
  criticalFroudeCellsCount: number;
  turbulenceSummary?: {
    model: string;
    maxNuT: number;
    meanNuT: number;
    maxK: number;
  };
  sedimentSummary?: {
    formula: string;
    d50Mm: number;
    totalScourVolumeM3: number;
    totalDepositionVolumeM3: number;
    netBedVolumeChangeM3: number;
    maxScourDepthM: number;
    maxDepositionHeightM: number;
  };
  swotCalibrationComparison?: {
    observedWseM: number;
    simulatedWseM: number;
    differenceM: number;
    wseRmseM: number;
    agreementStatus: 'EXCELLENT' | 'GOOD' | 'NEEDS_CALIBRATION';
  };
  gaugeHydrographs: Record<string, GaugeTimePoint[]>;
}
