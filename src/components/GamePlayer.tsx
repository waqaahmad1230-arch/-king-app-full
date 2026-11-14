import React, { useEffect, useState, useRef } from 'react';
import { Maximize2, Minimize2, RotateCcw, ArrowLeft, AlertCircle, ShieldCheck } from 'lucide-react';

export interface GamePlayerProps {
  gameUrl?: string;
  srcDoc?: string;
  gameTitle?: string;
  isAvailable?: boolean;
  onClose: () => void;
}

export const GamePlayer: React.FC<GamePlayerProps> = ({
  gameUrl,
  srcDoc,
  gameTitle = 'KING Game',
  isAvailable = true,
  onClose,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fullscreen change listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        if (playerContainerRef.current.requestFullscreen) {
          playerContainerRef.current.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle error:", err);
    }
  };

  const handleRestart = () => {
    setHasError(false);
    setIsLoading(true);
    if (iframeRef.current && gameUrl) {
      iframeRef.current.src = gameUrl;
    }
  };

  // If game is flagged as unavailable or url is empty
  const isSourceMissing = !gameUrl || gameUrl.trim() === '' || !isAvailable;

  return (
    <div
      ref={playerContainerRef}
      id="player"
      className="fixed inset-0 w-full h-full bg-black z-[9999] flex flex-col animate-in fade-in duration-150 overflow-hidden select-none"
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-2 left-2 right-2 z-[10000] flex items-center justify-between pointer-events-none gap-2">
        {/* Left: Back Button */}
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto px-3.5 py-2 rounded-full bg-black/85 hover:bg-black text-white border border-green-500/50 hover:border-green-400 font-bold text-xs cursor-pointer shadow-2xl flex items-center gap-1.5 active:scale-95 transition backdrop-blur-md"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-green-400" />
          <span>Back</span>
        </button>

        {/* Center: Game Title & Badge */}
        <div className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 border border-zinc-800 text-zinc-200 text-xs backdrop-blur-md max-w-[200px] sm:max-w-xs truncate shadow">
          <span className="text-amber-400 text-sm leading-none">👑</span>
          <span className="truncate font-semibold">{gameTitle}</span>
        </div>

        {/* Right: Controls (Restart + Fullscreen) */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          {!isSourceMissing && (
            <button
              type="button"
              onClick={handleRestart}
              className="px-2.5 py-2 rounded-full bg-black/80 hover:bg-black text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 text-xs cursor-pointer shadow-lg active:scale-95 transition backdrop-blur-md flex items-center gap-1"
              title="Restart Game"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="px-2.5 py-2 rounded-full bg-black/80 hover:bg-black text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 text-xs cursor-pointer shadow-lg active:scale-95 transition backdrop-blur-md flex items-center gap-1"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* CASE 1: Game Source Missing / Unavailable */}
      {isSourceMissing ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#070b12] text-white">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-lg shadow-amber-950/40">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Game Source Pending</h2>
          <p className="text-xs text-zinc-400 max-w-sm mb-6 leading-relaxed">
            "{gameTitle}" is registered in the 100-game library. The verified playable source is currently being configured by the provider.
          </p>
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3.5 py-2 rounded-xl text-[11px] text-zinc-400 mb-6">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Honest Status: Source Feed Required</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs cursor-pointer shadow-lg active:scale-95 transition"
          >
            Return to Games Section
          </button>
        </div>
      ) : hasError ? (
        /* CASE 2: Loading Error Handler */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#070b12] text-white">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-base font-bold text-white mb-1">Unable to Load Game</h2>
          <p className="text-xs text-zinc-400 max-w-xs mb-6">
            A network error occurred while loading "{gameTitle}". Please check your connection and retry.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRestart}
              className="px-5 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs cursor-pointer active:scale-95 transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs cursor-pointer active:scale-95 transition"
            >
              Back to Games
            </button>
          </div>
        </div>
      ) : (
        /* CASE 3: Active Working Gameplay Iframe */
        <>
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-[9999] pointer-events-none transition-opacity">
              <div className="w-12 h-12 border-3 border-green-500/20 border-t-green-400 rounded-full animate-spin mb-3" />
              <p className="text-green-400 font-bold text-xs tracking-wider animate-pulse flex items-center gap-1.5">
                <span>👑</span> LOADING "{gameTitle.toUpperCase()}"...
              </p>
              <p className="text-zinc-500 text-[10px] mt-1">Direct In-App Gameplay • No Download</p>
            </div>
          )}

          <iframe
            ref={iframeRef}
            id="king-game-frame"
            src={gameUrl}
            srcDoc={srcDoc}
            title={gameTitle}
            className="w-full h-full border-none flex-1 bg-black"
            allow="autoplay; fullscreen; screen-wake-lock; gamepad"
            allowFullScreen
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        </>
      )}
    </div>
  );
};

export default GamePlayer;
