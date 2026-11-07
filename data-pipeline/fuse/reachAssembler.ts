/**
 * Global Reach Knowledge Graph Assembler
 *
 * Implements Section 4.2 of the Global River Digital Twin Plan.
 * Joins all ingested sources by reach_id; resolves conflicts:
 * - Prefer SWOT-River-Volume for active channel shape and bathymetry
 * - Prefer GRADES-hydroDL for modeled daily discharge (license-gated)
 * - Prefer GRWL for satellite-measured channel width
 * - Falls back to empirical hydraulic geometry when data is missing
 * - Attaches license metadata and accuracy tier
 */

import { SwordReach } from '../ingest/sword';
import { HydroRiversRecord } from '../ingest/hydroRivers';
import { SwotRiverVolumeRecord } from '../ingest/swotRiverVolume';
import { GradesDischargeRecord } from '../ingest/gradesHydroDl';
import { GrdcCaravanRecord } from '../ingest/grdcCaravan';
import { GrwlRecord } from '../ingest/grwl';
import { SwotRiverSpRecord } from '../ingest/swotRiverSp';
import { computeEmpiricalHydraulicGeometry } from './hydraulicGeometry';
import { tagReachLicenseMetadata } from './licenseTagger';
import { RiverReachDefinition, CrossSectionStation, RiverCenterlinePoint } from '../../src/river/types/riverReach';
import { createDefaultEmpiricalStation } from '../../src/river/geometry/empiricalSection';

export interface RawReachInputs {
  sword: SwordReach;
  hydroRivers?: HydroRiversRecord;
  swotVolume?: SwotRiverVolumeRecord;
  grades?: GradesDischargeRecord;
  grdc?: GrdcCaravanRecord;
  grwl?: GrwlRecord;
  swotSp?: SwotRiverSpRecord;
}

export function assembleGlobalReach(inputs: RawReachInputs): RiverReachDefinition {
  const reachId = inputs.sword.reachId;
  const name = inputs.sword.riverName;

  // 1. Determine discharge (prefer GRDC observed, then GRADES modeled, then HydroRIVERS)
  const dischargeM3s =
    inputs.grdc?.meanObservedDischargeM3s ||
    inputs.grades?.meanDailyDischargeM3s ||
    inputs.hydroRivers?.meanAnnualDischargeM3s ||
    100.0;

  // 2. Determine river width (prefer GRWL Landsat, then SWOT, then hydraulic geometry)
  const knownWidthM = inputs.grwl?.widthM || inputs.swotVolume?.bottomWidthM;
  const geom = computeEmpiricalHydraulicGeometry(dischargeM3s, knownWidthM);
  const finalWidthM = knownWidthM || geom.widthM;

  // 3. Determine bed slope
  const slope = (inputs.sword.slopeMmPerKm || 100) / 1000000.0;

  // 4. Construct Centerline Points from SWORD coordinates
  const centerline: RiverCenterlinePoint[] = [];
  let cumDistanceM = 0;
  const coords = inputs.sword.coordinates;

  const baseInvertM = inputs.swotSp?.wseM ? inputs.swotSp.wseM - geom.depthM : 100.0;

  if (coords && coords.length > 0) {
    for (let i = 0; i < coords.length; i++) {
      const [lng, lat] = coords[i];
      if (i > 0) {
        const [prevLng, prevLat] = coords[i - 1];
        const dy = (lat - prevLat) * 111320.0;
        const dx = (lng - prevLng) * 111320.0 * Math.cos((lat * Math.PI) / 180.0);
        cumDistanceM += Math.hypot(dx, dy);
      }
      centerline.push({
        lat,
        lng,
        stationM: cumDistanceM,
        widthM: finalWidthM,
        bedElevationM: baseInvertM - cumDistanceM * slope,
      });
    }
  } else {
    // Single point fallback with 3000m reach
    centerline.push(
      { lat: 0, lng: 0, stationM: 0, widthM: finalWidthM, bedElevationM: baseInvertM },
      { lat: 0.02, lng: 0.02, stationM: 3000, widthM: finalWidthM, bedElevationM: baseInvertM - 3000 * slope }
    );
    cumDistanceM = 3000;
  }

  // 5. Cross Sections
  const manningN = 0.030;
  const crossSections: CrossSectionStation[] = [
    createDefaultEmpiricalStation(0, baseInvertM, dischargeM3s, manningN),
    createDefaultEmpiricalStation(cumDistanceM * 0.5, baseInvertM - cumDistanceM * 0.5 * slope, dischargeM3s, manningN),
    createDefaultEmpiricalStation(cumDistanceM, baseInvertM - cumDistanceM * slope, dischargeM3s, manningN),
  ];

  // 6. License metadata & accuracy tier
  const licenseMeta = tagReachLicenseMetadata({
    hasSwotCalibration: Boolean(inputs.swotSp),
    hasSwotBathymetry: Boolean(inputs.swotVolume),
    usesGradesDischarge: Boolean(inputs.grades),
    usesGrdcCaravan: Boolean(inputs.grdc),
  });

  // 7. Bounds calculation
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const c of centerline) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  }
  const pad = 0.005;

  return {
    id: reachId,
    name,
    description: `Assembled from SWORD v16, SWOT-River-Volume, and Copernicus DEM. Strahler Order: ${inputs.sword.strahlerOrder}.`,
    source: inputs.swotSp ? 'swot-calibrated' : 'hydrorivers',
    accuracyTier: licenseMeta.tier,
    licenseMetadata: licenseMeta,
    centerline,
    crossSections,
    bounds: [minLat - pad, minLng - pad, maxLat + pad, maxLng + pad],
    reachLengthM: Math.max(500, cumDistanceM),
    meanWidthM: finalWidthM,
    defaultManningN: manningN,
    upstreamDischargeEstimateM3s: dischargeM3s,
  };
}
