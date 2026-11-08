/**
 * Unified Solver Interface & Hardware Factory
 *
 * Automatically detects WebGPU -> WebGL2 -> CPU fallback hierarchy
 * and returns a standard IRiverSolver instance with active GPU hardware inspection.
 */

import {
  RiverGridMesh,
  HydrodynamicsState,
  RiverBoundaryConditions,
} from '../types/riverReach';
import {
  TurbulenceParameters,
  TurbulenceState,
} from '../types/turbulence';
import {
  SedimentParameters,
  SedimentState,
} from '../types/sediment';
import { RiverHydraulicStructure } from '../structures/structureTypes';
import {
  CpuSolverContext,
  createInitialHydroState,
  stepCpuSolver,
} from './cpuSolver';
import { createInitialTurbulenceState } from '../turbulence/turbulenceModels';
import { createInitialSedimentState } from '../sediment/sedimentTransport';
import { WebGpuRiverSolver } from './webgpuSolver';
import { WebGl2RiverSolver } from './webgl2Solver';

export interface IRiverSolver {
  init(
    mesh: RiverGridMesh,
    boundaries: RiverBoundaryConditions,
    structures: RiverHydraulicStructure[],
    turbParams: TurbulenceParameters,
    sedParams: SedimentParameters
  ): Promise<void>;
  step(dtSec: number): void;
  getState(): {
    hydro: HydrodynamicsState;
    turb: TurbulenceState;
    sed: SedimentState;
  };
  setStructures(structures: RiverHydraulicStructure[]): void;
  setBoundaries(boundaries: RiverBoundaryConditions): void;
  setTurbulenceParams(params: TurbulenceParameters): void;
  setSedimentParams(params: SedimentParameters): void;
  getBackendType(): 'webgpu' | 'webgl2' | 'cpu';
  getGpuDeviceName(): string;
  readback?(): Promise<void>;
  dispose(): void;
}

/**
 * Standard CPU Solver Implementation of IRiverSolver
 */
export class CpuRiverSolverAdapter implements IRiverSolver {
  private ctx: CpuSolverContext | null = null;

  public async init(
    mesh: RiverGridMesh,
    boundaries: RiverBoundaryConditions,
    structures: RiverHydraulicStructure[],
    turbParams: TurbulenceParameters,
    sedParams: SedimentParameters
  ): Promise<void> {
    const hydro = createInitialHydroState(mesh, boundaries, structures);
    const turb = createInitialTurbulenceState(mesh);
    const sed = createInitialSedimentState(mesh);

    this.ctx = {
      mesh,
      hydro,
      turb,
      sed,
      boundaries,
      structures,
      turbParams,
      sedParams,
      stepCount: 0,
    };
  }

  public step(dtSec: number): void {
    if (!this.ctx) return;
    stepCpuSolver(this.ctx, dtSec);
  }

  public getState(): {
    hydro: HydrodynamicsState;
    turb: TurbulenceState;
    sed: SedimentState;
  } {
    if (!this.ctx) {
      throw new Error('Solver not initialized');
    }
    return {
      hydro: this.ctx.hydro,
      turb: this.ctx.turb,
      sed: this.ctx.sed,
    };
  }

  public setStructures(structures: RiverHydraulicStructure[]): void {
    if (this.ctx) this.ctx.structures = structures;
  }

  public setBoundaries(boundaries: RiverBoundaryConditions): void {
    if (this.ctx) this.ctx.boundaries = boundaries;
  }

  public setTurbulenceParams(params: TurbulenceParameters): void {
    if (this.ctx) this.ctx.turbParams = params;
  }

  public setSedimentParams(params: SedimentParameters): void {
    if (this.ctx) this.ctx.sedParams = params;
  }

  public getBackendType(): 'cpu' {
    return 'cpu';
  }

  public getGpuDeviceName(): string {
    return 'Host CPU Reference (FVM)';
  }

  public async readback(): Promise<void> {
    return Promise.resolve();
  }

  public dispose(): void {
    this.ctx = null;
  }
}

/**
 * Factory function to create the best available solver backend
 * Priorities: WebGPU compute shaders -> WebGL2 GPGPU float textures -> CPU reference
 */
export async function createRiverSolver(
  preferredBackend?: 'webgpu' | 'webgl2' | 'cpu'
): Promise<IRiverSolver> {
  if (preferredBackend === 'cpu') {
    return new CpuRiverSolverAdapter();
  }

  // 1. WebGPU Compute Shaders (Highest throughput, lowest latency on integrated/discrete GPU)
  if (preferredBackend === 'webgpu' || !preferredBackend) {
    try {
      const webGpuSupported = await WebGpuRiverSolver.isSupported();
      if (webGpuSupported) {
        const solver = new WebGpuRiverSolver();
        return solver;
      }
    } catch (err) {
      console.warn('WebGPU detection failed, attempting WebGL2 fallback:', err);
    }
  }

  // 2. WebGL2 GPGPU Fallback (Runs on all browser integrated GPUs)
  if (preferredBackend === 'webgl2' || !preferredBackend || preferredBackend === 'webgpu') {
    try {
      const webGl2Supported = WebGl2RiverSolver.isSupported();
      if (webGl2Supported) {
        const solver = new WebGl2RiverSolver();
        return solver;
      }
    } catch (err) {
      console.warn('WebGL2 detection failed, falling back to CPU:', err);
    }
  }

  // 3. Robust Host CPU Reference FVM Engine
  return new CpuRiverSolverAdapter();
}
