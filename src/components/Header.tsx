import React from 'react';
import { Compass, LogOut, Trash2, FileSpreadsheet, Menu, CloudRain, Network, Waves } from 'lucide-react';
import { AppUser } from '../auth/useGoogleAuth';
import { ActiveModuleTab } from '../types/navigation';

interface HeaderProps {
  onClearData: () => void;
  activeChainage: string;
  totalChainages: number;
  corridorName: string;
  onOpenRegister: () => void;
  hasData: boolean;
  /** Signed-in user, rendered in the toolbar with a sign-out action. */
  user?: AppUser | null;
  onSignOut?: () => void;
  /** Active module tab */
  activeTab: ActiveModuleTab;
  onSelectTab: (tab: ActiveModuleTab) => void;
  /** Toggle the left corner menu */
  onToggleMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onClearData,
  activeChainage,
  totalChainages,
  corridorName,
  onOpenRegister,
  hasData,
  user,
  onSignOut,
  activeTab,
  onSelectTab,
  onToggleMenu,
}) => {
  const userName = user ? user.name : '';
  const userAvatar = user?.picture;

  return (
    <header className="h-14 bg-[#0a0a0a] border-b border-[#222] px-3 md:px-5 flex items-center justify-between shrink-0 z-30 select-none">
      {/* Zone 1: Menu Toggle & Brand Wordmark + Left Navigation Tabs */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Menu button on the left corner */}
        <button
          onClick={onToggleMenu}
          className="p-1.5 rounded-lg bg-[#111] hover:bg-[#1a1a1a] border border-[#222] text-[#888] hover:text-white transition-colors cursor-pointer"
          title="Toggle Left Menu"
          aria-label="Toggle Left Menu"
        >
          <Menu className="w-4 h-4 text-amber-500" />
        </button>

        {/* Brand Wordmark */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#171717] border border-[#222] flex items-center justify-center text-amber-500">
            <Compass className="w-4 h-4 stroke-[2]" />
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="text-sm font-bold tracking-tight text-white whitespace-nowrap font-tech">
              Tensora <span className="text-amber-500 text-xs font-mono font-medium">GIS</span>
            </span>
            <span className="text-[10px] text-[#737373] font-mono truncate max-w-[140px] md:max-w-xs">
              {activeTab === 'stormwater' && hasData ? corridorName : 'Hydrological & Hydraulic Simulation'}
            </span>
          </div>
        </div>

        {/* Tabs on the left corner */}
        <nav
          className="flex items-center gap-1 p-0.5 bg-[#111] border border-[#222] rounded-lg ml-1 md:ml-2"
          aria-label="Engineering Modules Navigation"
        >
          <button
            onClick={() => onSelectTab('stormwater')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'stormwater'
                ? 'bg-[#1e1e1e] text-white border border-amber-500/40 shadow-xs font-semibold'
                : 'text-[#737373] hover:text-[#d1d5db] hover:bg-[#161616]'
            }`}
            title="Stormwater modelling"
          >
            <CloudRain
              className={`w-3.5 h-3.5 ${
                activeTab === 'stormwater' ? 'text-amber-400' : 'text-[#737373]'
              }`}
            />
            <span className="font-tech text-[11px] sm:text-xs">Stormwater modelling</span>
          </button>

          <button
            onClick={() => onSelectTab('water-distribution')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'water-distribution'
                ? 'bg-[#1e1e1e] text-white border border-amber-500/40 shadow-xs font-semibold'
                : 'text-[#737373] hover:text-[#d1d5db] hover:bg-[#161616]'
            }`}
            title="Water Distribution Modelling"
          >
            <Network
              className={`w-3.5 h-3.5 ${
                activeTab === 'water-distribution' ? 'text-amber-400' : 'text-[#737373]'
              }`}
            />
            <span className="font-tech text-[11px] sm:text-xs">Water Distribution Modelling</span>
          </button>

          <button
            onClick={() => onSelectTab('wastewater')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'wastewater'
                ? 'bg-[#1e1e1e] text-white border border-amber-500/40 shadow-xs font-semibold'
                : 'text-[#737373] hover:text-[#d1d5db] hover:bg-[#161616]'
            }`}
            title="Wastewater Modelling"
          >
            <Waves
              className={`w-3.5 h-3.5 ${
                activeTab === 'wastewater' ? 'text-amber-400' : 'text-[#737373]'
              }`}
            />
            <span className="font-tech text-[11px] sm:text-xs">Wastewater Modelling</span>
          </button>
        </nav>
      </div>

      {/* Zone 2: Informational Status */}
      {activeTab === 'stormwater' && hasData && (
        <div className="hidden xl:flex items-center gap-5 text-xs text-[#737373] font-mono-numbers">
          <div className="flex items-center gap-1.5 text-[#e5e7eb]">
            <span className="text-[#737373]">Target CH:</span>
            <span className="font-semibold text-white px-1.5 py-0.5 bg-[#111] border border-[#222] rounded text-amber-400">
              {activeChainage}
            </span>
          </div>
          <div className="text-[#4b5563]">/</div>
          <div className="flex items-center gap-1.5 text-[#737373]">
            <span className="text-[#737373]">Stations:</span>
            <span className="text-[#e5e7eb]">{totalChainages} points</span>
          </div>
          <div className="text-[#4b5563]">/</div>
          <div className="flex items-center gap-1.5 text-[#737373]">
            <span className="text-[#737373]">Elevation:</span>
            <span className="text-[#10b981]">Google Earth SRTM 30m</span>
          </div>
        </div>
      )}

      {activeTab === 'water-distribution' && (
        <div className="hidden xl:flex items-center gap-2 text-xs text-[#737373] font-mono">
          <span>Hazen-Williams (SI)</span>
          <span className="text-[#333]">/</span>
          <span className="text-[#10b981]">Terrain-Referenced DEM</span>
        </div>
      )}

      {activeTab === 'wastewater' && (
        <div className="hidden xl:flex items-center gap-2 text-xs text-[#737373] font-mono">
          <span>Manning Gravity Flow (SI)</span>
          <span className="text-[#333]">/</span>
          <span className="text-[#10b981]">Terrain-Referenced DEM</span>
        </div>
      )}

      {/* Zone 3: Primary Action & Tools */}
      <div className="flex items-center gap-2">
        {/* Signed-in account chip */}
        {user && (
          <>
            <div
              className="hidden sm:flex items-center gap-2 pl-1 pr-2 py-0.5 bg-[#111] border border-[#222] rounded-full"
              title={user ? user.email : 'Signed in'}
            >
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-5 h-5 rounded-full"
                />
              ) : (
                <span className="w-5 h-5 rounded-full bg-[#1e1e1e] border border-[#2a2a2a] flex items-center justify-center text-[9px] font-semibold text-amber-400">
                  {userName.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="max-w-[120px] truncate text-[11px] text-[#a3a3a3]">
                {userName}
              </span>
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-[#737373] hover:text-white bg-[#111] hover:bg-[#171717] border border-[#222] rounded transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Sign out</span>
              </button>
            )}
          </>
        )}

        {/* Stormwater-specific action buttons */}
        {activeTab === 'stormwater' && hasData && (
          <>
            <button
              onClick={onOpenRegister}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#e5e7eb] bg-[#111] hover:bg-[#171717] border border-[#222] rounded transition-colors whitespace-nowrap"
              title="View Latitude & Longitude for every chainage in the uploaded file"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden lg:inline">Chainage Register</span>
            </button>

            <button
              onClick={onClearData}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#737373] hover:text-[#ef4444] bg-[#111] hover:bg-[#ef4444]/10 border border-[#222] rounded transition-colors whitespace-nowrap"
              title="Clear loaded corridor"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
};
