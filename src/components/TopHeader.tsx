import React, { useState, useEffect, useRef } from 'react';
import { Search, Mic } from 'lucide-react';
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
  onOpenQR: () => void;
  onOpenSearch: () => void;
  onOpenVoice: () => void;
  onOpenProfile: () => void;
  onOpenCatalog?: () => void;
  onOpenSecretAdminTrigger?: () => void;
}

export default function TopHeader({
  user: propUser,
  onOpenQR,
  onOpenSearch,
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
    <header className="king-sticky-top-header sticky top-0 left-0 right-0 z-[100] w-full bg-gradient-to-r from-[#050b14] via-[#091122] to-[#0a101d] border-b border-slate-800/80 px-3 py-2.5 m-0 shadow-xl shadow-black/40 backdrop-blur-md">
      <div className="max-w-md mx-auto w-full flex flex-col justify-center">
        
        {/* Top Bar Row */}
        <div className="flex items-center justify-between gap-1.5">
          {/* Left Section: Logo Badge + AI KING Title + CATALOG Icon */}
          <div className="flex items-center gap-2">
            <div
              onClick={handleLogoClick}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              title="KING App (Tap 5 times for Secret Admin)"
              className="flex items-center gap-1.5 select-none cursor-pointer active:scale-95 transition"
            >
              {/* New Logo Emblem & KING Text */}
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-[#1E2FFF] border border-[#FFD700]/50 overflow-hidden shadow-lg shadow-blue-900/50 flex items-center justify-center p-0.5">
                  <img src="/logo.png" alt="KING Logo" className="w-full h-full object-cover rounded-xl" />
                </div>
                <span className="text-xl font-black italic tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#FFD700] via-amber-300 to-yellow-500 uppercase drop-shadow-[0_2px_8px_rgba(255,215,0,0.4)]">
                  KING
                </span>
              </div>
            </div>

            {/* SHOP Pill Button immediately beside KING logo (Hidden inside Catalog page) */}
            {onOpenCatalog && (
              <button
                type="button"
                onClick={onOpenCatalog}
                title="Open KING SHOP Catalog"
                className="relative flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#D4AF37] text-[#D4AF37] hover:bg-neutral-900 active:scale-95 transition shadow-sm shadow-amber-950/30 cursor-pointer shrink-0"
              >
                <div className="w-[28px] h-[28px] rounded-full bg-[#1E2FFF] border border-[#D4AF37] overflow-hidden flex items-center justify-center shrink-0">
                  <img src={kingLogo} alt="KING SHOP" className="w-full h-full object-cover" />
                </div>
                <span className="text-xs font-bold tracking-wide uppercase text-[#D4AF37]">SHOP</span>
                {newProductCount > 0 && (
                  <span
                    aria-label={`${newProductCount} new catalog products`}
                    className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF0000] text-white text-[10px] font-black leading-none flex items-center justify-center shadow-md shadow-red-900/60 ring-2 ring-[#091122] pointer-events-none"
                  >
                    {newProductCount > 9 ? '9+' : newProductCount}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Middle/Action Icons: QR (Amber), Search (Blue), Voice (Red), Profile */}
          <div ref={containerRef} className="flex items-center gap-1.5">
              {/* Amber QR Code Button (Left - Hidden until search expanded) */}
              <div className={`transition-all duration-300 ease-in-out overflow-hidden flex items-center ${isSearchExpanded ? 'w-9 opacity-100 scale-100' : 'w-0 opacity-0 scale-75 pointer-events-none'}`}>
                <button
                  onClick={onOpenQR}
                  aria-label="QR Scanner"
                  className="w-9 h-9 shrink-0 rounded-xl bg-[#24190f] border border-amber-500/30 flex items-center justify-center text-amber-500 hover:bg-[#332213] hover:border-amber-400/50 hover:text-amber-400 active:scale-95 transition-all shadow-sm shadow-amber-950/20 cursor-pointer"
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

              {/* Blue Search Button (Middle - Always visible) */}
              <button
                onClick={() => {
                  if (!isSearchExpanded) {
                    setIsSearchExpanded(true);
                  }
                  onOpenSearch();
                }}
                aria-label="Search"
                className="w-9 h-9 shrink-0 rounded-xl bg-[#0d182b] border border-blue-500/30 flex items-center justify-center text-[#38bdf8] hover:bg-[#13233f] hover:border-blue-400/50 hover:text-sky-300 active:scale-95 transition-all shadow-sm shadow-blue-950/20 cursor-pointer"
              >
                <Search className="w-4 h-4" strokeWidth={2.3} />
              </button>

              {/* Red/Crimson Voice Mic Button (Right - Hidden until search expanded) */}
              <div className={`transition-all duration-300 ease-in-out overflow-hidden flex items-center ${isSearchExpanded ? 'w-9 opacity-100 scale-100' : 'w-0 opacity-0 scale-75 pointer-events-none'}`}>
                <button
                  onClick={onOpenVoice}
                  aria-label="Voice Search"
                  className="w-9 h-9 shrink-0 rounded-xl bg-[#281117] border border-red-500/30 flex items-center justify-center text-[#ef4444] hover:bg-[#38161f] hover:border-red-400/50 hover:text-red-400 active:scale-95 transition-all shadow-sm shadow-red-950/20 cursor-pointer"
                >
                  <Mic className="w-4 h-4" strokeWidth={2.2} />
                </button>
              </div>

              {/* Profile Avatar / Settings */}
              <div 
                onClick={onOpenProfile}
                className="relative cursor-pointer group select-none ml-0.5 shrink-0"
                aria-label="Profile Account"
              >
                <div className="w-9 h-9 rounded-xl overflow-hidden border border-slate-700/80 bg-gradient-to-tr from-amber-500/30 via-slate-800 to-cyan-500/30 p-[1px] shadow-md shadow-black/40 group-hover:scale-105 transition-transform">
                  <div className="w-full h-full rounded-[11px] overflow-hidden bg-slate-900 flex items-center justify-center">
                    {user?.photoURL && !avatarError && !user.photoURL.includes('HsTZSDw4avx') && !user.photoURL.includes('static.xx.fbcdn.net/rsrc.php') ? (
                      <img
                        src={user.photoURL}
                        alt={displayName}
                        className="w-full h-full object-cover"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-amber-300 font-bold text-xs bg-gradient-to-br from-amber-900/60 to-slate-900">
                        👑
                      </div>
                    )}
                  </div>
                </div>
                {user && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#091122] rounded-full shadow-sm shadow-emerald-500/60 ring-1 ring-emerald-400/30" />
                )}
              </div>
            </div>
        </div>

      </div>
    </header>
  );
}
