import { useEffect, useState, useRef } from "react";
import { db, auth } from "../firebase";
import { collection, onSnapshot, orderBy, query, doc, limit } from "firebase/firestore";
import { saveToHistory } from "../utils/historyUtils";
import { downloadVideoFile } from "../utils/downloadUtils";
import { 
  Download, 
  Check, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  X, 
  SkipForward, 
  SkipBack, 
  Share2, 
  Flame, 
  CheckCircle2, 
  ArrowLeft, 
  MoreVertical, 
  Maximize2, 
  Repeat, 
  Lock, 
  Unlock, 
  MessageCircle, 
  Heart
} from "lucide-react";
import CreatorAvatar, { CreatorDisplayName } from "./CreatorAvatar";
import { useAuth } from "../context/AuthContext";
import { 
  parseNumericCount, 
  formatCompactCount, 
  toggleVideoLike, 
  subscribeUserLikeStatus, 
  recordUniqueVideoView 
} from "../services/videoSocialService";
import LikedByModal from "./LikedByModal";
import {
  applyVideoOpenGraphMeta,
  buildVideoShareText,
  getWatchUrl,
  resetDefaultOpenGraphMeta,
} from "../utils/videoShareUtils";

// Format views into YouTube-style compact numbers (e.g. 1.2K, 3.4M)
function formatViews(count: any): string {
  const num = parseNumericCount(count);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M views`;
  if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}K views`;
  return `${num} ${num === 1 ? 'view' : 'views'}`;
}

