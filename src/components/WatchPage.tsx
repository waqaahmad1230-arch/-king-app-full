import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  Heart,
  Lock,
  MessageCircle,
  MoreVertical,
  Pause,
  Play,
  Repeat,
  Share2,
  Volume2,
  VolumeX,
  Maximize2,
  Film,
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import CreatorAvatar, { CreatorDisplayName } from './CreatorAvatar';
import { downloadVideoFile } from '../utils/downloadUtils';
import { saveToHistory } from '../utils/historyUtils';
import {
  formatCompactCount,
  parseNumericCount,
  recordUniqueVideoView,
  subscribeUserLikeStatus,
  toggleVideoLike,
} from '../services/videoSocialService';
import {
  applyVideoOpenGraphMeta,
  buildVideoShareText,
  getVideoThumbnailUrl,
  getWatchUrl,
  resetDefaultOpenGraphMeta,
} from '../utils/videoShareUtils';

interface WatchPageProps {
  videoId: string;
  onBackToFeed: () => void;
  onOpenCreatorProfile?: (creatorUid: string) => void;
}

function formatViews(count: any): string {
  const num = parseNumericCount(count);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M views`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K views`;
  return `${num} ${num === 1 ? 'view' : 'views'}`;
}

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
  const diffInSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffInSeconds < 60) return 'Just now';
  const mins = Math.floor(diffInSeconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatVideoTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function getChannelName(v: any): string {
  return v?.channelName || v?.uploaderName || v?.uploader || v?.userName || v?.creator || 'KING Official';
}

export default function WatchPage({
  videoId,
  onBackToFeed,
  onOpenCreatorProfile,
}: WatchPageProps) {
  const { user: authUser } = useAuth();
  const [video, setVideo] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [videoAspect, setVideoAspect] = useState<'portrait' | 'landscape'>('portrait');

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isCaptionExpanded, setIsCaptionExpanded] = useState<boolean>(false);

  const [isLikedByMe, setIsLikedByMe] = useState<boolean>(false);
  const [likesCount, setLikesCount] = useState<number>(0);
  const [isLiking, setIsLiking] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isDownloaded, setIsDownloaded] = useState<boolean>(false);
  const [copiedToast, setCopiedToast] = useState<boolean>(false);

  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackTrackerRef = useRef<{
    videoId: string;
    accumulatedSeconds: number;
    lastPlaybackTime: number;
  }>({ videoId: '', accumulatedSeconds: 0, lastPlaybackTime: -1 });
  const uniqueViewLoggedRef = useRef<boolean>(false);

  // Subscribe to target Firestore video document
  useEffect(() => {
    if (!videoId) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    setLoading(true);
    setNotFound(false);
    uniqueViewLoggedRef.current = false;
    playbackTrackerRef.current = { videoId, accumulatedSeconds: 0, lastPlaybackTime: -1 };

    const unsub = onSnapshot(
      doc(db, 'videos', videoId),
      (snap) => {
        setLoading(false);
        if (!snap.exists()) {
          setVideo(null);
          setNotFound(true);
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        setVideo(data);
        setNotFound(false);
        setLikesCount(parseNumericCount((data as any).likes));
        applyVideoOpenGraphMeta(data, getWatchUrl(snap.id));
      },
      (err) => {
        console.warn('[WatchPage] Failed to load video:', err);
        setLoading(false);
        setNotFound(true);
      }
    );

    return () => {
      unsub();
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      resetDefaultOpenGraphMeta();
    };
  }, [videoId]);

  // Subscribe to user's like status
  useEffect(() => {
    if (!video?.id) {
      setIsLikedByMe(false);
      return;
    }
    const uid = authUser?.uid || auth.currentUser?.uid || null;
    const unsub = subscribeUserLikeStatus(video.id, uid, (liked) => {
      setIsLikedByMe(liked);
    });
    return () => unsub();
  }, [video?.id, authUser?.uid]);

  const startHideTimer = () => {
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (videoPlayerRef.current && !videoPlayerRef.current.paused) {
      hideControlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  const handleContainerClick = () => {
    if (showControls) {
      setShowControls(false);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    } else {
      setShowControls(true);
      startHideTimer();
    }
  };

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoPlayerRef.current) return;
    if (videoPlayerRef.current.paused) {
      videoPlayerRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoPlayerRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoPlayerRef.current) return;
    videoPlayerRef.current.muted = !videoPlayerRef.current.muted;
    setIsMuted(videoPlayerRef.current.muted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = time;
    }
  };

  const handleToggleLike = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!video?.id) return;
    const currentUser = authUser || auth.currentUser;
    if (!currentUser) {
      alert('Please sign in to like KING videos! 👑');
      return;
    }
    if (isLiking) return;
    setIsLiking(true);
    const prevLiked = isLikedByMe;
    const prevCount = likesCount;
    setIsLikedByMe(!prevLiked);
    setLikesCount(Math.max(0, prevLiked ? prevCount - 1 : prevCount + 1));

    try {
      const result = await toggleVideoLike(video.id, {
        uid: currentUser.uid,
        displayName: currentUser.displayName,
        photoURL: currentUser.photoURL,
      });
      setIsLikedByMe(result.isLiked);
      if (typeof result.newLikesCount === 'number') {
        setLikesCount(result.newLikesCount);
      }
    } catch {
      setIsLikedByMe(prevLiked);
      setLikesCount(prevCount);
    } finally {
      setIsLiking(false);
    }
  };

  const handleDownload = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!video || isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadVideoFile(video);
      setIsDownloaded(true);
    } catch (err) {
      console.error('[WatchPage] Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetObj = video || { id: videoId };
    const shareText = buildVideoShareText(targetObj);
    if (navigator.share) {
      navigator
        .share({
          title: `${video?.title || 'Viral Video'} - KING App`,
          text: shareText,
        })
        .catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard
        .writeText(shareText)
        .then(() => {
          setCopiedToast(true);
          setTimeout(() => setCopiedToast(false), 2000);
        })
        .catch(() => {});
    }
  };

  const handleWhatsAppShare = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetObj = video || { id: videoId };
    const text = buildVideoShareText(targetObj);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const vidEl = e.currentTarget;
    setCurrentTime(vidEl.currentTime);
    if (!video?.id || uniqueViewLoggedRef.current || vidEl.paused) return;
    const tracker = playbackTrackerRef.current;
    if (tracker.videoId !== video.id) {
      playbackTrackerRef.current = {
        videoId: video.id,
        accumulatedSeconds: 0,
        lastPlaybackTime: vidEl.currentTime,
      };
      return;
    }
    const delta = vidEl.currentTime - tracker.lastPlaybackTime;
    tracker.lastPlaybackTime = vidEl.currentTime;
    if (delta > 0 && delta <= 1.5) {
      tracker.accumulatedSeconds += delta;
    }
    if (tracker.accumulatedSeconds >= 3) {
      uniqueViewLoggedRef.current = true;
      const viewerUid = authUser?.uid || auth.currentUser?.uid;
      recordUniqueVideoView(video.id, viewerUid ? { uid: viewerUid } : null).catch(() => {});
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[120] bg-black h-[100dvh] w-full flex flex-col items-center justify-center gap-3 text-white">
        <div className="w-14 h-14 rounded-2xl overflow-hidden border border-[#D4AF37]/60 shadow-xl animate-pulse">
          <img src="/icon.png" alt="KING App" className="w-full h-full object-cover" />
        </div>
        <p className="text-xs font-bold tracking-wider text-slate-300 uppercase">Loading KING Video...</p>
      </div>
    );
  }

  if (notFound || !video) {
    return (
      <div className="fixed inset-0 z-[120] bg-[#040812] h-[100dvh] w-full flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center mb-4">
          <Film className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-lg font-extrabold text-white">Video Unavailable</h1>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          This video link may have expired or been removed by the creator.
        </p>
        <button
          type="button"
          onClick={onBackToFeed}
          className="mt-5 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#D4AF37] to-amber-500 text-black text-xs font-black tracking-wide uppercase shadow-lg cursor-pointer active:scale-95 transition"
        >
          Browse KING Videos
        </button>
      </div>
    );
  }

  const videoSrc = video.videoUrl || video.url || '';
  const posterSrc = getVideoThumbnailUrl(video);

  return (
    <div className="fixed inset-0 z-[120] bg-black h-[100dvh] w-full flex items-center justify-center overflow-hidden select-none animate-in fade-in duration-150">
      <div
        onClick={handleContainerClick}
        className="relative w-full max-w-md h-full bg-black overflow-hidden flex items-center justify-center cursor-pointer"
      >
        {/* Top Back Button & 3-Dot Menu */}
        {!isLocked && (
          <div
            className={`absolute top-3 left-3 right-3 z-40 flex items-center justify-between pointer-events-none transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onBackToFeed}
              className="px-3 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center gap-1.5 backdrop-blur-md transition pointer-events-auto shadow-lg cursor-pointer active:scale-95 text-xs font-bold"
              title="Back to Videos"
              aria-label="Back to Videos"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>KING Videos</span>
            </button>

            <div className="relative pointer-events-auto">
              <button
                type="button"
                onClick={() => setShowMenu((prev) => !prev)}
                className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md transition shadow-lg cursor-pointer active:scale-95"
                title="More Options"
                aria-label="More Options"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {showMenu && (
                <div className="absolute top-11 right-0 z-50 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 text-xs font-semibold text-white">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      (videoPlayerRef.current as any)?.requestFullscreen?.().catch(() => {});
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
                          className={`py-1 rounded text-[10px] font-bold ${
                            playbackSpeed === spd ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-300'
                          }`}
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
                      <Repeat className="w-4 h-4 text-amber-400" /> Loop Video
                    </span>
                    <span className={`w-3 h-3 rounded-full border ${isLooping ? 'bg-amber-400 border-amber-400' : 'border-slate-600'}`} />
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
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lock Mode Overlay */}
        {isLocked && (
          <div
            className="absolute inset-0 z-50 bg-transparent flex items-start justify-start p-4"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsLocked(false);
              }}
              className="pointer-events-auto w-12 h-12 rounded-full bg-black/90 text-amber-400 flex items-center justify-center border border-amber-500/60 shadow-2xl cursor-pointer"
              title="Tap to Unlock"
            >
              <Lock className="w-6 h-6 animate-pulse" />
            </button>
          </div>
        )}

        {/* Full-Screen Video */}
        {videoSrc ? (
          <video
            ref={videoPlayerRef}
            key={video.id}
            src={videoSrc}
            poster={posterSrc}
            controls={false}
            autoPlay
            playsInline
            loop={isLooping}
            className={`w-full h-full block ${videoAspect === 'portrait' ? 'object-cover' : 'object-contain'}`}
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              setDuration(el.duration || 0);
              setVideoAspect(el.videoHeight > el.videoWidth ? 'portrait' : 'landscape');
            }}
            onPlay={() => {
              setIsPlaying(true);
              saveToHistory(video);
              startHideTimer();
            }}
            onPause={() => {
              setIsPlaying(false);
              if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
              setShowControls(true);
            }}
            onTimeUpdate={handleTimeUpdate}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-black text-slate-400 text-xs">
            Video not available
          </div>
        )}

        {/* Center Play/Pause Overlay */}
        {!isLocked && showControls && videoSrc && (
          <div
            className="absolute z-20 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            onClick={(e) => togglePlay(e)}
          >
            <button
              type="button"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-md transition shadow-2xl border border-white/20 cursor-pointer active:scale-95"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-current" />
              ) : (
                <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current ml-1" />
              )}
            </button>
          </div>
        )}

        {/* Right Vertical Action Stack */}
        {!isLocked && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-3 bottom-[120px] z-30 flex flex-col items-center gap-[16px] pointer-events-auto"
          >
            <button
              type="button"
              onClick={handleToggleLike}
              disabled={isLiking}
              className="flex flex-col items-center gap-1 cursor-pointer active:scale-95 transition"
              title={isLikedByMe ? 'Unlike' : 'Like'}
            >
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md border shadow-lg transition ${
                  isLikedByMe
                    ? 'bg-red-500/20 border-red-500/60 text-red-500'
                    : 'bg-black/45 border-white/20 text-white'
                }`}
              >
                <Heart className={`w-6 h-6 ${isLikedByMe ? 'fill-red-500 text-red-500' : ''}`} />
              </div>
              <span className="text-xs font-mono font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
                {formatCompactCount(likesCount)} {likesCount === 1 ? 'like' : 'likes'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex flex-col items-center gap-1 cursor-pointer active:scale-95 transition disabled:opacity-50"
              title={isDownloaded ? 'Saved' : 'Download'}
            >
              <div className="w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 border border-white/20 text-slate-200 flex items-center justify-center backdrop-blur-md shadow-lg">
                {isDownloaded ? (
                  <Check className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Download className={`w-5 h-5 ${isDownloading ? 'animate-bounce text-emerald-400' : ''}`} />
                )}
              </div>
              <span className="text-[11px] font-semibold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
                {isDownloaded ? 'Saved' : 'Save'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="flex flex-col items-center gap-1 cursor-pointer active:scale-95 transition"
              title="Share Video"
            >
              <div className="w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 border border-white/20 text-slate-200 flex items-center justify-center backdrop-blur-md shadow-lg">
                <Share2 className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
                Share
              </span>
            </button>

            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="flex flex-col items-center gap-1 cursor-pointer active:scale-95 transition"
              title="Share on WhatsApp"
            >
              <div className="w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 border border-green-500/40 text-green-400 flex items-center justify-center backdrop-blur-md shadow-lg">
                <MessageCircle className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold text-green-400 [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
                WhatsApp
              </span>
            </button>
          </div>
        )}

        {/* Copied Link Toast */}
        {copiedToast && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-slate-950 font-black text-xs px-4 py-1.5 rounded-full shadow-2xl">
            Watch Link Copied! 👑
          </div>
        )}

        {/* Bottom Creator Info, Caption, Scrubber */}
        {!isLocked && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/95 via-black/75 to-transparent pt-12 pb-3 px-3 flex flex-col gap-2 pointer-events-auto"
          >
            <div
              onClick={(e) => {
                const creatorUid = video.userId || video.uid;
                if (creatorUid && onOpenCreatorProfile) {
                  e.stopPropagation();
                  onOpenCreatorProfile(creatorUid);
                }
              }}
              className="flex items-center gap-2.5 cursor-pointer group/creator pr-16"
            >
              <CreatorAvatar
                uid={video.userId || video.uid}
                fallbackPhoto={video.channelAvatar || video.uploaderPhoto || video.avatar || video.userPhoto}
                fallbackName={getChannelName(video)}
                className="w-9 h-9 rounded-full shrink-0 overflow-hidden shadow-md border border-slate-700/60"
              />
              <div className="min-w-0">
                <h4 className="text-white text-xs sm:text-sm font-bold flex items-center gap-1 [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
                  <CreatorDisplayName uid={video.userId || video.uid} fallback={getChannelName(video)} />
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400/20 shrink-0" />
                </h4>
                <p className="text-[10px] text-slate-300 font-mono [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]">
                  KING Channel Creator
                </p>
              </div>
            </div>

            <div className="w-full space-y-1">
              <div className="flex items-end gap-1.5 w-full">
                <p
                  className={`text-white text-xs sm:text-sm font-medium leading-snug flex-1 [text-shadow:0_1px_4px_rgba(0,0,0,0.95)] ${
                    isCaptionExpanded ? '' : 'line-clamp-2'
                  }`}
                >
                  {video.title || 'KING Video'}
                  {isCaptionExpanded && video.description ? ` — ${video.description}` : ''}
                </p>
                <button
                  type="button"
                  onClick={() => setIsCaptionExpanded((prev) => !prev)}
                  className="text-xs font-bold text-slate-300 hover:text-white shrink-0 cursor-pointer [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]"
                >
                  {isCaptionExpanded ? 'less' : '...more'}
                </button>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-300 flex-wrap [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]">
                <span>{formatViews(video.views)}</span>
                <span>•</span>
                <span>{formatTimeAgo(video.createdAt)}</span>
              </div>
            </div>

            {videoSrc && (
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-[10px] font-mono text-white/80 min-w-[30px]">
                  {formatVideoTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
                <span className="text-[10px] font-mono text-white/80 min-w-[30px] text-right">
                  {formatVideoTime(duration)}
                </span>
                <button
                  type="button"
                  onClick={toggleMute}
                  className="text-white/90 hover:text-white p-1 cursor-pointer"
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
