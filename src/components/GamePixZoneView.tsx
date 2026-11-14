import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  Search, 
  Gamepad2, 
  Sparkles, 
  Play, 
  Star, 
  X, 
  Zap,
  Check,
  WifiOff
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import GamePlayer from './GamePlayer';
import { top20TrendingGamePixGames, GAMEPIX_PROPERTY_ID } from '../data/trendingGamePixFeed';
import { Game } from '../data/games';

export interface GamePixGameItem {
  id: string;
  title: string;
  category: string;
  url: string;
  thumbnail: string;
  description?: string;
  rating?: number | string;
  plays?: string;
  source?: string;
}

const GAMEPIX_CATEGORIES: { id: string; label: string; icon: string }[] = [
  { id: 'all', label: 'All Games', icon: '🎮' },
  { id: 'Racing', label: 'Racing', icon: '🏎️' },
  { id: 'Action', label: 'Action', icon: '⚔️' },
  { id: 'Puzzle', label: 'Puzzle', icon: '🧩' },
  { id: 'Football', label: 'Football', icon: '⚽' },
  { id: 'Sports', label: 'Sports', icon: '🏆' },
  { id: 'Arcade', label: 'Arcade', icon: '🕹️' },
  { id: 'Strategy', label: 'Strategy', icon: '♟️' },
];

function normalizeCategory(rawCat: string | undefined): string {
  if (!rawCat) return 'Action';
  const c = rawCat.toLowerCase().trim();
  if (c.includes('race') || c.includes('car') || c.includes('bike') || c.includes('drift')) return 'Racing';
  if (c.includes('puzzle') || c.includes('brain') || c.includes('match') || c.includes('2048') || c.includes('cut')) return 'Puzzle';
  if (c.includes('foot') || c.includes('soccer')) return 'Football';
  if (c.includes('sport') || c.includes('cricket') || c.includes('pool')) return 'Sports';
  if (c.includes('arcade') || c.includes('flappy') || c.includes('pac') || c.includes('galaxy')) return 'Arcade';
  if (c.includes('strat') || c.includes('chess') || c.includes('tower')) return 'Strategy';
  return 'Action';
}

interface GamePixZoneViewProps {
  onBack: () => void;
}

