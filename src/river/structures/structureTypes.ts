/**
 * Hydraulic Structures Parameter Schemas
 *
 * Implements 6 distinct civil engineering hydraulic structure models:
 * 1. Levees & Floodwalls
 * 2. Weirs (Broad-crested & Sharp-crested)
 * 3. Bridges & Piers (Yarnell loss, pressure flow, overtopping)
 * 4. Culverts (FHWA HDS-5 Inlet/Outlet control)
 * 5. Sluice & Radial Gates (Free & submerged orifice)
 * 6. Transportation Road Embankments
 */

import { RiverCoordinate } from '../types/riverReach';

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
  stationM?: number;
  cadProperties?: {
    layerName?: string;
    color?: string;
    hatchStyle?: 'solid' | 'dashed' | 'diagonal';
  };
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
  dischargeCoefficient: number; // e.g. 1.70 broad, 1.84 sharp
}

export interface RiverBridgeStructure extends RiverStructureBase {
  type: 'bridge';
  deckElevationM: number;
  lowChordElevationM: number;
  pierCount: number;
  pierWidthM: number;
  pierDragCoeff: number; // Yarnell K (e.g. 1.25)
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
  inletLossCoeff: number; // Ke (e.g. 0.5)
}

export interface RiverGateStructure extends RiverStructureBase {
  type: 'gate';
  gateType: 'sluice' | 'radial';
  gateWidthM: number;
  openingM: number;
  crestElevationM: number;
  dischargeCoefficient: number; // e.g. 0.60
}

export interface RiverEmbankmentStructure extends RiverStructureBase {
  type: 'embankment';
  crestElevationM: number;
  topWidthM: number;
  sideSlopeHtoV: number;
  overtopDischargeCoeff: number; // e.g. 1.45
}

export type RiverHydraulicStructure =
  | RiverLeveeStructure
  | RiverWeirStructure
  | RiverBridgeStructure
  | RiverCulvertStructure
  | RiverGateStructure
  | RiverEmbankmentStructure;
