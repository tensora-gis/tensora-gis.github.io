/**
 * Confidence Badge & Accuracy Tier Display Component
 *
 * Implements Section 0 of the Global River Digital Twin Specification:
 * - Estimated (Global): SWOT-River-Volume + empirical hydraulic geometry (h ∝ Q^0.4)
 * - Calibrated (SWOT): SWOT-calibrated against RiverSP WSE & slope
 * - Surveyed (Validated): High-fidelity surveyed cross-sections or bathymetric soundings
 *
 * Enforces License Guardrails:
 * - Highlights CC BY-NC 4.0 non-commercial modeled discharge (GRADES-hydroDL)
 * - Transparent attribution to NASA SWOT, HydroSHEDS, and Copernicus GLO-30 DEM
 */

import React, { useState } from 'react';
import { AccuracyTier, LicenseMetadata } from '../types/riverReach';

interface ConfidenceBadgeProps {
  tier?: AccuracyTier;
  licenseMetadata?: LicenseMetadata;
  className?: string;
  compact?: boolean;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({
  tier = 'Estimated (Global)',
  licenseMetadata,
  className = '',
  compact = false,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const getTierStyles = (t: AccuracyTier) => {
    switch (t) {
      case 'Surveyed (Validated)':
        return {
          bg: 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300',
          dot: 'bg-emerald-400',
          icon: '📐',
          label: 'Surveyed (Validated)',
          description: 'Survey-grade bathymetric sounding or user-measured cross-sections.',
        };
      case 'Calibrated (SWOT)':
        return {
          bg: 'bg-cyan-950/80 border-cyan-500/80 text-cyan-300',
          dot: 'bg-cyan-400',
          icon: '🛰️',
          label: 'Calibrated (SWOT)',
          description: 'Calibrated against NASA SWOT satellite radar altimetry (RiverSP WSE & slope).',
        };
      case 'Estimated (SWOT)':
        return {
          bg: 'bg-blue-950/80 border-blue-500/80 text-blue-300',
          dot: 'bg-blue-400',
          icon: '📡',
          label: 'Estimated (SWOT)',
          description: 'SWOT-River-Volume bathymetry overlay (~240k reaches) with prior cross-section geometry.',
        };
      case 'Estimated (Global)':
      default:
        return {
          bg: 'bg-amber-950/80 border-amber-500/80 text-amber-300',
          dot: 'bg-amber-400',
          icon: '🌍',
          label: 'Estimated (Global)',
          description: 'Empirical hydraulic geometry (HydroRIVERS topology + GRWL width + h ∝ Q^0.4).',
        };
    }
  };

  const currentTier = getTierStyles(tier);

  return (
    <div className={`relative inline-block ${className}`}>
      <div
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold cursor-pointer transition select-none shadow-sm ${currentTier.bg}`}
      >
        <span className={`w-2 h-2 rounded-full ${currentTier.dot} animate-pulse`} />
        <span>{currentTier.icon}</span>
        <span>{compact ? tier.split(' ')[0] : currentTier.label}</span>

        {licenseMetadata?.nonCommercial && (
          <span
            className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 uppercase tracking-tighter"
            title="Non-commercial modeled discharge (GRADES-hydroDL)"
          >
            NC
          </span>
        )}
      </div>

      {/* Hover / Click Tooltip Modal */}
      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-2 w-72 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl text-xs text-slate-200 z-[9999] animate-fade-in pointer-events-none">
          <div className="font-bold text-slate-100 flex items-center justify-between pb-1 border-b border-slate-800 mb-1.5">
            <span>Accuracy Tier: {currentTier.label}</span>
            <span>{currentTier.icon}</span>
          </div>

          <p className="text-[11px] text-slate-300 leading-relaxed mb-2">
            {currentTier.description}
          </p>

          <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 text-[10px] space-y-1">
            <div>
              <span className="text-slate-400">Data Sources: </span>
              <span className="text-slate-200">
                {licenseMetadata?.source || 'SWORD / SWOT-River-Volume / Copernicus GLO-30 DEM'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">License: </span>
              <span className="text-cyan-300">
                {licenseMetadata?.license || 'CC BY-NC 4.0 (Modeled Q) / CC BY 4.0'}
              </span>
            </div>
            {licenseMetadata?.nonCommercial && (
              <div className="text-amber-400 font-medium">
                ⚠️ Non-Commercial Research & Educational Use Only
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
