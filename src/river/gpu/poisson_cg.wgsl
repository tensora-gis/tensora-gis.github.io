// Weakly Dispersive Non-Hydrostatic Dynamic Pressure Poisson & Velocity Projection
// Solves 2D Elliptic Poisson for depth-averaged dynamic pressure q in WGSL

struct PoissonParams {
  numCells: u32,
  dtSec: f32,
  rhoWater: f32,
  omegaJacobi: f32, // under-relaxation parameter (0.8 - 0.9)
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

struct DynamicPressureData {
  qDynamic: f32,        // dynamic pressure [Pa]
  rhsSource: f32,       // Poisson right hand side
  qResidual: f32,
  pad: f32,
};

@group(0) @binding(0) var<uniform> params: PoissonParams;
@group(0) @binding(1) var<storage, read> cellStatic: array<CellStatic>;
@group(0) @binding(2) var<storage, read> faceData: array<FaceData>;
@group(0) @binding(3) var<storage, read_write> hydroState: array<CellState>;
@group(0) @binding(4) var<storage, read_write> pressData: array<DynamicPressureData>;

// Kernel 1: Assemble RHS Divergence of Intermediate Predictor Velocity u*
@compute @workgroup_size(64, 1, 1)
fn assembleRhs(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx >= params.numCells) {
    return;
  }

  let stat = cellStatic[idx];
  let cur = hydroState[idx];
  if (stat.solidMask == 1u || cur.depth <= 0.005) {
    pressData[idx].rhsSource = 0.0;
    pressData[idx].qDynamic = 0.0;
    return;
  }

  let faces = faceData[idx];
  var divHu: f32 = 0.0;

  for (var f: u32 = 0u; f < 4u; f = f + 1u) {
    let nbr = faces.neighbors[f];
    let len = faces.faceLengths[f];
    let nx = faces.faceNormalsX[f];
    let ny = faces.faceNormalsY[f];

    var uFace: f32 = cur.u;
    var vFace: f32 = cur.v;
    var hFace: f32 = cur.depth;

    if (nbr >= 0 && cellStatic[nbr].solidMask == 0u) {
      let nbrState = hydroState[nbr];
      uFace = 0.5 * (cur.u + nbrState.u);
      vFace = 0.5 * (cur.v + nbrState.v);
      hFace = 0.5 * (cur.depth + nbrState.depth);
    } else {
      // Solid wall boundary: zero normal velocity
      uFace = cur.u - (cur.u * nx + cur.v * ny) * nx;
      vFace = cur.v - (cur.u * nx + cur.v * ny) * ny;
    }

    let qn = hFace * (uFace * nx + vFace * ny);
    divHu = divHu + qn * len;
  }

  // RHS = (2 * rho / dt) * (div(h * u*) / Area)
  let rhs = ((2.0 * params.rhoWater) / params.dtSec) * (divHu / stat.cellArea);
  pressData[idx].rhsSource = rhs;
}

// Kernel 2: Jacobi Iteration Sweep for Elliptic Operator: div(h * grad(q)) - (2*rho/h)*q = RHS
@compute @workgroup_size(64, 1, 1)
fn jacobiSweep(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx >= params.numCells) {
    return;
  }

  let stat = cellStatic[idx];
  let cur = hydroState[idx];
  if (stat.solidMask == 1u || cur.depth <= 0.005) {
    return;
  }

  let faces = faceData[idx];
  let hC = cur.depth;
  let qC = pressData[idx].qDynamic;
  let rhs = pressData[idx].rhsSource;
  let charLen = sqrt(stat.cellArea);

  var diagCoeff: f32 = -(2.0 * params.rhoWater) / hC;
  var offDiagSum: f32 = 0.0;

  for (var f: u32 = 0u; f < 4u; f = f + 1u) {
    let nbr = faces.neighbors[f];
    let len = faces.faceLengths[f];

    if (nbr >= 0 && cellStatic[nbr].solidMask == 0u) {
      let hFace = 0.5 * (hC + hydroState[nbr].depth);
      let dist = max(1.0, charLen);
      let lapCoeff = (hFace * len) / dist;
      diagCoeff = diagCoeff - lapCoeff;
      offDiagSum = offDiagSum + lapCoeff * pressData[nbr].qDynamic;
    }
  }

  // q_new = (RHS - offDiagSum) / diagCoeff
  let qTarget = (rhs - offDiagSum) / diagCoeff;
  let qUpdated = (1.0 - params.omegaJacobi) * qC + params.omegaJacobi * qTarget;
  pressData[idx].qDynamic = qUpdated;
  pressData[idx].qResidual = abs(qUpdated - qC);
}

// Kernel 3: Velocity Projection Corrector: u^{n+1} = u* - (dt / rho) * grad(q)
@compute @workgroup_size(64, 1, 1)
fn projectVelocity(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx >= params.numCells) {
    return;
  }

  let stat = cellStatic[idx];
  if (stat.solidMask == 1u || hydroState[idx].depth <= 0.005) {
    return;
  }

  let faces = faceData[idx];
  let qC = pressData[idx].qDynamic;
  var gradQx: f32 = 0.0;
  var gradQy: f32 = 0.0;

  for (var f: u32 = 0u; f < 4u; f = f + 1u) {
    let nbr = faces.neighbors[f];
    let len = faces.faceLengths[f];
    let nx = faces.faceNormalsX[f];
    let ny = faces.faceNormalsY[f];

    var qFace = qC;
    if (nbr >= 0 && cellStatic[nbr].solidMask == 0u) {
      qFace = 0.5 * (qC + pressData[nbr].qDynamic);
    }

    gradQx = gradQx + (qFace * nx * len);
    gradQy = gradQy + (qFace * ny * len);
  }

  gradQx = gradQx / stat.cellArea;
  gradQy = gradQy / stat.cellArea;

  let corrCoeff = params.dtSec / params.rhoWater;
  hydroState[idx].u = hydroState[idx].u - corrCoeff * gradQx;
  hydroState[idx].v = hydroState[idx].v - corrCoeff * gradQy;
}
