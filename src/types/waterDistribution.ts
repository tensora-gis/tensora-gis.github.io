/**
 * WaterGEMS / EPANET Water Distribution Modeling Types
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
  
  // Simulation results
  flow?: number; // L/s (positive from startNode to endNode, negative opposite)
  velocity?: number; // m/s
  unitHeadloss?: number; // m / km
  totalHeadloss?: number; // m
  frictionFactor?: number;
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

export type ValveType = 'PRV' | 'PSV' | 'PBV' | 'FCV' | 'TCV';

export interface WaterValve extends BaseElement {
  type: 'valve';
  startNodeId: string;
  endNodeId: string;
  valveType: ValveType;
  /** Setting: PRV/PSV/PBV = target pressure (m); FCV = target flow (L/s); TCV = loss coeff */
  setting: number;
  diameter: number; // mm
  status: 'ACTIVE' | 'OPEN' | 'CLOSED';
  
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
  negativePressureNodes: string[];
  lowPressureNodes: string[]; // < 15 m
  highVelocityPipes: string[]; // > 2.0 m/s
  runTimestamp: string;
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

export type MapThematicDisplay = 'none' | 'pressure' | 'velocity' | 'elevation' | 'diameter' | 'flow';
