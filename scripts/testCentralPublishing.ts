import fs from 'node:fs';
import path from 'node:path';
import {
  AUTHORIZED_ADMIN_EMAIL,
  canUserManageItem,
  deduplicateByKeys,
  isGameApprovedAndPublished,
  isVideoPublished,
  mergeHomeSocialFeed,
  mergeUnifiedLatestFeed,
  validateGalleryMediaFile,
} from '../src/services/centralContentService';
import { DEFAULT_DEMO_PRODUCTS, generateWhatsAppOrderUrl } from '../src/services/catalogService';
import { DailyGame } from '../src/services/dailyGameSync';
import { CatalogProduct } from '../src/types/catalog';
import { UserPost } from '../src/types/content';

let passed = 0;
let total = 0;

function assert(cond: boolean, desc: string) {
  total++;
  if (cond) {
    console.log(`[PASS] Test ${total}: ${desc}`);
    passed++;
  } else {
    console.error(`[FAIL] Test ${total}: ${desc}`);
    process.exitCode = 1;
  }
}

console.log('==================================================================');
console.log('KING APP — CENTRALIZED CONTENT PUBLISHING & SECURITY VERIFICATION');
console.log('==================================================================\n');

// 1. Daraz Affiliate Removal Check across active source & rules
const filesToScan: string[] = [];
function collectFiles(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full);
    else if (/\.(ts|tsx|js|jsx|rules|html)$/.test(entry.name)) filesToScan.push(full);
  }
}
collectFiles(path.resolve('src'));
collectFiles(path.resolve('api'));
const rulesText = fs.readFileSync(path.resolve('firestore.rules'), 'utf-8');
const serverText = fs.readFileSync(path.resolve('server.ts'), 'utf-8');

const darazHits: string[] = [];
for (const file of filesToScan) {
  const txt = fs.readFileSync(file, 'utf-8');
  if (/daraz|king_affiliates|affiliateBanner|AffiliateBanner/i.test(txt)) {
    darazHits.push(file);
  }
}
if (/daraz|king_affiliates/i.test(rulesText)) darazHits.push('firestore.rules');
if (/daraz|king_affiliates/i.test(serverText)) darazHits.push('server.ts');

assert(darazHits.length === 0, `Zero Daraz/Affiliate references remain across src/, api/, server.ts, and firestore.rules (found: ${darazHits.length})`);

// 2. Gallery upload MIME & size validation
const validImg = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' });
const validVid = new File(['abc'], 'clip.mp4', { type: 'video/mp4' });
const invalidExe = new File(['abc'], 'bad.exe', { type: 'application/x-msdownload' });
const bigImg = new File([new ArrayBuffer(11 * 1024 * 1024)], 'huge.png', { type: 'image/png' });

assert(
  validateGalleryMediaFile(validImg).valid && validateGalleryMediaFile(validImg).mediaType === 'photo',
  'Validates gallery image upload as photo'
);
assert(
  validateGalleryMediaFile(validVid).valid && validateGalleryMediaFile(validVid).mediaType === 'video',
  'Validates gallery video upload as video'
);
assert(!validateGalleryMediaFile(invalidExe).valid, 'Rejects unsupported executable/document MIME type');
assert(!validateGalleryMediaFile(bigImg).valid, 'Rejects image exceeding 10MB limit');

// 3. Centralized Photo vs Video routing & deduplication
const samplePhotos: UserPost[] = [
  {
    id: 'post-1',
    contentType: 'photo',
    publicationStatus: 'published',
    authorUid: 'userA',
    authorName: 'Ayesha',
    authorPhoto: '',
    mediaUrl: 'https://res.cloudinary.com/xb0o3xwi/image/upload/v1/p1.jpg',
    thumbnailUrl: 'https://res.cloudinary.com/xb0o3xwi/image/upload/v1/p1.jpg',
    caption: 'Match day photo',
    likesCount: 2,
    commentsCount: 1,
    createdAt: 1700000000500,
  },
  {
    id: 'post-hidden',
    contentType: 'photo',
    publicationStatus: 'unpublished',
    authorUid: 'userA',
    authorName: 'Ayesha',
    authorPhoto: '',
    mediaUrl: 'https://res.cloudinary.com/xb0o3xwi/image/upload/v1/p_hidden.jpg',
    thumbnailUrl: '',
    caption: 'Hidden post',
    likesCount: 0,
    commentsCount: 0,
    createdAt: 1700000000600,
  },
];

