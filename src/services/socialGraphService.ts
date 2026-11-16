import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
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

export const MAX_PRIVACY_UID_LIST = 200;

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

export function sanitizeUid(uid: unknown): string {
  if (typeof uid !== 'string') return '';
  const trimmed = uid.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(trimmed)) return '';
  return trimmed;
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

export function resolveSocialErrorMessage(error: unknown, fallback = 'Action could not be completed.'): string {
  const code = (error as any)?.code || '';
  const message = (error as any)?.message || '';

  if (code === 'permission-denied' || message.includes('Missing or insufficient permissions')) {
    return 'Action blocked by security rules (user may have blocked you, or Firestore rules need deployment).';
  }
  if (code === 'unauthenticated') {
    return 'Please sign in to perform this action.';
  }
  if (message && typeof message === 'string') {
    return message;
  }
  return fallback;
}

async function assertNotBlockedLocally(currentUid: string, targetUid: string): Promise<void> {
  const myBlockRef = doc(db, 'blocks', getBlockDocId(currentUid, targetUid));
  const myBlockSnap = await getDoc(myBlockRef);
  if (myBlockSnap.exists()) {
    throw new Error('You blocked this user. Unblock them first to interact.');
  }
}

/**
 * Send a friend request using a deterministic canonical document ID (minUid_maxUid)
 * inside a Firestore transaction to prevent duplicates or simultaneous reverse requests.
 * Blocked checks are also enforced server-side in firestore.rules.
 */
