/**
 * River CFD Engine - Simulation Coordinator
 *
 * Orchestrates timestepping, numerical stability, monitoring gauge tracking,
 * mass conservation auditing, and post-simulation diagnostic reporting.
 */

import {
  RiverGridMesh,
  RiverBoundaryConditions,
  RiverMonitoringGauge,
  RiverCfdSummary,
  GaugeTimePoint,
} from '../types/riverReach';
import {
  TurbulenceParameters,
  DEFAULT_TURBULENCE_PARAMETERS,
} from '../types/turbulence';
import {
  SedimentParameters,
  DEFAULT_SEDIMENT_PARAMETERS,
} from '../types/sediment';
import { RiverHydraulicStructure } from '../structures/structureTypes';
import { IRiverSolver, createRiverSolver } from '../gpu/solverFactory';
import { computeStableTimeStep } from '../gpu/cpuSolver';

export interface RiverCfdEngineOptions {
  mesh: RiverGridMesh;
  boundaries: RiverBoundaryConditions;
  structures?: RiverHydraulicStructure[];
  gauges?: RiverMonitoringGauge[];
  turbParams?: TurbulenceParameters;
  sedParams?: SedimentParameters;
  preferredBackend?: 'webgpu' | 'webgl2' | 'cpu';
}

export class RiverCfdEngine {
  private solver: IRiverSolver | null = null;
  private mesh: RiverGridMesh;
  private boundaries: RiverBoundaryConditions;
  private structures: RiverHydraulicStructure[];
  private gauges: RiverMonitoringGauge[];
  private turbParams: TurbulenceParameters;
  private sedParams: SedimentParameters;
  private backendType: 'webgpu' | 'webgl2' | 'cpu' = 'cpu';

  private initialWaterVolumeM3: number = 0;
  private cumulativeInflowVolumeM3: number = 0;
  private cumulativeOutflowVolumeM3: number = 0;

  private gaugeHistories: Map<string, GaugeTimePoint[]> = new Map();

  constructor(options: RiverCfdEngineOptions) {
    this.mesh = options.mesh;
    this.boundaries = options.boundaries;
    this.structures = options.structures || [];
    this.gauges = options.gauges || [];
    this.turbParams = options.turbParams || { ...DEFAULT_TURBULENCE_PARAMETERS };
    this.sedParams = options.sedParams || { ...DEFAULT_SEDIMENT_PARAMETERS };
    this.backendType = options.preferredBackend || 'cpu';

    for (const g of this.gauges) {
      this.gaugeHistories.set(g.id, []);
    }
  }

  public async initialize(): Promise<void> {
    this.solver = await createRiverSolver(this.backendType);
    await this.solver.init(
      this.mesh,
      this.boundaries,
      this.structures,
      this.turbParams,
      this.sedParams
    );
    this.backendType = this.solver.getBackendType();

    // Calculate initial volume
    const state = this.solver.getState();
    let vol = 0;
    for (let c = 0; c < this.mesh.cells.length; c++) {
      vol += state.hydro.depth[c] * this.mesh.cells[c].areaM2;
    }
    this.initialWaterVolumeM3 = vol;
    this.recordGaugeReadings();
  }

  public step(dtSec?: number): void {
    if (!this.solver) return;
    const state = this.solver.getState();
    const actualDt = dtSec || computeStableTimeStep(this.mesh, state.hydro, 0.45, 0.5);

    this.solver.step(actualDt);

    // Track boundary flux approximations
    const qIn = this.boundaries.upstreamDischargeM3s;
    this.cumulativeInflowVolumeM3 += qIn * actualDt;

    this.recordGaugeReadings();
  }

  public async runBatch(
    totalDurationSec: number,
    onProgress?: (progressPct: number, currentSimTimeSec: number) => void
  ): Promise<RiverCfdSummary> {
    if (!this.solver) {
      await this.initialize();
    }

    let elapsed = 0;
    let stepCount = 0;

    while (elapsed < totalDurationSec) {
      const state = this.solver!.getState();
      const dt = computeStableTimeStep(this.mesh, state.hydro, 0.45, 0.4);
      const stepDt = Math.min(dt, totalDurationSec - elapsed);

      this.step(stepDt);
      elapsed += stepDt;
      stepCount++;

      if (stepCount % 20 === 0 && onProgress) {
        onProgress(Math.min(100, (elapsed / totalDurationSec) * 100), elapsed);
      }
    }

    if (onProgress) {
      onProgress(100, elapsed);
    }

    return this.generateSummary();
  }

