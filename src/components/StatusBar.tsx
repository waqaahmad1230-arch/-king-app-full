import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Film, Info, Plus, Type } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchAuthorizedStatusFeed,
  groupStatusesByAuthor,
  subscribeMyActiveStatuses,
} from '../services/statusService';
import { StatusReactionEmoji, StatusRecord } from '../types/social';
import CreatorAvatar, { CreatorDisplayName } from './CreatorAvatar';
import StatusUploadModal from './StatusUploadModal';
import StatusViewerModal from './StatusViewerModal';

export default function StatusBar() {
  const { user, openAuthModal } = useAuth();
  const signedInUid = user?.uid || null;

  const [myStatuses, setMyStatuses] = useState<StatusRecord[]>([]);
  const [feedStatuses, setFeedStatuses] = useState<StatusRecord[]>([]);
  const [backendConfigured, setBackendConfigured] = useState<boolean>(true);
  const [backendNotice, setBackendNotice] = useState<string | null>(null);
  const [showBackendInfo, setShowBackendInfo] = useState<boolean>(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [viewerGroupIndex, setViewerGroupIndex] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const sessionSignedCacheRef = useRef<Map<string, StatusRecord>>(new Map());

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((prev) => (prev === msg ? null : prev)), 3200);
  }, []);

  const refreshFeed = useCallback(async () => {
    if (!signedInUid) {
      setFeedStatuses([]);
      setBackendConfigured(true);
      setBackendNotice(null);
      return;
    }
    const res = await fetchAuthorizedStatusFeed();
    setFeedStatuses(res.statuses);
    setBackendConfigured(res.backendConfigured);
    setBackendNotice(res.missingSetupMessage || null);
  }, [signedInUid]);

  // Subscribe to signed-in user's own active statuses in real time
  useEffect(() => {
    if (!signedInUid) {
      setMyStatuses([]);
      sessionSignedCacheRef.current.clear();
      return;
    }
    return subscribeMyActiveStatuses(signedInUid, setMyStatuses);
  }, [signedInUid]);

  // Fetch privacy-filtered friends/following feed on mount / sign-in / periodic refresh
  useEffect(() => {
    refreshFeed();
    if (!signedInUid) return;
    const interval = setInterval(refreshFeed, 45000);
    return () => clearInterval(interval);
  }, [signedInUid, refreshFeed]);

  // Exact 24-hour expiry timer: wakes up right when the earliest active status expires
  useEffect(() => {
    const all = [...feedStatuses, ...myStatuses];
    const now = Date.now();
    let earliestExp = Infinity;
    for (const s of all) {
      if (s.expiresAtMs > now && s.expiresAtMs < earliestExp) {
        earliestExp = s.expiresAtMs;
      }
    }
    if (!Number.isFinite(earliestExp)) return;

    const delayMs = Math.min(60_000, Math.max(50, earliestExp - now + 50));
    const timer = window.setTimeout(() => {
      setNowTick(Date.now());
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [feedStatuses, myStatuses, nowTick]);

  // Merge own real-time statuses with authorized feed (preserving viewedByMe, myReaction, and signed URLs)
  const mergedStatuses = useMemo(() => {
    const map = new Map<string, StatusRecord>();
    for (const s of feedStatuses) {
      if (s.expiresAtMs > nowTick) {
        map.set(s.id, s);
      }
    }
    for (const own of myStatuses) {
      if (own.expiresAtMs <= nowTick) {
        sessionSignedCacheRef.current.delete(own.id);
        continue;
      }
      const existing = map.get(own.id);
      const sessionCached = sessionSignedCacheRef.current.get(own.id);
      const preservedMediaUrl =
        existing?.mediaUrl || own.mediaUrl || sessionCached?.mediaUrl || '';
      const preservedThumbUrl =
        existing?.thumbnailUrl || own.thumbnailUrl || sessionCached?.thumbnailUrl || '';
      const preservedAudioTrack =
        own.audioTrack?.mode === 'custom_audio' && !own.audioTrack.audioUrl
          ? existing?.audioTrack?.audioUrl
            ? existing.audioTrack
            : sessionCached?.audioTrack?.audioUrl
            ? sessionCached.audioTrack
            : own.audioTrack
          : own.audioTrack;

      map.set(
        own.id,
        existing
          ? {
              ...own,
              ...existing,
              mediaUrl: preservedMediaUrl,
              thumbnailUrl: preservedThumbUrl,
              audioTrack: preservedAudioTrack,
              viewsCount: own.viewsCount,
              likesCount: own.likesCount,
            }
          : {
              ...own,
              mediaUrl: preservedMediaUrl,
              thumbnailUrl: preservedThumbUrl,
              audioTrack: preservedAudioTrack,
            }
      );
    }
    return Array.from(map.values());
  }, [feedStatuses, myStatuses, nowTick]);

  const activeOwnStatuses = useMemo(
    () => myStatuses.filter((s) => s.expiresAtMs > nowTick),
    [myStatuses, nowTick]
  );

  const groups = useMemo(
    () => groupStatusesByAuthor(mergedStatuses, signedInUid),
    [mergedStatuses, signedInUid]
  );

  const ownGroupIndex = useMemo(
    () => groups.findIndex((g) => g.isOwn),
    [groups]
  );
  const otherGroups = useMemo(
    () => groups.filter((g) => !g.isOwn),
    [groups]
  );

  const ownLatest = activeOwnStatuses[activeOwnStatuses.length - 1];

  const handleMyStatusTap = () => {
    if (!signedInUid) {
      openAuthModal('login');
      return;
    }
    if (ownGroupIndex >= 0) {
      setViewerGroupIndex(ownGroupIndex);
    } else {
      setUploadModalOpen(true);
    }
  };

  const handleOpenAddModal = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!signedInUid) {
      openAuthModal('login');
      return;
    }
    setUploadModalOpen(true);
  };

  const handleStatusViewed = useCallback((statusId: string) => {
    setFeedStatuses((prev) =>
      prev.map((s) => (s.id === statusId ? { ...s, viewedByMe: true } : s))
    );
  }, []);

  const handleStatusReactionChanged = useCallback(
    (statusId: string, myReaction: StatusReactionEmoji | null, likesCount: number) => {
      setFeedStatuses((prev) =>
        prev.map((s) => (s.id === statusId ? { ...s, myReaction, likesCount } : s))
      );
    },
    []
  );

  const handleStatusDeleted = useCallback((statusId: string) => {
    sessionSignedCacheRef.current.delete(statusId);
    setFeedStatuses((prev) => prev.filter((s) => s.id !== statusId));
    setMyStatuses((prev) => prev.filter((s) => s.id !== statusId));
  }, []);

  return (
    <section className="px-4 pt-3 pb-1">
      {toastMsg && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] bg-[#0f172a] border border-cyan-500/50 text-cyan-200 px-4 py-2 rounded-2xl text-xs font-bold shadow-xl">
          {toastMsg}
        </div>
      )}

      {/* Header Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-black uppercase tracking-wider text-amber-300">
            KING Status
          </h2>
          <span className="text-[10px] text-slate-400 font-semibold">24h Moments</span>
        </div>

        {!backendConfigured && backendNotice && (
          <button
            type="button"
            onClick={() => setShowBackendInfo((v) => !v)}
            className="text-[10px] text-amber-300/90 hover:text-amber-200 flex items-center gap-1 cursor-pointer"
          >
            <Info className="w-3 h-3" />
            <span>Private feed setup required</span>
          </button>
        )}
      </div>

      {showBackendInfo && !backendConfigured && backendNotice && (
        <div className="mb-2.5 p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-[11px] text-amber-200">
          {backendNotice}
        </div>
      )}

      {/* Horizontal Status Strip */}
      <div className="flex items-start gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {/* 1. MY STATUS + ADD (+) */}
        <div className="w-[74px] shrink-0 flex flex-col items-center gap-1.5">
          <div className="relative">
            <button
              type="button"
              onClick={handleMyStatusTap}
              className={`w-16 h-16 rounded-full p-[2.5px] transition active:scale-95 cursor-pointer flex items-center justify-center ${
                activeOwnStatuses.length > 0
                  ? 'bg-gradient-to-tr from-amber-400 via-orange-500 to-cyan-400 shadow-md shadow-amber-500/20'
                  : 'border-2 border-dashed border-cyan-500/60 bg-[#0d1527]'
              }`}
              aria-label="My Status"
            >
              <div className="w-full h-full rounded-full bg-[#060a14] p-[2px] flex items-center justify-center overflow-hidden">
                {ownLatest?.type === 'text' ? (
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center text-[10px] font-black text-white px-1 text-center leading-tight"
                    style={{ background: ownLatest.bgGradient }}
                  >
                    <Type className="w-4 h-4" />
                  </div>
                ) : (
                  <CreatorAvatar
                    uid={signedInUid}
                    fallbackPhoto={user?.photoURL}
                    fallbackName={user?.displayName || 'My Status'}
                    className="w-full h-full rounded-full"
                  />
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={handleOpenAddModal}
              className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-cyan-400 hover:bg-cyan-300 text-black border-2 border-[#060a14] flex items-center justify-center shadow cursor-pointer"
              aria-label="Add Status"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
            </button>
          </div>

          <span className="text-[11px] font-bold text-slate-200 truncate w-full text-center">
            {activeOwnStatuses.length > 0 ? `My (${activeOwnStatuses.length})` : 'My Status'}
          </span>
        </div>

        {/* 2. FRIENDS & FOLLOWED USERS' STATUSES */}
        {otherGroups.map((grp) => {
          const gIdx = groups.findIndex((g) => g.authorUid === grp.authorUid);
          const latest = grp.statuses[grp.statuses.length - 1];
          const ringClass = grp.hasUnseen
            ? 'bg-gradient-to-tr from-amber-400 via-rose-500 to-cyan-400 p-[2.5px] shadow-md shadow-cyan-500/20'
            : 'bg-slate-700/80 p-[2px]';

          return (
            <div key={grp.authorUid} className="w-[74px] shrink-0 flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => setViewerGroupIndex(gIdx >= 0 ? gIdx : 0)}
                className={`relative w-16 h-16 rounded-full ${ringClass} transition active:scale-95 cursor-pointer flex items-center justify-center`}
              >
                <div className="w-full h-full rounded-full bg-[#060a14] p-[2px] overflow-hidden flex items-center justify-center">
                  <CreatorAvatar
                    uid={grp.authorUid}
                    fallbackPhoto={grp.authorPhoto}
                    fallbackName={grp.authorName}
                    className="w-full h-full rounded-full"
                  />
                </div>

                {latest?.type === 'video' && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-amber-400 text-black border-2 border-[#060a14] flex items-center justify-center">
                    <Film className="w-2.5 h-2.5" />
                  </span>
                )}
              </button>

              <span
                className={`text-[11px] truncate w-full text-center ${
                  grp.hasUnseen ? 'font-extrabold text-white' : 'font-medium text-slate-400'
                }`}
              >
                <CreatorDisplayName uid={grp.authorUid} fallback={grp.authorName} />
              </span>
            </div>
          );
        })}
      </div>

      {/* Status Creator Modal */}
      <StatusUploadModal
        isOpen={uploadModalOpen}
        currentUid={signedInUid}
        authorName={user?.displayName || 'KING Creator'}
        authorPhoto={user?.photoURL || ''}
        onClose={() => setUploadModalOpen(false)}
        onCreated={(created) => {
          sessionSignedCacheRef.current.set(created.id, created);
          refreshFeed().catch(() => {});
        }}
        onShowToast={showToast}
      />

      {/* Full-Screen Status Viewer */}
      {viewerGroupIndex !== null && groups.length > 0 && (
        <StatusViewerModal
          groups={groups}
          initialGroupIndex={viewerGroupIndex}
          currentUid={signedInUid}
          currentUser={user}
          onClose={() => setViewerGroupIndex(null)}
          onOpenAddStatus={() => setUploadModalOpen(true)}
          onStatusViewed={handleStatusViewed}
          onStatusReactionChanged={handleStatusReactionChanged}
          onStatusDeleted={handleStatusDeleted}
          onShowToast={showToast}
        />
      )}
    </section>
  );
}
