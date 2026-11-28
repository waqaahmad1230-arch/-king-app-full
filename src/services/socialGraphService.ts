import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { cleanProfilePhoto } from './creatorProfileService';
import {
  BlockRecord,
  FollowRecord,
  FriendshipRecord,
  RelationshipWithUser,
  SocialUserProfile,
  StatusPrivacyMode,
  StatusPrivacySettings,
} from '../types/social';

export interface SocialGraphRuntime {
  db: Firestore;
  currentUser?: { displayName?: string | null; photoURL?: string | null } | null;
}

let testRuntimeResolver: (() => SocialGraphRuntime) | null = null;

/**
 * Isolated test-only runtime override so unit/emulator tests can execute
 * socialGraphService methods against the local Firestore Emulator without
 * initializing or connecting to production Firebase.
 */
export function setSocialGraphTestRuntime(
  resolver: (() => SocialGraphRuntime) | null
): void {
  testRuntimeResolver = resolver;
}

async function getSocialGraphRuntime(): Promise<SocialGraphRuntime> {
  if (testRuntimeResolver) {
    return testRuntimeResolver();
  }
  const mod = await import('../firebase');
  return {
    db: mod.db,
    currentUser: mod.auth.currentUser,
  };
}

function attachWithRuntime(
  attach: (db: Firestore) => () => void,
  onError?: (err: unknown) => void
): () => void {
  if (testRuntimeResolver) {
    return attach(testRuntimeResolver().db);
  }
  let active = true;
  let unsub: () => void = () => {};
  import('../firebase')
    .then(({ db }) => {
      if (!active) return;
      unsub = attach(db);
    })
    .catch((err) => {
      if (active) onError?.(err);
    });
  return () => {
    active = false;
    unsub();
  };
}

export const MAX_PRIVACY_UID_LIST = 200;
const FOLLOW_LIST_PAGE_DEFAULT = 25;
const FOLLOW_NOTIF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FOLLOW_NOTIF_COOLDOWN_MS = 65 * 60 * 1000; // > 1h server rule cooldown to avoid clock skew rejections
const USERNAME_REGEX = /^[a-z0-9_.]{3,24}$/;

export const VALID_STATUS_PRIVACY_MODES: readonly StatusPrivacyMode[] = [
  'public',
  'friends',
  'followers',
  'selected',
  'except',
  'only_me',
] as const;

export const DEFAULT_STATUS_PRIVACY: StatusPrivacySettings = {
  visibility: 'friends',
  selectedUids: [],
  exceptUids: [],
};

export interface FollowListPageItem {
  followId: string;
  uid: string;
  createdAtMs: number;
  profile: SocialUserProfile;
}

export interface FollowListPageResult {
  items: FollowListPageItem[];
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export interface BatchFollowEdges {
  followingSet: Set<string>;
  followedBySet: Set<string>;
}

export function sanitizeUid(uid: unknown): string {
  if (typeof uid !== 'string') return '';
  const trimmed = uid.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(trimmed)) return '';
  return trimmed;
}

export function sanitizeUsername(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export function validateUsername(raw: unknown): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const normalized = sanitizeUsername(raw);
  if (normalized.length < 3) {
    return { valid: false, normalized, error: 'Username must be at least 3 characters.' };
  }
  if (normalized.length > 24) {
    return { valid: false, normalized, error: 'Username must be 24 characters or fewer.' };
  }
  if (!USERNAME_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Use lowercase letters, numbers, underscores (_) or periods (.).',
    };
  }
  if (normalized.startsWith('.') || normalized.endsWith('.') || normalized.includes('..')) {
    return {
      valid: false,
      normalized,
      error: 'Username cannot start/end with a period or contain consecutive periods.',
    };
  }
  return { valid: true, normalized };
}

function toTimestampMs(val: any): number {
  if (!val) return 0;
  if (typeof val?.toMillis === 'function') return val.toMillis();
  if (typeof val?.seconds === 'number') return val.seconds * 1000;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function parseSafeCounter(val: unknown): number {
  if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) return 0;
  return Math.floor(val);
}

function mapDocToSocialProfile(uid: string, data: DocumentData | undefined): SocialUserProfile {
  const displayName =
    String(data?.displayName || data?.name || 'KING Creator').trim() || 'KING Creator';
  return {
    uid,
    displayName,
    photoURL: cleanProfilePhoto(data?.photoURL),
    username: typeof data?.username === 'string' && data.username ? data.username : undefined,
    usernameLower:
      typeof data?.usernameLower === 'string' && data.usernameLower ? data.usernameLower : undefined,
    displayNameLower:
      typeof data?.displayNameLower === 'string' && data.displayNameLower
        ? data.displayNameLower
        : displayName.toLowerCase(),
    followersCount: parseSafeCounter(data?.followersCount),
    followingCount: parseSafeCounter(data?.followingCount),
    isVerified: data?.isVerified === true,
  };
}

