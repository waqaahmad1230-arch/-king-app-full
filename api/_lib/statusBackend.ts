import { v2 as cloudinary } from 'cloudinary';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type QueryDocumentSnapshot, Timestamp } from 'firebase-admin/firestore';

export const FIREBASE_PROJECT_ID = 'king-5f52e';
export const FIRESTORE_DATABASE_ID = 'ai-studio-king-4e115b8f-6ca5-4501-8ff0-73c2c7c21a47';
export const SUPER_ADMIN_EMAIL = 'waqaahmad1230@gmail.com';
export const CLOUDINARY_CLOUD_NAME = 'xb0o3xwi';
export const STATUS_CLOUDINARY_FOLDER = 'king_status';

export interface VerifiedCaller {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

export function getFirebaseAdminApp(): { app: App; hasExplicitCredentials: boolean } {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (getApps().length > 0) {
    return {
      app: getApps()[0],
      hasExplicitCredentials: Boolean(serviceAccountRaw),
    };
  }
  if (serviceAccountRaw) {
    try {
      const parsed = JSON.parse(serviceAccountRaw);
      const app = initializeApp({
        credential: cert(parsed),
        projectId: FIREBASE_PROJECT_ID,
      });
      return { app, hasExplicitCredentials: true };
    } catch (err) {
      console.warn('[statusBackend] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', err);
    }
  }
  const app = initializeApp({ projectId: FIREBASE_PROJECT_ID });
  return { app, hasExplicitCredentials: false };
}

export async function verifyFirebaseBearerToken(authHeader?: string | string[]): Promise<VerifiedCaller | null> {
  const rawHeader = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!rawHeader || !rawHeader.startsWith('Bearer ')) return null;
  const idToken = rawHeader.slice(7).trim();
  if (!idToken) return null;