  private recordGaugeReadings(): void {
    if (!this.solver) return;
    const state = this.solver.getState();
    const t = state.hydro.timeSec;

    for (const g of this.gauges) {
      const c = g.cellIndex;
      if (c >= 0 && c < this.mesh.cells.length) {
        const h = state.hydro.depth[c];
        const wse = state.hydro.wse[c];
        const vel = state.hydro.velocityMag[c];
        const cell = this.mesh.cells[c];
        const qLocal = vel * h * Math.sqrt(cell.areaM2);

        const point: GaugeTimePoint = {
          timeSec: t,
          wseM: wse,
          depthM: h,
          velocityMs: vel,
          dischargeM3s: qLocal,
          nuT: state.turb.nuT[c],
          concentrationKgM3: state.sed.concentrationKgM3[c],
          bedChangeM: state.sed.bedElevationChangeM[c],
        };

        const hist = this.gaugeHistories.get(g.id);
        if (hist) {
          hist.push(point);
          // Keep history capped at 1000 points to preserve memory
          if (hist.length > 1000) hist.shift();
        }
      }
    }
  }

  public getState() {
    if (!this.solver) throw new Error('Solver not initialized');
    return this.solver.getState();
  }

  public getMesh(): RiverGridMesh {
    return this.mesh;
  }

  public generateSummary(): RiverCfdSummary {
    if (!this.solver) throw new Error('Solver not initialized');
    const state = this.solver.getState();
    const numCells = this.mesh.cells.length;

    let maxDepth = 0;
    let maxVel = 0;
    let maxWse = -Infinity;
    let sumVel = 0;
    let wetCount = 0;
    let inundatedAreaM2 = 0;
    let currentVolM3 = 0;
    let critFroudeCount = 0;

    let maxNuT = 0;
    let sumNuT = 0;
    let maxK = 0;

    let maxScour = 0;
    let maxDepo = 0;

    for (let c = 0; c < numCells; c++) {
      const h = state.hydro.depth[c];
      const vel = state.hydro.velocityMag[c];
      const wse = state.hydro.wse[c];
      const area = this.mesh.cells[c].areaM2;

      if (h > maxDepth) maxDepth = h;
      if (vel > maxVel) maxVel = vel;
      if (wse > maxWse) maxWse = wse;

      if (h > 0.01) {
        sumVel += vel;
        wetCount++;
        inundatedAreaM2 += area;
        currentVolM3 += h * area;
        if (state.hydro.froude[c] >= 1.0) {
          critFroudeCount++;
        }
      }

      if (state.turb.nuT[c] > maxNuT) maxNuT = state.turb.nuT[c];
      sumNuT += state.turb.nuT[c];
      if (state.turb.k[c] > maxK) maxK = state.turb.k[c];

      const bedChange = state.sed.bedElevationChangeM[c];
      if (bedChange < maxScour) maxScour = bedChange;
      if (bedChange > maxDepo) maxDepo = bedChange;
    }

    const meanVel = wetCount > 0 ? sumVel / wetCount : 0;
    const meanNuT = numCells > 0 ? sumNuT / numCells : 0;

    // Mass conservation error
    const expectedVol = this.initialWaterVolumeM3 + this.cumulativeInflowVolumeM3;
    const massError =
      expectedVol > 0
        ? Math.abs((currentVolM3 - expectedVol) / expectedVol) * 100.0
        : 0;

    const historiesObj: Record<string, GaugeTimePoint[]> = {};
    for (const [id, hist] of this.gaugeHistories.entries()) {
      historiesObj[id] = [...hist];
    }

    return {
      converged: true,
      totalTimeSimulatedSec: state.hydro.timeSec,
      totalSteps: state.hydro.stepCount,
      backendUsed: this.backendType,
      maxWaterDepthM: maxDepth,
      maxVelocityMs: maxVel,
      maxWseM: maxWse,
      meanVelocityMs: meanVel,
      totalInundationAreaHa: inundatedAreaM2 / 10000.0,
      totalWaterVolumeM3: currentVolM3,
      massConservationErrorPercent: Math.min(100.0, massError),
      criticalFroudeCellsCount: critFroudeCount,
      turbulenceSummary: {
        model: this.turbParams.model,
        maxNuT,
        meanNuT,
        maxK,
      },
      sedimentSummary: {
        formula: this.sedParams.formula,
        d50Mm: this.sedParams.d50Mm,
        totalScourVolumeM3: state.sed.cumulativeScourVolumeM3,
        totalDepositionVolumeM3: state.sed.cumulativeDepositionVolumeM3,
        netBedVolumeChangeM3:
          state.sed.cumulativeDepositionVolumeM3 - state.sed.cumulativeScourVolumeM3,
        maxScourDepthM: Math.abs(maxScour),
        maxDepositionHeightM: maxDepo,
      },
      gaugeHydrographs: historiesObj,
    };
  }

  public dispose(): void {
    if (this.solver) {
      this.solver.dispose();
      this.solver = null;
    }
  }
}
