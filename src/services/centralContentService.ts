import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from './firestoreErrorHandler';
import { uploadFileToCloudinary, validateProductFile } from '../utils/cloudinaryUpload';
import { DailyGame } from './dailyGameSync';
import { CatalogProduct } from '../types/catalog';
import {
  CentralFeedItem,
  ContentComment,
  FeedContentType,
  PublicationStatus,
  UnifiedLatestItem,
  UserPost,
} from '../types/content';
import { parseNumericCount, toggleVideoLike } from './videoSocialService';

export const AUTHORIZED_ADMIN_EMAIL = 'waqaahmad1230@gmail.com';
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Resolve any Firestore Timestamp, ISO string, or epoch number into milliseconds.
 */
export function resolveTimestampMs(ts: any): number {
  if (!ts) return 0;
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return isNaN(ts) ? 0 : ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'heic',
  'heif',
  'avif',
]);

const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'm4v',
  'webm',
  '3gp',
  '3gpp',
  'mkv',
  'avi',
  'mpeg',
  'mpg',
]);

function inferMediaTypeAndMime(
  file: File,
  fallbackHint?: FeedContentType
): { mediaType?: FeedContentType; mime: string } {
  const rawMime = (file.type || '').toLowerCase().trim();
  if (rawMime.startsWith('image/')) {
    return { mediaType: 'photo', mime: rawMime };
  }
  if (rawMime.startsWith('video/')) {
    return { mediaType: 'video', mime: rawMime };
  }

  const ext = (file.name || '').split('.').pop()?.toLowerCase().trim() || '';
  if (IMAGE_EXTENSIONS.has(ext)) {
    const mapped =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
        ? 'image/webp'
        : ext === 'gif'
        ? 'image/gif'
        : ext === 'avif'
        ? 'image/avif'
        : ext === 'bmp'
        ? 'image/bmp'
        : 'image/jpeg';
    return { mediaType: 'photo', mime: mapped };
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    const mapped =
      ext === 'webm'
        ? 'video/webm'
        : ext === 'mov'
        ? 'video/quicktime'
        : ext === '3gp' || ext === '3gpp'
        ? 'video/3gpp'
        : 'video/mp4';
    return { mediaType: 'video', mime: mapped };
  }

  if ((!rawMime || rawMime === 'application/octet-stream') && fallbackHint) {
    return {
      mediaType: fallbackHint,
      mime: fallbackHint === 'video' ? 'video/mp4' : 'image/jpeg',
    };
  }

  return { mediaType: undefined, mime: rawMime };
}

/**
 * Normalize an Android/desktop selected File so files with blank MIME types retain a valid image/* or video/* MIME type.
 */
export function normalizeSelectedMediaFile(
  file: File,
  fallbackHint?: FeedContentType
): { valid: boolean; file?: File; mediaType?: FeedContentType; error?: string } {
  if (!file) {
    return { valid: false, error: 'Please choose a photo or video from your gallery.' };
  }

  const inferred = inferMediaTypeAndMime(file, fallbackHint);
  if (!inferred.mediaType) {
    return {
      valid: false,
      error: `Unsupported file type "${file.type || file.name}". Only photos and videos are allowed.`,
    };
  }

  const maxBytes = inferred.mediaType === 'photo' ? MAX_IMAGE_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error:
        inferred.mediaType === 'photo'
          ? `Image "${file.name}" exceeds maximum allowed size of 10MB.`
          : `Video "${file.name}" exceeds maximum allowed size of 50MB.`,
    };
  }

  const rawMime = (file.type || '').toLowerCase().trim();
  const normalizedFile =
    rawMime.startsWith('image/') || rawMime.startsWith('video/')
      ? file
      : new File(
          [file],
          file.name || (inferred.mediaType === 'video' ? 'king_video.mp4' : 'king_photo.jpg'),
          { type: inferred.mime, lastModified: file.lastModified || Date.now() }
        );

  return {
    valid: true,
    file: normalizedFile,
    mediaType: inferred.mediaType,
  };
}

/**
 * Validate a gallery photo or video file prior to Cloudinary upload.
 */
export function validateGalleryMediaFile(
  file: File,
  fallbackHint?: FeedContentType
): { valid: boolean; mediaType?: FeedContentType; error?: string } {
  const result = normalizeSelectedMediaFile(file, fallbackHint);
  return {
    valid: result.valid,
    mediaType: result.mediaType,
    error: result.error,
  };
}

