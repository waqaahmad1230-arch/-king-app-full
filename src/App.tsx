import React, { useState, useEffect } from 'react';
import { Home, Gamepad2, Play, Library } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import PrivacyPolicy from './pages/PrivacyPolicy';

import TopHeader from './components/TopHeader';
import HomeView from './components/HomeView';
import GamesView from './components/GamesView';
import GamePixZoneView from './components/GamePixZoneView';
import VideosView from './components/VideosView';
import LibraryView from './components/LibraryView';
import CatalogView from './components/CatalogView';

import QRScannerModal from './components/QRScannerModal';
import SearchModal from './components/SearchModal';
import VoiceModal from './components/VoiceModal';
import MyKINGChannel from './components/MyKINGChannel';
import SecretAdminPanel from './components/SecretAdminPanel';
import AuthModal from './components/AuthModal';

import GamingBottomBar from './components/GamingBottomBar';
import BottomNavigation from './components/BottomNavigation';

export default function App() {
  const { user, isAuthModalOpen, closeAuthModal } = useAuth();

  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const [activeTab, setActiveTab] = useState<string>(() => {
    const path = typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '';
    const videoParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('video') : null;
    if (videoParam) return 'VIDEOS';
    if (path === '/gamepix') return 'GAMEPIX';
    if (path === '/catalog' || path === '/shop') return 'CATALOG';
    if (path === '/privacy-policy') return 'PRIVACY_POLICY';
    return 'HOME';
  });
  const [gamingTab, setGamingTab] = useState<string>('LOBBY');

  React.useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      if (path === '/gamepix') {
        setActiveTab('GAMEPIX');
      } else if (path === '/catalog' || path === '/shop') {
        setActiveTab('CATALOG');
      } else {
        setActiveTab('HOME');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [isQROpen, setIsQROpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [viewingProfileUserId, setViewingProfileUserId] = useState<string | null>(null);
  const [isVideoFullScreen, setIsVideoFullScreen] = useState(false);

  useEffect(() => {
    if (activeTab.toUpperCase() !== 'VIDEOS' || isProfileOpen) {
      setIsVideoFullScreen(false);
    }
  }, [activeTab, isProfileOpen]);

  const [isSecretCodeModalOpen, setIsSecretCodeModalOpen] = useState(false);
  const [isSecretAdminOpen, setIsSecretAdminOpen] = useState(false);
  const [secretCodeInput, setSecretCodeInput] = useState('');
  const [secretError, setSecretError] = useState('');

  const handleUnlockSecretAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (secretCodeInput.trim() === '1234') {
      setIsSecretCodeModalOpen(false);
      setSecretCodeInput('');
      setSecretError('');
      setIsSecretAdminOpen(true);
    } else {
      setSecretError('Wrong Code!');
    }
  };

  const renderContent = () => {
    switch (activeTab.toUpperCase()) {
      case 'HOME':
        return <HomeView onOpenQR={() => setIsQROpen(true)} onOpenTab={(tab) => setActiveTab(tab)} />;
      case 'GAMEPIX':
        return (
          <GamePixZoneView
            onBack={() => {
              setActiveTab('GAMES');
              if (window.location.pathname.toLowerCase() === '/gamepix') {
                window.history.pushState({}, '', '/');
              }
            }}
          />
        );
      case 'GAMES':
        return (
          <GamesView
            gamingTab={gamingTab}
            onSelectGamingTab={(tab) => setGamingTab(tab)}
            onOpenGamePix={() => {
              setActiveTab('GAMEPIX');
              window.history.pushState({}, '', '/gamepix');
            }}
          />
        );
      case 'VIDEOS':
        return (
          <VideosView
            currentTab={activeTab}
            isInVideoSection={activeTab.toUpperCase() === 'VIDEOS' && !isProfileOpen && !isSecretAdminOpen}
            onOpenCreatorProfile={(creatorUid) => {
              setViewingProfileUserId(creatorUid);
              setIsProfileOpen(true);
            }}
            onFullScreenChange={(isFullScreen) => setIsVideoFullScreen(isFullScreen)}
          />
        );
      case 'MOBILE':
      case 'LIBRARY':
        return <LibraryView />;
      case 'CATALOG':
      case 'SHOP':
        return (
          <CatalogView
            onBackToHome={() => {
              setActiveTab('HOME');
              if (['/catalog', '/shop'].includes(window.location.pathname.toLowerCase())) {
                window.history.replaceState({}, '', '/');
              }
            }}
            onOpenSecretAdminTrigger={() => setIsSecretCodeModalOpen(true)}
          />
        );
      case 'PRIVACY_POLICY':
        return <PrivacyPolicy />;
      default:
        return <HomeView onOpenQR={() => setIsQROpen(true)} onOpenTab={(tab) => setActiveTab(tab)} />;
    }
  };

  if (showSplash) {
    return (
      <div className="fixed inset-0 z-50 bg-[#1E2FFF] flex flex-col items-center justify-center p-4 text-center animate-in fade-in duration-500 select-none">
        <div className="w-28 h-28 rounded-3xl bg-black/30 border-2 border-[#FFD700] shadow-[0_0_30px_rgba(255,215,0,0.5)] overflow-hidden p-1 mb-5 flex items-center justify-center animate-bounce">
          <img src="/logo.png" alt="KING Logo" className="w-full h-full object-cover rounded-2xl" />
        </div>
        <h1 className="text-3xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#FFD700] via-amber-200 to-yellow-500 uppercase drop-shadow-[0_2px_10px_rgba(255,215,0,0.6)]">
          KING
        </h1>
        <p className="text-xs font-bold text-amber-200 tracking-wider uppercase mt-2 opacity-90">
          Loading Gaming & Entertainment Vault...
        </p>
      </div>
    );
  }

  const isCatalogPage =
    activeTab.toUpperCase() === 'CATALOG' || activeTab.toUpperCase() === 'SHOP';
  const hideHeaderForFullScreenVideo = activeTab.toUpperCase() === 'VIDEOS' && isVideoFullScreen;

  return (
    <div className={`app-container min-h-screen m-0 p-0 ${isCatalogPage ? 'bg-[#0A0A0A]' : 'bg-[#040812]'} text-white flex flex-col font-sans selection:bg-cyan-500/30`}>
      
      {activeTab.toUpperCase() === 'GAMEPIX' || isCatalogPage || hideHeaderForFullScreenVideo ? null : activeTab.toUpperCase() === 'GAMES' ? (
        <div className="bg-black border-b-2 border-green-500 p-3 max-w-md mx-auto w-full sticky top-0 z-30">
          {gamingTab === 'PLAYZONE' ? (
            <div className="flex items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => setGamingTab('LOBBY')}
                className="text-xs text-slate-300 hover:text-white flex items-center gap-1 font-bold bg-zinc-900/90 px-3 py-2 rounded-xl border border-zinc-800 cursor-pointer active:scale-95 transition flex-shrink-0 shadow"
              >
                ← Back
              </button>

              <div className="flex items-center gap-2 bg-emerald-500/15 border-2 border-emerald-400 px-3.5 py-1.5 rounded-xl shadow-[0_0_15px_rgba(0,255,136,0.35)]">
                <span className="text-base leading-none">🎮</span>
                <div className="text-left">
                  <span className="text-xs sm:text-sm font-black tracking-wider text-green-400 uppercase leading-none block">
                    PLAY GAMES
                  </span>
                  <span className="text-[9px] text-emerald-300 font-bold block mt-0.5">
                    No Install • Only Play
                  </span>
                </div>
              </div>

              <div 
                onClick={() => {
                  setViewingProfileUserId(null);
                  setIsProfileOpen(true);
                }}
                className="relative cursor-pointer group select-none flex-shrink-0"
              >
                <div className="w-10 h-10 rounded-xl overflow-hidden border border-green-500/60 bg-gradient-to-tr from-green-500/30 via-slate-800 to-emerald-500/30 p-[1px] shadow-md shadow-black/40 group-hover:scale-105 transition-transform">
                  <div className="w-full h-full rounded-[10px] overflow-hidden bg-slate-900 flex items-center justify-center">
                    {user?.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'User'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-green-400 font-bold text-sm bg-gradient-to-br from-green-950 to-slate-900">
                        👑
                      </div>
                    )}
                  </div>
                </div>
                {user && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-black rounded-full shadow-sm shadow-emerald-500/60 ring-1 ring-emerald-400/30" />
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => setActiveTab('HOME')}
                className="text-xs text-slate-300 hover:text-white flex items-center gap-1 font-bold bg-zinc-900/90 px-3 py-2 rounded-xl border border-zinc-800 cursor-pointer active:scale-95 transition flex-shrink-0 shadow"
              >
                ← Back
              </button>

              <div className="text-xs font-black text-green-400 tracking-wider uppercase">
                KING Games Lobby
              </div>
              
              <div 
                onClick={() => {
                  setViewingProfileUserId(null);
                  setIsProfileOpen(true);
                }}
                className="relative cursor-pointer group select-none flex-shrink-0"
              >
                <div className="w-10 h-10 rounded-xl overflow-hidden border border-green-500/60 bg-gradient-to-tr from-green-500/30 via-slate-800 to-emerald-500/30 p-[1px] shadow-md shadow-black/40 group-hover:scale-105 transition-transform">
                  <div className="w-full h-full rounded-[10px] overflow-hidden bg-slate-900 flex items-center justify-center">
                    {user?.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'User'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-green-400 font-bold text-sm bg-gradient-to-br from-green-950 to-slate-900">
                        👑
                      </div>
                    )}
                  </div>
                </div>
                {user && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-black rounded-full shadow-sm shadow-emerald-500/60 ring-1 ring-emerald-400/30" />
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <TopHeader
          user={user}
          onOpenQR={() => setIsQROpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenVoice={() => setIsVoiceOpen(true)}
          onOpenCatalog={() => {
            setActiveTab('CATALOG');
            if (window.location.pathname.toLowerCase() !== '/catalog') {
              window.history.pushState({}, '', '/catalog');
            }
          }}
          onOpenProfile={() => {
            setViewingProfileUserId(null);
            setIsProfileOpen(true);
          }}
          onOpenSecretAdminTrigger={() => setIsSecretCodeModalOpen(true)}
        />
      )}

      <main className={`flex-1 max-w-md mx-auto w-full pt-0 mt-0 ${isCatalogPage ? '' : 'overflow-y-auto'}`}>
        {renderContent()}
      </main>

      {hideHeaderForFullScreenVideo ? null : activeTab.toUpperCase() === 'GAMES' ? (
        <GamingBottomBar
          active={gamingTab}
          setActive={(tab: string) => {
            setGamingTab(tab);
            if (tab === 'WALLET') {
              setActiveTab('LIBRARY');
            } else if (tab === 'PLAYZONE') {
              const el = document.getElementById('play-games-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }
          }}
        />
      ) : (
        <BottomNavigation
          activeTab={activeTab === 'GAMEPIX' ? 'GAMES' : activeTab}
          setActiveTab={(tab) => {
            setIsVideoFullScreen(false);
            setActiveTab(tab);
            const currentPath = window.location.pathname.toLowerCase();
            if (currentPath === '/gamepix' || currentPath === '/catalog' || currentPath === '/shop') {
              window.history.pushState({}, '', '/');
            }
          }}
        />
      )}

      <QRScannerModal
        isOpen={isQROpen}
        onClose={() => setIsQROpen(false)}
      />

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onOpenQR={() => {
          setIsSearchOpen(false);
          setIsQROpen(true);
        }}
        onOpenVoice={() => {
          setIsSearchOpen(false);
          setIsVoiceOpen(true);
        }}
      />

      <VoiceModal
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
      />

      <MyKINGChannel
        isOpen={isProfileOpen}
        onClose={() => {
          setIsProfileOpen(false);
          setViewingProfileUserId(null);
        }}
        currentUser={user}
        profileUserId={viewingProfileUserId}
        onOpenTab={(tab) => {
          setActiveTab(tab);
          setIsProfileOpen(false);
          setViewingProfileUserId(null);
        }}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
      />

      {isSecretCodeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-[#0c1424] border border-amber-500/50 rounded-3xl p-5 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto text-xl">
              👑
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Enter KING Secret Code</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Secret Admin Access</p>
            </div>

            <form onSubmit={handleUnlockSecretAdmin} className="space-y-3">
              <input
                type="password"
                value={secretCodeInput}
                onChange={(e) => setSecretCodeInput(e.target.value)}
                placeholder="Enter Code (1234)"
                maxLength={8}
                className="w-full bg-[#040813] border border-gray-800 focus:border-amber-500 text-white text-center font-mono font-black text-lg py-2.5 rounded-xl focus:outline-none"
                autoFocus
              />

              {secretError && (
                <div className="text-xs text-red-400 font-bold">{secretError}</div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsSecretCodeModalOpen(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-black rounded-xl shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SecretAdminPanel
        isOpen={isSecretAdminOpen}
        onClose={() => setIsSecretAdminOpen(false)}
      />
      
    </div>
  );
}
