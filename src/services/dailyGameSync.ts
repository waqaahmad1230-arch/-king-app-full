import { collection, addDoc, getDocs, Timestamp, query, where, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { games as staticVerifiedGames } from '../data/games';
import { top20TrendingGamePixGames } from '../data/trendingGamePixFeed';

export interface DailyGame {
  id: string;
  externalId?: string;
  title: string;
  name?: string;
  url: string;
  link?: string;
  thumbnail: string;
  image?: string;
  category: string;
  description?: string;
  source: string;
  status: 'approved';
  approved: boolean;
  isApproved: boolean;
  featuredOnHome: boolean;
  isNewToday?: boolean;
  rating?: number;
  plays?: string;
  addedAt: number;
  discoveredAt?: string;
}

const GAMEPIX_SID = 'PN8G3';
const STORAGE_KEY_GAMES = 'king_daily_games_list_v2';
const STORAGE_KEY_LAST_UPDATE = 'king_daily_games_last_update_v2';
const STORAGE_KEY_OFFSET = 'king_daily_games_offset_v2';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Format the Last Updated text
 * Shows "Today" if updated today (within 24h or calendar day)
 */
export function formatLastUpdated(timestamp: number | null | undefined): string {
  if (!timestamp) return 'Today';
  const now = new Date();
  const date = new Date(timestamp);

  const isSameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();

  if (isSameDay) return 'Today';

  const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  if (diffHours < 24) return 'Today';
  if (diffHours < 48) return 'Yesterday';

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Fetch 5 games from GamePix API
 */
export async function fetch5GamesFromGamePix(offset = 0): Promise<DailyGame[]> {
  const directUrl = `https://games.gamepix.com/games?sid=${GAMEPIX_SID}&limit=5&order=d&offset=${offset}`;

  let json: any = null;

  try {
    const res = await fetch(directUrl);
    if (res.ok) {
      json = await res.json();
    }
  } catch (err) {
    console.warn('[DailyGameSync] Direct GamePix fetch failed, trying proxy...', err);
  }

  // Fallback to internal server proxy
  if (!json || !json.data || !Array.isArray(json.data) || json.data.length === 0) {
    try {
      const proxyRes = await fetch(`/api/games/daily?offset=${offset}`);
      if (proxyRes.ok) {
        json = await proxyRes.json();
      }
    } catch (proxyErr) {
      console.warn('[DailyGameSync] Proxy fetch failed:', proxyErr);
    }
  }

  if (!json || !json.data || !Array.isArray(json.data)) {
    return [];
  }

  const now = Date.now();
  return json.data.slice(0, 5).map((item: any, index: number) => {
    const rawTitle = (item.title || 'GamePix Game').trim();
    const url = item.url || `https://play.gamepix.com/${item.id}/embed?sid=${GAMEPIX_SID}`;
    const thumb =
      item.thumbnailUrl ||
      item.thumbnailUrl100 ||
      `https://games.assets.gamepix.com/${item.id}/thumbnail/small.png`;
    const cat = item.category || (Array.isArray(item.categories) && item.categories[0]) || 'Arcade';

    return {
      id: `gpx-${item.id || index}-${now}`,
      externalId: item.id || String(index),
      title: rawTitle,
      name: rawTitle,
      url,
      link: url,
      thumbnail: thumb,
      image: thumb,
      category: cat,
      description: item.description || '',
      source: 'GamePix',
      status: 'approved' as const,
      approved: true,
      isApproved: true,
      featuredOnHome: true,
      isNewToday: true,
      rating: 4.8 + Number(((index * 7) % 3) / 10),
      plays: `${(index + 1) * 3 + 2}.${index + 1}K Plays`,
      addedAt: now - index * 1000,
      discoveredAt: new Date(now).toISOString(),
    };
  });
}

/**
 * Get initial fallback games from static verified games list
 */
function getInitialFallbackGames(): DailyGame[] {
  return staticVerifiedGames.slice(0, 8).map((g, index) => ({
    id: `static-${index}`,
    title: g.title,
    name: g.title,
    url: g.url,
    link: g.url,
    thumbnail: g.thumbnail,
    image: g.thumbnail,
    category: g.category,
    source: 'KING Library',
    status: 'approved' as const,
    approved: true,
    isApproved: true,
    featuredOnHome: true,
    isNewToday: false,
    rating: 4.9,
    plays: '1.2K Plays',
    addedAt: Date.now() - 86400000 * 2,
  }));
}

/**
 * Sync daily games:
 * 1. Checks if 24 hours have passed since last update
 * 2. If >= 24h, fetches 5 new games from GamePix
 * 3. Prepends new games ON TOP without deleting old games
 * 4. Saves last update time and persists to storage and Firestore
 */
export async function syncDailyGames(forceRefresh = false): Promise<{
  games: DailyGame[];
  lastUpdated: number;
  isUpdatedToday: boolean;
}> {
  const lastUpdateRaw = localStorage.getItem(STORAGE_KEY_LAST_UPDATE);
  const lastUpdate = lastUpdateRaw ? Number(lastUpdateRaw) : null;
  const now = Date.now();
  const timeSinceLastUpdate = lastUpdate ? now - lastUpdate : Infinity;

  // Retrieve cached games
  let cachedGames: DailyGame[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GAMES);
    if (raw) {
      cachedGames = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Error reading cached games', e);
  }

  if (cachedGames.length === 0) {
    cachedGames = getInitialFallbackGames();
  }

  const needsUpdate = forceRefresh || !lastUpdate || timeSinceLastUpdate >= TWENTY_FOUR_HOURS_MS;

  if (needsUpdate) {
    console.log('[DailyGameSync] 24 Hours elapsed or initial sync! Fetching 5 new games from GamePix...');
    const currentOffset = Number(localStorage.getItem(STORAGE_KEY_OFFSET) || '0');
    const newGames = await fetch5GamesFromGamePix(currentOffset);

    if (newGames.length > 0) {
      // Mark older games as not "new today"
      const previousGames = cachedGames.map((g) => ({
        ...g,
        isNewToday: false,
      }));

      // Deduplicate: Don't re-add if identical url already exists
      const filteredNew = newGames.filter(
        (ng) => !previousGames.some((og) => og.url === ng.url || (og.title && og.title.toLowerCase() === ng.title.toLowerCase()))
      );

      // ADD NEW ON TOP, KEEP OLD GAMES BELOW (Rule 4: Don't delete old games, just add new on top)
      const combined = [...(filteredNew.length > 0 ? filteredNew : newGames), ...previousGames];

      // Save updated state
      localStorage.setItem(STORAGE_KEY_GAMES, JSON.stringify(combined));
      localStorage.setItem(STORAGE_KEY_LAST_UPDATE, String(now));
      localStorage.setItem(STORAGE_KEY_OFFSET, String(currentOffset + 5));

      // Attempt to save new games to Firestore king_games collection for global persistence
      try {
        if (auth.currentUser) {
          for (const game of newGames) {
            await addDoc(collection(db, 'king_games'), {
              title: game.title,
              name: game.title,
              url: game.url,
              link: game.url,
              thumbnail: game.thumbnail,
              image: game.thumbnail,
              category: game.category,
              source: 'GamePix',
              status: 'approved',
              approved: true,
              isApproved: true,
              featuredOnHome: true,
              createdAt: Timestamp.now(),
              discoveredAt: game.discoveredAt || new Date().toISOString(),
              rating: game.rating || 4.9,
              plays: game.plays || '1.8K Plays',
            });
          }
          console.log('[DailyGameSync] Successfully synced new games to Firestore king_games');
        }
      } catch (firestoreErr) {
        // Safe to ignore if permissions or unauthenticated
        console.warn('[DailyGameSync] Firestore sync skipped:', firestoreErr);
      }

      return {
        games: combined,
        lastUpdated: now,
        isUpdatedToday: true,
      };
    }
  }

  return {
    games: cachedGames,
    lastUpdated: lastUpdate || now,
    isUpdatedToday: formatLastUpdated(lastUpdate) === 'Today',
  };
}

/**
 * Auto-discover top 20 trending games from GamePix feed (Property PN8G3)
 * and insert them into Firestore collection king_games with status = "pending" and source = "gamepix"
 */
export async function discoverAndQueueTrendingGames(): Promise<{
  inserted: number;
  total: number;
  games: any[];
}> {
  try {
    const gamesCol = collection(db, 'king_games');
    const existingSnap = await getDocs(gamesCol);

    const existingIdByUrl = new Map<string, string>();
    const existingIdByTitle = new Map<string, string>();

    existingSnap.forEach((d) => {
      const data = d.data();
      if (data.url) existingIdByUrl.set(data.url.trim().toLowerCase(), d.id);
      if (data.link) existingIdByUrl.set(data.link.trim().toLowerCase(), d.id);
      if (data.title) existingIdByTitle.set(data.title.trim().toLowerCase(), d.id);
    });

    // 1. Try to fetch live top 20 trending feed from GamePix with property PN8G3
    let feedItems: any[] = [];
    try {
      let res = await fetch('/api/games/gamepix-trending?limit=20&order=d');
      if (!res.ok) {
        res = await fetch(`https://games.gamepix.com/games?sid=${GAMEPIX_SID}&limit=20&order=d`);
      }
      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.data) && json.data.length > 0) {
          feedItems = json.data.map((item: any, idx: number) => {
            const rawTitle = (item.title || 'GamePix Game').trim();
            const url = item.url || `https://play.gamepix.com/${item.id}/embed?sid=${GAMEPIX_SID}`;
            const thumb =
              item.thumbnailUrl ||
              item.thumbnailUrl100 ||
              `https://games.assets.gamepix.com/${item.id}/thumbnail/small.png`;
            const rawCat = (item.category || (Array.isArray(item.categories) && item.categories[0]) || 'Action').trim();

            return {
              title: rawTitle,
              category: rawCat,
              url,
              thumbnail: thumb,
              description: item.description || `Play ${rawTitle} instant HTML5 game with GamePix PN8G3.`,
              rating: item.rkScore ? Number((4.6 + item.rkScore * 0.4).toFixed(1)) : 4.9,
              plays: `${(idx + 1) * 35 + 120}K+`,
            };
          });
        }
      }
    } catch (feedErr) {
      console.warn('[dailyGameSync] Live GamePix feed fetch warning:', feedErr);
    }

    // Merge live feed items with verified top20TrendingGamePixGames to guarantee full 20 games
    const mergedCandidates: typeof top20TrendingGamePixGames = [];
    const seenCandidateUrls = new Set<string>();

    // Add live feed items first
    for (const item of feedItems) {
      const normUrl = (item.url || '').toLowerCase().trim();
      if (normUrl && !seenCandidateUrls.has(normUrl)) {
        seenCandidateUrls.add(normUrl);
        mergedCandidates.push(item);
      }
    }

    // Fill remainder up to 20 from static verified trending feed
    for (const item of top20TrendingGamePixGames) {
      const normUrl = (item.url || '').toLowerCase().trim();
      if (!seenCandidateUrls.has(normUrl)) {
        seenCandidateUrls.add(normUrl);
        mergedCandidates.push(item);
      }
      if (mergedCandidates.length >= 20) break;
    }

    let inserted = 0;
    const queuedGames: any[] = [];

    for (const game of mergedCandidates.slice(0, 20)) {
      const normUrl = game.url.trim().toLowerCase();
      const normTitle = game.title.trim().toLowerCase();

      const gamePayload = {
        title: game.title,
        name: game.title,
        category: game.category,
        source: 'gamepix', // Required: source == "gamepix"
        url: game.url,
        link: game.url,
        thumbnail: game.thumbnail,
        image: game.thumbnail,
        description: game.description || 'Verified GamePix HTML5 trending game',
        rating: game.rating || 4.9,
        plays: game.plays || '250K+',
        status: 'pending', // Required: status = "pending"
        approved: false,
        isApproved: false,
        featuredOnHome: false,
        discoveredAt: new Date().toISOString(),
        createdAt: Timestamp.now(),
      };

      const existingId = existingIdByUrl.get(normUrl) || existingIdByTitle.get(normTitle);
      if (!existingId) {
        const docRef = await addDoc(gamesCol, gamePayload);
        existingIdByUrl.set(normUrl, docRef.id);
        existingIdByTitle.set(normTitle, docRef.id);
        inserted++;
        queuedGames.push({ id: docRef.id, ...gamePayload });
      } else {
        // Already existed — include the real Firestore document ID
        queuedGames.push({ id: existingId, ...gamePayload });
      }
    }

    return {
      inserted,
      total: mergedCandidates.length,
      games: queuedGames,
    };
  } catch (err) {
    console.error('Error discovering trending games:', err);
    throw err;
  }
}

