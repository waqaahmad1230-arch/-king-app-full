import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingBag, 
  Gamepad2, 
  Film, 
  Sparkles, 
  ChevronRight, 
  Clock, 
  Flame, 
  Heart, 
  Share2, 
  Bell, 
  Play, 
  Star,
  ExternalLink,
  Download,
  Check,
  Copy
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import AdMobBannerAd from './AdMobBannerAd';
import { downloadVideoFile } from '../utils/downloadUtils';
import { GamePlayer } from './GamePlayer';
import { formatLastUpdated, DailyGame } from '../services/dailyGameSync';
import CreatorAvatar, { CreatorDisplayName } from './CreatorAvatar';
import StatusBar from './StatusBar';

interface HomeViewProps {
  onOpenQR: () => void;
  onOpenTab: (tab: 'home' | 'games' | 'videos' | 'library') => void;
}

interface AffiliateBanner {
  id: string;
  title: string;
  link: string;
  image: string;
  badge?: string;
}

const DEFAULT_DEMO_BANNERS: AffiliateBanner[] = [
  {
    id: 'demo-1',
    title: 'Daraz Grand Shopping Sale • 50% OFF Gaming Earbuds',
    link: 'https://daraz.pk',
    image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&auto=format&fit=crop&q=80',
    badge: 'Daraz 50% OFF 🛍️',
  },
  {
    id: 'demo-2',
    title: 'Cyber Gaming Headphones & RGB Accessories',
    link: 'https://daraz.pk',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
    badge: 'Flash Deal 🔥',
  },
  {
    id: 'demo-3',
    title: 'High-Speed Smart Watches & Fitness Bands Mega Deal',
    link: 'https://daraz.pk',
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
    badge: 'Exclusive Offer ⚡',
  },
];

