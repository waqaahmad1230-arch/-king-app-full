import React, { useState, useEffect, useMemo, useCallback } from 'react';
import GamePlayer from './GamePlayer';
import AdMobBannerAd from './AdMobBannerAd';
import { games as staticVerifiedGames, Game } from '../data/games';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Play, Sparkles, AlertCircle, RotateCcw, Gamepad2, Star } from 'lucide-react';

// Maintained for backward compatibility with other components
export interface GameItem {
  id: string;
  title: string;
  link?: string;
  image?: string;
  category?: string;
  rating?: number | string;
  reward?: string;
  plays?: string;
  showOnHomeUntil?: number;
}

const CATEGORIES: { id: string; label: string; icon: string }[] = [
  { id: 'all', label: 'All Games', icon: '🎮' },
  { id: 'Racing', label: 'Racing', icon: '🏎️' },
  { id: 'Action', label: 'Action', icon: '⚔️' },
  { id: 'Puzzle', label: 'Puzzle', icon: '🧩' },
  { id: 'Football', label: 'Football', icon: '⚽' },
  { id: 'Sports', label: 'Sports', icon: '🏆' },
  { id: 'Arcade', label: 'Arcade', icon: '🕹️' },
  { id: 'Strategy', label: 'Strategy', icon: '♟️' },
];

/**
 * Strict validator:
 * 1. Must have valid title.
 * 2. Must have valid URL starting with http:// or https://.
 * 3. Must have valid thumbnail URL (http://, https://, or /).
 * 4. STRICT RULE: Does not allow random Unsplash or Picsum images.
 */
function isValidGameRecord(g: any): boolean {
  if (!g || typeof g !== 'object') return false;

  const title = (g.title || g.name || '').trim();
  const url = (g.url || g.link || '').trim();
  const thumbnail = (g.thumbnail || g.image || '').trim();

  if (!title || title.length < 2) return false;
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return false;
  if (!thumbnail || (!thumbnail.startsWith('http://') && !thumbnail.startsWith('https://') && !thumbnail.startsWith('/'))) return false;

  // Strict check: reject placeholder, random unsplash, or picsum images
  const lowerThumb = thumbnail.toLowerCase();
  if (lowerThumb.includes('unsplash.com') || lowerThumb.includes('picsum.photos')) {
    return false;
  }

  return true;
}

/**
 * Strict approval validator:
 * Must not be pending or rejected.
 */
function isGameApproved(data: any): boolean {
  if (!data || typeof data !== 'object') return false;

  // Explicitly reject pending or rejected records
  if (data.status === 'pending' || data.status === 'rejected') return false;
  if (data.approved === false || data.isApproved === false) return false;

  // Explicitly accept approved records
  if (data.status === 'approved' || data.approved === true || data.isApproved === true || data.status === 'active') {
    return true;
  }

  // Legacy records with no explicit status are considered active unless flagged
  return data.status !== 'pending' && data.status !== 'rejected';
}

/**
 * Normalize category string to standard category set
 */
function normalizeCategory(rawCategory: string | undefined): string {
  if (!rawCategory) return 'Action';
  const clean = rawCategory.trim().toLowerCase();
  if (clean.includes('race') || clean.includes('racing') || clean.includes('car') || clean.includes('bike')) return 'Racing';
  if (clean.includes('puzzle') || clean.includes('brain') || clean.includes('match') || clean.includes('word') || clean.includes('logic')) return 'Puzzle';
  if (clean.includes('foot') || clean.includes('soccer')) return 'Football';
  if (clean.includes('sport') || clean.includes('cricket') || clean.includes('basket') || clean.includes('tennis') || clean.includes('pool')) return 'Sports';
  if (clean.includes('arcade') || clean.includes('retro') || clean.includes('flappy') || clean.includes('pac')) return 'Arcade';
  if (clean.includes('strat') || clean.includes('chess') || clean.includes('tower') || clean.includes('defense') || clean.includes('war')) return 'Strategy';
  return 'Action';
}

