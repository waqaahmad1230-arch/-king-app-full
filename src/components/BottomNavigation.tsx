import React from 'react';
import { Home, Gamepad2, Play, Library } from 'lucide-react';

interface BottomNavigationProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
}

export default function BottomNavigation({ activeTab, setActiveTab }: BottomNavigationProps) {
  const currentTab = (activeTab || '').toLowerCase();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#050a16]/95 border-t border-slate-800/80 backdrop-blur-lg">
      <div className="max-w-md mx-auto px-4 py-2 flex items-center justify-around">
        
        {/* 1. HOME TAB */}
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === activeTab.toUpperCase() ? 'HOME' : 'home')}
          className={`flex flex-col items-center gap-1 transition-all py-1 px-3 rounded-2xl cursor-pointer ${
            currentTab === 'home'
              ? 'text-[#28b8ff] font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Home className="w-5 h-5" strokeWidth={currentTab === 'home' ? 2.5 : 2} />
          <span className="text-[10px] tracking-wider uppercase">HOME</span>
        </button>

        {/* 2. GAMES TAB */}
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === activeTab.toUpperCase() ? 'GAMES' : 'games')}
          className={`flex flex-col items-center gap-1 transition-all py-1 px-3 rounded-2xl cursor-pointer ${
            currentTab === 'games' || currentTab === 'gamepix'
              ? 'text-[#28b8ff] font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Gamepad2 className="w-5 h-5" strokeWidth={currentTab === 'games' || currentTab === 'gamepix' ? 2.5 : 2} />
          <span className="text-[10px] tracking-wider uppercase">GAMES</span>
        </button>

        {/* 3. VIDEOS TAB */}
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === activeTab.toUpperCase() ? 'VIDEOS' : 'videos')}
          className={`flex flex-col items-center gap-1 transition-all py-1 px-3 rounded-2xl cursor-pointer ${
            currentTab === 'videos'
              ? 'text-[#28b8ff] font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Play className="w-5 h-5" strokeWidth={currentTab === 'videos' ? 2.5 : 2} />
          <span className="text-[10px] tracking-wider uppercase">VIDEOS</span>
        </button>

        {/* 4. LIBRARY TAB */}
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === activeTab.toUpperCase() ? 'LIBRARY' : 'library')}
          className={`flex flex-col items-center gap-1 transition-all py-1 px-3 rounded-2xl cursor-pointer ${
            currentTab === 'library'
              ? 'text-[#28b8ff] font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Library className="w-5 h-5" strokeWidth={currentTab === 'library' ? 2.5 : 2} />
          <span className="text-[10px] tracking-wider uppercase">LIBRARY</span>
        </button>

      </div>
    </nav>
  );
}
