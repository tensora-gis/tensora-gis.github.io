/**
 * Authentic Ansys Fluent / OpenFOAM CFD Rainbow Palette & Isocontour Math
 *
 * Provides pure, zero-dependency color mapping and isocontour interpolation
 * matching classic CFD post-processing software (Ansys Fluent, ParaView, CFD-Post).
 */

/**
 * Returns [r, g, b] in range [0, 255] for normalized scalar t in [0, 1]
 * Sequence: Deep Navy Blue -> Royal Blue -> Cyan -> Emerald Green -> Yellow -> Orange -> Crimson Red
 */
export function getFluentCfdRgb(t: number): [number, number, number] {
  const s = Math.max(0.0, Math.min(1.0, t));
  let r: number, g: number, b: number;

  if (s < 0.15) {
    const f = s / 0.15;
    r = 0;
    g = Math.round(20 + f * 45);
    b = Math.round(135 + f * 120);
  } else if (s < 0.35) {
    const f = (s - 0.15) / 0.20;
    r = 0;
    g = Math.round(65 + f * 165);
    b = 255;
  } else if (s < 0.55) {
    const f = (s - 0.35) / 0.20;
    r = Math.round(f * 25);
    g = Math.round(230 + f * 20);
    b = Math.round(255 * (1 - f) + 40 * f);
  } else if (s < 0.72) {
    const f = (s - 0.55) / 0.17;
    r = Math.round(25 + f * 230);
    g = Math.round(250 - f * 15);
    b = Math.round(40 * (1 - f));
  } else if (s < 0.88) {
    const f = (s - 0.72) / 0.16;
    r = 255;
    g = Math.round(235 - f * 125);
    b = 0;
  } else {
    const f = (s - 0.88) / 0.12;
    r = Math.round(255 - f * 40);
    g = Math.round(110 * (1 - f));
    b = 0;
  }

  return [r, g, b];
}

/**
 * Returns CSS rgba string for normalized scalar t in [0, 1]
 */
export function getFluentCfdColor(t: number, alpha: number = 0.98): string {
  const [r, g, b] = getFluentCfdRgb(t);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Computes exact linear interpolation parameter t along an edge from node A to node B
 * such that scalar(t) = isoTarget.
 *
 * Returns t in [0.0, 1.0] if the isocontour intersects the edge, or null if no crossing.
 */
export function interpolateIsoSegment(
  sA: number,
  sB: number,
  isoTarget: number
): number | null {
  const minS = Math.min(sA, sB);
  const maxS = Math.max(sA, sB);

  if (isoTarget < minS || isoTarget > maxS) {
    return null;
  }

  const denom = sB - sA;
  if (Math.abs(denom) < 1e-6) {
    return 0.5;
  }

  const t = (isoTarget - sA) / denom;
  return Math.max(0.0, Math.min(1.0, t));
}

/**
 * Extracts scalar field value and metadata for thematic display in Ansys Fluent / OpenFOAM style
 */
export function extractCfdScalarValue(
  field: string,
  c: number,
  hydro: { depth: Float32Array; velocityMag: Float32Array; wse: Float32Array; froude: Float32Array; shearStress: Float32Array; dynamicPressure?: Float32Array; ltsTier?: Uint8Array },
  turb?: { k?: Float32Array; nuT?: Float32Array },
  sed?: { concentrationKgM3?: Float32Array; bedElevationChangeM?: Float32Array }
): { value: number; title: string; unit: string } {
  switch (field) {
    case 'depth':
      return { value: hydro.depth[c] || 0.0, title: 'Water Depth (h)', unit: 'm' };
    case 'velocity':
      return { value: hydro.velocityMag[c] || 0.0, title: 'Velocity Magnitude |V|', unit: 'm/s' };
    case 'pressure': {
      const h = hydro.depth[c] || 0.0;
      const v = hydro.velocityMag[c] || 0.0;
      return { value: h + (v * v) / (2.0 * 9.80665), title: 'Total Dynamic Head (H)', unit: 'm' };
    }
    case 'dynamic-pressure':
      return {
        value: hydro.dynamicPressure ? Math.abs(hydro.dynamicPressure[c]) : 0.0,
        title: 'Non-Hydrostatic Dynamic Pressure (q)',
        unit: 'Pa',
      };
    case 'lts-tier':
      return {
        value: hydro.ltsTier ? hydro.ltsTier[c] : 0,
        title: 'LTS Sub-Cycling Tier (k)',
        unit: 'Tier',
      };
    case 'turbK':
      return { value: turb?.k ? turb.k[c] : 0.0, title: 'Turbulent Kinetic Energy (k)', unit: 'm²/s²' };
    case 'wse':
      return { value: hydro.wse[c] || 0.0, title: 'Water Surface Elevation (WSE)', unit: 'm MSL' };
    case 'froude':
      return { value: hydro.froude[c] || 0.0, title: 'Froude Number (Fr)', unit: 'Fr' };
    case 'shear':
      return { value: hydro.shearStress[c] || 0.0, title: 'Bed Shear Stress (τ_b)', unit: 'N/m²' };
    case 'nuT':
      return { value: turb?.nuT ? turb.nuT[c] : 0.0, title: 'Eddy Viscosity (ν_t)', unit: 'm²/s' };
    case 'sediment':
      return { value: sed?.concentrationKgM3 ? sed.concentrationKgM3[c] : 0.0, title: 'Sediment Concentration', unit: 'kg/m³' };
    case 'bedChange':
      return { value: sed?.bedElevationChangeM ? sed.bedElevationChangeM[c] : 0.0, title: 'Bed Morphodynamics (Δz_b)', unit: 'm' };
    default:
      return { value: hydro.velocityMag[c] || 0.0, title: 'Velocity Magnitude', unit: 'm/s' };
  }
}