export default function GamesView({ 
  gamingTab = 'LOBBY',
  onSelectGamingTab,
  onOpenGamePix,
}: { 
  gamingTab?: string;
  onSelectGamingTab?: (tab: string) => void;
  onOpenGamePix?: () => void;
}) {
  const [currentCategory, setCurrentCategory] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState<number>(24);
  const [activeGame, setActiveGame] = useState<Game | null>(null);

  // Firestore subscription state
  const [firestoreGames, setFirestoreGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);

  // Subscribe dynamically to Firestore `king_games` collection
  useEffect(() => {
    setIsLoading(true);
    setFirestoreError(null);

    let unsubscribe: (() => void) | undefined;

    try {
      const gamesCollectionRef = collection(db, 'king_games');
      unsubscribe = onSnapshot(
        gamesCollectionRef,
        (snapshot) => {
          const approvedList: Game[] = [];

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();

            // 1. Only proceed if approved (not pending or rejected)
            if (!isGameApproved(data)) return;

            // 2. Validate essential fields (title, url, legitimate thumbnail)
            if (!isValidGameRecord(data)) return;

            const title = (data.title || data.name || '').trim();
            const url = (data.url || data.link || '').trim();
            const thumbnail = (data.thumbnail || data.image || '').trim();
            const category = normalizeCategory(data.category);

            approvedList.push({
              id: docSnap.id,
              title,
              category,
              thumbnail,
              url,
              rating: data.rating || '4.9',
              plays: data.plays || '1.5K',
              description: data.description || 'Verified in-app HTML5 game',
              status: 'approved',
              approved: true,
            });
          });

          setFirestoreGames(approvedList);
          setIsLoading(false);
          setFirestoreError(null);
        },
        (error) => {
          console.error("Firestore king_games subscription error:", error);
          setFirestoreError(error.message || "Failed to load games from database.");
          setIsLoading(false);
        }
      );
    } catch (err: any) {
      console.error("Firestore subscription initialization error:", err);
      setFirestoreError(err.message || "Could not connect to game records.");
      setIsLoading(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [retryTrigger]);

  // Combine Firestore dynamic games with static verified fallback games (zero duplicates)
  const combinedGames = useMemo(() => {
    const map = new Map<string, Game>();

    // 1. Prioritize dynamic Firestore approved games
    firestoreGames.forEach((g) => {
      const key = (g.url || '').toLowerCase().trim().replace(/\/$/, '') || g.title.toLowerCase().trim();
      map.set(key, g);
    });

    // 2. Add verified static games only if not already present and if valid
    staticVerifiedGames.forEach((g) => {
      if (!isValidGameRecord(g)) return;
      const key = (g.url || '').toLowerCase().trim().replace(/\/$/, '') || g.title.toLowerCase().trim();
      if (!map.has(key)) {
        map.set(key, g);
      }
    });

    return Array.from(map.values());
  }, [firestoreGames]);

  // Filter games based on selected category
  const filteredGames = useMemo(() => {
    if (currentCategory === 'all') return combinedGames;
    return combinedGames.filter((g) => g.category.toLowerCase() === currentCategory.toLowerCase());
  }, [combinedGames, currentCategory]);

  // Paginated games for optimal Android and mobile performance
  const displayedGames = useMemo(() => {
    return filteredGames.slice(0, visibleCount);
  }, [filteredGames, visibleCount]);

  // Dynamic category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: combinedGames.length };
    CATEGORIES.forEach((c) => {
      if (c.id !== 'all') {
        counts[c.id] = combinedGames.filter((g) => g.category.toLowerCase() === c.id.toLowerCase()).length;
      }
    });
    return counts;
  }, [combinedGames]);

  const handleCategorySwitch = (catId: string) => {
    setCurrentCategory(catId);
    setVisibleCount(24);
  };

  const handleLoadMore = () => {
    setVisibleCount((prev) => Math.min(prev + 24, filteredGames.length));
  };

  const handlePlay = (game: Game) => {
    setActiveGame(game);
  };

  const handleClosePlayer = () => {
    setActiveGame(null);
  };

  const handleRetry = () => {
    setRetryTrigger((prev) => prev + 1);
  };

  return (
    <div className="bg-[#0a0e15] min-h-screen text-white font-sans p-2.5 pb-28 select-none">
      
      {/* 1. STICKY CATEGORIES BAR */}
      <div 
        className="cat-bar flex gap-2 overflow-x-auto py-2.5 sticky top-0 bg-[#0a0e15]/95 backdrop-blur-md z-20 scrollbar-none border-b border-zinc-900/60"
      >
        {CATEGORIES.map((cat) => {
          const isActive = currentCategory === cat.id;
          const count = categoryCounts[cat.id] || 0;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategorySwitch(cat.id)}
              className={`cat px-3.5 py-1.5 rounded-full whitespace-nowrap cursor-pointer text-xs font-bold transition-all active:scale-95 border flex items-center gap-1.5 ${
                isActive
                  ? 'bg-[#00ff88] text-black border-[#00ff88] shadow-[0_0_15px_rgba(0,255,136,0.35)]'
                  : 'bg-[#141b26] text-zinc-300 border-[#263244] hover:border-zinc-500'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-black/20 text-black font-extrabold' : 'bg-black/40 text-zinc-400'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2. FEATURED SEPARATE CARD AT TOP: "Play & Enjoy" / "GamePix Zone" (PURPLE GRADIENT) */}
      <div
        onClick={() => {
          if (onOpenGamePix) {
            onOpenGamePix();
          } else {
            window.location.href = '/gamepix';
          }
        }}
        className="my-2.5 p-3.5 rounded-2xl bg-gradient-to-r from-purple-950 via-indigo-950 to-purple-900 border-2 border-purple-500/60 shadow-[0_0_25px_rgba(168,85,247,0.35)] cursor-pointer group active:scale-[0.98] transition-all relative overflow-hidden select-none"
      >
        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-purple-500/20 rounded-full blur-2xl pointer-events-none group-hover:bg-purple-500/30 transition-colors" />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Card Icon: Gamepad with Star */}
            <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 border border-purple-400/50 flex items-center justify-center shadow-lg shadow-purple-950/60 shrink-0 group-hover:scale-105 transition-transform">
              <Gamepad2 className="w-5 h-5 text-white" />
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 border border-purple-950 flex items-center justify-center shadow">
                <Star className="w-2.5 h-2.5 text-black fill-black" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-black text-white tracking-wide group-hover:text-purple-200 transition-colors flex items-center gap-1">
                  <span>Play & Enjoy</span>
                  <span className="text-amber-400 text-xs">⭐</span>
                </h3>
                <span className="text-[9px] bg-purple-500/30 text-purple-200 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider border border-purple-400/30 shrink-0">
                  GamePix Zone
                </span>
              </div>
              <p className="text-[10px] text-purple-300/80 mt-0.5 truncate leading-snug">
                Official GamePix Instant Games • Property PN8G3
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white font-black text-xs rounded-xl shadow-[0_0_15px_rgba(168,85,247,0.5)] group-hover:scale-105 transition-transform">
            <span>Play</span>
            <span className="text-sm leading-none">→</span>
          </div>
        </div>
      </div>

      {/* 3. REGISTRY STATUS & DYNAMIC SYNC BANNER */}
      <div className="my-2.5 bg-gradient-to-r from-zinc-900/90 via-black to-zinc-900/90 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-sm font-black">
            👑
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5 leading-tight">
              <span>KING Play Games</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-mono font-bold">
                {combinedGames.length} Verified
              </span>
            </h4>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              Live Firestore Sync • {firestoreGames.length} Cloud • {combinedGames.length - firestoreGames.length} Local
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[9px] text-zinc-500 uppercase tracking-wider block font-bold">Category</span>
          <span className="text-xs font-mono font-black text-green-400">
            {filteredGames.length} Games
          </span>
        </div>
      </div>

      {/* 3. FIRESTORE ERROR & RETRY BANNER */}
      {firestoreError && (
        <div className="my-2 bg-rose-950/40 border border-rose-500/40 rounded-2xl p-3 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-rose-200 truncate">Database sync issue</p>
              <p className="text-[10px] text-zinc-400 truncate">{firestoreError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="px-3 py-1.5 bg-rose-500 hover:bg-rose-400 text-black font-bold text-xs rounded-xl flex items-center gap-1 active:scale-95 transition cursor-pointer flex-shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* 4. GOOGLE ADMOB TEST BANNER */}
      <AdMobBannerAd className="my-1.5" />

      {/* 5. LOADING STATE */}
      {isLoading && combinedGames.length === 0 ? (
        <div className="py-20 text-center flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-3 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mb-3" />
          <p className="text-xs font-bold text-emerald-400 tracking-wider">SYNCING APPROVED GAMES...</p>
          <p className="text-[11px] text-zinc-500 mt-1">Checking Firestore collection king_games</p>
        </div>
      ) : filteredGames.length === 0 ? (
        /* 6. EMPTY STATE */
        <div className="py-20 px-4 text-center flex flex-col items-center justify-center bg-zinc-950/70 border border-zinc-900 rounded-3xl my-3 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-center text-3xl mb-3 shadow-inner">
            🎮
          </div>
          <h3 className="text-base font-bold text-white mb-1">No Approved Games</h3>
          <p className="text-xs text-zinc-400 max-w-xs">
            {currentCategory === 'all'
              ? 'No approved games found in database or local verified registry.'
              : `No approved games found in "${currentCategory}".`}
          </p>
          {firestoreError && (
            <button
              type="button"
              onClick={handleRetry}
              className="mt-4 px-4 py-2 bg-emerald-500 text-black font-bold text-xs rounded-xl flex items-center gap-1.5 active:scale-95 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Sync</span>
            </button>
          )}
        </div>
      ) : (
        /* 7. TWO-COLUMN RESPONSIVE GAME GRID */
        <div 
          id="grid"
          className="grid grid-cols-2 gap-2.5 pt-1"
        >
          {displayedGames.map((game) => (
            <div
              key={game.id}
              onClick={() => handlePlay(game)}
              className="game-card bg-[#111827] border border-[#222] hover:border-[#00ff8866] rounded-2xl overflow-hidden relative shadow-lg cursor-pointer transition active:scale-[0.98] group flex flex-col justify-between"
            >
              {/* Card Thumbnail Area */}
              <div className="w-full h-[125px] relative bg-black overflow-hidden flex-shrink-0">
                <img
                  src={game.thumbnail}
                  alt={game.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    // Hide invalid image instead of showing random unsplash placeholder
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />

                {/* Status Badge */}
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-full border border-green-500/40 text-[9px] font-black text-green-400 shadow">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span>PLAYABLE</span>
                </div>

                {/* Category Pill */}
                <div className="absolute top-2 right-2 z-10 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded-md border border-zinc-800 text-[8px] font-bold text-zinc-300">
                  {game.category}
                </div>

                {/* Centered Glowing Play Button */}
                <div 
                  className="play-overlay absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center font-black text-xs shadow-[0_0_20px_#00ff88] transition-transform group-hover:scale-110 tracking-wider bg-[#00ff88] text-black w-[44px] h-[44px] border-2 border-white/40"
                >
                  <Play className="w-3.5 h-3.5 fill-black" />
                </div>
              </div>

              {/* Game Info Bottom Area */}
              <div className="p-2.5 flex-1 flex flex-col justify-between bg-zinc-950/90 border-t border-zinc-900">
                <div>
                  <h4 
                    className="text-xs font-bold text-white group-hover:text-[#00ff88] transition-colors line-clamp-1 leading-snug"
                    title={game.title}
                  >
                    {game.title}
                  </h4>
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-1">
                    <span>⭐ {game.rating || '4.9'}</span>
                    <span className="text-zinc-500">{game.plays || '1.5K'}</span>
                  </div>
                </div>

                {/* Play Button Row */}
                <div className="mt-2 pt-1.5 border-t border-zinc-900/80 flex items-center justify-between">
                  <span className="text-[9px] font-medium text-emerald-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span>Instant</span>
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlay(game);
                    }}
                    className="px-2.5 py-1 rounded-lg font-bold text-[10px] transition active:scale-95 flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500 hover:text-black cursor-pointer"
                  >
                    Play
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 8. LOAD MORE BUTTON (For Android Mobile Performance) */}
      {visibleCount < filteredGames.length && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleLoadMore}
            className="w-full py-3 bg-[#111827] hover:bg-zinc-800 border border-zinc-800 rounded-2xl text-xs font-bold text-emerald-400 hover:text-emerald-300 transition active:scale-[0.99] shadow cursor-pointer"
          >
            Load More Games ({visibleCount} of {filteredGames.length})
          </button>
        </div>
      )}

      {/* 9. FULLSCREEN IN-APP DIRECT GAMEPLAY PLAYER */}
      {activeGame && (
        <GamePlayer
          gameUrl={activeGame.url}
          gameTitle={activeGame.title}
          isAvailable={true}
          onClose={handleClosePlayer}
        />
      )}

    </div>
  );
}
