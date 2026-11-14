import React from 'react';
import { ADS } from '../config/ads';
import { ExternalLink } from 'lucide-react';

interface AdMobBannerAdProps {
  className?: string;
}

export default function AdMobBannerAd({ className = '' }: AdMobBannerAdProps) {
  return (
    <div className={`w-full flex flex-col items-center justify-center my-3 select-none ${className}`}>
      {/* Banner Label */}
      <div className="flex items-center gap-1.5 mb-1 text-[9px] font-mono text-slate-400 uppercase tracking-widest">
        <span className="bg-amber-500/20 text-amber-400 font-bold px-1.5 py-0.2 rounded border border-amber-500/30">
          Ad
        </span>
        <span>AdMob Test Ad • Banner</span>
      </div>

      {/* AdMob Banner Box */}
      <div className="w-full max-w-sm h-[60px] bg-gradient-to-r from-[#0d1b2a] via-[#1b263b] to-[#0d1b2a] border border-cyan-500/30 rounded-2xl p-2.5 flex items-center justify-between shadow-lg shadow-cyan-950/40 relative overflow-hidden group">
        
        {/* Subtle animated shine */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

        {/* Ad Left Content */}
        <div className="flex items-center gap-2.5 z-10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 p-0.5 flex items-center justify-center font-black text-black text-xs shadow">
            G
          </div>
          <div className="text-left">
            <h5 className="text-xs font-black text-white flex items-center gap-1 leading-tight">
              Google AdMob Sponsored
            </h5>
            <p className="text-[10px] text-cyan-300 font-medium truncate max-w-[180px]">
              ID: {ADS.bannerId}
            </p>
          </div>
        </div>

        {/* Ad Right CTA Badge */}
        <div className="z-10 flex items-center gap-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-[10px] px-2.5 py-1.5 rounded-xl transition cursor-pointer shadow">
          <span>TEST AD</span>
          <ExternalLink className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}
