import React from 'react';
import { Network, Activity, Layers, Droplets } from 'lucide-react';

export const WaterDistributionModelling: React.FC = () => {
  return (
    <div className="flex-1 h-full flex flex-col bg-[#0a0a0a] text-[#e5e7eb] overflow-hidden select-none">
      {/* Module Top Bar */}
      <div className="h-11 px-4 md:px-6 border-b border-[#222] bg-[#111]/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-[#171717] border border-[#222] flex items-center justify-center text-amber-500">
            <Network className="w-3 h-3 stroke-[2]" />
          </div>
          <span className="text-xs font-bold text-white font-tech uppercase tracking-wider">
            Water Distribution Modelling
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#171717] border border-[#222] text-amber-400">
            Empty for now
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-xs text-[#737373] font-mono">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-[#525252]" />
            <span>Hydraulic Engine: Standby</span>
          </span>
          <span className="text-[#333]">/</span>
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#525252]" />
            <span>Networks: 0 loaded</span>
          </span>
        </div>
      </div>

      {/* Main Workspace Area: Empty Canvas */}
      <div className="flex-1 relative flex items-center justify-center p-6 bg-[#0a0a0a] overflow-auto">
        {/* Subtle engineering grid background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-25"
          style={{
            backgroundImage: `radial-gradient(#262626 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* Empty State Presentation Card */}
        <div className="relative z-10 max-w-md w-full bg-[#111]/80 backdrop-blur border border-[#222] rounded-xl p-8 text-center shadow-2xl flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-[#171717] border border-[#262626] flex items-center justify-center text-amber-400 mb-4 shadow-inner">
            <Network className="w-8 h-8 stroke-[1.75]" />
          </div>

          <h2 className="text-lg font-bold text-white font-tech mb-1">
            Water Distribution Modelling
          </h2>
          <p className="text-xs font-mono text-amber-500/90 mb-4">
            Workspace is empty for now
          </p>

          <p className="text-xs text-[#888] leading-relaxed mb-6 font-sans">
            This module is reserved for water distribution network analysis, pipe network delineation, junction node pressure modeling, and EPANET hydraulic simulations.
          </p>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#171717] border border-[#222] text-[11px] font-mono text-[#a3a3a3]">
            <Droplets className="w-3.5 h-3.5 text-amber-500" />
            <span>Ready for distribution network design</span>
          </div>
        </div>
      </div>
    </div>
  );
};
