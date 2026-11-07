/**
 * Reach Model Serializer & JSON Project Archive Manager
 */

import {
  RiverReachDefinition,
  RiverGridMesh,
  RiverBoundaryConditions,
  RiverMonitoringGauge,
  SwotRiverObservation,
} from './types/riverReach';
import { RiverHydraulicStructure } from './structures/structureTypes';
import { TurbulenceParameters } from './types/turbulence';
import { SedimentParameters } from './types/sediment';

export interface TensoraRiverProjectArchive {
  formatVersion: '2.0';
  timestamp: string;
  reach: RiverReachDefinition;
  mesh?: RiverGridMesh;
  boundaries: RiverBoundaryConditions;
  structures: RiverHydraulicStructure[];
  gauges: RiverMonitoringGauge[];
  swotObservation?: SwotRiverObservation;
  turbParams: TurbulenceParameters;
  sedParams: SedimentParameters;
}

export function serializeRiverProject(archive: Omit<TensoraRiverProjectArchive, 'formatVersion' | 'timestamp'>): string {
  const fullArchive: TensoraRiverProjectArchive = {
    formatVersion: '2.0',
    timestamp: new Date().toISOString(),
    ...archive,
  };
  return JSON.stringify(fullArchive, null, 2);
}

export function deserializeRiverProject(jsonString: string): TensoraRiverProjectArchive {
  const parsed = JSON.parse(jsonString);
  if (!parsed.reach || !parsed.boundaries) {
    throw new Error('Invalid Tensora River Project Archive: missing reach or boundary configuration');
  }
  return parsed as TensoraRiverProjectArchive;
}
