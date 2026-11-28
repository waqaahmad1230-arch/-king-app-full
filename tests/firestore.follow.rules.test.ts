import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getApps } from 'firebase/app';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  claimUsername,
  ensureDefaultUsername,
  fetchFollowersPage,
  fetchFollowingPage,
  fetchMyFollowEdgesForTargets,
  followUser,
  getBlockDocId,
  getFollowDocId,
  getFriendshipPairId,
  getSortedPair,
  normalizeStatusPrivacy,
  rejectFriendRequest,
  removeFollower,
  removeFriend,
  resolveSocialErrorMessage,
  sanitizeUid,
  sanitizeUsername,
  saveStatusPrivacy,
  sendFriendRequest,
  setSocialGraphTestRuntime,
  subscribeMyFollowers,
  subscribeMyFollowing,
  unblockUser,
  unfollowUser,
  validateUsername,
} from '../src/services/socialGraphService';

const TEST_PROJECT_ID = 'demo-king-rules-test';
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8088;

const { FieldValue, Timestamp } = firebase.firestore;

let testEnv: RulesTestEnvironment;
const authContextCache = new Map<string, RulesTestContext>();

function getAuthCtx(uid: string): RulesTestContext {
  let ctx = authContextCache.get(uid);
  if (!ctx) {
    ctx = testEnv.authenticatedContext(uid);
    authContextCache.set(uid, ctx);
  }
  return ctx;
}

function useSocialTestActor(uid: string): void {
  const ctx = getAuthCtx(uid);
  const modularDb = (ctx.firestore() as any)._delegate;
  setSocialGraphTestRuntime(() => ({
    db: modularDb,
    currentUser: { displayName: `User ${uid}`, photoURL: '' },
  }));
}

async function seedDoc(docPath: string, data: Record<string, unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(docPath).set(data);
  });
}

async function seedProfile(
  uid: string,
  overrides: Record<string, unknown> = {}
): Promise<void> {
  const nowIso = '2026-11-26T00:00:00.000Z';
  await seedDoc(`publicProfiles/${uid}`, {
    uid,
    displayName: `User ${uid}`,
    name: `User ${uid}`,
    displayNameLower: `user ${uid}`.toLowerCase(),
    photoURL: '',
    followersCount: 0,
    followingCount: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    ...overrides,
  });
}

