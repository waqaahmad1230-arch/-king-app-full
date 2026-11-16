import assert from 'node:assert/strict';
import {
  buildSignedStatusUploadPayload,
  evaluateStatusVisibilityForViewer,
  RawStatusDoc,
  STATUS_CLOUDINARY_FOLDER,
} from '../api/_lib/statusBackend';
import {
  groupStatusesByAuthor,
  sanitizeStatusUrlsForFirestore,
  STATUS_TTL_MS,
} from '../src/services/statusService';
import { StatusRecord } from '../src/types/social';
import * as StatusMediaUtils from '../src/utils/statusMediaUtils';
import {
  getStatusVideoDeliveryUrl,
  MAX_STATUS_VIDEO_SECONDS,
  validateStatusVideoDuration,
} from '../src/utils/statusMediaUtils';

function makeRawStatus(overrides: Partial<RawStatusDoc> = {}): RawStatusDoc {
  const now = Date.now();
  return {
    id: 'st_test_1',
    authorUid: 'owner_uid',
    authorName: 'Owner',
    authorPhoto: '',
    type: 'image',
    mediaUrl: 'https://res.cloudinary.com/xb0o3xwi/image/upload/v1/king_status/sample.jpg',
    thumbnailUrl: '',
    cloudinaryPublicId: 'king_status/sample',
    cloudinaryResourceType: 'image',
    cloudinaryDeliveryType: 'upload',
    caption: '',
    textContent: '',
    bgGradient: '',
    textStyle: 'classic',
    durationSec: 6,
    audioTrack: { mode: 'original', label: 'Original' },
    privacyMode: 'friends',
    allowedUids: [],
    excludedUids: [],
    viewsCount: 0,
    likesCount: 0,
    createdAtMs: now - 1000,
    expiresAtMs: now + STATUS_TTL_MS,
    ...overrides,
  };
}

function testMax60sVideoLimit() {
  console.log('=== TEST 1: Video Status 60-Second Limit (Not 30s) ===');
  assert.equal(MAX_STATUS_VIDEO_SECONDS, 60, 'MAX_STATUS_VIDEO_SECONDS must equal 60');
  assert.equal(validateStatusVideoDuration(35).valid, true, '35s video must pass');
  assert.equal(validateStatusVideoDuration(59.9).valid, true, '59.9s video must pass');
  assert.equal(validateStatusVideoDuration(60).valid, true, '60.0s video must pass');
  assert.equal(validateStatusVideoDuration(60.1).valid, false, '60.1s video must be rejected');
  assert.equal(validateStatusVideoDuration(75).valid, false, '75s video must be rejected');
  assert.equal(validateStatusVideoDuration(0).valid, false, '0s video must be rejected');
  console.log('PASS: 60s video limit validated accurately (no 30s artificial cap).');
}