const sampleVideos = [
  {
    id: 'vid-1',
    title: 'KING Gameplay Highlight',
    videoUrl: 'https://res.cloudinary.com/xb0o3xwi/video/upload/v1/v1.mp4',
    url: 'https://res.cloudinary.com/xb0o3xwi/video/upload/v1/v1.mp4',
    userId: 'userB',
    uid: 'userB',
    uploaderName: 'Bilal',
    likes: 5,
    views: 20,
    publicationStatus: 'published',
    createdAt: 1700000000700,
  },
  {
    id: 'vid-1-dup',
    title: 'Duplicate URL Video',
    videoUrl: 'https://res.cloudinary.com/xb0o3xwi/video/upload/v1/v1.mp4',
    userId: 'userB',
    publicationStatus: 'published',
    createdAt: 1700000000700,
  },
  {
    id: 'vid-unpublished',
    title: 'Unpublished Video',
    videoUrl: 'https://res.cloudinary.com/xb0o3xwi/video/upload/v1/v_hidden.mp4',
    userId: 'userB',
    publicationStatus: 'unpublished',
    createdAt: 1700000000800,
  },
];

const mergedFeed = mergeHomeSocialFeed(samplePhotos, sampleVideos);
assert(mergedFeed.length === 2, 'Home feed contains exactly 1 published photo + 1 published deduplicated video');
assert(mergedFeed[0].id === 'vid-1' && mergedFeed[0].sourceCollection === 'videos', 'Published video appears on Home feed sorted newest first');
assert(mergedFeed[1].id === 'post-1' && mergedFeed[1].sourceCollection === 'user_posts', 'Published photo appears on Home feed');
assert(!mergedFeed.some((i) => i.id === 'post-hidden' || i.id === 'vid-unpublished'), 'Unpublished photo/video excluded from Home feed');
assert(isVideoPublished(sampleVideos[0]) && !isVideoPublished(sampleVideos[2]), 'Videos Section filter keeps published videos and excludes unpublished videos');

// 4. KING SHOP Products Sync & Deduplication
const dupProducts = [...DEFAULT_DEMO_PRODUCTS, { ...DEFAULT_DEMO_PRODUCTS[0] }, { ...DEFAULT_DEMO_PRODUCTS[1], isActive: false }];
const activeUniqueProducts = deduplicateByKeys(
  dupProducts.filter((p) => p.isActive !== false),
  (p) => [p.id]
);
assert(activeUniqueProducts.length === DEFAULT_DEMO_PRODUCTS.length, 'Products deduplicate cleanly across Home & Catalog and hide inactive drafts');
assert(generateWhatsAppOrderUrl(activeUniqueProducts[0]).includes('https://wa.me/923258448284'), 'Preserves direct WhatsApp ordering link for KING SHOP products');

// 5. Centralized Game Moderation Filtering
assert(isGameApprovedAndPublished({ status: 'approved', approved: true, isApproved: true }), 'Approves explicitly approved game');
assert(!isGameApprovedAndPublished({ status: 'pending', approved: false }), 'Hides pending game from Home & GamesView');
assert(!isGameApprovedAndPublished({ status: 'rejected', approved: false }), 'Hides rejected game from Home & GamesView');
assert(!isGameApprovedAndPublished({ status: 'unpublished', approved: false, isApproved: false }), 'Hides unpublished game from Home & GamesView');

