import React, { useState } from 'react';
import { X, Search, Sparkles, TrendingUp, Flame, Mic } from 'lucide-react';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult?: (query: string) => void;
  onOpenQR?: () => void;
  onOpenVoice?: () => void;
}

export default function SearchModal({ isOpen, onClose, onSelectResult, onOpenQR, onOpenVoice }: SearchModalProps) {
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  const trendingTags = [
    'Daraz 11.11 Mega Deals',
    'Free Jazz 4G Package',
    'GTA 5 Mobile Cloud',
    'KING AI Reels',
    'PUBG Mobile Tournament',
    'Earbuds Flash Sale',
  ];

  const handleSearch = (item: string) => {
    setQuery(item);
    if (onSelectResult) onSelectResult(item);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-[#0c1424] border border-slate-800 rounded-3xl p-5 shadow-2xl mt-8">
        {/* Search Input Bar with [QR Scanner] [Search Input] [Mic] [X Close] */}
        <div className="relative flex items-center bg-[#070c17] rounded-2xl border border-slate-700/80 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 transition px-2 py-1.5 gap-1.5">
          {/* Left: QR Scanner Icon Button */}
          <button
            onClick={() => {
              if (onOpenQR) onOpenQR();
            }}
            aria-label="QR Scanner"
            className="w-8 h-8 shrink-0 rounded-xl bg-[#24190f] border border-amber-500/30 flex items-center justify-center text-amber-500 hover:bg-[#332213] active:scale-95 transition cursor-pointer"
          >
            <div className="w-3.5 h-3.5 grid grid-cols-2 gap-0.5 p-0.5">
              <div className="w-1.5 h-1.5 border-[1px] border-amber-500 rounded-[1px] flex items-center justify-center">
                <div className="w-0.5 h-0.5 bg-amber-500 rounded-[0.5px]" />
              </div>
              <div className="w-1.5 h-1.5 border-[1px] border-amber-500 rounded-[1px] flex items-center justify-center">
                <div className="w-0.5 h-0.5 bg-amber-500 rounded-[0.5px]" />
              </div>
              <div className="w-1.5 h-1.5 border-[1px] border-amber-500 rounded-[1px] flex items-center justify-center">
                <div className="w-0.5 h-0.5 bg-amber-500 rounded-[0.5px]" />
              </div>
              <div className="w-1.5 h-1.5 flex flex-col justify-between p-[1px]">
                <div className="w-1 h-0.5 bg-amber-500" />
                <div className="w-0.5 h-0.5 bg-amber-500 ml-auto" />
              </div>
            </div>
          </button>

          {/* Middle: Search Icon & Input Field */}
          <div className="relative flex-1 flex items-center">
            <Search className="w-4 h-4 text-sky-400 absolute left-2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search deals, games..."
              autoFocus
              className="w-full bg-transparent text-white pl-8 pr-1 py-1.5 text-sm focus:outline-none"
            />
          </div>

          {/* Right: Voice Mic Button */}
          <button
            onClick={() => {
              if (onOpenVoice) onOpenVoice();
            }}
            aria-label="Voice Search"
            className="w-8 h-8 shrink-0 rounded-xl bg-[#281117] border border-red-500/30 flex items-center justify-center text-[#ef4444] hover:bg-[#38161f] active:scale-95 transition cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5" strokeWidth={2.2} />
          </button>

          {/* Rightmost: Close / Clear X Button */}
          {query ? (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear Query"
              className="w-8 h-8 shrink-0 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 shrink-0 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick Trending Searches */}
        <div className="mt-5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            Trending Searches
          </div>
          <div className="flex flex-wrap gap-2">
            {trendingTags.map((tag) => (
              <button
                key={tag}
                onClick={() => handleSearch(tag)}
                className="text-xs bg-slate-900/90 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 transition cursor-pointer"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full mt-5 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-sky-500/20 transition cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
}
