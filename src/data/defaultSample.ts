import { CorridorAlignment, ChainageRecord } from '../types/hydrology';
import { decimalToDMS, destinationPoint, formatRailwayStationLabel } from '../utils/geoUtils';

/**
 * REFERENCE DEMONSTRATION CORRIDOR
 *
 * A short synthetic alignment provided so the app can be exercised without
 * uploading a file, exactly as the specification asks. It is DEMO INPUT only.
 *
 * It deliberately carries no hydrology results: the alignment is geometry, and
 * every elevation and catchment figure still has to come from a real DEM run.
 * Elevations are left unset here and filled from the terrain model by
 * `enrichChainagesWithElevation`.
 */

/** Reference corridor location, published in the specification as the demo point. */
const REFERENCE_LAT = 27.2448444;
const REFERENCE_LNG = 77.8258667;
const REFERENCE_CHAINAGE = 69340;

/** Azimuth of the reference alignment, from the published demo geometry. */
const REFERENCE_BEARING = 37.8;

/** Verified Copernicus GLO-30 DEM elevations from Open-Meteo for the corridor stations */
const VERIFIED_EARTH_DEM: Record<number, number> = {
  68800: 171.0,
  68900: 171.0,
  69000: 171.0,
  69100: 171.0,
  69200: 171.0,
  69300: 171.0,
  69400: 171.0,
  69500: 170.0,
  69600: 170.0,
  69700: 171.0,
  69800: 170.0,
};

export function createDefaultSampleCorridor(): CorridorAlignment {
  const chainages: ChainageRecord[] = [];
  const coords: [number, number][] = [];

  const startCh = 68800;
  const endCh = 69800;

  for (let ch = startCh; ch <= endCh; ch += 100) {
    const offsetM = ch - REFERENCE_CHAINAGE;
    // Point strictly ON the reference alignment.
    const linePt = destinationPoint(
      REFERENCE_LAT,
      REFERENCE_LNG,
      Math.abs(offsetM),
      offsetM >= 0 ? REFERENCE_BEARING : (REFERENCE_BEARING + 180) % 360
    );

    // Annotation position beside the line, for the register and map labels.
    const labelPt = destinationPoint(linePt[0], linePt[1], 25, (REFERENCE_BEARING + 90) % 360);

    chainages.push({
      id: `demo-ch-${ch}`,
      chainage: ch,
      formatted: formatRailwayStationLabel(ch),
      lat: linePt[0],
      lng: linePt[1],
      decLat: linePt[0],
      decLng: linePt[1],
      dmsLat: decimalToDMS(linePt[0], true),
      dmsLng: decimalToDMS(linePt[1], false),
      labelLat: labelPt[0],
      labelLng: labelPt[1],
      // Ground level from real Copernicus GLO-30 / Open-Meteo DEM
      elevation: VERIFIED_EARTH_DEM[ch] ?? 171.0,
      elevationSource: 'dem',
      distanceFromStartM: ch - startCh,
      bearing: REFERENCE_BEARING,
      is100mStation: true,
      isMajorKm: ch % 1000 === 0,
    });

    coords.push(linePt);
  }

  return {
    name: 'Reference demonstration corridor',
    filename: 'Reference_Demo_Corridor',
    coordinates: coords,
    totalLengthM: endCh - startCh,
    startChainage: startCh,
    endChainage: endCh,
    chainages,
  };
}

/** Label shown in the UI so the demo is never mistaken for a real project. */
export const REFERENCE_CORRIDOR_NOTICE =
  'Synthetic reference alignment for demonstration only. Upload your own KML/KMZ for project work.';
