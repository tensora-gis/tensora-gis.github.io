/**
 * WebGPU WGSL Compute Shaders for Depth-Averaged RANS Turbulence Modelling
 * (Mixing Length, k-epsilon, and k-omega SST)
 */

export const TURBULENCE_WGSL_SHADERS = /* wgsl */ `
struct TurbulenceParams {
  cMu: f32,
  c1Eps: f32,
  c2Eps: f32,
  sigmaK: f32,
  sigmaEps: f32,
  kappa: f32,
  eddyViscosityCap: f32,
  dtSec: f32,
  numCells: u32,
  modelType: u32, // 0 = none, 1 = mixing-length, 2 = k-epsilon, 3 = k-omega-sst
};

@group(0) @binding(0) var<uniform> params: TurbulenceParams;
@group(0) @binding(1) var<storage, read> depth: array<f32>;
@group(0) @binding(2) var<storage, read> u: array<f32>;
@group(0) @binding(3) var<storage, read> v: array<f32>;
@group(0) @binding(4) var<storage, read> manningN: array<f32>;
@group(0) @binding(5) var<storage, read_write> k: array<f32>;
@group(0) @binding(6) var<storage, read_write> eps: array<f32>;
@group(0) @binding(7) var<storage, read_write> nuT: array<f32>;
@group(0) @binding(8) var<storage, read_write> pK: array<f32>;

const G: f32 = 9.81;

@compute @workgroup_size(64)
fn updateTurbulenceAlgebraic(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx >= params.numCells) {
    return;
  }

  let h = depth[idx];
  let ux = u[idx];
  let vy = v[idx];
  let n = manningN[idx];
  let velMag = sqrt(ux * ux + vy * vy);

  if (h <= 0.005 || velMag <= 0.001) {
    k[idx] = 0.0;
    eps[idx] = 0.0;
    nuT[idx] = 0.0;
    pK[idx] = 0.0;
    return;
  }

  // Friction velocity u* = n * sqrt(g) * |V| / h^(1/6)
  let hSixth = pow(h, 0.1666667);
  let uStar = (n * sqrt(G) * velMag) / max(hSixth, 0.05);

  if (params.modelType == 1u) {
    // Mixing-length: nu_t = (1/6) * kappa * u* * h
    let nut = (1.0 / 6.0) * params.kappa * uStar * h;
    nuT[idx] = min(nut, params.eddyViscosityCap);
    k[idx] = (uStar * uStar) / sqrt(params.cMu);
    eps[idx] = (pow(uStar, 3.0)) / (params.kappa * max(h, 0.01));
  } else if (params.modelType == 2u) {
    // k-epsilon equilibrium estimate & cap
    let kEq = (uStar * uStar) / sqrt(params.cMu);
    let epsEq = (pow(uStar, 3.0)) / (params.kappa * max(h, 0.01));
    k[idx] = max(k[idx], kEq * 0.1);
    eps[idx] = max(eps[idx], epsEq * 0.1);
    let rawNuT = params.cMu * (k[idx] * k[idx]) / max(eps[idx], 1.0e-5);
    nuT[idx] = min(rawNuT, params.eddyViscosityCap);
  } else {
    nuT[idx] = 0.0;
  }
}
`;
