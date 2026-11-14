import React from 'react';

interface GamingBottomBarProps {
  active?: string;
  setActive: (tab: string) => void;
}

const GamingBottomBar: React.FC<GamingBottomBarProps> = ({ active, setActive }) => {
  return (
    <div className="fixed bottom-0 w-full bg-black border-t-2 border-[#00ff88] shadow-[0_0_20px_#00ff88] flex justify-around items-center p-2 z-50 max-w-md mx-auto left-0 right-0">
      <button 
        type="button"
        onClick={() => setActive('LOBBY')} 
        className={`flex flex-col items-center transition cursor-pointer px-3 py-1 ${active === 'LOBBY' ? 'text-green-300 font-bold scale-105' : 'text-green-400 hover:text-green-300'}`}
      >
        <span className="text-base">🔥</span>
        <span className="text-[10px] font-bold">LOBBY</span>
      </button>

      <button 
        type="button"
        onClick={() => setActive('TOURNAMENT')} 
        className={`flex flex-col items-center transition cursor-pointer px-3 py-1 ${active === 'TOURNAMENT' ? 'text-purple-300 font-bold scale-105' : 'text-purple-400 hover:text-purple-300'}`}
      >
        <span className="text-base">🏆</span>
        <span className="text-[10px] font-bold">TOURNAMENT</span>
      </button>

      {/* CENTER BIG BUTTON */}
      <button 
        type="button"
        onClick={() => setActive('PLAYZONE')} 
        className="w-16 h-16 bg-gradient-to-br from-green-400 to-purple-600 rounded-full border-4 border-black shadow-[0_0_25px_#00ff88] -mt-8 flex items-center justify-center text-2xl animate-pulse cursor-pointer hover:scale-110 transition active:scale-95"
        title="Play Games"
      >
        🎮
      </button>

      <button 
        type="button"
        onClick={() => setActive('WALLET')} 
        className={`flex flex-col items-center transition cursor-pointer px-3 py-1 ${active === 'WALLET' ? 'text-yellow-300 font-bold scale-105' : 'text-yellow-400 hover:text-yellow-300'}`}
      >
        <span className="text-base">💰</span>
        <span className="text-[10px] font-bold">WALLET</span>
      </button>
    </div>
  );
};

export default GamingBottomBar;