export function getFriendshipPairId(uid1: string, uid2: string): string {
  const a = sanitizeUid(uid1);
  const b = sanitizeUid(uid2);
  if (!a || !b || a === b) {
    throw new Error('Two distinct valid user IDs are required.');
  }
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export function getSortedPair(uid1: string, uid2: string): [string, string] {
  const a = sanitizeUid(uid1);
  const b = sanitizeUid(uid2);
  if (!a || !b || a === b) {
    throw new Error('Two distinct valid user IDs are required.');
  }
  return a < b ? [a, b] : [b, a];
}

export function getFollowDocId(followerUid: string, targetUid: string): string {
  const f = sanitizeUid(followerUid);
  const t = sanitizeUid(targetUid);
  if (!f || !t || f === t) {
    throw new Error('Two distinct valid user IDs are required.');
  }
  return `${f}_${t}`;
}

export function getBlockDocId(blockerUid: string, blockedUid: string): string {
  const blocker = sanitizeUid(blockerUid);
  const blocked = sanitizeUid(blockedUid);
  if (!blocker || !blocked || blocker === blocked) {
    throw new Error('Two distinct valid user IDs are required.');
  }
  return `${blocker}_${blocked}`;
}

export function resolveSocialErrorMessage(
  error: unknown,
  fallback = 'Action could not be completed.'
): string {
  const code = (error as any)?.code || '';
  const message = (error as any)?.message || '';

  if (code === 'permission-denied' || message.includes('Missing or insufficient permissions')) {
    return 'Action unavailable due to privacy or block settings.';
  }
  if (code === 'unauthenticated') {
    return 'Please sign in to perform this action.';
  }
  if (message && typeof message === 'string') {
    return message;
  }
  return fallback;
}

async function assertNotBlockedLocally(
  currentUid: string,
  targetUid: string,
  db: Firestore
): Promise<void> {
  const myBlockRef = doc(db, 'blocks', getBlockDocId(currentUid, targetUid));
  const myBlockSnap = await getDoc(myBlockRef);
  if (myBlockSnap.exists()) {
    throw new Error('You blocked this user. Unblock them first to interact.');
  }
}

/**
 * Check if a normalized username is available (or already owned by currentUid).
 */
export async function checkUsernameAvailability(
  rawUsername: string,
  currentUid?: string | null
): Promise<{ available: boolean; normalized: string; reason?: string }> {
  const validation = validateUsername(rawUsername);
  if (!validation.valid) {
    return { available: false, normalized: validation.normalized, reason: validation.error };
  }

  const { db } = await getSocialGraphRuntime();
  const me = sanitizeUid(currentUid || '');
  const snap = await getDoc(doc(db, 'usernames', validation.normalized));
  if (!snap.exists()) {
    return { available: true, normalized: validation.normalized };
  }
  const ownerUid = snap.data()?.uid;
  if (me && ownerUid === me) {
    return { available: true, normalized: validation.normalized };
  }
  return {
    available: false,
    normalized: validation.normalized,
    reason: `@${validation.normalized} is already taken.`,
  };
}

/**
 * Atomically claim or change a unique @username via /usernames/{username} and sync publicProfiles/{uid}.
 */
export async function claimUsername(currentUid: string, rawUsername: string): Promise<string> {
  const me = sanitizeUid(currentUid);
  if (!me) throw new Error('Please sign in first.');

  const validation = validateUsername(rawUsername);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid username.');
  }
  const nextUsername = validation.normalized;
  const { db, currentUser } = await getSocialGraphRuntime();

  await runTransaction(db, async (tx) => {
    const newClaimRef = doc(db, 'usernames', nextUsername);
    const profileRef = doc(db, 'publicProfiles', me);
    const [newClaimSnap, profileSnap] = await Promise.all([
      tx.get(newClaimRef),
      tx.get(profileRef),
    ]);

    if (newClaimSnap.exists() && newClaimSnap.data()?.uid !== me) {
      throw new Error(`@${nextUsername} is already taken.`);
    }

    const oldUsername = profileSnap.exists()
      ? sanitizeUsername(profileSnap.data()?.username)
      : '';
    let oldClaimSnap: any = null;
    const oldClaimRef =
      oldUsername && oldUsername !== nextUsername ? doc(db, 'usernames', oldUsername) : null;
    if (oldClaimRef) {
      oldClaimSnap = await tx.get(oldClaimRef);
    }

    if (!newClaimSnap.exists()) {
      tx.set(newClaimRef, {
        uid: me,
        username: nextUsername,
        createdAt: serverTimestamp(),
      });
    }

    if (oldClaimRef && oldClaimSnap?.exists() && oldClaimSnap.data()?.uid === me) {
      tx.delete(oldClaimRef);
    }

    const nowIso = new Date().toISOString();
    if (profileSnap.exists()) {
      tx.update(profileRef, {
        username: nextUsername,
        usernameLower: nextUsername,
        updatedAt: nowIso,
      });
    } else {
      const fallbackName = currentUser?.displayName?.trim() || 'KING Creator';
      tx.set(profileRef, {
        uid: me,
        displayName: fallbackName,
        name: fallbackName,
        displayNameLower: fallbackName.toLowerCase(),
        username: nextUsername,
        usernameLower: nextUsername,
        photoURL: cleanProfilePhoto(currentUser?.photoURL) || '',
        followersCount: 0,
        followingCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  });

  return nextUsername;
}

/**
 * Best-effort default username assignment for users who do not yet have one.
 */
export async function ensureDefaultUsername(
  uid: string,
  seedName?: string | null
): Promise<string | null> {
  const me = sanitizeUid(uid);
  if (!me) return null;

  try {
    const { db, currentUser } = await getSocialGraphRuntime();
    const profileSnap = await getDoc(doc(db, 'publicProfiles', me));
    const existing = profileSnap.exists() ? sanitizeUsername(profileSnap.data()?.username) : '';
    if (existing && USERNAME_REGEX.test(existing)) {
      return existing;
    }

    const rawSeed = (seedName || currentUser?.displayName || 'king')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 14);
    const base = rawSeed.length >= 3 ? rawSeed : `king_${me.slice(0, 4).toLowerCase()}`;
    const candidates = [
      `${base}_${me.slice(0, 4).toLowerCase()}`.slice(0, 24),
      `${base}_${me.slice(-4).toLowerCase()}`.slice(0, 24),
      `king_${me.slice(0, 8).toLowerCase()}`.slice(0, 24),
    ];

    for (const candidate of candidates) {
      if (!USERNAME_REGEX.test(candidate)) continue;
      try {
        return await claimUsername(me, candidate);
      } catch {
        // try next candidate
      }
    }
  } catch (err) {
    console.warn('[socialGraphService] ensureDefaultUsername notice:', err);
  }
  return null;
}

/**
 * Send a friend request using a deterministic canonical document ID (minUid_maxUid)
 * inside a Firestore transaction to prevent duplicates or simultaneous reverse requests.
 */
export async function sendFriendRequest(currentUid: string, targetUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const target = sanitizeUid(targetUid);
  if (!me) throw new Error('Please sign in first.');
  if (!target || me === target) throw new Error('Invalid target user.');

  const { db } = await getSocialGraphRuntime();
  await assertNotBlockedLocally(me, target, db);

  const [userA, userB] = getSortedPair(me, target);
  const pairId = `${userA}_${userB}`;
  const friendshipRef = doc(db, 'friendships', pairId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(friendshipRef);
    if (snap.exists()) {
      const data = snap.data() as FriendshipRecord;
      if (data.status === 'accepted') {
        throw new Error('You are already friends.');
      }
      if (data.status === 'pending') {
        if (data.requestedBy === me) {
          throw new Error('Friend request already sent.');
        }
        throw new Error('This user already sent you a friend request. Accept it instead.');
      }
    }

    tx.set(friendshipRef, {
      userA,
      userB,
      users: [userA, userB],
      status: 'pending',
      requestedBy: me,
      targetUid: target,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function acceptFriendRequest(currentUid: string, requesterUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const requester = sanitizeUid(requesterUid);
  if (!me) throw new Error('Please sign in first.');
  if (!requester || me === requester) throw new Error('Invalid user.');

  const { db } = await getSocialGraphRuntime();
  await assertNotBlockedLocally(me, requester, db);

  const pairId = getFriendshipPairId(me, requester);
  const friendshipRef = doc(db, 'friendships', pairId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(friendshipRef);
    if (!snap.exists()) {
      throw new Error('Friend request no longer exists.');
    }
    const data = snap.data() as FriendshipRecord;
    if (data.status !== 'pending') {
      throw new Error('This request has already been handled.');
    }
    if (data.targetUid !== me) {
      throw new Error('Only the recipient can accept a friend request.');
    }

    tx.update(friendshipRef, {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
  });
}

export async function rejectFriendRequest(currentUid: string, requesterUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const requester = sanitizeUid(requesterUid);
  if (!me) throw new Error('Please sign in first.');
  if (!requester || me === requester) throw new Error('Invalid user.');

  const { db } = await getSocialGraphRuntime();
  const pairId = getFriendshipPairId(me, requester);
  const friendshipRef = doc(db, 'friendships', pairId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(friendshipRef);
    if (!snap.exists()) {
      throw new Error('Friend request no longer exists.');
    }
    const data = snap.data() as FriendshipRecord;
    if (data.status !== 'pending' || data.targetUid !== me) {
      throw new Error('Only an incoming pending request can be rejected.');
    }
    tx.delete(friendshipRef);
  });
}

export async function cancelFriendRequest(currentUid: string, targetUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const target = sanitizeUid(targetUid);
  if (!me) throw new Error('Please sign in first.');
  if (!target || me === target) throw new Error('Invalid user.');

  const { db } = await getSocialGraphRuntime();
  const pairId = getFriendshipPairId(me, target);
  const friendshipRef = doc(db, 'friendships', pairId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(friendshipRef);
    if (!snap.exists()) {
      throw new Error('Friend request no longer exists.');
    }
    const data = snap.data() as FriendshipRecord;
    if (data.status !== 'pending' || data.requestedBy !== me) {
      throw new Error('Only your outgoing pending request can be canceled.');
    }
    tx.delete(friendshipRef);
  });
}

export async function removeFriend(currentUid: string, friendUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const friend = sanitizeUid(friendUid);
  if (!me) throw new Error('Please sign in first.');
  if (!friend || me === friend) throw new Error('Invalid user.');

  const { db } = await getSocialGraphRuntime();
  const pairId = getFriendshipPairId(me, friend);
  const friendshipRef = doc(db, 'friendships', pairId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(friendshipRef);
    if (!snap.exists()) {
      throw new Error('Friendship does not exist.');
    }
    const data = snap.data() as FriendshipRecord;
    if (data.status !== 'accepted' || !data.users?.includes(me)) {
      throw new Error('You are not friends with this user.');
    }
    tx.delete(friendshipRef);
  });
}

/**
 * Follow another user atomically:
 * 1. Creates /follows/{me}_{target}
 * 2. Increments target's followersCount (+1) & actor's followingCount (+1) on publicProfiles
 * 3. Creates or refreshes deterministic /notifications/follow_{me}_{target} (respecting 1h cooldown)
 */
export async function followUser(
  currentUid: string,
  targetUid: string,
  actorInfo?: { displayName?: string | null; photoURL?: string | null }
): Promise<void> {
  const me = sanitizeUid(currentUid);
  const target = sanitizeUid(targetUid);
  if (!me) throw new Error('Please sign in first.');
  if (!target || me === target) throw new Error('Cannot follow yourself.');

  const { db, currentUser } = await getSocialGraphRuntime();
  await assertNotBlockedLocally(me, target, db);

  const followRef = doc(db, 'follows', getFollowDocId(me, target));
  const meProfileRef = doc(db, 'publicProfiles', me);
  const targetProfileRef = doc(db, 'publicProfiles', target);
  const mePrivateRef = doc(db, 'users', me);
  const notifRef = doc(db, 'notifications', `follow_${me}_${target}`);

  await runTransaction(db, async (tx) => {
    const [followSnap, meProfileSnap, targetProfileSnap, notifSnap] = await Promise.all([
      tx.get(followRef),
      tx.get(meProfileRef),
      tx.get(targetProfileRef),
      tx.get(notifRef),
    ]);

    if (followSnap.exists()) {
      throw new Error('You are already following this user.');
    }

    const meData = meProfileSnap.exists() ? meProfileSnap.data() : null;
    const targetData = targetProfileSnap.exists() ? targetProfileSnap.data() : null;
    const nowIso = new Date().toISOString();

    const resolvedActorName =
      String(
        actorInfo?.displayName ||
          meData?.displayName ||
          meData?.name ||
          currentUser?.displayName ||
          'KING Creator'
      )
        .trim()
        .slice(0, 100) || 'KING Creator';
    const resolvedActorPhoto =
      cleanProfilePhoto(actorInfo?.photoURL || meData?.photoURL || currentUser?.photoURL) ||
      '';

    tx.set(followRef, {
      followerUid: me,
      targetUid: target,
      createdAt: serverTimestamp(),
    });

    tx.set(
      mePrivateRef,
      {
        uid: me,
        _socialSyncUid: target,
      },
      { merge: true }
    );

    const nextMeFollowing = parseSafeCounter(meData?.followingCount) + 1;
    if (meProfileSnap.exists()) {
      tx.update(meProfileRef, {
        followingCount: nextMeFollowing,
        updatedAt: nowIso,
      });
    } else {
      tx.set(meProfileRef, {
        uid: me,
        displayName: resolvedActorName,
        name: resolvedActorName,
        displayNameLower: resolvedActorName.toLowerCase(),
        photoURL: resolvedActorPhoto,
        followersCount: 0,
        followingCount: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    const nextTargetFollowers = parseSafeCounter(targetData?.followersCount) + 1;
    if (targetProfileSnap.exists()) {
      tx.update(targetProfileRef, {
        followersCount: nextTargetFollowers,
        updatedAt: nowIso,
      });
    } else {
      tx.set(targetProfileRef, {
        uid: target,
        followersCount: 1,
        followingCount: 0,
        updatedAt: nowIso,
      });
    }

    const expiresAt = Timestamp.fromMillis(Date.now() + FOLLOW_NOTIF_TTL_MS);
    const notifTitle = `${resolvedActorName.slice(0, 80)} started following you`;
    const notifBody = 'Tap to view their KING profile.';

    if (!notifSnap.exists()) {
      tx.set(notifRef, {
        recipientUid: target,
        actorUid: me,
        actorName: resolvedActorName,
        actorPhoto: resolvedActorPhoto.slice(0, 1000),
        type: 'new_follower',
        title: notifTitle,
        body: notifBody,
        read: false,
        createdAt: serverTimestamp(),
        expiresAt,
      });
    } else {
      const prevCreatedMs = toTimestampMs(notifSnap.data()?.createdAt);
      if (prevCreatedMs > 0 && Date.now() - prevCreatedMs > FOLLOW_NOTIF_COOLDOWN_MS) {
        tx.update(notifRef, {
          actorName: resolvedActorName,
          actorPhoto: resolvedActorPhoto.slice(0, 1000),
          title: notifTitle,
          body: notifBody,
          read: false,
          createdAt: serverTimestamp(),
          expiresAt,
        });
      }
    }
  });
}

/**
 * Unfollow a user atomically and decrement both publicProfiles counters (clamped >= 0).
 */
export async function unfollowUser(currentUid: string, targetUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const target = sanitizeUid(targetUid);
  if (!me) throw new Error('Please sign in first.');
  if (!target || me === target) throw new Error('Invalid target user.');

  const { db } = await getSocialGraphRuntime();
  const followRef = doc(db, 'follows', getFollowDocId(me, target));
  const meProfileRef = doc(db, 'publicProfiles', me);
  const targetProfileRef = doc(db, 'publicProfiles', target);
  const mePrivateRef = doc(db, 'users', me);

  await runTransaction(db, async (tx) => {
    const [followSnap, meProfileSnap, targetProfileSnap] = await Promise.all([
      tx.get(followRef),
      tx.get(meProfileRef),
      tx.get(targetProfileRef),
    ]);

    if (!followSnap.exists()) return;

    const nowIso = new Date().toISOString();
    tx.delete(followRef);

    tx.set(
      mePrivateRef,
      {
        uid: me,
        _socialSyncUid: target,
      },
      { merge: true }
    );

    if (meProfileSnap.exists()) {
      const curFollowing = parseSafeCounter(meProfileSnap.data()?.followingCount);
      tx.update(meProfileRef, {
        followingCount: Math.max(0, curFollowing - 1),
        updatedAt: nowIso,
      });
    }

    if (targetProfileSnap.exists()) {
      const curFollowers = parseSafeCounter(targetProfileSnap.data()?.followersCount);
      tx.update(targetProfileRef, {
        followersCount: Math.max(0, curFollowers - 1),
        updatedAt: nowIso,
      });
    }
  });
}

/**
 * Remove someone who follows you atomically and decrement both publicProfiles counters (clamped >= 0).
 */
export async function removeFollower(currentUid: string, followerUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const follower = sanitizeUid(followerUid);
  if (!me) throw new Error('Please sign in first.');
  if (!follower || me === follower) throw new Error('Invalid user.');

  const { db } = await getSocialGraphRuntime();
  const followRef = doc(db, 'follows', getFollowDocId(follower, me));
  const meProfileRef = doc(db, 'publicProfiles', me);
  const followerProfileRef = doc(db, 'publicProfiles', follower);
  const mePrivateRef = doc(db, 'users', me);

  await runTransaction(db, async (tx) => {
    const [followSnap, meProfileSnap, followerProfileSnap] = await Promise.all([
      tx.get(followRef),
      tx.get(meProfileRef),
      tx.get(followerProfileRef),
    ]);

    if (!followSnap.exists()) return;

    const nowIso = new Date().toISOString();
    tx.delete(followRef);

    tx.set(
      mePrivateRef,
      {
        uid: me,
        _socialSyncUid: follower,
      },
      { merge: true }
    );

    if (meProfileSnap.exists()) {
      const curFollowers = parseSafeCounter(meProfileSnap.data()?.followersCount);
      tx.update(meProfileRef, {
        followersCount: Math.max(0, curFollowers - 1),
        updatedAt: nowIso,
      });
    }

    if (followerProfileSnap.exists()) {
      const curFollowing = parseSafeCounter(followerProfileSnap.data()?.followingCount);
      tx.update(followerProfileRef, {
        followingCount: Math.max(0, curFollowing - 1),
        updatedAt: nowIso,
      });
    }
  });
}

/**
 * Block a user atomically:
 * 1. Creates blocks/{blockerUid}_{blockedUid}
 * 2. Deletes any existing friendship / pending request between them
 * 3. Deletes follow edges in both directions and cleanly decrements affected counters
 */
export async function blockUser(currentUid: string, targetUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const target = sanitizeUid(targetUid);
  if (!me) throw new Error('Please sign in first.');
  if (!target || me === target) throw new Error('Cannot block yourself.');

  const { db } = await getSocialGraphRuntime();
  const blockRef = doc(db, 'blocks', getBlockDocId(me, target));
  const friendshipRef = doc(db, 'friendships', getFriendshipPairId(me, target));
  const myFollowRef = doc(db, 'follows', getFollowDocId(me, target));
  const theirFollowRef = doc(db, 'follows', getFollowDocId(target, me));
  const meProfileRef = doc(db, 'publicProfiles', me);
  const targetProfileRef = doc(db, 'publicProfiles', target);
  const mePrivateRef = doc(db, 'users', me);

  await runTransaction(db, async (tx) => {
    const [
      blockSnap,
      friendshipSnap,
      myFollowSnap,
      theirFollowSnap,
      meProfileSnap,
      targetProfileSnap,
    ] = await Promise.all([
      tx.get(blockRef),
      tx.get(friendshipRef),
      tx.get(myFollowRef),
      tx.get(theirFollowRef),
      tx.get(meProfileRef),
      tx.get(targetProfileRef),
    ]);

    if (!blockSnap.exists()) {
      tx.set(blockRef, {
        blockerUid: me,
        blockedUid: target,
        createdAt: serverTimestamp(),
      });
    }
    if (friendshipSnap.exists()) {
      tx.delete(friendshipRef);
    }

    const hadMyFollow = myFollowSnap.exists();
    const hadTheirFollow = theirFollowSnap.exists();

    if (hadMyFollow) {
      tx.delete(myFollowRef);
    }
    if (hadTheirFollow) {
      tx.delete(theirFollowRef);
    }

    if (hadMyFollow || hadTheirFollow) {
      const nowIso = new Date().toISOString();
      tx.set(
        mePrivateRef,
        {
          uid: me,
          _socialSyncUid: target,
        },
        { merge: true }
      );

      if (meProfileSnap.exists()) {
        const meData = meProfileSnap.data();
        const meUpdate: Record<string, any> = { updatedAt: nowIso };
        if (hadMyFollow) {
          meUpdate.followingCount = Math.max(0, parseSafeCounter(meData?.followingCount) - 1);
        }
        if (hadTheirFollow) {
          meUpdate.followersCount = Math.max(0, parseSafeCounter(meData?.followersCount) - 1);
        }
        tx.update(meProfileRef, meUpdate);
      }

      if (targetProfileSnap.exists()) {
        const targetData = targetProfileSnap.data();
        const targetUpdate: Record<string, any> = { updatedAt: nowIso };
        if (hadMyFollow) {
          targetUpdate.followersCount = Math.max(
            0,
            parseSafeCounter(targetData?.followersCount) - 1
          );
        }
        if (hadTheirFollow) {
          targetUpdate.followingCount = Math.max(
            0,
            parseSafeCounter(targetData?.followingCount) - 1
          );
        }
        tx.update(targetProfileRef, targetUpdate);
      }
    }
  });
}

export async function unblockUser(currentUid: string, targetUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const target = sanitizeUid(targetUid);
  if (!me) throw new Error('Please sign in first.');
  if (!target || me === target) throw new Error('Invalid user.');

  const { db } = await getSocialGraphRuntime();
  const blockRef = doc(db, 'blocks', getBlockDocId(me, target));
  await deleteDoc(blockRef);
}

/**
 * Subscribe to all friendship & request docs where current user is a participant (bounded).
 */
export function subscribeMyFriendships(
  uid: string,
  onChange: (records: FriendshipRecord[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const safeUid = sanitizeUid(uid);
  if (!safeUid) {
    onChange([]);
    return () => {};
  }

  return attachWithRuntime((db) => {
    const q = query(
      collection(db, 'friendships'),
      where('users', 'array-contains', safeUid),
      limit(100)
    );
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FriendshipRecord, 'id'>),
        }));
        onChange(items);
      },
      (err) => {
        console.warn('[socialGraphService] subscribeMyFriendships notice:', err?.message || err);
        onError?.(err);
      }
    );
  }, onError);
}

/**
 * Subscribe to the current user's recent followers (ordered newest-first, bounded for real-time responsiveness).
 */
export function subscribeMyFollowers(
  uid: string,
  onChange: (records: FollowRecord[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const safeUid = sanitizeUid(uid);
  if (!safeUid) {
    onChange([]);
    return () => {};
  }

  return attachWithRuntime((db) => {
    let active = true;
    let unsub: () => void = () => {};

    const start = (ordered: boolean) => {
      if (!active) return;
      const q = ordered
        ? query(
            collection(db, 'follows'),
            where('targetUid', '==', safeUid),
            orderBy('createdAt', 'desc'),
            limit(50)
          )
        : query(collection(db, 'follows'), where('targetUid', '==', safeUid), limit(50));

      unsub = onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<FollowRecord, 'id'>),
          }));
          items.sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));
          onChange(items);
        },
        (err: any) => {
          if (ordered && err?.code === 'failed-precondition') {
            unsub();
            start(false);
            return;
          }
          console.warn('[socialGraphService] subscribeMyFollowers notice:', err?.message || err);
          onError?.(err);
        }
      );
    };

    start(true);
    return () => {
      active = false;
      unsub();
    };
  }, onError);
}