function testAllPrivacyModesAndBlocks() {
  console.log('=== TEST 2: All 6 Privacy Modes + Stranger Except Fix + Bidirectional Blocks ===');
  const now = Date.now();
  const baseRelations = {
    friendUids: new Set(['owner_uid']),
    followingUids: new Set<string>(),
    blockedByMe: new Set<string>(),
    blockedMe: new Set<string>(),
  };
  const strangerRelations = {
    friendUids: new Set<string>(),
    followingUids: new Set<string>(),
    blockedByMe: new Set<string>(),
    blockedMe: new Set<string>(),
  };

  // 1. public
  const stPublic = makeRawStatus({ privacyMode: 'public' });
  assert.equal(evaluateStatusVisibilityForViewer(stPublic, 'stranger', strangerRelations, now), true);

  // 2. friends
  const stFriends = makeRawStatus({ privacyMode: 'friends' });
  assert.equal(evaluateStatusVisibilityForViewer(stFriends, 'friend_1', baseRelations, now), true);
  assert.equal(evaluateStatusVisibilityForViewer(stFriends, 'stranger', strangerRelations, now), false);

  // 3. followers
  const stFollowers = makeRawStatus({ privacyMode: 'followers' });
  assert.equal(
    evaluateStatusVisibilityForViewer(
      stFollowers,
      'follower_1',
      { ...strangerRelations, followingUids: new Set(['owner_uid']) },
      now
    ),
    true
  );
  assert.equal(evaluateStatusVisibilityForViewer(stFollowers, 'non_follower', strangerRelations, now), false);

  // 4. selected
  const stSelected = makeRawStatus({ privacyMode: 'selected', allowedUids: ['vip_1'] });
  assert.equal(evaluateStatusVisibilityForViewer(stSelected, 'vip_1', baseRelations, now), true);
  assert.equal(evaluateStatusVisibilityForViewer(stSelected, 'friend_other', baseRelations, now), false);
  assert.equal(evaluateStatusVisibilityForViewer(stSelected, 'stranger', strangerRelations, now), false);

  // 5. except — must ONLY allow non-excluded Friends or Followers, NEVER unrelated strangers
  const stExcept = makeRawStatus({ privacyMode: 'except', excludedUids: ['muted_friend'] });
  assert.equal(evaluateStatusVisibilityForViewer(stExcept, 'muted_friend', baseRelations, now), false);
  assert.equal(evaluateStatusVisibilityForViewer(stExcept, 'normal_friend', baseRelations, now), true);
  assert.equal(
    evaluateStatusVisibilityForViewer(
      stExcept,
      'normal_follower',
      { ...strangerRelations, followingUids: new Set(['owner_uid']) },
      now
    ),
    true
  );
  assert.equal(
    evaluateStatusVisibilityForViewer(stExcept, 'unrelated_stranger', strangerRelations, now),
    false,
    'Unrelated stranger must NOT view except-mode private status'
  );

  // 6. only_me
  const stOnlyMe = makeRawStatus({ privacyMode: 'only_me' });
  assert.equal(evaluateStatusVisibilityForViewer(stOnlyMe, 'owner_uid', baseRelations, now), true);
  assert.equal(evaluateStatusVisibilityForViewer(stOnlyMe, 'friend_1', baseRelations, now), false);

  // Bidirectional block overrides even public
  assert.equal(
    evaluateStatusVisibilityForViewer(
      stPublic,
      'viewer_blocked',
      { ...baseRelations, blockedMe: new Set(['owner_uid']) },
      now
    ),
    false
  );
  assert.equal(
    evaluateStatusVisibilityForViewer(
      stPublic,
      'viewer_blocker',
      { ...baseRelations, blockedByMe: new Set(['owner_uid']) },
      now
    ),
    false
  );

  // Expired (>24h) hidden from non-owners
  const stExpired = makeRawStatus({ privacyMode: 'public', expiresAtMs: now - 10 });
  assert.equal(evaluateStatusVisibilityForViewer(stExpired, 'friend_1', baseRelations, now), false);

  console.log('PASS: All 6 privacy modes, except stranger rejection, blocks, and expiry verified.');
}

function testSignedUploadStrictnessAndUrlRedaction() {
  console.log('=== TEST 3: Fail-Closed Signed Status Upload (No Unsigned Fallback) & URL Redaction ===');

  assert.equal(
    'STATUS_UNSIGNED_PRESET' in StatusMediaUtils,
    false,
    'STATUS_UNSIGNED_PRESET must be removed from statusMediaUtils'
  );

  const prevKey = process.env.CLOUDINARY_API_KEY;
  const prevSecret = process.env.CLOUDINARY_API_SECRET;

  try {
    // A. Missing credentials -> strict HTTP 503 with zero unsigned preset fallback
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    const missingRes = buildSignedStatusUploadPayload({
      callerUid: 'user_1',
      resourceType: 'video',
      privacyMode: 'friends',
    });
    assert.equal(missingRes.ok, false);
    assert.equal(missingRes.status, 503);
    assert.equal(missingRes.signed, false);
    assert.equal(missingRes.code, 'CLOUDINARY_UNCONFIGURED');
    assert.equal(missingRes.folder, STATUS_CLOUDINARY_FOLDER);
    assert.equal('uploadPreset' in missingRes, false);

    // B. Present credentials -> signed payload in king_status/ with authenticated vs upload deliveryType
    process.env.CLOUDINARY_API_KEY = 'test_api_key_only';
    process.env.CLOUDINARY_API_SECRET = 'test_api_secret_only';

    const signedPrivate = buildSignedStatusUploadPayload({
      callerUid: 'user_1',
      resourceType: 'video',
      privacyMode: 'friends',
    });
    assert.equal(signedPrivate.ok, true);
    assert.equal(signedPrivate.status, 200);
    assert.equal(signedPrivate.signed, true);
    assert.equal(signedPrivate.folder, 'king_status');
    assert.equal(signedPrivate.deliveryType, 'authenticated');
    if (signedPrivate.ok) {
      assert.ok(signedPrivate.signature.length >= 32, 'Signature must be generated');
      assert.equal(signedPrivate.apiKey, 'test_api_key_only');
    }

    const signedPublic = buildSignedStatusUploadPayload({
      callerUid: 'user_1',
      resourceType: 'image',
      privacyMode: 'public',
    });
    assert.equal(signedPublic.ok, true);
    assert.equal(signedPublic.deliveryType, 'upload');
  } finally {
    if (prevKey === undefined) delete process.env.CLOUDINARY_API_KEY;
    else process.env.CLOUDINARY_API_KEY = prevKey;
    if (prevSecret === undefined) delete process.env.CLOUDINARY_API_SECRET;
    else process.env.CLOUDINARY_API_SECRET = prevSecret;
  }

  // C. Firestore URL redaction for private authenticated statuses
  const redactedPrivate = sanitizeStatusUrlsForFirestore({
    privacyMode: 'friends',
    deliveryType: 'authenticated',
    mediaUrl: 'https://res.cloudinary.com/xb0o3xwi/video/authenticated/s--sig--/v1/king_status/a.mp4',
    thumbnailUrl: 'https://res.cloudinary.com/xb0o3xwi/image/authenticated/s--sig--/v1/king_status/a.jpg',
    audioTrack: {
      mode: 'custom_audio',
      label: 'Beat',
      audioUrl: 'https://res.cloudinary.com/xb0o3xwi/video/authenticated/s--sig--/v1/king_status/aud.mp3',
      cloudinaryPublicId: 'king_status/aud',
    },
  });
  assert.equal(redactedPrivate.mediaUrl, '');
  assert.equal(redactedPrivate.thumbnailUrl, '');
  assert.equal(redactedPrivate.audioTrack.audioUrl, undefined);
  assert.equal(redactedPrivate.audioTrack.cloudinaryPublicId, 'king_status/aud');

  // D. Public upload statuses preserve URLs in Firestore
  const keptPublic = sanitizeStatusUrlsForFirestore({
    privacyMode: 'public',
    deliveryType: 'upload',
    mediaUrl: 'https://res.cloudinary.com/xb0o3xwi/image/upload/v1/king_status/pub.jpg',
    thumbnailUrl: 'https://res.cloudinary.com/xb0o3xwi/image/upload/v1/king_status/pub.jpg',
    audioTrack: { mode: 'original', label: 'Original' },
  });
  assert.equal(
    keptPublic.mediaUrl,
    'https://res.cloudinary.com/xb0o3xwi/image/upload/v1/king_status/pub.jpg'
  );

  // E. Progressive/signed video delivery URL formatting
  const rawVideoUrl = 'https://res.cloudinary.com/xb0o3xwi/video/upload/v1700000000/king_status/clip.mp4';
  const optimizedUrl = getStatusVideoDeliveryUrl(rawVideoUrl, 'upload');
  assert.equal(
    optimizedUrl,
    'https://res.cloudinary.com/xb0o3xwi/video/upload/q_auto:good,f_auto/v1700000000/king_status/clip.mp4'
  );
  const signedAuthUrl =
    'https://res.cloudinary.com/xb0o3xwi/video/authenticated/s--abc123--/v1/king_status/priv.mp4';
  assert.equal(getStatusVideoDeliveryUrl(signedAuthUrl, 'authenticated'), signedAuthUrl);

  console.log('PASS: Strict 503 signed upload, king_status isolation, and URL redaction verified.');
}

