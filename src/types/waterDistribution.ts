/**
 * Water Distribution Network & Hydraulic Modeling Types
 *
 * Implements standard hydraulic network elements, physical properties,
 * simulation parameters, and real terrain DEM elevation references.
 */

export type ElementType = 'junction' | 'pipe' | 'reservoir' | 'tank' | 'pump' | 'valve';

export interface BaseElement {
  id: string;
  label: string;
  type: ElementType;
  description?: string;
}

export interface WaterJunction extends BaseElement {
  type: 'junction';
  lat: number;
  lng: number;
  /** Ground elevation above MSL in meters (sampled from real DEM or user-edited) */
  elevation: number;
  /** Base water demand in L/s */
  baseDemand: number;
  /** Actual simulated head (elevation + pressure) in meters MSL */
  head?: number;
  /** Pressure in meters H2O (Head - Elevation). Note: 1 m H2O ≈ 0.098 bar ≈ 1.42 psi */
  pressure?: number;
  /** Calculated demand at current timestep (L/s) */
  actualDemand?: number;
  status?: 'normal' | 'low-pressure' | 'high-pressure' | 'negative';
  /** Available fire flow at 15m residual (L/s) */
  actualFireFlowLs?: number;
  /** Water age in hours */
  waterAgeHours?: number;
  /** Chlorine residual concentration in mg/L */
  chlorineResidualMgL?: number;
}

export interface WaterReservoir extends BaseElement {
  type: 'reservoir';
  lat: number;
  lng: number;
  /** Ground elevation above MSL in meters */
  elevation: number;
  /** Total hydraulic head / water surface level above MSL (meters) */
  totalHead: number;
  /** Simulated inflow/outflow rate (L/s) - negative means supplying water */
  netFlow?: number;
}

export interface WaterTank extends BaseElement {
  type: 'tank';
  lat: number;
  lng: number;
  /** Tank bottom/foundation elevation above MSL in meters */
  elevation: number;
  /** Initial water depth above base (meters) */
  initialLevel: number;
  /** Minimum water depth (meters) */
  minLevel: number;
  /** Maximum overflow depth (meters) */
  maxLevel: number;
  /** Tank internal diameter in meters */
  diameter: number;
  /** Total capacity volume in m³ */
  volume?: number;
  /** Current hydraulic head = elevation + water level */
  head?: number;
  netFlow?: number;
}

export interface WaterPipe extends BaseElement {
  type: 'pipe';
  startNodeId: string;
  endNodeId: string;
  /** Length in meters (computed automatically from real geodesic distance or manually set) */
  length: number;
  /** Internal diameter in millimeters (e.g. 100, 150, 200, 250, 300, 400 mm) */
  diameter: number;
  /** Hazen-Williams C roughness factor (e.g. 130 for PVC/HDPE, 120 for DI, 100 for Cast Iron) */
  roughness: number;
  /** Minor loss coefficient (K) for fittings/bends */
  minorLossCoeff: number;
  /** Operational status */
  status: 'OPEN' | 'CLOSED' | 'CV'; // CV = Check Valve (prevents reverse flow)
  /** Pipe physical wall material for transient wave speed computation */
  material?: 'DI' | 'Ductile Iron' | 'Steel' | 'PVC' | 'HDPE' | 'Concrete';
  /** Pipe nominal pressure rating (bar), standard PN10, PN16, PN25 */
  pressureRatingPnBar?: number;
  
  // Simulation results
  flow?: number; // L/s (positive from startNode to endNode, negative opposite)
  velocity?: number; // m/s
  unitHeadloss?: number; // m / km
  totalHeadloss?: number; // m
  frictionFactor?: number;
  /** Transient wave speed a (m/s) */
  waveSpeedMs?: number;
  /** Maximum transient surge head (m MSL) under Joukowsky/Allievi water hammer */
  maxTransientHeadM?: number;
  /** Minimum transient surge head (m MSL) */
  minTransientHeadM?: number;
}

export interface WaterPump extends BaseElement {
  type: 'pump';
  startNodeId: string;
  endNodeId: string;
  status: 'OPEN' | 'CLOSED';
  curveType: '1-POINT' | '3-POINT' | 'POWER';
  /** Rated design flow (L/s) */
  designFlow: number;
  /** Rated design head (m) */
  designHead: number;
  /** Shutoff head (m) at Q = 0 (defaults to 1.33 * designHead) */
  shutoffHead: number;
  /** Maximum flow (L/s) at Head = 0 (defaults to 2 * designFlow) */
  maxFlow: number;
  /** Pump motor power in kW */
  powerKw: number;
  /** Speed multiplier (1.0 = nominal speed) */
  speed: number;

  // Simulation results
  operatingFlow?: number;
  operatingHead?: number;
  energyConsumptionKwh?: number;
}

export type ValveType = 'PRV' | 'PSV' | 'PBV' | 'FCV' | 'TCV' | 'GPV';

export interface WaterValve extends BaseElement {
  type: 'valve';
  startNodeId: string;
  endNodeId: string;
  valveType: ValveType;
  /** Setting: PRV/PSV/PBV = target pressure (m); FCV = target flow (L/s); TCV = loss coeff */
  setting: number;
  diameter: number; // mm
  status: 'ACTIVE' | 'OPEN' | 'CLOSED';
  minorLossCoeff?: number;
  
  // Simulation results
  flow?: number;
  headloss?: number;
}

export type NetworkElement =
  | WaterJunction
  | WaterReservoir
  | WaterTank
  | WaterPipe
  | WaterPump
  | WaterValve;

