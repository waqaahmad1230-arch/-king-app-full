import React, { useState, useEffect } from 'react';
import {
  X,
  Palette,
  Image as ImageIcon,
  Type,
  Gamepad2,
  Plus,
  Loader2,
  Globe,
  Sparkles,
  CheckCircle2,
  UserCheck,
  Check,
  XCircle,
  Clock,
  ExternalLink,
  ShieldAlert,
  AlertCircle,
  Play,
  EyeOff,
  Trash2,
  Film,
  Eye,
} from 'lucide-react';
import {
  collection,
  addDoc,
  Timestamp,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { UserGameUploadsComponent } from './UserGameUploadsComponent';
import { CatalogAdminSection } from './CatalogAdminSection';
import { discoverAndQueueTrendingGames } from '../services/dailyGameSync';
import {
  AUTHORIZED_ADMIN_EMAIL,
  deleteFeedItem,
  deleteGameFromCatalog,
  isGameApprovedAndPublished,
  setGameModerationStatus,
  setUserPostStatus,
  setVideoPublicationStatus,
  subscribeAllUserPostsForAdmin,
  subscribeAllVideosForAdmin,
} from '../services/centralContentService';
import { UserPost } from '../types/content';

interface SecretAdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onGameAdded?: () => void;
}

export default function SecretAdminPanel({
  isOpen,
  onClose,
  onGameAdded,
}: SecretAdminPanelProps) {
  const { user, loginWithGoogle } = useAuth();
  const isSuperAdminAuthed =
    user?.email === AUTHORIZED_ADMIN_EMAIL && user?.emailVerified !== false;

  const [users, setUsers] = useState<any[]>([]);
  const [allGames, setAllGames] = useState<any[]>([]);
  const [gamesFilterTab, setGamesFilterTab] = useState<'pending' | 'approved' | 'hidden'>('pending');
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [previewModalGame, setPreviewModalGame] = useState<any | null>(null);

  // User Content Moderation State
  const [adminUserPosts, setAdminUserPosts] = useState<UserPost[]>([]);
  const [adminVideos, setAdminVideos] = useState<any[]>([]);
  const [contentModTab, setContentModTab] = useState<'photos' | 'videos'>('photos');
  const [moderatingContentId, setModeratingContentId] = useState<string | null>(null);

  // Theme state
  const [selectedColor, setSelectedColor] = useState<string>(
    localStorage.getItem('king_theme') || '#00e5ff'
  );
  const [profileBg, setProfileBg] = useState<string>(
    localStorage.getItem('king_profile_bg') || ''
  );
  const [fontStyle, setFontStyle] = useState<string>(
    localStorage.getItem('king_font') || 'sans'
  );

  // Add Game Form State
  const [gameLink, setGameLink] = useState('');
  const [gameName, setGameName] = useState('');
  const [fetchedImage, setFetchedImage] = useState<string>('');
  const [detectedTitle, setDetectedTitle] = useState<string>('');
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
  const [isSavingGame, setIsSavingGame] = useState(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  useEffect(() => {
    if (!isOpen || !isSuperAdminAuthed) {
      setUsers([]);
      return;
    }
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const usersList: any[] = [];
        snap.forEach((docSnap) => usersList.push({ id: docSnap.id, ...docSnap.data() }));
        setUsers(usersList);
      } catch (err) {
        console.warn('Admin users fetch notice:', err);
      }
    };
    void fetchUsers();
  }, [isOpen, isSuperAdminAuthed]);

  // Real-time listener for ALL games in Firestore `king_games` collection
  useEffect(() => {
    if (!isOpen || !isSuperAdminAuthed) {
      setAllGames([]);
      return;
    }

    setIsLoadingGames(true);
    setGamesError(null);

    const unsubscribe = onSnapshot(
      collection(db, 'king_games'),
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });

        list.sort((a, b) => {
          const timeA = new Date(a.reviewedAt || a.discoveredAt || a.createdAt || 0).getTime();
          const timeB = new Date(b.reviewedAt || b.discoveredAt || b.createdAt || 0).getTime();
          return timeB - timeA;
        });

        setAllGames(list);
        setIsLoadingGames(false);
      },
      (err: any) => {
        console.error('Error fetching king_games:', err);
        setGamesError(err.message || 'Failed to sync games.');
        setIsLoadingGames(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen, isSuperAdminAuthed]);

  // Real-time listeners for user photo posts & published videos moderation
  useEffect(() => {
    if (!isOpen || !isSuperAdminAuthed) {
      setAdminUserPosts([]);
      setAdminVideos([]);
      return;
    }

    const unsubPosts = subscribeAllUserPostsForAdmin(setAdminUserPosts);
    const unsubVideos = subscribeAllVideosForAdmin(setAdminVideos);
    return () => {
      unsubPosts();
      unsubVideos();
    };
  }, [isOpen, isSuperAdminAuthed]);

  if (!isOpen) return null;

  const pendingGames = allGames.filter(
    (g) => (g.status === 'pending' || (g.approved === false && !g.status)) && g.status !== 'rejected' && g.status !== 'unpublished'
  );
  const approvedGames = allGames.filter((g) => isGameApprovedAndPublished(g));
  const hiddenGames = allGames.filter(
    (g) => g.status === 'rejected' || g.status === 'unpublished' || g.publicationStatus === 'unpublished'
  );

  const displayedGames =
    gamesFilterTab === 'pending'
      ? pendingGames
      : gamesFilterTab === 'approved'
      ? approvedGames
      : hiddenGames;

  const handleGameModeration = async (
    gameId: string,
    gameTitle: string,
    nextStatus: 'approved' | 'rejected' | 'unpublished'
  ) => {
    if (!isSuperAdminAuthed) {
      showToast('Super Admin authentication required.');
      return;
    }
    if (processingId) return;
    setProcessingId(gameId);
    try {
      await setGameModerationStatus(gameId, nextStatus);
      showToast(
        nextStatus === 'approved'
          ? `Approved & Published: "${gameTitle}"`
          : nextStatus === 'unpublished'
          ? `Unpublished: "${gameTitle}" (hidden from Home & Games)`
          : `Rejected: "${gameTitle}"`
      );
      if (nextStatus === 'approved' && onGameAdded) onGameAdded();
    } catch (err: any) {
      showToast(`Error: ${err?.message || 'Failed to update game'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteGame = async (gameId: string, gameTitle: string) => {
    if (!isSuperAdminAuthed) {
      showToast('Super Admin authentication required.');
      return;
    }
    if (processingId) return;
    setProcessingId(gameId);
    try {
      await deleteGameFromCatalog(gameId);
      showToast(`Deleted "${gameTitle}" permanently.`);
    } catch (err: any) {
      showToast(`Error: ${err?.message || 'Failed to delete game'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDiscoverTrendingGames = async () => {
    if (!isSuperAdminAuthed) {
      showToast('Super Admin authentication required.');
      return;
    }
    if (isDiscovering) return;
    setIsDiscovering(true);
    try {
      const res = await discoverAndQueueTrendingGames();
      if (res.inserted > 0) {
        showToast(`Discovered & queued ${res.inserted} trending games from GamePix (PN8G3)!`);
      } else {
        showToast(`All ${res.total} trending games from GamePix (PN8G3) verified.`);
      }
      if (res.games && res.games.length > 0) {
        setPreviewModalGame(res.games[0]);
      } else if (pendingGames.length > 0) {
        setPreviewModalGame(pendingGames[0]);
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message || 'Failed to auto-discover games'}`);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSaveTheme = () => {
    localStorage.setItem('king_theme', selectedColor);
    localStorage.setItem('king_profile_bg', profileBg);
    localStorage.setItem('king_font', fontStyle);
    showToast('Theme & Profile settings saved!');
  };

  const handleFetchGamePreview = async (rawUrl: string) => {
    if (!rawUrl || rawUrl.trim().length < 5) {
      setFetchedImage('');
      setDetectedTitle('');
      return;
    }

    const cleanUrl = rawUrl.startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`;
    setIsFetchingPreview(true);
    try {
      const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(cleanUrl)}`);
      const json = await res.json();

      if (json.status === 'success' && json.data) {
        const imgUrl = json.data.image?.url || json.data.logo?.url || json.data.screenshot?.url;
        const metaTitle = json.data.title || json.data.publisher;
        setFetchedImage(
          imgUrl || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80'
        );
        if (metaTitle) setDetectedTitle(metaTitle);
      } else {
        setFetchedImage('https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80');
      }
    } catch {
      setFetchedImage('https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80');
    } finally {
      setIsFetchingPreview(false);
    }
  };

  const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setGameLink(value);
    if (value.length > 8 && value.includes('.')) {
      void handleFetchGamePreview(value);
    } else {
      setFetchedImage('');
      setDetectedTitle('');
    }
  };

  const handleAddGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdminAuthed) {
      showToast('Super Admin authentication required to add games.');
      return;
    }
    if (!gameLink.trim()) {
      showToast('Please enter a valid Game Link URL');
      return;
    }

    setIsSavingGame(true);
    const nowMs = Date.now();
    const showOnHomeUntil = nowMs + 24 * 60 * 60 * 1000;
    const cleanLink = gameLink.startsWith('http') ? gameLink.trim() : `https://${gameLink.trim()}`;
    const finalTitle = gameName.trim() || detectedTitle.trim() || 'Featured Game';
    const finalThumbnail =
      fetchedImage ||
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80';

    try {
      await addDoc(collection(db, 'king_games'), {
        title: finalTitle,
        name: finalTitle,
        link: cleanLink,
        url: cleanLink,
        thumbnail: finalThumbnail,
        image: finalThumbnail,
        createdAt: new Date().toISOString(),
        showOnHomeUntil: Timestamp.fromMillis(showOnHomeUntil),
        plays: '1.2K Plays',
        rating: 4.9,
        category: 'Featured Game',
        source: 'KING Admin',
        status: 'approved',
        publicationStatus: 'published',
        approved: true,
        isApproved: true,
        published: true,
      });

      showToast('Game published to Home & KING Play Games!');
      setGameLink('');
      setGameName('');
      setFetchedImage('');
      setDetectedTitle('');
      if (onGameAdded) onGameAdded();
    } catch (err: any) {
      showToast(err?.message || 'Failed to add game to Firestore.');
    } finally {
      setIsSavingGame(false);
    }
  };

  const handleTogglePostStatus = async (post: UserPost) => {
    if (!isSuperAdminAuthed) return;
    setModeratingContentId(post.id);
    const nextStatus = post.publicationStatus === 'published' ? 'unpublished' : 'published';
    try {
      await setUserPostStatus(post.id, nextStatus);
      showToast(`Photo post ${nextStatus}.`);
    } catch (err: any) {
      showToast(err?.message || 'Could not update post status.');
    } finally {
      setModeratingContentId(null);
    }
  };

  const handleToggleVideoStatus = async (video: any) => {
    if (!isSuperAdminAuthed) return;
    setModeratingContentId(video.id);
    const isHidden =
      video.publicationStatus === 'unpublished' ||
      video.publicationStatus === 'rejected' ||
      video.status === 'unpublished';
    const nextStatus = isHidden ? 'published' : 'unpublished';
    try {
      await setVideoPublicationStatus(video.id, nextStatus);
      showToast(`Video ${nextStatus}.`);
    } catch (err: any) {
      showToast(err?.message || 'Could not update video status.');
    } finally {
      setModeratingContentId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 w-full min-h-screen bg-[#0f0f0f] p-4 pb-20 overflow-y-auto">
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-slate-950 font-black text-xs px-4 py-2.5 rounded-full shadow-2xl animate-in slide-in-from-top duration-150">
          {toastMsg}
        </div>
      )}

      <div className="w-full max-w-2xl mx-auto bg-[#0c1424] border border-amber-500/40 rounded-3xl p-5 shadow-2xl relative flex flex-col min-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold">
              👑
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                KING Central Admin Panel
              </h3>
              <p className="text-[10px] text-slate-400">
                Catalog Products, Games Moderation, User Content &amp; Themes
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Admin Security Gate Banner */}
        <div className="mt-4">
          {!isSuperAdminAuthed ? (
            <div className="p-4 bg-amber-500/10 border border-amber-500/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <p className="text-xs font-black text-amber-300">
                    Super Admin Authentication Required
                  </p>
                  <p className="text-[10px] text-slate-300">
                    Database rules enforce server-side checks for {AUTHORIZED_ADMIN_EMAIL}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await loginWithGoogle();
                  } catch (err: any) {
                    showToast(err?.message || 'Sign in cancelled');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shrink-0 cursor-pointer"
              >
                Sign in with Admin Google
              </button>
            </div>
          ) : (
            <div className="p-2.5 px-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Authenticated Super Admin: {auth.currentUser?.email}</span>
            </div>
          )}
        </div>

        <div className="space-y-5 pt-4">
          {/* SECTION A: THEME SECTION */}
          <div className="p-4 bg-[#070c17] border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-black text-cyan-400 uppercase tracking-wider">
              <Palette className="w-4 h-4 text-cyan-400" />
              SECTION A: Theme &amp; Profile Customization
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300">App Primary Accent Color:</label>
              <div className="flex items-center gap-2">
                {[
                  { color: '#00e5ff', label: 'Cyan' },
                  { color: '#22c55e', label: 'Green' },
                  { color: '#ef4444', label: 'Red' },
                  { color: '#a855f7', label: 'Purple' },
                  { color: '#f59e0b', label: 'Amber' },
                  { color: '#ec4899', label: 'Pink' },
                ].map((item) => (
                  <button
                    key={item.color}
                    type="button"
                    onClick={() => setSelectedColor(item.color)}
                    className={`w-7 h-7 rounded-full transition transform active:scale-95 cursor-pointer flex items-center justify-center ${
                      selectedColor === item.color ? 'ring-2 ring-white scale-110' : ''
                    }`}
                    style={{ backgroundColor: item.color }}
                    title={item.label}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                Profile Background URL:
              </label>
              <input
                type="text"
                value={profileBg}
                onChange={(e) => setProfileBg(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className="w-full bg-[#03060d] border border-gray-800 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-emerald-400" />
                Font Style:
              </label>
              <select
                value={fontStyle}
                onChange={(e) => setFontStyle(e.target.value)}
                className="w-full bg-[#03060d] border border-gray-800 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="sans">System Sans-Serif (Default)</option>
                <option value="inter">Modern Inter UI</option>
                <option value="crown">Crown Bold Heavy</option>
                <option value="mono">Cyber Monospace</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleSaveTheme}
              className="w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl transition active:scale-95 cursor-pointer shadow"
            >
              Save Theme &amp; Profile Settings
            </button>
          </div>

          {/* SECTION B: ADD GAME LINK */}
          {isSuperAdminAuthed && (
            <form onSubmit={handleAddGame} className="p-4 bg-[#070c17] border border-purple-500/30 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-black text-purple-400 uppercase tracking-wider">
                <Gamepad2 className="w-4 h-4 text-purple-400" />
                SECTION B: Add Game Link (Publishes to Home &amp; Games)
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-cyan-400" />
                  Game Link URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={gameLink}
                  onChange={handleLinkChange}
                  onBlur={(e) => void handleFetchGamePreview(e.target.value)}
                  placeholder="https://play.gamepix.com/..."
                  className="w-full bg-[#03060d] border border-gray-800 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">
                  Game Name <span className="text-slate-500 text-[10px] font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  placeholder={detectedTitle ? `Detected: "${detectedTitle}"` : 'e.g. Cyber Cars'}
                  className="w-full bg-[#03060d] border border-gray-800 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              {fetchedImage && (
                <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                  <img src={fetchedImage} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute bottom-2 left-2 right-2 bg-black/80 p-1.5 rounded-lg text-[10px] text-white font-bold truncate">
                    {gameName.trim() || detectedTitle || 'Game Preview'}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingGame || isFetchingPreview || !gameLink.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs rounded-xl shadow-lg shadow-purple-600/30 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {isSavingGame ? 'Publishing...' : 'Add & Publish Game'}
              </button>
            </form>
          )}

          {/* SECTION C: CENTRAL GAMES MODERATION (Pending / Approved / Unpublished) */}
          {isSuperAdminAuthed && (
            <div className="p-4 bg-[#070c17] border border-amber-500/40 rounded-2xl space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-black text-amber-400 uppercase tracking-wider">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>Games Approval &amp; Catalog Control</span>
                </div>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                  {allGames.length} Total
                </span>
              </div>

              <button
                type="button"
                disabled={isDiscovering}
                onClick={() => void handleDiscoverTrendingGames()}
                className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-black font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
              >
                {isDiscovering ? (
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                ) : (
                  <Sparkles className="w-4 h-4 text-black" />
                )}
                <span>
                  {isDiscovering
                    ? 'Discovering GamePix Feed...'
                    : 'Auto-Discover Top 20 Trending Games (GamePix PN8G3)'}
                </span>
              </button>

              {/* Status Filter Tabs */}
              <div className="grid grid-cols-3 gap-1.5 bg-[#03060d] p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setGamesFilterTab('pending')}
                  className={`py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    gamesFilterTab === 'pending'
                      ? 'bg-amber-500 text-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pending ({pendingGames.length})
                </button>
                <button
                  type="button"
                  onClick={() => setGamesFilterTab('approved')}
                  className={`py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    gamesFilterTab === 'approved'
                      ? 'bg-emerald-500 text-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Live ({approvedGames.length})
                </button>
                <button
                  type="button"
                  onClick={() => setGamesFilterTab('hidden')}
                  className={`py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    gamesFilterTab === 'hidden'
                      ? 'bg-rose-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Hidden ({hiddenGames.length})
                </button>
              </div>

              {isLoadingGames && allGames.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Loading games catalog...</span>
                </div>
              ) : gamesError ? (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{gamesError}</span>
                </div>
              ) : displayedGames.length === 0 ? (
                <div className="p-4 rounded-xl bg-[#03060d] border border-dashed border-slate-800 text-center text-xs text-slate-400">
                  No games in this tab.
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-2.5 pr-0.5">
                  {displayedGames.map((game) => {
                    const title = game.title || game.name || 'Untitled Game';
                    const category = game.category || 'General';
                    const source = game.source || 'KING';
                    const url = game.url || game.link || '';
                    const thumb = game.thumbnail || game.image || '';
                    const isProcessing = processingId === game.id;
                    const isLive = isGameApprovedAndPublished(game);

                    return (
                      <div
                        key={game.id}
                        className="p-3 bg-[#03060d] border border-slate-800 rounded-xl flex flex-col gap-2"
                      >
                        <div className="flex items-start gap-2.5">
                          {thumb && !failedThumbs[game.id] ? (
                            <img
                              src={thumb}
                              alt={title}
                              className="w-14 h-14 rounded-xl object-cover shrink-0 bg-slate-900 border border-slate-800"
                              onError={() =>
                                setFailedThumbs((prev) => ({ ...prev, [game.id]: true }))
                              }
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 text-slate-500">
                              <Gamepad2 className="w-5 h-5" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <h4 className="text-xs font-bold text-white truncate">{title}</h4>
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase shrink-0 ${
                                  isLive
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : game.status === 'pending'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {isLive ? 'LIVE' : game.status || 'HIDDEN'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                              <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                                {category}
                              </span>
                              <span className="truncate">Source: {source}</span>
                            </div>

                            {url && (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 text-[10px] text-cyan-400 flex items-center gap-1 font-mono truncate"
                              >
                                <span className="truncate">{url}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-900">
                          <button
                            type="button"
                            onClick={() => setPreviewModalGame(game)}
                            className="py-1.5 px-2.5 bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Preview</span>
                          </button>

                          {!isLive && (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => void handleGameModeration(game.id, title, 'approved')}
                              className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              <span>{game.status === 'unpublished' ? 'Republish' : 'Approve'}</span>
                            </button>
                          )}

                          {isLive && (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => void handleGameModeration(game.id, title, 'unpublished')}
                              className="flex-1 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>Unpublish</span>
                            </button>
                          )}

                          {game.status === 'pending' && (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => void handleGameModeration(game.id, title, 'rejected')}
                              className="flex-1 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-xs rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => void handleDeleteGame(game.id, title)}
                            className="p-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/40 rounded-lg cursor-pointer"
                            title="Delete permanently"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SECTION D: USER CONTENT MODERATION (Photos & Videos) */}
          {isSuperAdminAuthed && (
            <div className="p-4 bg-[#070c17] border border-cyan-500/30 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-black text-cyan-400 uppercase tracking-wider">
                  <Film className="w-4 h-4 text-cyan-400" />
                  <span>User Photos &amp; Videos Moderation</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {adminUserPosts.length} Photos • {adminVideos.length} Videos
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 bg-[#03060d] p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setContentModTab('photos')}
                  className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    contentModTab === 'photos'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Photo Posts ({adminUserPosts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setContentModTab('videos')}
                  className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    contentModTab === 'videos'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Videos ({adminVideos.length})
                </button>
              </div>

              {contentModTab === 'photos' ? (
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {adminUserPosts.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3 text-center">No user photo posts yet.</div>
                  ) : (
                    adminUserPosts.map((post) => {
                      const isLive = post.publicationStatus === 'published';
                      return (
                        <div
                          key={post.id}
                          className="p-2.5 bg-[#03060d] border border-slate-800 rounded-xl flex items-center justify-between gap-2.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={post.mediaUrl}
                              alt=""
                              className="w-11 h-11 rounded-lg object-cover bg-slate-900 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">
                                {post.caption || 'Photo Post'}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                By {post.authorName} •{' '}
                                <span className={isLive ? 'text-emerald-400' : 'text-amber-400'}>
                                  {post.publicationStatus}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={moderatingContentId === post.id}
                              onClick={() => void handleTogglePostStatus(post)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                              title={isLive ? 'Unpublish' : 'Republish'}
                            >
                              {isLive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              disabled={moderatingContentId === post.id}
                              onClick={async () => {
                                await deleteFeedItem('user_posts', post.id);
                                showToast('Photo post deleted.');
                              }}
                              className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-400 cursor-pointer"
                              title="Delete post"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {adminVideos.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3 text-center">No uploaded videos yet.</div>
                  ) : (
                    adminVideos.map((v) => {
                      const isHidden =
                        v.publicationStatus === 'unpublished' ||
                        v.publicationStatus === 'rejected' ||
                        v.status === 'unpublished';
                      return (
                        <div
                          key={v.id}
                          className="p-2.5 bg-[#03060d] border border-slate-800 rounded-xl flex items-center justify-between gap-2.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {v.thumbnailUrl ? (
                              <img
                                src={v.thumbnailUrl}
                                alt=""
                                className="w-14 h-10 rounded-lg object-cover bg-slate-900 shrink-0"
                              />
                            ) : (
                              <div className="w-14 h-10 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
                                <Film className="w-4 h-4 text-cyan-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">
                                {v.title || 'KING Video'}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                By {v.uploaderName || v.channelName || 'Creator'} •{' '}
                                <span className={isHidden ? 'text-amber-400' : 'text-emerald-400'}>
                                  {isHidden ? 'unpublished' : 'published'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={moderatingContentId === v.id}
                              onClick={() => void handleToggleVideoStatus(v)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                              title={isHidden ? 'Republish video' : 'Unpublish video'}
                            >
                              {isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              disabled={moderatingContentId === v.id}
                              onClick={async () => {
                                await deleteFeedItem('videos', v.id);
                                showToast('Video deleted.');
                              }}
                              className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-400 cursor-pointer"
                              title="Delete video"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* SECTION E: USER GAME UPLOADS REVIEW */}
          {isSuperAdminAuthed && <UserGameUploadsComponent showToast={showToast} />}

          {/* SECTION F: CATALOG PRODUCTS MANAGER */}
          {isSuperAdminAuthed && <CatalogAdminSection showToast={showToast} />}

          {/* SECTION G: ADMIN USER LIST */}
          {isSuperAdminAuthed && (
            <div className="p-4 bg-[#070c17] border border-rose-500/30 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-black text-rose-400 uppercase tracking-wider">
                <UserCheck className="w-4 h-4 text-rose-400" />
                Registered Users ({users.length})
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {users.length > 0 ? (
                  users.map((u) => (
                    <div
                      key={u.id}
                      className="p-2 bg-[#03060d] rounded-lg border border-slate-800 flex items-center gap-2"
                    >
                      <img
                        src={u.photoURL || 'https://i.pravatar.cc/150'}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                      <div className="text-[10px] text-white min-w-0">
                        <div className="font-bold truncate">{u.name || 'User'}</div>
                        <div className="text-slate-400 truncate">{u.email}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-[10px] text-slate-500">No users loaded.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GAME PREVIEW MODAL */}
      {previewModalGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#0b1220] border-2 border-emerald-500 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-3 bg-black border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">🎮</span>
                <div>
                  <h4 className="text-xs font-black text-white truncate max-w-[250px]">
                    {previewModalGame.title}
                  </h4>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    GamePix / Catalog Preview
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalGame(null)}
                className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 w-full bg-black relative min-h-[380px]">
              <iframe
                src={previewModalGame.url || previewModalGame.link}
                title={previewModalGame.title}
                className="w-full h-full min-h-[380px] border-none"
                allow="autoplay; fullscreen; gamepad"
              />
            </div>

            <div className="p-3 bg-black border-t border-zinc-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setPreviewModalGame(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
              >
                Close Preview
              </button>
              <button
                type="button"
                disabled={Boolean(previewModalGame.id && processingId === previewModalGame.id)}
                onClick={() => {
                  const g = previewModalGame;
                  setPreviewModalGame(null);
                  if (g.id) {
                    void handleGameModeration(g.id, g.title || g.name || 'Game', 'approved');
                  }
                }}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black rounded-xl cursor-pointer flex items-center gap-1.5 shadow-lg active:scale-95 transition"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                Approve Game Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