function testGroupingOrderingAndExpiryFilter() {
  console.log('=== TEST 4: Grouping Ordering (Own -> Unseen -> Seen) & Expiry Pruning ===');
  const now = Date.now();
  const base: StatusRecord = {
    id: 's1',
    authorUid: 'u1',
    authorName: 'Seen Friend',
    authorPhoto: '',
    type: 'image',
    mediaUrl: 'https://example.com/1.jpg',
    thumbnailUrl: '',
    cloudinaryPublicId: '',
    cloudinaryResourceType: 'image',
    cloudinaryDeliveryType: 'upload',
    caption: '',
    textContent: '',
    bgGradient: '',
    textStyle: 'classic',
    durationSec: 6,
    audioTrack: { mode: 'original', label: 'Original' },
    privacyMode: 'friends',
    viewsCount: 0,
    likesCount: 0,
    createdAtMs: now - 5000,
    expiresAtMs: now + 3600_000,
    viewedByMe: true,
  };

  const statuses: StatusRecord[] = [
    base,
    { ...base, id: 's2', authorUid: 'u2', authorName: 'Unseen Friend', viewedByMe: false, createdAtMs: now - 2000 },
    { ...base, id: 's_me', authorUid: 'me', authorName: 'Me', viewedByMe: true, createdAtMs: now - 8000 },
    { ...base, id: 's_expired', authorUid: 'u3', authorName: 'Expired', expiresAtMs: now - 100 },
  ];

  const groups = groupStatusesByAuthor(statuses, 'me');
  assert.equal(groups.length, 3, 'Expired status must be filtered out');
  assert.equal(groups[0].authorUid, 'me', 'Own status must appear first');
  assert.equal(groups[1].authorUid, 'u2', 'Unseen author group must precede seen groups');
  assert.equal(groups[2].authorUid, 'u1', 'Seen author group must come last');
  console.log('PASS: Author grouping, ring sort order, and expired status filtering verified.');
}

function main() {
  testMax60sVideoLimit();
  testAllPrivacyModesAndBlocks();
  testSignedUploadStrictnessAndUrlRedaction();
  testGroupingOrderingAndExpiryFilter();
  console.log('\nALL STATUS SYSTEM UNIT TESTS PASSED!');
}

main();
