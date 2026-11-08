/**
 * WebGL2 GPGPU Fallback River Solver
 *
 * Utilizes the user's integrated GPU via WebGL2 float textures and GLSL 3.00 es
 * fragment shaders when WebGPU is not exposed in the user's browser.
 *
 * Implements:
 * 1. 2D Shallow Water Saint-Venant equations with Audusse hydrostatic reconstruction
 * 2. Topographic bed slope source term integration (C-property preserving)
 * 3. Semi-implicit Manning bed friction attenuation
 * 4. Solid CAD obstacle reflective boundary conditions
 * 5. Exact curvilinear face metric textures (face lengths & true outward normal vectors)
 * 6. High-throughput ping-pong Framebuffer Object (FBO) execution on integrated GPU
 */

import {
  RiverGridMesh,
  HydrodynamicsState,
  RiverBoundaryConditions,
} from '../types/riverReach';
import { TurbulenceParameters, TurbulenceState } from '../types/turbulence';
import { SedimentParameters, SedimentState } from '../types/sediment';
import { RiverHydraulicStructure } from '../structures/structureTypes';
import { IRiverSolver } from './solverFactory';
import { createInitialHydroState } from './cpuSolver';
import { createInitialTurbulenceState, stepTurbulenceModel } from '../turbulence/turbulenceModels';
import { createInitialSedimentState, stepSedimentTransport } from '../sediment/sedimentTransport';

