import React, { useState, useEffect } from 'react';
import { X, Mic, MicOff, Sparkles, Volume2 } from 'lucide-react';

interface VoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscript?: (text: string) => void;
}

export default function VoiceModal({ isOpen, onClose, onTranscript }: VoiceModalProps) {
  const [isListening, setIsListening] = useState(true);
  const [transcript, setTranscript] = useState('Listening... Speak now');

  useEffect(() => {
    if (!isOpen) return;
    setIsListening(true);
    setTranscript('Listening... Speak now');

    // Simulate voice detection or web speech API
    const timer = setTimeout(() => {
      const sampleQueries = [
        'Open KingTube Trending Reels',
        'Show KING Shop Flash Deals',
        'Check Jazz 4G packages',
      ];
      const randomQ = sampleQueries[Math.floor(Math.random() * sampleQueries.length)];
      setTranscript(`"${randomQ}"`);
      setIsListening(false);
      if (onTranscript) onTranscript(randomQ);
    }, 2800);

    return () => clearTimeout(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-[#0c1424] border border-slate-800 rounded-3xl p-6 shadow-2xl text-center relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Pulsing Mic Circle */}
        <div className="my-6 relative flex items-center justify-center">
          {isListening && (
            <>
              <div className="absolute w-24 h-24 rounded-full bg-red-500/20 animate-ping" />
              <div className="absolute w-20 h-20 rounded-full bg-red-500/30 animate-pulse" />
            </>
          )}
          <div className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-red-600 to-rose-500 border border-red-400 flex items-center justify-center text-white shadow-xl shadow-red-900/50">
            {isListening ? (
              <Mic className="w-7 h-7 animate-pulse" />
            ) : (
              <Volume2 className="w-7 h-7 text-white" />
            )}
          </div>
        </div>

        <h3 className="text-base font-bold text-white mb-1">
          {isListening ? 'AI KING Voice Search' : 'Search Recognized'}
        </h3>
        <p className="text-xs text-slate-300 font-medium px-4 py-2 bg-slate-900/80 rounded-xl border border-slate-800 inline-block mb-4">
          {transcript}
        </p>

        {/* Audio Wave Bars */}
        {isListening ? (
          <div className="flex items-center justify-center gap-1.5 h-6 mb-4">
            <span className="w-1 bg-red-500 rounded-full animate-bounce h-3" />
            <span className="w-1 bg-rose-400 rounded-full animate-bounce h-5 delay-75" />
            <span className="w-1 bg-red-500 rounded-full animate-bounce h-6 delay-150" />
            <span className="w-1 bg-rose-400 rounded-full animate-bounce h-4 delay-100" />
            <span className="w-1 bg-red-500 rounded-full animate-bounce h-2 delay-200" />
          </div>
        ) : (
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-500/20 transition"
          >
            Apply Search
          </button>
        )}
      </div>
    </div>
  );
}