/**
 * Determine if a king_games record is approved and published (hides pending, rejected, unpublished).
 */
export function isGameApprovedAndPublished(data: any): boolean {
  if (!data || typeof data !== 'object') return false;

  const status = typeof data.status === 'string' ? data.status.toLowerCase().trim() : '';
  const pubStatus = typeof data.publicationStatus === 'string' ? data.publicationStatus.toLowerCase().trim() : '';

  if (
    status === 'pending' ||
    status === 'rejected' ||
    status === 'unpublished' ||
    pubStatus === 'pending' ||
    pubStatus === 'rejected' ||
    pubStatus === 'unpublished'
  ) {
    return false;
  }

  if (data.approved === false || data.isApproved === false || data.published === false) {
    return false;
  }

  return (
    status === 'approved' ||
    status === 'published' ||
    status === 'active' ||
    pubStatus === 'published' ||
    pubStatus === 'approved' ||
    data.approved === true ||
    data.isApproved === true
  );
}

/**
 * Determine if a video record in `videos` is published publicly.
 */
export function isVideoPublished(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  const status = typeof data.status === 'string' ? data.status.toLowerCase().trim() : '';
  const pubStatus = typeof data.publicationStatus === 'string' ? data.publicationStatus.toLowerCase().trim() : '';
  if (
    status === 'unpublished' ||
    status === 'rejected' ||
    status === 'pending' ||
    pubStatus === 'unpublished' ||
    pubStatus === 'rejected' ||
    pubStatus === 'pending' ||
    data.isPublished === false
  ) {
    return false;
  }
  const url = (data.videoUrl || data.url || '').trim();
  return Boolean(url);
}

/**
 * Generic deterministic deduplication helper preserving order of first occurrence.
 */
export function deduplicateByKeys<T>(items: T[], getKeys: (item: T) => string[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const keys = getKeys(item)
      .map((k) => (k || '').trim().toLowerCase())
      .filter(Boolean);
    if (keys.some((k) => seen.has(k))) {
      continue;
    }
    keys.forEach((k) => seen.add(k));
    result.push(item);
  }
  return result;
}

/**
 * Map a Cloudinary video URL to an instant JPG thumbnail URL if no explicit thumbnail exists.
 */
export function deriveVideoThumbnail(videoUrl: string, explicitThumb?: string): string {
  if (explicitThumb && explicitThumb.trim()) return explicitThumb.trim();
  if (videoUrl && videoUrl.includes('cloudinary.com')) {
    return videoUrl.replace(/\.[^/.]+$/, '.jpg');
  }
  return '';
}

/**
 * Merge photo posts (`user_posts`) and published videos (`videos`) into a single deduplicated Home Social Feed.
 * Photos NEVER enter `videos`; Videos automatically appear in both Home Social Feed and Videos Section.
 */
export function mergeHomeSocialFeed(posts: UserPost[], videos: any[]): CentralFeedItem[] {
  const normalizedPosts: CentralFeedItem[] = posts
    .filter((p) => p.publicationStatus === 'published' && (p.mediaUrl || (Array.isArray(p.imageUrls) && p.imageUrls.length > 0)))
    .map((p) => {
      const primaryUrl = p.mediaUrl || (Array.isArray(p.imageUrls) ? p.imageUrls[0] : '') || '';
      return {
        id: p.id,
        sourceCollection: 'user_posts',
        contentType: p.contentType || 'photo',
        publicationStatus: p.publicationStatus,
        authorUid: p.authorUid,
        authorName: p.authorName || 'KING User',
        authorPhoto: p.authorPhoto || '',
        title: p.caption || (p.contentType === 'video' ? 'KING Video' : 'KING Photo'),
        caption: p.caption || '',
        mediaUrl: primaryUrl,
        thumbnailUrl: p.thumbnailUrl || primaryUrl,
        imageUrls: Array.isArray(p.imageUrls) && p.imageUrls.length > 0 ? p.imageUrls : [primaryUrl].filter(Boolean),
        location: p.location || '',
        privacy: p.privacy || 'public',
        likesCount: parseNumericCount(p.likesCount),
        viewsCount: 0,
        commentsCount: parseNumericCount(p.commentsCount),
        createdAt: p.createdAt,
        createdAtMs: resolveTimestampMs(p.createdAt),
      };
    });

  const normalizedVideos: CentralFeedItem[] = videos
    .filter(isVideoPublished)
    .map((v) => {
      const videoUrl = (v.videoUrl || v.url || '').trim();
      const thumb = deriveVideoThumbnail(videoUrl, v.thumbnailUrl || v.thumbnail || v.img);
      return {
        id: v.id,
        sourceCollection: 'videos',
        contentType: 'video' as const,
        publicationStatus: (v.publicationStatus || v.status || 'published') as PublicationStatus,
        authorUid: v.userId || v.uid || '',
        authorName: v.uploaderName || v.channelName || v.channel || 'KING Creator',
        authorPhoto: v.uploaderPhoto || v.channelAvatar || '',
        title: v.title || 'KING Video',
        caption: v.caption || v.title || '',
        mediaUrl: videoUrl,
        thumbnailUrl: thumb,
        likesCount: parseNumericCount(v.likes),
        viewsCount: parseNumericCount(v.views),
        commentsCount: parseNumericCount(v.commentsCount),
        duration: v.duration || 'HD',
        createdAt: v.createdAt,
        createdAtMs: resolveTimestampMs(v.createdAt),
      };
    });

  const merged = [...normalizedPosts, ...normalizedVideos];
  const deduped = deduplicateByKeys(merged, (item) => [
    `${item.sourceCollection}:${item.id}`,
    item.mediaUrl ? `media:${item.mediaUrl}` : '',
  ]);

  deduped.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return deduped;
}

