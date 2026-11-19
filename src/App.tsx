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
import WatchPage from './components/WatchPage';

import QRScannerModal from './components/QRScannerModal';
import SearchModal from './components/SearchModal';
import VoiceModal from './components/VoiceModal';
import MyKINGChannel from './components/MyKINGChannel';
import SecretAdminPanel from './components/SecretAdminPanel';
import AuthModal from './components/AuthModal';
import PostMediaPickerModal from './components/PostMediaPickerModal';
import PostEditorModal from './components/PostEditorModal';

import BottomNavigation from './components/BottomNavigation';

export default function App() {
  const { user, isAuthModalOpen, openAuthModal, closeAuthModal } = useAuth();

  const extractWatchVideoId = (pathname: string, search: string): string | null => {
    const match = pathname.match(/^\/watch\/([^/?#]+)/i);
    if (match && match[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
    const videoParam = new URLSearchParams(search).get('video');
    return videoParam ? videoParam.trim() : null;
  };

  const [watchVideoId, setWatchVideoId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return extractWatchVideoId(window.location.pathname, window.location.search);
  });

  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window !== 'undefined' && /^\/watch\/[^/?#]+/i.test(window.location.pathname)) {
      return false;
    }
    return true;
  });
  useEffect(() => {
    if (!showSplash) return;
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [showSplash]);

  const [activeTab, setActiveTab] = useState<string>(() => {
    const path = typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '';
    const initialWatchId = typeof window !== 'undefined'
      ? extractWatchVideoId(window.location.pathname, window.location.search)
      : null;
    if (initialWatchId) return 'WATCH';
    if (path === '/gamepix') return 'GAMEPIX';
    if (path === '/catalog' || path === '/shop') return 'CATALOG';
    if (path === '/privacy-policy') return 'PRIVACY_POLICY';
    return 'HOME';
  });
  const [gamingTab, setGamingTab] = useState<string>('LOBBY');

  React.useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      const poppedWatchId = extractWatchVideoId(window.location.pathname, window.location.search);
      if (poppedWatchId) {
        setWatchVideoId(poppedWatchId);
        setActiveTab('WATCH');
      } else if (path === '/gamepix') {
        setWatchVideoId(null);
        setActiveTab('GAMEPIX');
      } else if (path === '/catalog' || path === '/shop') {
        setWatchVideoId(null);
        setActiveTab('CATALOG');
      } else {
        setWatchVideoId(null);
        setActiveTab('HOME');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [isQROpen, setIsQROpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [watchReturnTab, setWatchReturnTab] = useState<'HOME' | 'VIDEOS'>('VIDEOS');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [viewingProfileUserId, setViewingProfileUserId] = useState<string | null>(null);
  const [isVideoFullScreen, setIsVideoFullScreen] = useState(false);
  const [isChildOverlayOpen, setIsChildOverlayOpen] = useState(false);
  const [isPostPickerOpen, setIsPostPickerOpen] = useState(false);
  const [isPostEditorOpen, setIsPostEditorOpen] = useState(false);
  const [postEditorInitialFile, setPostEditorInitialFile] = useState<File | null>(null);
  const [postSelectionKey, setPostSelectionKey] = useState(0);
  const [postToastMsg, setPostToastMsg] = useState<string | null>(null);

  const showPostToast = (msg: string) => {
    setPostToastMsg(msg);
    setTimeout(() => setPostToastMsg(null), 3500);
  };

  const handleOpenPostPicker = () => {
    if (!user) {
      openAuthModal('login');
      return;
    }
    setIsPostPickerOpen(true);
  };

  const handlePostMediaSelected = (file: File) => {
    setIsPostPickerOpen(false);
    setPostEditorInitialFile(file);
    setPostSelectionKey((k) => k + 1);
    setIsPostEditorOpen(true);
  };

  const handleOpenWatchFromHome = (videoId: string) => {
    if (!videoId) return;
    setWatchReturnTab('HOME');
    setWatchVideoId(videoId);
    setActiveTab('WATCH');
    window.history.pushState({}, '', `/watch/${encodeURIComponent(videoId)}`);
  };

  useEffect(() => {
    if (activeTab.toUpperCase() !== 'VIDEOS' || isProfileOpen) {
      setIsVideoFullScreen(false);
    }
  }, [activeTab, isProfileOpen]);

  useEffect(() => {
    setIsChildOverlayOpen(false);
  }, [activeTab]);

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
        return (
          <HomeView
            onOpenQR={() => setIsQROpen(true)}
            onOpenWatchVideo={handleOpenWatchFromHome}
            onFullScreenOverlayChange={setIsChildOverlayOpen}
            onOpenTab={(tab) => {
              setActiveTab(tab);
              if (tab.toUpperCase() === 'CATALOG' && window.location.pathname.toLowerCase() !== '/catalog') {
                window.history.pushState({}, '', '/catalog');
              }
            }}
          />
        );
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
            onOverlayChange={setIsChildOverlayOpen}
            onOpenGamePix={() => {
              setActiveTab('GAMEPIX');
              window.history.pushState({}, '', '/gamepix');
            }}
          />
        );
      case 'WATCH':
        return (
          <WatchPage
            videoId={watchVideoId || ''}
            onBackToFeed={() => {
              setWatchVideoId(null);
              setActiveTab(watchReturnTab);
              setWatchReturnTab('VIDEOS');
              if (
                window.location.pathname.toLowerCase().startsWith('/watch') ||
                window.location.search.includes('video=')
              ) {
                window.history.pushState({}, '', '/');
              }
            }}
            onOpenCreatorProfile={(creatorUid) => {
              setViewingProfileUserId(creatorUid);
              setIsProfileOpen(true);
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
        return <LibraryView onOverlayChange={setIsChildOverlayOpen} />;
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
        return (
          <HomeView
            onOpenQR={() => setIsQROpen(true)}
            onOpenWatchVideo={handleOpenWatchFromHome}
            onFullScreenOverlayChange={setIsChildOverlayOpen}
            onOpenTab={(tab) => {
              setActiveTab(tab);
              if (tab.toUpperCase() === 'CATALOG' && window.location.pathname.toLowerCase() !== '/catalog') {
                window.history.pushState({}, '', '/catalog');
              }
            }}
          />
        );
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

  const normalizedTab = activeTab.toUpperCase();
  const isCatalogPage = normalizedTab === 'CATALOG' || normalizedTab === 'SHOP';
  const isHomeTab =
    normalizedTab === 'HOME' ||
    ![
      'GAMEPIX',
      'GAMES',
      'WATCH',
      'VIDEOS',
      'MOBILE',
      'LIBRARY',
      'CATALOG',
      'SHOP',
      'PRIVACY_POLICY',
    ].includes(normalizedTab);
  const isHeaderAllowedTab =
    isHomeTab ||
    normalizedTab === 'GAMES' ||
    normalizedTab === 'VIDEOS' ||
    normalizedTab === 'LIBRARY' ||
    normalizedTab === 'MOBILE';
  const hasAnyOverlay =
    isQROpen ||
    isSearchOpen ||
    isVoiceOpen ||
    isPostPickerOpen ||
    isPostEditorOpen ||
    isProfileOpen ||
    isAuthModalOpen ||
    isSecretCodeModalOpen ||
    isSecretAdminOpen ||
    isVideoFullScreen ||
    isChildOverlayOpen;
  const hideHeaderForFullScreenVideo =
    normalizedTab === 'WATCH' || (normalizedTab === 'VIDEOS' && isVideoFullScreen);

  return (
    <div
      className={`app-container min-h-screen m-0 p-0 ${
        isHomeTab
          ? 'bg-[#F0F2F5] text-slate-900'
          : isCatalogPage
          ? 'bg-[#0A0A0A] text-white'
          : 'bg-[#040812] text-white'
      } flex flex-col font-sans selection:bg-blue-500/20`}
    >
      {isHeaderAllowedTab && !hasAnyOverlay && (
        <TopHeader
          user={user}
          fixed={isHomeTab}
          lightMode={isHomeTab}
          onOpenQR={() => setIsQROpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenPost={handleOpenPostPicker}
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

      {hideHeaderForFullScreenVideo || isCatalogPage ? null : (
        <BottomNavigation
          activeTab={normalizedTab === 'GAMEPIX' ? 'GAMES' : activeTab}
          lightMode={isHomeTab}
          setActiveTab={(tab) => {
            setIsVideoFullScreen(false);
            setIsChildOverlayOpen(false);
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

      <PostMediaPickerModal
        isOpen={isPostPickerOpen}
        onClose={() => setIsPostPickerOpen(false)}
        onMediaSelected={handlePostMediaSelected}
      />

      <PostEditorModal
        isOpen={isPostEditorOpen}
        initialFile={postEditorInitialFile}
        selectionKey={postSelectionKey}
        onClose={() => {
          setIsPostEditorOpen(false);
          setPostEditorInitialFile(null);
        }}
        onRetake={() => {
          setIsPostPickerOpen(true);
        }}
        onPublished={(info) => {
          if (info.contentType === 'video') {
            showPostToast('Video published to Home Feed & Video Section!');
            if (activeTab.toUpperCase() !== 'HOME' && activeTab.toUpperCase() !== 'VIDEOS') {
              setActiveTab('HOME');
            }
          } else {
            showPostToast('Photo published to Home Feed!');
            if (activeTab.toUpperCase() !== 'HOME') {
              setActiveTab('HOME');
            }
          }
        }}
      />

      {postToastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[190] bg-slate-900 border border-blue-500/40 text-white font-bold text-xs px-4 py-2 rounded-full shadow-2xl animate-in fade-in">
          {postToastMsg}
        </div>
      )}
      
    </div>
  );
}
