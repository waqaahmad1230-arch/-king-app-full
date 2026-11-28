import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  AppNotificationRecord,
  StatusAudioTrack,
  StatusAuthorGroup,
  StatusCloudinaryDeliveryType,
  StatusLikeRecord,
  StatusMediaType,
  StatusPrivacyMode,
  StatusReactionEmoji,
  StatusRecord,
  StatusReplyRecord,
  StatusTextStyle,
  StatusVideoEdits,
  StatusViewRecord,
  StatusWhatsAppCta,
} from '../types/social';
import { sanitizeUid, resolveSocialErrorMessage } from './socialGraphService';
import { MAX_STATUS_VIDEO_SECONDS } from '../utils/statusMediaUtils';

export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;

export const STATUS_BG_GRADIENTS = [
  { id: 'royal_gold', label: 'Royal Gold', css: 'linear-gradient(135deg, #1b1404 0%, #4b3207 48%, #0c1220 100%)' },
  { id: 'cyber_cyan', label: 'Cyber Cyan', css: 'linear-gradient(135deg, #061826 0%, #0e4a67 52%, #040914 100%)' },
  { id: 'velvet_crimson', label: 'Velvet Crimson', css: 'linear-gradient(135deg, #270812 0%, #6b1128 52%, #0a0c18 100%)' },
  { id: 'emerald_night', label: 'Emerald Night', css: 'linear-gradient(135deg, #041d17 0%, #0b4f3e 50%, #050a14 100%)' },
  { id: 'obsidian', label: 'Obsidian Crown', css: 'linear-gradient(135deg, #090d16 0%, #1c2436 52%, #050811 100%)' },
] as const;

