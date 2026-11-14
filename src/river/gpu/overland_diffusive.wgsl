// WebGPU WGSL Compute Kernel for 2D Diffusive-Wave / Local Inertial Overland Routing
// Coupling Green-Ampt infiltration, semi-implicit Manning friction, and gravity-wave continuity

struct GridParams {
  nx: u32,
  ny: u32,
  dxM: f32,
  dyM: f32,
  dtSec: f32,
  g: f32,
  rainExcessMPerSec: f32,
  hDryM: f32,
};

@group(0) @binding(0) var<uniform> params: GridParams;
@group(0) @binding(1) var<storage, read> bedElevation: array<f32>;
@group(0) @binding(2) var<storage, read> manningN: array<f32>;
@group(0) @binding(3) var<storage, read_write> depthM: array<f32>;
@group(0) @binding(4) var<storage, read_write> qxM2PerSec: array<f32>;
@group(0) @binding(5) var<storage, read_write> qyM2PerSec: array<f32>;

// Kernel 1: Face discharge flux evaluation (Eq. 1.4)
@compute @workgroup_size(16, 16)
fn computeFaceDischarges(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let i = global_id.x;
  let j = global_id.y;

  // X-direction face updates
  if (i < params.nx - 1u && j < params.ny) {
    let leftCell = j * params.nx + i;
    let rightCell = leftCell + 1u;

    let zbL = bedElevation[leftCell];
    let zbR = bedElevation[rightCell];
    let etaL = zbL + depthM[leftCell];
    let etaR = zbR + depthM[rightCell];

    let hFlow = max(0.0, max(etaL, etaR) - max(zbL, zbR));
    let faceIdx = j * (params.nx + 1u) + (i + 1u);

    if (hFlow > params.hDryM) {
      let dEtaDx = (etaR - etaL) / params.dxM;
      let qxOld = qxM2PerSec[faceIdx];
      let nAvg = 0.5 * (manningN[leftCell] + manningN[rightCell]);

      let num = qxOld - params.g * hFlow * params.dtSec * dEtaDx;
      let denom = 1.0 + (params.g * params.dtSec * nAvg * nAvg * abs(qxOld)) / max(1e-5, pow(hFlow, 7.0 / 3.0));
      qxM2PerSec[faceIdx] = num / denom;
    } else {
      qxM2PerSec[faceIdx] = 0.0;
    }
  }

  // Y-direction face updates
  if (i < params.nx && j < params.ny - 1u) {
    let botCell = j * params.nx + i;
    let topCell = (j + 1u) * params.nx + i;

    let zbB = bedElevation[botCell];
    let zbT = bedElevation[topCell];
    let etaB = zbB + depthM[botCell];
    let etaT = zbT + depthM[topCell];

    let hFlow = max(0.0, max(etaB, etaT) - max(zbB, zbT));
    let faceIdx = (j + 1u) * params.nx + i;

    if (hFlow > params.hDryM) {
      let dEtaDy = (etaT - etaB) / params.dyM;
      let qyOld = qyM2PerSec[faceIdx];
      let nAvg = 0.5 * (manningN[botCell] + manningN[topCell]);

      let num = qyOld - params.g * hFlow * params.dtSec * dEtaDy;
      let denom = 1.0 + (params.g * params.dtSec * nAvg * nAvg * abs(qyOld)) / max(1e-5, pow(hFlow, 7.0 / 3.0));
      qyM2PerSec[faceIdx] = num / denom;
    } else {
      qyM2PerSec[faceIdx] = 0.0;
    }
  }
}

// Kernel 2: Cell-centered Mass Conservation update (Eq. 1.5)
@compute @workgroup_size(16, 16)
fn updateCellDepths(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let i = global_id.x;
  let j = global_id.y;
  if (i >= params.nx || j >= params.ny) {
    return;
  }

  let c = j * params.nx + i;
  let qxWest = qxM2PerSec[j * (params.nx + 1u) + i];
  let qxEast = qxM2PerSec[j * (params.nx + 1u) + (i + 1u)];
  let qySouth = qyM2PerSec[j * params.nx + i];
  let qyNorth = qyM2PerSec[(j + 1u) * params.nx + i];

  let divQx = (qxEast - qxWest) / params.dxM;
  let divQy = (qyNorth - qySouth) / params.dyM;

  let dH = (params.rainExcessMPerSec - divQx - divQy) * params.dtSec;
  depthM[c] = max(0.0, depthM[c] + dH);
}