export interface WaterDistributionNetwork {
  name: string;
  description?: string;
  units: 'SI'; // SI: Flow L/s, Diameter mm, Length m, Head m, Pressure m H2O
  headlossFormula: 'H-W'; // Hazen-Williams
  junctions: WaterJunction[];
  reservoirs: WaterReservoir[];
  tanks: WaterTank[];
  pipes: WaterPipe[];
  pumps: WaterPump[];
  valves: WaterValve[];
}

export interface HourlySimulationPoint {
  hour: number;
  timeLabel: string;
  demandMultiplier: number;
  totalDemandLs: number;
  minPressureM: number;
  maxPressureM: number;
  tankWaterLevels: Record<string, number>; // tankId -> level in meters
  pumpFlows: Record<string, number>; // pumpId -> operating flow L/s
}

export interface FireFlowResult {
  junctionId: string;
  label: string;
  elevation: number;
  baseDemand: number;
  availableFireFlowLs: number; // L/s while maintaining residual pressure >= 15m
  residualPressureM: number; // Pressure at tested node during fire flow
  systemMinResidualM: number; // Lowest pressure in the rest of system
  isAdequate: boolean; // >= 35 L/s (approx 550 GPM)
}

export interface WaterQualityResult {
  nodeId: string;
  waterAgeHours: number; // Residence time in network
  chlorineResidualMgL: number; // Free available chlorine (e.g. 0.2 - 2.0 mg/L)
  qualityStatus: 'Good' | 'Fair' | 'Stagnant' | 'Low-Chlorine';
}

export interface PipeOptimizationResult {
  pipeId: string;
  currentDiameterMm: number;
  recommendedDiameterMm: number;
  velocityMs: number;
  unitHeadlossMkm: number;
  reason: 'Optimal' | 'Upsize: High Headloss' | 'Upsize: High Velocity' | 'Downsize: Low Velocity / Stagnant';
  estimatedCostSavingOrUpgrade: string;
}

/**
 * Hydraulic Transient & Water Hammer (Surge Engine) Types
 */
export interface TransientPipeResult {
  pipeId: string;
  pipeMaterial: 'DI' | 'Ductile Iron' | 'Steel' | 'PVC' | 'HDPE' | 'Concrete';
  waveSpeedMs: number;
  acousticPeriodSec: number; // 2L / a
  initialVelocityMs: number;
  joukowskySurgeM: number; // a * deltaV / g
  steadyPressureM: number;
  maxTransientHeadM: number;
  maxTransientPressureBar: number;
  minTransientHeadM: number;
  minTransientPressureBar: number;
  pressureRatingPnBar: number;
  overpressureRisk: 'Safe' | 'Warning: Approaching Rating' | 'Severe: Rupture Risk';
  cavitationRisk: 'None' | 'Sub-atmospheric' | 'Severe Vapor Cavitation / Column Separation';
  recommendedProtection: string;
}

export interface TransientProtectionDevice {
  type: 'AIR_VESSEL' | 'SURGE_TANK' | 'AIR_RELEASE_VALVE' | 'SURGE_ANTICIPATOR' | 'FLYWHEEL';
  locationNodeId: string;
  recommendedSize: string;
  effectiveVolumeM3?: number;
  mitigatedMaxHeadM: number;
  mitigatedMinHeadM: number;
}

export interface TransientTimeHistoryPoint {
  timeSec: number;
  maxSystemHeadM: number;
  minSystemHeadM: number;
  nodeHeads: Record<string, number>;
}

export interface TransientSimulationSummary {
  scenario: 'PUMP_TRIP' | 'VALVE_CLOSURE';
  closureOrTripTimeSec: number;
  maxSystemSurgeHeadM: number;
  criticalHighPressureNodeId: string;
  minSystemSurgeHeadM: number;
  criticalCavitationNodeId: string;
  vaporCavitationOccurred: boolean;
  pipesAtRuptureRisk: string[];
  pipesAtCavitationRisk: string[];
  airVesselRecommendedVolumeM3: number;
  pipeResults: TransientPipeResult[];
  timeHistory: TransientTimeHistoryPoint[];
  protectionDevices: TransientProtectionDevice[];
}

export interface SimulationSummary {
  converged: boolean;
  iterations: number;
  relativeFlowError: number;
  totalDemandLs: number;
  totalSupplyLs: number;
  flowImbalanceLs: number;
  minPressureM: number;
  minPressureNodeId: string;
  maxPressureM: number;
  maxPressureNodeId: string;
  maxVelocityMs: number;
  maxVelocityPipeId: string;
  totalPumpPowerKw: number;
  dailyEnergyKwh: number;
  negativePressureNodes: string[];
  lowPressureNodes: string[]; // < 15 m
  highVelocityPipes: string[]; // > 2.0 m/s
  runTimestamp: string;

  // EPANET & Water Modeling Extended Capabilities
  hourlyEpsPoints?: HourlySimulationPoint[];
  fireFlowResults?: FireFlowResult[];
  waterQualityResults?: WaterQualityResult[];
  pipeOptimizations?: PipeOptimizationResult[];
  autoDesignRecommendations?: PipeOptimizationResult[];
  // Transient & Water Hammer Analysis Module
  transientSurgeSummary?: TransientSimulationSummary;
}

export type ActiveTool =
  | 'select'
  | 'pan'
  | 'add-junction'
  | 'add-pipe'
  | 'add-reservoir'
  | 'add-tank'
  | 'add-pump'
  | 'add-valve'
  | 'delete'
  | 'profile-select';

export type MapThematicDisplay =
  | 'none'
  | 'pressure'
  | 'velocity'
  | 'elevation'
  | 'diameter'
  | 'flow'
  | 'water-age'
  | 'fire-flow'
  | 'transient-surge';
