import React from 'react';
import { ActiveModuleTab } from '../types/navigation';
import {
  CloudRain,
  Network,
  Waves,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Layers,
} from 'lucide-react';

interface LeftMenuProps {
  activeTab: ActiveModuleTab;
  onSelectTab: (tab: ActiveModuleTab) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  onCloseMobile?: () => void;
  isMobileDrawerOpen?: boolean;
}

export const LeftMenu: React.FC<LeftMenuProps> = ({
  activeTab,
  onSelectTab,
  isOpen,
  onToggleOpen,
  onCloseMobile,
  isMobileDrawerOpen = false,
}) => {
  const tabs = [
    {
      id: 'stormwater' as const,
      name: 'Stormwater Modelling',
      icon: CloudRain,
    },
    {
      id: 'water-distribution' as const,
      name: 'Water Distribution Modelling',
      icon: Network,
    },
    {
      id: 'wastewater' as const,
      name: 'Wastewater Modelling',
      icon: Waves,
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
            <span>Modules</span>
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
              title="Collapse menu"
              aria-label="Collapse menu"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Tab Items List */}
        <div className="p-2 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#171717] border-amber-500/50 text-white font-semibold shadow-xs'
                    : 'bg-transparent border-transparent hover:bg-[#141414] hover:border-[#222] text-[#888] hover:text-[#e5e7eb]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-amber-400' : 'text-[#666]'
                  }`}
                />
                <span className="text-xs truncate font-tech">{tab.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-[#222] bg-[#0c0c0c] text-[10px] font-mono text-[#525252] flex items-center justify-between">
        <span>Tensora GIS</span>
        <span>v1.0</span>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Drawer */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-64 max-w-[80vw] h-full bg-[#0d0d0d] border-r border-[#222] shadow-2xl z-10">
            {menuContent(true)}
          </div>
        </div>
      )}

      {/* Desktop Left Menu Dock */}
      <aside
        className={`hidden md:flex flex-col h-full bg-[#0d0d0d] border-r border-[#222] select-none shrink-0 transition-all duration-200 ease-in-out ${
          isOpen ? 'w-56' : 'w-13'
        }`}
      >
        {isOpen ? (
          menuContent(false)
        ) : (
          /* Collapsed Mini Rail */
          <div className="flex flex-col h-full justify-between items-center py-2.5">
            <div className="flex flex-col items-center gap-2.5 w-full">
              <button
                onClick={onToggleOpen}
                className="w-9 h-9 rounded-lg hover:bg-[#1a1a1a] flex items-center justify-center text-[#737373] hover:text-white transition-colors"
                title="Expand menu"
                aria-label="Expand menu"
              >
                <PanelLeftOpen className="w-4 h-4 text-amber-500" />
              </button>

              <div className="w-6 h-px bg-[#222] my-0.5" />

              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onSelectTab(tab.id)}
                    className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
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

            <div className="w-2 h-2 rounded-full bg-[#222]" />
          </div>
        )}
      </aside>
    </>
  );
};
