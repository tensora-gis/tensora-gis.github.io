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
  | 'embankment'
  | 'spurdike'
  | 'bridge-pier'
  | 'custom-deflector'
  | 'line'
  | 'polyline'
  | 'polygon'
  | 'rectangle'
  | 'circle'
  | 'obstacle';

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

export interface RiverSpurdikeStructure extends RiverStructureBase {
  type: 'spurdike';
  crestElevationM: number;
  lengthM: number; // Length projecting into river from bank
  crestWidthM: number;
  permeability: number; // 0.0 (impermeable rock) to 0.5 (permeable pile)
  deflectionAngleDeg: number; // 90 perpendicular, <90 repelling, >90 attracting
  bank: 'left' | 'right';
  headSlopeHtoV: number;
  headScourDepthM?: number; // Melville & Coleman contraction scour
}

export interface RiverBridgePierStructure extends RiverStructureBase {
  type: 'bridge-pier';
  shape: 'circular' | 'square' | 'round-nose' | 'sharp-nose';
  widthM: number;
  lengthM: number;
  topElevationM: number;
  dragCoefficientCd: number; // 1.2 circular, 2.0 square, 0.9 round-nose, 0.7 sharp-nose
  noseAngleDeg?: number;
  scourDepthM?: number; // HEC-18 pier scour estimate
}

export interface RiverCustomDeflectorStructure extends RiverStructureBase {
  type: 'custom-deflector';
  heightM: number;
  wallThicknessM: number;
  deflectionEfficiency: number; // 0.0 to 1.0
  dragCoeff: number;
}

export interface RiverPolygonStructure extends RiverStructureBase {
  type: 'polygon' | 'rectangle' | 'obstacle';
  crestElevationM: number;
  topWidthM?: number;
  wallThicknessM?: number;
  isClosedSolid: boolean;
  solidMasking?: boolean; // masks internal cells in CFD finite volume equations
  rotationDeg?: number;
  sideSlopeHtoV?: number;
  dragCoefficientCd?: number;
  permeability?: number;
}

export interface RiverCircleStructure extends RiverStructureBase {
  type: 'circle';
  center: RiverCoordinate;
  radiusM: number;
  topElevationM: number;
  crestElevationM?: number;
  permeability?: number;
  dragCoefficientCd: number;
  solidMasking?: boolean;
}

export interface RiverLineStructure extends RiverStructureBase {
  type: 'line' | 'polyline';
  crestElevationM: number;
  wallThicknessM: number;
  permeability: number;
  dragCoefficientCd: number;
  deflectionAngleDeg?: number;
  solidMasking?: boolean;
}

export type RiverHydraulicStructure =
  | RiverLeveeStructure
  | RiverWeirStructure
  | RiverBridgeStructure
  | RiverCulvertStructure
  | RiverGateStructure
  | RiverEmbankmentStructure
  | RiverSpurdikeStructure
  | RiverBridgePierStructure
  | RiverCustomDeflectorStructure
  | RiverPolygonStructure
  | RiverCircleStructure
  | RiverLineStructure;