export default function GamePixZoneView({ onBack }: GamePixZoneViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [firestoreGames, setFirestoreGames] = useState<GamePixGameItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePlayerGame, setActivePlayerGame] = useState<GamePixGameItem | null>(null);

  // Cached Game IDs in localStorage 'king_cached_games'
  const [cachedGameIds, setCachedGameIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('king_cached_games');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed reading king_cached_games:', e);
    }
    return [];
  });

  // Track online/offline status with auto-updating event listeners
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Subscribe to Firestore collection king_games where source == "gamepix"
  useEffect(() => {
    setIsLoading(true);
    let unsubscribe: (() => void) | undefined;

    try {
      const colRef = collection(db, 'king_games');
      unsubscribe = onSnapshot(
        colRef,
        (snapshot) => {
          const list: GamePixGameItem[] = [];

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();

            // Match where source == "gamepix" (case-insensitive for resilience)
            const src = (data.source || '').toLowerCase().trim();
            const url = (data.url || data.link || '').trim();
            const isGamePixSource = src === 'gamepix' || src.includes('gamepix') || url.includes('gamepix');

            if (!isGamePixSource) return;

            // Reject rejected games
            if (data.status === 'rejected') return;

            const title = (data.title || data.name || '').trim();
            const thumbnail = (data.thumbnail || data.image || '').trim();
            if (!title || !url) return;

            list.push({
              id: docSnap.id,
              title,
              category: normalizeCategory(data.category),
              url,
              thumbnail: thumbnail || `https://games.assets.gamepix.com/${docSnap.id}/thumbnail/small.png`,
              description: data.description || 'GamePix official instant game',
              rating: data.rating || 4.9,
              plays: data.plays || '350K+',
              source: 'gamepix',
            });
          });

          setFirestoreGames(list);
          setIsLoading(false);
        },
        (err) => {
          console.warn('[GamePixZone] Firestore sync notice:', err);
          setIsLoading(false);
        }
      );
    } catch (e) {
      console.warn('[GamePixZone] Error initializing listener:', e);
      setIsLoading(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Merge Firestore games with top20TrendingGamePixGames feed (deduplicated by URL & title)
  const allGamePixGames = useMemo(() => {
    const map = new Map<string, GamePixGameItem>();

    // 1. Add Firestore records with source == "gamepix"
    firestoreGames.forEach((g) => {
      const key = g.url.toLowerCase().trim().replace(/\/$/, '') || g.title.toLowerCase().trim();
      map.set(key, g);
    });

    // 2. Add verified top 20 trending GamePix games feed as instant high-quality catalog
    top20TrendingGamePixGames.forEach((g, idx) => {
      const key = g.url.toLowerCase().trim().replace(/\/$/, '') || g.title.toLowerCase().trim();
      if (!map.has(key)) {
        map.set(key, {
          id: `gpx-feed-${idx}`,
          title: g.title,
          category: normalizeCategory(g.category),
          url: g.url,
          thumbnail: g.thumbnail,
          description: g.description,
          rating: g.rating,
          plays: g.plays,
          source: 'gamepix',
        });
      }
    });

    return Array.from(map.values());
  }, [firestoreGames]);

  // Filter by search query, category, and offline mode
  const filteredGames = useMemo(() => {
    let list = allGamePixGames;

    // In offline mode (if !navigator.onLine), filter and show only cached games
    if (!isOnline) {
      list = list.filter((game) => cachedGameIds.includes(game.id));
    }

    return list.filter((game) => {
      const matchesCategory =
        selectedCategory === 'all' ||
        game.category.toLowerCase() === selectedCategory.toLowerCase();

      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        game.title.toLowerCase().includes(query) ||
        game.category.toLowerCase().includes(query) ||
        (game.description && game.description.toLowerCase().includes(query));

      return matchesCategory && matchesSearch;
    });
  }, [allGamePixGames, selectedCategory, searchQuery, isOnline, cachedGameIds]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const list = !isOnline
      ? allGamePixGames.filter((g) => cachedGameIds.includes(g.id))
      : allGamePixGames;

    const counts: Record<string, number> = { all: list.length };
    GAMEPIX_CATEGORIES.forEach((cat) => {
      if (cat.id !== 'all') {
        counts[cat.id] = list.filter(
          (g) => g.category.toLowerCase() === cat.id.toLowerCase()
        ).length;
      }
    });
    return counts;
  }, [allGamePixGames, isOnline, cachedGameIds]);

  const handlePlayGame = (game: GamePixGameItem) => {
    setActivePlayerGame(game);
    // When a game is played, save its ID in localStorage 'king_cached_games'
    try {
      setCachedGameIds((prev) => {
        if (!prev.includes(game.id)) {
          const updated = [...prev, game.id];
          localStorage.setItem('king_cached_games', JSON.stringify(updated));
          return updated;
        }
        return prev;
      });
    } catch (e) {
      console.warn('Failed saving game id to king_cached_games:', e);
    }
  };

  return (
    <div className="min-h-screen bg-[#070512] text-white pb-24 font-sans select-none">
      
      {/* 1. TOP HEADER & BRANDING BAR */}
      <div className="sticky top-0 z-30 bg-[#0c081e]/95 backdrop-blur-md border-b border-purple-500/30 px-3.5 py-3 shadow-lg shadow-purple-950/40">
        <div className="flex items-center justify-between gap-3">
          {/* Back Button to KING */}
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-950/70 hover:bg-purple-900 border border-purple-500/40 rounded-xl text-xs font-bold text-purple-200 hover:text-white transition active:scale-95 cursor-pointer shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to KING</span>
          </button>

          {/* Official GamePix Zone Header Badge */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 border border-purple-400/50 flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.4)]">
              <Gamepad2 className="w-4 h-4 text-white" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black tracking-wider uppercase bg-gradient-to-r from-purple-300 via-fuchsia-300 to-indigo-300 bg-clip-text text-transparent">
                  GAMEPIX ZONE
                </span>
                <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.2 rounded font-mono font-bold border border-purple-500/30">
                  {GAMEPIX_PROPERTY_ID}
                </span>
              </div>
              <p className="text-[10px] text-purple-300/80 font-medium">
                Official HTML5 Instant Gaming Hub
              </p>
            </div>
          </div>

          {/* Header Status Tag */}
          <div className="flex items-center gap-2">
            {!isOnline ? (
              <div className="flex items-center gap-1 text-[11px] font-black text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-xl shadow-sm">
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span>Offline</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-xl">
                <Zap className="w-3 h-3 text-emerald-400" />
                <span>0 Install</span>
              </div>
            )}
          </div>
        </div>

        {/* 2. SEARCH BAR ON TOP */}
        <div className="mt-3 relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-purple-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search GamePix games (e.g. Moto X3M, 2048, Drift, Subway)..."
              className="w-full bg-[#130d2d] border border-purple-500/40 focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 text-white placeholder-purple-300/50 text-xs pl-10 pr-9 py-2.5 rounded-2xl outline-none transition shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 p-1 rounded-full text-purple-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 3. CATEGORIES BAR (Racing, Action, Puzzle, etc.) */}
        <div className="flex gap-2 overflow-x-auto pt-3 pb-1 scrollbar-none">
          {GAMEPIX_CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            const count = categoryCounts[cat.id] || 0;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition active:scale-95 cursor-pointer border ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.45)]'
                    : 'bg-[#150f33] text-purple-200/80 border-purple-500/20 hover:border-purple-400/50 hover:text-white'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-black/30 text-white font-extrabold' : 'bg-black/40 text-purple-300/70'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. HERO BANNER: PLAY & ENJOY GAMEPIX */}
      <div className="p-3">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-950 via-[#180f38] to-indigo-950 border border-purple-500/40 p-4 shadow-xl">
          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center justify-between gap-3 relative z-10">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-purple-300 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Featured GamePix Zone Feed</span>
              </div>
              <h2 className="text-base font-black text-white flex items-center gap-1.5">
                <span>Play & Enjoy Instantly</span>
                <span className="text-amber-400">👑</span>
              </h2>
              <p className="text-[11px] text-purple-200/80 mt-0.5 max-w-xs leading-snug">
                Official GamePix catalog powered by Property <span className="font-mono text-purple-300 font-bold">{GAMEPIX_PROPERTY_ID}</span>. Direct embed, no ads blockage, full sound & touch controls.
              </p>
            </div>

            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/30 border border-purple-400/40 flex flex-col items-center justify-center text-center shrink-0 shadow-inner">
              <span className="text-lg">🎮</span>
              <span className="text-[9px] font-black font-mono text-purple-200">
                {allGamePixGames.length}+
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. GAMES GRID (Official GamePix Site Aesthetic) */}
      <div className="px-3 pt-1">
        {/* Offline Mode Indicator Message */}
        {!isOnline && (
          <div className="mb-3.5 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="text-base">📶</span>
              <div>
                <h4 className="text-xs font-black text-amber-300">
                  Offline Mode - Showing Saved Games
                </h4>
                <p className="text-[10px] text-amber-300/70 mt-0.5">
                  Showing {filteredGames.length} saved offline {filteredGames.length === 1 ? 'game' : 'games'}
                </p>
              </div>
            </div>
            <span className="text-[10px] bg-amber-500/20 text-amber-200 px-2 py-0.5 rounded-full font-bold border border-amber-500/30">
              Offline
            </span>
          </div>
        )}

        {isLoading && allGamePixGames.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-3 border-purple-500/20 border-t-purple-400 rounded-full animate-spin mb-3" />
            <p className="text-xs font-bold text-purple-300 tracking-wider">LOADING GAMEPIX GAMES...</p>
            <p className="text-[11px] text-purple-400/60 mt-1">Syncing property {GAMEPIX_PROPERTY_ID}</p>
          </div>
        ) : filteredGames.length === 0 ? (
          <div className="py-16 text-center flex flex-col items-center justify-center bg-[#100b29] border border-purple-500/20 rounded-3xl p-6 shadow-inner">
            <div className="w-14 h-14 rounded-2xl bg-purple-900/30 border border-purple-500/30 flex items-center justify-center text-2xl mb-3">
              {!isOnline ? '📶' : '🕹️'}
            </div>
            <h3 className="text-sm font-bold text-white mb-1">
              {!isOnline ? 'Offline Mode - Showing Saved Games' : 'No Games Found'}
            </h3>
            <p className="text-xs text-purple-300/70 max-w-xs">
              {!isOnline
                ? 'No games saved offline yet. When online, click "Play" on any game to automatically save it for offline access.'
                : searchQuery
                ? `No games matched "${searchQuery}" in ${selectedCategory === 'all' ? 'any category' : selectedCategory}.`
                : `No games currently found in ${selectedCategory}.`}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-3 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredGames.map((game) => (
              <div
                key={game.id}
                onClick={() => handlePlayGame(game)}
                className="bg-[#120c2e] border border-purple-500/30 hover:border-purple-400/70 rounded-2xl overflow-hidden shadow-lg shadow-purple-950/30 cursor-pointer transition-all duration-200 active:scale-[0.98] group flex flex-col justify-between"
              >
                {/* Thumbnail Container */}
                <div className="w-full aspect-[4/3] relative bg-black overflow-hidden flex-shrink-0">
                  <img
                    src={game.thumbnail}
                    alt={game.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.src = 'https://img.gamepix.com/games/moto-x3m/cover/moto-x3m.png';
                    }}
                  />

                  {/* Category Badge Top Left */}
                  <div className="absolute top-2 left-2 z-10 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-md border border-purple-500/40 text-[9px] font-bold text-purple-200 shadow">
                    {game.category}
                  </div>

                  {/* Saved Offline Badge Top/Bottom Left */}
                  {cachedGameIds.includes(game.id) && (
                    <div className="absolute bottom-2 left-2 z-10 bg-emerald-950/90 backdrop-blur-md px-2 py-0.5 rounded-md border border-emerald-500/60 text-[9px] font-bold text-emerald-300 flex items-center gap-1 shadow-[0_0_10px_rgba(16,185,129,0.4)]">
                      <span>Saved Offline ✓</span>
                    </div>
                  )}

                  {/* Rating Top Right */}
                  <div className="absolute top-2 right-2 z-10 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded-md border border-amber-500/40 text-[9px] font-black text-amber-300 flex items-center gap-1 shadow">
                    <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                    <span>{game.rating || '4.9'}</span>
                  </div>

                  {/* Centered Glowing Play Button Overlay on Hover */}
                  <div className="absolute inset-0 bg-purple-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.7)] group-hover:scale-110 transition-transform">
                      <Play className="w-4 h-4 fill-white ml-0.5" />
                    </div>
                  </div>
                </div>

                {/* Card Info Bottom Area */}
                <div className="p-2.5 flex-1 flex flex-col justify-between bg-[#0e0924]">
                  <div>
                    <h4
                      className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors line-clamp-1 leading-snug"
                      title={game.title}
                    >
                      {game.title}
                    </h4>
                    <p className="text-[10px] text-purple-300/60 mt-0.5 truncate">
                      {game.plays || '320K+'} Plays • GamePix
                    </p>
                  </div>

                  {/* Card Play Button Row */}
                  <div className="mt-2 pt-2 border-t border-purple-500/20 flex items-center justify-between gap-1.5">
                    <span className="text-[9px] font-bold text-purple-300/80 flex items-center gap-1">
                      {cachedGameIds.includes(game.id) ? (
                        <span className="text-emerald-400 font-extrabold flex items-center gap-1">
                          <Check className="w-2.5 h-2.5 text-emerald-400" />
                          <span>Saved Offline ✓</span>
                        </span>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          <span>Instant</span>
                        </>
                      )}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayGame(game);
                      }}
                      className="px-3 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-[10px] rounded-lg shadow-sm shadow-purple-600/30 flex items-center gap-1 active:scale-95 transition cursor-pointer"
                    >
                      <Play className="w-2.5 h-2.5 fill-white" />
                      <span>Play</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. GAMEPIX IFRAME PLAYER OVERLAY */}
      {activePlayerGame && (
        <GamePlayer
          gameUrl={activePlayerGame.url}
          gameTitle={activePlayerGame.title}
          isAvailable={true}
          onClose={() => setActivePlayerGame(null)}
        />
      )}

    </div>
  );
}
