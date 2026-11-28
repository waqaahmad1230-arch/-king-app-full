import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Film, Image as ImageIcon, Info, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchAuthorizedStatusFeed,
  groupStatusesByAuthor,
  subscribeMyActiveStatuses,
} from '../services/statusService';
import { StatusReactionEmoji, StatusRecord } from '../types/social';
import { getStatusCardThumbnailUrl } from '../utils/statusMediaUtils';
import CreatorAvatar, { CreatorDisplayName } from './CreatorAvatar';
import StatusEditorModal from './StatusEditorModal';
import StatusViewerModal from './StatusViewerModal';
import SystemCameraGalleryModal from './SystemCameraGalleryModal';

function StatusCardMediaBackdrop({
  status,
  altLabel,
}: {
  status: StatusRecord;
  altLabel: string;
}) {
  const thumbUrl = useMemo(() => getStatusCardThumbnailUrl(status), [status]);
  const [imgFailed, setImgFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
    setVideoFailed(false);
  }, [thumbUrl, status.id]);

  if (status.type === 'text') {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center px-3 pt-12 pb-10"
        style={{ background: status.bgGradient || 'linear-gradient(135deg, #1b1404, #0c1220)' }}
      >
        <p className="text-xs font-bold text-white/95 text-center leading-snug line-clamp-5 break-words drop-shadow">
          {status.textContent}
        </p>
      </div>
    );
  }

  if (thumbUrl && !imgFailed) {
    return (
      <img
        src={thumbUrl}
        alt={altLabel}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setImgFailed(true)}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
    );
  }

  if (status.type === 'video' && status.mediaUrl && !videoFailed) {
    return (
      <video
        src={status.mediaUrl}
        muted
        playsInline
        preload="metadata"
        onError={() => setVideoFailed(true)}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
    );
  }

  return (
    <div className="absolute inset-0 bg-gradient-to-b from-[#131d35] via-[#0c1324] to-[#070b15] flex items-center justify-center">
      {status.type === 'video' ? (
        <Film className="w-8 h-8 text-slate-500/80" />
      ) : (
        <ImageIcon className="w-8 h-8 text-slate-500/80" />
      )}
    </div>
  );
}

interface StatusBarProps {
  lightMode?: boolean;
  onOverlayChange?: (isOpen: boolean) => void;
  onOpenCreatorProfile?: (uid: string) => void;
}