function toMillis(val: any): number {
  if (!val) return 0;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function makeStatusDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export interface CreateStatusInput {
  authorUid: string;
  authorName: string;
  authorPhoto: string;
  type: StatusMediaType;
  mediaUrl?: string;
  thumbnailUrl?: string;
  cloudinaryPublicId?: string;
  cloudinaryResourceType?: 'image' | 'video' | 'raw' | '';
  cloudinaryDeliveryType?: StatusCloudinaryDeliveryType;
  caption?: string;
  textContent?: string;
  bgGradient?: string;
  textStyle?: StatusTextStyle;
  durationSec: number;
  audioTrack: StatusAudioTrack;
  whatsappCta?: StatusWhatsAppCta;
  videoEdits?: StatusVideoEdits;
  privacyMode: StatusPrivacyMode;
  allowedUids?: string[];
  excludedUids?: string[];
}

export function sanitizeStatusUrlsForFirestore(params: {
  privacyMode: StatusPrivacyMode;
  deliveryType: StatusCloudinaryDeliveryType;
  mediaUrl: string;
  thumbnailUrl: string;
  audioTrack: StatusAudioTrack;
}): {
  mediaUrl: string;
  thumbnailUrl: string;
  audioTrack: StatusAudioTrack;
} {
  const isPrivateAuthenticated =
    params.privacyMode !== 'public' && params.deliveryType === 'authenticated';

  if (!isPrivateAuthenticated) {
    return {
      mediaUrl: params.mediaUrl,
      thumbnailUrl: params.thumbnailUrl,
      audioTrack: params.audioTrack,
    };
  }

  const sanitizedAudio: StatusAudioTrack = {
    mode: params.audioTrack.mode,
    label: params.audioTrack.label,
    ...(params.audioTrack.presetId ? { presetId: params.audioTrack.presetId } : {}),
    ...(params.audioTrack.cloudinaryPublicId
      ? { cloudinaryPublicId: params.audioTrack.cloudinaryPublicId }
      : {}),
  };

  return {
    mediaUrl: '',
    thumbnailUrl: '',
    audioTrack: sanitizedAudio,
  };
}

export async function createStatusPost(input: CreateStatusInput): Promise<StatusRecord> {
  const authorUid = sanitizeUid(input.authorUid);
  if (!authorUid) {
    throw new Error('You must sign in to publish a Status.');
  }

  const durationSec = Math.max(0, Math.min(MAX_STATUS_VIDEO_SECONDS, Number(input.durationSec) || 6));
  if (input.type === 'video' && (Number(input.durationSec) || 0) > MAX_STATUS_VIDEO_SECONDS) {
    throw new Error(`Video Status cannot exceed ${MAX_STATUS_VIDEO_SECONDS} seconds.`);
  }
  if (input.type === 'text' && !String(input.textContent || '').trim()) {
    throw new Error('Please write some text for your Text Status.');
  }
  if ((input.type === 'image' || input.type === 'video') && !String(input.mediaUrl || '').trim()) {
    throw new Error('Media upload URL is required.');
  }

  const allowedUids = Array.from(
    new Set((input.allowedUids || []).map((id) => sanitizeUid(id)).filter((id) => id && id !== authorUid))
  ).slice(0, 200);

  const excludedUids = Array.from(
    new Set((input.excludedUids || []).map((id) => sanitizeUid(id)).filter((id) => id && id !== authorUid))
  ).slice(0, 200);

  const statusId = makeStatusDocId('st');
  const nowMs = Date.now();
  const expiresAtMs = nowMs + STATUS_TTL_MS;

  const sessionMediaUrl = String(input.mediaUrl || '').trim().slice(0, 2000);
  const sessionThumbnailUrl = String(input.thumbnailUrl || '').trim().slice(0, 2000);
  const deliveryType = (input.cloudinaryDeliveryType || 'none') as StatusCloudinaryDeliveryType;

  const sessionAudioTrack: StatusAudioTrack = {
    mode: input.audioTrack?.mode || 'original',
    label: String(input.audioTrack?.label || 'Original Sound').slice(0, 100),
    ...(input.audioTrack?.presetId ? { presetId: String(input.audioTrack.presetId).slice(0, 64) } : {}),
    ...(input.audioTrack?.audioUrl ? { audioUrl: String(input.audioTrack.audioUrl).slice(0, 2000) } : {}),
    ...(input.audioTrack?.cloudinaryPublicId
      ? { cloudinaryPublicId: String(input.audioTrack.cloudinaryPublicId).slice(0, 500) }
      : {}),
  };

  const persistedUrls = sanitizeStatusUrlsForFirestore({
    privacyMode: input.privacyMode,
    deliveryType,
    mediaUrl: sessionMediaUrl,
    thumbnailUrl: sessionThumbnailUrl,
    audioTrack: sessionAudioTrack,
  });

  const sanitizedWhatsappCta =
    input.whatsappCta?.enabled && input.whatsappCta?.url
      ? {
          enabled: true,
          url: String(input.whatsappCta.url).trim().slice(0, 300),
          label: String(input.whatsappCta.label || 'Chat on WhatsApp').trim().slice(0, 40) || 'Chat on WhatsApp',
        }
      : undefined;

  const sanitizedVideoEdits: StatusVideoEdits | undefined = input.videoEdits
    ? {
        trimStartSec: Math.max(0, Number(input.videoEdits.trimStartSec) || 0),
        trimEndSec: Math.max(
          Math.max(0, Number(input.videoEdits.trimStartSec) || 0),
          Number(input.videoEdits.trimEndSec) || durationSec
        ),
        muted: Boolean(input.videoEdits.muted),
        overlays: Array.isArray(input.videoEdits.overlays)
          ? input.videoEdits.overlays.slice(0, 25).map((ov) => ({
              id: String(ov.id || '').slice(0, 40),
              kind: ov.kind === 'sticker' ? 'sticker' : 'text',
              content: String(ov.content || '').slice(0, 240),
              x: Math.max(0.04, Math.min(0.96, Number(ov.x) || 0.5)),
              y: Math.max(0.06, Math.min(0.94, Number(ov.y) || 0.5)),
              scale: Math.max(0.5, Math.min(3, Number(ov.scale) || 1)),
              ...(typeof ov.rotation === 'number' && Number.isFinite(ov.rotation)
                ? { rotation: Math.max(-180, Math.min(180, Math.round(ov.rotation))) }
                : {}),
              ...(ov.font ? { font: ov.font } : {}),
              ...(ov.color ? { color: String(ov.color).slice(0, 32) } : {}),
              ...(typeof ov.bold === 'boolean' ? { bold: ov.bold } : {}),
              ...(typeof ov.italic === 'boolean' ? { italic: ov.italic } : {}),
              ...(ov.align ? { align: ov.align } : {}),
              ...(ov.bgMode ? { bgMode: ov.bgMode } : {}),
              ...(ov.bgColor ? { bgColor: String(ov.bgColor).slice(0, 32) } : {}),
              ...(ov.effect ? { effect: ov.effect } : {}),
            }))
          : [],
      }
    : undefined;

  const docPayload = {
    authorUid,
    authorName: String(input.authorName || 'KING Creator').trim().slice(0, 100) || 'KING Creator',
    authorPhoto: String(input.authorPhoto || '').trim().slice(0, 1000),
    type: input.type,
    mediaUrl: persistedUrls.mediaUrl,
    thumbnailUrl: persistedUrls.thumbnailUrl,
    cloudinaryPublicId: String(input.cloudinaryPublicId || '').trim().slice(0, 500),
    cloudinaryResourceType: (input.cloudinaryResourceType || '') as 'image' | 'video' | 'raw' | '',
    cloudinaryDeliveryType: deliveryType,
    caption: String(input.caption || '').trim().slice(0, 300),
    textContent: String(input.textContent || '').trim().slice(0, 700),
    bgGradient: String(input.bgGradient || STATUS_BG_GRADIENTS[0].css).slice(0, 120),
    textStyle: input.textStyle || 'classic',
    durationSec,
    audioTrack: persistedUrls.audioTrack,
    ...(sanitizedWhatsappCta ? { whatsappCta: sanitizedWhatsappCta } : {}),
    ...(sanitizedVideoEdits ? { videoEdits: sanitizedVideoEdits } : {}),
    privacyMode: input.privacyMode,
    allowedUids,
    excludedUids,
    viewsCount: 0,
    likesCount: 0,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(expiresAtMs),
  };

  await setDoc(doc(db, 'statuses', statusId), docPayload);

  return {
    id: statusId,
    ...docPayload,
    mediaUrl: sessionMediaUrl,
    thumbnailUrl: sessionThumbnailUrl,
    audioTrack: sessionAudioTrack,
    createdAtMs: nowMs,
    expiresAtMs,
    viewedByMe: true,
    myReaction: null,
  };
}

export function subscribeMyActiveStatuses(
  uid: string,
  onChange: (statuses: StatusRecord[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const safeUid = sanitizeUid(uid);
  if (!safeUid) {
    onChange([]);
    return () => {};
  }

  const q = query(collection(db, 'statuses'), where('authorUid', '==', safeUid));
  return onSnapshot(
    q,
    (snap) => {
      const nowMs = Date.now();
      const items: StatusRecord[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        const expiresAtMs = toMillis(d.expiresAt);
        if (expiresAtMs <= nowMs) return;
        items.push({
          id: docSnap.id,
          authorUid: String(d.authorUid || safeUid),
          authorName: String(d.authorName || 'KING Creator'),
          authorPhoto: String(d.authorPhoto || ''),
          type: d.type === 'video' || d.type === 'text' ? d.type : 'image',
          mediaUrl: String(d.mediaUrl || ''),
          thumbnailUrl: String(d.thumbnailUrl || ''),
          cloudinaryPublicId: String(d.cloudinaryPublicId || ''),
          cloudinaryResourceType: d.cloudinaryResourceType || '',
          cloudinaryDeliveryType: d.cloudinaryDeliveryType || 'none',
          caption: String(d.caption || ''),
          textContent: String(d.textContent || ''),
          bgGradient: String(d.bgGradient || STATUS_BG_GRADIENTS[0].css),
          textStyle: d.textStyle || 'classic',
          durationSec: Number(d.durationSec) || 6,
          audioTrack: d.audioTrack || { mode: 'original', label: 'Original Sound' },
          ...(d.whatsappCta?.enabled && d.whatsappCta?.url
            ? {
                whatsappCta: {
                  enabled: true,
                  url: String(d.whatsappCta.url),
                  label: String(d.whatsappCta.label || 'Chat on WhatsApp'),
                },
              }
            : {}),
          ...(d.videoEdits ? { videoEdits: d.videoEdits as StatusVideoEdits } : {}),
          privacyMode: d.privacyMode || 'friends',
          allowedUids: Array.isArray(d.allowedUids) ? d.allowedUids : [],
          excludedUids: Array.isArray(d.excludedUids) ? d.excludedUids : [],
          viewsCount: Number(d.viewsCount) || 0,
          likesCount: Number(d.likesCount) || 0,
          createdAtMs: toMillis(d.createdAt) || nowMs,
          expiresAtMs,
          viewedByMe: true,
        });
      });
      items.sort((a, b) => a.createdAtMs - b.createdAtMs);
      onChange(items);
    },
    (err) => {
      console.warn('[statusService] subscribeMyActiveStatuses notice:', err);
      onError?.(err);
    }
  );
}

export interface BackendStatusFeedResponse {
  statuses: StatusRecord[];
  backendConfigured: boolean;
  missingSetupMessage?: string;
}

/**
 * Fetches multi-user privacy-filtered Status feed from authenticated backend (/api/status/feed).
 * Never falls back to insecure client-wide listing; surfaces missing Admin backend setup honestly.
 */
export async function fetchAuthorizedStatusFeed(): Promise<BackendStatusFeedResponse> {
  const user = auth.currentUser;
  if (!user) {
    return { statuses: [], backendConfigured: true };
  }

  try {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/status/feed', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    const json = await res.json().catch(() => ({}));

    if (res.status === 503 && json?.code === 'BACKEND_ADMIN_UNCONFIGURED') {
      return {
        statuses: [],
        backendConfigured: false,
        missingSetupMessage:
          json?.message ||
          'Multi-user backend privacy filtering requires FIREBASE_SERVICE_ACCOUNT_KEY on the server.',
      };
    }

    if (!res.ok) {
      return {
        statuses: [],
        backendConfigured: false,
        missingSetupMessage: json?.error || json?.message || `Feed endpoint returned HTTP ${res.status}`,
      };
    }

    const nowMs = Date.now();
    const statuses: StatusRecord[] = Array.isArray(json.statuses)
      ? json.statuses.filter((s: StatusRecord) => s.expiresAtMs > nowMs)
      : [];

    return {
      statuses,
      backendConfigured: true,
    };
  } catch (err: any) {
    return {
      statuses: [],
      backendConfigured: false,
      missingSetupMessage: err?.message || 'Unable to reach /api/status/feed',
    };
  }
}

export function groupStatusesByAuthor(
  statuses: StatusRecord[],
  currentUid?: string | null
): StatusAuthorGroup[] {
  const safeMe = sanitizeUid(currentUid || '');
  const nowMs = Date.now();
  const byAuthor = new Map<string, StatusRecord[]>();

  for (const st of statuses) {
    if (!st.authorUid || st.expiresAtMs <= nowMs) continue;
    const arr = byAuthor.get(st.authorUid) || [];
    arr.push(st);
    byAuthor.set(st.authorUid, arr);
  }

  const groups: StatusAuthorGroup[] = [];
  for (const [authorUid, items] of byAuthor.entries()) {
    items.sort((a, b) => a.createdAtMs - b.createdAtMs);
    const latest = items[items.length - 1];
    const isOwn = Boolean(safeMe && authorUid === safeMe);
    const hasUnseen = isOwn ? false : items.some((s) => !s.viewedByMe);
    groups.push({
      authorUid,
      authorName: latest.authorName || 'KING Creator',
      authorPhoto: latest.authorPhoto || '',
      statuses: items,
      hasUnseen,
      latestCreatedAtMs: latest.createdAtMs,
      isOwn,
    });
  }

  // Sort: Own first, then unseen statuses (newest first), then seen statuses (newest first)
  groups.sort((a, b) => {
    if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
    if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
    return b.latestCreatedAtMs - a.latestCreatedAtMs;
  });

  return groups;
}

/**
 * Records a unique status view atomically via deterministic doc ID (`${statusId}_${viewerUid}`).
 * Strictly skips if viewer is the status owner or has already viewed it.
 */
export async function recordUniqueStatusView(
  status: StatusRecord,
  viewer: { uid: string; displayName?: string | null; photoURL?: string | null }
): Promise<boolean> {
  const viewerUid = sanitizeUid(viewer.uid);
  const statusId = sanitizeUid(status.id);
  const ownerUid = sanitizeUid(status.authorUid);
  if (!viewerUid || !statusId || !ownerUid) return false;

  // Never count owner's own views
  if (viewerUid === ownerUid) return false;

  const viewId = `${statusId}_${viewerUid}`;
  const viewRef = doc(db, 'status_views', viewId);
  const statusRef = doc(db, 'statuses', statusId);

  let recorded = false;
  await runTransaction(db, async (tx) => {
    const [statusSnap, viewSnap] = await Promise.all([tx.get(statusRef), tx.get(viewRef)]);
    if (!statusSnap.exists() || viewSnap.exists()) {
      return;
    }

    const statusData = statusSnap.data();
    const currentViews = typeof statusData.viewsCount === 'number' ? statusData.viewsCount : 0;

    tx.set(viewRef, {
      statusId,
      statusOwnerUid: ownerUid,
      viewerUid,
      viewerName: String(viewer.displayName || 'KING Member').trim().slice(0, 100),
      viewerPhoto: String(viewer.photoURL || '').trim().slice(0, 1000),
      viewedAt: serverTimestamp(),
      expiresAt: statusData.expiresAt || Timestamp.fromMillis(status.expiresAtMs || Date.now() + STATUS_TTL_MS),
    });

    tx.update(statusRef, {
      viewsCount: currentViews + 1,
    });

    recorded = true;
  });

  return recorded;
}

/**
 * Adds or updates a unique reaction (`status_likes/${statusId}_${userUid}`) and notifies status owner.
 */
export async function reactToStatus(
  status: StatusRecord,
  user: { uid: string; displayName?: string | null; photoURL?: string | null },
  emoji: StatusReactionEmoji
): Promise<{ likesCount: number; emoji: StatusReactionEmoji }> {
  const userUid = sanitizeUid(user.uid);
  const statusId = sanitizeUid(status.id);
  const ownerUid = sanitizeUid(status.authorUid);
  if (!userUid || !statusId || !ownerUid) {
    throw new Error('Please sign in to react.');
  }
  if (userUid === ownerUid) {
    throw new Error('You cannot react to your own Status.');
  }

  const likeRef = doc(db, 'status_likes', `${statusId}_${userUid}`);
  const statusRef = doc(db, 'statuses', statusId);
  let nextCount = status.likesCount || 0;
  let expiresAtTs: Timestamp = Timestamp.fromMillis(status.expiresAtMs || Date.now() + STATUS_TTL_MS);

  await runTransaction(db, async (tx) => {
    const [statusSnap, likeSnap] = await Promise.all([tx.get(statusRef), tx.get(likeRef)]);
    if (!statusSnap.exists()) {
      throw new Error('This Status has expired or was deleted.');
    }
    const statusData = statusSnap.data();
    if (statusData.expiresAt) expiresAtTs = statusData.expiresAt;
    const currentLikes = typeof statusData.likesCount === 'number' ? statusData.likesCount : 0;

    if (likeSnap.exists()) {
      tx.update(likeRef, {
        emoji,
        createdAt: serverTimestamp(),
      });
      nextCount = currentLikes;
    } else {
      tx.set(likeRef, {
        statusId,
        statusOwnerUid: ownerUid,
        userUid,
        userName: String(user.displayName || 'KING Member').trim().slice(0, 100),
        userPhoto: String(user.photoURL || '').trim().slice(0, 1000),
        emoji,
        createdAt: serverTimestamp(),
        expiresAt: expiresAtTs,
      });
      nextCount = currentLikes + 1;
      tx.update(statusRef, {
        likesCount: nextCount,
      });
    }
  });

  // Emit deterministic notification so repeated emoji changes don't spam duplicates
  const actorName = String(user.displayName || 'Someone').trim().slice(0, 80);
  try {
    await setDoc(doc(db, 'notifications', `react_${statusId}_${userUid}`), {
      recipientUid: ownerUid,
      actorUid: userUid,
      actorName,
      actorPhoto: String(user.photoURL || '').trim().slice(0, 1000),
      type: 'status_reaction',
      statusId,
      emoji,
      title: `${actorName} reacted ${emoji} to your Status`,
      body: status.caption ? `"${status.caption.slice(0, 120)}"` : 'Reacted to your 24h KING Status.',
      read: false,
      createdAt: serverTimestamp(),
      expiresAt: expiresAtTs,
    });
  } catch (err) {
    console.warn('[statusService] reaction notification notice:', resolveSocialErrorMessage(err));
  }

  return { likesCount: nextCount, emoji };
}

export async function removeStatusReaction(
  statusId: string,
  userUid: string
): Promise<number> {
  const safeStatus = sanitizeUid(statusId);
  const safeUser = sanitizeUid(userUid);
  if (!safeStatus || !safeUser) return 0;

  const likeRef = doc(db, 'status_likes', `${safeStatus}_${safeUser}`);
  const statusRef = doc(db, 'statuses', safeStatus);
  let nextCount = 0;

  await runTransaction(db, async (tx) => {
    const [statusSnap, likeSnap] = await Promise.all([tx.get(statusRef), tx.get(likeRef)]);
    if (!likeSnap.exists()) return;
    tx.delete(likeRef);
    if (statusSnap.exists()) {
      const currentLikes = typeof statusSnap.data().likesCount === 'number' ? statusSnap.data().likesCount : 0;
      nextCount = Math.max(0, currentLikes - 1);
      tx.update(statusRef, { likesCount: nextCount });
    }
  });

  return nextCount;
}

export async function sendPrivateStatusReply(
  status: StatusRecord,
  sender: { uid: string; displayName?: string | null; photoURL?: string | null },
  rawMessage: string
): Promise<void> {
  const senderUid = sanitizeUid(sender.uid);
  const statusId = sanitizeUid(status.id);
  const ownerUid = sanitizeUid(status.authorUid);
  const message = String(rawMessage || '').trim().slice(0, 500);

  if (!senderUid) throw new Error('Please sign in to reply.');
  if (!statusId || !ownerUid || senderUid === ownerUid) {
    throw new Error('Cannot reply to your own Status.');
  }
  if (!message) throw new Error('Please enter a message.');

  const replyId = makeStatusDocId('rep');
  const expiresAtTs = Timestamp.fromMillis(status.expiresAtMs || Date.now() + STATUS_TTL_MS);
  const senderName = String(sender.displayName || 'KING Member').trim().slice(0, 100);
  const senderPhoto = String(sender.photoURL || '').trim().slice(0, 1000);

  await setDoc(doc(db, 'status_replies', replyId), {
    statusId,
    statusOwnerUid: ownerUid,
    senderUid,
    senderName,
    senderPhoto,
    message,
    createdAt: serverTimestamp(),
    expiresAt: expiresAtTs,
  });

  try {
    const notifId = `rep_${replyId}`;
    await setDoc(doc(db, 'notifications', notifId), {
      recipientUid: ownerUid,
      actorUid: senderUid,
      actorName: senderName,
      actorPhoto: senderPhoto,
      type: 'status_reply',
      statusId,
      title: `${senderName} replied to your Status`,
      body: message.slice(0, 280),
      read: false,
      createdAt: serverTimestamp(),
      expiresAt: expiresAtTs,
    });
  } catch (err) {
    console.warn('[statusService] reply notification notice:', resolveSocialErrorMessage(err));
  }
}

export function subscribeStatusViewersOwnerOnly(
  statusId: string,
  ownerUid: string,
  onChange: (viewers: StatusViewRecord[]) => void
): () => void {
  const safeStatus = sanitizeUid(statusId);
  const safeOwner = sanitizeUid(ownerUid);
  if (!safeStatus || !safeOwner) {
    onChange([]);
    return () => {};
  }

  const q = query(
    collection(db, 'status_views'),
    where('statusId', '==', safeStatus),
    where('statusOwnerUid', '==', safeOwner)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: StatusViewRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          statusId: String(data.statusId || safeStatus),
          statusOwnerUid: String(data.statusOwnerUid || safeOwner),
          viewerUid: String(data.viewerUid || ''),
          viewerName: String(data.viewerName || 'KING Member'),
          viewerPhoto: String(data.viewerPhoto || ''),
          viewedAtMs: toMillis(data.viewedAt),
        };
      });
      items.sort((a, b) => b.viewedAtMs - a.viewedAtMs);
      onChange(items);
    },
    (err) => {
      console.warn('[statusService] subscribeStatusViewersOwnerOnly notice:', err);
    }
  );
}

