import {
  DEFAULT_STATUS_PRIVACY,
  getBlockDocId,
  getFollowDocId,
  getFriendshipPairId,
  getSortedPair,
  MAX_PRIVACY_UID_LIST,
  normalizeStatusPrivacy,
  resolveSocialErrorMessage,
  sanitizeUid,
} from '../src/services/socialGraphService';
import { STATUS_PRIVACY_OPTIONS } from '../src/types/social';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function testDeterministicPairAndEdgeIds() {
  console.log('=== TEST 1: Deterministic Pair & Edge IDs ===');
  const idAB = getFriendshipPairId('userAlpha', 'userBeta');
  const idBA = getFriendshipPairId('userBeta', 'userAlpha');
  assert(idAB === 'userAlpha_userBeta', `Expected userAlpha_userBeta, got ${idAB}`);
  assert(idAB === idBA, 'Canonical friendship pair ID must be order-independent');

  const [a, b] = getSortedPair('zUser', 'aUser');
  assert(a === 'aUser' && b === 'zUser', 'Sorted pair must order lexicographically');

  assert(getFollowDocId('follower1', 'target2') === 'follower1_target2', 'Follow ID mismatch');
  assert(getFollowDocId('target2', 'follower1') === 'target2_follower1', 'Directional follow ID mismatch');
  assert(getBlockDocId('blocker1', 'blocked2') === 'blocker1_blocked2', 'Block ID mismatch');

  let selfThrew = false;
  try {
    getFriendshipPairId('sameUid', 'sameUid');
  } catch {
    selfThrew = true;
  }
  assert(selfThrew, 'Self-friendship ID must throw');

  // Strict UID sanitization against slashes and regex metacharacters
  assert(sanitizeUid('valid_UID-123') === 'valid_UID-123', 'Valid UID must pass sanitizeUid');
  for (const bad of ['', '   ', 'a/b', 'a.*b', 'user$1', 'uid with spaces', 'a'.repeat(129)]) {
    assert(sanitizeUid(bad) === '', `Malicious/invalid UID should be rejected: ${bad}`);
  }
  console.log('PASS: Deterministic IDs, strict UID regex, and self-interaction guards verified.');
}

function testStatusPrivacyNormalization() {
  console.log('=== TEST 2: Status Privacy Modes & Normalization ===');
  assert(STATUS_PRIVACY_OPTIONS.length === 6, 'All 6 Status privacy options must exist');
  const modes = STATUS_PRIVACY_OPTIONS.map((o) => o.value);
  for (const required of ['public', 'friends', 'followers', 'selected', 'except', 'only_me'] as const) {
    assert(modes.includes(required), `Missing status privacy mode: ${required}`);
  }

  const normalized = normalizeStatusPrivacy(
    {
      visibility: 'selected',
      selectedUids: ['u1', 'u1', 'selfUid', 'blockedUid', 'u2', 'invalid/uid', 'bad.*uid'],
      exceptUids: ['u3'],
      updatedAt: '2026-11-15T00:00:00Z',
    },
    'selfUid',
    ['blockedUid']
  );

  assert(normalized.visibility === 'selected', 'Visibility should remain selected');
  assert(
    normalized.selectedUids.length === 2 &&
      normalized.selectedUids[0] === 'u1' &&
      normalized.selectedUids[1] === 'u2',
    `Unexpected selectedUids: ${JSON.stringify(normalized.selectedUids)}`
  );

  const fallback = normalizeStatusPrivacy({ visibility: 'invalid_mode' as any });
  assert(
    fallback.visibility === DEFAULT_STATUS_PRIVACY.visibility,
    'Invalid visibility mode must fall back safely'
  );

  const oversized = Array.from({ length: 300 }, (_, i) => `uid_${i}`);
  const capped = normalizeStatusPrivacy({ visibility: 'except', exceptUids: oversized });
  assert(capped.exceptUids.length === MAX_PRIVACY_UID_LIST, 'UID list must be capped at MAX_PRIVACY_UID_LIST');
  console.log('PASS: All 6 status privacy modes, deduplication, block stripping, and caps verified.');
}

