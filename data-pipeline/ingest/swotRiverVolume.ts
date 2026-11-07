/**
 * SWOT-River-Volume Bathymetry Ingestion Module
 *
 * Ingests estimated active channel shapes for 126,674 reaches globally.
 * Source: NASA / CNES / Zenodo Open Data
 */

export interface SwotRiverVolumeRecord {
  reachId: string;
  crossSectionShape: 'trapezoidal' | 'parabolic' | 'compound';
  bottomWidthM: number;
  bankSlopeHtoV: number;
  activeChannelDepthM: number;
  uncalibratedVolumeM3: number;
}

export function parseSwotRiverVolume(raw: any): SwotRiverVolumeRecord {
  return {
    reachId: String(raw.reach_id),
    crossSectionShape: raw.shape || 'trapezoidal',
    bottomWidthM: Number(raw.w_bottom || 50),
    bankSlopeHtoV: Number(raw.side_slope || 2.0),
    activeChannelDepthM: Number(raw.depth || 3.5),
    uncalibratedVolumeM3: Number(raw.volume || 150000),
  };
}