export const VS_QUAD_SOURCE = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const FS_SHALLOW_WATER_SOURCE = `#version 300 es
precision highp float;
precision highp int;

in vec2 v_uv;

uniform sampler2D u_stateTex; // RGBA32F: R=depth, G=u, B=v, A=wse
uniform sampler2D u_geomTex;  // RGBA32F: R=bedElevation, G=manningN, B=area, A=solidMask
uniform sampler2D u_faceNormals01Tex; // RGBA32F: R=nx0, G=ny0, B=nx1, A=ny1
uniform sampler2D u_faceNormals23Tex; // RGBA32F: R=nx2, G=ny2, B=nx3, A=ny3
uniform sampler2D u_faceLengthsTex;   // RGBA32F: R=len0, G=len1, B=len2, A=len3
uniform ivec2 u_gridSize;     // (nx, ny)

uniform float u_dt;
uniform float u_rainfall;
uniform float u_upstreamQ;
uniform float u_upstreamH;
uniform float u_meanInflowVel;
uniform float u_downstreamStage;
uniform int u_downstreamType;
uniform float u_estWidth;

layout(location = 0) out vec4 fragState; // (newH, newU, newV, newWse)

const float G = 9.81;
const float H_DRY = 0.001;

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  int i = coord.x;
  int j = coord.y;
  int nx = u_gridSize.x;
  int ny = u_gridSize.y;

  vec4 geom = texelFetch(u_geomTex, coord, 0);
  float zL = geom.r;
  float n = geom.g;
  float area = max(geom.b, 0.1);
  float solid = geom.a;

  if (solid > 0.5) {
    fragState = vec4(0.0, 0.0, 0.0, zL);
    return;
  }

  vec4 state = texelFetch(u_stateTex, coord, 0);
  float hL = state.r;
  float uL = state.g;
  float vL = state.b;

  float fluxSumH = 0.0;
  float fluxSumHu = 0.0;
  float fluxSumHv = 0.0;
  float sBx = 0.0;
  float sBy = 0.0;

  // 4 Faces:
  // Face 0: Bank (j - 1)
  // Face 1: Downstream (i + 1)
  // Face 2: Bank (j + 1)
  // Face 3: Upstream (i - 1)
  ivec2 nbrCoords[4];
  nbrCoords[0] = ivec2(i, j - 1);
  nbrCoords[1] = ivec2(i + 1, j);
  nbrCoords[2] = ivec2(i, j + 1);
  nbrCoords[3] = ivec2(i - 1, j);

  vec4 fn01 = texelFetch(u_faceNormals01Tex, coord, 0);
  vec4 fn23 = texelFetch(u_faceNormals23Tex, coord, 0);
  vec4 flen = texelFetch(u_faceLengthsTex, coord, 0);

  vec2 normals[4];
  normals[0] = fn01.xy;
  normals[1] = fn01.zw;
  normals[2] = fn23.xy;
  normals[3] = fn23.zw;

  float faceLengths[4];
  faceLengths[0] = flen.x;
  faceLengths[1] = flen.y;
  faceLengths[2] = flen.z;
  faceLengths[3] = flen.w;

  for (int f = 0; f < 4; f++) {
    ivec2 nCoord = nbrCoords[f];
    vec2 norm = normals[f];
    float nxVal = norm.x;
    float nyVal = norm.y;
    float faceLen = faceLengths[f];

    float hR = hL;
    float uR = uL;
    float vR = vL;
    float zR = zL;

    bool isInside = (nCoord.x >= 0 && nCoord.x < nx && nCoord.y >= 0 && nCoord.y < ny);

    if (isInside) {
      vec4 nGeom = texelFetch(u_geomTex, nCoord, 0);
      if (nGeom.a > 0.5) {
        // Solid wall
        uR = -uL;
        vR = -vL;
        hR = hL;
        zR = zL;
      } else {
        vec4 nState = texelFetch(u_stateTex, nCoord, 0);
        hR = nState.r;
        uR = nState.g;
        vR = nState.b;
        zR = nGeom.r;
      }
    } else {
      // Boundary
      if (f == 3) { // Upstream
        if (u_upstreamQ > 0.0) {
          float eta = (float(j) + 0.5) / float(ny);
          float prof = 1.5 * 4.0 * eta * (1.0 - eta);
          float inflowVel = min(15.0, u_meanInflowVel * prof);
          hR = u_upstreamH;
          uR = -inflowVel * nxVal;
          vR = -inflowVel * nyVal;
          zR = zL;
        } else {
          float vnL = uL * nxVal + vL * nyVal;
          float vtL = -uL * nyVal + vL * nxVal;
          uR = (-vnL) * nxVal - vtL * nyVal;
          vR = (-vnL) * nyVal + vtL * nxVal;
          hR = hL;
          zR = zL;
        }
      } else if (f == 1) { // Downstream
        if (u_downstreamType == 1) {
          hR = max(0.0, u_downstreamStage - zL);
          uR = uL;
          vR = vL;
          zR = zL;
        } else {
          hR = hL;
          uR = uL;
          vR = vL;
          zR = zL;
        }
      } else { // Bank
        float vnL = uL * nxVal + vL * nyVal;
        float vtL = -uL * nyVal + vL * nxVal;
        uR = (-vnL) * nxVal - vtL * nyVal;
        vR = (-vnL) * nyVal + vtL * nxVal;
        hR = hL;
        zR = zL;
      }
    }

    // Audusse Hydrostatic Reconstruction
    float zMax = max(zL, zR);
    float etaL = hL + zL;
    float etaR = hR + zR;

    float hStarL = max(0.0, etaL - zMax);
    float hStarR = max(0.0, etaR - zMax);

    if (hStarL > H_DRY || hStarR > H_DRY) {
      float vnL = uL * nxVal + vL * nyVal;
      float vtL = -uL * nyVal + vL * nxVal;
      float vnR = uR * nxVal + vR * nyVal;
      float vtR = -uR * nyVal + vR * nxVal;

      float cL = sqrt(G * hStarL);
      float cR = sqrt(G * hStarR);

      float sqrtHL = sqrt(max(0.0, hStarL));
      float sqrtHR = sqrt(max(0.0, hStarR));
      float denomRoe = sqrtHL + sqrtHR + 1.0e-6;
      float uRoe = (sqrtHL * vnL + sqrtHR * vnR) / denomRoe;
      float cRoe = sqrt(0.5 * G * (hStarL + hStarR));

      float sL = min(vnL - cL, uRoe - cRoe);
      float sR = max(vnR + cR, uRoe + cRoe);

      float sStar = 0.0;
      float denomStar = hStarR * (vnR - sR) - hStarL * (vnL - sL);
      if (abs(denomStar) > 1.0e-6) {
        sStar = (sL * hStarR * (vnR - sR) - sR * hStarL * (vnL - sL)) / denomStar;
      } else {
        sStar = 0.5 * (sL + sR);
      }

      float fluxNormL_h = hStarL * vnL;
      float fluxNormL_u = hStarL * vnL * vnL + 0.5 * G * hStarL * hStarL;
      float fluxNormL_v = hStarL * vnL * vtL;

      float fluxNormR_h = hStarR * vnR;
      float fluxNormR_u = hStarR * vnR * vnR + 0.5 * G * hStarR * hStarR;
      float fluxNormR_v = hStarR * vnR * vtR;

      float fNormH = 0.0;
      float fNormU = 0.0;
      float fNormV = 0.0;

      if (sL >= 0.0) {
        fNormH = fluxNormL_h;
        fNormU = fluxNormL_u;
        fNormV = fluxNormL_v;
      } else if (sR <= 0.0) {
        fNormH = fluxNormR_h;
        fNormU = fluxNormR_u;
        fNormV = fluxNormR_v;
      } else if (sStar >= 0.0) {
        float factorL = (sL - vnL) / (sL - sStar + (sL == sStar ? 1.0e-6 : 0.0));
        float hStarLRegion = max(0.0, hStarL * factorL);
        fNormH = fluxNormL_h + sL * (hStarLRegion - hStarL);
        fNormU = fluxNormL_u + sL * (hStarLRegion * sStar - hStarL * vnL);
        fNormV = fluxNormL_v + sL * (hStarLRegion * vtL - hStarL * vtL);
      } else {
        float factorR = (sR - vnR) / (sR - sStar + (sR == sStar ? 1.0e-6 : 0.0));
        float hStarRRegion = max(0.0, hStarR * factorR);
        fNormH = fluxNormR_h + sR * (hStarRRegion - hStarR);
        fNormU = fluxNormR_u + sR * (hStarRRegion * sStar - hStarR * vnR);
        fNormV = fluxNormR_v + sR * (hStarRRegion * vtR - hStarR * vtR);
      }

      float fluxHu = fNormU * nxVal - fNormV * nyVal;
      float fluxHv = fNormU * nyVal + fNormV * nxVal;

      fluxSumH += fNormH * faceLen;
      fluxSumHu += fluxHu * faceLen;
      fluxSumHv += fluxHv * faceLen;
    }

    // Audusse bed slope source term (well-balanced C-property preserving)
    float zStar = max(zL, zR);
    float hStarFace = max(0.0, hL + zL - zStar);
    float sourceP = 0.5 * G * (hStarFace * hStarFace - hL * hL);
    sBx += sourceP * nxVal * faceLen;
    sBy += sourceP * nyVal * faceLen;
  }

  // Advance cell
  float dH = (-fluxSumH / area + u_rainfall) * u_dt;
  float newH = max(0.0, hL + dH);

  float newHu = (hL * uL) + (-fluxSumHu / area + sBx / area) * u_dt;
  float newHv = (hL * vL) + (-fluxSumHv / area + sBy / area) * u_dt;

  // Semi-implicit bed friction
  if (newH > H_DRY) {
    float velMag = sqrt(newHu * newHu + newHv * newHv) / newH;
    float frictionDenom = 1.0 + (u_dt * G * n * n * velMag) / max(pow(newH, 1.3333333), 0.01);
    newHu /= frictionDenom;
    newHv /= frictionDenom;
  } else {
    newHu = 0.0;
    newHv = 0.0;
  }

  float finalU = newH > H_DRY ? newHu / newH : 0.0;
  float finalV = newH > H_DRY ? newHv / newH : 0.0;

  fragState = vec4(newH, finalU, finalV, zL + newH);
}
`;

