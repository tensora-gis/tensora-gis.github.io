/**
 * Unified River Data & Reach Management Service
 */

import {
  RiverReachDefinition,
  RiverGridMesh,
  SwotRiverObservation,
} from '../types/riverReach';
import { GLOBAL_BUNDLED_REACHES, createBenchmark500mReach } from './hydroRiversLoader';
import { fetchSwotObservationForReach } from './swotRiverVolumeLoader';
import { getDischargeEstimatesForReach, DischargeEstimateRecord } from './dischargeLoader';
import { generateRiverGridMesh } from '../geometry/meshGenerator';
import {
  saveReachToCache,
  loadReachFromCache,
  listAllCachedReaches,
  deleteReachFromCache,
} from './indexedDbCache';

export class RiverDataService {
  public static getBundledReaches(): RiverReachDefinition[] {
    return GLOBAL_BUNDLED_REACHES;
  }

  public static async getReachById(id: string): Promise<RiverReachDefinition | null> {
    // Check bundled reaches first
    const bundled = GLOBAL_BUNDLED_REACHES.find((r) => r.id === id);
    if (bundled) return bundled;

    // Check IndexedDB
    const cached = await loadReachFromCache(id);
    if (cached) return cached;

    // Default benchmark fallback
    if (id === 'reach-benchmark-500m') {
      return createBenchmark500mReach();
    }

    return null;
  }

  public static async saveReach(reach: RiverReachDefinition): Promise<void> {
    await saveReachToCache(reach.id, reach.name, reach);
  }

  public static async deleteReach(id: string): Promise<void> {
    await deleteReachFromCache(id);
  }

  public static async listAllReaches(): Promise<{ id: string; name: string; source: string }[]> {
    const list: { id: string; name: string; source: string }[] = GLOBAL_BUNDLED_REACHES.map(
      (r) => ({
        id: r.id,
        name: r.name,
        source: 'bundled',
      })
    );

    const cached = await listAllCachedReaches();
    for (const c of cached) {
      if (!list.some((item) => item.id === c.id)) {
        list.push({
          id: c.id,
          name: c.name,
          source: 'user-cached',
        });
      }
    }

    return list;
  }

  public static getSwotData(reachId: string): SwotRiverObservation | null {
    return fetchSwotObservationForReach(reachId);
  }

  public static getDischarge(reachId: string): DischargeEstimateRecord {
    return getDischargeEstimatesForReach(reachId);
  }

  public static buildMesh(
    reach: RiverReachDefinition,
    streamwiseSpacingM: number = 20.0,
    transverseCells: number = 8
  ): RiverGridMesh {
    return generateRiverGridMesh(reach, {
      targetStreamwiseSpacingM: streamwiseSpacingM,
      transverseCellsCount: transverseCells,
    });
  }
}
