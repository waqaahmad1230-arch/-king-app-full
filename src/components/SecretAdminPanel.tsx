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
  ShoppingBag,
  Sparkles, 
  CheckCircle2,
  UserCheck,
  Check,
  XCircle,
  Clock,
  ExternalLink,
  ShieldAlert,
  AlertCircle,
  Play
} from 'lucide-react';
import { collection, addDoc, Timestamp, getDocs, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { UserGameUploadsComponent } from './UserGameUploadsComponent';
import { CatalogAdminSection } from './CatalogAdminSection';
import { discoverAndQueueTrendingGames } from '../services/dailyGameSync';

function UserGameUploadsSection() { return null; }

interface SecretAdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onGameAdded?: () => void;
}

export default function SecretAdminPanel({ isOpen, onClose, onGameAdded }: SecretAdminPanelProps) {
  const [users, setUsers] = useState<any[]>([]); // Added users state

  useEffect(() => {
    if (isOpen && auth.currentUser?.email === 'waqaahmad1230@gmail.com') {
      const fetchUsers = async () => {
        const snap = await getDocs(collection(db, 'users'));
        const usersList: any[] = [];
        snap.forEach(doc => usersList.push({ id: doc.id, ...doc.data() }));
        setUsers(usersList);
      };
      fetchUsers();
    }
  }, [isOpen]);

  // Section E: Pending Discovered Games Queue State
  const [pendingGames, setPendingGames] = useState<any[]>([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [previewModalGame, setPreviewModalGame] = useState<any | null>(null);

  // Real-time listener for pending games in Firestore `king_games` collection
  useEffect(() => {
    if (!isOpen) return;
    const isAdmin = auth.currentUser?.email === 'waqaahmad1230@gmail.com';
    if (!isAdmin) {
      setPendingGames([]);
      return;
    }

    setIsLoadingPending(true);
    setPendingError(null);

    const unsubscribe = onSnapshot(
      collection(db, 'king_games'),
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          // Show games where status == "pending" OR approved == false (excluding already rejected)
          const isPending = (data.status === 'pending' || data.approved === false) && data.status !== 'rejected';
          if (isPending) {
            list.push({
              id: docSnap.id,
              ...data,
            });
          }
        });

        // Sort newest first
        list.sort((a, b) => {
          const timeA = new Date(a.discoveredAt || a.createdAt || 0).getTime();
          const timeB = new Date(b.discoveredAt || b.createdAt || 0).getTime();
          return timeB - timeA;
        });

        setPendingGames(list);
        setIsLoadingPending(false);
      },
      (err: any) => {
        console.error('Error fetching pending games:', err);
        setPendingError(err.message || 'Failed to sync pending games.');
        setIsLoadingPending(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  // Approve game: status = "approved", approved = true, isApproved = true
  const handleApproveGame = async (gameId: string | undefined, gameTitle: string) => {
    const resolvedId =
      (typeof gameId === 'string' && gameId.trim()) ||
      pendingGames.find((g) => (g.title || g.name) === gameTitle)?.id;

    if (!resolvedId) {
      showToast('Error: Missing game document ID. Please refresh and try again.');
      return;
    }
    if (processingId) return;
    setProcessingId(resolvedId);

    try {
      const docRef = doc(db, 'king_games', resolvedId);
      await updateDoc(docRef, {
        status: 'approved',
        approved: true,
        isApproved: true,
        reviewedAt: new Date().toISOString(),
        reviewedBy: auth.currentUser?.email || 'admin',
      });
      showToast(`Approved: "${gameTitle}" is now live! 🎮`);
      if (onGameAdded) onGameAdded();
    } catch (err: any) {
      console.error('Error approving game:', err);
      showToast(`Error: ${err.message || 'Failed to approve'}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Reject game: status = "rejected", approved = false, isApproved = false
  const handleRejectGame = async (gameId: string | undefined, gameTitle: string) => {
    const resolvedId =
      (typeof gameId === 'string' && gameId.trim()) ||
      pendingGames.find((g) => (g.title || g.name) === gameTitle)?.id;

    if (!resolvedId) {
      showToast('Error: Missing game document ID. Please refresh and try again.');
      return;
    }
    if (processingId) return;
    setProcessingId(resolvedId);

    try {
      const docRef = doc(db, 'king_games', resolvedId);
      await updateDoc(docRef, {
        status: 'rejected',
        approved: false,
        isApproved: false,
        reviewedAt: new Date().toISOString(),
        reviewedBy: auth.currentUser?.email || 'admin',
      });
      showToast(`Rejected: "${gameTitle}" ❌`);
    } catch (err: any) {
      console.error('Error rejecting game:', err);
      showToast(`Error: ${err.message || 'Failed to reject'}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Auto-discover top 20 trending games from GamePix feed (Property PN8G3)
  const handleDiscoverTrendingGames = async () => {
    if (isDiscovering) return;
    setIsDiscovering(true);
    try {
      const res = await discoverAndQueueTrendingGames();
      if (res.inserted > 0) {
        showToast(`Discovered & queued ${res.inserted} trending games from GamePix (PN8G3)! Showing in preview... 🎮`);
      } else {
        showToast(`All ${res.total} trending games from GamePix (PN8G3) verified. Showing in preview... 🎮`);
      }

      // Requirement: "After that show them in Preview"
      if (res.games && res.games.length > 0) {
        setPreviewModalGame(res.games[0]);
      } else if (pendingGames.length > 0) {
        setPreviewModalGame(pendingGames[0]);
      }
    } catch (err: any) {
      console.error('Error discovering trending games:', err);
      showToast(`Error: ${err.message || 'Failed to auto-discover games'}`);
    } finally {
      setIsDiscovering(false);
    }
  };

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

  // Simplified Game Form State (Only Game Link Required)
  const [gameLink, setGameLink] = useState('');
  const [gameName, setGameName] = useState('');
  
  // Microlink API Auto-Fetch State for Games
  const [fetchedImage, setFetchedImage] = useState<string>('');
  const [detectedTitle, setDetectedTitle] = useState<string>('');
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
  const [isSavingGame, setIsSavingGame] = useState(false);

  // Section C: Affiliate Banner Manager State
  const [affiliateLink, setAffiliateLink] = useState('');
  const [affiliateTitle, setAffiliateTitle] = useState('');
  const [affiliateImage, setAffiliateImage] = useState('');
  const [isFetchingAffiliateImg, setIsFetchingAffiliateImg] = useState(false);
  const [isSavingAffiliate, setIsSavingAffiliate] = useState(false);
  
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Save Theme Section
  const handleSaveTheme = () => {
    localStorage.setItem('king_theme', selectedColor);
    localStorage.setItem('king_profile_bg', profileBg);
    localStorage.setItem('king_font', fontStyle);
    showToast('Theme & Profile settings saved! 🎨');
  };

  // Auto Fetch Game Preview Image via Microlink API
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
        const imgUrl =
          json.data.image?.url ||
          json.data.logo?.url ||
          json.data.screenshot?.url;

        const metaTitle = json.data.title || json.data.publisher;

        if (imgUrl) {
          setFetchedImage(imgUrl);
        } else {
          setFetchedImage('https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80');
        }

        if (metaTitle) {
          setDetectedTitle(metaTitle);
        }
      } else {
        setFetchedImage('https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80');
      }
    } catch (err) {
      console.warn('Microlink API error:', err);
      setFetchedImage('https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80');
    } finally {
      setIsFetchingPreview(false);
    }
  };

  const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setGameLink(value);
    if (value.length > 8 && value.includes('.')) {
      handleFetchGamePreview(value);
    } else {
      setFetchedImage('');
      setDetectedTitle('');
    }
  };

  // Save Game to Firestore `king_games` collection
  const handleAddGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameLink.trim()) {
      showToast('Please enter a valid Game Link URL');
      return;
    }

    setIsSavingGame(true);

    const nowMs = Date.now();
    const showOnHomeUntil = nowMs + 24 * 60 * 60 * 1000; // 24 hours expiry for Home Section

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
        status: 'approved',
        approved: true,
        isApproved: true,
      });

      showToast('Game added with auto-fetched image! Shows on Home for 24h & permanent in Games 🎮');
      setGameLink('');
      setGameName('');
      setFetchedImage('');
      setDetectedTitle('');
      if (onGameAdded) onGameAdded();
    } catch (err: any) {
      console.error('Error adding game:', err);
      showToast('Failed to add game to Firestore. Check connection.');
    } finally {
      setIsSavingGame(false);
    }
  };

  // Section C: Auto Fetch & Add Affiliate Banner
  const handleFetchAffiliateImage = async (rawUrl: string) => {
    if (!rawUrl || rawUrl.trim().length < 5) return;
    const cleanUrl = rawUrl.startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`;
    
    setIsFetchingAffiliateImg(true);
    try {
      const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(cleanUrl)}`);
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        const img = json.data.image?.url || json.data.logo?.url || json.data.screenshot?.url;
        const metaTitle = json.data.title || json.data.publisher;
        if (img && !affiliateImage) setAffiliateImage(img);
        if (metaTitle && !affiliateTitle) setAffiliateTitle(metaTitle);
      }
    } catch (e) {
      console.warn('Affiliate image fetch error:', e);
    } finally {
      setIsFetchingAffiliateImg(false);
    }
  };

  const handleAddAffiliateBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!affiliateLink.trim()) {
      showToast('Please enter Daraz/Affiliate Link!');
      return;
    }

    setIsSavingAffiliate(true);
    const cleanLink = affiliateLink.startsWith('http') ? affiliateLink.trim() : `https://${affiliateLink.trim()}`;
    const finalTitle = affiliateTitle.trim() || 'Daraz Special Deals 🛍️';
    const finalImage = affiliateImage.trim() || 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&auto=format&fit=crop&q=80';

    try {
      await addDoc(collection(db, 'king_affiliates'), {
        title: finalTitle,
        link: cleanLink,
        url: cleanLink,
        image: finalImage,
        createdAt: new Date().toISOString(),
        badge: 'Daraz Sale 🛍️',
      });

      showToast('Affiliate Banner added to Daraz Home Slider! 🛍️');
      setAffiliateLink('');
      setAffiliateTitle('');
      setAffiliateImage('');
    } catch (err) {
      console.error('Error adding affiliate banner:', err);
      showToast('Failed to save banner to Firestore.');
    } finally {
      setIsSavingAffiliate(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 w-full min-h-screen bg-[#0f0f0f] p-4 pb-20 overflow-y-auto">
      
      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed top-6 z-50 bg-emerald-500 text-slate-950 font-black text-xs px-4 py-2.5 rounded-full shadow-2xl animate-in slide-in-from-top duration-150">
          {toastMsg}
        </div>
      )}

      <div className="w-full mx-auto bg-[#0c1424] border border-amber-500/40 rounded-3xl p-5 shadow-2xl relative flex flex-col min-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold">
              👑
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                Secret Admin Panel
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono font-bold">
                  Code 1234
                </span>
              </h3>
              <p className="text-[10px] text-slate-400">Themes, Games & Daraz Banner Manager</p>
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

        <div className="space-y-5 pt-4">
          
          {/* SECTION A: THEME SECTION */}
          <div className="p-4 bg-[#070c17] border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-black text-cyan-400 uppercase tracking-wider">
              <Palette className="w-4 h-4 text-cyan-400" />
              SECTION A: Theme & Profile Customization
            </div>

            {/* 🎨 Theme Color Picker */}
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

            {/* 🖼️ Profile Background */}
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

            {/* 🔤 Font Style */}
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
                <option value="crown">👑 Crown Bold Heavy</option>
                <option value="mono">Cyber Monospace</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleSaveTheme}
              className="w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl transition active:scale-95 cursor-pointer shadow"
            >
              Save Theme & Profile Settings
            </button>
          </div>

          {/* SECTION B: SIMPLIFIED GAME LINK SECTION */}
          <form onSubmit={handleAddGame} className="p-4 bg-[#070c17] border border-purple-500/30 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-black text-purple-400 uppercase tracking-wider">
              <Gamepad2 className="w-4 h-4 text-purple-400" />
              SECTION B: Add Game Link
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
                onBlur={(e) => handleFetchGamePreview(e.target.value)}
                placeholder="https://poki.com/en/g/cyber-cars"
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
                placeholder={detectedTitle ? `Detected: "${detectedTitle}"` : "e.g. Cyber Cars"}
                className="w-full bg-[#03060d] border border-gray-800 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Auto-Fetched Preview Card */}
            <div className="p-3 bg-[#03060d] border border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                <span>GAME THUMBNAIL PREVIEW</span>
                {isFetchingPreview ? (
                  <span className="text-cyan-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Fetching...
                  </span>
                ) : fetchedImage ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Ready
                  </span>
                ) : null}
              </div>

              {fetchedImage ? (
                <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                  <img
                    src={fetchedImage}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 right-2 bg-black/80 backdrop-blur-sm p-1.5 rounded-lg text-[10px] text-white font-bold truncate">
                    {gameName.trim() || detectedTitle || 'Game Preview'}
                  </div>
                </div>
              ) : (
                <div className="h-16 rounded-xl bg-slate-900/60 border border-dashed border-slate-800 flex items-center justify-center text-center p-2">
                  <p className="text-[10px] text-slate-500">
                    Paste game link above to auto-preview icon
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSavingGame || isFetchingPreview || !gameLink.trim()}
              className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs rounded-xl shadow-lg shadow-purple-600/30 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {isSavingGame ? 'Saving to Firestore...' : 'Add Game to KING Games'}
            </button>
          </form>

          {/* SECTION: PENDING DISCOVERED GAMES REVIEW QUEUE */}
          <div className="p-4 bg-[#070c17] border border-amber-500/40 rounded-2xl space-y-3 shadow-lg shadow-amber-950/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black text-amber-400 uppercase tracking-wider">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Pending Discovered Games</span>
              </div>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                {pendingGames.length} in Queue
              </span>
            </div>

            <p className="text-[10px] text-slate-400 leading-relaxed">
              Review games with status &quot;pending&quot; or unapproved from Firestore <code className="text-amber-300 font-mono">king_games</code> before publishing to KING Play Games.
            </p>

            {/* Auto-Discover Button for Property PN8G3 */}
            {auth.currentUser?.email === 'waqaahmad1230@gmail.com' && (
              <button
                type="button"
                disabled={isDiscovering}
                onClick={handleDiscoverTrendingGames}
                className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 text-black font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition cursor-pointer"
              >
                {isDiscovering ? (
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                ) : (
                  <Sparkles className="w-4 h-4 text-black" />
                )}
                <span>
                  {isDiscovering
                    ? 'Discovering GamePix Feed...'
                    : '⚡ Auto-Discover Top 20 Trending Games (GamePix PN8G3)'}
                </span>
              </button>
            )}

            {/* Admin Authorization Check */}
            {auth.currentUser?.email !== 'waqaahmad1230@gmail.com' ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center space-y-1">
                <ShieldAlert className="w-5 h-5 text-amber-400 mx-auto" />
                <p className="text-xs font-bold text-amber-300">Admin Authorization Required</p>
                <p className="text-[10px] text-slate-400">
                  Sign in with authorized administrator account to review and approve games.
                </p>
              </div>
            ) : isLoadingPending && pendingGames.length === 0 ? (
              <div className="p-6 flex flex-col items-center justify-center text-center space-y-2 bg-[#03060d] rounded-xl border border-slate-800">
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                <span className="text-[11px] text-slate-400 font-bold">Loading pending games queue...</span>
              </div>
            ) : pendingError ? (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="text-[11px]">{pendingError}</span>
              </div>
            ) : pendingGames.length === 0 ? (
              <div className="p-5 rounded-xl bg-[#03060d] border border-dashed border-slate-800 text-center space-y-1">
                <div className="text-xl">✨</div>
                <p className="text-xs font-bold text-slate-300">Queue is Clear</p>
                <p className="text-[10px] text-slate-500">
                  No pending games found. All discovered games have been reviewed.
                </p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-2.5 pr-0.5">
                {pendingGames.map((game) => {
                  const title = game.title || game.name || 'Untitled Game';
                  const category = game.category || 'General';
                  const source = game.source || (game.url?.includes('gamepix') ? 'GamePix' : 'Catalog Feed');
                  const url = game.url || game.link || '';
                  const thumb = game.thumbnail || game.image || '';
                  const hasFailedThumb = failedThumbs[game.id];
                  const isProcessing = processingId === game.id;

                  return (
                    <div
                      key={game.id}
                      className="p-3 bg-[#03060d] border border-slate-800 hover:border-slate-700 rounded-xl flex flex-col gap-2.5 transition shadow-sm"
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Actual Thumbnail or Clear Placeholder (Rule 3) */}
                        {thumb && !hasFailedThumb ? (
                          <img
                            src={thumb}
                            alt={title}
                            className="w-16 h-16 rounded-xl object-cover shrink-0 bg-slate-900 border border-slate-800"
                            onError={() => setFailedThumbs((prev) => ({ ...prev, [game.id]: true }))}
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col items-center justify-center text-center p-1 shrink-0 text-slate-500">
                            <Gamepad2 className="w-5 h-5 mb-0.5 text-slate-600" />
                            <span className="text-[8px] font-bold text-slate-500">No Preview</span>
                          </div>
                        )}

                        {/* Game Details (Rule 2) */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="text-xs font-bold text-white truncate" title={title}>
                              {title}
                            </h4>
                            <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-mono font-bold shrink-0">
                              PENDING
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                            <span className="bg-slate-800/90 text-slate-300 px-1.5 py-0.5 rounded text-[9px] font-semibold border border-slate-700/50">
                              {category}
                            </span>
                            <span className="text-slate-500 text-[10px] truncate">
                              Source: <span className="text-amber-400 font-medium">{source}</span>
                            </span>
                          </div>

                          {/* Embed / Game URL with External Link */}
                          <div className="mt-1.5">
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono max-w-[210px] truncate group"
                                title={url}
                              >
                                <span className="truncate group-hover:underline">{url}</span>
                                <ExternalLink className="w-3 h-3 shrink-0 text-cyan-500" />
                              </a>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">No URL provided</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons: Preview, Approve & Reject */}
                      <div className="flex items-center gap-2 pt-1.5 border-t border-slate-900">
                        {/* Interactive GamePix Player Preview */}
                        <button
                          type="button"
                          onClick={() => setPreviewModalGame(game)}
                          className="py-1.5 px-2.5 bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 text-xs font-bold rounded-lg flex items-center justify-center gap-1 active:scale-95 transition cursor-pointer shrink-0"
                          title="Preview Game"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Preview</span>
                        </button>

                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleApproveGame(game.id, title)}
                          className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs rounded-lg flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          )}
                          <span>Approve</span>
                        </button>

                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleRejectGame(game.id, title)}
                          className="flex-1 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 disabled:opacity-50 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION C: AFFILIATE BANNER MANAGER */}
          <form onSubmit={handleAddAffiliateBanner} className="p-4 bg-[#070c17] border border-amber-500/30 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-black text-amber-400 uppercase tracking-wider">
              <ShoppingBag className="w-4 h-4 text-amber-400" />
              SECTION C: Affiliate Banner Manager (Daraz)
            </div>
            <p className="text-[10px] text-slate-400">
              Saves to Firestore collection <code className="text-amber-400 font-mono">king_affiliates</code>. Shows on Home Top Auto-Sliding Carousel.
            </p>

            {/* 1. Affiliate Link */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300">
                Affiliate Link (Daraz / Store) <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={affiliateLink}
                onChange={(e) => {
                  setAffiliateLink(e.target.value);
                  if (e.target.value.length > 10) {
                    handleFetchAffiliateImage(e.target.value);
                  }
                }}
                placeholder="https://click.daraz.pk/e/_..."
                className="w-full bg-[#03060d] border border-gray-800 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            {/* 2. Banner Title */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300">Banner Title / Offer Text:</label>
              <input
                type="text"
                value={affiliateTitle}
                onChange={(e) => setAffiliateTitle(e.target.value)}
                placeholder="e.g. Best Gaming Headphones - 50% OFF"
                className="w-full bg-[#03060d] border border-gray-800 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* 3. Banner Image URL & Upload */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300">
                Banner Image <span className="text-slate-500 text-[10px] font-normal">(Auto-fetched, URL or Upload)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={affiliateImage}
                  onChange={(e) => setAffiliateImage(e.target.value)}
                  placeholder="https://images.unsplash.com/... or auto-fetched"
                  className="flex-1 bg-[#03060d] border border-gray-800 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                />
                <label className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl cursor-pointer flex items-center justify-center shrink-0">
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (reader.result) {
                            setAffiliateImage(reader.result as string);
                            showToast('Banner image selected! 🖼️');
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Preview Banner */}
            {affiliateImage && (
              <div className="relative h-24 w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                <img
                  src={affiliateImage}
                  alt="Affiliate Preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2">
                  <span className="text-[10px] text-amber-300 font-bold truncate">
                    {affiliateTitle || 'Daraz Offer Preview'}
                  </span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingAffiliate || !affiliateLink.trim()}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {isSavingAffiliate ? 'Saving Banner...' : 'Add Affiliate Banner to Home Slider'}
            </button>
          </form>

            {/* SECTION E: USER GAME UPLOADS REVIEW */}
            {auth.currentUser?.email === 'waqaahmad1230@gmail.com' && (
              <UserGameUploadsSection />
            )}

            {/* SECTION D: ADMIN USER LIST */}
            {auth.currentUser?.email === 'waqaahmad1230@gmail.com' && (
              <div className="p-4 bg-[#070c17] border border-rose-500/30 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-black text-rose-400 uppercase tracking-wider">
                  <UserCheck className="w-4 h-4 text-rose-400" />
                  SECTION D: Admin User List
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {users.length > 0 ? users.map((user) => (
                    <div key={user.id} className="p-2 bg-[#03060d] rounded-lg border border-slate-800 flex items-center gap-2">
                      <img src={user.photoURL || 'https://i.pravatar.cc/150'} className="w-8 h-8 rounded-full" />
                      <div className="text-[10px] text-white">
                        <div className="font-bold">{user.name}</div>
                        <div className="text-slate-400">{user.email}</div>
                      </div>
                    </div>
                  )) : <div className="text-[10px] text-slate-500">Loading users...</div>}
                </div>
              </div>
            )}

            {/* SECTION F: Catalog Products Manager */}
            {auth.currentUser?.email === 'waqaahmad1230@gmail.com' && (
              <CatalogAdminSection showToast={showToast} />
            )}
        </div>
      </div>

      {/* Helper Component for Section E */}
      <UserGameUploadsComponent showToast={showToast} />

      {/* GAME PREVIEW MODAL */}
      {previewModalGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#0b1220] border-2 border-emerald-500 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-3 bg-black border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">🎮</span>
                <div>
                  <h4 className="text-xs font-black text-white truncate max-w-[250px]">
                    {previewModalGame.title}
                  </h4>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    GamePix Feed Preview (Property: PN8G3)
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

            {/* Game Iframe */}
            <div className="flex-1 w-full bg-black relative min-h-[380px]">
              <iframe
                src={previewModalGame.url}
                title={previewModalGame.title}
                className="w-full h-full min-h-[380px] border-none"
                allow="autoplay; fullscreen; gamepad"
              />
            </div>

            {/* Footer Actions */}
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
                  handleApproveGame(g.id, g.title || g.name || 'Game');
                }}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black rounded-xl cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-95 transition"
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