/**
 * Merge all 4 live published sources into the unified "Latest on KING" newest-first feed:
 * - User-uploaded photos (`user_posts`, published only)
 * - User-uploaded videos (`videos`, published only)
 * - Admin-published KING SHOP products (`catalog_products`, active & real Firestore docs only)
 * - Admin-approved & published games (`king_games`, approved & published only)
 */
export function mergeUnifiedLatestFeed(params: {
  posts: UserPost[];
  videos: any[];
  products: CatalogProduct[];
  games: DailyGame[];
}): UnifiedLatestItem[] {
  const socialFeed = mergeHomeSocialFeed(params.posts || [], params.videos || []);

  const postAndVideoEntries: UnifiedLatestItem[] = socialFeed.map((item) => ({
    id: item.id,
    uniqueKey: `${item.contentType}:${item.id}`,
    kind: item.contentType === 'video' ? 'video' : 'photo',
    title: item.caption || item.title || (item.contentType === 'video' ? 'KING Video' : 'KING Photo'),
    subtitle: item.authorName || 'KING Creator',
    thumbnailUrl: item.contentType === 'video' ? item.thumbnailUrl : item.mediaUrl,
    authorUid: item.authorUid,
    authorName: item.authorName || 'KING Creator',
    authorPhoto: item.authorPhoto || '',
    createdAt: item.createdAt,
    createdAtMs: item.createdAtMs,
    postItem: item,
  }));

  const productEntries: UnifiedLatestItem[] = (params.products || [])
    .filter((p) => Boolean(p?.id) && p.isActive !== false)
    .map((p) => {
      const tsSource = p.createdAt || p.updatedAt;
      return {
        id: p.id,
        uniqueKey: `product:${p.id}`,
        kind: 'product' as const,
        title: (p.name || 'KING Product').trim(),
        subtitle: p.category || 'KING SHOP',
        thumbnailUrl: Array.isArray(p.imageUrls) && p.imageUrls[0] ? p.imageUrls[0] : '',
        createdAt: tsSource,
        createdAtMs: resolveTimestampMs(tsSource),
        productItem: p,
      };
    });

  const gameEntries: UnifiedLatestItem[] = (params.games || [])
    .filter((g) => {
      if (!g?.id || !isGameApprovedAndPublished(g)) return false;
      const playUrl = (g.url || g.link || (g as any).apkUrl || (g as any).downloadUrl || '').trim();
      return Boolean(playUrl && (playUrl.startsWith('http://') || playUrl.startsWith('https://') || playUrl.startsWith('/')));
    })
    .map((g) => {
      const gAny = g as any;
      const rawTs = gAny.approvedAt || gAny.reviewedAt || gAny.publishedAt || gAny.createdAt || g.addedAt;
      const resolvedMs =
        resolveTimestampMs(rawTs) ||
        (typeof g.addedAt === 'number' && g.addedAt > 0 ? g.addedAt : 0);
      return {
        id: g.id,
        uniqueKey: `game:${g.id}`,
        kind: 'game' as const,
        title: (g.title || g.name || 'KING Game').trim(),
        subtitle: g.category || g.source || 'KING Games',
        thumbnailUrl: g.thumbnail || g.image || '',
        createdAt: rawTs || resolvedMs,
        createdAtMs: resolvedMs,
        gameItem: g,
      };
    });

  const combined = [...postAndVideoEntries, ...productEntries, ...gameEntries];
  const deduped = deduplicateByKeys(combined, (entry) => {
    if (entry.kind === 'photo' || entry.kind === 'video') {
      return [
        entry.uniqueKey,
        entry.postItem?.mediaUrl ? `${entry.kind}-media:${entry.postItem.mediaUrl}` : '',
      ];
    }
    if (entry.kind === 'game') {
      const url = (entry.gameItem?.url || entry.gameItem?.link || '').replace(/\/$/, '');
      return [entry.uniqueKey, url ? `game-url:${url}` : ''];
    }
    return [entry.uniqueKey];
  });

  deduped.sort((a, b) => {
    if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs;
    return a.uniqueKey.localeCompare(b.uniqueKey);
  });

  return deduped;
}