export function subscribeStatusLikesOwnerOnly(
  statusId: string,
  ownerUid: string,
  onChange: (likes: StatusLikeRecord[]) => void
): () => void {
  const safeStatus = sanitizeUid(statusId);
  const safeOwner = sanitizeUid(ownerUid);
  if (!safeStatus || !safeOwner) {
    onChange([]);
    return () => {};
  }

  const q = query(
    collection(db, 'status_likes'),
    where('statusId', '==', safeStatus),
    where('statusOwnerUid', '==', safeOwner)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: StatusLikeRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          statusId: String(data.statusId || safeStatus),
          statusOwnerUid: String(data.statusOwnerUid || safeOwner),
          userUid: String(data.userUid || ''),
          userName: String(data.userName || 'KING Member'),
          userPhoto: String(data.userPhoto || ''),
          emoji: data.emoji || '❤️',
          createdAtMs: toMillis(data.createdAt),
        };
      });
      items.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onChange(items);
    },
    (err) => {
      console.warn('[statusService] subscribeStatusLikesOwnerOnly notice:', err);
    }
  );
}

export function subscribeStatusRepliesOwnerOnly(
  statusId: string,
  ownerUid: string,
  onChange: (replies: StatusReplyRecord[]) => void
): () => void {
  const safeStatus = sanitizeUid(statusId);
  const safeOwner = sanitizeUid(ownerUid);
  if (!safeStatus || !safeOwner) {
    onChange([]);
    return () => {};
  }

  const q = query(
    collection(db, 'status_replies'),
    where('statusId', '==', safeStatus),
    where('statusOwnerUid', '==', safeOwner)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: StatusReplyRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          statusId: String(data.statusId || safeStatus),
          statusOwnerUid: String(data.statusOwnerUid || safeOwner),
          senderUid: String(data.senderUid || ''),
          senderName: String(data.senderName || 'KING Member'),
          senderPhoto: String(data.senderPhoto || ''),
          message: String(data.message || ''),
          createdAtMs: toMillis(data.createdAt),
        };
      });
      items.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onChange(items);
    },
    (err) => {
      console.warn('[statusService] subscribeStatusRepliesOwnerOnly notice:', err);
    }
  );
}