// Format Firestore timestamp or date into YouTube-style relative time
function formatTimeAgo(timestamp: any): string {
  if (!timestamp) return 'Recently';
  let date: Date;
  if (typeof timestamp?.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp?.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else {
    return 'Recently';
  }

  const now = new Date();
  const diffInSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (diffInSeconds < 60) return 'Just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 5) return `${diffInWeeks}w ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths}mo ago`;
  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears}y ago`;
}

// Generate thumbnail URL with Cloudinary poster fallback
function getThumbnail(v: any): string {
  if (v.thumbnailUrl && typeof v.thumbnailUrl === 'string' && v.thumbnailUrl.trim()) {
    return v.thumbnailUrl;
  }
  if (v.thumbnail && typeof v.thumbnail === 'string' && v.thumbnail.trim()) {
    return v.thumbnail;
  }
  if (v.img && typeof v.img === 'string' && v.img.trim()) {
    return v.img;
  }
  const videoUrl = v.videoUrl || v.url || v.uri;
  if (videoUrl && typeof videoUrl === 'string' && videoUrl.includes('cloudinary.com')) {
    return videoUrl.replace(/\.[^/.]+$/, ".jpg");
  }
  return "";
}

// Generate deterministic channel name if not explicitly set
function getChannelName(v: any): string {
  return v.channelName || v.uploader || v.userName || v.creator || "KING Official";
}

// Generate channel initials for avatar
function getChannelInitial(v: any): string {
  const name = getChannelName(v);
  return name.charAt(0).toUpperCase() || "K";
}

const CATEGORIES = ["All", "Trending", "KING Originals", "Music", "Gaming", "Viral"];

interface VideosFeedProps {
  currentTab?: string;
  isInVideoSection?: boolean;
  onOpenCreatorProfile?: (creatorUid: string) => void;
  onFullScreenChange?: (isFullScreen: boolean) => void;
}

export default function VideosFeed({
  currentTab = 'VIDEOS',
  isInVideoSection = true,
  onOpenCreatorProfile,
  onFullScreenChange,
}: VideosFeedProps = {}) {
  const { user: authUser } = useAuth();
  const [videos, setVideos] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Record<string, boolean>>({});
  const [activeVideo, setActiveVideo] = useState<any | null>(null);
  const [activeVideoIndex, setActiveVideoIndex] = useState<number>(-1);
  const [videoAspect, setVideoAspect] = useState<'portrait' | 'landscape'>('landscape');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isCaptionExpanded, setIsCaptionExpanded] = useState<boolean>(false);
  const [creatorWhatsApp, setCreatorWhatsApp] = useState<string | null>(null);
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reelTouchStartYRef = useRef<number | null>(null);
  const handledUrlVideoRef = useRef<string | null>(null);

  // Social Likes & Views States
  const [isLikedByMe, setIsLikedByMe] = useState(false);
  const [activeVideoLikesCount, setActiveVideoLikesCount] = useState<number>(0);
  const [isLiking, setIsLiking] = useState(false);
  const [showLikedByModal, setShowLikedByModal] = useState(false);

  // 3-second playback watch tracker (filters out seek jumps > 1.5s and pauses)
  const playbackTrackerRef = useRef<{
    videoId: string;
    accumulatedSeconds: number;
    lastPlaybackTime: number;
  }>({ videoId: '', accumulatedSeconds: 0, lastPlaybackTime: -1 });
  const uniqueViewLoggedRef = useRef<Record<string, boolean>>({});

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const formatVideoTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (videoPlayerRef.current) {
      if (videoPlayerRef.current.paused) {
        videoPlayerRef.current.play().catch(() => {});
        setIsPlaying(true);
      } else {
        videoPlayerRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const toggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (videoPlayerRef.current) {
      videoPlayerRef.current.muted = !videoPlayerRef.current.muted;
      setIsMuted(videoPlayerRef.current.muted);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = time;
    }
  };

  const toggleFullscreen = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (videoPlayerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        (videoPlayerRef.current as any).requestFullscreen?.().catch(() => {});
      }
    }
  };

  const startHideTimer = () => {
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (videoPlayerRef.current && !videoPlayerRef.current.paused) {
      hideControlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
        console.log("Controls Hidden");
      }, 3000);
    }
  };

  const handleVideoContainerClick = () => {
    console.log("Video Tapped");
    if (showControls) {
      setShowControls(false);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      console.log("Controls Hidden");
    } else {
      setShowControls(true);
      console.log("Controls Shown");
      startHideTimer();
    }
  };

  const [showMenu, setShowMenu] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [autoNext, setAutoNext] = useState<boolean>(true);
  const [miniPos, setMiniPos] = useState({ x: 20, y: typeof window !== 'undefined' ? window.innerHeight - 240 : 400 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({ startX: 0, startY: 0, posX: 20, posY: 400 });

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: miniPos.x,
      posY: miniPos.y
    };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setMiniPos({
      x: Math.max(10, Math.min(window.innerWidth - 300, dragRef.current.posX + dx)),
      y: Math.max(10, Math.min(window.innerHeight - 200, dragRef.current.posY + dy))
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleVideoEnded = () => {
    if (isLooping && videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = 0;
      videoPlayerRef.current.play().catch(() => {});
      return;
    }
    if (autoNext) {
      handlePlayNext();
    }
  };

  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const miniVideoRef = useRef<HTMLVideoElement | null>(null);
  const playerScrollRef = useRef<HTMLDivElement | null>(null);

  // Smooth scroll to top of player
  const scrollToPlayerTop = () => {
    if (playerScrollRef.current) {
      playerScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Prevent background feed scroll leak & notify App of full-screen playback (hides TopHeader)
  useEffect(() => {
    const isFullScreen = Boolean(isInVideoSection && currentTab.toUpperCase() === 'VIDEOS' && activeVideo && !isMinimized);
    onFullScreenChange?.(isFullScreen);
    if (isFullScreen) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [activeVideo, isMinimized, isInVideoSection, currentTab, onFullScreenChange]);

  // Pause & hide mini-player/player immediately whenever user leaves Videos tab or opens My KING Channel
  useEffect(() => {
    if (!isInVideoSection || currentTab.toUpperCase() !== 'VIDEOS') {
      if (videoPlayerRef.current) videoPlayerRef.current.pause();
      if (miniVideoRef.current) miniVideoRef.current.pause();
      setIsMinimized(false);
      setActiveVideo(null);
      setActiveVideoIndex(-1);
      onFullScreenChange?.(false);
    }
  }, [isInVideoSection, currentTab, onFullScreenChange]);

  useEffect(() => {
    return () => {
      if (videoPlayerRef.current) videoPlayerRef.current.pause();
      if (miniVideoRef.current) miniVideoRef.current.pause();
      onFullScreenChange?.(false);
    };
  }, [currentTab, onFullScreenChange]);

  useEffect(() => {
    setIsCaptionExpanded(false);
  }, [activeVideo?.id]);

  // Ensure newly selected video autoplays reliably
  useEffect(() => {
    if (activeVideo && videoPlayerRef.current) {
      videoPlayerRef.current.play().catch(() => {});
    }

    // Subscribe to creator's public profile and WhatsApp link (supports offline caching & real-time updates)
    let unsubProfile: (() => void) | null = null;
    setCreatorWhatsApp(null);

    const creatorUid = activeVideo?.uid || (activeVideo as any)?.userId;
    if (creatorUid && typeof creatorUid === 'string' && creatorUid.trim()) {
      const safeUid = creatorUid.trim();
      try {
        unsubProfile = onSnapshot(
          doc(db, "publicProfiles", safeUid),
          (pubDoc) => {
            let waLink: string | undefined = undefined;
            if (pubDoc.exists()) {
              waLink = pubDoc.data()?.socialLinks?.whatsapp;
            }
            if (waLink && typeof waLink === 'string') {
              let formattedLink = waLink.trim();
              if (formattedLink) {
                if (!formattedLink.startsWith('http://') && !formattedLink.startsWith('https://')) {
                  const cleanNum = formattedLink.replace(/[^0-9]/g, '');
                  if (cleanNum) {
                    formattedLink = `https://wa.me/${cleanNum}`;
                  }
                }
                setCreatorWhatsApp(formattedLink);
                return;
              }
            }
            setCreatorWhatsApp(null);
          },
          (err) => {
            // Gracefully handle transient offline states without logging fatal errors
            if (err?.code === 'unavailable' || err?.message?.includes('offline')) {
              console.warn("Firestore offline, will sync when reconnected:", err.message);
            } else {
              console.warn("Could not fetch creator profile:", err);
            }
          }
        );
      } catch (e: any) {
        console.warn("Subscription to creator profile notice:", e?.message);
      }
    }

    return () => {
      if (unsubProfile) {
        unsubProfile();
      }
    };
  }, [activeVideo?.id, activeVideo?.videoUrl, activeVideo?.url, activeVideo?.uid, (activeVideo as any)?.userId]);

  // Subscribe to Firestore videos collection
  useEffect(() => {
    const q = query(collection(db, "videos"), orderBy("createdAt", "desc"), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setVideos(list);
        try {
          const compact = list.map((v: any) => ({
            id: v.id,
            title: v.title || '',
            url: v.url || v.videoUrl || '',
            videoUrl: v.videoUrl || v.url || '',
            thumbnailUrl: v.thumbnailUrl || v.thumbnail || v.img || '',
            views: v.views || 0,
            likes: v.likes || 0,
          }));
          localStorage.setItem('king_videos', JSON.stringify(compact));
        } catch {}
      },
      (err) => {
        console.warn("[VideosFeed] Videos snapshot notice:", err);
      }
    );
    return () => unsub();
  }, []);

  // Handle selected_video_id or ?video=<id> deep-link when navigating to Videos tab
  useEffect(() => {
    if (videos.length === 0) return;
    const urlVideoId = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('video')
      : null;
    const sessionVideoId = sessionStorage.getItem('selected_video_id');
    const targetId = sessionVideoId || (urlVideoId && handledUrlVideoRef.current !== urlVideoId ? urlVideoId : null);
    if (targetId) {
      if (sessionVideoId) sessionStorage.removeItem('selected_video_id');
      if (urlVideoId) handledUrlVideoRef.current = urlVideoId;
      const foundIdx = videos.findIndex(
        (v) => v.id === targetId || (typeof v.videoUrl === 'string' && v.videoUrl.includes(targetId))
      );
      if (foundIdx !== -1) {
        handleOpenPlayer(videos[foundIdx], foundIdx);
      }
    }
  }, [videos]);

  // Subscribe to current user's like status and current video likes count
  useEffect(() => {
    if (!activeVideo?.id) {
      setIsLikedByMe(false);
      setActiveVideoLikesCount(0);
      return;
    }

    // Reset playback tracker for new video
    playbackTrackerRef.current = {
      videoId: activeVideo.id,
      accumulatedSeconds: 0,
      lastPlaybackTime: -1
    };

    setActiveVideoLikesCount(parseNumericCount(activeVideo.likes));

    // Listen to user's like status on this video
    const currentUid = authUser?.uid || auth.currentUser?.uid || null;
    const unsub = subscribeUserLikeStatus(activeVideo.id, currentUid, (liked) => {
      setIsLikedByMe(liked);
    });

    return () => unsub();
  }, [activeVideo?.id, authUser?.uid]);

  // Handle Like/Unlike toggle atomically
  const handleToggleLike = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!activeVideo?.id) return;
    const currentUser = authUser || auth.currentUser;
    if (!currentUser) {
      alert("Please sign in to like KING videos! 👑");
      return;
    }
    if (isLiking) return;

    setIsLiking(true);
    const prevLiked = isLikedByMe;
    const prevCount = activeVideoLikesCount;
    // Optimistic toggle for instant responsive UI
    setIsLikedByMe(!prevLiked);
    setActiveVideoLikesCount(Math.max(0, prevLiked ? prevCount - 1 : prevCount + 1));

    try {
      const result = await toggleVideoLike(activeVideo.id, {
        uid: currentUser.uid,
        displayName: currentUser.displayName,
        photoURL: currentUser.photoURL
      });
      setIsLikedByMe(result.isLiked);
      setActiveVideoLikesCount(result.newLikesCount);
      // Synchronize in-memory activeVideo object
      setActiveVideo((prev: any) => prev ? { ...prev, likes: result.newLikesCount } : prev);
      // Synchronize feed list
      setVideos((prevList) => 
        prevList.map((item) => 
          item.id === activeVideo.id ? { ...item, likes: result.newLikesCount } : item
        )
      );
    } catch (err: any) {
      console.error("Like toggle error:", err);
      // Revert optimistic update
      setIsLikedByMe(prevLiked);
      setActiveVideoLikesCount(prevCount);
    } finally {
      setIsLiking(false);
    }
  };

  // Track actual continuous playback time (requires >= 3s, ignores scrub/seek leaps > 1.5s)
  const handleTimeUpdate = (e: any, videoId: string) => {
    const videoEl = e.currentTarget;
    if (!videoEl || !videoId) return;

    const currentT = videoEl.currentTime;
    const isPaused = videoEl.paused;
    const isSeeking = videoEl.seeking;

    if (isPaused || isSeeking) {
      playbackTrackerRef.current.lastPlaybackTime = currentT;
      return;
    }

    if (playbackTrackerRef.current.videoId !== videoId) {
      playbackTrackerRef.current = {
        videoId,
        accumulatedSeconds: 0,
        lastPlaybackTime: currentT
      };
      return;
    }

    if (playbackTrackerRef.current.lastPlaybackTime >= 0) {
      const delta = currentT - playbackTrackerRef.current.lastPlaybackTime;
      // Normal continuous playback delta is 0.2s - 0.5s.
      // Discard scrub leaps (> 1.5s)
      if (delta > 0 && delta <= 1.5) {
        playbackTrackerRef.current.accumulatedSeconds += delta;
      }
    }

    playbackTrackerRef.current.lastPlaybackTime = currentT;

    // View condition: accumulated continuous playback >= 3.0 seconds
    if (playbackTrackerRef.current.accumulatedSeconds >= 3.0 && !uniqueViewLoggedRef.current[videoId]) {
      uniqueViewLoggedRef.current[videoId] = true;
      const userObj = authUser?.uid ? { uid: authUser.uid } : (auth.currentUser?.uid ? { uid: auth.currentUser.uid } : null);
      recordUniqueVideoView(videoId, userObj).then((res) => {
        if (res.counted && res.newViewsCount !== undefined) {
          // Update active video views in state
          setActiveVideo((prev: any) => 
            prev && prev.id === videoId ? { ...prev, views: res.newViewsCount } : prev
          );
          // Update feed list
          setVideos((prevList) =>
            prevList.map((item) =>
              item.id === videoId ? { ...item, views: res.newViewsCount } : item
            )
          );
        }
      }).catch((err) => {
        console.warn("View record transaction notice:", err);
      });
    }
  };

  const handleDownload = async (v: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDownloadingId(v.id);
    try {
      await downloadVideoFile(v);
      setDownloadedIds((prev) => ({ ...prev, [v.id]: true }));
      setTimeout(() => {
        setDownloadedIds((prev) => ({ ...prev, [v.id]: false }));
      }, 3000);
    } catch (err) {
      console.error("Error downloading video:", err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOpenPlayer = (v: any, index: number) => {
    setActiveVideo(v);
    setActiveVideoIndex(index);
    setIsMinimized(false);
    setIsLocked(false);
    setShowControls(true);
    console.log("Controls Shown");
    saveToHistory(v);
    scrollToPlayerTop();
    startHideTimer();
    if (v?.id) {
      applyVideoOpenGraphMeta(v, getWatchUrl(v.id));
    }
  };

  const handleSelectNextVideo = (nextV: any, index: number) => {
    setActiveVideo(nextV);
    setActiveVideoIndex(index);
    setIsMinimized(false);
    setIsLocked(false);
    setShowControls(true);
    console.log("Controls Shown");
    saveToHistory(nextV);
    scrollToPlayerTop();
    startHideTimer();
    if (nextV?.id) {
      applyVideoOpenGraphMeta(nextV, getWatchUrl(nextV.id));
    }
  };

  const handleClosePlayer = () => {
    setActiveVideo(null);
    setActiveVideoIndex(-1);
    setIsMinimized(false);
    setIsLocked(false);
    resetDefaultOpenGraphMeta();
  };

  const handlePlayNext = () => {
    if (videos.length === 0) return;
    const nextIndex = (activeVideoIndex + 1) % videos.length;
    const nextVid = videos[nextIndex];
    setActiveVideo(nextVid);
    setActiveVideoIndex(nextIndex);
    setIsMinimized(false);
    setIsLocked(false);
    setShowControls(true);
    console.log("Controls Shown");
    saveToHistory(nextVid);
    scrollToPlayerTop();
    startHideTimer();
  };

  const handlePlayPrev = () => {
    if (videos.length === 0) return;
    const prevIndex = (activeVideoIndex - 1 + videos.length) % videos.length;
    const prevVid = videos[prevIndex];
    setActiveVideo(prevVid);
    setActiveVideoIndex(prevIndex);
    saveToHistory(prevVid);
    scrollToPlayerTop();
  };

  const buildCleanShareText = (video: any) => buildVideoShareText(video);

  const handleVideoShare = (video: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      if (!video) return;
      const text = buildCleanShareText(video);
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.log(err);
    }
  };

  const handleShare = (video: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const shareText = buildCleanShareText(video);
    if (navigator.share) {
      navigator.share({
        title: `${video?.title || 'Viral Video'} - KING App`,
        text: shareText,
      }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }).catch(() => {});
    }
  };

  const handleWhatsAppShare = handleVideoShare;

  // Filter videos based on active category
  const filteredVideos = videos.filter((v) => {
    if (activeCategory === "All") return true;
    if (activeCategory === "Trending") return (v.views || 0) > 0;
    if (activeCategory === "KING Originals") return (v.channelName || '').toLowerCase().includes('king') || !v.channelName;
    if (activeCategory === "Music") return (v.title || '').toLowerCase().includes('music') || (v.title || '').toLowerCase().includes('song');
    if (activeCategory === "Gaming") return (v.title || '').toLowerCase().includes('game') || (v.title || '').toLowerCase().includes('pubg');
    return true;
  });

  return (
    <div className="w-full min-h-screen bg-[#040812] text-white flex flex-col pb-24">
      
      {/* 1. YOUTUBE-STYLE TOP FILTER CHIPS BAR */}
      <div className="sticky top-0 z-30 bg-[#040812]/95 backdrop-blur-md px-3 py-2.5 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
              activeCategory === cat
                ? "bg-white text-black font-bold shadow-md"
                : "bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white"
            }`}
          >
            {cat === "Trending" && <Flame className="w-3 h-3 inline mr-1 text-amber-400" />}
            {cat}
          </button>
        ))}
      </div>

      {/* 2. YOUTUBE-STYLE VIDEO FEED CARDS */}
      <div className="flex flex-col gap-6 p-2 sm:p-4 w-full max-w-full">
        {filteredVideos.map((v, index) => {
          const thumbUrl = getThumbnail(v);
          const channelName = getChannelName(v);
          const channelInitial = getChannelInitial(v);
          const timeAgo = formatTimeAgo(v.createdAt);
          const viewsText = formatViews(v.views);

          return (
            <div
              key={v.id}
              id={`video-${v.id}`}
              className="w-full flex flex-col cursor-pointer group animate-in fade-in duration-200"
              onClick={() => handleOpenPlayer(v, index)}
            >
              {/* 16:9 Thumbnail Container */}
              <div 
                className="relative w-full aspect-video rounded-xl sm:rounded-2xl overflow-hidden bg-[#0c1222] border border-slate-800/80 shadow-lg group-hover:border-cyan-500/40 transition-all duration-200"
                style={{ width: '100%', maxWidth: '100%' }}
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={v.title || "Video thumbnail"}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => {
                      // Fallback if image fails to load
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0c1428] via-[#09101f] to-[#040812] p-4 text-center">
                    <span className="text-3xl mb-1">👑</span>
                    <p className="text-xs text-slate-300 font-bold truncate max-w-[85%]">{v.title || "KING Video"}</p>
                  </div>
                )}

                {/* Play Button Overlay on Hover/Focus */}
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                  <div className="w-12 h-12 rounded-full bg-black/60 group-hover:bg-red-600/90 text-white flex items-center justify-center shadow-xl backdrop-blur-sm group-hover:scale-110 transition-transform duration-200">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </div>
                </div>

                {/* Duration Badge / HD Badge */}
                <div className="absolute bottom-2 right-2 bg-black/85 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-md border border-white/10 font-mono tracking-wider">
                  {v.duration || "HD"}
                </div>
              </div>

              {/* Below Thumbnail: YouTube Info Row */}
              <div className="flex items-start gap-3 pt-2.5 px-0.5">
                {/* Channel Avatar (Clickable to Open Creator Profile) */}
                <CreatorAvatar
                  uid={v.userId || v.uid}
                  fallbackPhoto={v.channelAvatar || v.avatar || v.userPhoto}
                  fallbackName={channelName}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full shrink-0 overflow-hidden shadow-md border border-slate-700/60 mt-0.5 cursor-pointer hover:ring-2 hover:ring-cyan-400 hover:scale-105 transition"
                  onClick={(e) => {
                    const creatorUid = v.userId || v.uid;
                    if (creatorUid && onOpenCreatorProfile) {
                      e.stopPropagation();
                      onOpenCreatorProfile(creatorUid);
                    }
                  }}
                  title={`View ${channelName}'s Channel`}
                />

                {/* Title & Metadata */}
                <div className="flex-1 min-w-0 pr-1">
                  <h3 
                    className="text-white font-semibold text-sm sm:text-base leading-snug line-clamp-2 group-hover:text-cyan-300 transition-colors"
                    title={v.title}
                  >
                    {v.title || "KING Video"}
                  </h3>
                  
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1 flex-wrap">
                    <span 
                      onClick={(e) => {
                        const creatorUid = v.userId || v.uid;
                        if (creatorUid && onOpenCreatorProfile) {
                          e.stopPropagation();
                          onOpenCreatorProfile(creatorUid);
                        }
                      }}
                      className="font-medium text-slate-300 flex items-center gap-1 cursor-pointer hover:text-cyan-300 hover:underline transition"
                      title={`View ${channelName}'s Channel`}
                    >
                      <CreatorDisplayName uid={v.userId || v.uid} fallback={channelName} />
                      <CheckCircle2 className="w-3 h-3 text-cyan-400 fill-cyan-400/20" />
                    </span>
                    <span className="text-slate-600">•</span>
                    <span>{viewsText}</span>
                    {parseNumericCount(v.likes) > 0 && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span className="text-red-400/90 font-medium flex items-center gap-0.5">
                          <Heart className="w-3 h-3 fill-current inline-block" />
                          {formatCompactCount(v.likes)}
                        </span>
                      </>
                    )}
                    <span className="text-slate-600">•</span>
                    <span>{timeAgo}</span>
                  </div>
                </div>

                {/* Quick Action Button (Download) */}
                <button
                  type="button"
                  onClick={(e) => handleDownload(v, e)}
                  disabled={downloadingId === v.id}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800/80 transition cursor-pointer shrink-0 mt-0.5 active:scale-95"
                  title="Download Video"
                >
                  {downloadedIds[v.id] ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Download className={`w-4 h-4 ${downloadingId === v.id ? 'animate-bounce text-emerald-400' : ''}`} />
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {filteredVideos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
            <span className="text-4xl mb-3">🎬</span>
            <p className="font-bold text-white text-base">Koi video nahi mili</p>
            <p className="text-xs text-slate-500 mt-1">My KING Channel me jakar pehli video upload karein!</p>
          </div>
        )}
      </div>

      {/* 3. FULL-SCREEN 9:16 REELS VIDEO PLAYER (100dvh, bg-black, no top overlap) */}
      {activeVideo && !isMinimized && (
        <div
          ref={playerScrollRef}
          onTouchStart={(e) => {
            if (isLocked) return;
            reelTouchStartYRef.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            if (isLocked || reelTouchStartYRef.current === null) return;
            const endY = e.changedTouches[0]?.clientY ?? reelTouchStartYRef.current;
            const deltaY = reelTouchStartYRef.current - endY;
            reelTouchStartYRef.current = null;
            if (deltaY > 65 && videos.length > 1) {
              handlePlayNext();
            } else if (deltaY < -65 && videos.length > 1) {
              handlePlayPrev();
            }
          }}
          className="fixed inset-0 z-[120] bg-black h-[100dvh] w-full flex items-center justify-center overflow-hidden select-none animate-in fade-in duration-150"
        >
          {/* 9:16 Vertical Reels Stage */}
          <div
            onClick={handleVideoContainerClick}
            className="relative w-full max-w-md h-full bg-black overflow-hidden flex items-center justify-center cursor-pointer"
          >
            {/* Top Bar with Back Button (Left) & 3-Dot Menu (Right) */}
            {!isLocked && (
              <div
                className={`absolute top-3 left-3 right-3 z-40 flex items-center justify-between pointer-events-none transition-opacity duration-300 ${
                  showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md transition pointer-events-auto shadow-lg cursor-pointer active:scale-95"
                  title="Back to Videos"
                  aria-label="Back to Videos"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-2 pointer-events-auto relative">
                  <button
                    type="button"
                    onClick={() => setShowMenu(!showMenu)}
                    className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md transition shadow-lg cursor-pointer active:scale-95"
                    title="More Options"
                    aria-label="More Options"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>

                  {/* 3-Dot Dropdown Menu */}
                  {showMenu && (
                    <div className="absolute top-11 right-0 z-50 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 text-xs font-semibold text-white pointer-events-auto animate-in fade-in zoom-in-95 duration-100">
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          if (videoPlayerRef.current && (videoPlayerRef.current as any).requestFullscreen) {
                            (videoPlayerRef.current as any).requestFullscreen().catch(() => {});
                          }
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                      >
                        <Maximize2 className="w-4 h-4 text-cyan-400" /> Full Screen
                      </button>

                      <div className="px-4 py-2 border-t border-slate-800">
                        <p className="text-[10px] text-slate-400 mb-1">Playback Speed: {playbackSpeed}x</p>
                        <div className="grid grid-cols-5 gap-1">
                          {[0.5, 1, 1.25, 1.5, 2].map((spd) => (
                            <button
                              key={spd}
                              type="button"
                              onClick={() => {
                                setPlaybackSpeed(spd);
                                if (videoPlayerRef.current) videoPlayerRef.current.playbackRate = spd;
                              }}
                              className={`py-1 rounded text-[10px] font-bold ${playbackSpeed === spd ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                            >
                              {spd}x
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsLooping(!isLooping);
                          if (videoPlayerRef.current) videoPlayerRef.current.loop = !isLooping;
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-800 flex items-center justify-between cursor-pointer border-t border-slate-800"
                      >
                        <span className="flex items-center gap-2.5">
                          <Repeat className="w-4 h-4 text-amber-400" /> Loop Current Video
                        </span>
                        <span className={`w-3 h-3 rounded-full border ${isLooping ? 'bg-amber-400 border-amber-400' : 'border-slate-600'}`} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setAutoNext(!autoNext)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-800 flex items-center justify-between cursor-pointer border-t border-slate-800"
                      >
                        <span className="flex items-center gap-2.5">
                          <Play className="w-4 h-4 text-emerald-400 fill-current" /> Auto Next Video
                        </span>
                        <span className={`w-3 h-3 rounded-full border ${autoNext ? 'bg-emerald-400 border-emerald-400' : 'border-slate-600'}`} />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          setIsLocked(true);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer border-t border-slate-800 text-amber-300"
                      >
                        <Lock className="w-4 h-4" /> Lock Screen Controls
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          handleDownload(activeVideo);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer border-t border-slate-800 text-emerald-300"
                      >
                        <Download className="w-4 h-4" /> Download Video
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Real Lock Mode Touch-Blocking Overlay & Lock Icon */}
            {isLocked && (
              <div
                className="absolute inset-0 z-50 bg-transparent flex items-start justify-start p-4 cursor-default"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIsLocked(false);
                  }}
                  className="pointer-events-auto w-12 h-12 rounded-full bg-black/90 hover:bg-black text-amber-400 flex items-center justify-center backdrop-blur-md shadow-2xl border border-amber-500/60 cursor-pointer active:scale-95 transition"
                  title="Tap to Unlock"
                  aria-label="Tap to Unlock"
                >
                  <Lock className="w-6 h-6 text-amber-400 animate-pulse" />
                </button>
              </div>
            )}

            {/* Full-Screen 9:16 Video Element */}
            {activeVideo.videoUrl || activeVideo.url ? (
              <video
                ref={videoPlayerRef}
                key={activeVideo.id || activeVideo.videoUrl || activeVideo.url}
                src={activeVideo.videoUrl || activeVideo.url}
                poster={getThumbnail(activeVideo)}
                controls={false}
                autoPlay
                playsInline
                loop={isLooping}
                className={`w-full h-full block ${
                  videoAspect === 'portrait' ? 'object-cover' : 'object-contain'
                }`}
                onLoadedMetadata={(e) => {
                  const el = e.currentTarget;
                  const w = el.videoWidth;
                  const h = el.videoHeight;
                  setDuration(el.duration || 0);
                  if (h > w) {
                    setVideoAspect('portrait');
                  } else {
                    setVideoAspect('landscape');
                  }
                }}
                onPlay={() => {
                  setIsPlaying(true);
                  saveToHistory(activeVideo);
                  startHideTimer();
                }}
                onPause={() => {
                  setIsPlaying(false);
                  if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
                  setShowControls(true);
                }}
                onTimeUpdate={(e) => {
                  setCurrentTime(e.currentTarget.currentTime);
                  handleTimeUpdate(e, activeVideo.id);
                }}
                onEnded={handleVideoEnded}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-black text-slate-400 text-xs">
                Video not available
              </div>
            )}

            {/* Centered Play/Pause Button Overlay */}
            {!isLocked && showControls && (activeVideo.videoUrl || activeVideo.url) && (
              <div
                className="absolute z-20 cursor-pointer pointer-events-auto top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay(e);
                }}
              >
                <button
                  type="button"
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-md transition cursor-pointer shadow-2xl border border-white/20 active:scale-95"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-current" />
                  ) : (
                    <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current ml-1" />
                  )}
                </button>
              </div>
            )}

            {/* RIGHT SIDE VERTICAL ACTION BUTTONS (Reels Layout, KING App Design & Colors) */}
            {!isLocked && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-3 bottom-[120px] z-30 flex flex-col items-center gap-[16px] pointer-events-auto"
              >
                {/* 1. KING Like Button (Red ❤️ + count) */}
                <button
                  type="button"
                  onClick={(e) => handleToggleLike(e)}
                  disabled={isLiking}
                  className="flex flex-col items-center gap-1 cursor-pointer active:scale-95 transition group"
                  title={isLikedByMe ? "Unlike" : "Like"}
                  aria-label="Like Video"
                >
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md border shadow-lg transition ${
                      isLikedByMe
                        ? 'bg-red-500/20 border-red-500/60 text-red-500'
                        : 'bg-black/45 border-white/20 text-white group-hover:text-red-400'
                    }`}
                  >
                    <Heart className={`w-6 h-6 transition-transform duration-200 ${isLikedByMe ? 'fill-red-500 text-red-500 scale-110' : ''}`} />
                  </div>
                  <span className="text-xs font-mono font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
                    {formatCompactCount(activeVideoLikesCount)} {activeVideoLikesCount === 1 ? 'like' : 'likes'}
                  </span>
                </button>

                {/* 2. KING Download Button (⬇️) */}
                <button
                  type="button"
                  onClick={(e) => handleDownload(activeVideo, e)}
                  disabled={downloadingId === activeVideo.id}
                  className="flex flex-col items-center gap-1 cursor-pointer active:scale-95 transition disabled:opacity-50 group"
                  title={downloadedIds[activeVideo.id] ? "Saved" : "Download"}
                  aria-label="Download Video"
                >
                  <div className="w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 border border-white/20 text-slate-200 flex items-center justify-center backdrop-blur-md shadow-lg transition">
                    {downloadedIds[activeVideo.id] ? (
                      <Check className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Download className={`w-5 h-5 ${downloadingId === activeVideo.id ? 'animate-bounce text-emerald-400' : ''}`} />
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
                    {downloadedIds[activeVideo.id] ? 'Saved' : 'Save'}
                  </span>
                </button>

                {/* 4. KING Share Button (↗️) */}
                <button
                  type="button"
                  onClick={(e) => handleShare(activeVideo, e)}
                  className="flex flex-col items-center gap-1 cursor-pointer active:scale-95 transition group"
                  title="Share Video"
                  aria-label="Share Video"
                >
                  <div className="w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 border border-white/20 text-slate-200 flex items-center justify-center backdrop-blur-md shadow-lg transition">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
                    Share
                  </span>
                </button>

                {/* 5. KING WhatsApp Green Share Button */}
                <button
                  type="button"
                  onClick={(e) => handleWhatsAppShare(activeVideo, e)}
                  className="flex flex-col items-center gap-1 cursor-pointer active:scale-95 transition group"
                  title="Share on WhatsApp"
                  aria-label="Share on WhatsApp"
                >
                  <div className="w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 border border-green-500/40 text-green-400 flex items-center justify-center backdrop-blur-md shadow-lg transition">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-green-400 [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
                    WhatsApp
                  </span>
                </button>
              </div>
            )}

            {/* BOTTOM CREATOR INFO, FULL-WIDTH CAPTION WITH "MORE", AND PROGRESS BAR */}
            {!isLocked && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/95 via-black/75 to-transparent pt-12 pb-3 px-3 flex flex-col gap-2 pointer-events-auto"
              >
                {/* Bottom-Left KING Creator Info */}
                <div
                  onClick={(e) => {
                    const creatorUid = activeVideo.userId || activeVideo.uid;
                    if (creatorUid && onOpenCreatorProfile) {
                      e.stopPropagation();
                      onOpenCreatorProfile(creatorUid);
                    }
                  }}
                  className="flex items-center gap-2.5 cursor-pointer group/creator pr-16"
                  title={`View ${getChannelName(activeVideo)}'s Channel`}
                >
                  <CreatorAvatar
                    uid={activeVideo.userId || activeVideo.uid}
                    fallbackPhoto={activeVideo.channelAvatar || activeVideo.avatar || activeVideo.userPhoto}
                    fallbackName={getChannelName(activeVideo)}
                    className="w-9 h-9 rounded-full shrink-0 overflow-hidden shadow-md border border-slate-700/60 group-hover/creator:ring-2 group-hover/creator:ring-cyan-400 group-hover/creator:scale-105 transition"
                    title={`View ${getChannelName(activeVideo)}'s Channel`}
                  />
                  <div className="min-w-0">
                    <h4 className="text-white text-xs sm:text-sm font-bold flex items-center gap-1 group-hover/creator:text-cyan-300 transition [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
                      <CreatorDisplayName uid={activeVideo.userId || activeVideo.uid} fallback={getChannelName(activeVideo)} />
                      <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400/20 shrink-0" />
                    </h4>
                    <p className="text-[10px] text-slate-300 font-mono [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]">
                      KING Channel Creator
                    </p>
                  </div>
                </div>

                {/* Full-Width Caption Area with "more" option */}
                <div className="w-full space-y-1">
                  <div className="flex items-end gap-1.5 w-full">
                    <p
                      className={`text-white text-xs sm:text-sm font-medium leading-snug flex-1 [text-shadow:0_1px_4px_rgba(0,0,0,0.95)] ${
                        isCaptionExpanded ? '' : 'line-clamp-2'
                      }`}
                    >
                      {activeVideo.title || "KING Video"}
                      {isCaptionExpanded && activeVideo.description ? ` — ${activeVideo.description}` : ''}
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsCaptionExpanded((prev) => !prev)}
                      className="text-xs font-bold text-slate-300 hover:text-white shrink-0 cursor-pointer [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]"
                    >
                      {isCaptionExpanded ? 'less' : '...more'}
                    </button>
                  </div>

                  {isCaptionExpanded && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-300 flex-wrap [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]">
                      <span>{formatViews(activeVideo.views)}</span>
                      <span>•</span>
                      <span>{formatTimeAgo(activeVideo.createdAt)}</span>
                    </div>
                  )}
                </div>

                {/* Progress Bar / Scrubber & Controls */}
                <div className="flex flex-col gap-1 pt-0.5">
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-slate-600/80 rounded-lg appearance-none cursor-pointer accent-cyan-400 hover:accent-cyan-300"
                  />

                  <div className="flex items-center justify-between text-white text-xs">
                    <span className="text-[11px] font-mono text-slate-200 [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]">
                      {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
                    </span>

                    <div className="flex items-center gap-2">
                      {videos.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={handlePlayPrev}
                            className="p-1 hover:text-cyan-400 transition cursor-pointer"
                            title="Previous Video"
                            aria-label="Previous Video"
                          >
                            <SkipBack className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={handlePlayNext}
                            className="p-1 hover:text-cyan-400 transition cursor-pointer"
                            title="Next Video"
                            aria-label="Next Video"
                          >
                            <SkipForward className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={toggleMute}
                        className="p-1 hover:text-cyan-400 transition cursor-pointer"
                        title={isMuted ? "Unmute" : "Mute"}
                        aria-label={isMuted ? "Unmute" : "Mute"}
                      >
                        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>

                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="p-1 hover:text-cyan-400 transition cursor-pointer"
                        title="Fullscreen"
                        aria-label="Fullscreen"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. FLOATING DRAGGABLE MINI-PLAYER (ONLY inside Videos tab) */}
      {isInVideoSection && currentTab.toUpperCase() === 'VIDEOS' && activeVideo && isMinimized && (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            position: 'fixed',
            left: `${miniPos.x}px`,
            top: `${miniPos.y}px`,
            zIndex: 90,
            touchAction: 'none'
          }}
          className="w-72 sm:w-80 bg-black rounded-2xl overflow-hidden shadow-2xl border-2 border-cyan-500/50 cursor-grab active:cursor-grabbing animate-in fade-in slide-in-from-bottom-4 duration-200 group"
          onClick={() => {
            if (!isDragging) {
              setIsMinimized(false);
            }
          }}
        >
          {/* Mini Player Video & Top Bar */}
          <div className="relative w-full aspect-video bg-black flex items-center justify-center">
            <video
              ref={miniVideoRef}
              src={activeVideo.videoUrl || activeVideo.url}
              poster={getThumbnail(activeVideo)}
              autoPlay
              playsInline
              loop={isLooping}
              className="w-full h-full object-cover pointer-events-none"
            />

            {/* Close Mini Player Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (miniVideoRef.current) miniVideoRef.current.pause();
                setActiveVideo(null);
                setIsMinimized(false);
              }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/80 hover:bg-red-600 text-white flex items-center justify-center transition shadow cursor-pointer z-10"
              title="Close Player"
              aria-label="Close Player"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Tap to Restore Indicator on Hover */}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
              Tap to Expand Player ↗
            </div>
          </div>

          <div className="p-2.5 bg-slate-900 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-white text-xs font-bold truncate">{activeVideo.title || "KING Video"}</p>
              <p className="text-[10px] text-slate-400">{getChannelName(activeVideo)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Liked By Modal */}
      <LikedByModal
        isOpen={showLikedByModal}
        onClose={() => setShowLikedByModal(false)}
        videoId={activeVideo?.id || null}
        videoTitle={activeVideo?.title || "KING Video"}
        totalLikesCount={activeVideoLikesCount}
      />

      {/* Copied Link Toast */}
      {copiedLink && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[140] bg-slate-900 border border-cyan-500/50 text-cyan-300 text-xs px-4 py-2 rounded-full shadow-2xl animate-in fade-in">
          Link Copied! Paste in WhatsApp
        </div>
      )}
    </div>
  );
}
