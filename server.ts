import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import {
  generateHydrologySnapshot,
  SnapshotParams,
  validateSnapshotParams,
} from './src/server/snapshotGenerator';
import { createHydrologyExcelWorkbook } from './src/server/excelGenerator';

const app = express();
const PORT = 3000;

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

    const params = req.body as SnapshotParams;
    const buffer = await createHydrologyExcelWorkbook(params);
    const cleanCh =
      String(params.targetChainageFormatted ?? params.targetChainage ?? 'MAP_POINT').replace(
        /[^0-9.+a-zA-Z_-]/g,
        '_'
      ) || 'MAP_POINT';
    const filename = `Hydrology_Report_CH_${cleanCh}.xlsx`;

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