function testSecurityRulesInvariants() {
  console.log('=== TEST 3: Phase 1 Rules Invariants Simulation ===');
  type Friendship = {
    userA: string;
    userB: string;
    users: [string, string];
    status: 'pending' | 'accepted';
    requestedBy: string;
    targetUid: string;
  };

  const blocks = new Set<string>();
  const friendships = new Map<string, Friendship>();
  const follows = new Map<string, { followerUid: string; targetUid: string }>();

  const isBlocked = (u1: string, u2: string) =>
    blocks.has(`${u1}_${u2}`) || blocks.has(`${u2}_${u1}`);

  const ruleCreateRequest = (caller: string, target: string) => {
    if (!caller || caller === target) return false;
    if (isBlocked(caller, target)) return false;
    const pairId = getFriendshipPairId(caller, target);
    if (friendships.has(pairId)) return false;
    const [userA, userB] = getSortedPair(caller, target);
    friendships.set(pairId, {
      userA,
      userB,
      users: [userA, userB],
      status: 'pending',
      requestedBy: caller,
      targetUid: target,
    });
    return true;
  };

  const ruleAcceptRequest = (caller: string, requester: string) => {
    const pairId = getFriendshipPairId(caller, requester);
    const doc = friendships.get(pairId);
    if (!doc) return false;
    if (doc.status !== 'pending' || doc.targetUid !== caller) return false;
    if (isBlocked(doc.userA, doc.userB)) return false;
    doc.status = 'accepted';
    return true;
  };

  const ruleFollow = (caller: string, target: string) => {
    if (!caller || caller === target) return false;
    if (isBlocked(caller, target)) return false;
    const fid = getFollowDocId(caller, target);
    if (follows.has(fid)) return false;
    follows.set(fid, { followerUid: caller, targetUid: target });
    return true;
  };

  // Hardened follows allow get model: strictly follower or target only (no third-party block oracle)
  const ruleGetFollow = (caller: string, followId: string) => {
    const doc = follows.get(followId);
    if (!doc) {
      return followId.startsWith(`${caller}_`) || followId.endsWith(`_${caller}`);
    }
    return doc.followerUid === caller || doc.targetUid === caller;
  };

  // Duplicate and cross-request prevention
  assert(ruleCreateRequest('userA', 'userB') === true, 'Initial request A->B must succeed');
  assert(ruleCreateRequest('userA', 'userB') === false, 'Duplicate request A->B must be denied');
  assert(ruleCreateRequest('userB', 'userA') === false, 'Simultaneous cross request B->A must be denied');

  // Sender cannot accept own request; unrelated C cannot accept
  assert(ruleAcceptRequest('userA', 'userB') === false, 'Sender A must NOT accept own request');
  assert(ruleAcceptRequest('userC', 'userA') === false, 'Third user C must NOT accept A->B request');
  assert(ruleAcceptRequest('userB', 'userA') === true, 'Recipient B must be allowed to accept');

  // Follow & block enforcement + third-party get privacy
  assert(ruleFollow('userA', 'userB') === true, 'Follow A->B must succeed');
  assert(ruleFollow('userA', 'userB') === false, 'Duplicate follow A->B must be denied');
  assert(ruleGetFollow('userA', 'userA_userB') === true, 'Follower A can read own follow doc');
  assert(ruleGetFollow('userB', 'userA_userB') === true, 'Target B can read follower doc');
  assert(ruleGetFollow('userC', 'userA_userB') === false, 'Unrelated C must NOT read A->B follow doc');

  // Block wipes links and prevents future requests/follows in either direction
  blocks.add('userB_userA');
  friendships.delete(getFriendshipPairId('userA', 'userB'));
  follows.delete('userA_userB');
  follows.delete('userB_userA');

  assert(ruleCreateRequest('userA', 'userB') === false, 'Blocked user A must NOT send request to B');
  assert(ruleCreateRequest('userB', 'userA') === false, 'Blocker B must NOT send request to A while blocked');
  assert(ruleFollow('userA', 'userB') === false, 'Blocked user A must NOT follow B');
  assert(ruleFollow('userB', 'userA') === false, 'Blocker B must NOT follow A while blocked');

  const errMsg = resolveSocialErrorMessage({ code: 'permission-denied' });
  assert(errMsg.includes('blocked'), 'Permission denied message should surface clear explanation');
  console.log('PASS: Duplicate prevention, recipient-only accept, follow read isolation, and two-way block invariants verified.');
}

function testProtectedProfileAndPrivacyRuleModel() {
  console.log('=== TEST 4: Public Profile & Status Privacy Field-Lock Model ===');
  const allowedPublicFields = new Set([
    'uid',
    'displayName',
    'name',
    'photoURL',
    'bio',
    'socialLinks',
    'createdAt',
    'updatedAt',
  ]);

  const canWritePublicProfile = (caller: string, docUid: string, changedKeys: Record<string, unknown>) => {
    if (caller !== docUid) return false;
    for (const k of Object.keys(changedKeys)) {
      if (!allowedPublicFields.has(k)) return false;
    }
    if ('uid' in changedKeys && changedKeys.uid !== docUid) return false;
    return true;
  };

  assert(
    canWritePublicProfile('u1', 'u1', { uid: 'u1', displayName: 'King', updatedAt: '2026-11-15' }) === true,
    'Owner updating safe profile fields must be allowed'
  );
  assert(
    canWritePublicProfile('u1', 'u1', { subscribersCount: 999999 }) === false,
    'Owner forging subscribersCount must be denied'
  );
  assert(
    canWritePublicProfile('u1', 'u1', { followersCount: 5000 }) === false,
    'Owner forging followersCount must be denied'
  );
  assert(
    canWritePublicProfile('u1', 'u1', { uid: 'u2' }) === false,
    'Owner spoofing uid must be denied'
  );
  assert(
    canWritePublicProfile('u2', 'u1', { displayName: 'Hijacked' }) === false,
    'Non-owner writing publicProfiles must be denied'
  );
  console.log('PASS: Public profile protected counters, UID immutability, and ownership verified.');
}

testDeterministicPairAndEdgeIds();
testStatusPrivacyNormalization();
testSecurityRulesInvariants();
testProtectedProfileAndPrivacyRuleModel();
console.log('\nALL PHASE 1 SOCIAL GRAPH TESTS PASSED!');