/**
 * Subscribe to accounts the current user is following (ordered newest-first, bounded for real-time responsiveness).
 */
export function subscribeMyFollowing(
  uid: string,
  onChange: (records: FollowRecord[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const safeUid = sanitizeUid(uid);
  if (!safeUid) {
    onChange([]);
    return () => {};
  }

  return attachWithRuntime((db) => {
    let active = true;
    let unsub: () => void = () => {};

    const start = (ordered: boolean) => {
      if (!active) return;
      const q = ordered
        ? query(
            collection(db, 'follows'),
            where('followerUid', '==', safeUid),
            orderBy('createdAt', 'desc'),
            limit(50)
          )
        : query(collection(db, 'follows'), where('followerUid', '==', safeUid), limit(50));

      unsub = onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<FollowRecord, 'id'>),
          }));
          items.sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));
          onChange(items);
        },
        (err: any) => {
          if (ordered && err?.code === 'failed-precondition') {
            unsub();
            start(false);
            return;
          }
          console.warn('[socialGraphService] subscribeMyFollowing notice:', err?.message || err);
          onError?.(err);
        }
      );
    };

    start(true);
    return () => {
      active = false;
      unsub();
    };
  }, onError);
}

/**
 * Subscribe to the current user's block list (where blockerUid == uid).
 */
