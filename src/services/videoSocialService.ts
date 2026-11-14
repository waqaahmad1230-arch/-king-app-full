import { 
  doc, 
  runTransaction, 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from './firestoreErrorHandler';

/**
 * Defensive parser: Safely extracts numeric counts from numbers, undefined, null,
 * or legacy string values like "1.2k", "0 views • Phone Gallery", or "450".
 */
export function parseNumericCount(val: any): number {
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.max(0, Math.floor(val));
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const match = trimmed.match(/^(\d+(\.\d+)?)/);
    if (match) {
      let num = parseFloat(match[1]);
      const lower = trimmed.toLowerCase();
      if (lower.includes('k')) num *= 1000;
      if (lower.includes('m')) num *= 1000000;
      return Math.max(0, Math.floor(num));
    }
  }
  return 0;
}

/**
 * Compact YouTube/Instagram-style count formatter (e.g. 1.2K, 3.4M)
 */
export function formatCompactCount(count: number | undefined): string {
  const num = parseNumericCount(count);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return num.toString();
}

/**
 * Guest-view counting policy:
 * - Guest users do not have a Firebase Auth UID.
 * - In accordance with privacy & anti-fingerprinting requirements, we do NOT use invasive hardware/browser fingerprinting.
 * - An ephemeral session token is generated in sessionStorage (valid only for the current browser session tab).
 * - Format: guest_xxxxxx (matches Firestore security rules regex ^guest_[a-zA-Z0-9_-]{4,64}$).
 * - This prevents duplicate views during replays and refreshes within the same session.
 */
export function getGuestViewerId(): string {
  if (typeof window === 'undefined') return 'guest_server_render';
  
  try {
    const existing = sessionStorage.getItem('king_guest_viewer_token');
    if (existing && existing.startsWith('guest_')) {
      return existing;
    }
    const randPart = Math.random().toString(36).substring(2, 12);
    const timePart = Date.now().toString(36);
    const newGuestId = `guest_${randPart}_${timePart}`;
    sessionStorage.setItem('king_guest_viewer_token', newGuestId);
    return newGuestId;
  } catch (e) {
    return `guest_${Date.now()}`;
  }
}

export interface LikedUserItem {
  userId: string;
  displayName: string;
  photoURL?: string;
  createdAt?: any;
}

/**
 * PHASE 1B: Atomic Video Like / Unlike Toggle
 * Uses Firestore transaction to guarantee:
 * 1. Exactly one like per authenticated user.
 * 2. videos/{videoId}/likes/{userId} subcollection document created or deleted.
 * 3. videos/{videoId}.likes numeric counter incremented or decremented atomically.
 */
export async function toggleVideoLike(
  videoId: string,
  user: { uid: string; displayName?: string | null; photoURL?: string | null }
): Promise<{ isLiked: boolean; newLikesCount: number }> {
  if (!videoId) throw new Error("Video ID is required");
  if (!user || !user.uid) throw new Error("Must be signed in to like a video");

  const videoRef = doc(db, "videos", videoId);
  const likeRef = doc(db, "videos", videoId, "likes", user.uid);

  try {
    return await runTransaction(db, async (transaction) => {
      const [videoSnap, likeSnap] = await Promise.all([
        transaction.get(videoRef),
        transaction.get(likeRef)
      ]);

      if (!videoSnap.exists()) {
        throw new Error("Video not found");
      }

      const videoData = videoSnap.data();
      const currentLikes = parseNumericCount(videoData?.likes);
      const alreadyLiked = likeSnap.exists();

      if (alreadyLiked) {
        // User clicked Like again -> UNLIKE
        transaction.delete(likeRef);
        const newCount = Math.max(0, currentLikes - 1);
        transaction.update(videoRef, { likes: newCount });
        return { isLiked: false, newLikesCount: newCount };
      } else {
        // User liked video -> LIKE
        transaction.set(likeRef, {
          userId: user.uid,
          displayName: user.displayName || 'KING User',
          photoURL: user.photoURL || '',
          createdAt: serverTimestamp()
        });
        const newCount = currentLikes + 1;
        transaction.update(videoRef, { likes: newCount });
        return { isLiked: true, newLikesCount: newCount };
      }
    });
  } catch (err: any) {
    if (err?.message?.includes('permission') || err?.code?.includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, `videos/${videoId}/likes/${user.uid}`);
    }
    throw err;
  }
}

/**
 * Real-time listener for current user's like status on a video
 */
export function subscribeUserLikeStatus(
  videoId: string,
  userId: string | null,
  callback: (isLiked: boolean) => void
): () => void {
  if (!videoId || !userId) {
    callback(false);
    return () => {};
  }

  const likeRef = doc(db, "videos", videoId, "likes", userId);
  return onSnapshot(
    likeRef,
    (snap) => {
      callback(snap.exists());
    },
    (err) => {
      console.warn("Notice: like status snapshot:", err.message);
      callback(false);
    }
  );
}

/**
 * Fetch all users who liked a video for the "Liked By" list
 */
export async function fetchVideoLikedByUsers(videoId: string): Promise<LikedUserItem[]> {
  if (!videoId) return [];
  try {
    const likesCol = collection(db, "videos", videoId, "likes");
    const snap = await getDocs(query(likesCol, limit(100)));
    
    const list: LikedUserItem[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        userId: d.id,
        displayName: data.displayName || 'KING User',
        photoURL: data.photoURL || '',
        createdAt: data.createdAt
      });
    });

    // Sort by createdAt newest first if available
    list.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      return timeB - timeA;
    });

    return list;
  } catch (err) {
    console.warn("Notice: could not load liked users:", err);
    return [];
  }
}

/**
 * PHASE 1C: Atomic Unique Video View
 * Requirements:
 * - Counted only after 3 seconds of actual continuous video playback.
 * - Prevent duplicate views on refresh, replay, or reopening via subcollection check.
 * - Authenticated user uses their UID; Guest user uses their ephemeral session token.
 */
export async function recordUniqueVideoView(
  videoId: string,
  user: { uid: string } | null
): Promise<{ counted: boolean; newViewsCount?: number }> {
  if (!videoId) return { counted: false };

  const viewerId = user?.uid ? user.uid : getGuestViewerId();
  const isGuest = !user?.uid;

  const videoRef = doc(db, "videos", videoId);
  const viewRef = doc(db, "videos", videoId, "views", viewerId);

  try {
    return await runTransaction(db, async (transaction) => {
      const [videoSnap, viewSnap] = await Promise.all([
        transaction.get(videoRef),
        transaction.get(viewRef)
      ]);

      if (!videoSnap.exists()) {
        return { counted: false };
      }

      // Check if this viewer already recorded a view on this video
      if (viewSnap.exists()) {
        const currentViews = parseNumericCount(videoSnap.data()?.views);
        return { counted: false, newViewsCount: currentViews };
      }

      // Record unique view record in subcollection
      transaction.set(viewRef, {
        viewerId,
        isGuest,
        viewedAt: serverTimestamp()
      });

      // Increment numeric views counter atomically
      const currentViews = parseNumericCount(videoSnap.data()?.views);
      const newCount = currentViews + 1;
      transaction.update(videoRef, { views: newCount });

      return { counted: true, newViewsCount: newCount };
    });
  } catch (err: any) {
    console.warn("Notice: unique view record transaction:", err?.message || err);
    return { counted: false };
  }
}
