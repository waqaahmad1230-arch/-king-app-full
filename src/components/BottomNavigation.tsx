import React from 'react';
import { Home, Gamepad2, Play, Library } from 'lucide-react';

interface BottomNavigationProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  lightMode?: boolean;
}

export default function BottomNavigation({
  activeTab,
  setActiveTab,
  lightMode = false,
}: BottomNavigationProps) {
  const currentTab = (activeTab || '').toLowerCase();

  const itemClass = (active: boolean) =>
    active
      ? lightMode
        ? 'text-[#1877F2] font-bold scale-105'
        : 'text-[#28b8ff] font-bold scale-105'
      : lightMode
      ? 'text-slate-500 hover:text-slate-800'
      : 'text-slate-400 hover:text-slate-200';

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 backdrop-blur-lg transition-colors ${
        lightMode
          ? 'bg-white/95 border-t border-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.04)]'
          : 'bg-[#050a16]/95 border-t border-slate-800/80'
      }`}
    >
      <div className="max-w-md mx-auto px-4 py-2 flex items-center justify-around">
        
        {/* 1. HOME TAB */}
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === activeTab.toUpperCase() ? 'HOME' : 'home')}
          className={`flex flex-col items-center gap-1 transition-all py-1 px-3 rounded-2xl cursor-pointer ${itemClass(currentTab === 'home')}`}
        >
          <Home className="w-5 h-5" strokeWidth={currentTab === 'home' ? 2.5 : 2} />
          <span className="text-[10px] tracking-wider uppercase">HOME</span>
        </button>

        {/* 2. GAMES TAB */}
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === activeTab.toUpperCase() ? 'GAMES' : 'games')}
          className={`flex flex-col items-center gap-1 transition-all py-1 px-3 rounded-2xl cursor-pointer ${itemClass(currentTab === 'games' || currentTab === 'gamepix')}`}
        >
          <Gamepad2 className="w-5 h-5" strokeWidth={currentTab === 'games' || currentTab === 'gamepix' ? 2.5 : 2} />
          <span className="text-[10px] tracking-wider uppercase">GAMES</span>
        </button>

        {/* 3. VIDEOS TAB */}
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === activeTab.toUpperCase() ? 'VIDEOS' : 'videos')}
          className={`flex flex-col items-center gap-1 transition-all py-1 px-3 rounded-2xl cursor-pointer ${itemClass(currentTab === 'videos')}`}
        >
          <Play className="w-5 h-5" strokeWidth={currentTab === 'videos' ? 2.5 : 2} />
          <span className="text-[10px] tracking-wider uppercase">VIDEOS</span>
        </button>

        {/* 4. LIBRARY TAB */}
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === activeTab.toUpperCase() ? 'LIBRARY' : 'library')}
          className={`flex flex-col items-center gap-1 transition-all py-1 px-3 rounded-2xl cursor-pointer ${itemClass(currentTab === 'library')}`}
        >
          <Library className="w-5 h-5" strokeWidth={currentTab === 'library' ? 2.5 : 2} />
          <span className="text-[10px] tracking-wider uppercase">LIBRARY</span>
        </button>

      </div>
    </nav>
  );
}
