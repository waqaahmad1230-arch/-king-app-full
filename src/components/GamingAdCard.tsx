import React, { useEffect } from 'react';

const GamingAdCard: React.FC = () => {
  useEffect(() => {
    // Remove any previously injected adsbygoogle scripts to prevent unhandled TagError
    try {
      const scripts = document.querySelectorAll('script[src*="adsbygoogle.js"]');
      scripts.forEach((s) => s.remove());
      if (typeof window !== 'undefined') {
        (window as any).adsbygoogle = {
          push: () => {},
          loaded: true,
        };
      }
    } catch {
      // safe fallback
    }
  }, []);

  return (
    <div 
      className="bg-gradient-to-r from-black via-zinc-900 to-purple-950 border border-purple-500/60 rounded-2xl p-4 shadow-[0_0_20px_rgba(168,85,247,0.25)] relative overflow-hidden"
    >
      {/* Subtle shine background */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/5 to-transparent pointer-events-none" />

      {/* Header Row */}
      <div className="flex justify-between items-center text-xs relative z-10">
        <span className="font-extrabold tracking-wider text-purple-400 flex items-center gap-1.5">
          <span>🔥</span> KING ADS • SPONSORED
        </span>
        <span className="text-[10px] font-mono bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/40 font-bold">
          24H LIVE
        </span>
      </div>

      {/* Middle Row: Compact Ad Display matching the passport card */}
      <div className="my-2.5 flex items-center justify-between relative z-10 bg-black/50 border border-purple-500/30 rounded-xl px-3 py-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-black text-xs shadow flex-shrink-0">
            Ad
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">Google AdMob Gaming Sponsor</p>
            <p className="text-[10px] text-purple-300 font-mono truncate">Watch & Earn Real Cash Rewards</p>
          </div>
        </div>

        <div className="flex-shrink-0 ml-2 flex items-center gap-1.5">
          <button 
            type="button"
            className="bg-purple-600 hover:bg-purple-500 text-white font-black text-[10px] px-2.5 py-1 rounded-lg shadow cursor-pointer transition active:scale-95"
          >
            VISIT
          </button>
        </div>
      </div>

      {/* Bottom Row: 3 Stats (Exactly matching the VISA card above) */}
      <div className="flex justify-between items-center text-[10px] pt-1.5 border-t border-zinc-800/80 relative z-10">
        <div>
          <span className="text-gray-400 uppercase tracking-wider">DAILY BONUS</span>
          <p className="text-purple-400 font-black text-xs sm:text-sm">+100 GEMS</p>
        </div>
        <div className="text-center">
          <span className="text-gray-400 uppercase tracking-wider">PLATFORM</span>
          <p className="text-yellow-400 font-bold text-[11px]">AdMob Verified</p>
        </div>
        <div className="text-right">
          <span className="text-gray-400 uppercase tracking-wider">STATUS</span>
          <p className="text-emerald-400 font-bold text-[11px]">SPONSOR ACTIVE 👑</p>
        </div>
      </div>
    </div>
  );
};

export default GamingAdCard;
