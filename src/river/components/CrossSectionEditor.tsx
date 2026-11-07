/**
 * Transverse Cross-Section Viewer & Geometry Editor
 */

import React, { useState } from 'react';
import { CrossSectionStation, CrossSectionTemplateType } from '../types/riverReach';
import { generateCrossSectionPoints } from '../geometry/empiricalSection';

interface CrossSectionEditorProps {
  isOpen: boolean;
  onClose: () => void;
  crossSections: CrossSectionStation[];
  onUpdateSections: (sections: CrossSectionStation[]) => void;
  currentSimWaterDepthM?: number;
}

export const CrossSectionEditor: React.FC<CrossSectionEditorProps> = ({
  isOpen,
  onClose,
  crossSections,
  onUpdateSections,
  currentSimWaterDepthM = 1.5,
}) => {
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (!isOpen || crossSections.length === 0) return null;

  const currentStation = crossSections[selectedIdx] || crossSections[0];
  const template = currentStation.template;

  const handleTemplateChange = (key: string, val: any) => {
    const updatedTemplate = { ...template, [key]: val };
    const updatedPoints = generateCrossSectionPoints(updatedTemplate, currentStation.invertElevM);

    const updatedSections = [...crossSections];
    updatedSections[selectedIdx] = {
      ...currentStation,
      template: updatedTemplate,
      points: updatedPoints,
      leftBankElevM: currentStation.invertElevM + updatedTemplate.depthM,
      rightBankElevM: currentStation.invertElevM + updatedTemplate.depthM,
    };
    onUpdateSections(updatedSections);
  };

  // Build SVG path coordinates
  const pts = currentStation.points;
  let minX = -20,
    maxX = 20,
    minZ = currentStation.invertElevM - 0.5,
    maxZ = currentStation.invertElevM + template.depthM + 1.0;

  if (pts.length > 0) {
    minX = Math.min(...pts.map((p) => p.xM)) - 2;
    maxX = Math.max(...pts.map((p) => p.xM)) + 2;
    minZ = Math.min(...pts.map((p) => p.zM)) - 0.5;
    maxZ = Math.max(...pts.map((p) => p.zM)) + 1.0;
  }

  const svgWidth = 460;
  const svgHeight = 200;
  const pad = 25;

  const scaleX = (x: number) => pad + ((x - minX) / Math.max(1, maxX - minX)) * (svgWidth - 2 * pad);
  const scaleZ = (z: number) =>
    svgHeight - pad - ((z - minZ) / Math.max(0.5, maxZ - minZ)) * (svgHeight - 2 * pad);

  const polylineStr = pts.map((p) => `${scaleX(p.xM)},${scaleZ(p.zM)}`).join(' ');
  const waterZ = currentStation.invertElevM + currentSimWaterDepthM;
  const waterSvgY = scaleZ(waterZ);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-5 shadow-2xl text-slate-100 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
            <h3 className="text-base font-semibold">River Cross-Section Geometry Editor</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            ✕
          </button>
        </div>

        {/* Station Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs border-b border-slate-800">
          {crossSections.map((cs, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedIdx(idx)}
              className={`px-3 py-1.5 rounded font-medium transition whitespace-nowrap ${
                selectedIdx === idx
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Station {cs.stationM.toFixed(0)} m (Elev: {cs.invertElevM.toFixed(1)}m)
            </button>
          ))}
        </div>

        {/* SVG Visualization */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-2 flex flex-col items-center">
          <div className="text-[11px] text-slate-400 w-full flex justify-between px-2 pb-1">
            <span>Transverse Profile & Water Level</span>
            <span className="text-cyan-400">Simulated Depth: {currentSimWaterDepthM.toFixed(2)} m</span>
          </div>

          <svg width={svgWidth} height={svgHeight} className="overflow-visible">
            {/* Grid line at invert */}
            <line
              x1={pad}
              y1={scaleZ(currentStation.invertElevM)}
              x2={svgWidth - pad}
              y2={scaleZ(currentStation.invertElevM)}
              stroke="#334155"
              strokeDasharray="3 3"
            />
            {/* Water Surface Line */}
            {waterZ > currentStation.invertElevM && (
              <line
                x1={scaleX(minX + 2)}
                y1={waterSvgY}
                x2={scaleX(maxX - 2)}
                y2={waterSvgY}
                stroke="#06b6d4"
                strokeWidth="2"
                strokeDasharray="4 2"
              />
            )}
            {/* Channel Bed Polyline */}
            <polyline
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="2.5"
              strokeLinejoin="round"
              points={polylineStr}
            />
            {/* Point Markers */}
            {pts.map((p, pIdx) => (
              <circle
                key={pIdx}
                cx={scaleX(p.xM)}
                cy={scaleZ(p.zM)}
                r="3.5"
                fill="#38bdf8"
                stroke="#0f172a"
                strokeWidth="1.5"
              />
            ))}
          </svg>
        </div>

        {/* Geometry Controls */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Template Shape</label>
            <select
              value={template.type}
              onChange={(e) => handleTemplateChange('type', e.target.value as CrossSectionTemplateType)}
              className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            >
              <option value="trapezoidal">Trapezoidal</option>
              <option value="rectangular">Rectangular</option>
              <option value="compound">Compound / Floodplain</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Bottom Width (m)</label>
            <input
              type="number"
              step="0.5"
              value={template.bottomWidthM}
              onChange={(e) => handleTemplateChange('bottomWidthM', parseFloat(e.target.value) || 10)}
              className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Bank Slope (H:1V)</label>
            <input
              type="number"
              step="0.1"
              value={template.bankSlopeHtoV}
              onChange={(e) => handleTemplateChange('bankSlopeHtoV', parseFloat(e.target.value) || 1.5)}
              className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Channel Depth (m)</label>
            <input
              type="number"
              step="0.1"
              value={template.depthM}
              onChange={(e) => handleTemplateChange('depthM', parseFloat(e.target.value) || 2.0)}
              className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Left Floodplain (m)</label>
            <input
              type="number"
              step="1"
              value={template.leftFloodplainWidthM || 0}
              onChange={(e) => handleTemplateChange('leftFloodplainWidthM', parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Right Floodplain (m)</label>
            <input
              type="number"
              step="1"
              value={template.rightFloodplainWidthM || 0}
              onChange={(e) => handleTemplateChange('rightFloodplainWidthM', parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold transition"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