export class WebGl2RiverSolver implements IRiverSolver {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private isReady = false;
  private gpuName = 'Integrated WebGL2 Accelerator';

  private mesh: RiverGridMesh | null = null;
  private boundaries: RiverBoundaryConditions | null = null;
  private structures: RiverHydraulicStructure[] = [];
  private turbParams: TurbulenceParameters | null = null;
  private sedParams: SedimentParameters | null = null;

  private hydro: HydrodynamicsState | null = null;
  private turb: TurbulenceState | null = null;
  private sed: SedimentState | null = null;

  private program: WebGLProgram | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;
  private stateTextures: [WebGLTexture | null, WebGLTexture | null] = [null, null];
  private fbos: [WebGLFramebuffer | null, WebGLFramebuffer | null] = [null, null];
  private geomTexture: WebGLTexture | null = null;
  private fn01Texture: WebGLTexture | null = null;
  private fn23Texture: WebGLTexture | null = null;
  private flenTexture: WebGLTexture | null = null;

  private currentReadIndex = 0;
  private readbackBuffer: Float32Array | null = null;
  private stepCount = 0;

  public static isSupported(): boolean {
    if (typeof document === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2', { alpha: false, depth: false });
      if (!gl) return false;
      const ext = gl.getExtension('EXT_color_buffer_float');
      return !!ext;
    } catch {
      return false;
    }
  }