export function subscribeMyBlockedUsers(
  uid: string,
  onChange: (records: BlockRecord[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const safeUid = sanitizeUid(uid);
  if (!safeUid) {
    onChange([]);
    return () => {};
  }

  return attachWithRuntime((db) => {
    const q = query(collection(db, 'blocks'), where('blockerUid', '==', safeUid), limit(100));
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<BlockRecord, 'id'>),
        }));
        onChange(items);
      },
      (err) => {
        console.warn('[socialGraphService] subscribeMyBlockedUsers notice:', err?.message || err);
        onError?.(err);
      }
    );
  }, onError);
}

/**
 * Subscribe to real-time relationship state between myUid and targetUid.
 */
export function subscribeRelationshipWithUser(
  myUid: string,
  targetUid: string,
  onChange: (rel: RelationshipWithUser) => void
): () => void {
  const me = sanitizeUid(myUid);
  const target = sanitizeUid(targetUid);
  const emptyRel: RelationshipWithUser = {
    friendState: 'none',
    friendshipId: null,
    isFollowing: false,
    isFollowedBy: false,
    isBlockedByMe: false,
  };

  if (!me || !target || me === target) {
    onChange(emptyRel);
    return () => {};
  }

  return attachWithRuntime((db) => {
    let current: RelationshipWithUser = { ...emptyRel };
    const emit = () => onChange({ ...current });

    const friendshipRef = doc(db, 'friendships', getFriendshipPairId(me, target));
    const myFollowRef = doc(db, 'follows', getFollowDocId(me, target));
    const theirFollowRef = doc(db, 'follows', getFollowDocId(target, me));
    const myBlockRef = doc(db, 'blocks', getBlockDocId(me, target));

    const unsubFriendship = onSnapshot(
      friendshipRef,
      (snap) => {
        if (!snap.exists()) {
          current = { ...current, friendState: 'none', friendshipId: null };
        } else {
          const data = snap.data() as FriendshipRecord;
          if (data.status === 'accepted') {
            current = { ...current, friendState: 'friends', friendshipId: snap.id };
          } else if (data.requestedBy === me) {
            current = { ...current, friendState: 'outgoing_pending', friendshipId: snap.id };
          } else {
            current = { ...current, friendState: 'incoming_pending', friendshipId: snap.id };
          }
        }
        emit();
      },
      (err) => {
        console.warn('[socialGraphService] friendship listener notice:', err?.message || err);
      }
    );

    const unsubMyFollow = onSnapshot(
      myFollowRef,
      (snap) => {
        current = { ...current, isFollowing: snap.exists() };
        emit();
      },
      (err) => {
        console.warn('[socialGraphService] myFollow listener notice:', err?.message || err);
      }
    );

    const unsubTheirFollow = onSnapshot(
      theirFollowRef,
      (snap) => {
        current = { ...current, isFollowedBy: snap.exists() };
        emit();
      },
      (err) => {
        console.warn('[socialGraphService] theirFollow listener notice:', err?.message || err);
      }
    );

    const unsubBlock = onSnapshot(
      myBlockRef,
      (snap) => {
        current = { ...current, isBlockedByMe: snap.exists() };
        emit();
      },
      (err) => {
        console.warn('[socialGraphService] myBlock listener notice:', err?.message || err);
      }
    );

    return () => {
      unsubFriendship();
      unsubMyFollow();
      unsubTheirFollow();
      unsubBlock();
    };
  });
}

