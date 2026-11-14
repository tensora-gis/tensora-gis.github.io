// 2nd-Order MUSCL-Hancock Space-Time Reconstruction with TVD Minmod Limiter
// Audusse Well-Balanced Surface Elevation (eta = h + zb) Reconstructor

struct MusclParams {
  numCells: u32,
  dtSec: f32,
  g: f32,
  thetaLimiter: f32, // 1.0 = Minmod, 2.0 = Superbee
};

struct CellState {
  depth: f32,
  u: f32,
  v: f32,
  wse: f32,
};

struct CellStatic {
  bedElevation: f32,
  manningN: f32,
  cellArea: f32,
  solidMask: u32,
  stationJ: u32,
  isBoundary: u32,
  pad0: f32,
  pad1: f32,
};

struct FaceData {
  neighbors: vec4<i32>,
  faceLengths: vec4<f32>,
  faceNormalsX: vec4<f32>,
  faceNormalsY: vec4<f32>,
};

struct MusclFaceStates {
  hL: vec4<f32>,
  uL: vec4<f32>,
  vL: vec4<f32>,
  wseL: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: MusclParams;
@group(0) @binding(1) var<storage, read> cellStatic: array<CellStatic>;
@group(0) @binding(2) var<storage, read> faceData: array<FaceData>;
@group(0) @binding(3) var<storage, read> stateIn: array<CellState>;
@group(0) @binding(4) var<storage, read_write> faceStatesOut: array<MusclFaceStates>;

fn minmod(a: f32, b: f32) -> f32 {
  if (a * b <= 0.0) {
    return 0.0;
  }
  let s = sign(a);
  return s * min(abs(a), abs(b));
}

fn vanLeer(a: f32, b: f32) -> f32 {
  if (a * b <= 0.0) {
    return 0.0;
  }
  return (2.0 * a * b) / (a + b);
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx >= params.numCells) {
    return;
  }

  let stat = cellStatic[idx];
  if (stat.solidMask == 1u) {
    var blank: MusclFaceStates;
    blank.hL = vec4<f32>(0.0);
    blank.uL = vec4<f32>(0.0);
    blank.vL = vec4<f32>(0.0);
    blank.wseL = vec4<f32>(0.0);
    faceStatesOut[idx] = blank;
    return;
  }

  let cur = stateIn[idx];
  let faces = faceData[idx];
  let zC = stat.bedElevation;
  let etaC = cur.depth + zC;

  // Along-stream (faces 3 to 1) and cross-stream (faces 0 to 2) neighbors
  let nbr0 = faces.neighbors.x; // left
  let nbr1 = faces.neighbors.y; // forward
  let nbr2 = faces.neighbors.z; // right
  let nbr3 = faces.neighbors.w; // backward

  // Sample neighbor states with boundary fallback
  var etaFwd = etaC; var uFwd = cur.u; var vFwd = cur.v;
  if (nbr1 >= 0 && cellStatic[nbr1].solidMask == 0u) {
    let s = stateIn[nbr1];
    etaFwd = s.depth + cellStatic[nbr1].bedElevation;
    uFwd = s.u;
    vFwd = s.v;
  }

  var etaBack = etaC; var uBack = cur.u; var vBack = cur.v;
  if (nbr3 >= 0 && cellStatic[nbr3].solidMask == 0u) {
    let s = stateIn[nbr3];
    etaBack = s.depth + cellStatic[nbr3].bedElevation;
    uBack = s.u;
    vBack = s.v;
  }

  var etaLeft = etaC; var uLeft = cur.u; var vLeft = cur.v;
  if (nbr0 >= 0 && cellStatic[nbr0].solidMask == 0u) {
    let s = stateIn[nbr0];
    etaLeft = s.depth + cellStatic[nbr0].bedElevation;
    uLeft = s.u;
    vLeft = s.v;
  }

  var etaRight = etaC; var uRight = cur.u; var vRight = cur.v;
  if (nbr2 >= 0 && cellStatic[nbr2].solidMask == 0u) {
    let s = stateIn[nbr2];
    etaRight = s.depth + cellStatic[nbr2].bedElevation;
    uRight = s.u;
    vRight = s.v;
  }

  // 1. Minmod slope limiting on characteristic state variables
  let sigmaEta_x = minmod(etaC - etaBack, etaFwd - etaC);
  let sigmaU_x   = minmod(cur.u - uBack, uFwd - cur.u);
  let sigmaV_x   = minmod(cur.v - vBack, vFwd - cur.v);

  let sigmaEta_y = minmod(etaC - etaLeft, etaRight - etaC);
  let sigmaU_y   = minmod(cur.u - uLeft, uRight - cur.u);
  let sigmaV_y   = minmod(cur.v - vLeft, vRight - cur.v);

  // 2. Half-time step Hancock predictor (Euler predictor at cell centroid)
  let halfDt = 0.5 * params.dtSec;
  let etaPred = etaC - halfDt * (cur.u * sigmaEta_x + cur.v * sigmaEta_y);
  let uPred   = cur.u - halfDt * (cur.u * sigmaU_x + params.g * sigmaEta_x);
  let vPred   = cur.v - halfDt * (cur.v * sigmaV_y + params.g * sigmaEta_y);

  // 3. Extrapolate reconstructed face states to all 4 cell faces
  var outFace: MusclFaceStates;

  // Face 0 (Left: -y direction)
  let eta0 = etaPred - 0.5 * sigmaEta_y;
  outFace.wseL.x = eta0;
  outFace.hL.x = max(0.0, eta0 - zC);
  outFace.uL.x = uPred - 0.5 * sigmaU_y;
  outFace.vL.x = vPred - 0.5 * sigmaV_y;

  // Face 1 (Forward: +x direction)
  let eta1 = etaPred + 0.5 * sigmaEta_x;
  outFace.wseL.y = eta1;
  outFace.hL.y = max(0.0, eta1 - zC);
  outFace.uL.y = uPred + 0.5 * sigmaU_x;
  outFace.vL.y = vPred + 0.5 * sigmaV_x;

  // Face 2 (Right: +y direction)
  let eta2 = etaPred + 0.5 * sigmaEta_y;
  outFace.wseL.z = eta2;
  outFace.hL.z = max(0.0, eta2 - zC);
  outFace.uL.z = uPred + 0.5 * sigmaU_y;
  outFace.vL.z = vPred + 0.5 * sigmaV_y;

  // Face 3 (Backward: -x direction)
  let eta3 = etaPred - 0.5 * sigmaEta_x;
  outFace.wseL.w = eta3;
  outFace.hL.w = max(0.0, eta3 - zC);
  outFace.uL.w = uPred - 0.5 * sigmaU_x;
  outFace.vL.w = vPred - 0.5 * sigmaV_x;

  faceStatesOut[idx] = outFace;
}
