/**
 * River Terrain & Copernicus DEM Integration Service
 *
 * Samples real global Copernicus GLO-30 / SRTM 30m Digital Elevation Models
 * for 2D river mesh cells, blends terrain with channel bathymetry, and computes
 * longitudinal river valley gradients.
 */

import { RiverMesh } from '../types/riverAnalysis';
import { fetchBulkElevations } from './elevationService';

export interface SampleRiverMeshResult {
  updatedMesh: RiverMesh;
  sampledCount: number;
  provider: string;
}

/**
 * Samples real ground terrain elevations from Copernicus GLO-30 / SRTM for all cells in a RiverMesh.
 */
export async function sampleRiverMeshElevations(
  mesh: RiverMesh,
  carveChannelBed = true,
  maxChannelDepthM = 2.5
): Promise<SampleRiverMeshResult> {
  const queryPoints = mesh.cells.map((c) => ({
    lat: c.centerLat,
    lng: c.centerLng,
  }));

  const result = await fetchBulkElevations(queryPoints);
  const provider =
    result.providers.length > 0
      ? `Copernicus GLO-30 / SRTM (${result.providers.join(', ')})`
      : 'Copernicus GLO-30 / SRTM';

  let sampledCount = 0;

  const updatedCells = mesh.cells.map((cell, idx) => {
    const rawElev = result.elevations[idx];

    if (rawElev !== null && isFinite(rawElev)) {
      sampledCount++;
      let finalElev = Math.round(rawElev * 10) / 10;

      // If carveChannelBed is true, carve the channel below the raw DEM surface
      // (because raw satellite radar/optical DEMs reflect the water surface level)
      if (carveChannelBed) {
        const lateralFrac = ((cell.j + 0.5) / mesh.ny) * 2 - 1; // -1 to +1
        const depthBelowSurface = maxChannelDepthM * Math.max(0, 1.0 - Math.pow(lateralFrac, 2));
        finalElev = Math.round((finalElev - depthBelowSurface) * 10) / 10;
      }

      return {
        ...cell,
        bedElevation: finalElev,
      };
    }

    return cell;
  });

  return {
    updatedMesh: {
      ...mesh,
      cells: updatedCells,
    },
    sampledCount,
    provider,
  };
}
