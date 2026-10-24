import React from 'react';
import { ActiveModuleTab } from '../types/navigation';
import {
  CloudRain,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Layers,
  Sparkles,
} from 'lucide-react';

interface LeftMenuProps {
  activeTab: ActiveModuleTab;
  onSelectTab: (tab: ActiveModuleTab) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  onCloseMobile?: () => void;
  isMobileDrawerOpen?: boolean;
  stormwaterStationCount?: number;
  hasStormwaterData?: boolean;
}

export const LeftMenu: React.FC<LeftMenuProps> = ({
  activeTab,
  onSelectTab,
  isOpen,
  onToggleOpen,
  onCloseMobile,
  isMobileDrawerOpen = false,
  stormwaterStationCount = 0,
  hasStormwaterData = false,
}) => {
  const tabs = [
    {
      id: 'stormwater' as const,
      name: 'Stormwater modelling',
      shortName: 'Stormwater',
      subtitle: 'Catchment & Stream Delineation',
      icon: CloudRain,
      badge: hasStormwaterData
        ? `${stormwaterStationCount} stns`
        : 'Active',
      badgeColor: hasStormwaterData
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        : 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    },
    {
      id: 'water-distribution' as const,
      name: 'Water Distribution Modelling',
      shortName: 'Water Dist.',
      subtitle: 'Pipe Networks & Hydraulics',
      icon: Network,
      badge: 'Empty',
      badgeColor: 'bg-[#222] text-[#737373] border-[#333]',
    },
  ];

  const handleTabClick = (tabId: ActiveModuleTab) => {
    onSelectTab(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const menuContent = (isDrawer: boolean) => (
    <div className="flex flex-col h-full justify-between">
      <div>
        {/* Header inside Menu */}
        <div className="h-11 px-3 border-b border-[#222] flex items-center justify-between text-xs text-[#737373] font-tech uppercase tracking-wider">
          <div className="flex items-center gap-1.5 font-bold text-white">
            <Layers className="w-3.5 h-3.5 text-amber-500" />
            <span>Modules Menu</span>
          </div>
          {isDrawer ? (
            <button
              onClick={onCloseMobile}
              className="p-1 rounded hover:bg-[#1a1a1a] text-[#737373] hover:text-white transition-colors"
              title="Close menu"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onToggleOpen}
              className="p-1 rounded hover:bg-[#1a1a1a] text-[#737373] hover:text-white transition-colors"
              title="Collapse left menu"
              aria-label="Collapse left menu"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Tab Items List */}
        <div className="p-2 space-y-1.5">
          <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[#525252]">
            Engineering Models
          </div>

          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`w-full flex items-start gap-3 p-2.5 rounded-lg border text-left transition-all group cursor-pointer ${
                  isActive
                    ? 'bg-[#171717] border-amber-500/50 shadow-sm text-white'
                    : 'bg-transparent border-transparent hover:bg-[#141414] hover:border-[#222] text-[#888] hover:text-[#e5e7eb]'
                }`}
              >
                <div
                  className={`mt-0.5 p-1.5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                    isActive
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                      : 'bg-[#141414] border-[#222] text-[#666] group-hover:text-white group-hover:border-[#333]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-xs font-semibold truncate font-tech ${
                        isActive ? 'text-white' : 'text-[#bbb] group-hover:text-white'
                      }`}
                    >
                      {tab.name}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded border shrink-0 ${tab.badgeColor}`}
                    >
                      {tab.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#666] truncate mt-0.5 font-sans">
                    {tab.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-[#222] bg-[#0c0c0c]/80 text-[10px] font-mono text-[#525252] flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span>Tensora GIS Modules</span>
          <span className="text-amber-500/70">v0.1</span>
        </div>
        <p className="text-[9px] text-[#404040]">
          Active: {activeTab === 'stormwater' ? 'Stormwater' : 'Water Dist.'}
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Backdrop & Drawer */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[80vw] h-full bg-[#0d0d0d] border-r border-[#222] shadow-2xl z-10">
            {menuContent(true)}
          </div>
        </div>
      )}

      {/* Desktop Left Menu Dock */}
      <aside
        className={`hidden md:flex flex-col h-full bg-[#0d0d0d] border-r border-[#222] select-none shrink-0 transition-all duration-200 ease-in-out ${
          isOpen ? 'w-60' : 'w-14'
        }`}
      >
        {isOpen ? (
          menuContent(false)
        ) : (
          /* Collapsed Mini Rail */
          <div className="flex flex-col h-full justify-between items-center py-2.5">
            <div className="flex flex-col items-center gap-3 w-full">
              <button
                onClick={onToggleOpen}
                className="w-9 h-9 rounded-lg hover:bg-[#1a1a1a] flex items-center justify-center text-[#737373] hover:text-white transition-colors"
                title="Expand left menu"
                aria-label="Expand left menu"
              >
                <PanelLeftOpen className="w-4 h-4 text-amber-500" />
              </button>

              <div className="w-8 h-px bg-[#222] my-0.5" />

              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onSelectTab(tab.id)}
                    className={`relative w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                      isActive
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/40'
                        : 'text-[#666] hover:text-white hover:bg-[#171717] border border-transparent'
                    }`}
                    title={tab.name}
                    aria-label={tab.name}
                  >
                    <Icon className="w-4 h-4" />
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-amber-400 rounded-r" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="text-[9px] font-mono text-[#525252] writing-mode-vertical rotate-180 mb-2">
              TENSORA
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