/**
 * Batch-fetch publicProfiles documents by UIDs (chunks of 25 using documentId() IN).
 */
export async function fetchPublicProfilesByUids(
  uids: string[]
): Promise<Record<string, SocialUserProfile>> {
  const uniqueUids = Array.from(new Set(uids.map((u) => sanitizeUid(u)).filter(Boolean)));
  const map: Record<string, SocialUserProfile> = {};
  if (uniqueUids.length === 0) return map;

  const { db } = await getSocialGraphRuntime();
  const chunkSize = 25;
  for (let i = 0; i < uniqueUids.length; i += chunkSize) {
    const chunk = uniqueUids.slice(i, i + chunkSize);
    try {
      const snap = await getDocs(
        query(collection(db, 'publicProfiles'), where(documentId(), 'in', chunk))
      );
      snap.forEach((d) => {
        map[d.id] = mapDocToSocialProfile(d.id, d.data());
      });
    } catch (err) {
      console.warn('[socialGraphService] fetchPublicProfilesByUids chunk notice:', err);
    }
  }

  for (const uid of uniqueUids) {
    if (!map[uid]) {
      map[uid] = {
        uid,
        displayName: `Creator ${uid.slice(0, 6)}`,
        photoURL: null,
        followersCount: 0,
        followingCount: 0,
      };
    }
  }

  return map;
}