// 6. Ownership & Security Rules Assertions
assert(canUserManageItem('userA', { uid: 'userA', email: 'a@test.com', emailVerified: true }), 'Post owner can manage/delete own post');
assert(!canUserManageItem('userA', { uid: 'userB', email: 'b@test.com', emailVerified: true }), 'Non-owner rejected from deleting another user post');
assert(canUserManageItem('userA', { uid: 'adminUid', email: AUTHORIZED_ADMIN_EMAIL, emailVerified: true }), 'Verified Super Admin can moderate content');
assert(
  rulesText.includes('request.auth.token.email_verified == true'),
  'Firestore rules enforce email_verified == true on isSuperAdmin()'
);
assert(
  !rulesText.includes('match /king_affiliates/') &&
    rulesText.includes('match /user_posts/{postId}') &&
    rulesText.includes('match /comments/{commentId}'),
  'Firestore rules remove king_affiliates and define validated user_posts & comments rules'
);

// 7. Part 1: Inline Home composer removed & Header Post (+) button wired cleanly
const homeViewSrc = fs.readFileSync(path.resolve('src/components/HomeView.tsx'), 'utf-8');
const topHeaderSrc = fs.readFileSync(path.resolve('src/components/TopHeader.tsx'), 'utf-8');
const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf-8');

assert(
  !homeViewSrc.includes('<SocialPostComposer') && !homeViewSrc.includes('Share a photo or video to KING Feed'),
  'Large inline SocialPostComposer is removed from HomeView.tsx'
);
assert(
  topHeaderSrc.includes('onOpenPost') && topHeaderSrc.includes('aria-label="Create Post"') && appSrc.includes('<SocialPostComposer'),
  'TopHeader renders blue Post (+) button and App mounts shared SocialPostComposer modal'
);
const statusBarIdx = homeViewSrc.indexOf('<StatusBar');
const latestSectionIdx = homeViewSrc.indexOf('id="latest-on-king-section"');
const kingShopIdx = homeViewSrc.indexOf('<span>KING SHOP</span>');
assert(
  statusBarIdx !== -1 && latestSectionIdx > statusBarIdx && latestSectionIdx < kingShopIdx,
  'Unified Latest on KING section appears immediately below StatusBar on HomeView'
);

const indexCssSrc = fs.readFileSync(path.resolve('src/index.css'), 'utf-8');
assert(
  !indexCssSrc.includes('.king-sticky-top-header'),
  'Global sticky header CSS override (.king-sticky-top-header) removed from index.css'
);
assert(
  topHeaderSrc.includes("fixed ? 'fixed top-0 left-0 right-0 z-30' : 'relative z-20'") &&
    appSrc.includes('fixed={isHomeTab}') &&
    appSrc.includes('isHeaderAllowedTab && !hasAnyOverlay'),
  'TopHeader is fixed only on HomeView, scoped to Home/Games/Videos/Library tabs, and hidden during overlays'
);
assert(
  homeViewSrc.includes('bg-[#F0F2F5]') &&
    homeViewSrc.includes('pt-[60px]') &&
    homeViewSrc.includes('bg-white border border-slate-200') &&
    homeViewSrc.includes('onFullScreenOverlayChange'),
  'HomeView uses Facebook-style light canvas (#F0F2F5), fixed-header clearance (pt-[60px]), compact white cards, and overlay notification'
);

