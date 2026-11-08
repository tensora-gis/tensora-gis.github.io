/**
 * Hydraulic Geometry & Cross-Section Templates
 *
 * Implements:
 * 1. Leopold & Maddock (1953) empirical hydraulic geometry:
 *    Width W = a * Q^0.5, Depth D = c * Q^0.4
 * 2. Cross-section template generation (trapezoidal, rectangular, compound, freeform)
 * 3. Transverse profile sampling at arbitrary lateral offsets
 */

import {
  CrossSectionTemplate,
  CrossSectionStation,
  CrossSectionPoint,
} from '../types/riverReach';

/**
 * Estimate bankfull width W (m) from discharge Q (m^3/s)
 * Using global average hydraulic geometry exponents
 */
export function estimateBankfullWidthM(dischargeM3s: number): number {
  const q = Math.max(0.1, dischargeM3s);
  // W = 4.0 * Q^0.50
  return Math.max(5.0, 4.0 * Math.pow(q, 0.5));
}

/**
 * Estimate bankfull depth D (m) from discharge Q (m^3/s)
 */
export function estimateBankfullDepthM(dischargeM3s: number): number {
  const q = Math.max(0.1, dischargeM3s);
  // D = 0.40 * Q^0.38
  return Math.max(0.5, 0.4 * Math.pow(q, 0.38));
}

/**
 * Generate discrete transverse cross-section points from a template
 */
export function generateCrossSectionPoints(
  template: CrossSectionTemplate,
  invertElevM: number
): CrossSectionPoint[] {
  const { type, bottomWidthM, bankSlopeHtoV, depthM } = template;
  const points: CrossSectionPoint[] = [];

  const leftFp = template.leftFloodplainWidthM || 0;
  const rightFp = template.rightFloodplainWidthM || 0;
  const bankTopElev = invertElevM + depthM;
  const fpElev = bankTopElev + 0.5;

  if (type === 'rectangular') {
    const halfW = bottomWidthM / 2;
    if (leftFp > 0) points.push({ xM: -halfW - leftFp, zM: fpElev });
    points.push({ xM: -halfW, zM: bankTopElev });
    points.push({ xM: -halfW, zM: invertElevM });
    points.push({ xM: halfW, zM: invertElevM });
    points.push({ xM: halfW, zM: bankTopElev });
    if (rightFp > 0) points.push({ xM: halfW + rightFp, zM: fpElev });
  } else if (type === 'compound') {
    const halfB = bottomWidthM / 2;
    const topOffset = halfB + bankSlopeHtoV * depthM;

    if (leftFp > 0) {
      points.push({ xM: -topOffset - leftFp, zM: fpElev });
    }
    // Left bank crest
    points.push({ xM: -topOffset, zM: bankTopElev });
    // Left shallow bank bench (littoral shelf for realistic near-bank boundary layer flow)
    points.push({ xM: -halfB - 0.45 * (topOffset - halfB), zM: invertElevM + 0.60 * depthM });
    // Left bank toe
    points.push({ xM: -halfB, zM: invertElevM + 0.25 * depthM });
    // Left channel thalweg transition
    points.push({ xM: -halfB * 0.45, zM: invertElevM + 0.06 * depthM });
    // Main channel Thalweg (deepest channel flow line)
    points.push({ xM: 0.0, zM: invertElevM });
    // Right channel thalweg transition
    points.push({ xM: halfB * 0.45, zM: invertElevM + 0.06 * depthM });
    // Right bank toe
    points.push({ xM: halfB, zM: invertElevM + 0.25 * depthM });
    // Right shallow bank bench (littoral shelf)
    points.push({ xM: halfB + 0.45 * (topOffset - halfB), zM: invertElevM + 0.60 * depthM });
    // Right bank crest
    points.push({ xM: topOffset, zM: bankTopElev });
    if (rightFp > 0) {
      points.push({ xM: topOffset + rightFp, zM: fpElev });
    }
  } else if (type === 'trapezoidal') {
    const halfB = bottomWidthM / 2;
    const topOffset = halfB + bankSlopeHtoV * depthM;

    if (leftFp > 0) {
      points.push({ xM: -topOffset - leftFp, zM: fpElev });
    }
    points.push({ xM: -topOffset, zM: bankTopElev });
    points.push({ xM: -halfB, zM: invertElevM });
    points.push({ xM: halfB, zM: invertElevM });
    points.push({ xM: topOffset, zM: bankTopElev });
    if (rightFp > 0) {
      points.push({ xM: topOffset + rightFp, zM: fpElev });
    }
  } else if (type === 'freeform' && template.freeformPoints && template.freeformPoints.length > 0) {
    return template.freeformPoints;
  } else {
    // Default fallback: trapezoidal
    const halfB = bottomWidthM / 2;
    const topOffset = halfB + bankSlopeHtoV * depthM;
    points.push({ xM: -topOffset, zM: bankTopElev });
    points.push({ xM: -halfB, zM: invertElevM });
    points.push({ xM: halfB, zM: invertElevM });
    points.push({ xM: topOffset, zM: bankTopElev });
  }

  return points;
}

/**
 * Sample bed elevation at a specific lateral distance xM across the cross-section
 */
export function sampleCrossSectionElevation(
  points: CrossSectionPoint[],
  xM: number,
  defaultInvertM: number
): number {
  if (points.length === 0) return defaultInvertM;
  if (points.length === 1) return points[0].zM;

  // If outside left
  if (xM <= points[0].xM) return points[0].zM;
  // If outside right
  if (xM >= points[points.length - 1].xM) return points[points.length - 1].zM;

  // Linear interpolation between points
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (xM >= p1.xM && xM <= p2.xM) {
      const denom = p2.xM - p1.xM;
      if (Math.abs(denom) < 1.0e-6) return p1.zM;
      const t = (xM - p1.xM) / denom;
      return p1.zM + t * (p2.zM - p1.zM);
    }
  }

  return defaultInvertM;
}

/**
 * Build a default empirical CrossSectionStation with realistic natural bathymetry
 */
export function createDefaultEmpiricalStation(
  stationM: number,
  invertElevM: number,
  dischargeM3s: number = 25.0,
  manningN: number = 0.035,
  channelWidthM?: number,
  channelDepthM?: number
): CrossSectionStation {
  const width = channelWidthM && channelWidthM > 0 ? channelWidthM : estimateBankfullWidthM(dischargeM3s);
  const depth = channelDepthM && channelDepthM > 0 ? channelDepthM : estimateBankfullDepthM(dischargeM3s);
  const bottomW = Math.max(3.0, width * 0.65);

  const template: CrossSectionTemplate = {
    type: 'compound',
    bottomWidthM: bottomW,
    bankSlopeHtoV: 1.5,
    depthM: depth,
    leftFloodplainWidthM: width * 0.4,
    rightFloodplainWidthM: width * 0.4,
  };

  const points = generateCrossSectionPoints(template, invertElevM);

  return {
    stationM,
    template,
    points,
    invertElevM,
    leftBankElevM: invertElevM + depth,
    rightBankElevM: invertElevM + depth,
    manningN,
  };
}
