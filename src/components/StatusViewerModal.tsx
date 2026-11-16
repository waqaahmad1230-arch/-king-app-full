import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronUp,
  Eye,
  Heart,
  MessageCircle,
  Music,
  Pause,
  Plus,
  Send,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  deleteOwnStatus,
  reactToStatus,
  recordUniqueStatusView,
  removeStatusReaction,
  sendPrivateStatusReply,
  subscribeStatusLikesOwnerOnly,
  subscribeStatusRepliesOwnerOnly,
  subscribeStatusViewersOwnerOnly,
} from '../services/statusService';
import { resolveSocialErrorMessage } from '../services/socialGraphService';
import {
  STATUS_REACTION_EMOJIS,
  StatusAuthorGroup,
  StatusLikeRecord,
  StatusReactionEmoji,
  StatusRecord,
  StatusReplyRecord,
  StatusViewRecord,
} from '../types/social';
import { StatusRoyaltyFreePlayer } from '../utils/statusAudioEngine';
import { getStatusVideoDeliveryUrl, MAX_STATUS_VIDEO_SECONDS } from '../utils/statusMediaUtils';
import CreatorAvatar from './CreatorAvatar';

interface StatusViewerModalProps {
  groups: StatusAuthorGroup[];
  initialGroupIndex: number;
  currentUid: string | null;
  currentUser: {
    displayName?: string | null;
    photoURL?: string | null;
  } | null;
  onClose: () => void;
  onOpenAddStatus: () => void;
  onStatusViewed?: (statusId: string) => void;
  onStatusReactionChanged?: (statusId: string, myReaction: StatusReactionEmoji | null, likesCount: number) => void;
  onStatusDeleted?: (statusId: string) => void;
  onShowToast: (msg: string) => void;
}