// 8. Part 2: Unified "Latest on KING" newest-first ordering across Photo, Video, Product, Approved Game + dedup + filtering
const realProducts: CatalogProduct[] = [
  {
    id: 'real-prod-new',
    name: 'Pro Esports Controller',
    description: 'Low-latency gamepad',
    originalPrice: 9500,
    discountPrice: 7499,
    stock: 15,
    category: 'Gaming',
    imageUrls: ['https://res.cloudinary.com/xb0o3xwi/image/upload/v1/pad.jpg'],
    videoUrls: [],
    isActive: true,
    createdAt: '2026-11-17T10:00:00.000Z',
    updatedAt: '2026-11-17T10:00:00.000Z',
  },
  {
    id: 'real-prod-inactive',
    name: 'Hidden Draft Item',
    description: 'Should not appear',
    originalPrice: 5000,
    stock: 0,
    category: 'Gaming',
    imageUrls: ['https://res.cloudinary.com/xb0o3xwi/image/upload/v1/draft.jpg'],
    videoUrls: [],
    isActive: false,
    createdAt: '2026-11-17T12:00:00.000Z',
    updatedAt: '2026-11-17T12:00:00.000Z',
  },
  ...DEFAULT_DEMO_PRODUCTS, // Synthetic demo fallback products must NOT hijack Latest on KING
];

const sampleGames: DailyGame[] = [
  {
    id: 'game-approved-latest',
    title: 'Neon Drift Racer',
    url: 'https://play.gamepix.com/neon-drift/embed',
    thumbnail: 'https://games.assets.gamepix.com/neon/thumb.png',
    category: 'Racing',
    source: 'GamePix',
    status: 'approved',
    approved: true,
    isApproved: true,
    featuredOnHome: true,
    rating: 4.9,
    addedAt: Date.parse('2026-11-17T11:30:00.000Z'),
  },
  {
    id: 'game-dup-url',
    title: 'Neon Drift Racer Duplicate',
    url: 'https://play.gamepix.com/neon-drift/embed',
    thumbnail: 'https://games.assets.gamepix.com/neon/thumb.png',
    category: 'Racing',
    source: 'GamePix',
    status: 'approved',
    approved: true,
    isApproved: true,
    featuredOnHome: true,
    addedAt: Date.parse('2026-11-17T11:30:00.000Z'),
  },
  {
    id: 'game-pending',
    title: 'Pending Stealth Game',
    url: 'https://play.gamepix.com/pending/embed',
    thumbnail: '',
    category: 'Action',
    source: 'GamePix',
    status: 'pending' as any,
    approved: false,
    isApproved: false,
    featuredOnHome: false,
    addedAt: Date.parse('2026-11-17T12:30:00.000Z'),
  },
];

const timedPosts: UserPost[] = [
  {
    ...samplePhotos[0],
    id: 'photo-newest',
    createdAt: Date.parse('2026-11-17T11:45:00.000Z'),
  },
  samplePhotos[1], // unpublished -> excluded
];

const timedVideos = [
  {
    ...sampleVideos[0],
    id: 'video-first',
    createdAt: Date.parse('2026-11-17T11:00:00.000Z'),
  },
  sampleVideos[2], // unpublished -> excluded
];

const unifiedLatest = mergeUnifiedLatestFeed({
  posts: timedPosts,
  videos: timedVideos,
  products: realProducts,
  games: sampleGames,
});

assert(
  unifiedLatest.length === 4,
  `Unified feed includes all 4 published sources without duplicates, drafts, pending, or synthetic demo fallbacks (got ${unifiedLatest.length})`
);
assert(
  unifiedLatest.map((e) => `${e.kind}:${e.id}`).join(',') ===
    'photo:photo-newest,game:game-approved-latest,video:video-first,product:real-prod-new',
  'Unified feed sorts strictly newest-first across photo (11:45), approved game (11:30), video (11:00), and product (10:00)'
);
assert(
  !unifiedLatest.some((e) => e.id.startsWith('demo-prod-') || e.id.includes('pending') || e.id.includes('inactive') || e.id.includes('hidden') || e.id.includes('unpublished')),
  'Excludes pending games, inactive products, unpublished media, and demo fallback placeholders'
);

console.log(`\n==================================================================`);
console.log(`CENTRALIZED PUBLISHING VERIFICATION SUMMARY: ${passed} / ${total} PASSED`);
console.log(`==================================================================\n`);