  public async init(
    mesh: RiverGridMesh,
    boundaries: RiverBoundaryConditions,
    structures: RiverHydraulicStructure[],
    turbParams: TurbulenceParameters,
    sedParams: SedimentParameters
  ): Promise<void> {
    this.mesh = mesh;
    this.boundaries = boundaries;
    this.structures = structures;
    this.turbParams = turbParams;
    this.sedParams = sedParams;

    this.hydro = createInitialHydroState(mesh, boundaries, structures);
    this.turb = createInitialTurbulenceState(mesh);
    this.sed = createInitialSedimentState(mesh);

    if (typeof document === 'undefined') {
      throw new Error('WebGL2 is not supported in non-DOM environment');
    }

    try {
      this.canvas = document.createElement('canvas');
      this.canvas.width = mesh.nx;
      this.canvas.height = mesh.ny;
      this.gl = this.canvas.getContext('webgl2', { alpha: false, depth: false });
      if (!this.gl) {
        throw new Error('WebGL2 context creation failed');
      }

      const ext = this.gl.getExtension('EXT_color_buffer_float');
      if (!ext) {
        throw new Error('EXT_color_buffer_float not supported');
      }

      // Query GPU Device name
      const dbg = this.gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        this.gpuName = this.gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'Integrated WebGL2 Accelerator';
      }

      this.initShaders();
      this.initTexturesAndFbos();
      this.isReady = true;
    } catch (err: any) {
      this.isReady = false;
      throw new Error(`WebGL2 solver initialization failed: ${err.message}`);
    }
  }

  private initShaders(): void {
    const gl = this.gl!;

    const createShader = (type: number, src: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compile error: ${info}`);
      }
      return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, VS_QUAD_SOURCE);
    const fs = createShader(gl.FRAGMENT_SHADER, FS_SHALLOW_WATER_SOURCE);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`Program link error: ${info}`);
    }

    this.program = prog;

    // Fullscreen Quad VAO
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);

    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    const aPosLoc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  private initTexturesAndFbos(): void {
    const gl = this.gl!;
    const { nx, ny } = this.mesh!;

    // Initial State Texture Data (h, u, v, wse)
    const stateData = new Float32Array(nx * ny * 4);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const c = i * ny + j;
        const offset = (j * nx + i) * 4;
        stateData[offset + 0] = this.hydro!.depth[c];
        stateData[offset + 1] = this.hydro!.u[c];
        stateData[offset + 2] = this.hydro!.v[c];
        stateData[offset + 3] = this.hydro!.wse[c];
      }
    }

    // Initial Geometry Data (bedElevation, manningN, area, solidMask)
    const solidMaskArr = new Uint8Array(nx * ny);
    for (const s of this.structures) {
      if (s.enabled && s.cellIndices) {
        const isSolid =
          (s as any).solidMasking === true ||
          (s.type === 'obstacle' && (s as any).solidMasking !== false) ||
          (s.type === 'circle' && (s as any).solidMasking !== false) ||
          (s.type === 'bridge-pier' && (s as any).solidMasking !== false) ||
          (s.type === 'spurdike' && (s as any).solidMasking !== false && (s.permeability === undefined || s.permeability < 0.2)) ||
          ((s.type === 'polygon' ||
            s.type === 'rectangle' ||
            s.type === 'line' ||
            s.type === 'polyline' ||
            s.type === 'levee' ||
            s.type === 'custom-deflector' ||
            s.type === 'gate' ||
            s.type === 'weir') &&
            (s as any).solidMasking);
        if (isSolid) {
          for (const idx of s.cellIndices) {
            if (idx >= 0 && idx < nx * ny) solidMaskArr[idx] = 1;
          }
        }
      }
    }

    const geomData = new Float32Array(nx * ny * 4);
    const fn01Data = new Float32Array(nx * ny * 4);
    const fn23Data = new Float32Array(nx * ny * 4);
    const flenData = new Float32Array(nx * ny * 4);

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const c = i * ny + j;
        const cell = this.mesh!.cells[c];
        const offset = (j * nx + i) * 4;

        geomData[offset + 0] = cell.bedElevation;
        geomData[offset + 1] = cell.manningN;
        geomData[offset + 2] = cell.areaM2;
        geomData[offset + 3] = solidMaskArr[c] === 1 ? 1.0 : 0.0;

        // Face Normals 0 and 1
        fn01Data[offset + 0] = cell.faceNormals[0]?.[0] ?? 0.0;
        fn01Data[offset + 1] = cell.faceNormals[0]?.[1] ?? -1.0;
        fn01Data[offset + 2] = cell.faceNormals[1]?.[0] ?? 1.0;
        fn01Data[offset + 3] = cell.faceNormals[1]?.[1] ?? 0.0;

        // Face Normals 2 and 3
        fn23Data[offset + 0] = cell.faceNormals[2]?.[0] ?? 0.0;
        fn23Data[offset + 1] = cell.faceNormals[2]?.[1] ?? 1.0;
        fn23Data[offset + 2] = cell.faceNormals[3]?.[0] ?? -1.0;
        fn23Data[offset + 3] = cell.faceNormals[3]?.[1] ?? 0.0;

        // Face Lengths 0, 1, 2, 3
        flenData[offset + 0] = cell.faceLengths[0] ?? 1.0;
        flenData[offset + 1] = cell.faceLengths[1] ?? 1.0;
        flenData[offset + 2] = cell.faceLengths[2] ?? 1.0;
        flenData[offset + 3] = cell.faceLengths[3] ?? 1.0;
      }
    }

    const createFloatTexture = (data: Float32Array) => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, nx, ny, 0, gl.RGBA, gl.FLOAT, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };

    this.stateTextures[0] = createFloatTexture(stateData);
    this.stateTextures[1] = createFloatTexture(stateData);
    this.geomTexture = createFloatTexture(geomData);
    this.fn01Texture = createFloatTexture(fn01Data);
    this.fn23Texture = createFloatTexture(fn23Data);
    this.flenTexture = createFloatTexture(flenData);

    for (let k = 0; k < 2; k++) {
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.stateTextures[k], 0);
      this.fbos[k] = fbo;
    }

    this.readbackBuffer = new Float32Array(nx * ny * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  public step(dtSec: number): void {
    if (!this.isReady || !this.gl || !this.program || !this.mesh || !this.boundaries || !this.hydro) {
      return;
    }

    const gl = this.gl;
    const { nx, ny } = this.mesh;
    const writeIdx = 1 - this.currentReadIndex;

    gl.useProgram(this.program);
    gl.viewport(0, 0, nx, ny);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[writeIdx]);

    // Bind State texture to unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.stateTextures[this.currentReadIndex]);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_stateTex'), 0);

    // Bind Geom texture to unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.geomTexture);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_geomTex'), 1);

    // Bind Face Normal and Length textures to units 2, 3, 4
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.fn01Texture);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_faceNormals01Tex'), 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.fn23Texture);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_faceNormals23Tex'), 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.flenTexture);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_faceLengthsTex'), 4);

    const qIn = this.boundaries.upstreamDischargeM3s || 0;
    const initH = Math.max(0.01, this.boundaries.initialWaterDepthM || 1.0);
    const estWidth = Math.max(5.0, this.mesh.meanWidthM || 20.0);
    const meanInflowVel = qIn > 0 ? qIn / (estWidth * initH) : 0.0;
    const rainfallRate = (this.boundaries.rainfallMmPerHour || 0) / (3600.0 * 1000.0);

    gl.uniform2i(gl.getUniformLocation(this.program, 'u_gridSize'), nx, ny);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_dt'), dtSec);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_rainfall'), rainfallRate);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_upstreamQ'), qIn);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_upstreamH'), initH);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_meanInflowVel'), meanInflowVel);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_downstreamStage'), this.boundaries.downstreamStageM || 100.0);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_downstreamType'), this.boundaries.downstreamType === 'fixed-stage' ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_estWidth'), estWidth);

    // Draw fullscreen quad
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    // Ping-pong flip
    this.currentReadIndex = writeIdx;
    this.stepCount++;

    this.hydro.timeSec += dtSec;
    this.hydro.stepCount += 1;
  }

  public syncHydroState(): void {
    if (!this.gl || !this.hydro || !this.mesh || !this.readbackBuffer) return;

    const gl = this.gl;
    const { nx, ny } = this.mesh;

    // Readback state from active FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[this.currentReadIndex]);
    gl.readPixels(0, 0, nx, ny, gl.RGBA, gl.FLOAT, this.readbackBuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const depth = this.hydro.depth;
    const u = this.hydro.u;
    const v = this.hydro.v;
    const wse = this.hydro.wse;
    const velMag = this.hydro.velocityMag;
    const froude = this.hydro.froude;
    const shear = this.hydro.shearStress;
    const isWet = this.hydro.isWet;

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const c = i * ny + j;
        const offset = (j * nx + i) * 4;

        const hVal = this.readbackBuffer[offset + 0];
        const uVal = this.readbackBuffer[offset + 1];
        const vVal = this.readbackBuffer[offset + 2];
        const wseVal = this.readbackBuffer[offset + 3];

        depth[c] = hVal;
        u[c] = uVal;
        v[c] = vVal;
        wse[c] = wseVal;

        if (hVal > 0.001) {
          const vm = Math.hypot(uVal, vVal);
          velMag[c] = vm;
          froude[c] = vm / Math.sqrt(9.81 * hVal);
          const cell = this.mesh.cells[c];
          shear[c] = (1000.0 * 9.81 * cell.manningN * cell.manningN * vm * vm) / Math.max(Math.cbrt(hVal), 0.05);
          isWet[c] = 1;
        } else {
          velMag[c] = 0.0;
          froude[c] = 0.0;
          shear[c] = 0.0;
          isWet[c] = 0;
        }
      }
    }

    // Coupled turbulence & sediment model step on newly synced state
    if (this.turbParams && this.turb) {
      stepTurbulenceModel(this.mesh, this.hydro, this.turb, this.turbParams, 0.05);
    }
    if (this.sedParams && this.sed && this.turb) {
      const isMorpho = this.sedParams.enabled && this.stepCount % (this.sedParams.decoupledIntervalSteps || 1) === 0;
      stepSedimentTransport(0.05, this.mesh, this.hydro, this.turb, this.sed, this.sedParams, this.turbParams || ({} as any), isMorpho);
    }
  }

  public async readback(): Promise<void> {
    this.syncHydroState();
  }

  public getState(): {
    hydro: HydrodynamicsState;
    turb: TurbulenceState;
    sed: SedimentState;
  } {
    if (!this.gl || !this.hydro || !this.mesh || !this.readbackBuffer) {
      throw new Error('WebGL2 solver not initialized');
    }

    this.syncHydroState();

    return {
      hydro: this.hydro,
      turb: this.turb!,
      sed: this.sed!,
    };
  }

  public setStructures(structures: RiverHydraulicStructure[]): void {
    this.structures = structures;
  }

  public setBoundaries(boundaries: RiverBoundaryConditions): void {
    this.boundaries = boundaries;
  }

  public setTurbulenceParams(params: TurbulenceParameters): void {
    this.turbParams = params;
  }

  public setSedimentParams(params: SedimentParameters): void {
    this.sedParams = params;
  }

  public getBackendType(): 'webgl2' {
    return 'webgl2';
  }

  public getGpuDeviceName(): string {
    return this.gpuName;
  }

  public isInitialized(): boolean {
    return this.isReady;
  }

  public dispose(): void {
    if (this.gl) {
      if (this.stateTextures[0]) this.gl.deleteTexture(this.stateTextures[0]);
      if (this.stateTextures[1]) this.gl.deleteTexture(this.stateTextures[1]);
      if (this.geomTexture) this.gl.deleteTexture(this.geomTexture);
      if (this.fn01Texture) this.gl.deleteTexture(this.fn01Texture);
      if (this.fn23Texture) this.gl.deleteTexture(this.fn23Texture);
      if (this.flenTexture) this.gl.deleteTexture(this.flenTexture);
      if (this.fbos[0]) this.gl.deleteFramebuffer(this.fbos[0]);
      if (this.fbos[1]) this.gl.deleteFramebuffer(this.fbos[1]);
      if (this.program) this.gl.deleteProgram(this.program);
      if (this.quadVao) this.gl.deleteVertexArray(this.quadVao);
    }
    this.gl = null;
    this.canvas = null;
    this.isReady = false;
  }
}
