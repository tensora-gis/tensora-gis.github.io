/**
 * WebGPU WGSL Compute Shaders for 2D Coupled Sediment Transport & Exner Morphodynamics
 */

export const SEDIMENT_WGSL_SHADERS = /* wgsl */ `
struct SedimentParams {
  d50M: f32,
  specificGravity: f32,
  bedPorosity: f32,
  waterDensity: f32,
  bedChangeCapPct: f32,
  dtSec: f32,
  morphDtSec: f32,
  numCells: u32,
  formula: u32, // 0 = Engelund-Hansen, 1 = MPM, 2 = van Rijn, 3 = Toffaleti
};

@group(0) @binding(0) var<uniform> params: SedimentParams;
@group(0) @binding(1) var<storage, read> depth: array<f32>;
@group(0) @binding(2) var<storage, read> u: array<f32>;
@group(0) @binding(3) var<storage, read> v: array<f32>;
@group(0) @binding(4) var<storage, read> manningN: array<f32>;
@group(0) @binding(5) var<storage, read_write> shields: array<f32>;
@group(0) @binding(6) var<storage, read_write> transportRate: array<f32>;
@group(0) @binding(7) var<storage, read_write> concentration: array<f32>;
@group(0) @binding(8) var<storage, read_write> bedChange: array<f32>;
@group(0) @binding(9) var<storage, read_write> bedElevation: array<f32>;

const G: f32 = 9.81;

fn computeShields(h: f32, velMag: f32, n: f32) -> f32 {
  if (h <= 0.005 || velMag <= 0.001) {
    return 0.0;
  }
  let hCbrt = pow(h, 0.3333333);
  let tauB = (params.waterDensity * G * n * n * velMag * velMag) / max(hCbrt, 0.01);
  let subWeight = (params.specificGravity - 1.0) * params.waterDensity * G * params.d50M;
  return tauB / max(subWeight, 1.0e-7);
}

@compute @workgroup_size(64)
fn computeSedimentCapacity(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx >= params.numCells) {
    return;
  }

  let h = depth[idx];
  let ux = u[idx];
  let vy = v[idx];
  let n = manningN[idx];
  let velMag = sqrt(ux * ux + vy * vy);

  let theta = computeShields(h, velMag, n);
  shields[idx] = theta;

  if (h <= 0.01 || velMag <= 0.01 || theta <= 0.047) {
    transportRate[idx] = 0.0;
    return;
  }

  let R = params.specificGravity - 1.0;
  let sqrtGravD = sqrt(R * G * params.d50M * params.d50M * params.d50M);

  var qs: f32 = 0.0;

  if (params.formula == 0u) {
    // Engelund-Hansen
    let tauB = theta * R * params.waterDensity * G * params.d50M;
    let cf = max(0.001, (2.0 * tauB) / (params.waterDensity * velMag * velMag + 1.0e-5));
    qs = (0.05 / cf) * pow(theta, 2.5) * sqrtGravD;
  } else if (params.formula == 1u) {
    // Meyer-Peter & Muller
    let excess = theta - 0.047;
    if (excess > 0.0) {
      qs = 8.0 * pow(excess, 1.5) * sqrtGravD;
    }
  } else {
    // Default fallback
    let excess = max(0.0, theta - 0.047);
    qs = 4.0 * pow(excess, 1.5) * sqrtGravD;
  }

  transportRate[idx] = qs;
}
`;