/**
 * Batch-check follow edges in both directions between myUid and a page of target UIDs
 * so list rows accurately render Follow / Follow Back / Following without N+1 reads.
 */
export async function fetchMyFollowEdgesForTargets(
  myUid: string | null | undefined,
  targetUids: string[]
): Promise<BatchFollowEdges> {
  const followingSet = new Set<string>();
  const followedBySet = new Set<string>();
  const me = sanitizeUid(myUid || '');
  const cleanTargets = Array.from(
    new Set(targetUids.map((u) => sanitizeUid(u)).filter((u) => Boolean(u) && u !== me))
  );

  if (!me || cleanTargets.length === 0) {
    return { followingSet, followedBySet };
  }

  const { db } = await getSocialGraphRuntime();
  const myToTargetIds = cleanTargets.map((t) => `${me}_${t}`);
  const targetToMeIds = cleanTargets.map((t) => `${t}_${me}`);

  const chunkSize = 25;
  const runBatchCheck = async (ids: string[], onFound: (data: DocumentData) => void) => {
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      try {
        const snap = await getDocs(
          query(collection(db, 'follows'), where(documentId(), 'in', chunk))
        );
        snap.forEach((d) => onFound(d.data()));
      } catch (err) {
        console.warn('[socialGraphService] fetchMyFollowEdgesForTargets notice:', err);
      }
    }
  };

  await Promise.all([
    runBatchCheck(myToTargetIds, (data) => {
      const t = sanitizeUid(data?.targetUid);
      if (t) followingSet.add(t);
    }),
    runBatchCheck(targetToMeIds, (data) => {
      const f = sanitizeUid(data?.followerUid);
      if (f) followedBySet.add(f);
    }),
  ]);

  return { followingSet, followedBySet };
}