export async function deleteOwnStatus(statusId: string, ownerUid: string): Promise<{
  cloudinaryDeleted: boolean;
}> {
  const safeStatus = sanitizeUid(statusId);
  const safeOwner = sanitizeUid(ownerUid);
  if (!safeStatus || !safeOwner) {
    throw new Error('Invalid status ID');
  }

  // Try full backend cascade deletion first (handles Cloudinary asset destroy when server credentials configured)
  try {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    if (idToken) {
      const resp = await fetch(`/api/status/cleanup?statusId=${encodeURIComponent(safeStatus)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (resp.ok) {
        const json = await resp.json().catch(() => ({}));
        if (json?.deleted) {
          return {
            cloudinaryDeleted: json.cloudinaryResult === 'deleted' && !json.queuedForAssetRetry,
          };
        }
      }
    }
  } catch {
    // Fall back to direct owner-authorized Firestore deletion below when server Admin backend is unavailable
  }

  // Direct Firestore cleanup (owner can delete own views, likes, replies, recipient notifications, and status)
  const [viewsSnap, likesSnap, repliesSnap, notifSnap] = await Promise.all([
    getDocs(query(collection(db, 'status_views'), where('statusId', '==', safeStatus), where('statusOwnerUid', '==', safeOwner))),
    getDocs(query(collection(db, 'status_likes'), where('statusId', '==', safeStatus), where('statusOwnerUid', '==', safeOwner))),
    getDocs(query(collection(db, 'status_replies'), where('statusId', '==', safeStatus), where('statusOwnerUid', '==', safeOwner))),
    getDocs(query(collection(db, 'notifications'), where('statusId', '==', safeStatus), where('recipientUid', '==', safeOwner))),
  ]);

  const batch = writeBatch(db);
  viewsSnap.forEach((d) => batch.delete(d.ref));
  likesSnap.forEach((d) => batch.delete(d.ref));
  repliesSnap.forEach((d) => batch.delete(d.ref));
  notifSnap.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  await deleteDoc(doc(db, 'statuses', safeStatus));
  return { cloudinaryDeleted: false };
}

export function subscribeMyNotifications(
  uid: string,
  onChange: (items: AppNotificationRecord[]) => void
): () => void {
  const safeUid = sanitizeUid(uid);
  if (!safeUid) {
    onChange([]);
    return () => {};
  }

  let active = true;
  let unsub: () => void = () => {};

  const start = (ordered: boolean) => {
    if (!active) return;
    const q = ordered
      ? query(
          collection(db, 'notifications'),
          where('recipientUid', '==', safeUid),
          orderBy('createdAt', 'desc'),
          limit(80)
        )
      : query(collection(db, 'notifications'), where('recipientUid', '==', safeUid), limit(80));

    unsub = onSnapshot(
      q,
      (snap) => {
        const nowMs = Date.now();
        const items: AppNotificationRecord[] = [];
        snap.forEach((d) => {
          const data = d.data();
          const expMs = toMillis(data.expiresAt);
          if (expMs > 0 && expMs <= nowMs) return;
          items.push({
            id: d.id,
            recipientUid: String(data.recipientUid || safeUid),
            actorUid: String(data.actorUid || ''),
            actorName: String(data.actorName || 'KING Member'),
            actorPhoto: String(data.actorPhoto || ''),
            type: data.type || 'status_reaction',
            statusId: data.statusId ? String(data.statusId) : undefined,
            title: String(data.title || 'New Notification'),
            body: String(data.body || ''),
            emoji: data.emoji,
            read: Boolean(data.read),
            createdAtMs: toMillis(data.createdAt),
          });
        });
        items.sort((a, b) => b.createdAtMs - a.createdAtMs);
        onChange(items);
      },
      (err: any) => {
        if (ordered && err?.code === 'failed-precondition') {
          unsub();
          start(false);
          return;
        }
        console.warn('[statusService] subscribeMyNotifications notice:', err);
      }
    );
  };

  start(true);
  return () => {
    active = false;
    unsub();
  };
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const safeId = sanitizeUid(notificationId);
  if (!safeId) return;
  await updateDoc(doc(db, 'notifications', safeId), { read: true });
}

export async function markAllMyNotificationsRead(notifications: AppNotificationRecord[]): Promise<void> {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;
  const batch = writeBatch(db);
  for (const n of unread) {
    batch.update(doc(db, 'notifications', n.id), { read: true });
  }
  await batch.commit();
}
