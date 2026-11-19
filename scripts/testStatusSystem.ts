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
import { StatusMediaOverlay, StatusRecord } from '../src/types/social';
import {
  clampOverlayPosition,
  clampOverlayScale,
  duplicateOverlayItem,
  getEditorFontClass,
  getOverlayTextDisplayStyle,
  moveOverlayLayer,
  normalizeOverlayRotation,
  resolveCanvasDimensions,
} from '../src/utils/statusCanvasExport';
import * as StatusMediaUtils from '../src/utils/statusMediaUtils';
import {
  getStatusCardThumbnailUrl,
  getStatusVideoDeliveryUrl,
  MAX_STATUS_VIDEO_SECONDS,
  normalizeStatusWhatsAppCta,
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

  // F. Status Card portrait thumbnail resolution
  const pubImgThumb = getStatusCardThumbnailUrl({
    type: 'image',
    mediaUrl: 'https://res.cloudinary.com/xb0o3xwi/image/upload/v1700000000/king_status/pic.jpg',
    cloudinaryDeliveryType: 'upload',
  });
  assert.equal(
    pubImgThumb,
    'https://res.cloudinary.com/xb0o3xwi/image/upload/w_360,h_560,c_fill,q_auto:good,f_auto/v1700000000/king_status/pic.jpg'
  );

  const pubVideoFallbackThumb = getStatusCardThumbnailUrl({
    type: 'video',
    mediaUrl: 'https://res.cloudinary.com/xb0o3xwi/video/upload/v1700000000/king_status/clip.mp4',
    cloudinaryDeliveryType: 'upload',
  });
  assert.equal(
    pubVideoFallbackThumb,
    'https://res.cloudinary.com/xb0o3xwi/video/upload/so_0,w_360,h_560,c_fill,q_auto:good/v1700000000/king_status/clip.mp4'.replace('.mp4', '.jpg')
  );

  const signedAuthThumb =
    'https://res.cloudinary.com/xb0o3xwi/video/authenticated/s--sig123--/so_0,w_480,h_800,c_fill/king_status/priv.jpg';
  assert.equal(
    getStatusCardThumbnailUrl({
      type: 'video',
      mediaUrl: signedAuthUrl,
      thumbnailUrl: signedAuthThumb,
      cloudinaryDeliveryType: 'authenticated',
    }),
    signedAuthThumb
  );

  assert.equal(
    getStatusCardThumbnailUrl({ type: 'text', mediaUrl: '', thumbnailUrl: '', cloudinaryDeliveryType: 'none' }),
    ''
  );

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

function testWhatsAppCtaAndEditorHelpers() {
  console.log('=== TEST 5: WhatsApp CTA Normalization, URL Security & Photo/Video Editor Helpers ===');

  // 1. Disabled CTA returns undefined even if phone present
  const disabled = normalizeStatusWhatsAppCta({
    enabled: false,
    phoneOrLink: '+923001234567',
    label: 'Message Me',
  });
  assert.equal(disabled.valid, true);
  assert.equal(disabled.cta, undefined);

  // 2. Formatted international phone number converts cleanly to wa.me URL
  const phoneCta = normalizeStatusWhatsAppCta({
    enabled: true,
    phoneOrLink: '+92 300-1234567',
    label: 'Order Now on WhatsApp',
  });
  assert.equal(phoneCta.valid, true);
  assert.equal(phoneCta.cta?.url, 'https://wa.me/923001234567');
  assert.equal(phoneCta.cta?.label, 'Order Now on WhatsApp');

  // 3. Valid WhatsApp domains allowed and upgraded to https
  const waLink = normalizeStatusWhatsAppCta({
    enabled: true,
    phoneOrLink: 'http://wa.me/923001234567?text=Hello',
    label: '',
  });
  assert.equal(waLink.valid, true);
  assert.equal(waLink.cta?.url, 'https://wa.me/923001234567?text=Hello');
  assert.equal(waLink.cta?.label, 'Chat on WhatsApp');

  // 4. Non-WhatsApp malicious/arbitrary links rejected
  const unsafeLink = normalizeStatusWhatsAppCta({
    enabled: true,
    phoneOrLink: 'https://evil-phishing.example.com/steal',
    label: 'Click',
  });
  assert.equal(unsafeLink.valid, false);
  assert.equal(unsafeLink.cta, undefined);

  // 5. Short invalid numbers rejected
  const shortNum = normalizeStatusWhatsAppCta({
    enabled: true,
    phoneOrLink: '1234',
    label: 'Call',
  });
  assert.equal(shortNum.valid, false);

  // 6. Photo canvas dimension solver & aspect presets + 90-degree rotation
  const portraitDims = resolveCanvasDimensions('9:16', 1920, 1080, 0, 1440);
  assert.equal(portraitDims.height, 1440);
  assert.equal(portraitDims.width, 810);

  const squareDims = resolveCanvasDimensions('1:1', 1080, 1920, 90, 1080);
  assert.equal(squareDims.width, 1080);
  assert.equal(squareDims.height, 1080);

  const rotatedOriginal = resolveCanvasDimensions('original', 1200, 800, 90, 1440);
  assert.ok(rotatedOriginal.height > rotatedOriginal.width, 'Rotating landscape by 90 deg must produce portrait original dimensions');

  assert.ok(getEditorFontClass('display').includes('uppercase'));
  assert.ok(getEditorFontClass('serif').includes('font-serif'));

  // 7. RawStatusDoc carries optional videoEdits and whatsappCta safely
  const rawWithCta = makeRawStatus({
    type: 'video',
    whatsappCta: phoneCta.cta,
    videoEdits: {
      trimStartSec: 5,
      trimEndSec: 35,
      muted: true,
      overlays: [
        { id: 'txt_1', kind: 'text', content: 'KING Drop', x: 0.5, y: 0.3, scale: 1.2, font: 'display' },
      ],
    },
  });
  assert.equal(rawWithCta.whatsappCta?.url, 'https://wa.me/923001234567');
  assert.equal(rawWithCta.videoEdits?.muted, true);
  assert.equal(rawWithCta.videoEdits?.overlays?.length, 1);

  console.log('PASS: WhatsApp CTA validation, canvas presets/rotation, and video edits verified.');
}

function testOverlayTextToolsAndLayerControls() {
  console.log('=== TEST 6: Text Color, Positioning/Clamping, Rotation, Resize & Layer Controls ===');

  // 1. Add two independent text layers
  let layers: StatusMediaOverlay[] = [
    {
      id: 'txt_a',
      kind: 'text',
      content: 'First Title',
      x: 0.5,
      y: 0.42,
      scale: 1,
      rotation: 0,
      font: 'sans',
      color: '#ffffff',
      bold: true,
      italic: false,
      align: 'center',
      bgMode: 'dark',
      effect: 'shadow',
    },
    {
      id: 'txt_b',
      kind: 'text',
      content: 'Second Subtitle',
      x: 0.5,
      y: 0.58,
      scale: 1,
      rotation: 0,
      font: 'serif',
      color: '#facc15',
      bold: false,
      italic: true,
      align: 'left',
      bgMode: 'none',
      effect: 'outline',
    },
  ];

  // 2. Color change on txt_a: White -> Red -> Blue -> Custom Teal, without mutating txt_b
  layers = layers.map((l) => (l.id === 'txt_a' ? { ...l, color: '#ef4444' } : l));
  assert.equal(layers[0].color, '#ef4444');
  assert.equal(layers[1].color, '#facc15');

  layers = layers.map((l) => (l.id === 'txt_a' ? { ...l, color: '#3b82f6' } : l));
  assert.equal(layers[0].color, '#3b82f6');

  layers = layers.map((l) =>
    l.id === 'txt_a' ? { ...l, color: '#14b8a6', bgMode: 'custom', bgColor: '#4c0519' } : l
  );
  const styleA = getOverlayTextDisplayStyle(layers[0]);
  assert.equal(styleA.color, '#14b8a6');
  assert.equal(styleA.backgroundColor, '#4c0519');
  assert.equal(styleA.fontWeight, 800);

  const styleB = getOverlayTextDisplayStyle(layers[1]);
  assert.equal(styleB.color, '#facc15');
  assert.equal(styleB.fontStyle, 'italic');
  assert.ok(String(styleB.textShadow || '').includes('#000'));

  // 3. Dragging L/R/U/D & clamping inside stage (never stuck outside canvas)
  const movedLeftUp = clampOverlayPosition(0.5 - 0.8, 0.42 - 0.9);
  assert.equal(movedLeftUp.x, 0.06, 'Left drag must clamp cleanly at 0.06');
  assert.equal(movedLeftUp.y, 0.06, 'Up drag must clamp cleanly at 0.06');

  const movedRightDown = clampOverlayPosition(0.5 + 0.9, 0.42 + 0.9);
  assert.equal(movedRightDown.x, 0.94, 'Right drag must clamp cleanly at 0.94');
  assert.equal(movedRightDown.y, 0.94, 'Down drag must clamp cleanly at 0.94');

  // 4. Resize & Rotate bounds
  assert.equal(clampOverlayScale(1.85), 1.85);
  assert.equal(clampOverlayScale(5), 2.8);
  assert.equal(normalizeOverlayRotation(200), -160);
  assert.equal(normalizeOverlayRotation(-210), 150);
  assert.equal(normalizeOverlayRotation(45), 45);

  // 5. Duplicate & Layer ordering (Forward / Backward / Front / Back)
  const dup = duplicateOverlayItem(layers, 'txt_a', 'txt_a_copy');
  assert.equal(dup.duplicatedId, 'txt_a_copy');
  assert.equal(dup.overlays.length, 3);
  assert.deepEqual(
    dup.overlays.map((o) => o.id),
    ['txt_a', 'txt_b', 'txt_a_copy']
  );

  // Send txt_a_copy backward -> ['txt_a', 'txt_a_copy', 'txt_b']
  const afterBackOne = moveOverlayLayer(dup.overlays, 'txt_a_copy', 'backward');
  assert.deepEqual(
    afterBackOne.map((o) => o.id),
    ['txt_a', 'txt_a_copy', 'txt_b']
  );

  // Bring txt_a to front -> ['txt_a_copy', 'txt_b', 'txt_a']
  const afterFront = moveOverlayLayer(afterBackOne, 'txt_a', 'front');
  assert.deepEqual(
    afterFront.map((o) => o.id),
    ['txt_a_copy', 'txt_b', 'txt_a']
  );

  // Send txt_a to back -> ['txt_a', 'txt_a_copy', 'txt_b']
  const afterBackAll = moveOverlayLayer(afterFront, 'txt_a', 'back');
  assert.deepEqual(
    afterBackAll.map((o) => o.id),
    ['txt_a', 'txt_a_copy', 'txt_b']
  );

  // Bring txt_a forward -> ['txt_a_copy', 'txt_a', 'txt_b']
  const afterFwdOne = moveOverlayLayer(afterBackAll, 'txt_a', 'forward');
  assert.deepEqual(
    afterFwdOne.map((o) => o.id),
    ['txt_a_copy', 'txt_a', 'txt_b']
  );

  console.log('PASS: Text colors, custom BG, clamping, resize, rotation & layer ordering verified.');
}

function main() {
  testMax60sVideoLimit();
  testAllPrivacyModesAndBlocks();
  testSignedUploadStrictnessAndUrlRedaction();
  testGroupingOrderingAndExpiryFilter();
  testWhatsAppCtaAndEditorHelpers();
  testOverlayTextToolsAndLayerControls();
  console.log('\nALL STATUS SYSTEM UNIT TESTS PASSED!');
}

main();