export async function sendFriendRequest(currentUid: string, targetUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const target = sanitizeUid(targetUid);
  if (!me) throw new Error('Please sign in first.');
  if (!target || me === target) throw new Error('Invalid target user.');

  await assertNotBlockedLocally(me, target);

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

/**
 * Accept an incoming friend request. Only the target recipient can accept.
 */
export async function acceptFriendRequest(currentUid: string, requesterUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const requester = sanitizeUid(requesterUid);
  if (!me) throw new Error('Please sign in first.');
  if (!requester || me === requester) throw new Error('Invalid user.');

  await assertNotBlockedLocally(me, requester);

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

/**
 * Reject an incoming friend request. Only the recipient can reject.
 */
export async function rejectFriendRequest(currentUid: string, requesterUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const requester = sanitizeUid(requesterUid);
  if (!me) throw new Error('Please sign in first.');
  if (!requester || me === requester) throw new Error('Invalid user.');

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

/**
 * Cancel an outgoing friend request. Only the requester can cancel.
 */
export async function cancelFriendRequest(currentUid: string, targetUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const target = sanitizeUid(targetUid);
  if (!me) throw new Error('Please sign in first.');
  if (!target || me === target) throw new Error('Invalid user.');

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

/**
 * Remove an existing friend. Either participant in the accepted friendship can remove it.
 */
export async function removeFriend(currentUid: string, friendUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const friend = sanitizeUid(friendUid);
  if (!me) throw new Error('Please sign in first.');
  if (!friend || me === friend) throw new Error('Invalid user.');

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
 * Follow another user using deterministic doc ID (followerUid_targetUid)
 * to guarantee no duplicate follow edges.
 */
export async function followUser(currentUid: string, targetUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const target = sanitizeUid(targetUid);
  if (!me) throw new Error('Please sign in first.');
  if (!target || me === target) throw new Error('Cannot follow yourself.');

  await assertNotBlockedLocally(me, target);

  const followRef = doc(db, 'follows', getFollowDocId(me, target));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(followRef);
    if (snap.exists()) {
      throw new Error('You are already following this user.');
    }
    tx.set(followRef, {
      followerUid: me,
      targetUid: target,
      createdAt: serverTimestamp(),
    });
  });
}

/**
 * Unfollow a user you currently follow.
 */
export async function unfollowUser(currentUid: string, targetUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const target = sanitizeUid(targetUid);
  if (!me) throw new Error('Please sign in first.');
  if (!target || me === target) throw new Error('Invalid target user.');

  const followRef = doc(db, 'follows', getFollowDocId(me, target));
  await deleteDoc(followRef);
}

/**
 * Remove someone who follows you (targetUid deletes followerUid_targetUid).
 */
export async function removeFollower(currentUid: string, followerUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const follower = sanitizeUid(followerUid);
  if (!me) throw new Error('Please sign in first.');
  if (!follower || me === follower) throw new Error('Invalid user.');

  const followRef = doc(db, 'follows', getFollowDocId(follower, me));
  await deleteDoc(followRef);
}

/**
 * Block a user atomically:
 * 1. Creates blocks/{blockerUid}_{blockedUid}
 * 2. Deletes any existing friendship / pending request between them
 * 3. Deletes follow edges in both directions
 */
export async function blockUser(currentUid: string, targetUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const target = sanitizeUid(targetUid);
  if (!me) throw new Error('Please sign in first.');
  if (!target || me === target) throw new Error('Cannot block yourself.');

  const blockRef = doc(db, 'blocks', getBlockDocId(me, target));
  const friendshipRef = doc(db, 'friendships', getFriendshipPairId(me, target));
  const myFollowRef = doc(db, 'follows', getFollowDocId(me, target));
  const theirFollowRef = doc(db, 'follows', getFollowDocId(target, me));

  await runTransaction(db, async (tx) => {
    // All reads before writes
    const [blockSnap, friendshipSnap, myFollowSnap, theirFollowSnap] = await Promise.all([
      tx.get(blockRef),
      tx.get(friendshipRef),
      tx.get(myFollowRef),
      tx.get(theirFollowRef),
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
    if (myFollowSnap.exists()) {
      tx.delete(myFollowRef);
    }
    if (theirFollowSnap.exists()) {
      tx.delete(theirFollowRef);
    }
  });
}

/**
 * Unblock a previously blocked user.
 */
export async function unblockUser(currentUid: string, targetUid: string): Promise<void> {
  const me = sanitizeUid(currentUid);
  const target = sanitizeUid(targetUid);
  if (!me) throw new Error('Please sign in first.');
  if (!target || me === target) throw new Error('Invalid user.');

  const blockRef = doc(db, 'blocks', getBlockDocId(me, target));
  await deleteDoc(blockRef);
}

/**
 * Subscribe to all friendship & request docs where current user is a participant.
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

  const q = query(collection(db, 'friendships'), where('users', 'array-contains', safeUid));
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
}

/**
 * Subscribe to the current user's followers list (where targetUid == uid).
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

  const q = query(collection(db, 'follows'), where('targetUid', '==', safeUid));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FollowRecord, 'id'>),
      }));
      onChange(items);
    },
    (err) => {
      console.warn('[socialGraphService] subscribeMyFollowers notice:', err?.message || err);
      onError?.(err);
    }
  );
}

/**
 * Subscribe to accounts the current user is following (where followerUid == uid).
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

  const q = query(collection(db, 'follows'), where('followerUid', '==', safeUid));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FollowRecord, 'id'>),
      }));
      onChange(items);
    },
    (err) => {
      console.warn('[socialGraphService] subscribeMyFollowing notice:', err?.message || err);
      onError?.(err);
    }
  );
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

  const q = query(collection(db, 'blocks'), where('blockerUid', '==', safeUid));
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
}

/**
 * Subscribe to real-time relationship state between myUid and targetUid.
 * Note: intentionally does NOT read blocks/{targetUid}_{myUid} so blocked status from
 * another user remains private; block enforcement is guaranteed by Firestore rules.
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
}

/**
 * Load public user profiles (publicProfiles collection already allows public read).
 * Excludes sensitive private fields.
 */
export async function fetchDiscoverableUsers(
  excludeUid?: string | null,
  maxItems = 50
): Promise<SocialUserProfile[]> {
  const safeExclude = sanitizeUid(excludeUid || '');
  const q = query(collection(db, 'publicProfiles'), limit(maxItems));
  const snap = await getDocs(q);
  const results: SocialUserProfile[] = [];

  for (const d of snap.docs) {
    const data = d.data();
    const uid = sanitizeUid(data.uid || d.id);
    if (!uid || (safeExclude && uid === safeExclude)) continue;
    results.push({
      uid,
      displayName: String(data.displayName || data.name || 'KING Creator').trim() || 'KING Creator',
      photoURL: cleanProfilePhoto(data.photoURL),
    });
  }

  return results;
}

/**
 * Pure validator/normalizer for Status Privacy Settings (for Phase 2 readiness).
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