/**
 * Cursor-paginated Followers list for any profile UID (25 per page).
 * Falls back gracefully to unordered bounded query if composite index is not yet deployed.
 */
export async function fetchFollowersPage(
  targetUid: string,
  pageSize = FOLLOW_LIST_PAGE_DEFAULT,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null
): Promise<FollowListPageResult> {
  const safeUid = sanitizeUid(targetUid);
  if (!safeUid) return { items: [], nextCursor: null, hasMore: false };

  const { db } = await getSocialGraphRuntime();
  let docs: QueryDocumentSnapshot<DocumentData>[] = [];
  let usedIndexedSort = true;

  try {
    const q = cursor
      ? query(
          collection(db, 'follows'),
          where('targetUid', '==', safeUid),
          orderBy('createdAt', 'desc'),
          startAfter(cursor),
          limit(pageSize + 1)
        )
      : query(
          collection(db, 'follows'),
          where('targetUid', '==', safeUid),
          orderBy('createdAt', 'desc'),
          limit(pageSize + 1)
        );
    const snap = await getDocs(q);
    docs = snap.docs;
  } catch (err: any) {
    if (err?.code === 'failed-precondition') {
      usedIndexedSort = false;
      const fallbackQ = cursor
        ? query(
            collection(db, 'follows'),
            where('targetUid', '==', safeUid),
            startAfter(cursor),
            limit(pageSize + 1)
          )
        : query(
            collection(db, 'follows'),
            where('targetUid', '==', safeUid),
            limit(pageSize + 1)
          );
      const snap = await getDocs(fallbackQ);
      docs = snap.docs;
    } else {
      throw err;
    }
  }

  const hasMore = docs.length > pageSize;
  const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
  const nextCursor = hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

  const followerUids = pageDocs.map((d) => sanitizeUid(d.data()?.followerUid)).filter(Boolean);
  const profilesMap = await fetchPublicProfilesByUids(followerUids);

  const items: FollowListPageItem[] = pageDocs
    .map((d) => {
      const uid = sanitizeUid(d.data()?.followerUid);
      if (!uid) return null;
      return {
        followId: d.id,
        uid,
        createdAtMs: toTimestampMs(d.data()?.createdAt),
        profile: profilesMap[uid] || {
          uid,
          displayName: `Creator ${uid.slice(0, 6)}`,
          photoURL: null,
        },
      };
    })
    .filter((item): item is FollowListPageItem => Boolean(item));

  if (!usedIndexedSort) {
    items.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  return { items, nextCursor, hasMore };
}

/**
 * Cursor-paginated Following list for any profile UID (25 per page).
 * Falls back gracefully to unordered bounded query if composite index is not yet deployed.
 */
export async function fetchFollowingPage(
  followerUid: string,
  pageSize = FOLLOW_LIST_PAGE_DEFAULT,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null
): Promise<FollowListPageResult> {
  const safeUid = sanitizeUid(followerUid);
  if (!safeUid) return { items: [], nextCursor: null, hasMore: false };

  const { db } = await getSocialGraphRuntime();
  let docs: QueryDocumentSnapshot<DocumentData>[] = [];
  let usedIndexedSort = true;

  try {
    const q = cursor
      ? query(
          collection(db, 'follows'),
          where('followerUid', '==', safeUid),
          orderBy('createdAt', 'desc'),
          startAfter(cursor),
          limit(pageSize + 1)
        )
      : query(
          collection(db, 'follows'),
          where('followerUid', '==', safeUid),
          orderBy('createdAt', 'desc'),
          limit(pageSize + 1)
        );
    const snap = await getDocs(q);
    docs = snap.docs;
  } catch (err: any) {
    if (err?.code === 'failed-precondition') {
      usedIndexedSort = false;
      const fallbackQ = cursor
        ? query(
            collection(db, 'follows'),
            where('followerUid', '==', safeUid),
            startAfter(cursor),
            limit(pageSize + 1)
          )
        : query(
            collection(db, 'follows'),
            where('followerUid', '==', safeUid),
            limit(pageSize + 1)
          );
      const snap = await getDocs(fallbackQ);
      docs = snap.docs;
    } else {
      throw err;
    }
  }

  const hasMore = docs.length > pageSize;
  const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
  const nextCursor = hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

  const targetUids = pageDocs.map((d) => sanitizeUid(d.data()?.targetUid)).filter(Boolean);
  const profilesMap = await fetchPublicProfilesByUids(targetUids);

  const items: FollowListPageItem[] = pageDocs
    .map((d) => {
      const uid = sanitizeUid(d.data()?.targetUid);
      if (!uid) return null;
      return {
        followId: d.id,
        uid,
        createdAtMs: toTimestampMs(d.data()?.createdAt),
        profile: profilesMap[uid] || {
          uid,
          displayName: `Creator ${uid.slice(0, 6)}`,
          photoURL: null,
        },
      };
    })
    .filter((item): item is FollowListPageItem => Boolean(item));

  if (!usedIndexedSort) {
    items.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  return { items, nextCursor, hasMore };
}

/**
 * Load public user profiles (bounded).
 */
export async function fetchDiscoverableUsers(
  excludeUid?: string | null,
  maxItems = 30
): Promise<SocialUserProfile[]> {
  const { db } = await getSocialGraphRuntime();
  const safeExclude = sanitizeUid(excludeUid || '');
  const q = query(collection(db, 'publicProfiles'), limit(maxItems));
  const snap = await getDocs(q);
  const results: SocialUserProfile[] = [];

  for (const d of snap.docs) {
    const data = d.data();
    const uid = sanitizeUid(data.uid || d.id);
    if (!uid || (safeExclude && uid === safeExclude)) continue;
    results.push(mapDocToSocialProfile(uid, data));
  }

  return results;
}

/**
 * Indexed prefix search across usernameLower and displayNameLower (with legacy displayName fallback).
 * Strictly bounded by limit(maxResults) without loading the entire user collection.
 */
export async function searchUsersPaged(
  rawQuery: string,
  excludeUid?: string | null,
  maxResults = 20
): Promise<SocialUserProfile[]> {
  const needle = rawQuery.trim().replace(/^@+/, '').toLowerCase();
  const safeExclude = sanitizeUid(excludeUid || '');
  if (!needle) {
    return fetchDiscoverableUsers(safeExclude, maxResults);
  }

  const { db } = await getSocialGraphRuntime();
  const endNeedle = `${needle}\uf8ff`;
  const titleNeedle =
    needle.charAt(0).toUpperCase() + needle.slice(1);
  const endTitleNeedle = `${titleNeedle}\uf8ff`;

  const queries = [
    getDocs(
      query(
        collection(db, 'publicProfiles'),
        where('usernameLower', '>=', needle),
        where('usernameLower', '<=', endNeedle),
        orderBy('usernameLower'),
        limit(maxResults)
      )
    ).catch(() => null),
    getDocs(
      query(
        collection(db, 'publicProfiles'),
        where('displayNameLower', '>=', needle),
        where('displayNameLower', '<=', endNeedle),
        orderBy('displayNameLower'),
        limit(maxResults)
      )
    ).catch(() => null),
    getDocs(
      query(
        collection(db, 'publicProfiles'),
        where('displayName', '>=', titleNeedle),
        where('displayName', '<=', endTitleNeedle),
        orderBy('displayName'),
        limit(maxResults)
      )
    ).catch(() => null),
  ];

  const snapshots = await Promise.all(queries);
  const byUid = new Map<string, SocialUserProfile>();

  for (const snap of snapshots) {
    if (!snap) continue;
    snap.forEach((d) => {
      const uid = sanitizeUid(d.data()?.uid || d.id);
      if (!uid || (safeExclude && uid === safeExclude)) return;
      if (!byUid.has(uid)) {
        byUid.set(uid, mapDocToSocialProfile(uid, d.data()));
      }
    });
  }

  const ranked = Array.from(byUid.values());
  ranked.sort((a, b) => {
    const aUser = (a.usernameLower || '').toLowerCase();
    const bUser = (b.usernameLower || '').toLowerCase();
    const aExact = aUser === needle ? 2 : aUser.startsWith(needle) ? 1 : 0;
    const bExact = bUser === needle ? 2 : bUser.startsWith(needle) ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return (b.followersCount || 0) - (a.followersCount || 0);
  });

  return ranked.slice(0, maxResults);
}

/**
 * Pure validator/normalizer for Status Privacy Settings.
 */
export function normalizeStatusPrivacy(
  raw: Partial<StatusPrivacySettings> | null | undefined,
  selfUid?: string | null,
  blockedUids: string[] = []
): StatusPrivacySettings {
  const rawVis = raw?.visibility;
  const visibility: StatusPrivacyMode =
    rawVis && (VALID_STATUS_PRIVACY_MODES as readonly string[]).includes(rawVis)
      ? rawVis
      : DEFAULT_STATUS_PRIVACY.visibility;

  const self = sanitizeUid(selfUid || '');
  const blockedSet = new Set(blockedUids.map((id) => sanitizeUid(id)).filter(Boolean));

  const cleanList = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    for (const item of arr) {
      const uid = sanitizeUid(item);
      if (!uid || uid === self || blockedSet.has(uid)) continue;
      seen.add(uid);
      if (seen.size >= MAX_PRIVACY_UID_LIST) break;
    }
    return Array.from(seen);
  };

  return {
    visibility,
    selectedUids: cleanList(raw?.selectedUids),
    exceptUids: cleanList(raw?.exceptUids),
    ...(typeof raw?.updatedAt === 'string' ? { updatedAt: raw.updatedAt } : {}),
  };
}

/**
 * Subscribe to the signed-in user's private Status Privacy Settings stored on users/{uid}.
 */
export function subscribeStatusPrivacy(
  uid: string,
  onChange: (settings: StatusPrivacySettings) => void,
  onError?: (err: unknown) => void
): () => void {
  const safeUid = sanitizeUid(uid);
  if (!safeUid) {
    onChange(DEFAULT_STATUS_PRIVACY);
    return () => {};
  }

  return attachWithRuntime((db) => {
    const userRef = doc(db, 'users', safeUid);
    return onSnapshot(
      userRef,
      (snap) => {
        if (!snap.exists()) {
          onChange(DEFAULT_STATUS_PRIVACY);
          return;
        }
        const data = snap.data();
        onChange(normalizeStatusPrivacy(data?.statusPrivacy, safeUid));
      },
      (err) => {
        console.warn('[socialGraphService] subscribeStatusPrivacy notice:', err?.message || err);
        onError?.(err);
      }
    );
  }, onError);
}

/**
 * Persist Status Privacy Settings on the user's private users/{uid} document.
 */
export async function saveStatusPrivacy(
  uid: string,
  settings: StatusPrivacySettings,
  blockedUids: string[] = []
): Promise<StatusPrivacySettings> {
  const safeUid = sanitizeUid(uid);
  if (!safeUid) {
    throw new Error('Please sign in to save privacy settings.');
  }

  const normalized = normalizeStatusPrivacy(
    {
      ...settings,
      updatedAt: new Date().toISOString(),
    },
    safeUid,
    blockedUids
  );

  const { db } = await getSocialGraphRuntime();
  await setDoc(
    doc(db, 'users', safeUid),
    {
      uid: safeUid,
      statusPrivacy: normalized,
      lastUpdated: new Date().toISOString(),
    },
    { merge: true }
  );

  return normalized;
}
