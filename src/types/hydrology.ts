export interface ChainageRecord {
  id: string;
  chainage: number;
  formatted: string;
  lat: number; // Point ON THE LINE (culvert / crossing)
  lng: number; // Point ON THE LINE (culvert / crossing)
  dmsLat: string;
  dmsLng: string;
  /** Decimal degrees, carried explicitly so the register never re-derives them. */
  decLat?: number;
  decLng?: number;
  /** Position of the text annotation written beside the line. */
  labelLat?: number;
  labelLng?: number;
  /** Reduced level in m MSL, from the uploaded survey sheet or the sampled DEM. */
  elevation?: number;
  /** How the elevation above was obtained, so it is never mistaken for survey. */
  elevationSource?: 'survey' | 'dem' | 'none';
  distanceFromStartM: number;
  bearing?: number;
  is100mStation?: boolean;
  isMajorKm?: boolean;
  isPlacemark?: boolean;
  name?: string;
  /** True when the row came from a chainage-only sheet and had to be resolved along the corridor. */
  chainageOnly?: boolean;
}

export interface CorridorAlignment {
  name: string;
  filename?: string;
  coordinates: [number, number][]; // Primary centerline [lat, lng]
  allTracks?: [number, number][][]; // All railway tracks/segments found in KML
  totalLengthM: number;
  startChainage: number;
  endChainage: number;
  chainages: ChainageRecord[];
}

export type AnalysisScopeM = 500 | 1000 | 2000;

export interface HydrologyReport {
  targetChainage: number;
  targetChainageFormatted: string;
  latitudeDMS: string;
  longitudeDMS: string;
  latitudeDD: number;
  longitudeDD: number;

  catchmentAreaKm2: number;
  lengthOfStreamKm: number;
  levelStreamOriginM: number;
  highestContourM: number;

  /** highestContourM - levelStreamOriginM. Measured, never forced to a minimum. */
  elevationDropM: number;
  scopeAppliedM: AnalysisScopeM;
  scopeExpandedDueToFlatRelief: boolean;
  /** max - min elevation measured across the scope that was actually used. */
  reliefWithinScopeM: number;
  /** True when the in-catchment relief reached the 5 m design threshold. */
  meetsReliefThreshold: boolean;

  streamCoordinates: [number, number][]; // [lat, lng], divide -> pour point
  catchmentPolygon: [number, number][]; // [lat, lng] ring
  contours?: { elevation: number; coordinates: [number, number][] }[];
  tributaryPaths?: [number, number][][]; // Overland flow paths from the DEM

  /** Named providers that actually answered, e.g. "Copernicus GLO-30 (via Open-Meteo)". */
  elevationSource: string;
  /** Whether the Level Stream Origin came from a survey sheet or the DEM. */
  elevationOriginKind: 'survey' | 'dem';
  /** Fraction of the analysed grid that held a real DEM sample, 0..1. */
  demCoverage: number;
  /** Natural-ground DEM cells contributing to the delineated catchment. */
  contributingCells: number;
  /** True when upslope ground was found that actually drains to this chainage. */
  flowArrivesAtCrossing: boolean;
  /** Bearing from the chainage towards where the flow arrives from, degrees. */
  flowArrivalBearingDeg: number | null;
  /** Ground level at the head of the contributing channel. */
  streamHeadElevationM: number | null;
  /** Distance from the crossing to the head of the watercourse, metres. */
  headDistanceM: number;
  /** Coordinates of the highest point the culvert collects from. */
  headCoordinates: [number, number];
  analysisCellSizeM: number;

  elevationProfile?: { distanceM: number; elevationM: number; lat: number; lng: number }[];
  /** Hydraulic gradient of the watercourse, percent. Null when not computable. */
  streamSlopePercent?: number | null;
  /** Kirpich time of concentration, hours (IRC:SP:13). */
  timeOfConcentrationHours?: number | null;
  flowDirectionDeg?: number;
  crossVerifyGoogleEarthUrl?: string;
  processedTimestamp: string;
  notes?: string;
}

/**
 * Returned instead of a report when the terrain cannot be analysed honestly.
 * The UI must surface this rather than falling back to invented numbers.
 */
export interface HydrologyRunFailure {
  targetChainage: number;
  targetChainageFormatted: string;
  latitudeDD: number;
  longitudeDD: number;
  scopeAppliedM: AnalysisScopeM;
  scopeExpandedDueToFlatRelief: boolean;
  demCoverage: number;
  message: string;
}

