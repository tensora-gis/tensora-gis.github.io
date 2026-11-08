/**
 * High-Resolution LiDAR Terrain Ingestion & Hydro-Enforced Bathymetry Studio
 *
 * Professional field engineering interface for:
 * 1. Global High-Resolution LiDAR sampling (USGS 3DEP 1m/3m & Copernicus GLO-30)
 * 2. Field survey point cloud import (.xyz, .csv, .txt, LandXML)
 * 3. Spatial Inverse Distance Weighting (IDW) interpolation
 * 4. Hydro-enforced channel bathymetric carving below the LiDAR water surface
 * 5. Automatic Manning roughness zoning for channel and overbank floodplains
 */

import React, { useState } from 'react';
import { RiverGridMesh } from '../types/riverReach';
import {
  sampleLidarTerrainForMesh,
  parseLidarSurveyPoints,
  interpolateLidarOntoMesh,
} from '../geometry/lidarService';

interface LidarTerrainStudioProps {
  isOpen: boolean;
  onClose: () => void;
  mesh: RiverGridMesh;
  onApplyLidarMesh: (updatedMesh: RiverGridMesh, notice: string) => Promise<void> | void;
}

export const LidarTerrainStudio: React.FC<LidarTerrainStudioProps> = ({
  isOpen,
  onClose,
  mesh,
  onApplyLidarMesh,
}) => {
  const [activeTab, setActiveTab] = useState<'global' | 'upload'>('global');

  // Global LiDAR parameters
  const defaultCarve = Math.max(1.2, Math.min(6.5, mesh.meanWidthM * 0.035));
  const [carveDepthM, setCarveDepthM] = useState<number>(parseFloat(defaultCarve.toFixed(2)));
  const [channelWidthRatio, setChannelWidthRatio] = useState<number>(0.6);
  const [channelManningN, setChannelManningN] = useState<number>(0.030);
  const [floodplainManningN, setFloodplainManningN] = useState<number>(0.065);

  // File Upload state
  const [surveyRawText, setSurveyRawText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  if (!isOpen) return null;

  // Handle Global LiDAR & Copernicus 30m sampling
  const handleSampleGlobalLidar = async () => {
    setIsProcessing(true);
    setStatusMessage({ text: 'Sampling USGS 3DEP LiDAR & Copernicus GLO-30 tiles...' });

    try {
      const updatedMesh = await sampleLidarTerrainForMesh(mesh, {
        carveDepthM,
        channelWidthRatio,
        channelManningN,
        floodplainManningN,
      });

      const coverage = updatedMesh.lidarMetadata?.coveragePct ?? 100;
      const src = updatedMesh.lidarMetadata?.source ?? 'LiDAR DEM';
      const msg = `LiDAR terrain successfully woven (${coverage}% coverage via ${src})!`;

      await onApplyLidarMesh({ ...updatedMesh }, msg);
      setStatusMessage({ text: msg });
      setTimeout(() => {
        setIsProcessing(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setIsProcessing(false);
      setStatusMessage({ text: `LiDAR sampling error: ${err.message}`, isError: true });
    }
  };

  // Handle file selection
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        setSurveyRawText(content);
        setStatusMessage({ text: `Loaded ${file.name} (${(content.length / 1024).toFixed(1)} KB)` });
      }
    };
    reader.readAsText(file);
  };

  // Handle parsing and interpolation of survey points
  const handleApplySurveyLidar = async () => {
    if (!surveyRawText.trim()) {
      setStatusMessage({ text: 'Please upload or paste a LiDAR point cloud file first.', isError: true });
      return;
    }

    setIsProcessing(true);
    setStatusMessage({ text: 'Parsing coordinates & interpolating 8-point IDW surface...' });

    try {
      const origin = mesh.centerline[0] ? { lat: mesh.centerline[0].lat, lng: mesh.centerline[0].lng } : undefined;
      const parsedPoints = parseLidarSurveyPoints(surveyRawText, origin);

      if (parsedPoints.length === 0) {
        throw new Error('No valid [Lat, Lng, Elev] or [X, Y, Z] points detected in text.');
      }

      const result = interpolateLidarOntoMesh(mesh, parsedPoints, {
        carveDepthM,
        channelWidthRatio,
        channelManningN,
        floodplainManningN,
      });

      const msg = `Surveyed LiDAR integrated: ${result.pointCount.toLocaleString()} points interpolated across ${result.coveragePct.toFixed(1)}% of grid!`;
      await onApplyLidarMesh({ ...result.mesh }, msg);
      setStatusMessage({ text: msg });
      setTimeout(() => {
        setIsProcessing(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setIsProcessing(false);
      setStatusMessage({ text: `Survey LiDAR error: ${err.message}`, isError: true });
    }
  };

  const meta = mesh.lidarMetadata;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl text-slate-100 flex flex-col gap-4 max-h-[90vh] overflow-y-auto animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl text-lg">🛰️</span>
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>LiDAR Terrain & Bathymetry Studio</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-900/60 border border-cyan-700/60 text-cyan-300">
                  Sub-Meter Precision
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Integrate real airborne/drone LiDAR ground surveys & Copernicus DEM with hydro-enforced bathymetry
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition p-1">
            ✕
          </button>
        </div>

        {/* Existing LiDAR Status Card if applied */}
        {meta && (
          <div className="bg-cyan-950/40 border border-cyan-800/60 rounded-xl p-3 text-xs space-y-1.5 text-cyan-200">
            <div className="flex items-center justify-between font-semibold">
              <span>Active Terrain Source:</span>
              <span className="text-cyan-300 font-mono">{meta.source}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400 pt-1">
              <div>
                Coverage: <span className="font-mono text-cyan-300 font-semibold">{meta.coveragePct}%</span>
              </div>
              <div>
                Datum: <span className="font-mono text-slate-300">{meta.verticalDatum.split(' ')[0]}</span>
              </div>
              <div>
                Elev Range:{' '}
                <span className="font-mono text-emerald-400 font-semibold">
                  {meta.minElevationM !== undefined && meta.maxElevationM !== undefined
                    ? `${meta.minElevationM}m .. ${meta.maxElevationM}m`
                    : 'Surveyed'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab Selection */}
        <div className="flex items-center border-b border-slate-800 gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('global')}
            className={`pb-2 border-b-2 transition ${
              activeTab === 'global'
                ? 'border-cyan-400 text-cyan-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🛰️ Global LiDAR & Copernicus 30m
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-2 border-b-2 transition ${
              activeTab === 'upload'
                ? 'border-cyan-400 text-cyan-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📂 Import Survey Point Cloud (.xyz / .csv)
          </button>
        </div>

        {/* Tab 1: Global LiDAR Query */}
        {activeTab === 'global' && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-2 text-slate-300">
              <p className="leading-relaxed">
                Samples real airborne & satellite digital elevation models directly covering this reach:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400 text-[11px]">
                <li><strong className="text-slate-200">USGS 3DEP LiDAR (1m & 3m)</strong>: High-resolution seamless ground returns for US rivers and canals.</li>
                <li><strong className="text-slate-200">Mapzen / AWS Terrarium Tiles</strong>: Zoom 15 sub-meter vertical raster tiles.</li>
                <li><strong className="text-slate-200">Copernicus GLO-30</strong>: European Space Agency 30m global radar surface model.</li>
              </ul>
            </div>

            {/* Hydrodynamic Carving Parameters */}
            <div className="grid grid-cols-2 gap-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  Channel Carve Depth (m):
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.2"
                  max="15.0"
                  value={carveDepthM}
                  onChange={(e) => setCarveDepthM(parseFloat(e.target.value) || 1.5)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500">
                  Depression carved below LiDAR water surface for the submerged bed.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  Active Channel Ratio:
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0.2"
                  max="0.95"
                  value={channelWidthRatio}
                  onChange={(e) => setChannelWidthRatio(parseFloat(e.target.value) || 0.6)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500">
                  Fraction of lateral grid width treated as submerged channel (0.60 = 60%).
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  Channel Manning Roughness n:
                </label>
                <input
                  type="number"
                  step="0.002"
                  min="0.012"
                  max="0.060"
                  value={channelManningN}
                  onChange={(e) => setChannelManningN(parseFloat(e.target.value) || 0.030)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500">Main channel gravel/sand bed roughness.</p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  Floodplain Manning Roughness n:
                </label>
                <input
                  type="number"
                  step="0.005"
                  min="0.030"
                  max="0.150"
                  value={floodplainManningN}
                  onChange={(e) => setFloodplainManningN(parseFloat(e.target.value) || 0.065)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500">Vegetated overbank & floodplain terrace roughness.</p>
              </div>
            </div>

            <button
              onClick={handleSampleGlobalLidar}
              disabled={isProcessing}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-xl transition text-xs shadow-lg flex items-center justify-center gap-2"
            >
              {isProcessing ? 'Sampling LiDAR & Weaving Bathymetry...' : '🛰️ Sample LiDAR & Weave Bathymetry'}
            </button>
          </div>
        )}

        {/* Tab 2: User Survey Point Cloud Upload */}
        {activeTab === 'upload' && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-1.5 text-slate-300">
              <p className="font-semibold text-cyan-300">Field Survey & Drone LiDAR Point Cloud Import</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Accepts ASCII point clouds containing coordinates and elevations. Format can be comma, tab, or space delimited:
              </p>
              <div className="font-mono text-[10px] bg-slate-900 p-2 rounded border border-slate-800 text-slate-300">
                47.5612, 7.5910, 102.45<br />
                47.5618, 7.5922, 101.88<br />
                47.5625, 7.5935, 101.30
              </div>
            </div>

            {/* File Upload Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-300 block">
                Select LiDAR / Survey File:
              </label>
              <input
                type="file"
                accept=".xyz,.csv,.txt,.pts"
                onChange={handleFileUpload}
                className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-cyan-300 hover:file:bg-slate-700 cursor-pointer"
              />
              {fileName && <span className="text-[10px] text-cyan-400 font-mono">Active File: {fileName}</span>}
            </div>

            {/* Raw Text Fallback / Paste Area */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">
                Or Paste Survey Coordinates:
              </label>
              <textarea
                rows={4}
                value={surveyRawText}
                onChange={(e) => setSurveyRawText(e.target.value)}
                placeholder="Paste [Lat, Lng, Elev] or [X, Y, Z] rows here..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono text-[11px] focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <button
              onClick={handleApplySurveyLidar}
              disabled={isProcessing || !surveyRawText.trim()}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-xl transition text-xs shadow-lg flex items-center justify-center gap-2"
            >
              {isProcessing ? 'Interpolating Survey Points...' : '📐 Apply Surveyed LiDAR to Grid'}
            </button>
          </div>
        )}

        {/* Feedback / Status */}
        {statusMessage && (
          <div
            className={`p-2.5 rounded-xl text-xs font-medium border animate-fade-in ${
              statusMessage.isError
                ? 'bg-rose-950/60 border-rose-800 text-rose-200'
                : 'bg-cyan-950/60 border-cyan-800 text-cyan-200'
            }`}
          >
            {statusMessage.text}
          </div>
        )}
      </div>
    </div>
  );
};
