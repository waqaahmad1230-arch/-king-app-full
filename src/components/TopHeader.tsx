import React, { useState, useEffect, useRef } from 'react';
import { Search, Mic, Plus } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import kingLogo from '../assets/king-logo.png';
import {
  CATALOG_LAST_SEEN_KEY,
  CATALOG_SEEN_EVENT,
  getCatalogLastSeenAt,
  subscribeNewCatalogProductCount,
} from '../services/catalogService';

interface TopHeaderProps {
  user?: FirebaseUser | null;
  fixed?: boolean;
  lightMode?: boolean;
  onOpenQR: () => void;
  onOpenSearch: () => void;
  onOpenPost?: () => void;
  onOpenVoice: () => void;
  onOpenProfile: () => void;
  onOpenCatalog?: () => void;
  onOpenSecretAdminTrigger?: () => void;
}

export default function TopHeader({
  user: propUser,
  fixed = false,
  lightMode = false,
  onOpenQR,
  onOpenSearch,
  onOpenPost,
  onOpenVoice,
  onOpenProfile,
  onOpenCatalog,
  onOpenSecretAdminTrigger,
}: TopHeaderProps) {
  const { user: authUser, loginWithGoogle, openAuthModal, logout } = useAuth();
  const user = propUser !== undefined ? (authUser || propUser) : authUser;

  const [tapCount, setTapCount] = useState(0);
  const [avatarError, setAvatarError] = useState(false);
  const [catalogLastSeenAt, setCatalogLastSeenAt] = useState<string>(() => getCatalogLastSeenAt());
  const [newProductCount, setNewProductCount] = useState<number>(0);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.photoURL]);

  useEffect(() => {
    const handleCatalogSeen = (event: Event) => {
      const customEvent = event as CustomEvent<{ timestamp?: string }>;
      const nextTimestamp = customEvent.detail?.timestamp || getCatalogLastSeenAt();
      setCatalogLastSeenAt(nextTimestamp);
      setNewProductCount(0);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === CATALOG_LAST_SEEN_KEY) {
        setCatalogLastSeenAt(getCatalogLastSeenAt());
      }
    };

    window.addEventListener(CATALOG_SEEN_EVENT, handleCatalogSeen);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(CATALOG_SEEN_EVENT, handleCatalogSeen);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeNewCatalogProductCount(catalogLastSeenAt, (count) => {
      setNewProductCount(count);
    });
    return () => unsubscribe();
  }, [catalogLastSeenAt]);

  const handleLogoClick = () => {
    const next = tapCount + 1;

    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    if (next >= 5) {
      setTapCount(0);
      if (onOpenSecretAdminTrigger) {
        onOpenSecretAdminTrigger();
      }
    } else {
      setTapCount(next);
      tapTimerRef.current = setTimeout(() => {
        setTapCount(0);
      }, 3000);
    }
  };

  const handleTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      if (onOpenSecretAdminTrigger) onOpenSecretAdminTrigger();
    }, 2000);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  };

  const handleGoogleLoginClick = async () => {
    try {
      await loginWithGoogle();
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/user-cancelled' ||
        err?.code === 'auth/cancelled-popup-request'
      ) {
        return;
      }
      console.warn("Google login notice:", err?.message || err);
      // Fallback to open modal if popup was blocked
      openAuthModal('login');
    }
  };

  const handleEmailLoginClick = () => {
    openAuthModal('login');
  };

  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsSearchExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'KING User';
  const emailText = user?.email || '';
  const uidText = user?.uid || '';

  return (
    <header
      className={`${
        fixed ? 'fixed top-0 left-0 right-0 z-30' : 'relative z-20'
      } w-full px-2.5 sm:px-3 py-2.5 m-0 backdrop-blur-md transition-colors select-none ${
        lightMode
          ? 'bg-white/95 border-b border-slate-200 text-slate-900 shadow-sm'
          : 'bg-gradient-to-r from-[#050b14] via-[#091122] to-[#0a101d] border-b border-slate-800/80 shadow-xl shadow-black/40'
      }`}
    >
      <div className="w-full flex items-center justify-between gap-1.5 min-w-0">
        {/* Left Section: Logo Badge + KING Title + SHOP Button */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink">
          <div
            onClick={handleLogoClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            title="KING App (Tap 5 times for Secret Admin)"
            className="flex items-center gap-1.5 cursor-pointer active:scale-95 transition shrink-0"
          >
            {/* Logo Emblem & KING Text */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-[#1877F2] border border-amber-400/70 overflow-hidden shadow-sm flex items-center justify-center p-0.5 shrink-0">
                <img src="/logo.png" alt="KING Logo" className="w-full h-full object-cover rounded-lg" />
              </div>
              <span
                className={`text-xl font-black italic tracking-wider uppercase shrink-0 ${
                  lightMode
                    ? 'text-[#1877F2]'
                    : 'text-transparent bg-clip-text bg-gradient-to-r from-[#FFD700] via-amber-300 to-yellow-500 drop-shadow-[0_2px_8px_rgba(255,215,0,0.4)]'
                }`}
              >
                KING
              </span>
            </div>
          </div>

          {/* SHOP Pill Button immediately beside KING logo */}
          {onOpenCatalog && (
            <button
              type="button"
              onClick={onOpenCatalog}
              title="Open KING SHOP Catalog"
              className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-full active:scale-95 transition cursor-pointer shrink-0 ${
                lightMode
                  ? 'bg-amber-50 border border-amber-400 text-amber-800 hover:bg-amber-100 shadow-sm'
                  : 'bg-[#1a1a1a] border border-[#D4AF37] text-[#D4AF37] hover:bg-neutral-900 shadow-sm shadow-amber-950/30'
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-[#1E2FFF] border border-[#D4AF37] overflow-hidden flex items-center justify-center shrink-0">
                <img src={kingLogo} alt="KING SHOP" className="w-full h-full object-cover" />
              </div>
              <span className="text-[11px] font-bold tracking-wide uppercase shrink-0 whitespace-nowrap">SHOP</span>
              {newProductCount > 0 && (
                <span
                  aria-label={`${newProductCount} new catalog products`}
                  className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF0000] text-white text-[10px] font-black leading-none flex items-center justify-center shadow-md pointer-events-none ${
                    lightMode ? 'ring-2 ring-white' : 'ring-2 ring-[#091122]'
                  }`}
                >
                  {newProductCount > 9 ? '9+' : newProductCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Right Action Icons: QR (Amber), Search (Blue), Post (+), Voice (Red), Profile */}
        <div ref={containerRef} className="flex items-center shrink-0">
          {/* Amber QR Code Button (Hidden until search expanded) */}
          <div className={`transition-all duration-300 ease-in-out overflow-hidden flex items-center shrink-0 ${isSearchExpanded ? 'w-9 mr-1.5 opacity-100 scale-100' : 'w-0 mr-0 opacity-0 scale-75 pointer-events-none'}`}>
            <button
              onClick={onOpenQR}
              aria-label="QR Scanner"
              className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center active:scale-95 transition-all cursor-pointer ${
                lightMode
                  ? 'bg-amber-50 border border-amber-300 text-amber-600 hover:bg-amber-100'
                  : 'bg-[#24190f] border border-amber-500/30 text-amber-500 hover:bg-[#332213] hover:border-amber-400/50 hover:text-amber-400 shadow-sm shadow-amber-950/20'
              }`}
            >
              <div className="relative">
                <div className="w-4 h-4 grid grid-cols-2 gap-0.5 p-0.5">
                  <div className="w-1.5 h-1.5 border-[1.5px] border-amber-500 rounded-[1px] flex items-center justify-center">
                    <div className="w-0.5 h-0.5 bg-amber-500 rounded-[0.5px]" />
                  </div>
                  <div className="w-1.5 h-1.5 border-[1.5px] border-amber-500 rounded-[1px] flex items-center justify-center">
                    <div className="w-0.5 h-0.5 bg-amber-500 rounded-[0.5px]" />
                  </div>
                  <div className="w-1.5 h-1.5 border-[1.5px] border-amber-500 rounded-[1px] flex items-center justify-center">
                    <div className="w-0.5 h-0.5 bg-amber-500 rounded-[0.5px]" />
                  </div>
                  <div className="w-1.5 h-1.5 flex flex-col justify-between p-[1px]">
                    <div className="w-1 h-0.5 bg-amber-500" />
                    <div className="w-0.5 h-0.5 bg-amber-500 ml-auto" />
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* Blue Search Button (Always visible) */}
          <button
            onClick={() => {
              if (!isSearchExpanded) {
                setIsSearchExpanded(true);
              }
              onOpenSearch();
            }}
            aria-label="Search"
            className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center active:scale-95 transition-all cursor-pointer ${
              lightMode
                ? 'bg-slate-100 border border-slate-200 text-[#1877F2] hover:bg-blue-50 hover:border-blue-300'
                : 'bg-[#0d182b] border border-blue-500/30 text-[#38bdf8] hover:bg-[#13233f] hover:border-blue-400/50 hover:text-sky-300 shadow-sm shadow-blue-950/20'
            }`}
          >
            <Search className="w-4 h-4" strokeWidth={2.3} />
          </button>

          {/* Small Blue Post (+) Button beside Search */}
          {onOpenPost && (
            <button
              type="button"
              onClick={onOpenPost}
              aria-label="Create Post"
              title="Post Photo or Video"
              className={`w-9 h-9 ml-1.5 shrink-0 rounded-xl flex items-center justify-center active:scale-95 transition-all cursor-pointer ${
                lightMode
                  ? 'bg-[#1877F2] border border-[#1877F2] text-white hover:bg-[#166FE5] shadow-sm'
                  : 'bg-[#0b2347] border border-blue-400/50 text-[#38bdf8] hover:bg-[#1d4ed8] hover:text-white hover:border-blue-300 shadow-sm shadow-blue-950/30'
              }`}
            >
              <Plus className="w-4 h-4" strokeWidth={2.6} />
            </button>
          )}

          {/* Red/Crimson Voice Mic Button (Hidden until search expanded) */}
          <div className={`transition-all duration-300 ease-in-out overflow-hidden flex items-center shrink-0 ${isSearchExpanded ? 'w-9 ml-1.5 opacity-100 scale-100' : 'w-0 ml-0 opacity-0 scale-75 pointer-events-none'}`}>
            <button
              onClick={onOpenVoice}
              aria-label="Voice Search"
              className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center active:scale-95 transition-all cursor-pointer ${
                lightMode
                  ? 'bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100'
                  : 'bg-[#281117] border border-red-500/30 text-[#ef4444] hover:bg-[#38161f] hover:border-red-400/50 hover:text-red-400 shadow-sm shadow-red-950/20'
              }`}
            >
              <Mic className="w-4 h-4" strokeWidth={2.2} />
            </button>
          </div>

          {/* Profile Avatar / Settings */}
          <div
            onClick={onOpenProfile}
            className="relative cursor-pointer group select-none ml-1.5 shrink-0"
            aria-label="Profile Account"
          >
            <div
              className={`w-9 h-9 rounded-full overflow-hidden p-[1px] group-hover:scale-105 transition-transform shrink-0 ${
                lightMode
                  ? 'border border-slate-300 bg-slate-100 shadow-sm'
                  : 'border border-slate-700/80 bg-gradient-to-tr from-amber-500/30 via-slate-800 to-cyan-500/30 shadow-md shadow-black/40'
              }`}
            >
              <div
                className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center ${
                  lightMode ? 'bg-slate-200' : 'bg-slate-900'
                }`}
              >
                {user?.photoURL && !avatarError && !user.photoURL.includes('HsTZSDw4avx') && !user.photoURL.includes('static.xx.fbcdn.net/rsrc.php') ? (
                  <img
                    src={user.photoURL}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <div
                    className={`w-full h-full flex items-center justify-center font-bold text-xs ${
                      lightMode
                        ? 'bg-blue-100 text-[#1877F2]'
                        : 'text-amber-300 bg-gradient-to-br from-amber-900/60 to-slate-900'
                    }`}
                  >
                    {(displayName || 'K').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
            {user && (
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 rounded-full ${
                  lightMode ? 'border-white' : 'border-[#091122]'
                }`}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
