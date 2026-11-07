/**
 * WebGL2 GPGPU Fallback River Solver
 *
 * Provides GPU-accelerated computing using WebGL2 float textures where
 * WebGPU is not supported by older hardware or mobile browsers.
 */

export class WebGl2RiverSolver {
  private gl: WebGL2RenderingContext | null = null;
  private isReady = false;

  public static isSupported(): boolean {
    if (typeof document === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      return !!gl;
    } catch {
      return false;
    }
  }

  public init(): boolean {
    if (typeof document === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      this.gl = canvas.getContext('webgl2');
      this.isReady = !!this.gl;
      return this.isReady;
    } catch {
      this.isReady = false;
      return false;
    }
  }

  public isInitialized(): boolean {
    return this.isReady;
  }

  public dispose(): void {
    this.gl = null;
    this.isReady = false;
  }
}
