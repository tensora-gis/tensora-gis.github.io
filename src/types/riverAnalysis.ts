/**
 * Comprehensive 2D River Analysis & Shallow-Water Hydrodynamic Modelling Types
 *
 * Supports:
 * - 2D Finite-Volume Shallow Water Equations (SWE) / Saint-Venant CFD
 * - HydroRIVERS global river network integration
 * - NASA SWOT satellite observation ingestion and calibration
 * - Modifiable hydraulic structures (Levees, Weirs, Bridges, Culverts, Gates, Embankments)
 * - Multi-temporal boundary conditions (Hydrographs, Rating curves, Tidal stage, Rain)
 * - Curvilinear & structured 2D computational meshes with DEM + surveyed bathymetry
 * - Multi-format export (GeoJSON, GeoTIFF ASCII raster, Hydraulic summary CSV)
 */

export type RiverThematicDisplay =
  | 'depth'
  | 'velocity'
  | 'wse'
  | 'froude'
  | 'shear-stress'
  | 'elevation';

export type ActiveRiverTool =
  | 'pan'
  | 'select-cell'
  | 'add-levee'
  | 'add-weir'
  | 'add-bridge'
  | 'add-culvert'
  | 'add-gate'
  | 'add-embankment'
  | 'add-gauge';

export interface RiverCoordinate {
  lat: number;
  lng: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

/**
 * 2D Finite-Volume Computational Cell
 */
export interface RiverMeshCell {
  id: number;
  i: number;
  j: number;
  centerLat: number;
  centerLng: number;
  centerX: number; // Local metric coordinates in meters
  centerY: number;
  bedElevation: number; // $z_{bed}$ (m MSL)
  manningN: number; // Roughness coefficient ($s/m^{1/3}$)
  areaM2: number; // Cell area ($m^2$)
  corners: [number, number][]; // [lat, lng] array of 4 corners
  neighbors: number[]; // Neighbor cell IDs [-1 for boundary / domain edge]
  faceLengths: number[]; // Length of each face in meters
  faceNormals: [number, number][]; // Unit normal vectors [nx, ny] for each face
  structureId?: string; // ID of active hydraulic structure on this cell
  isBoundary?: 'upstream' | 'downstream' | 'left_bank' | 'right_bank';
}

/**
 * River Centerline Station Point
 */
export interface RiverCenterlinePoint {
  lat: number;
  lng: number;
  stationM: number;
  bankWidthM: number;
  meanBedElevationM: number;
}

/**
 * 2D River Computational Mesh
 */
export interface RiverMesh {
  id: string;
  name: string;
  description?: string;
  reachLengthM: number;
  meanWidthM: number;
  nx: number; // Longitudinal segments
  ny: number; // Lateral transverse cells per cross-section
  cells: RiverMeshCell[];
  centerline: RiverCenterlinePoint[];
  bounds: [number, number, number, number]; // [minLat, minLng, maxLat, maxLng]
  surveyedBathymetryApplied?: boolean;
}

/**
 * Hydraulic Structures
 */
export type RiverStructureType =
  | 'levee'
  | 'weir'
  | 'bridge'
  | 'culvert'
  | 'gate'
  | 'embankment';

export interface RiverStructureBase {
  id: string;
  name: string;
  type: RiverStructureType;
  enabled: boolean;
  coordinates: RiverCoordinate[];
  cellIndices: number[];
  description?: string;
}

export interface RiverLeveeStructure extends RiverStructureBase {
  type: 'levee';
  crestElevationM: number;
  topWidthM: number;
  sideSlopeHtoV: number;
}

export interface RiverWeirStructure extends RiverStructureBase {
  type: 'weir';
  weirType: 'broad-crested' | 'sharp-crested';
  crestElevationM: number;
  crestLengthM: number;
  dischargeCoefficient: number; // e.g. 1.7 for broad-crested, 1.84 for sharp-crested (metric)
}

export interface RiverBridgeStructure extends RiverStructureBase {
  type: 'bridge';
  deckElevationM: number;
  lowChordElevationM: number;
  pierCount: number;
  pierWidthM: number;
  pierDragCoeff: number; // e.g. 1.2
}

export interface RiverCulvertStructure extends RiverStructureBase {
  type: 'culvert';
  barrelCount: number;
  diameterOrSpanM: number;
  riseM: number;
  lengthM: number;
  inletInvertM: number;
  outletInvertM: number;
  manningN: number;
  inletLossCoeff: number; // e.g. 0.5
}

export interface RiverGateStructure extends RiverStructureBase {
  type: 'gate';
  gateType: 'sluice' | 'radial';
  gateWidthM: number;
  openingM: number;
  crestElevationM: number;
  dischargeCoefficient: number; // e.g. 0.6
}

export interface RiverEmbankmentStructure extends RiverStructureBase {
  type: 'embankment';
  crestElevationM: number;
  topWidthM: number;
  overtopDischargeCoeff: number;
}

export type RiverStructure =
  | RiverLeveeStructure
  | RiverWeirStructure
  | RiverBridgeStructure
  | RiverCulvertStructure
  | RiverGateStructure
  | RiverEmbankmentStructure;

/**
 * Boundary Conditions
 */
export interface RiverBoundaryConditions {
  upstreamType: 'constant-discharge' | 'hydrograph';
  upstreamDischargeM3s: number;
  upstreamHydrograph?: { timeSec: number; dischargeM3s: number }[];
  downstreamType: 'normal-depth' | 'fixed-stage' | 'tidal-hydrograph' | 'critical-depth';
  downstreamSlope: number; // for normal-depth rating curve
  downstreamStageM: number; // for fixed-stage
  downstreamTidal?: { timeSec: number; stageM: number }[];
  rainfallIntensityMmPerHr: number; // spatially uniform rainfall
  initialWaterDepthM: number; // initial low-flow or dry bed
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
 * NASA SWOT Satellite Observation Record
 */
export interface SwotObservation {
  reachId: string;
  satellitePassDate: string;
  observedWseM: number; // Water Surface Elevation (m MSL)
  observedWidthM: number; // River width (m)
  observedSlope: number; // Longitudinal surface slope (m/m)
  observedDischargeM3s?: number; // Estimated SWOT discharge
  uncertaintyWseM: number; // SWOT KaRIn radar uncertainty (+- m)
  notes?: string;
}

/**
 * HydroRIVERS Global Reach Data
 */
export interface HydroRiverReach {
  reachId: number;
  riverName: string;
  mainBasin: string;
  continent: string;
  streamOrder: number;
  meanDischargeM3s: number;
  gradientPercent: number;
  lengthKm: number;
  upAreaKm2: number;
  centerCoordinates: RiverCoordinate;
  pathCoordinates: RiverCoordinate[];
}

/**
 * Surveyed Bathymetry Sounding / Cross-Section Point
 */
export interface SurveyedSoundingPoint {
  lat: number;
  lng: number;
  elevationM: number; // Bed elevation above MSL
  depthM?: number; // Water depth if surveyed from surface
  distanceAcrossM?: number;
}

/**
 * Real-Time 2D Flow Field State
 */
export interface RiverFlowState {
  timeSec: number;
  stepCount: number;
  depth: Float32Array; // Water depth h (m) for each cell
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
}

/**
 * Comprehensive 2D River Simulation Summary
 */
export interface RiverSimulationSummary {
  converged: boolean;
  totalTimeSimulatedSec: number;
  totalSteps: number;
  maxWaterDepthM: number;
  maxVelocityMs: number;
  maxWseM: number;
  meanVelocityMs: number;
  totalInundationAreaHa: number;
  totalWaterVolumeM3: number;
  massConservationErrorPercent: number;
  criticalFroudeCellsCount: number;
  swotCalibrationComparison?: {
    observedWseM: number;
    simulatedWseM: number;
    differenceM: number;
    wseRmseM: number;
    agreementStatus: 'EXCELLENT' | 'GOOD' | 'NEEDS_BATHYMETRY_CALIBRATION';
  };
  gaugeHydrographs: Record<string, GaugeTimePoint[]>;
}

/**
 * River Analysis Project for IndexedDB storage
 */
export interface RiverProject {
  id: string;
  name: string;
  lastModified: string;
  mesh: RiverMesh;
  structures: RiverStructure[];
  boundaries: RiverBoundaryConditions;
  gauges: RiverMonitoringGauge[];
  swotObservations?: SwotObservation[];
  summary?: RiverSimulationSummary;
}
