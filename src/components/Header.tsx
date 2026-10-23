import React from 'react';
import { Compass, LogOut, Trash2, FileSpreadsheet } from 'lucide-react';
import { AppUser } from '../auth/useGoogleAuth';

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
}) => {
  const userName = user && !('guest' in user) ? user.name : 'Guest';
  const userAvatar =
    user && !('guest' in user) && user.picture ? user.picture : undefined;
  return (
    <header className="h-14 bg-[#0a0a0a] border-b border-[#222] px-4 md:px-6 flex items-center justify-between shrink-0 z-30 select-none">
      {/* Zone 1: Brand Wordmark */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-[#171717] border border-[#222] flex items-center justify-center text-amber-500">
          <Compass className="w-4 h-4 stroke-[2]" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight text-white whitespace-nowrap font-tech">
            Tensora <span className="text-amber-500 text-xs font-mono font-medium">GIS</span>
          </span>
          <span className="text-[10px] text-[#737373] font-mono truncate max-w-[200px] md:max-w-xs">
            {hasData ? corridorName : 'Ready for KML/KMZ Upload'}
          </span>
        </div>
      </div>

      {/* Zone 2: Informational Corridor Status */}
      {hasData && (
        <div className="hidden lg:flex items-center gap-6 text-xs text-[#737373] font-mono-numbers">
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

      {/* Zone 3: Primary Action & Tools */}
      <div className="flex items-center gap-2">
        {/* Signed-in account chip */}
        {user && (
          <>
            <div
              className="hidden sm:flex items-center gap-2 pl-1 pr-2 py-0.5 bg-[#111] border border-[#222] rounded-full"
              title={user && !('guest' in user) ? user.email : 'Continuing without an account'}
            >
              {userAvatar ? (
                <img src={userAvatar} alt="" referrerPolicy="no-referrer" className="w-5 h-5 rounded-full" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-[#1e1e1e] border border-[#2a2a2a] flex items-center justify-center text-[9px] font-semibold text-amber-400">
                  {userName.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="max-w-[140px] truncate text-[11px] text-[#a3a3a3]">{userName}</span>
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#737373] hover:text-white bg-[#111] hover:bg-[#171717] border border-[#222] rounded transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Sign out</span>
              </button>
            )}
          </>
        )}
        {hasData && (
          <>
            <button
              onClick={onOpenRegister}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#e5e7eb] bg-[#111] hover:bg-[#171717] border border-[#222] rounded transition-colors whitespace-nowrap"
              title="View Latitude & Longitude for every chainage in the uploaded file"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
              <span>Chainage Register</span>
            </button>

            <button
              onClick={onClearData}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#737373] hover:text-[#ef4444] bg-[#111] hover:bg-[#ef4444]/10 border border-[#222] rounded transition-colors whitespace-nowrap"
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