export default function StatusBar({ lightMode = false, onOverlayChange, onOpenCreatorProfile }: StatusBarProps) {
  const { user, openAuthModal } = useAuth();
  const signedInUid = user?.uid || null;

  const [myStatuses, setMyStatuses] = useState<StatusRecord[]>([]);
  const [feedStatuses, setFeedStatuses] = useState<StatusRecord[]>([]);
  const [backendConfigured, setBackendConfigured] = useState<boolean>(true);
  const [backendNotice, setBackendNotice] = useState<string | null>(null);
  const [showBackendInfo, setShowBackendInfo] = useState<boolean>(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editorInitialFile, setEditorInitialFile] = useState<File | null>(null);
  const [viewerAuthorUid, setViewerAuthorUid] = useState<string | null>(null);
  const [viewerOrderSnapshot, setViewerOrderSnapshot] = useState<string[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const sessionSignedCacheRef = useRef<Map<string, StatusRecord>>(new Map());
  const directGalleryInputRef = useRef<HTMLInputElement | null>(null);

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

  const groups = useMemo(
    () => groupStatusesByAuthor(mergedStatuses, signedInUid),
    [mergedStatuses, signedInUid]
  );

  const ownGroupIndex = useMemo(
    () => groups.findIndex((g) => g.isOwn),
    [groups]
  );
  const ownGroup = ownGroupIndex >= 0 ? groups[ownGroupIndex] : null;
  const activeOwnStatuses = ownGroup ? ownGroup.statuses : [];
  const ownLatest = activeOwnStatuses[activeOwnStatuses.length - 1];

  const otherGroups = useMemo(
    () => groups.filter((g) => !g.isOwn),
    [groups]
  );

  // Keep group order frozen while viewer is open so marking statuses "viewed" never jumps to another user
  const viewerGroups = useMemo(() => {
    if (!viewerAuthorUid || viewerOrderSnapshot.length === 0) return groups;
    const byUid = new Map(groups.map((g) => [g.authorUid, g] as const));
    const ordered = viewerOrderSnapshot
      .map((uid) => byUid.get(uid))
      .filter((g): g is NonNullable<typeof g> => Boolean(g));
    for (const g of groups) {
      if (!viewerOrderSnapshot.includes(g.authorUid)) {
        ordered.push(g);
      }
    }
    return ordered;
  }, [groups, viewerAuthorUid, viewerOrderSnapshot]);

  const resolvedViewerGroupIndex = useMemo(() => {
    if (!viewerAuthorUid || viewerGroups.length === 0) return null;
    const idx = viewerGroups.findIndex((g) => g.authorUid === viewerAuthorUid);
    return idx >= 0 ? idx : null;
  }, [viewerGroups, viewerAuthorUid]);

  useEffect(() => {
    onOverlayChange?.(editorOpen || resolvedViewerGroupIndex !== null);
  }, [editorOpen, resolvedViewerGroupIndex, onOverlayChange]);

  const openViewerForAuthor = useCallback(
    (authorUid: string) => {
      if (!authorUid || groups.length === 0) return;
      setViewerOrderSnapshot(groups.map((g) => g.authorUid));
      setViewerAuthorUid(authorUid);
    },
    [groups]
  );

  const closeViewer = useCallback(() => {
    setViewerAuthorUid(null);
    setViewerOrderSnapshot([]);
  }, []);

  const [showSystemCameraModal, setShowSystemCameraModal] = useState<boolean>(false);

  // Trigger immersive System Camera & Gallery tray modal on click
  const openNativeGalleryPicker = useCallback(() => {
    if (!signedInUid) {
      openAuthModal('login');
      return;
    }
    setShowSystemCameraModal(true);
  }, [signedInUid, openAuthModal]);

  const handleMediaCapturedFromSystemModal = (file: File) => {
    setEditorInitialFile(file);
    setEditorOpen(true);
  };

  const handleMyStatusTap = () => {
    if (!signedInUid) {
      openAuthModal('login');
      return;
    }
    if (ownGroup && ownGroup.statuses.length > 0) {
      openViewerForAuthor(ownGroup.authorUid);
    } else {
      openNativeGalleryPicker();
    }
  };

  const handleOpenAddModal = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    openNativeGalleryPicker();
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
    <section
      className={
        lightMode
          ? 'bg-white border-y border-slate-200 px-4 pt-3 pb-2.5 shadow-sm'
          : 'px-4 pt-3 pb-1'
      }
    >
      {/* System Camera & Gallery Tray Modal */}
      <SystemCameraGalleryModal
        isOpen={showSystemCameraModal}
        onClose={() => setShowSystemCameraModal(false)}
        onMediaCaptured={handleMediaCapturedFromSystemModal}
        onShowToast={showToast}
      />

      {toastMsg && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[180] bg-slate-900 border border-blue-500/40 text-white px-4 py-2 rounded-2xl text-xs font-bold shadow-xl pointer-events-none">
          {toastMsg}
        </div>
      )}

      {/* Header Row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <h2
            className={`text-xs font-extrabold uppercase tracking-wider ${
              lightMode ? 'text-slate-900' : 'text-amber-300'
            }`}
          >
            KING Status
          </h2>
          <span
            className={`text-[11px] font-medium ${
              lightMode ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            24h Moments
          </span>
        </div>

        {!backendConfigured && backendNotice && (
          <button
            type="button"
            onClick={() => setShowBackendInfo((v) => !v)}
            className={`text-[10px] flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              lightMode
                ? 'text-blue-600 hover:text-blue-700 font-semibold'
                : 'text-amber-300/90 hover:text-amber-200'
            }`}
          >
            <Info className="w-3 h-3" />
            <span>Private feed setup required</span>
          </button>
        )}
      </div>

      {showBackendInfo && !backendConfigured && backendNotice && (
        <div
          className={`mb-2.5 p-2.5 rounded-xl text-[11px] ${
            lightMode
              ? 'bg-amber-50 border border-amber-200 text-amber-900'
              : 'bg-amber-950/40 border border-amber-500/30 text-amber-200'
          }`}
        >
          {backendNotice}
        </div>
      )}

      {/* Large Horizontal Portrait Status Cards (150–180px x 230–270px on mobile, responsive) */}
      <div className="flex items-stretch gap-3 overflow-x-auto pb-1.5 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {/* 1. FIRST CARD: MY STATUS WITH PROMINENT + ICON (DIRECT GALLERY ACCESS) */}
        <div
          className={`group relative w-[156px] h-[238px] sm:w-[168px] sm:h-[256px] md:w-[178px] md:h-[268px] shrink-0 snap-start rounded-2xl overflow-hidden transition duration-150 ${
            lightMode ? 'bg-slate-100' : 'bg-[#0b1222]'
          } ${
            ownLatest
              ? lightMode
                ? 'border-2 border-slate-300 hover:border-slate-400 shadow-sm'
                : 'border-2 border-slate-500/75 hover:border-slate-400 shadow-lg shadow-black/35'
              : lightMode
              ? 'border border-slate-200 hover:border-[#1877F2] shadow-sm'
              : 'border border-dashed border-slate-600/85 hover:border-blue-400/80 shadow-lg shadow-black/25'
          }`}
        >
          <button
            type="button"
            onClick={handleMyStatusTap}
            aria-label={ownLatest ? 'View My Status' : 'Add photo or video to My Status'}
            className="relative w-full h-full block text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-[0.985] transition-transform duration-150"
          >
            {ownLatest ? (
              <StatusCardMediaBackdrop
                status={ownLatest}
                altLabel={ownLatest.caption || 'My Status'}
              />
            ) : lightMode ? (
              <div className="absolute inset-0 bg-gradient-to-b from-blue-50 via-slate-100 to-white">
                {user?.photoURL && (
                  <img
                    src={user.photoURL}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover opacity-35"
                  />
                )}
              </div>
            ) : (
              <div className="absolute inset-0 bg-gradient-to-b from-[#16223d] via-[#0d1529] to-[#070b15]">
                {user?.photoURL && (
                  <img
                    src={user.photoURL}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover opacity-25 blur-[2px] scale-105"
                  />
                )}
              </div>
            )}

            {/* Contrast Scrim */}
            <div
              className={`absolute inset-0 pointer-events-none ${
                !ownLatest && lightMode
                  ? 'bg-gradient-to-b from-black/10 via-transparent to-white/95'
                  : 'bg-gradient-to-b from-black/45 via-black/10 to-black/80'
              }`}
            />

            {/* Top-left Profile Picture */}
            <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
              <CreatorAvatar
                uid={signedInUid}
                fallbackPhoto={user?.photoURL}
                fallbackName={user?.displayName || 'My Status'}
                className={`w-8 h-8 rounded-full shadow-md ${
                  lightMode ? 'border-2 border-white' : 'border-2 border-slate-300/85'
                }`}
              />
            </div>

            {/* Prominent Centered + Action when no own status is active */}
            {!ownLatest && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <span className="w-11 h-11 rounded-full bg-[#1877F2] group-hover:bg-[#166FE5] text-white flex items-center justify-center shadow-lg border-2 border-white transition-colors">
                  <Plus className="w-6 h-6 stroke-[2.75]" />
                </span>
              </div>
            )}

            {/* Bottom Title */}
            <div className="absolute bottom-0 inset-x-0 z-10 px-3 pb-2.5 pt-8 pointer-events-none">
              <div
                className={`text-xs font-extrabold leading-tight truncate ${
                  !ownLatest && lightMode ? 'text-slate-900' : 'text-white drop-shadow'
                }`}
              >
                My Status
              </div>
              {activeOwnStatuses.length > 0 ? (
                <div className="text-[10.5px] font-medium text-slate-200 leading-tight truncate tabular-nums mt-0.5">
                  {activeOwnStatuses.length === 1
                    ? 'Tap to view'
                    : `${activeOwnStatuses.length} updates`}
                </div>
              ) : (
                <div
                  className={`text-[10.5px] font-semibold leading-tight truncate mt-0.5 ${
                    lightMode ? 'text-[#1877F2]' : 'text-blue-300'
                  }`}
                >
                  Photo or video
                </div>
              )}
            </div>
          </button>

          {/* Render strictly ONE + button when active My Status already exists (empty card shows centered + above) */}
          {ownLatest && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              aria-label="Add photo or video Status"
              title="Add Status from Gallery"
              className="absolute top-1 right-1 z-20 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-full"
            >
              <span
                className={`w-8 h-8 rounded-full bg-[#1877F2] hover:bg-[#166FE5] text-white border-2 flex items-center justify-center shadow-lg transition-colors ${
                  lightMode ? 'border-white' : 'border-[#0b1222]'
                }`}
              >
                <Plus className="w-4 h-4 stroke-[3]" />
              </span>
            </button>
          )}
        </div>

        {/* 2. FRIENDS & FOLLOWED USERS' LARGE PORTRAIT STATUS CARDS */}
        {otherGroups.map((grp) => {
          const previewStatus =
            grp.statuses.find((s) => !s.viewedByMe) || grp.statuses[grp.statuses.length - 1];
          if (!previewStatus) return null;

          const cardBorderClass = grp.hasUnseen
            ? lightMode
              ? 'border-2 border-[#1877F2] shadow-sm hover:border-blue-600'
              : 'border-2 border-blue-400/85 shadow-[0_0_16px_rgba(96,165,250,0.22)] hover:border-blue-300'
            : lightMode
            ? 'border-2 border-slate-300 hover:border-slate-400 shadow-sm'
            : 'border-2 border-slate-500/70 hover:border-slate-400/80 shadow-lg shadow-black/30';

          const avatarBorderClass = grp.hasUnseen
            ? 'border-2 border-[#1877F2]'
            : 'border-2 border-slate-300';

          return (
            <button
              key={grp.authorUid}
              type="button"
              onClick={() => openViewerForAuthor(grp.authorUid)}
              aria-label={`View ${grp.authorName}'s Status`}
              className={`group relative w-[156px] h-[238px] sm:w-[168px] sm:h-[256px] md:w-[178px] md:h-[268px] shrink-0 snap-start rounded-2xl overflow-hidden bg-slate-900 text-left cursor-pointer active:scale-[0.985] transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${cardBorderClass}`}
            >
              <StatusCardMediaBackdrop
                status={previewStatus}
                altLabel={previewStatus.caption || `${grp.authorName}'s Status`}
              />

              {/* Top & Bottom Contrast Scrim */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/5 to-black/85 pointer-events-none" />

              {/* Top-left Uploader Profile Picture + Video Indicator */}
              <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between pointer-events-none">
                <CreatorAvatar
                  uid={grp.authorUid}
                  fallbackPhoto={grp.authorPhoto}
                  fallbackName={grp.authorName}
                  className={`w-8 h-8 rounded-full shadow-md ${avatarBorderClass}`}
                />
                {previewStatus.type === 'video' && (
                  <Film className="w-4 h-4 text-white/90 drop-shadow shrink-0" />
                )}
              </div>

              {/* Bottom Uploader Name & Updates Count */}
              <div className="absolute bottom-0 inset-x-0 z-10 px-3 pb-2.5 pt-8 pointer-events-none">
                <div
                  className={`text-xs leading-tight truncate drop-shadow ${
                    grp.hasUnseen ? 'font-extrabold text-white' : 'font-semibold text-slate-200'
                  }`}
                >
                  <CreatorDisplayName uid={grp.authorUid} fallback={grp.authorName} />
                </div>
                {grp.statuses.length > 1 && (
                  <div className="text-[10.5px] font-medium text-slate-300 leading-tight truncate tabular-nums mt-0.5">
                    {grp.statuses.length} updates
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Full-Screen Status Editor & Publish Settings Modal */}
      <StatusEditorModal
        isOpen={editorOpen}
        initialFile={editorInitialFile}
        currentUid={signedInUid}
        authorName={user?.displayName || 'KING Creator'}
        authorPhoto={user?.photoURL || ''}
        onClose={() => {
          setEditorOpen(false);
          setEditorInitialFile(null);
        }}
        onCreated={(created) => {
          sessionSignedCacheRef.current.set(created.id, created);
          refreshFeed().catch(() => {});
        }}
        onShowToast={showToast}
      />

      {/* Full-Screen Status Viewer */}
      {resolvedViewerGroupIndex !== null && viewerGroups.length > 0 && (
        <StatusViewerModal
          groups={viewerGroups}
          initialGroupIndex={resolvedViewerGroupIndex}
          currentUid={signedInUid}
          currentUser={user}
          onClose={closeViewer}
          onOpenAddStatus={openNativeGalleryPicker}
          onStatusViewed={handleStatusViewed}
          onStatusReactionChanged={handleStatusReactionChanged}
          onStatusDeleted={handleStatusDeleted}
          onShowToast={showToast}
          onOpenCreatorProfile={onOpenCreatorProfile}
        />
      )}
    </section>
  );
}
