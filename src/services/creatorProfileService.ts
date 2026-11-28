import { doc, onSnapshot } from 'firebase/firestore';
import { useState, useEffect } from 'react';

export interface CreatorPublicProfile {
  uid: string;
  displayName?: string;
  name?: string;
  displayNameLower?: string;
  username?: string;
  usernameLower?: string;
  bio?: string;
  photoURL?: string | null;
  socialLinks?: Record<string, string>;
  followersCount?: number;
  followingCount?: number;
  isVerified?: boolean;
}

export function formatCreatorHandle(
  profile?: { username?: string | null; uid?: string | null } | null
): string {
  if (profile?.username && typeof profile.username === 'string' && profile.username.trim()) {
    return `@${profile.username.trim().replace(/^@+/, '')}`;
  }
  const uid = profile?.uid?.trim() || '';
  if (uid) {
    return `@king_${uid.slice(0, 6).toLowerCase()}`;
  }
  return '@king_creator';
}

/**
 * Filter out silhouettes and invalid URLs, and format Facebook Graph URLs properly
 */
export function cleanProfilePhoto(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Filter out Facebook default silhouette placeholders
  if (
    trimmed.includes('HsTZSDw4avx') ||
    trimmed.includes('static.xx.fbcdn.net/rsrc.php') ||
    trimmed.includes('is_silhouette=true')
  ) {
    return null;
  }

  // Ensure HTTPS
  let finalUrl = trimmed;
  if (finalUrl.startsWith('http://')) {
    finalUrl = finalUrl.replace('http://', 'https://');
  }

  // Upgrade Facebook Graph API URL to large size
  if (finalUrl.includes('graph.facebook.com')) {
    try {
      const urlObj = new URL(finalUrl);
      urlObj.searchParams.set('type', 'large');
      finalUrl = urlObj.toString();
    } catch {
      finalUrl = finalUrl.replace(/(\?|&)type=[^&]+/, '') + (finalUrl.includes('?') ? '&' : '?') + 'type=large';
    }
  }

  return finalUrl;
}

// In-memory cache & listeners map to avoid duplicate Firestore onSnapshot listeners
const profilesCache = new Map<string, CreatorPublicProfile | null>();
const listenersMap = new Map<string, Set<(profile: CreatorPublicProfile | null) => void>>();
const unsubsMap = new Map<string, () => void>();

/**
 * Subscribe to a creator's public profile from publicProfiles/{uid}.
 * Automatically caches and notifies subscribers in real-time when the creator updates their profile photo or name.
 */
export function subscribeToCreatorProfile(
  uid: string,
  onChange: (profile: CreatorPublicProfile | null) => void
): () => void {
  const safeUid = uid.trim();
  if (!safeUid) {
    onChange(null);
    return () => {};
  }

  // If already in cache, notify immediately
  if (profilesCache.has(safeUid)) {
    onChange(profilesCache.get(safeUid) || null);
  }

  let subs = listenersMap.get(safeUid);
  if (!subs) {
    subs = new Set();
    listenersMap.set(safeUid, subs);
  }
  subs.add(onChange);

  // Setup Firestore onSnapshot listener if not already active
  if (!unsubsMap.has(safeUid)) {
    let active = true;
    let realUnsub: () => void = () => {};
    unsubsMap.set(safeUid, () => {
      active = false;
      realUnsub();
    });

    import('../firebase')
      .then(({ db }) => {
        if (!active) return;
        const docRef = doc(db, 'publicProfiles', safeUid);
        realUnsub = onSnapshot(
          docRef,
          (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              const followersCount =
                typeof data.followersCount === 'number' && data.followersCount >= 0
                  ? Math.floor(data.followersCount)
                  : 0;
              const followingCount =
                typeof data.followingCount === 'number' && data.followingCount >= 0
                  ? Math.floor(data.followingCount)
                  : 0;
              const profile: CreatorPublicProfile = {
                uid: safeUid,
                displayName: data.displayName || data.name || '',
                name: data.name || data.displayName || '',
                displayNameLower:
                  typeof data.displayNameLower === 'string' ? data.displayNameLower : undefined,
                username: typeof data.username === 'string' ? data.username : undefined,
                usernameLower:
                  typeof data.usernameLower === 'string' ? data.usernameLower : undefined,
                bio: typeof data.bio === 'string' ? data.bio : '',
                photoURL: cleanProfilePhoto(data.photoURL),
                socialLinks: data.socialLinks,
                followersCount,
                followingCount,
                isVerified: data.isVerified === true,
              };
              profilesCache.set(safeUid, profile);
              const listeners = listenersMap.get(safeUid);
              if (listeners) {
                listeners.forEach((fn) => fn(profile));
              }
            } else {
              profilesCache.set(safeUid, null);
              const listeners = listenersMap.get(safeUid);
              if (listeners) {
                listeners.forEach((fn) => fn(null));
              }
            }
          },
          (err) => {
            // Graceful handling of network / permission errors without noise
            if (err?.code !== 'unavailable') {
              console.warn(`Public profile fetch notice for ${safeUid}:`, err?.message || err);
            }
          }
        );
      })
      .catch((e) => {
        console.warn('Could not attach listener for creator profile:', e);
      });
  }

  return () => {
    const listeners = listenersMap.get(safeUid);
    if (listeners) {
      listeners.delete(onChange);
      if (listeners.size === 0) {
        listenersMap.delete(safeUid);
        const unsub = unsubsMap.get(safeUid);
        if (unsub) {
          unsub();
          unsubsMap.delete(safeUid);
        }
      }
    }
  };
}

/**
 * React hook to retrieve a creator's public profile in real-time.
 * Syncs automatically when creator updates their photo or name.
 */
export function useCreatorProfile(uid?: string | null) {
  const [profile, setProfile] = useState<CreatorPublicProfile | null>(() => {
    if (uid && profilesCache.has(uid.trim())) {
      return profilesCache.get(uid.trim()) || null;
    }
    return null;
  });
  const [loading, setLoading] = useState(Boolean(uid && !profilesCache.has(uid.trim())));

  useEffect(() => {
    if (!uid || typeof uid !== 'string' || !uid.trim()) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const safeUid = uid.trim();
    if (profilesCache.has(safeUid)) {
      setProfile(profilesCache.get(safeUid) || null);
    } else {
      setLoading(true);
    }

    const unsub = subscribeToCreatorProfile(safeUid, (p) => {
      setProfile(p);
      setLoading(false);
    });

    return () => unsub();
  }, [uid]);

  return {
    profile,
    photoURL: profile?.photoURL || null,
    displayName: profile?.displayName || profile?.name || null,
    loading,
  };
}
