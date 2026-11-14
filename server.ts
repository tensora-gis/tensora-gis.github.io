import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import {
  generateHydrologySnapshot,
  SnapshotParams,
  validateSnapshotParams,
} from './src/server/snapshotGenerator';
import { createHydrologyExcelWorkbook } from './src/server/excelGenerator';
import { execSync } from 'child_process';
import { buildOpenFoamCaseBuffer } from './src/river/openfoam/openfoamCaseGenerator';
import { createRhineReach } from './src/river/data/hydroRiversLoader';
import { generateRiverGridMesh } from './src/river/geometry/meshGenerator';
import { createInitialHydroState } from './src/river/gpu/cpuSolver';
import { createInitialTurbulenceState } from './src/river/turbulence/turbulenceModels';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable large JSON bodies for vector polylines & coordinates
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// API: Generate High-Resolution Map Snapshot on Backend
app.post('/api/snapshot', async (req, res) => {
  try {
    // Validate explicitly: a falsy check would reject the legitimate 0,0
    // coordinate, and no check at all would let incoherent geometry through.
    if (!validateSnapshotParams(req.body)) {
      return res.status(400).json({
        error:
          'Invalid snapshot request: latitudeDD/longitudeDD must be finite coordinates, ' +
          'catchmentPolygon/streamCoordinates must be arrays of finite [lat, lng] vertices, ' +
          'and all vertices must lie within 25 km of the target coordinate.',
      });
    }

    const result = await generateHydrologySnapshot(req.body);
    return res.json({
      success: true,
      imageDataUrl: result.dataUrl,
      width: result.width,
      height: result.height,
    });
  } catch (err: any) {
    console.error('Error in /api/snapshot:', err);
    return res.status(500).json({ error: err.message || 'Snapshot generation failed' });
  }
});

// API: Direct Excel Report Export with Backend Snapshot Embedded
app.post('/api/export-excel', async (req, res) => {
  try {
    if (!validateSnapshotParams(req.body)) {
      return res.status(400).json({ error: 'Invalid report request: missing or malformed coordinates.' });
    }

    const params = req.body as SnapshotParams & { designStandard?: 'INDIAN_DPR' | 'INTERNATIONAL' };
    const std = params.designStandard || 'INDIAN_DPR';
    let snapshotBuffer: Buffer | undefined;
    if (params.snapshotBase64 && typeof params.snapshotBase64 === 'string') {
      try {
        snapshotBuffer = Buffer.from(params.snapshotBase64, 'base64');
      } catch (e) {
        console.warn('Could not decode snapshotBase64, using server-rendered snapshot:', e);
      }
    }
    const buffer = await createHydrologyExcelWorkbook(params, snapshotBuffer, { designStandard: std });
    const cleanCh =
      String(params.targetChainageFormatted ?? params.targetChainage ?? 'MAP_POINT').replace(
        /[^0-9.+a-zA-Z_-]/g,
        '_'
      ) || 'MAP_POINT';
    const prefix = std === 'INTERNATIONAL' ? 'Cross_Drainage_Report_FHWA_CH_' : 'Cross_Drainage_DPR_IRC_CH_';
    const filename = `${prefix}${cleanCh}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error('Error in /api/export-excel:', err);
    return res.status(500).json({ error: err.message || 'Excel export failed' });
  }
});

// API: OpenFOAM Engine Status & Environment Discovery
app.get('/api/openfoam/status', (_req, res) => {
  let openFoamInstalled = false;
  let version = 'not_detected';
  let binaryPath = '';
  try {
    binaryPath = execSync('which blockMesh || which interFoam || which simpleFoam', { stdio: 'pipe' })
      .toString()
      .trim();
    if (binaryPath) {
      openFoamInstalled = true;
      version = process.env.WM_PROJECT_VERSION || 'v2312';
    }
  } catch {
    // OpenFOAM CLI binary not on host PATH
  }

  res.json({
    available: openFoamInstalled,
    version,
    binaryPath: binaryPath || null,
    solver: 'interFoam',
    runtime: openFoamInstalled ? 'host-native' : 'portable-archive-generator',
    supportedSolvers: ['interFoam', 'simpleFoam', 'pimpleFoam', 'twoPhaseEulerFoam'],
    supportedMeshing: ['blockMesh', 'snappyHexMesh'],
  });
});

// API: Generate & Export Complete OpenFOAM 3D CFD Case Archive (.zip)
app.post('/api/openfoam/case', async (req, res) => {
  try {
    const reach = req.body.reach || createRhineReach();
    const mesh = req.body.mesh || generateRiverGridMesh(reach);
    const structures = req.body.structures || [];
    const boundaries = req.body.boundaries || {
      upstreamType: 'constant-discharge',
      upstreamDischargeM3s: req.body.upstreamDischargeM3s || 250.0,
      downstreamType: 'normal-depth',
      downstreamSlope: 0.001,
      downstreamStageM: req.body.downstreamStageM || 102.0,
      rainfallMmPerHour: 0.0,
      initialWaterDepthM: 2.5,
      manningRoughnessDefault: req.body.manningN || 0.03,
    };
    const hydro = req.body.hydro || createInitialHydroState(mesh, boundaries, structures);
    const turb = req.body.turb || createInitialTurbulenceState(mesh);

    const buffer = await buildOpenFoamCaseBuffer({
      reach,
      mesh,
      hydro,
      turb,
      structures,
      upstreamDischargeM3s: req.body.upstreamDischargeM3s || 250.0,
      downstreamStageM: req.body.downstreamStageM || boundaries.downstreamStageM || 102.0,
      manningN: req.body.manningN || boundaries.manningRoughnessDefault || 0.03,
      simEndTimeSec: req.body.simEndTimeSec || req.body.endTime || 30.0,
    });

    const filename = `OpenFOAM_Case_${String(reach.id || 'reach').replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error('Error in /api/openfoam/case:', err);
    return res.status(500).json({ error: err.message || 'OpenFOAM case generation failed' });
  }
});

// Setup Vite or Static File Serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tensora GIS Server active at http://0.0.0.0:${PORT}`);
  });
}

startServer();
