/**
 * License & Accuracy Tier Tagger
 *
 * Implements Section 4.2 of the Global River Digital Twin Plan.
 * Attaches immutable provenance, licensing constraints, and confidence badges
 * to every reach and field in the Knowledge Graph.
 */

import { AccuracyTier, LicenseMetadata } from '../../src/river/types/riverReach';

export interface FieldLicenseProvenance {
  field: string;
  source: string;
  license: string;
  tier: AccuracyTier;
  nonCommercial?: boolean;
}

export function tagReachLicenseMetadata(params: {
  hasSwotCalibration?: boolean;
  hasSwotBathymetry?: boolean;
  hasSurveyedCrossSections?: boolean;
  usesGradesDischarge?: boolean;
  usesGrdcCaravan?: boolean;
}): LicenseMetadata {
  let tier: AccuracyTier = 'Estimated (Global)';

  if (params.hasSurveyedCrossSections) {
    tier = 'Surveyed (Validated)';
  } else if (params.hasSwotCalibration) {
    tier = 'Calibrated (SWOT)';
  } else if (params.hasSwotBathymetry) {
    tier = 'Estimated (SWOT)';
  }

  const isNonCommercial = Boolean(params.usesGradesDischarge);

  return {
    source: isNonCommercial
      ? 'SWORD / SWOT-River-Volume / GRADES-hydroDL / Copernicus GLO-30'
      : 'SWORD / SWOT-River-Volume / GRDC-Caravan / Copernicus GLO-30',
    license: isNonCommercial
      ? 'CC BY-NC 4.0 (Non-commercial modeled discharge) / CC BY 4.0'
      : 'CC-BY-4.0 (Open redistributable)',
    tier,
    nonCommercial: isNonCommercial,
    citation: 'HydroRIVERS / SWORD v16 (NASA/CNES), SWOT-River-Volume (Zenodo), GRADES-hydroDL (CC BY-NC 4.0)',
  };
}