export interface PublishMediaOptions {
  trimStartSec?: number;
  trimEndSec?: number;
  rawDurationSec?: number;
  muted?: boolean;
  durationLabel?: string;
  location?: string;
  privacy?: string;
  thumbnailUrl?: string;
  isStory?: boolean;
}

/**
 * Publish photo(s) (to `user_posts`) or video (to `videos`) directly from gallery/editor selection.
 * Requires authenticated Firebase user.
 */
export async function publishGalleryMediaPost(
  fileOrFiles: File | File[],
  caption: string,
  user: { uid: string; displayName?: string | null; photoURL?: string | null; email?: string | null },
  onProgress?: (percent: number, statusText: string) => void,
  options?: PublishMediaOptions
): Promise<{ id: string; contentType: FeedContentType; collectionName: 'user_posts' | 'videos'; mediaUrl: string }> {
  if (!user || !user.uid) {
    throw new Error('Authentication required. Please sign in before uploading.');
  }

  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  if (files.length === 0) {
    throw new Error('Please choose a photo or video from your gallery.');
  }

  const rawCaption = (caption || '').trim();
  const location = (options?.location || '').trim().slice(0, 100);
  const combinedCaption =
    location && !rawCaption.toLowerCase().includes(location.toLowerCase())
      ? [rawCaption, `📍 ${location}`].filter(Boolean).join(' • ')
      : rawCaption;
  const cleanCaption = combinedCaption.slice(0, 500);
  const authorName =
    (user.displayName || user.email?.split('@')[0] || 'KING Creator').trim().slice(0, 100) ||
    'KING Creator';
  const authorPhoto = (user.photoURL || '').trim().slice(0, 1000);

  if (files.length > 1 || files[0].type.startsWith('image/') || files[0].name.match(/\.(jpg|jpeg|png|webp|gif|avif)$/i)) {
    const imageUrls: string[] = [];
    const total = files.length;
    for (let i = 0; i < total; i++) {
      const f = files[i];
      const val = validateGalleryMediaFile(f, 'photo');
      if (!val.valid) throw new Error(val.error || `Invalid photo at index ${i}`);
      const pctBase = Math.round((i / total) * 75);
      if (onProgress) onProgress(pctBase + 5, `Uploading photo ${i + 1} of ${total}...`);
      const url = await uploadFileToCloudinary(f, 'image', (p) => {
        if (onProgress) onProgress(pctBase + Math.round((p / 100) * (75 / total)), `Uploading photo ${i + 1}...`);
      });
      imageUrls.push(url);
    }

    if (onProgress) onProgress(90, 'Publishing photo post to KING feed...');

    try {
      let primaryPostId = '';
      const primaryUrl = imageUrls[0] || '';
      for (let i = 0; i < imageUrls.length; i++) {
        const mediaUrl = imageUrls[i];
        const payload = {
          contentType: 'photo' as const,
          publicationStatus: 'published' as const,
          authorUid: user.uid,
          authorName,
          authorPhoto,
          mediaUrl,
          thumbnailUrl: mediaUrl.slice(0, 2000),
          caption: i === 0 ? cleanCaption : cleanCaption ? `${cleanCaption} (${i + 1}/${imageUrls.length})` : '',
          likesCount: 0,
          commentsCount: 0,
          source: 'home_composer' as const,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const ref = await addDoc(collection(db, 'user_posts'), payload);
        if (i === 0) primaryPostId = ref.id;
      }

      if (onProgress) onProgress(100, 'Photos published to Home Feed!');
      return {
        id: primaryPostId,
        contentType: 'photo',
        collectionName: 'user_posts',
        mediaUrl: primaryUrl,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'user_posts');
    }
  }

  // Single video upload
  const file = files[0];
  const validation = validateGalleryMediaFile(file, 'video');
  if (!validation.valid || !validation.mediaType) {
    throw new Error(validation.error || 'Invalid video file.');
  }

  if (onProgress) onProgress(5, 'Uploading video to cloud storage...');
  const secureUrl = await uploadFileToCloudinary(file, 'video', (pct, msg) => {
    if (onProgress) onProgress(Math.min(88, Math.max(5, Math.round(pct * 0.85))), msg);
  });

  if (onProgress) onProgress(92, 'Publishing video to KING feed...');

  const hasTrim =
    typeof options?.trimStartSec === 'number' &&
    typeof options?.trimEndSec === 'number' &&
    options.trimEndSec > options.trimStartSec &&
    (options.trimStartSec > 0.1 ||
      (typeof options.rawDurationSec === 'number' && options.rawDurationSec > 0
        ? options.trimEndSec < options.rawDurationSec - 0.1
        : false));
  const isMuted = Boolean(options?.muted);

  let finalVideoUrl = secureUrl;
  const videoTransforms: string[] = [];
  if (hasTrim) {
    videoTransforms.push(
      `so_${options!.trimStartSec!.toFixed(1)}`,
      `eo_${options!.trimEndSec!.toFixed(1)}`
    );
  }
  if (isMuted) {
    videoTransforms.push('ac_none');
  }
  if (videoTransforms.length > 0 && finalVideoUrl.includes('/video/upload/')) {
    finalVideoUrl = finalVideoUrl.replace(
      '/video/upload/',
      `/video/upload/${videoTransforms.join(',')}/`
    );
  }

  const safeExplicitThumb =
    options?.thumbnailUrl &&
    !options.thumbnailUrl.startsWith('data:') &&
    options.thumbnailUrl.length <= 2000
      ? options.thumbnailUrl
      : '';

  let derivedThumb = safeExplicitThumb || deriveVideoThumbnail(secureUrl);
  if (!safeExplicitThumb && hasTrim && options?.trimStartSec && options.trimStartSec > 0.1 && derivedThumb.includes('/video/upload/')) {
    derivedThumb = derivedThumb.replace(
      '/video/upload/',
      `/video/upload/so_${options.trimStartSec.toFixed(1)}/`
    );
  }

  const fallbackTitle =
    (cleanCaption || file.name.replace(/\.[^/.]+$/, '').trim() || 'KING Video').slice(0, 140) ||
    'KING Video';
  const videoPayload: Record<string, any> = {
    url: finalVideoUrl,
    videoUrl: finalVideoUrl,
    thumbnailUrl: derivedThumb,
    title: fallbackTitle.slice(0, 140),
    caption: cleanCaption,
    userId: user.uid,
    uid: user.uid,
    uploaderPhoto: authorPhoto,
    channelAvatar: authorPhoto,
    uploaderName: authorName,
    channelName: authorName,
    contentType: 'video' as const,
    publicationStatus: 'published' as const,
    status: 'published' as const,
    likes: 0,
    views: 0,
    commentsCount: 0,
    createdAt: serverTimestamp(),
    type: 'video',
  };
  if (options?.durationLabel) {
    videoPayload.duration = options.durationLabel.slice(0, 24);
  }

  try {
    const ref = await addDoc(collection(db, 'videos'), videoPayload);
    if (onProgress) onProgress(100, 'Video published to Home Feed & Videos Section!');
    return {
      id: ref.id,
      contentType: 'video',
      collectionName: 'videos',
      mediaUrl: finalVideoUrl,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'videos');
  }
}


/**
 * Subscribe to published user photo/social posts from `user_posts`.
 */
export function subscribePublishedUserPosts(
  limitCount: number,
  onData: (posts: UserPost[]) => void,
  onError?: (err: any) => void
): () => void {
  const q = query(
    collection(db, 'user_posts'),
    where('publicationStatus', '==', 'published'),
    orderBy('createdAt', 'desc'),
    limit(Math.max(10, limitCount))
  );

  return onSnapshot(
    q,
    (snap) => {
      const list: UserPost[] = snap.docs.map((d) => {
        const data = d.data({ serverTimestamps: 'estimate' });
        return {
          id: d.id,
          contentType: (data.contentType || 'photo') as FeedContentType,
          publicationStatus: (data.publicationStatus || 'published') as PublicationStatus,
          authorUid: data.authorUid || '',
          authorName: data.authorName || 'KING User',
          authorPhoto: data.authorPhoto || '',
          mediaUrl: data.mediaUrl || '',
          thumbnailUrl: data.thumbnailUrl || data.mediaUrl || '',
          caption: data.caption || '',
          likesCount: parseNumericCount(data.likesCount),
          commentsCount: parseNumericCount(data.commentsCount),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          source: data.source || 'home_composer',
        };
      });
      onData(list);
    },
    (err) => {
      console.warn('[CentralContent] user_posts snapshot notice:', err?.message || err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to published videos from `videos` collection (filters out unpublished/rejected).
 */
export function subscribePublishedVideos(
  limitCount: number,
  onData: (videos: any[]) => void,
  onError?: (err: any) => void
): () => void {
  const q = query(
    collection(db, 'videos'),
    orderBy('createdAt', 'desc'),
    limit(Math.max(10, limitCount))
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
        .filter(isVideoPublished);
      onData(deduplicateByKeys(list, (v: any) => [v.id, v.videoUrl || v.url || '']));
    },
    (err) => {
      console.warn('[CentralContent] videos snapshot notice:', err?.message || err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to approved & published games from `king_games` collection (deduplicated).
 */
export function subscribePublishedGames(
  onData: (games: DailyGame[]) => void,
  onError?: (err: any) => void
): () => void {
  const gamesRef = collection(db, 'king_games');
  return onSnapshot(
    gamesRef,
    (snap) => {
      const approvedList: DailyGame[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data({ serverTimestamps: 'estimate' });
        if (!isGameApprovedAndPublished(data)) return;
        const url = (data.url || data.link || '').trim();
        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return;

        const actualTs = resolveTimestampMs(
          data.approvedAt || data.reviewedAt || data.publishedAt || data.createdAt
        );

        approvedList.push({
          id: docSnap.id,
          title: (data.title || data.name || 'KING Game').trim(),
          name: (data.name || data.title || 'KING Game').trim(),
          url,
          link: url,
          thumbnail: data.thumbnail || data.thumbnailUrl || data.image || '',
          image: data.thumbnail || data.thumbnailUrl || data.image || '',
          category: data.category || 'Arcade',
          description: data.description || '',
          source: data.source || 'KING Games',
          status: 'approved',
          approved: true,
          isApproved: true,
          featuredOnHome: true,
          isNewToday: Boolean(data.isNewToday),
          rating: Number(data.rating) || 4.9,
          plays: data.plays || '1.5K Plays',
          addedAt: actualTs,
        });
      });

      approvedList.sort((a, b) => b.addedAt - a.addedAt);
      const deduped = deduplicateByKeys(approvedList, (g) => [
        g.id,
        g.url.replace(/\/$/, ''),
      ]);
      onData(deduped);
    },
    (err) => {
      console.warn('[CentralContent] king_games snapshot notice:', err?.message || err);
      if (onError) onError(err);
    }
  );
}

/**
 * Toggle like on either `user_posts` or `videos` atomically.
 */
export async function toggleFeedItemLike(
  sourceCollection: 'user_posts' | 'videos',
  itemId: string,
  user: { uid: string; displayName?: string | null; photoURL?: string | null }
): Promise<{ isLiked: boolean; newLikesCount: number }> {
  if (!user?.uid) throw new Error('Must be signed in to like posts.');

  if (sourceCollection === 'videos') {
    return toggleVideoLike(itemId, user);
  }

  const postRef = doc(db, 'user_posts', itemId);
  const likeRef = doc(db, 'user_posts', itemId, 'likes', user.uid);

  try {
    return await runTransaction(db, async (tx) => {
      const [postSnap, likeSnap] = await Promise.all([tx.get(postRef), tx.get(likeRef)]);
      if (!postSnap.exists()) throw new Error('Post not found');
      const currentLikes = parseNumericCount(postSnap.data()?.likesCount);
      if (likeSnap.exists()) {
        tx.delete(likeRef);
        const newCount = Math.max(0, currentLikes - 1);
        tx.update(postRef, { likesCount: newCount });
        return { isLiked: false, newLikesCount: newCount };
      }
      tx.set(likeRef, {
        userId: user.uid,
        displayName: user.displayName || 'KING User',
        photoURL: user.photoURL || '',
        createdAt: serverTimestamp(),
      });
      const newCount = currentLikes + 1;
      tx.update(postRef, { likesCount: newCount });
      return { isLiked: true, newLikesCount: newCount };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `user_posts/${itemId}/likes/${user.uid}`);
  }
}

/**
 * Subscribe to comments for a `user_posts` or `videos` item.
 */
export function subscribeFeedComments(
  sourceCollection: 'user_posts' | 'videos',
  itemId: string,
  onData: (comments: ContentComment[]) => void,
  onError?: (err: any) => void
): () => void {
  const q = query(
    collection(db, sourceCollection, itemId, 'comments'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: ContentComment[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          authorUid: data.authorUid || '',
          authorName: data.authorName || 'KING User',
          authorPhoto: data.authorPhoto || '',
          text: data.text || '',
          createdAt: data.createdAt,
        };
      });
      onData(list);
    },
    (err) => {
      console.warn('[CentralContent] comments snapshot notice:', err?.message || err);
      if (onError) onError(err);
    }
  );
}

/**
 * Add an authenticated comment to a `user_posts` or `videos` item atomically.
 * Uses deterministic `${uid}_${timestamp}_${rand}` ID paired with `lastCommentId` on parent
 * so Firestore Rules can verify `existsAfter` atomicity cleanly.
 */
export async function addFeedComment(
  sourceCollection: 'user_posts' | 'videos',
  itemId: string,
  text: string,
  user: { uid: string; displayName?: string | null; photoURL?: string | null; email?: string | null }
): Promise<string> {
  if (!user?.uid) throw new Error('Please sign in to post a comment.');
  const cleanText = text.trim();
  if (!cleanText || cleanText.length > 500) {
    throw new Error('Comment must be between 1 and 500 characters.');
  }

  const rand = Math.random().toString(36).slice(2, 8);
  const commentId = `${user.uid}_${Date.now()}_${rand}`;
  const parentRef = doc(db, sourceCollection, itemId);
  const commentRef = doc(db, sourceCollection, itemId, 'comments', commentId);

  try {
    await runTransaction(db, async (tx) => {
      const parentSnap = await tx.get(parentRef);
      if (!parentSnap.exists()) throw new Error('Content not found');
      const currentCount = parseNumericCount(parentSnap.data()?.commentsCount);

      tx.set(commentRef, {
        authorUid: user.uid,
        authorName: (user.displayName || user.email?.split('@')[0] || 'KING User').slice(0, 100),
        authorPhoto: (user.photoURL || '').slice(0, 1000),
        text: cleanText,
        createdAt: serverTimestamp(),
      });

      tx.update(parentRef, {
        commentsCount: currentCount + 1,
        lastCommentId: commentId,
      });
    });
    return commentId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `${sourceCollection}/${itemId}/comments/${commentId}`);
  }
}

/**
 * Delete a comment (owner of comment, owner of post, or Super Admin).
 */
export async function deleteFeedComment(
  sourceCollection: 'user_posts' | 'videos',
  itemId: string,
  commentId: string
): Promise<void> {
  const commentRef = doc(db, sourceCollection, itemId, 'comments', commentId);
  const parentRef = doc(db, sourceCollection, itemId);
  try {
    await runTransaction(db, async (tx) => {
      const [parentSnap, commentSnap] = await Promise.all([tx.get(parentRef), tx.get(commentRef)]);
      if (!commentSnap.exists()) return;
      tx.delete(commentRef);
      if (parentSnap.exists()) {
        const curr = parseNumericCount(parentSnap.data()?.commentsCount);
        tx.update(parentRef, {
          commentsCount: Math.max(0, curr - 1),
          lastDeletedCommentId: commentId,
        });
      }
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${sourceCollection}/${itemId}/comments/${commentId}`);
  }
}

/**
 * Check client-side if current user owns or administers an item (rules still enforce server-side).
 */
export function canUserManageItem(authorUid: string, currentUser: { uid?: string; email?: string | null; emailVerified?: boolean } | null): boolean {
  if (!currentUser?.uid) return false;
  if (currentUser.email === AUTHORIZED_ADMIN_EMAIL && currentUser.emailVerified !== false) return true;
  return Boolean(authorUid && authorUid === currentUser.uid);
}

/**
 * Delete own uploaded photo post or video post (or Admin delete).
 */
export async function deleteFeedItem(
  sourceCollection: 'user_posts' | 'videos',
  itemId: string
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) {
    throw new Error('Authentication required to delete content.');
  }

  const ref = doc(db, sourceCollection, itemId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const ownerUid = data.authorUid || data.userId || data.uid || '';
    const isAdmin = currentUser.email === AUTHORIZED_ADMIN_EMAIL && currentUser.emailVerified;
    if (!isAdmin && ownerUid !== currentUser.uid) {
      throw new Error('Permission denied: Only the creator or Admin can delete this item.');
    }
    await deleteDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${sourceCollection}/${itemId}`);
  }
}

/**
 * Admin moderation for user_posts (`published` | `unpublished` | `rejected`).
 */
export async function setUserPostStatus(postId: string, status: PublicationStatus): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.email !== AUTHORIZED_ADMIN_EMAIL) {
    handleFirestoreError(new Error('Super Admin authentication required'), OperationType.UPDATE, `user_posts/${postId}`);
  }
  try {
    await updateDoc(doc(db, 'user_posts', postId), {
      publicationStatus: status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `user_posts/${postId}`);
  }
}

/**
 * Admin moderation for videos (`published` | `unpublished` | `rejected`).
 */
export async function setVideoPublicationStatus(videoId: string, status: PublicationStatus): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.email !== AUTHORIZED_ADMIN_EMAIL) {
    handleFirestoreError(new Error('Super Admin authentication required'), OperationType.UPDATE, `videos/${videoId}`);
  }
  try {
    await updateDoc(doc(db, 'videos', videoId), {
      publicationStatus: status,
      status,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `videos/${videoId}`);
  }
}

/**
 * Admin moderation for king_games (`approved` | `rejected` | `unpublished`).
 */
export async function setGameModerationStatus(
  gameId: string,
  status: 'approved' | 'rejected' | 'unpublished'
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.email !== AUTHORIZED_ADMIN_EMAIL) {
    handleFirestoreError(new Error('Super Admin authentication required'), OperationType.UPDATE, `king_games/${gameId}`);
  }
  const isApproved = status === 'approved';
  try {
    const updatePayload: Record<string, any> = {
      status,
      publicationStatus: isApproved ? 'published' : status,
      approved: isApproved,
      isApproved,
      published: isApproved,
      reviewedAt: new Date().toISOString(),
      reviewedBy: currentUser.email || 'admin',
    };
    if (isApproved) {
      updatePayload.approvedAt = serverTimestamp();
    }
    await updateDoc(doc(db, 'king_games', gameId), updatePayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `king_games/${gameId}`);
  }
}

/**
 * Admin permanent removal of a game from `king_games`.
 */
export async function deleteGameFromCatalog(gameId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.email !== AUTHORIZED_ADMIN_EMAIL) {
    handleFirestoreError(new Error('Super Admin authentication required'), OperationType.DELETE, `king_games/${gameId}`);
  }
  try {
    await deleteDoc(doc(db, 'king_games', gameId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `king_games/${gameId}`);
  }
}

/**
 * Subscribe to ALL user posts (Admin moderation view).
 */
export function subscribeAllUserPostsForAdmin(
  onData: (posts: UserPost[]) => void,
  onError?: (err: any) => void
): () => void {
  const q = query(collection(db, 'user_posts'), orderBy('createdAt', 'desc'), limit(60));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            contentType: (data.contentType || 'photo') as FeedContentType,
            publicationStatus: (data.publicationStatus || 'published') as PublicationStatus,
            authorUid: data.authorUid || '',
            authorName: data.authorName || 'KING User',
            authorPhoto: data.authorPhoto || '',
            mediaUrl: data.mediaUrl || '',
            thumbnailUrl: data.thumbnailUrl || data.mediaUrl || '',
            caption: data.caption || '',
            likesCount: parseNumericCount(data.likesCount),
            commentsCount: parseNumericCount(data.commentsCount),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        })
      );
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to ALL videos (Admin moderation view).
 */
export function subscribeAllVideosForAdmin(
  onData: (videos: any[]) => void,
  onError?: (err: any) => void
): () => void {
  const q = query(collection(db, 'videos'), orderBy('createdAt', 'desc'), limit(60));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}
