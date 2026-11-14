// GPU Local Time-Stepping (LTS) Sub-Cycling & Interface Flux Accumulation
// Partitions cells into 2^k power-of-two CFL tiers with conservative flux matching

struct LtsParams {
  numCells: u32,
  dtMinSec: f32,
  maxTier: u32, // default 3 (1x, 2x, 4x, 8x sub-cycling)
  subStepIndex: u32,
  g: f32,
  cflTarget: f32,
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

struct LtsTierData {
  tierIndex: u32,      // k in 0..maxTier
  subCyclePeriod: u32, // 2^k (1, 2, 4, 8)
  localDt: f32,        // dtMin * 2^k
  shouldUpdate: u32,   // 1 if (subStepIndex % 2^k == 0)
};

struct InterfaceFluxAccumulator {
  accumH: vec4<f32>,
  accumHu: vec4<f32>,
  accumHv: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: LtsParams;
@group(0) @binding(1) var<storage, read> cellStatic: array<CellStatic>;
@group(0) @binding(2) var<storage, read> stateIn: array<CellState>;
@group(0) @binding(3) var<storage, read_write> ltsTiers: array<LtsTierData>;
@group(0) @binding(4) var<storage, read_write> fluxAccum: array<InterfaceFluxAccumulator>;

@compute @workgroup_size(64, 1, 1)
fn evaluateTiers(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx >= params.numCells) {
    return;
  }

  let stat = cellStatic[idx];
  let cur = stateIn[idx];

  if (stat.solidMask == 1u || cur.depth <= 0.001) {
    var td: LtsTierData;
    td.tierIndex = params.maxTier;
    td.subCyclePeriod = 1u << params.maxTier;
    td.localDt = params.dtMinSec * f32(td.subCyclePeriod);
    td.shouldUpdate = 0u;
    ltsTiers[idx] = td;
    return;
  }

  let charLen = sqrt(stat.cellArea);
  let vel = sqrt(cur.u * cur.u + cur.v * cur.v);
  let celerity = sqrt(params.g * cur.depth);
  let dtStable = (params.cflTarget * charLen) / max(0.1, vel + celerity);

  // Power-of-two binning: k = clamp(floor(log2(dtStable / dtMin)), 0, maxTier)
  var ratio = dtStable / params.dtMinSec;
  var k: u32 = 0u;
  while (ratio >= 2.0 && k < params.maxTier) {
    ratio = ratio * 0.5;
    k = k + 1u;
  }

  let period = 1u << k;
  let updateNow = select(0u, 1u, (params.subStepIndex % period) == 0u);

  var td: LtsTierData;
  td.tierIndex = k;
  td.subCyclePeriod = period;
  td.localDt = params.dtMinSec * f32(period);
  td.shouldUpdate = updateNow;
  ltsTiers[idx] = td;
}