function formatRelativeTime(createdAtMs: number): string {
  if (!createdAtMs) return 'Just now';
  const sec = Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

export default function StatusViewerModal({
  groups,
  initialGroupIndex,
  currentUid,
  currentUser,
  onClose,
  onOpenAddStatus,
  onStatusViewed,
  onStatusReactionChanged,
  onStatusDeleted,
  onShowToast,
}: StatusViewerModalProps) {
  const safeInitialGroup = Math.max(0, Math.min(groups.length - 1, initialGroupIndex));
  const [groupIdx, setGroupIdx] = useState<number>(safeInitialGroup);
  const [slideIdx, setSlideIdx] = useState<number>(() => {
    const grp = groups[safeInitialGroup];
    if (!grp) return 0;
    const firstUnseen = grp.statuses.findIndex((s) => !s.viewedByMe);
    return firstUnseen >= 0 ? firstUnseen : 0;
  });

  const [progress, setProgress] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.85);
  const [showVolumeSlider, setShowVolumeSlider] = useState<boolean>(false);
  const [useRawVideoFallback, setUseRawVideoFallback] = useState<boolean>(false);

  // Reply & Reaction states
  const [replyText, setReplyText] = useState<string>('');
  const [sendingReply, setSendingReply] = useState<boolean>(false);
  const [reacting, setReacting] = useState<boolean>(false);

  // Owner-only insights drawer
  const [showInsights, setShowInsights] = useState<boolean>(false);
  const [ownerViewers, setOwnerViewers] = useState<StatusViewRecord[]>([]);
  const [ownerLikes, setOwnerLikes] = useState<StatusLikeRecord[]>([]);
  const [ownerReplies, setOwnerReplies] = useState<StatusReplyRecord[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const customAudioElRef = useRef<HTMLAudioElement | null>(null);
  const royaltyPlayerRef = useRef<StatusRoyaltyFreePlayer | null>(null);
  const viewedSessionRef = useRef<Set<string>>(new Set());

  // Gesture refs
  const pointerDownPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const isHoldingRef = useRef<boolean>(false);

  const activeGroup = groups[groupIdx];
  const activeStatus: StatusRecord | undefined = activeGroup?.statuses?.[slideIdx];
  const isOwner = Boolean(currentUid && activeStatus && currentUid === activeStatus.authorUid);

  // Keep indices valid if groups update (e.g., after delete or expiry)
  useEffect(() => {
    if (groups.length === 0) {
      onClose();
      return;
    }
    if (groupIdx >= groups.length) {
      setGroupIdx(groups.length - 1);
      setSlideIdx(0);
    } else if (groups[groupIdx] && slideIdx >= groups[groupIdx].statuses.length) {
      setSlideIdx(Math.max(0, groups[groupIdx].statuses.length - 1));
    }
  }, [groups, groupIdx, slideIdx, onClose]);

  useEffect(() => {
    setProgress(0);
    setUseRawVideoFallback(false);
    setConfirmDeleteId(null);
    setShowInsights(false);
  }, [activeStatus?.id]);

  // Unique view recording (non-owner only)
  useEffect(() => {
    if (!activeStatus || !currentUid || currentUid === activeStatus.authorUid) return;
    if (viewedSessionRef.current.has(activeStatus.id)) return;
    viewedSessionRef.current.add(activeStatus.id);

    recordUniqueStatusView(activeStatus, {
      uid: currentUid,
      displayName: currentUser?.displayName,
      photoURL: currentUser?.photoURL,
    })
      .then(() => {
        onStatusViewed?.(activeStatus.id);
      })
      .catch(() => {});
  }, [activeStatus?.id, activeStatus?.authorUid, currentUid, currentUser?.displayName, currentUser?.photoURL, onStatusViewed]);

  // Owner-only insights subscriptions (strictly skipped for non-owners)
  useEffect(() => {
    if (!isOwner || !activeStatus || !currentUid) {
      setOwnerViewers([]);
      setOwnerLikes([]);
      setOwnerReplies([]);
      return;
    }
    const u1 = subscribeStatusViewersOwnerOnly(activeStatus.id, currentUid, setOwnerViewers);
    const u2 = subscribeStatusLikesOwnerOnly(activeStatus.id, currentUid, setOwnerLikes);
    const u3 = subscribeStatusRepliesOwnerOnly(activeStatus.id, currentUid, setOwnerReplies);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [isOwner, activeStatus?.id, currentUid]);

  const goNextSlide = () => {
    if (!activeGroup) {
      onClose();
      return;
    }
    if (slideIdx + 1 < activeGroup.statuses.length) {
      setSlideIdx(slideIdx + 1);
      setProgress(0);
      return;
    }
    if (groupIdx + 1 < groups.length) {
      const nextGrp = groups[groupIdx + 1];
      const nextUnseen = nextGrp.statuses.findIndex((s) => !s.viewedByMe);
      setGroupIdx(groupIdx + 1);
      setSlideIdx(nextUnseen >= 0 ? nextUnseen : 0);
      setProgress(0);
      return;
    }
    onClose();
  };

  const goPrevSlide = () => {
    if (slideIdx > 0) {
      setSlideIdx(slideIdx - 1);
      setProgress(0);
      return;
    }
    if (groupIdx > 0) {
      const prevGrp = groups[groupIdx - 1];
      setGroupIdx(groupIdx - 1);
      setSlideIdx(Math.max(0, prevGrp.statuses.length - 1));
      setProgress(0);
    } else {
      setProgress(0);
    }
  };

  // Immediately advance/close if activeStatus hits its exact 24h expiry while open
  useEffect(() => {
    if (!activeStatus) return;
    const msLeft = activeStatus.expiresAtMs - Date.now();
    if (msLeft <= 0) {
      goNextSlide();
      return;
    }
    const timer = window.setTimeout(() => {
      goNextSlide();
    }, Math.min(60_000, msLeft + 40));
    return () => window.clearTimeout(timer);
  }, [activeStatus?.id, activeStatus?.expiresAtMs, groupIdx, slideIdx]);

  // Timer for Image & Text statuses
  useEffect(() => {
    if (!activeStatus || activeStatus.type === 'video') return;

    const totalMs = Math.max(2500, Math.min(15000, (activeStatus.durationSec || 6) * 1000));
    let elapsedMs = (progress / 100) * totalMs;
    let lastTick = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      if (!isPaused && !showInsights) {
        elapsedMs += now - lastTick;
        const pct = Math.min(100, (elapsedMs / totalMs) * 100);
        setProgress(pct);
        if (pct >= 100) {
          goNextSlide();
          return;
        }
      }
      lastTick = now;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [activeStatus?.id, activeStatus?.type, isPaused, showInsights]);

  // Video play/pause & volume sync
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || activeStatus?.type !== 'video') return;
    vid.volume = volume;
    vid.muted = isMuted || activeStatus?.audioTrack?.mode === 'royalty_free' || activeStatus?.audioTrack?.mode === 'custom_audio';

    if (isPaused || showInsights) {
      vid.pause();
    } else {
      vid.play().catch(() => {});
    }
  }, [activeStatus?.id, activeStatus?.type, activeStatus?.audioTrack?.mode, isPaused, showInsights, volume, isMuted]);

  // Soundscape & Custom Audio playback sync
  useEffect(() => {
    royaltyPlayerRef.current?.stop();
    const customEl = customAudioElRef.current;
    if (customEl) {
      customEl.pause();
      customEl.currentTime = 0;
    }

    if (!activeStatus) return;

    if (activeStatus.audioTrack?.mode === 'royalty_free' && activeStatus.audioTrack.presetId) {
      if (!royaltyPlayerRef.current) {
        royaltyPlayerRef.current = new StatusRoyaltyFreePlayer();
      }
      royaltyPlayerRef.current.start(activeStatus.audioTrack.presetId, volume, isMuted);
      if (isPaused || showInsights) royaltyPlayerRef.current.pause();
    } else if (activeStatus.audioTrack?.mode === 'custom_audio' && activeStatus.audioTrack.audioUrl && customEl) {
      customEl.src = activeStatus.audioTrack.audioUrl;
      customEl.volume = volume;
      customEl.muted = isMuted;
      if (!isPaused && !showInsights) {
        customEl.play().catch(() => {});
      }
    }

    return () => {
      royaltyPlayerRef.current?.stop();
    };
  }, [activeStatus?.id]);

  // Live volume/pause sync for running external audio
  useEffect(() => {
    royaltyPlayerRef.current?.setVolume(volume, isMuted);
    if (isPaused || showInsights) {
      royaltyPlayerRef.current?.pause();
      customAudioElRef.current?.pause();
    } else {
      royaltyPlayerRef.current?.resume();
      if (activeStatus?.audioTrack?.mode === 'custom_audio' && customAudioElRef.current) {
        customAudioElRef.current.volume = volume;
        customAudioElRef.current.muted = isMuted;
        customAudioElRef.current.play().catch(() => {});
      }
    }
  }, [volume, isMuted, isPaused, showInsights, activeStatus?.audioTrack?.mode]);

  const resolvedVideoSrc = useMemo(() => {
    if (!activeStatus || activeStatus.type !== 'video') return '';
    if (useRawVideoFallback) return activeStatus.mediaUrl;
    return getStatusVideoDeliveryUrl(activeStatus.mediaUrl, activeStatus.cloudinaryDeliveryType);
  }, [activeStatus, useRawVideoFallback]);

  if (!activeGroup || !activeStatus) return null;

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    isHoldingRef.current = false;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      isHoldingRef.current = true;
      setIsPaused(true);
    }, 180);
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      setIsPaused(false);
      pointerDownPosRef.current = null;
      return;
    }

    const start = pointerDownPosRef.current;
    pointerDownPosRef.current = null;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    // Swipe down to close
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
      onClose();
      return;
    }

    // Horizontal swipe between users
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        if (groupIdx + 1 < groups.length) {
          setGroupIdx(groupIdx + 1);
          setSlideIdx(0);
          setProgress(0);
        } else {
          onClose();
        }
      } else if (groupIdx > 0) {
        setGroupIdx(groupIdx - 1);
        setSlideIdx(0);
        setProgress(0);
      }
      return;
    }

    // Tap left third = previous, right two-thirds = next
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    if (relX < rect.width * 0.32) {
      goPrevSlide();
    } else {
      goNextSlide();
    }
  };

  const handleStagePointerCancel = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      setIsPaused(false);
    }
    pointerDownPosRef.current = null;
  };

  const handleReaction = async (emoji: StatusReactionEmoji) => {
    if (!currentUid) {
      onShowToast('Please sign in to react to statuses.');
      return;
    }
    if (isOwner || reacting) return;
    setReacting(true);
    try {
      if (activeStatus.myReaction === emoji) {
        const nextCount = await removeStatusReaction(activeStatus.id, currentUid);
        onStatusReactionChanged?.(activeStatus.id, null, nextCount);
      } else {
        const res = await reactToStatus(
          activeStatus,
          {
            uid: currentUid,
            displayName: currentUser?.displayName,
            photoURL: currentUser?.photoURL,
          },
          emoji
        );
        onStatusReactionChanged?.(activeStatus.id, emoji, res.likesCount);
        onShowToast(`Reacted ${emoji}`);
      }
    } catch (err) {
      onShowToast(resolveSocialErrorMessage(err, 'Unable to update reaction.'));
    } finally {
      setReacting(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUid) {
      onShowToast('Please sign in to send a private reply.');
      return;
    }
    if (!replyText.trim() || sendingReply || isOwner) return;
    setSendingReply(true);
    try {
      await sendPrivateStatusReply(
        activeStatus,
        {
          uid: currentUid,
          displayName: currentUser?.displayName,
          photoURL: currentUser?.photoURL,
        },
        replyText
      );
      setReplyText('');
      setIsPaused(false);
      onShowToast('Private reply sent');
    } catch (err) {
      onShowToast(resolveSocialErrorMessage(err, 'Failed to send reply.'));
    } finally {
      setSendingReply(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!currentUid || !isOwner || deleting) return;
    if (confirmDeleteId !== activeStatus.id) {
      setConfirmDeleteId(activeStatus.id);
      return;
    }
    setDeleting(true);
    try {
      await deleteOwnStatus(activeStatus.id, currentUid);
      onStatusDeleted?.(activeStatus.id);
      onShowToast('Status deleted');
      setConfirmDeleteId(null);
    } catch (err) {
      onShowToast(resolveSocialErrorMessage(err, 'Unable to delete Status.'));
    } finally {
      setDeleting(false);
    }
  };

  const textStyleClass =
    activeStatus.textStyle === 'bold'
      ? 'font-black uppercase tracking-wide'
      : activeStatus.textStyle === 'editorial'
      ? 'font-serif italic font-semibold'
      : activeStatus.textStyle === 'mono'
      ? 'font-mono font-bold'
      : 'font-bold';

  return (
    <div className="fixed inset-0 z-50 bg-[#04070f] flex items-center justify-center select-none">
      <audio ref={customAudioElRef} loop className="hidden" />

      <div className="relative w-full h-full max-w-md mx-auto flex flex-col bg-[#060a14] sm:rounded-3xl sm:max-h-[92vh] sm:border sm:border-slate-800 overflow-hidden shadow-2xl">
        {/* Top Segmented Progress Bars + Header Overlay */}
        <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/85 via-black/45 to-transparent px-3 pt-3 pb-6">
          <div className="flex gap-1 mb-3">
            {activeGroup.statuses.map((st, idx) => {
              const barPct = idx < slideIdx ? 100 : idx === slideIdx ? progress : 0;
              return (
                <div key={st.id} className="h-1 flex-1 rounded-full bg-white/25 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-300 via-white to-cyan-300 transition-[width] duration-75"
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <CreatorAvatar
                uid={activeStatus.authorUid}
                fallbackPhoto={activeStatus.authorPhoto}
                fallbackName={activeStatus.authorName}
                className="w-9 h-9 rounded-full border border-white/40 shrink-0"
              />
              <div className="min-w-0">
                <div className="text-xs font-black text-white truncate flex items-center gap-1.5">
                  <span>{isOwner ? 'My Status' : activeStatus.authorName}</span>
                  {isPaused && (
                    <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded uppercase flex items-center gap-0.5">
                      <Pause className="w-2.5 h-2.5" /> Paused
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-300 flex items-center gap-1.5">
                  <span>{formatRelativeTime(activeStatus.createdAtMs)}</span>
                  <span>•</span>
                  <span className="capitalize">{activeStatus.privacyMode.replace('_', ' ')}</span>
                  {activeStatus.audioTrack && activeStatus.audioTrack.mode !== 'original' && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-0.5 text-amber-300 truncate max-w-[110px]">
                        <Music className="w-2.5 h-2.5 shrink-0" /> {activeStatus.audioTrack.label}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 relative">
              {/* Volume Slider Toggle + Mute Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMuted((m) => !m);
                  setShowVolumeSlider(true);
                }}
                onMouseEnter={() => setShowVolumeSlider(true)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-white hover:bg-white/15 transition cursor-pointer"
                aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-300" />
                ) : (
                  <Volume2 className="w-4 h-4 text-white" />
                )}
              </button>

              {showVolumeSlider && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-12 right-12 bg-black/90 border border-slate-700 rounded-2xl px-3 py-2 flex items-center gap-2 shadow-xl z-40"
                >
                  <span className="text-[10px] font-mono text-slate-300">{Math.round((isMuted ? 0 : volume) * 100)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={isMuted ? 0 : Math.round(volume * 100)}
                    onChange={(ev) => {
                      const val = Number(ev.target.value) / 100;
                      setVolume(val);
                      setIsMuted(val === 0);
                    }}
                    className="w-24 accent-cyan-400 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => setShowVolumeSlider(false)}
                    className="text-slate-400 hover:text-white text-xs font-bold px-1 cursor-pointer"
                  >
                    ✓
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-white hover:bg-white/15 transition cursor-pointer"
                aria-label="Close Status Viewer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Main Interactive Media Canvas (Tap Left/Right, Hold Pause, Swipe Users/Close) */}
        <div
          onPointerDown={handleStagePointerDown}
          onPointerUp={handleStagePointerUp}
          onPointerCancel={handleStagePointerCancel}
          className="flex-1 relative flex items-center justify-center overflow-hidden touch-none cursor-pointer"
          style={
            activeStatus.type === 'text'
              ? { background: activeStatus.bgGradient || 'linear-gradient(135deg, #1b1404, #0c1220)' }
              : undefined
          }
        >
          {activeStatus.type === 'image' && (
            activeStatus.mediaUrl ? (
              <img
                src={activeStatus.mediaUrl}
                alt={activeStatus.caption || 'KING Status'}
                className="w-full h-full object-contain bg-black"
                draggable={false}
              />
            ) : (
              <div className="px-6 text-center max-w-xs space-y-2">
                <p className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Protected Status Media
                </p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Private Status media requires authenticated server signing (/api/status/feed).
                </p>
              </div>
            )
          )}

          {activeStatus.type === 'video' && (
            resolvedVideoSrc ? (
              <video
                ref={videoRef}
                key={`${activeStatus.id}_${useRawVideoFallback ? 'raw' : 'opt'}`}
                src={resolvedVideoSrc}
                poster={activeStatus.thumbnailUrl || undefined}
                playsInline
                autoPlay
                className="w-full h-full object-contain bg-black"
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  const cappedDur = Math.min(MAX_STATUS_VIDEO_SECONDS, v.duration || activeStatus.durationSec || 6);
                  if (cappedDur > 0) {
                    setProgress(Math.min(100, (v.currentTime / cappedDur) * 100));
                  }
                  if (v.currentTime >= MAX_STATUS_VIDEO_SECONDS) {
                    v.pause();
                    goNextSlide();
                  }
                }}
                onEnded={goNextSlide}
                onError={() => {
                  if (!useRawVideoFallback && activeStatus.mediaUrl !== resolvedVideoSrc) {
                    setUseRawVideoFallback(true);
                  }
                }}
              />
            ) : (
              <div className="px-6 text-center max-w-xs space-y-2">
                <p className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Protected Status Video
                </p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Private Status media requires authenticated server signing (/api/status/feed).
                </p>
              </div>
            )
          )}

          {activeStatus.type === 'text' && (
            <div className="px-8 text-center max-w-sm">
              <p className={`text-2xl text-white leading-relaxed drop-shadow-lg break-words ${textStyleClass}`}>
                {activeStatus.textContent}
              </p>
            </div>
          )}

          {/* Optional Caption Overlay */}
          {activeStatus.caption && activeStatus.type !== 'text' && (
            <div className="absolute bottom-24 left-4 right-4 z-20 pointer-events-none flex justify-center">
              <p className="bg-black/70 backdrop-blur-md text-white text-xs sm:text-sm font-medium px-4 py-2 rounded-2xl border border-white/10 text-center max-w-sm">
                {activeStatus.caption}
              </p>
            </div>
          )}
        </div>

        {/* Bottom Controls: Owner-Only Stats vs Viewer Reactions & Private Reply */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative z-30 bg-gradient-to-t from-black via-black/90 to-transparent px-3 pt-3 pb-4 space-y-2.5"
        >
          {isOwner ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowInsights(true)}
                className="flex-1 min-h-[44px] px-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-white text-xs font-bold flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-cyan-400" />
                  <span>{Math.max(ownerViewers.length, activeStatus.viewsCount)} Views</span>
                  <span className="text-slate-500">•</span>
                  <Heart className="w-3.5 h-3.5 text-rose-400" />
                  <span>{Math.max(ownerLikes.length, activeStatus.likesCount)}</span>
                  <span className="text-slate-500">•</span>
                  <MessageCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>{ownerReplies.length}</span>
                </span>
                <ChevronUp className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAddStatus();
                }}
                className="min-h-[44px] px-3 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" /> Add
              </button>

              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteCurrent}
                className={`min-h-[44px] px-3 rounded-2xl text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0 transition ${
                  confirmDeleteId === activeStatus.id
                    ? 'bg-red-600 text-white'
                    : 'bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-500/40'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                {confirmDeleteId === activeStatus.id ? (deleting ? '...' : 'Confirm') : 'Delete'}
              </button>
            </div>
          ) : (
            <>
              {/* Quick Reactions Row */}
              <div className="flex items-center justify-between gap-1 px-1">
                {STATUS_REACTION_EMOJIS.map((emoji) => {
                  const active = activeStatus.myReaction === emoji;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      disabled={reacting}
                      onClick={() => handleReaction(emoji)}
                      className={`min-h-[44px] flex-1 rounded-2xl text-lg flex items-center justify-center transition active:scale-90 cursor-pointer ${
                        active
                          ? 'bg-amber-400/25 border-2 border-amber-400 scale-105'
                          : 'bg-white/10 hover:bg-white/20 border border-white/10'
                      }`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>

              {/* Private Reply Box */}
              <form onSubmit={handleSendReply} className="flex items-center gap-2">
                <input
                  type="text"
                  value={replyText}
                  maxLength={500}
                  onFocus={() => setIsPaused(true)}
                  onBlur={() => setIsPaused(false)}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply privately to ${activeStatus.authorName}...`}
                  className="flex-1 min-h-[44px] bg-white/10 border border-white/20 focus:border-cyan-400 rounded-2xl px-4 text-xs text-white placeholder:text-slate-300 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || sendingReply}
                  className="min-h-[44px] min-w-[44px] rounded-2xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black flex items-center justify-center cursor-pointer transition"
                  aria-label="Send private reply"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>

        {/* OWNER-ONLY VIEWERS, REACTIONS & PRIVATE REPLIES SHEET */}
        {isOwner && showInsights && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 z-40 max-h-[72%] bg-[#090f1f] border-t border-slate-700 rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="text-xs font-black text-white uppercase tracking-wider">
                Status Insights (Only visible to you)
              </div>
              <button
                type="button"
                onClick={() => setShowInsights(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close insights"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Viewers */}
              <div>
                <h4 className="text-[11px] font-black text-cyan-400 uppercase mb-2">
                  Viewed by ({ownerViewers.length})
                </h4>
                {ownerViewers.length === 0 ? (
                  <p className="text-xs text-slate-500">No viewers yet.</p>
                ) : (
                  <div className="space-y-2">
                    {ownerViewers.map((v) => {
                      const likeMatch = ownerLikes.find((l) => l.userUid === v.viewerUid);
                      return (
                        <div
                          key={v.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-[#060a14] border border-slate-800"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <CreatorAvatar
                              uid={v.viewerUid}
                              fallbackPhoto={v.viewerPhoto}
                              fallbackName={v.viewerName}
                              className="w-8 h-8 rounded-full shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">{v.viewerName}</div>
                              <div className="text-[10px] text-slate-400">
                                {formatRelativeTime(v.viewedAtMs)}
                              </div>
                            </div>
                          </div>
                          {likeMatch && <span className="text-base">{likeMatch.emoji}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reactions not in viewer list or full summary */}
              {ownerLikes.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-black text-rose-400 uppercase mb-2">
                    Reactions ({ownerLikes.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {ownerLikes.map((l) => (
                      <div
                        key={l.id}
                        className="px-2.5 py-1 rounded-xl bg-[#060a14] border border-slate-800 text-xs text-white flex items-center gap-1.5"
                      >
                        <span>{l.emoji}</span>
                        <span className="font-semibold">{l.userName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Private Replies */}
              <div>
                <h4 className="text-[11px] font-black text-amber-400 uppercase mb-2">
                  Private Replies ({ownerReplies.length})
                </h4>
                {ownerReplies.length === 0 ? (
                  <p className="text-xs text-slate-500">No private replies yet.</p>
                ) : (
                  <div className="space-y-2">
                    {ownerReplies.map((r) => (
                      <div
                        key={r.id}
                        className="p-2.5 rounded-xl bg-[#060a14] border border-slate-800 space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-white">{r.senderName}</span>
                          <span className="text-slate-500">{formatRelativeTime(r.createdAtMs)}</span>
                        </div>
                        <p className="text-xs text-slate-200 break-words">{r.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
