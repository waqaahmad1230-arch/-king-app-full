import React, { useState, useEffect } from 'react';
import { X, Play, ShieldAlert, Sparkles, ExternalLink } from 'lucide-react';
import { ADS } from '../config/ads';

interface AdMobInterstitialProps {
  isOpen: boolean;
  onClose: () => void;
  gameTitle?: string;
}

export default function AdMobInterstitial({ isOpen, onClose, gameTitle }: AdMobInterstitialProps) {
  const [countdown, setCountdown] = useState(3);
  const [canSkip, setCanSkip] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(3);
      setCanSkip(false);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-gradient-to-b from-[#0a1220] via-[#080d18] to-[#04070d] border border-amber-500/40 rounded-3xl p-5 shadow-2xl shadow-amber-950/50 relative flex flex-col justify-between min-h-[480px]">
        
        {/* Top Header: AdMob Test Ad Badge + Close Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xs font-black">
              Ad
            </div>
            <div>
              <span className="text-xs font-black text-white flex items-center gap-1">
                Google AdMob Interstitial
              </span>
              <p className="text-[9px] text-slate-400 font-mono">
                ID: {ADS.interstitialId}
              </p>
            </div>
          </div>

          {/* Close/Skip Button */}
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 rounded-full text-xs font-black transition flex items-center gap-1 cursor-pointer ${
              canSkip
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/40 animate-pulse'
                : 'bg-slate-800 text-slate-400 cursor-not-allowed'
            }`}
          >
            {canSkip ? (
              <>
                <span>Close Ad & Play</span>
                <X className="w-3.5 h-3.5" />
              </>
            ) : (
              <span>Skip in {countdown}s</span>
            )}
          </button>
        </div>

        {/* Center Ad Visual Content */}
        <div className="my-6 space-y-4 text-center">
          <div className="relative mx-auto w-24 h-24 rounded-3xl bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 p-1 shadow-2xl shadow-amber-500/30 flex items-center justify-center animate-bounce" style={{ animationDuration: '3s' }}>
            <div className="w-full h-full bg-[#080d18] rounded-[22px] flex flex-col items-center justify-center p-2">
              <span className="text-3xl">👑</span>
              <span className="text-[10px] font-black text-amber-400 uppercase mt-1">KING ADS</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-widest font-extrabold text-cyan-400 bg-cyan-950/80 px-2.5 py-0.5 rounded-full border border-cyan-500/30">
              Sponsored Game Reward
            </span>
            <h3 className="text-lg font-black text-white leading-tight">
              {gameTitle ? `Launching: ${gameTitle}` : 'Google AdMob Test Interstitial'}
            </h3>
            <p className="text-xs text-slate-300 max-w-xs mx-auto">
              AdMob test ad verified! Closing this ad will launch your game instantly.
            </p>
          </div>

          <div className="p-3 bg-[#03060d] border border-slate-800 rounded-2xl flex items-center justify-between text-left">
            <div>
              <div className="text-[10px] font-bold text-slate-400">STATUS</div>
              <div className="text-xs font-black text-emerald-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Test Mode Active
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl transition active:scale-95 cursor-pointer flex items-center gap-1"
            >
              <span>Continue</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Bottom Notice */}
        <div className="text-center pt-2 border-t border-slate-800">
          <p className="text-[9px] text-slate-500">
            AdMob Test Interstitial ID: ca-app-pub-3940256099942544/1033173712
          </p>
        </div>

      </div>
    </div>
  );
}