describe('KING App Followers & Social Graph Security Rules (Isolated Emulator)', () => {
  before(async () => {
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: TEST_PROJECT_ID,
      firestore: {
        host: EMULATOR_HOST,
        port: EMULATOR_PORT,
        rules,
      },
    });
  });

  beforeEach(async () => {
    setSocialGraphTestRuntime(null);
    await testEnv.clearFirestore();
  });

  after(async () => {
    setSocialGraphTestRuntime(null);
    authContextCache.clear();
    await testEnv.cleanup();
  });

  it('Follow: atomic transaction creates follow edge, updates counters, initializes notification, and blocks invalid follows', async () => {
    await seedProfile('alice');
    await seedProfile('bob');

    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const nowIso = new Date().toISOString();
    const expiresAt = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await assertSucceeds(
      aliceDb.runTransaction(async (tx) => {
        const followRef = aliceDb.doc('follows/alice_bob');
        const mePrivateRef = aliceDb.doc('users/alice');
        const aliceProfileRef = aliceDb.doc('publicProfiles/alice');
        const bobProfileRef = aliceDb.doc('publicProfiles/bob');
        const notifRef = aliceDb.doc('notifications/follow_alice_bob');

        const [followSnap, aliceSnap, bobSnap] = await Promise.all([
          tx.get(followRef),
          tx.get(aliceProfileRef),
          tx.get(bobProfileRef),
        ]);

        assert.equal(followSnap.exists, false);

        tx.set(followRef, {
          followerUid: 'alice',
          targetUid: 'bob',
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(
          mePrivateRef,
          { uid: 'alice', _socialSyncUid: 'bob' },
          { merge: true }
        );
        tx.update(aliceProfileRef, {
          followingCount: Number(aliceSnap.data()?.followingCount || 0) + 1,
          updatedAt: nowIso,
        });
        tx.update(bobProfileRef, {
          followersCount: Number(bobSnap.data()?.followersCount || 0) + 1,
          updatedAt: nowIso,
        });
        tx.set(notifRef, {
          recipientUid: 'bob',
          actorUid: 'alice',
          actorName: 'User alice',
          actorPhoto: '',
          type: 'new_follower',
          title: 'User alice started following you',
          body: 'Tap to view their KING profile.',
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt,
        });
      })
    );

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const followDoc = await db.doc('follows/alice_bob').get();
      const aliceDoc = await db.doc('publicProfiles/alice').get();
      const bobDoc = await db.doc('publicProfiles/bob').get();
      const notifDoc = await db.doc('notifications/follow_alice_bob').get();

      assert.equal(followDoc.exists, true);
      assert.equal(aliceDoc.data()?.followingCount, 1);
      assert.equal(aliceDoc.data()?.followersCount, 0);
      assert.equal(bobDoc.data()?.followersCount, 1);
      assert.equal(bobDoc.data()?.followingCount, 0);
      assert.equal(notifDoc.exists, true);
      assert.equal(notifDoc.data()?.type, 'new_follower');
    });

    // Self-follow, unauthenticated follow, and impersonated follow must fail
    await assertFails(
      aliceDb.doc('follows/alice_alice').set({
        followerUid: 'alice',
        targetUid: 'alice',
        createdAt: FieldValue.serverTimestamp(),
      })
    );

    const charlieDb = testEnv.authenticatedContext('charlie').firestore();
    await assertFails(
      charlieDb.doc('follows/alice_charlie').set({
        followerUid: 'alice',
        targetUid: 'charlie',
        createdAt: FieldValue.serverTimestamp(),
      })
    );

    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      unauthedDb.doc('follows/guest_bob').set({
        followerUid: 'guest',
        targetUid: 'bob',
        createdAt: FieldValue.serverTimestamp(),
      })
    );
  });

  it('Follow: allows initializing a missing target publicProfile atomically inside follow transaction', async () => {
    await seedProfile('alice');

    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const nowIso = new Date().toISOString();

    await assertSucceeds(
      aliceDb.runTransaction(async (tx) => {
        const followRef = aliceDb.doc('follows/alice_legacyTarget');
        const mePrivateRef = aliceDb.doc('users/alice');
        const aliceProfileRef = aliceDb.doc('publicProfiles/alice');
        const targetProfileRef = aliceDb.doc('publicProfiles/legacyTarget');

        const targetSnap = await tx.get(targetProfileRef);
        assert.equal(targetSnap.exists, false);

        tx.set(followRef, {
          followerUid: 'alice',
          targetUid: 'legacyTarget',
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(
          mePrivateRef,
          { uid: 'alice', _socialSyncUid: 'legacyTarget' },
          { merge: true }
        );
        tx.update(aliceProfileRef, {
          followingCount: 1,
          updatedAt: nowIso,
        });
        tx.set(targetProfileRef, {
          uid: 'legacyTarget',
          followersCount: 1,
          followingCount: 0,
          updatedAt: nowIso,
        });
      })
    );

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const targetDoc = await ctx.firestore().doc('publicProfiles/legacyTarget').get();
      assert.equal(targetDoc.exists, true);
      assert.equal(targetDoc.data()?.followersCount, 1);
      assert.equal(targetDoc.data()?.followingCount, 0);
    });
  });

  it('Unfollow: atomic transaction deletes follow edge, clamps counters at 0, denies negative counts and third-party deletes', async () => {
    await seedProfile('alice', { followingCount: 1 });
    await seedProfile('bob', { followersCount: 1 });
    await seedDoc('follows/alice_bob', {
      followerUid: 'alice',
      targetUid: 'bob',
      createdAt: Timestamp.now(),
    });

    // Unrelated user cannot delete Alice -> Bob follow edge
    const charlieDb = testEnv.authenticatedContext('charlie').firestore();
    await assertFails(charlieDb.doc('follows/alice_bob').delete());

    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const nowIso = new Date().toISOString();

    // Negative counter update must fail even inside an unfollow transaction
    await assertFails(
      aliceDb.runTransaction(async (tx) => {
        tx.delete(aliceDb.doc('follows/alice_bob'));
        tx.set(
          aliceDb.doc('users/alice'),
          { uid: 'alice', _socialSyncUid: 'bob' },
          { merge: true }
        );
        tx.update(aliceDb.doc('publicProfiles/alice'), {
          followingCount: -1,
          updatedAt: nowIso,
        });
        tx.update(aliceDb.doc('publicProfiles/bob'), {
          followersCount: 0,
          updatedAt: nowIso,
        });
      })
    );

    await assertSucceeds(
      aliceDb.runTransaction(async (tx) => {
        tx.delete(aliceDb.doc('follows/alice_bob'));
        tx.set(
          aliceDb.doc('users/alice'),
          { uid: 'alice', _socialSyncUid: 'bob' },
          { merge: true }
        );
        tx.update(aliceDb.doc('publicProfiles/alice'), {
          followingCount: 0,
          updatedAt: nowIso,
        });
        tx.update(aliceDb.doc('publicProfiles/bob'), {
          followersCount: 0,
          updatedAt: nowIso,
        });
      })
    );

    // Legacy 0-counter edge cleanup clamps safely at 0 without going negative
    await seedDoc('follows/alice_bob', {
      followerUid: 'alice',
      targetUid: 'bob',
      createdAt: Timestamp.now(),
    });
    await assertSucceeds(
      aliceDb.runTransaction(async (tx) => {
        tx.delete(aliceDb.doc('follows/alice_bob'));
        tx.set(
          aliceDb.doc('users/alice'),
          { uid: 'alice', _socialSyncUid: 'bob' },
          { merge: true }
        );
        tx.update(aliceDb.doc('publicProfiles/alice'), {
          followingCount: 0,
          updatedAt: nowIso,
        });
        tx.update(aliceDb.doc('publicProfiles/bob'), {
          followersCount: 0,
          updatedAt: nowIso,
        });
      })
    );

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const followDoc = await db.doc('follows/alice_bob').get();
      const aliceDoc = await db.doc('publicProfiles/alice').get();
      const bobDoc = await db.doc('publicProfiles/bob').get();

      assert.equal(followDoc.exists, false);
      assert.equal(aliceDoc.data()?.followingCount, 0);
      assert.equal(bobDoc.data()?.followersCount, 0);
    });
  });

  it('Remove Follower: target user atomically removes follower edge and decrements both counters', async () => {
    await seedProfile('alice', { followingCount: 1 });
    await seedProfile('bob', { followersCount: 1 });
    await seedDoc('follows/alice_bob', {
      followerUid: 'alice',
      targetUid: 'bob',
      createdAt: Timestamp.now(),
    });

    const bobDb = testEnv.authenticatedContext('bob').firestore();
    const nowIso = new Date().toISOString();

    await assertSucceeds(
      bobDb.runTransaction(async (tx) => {
        tx.delete(bobDb.doc('follows/alice_bob'));
        tx.set(
          bobDb.doc('users/bob'),
          { uid: 'bob', _socialSyncUid: 'alice' },
          { merge: true }
        );
        tx.update(bobDb.doc('publicProfiles/bob'), {
          followersCount: 0,
          updatedAt: nowIso,
        });
        tx.update(bobDb.doc('publicProfiles/alice'), {
          followingCount: 0,
          updatedAt: nowIso,
        });
      })
    );

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const followDoc = await db.doc('follows/alice_bob').get();
      const aliceDoc = await db.doc('publicProfiles/alice').get();
      const bobDoc = await db.doc('publicProfiles/bob').get();

      assert.equal(followDoc.exists, false);
      assert.equal(aliceDoc.data()?.followingCount, 0);
      assert.equal(bobDoc.data()?.followersCount, 0);
    });
  });

  it('Block & Unblock: passes rule read limits on 7-write mutual blockUser tx, handles 1-way follow block, and permits post-unblock follow', async () => {
    await seedProfile('alice', { followersCount: 1, followingCount: 1 });
    await seedProfile('bob', { followersCount: 1, followingCount: 1 });
    await seedDoc('friendships/alice_bob', {
      userA: 'alice',
      userB: 'bob',
      users: ['alice', 'bob'],
      status: 'accepted',
      requestedBy: 'alice',
      targetUid: 'bob',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    await seedDoc('follows/alice_bob', {
      followerUid: 'alice',
      targetUid: 'bob',
      createdAt: Timestamp.now(),
    });
    await seedDoc('follows/bob_alice', {
      followerUid: 'bob',
      targetUid: 'alice',
      createdAt: Timestamp.now(),
    });

    const bobDb = testEnv.authenticatedContext('bob').firestore();
    const nowIso = new Date().toISOString();

    // Full 7-write blockUser transaction (verifies Firestore Rules transaction read limit compliance)
    await assertSucceeds(
      bobDb.runTransaction(async (tx) => {
        tx.set(bobDb.doc('blocks/bob_alice'), {
          blockerUid: 'bob',
          blockedUid: 'alice',
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.delete(bobDb.doc('friendships/alice_bob'));
        tx.delete(bobDb.doc('follows/bob_alice'));
        tx.delete(bobDb.doc('follows/alice_bob'));
        tx.set(
          bobDb.doc('users/bob'),
          { uid: 'bob', _socialSyncUid: 'alice' },
          { merge: true }
        );
        tx.update(bobDb.doc('publicProfiles/bob'), {
          followingCount: 0,
          followersCount: 0,
          updatedAt: nowIso,
        });
        tx.update(bobDb.doc('publicProfiles/alice'), {
          followersCount: 0,
          followingCount: 0,
          updatedAt: nowIso,
        });
      })
    );

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const blockDoc = await db.doc('blocks/bob_alice').get();
      const friendshipDoc = await db.doc('friendships/alice_bob').get();
      const f1 = await db.doc('follows/alice_bob').get();
      const f2 = await db.doc('follows/bob_alice').get();
      const aliceDoc = await db.doc('publicProfiles/alice').get();
      const bobDoc = await db.doc('publicProfiles/bob').get();

      assert.equal(blockDoc.exists, true);
      assert.equal(friendshipDoc.exists, false);
      assert.equal(f1.exists, false);
      assert.equal(f2.exists, false);
      assert.equal(aliceDoc.data()?.followersCount, 0);
      assert.equal(aliceDoc.data()?.followingCount, 0);
      assert.equal(bobDoc.data()?.followersCount, 0);
      assert.equal(bobDoc.data()?.followingCount, 0);
    });

    // Neither blocked user nor blocker can follow while block exists; blocked user cannot read or delete block doc
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    await assertFails(aliceDb.doc('blocks/bob_alice').get());
    await assertFails(aliceDb.doc('blocks/bob_alice').delete());
    await assertFails(
      aliceDb.doc('follows/alice_bob').set({
        followerUid: 'alice',
        targetUid: 'bob',
        createdAt: FieldValue.serverTimestamp(),
      })
    );
    await assertFails(
      bobDb.doc('follows/bob_alice').set({
        followerUid: 'bob',
        targetUid: 'alice',
        createdAt: FieldValue.serverTimestamp(),
      })
    );

    // Blocker unblocks Alice, then Alice can follow Bob atomically
    await assertSucceeds(bobDb.doc('blocks/bob_alice').delete());
    await assertSucceeds(
      aliceDb.runTransaction(async (tx) => {
        tx.set(aliceDb.doc('follows/alice_bob'), {
          followerUid: 'alice',
          targetUid: 'bob',
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(
          aliceDb.doc('users/alice'),
          { uid: 'alice', _socialSyncUid: 'bob' },
          { merge: true }
        );
        tx.update(aliceDb.doc('publicProfiles/alice'), {
          followingCount: 1,
          updatedAt: nowIso,
        });
        tx.update(aliceDb.doc('publicProfiles/bob'), {
          followersCount: 1,
          updatedAt: nowIso,
        });
      })
    );

    // 1-directional follow block (only alice -> bob exists)
    await assertSucceeds(
      bobDb.runTransaction(async (tx) => {
        tx.set(bobDb.doc('blocks/bob_alice'), {
          blockerUid: 'bob',
          blockedUid: 'alice',
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.delete(bobDb.doc('follows/alice_bob'));
        tx.set(
          bobDb.doc('users/bob'),
          { uid: 'bob', _socialSyncUid: 'alice' },
          { merge: true }
        );
        tx.update(bobDb.doc('publicProfiles/bob'), {
          followersCount: 0,
          updatedAt: nowIso,
        });
        tx.update(bobDb.doc('publicProfiles/alice'), {
          followingCount: 0,
          updatedAt: nowIso,
        });
      })
    );
  });

  it('Follow Counter Integrity: rejects direct /follows writes/deletes and partial-counter transactions', async () => {
    await seedProfile('alice', { followingCount: 0 });
    await seedProfile('bob', { followersCount: 0 });

    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const nowIso = new Date().toISOString();

    // Direct standalone /follows create without updating publicProfiles must fail
    await assertFails(
      aliceDb.doc('follows/alice_bob').set({
        followerUid: 'alice',
        targetUid: 'bob',
        createdAt: FieldValue.serverTimestamp(),
      })
    );

    // Follow transaction that updates ONLY follower's profile (omits target profile) must fail
    await assertFails(
      aliceDb.runTransaction(async (tx) => {
        tx.set(aliceDb.doc('follows/alice_bob'), {
          followerUid: 'alice',
          targetUid: 'bob',
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(
          aliceDb.doc('users/alice'),
          { uid: 'alice', _socialSyncUid: 'bob' },
          { merge: true }
        );
        tx.update(aliceDb.doc('publicProfiles/alice'), {
          followingCount: 1,
          updatedAt: nowIso,
        });
      })
    );

    // Follow transaction that updates ONLY target's profile (omits follower profile) must fail
    await assertFails(
      aliceDb.runTransaction(async (tx) => {
        tx.set(aliceDb.doc('follows/alice_bob'), {
          followerUid: 'alice',
          targetUid: 'bob',
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.update(aliceDb.doc('publicProfiles/bob'), {
          followersCount: 1,
          updatedAt: nowIso,
        });
      })
    );

    // Seed valid follow edge + counters = 1, then verify standalone /follows delete fails
    await seedDoc('follows/alice_bob', {
      followerUid: 'alice',
      targetUid: 'bob',
      createdAt: Timestamp.now(),
    });
    await seedProfile('alice', { followingCount: 1 });
    await seedProfile('bob', { followersCount: 1 });

    await assertFails(aliceDb.doc('follows/alice_bob').delete());

    // Partial unfollow updating only alice (omitting bob decrement) must fail
    await assertFails(
      aliceDb.runTransaction(async (tx) => {
        tx.delete(aliceDb.doc('follows/alice_bob'));
        tx.set(
          aliceDb.doc('users/alice'),
          { uid: 'alice', _socialSyncUid: 'bob' },
          { merge: true }
        );
        tx.update(aliceDb.doc('publicProfiles/alice'), {
          followingCount: 0,
          updatedAt: nowIso,
        });
      })
    );

    // Legacy missing target publicProfile still permits clean unfollow without blocking deletion
    await seedDoc('follows/alice_legacyNoProfile', {
      followerUid: 'alice',
      targetUid: 'legacyNoProfile',
      createdAt: Timestamp.now(),
    });
    await assertSucceeds(
      aliceDb.runTransaction(async (tx) => {
        tx.delete(aliceDb.doc('follows/alice_legacyNoProfile'));
        tx.set(
          aliceDb.doc('users/alice'),
          { uid: 'alice', _socialSyncUid: 'legacyNoProfile' },
          { merge: true }
        );
        tx.update(aliceDb.doc('publicProfiles/alice'), {
          followingCount: 0,
          updatedAt: nowIso,
        });
      })
    );
  });

  it('Security Rules: denies direct counter forgery, mismatched counter deltas, and isVerified tampering', async () => {
    await seedProfile('alice', { followersCount: 2, followingCount: 3 });
    await seedProfile('bob', { followersCount: 5, followingCount: 1 });

    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    // Owner cannot forge own followersCount, followingCount, or isVerified
    await assertFails(
      aliceDb.doc('publicProfiles/alice').update({ followersCount: 5000 })
    );
    await assertFails(
      aliceDb.doc('publicProfiles/alice').update({ followingCount: 999 })
    );
    await assertFails(
      aliceDb.doc('publicProfiles/alice').update({ isVerified: true })
    );

    // Non-owner cannot modify target counter without matching follow edge
    await assertFails(
      aliceDb.doc('publicProfiles/bob').update({ followersCount: 6 })
    );

    // Follow transaction with forged +2 counter delta instead of +1 must fail
    await assertFails(
      aliceDb.runTransaction(async (tx) => {
        tx.set(aliceDb.doc('follows/alice_bob'), {
          followerUid: 'alice',
          targetUid: 'bob',
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(
          aliceDb.doc('users/alice'),
          { uid: 'alice', _socialSyncUid: 'bob' },
          { merge: true }
        );
        tx.update(aliceDb.doc('publicProfiles/alice'), {
          followingCount: 4,
          updatedAt: new Date().toISOString(),
        });
        tx.update(aliceDb.doc('publicProfiles/bob'), {
          followersCount: 7,
          updatedAt: new Date().toISOString(),
        });
      })
    );
  });

  it('Notifications: enforces follow-edge proof, blocks actor delete bypass, allows >1h cooldown refresh, and preserves recipient read/delete', async () => {
    await seedProfile('alice');
    await seedProfile('bob');

    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const bobDb = testEnv.authenticatedContext('bob').firestore();
    const expiresAt = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Cannot forge a follow notification when no follow edge exists
    await assertFails(
      aliceDb.doc('notifications/follow_alice_bob').set({
        recipientUid: 'bob',
        actorUid: 'alice',
        actorName: 'Alice',
        actorPhoto: '',
        type: 'new_follower',
        title: 'Alice started following you',
        body: 'Tap to view their KING profile.',
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
      })
    );

    // Seed valid follow edge, then valid notification creation succeeds
    await seedDoc('follows/alice_bob', {
      followerUid: 'alice',
      targetUid: 'bob',
      createdAt: Timestamp.now(),
    });

    await assertSucceeds(
      aliceDb.doc('notifications/follow_alice_bob').set({
        recipientUid: 'bob',
        actorUid: 'alice',
        actorName: 'Alice',
        actorPhoto: '',
        type: 'new_follower',
        title: 'Alice started following you',
        body: 'Tap to view their KING profile.',
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
      })
    );

    // Immediate refresh within 1h cooldown must be denied
    await assertFails(
      aliceDb.doc('notifications/follow_alice_bob').update({
        actorName: 'Alice Again',
        actorPhoto: '',
        title: 'Alice Again started following you',
        body: 'Tap to view their KING profile.',
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
      })
    );

    // Actor CANNOT delete their own notification to bypass the 1-hour cooldown
    await assertFails(
      aliceDb.doc('notifications/follow_alice_bob').delete()
    );

    // Actor cannot mark recipient notification read; recipient can
    await assertFails(
      aliceDb.doc('notifications/follow_alice_bob').update({ read: true })
    );
    await assertSucceeds(
      bobDb.doc('notifications/follow_alice_bob').update({ read: true })
    );

    // Refresh > 1h after creation (65 minutes old) succeeds
    await seedDoc('notifications/follow_alice_bob', {
      recipientUid: 'bob',
      actorUid: 'alice',
      actorName: 'Alice',
      actorPhoto: '',
      type: 'new_follower',
      title: 'Alice started following you',
      body: 'Tap to view their KING profile.',
      read: true,
      createdAt: Timestamp.fromMillis(Date.now() - 65 * 60 * 1000),
      expiresAt,
    });

    await assertSucceeds(
      aliceDb.doc('notifications/follow_alice_bob').update({
        actorName: 'Alice Refollowed',
        actorPhoto: '',
        title: 'Alice Refollowed started following you',
        body: 'Tap to view their KING profile.',
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
      })
    );

    // Recipient retains legitimate permission to delete their own notification
    await assertSucceeds(
      bobDb.doc('notifications/follow_alice_bob').delete()
    );
  });

  it('Usernames, Ownership, Squatting Prevention, Rename Release, and SocialLinks (whatsapp)', async () => {
    await seedProfile('alice');
    await seedProfile('bob');

    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const bobDb = testEnv.authenticatedContext('bob').firestore();
    const nowIso = new Date().toISOString();

    // Direct /usernames write without updating publicProfiles must fail (anti-squatting)
    await assertFails(
      aliceDb.doc('usernames/squatted_name').set({
        uid: 'alice',
        username: 'squatted_name',
        createdAt: FieldValue.serverTimestamp(),
      })
    );

    // Claim unique @username atomically alongside publicProfiles
    await assertSucceeds(
      aliceDb.runTransaction(async (tx) => {
        tx.set(aliceDb.doc('usernames/king_alice'), {
          uid: 'alice',
          username: 'king_alice',
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.update(aliceDb.doc('publicProfiles/alice'), {
          username: 'king_alice',
          usernameLower: 'king_alice',
          updatedAt: nowIso,
        });
      })
    );

    // Direct /usernames delete while publicProfiles still points to it must fail
    await assertFails(aliceDb.doc('usernames/king_alice').delete());

    // Duplicate claim by Bob must fail
    await assertFails(
      bobDb.runTransaction(async (tx) => {
        tx.set(bobDb.doc('usernames/king_alice'), {
          uid: 'bob',
          username: 'king_alice',
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.update(bobDb.doc('publicProfiles/bob'), {
          username: 'king_alice',
          usernameLower: 'king_alice',
          updatedAt: nowIso,
        });
      })
    );

    // Renaming to king_alice_v2 WITHOUT deleting old usernames/king_alice must fail
    await assertFails(
      aliceDb.runTransaction(async (tx) => {
        tx.set(aliceDb.doc('usernames/king_alice_v2'), {
          uid: 'alice',
          username: 'king_alice_v2',
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.update(aliceDb.doc('publicProfiles/alice'), {
          username: 'king_alice_v2',
          usernameLower: 'king_alice_v2',
          updatedAt: nowIso,
        });
      })
    );

    // Atomic rename releasing old claim succeeds, and freed handle becomes claimable by Bob
    await assertSucceeds(
      aliceDb.runTransaction(async (tx) => {
        tx.set(aliceDb.doc('usernames/king_alice_v2'), {
          uid: 'alice',
          username: 'king_alice_v2',
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.delete(aliceDb.doc('usernames/king_alice'));
        tx.update(aliceDb.doc('publicProfiles/alice'), {
          username: 'king_alice_v2',
          usernameLower: 'king_alice_v2',
          updatedAt: nowIso,
        });
      })
    );

    await assertSucceeds(
      bobDb.runTransaction(async (tx) => {
        tx.set(bobDb.doc('usernames/king_alice'), {
          uid: 'bob',
          username: 'king_alice',
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.update(bobDb.doc('publicProfiles/bob'), {
          username: 'king_alice',
          usernameLower: 'king_alice',
          updatedAt: nowIso,
        });
      })
    );

    // Saving socialLinks including whatsapp succeeds; unknown key fails
    await assertSucceeds(
      aliceDb.doc('publicProfiles/alice').update({
        socialLinks: {
          whatsapp: 'https://wa.me/15550001111',
          facebook: '',
          youtube: '',
          instagram: '',
          tiktok: '',
        },
        updatedAt: nowIso,
      })
    );
    await assertFails(
      aliceDb.doc('publicProfiles/alice').update({
        socialLinks: {
          whatsapp: 'https://wa.me/15550001111',
          snapchat: 'not_allowed',
        },
        updatedAt: nowIso,
      })
    );
  });

  it('Pagination: cursor-based Followers & Following composite-index queries (orderBy createdAt desc + startAfter)', async () => {
    const baseMs = 1700000000000;
    // Seed 30 followers of Bob and 30 accounts followed by Alice
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const batch = db.batch();
      for (let i = 1; i <= 30; i++) {
        const uid = `user_${String(i).padStart(2, '0')}`;
        batch.set(db.doc(`follows/${uid}_bob`), {
          followerUid: uid,
          targetUid: 'bob',
          createdAt: Timestamp.fromMillis(baseMs + i * 1000),
        });
        batch.set(db.doc(`follows/alice_${uid}`), {
          followerUid: 'alice',
          targetUid: uid,
          createdAt: Timestamp.fromMillis(baseMs + i * 1000),
        });
      }
      await batch.commit();
    });

    const readerDb = testEnv.authenticatedContext('alice').firestore();
    const PAGE_SIZE = 25;

    // Followers page 1 (matches socialGraphService.fetchFollowersPage)
    const followersP1 = await assertSucceeds(
      readerDb
        .collection('follows')
        .where('targetUid', '==', 'bob')
        .orderBy('createdAt', 'desc')
        .limit(PAGE_SIZE + 1)
        .get()
    );
    assert.equal(followersP1.docs.length, 26);
    const fPage1 = followersP1.docs.slice(0, PAGE_SIZE);
    assert.equal(fPage1[0].data().followerUid, 'user_30');
    assert.equal(fPage1[24].data().followerUid, 'user_06');

    const followersP2 = await assertSucceeds(
      readerDb
        .collection('follows')
        .where('targetUid', '==', 'bob')
        .orderBy('createdAt', 'desc')
        .startAfter(fPage1[fPage1.length - 1])
        .limit(PAGE_SIZE + 1)
        .get()
    );
    assert.equal(followersP2.docs.length, 5);
    assert.equal(followersP2.docs[0].data().followerUid, 'user_05');
    assert.equal(followersP2.docs[4].data().followerUid, 'user_01');

    // Following page 1 & 2 (matches socialGraphService.fetchFollowingPage)
    const followingP1 = await assertSucceeds(
      readerDb
        .collection('follows')
        .where('followerUid', '==', 'alice')
        .orderBy('createdAt', 'desc')
        .limit(PAGE_SIZE + 1)
        .get()
    );
    assert.equal(followingP1.docs.length, 26);
    const gPage1 = followingP1.docs.slice(0, PAGE_SIZE);
    assert.equal(gPage1[0].data().targetUid, 'user_30');

    const followingP2 = await assertSucceeds(
      readerDb
        .collection('follows')
        .where('followerUid', '==', 'alice')
        .orderBy('createdAt', 'desc')
        .startAfter(gPage1[gPage1.length - 1])
        .limit(PAGE_SIZE + 1)
        .get()
    );
    assert.equal(followingP2.docs.length, 5);
    assert.equal(followingP2.docs[4].data().targetUid, 'user_01');
  });

  it('socialGraphService.ts pure helpers: enforces username validation, UID sanitization, pair IDs, privacy normalization, and error messages', () => {
    assert.equal(sanitizeUid('valid_UID-123'), 'valid_UID-123');
    assert.equal(sanitizeUid('bad/uid'), '');
    assert.equal(sanitizeUid('bad.*regex'), '');
    assert.equal(sanitizeUid(''), '');

    assert.equal(sanitizeUsername(' @King.User_1 '), 'king.user_1');
    assert.equal(validateUsername('@King_User').valid, true);
    assert.equal(validateUsername('ab').valid, false);
    assert.equal(validateUsername('.leading').valid, false);
    assert.equal(validateUsername('trailing.').valid, false);
    assert.equal(validateUsername('two..dots').valid, false);

    assert.equal(getFollowDocId('alice', 'bob'), 'alice_bob');
    assert.equal(getBlockDocId('alice', 'bob'), 'alice_bob');
    assert.equal(getFriendshipPairId('zoe', 'amy'), 'amy_zoe');
    assert.deepEqual(getSortedPair('zoe', 'amy'), ['amy', 'zoe']);
    assert.throws(() => getFollowDocId('same', 'same'));

    const privacy = normalizeStatusPrivacy(
      {
        visibility: 'selected',
        selectedUids: ['u1', 'selfUid', 'blockedUid', 'u2', 'u1', 'bad/uid'],
        exceptUids: ['u3'],
      },
      'selfUid',
      ['blockedUid']
    );
    assert.equal(privacy.visibility, 'selected');
    assert.deepEqual(privacy.selectedUids, ['u1', 'u2']);

    assert.match(resolveSocialErrorMessage({ code: 'permission-denied' }), /privacy or block/i);
    assert.match(resolveSocialErrorMessage({ code: 'unauthenticated' }), /sign in/i);
  });

  it('socialGraphService.ts integration: ensureDefaultUsername & claimUsername enforce uniqueness and release old handles', async () => {
    await seedProfile('alice');
    await seedProfile('bob');

    useSocialTestActor('alice');
    const assigned = await ensureDefaultUsername('alice', 'Alice King');
    assert.ok(assigned && assigned.startsWith('aliceking_'));

    const aliceDb = getAuthCtx('alice').firestore();
    const initialProfile = await aliceDb.doc('publicProfiles/alice').get();
    assert.equal(initialProfile.data()?.username, assigned);
    const initialClaim = await aliceDb.doc(`usernames/${assigned}`).get();
    assert.equal(initialClaim.data()?.uid, 'alice');

    // Re-running ensureDefaultUsername preserves existing valid handle
    const preserved = await ensureDefaultUsername('alice', 'Different Name');
    assert.equal(preserved, assigned);

    // Explicitly rename via claimUsername and verify old handle is released
    const claimed = await claimUsername('alice', '@King.Alice_1');
    assert.equal(claimed, 'king.alice_1');
    const oldClaimAfter = await aliceDb.doc(`usernames/${assigned}`).get();
    assert.equal(oldClaimAfter.exists, false);
    const newClaim = await aliceDb.doc('usernames/king.alice_1').get();
    assert.equal(newClaim.data()?.uid, 'alice');

    // Duplicate claim by Bob fails
    useSocialTestActor('bob');
    await assert.rejects(() => claimUsername('bob', 'king.alice_1'), /already taken/i);

    // Alice renames again; Bob can now claim the released handle
    useSocialTestActor('alice');
    await claimUsername('alice', 'king.alice_2');
    useSocialTestActor('bob');
    const bobClaimed = await claimUsername('bob', 'king.alice_1');
    assert.equal(bobClaimed, 'king.alice_1');
  });

  it('socialGraphService.ts integration: followUser, unfollowUser, removeFollower, blockUser, and unblockUser execute against emulator', async () => {
    await seedProfile('alice');
    await seedProfile('bob');
    await seedDoc('friendships/alice_bob', {
      userA: 'alice',
      userB: 'bob',
      users: ['alice', 'bob'],
      status: 'accepted',
      requestedBy: 'alice',
      targetUid: 'bob',
    });

    const aliceDb = getAuthCtx('alice').firestore();
    const bobDb = getAuthCtx('bob').firestore();

    // 1. followUser (alice -> bob)
    useSocialTestActor('alice');
    await followUser('alice', 'bob', { displayName: 'Alice King' });

    const followSnap = await aliceDb.doc('follows/alice_bob').get();
    assert.equal(followSnap.exists, true);
    assert.equal((await aliceDb.doc('publicProfiles/alice').get()).data()?.followingCount, 1);
    assert.equal((await bobDb.doc('publicProfiles/bob').get()).data()?.followersCount, 1);
    const notifSnap = await bobDb.doc('notifications/follow_alice_bob').get();
    assert.equal(notifSnap.exists, true);
    assert.equal(notifSnap.data()?.type, 'new_follower');

    // Duplicate followUser throws client guard error
    await assert.rejects(() => followUser('alice', 'bob'), /already following/i);

    // 2. Reverse follow (bob -> alice) + removeFollower (bob removes alice)
    useSocialTestActor('bob');
    await followUser('bob', 'alice', { displayName: 'Bob King' });
    assert.equal((await bobDb.doc('publicProfiles/bob').get()).data()?.followingCount, 1);
    assert.equal((await aliceDb.doc('publicProfiles/alice').get()).data()?.followersCount, 1);

    await removeFollower('bob', 'alice');
    assert.equal((await bobDb.doc('follows/alice_bob').get()).exists, false);
    assert.equal((await bobDb.doc('publicProfiles/bob').get()).data()?.followersCount, 0);
    assert.equal((await aliceDb.doc('publicProfiles/alice').get()).data()?.followingCount, 0);

    // 3. Re-follow + unfollowUser (alice unfollows bob)
    useSocialTestActor('alice');
    await followUser('alice', 'bob');
    assert.equal((await aliceDb.doc('follows/alice_bob').get()).exists, true);
    await unfollowUser('alice', 'bob');
    assert.equal((await aliceDb.doc('follows/alice_bob').get()).exists, false);
    assert.equal((await aliceDb.doc('publicProfiles/alice').get()).data()?.followingCount, 0);
    assert.equal((await bobDb.doc('publicProfiles/bob').get()).data()?.followersCount, 0);

    // 4. blockUser cleans up mutual follows & friendship and blocks future followUser calls
    await followUser('alice', 'bob');
    await blockUser('alice', 'bob');

    assert.equal((await aliceDb.doc('blocks/alice_bob').get()).exists, true);
    assert.equal((await aliceDb.doc('follows/alice_bob').get()).exists, false);
    assert.equal((await aliceDb.doc('follows/bob_alice').get()).exists, false);
    assert.equal((await aliceDb.doc('friendships/alice_bob').get()).exists, false);
    assert.equal((await aliceDb.doc('publicProfiles/alice').get()).data()?.followersCount, 0);
    assert.equal((await aliceDb.doc('publicProfiles/alice').get()).data()?.followingCount, 0);
    assert.equal((await bobDb.doc('publicProfiles/bob').get()).data()?.followersCount, 0);
    assert.equal((await bobDb.doc('publicProfiles/bob').get()).data()?.followingCount, 0);

    await assert.rejects(() => followUser('alice', 'bob'), /blocked this user/i);
    useSocialTestActor('bob');
    await assert.rejects(() => followUser('bob', 'alice'));

    // 5. unblockUser restores followability
    useSocialTestActor('alice');
    await unblockUser('alice', 'bob');
    assert.equal((await aliceDb.doc('blocks/alice_bob').get()).exists, false);
    await followUser('alice', 'bob');
    assert.equal((await aliceDb.doc('follows/alice_bob').get()).exists, true);
  });

  it('socialGraphService.ts integration: fetchFollowersPage, fetchFollowingPage, fetchMyFollowEdgesForTargets, and ordered listeners', async () => {
    const uids = ['target', 'u1', 'u2', 'u3', 'u4'];
    for (const uid of uids) {
      await seedProfile(uid);
    }

    // Create 4 follower edges (u1..u4 -> target) and 4 following edges (target -> u1..u4) with ordered timestamps
    for (const uid of ['u1', 'u2', 'u3', 'u4']) {
      useSocialTestActor(uid);
      await followUser(uid, 'target');
      useSocialTestActor('target');
      await followUser('target', uid);
      await new Promise((r) => setTimeout(r, 15));
    }

    useSocialTestActor('target');

    // fetchFollowersPage cursor pagination (2 pages of size 2)
    const fPage1 = await fetchFollowersPage('target', 2, null);
    assert.equal(fPage1.items.length, 2);
    assert.equal(fPage1.hasMore, true);
    assert.ok(fPage1.nextCursor);
    assert.deepEqual(
      fPage1.items.map((x) => x.uid),
      ['u4', 'u3']
    );

    const fPage2 = await fetchFollowersPage('target', 2, fPage1.nextCursor);
    assert.equal(fPage2.items.length, 2);
    assert.equal(fPage2.hasMore, false);
    assert.deepEqual(
      fPage2.items.map((x) => x.uid),
      ['u2', 'u1']
    );

    // fetchFollowingPage cursor pagination (2 pages of size 2)
    const gPage1 = await fetchFollowingPage('target', 2, null);
    assert.equal(gPage1.items.length, 2);
    assert.equal(gPage1.hasMore, true);
    assert.deepEqual(
      gPage1.items.map((x) => x.uid),
      ['u4', 'u3']
    );

    const gPage2 = await fetchFollowingPage('target', 2, gPage1.nextCursor);
    assert.equal(gPage2.items.length, 2);
    assert.equal(gPage2.hasMore, false);
    assert.deepEqual(
      gPage2.items.map((x) => x.uid),
      ['u2', 'u1']
    );

    // fetchMyFollowEdgesForTargets
    const edges = await fetchMyFollowEdgesForTargets('target', ['u1', 'u4', 'stranger']);
    assert.equal(edges.followingSet.has('u1'), true);
    assert.equal(edges.followingSet.has('u4'), true);
    assert.equal(edges.followingSet.has('stranger'), false);
    assert.equal(edges.followedBySet.has('u1'), true);
    assert.equal(edges.followedBySet.has('u4'), true);
    assert.equal(edges.followedBySet.has('stranger'), false);

    // subscribeMyFollowers & subscribeMyFollowing real-time newest-first listeners
    const followersRealtime = await new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('subscribeMyFollowers timeout')), 5000);
      const unsub = subscribeMyFollowers(
        'target',
        (records) => {
          if (records.length === 4) {
            clearTimeout(timer);
            unsub();
            resolve(records.map((r) => r.followerUid));
          }
        },
        (err) => {
          clearTimeout(timer);
          unsub();
          reject(err);
        }
      );
    });
    assert.deepEqual(followersRealtime, ['u4', 'u3', 'u2', 'u1']);

    const followingRealtime = await new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('subscribeMyFollowing timeout')), 5000);
      const unsub = subscribeMyFollowing(
        'target',
        (records) => {
          if (records.length === 4) {
            clearTimeout(timer);
            unsub();
            resolve(records.map((r) => r.targetUid));
          }
        },
        (err) => {
          clearTimeout(timer);
          unsub();
          reject(err);
        }
      );
    });
    assert.deepEqual(followingRealtime, ['u4', 'u3', 'u2', 'u1']);

    // Verify production Firebase config (king-5f52e) was never initialized during isolated tests
    const prodApps = getApps().filter((a) => a.options?.projectId === 'king-5f52e');
    assert.equal(prodApps.length, 0);
  });

  it('Private Data Protection: denies cross-user reads/writes/listing on /users/{uid}, subcollections, and privilege escalation', async () => {
    await seedDoc('users/alice', {
      uid: 'alice',
      email: 'alice@example.com',
      statusPrivacy: { visibility: 'friends', selectedUids: [], exceptUids: [] },
    });
    await seedDoc('users/bob', {
      uid: 'bob',
      email: 'bob@example.com',
      statusPrivacy: { visibility: 'only_me', selectedUids: [], exceptUids: [] },
    });
    await seedDoc('users/bob/downloads/dl1', { videoId: 'v1', title: 'Private' });

    const aliceDb = getAuthCtx('alice').firestore();
    const unauthedDb = testEnv.unauthenticatedContext().firestore();

    // Unauthenticated & cross-user read/list/write on private /users/{uid} must fail
    await assertFails(unauthedDb.doc('users/bob').get());
    await assertFails(aliceDb.doc('users/bob').get());
    await assertFails(aliceDb.collection('users').limit(10).get());
    await assertFails(aliceDb.doc('users/bob').set({ uid: 'bob', bio: 'tamper' }, { merge: true }));
    await assertFails(aliceDb.doc('users/bob').update({ email: 'hacked@example.com' }));
    await assertFails(aliceDb.doc('users/bob').delete());
    await assertFails(aliceDb.doc('users/bob/downloads/dl1').get());
    await assertFails(aliceDb.doc('users/bob/downloads/dl1').set({ videoId: 'v2' }));

    // Privilege escalation on own /users/{uid} document must fail
    await assertFails(aliceDb.doc('users/alice').update({ isAdmin: true }));
    await assertFails(aliceDb.doc('users/alice').update({ role: 'admin' }));
    await assertFails(aliceDb.doc('users/alice').update({ isSuperAdmin: true }));

    // Real saveStatusPrivacy succeeds for owner and stores normalized settings on /users/alice
    useSocialTestActor('alice');
    const saved = await saveStatusPrivacy('alice', {
      visibility: 'selected',
      selectedUids: ['bob', 'alice'],
      exceptUids: [],
    });
    assert.deepEqual(saved.selectedUids, ['bob']);
    const aliceSnap = await aliceDb.doc('users/alice').get();
    assert.equal(aliceSnap.data()?.statusPrivacy?.visibility, 'selected');
    assert.deepEqual(aliceSnap.data()?.statusPrivacy?.selectedUids, ['bob']);

    // Production project must never be initialized
    assert.equal(getApps().filter((a) => a.options?.projectId === 'king-5f52e').length, 0);
  });

  it('socialGraphService.ts integration: sendFriendRequest, accept/reject/cancel/removeFriend, and block prevention work with rules', async () => {
    await seedProfile('alice');
    await seedProfile('bob');

    const aliceDb = getAuthCtx('alice').firestore();

    // Alice sends friend request to Bob
    useSocialTestActor('alice');
    await sendFriendRequest('alice', 'bob');
    const pendingSnap = await aliceDb.doc('friendships/alice_bob').get();
    assert.equal(pendingSnap.exists, true);
    assert.equal(pendingSnap.data()?.status, 'pending');

    // Alice cannot accept her own outgoing request (client guard + rules)
    await assert.rejects(() => acceptFriendRequest('alice', 'bob'), /only the recipient/i);
    await assertFails(
      aliceDb.doc('friendships/alice_bob').update({
        status: 'accepted',
        updatedAt: FieldValue.serverTimestamp(),
      })
    );

    // Bob rejects Alice's request
    useSocialTestActor('bob');
    await rejectFriendRequest('bob', 'alice');
    assert.equal((await aliceDb.doc('friendships/alice_bob').get()).exists, false);

    // Alice sends and cancels outgoing request
    useSocialTestActor('alice');
    await sendFriendRequest('alice', 'bob');
    await cancelFriendRequest('alice', 'bob');
    assert.equal((await aliceDb.doc('friendships/alice_bob').get()).exists, false);

    // Alice sends, Bob accepts, then Alice removes friend
    await sendFriendRequest('alice', 'bob');
    useSocialTestActor('bob');
    await acceptFriendRequest('bob', 'alice');
    assert.equal((await aliceDb.doc('friendships/alice_bob').get()).data()?.status, 'accepted');

    useSocialTestActor('alice');
    await removeFriend('alice', 'bob');
    assert.equal((await aliceDb.doc('friendships/alice_bob').get()).exists, false);

    // Blocking prevents friend requests in either direction
    await blockUser('alice', 'bob');
    await assert.rejects(() => sendFriendRequest('alice', 'bob'), /blocked/i);
    useSocialTestActor('bob');
    await assert.rejects(() => sendFriendRequest('bob', 'alice'));
  });
});