  const { app } = getFirebaseAdminApp();
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    if (decoded?.uid) {
      return {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: Boolean(decoded.email_verified),
        name: (decoded as any).name,
      };
    }
  } catch {
    // Fallback to Google OIDC tokeninfo endpoint when Admin ADC certs are unavailable locally
  }

  try {
    const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as any;
    if (
      data.error ||
      data.aud !== FIREBASE_PROJECT_ID ||
      data.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`
    ) {
      return null;
    }
    const exp = Number(data.exp);
    if (!exp || exp < Math.floor(Date.now() / 1000)) return null;
    const uid = data.sub || data.user_id;
    if (!uid || typeof uid !== 'string') return null;
    return {
      uid,
      email: data.email,
      emailVerified: data.email_verified === true || data.email_verified === 'true',
      name: data.name,
    };
  } catch {
    return null;
  }
}

export function getCloudinaryCredentials() {
  let cloudName = (process.env.CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME).trim() || CLOUDINARY_CLOUD_NAME;
  let apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  let apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

  if ((!apiKey || !apiSecret) && process.env.CLOUDINARY_URL) {
    try {
      const parsedUrl = new URL(process.env.CLOUDINARY_URL.trim());
      if (parsedUrl.protocol === 'cloudinary:') {
        if (!apiKey && parsedUrl.username) apiKey = decodeURIComponent(parsedUrl.username);
        if (!apiSecret && parsedUrl.password) apiSecret = decodeURIComponent(parsedUrl.password);
        if (parsedUrl.hostname && !process.env.CLOUDINARY_CLOUD_NAME) {
          cloudName = parsedUrl.hostname;
        }
      }
    } catch {
      // Ignore malformed CLOUDINARY_URL; fall back to explicit missing-env 503
    }
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    configured: Boolean(cloudName && apiKey && apiSecret),
  };
}

export function buildSignedStatusUploadPayload(params: {
  callerUid: string;
  resourceType?: string;
  privacyMode?: string;
}) {
  const { cloudName, apiKey, apiSecret, configured } = getCloudinaryCredentials();
  const resourceType =
    params.resourceType === 'video' || params.resourceType === 'raw' ? params.resourceType : 'image';
  const isPublic = params.privacyMode === 'public';
  const deliveryType = isPublic ? ('upload' as const) : ('authenticated' as const);

  if (!configured) {
    const missingEnv: string[] = [];
    if (!cloudName) missingEnv.push('CLOUDINARY_CLOUD_NAME');
    if (!apiKey) missingEnv.push('CLOUDINARY_API_KEY');
    if (!apiSecret) missingEnv.push('CLOUDINARY_API_SECRET');
    return {
      ok: false as const,
      status: 503 as const,
      signed: false as const,
      code: 'CLOUDINARY_UNCONFIGURED',
      cloudName,
      folder: STATUS_CLOUDINARY_FOLDER,
      resourceType,
      deliveryType,
      missingEnv,
      message:
        'Signed Status upload credentials (CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET) are not configured on the server.',
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const toSign: Record<string, string | number> = {
    folder: STATUS_CLOUDINARY_FOLDER,
    timestamp,
    type: deliveryType,
  };
  const signature = cloudinary.utils.api_sign_request(toSign, apiSecret);

  return {
    ok: true as const,
    status: 200 as const,
    signed: true as const,
    mode: 'signed' as const,
    cloudName,
    apiKey,
    timestamp,
    signature,
    folder: STATUS_CLOUDINARY_FOLDER,
    resourceType,
    deliveryType,
  };
}

export function signAuthenticatedCloudinaryUrl(
  publicId: string,
  resourceType: 'image' | 'video' | 'raw',
  deliveryType: string
): string | null {
  if (!publicId || deliveryType !== 'authenticated') return null;
  const { cloudName, apiKey, apiSecret, configured } = getCloudinaryCredentials();
  if (!configured) return null;

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return cloudinary.url(publicId, {
    resource_type: resourceType,
    type: 'authenticated',
    sign_url: true,
    secure: true,
  });
}

export function signAuthenticatedVideoThumbnailUrl(
  publicId: string,
  startOffsetSec = 0
): string | null {
  if (!publicId) return null;
  const { cloudName, apiKey, apiSecret, configured } = getCloudinaryCredentials();
  if (!configured) return null;

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  const safeOffset = String(Math.max(0, Math.floor(Number(startOffsetSec) || 0)));

  return cloudinary.url(publicId, {
    resource_type: 'video',
    type: 'authenticated',
    format: 'jpg',
    transformation: [{ start_offset: safeOffset, width: 480, height: 800, crop: 'fill' }],
    sign_url: true,
    secure: true,
  });
}

async function destroyCloudinaryAssetWithRetry(
  publicId: string,
  resourceType: 'image' | 'video' | 'raw' | '',
  deliveryType: string,
  maxAttempts = 2
): Promise<{ status: 'deleted' | 'skipped_missing_secret' | 'failed'; error?: string }> {
  if (!publicId) return { status: 'deleted' };
  const { cloudName, apiKey, apiSecret, configured } = getCloudinaryCredentials();
  if (!configured) {
    return {
      status: 'skipped_missing_secret',
      error: 'Missing CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET on server.',
    };
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  const resType = resourceType === 'video' || resourceType === 'raw' ? resourceType : 'image';
  const type = deliveryType === 'authenticated' ? 'authenticated' : 'upload';

  let lastError = 'Unknown Cloudinary error';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp: any = await cloudinary.uploader.destroy(publicId, {
        resource_type: resType,
        type,
        invalidate: true,
      });
      if (resp?.result === 'ok' || resp?.result === 'not found') {
        return { status: 'deleted' };
      }
      lastError = `Unexpected Cloudinary destroy result: ${String(resp?.result || 'empty')}`;
    } catch (err: any) {
      lastError = err?.message || String(err);
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }

  console.error('[statusBackend] Cloudinary asset deletion failed:', {
    publicId,
    resourceType: resType,
    deliveryType: type,
    attempts: maxAttempts,
    error: lastError,
  });
  return { status: 'failed', error: lastError };
}

export function isAdminCredentialError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  return (
    msg.includes('Could not load the default credentials') ||
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('Unable to detect a Project Id') ||
    msg.includes('metadata server')
  );
}

export interface RawStatusDoc {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto: string;
  type: 'image' | 'video' | 'text';
  mediaUrl: string;
  thumbnailUrl: string;
  cloudinaryPublicId: string;
  cloudinaryResourceType: 'image' | 'video' | 'raw' | '';
  cloudinaryDeliveryType: 'upload' | 'authenticated' | 'none';
  caption: string;
  textContent: string;
  bgGradient: string;
  textStyle: 'classic' | 'bold' | 'editorial' | 'mono';
  durationSec: number;
  audioTrack: {
    mode: 'original' | 'royalty_free' | 'custom_audio';
    label: string;
    presetId?: string;
    audioUrl?: string;
    cloudinaryPublicId?: string;
  };
  whatsappCta?: {
    enabled: boolean;
    url: string;
    label: string;
  };
  videoEdits?: {
    trimStartSec: number;
    trimEndSec: number;
    muted: boolean;
    overlays: Array<{
      id: string;
      kind: 'text' | 'sticker';
      content: string;
      x: number;
      y: number;
      scale: number;
      font?: string;
      color?: string;
      align?: 'left' | 'center' | 'right';
      bgMode?: 'none' | 'dark' | 'accent';
    }>;
  };
  privacyMode: 'public' | 'friends' | 'followers' | 'selected' | 'except' | 'only_me';
  allowedUids?: string[];
  excludedUids?: string[];
  viewsCount: number;
  likesCount: number;
  createdAtMs: number;
  expiresAtMs: number;
}

export function evaluateStatusVisibilityForViewer(
  status: RawStatusDoc,
  viewerUid: string,
  relations: {
    friendUids: Set<string>;
    followingUids: Set<string>;
    blockedByMe: Set<string>;
    blockedMe: Set<string>;
  },
  nowMs = Date.now()
): boolean {
  if (!status || !viewerUid) return false;
  if (status.authorUid === viewerUid) return true;
  if (!status.expiresAtMs || status.expiresAtMs <= nowMs) return false;
  if (relations.blockedByMe.has(status.authorUid) || relations.blockedMe.has(status.authorUid)) {
    return false;
  }

  switch (status.privacyMode) {
    case 'only_me':
      return false;
    case 'public':
      return true;
    case 'friends':
      return relations.friendUids.has(status.authorUid);
    case 'followers':
      return relations.followingUids.has(status.authorUid);
    case 'selected':
      return Array.isArray(status.allowedUids) && status.allowedUids.includes(viewerUid);
    case 'except': {
      const inAudience =
        relations.friendUids.has(status.authorUid) ||
        relations.followingUids.has(status.authorUid);
      return (
        inAudience &&
        (!Array.isArray(status.excludedUids) || !status.excludedUids.includes(viewerUid))
      );
    }
    default:
      return false;
  }
}

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

export async function handleFetchAuthorizedStatusFeed(callerUid: string) {
  const { app } = getFirebaseAdminApp();
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);

  try {
    const now = Timestamp.now();
    const nowMs = now.toMillis();

    const [statusSnap, friendSnap, followSnap, blockedByMeSnap, blockedMeSnap] = await Promise.all([
      db.collection('statuses').where('expiresAt', '>', now).limit(200).get(),
      db.collection('friendships').where('users', 'array-contains', callerUid).get(),
      db.collection('follows').where('followerUid', '==', callerUid).get(),
      db.collection('blocks').where('blockerUid', '==', callerUid).get(),
      db.collection('blocks').where('blockedUid', '==', callerUid).get(),
    ]);

    const friendUids = new Set<string>();
    friendSnap.forEach((d) => {
      const data = d.data();
      if (data.status === 'accepted' && Array.isArray(data.users)) {
        for (const u of data.users) {
          if (typeof u === 'string' && u !== callerUid) friendUids.add(u);
        }
      }
    });

    const followingUids = new Set<string>();
    followSnap.forEach((d) => {
      const t = d.data()?.targetUid;
      if (typeof t === 'string') followingUids.add(t);
    });

    const blockedByMe = new Set<string>();
    blockedByMeSnap.forEach((d) => {
      const b = d.data()?.blockedUid;
      if (typeof b === 'string') blockedByMe.add(b);
    });

    const blockedMe = new Set<string>();
    blockedMeSnap.forEach((d) => {
      const b = d.data()?.blockerUid;
      if (typeof b === 'string') blockedMe.add(b);
    });

    const visibleDocs: RawStatusDoc[] = [];
    statusSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const normalized: RawStatusDoc = {
        id: docSnap.id,
        authorUid: String(data.authorUid || ''),
        authorName: String(data.authorName || 'KING Creator'),
        authorPhoto: String(data.authorPhoto || ''),
        type: data.type === 'video' || data.type === 'text' ? data.type : 'image',
        mediaUrl: String(data.mediaUrl || ''),
        thumbnailUrl: String(data.thumbnailUrl || ''),
        cloudinaryPublicId: String(data.cloudinaryPublicId || ''),
        cloudinaryResourceType: data.cloudinaryResourceType || '',
        cloudinaryDeliveryType: data.cloudinaryDeliveryType || 'none',
        caption: String(data.caption || ''),
        textContent: String(data.textContent || ''),
        bgGradient: String(data.bgGradient || ''),
        textStyle: data.textStyle || 'classic',
        durationSec: Number(data.durationSec) || 0,
        audioTrack: data.audioTrack || { mode: 'original', label: 'Original Sound' },
        ...(data.whatsappCta?.enabled && data.whatsappCta?.url
          ? {
              whatsappCta: {
                enabled: true,
                url: String(data.whatsappCta.url).slice(0, 300),
                label: String(data.whatsappCta.label || 'Chat on WhatsApp').slice(0, 40),
              },
            }
          : {}),
        ...(data.videoEdits ? { videoEdits: data.videoEdits } : {}),
        privacyMode: data.privacyMode || 'friends',
        allowedUids: Array.isArray(data.allowedUids) ? data.allowedUids : [],
        excludedUids: Array.isArray(data.excludedUids) ? data.excludedUids : [],
        viewsCount: Number(data.viewsCount) || 0,
        likesCount: Number(data.likesCount) || 0,
        createdAtMs: toMillis(data.createdAt),
        expiresAtMs: toMillis(data.expiresAt),
      };

      if (
        evaluateStatusVisibilityForViewer(
          normalized,
          callerUid,
          { friendUids, followingUids, blockedByMe, blockedMe },
          nowMs
        )
      ) {
        // Re-sign authenticated Cloudinary media, thumbnail, and custom audio URLs strictly for authorized viewers
        if (normalized.cloudinaryDeliveryType === 'authenticated') {
          if (normalized.cloudinaryPublicId) {
            const resType: 'image' | 'video' | 'raw' =
              normalized.cloudinaryResourceType === 'video' || normalized.cloudinaryResourceType === 'raw'
                ? normalized.cloudinaryResourceType
                : 'image';
            const signedMedia = signAuthenticatedCloudinaryUrl(
              normalized.cloudinaryPublicId,
              resType,
              'authenticated'
            );
            if (signedMedia) normalized.mediaUrl = signedMedia;

            if (resType === 'image' && signedMedia) {
              normalized.thumbnailUrl = signedMedia;
            } else if (resType === 'video') {
              const signedThumb = signAuthenticatedVideoThumbnailUrl(
                normalized.cloudinaryPublicId,
                normalized.videoEdits?.trimStartSec || 0
              );
              if (signedThumb) normalized.thumbnailUrl = signedThumb;
            }
          }

          if (normalized.audioTrack?.cloudinaryPublicId) {
            const signedAudio = signAuthenticatedCloudinaryUrl(
              normalized.audioTrack.cloudinaryPublicId,
              'video',
              'authenticated'
            );
            if (signedAudio) {
              normalized.audioTrack = {
                ...normalized.audioTrack,
                audioUrl: signedAudio,
              };
            }
          }
        }
        visibleDocs.push(normalized);
      }
    });

    // Batch lookup viewer's own view & reaction status
    const viewRefs = visibleDocs.map((s) => db.collection('status_views').doc(`${s.id}_${callerUid}`));
    const likeRefs = visibleDocs.map((s) => db.collection('status_likes').doc(`${s.id}_${callerUid}`));
    const [viewSnaps, likeSnaps] = visibleDocs.length
      ? await Promise.all([db.getAll(...viewRefs), db.getAll(...likeRefs)])
      : [[], []];

    const sanitizedItems = visibleDocs.map((s, idx) => {
      const isOwner = s.authorUid === callerUid;
      const likeSnap = likeSnaps[idx];
      const viewSnap = viewSnaps[idx];
      return {
        ...s,
        // Never leak private selected/except recipient lists to other viewers
        allowedUids: isOwner ? s.allowedUids : undefined,
        excludedUids: isOwner ? s.excludedUids : undefined,
        viewedByMe: isOwner ? true : Boolean(viewSnap?.exists),
        myReaction: likeSnap?.exists ? likeSnap.data()?.emoji || null : null,
      };
    });

    sanitizedItems.sort((a, b) => a.createdAtMs - b.createdAtMs);

    return {
      ok: true as const,
      status: 200,
      statuses: sanitizedItems,
      cloudinarySignedDelivery: getCloudinaryCredentials().configured,
    };
  } catch (err: any) {
    if (isAdminCredentialError(err)) {
      return {
        ok: false as const,
        status: 503,
        code: 'BACKEND_ADMIN_UNCONFIGURED',
        missingEnv: ['FIREBASE_SERVICE_ACCOUNT_KEY'],
        message:
          'Server-side Firebase Admin credentials (FIREBASE_SERVICE_ACCOUNT_KEY) are not configured. Multi-user backend privacy filtering requires Admin SDK access.',
      };
    }
    throw err;
  }
}

async function deleteCollectionDocsByStatusId(
  db: FirebaseFirestore.Firestore,
  collectionName: string,
  statusId: string
): Promise<number> {
  let totalDeleted = 0;
  while (true) {
    const snap = await db.collection(collectionName).where('statusId', '==', statusId).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    totalDeleted += snap.size;
    if (snap.size < 400) break;
  }
  return totalDeleted;
}

export async function handleDeleteSingleStatusServer(statusId: string, caller: VerifiedCaller) {
  const { app } = getFirebaseAdminApp();
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);

  try {
    const statusRef = db.collection('statuses').doc(statusId);
    const snap = await statusRef.get();
    if (!snap.exists) {
      return { ok: true as const, status: 200, deleted: false, cloudinaryResult: 'deleted' as const };
    }

    const data = snap.data() || {};
    const isSuperAdmin = caller.email === SUPER_ADMIN_EMAIL;
    if (data.authorUid !== caller.uid && !isSuperAdmin) {
      return { ok: false as const, status: 403, code: 'FORBIDDEN', message: 'Not status owner.' };
    }

    const mediaDestroy = await destroyCloudinaryAssetWithRetry(
      String(data.cloudinaryPublicId || ''),
      data.cloudinaryResourceType || '',
      String(data.cloudinaryDeliveryType || 'upload')
    );

    const audioDestroy = data.audioTrack?.cloudinaryPublicId
      ? await destroyCloudinaryAssetWithRetry(
          String(data.audioTrack.cloudinaryPublicId),
          'video',
          String(data.cloudinaryDeliveryType || 'upload')
        )
      : { status: 'deleted' as const };

    const [deletedViews, deletedLikes, deletedReplies, deletedNotifications] = await Promise.all([
      deleteCollectionDocsByStatusId(db, 'status_views', statusId),
      deleteCollectionDocsByStatusId(db, 'status_likes', statusId),
      deleteCollectionDocsByStatusId(db, 'status_replies', statusId),
      deleteCollectionDocsByStatusId(db, 'notifications', statusId),
    ]);

    const cloudinaryFailed =
      mediaDestroy.status !== 'deleted' || audioDestroy.status !== 'deleted';

    if (cloudinaryFailed) {
      // Expire immediately so it disappears everywhere while preserving Cloudinary publicIds for scheduled retry
      const errDetail = mediaDestroy.error || audioDestroy.error || 'Cloudinary delete pending retry';
      await statusRef.update({
        expiresAt: Timestamp.fromMillis(Date.now() - 1000),
        cleanupPending: true,
        cleanupAttempts: FieldValue.increment(1),
        lastCleanupError: errDetail.slice(0, 300),
        lastCleanupAttemptAt: FieldValue.serverTimestamp(),
      });
      return {
        ok: true as const,
        status: 200,
        deleted: true,
        queuedForAssetRetry: true,
        cloudinaryResult: mediaDestroy.status,
        deletedViews,
        deletedLikes,
        deletedReplies,
        deletedNotifications,
      };
    }

    await statusRef.delete();

    return {
      ok: true as const,
      status: 200,
      deleted: true,
      queuedForAssetRetry: false,
      cloudinaryResult: mediaDestroy.status,
      deletedViews,
      deletedLikes,
      deletedReplies,
      deletedNotifications,
    };
  } catch (err) {
    if (isAdminCredentialError(err)) {
      return {
        ok: false as const,
        status: 503,
        code: 'BACKEND_ADMIN_UNCONFIGURED',
        missingEnv: ['FIREBASE_SERVICE_ACCOUNT_KEY'],
        message: 'Server-side Admin credentials are required for server cascade & Cloudinary deletion.',
      };
    }
    throw err;
  }
}

export async function handleRunExpiredStatusCleanup(options: {
  authHeader?: string | string[];
  caller?: VerifiedCaller | null;
}) {
  const rawAuth = Array.isArray(options.authHeader) ? options.authHeader[0] : options.authHeader || '';
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const hasCronAuth = Boolean(cronSecret && rawAuth === `Bearer ${cronSecret}`);
  const isSuperAdmin = options.caller?.email === SUPER_ADMIN_EMAIL;

  if (!hasCronAuth && !isSuperAdmin) {
    return {
      ok: false as const,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Cleanup requires CRON_SECRET Bearer auth or Super Admin credentials.',
    };
  }

  const { app } = getFirebaseAdminApp();
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);

  try {
    const now = Timestamp.now();
    const BATCH_SIZE = 50;
    const MAX_BATCHES = 10; // Processes up to 500 expired statuses per invocation

    let deletedStatuses = 0;
    let deletedViews = 0;
    let deletedLikes = 0;
    let deletedReplies = 0;
    let deletedNotifications = 0;
    let deletedCloudinaryAssets = 0;
    let failedCloudinaryAssets = 0;
    let failedStatuses = 0;
    let hasMore = false;
    let lastDoc: QueryDocumentSnapshot | null = null;

    for (let batchNum = 0; batchNum < MAX_BATCHES; batchNum++) {
      let q = db
        .collection('statuses')
        .where('expiresAt', '<=', now)
        .orderBy('expiresAt', 'asc')
        .limit(BATCH_SIZE);

      if (lastDoc) {
        q = q.startAfter(lastDoc);
      }

      const expiredSnap = await q.get();
      if (expiredSnap.empty) {
        hasMore = false;
        break;
      }

      lastDoc = expiredSnap.docs[expiredSnap.docs.length - 1];

      for (const statusDoc of expiredSnap.docs) {
        const data = statusDoc.data();
        const statusId = statusDoc.id;

        const mediaRes = data.cloudinaryPublicId
          ? await destroyCloudinaryAssetWithRetry(
              String(data.cloudinaryPublicId),
              data.cloudinaryResourceType || '',
              String(data.cloudinaryDeliveryType || 'upload')
            )
          : { status: 'deleted' as const };

        if (data.cloudinaryPublicId) {
          if (mediaRes.status === 'deleted') deletedCloudinaryAssets++;
          else failedCloudinaryAssets++;
        }

        const audioRes = data.audioTrack?.cloudinaryPublicId
          ? await destroyCloudinaryAssetWithRetry(
              String(data.audioTrack.cloudinaryPublicId),
              'video',
              String(data.cloudinaryDeliveryType || 'upload')
            )
          : { status: 'deleted' as const };

        if (data.audioTrack?.cloudinaryPublicId) {
          if (audioRes.status === 'deleted') deletedCloudinaryAssets++;
          else failedCloudinaryAssets++;
        }

        const [v, l, r, n] = await Promise.all([
          deleteCollectionDocsByStatusId(db, 'status_views', statusId),
          deleteCollectionDocsByStatusId(db, 'status_likes', statusId),
          deleteCollectionDocsByStatusId(db, 'status_replies', statusId),
          deleteCollectionDocsByStatusId(db, 'notifications', statusId),
        ]);

        deletedViews += v;
        deletedLikes += l;
        deletedReplies += r;
        deletedNotifications += n;

        // Retain failed/unconfigured Cloudinary publicIds on expired doc for safe retry
        if (mediaRes.status !== 'deleted' || audioRes.status !== 'deleted') {
          failedStatuses++;
          const errDetail = mediaRes.error || audioRes.error || 'Cloudinary deletion incomplete';
          await statusDoc.ref.update({
            cleanupPending: true,
            cleanupAttempts: FieldValue.increment(1),
            lastCleanupError: errDetail.slice(0, 300),
            lastCleanupAttemptAt: FieldValue.serverTimestamp(),
          });
          continue;
        }

        await statusDoc.ref.delete();
        deletedStatuses++;
      }

      if (expiredSnap.size < BATCH_SIZE) {
        hasMore = false;
        break;
      }
      if (batchNum === MAX_BATCHES - 1) {
        hasMore = true;
      }
    }

    return {
      ok: true as const,
      status: 200,
      deletedStatuses,
      deletedViews,
      deletedLikes,
      deletedReplies,
      deletedNotifications,
      deletedCloudinaryAssets,
      failedCloudinaryAssets,
      failedStatuses,
      hasMore,
      cloudinaryConfigured: getCloudinaryCredentials().configured,
    };
  } catch (err) {
    if (isAdminCredentialError(err)) {
      return {
        ok: false as const,
        status: 503,
        code: 'BACKEND_ADMIN_UNCONFIGURED',
        missingEnv: ['FIREBASE_SERVICE_ACCOUNT_KEY'],
        message: 'Server-side FIREBASE_SERVICE_ACCOUNT_KEY is required to run scheduled 24h expiry cleanup.',
      };
    }
    throw err;
  }
}