export default function HomeView({ onOpenQR, onOpenTab }: HomeViewProps) {
  const [likedReels, setLikedReels] = useState<Record<string | number, boolean>>({});
  const [subscribed, setSubscribed] = useState<Record<string | number, boolean>>({});
  const [homeGames, setHomeGames] = useState<DailyGame[]>([]);
  const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState<number | null>(() => {
    const raw = localStorage.getItem('king_daily_games_last_update_v2');
    return raw ? Number(raw) : Date.now();
  });
  const [activeGamePlayer, setActiveGamePlayer] = useState<DailyGame | null>(null);
  const [downloadingReelId, setDownloadingReelId] = useState<string | number | null>(null);
  const [downloadedReelIds, setDownloadedReelIds] = useState<Record<string | number, boolean>>({});

  // Daraz Affiliate Banner Slider State
  const [affiliateBanners, setAffiliateBanners] = useState<AffiliateBanner[]>(DEFAULT_DEMO_BANNERS);
  const [currentSlide, setCurrentSlide] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

  // Real-time onSnapshot listener for king_affiliates collection
  useEffect(() => {
    const ref = collection(db, 'king_affiliates');
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (!snapshot.empty) {
          const list: AffiliateBanner[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            list.push({
              id: docSnap.id,
              title: data.title || 'Daraz Special Offer 🛍️',
              link: data.link || data.url || 'https://daraz.pk',
              image: data.image || 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&auto=format&fit=crop&q=80',
              badge: data.badge || 'Daraz Sale 🛍️',
            });
          });
          setAffiliateBanners(list);
          setCurrentSlide(0);
        } else {
          setAffiliateBanners(DEFAULT_DEMO_BANNERS);
        }
      },
      (err) => {
        console.warn('onSnapshot king_affiliates error:', err);
      }
    );

    return () => unsubscribe();
  }, []);

  // 3-Second Auto-Slide Timer (Smooth sliding)
  useEffect(() => {
    if (affiliateBanners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % affiliateBanners.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [affiliateBanners.length]);

  // Touch-swipe handlers
  const handleTouchStartSlide = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEndSlide = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        // Swiped Left
        setCurrentSlide((prev) => (prev + 1) % affiliateBanners.length);
      } else {
        // Swiped Right
        setCurrentSlide((prev) => (prev - 1 + affiliateBanners.length) % affiliateBanners.length);
      }
    }
    touchStartXRef.current = null;
  };

  const handleOpenAffiliateLink = (link: string) => {
    const targetUrl = link.startsWith('http') ? link : `https://${link}`;
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  // --- SECTION B: Firestore king_games collection (Approved Games only) ---
  useEffect(() => {
    let isMounted = true;

    const gamesRef = collection(db, 'king_games');
    const unsubscribe = onSnapshot(
      gamesRef,
      (snapshot) => {
        if (isMounted) {
          const firestoreGames: DailyGame[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const isApproved =
              data.status === 'approved' ||
              data.approved === true ||
              data.isApproved === true;
            const url = data.url || data.link;

            if (isApproved && url && typeof url === 'string' && url.startsWith('http')) {
              firestoreGames.push({
                id: docSnap.id,
                title: (data.title || data.name || 'KING Game').trim(),
                name: (data.name || data.title || 'KING Game').trim(),
                url,
                link: url,
                thumbnail: data.thumbnail || data.image || '',
                image: data.thumbnail || data.image || '',
                category: data.category || 'Arcade',
                source: data.source || 'KING Games',
                status: 'approved',
                approved: true,
                isApproved: true,
                featuredOnHome: true,
                isNewToday: data.isNewToday || false,
                rating: data.rating || 4.9,
                plays: data.plays || '1.5K Plays',
                addedAt: (data.createdAt?.toMillis?.()) || Date.now(),
              });
            }
          });

          setHomeGames(firestoreGames);
        }
      },
      (error) => {
        console.warn('onSnapshot king_games warning:', error);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Countdown timer for Flash Sale
  const [timeLeft, setTimeLeft] = useState({ hours: 2, minutes: 36, seconds: 40 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { ...prev, minutes: 59, seconds: 59 };
        if (prev.hours > 0) return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        return { hours: 2, minutes: 45, seconds: 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = () => {
    const h = String(timeLeft.hours).padStart(2, '0');
    const m = String(timeLeft.minutes).padStart(2, '0');
    const s = String(timeLeft.seconds).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const banners = [
    {
      title: 'Special Mobile Offer',
      subtitle: 'Flash Sale • Up to 65% OFF',
      bullets: ['Mobiles', 'Fashion', 'Electronics'],
      image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&auto=format&fit=crop&q=80',
    },
    {
      title: 'High Speed 4G Package',
      subtitle: 'Jazz & Zong Super Combo',
      bullets: ['100 GB Data', 'All-Net Mins', 'Cashback PKR 200'],
      image: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=800&auto=format&fit=crop&q=80',
    },
    {
      title: 'Wireless Gaming Earbuds',
      subtitle: 'Zero Latency • ANC Audio',
      bullets: ['48H Playtime', 'Deep Bass', 'Free Delivery'],
      image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&auto=format&fit=crop&q=80',
    },
  ];

  const [reels, setReels] = useState<any[]>([]);

  // Real-time onSnapshot listener for user uploaded videos in Firestore `videos` collection
  useEffect(() => {
    const ref = collection(db, 'videos');
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (!snapshot.empty) {
          const fetched: any[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            fetched.push({
              id: docSnap.id,
              userId: data.userId || data.uid,
              uid: data.uid || data.userId,
              title: data.title || 'User Uploaded Video',
              views: data.views || '1 view',
              duration: data.duration || '0:30',
              channel: data.channel || data.channelName || data.uploaderName || 'KING Creator',
              subscribers: '1.2K Subscribers',
              likes: data.likes || 1,
              badge: 'HD',
              thumbnail: data.thumbnail || data.thumbnailUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
              url: data.url || data.videoUrl,
              channelAvatar: data.channelAvatar || data.uploaderPhoto,
            });
          });
          setReels(fetched);
        } else {
          setReels([]);
        }
      },
      (err) => {
        console.warn('onSnapshot videos error:', err);
      }
    );

    return () => unsubscribe();
  }, []);

  const toggleLike = (id: number | string) => {
    setLikedReels((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSub = (id: number | string) => {
    setSubscribed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="pb-24 space-y-6">
      {/* KING Status Bar (Home Screen Only, Below TopHeader) */}
      <StatusBar />

      {/* 1. Daraz Affiliate Deals Auto-Sliding Carousel Section */}
      <section className="px-4 pt-1">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-600/30">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-1.5 leading-none">
                <span>Daraz</span>
                <span className="text-orange-400 italic">Affiliate Deals</span>
              </h2>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase mt-0.5">
                Exclusive Shopping Offers & Discounts
              </p>
            </div>
          </div>
          <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full animate-pulse">
            • Live 3s
          </span>
        </div>

        {/* Touch-Enabled Smooth Auto-Slider */}
        <div 
          onTouchStart={handleTouchStartSlide}
          onTouchEnd={handleTouchEndSlide}
          className="relative rounded-3xl overflow-hidden border border-amber-500/30 bg-[#0c1424] shadow-2xl shadow-orange-950/20 group select-none"
        >
          {/* Active Banner Slide */}
          {affiliateBanners.map((banner, idx) => {
            if (idx !== currentSlide) return null;
            return (
              <div 
                key={banner.id || idx}
                onClick={() => handleOpenAffiliateLink(banner.link)}
                className="relative h-64 sm:h-72 w-full overflow-hidden cursor-pointer animate-in fade-in zoom-in-95 duration-500"
              >
                <img
                  src={banner.image}
                  alt={banner.title}
                  className="w-full h-full object-cover brightness-75 group-hover:scale-105 transition duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#060c17] via-[#060c17]/60 to-transparent" />

                {/* Badge */}
                <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-gradient-to-r from-orange-600 to-amber-600 px-3 py-1 rounded-full text-white text-[11px] font-black uppercase tracking-wider shadow-lg shadow-orange-600/40">
                  <Flame className="w-3.5 h-3.5 fill-current animate-bounce" />
                  {banner.badge || 'Daraz Special 🛍️'}
                </div>

                {/* Card Overlay Content */}
                <div className="absolute bottom-5 left-4 right-4 text-left space-y-2">
                  <h3 className="text-xl sm:text-2xl font-black text-white leading-tight drop-shadow-lg line-clamp-2">
                    {banner.title}
                  </h3>

                  {/* Timer & Shop Now Button Bar */}
                  <div className="flex items-center justify-between gap-3 bg-black/70 backdrop-blur-md p-2 rounded-2xl border border-white/10">
                    <div className="flex items-center gap-2 pl-2">
                      <Clock className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-amber-400 font-bold">Limited Offer</div>
                        <div className="text-xs font-mono font-black text-white">{formatTimer()}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenAffiliateLink(banner.link);
                      }}
                      className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-orange-600/40 transition active:scale-95 flex items-center gap-1 cursor-pointer"
                    >
                      <span>SHOP NOW</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Carousel Dots Indicator */}
          <div className="flex items-center justify-center gap-1.5 py-2.5 bg-[#080e1c]">
            {affiliateBanners.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentSlide(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                  currentSlide === idx ? 'w-6 bg-orange-400 shadow-[0_0_10px_#f97316]' : 'w-2 bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>
      </section>



      {/* 3. DAILY AUTO GAMES SECTION (Every 24h 5 new games from GamePix on top) */}
      <section className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 border border-purple-400/40 flex items-center justify-center text-white shadow-md shadow-purple-600/30">
              <Gamepad2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <h2 className="text-base font-extrabold text-white">
                  DAILY GAMES
                </h2>
                <span className="text-[9px] bg-purple-500/25 text-purple-300 border border-purple-500/30 font-black px-1.5 py-0.5 rounded-full uppercase">
                  5 NEW / 24H
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase mt-0.5">
                Instant HTML5 • GamePix Property PN8G3
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Rule 3: Save last update time, show "Last Updated: Today" */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-black tracking-wide shadow-sm">
              <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse shrink-0" />
              <span>Last Updated: {formatLastUpdated(lastUpdateTimestamp)}</span>
            </div>

            <button
              onClick={() => onOpenTab('games')}
              className="text-[11px] font-bold text-slate-400 hover:text-purple-300 flex items-center gap-0.5 transition cursor-pointer"
            >
              ALL
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Game Cards Grid (Rule 4: Don't delete old games, just add new on top) */}
        <div className="grid grid-cols-2 gap-3">
          {homeGames.slice(0, 10).map((g, index) => {
            const isTopNew = index < 5 || g.isNewToday;
            const title = g.title || g.name || 'KING Game';
            const thumb = g.thumbnail || g.image;

            return (
              <div 
                key={g.id || index}
                onClick={() => setActiveGamePlayer(g)}
                className="group cursor-pointer rounded-2xl overflow-hidden border border-purple-500/30 hover:border-purple-400 bg-[#0c1322] hover:bg-[#0f172a] transition-all p-3 flex flex-col justify-between shadow-lg relative"
              >
                <div className="relative h-28 rounded-xl overflow-hidden mb-2 bg-slate-900 border border-slate-800">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 bg-slate-950">
                      <Gamepad2 className="w-6 h-6 mb-1 text-purple-400" />
                      <span className="text-[9px] font-bold text-slate-400">Play Now</span>
                    </div>
                  )}

                  {/* Badge: New Today for top 5, or Popular */}
                  {isTopNew ? (
                    <span className="absolute top-2 right-2 text-[8px] bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 text-slate-950 font-black px-2 py-0.5 rounded-full shadow-md flex items-center gap-0.5">
                      🔥 NEW TODAY
                    </span>
                  ) : (
                    <span className="absolute top-2 right-2 text-[8px] bg-purple-950/90 border border-purple-500/40 text-purple-200 font-bold px-1.5 py-0.5 rounded-full">
                      POPULAR
                    </span>
                  )}

                  {/* Play Button Overlay on Hover */}
                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/15 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="w-9 h-9 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-purple-300 truncate" title={title}>
                    {title}
                  </h4>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                    <span className="text-amber-400 font-bold flex items-center gap-0.5">
                      <Star className="w-2.5 h-2.5 fill-current" /> {g.rating || 4.9}
                    </span>
                    <span className="text-purple-300 font-semibold truncate max-w-[80px]">
                      {g.category || 'Arcade'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. KINGTUBE Reels Section */}
      <section className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-1.5 leading-none">
                <span>KINGTUBE</span>
                <span className="text-cyan-400 italic">Reels</span>
              </h2>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase mt-0.5">
                Original Uploads & KING AI Creations
              </p>
            </div>
          </div>

          <button
            onClick={() => onOpenTab('videos')}
            className="text-[11px] font-bold text-slate-400 hover:text-cyan-300 flex items-center gap-1 transition"
          >
            VIEW ALL
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Reels Video Cards */}
        <div className="space-y-4">
          {reels.length === 0 ? (
            <div className="bg-[#0b1322] border border-dashed border-slate-800 rounded-3xl p-6 text-center space-y-2">
              <Film className="w-8 h-8 text-cyan-400 mx-auto" />
              <h4 className="text-xs font-bold text-white">No Videos Uploaded Yet</h4>
              <p className="text-[10px] text-slate-400">
                Upload your first video from My KING Channel to show it here!
              </p>
            </div>
          ) : (
            reels.map((reel) => (
              <div
                key={reel.id}
                className="bg-[#0b1322] border border-slate-800 rounded-3xl overflow-hidden p-3 shadow-xl"
              >
                {/* Thumbnail Container */}
                <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 group cursor-pointer">
                  <img
                    src={reel.thumbnail}
                    alt={reel.title}
                    className="w-full h-full object-cover group-hover:scale-102 transition duration-300"
                  />
                  
                  {/* HD Badge */}
                  <span className="absolute top-3 left-3 bg-red-600 text-white font-black text-[9px] px-2 py-0.5 rounded-md uppercase">
                    {reel.badge}
                  </span>

                  {/* Duration Badge */}
                  <span className="absolute bottom-3 right-3 bg-black/80 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-sm">
                    {reel.duration}
                  </span>

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    <div className="w-12 h-12 rounded-full bg-cyan-500 text-black flex items-center justify-center shadow-lg shadow-cyan-500/50">
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>

                {/* Title & Metadata */}
                <div className="mt-3">
                  <h4 className="text-sm font-bold text-white line-clamp-1">
                    {reel.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">{reel.views}</p>
                </div>

                {/* Channel & Action Controls */}
                <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-3">
                  <div className="flex items-center gap-2">
                    <CreatorAvatar
                      uid={reel.userId || reel.uid}
                      fallbackPhoto={reel.channelAvatar}
                      fallbackName={reel.channel}
                      className="w-8 h-8 rounded-full shrink-0 overflow-hidden shadow-md border border-slate-700/60"
                    />
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1">
                        <CreatorDisplayName uid={reel.userId || reel.uid} fallback={reel.channel} />
                        <span className="text-[10px] text-cyan-400">✓</span>
                      </div>
                      <div className="text-[10px] text-slate-400">{reel.subscribers}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleSub(reel.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                      subscribed[reel.id]
                        ? 'bg-slate-800 text-slate-300'
                        : 'bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/30'
                    }`}
                  >
                    <Bell className="w-3 h-3" />
                    {subscribed[reel.id] ? 'Subscribed' : 'SUBSCRIBE'}
                  </button>
                </div>

                {/* Like, Share, Download Buttons */}
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    onClick={() => toggleLike(reel.id)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      likedReels[reel.id]
                        ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${likedReels[reel.id] ? 'fill-current text-sky-400' : ''}`} />
                    {likedReels[reel.id] ? 'Liked' : 'Like'} ({reel.likes + (likedReels[reel.id] ? 1 : 0)})
                  </button>

                  <button
                    onClick={() => alert(`Shared "${reel.title}" to clipboard!`)}
                    className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-slate-400 hover:text-white border border-slate-800 flex items-center justify-center gap-1.5 transition"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Share
                  </button>

                  {(reel.url || reel.videoUrl) && (
                    <button
                      onClick={async () => {
                        setDownloadingReelId(reel.id);
                        try {
                          await downloadVideoFile({
                            id: reel.id,
                            title: reel.title,
                            videoUrl: reel.url || reel.videoUrl,
                            thumbnailUrl: reel.thumbnail,
                          });
                          setDownloadedReelIds((prev) => ({ ...prev, [reel.id]: true }));
                          setTimeout(() => {
                            setDownloadedReelIds((prev) => ({ ...prev, [reel.id]: false }));
                          }, 3000);
                        } catch (err) {
                          console.error("Download failed:", err);
                        } finally {
                          setDownloadingReelId(null);
                        }
                      }}
                      disabled={downloadingReelId === reel.id}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                      title="Download video"
                    >
                      {downloadedReelIds[reel.id] ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Saved</span>
                        </>
                      ) : (
                        <>
                          <Download className={`w-3.5 h-3.5 ${downloadingReelId === reel.id ? 'animate-bounce' : ''}`} />
                          <span>Save</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 5. KING Movies & Cartoons */}
      <section className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-pink-600/20 border border-pink-500/40 flex items-center justify-center text-pink-400">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-1.5 leading-none">
                <span>KING</span>
                <span className="text-pink-400 italic">Movies & Cartoons</span>
              </h2>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase mt-0.5">
                Bollywood, Lollywood & Kids Stories
              </p>
            </div>
          </div>

          <button
            onClick={() => onOpenTab('videos')}
            className="text-[11px] font-bold text-slate-400 hover:text-pink-300 flex items-center gap-1 transition"
          >
            VIEW ALL
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Movie Posters preview */}
        <div className="grid grid-cols-2 gap-3">
          <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 aspect-video group">
            <img
              src="https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=400&auto=format&fit=crop&q=80"
              alt="Central Cinema"
              className="w-full h-full object-cover group-hover:scale-105 transition"
            />
            <span className="absolute top-2 left-2 bg-purple-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded">NEW</span>
            <span className="absolute top-2 right-2 bg-black/80 text-amber-400 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-current" /> 4.9
            </span>
          </div>

          <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 aspect-video group">
            <img
              src="https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&auto=format&fit=crop&q=80"
              alt="Neon Dreams"
              className="w-full h-full object-cover group-hover:scale-105 transition"
            />
            <span className="absolute top-2 left-2 bg-purple-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded">NEW</span>
            <span className="absolute top-2 right-2 bg-black/80 text-amber-400 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-current" /> 4.8
            </span>
          </div>
        </div>
      </section>

      {/* 6. Google AdMob Test Banner Ad */}
      <section className="px-4 pt-2">
        <AdMobBannerAd />
      </section>

      {/* Inline Responsive Game Player Modal */}
      {activeGamePlayer && (
        <GamePlayer
          gameUrl={activeGamePlayer.url || activeGamePlayer.link || ''}
          gameTitle={activeGamePlayer.title || activeGamePlayer.name || 'KING Game'}
          onClose={() => setActiveGamePlayer(null)}
        />
      )}

    </div>
  );
}
