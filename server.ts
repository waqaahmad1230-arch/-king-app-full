import express from 'express';
import path from 'path';
import fs from 'fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  buildSignedStatusUploadPayload,
  handleDeleteSingleStatusServer,
  handleFetchAuthorizedStatusFeed,
  handleRunExpiredStatusCleanup,
  verifyFirebaseBearerToken,
} from './api/_lib/statusBackend.ts';
import {
  fetchLiveModelsFromGoogleApi,
  getAdminAiStateAsync,
  getPublicAiCapabilityStatusAsync,
  handleAdminAddKey,
  handleAdminDeleteKey,
  handleAdminUpdateKey,
  handleAdminUpdateModels,
  handleAutoRoutedAiRequest,
  handlePostAiPhotoEdit,
  handlePostAiTextGenerate,
  sendNormalizedAiJson,
  testSpecificKeyLive,
  testSpecificModelLive,
} from './server/aiBackend.ts';
import { scrubSecretText } from './server/aiVault.ts';

const app = express();
app.set('trust proxy', 1);

const EXTRA_CORS_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const TRUSTED_CORS_ORIGINS = new Set(
  [
    (process.env.APP_URL || '').trim().replace(/\/+$/, ''),
    'https://king-5f52e.web.app',
    'https://king-5f52e.firebaseapp.com',
    'https://king-app-full.vercel.app',
    'http://localhost:3000',
    ...EXTRA_CORS_ORIGINS,
  ].filter(Boolean)
);

app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && TRUSTED_CORS_ORIGINS.has(origin.replace(/\/+$/, ''))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-filename');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// --- FIREBASE ADMIN SDK INITIALIZATION (SINGLETON) ---
const FIREBASE_PROJECT_ID = 'king-5f52e';
const SUPER_ADMIN_EMAIL = 'waqaahmad1230@gmail.com';
const ALLOWED_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];

// Initialize Firebase Admin only once
const adminApp = (() => {
  if (getApps().length > 0) {
    return getApps()[0];
  }
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    try {
      const parsed = JSON.parse(serviceAccountKey);
      console.log('[Firebase Admin] Initialized with Service Account Key');
      return initializeApp({
        credential: cert(parsed),
        projectId: FIREBASE_PROJECT_ID,
      });
    } catch (e) {
      console.warn('[Firebase Admin] Service account parse failed, using ADC/Project ID:', e);
      return initializeApp({ projectId: FIREBASE_PROJECT_ID });
    }
  }
  console.log(`[Firebase Admin] Initialized with Project ID "${FIREBASE_PROJECT_ID}" (ADC)`);
  return initializeApp({ projectId: FIREBASE_PROJECT_ID });
})();

// Official Firebase Admin wrapper conforming to admin.auth().verifyIdToken()
const admin = {
  auth: () => getAuth(adminApp),
};

// --- RATE LIMITING MIDDLEWARE FACTORY ---
function createRateLimiter(options: { windowMs: number; maxRequests: number; message: string }) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  // Cleanup expired entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of requests.entries()) {
      if (now > value.resetTime) {
        requests.delete(key);
      }
    }
  }, options.windowMs);

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let record = requests.get(ip);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + options.windowMs };
      requests.set(ip, record);
      return next();
    }

    record.count++;
    if (record.count > options.maxRequests) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: {
          status: 429,
          message: options.message,
          retryAfter: retryAfterSec,
        },
      });
    }

    next();
  };
}

const uploadRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
  message: 'Upload rate limit exceeded. Please wait before uploading more videos.',
});

const gameSyncRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  message: 'Game sync rate limit exceeded. Please wait a moment.',
});

const generalApiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  message: 'API rate limit exceeded. Please slow down.',
});

// --- TOKEN VERIFICATION (FIREBASE ADMIN SDK + RESILIENT FALLBACK) ---
interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

async function verifyFirebaseToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  if (!idToken || typeof idToken !== 'string') return null;

  // 1. Primary: Official Firebase Admin SDK token verification
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (decoded && decoded.uid) {
      return {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: Boolean(decoded.email_verified),
        name: (decoded as any).name,
      };
    }
  } catch (adminErr: any) {
    // Log token verification failures for debugging
    if (adminErr?.code !== 'auth/argument-error' && adminErr?.code !== 'auth/invalid-id-token') {
      console.warn('[Firebase Admin] verifyIdToken notice:', adminErr?.code || adminErr?.message);
    }
  }

  // 2. Resilient Fallback: Google OIDC tokeninfo service
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (data.error) return null;
    if (data.aud !== FIREBASE_PROJECT_ID || data.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
      return null;
    }
    const exp = Number(data.exp);
    if (!exp || exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return {
      uid: data.sub || data.user_id,
      email: data.email,
      emailVerified: data.email_verified === true || data.email_verified === 'true',
      name: data.name,
    };
  } catch (err) {
    console.warn('[Auth Middleware] Token verification failed:', err);
    return null;
  }
}

// Authentication Middleware: rejects missing or invalid tokens with HTTP 401
const authenticateFirebaseToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'Authentication required. Missing Bearer token.' } });
  }
  const token = authHeader.substring(7).trim();
  if (!token) {
    return res.status(401).json({ error: { message: 'Authentication required. Token empty.' } });
  }
  const user = await verifyFirebaseToken(token);
  if (!user) {
    return res.status(401).json({ error: { message: 'Invalid or expired authentication token.' } });
  }
  (req as any).user = user;
  next();
};

// Super Admin Authorization Middleware: rejects non-admins or unverified emails with HTTP 403
const requireSuperAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user as VerifiedFirebaseUser | undefined;
  if (!user || user.email !== SUPER_ADMIN_EMAIL || user.emailVerified !== true) {
    return res.status(403).json({ error: { message: 'Access denied. Verified Super Admin privileges required.' } });
  }
  next();
};

// Video MIME-Type Validation Middleware: rejects unsupported formats with HTTP 400
const validateVideoMimeType = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const rawType = (req.headers['content-type'] as string) || '';
  const cleanMime = rawType.split(';')[0].trim().toLowerCase();
  if (!ALLOWED_VIDEO_MIMES.includes(cleanMime)) {
    return res.status(400).json({
      error: {
        message: `Invalid or unsupported video MIME type: "${rawType}". Allowed types: ${ALLOWED_VIDEO_MIMES.join(', ')}`,
      },
    });
  }
  next();
};

// Route-specific raw buffer parser (allocated ONLY for authenticated, validated video uploads)
const videoBodyParser = express.raw({
  type: ALLOWED_VIDEO_MIMES,
  limit: '100mb',
});

// TASK 1 & TASK 2: Authenticated, Validated, and Rate-Limited Cloudinary Video Upload Proxy
app.post(
  '/api/upload-video',
  uploadRateLimiter,
  authenticateFirebaseToken,
  validateVideoMimeType,
  videoBodyParser,
  async (req, res) => {
    try {
      const filename = (req.headers['x-filename'] as string) || 'video.mp4';
      const mimeType = ((req.headers['content-type'] as string) || 'video/mp4').split(';')[0].trim();
      const buffer = req.body;

      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: { message: 'No video payload received' } });
      }

      const formData = new FormData();
      const blob = new Blob([buffer], { type: mimeType });
      formData.append('file', blob, filename);
      formData.append('upload_preset', 'kingtube');

      const cldResponse = await fetch('https://api.cloudinary.com/v1_1/xb0o3xwi/video/upload', {
        method: 'POST',
        body: formData,
      });

      const cldData = await cldResponse.json();
      return res.status(cldResponse.status).json(cldData);
    } catch (error: any) {
      console.error('Server upload error:', error);
      return res.status(500).json({ error: { message: error.message || 'Internal upload proxy error' } });
    }
  }
);

// --- DAILY AUTO GAME UPDATE (GamePix SID: 8PP5G) ---
let serverGameCache: { games: any[]; lastSync: number; offset: number } = {
  games: [],
  lastSync: 0,
  offset: 0,
};

async function syncGamePixDaily() {
  try {
    const offset = serverGameCache.offset;
    const url = `https://games.gamepix.com/games?sid=PN8G3&limit=5&order=d&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const json = (await res.json()) as any;
    if (json.data && Array.isArray(json.data) && json.data.length > 0) {
      const newGames = json.data.map((item: any) => ({
        id: `gpx-${item.id}`,
        title: (item.title || 'GamePix Game').trim(),
        name: (item.title || 'GamePix Game').trim(),
        url: item.url,
        link: item.url,
        thumbnail: item.thumbnailUrl || item.thumbnailUrl100,
        image: item.thumbnailUrl || item.thumbnailUrl100,
        category: item.category || 'Arcade',
        description: item.description || '',
        source: 'GamePix',
        status: 'approved',
        approved: true,
        isApproved: true,
        isNewToday: true,
        addedAt: Date.now(),
      }));

      // Keep old games, add new games on top (Rule 4)
      const existing = serverGameCache.games.filter(
        (g: any) => !newGames.some((ng: any) => ng.url === g.url || ng.id === g.id)
      );
      serverGameCache = {
        games: [...newGames, ...existing],
        lastSync: Date.now(),
        offset: offset + 5,
      };
      console.log(`[GamePix Daily] Synced 5 new games (offset ${offset}). Total in memory: ${serverGameCache.games.length}`);
    }
  } catch (err) {
    console.warn('[GamePix Daily] Sync failed:', err);
  }
}

// Proxy endpoint for client
app.get('/_healthz', (_req, res) => res.status(200).send('OK'));
app.get('/health', (_req, res) => res.status(200).send('OK'));

app.get('/api/games/daily', generalApiRateLimiter, async (req, res) => {
  const reqOffset = Number(req.query.offset || 0);
  try {
    const url = `https://games.gamepix.com/games?sid=PN8G3&limit=5&order=d&offset=${reqOffset}`;
    const response = await fetch(url);
    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    return res.json({
      data: serverGameCache.games.slice(0, 5),
      lastSync: serverGameCache.lastSync,
    });
  }
});

// TASK 3: Authenticated, Super-Admin Restricted Game Sync Endpoint
app.post(
  '/api/games/sync-now',
  gameSyncRateLimiter,
  authenticateFirebaseToken,
  requireSuperAdmin,
  async (_req, res) => {
    await syncGamePixDaily();
    return res.json({
      success: true,
      lastSync: serverGameCache.lastSync,
      totalGames: serverGameCache.games.length,
      games: serverGameCache.games,
    });
  }
);

// Proxy endpoint for GamePix top 20 trending feed (property PN8G3)
app.get('/api/games/gamepix-trending', async (req, res) => {
  const limit = Number(req.query.limit) || 20;
  const order = req.query.order || 'd';
  try {
    const url = `https://games.gamepix.com/games?sid=PN8G3&limit=${limit}&order=${order}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    }
    return res.status(502).json({ error: `GamePix API responded with status ${response.status}` });
  } catch (err: any) {
    console.warn('[GamePix Trending API] Fetch error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch GamePix feed' });
  }
});

// --- STATUS SYSTEM BACKEND ENDPOINTS (Mirrors Vercel /api/status/* serverless functions) ---
app.get('/api/status/feed', generalApiRateLimiter, authenticateFirebaseToken, async (req, res) => {
  try {
    const user = (req as any).user as VerifiedFirebaseUser;
    const result = await handleFetchAuthorizedStatusFeed(user.uid);
    return res.status(result.status).json(result);
  } catch (err: any) {
    console.error('[server.ts /api/status/feed] Error:', err);
    return res.status(500).json({ error: err?.message || 'Status feed error' });
  }
});

app.post(
  '/api/status/sign-upload',
  generalApiRateLimiter,
  express.json({ limit: '16kb' }),
  authenticateFirebaseToken,
  (req, res) => {
    const user = (req as any).user as VerifiedFirebaseUser;
    const payload = buildSignedStatusUploadPayload({
      callerUid: user.uid,
      resourceType: req.body?.resourceType,
      privacyMode: req.body?.privacyMode,
    });
    return res.status(payload.status).json(payload);
  }
);

app.all('/api/status/cleanup', generalApiRateLimiter, express.json({ limit: '16kb' }), async (req, res) => {
  try {
    const caller = await verifyFirebaseBearerToken(req.headers.authorization);
    const statusId =
      (typeof req.query?.statusId === 'string' && req.query.statusId) ||
      (typeof req.body?.statusId === 'string' && req.body.statusId) ||
      '';

    if (statusId && (req.method === 'DELETE' || req.method === 'POST')) {
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const delRes = await handleDeleteSingleStatusServer(statusId.trim(), caller);
      return res.status(delRes.status).json(delRes);
    }

    const cleanupRes = await handleRunExpiredStatusCleanup({
      authHeader: req.headers.authorization,
      caller,
    });
    return res.status(cleanupRes.status).json(cleanupRes);
  } catch (err: any) {
    console.error('[server.ts /api/status/cleanup] Error:', err);
    return res.status(500).json({ error: err?.message || 'Status cleanup error' });
  }
});

// --- KING AI BACKEND ENDPOINTS (Native Node.js / Express) ---
app.get('/api/ai/status', generalApiRateLimiter, async (_req, res) => {
  try {
    return res.status(200).json(await getPublicAiCapabilityStatusAsync());
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: scrubSecretText(err?.message || 'Status error') });
  }
});

app.get('/api/post-editor/ai-edit', generalApiRateLimiter, async (_req, res) => {
  try {
    return res.status(200).json(await getPublicAiCapabilityStatusAsync());
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: scrubSecretText(err?.message || 'Status error') });
  }
});

app.post(
  '/api/post-editor/ai-edit',
  generalApiRateLimiter,
  express.json({ limit: '15mb' }),
  async (req, res) => {
    try {
      const result = await handlePostAiPhotoEdit({
        authHeader: req.headers.authorization,
        body: req.body,
      });
      return sendNormalizedAiJson(res, result.status, result.payload, { requireImage: true });
    } catch (err: any) {
      const safeErr = scrubSecretText(err?.message || 'Unexpected AI editor server error.');
      console.error('[server.ts /api/post-editor/ai-edit] Error:', safeErr);
      return sendNormalizedAiJson(res, 500, {
        ok: false,
        code: 'POST_AI_INTERNAL_ERROR',
        error: safeErr,
      });
    }
  }
);

app.post(
  '/api/ai/text-generate',
  generalApiRateLimiter,
  express.json({ limit: '1mb' }),
  async (req, res) => {
    try {
      const result = await handlePostAiTextGenerate({
        authHeader: req.headers.authorization,
        body: req.body,
      });
      return sendNormalizedAiJson(res, result.status, result.payload, { requireText: true });
    } catch (err: any) {
      const safeErr = scrubSecretText(err?.message || 'Unexpected AI text generation error.');
      console.error('[server.ts /api/ai/text-generate] Error:', safeErr);
      return sendNormalizedAiJson(res, 500, {
        ok: false,
        code: 'TEXT_AI_INTERNAL_ERROR',
        error: safeErr,
      });
    }
  }
);

app.get('/api/ai/route', generalApiRateLimiter, async (_req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(await getPublicAiCapabilityStatusAsync());
  } catch (err: any) {
    return sendNormalizedAiJson(res, 500, {
      ok: false,
      error: scrubSecretText(err?.message || 'Status error'),
    });
  }
});

app.post(
  '/api/ai/route',
  generalApiRateLimiter,
  express.json({ limit: '15mb' }),
  async (req, res) => {
    try {
      const result = await handleAutoRoutedAiRequest({
        authHeader: req.headers.authorization,
        body: req.body,
      });
      const domain = result?.payload?.routing?.domain;
      return sendNormalizedAiJson(res, result.status, result.payload, {
        requireImage: domain === 'image',
        requireText: domain === 'text',
      });
    } catch (err: any) {
      const safeErr = scrubSecretText(err?.message || 'Unexpected AI routing server error.');
      console.error('[server.ts /api/ai/route] Error:', safeErr);
      return sendNormalizedAiJson(res, 500, {
        ok: false,
        code: 'AI_ROUTE_INTERNAL_ERROR',
        error: safeErr,
      });
    }
  }
);

// --- ADMIN AI MODEL MANAGER & ENCRYPTED KEY VAULT ENDPOINTS (Super Admin Only) ---
app.get(
  '/api/admin/ai/state',
  generalApiRateLimiter,
  authenticateFirebaseToken,
  requireSuperAdmin,
  async (_req, res) => {
    try {
      return res.status(200).json(await getAdminAiStateAsync());
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: scrubSecretText(err?.message || 'Failed to load AI state') });
    }
  }
);

app.post(
  '/api/admin/ai/models',
  generalApiRateLimiter,
  express.json({ limit: '64kb' }),
  authenticateFirebaseToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const result = await handleAdminUpdateModels(req.body || {});
      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: scrubSecretText(err?.message || 'Invalid model configuration') });
    }
  }
);

app.post(
  '/api/admin/ai/keys',
  generalApiRateLimiter,
  express.json({ limit: '64kb' }),
  authenticateFirebaseToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const result = await handleAdminAddKey({
        label: String(req.body?.label || ''),
        apiKey: String(req.body?.apiKey || ''),
        priority: req.body?.priority !== undefined ? Number(req.body.priority) : undefined,
        projectId: typeof req.body?.projectId === 'string' ? req.body.projectId : undefined,
      });
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: scrubSecretText(err?.message || 'Could not save API key.') });
    }
  }
);

app.patch(
  '/api/admin/ai/keys/:id',
  generalApiRateLimiter,
  express.json({ limit: '64kb' }),
  authenticateFirebaseToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const result = await handleAdminUpdateKey(String(req.params.id || ''), req.body || {});
      if (!result) {
        return res.status(404).json({ ok: false, error: 'Key slot not found.' });
      }
      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: scrubSecretText(err?.message || 'Could not update API key.') });
    }
  }
);

app.delete(
  '/api/admin/ai/keys/:id',
  generalApiRateLimiter,
  authenticateFirebaseToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const result = await handleAdminDeleteKey(String(req.params.id || ''));
      if (!result) {
        return res.status(404).json({ ok: false, error: 'Key slot not found.' });
      }
      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: scrubSecretText(err?.message || 'Could not delete API key.') });
    }
  }
);

app.post(
  '/api/admin/ai/test-key',
  generalApiRateLimiter,
  express.json({ limit: '16kb' }),
  authenticateFirebaseToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const keyId = String(req.body?.keyId || '').trim();
      if (!keyId) {
        return res.status(400).json({ ok: false, error: 'keyId is required.' });
      }
      const result = await testSpecificKeyLive(keyId);
      return res.status(result.status).json({ ...result.payload, state: await getAdminAiStateAsync() });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: scrubSecretText(err?.message || 'Key test failed.') });
    }
  }
);

app.post(
  '/api/admin/ai/test-model',
  generalApiRateLimiter,
  express.json({ limit: '16kb' }),
  authenticateFirebaseToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const modelId = String(req.body?.modelId || '').trim();
      const keyId = typeof req.body?.keyId === 'string' ? req.body.keyId.trim() : undefined;
      if (!modelId) {
        return res.status(400).json({ ok: false, error: 'modelId is required.' });
      }
      const result = await testSpecificModelLive({ modelId, keyId });
      return res.status(result.status).json(result.payload);
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: scrubSecretText(err?.message || 'Model test failed.') });
    }
  }
);

app.get(
  '/api/admin/ai/live-models',
  generalApiRateLimiter,
  authenticateFirebaseToken,
  requireSuperAdmin,
  async (_req, res) => {
    try {
      const catalog = await fetchLiveModelsFromGoogleApi();
      return res.status(catalog.httpStatus).json(catalog);
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: scrubSecretText(err?.message || 'Failed to list live models.') });
    }
  }
);

// Serve GamePix ads.txt directly with Content-Type text/plain
app.get('/ads.txt', (_req, res) => {
  const adsPath = path.resolve(process.cwd(), 'public/ads.txt');
  if (fs.existsSync(adsPath)) {
    return res.type('text/plain').sendFile(adsPath);
  }
  const distAdsPath = path.resolve(process.cwd(), 'dist/ads.txt');
  if (fs.existsSync(distAdsPath)) {
    return res.type('text/plain').sendFile(distAdsPath);
  }
  return res.status(404).type('text/plain').send('ads.txt not found');
});

// Explicitly serve public assets
app.use('/public', express.static(path.resolve(process.cwd(), 'public')));

const FIRESTORE_DATABASE_ID = 'ai-studio-king-4e115b8f-6ca5-4501-8ff0-73c2c7c21a47';
const CANONICAL_APP_ORIGIN =
  (process.env.APP_URL || '').trim().replace(/\/+$/, '') || 'https://king-app-full.vercel.app';

function escapeOgHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatOgViews(raw: any): string {
  const num = Number(raw) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M views`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K views`;
  return `${num} ${num === 1 ? 'view' : 'views'}`;
}

function extractFirestoreField(field: any): string | number | undefined {
  if (!field) return undefined;
  if (typeof field.stringValue === 'string') return field.stringValue;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return Number(field.doubleValue);
  return undefined;
}

async function fetchVideoMetadataForOg(videoId: string) {
  let title = 'Watch Viral Videos';
  let viewsLabel = '0 views';
  let likesLabel = '0 likes';
  let thumbnail = `${CANONICAL_APP_ORIGIN}/king-logo.png`;
  let videoUrl = '';

  if (!videoId) return { title, viewsLabel, likesLabel, thumbnail, videoUrl };

  try {
    const restUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents/videos/${encodeURIComponent(
      videoId
    )}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(restUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (resp.ok) {
      const json = (await resp.json()) as { fields?: Record<string, any> };
      const fields = json?.fields || {};
      const titleVal = extractFirestoreField(fields.title);
      if (typeof titleVal === 'string' && titleVal.trim()) title = titleVal.trim();

      viewsLabel = formatOgViews(extractFirestoreField(fields.views));
      const likesNum = Number(extractFirestoreField(fields.likes)) || 0;
      likesLabel =
        likesNum >= 1_000_000
          ? `${(likesNum / 1_000_000).toFixed(1).replace(/\.0$/, '')}M likes`
          : likesNum >= 1_000
          ? `${(likesNum / 1_000).toFixed(1).replace(/\.0$/, '')}K likes`
          : `${likesNum} ${likesNum === 1 ? 'like' : 'likes'}`;

      const rawVid = extractFirestoreField(fields.videoUrl) || extractFirestoreField(fields.url);
      if (typeof rawVid === 'string' && rawVid.trim()) videoUrl = rawVid.trim();

      const rawThumb =
        extractFirestoreField(fields.thumbnailUrl) ||
        extractFirestoreField(fields.thumbnail) ||
        extractFirestoreField(fields.img);
      if (typeof rawThumb === 'string' && rawThumb.trim()) {
        thumbnail = rawThumb.trim();
      } else if (videoUrl && videoUrl.includes('res.cloudinary.com')) {
        thumbnail = videoUrl
          .split('?')[0]
          .replace(/\.[^/.]+$/, '.jpg')
          .replace('/video/upload/', '/video/upload/so_0,w_600,h_800,c_fill/');
      }
    }
  } catch (err) {
    console.warn('[OG Metadata] Video fetch notice:', err);
  }

  return { title, viewsLabel, likesLabel, thumbnail, videoUrl };
}

function injectDynamicVideoOgTags(html: string, videoId: string, meta: {
  title: string;
  viewsLabel: string;
  likesLabel: string;
  thumbnail: string;
  videoUrl: string;
}): string {
  const ogTitle = 'KING App';
  const ogDesc = escapeOgHtml(`${meta.title} • ${meta.viewsLabel} • ${meta.likesLabel} | Reel by KING App`);
  const ogImage = escapeOgHtml(meta.thumbnail);
  const ogUrl = escapeOgHtml(`${CANONICAL_APP_ORIGIN}/watch/${encodeURIComponent(videoId)}`);
  const ogVideo = meta.videoUrl ? escapeOgHtml(meta.videoUrl) : '';
  const isFallbackLogo = meta.thumbnail.endsWith('/king-logo.png');
  const ogImageWidth = isFallbackLogo ? '1200' : '600';
  const ogImageHeight = isFallbackLogo ? '630' : '800';

  const cleanedHtml = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta[^>]+name=["']description["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]+property=["']og:[^"']+["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]+name=["']twitter:[^"']+["'][^>]*>\s*/gi, '');

  const dynamicTags = `
    <title>${ogTitle}</title>
    <meta name="description" content="${ogDesc}" />
    <meta property="og:site_name" content="KING App" />
    <meta property="og:title" content="${ogTitle}" />
    <meta property="og:description" content="${ogDesc}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:secure_url" content="${ogImage}" />
    <meta property="og:image:width" content="${ogImageWidth}" />
    <meta property="og:image:height" content="${ogImageHeight}" />
    <meta property="og:url" content="${ogUrl}" />
    <meta property="og:type" content="video.other" />
    ${
      ogVideo
        ? `<meta property="og:video" content="${ogVideo}" />
    <meta property="og:video:secure_url" content="${ogVideo}" />
    <meta property="og:video:type" content="video/mp4" />
    <meta property="og:video:width" content="720" />
    <meta property="og:video:height" content="1280" />`
        : ''
    }
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${ogTitle}" />
    <meta name="twitter:description" content="${ogDesc}" />
    <meta name="twitter:image" content="${ogImage}" />`;

  return cleanedHtml.replace(/<head([^>]*)>/i, `<head$1>${dynamicTags}`);
}

// --- META BUSINESS / FACEBOOK & INSTAGRAM OAUTH & CONNECTIONS ---
const META_APP_ID = process.env.META_APP_ID || '1801486577814226';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const FIRESTORE_DB_ID = 'ai-studio-king-4e115b8f-6ca5-4501-8ff0-73c2c7c21a47';

app.get('/api/meta/auth-url', authenticateFirebaseToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/api/meta/callback`;
    const scopes = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publishing';
    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${encodeURIComponent(user.uid)}`;
    return res.json({ url: authUrl });
  } catch (err: any) {
    return res.status(500).json({ error: { message: err.message || 'Failed to generate Meta auth URL' } });
  }
});

// FBE (Facebook Business Extension) / Business Apps Authentication URL with external_business_id
app.get('/api/meta/fbe/auth-url', authenticateFirebaseToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/api/meta/callback`;
    const externalBusinessId = `king_user_${user.uid}`;
    const scopes = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publishing';
    
    // Facebook Login for Business / Business Extension URL format
    const fbeUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${encodeURIComponent(user.uid)}&external_business_id=${encodeURIComponent(externalBusinessId)}`;
    return res.json({ url: fbeUrl, external_business_id: externalBusinessId });
  } catch (err: any) {
    return res.status(500).json({ error: { message: err.message || 'Failed to generate FBE auth URL' } });
  }
});

// Meta Business Extension Webhook Endpoint (GET for challenge verification, POST for uninstall / asset update notifications)
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'king_meta_verify_token_secure';

app.get('/api/meta/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
    console.log('[Meta Webhook] Verified successfully');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/api/meta/webhook', express.json(), async (req, res) => {
  try {
    const body = req.body;
    console.log('[Meta Webhook Event Received]:', JSON.stringify(body, null, 2));

    // Handle FBE installation / uninstall or asset updates
    if (body.object === 'page' || body.object === 'instagram' || body.object === 'application') {
      const entries = body.entry || [];
      for (const entry of entries) {
        // Process entry events (e.g. app uninstalled, page token updated)
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'uninstall' || change.field === 'permissions') {
              console.log('[Meta Webhook] Change detected:', change.field);
            }
          }
        }
      }
    }

    return res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
    console.error('[Meta Webhook Error]:', err);
    return res.sendStatus(500);
  }
});

app.get('/api/meta/callback', async (req, res) => {
  try {
    const { code, state: uid, error, error_description } = req.query;
    if (error) {
      return res.status(400).send(`<html><body style="background:#060a14; color:white; font-family:sans-serif; text-align:center; padding-top:50px;"><h3>Meta Auth Failed:</h3><p>${error_description || error}</p><script>setTimeout(() => window.close(), 3000);</script></body></html>`);
    }
    if (!code || !uid || typeof uid !== 'string') {
      return res.status(400).send(`<html><body style="background:#060a14; color:white; font-family:sans-serif; text-align:center; padding-top:50px;"><h3>Invalid OAuth Request</h3><script>setTimeout(() => window.close(), 2000);</script></body></html>`);
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/api/meta/callback`;

    const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${META_APP_SECRET}&code=${code}`);
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) {
      throw new Error(tokenData.error?.message || 'Failed to obtain Meta access token');
    }

    const longTokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`);
    const longTokenData = await longTokenRes.json() as any;
    const userAccessToken = longTokenData.access_token || tokenData.access_token;

    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(userAccessToken)}`);
    const pagesData = await pagesRes.json() as any;
    const pages = pagesData.data || [];

    const dbAdmin = getFirestore(adminApp, FIRESTORE_DB_ID);
    const connectionsRef = dbAdmin.collection('users').doc(uid).collection('metaConnections');

    for (const page of pages) {
      const pageId = page.id;
      const pageName = page.name;
      const pageAccessToken = page.access_token;

      let igUserId = '';
      let igUsername = '';

      try {
        const igRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(pageAccessToken)}`);
        const igData = await igRes.json() as any;
        if (igData.instagram_business_account?.id) {
          igUserId = igData.instagram_business_account.id;
          const igUserRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}?fields=username&access_token=${encodeURIComponent(pageAccessToken)}`);
          const igUserData = await igUserRes.json() as any;
          igUsername = igUserData.username || '';
        }
      } catch (igErr) {
        console.warn(`[Meta OAuth] Could not fetch IG account for page ${pageId}:`, igErr);
      }

      await connectionsRef.doc(pageId).set({
        pageId,
        pageName,
        pageAccessToken,
        igUserId,
        igUsername,
        updatedAt: new Date().toISOString(),
        connected: true,
      }, { merge: true });
    }

    return res.send(`
      <html>
        <body style="background:#060a14; color:white; font-family:sans-serif; text-align:center; padding-top:50px;">
          <h2 style="color:#00d4ff;">Meta Business Connection Successful!</h2>
          <p>Facebook Pages and Instagram accounts linked successfully.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'META_OAUTH_SUCCESS' }, '*');
              setTimeout(() => window.close(), 1200);
            } else {
              setTimeout(() => window.location.href = '/', 1500);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('[Meta Callback Error]:', err);
    return res.status(500).send(`<html><body style="background:#060a14; color:white; font-family:sans-serif; text-align:center; padding-top:50px;"><h3>Meta Connection Error</h3><p>${err.message}</p></body></html>`);
  }
});

app.get('/api/meta/connections', authenticateFirebaseToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const dbAdmin = getFirestore(adminApp, FIRESTORE_DB_ID);
    const snap = await dbAdmin.collection('users').doc(user.uid).collection('metaConnections').get();
    const connections = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const sanitized = connections.map((c: any) => ({
      pageId: c.pageId,
      pageName: c.pageName,
      igUserId: c.igUserId,
      igUsername: c.igUsername,
      connected: c.connected,
      updatedAt: c.updatedAt,
    }));
    return res.json({ connections: sanitized });
  } catch (err: any) {
    return res.status(500).json({ error: { message: err.message || 'Failed to fetch meta connections' } });
  }
});

app.post('/api/meta/disconnect', authenticateFirebaseToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const { pageId } = req.body;
    if (!pageId) {
      return res.status(400).json({ error: { message: 'Page ID is required' } });
    }
    const dbAdmin = getFirestore(adminApp, FIRESTORE_DB_ID);
    await dbAdmin.collection('users').doc(user.uid).collection('metaConnections').doc(pageId).delete();
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: { message: err.message || 'Failed to disconnect meta account' } });
  }
});

// Ensure Express API middleware errors (e.g., malformed JSON or oversized payload) ALWAYS return JSON, never HTML/plain-text
app.use('/api', (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  const errType = String(err?.type || '');
  const status =
    errType === 'entity.too.large'
      ? 413
      : errType === 'entity.parse.failed' || err instanceof SyntaxError
      ? 400
      : typeof err?.status === 'number' && err.status >= 400
      ? err.status
      : 500;
  const code =
    errType === 'entity.too.large'
      ? 'PAYLOAD_TOO_LARGE'
      : status === 400
      ? 'INVALID_JSON_BODY'
      : 'API_INTERNAL_ERROR';
  const message =
    errType === 'entity.too.large'
      ? 'Request payload exceeds server limit. Try a smaller image.'
      : status === 400
      ? 'Malformed JSON request body.'
      : scrubSecretText(err?.message || 'Unexpected API server error.');

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json({ ok: false, code, error: message });
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(process.cwd(), 'dist');

  if (isProduction && fs.existsSync(distPath)) {
    const prodIndexPath = path.resolve(distPath, 'index.html');

    app.get('/watch/:videoId', async (req, res) => {
      try {
        const videoId = String(req.params.videoId || '').trim();
        const meta = await fetchVideoMetadataForOg(videoId);
        const template = fs.readFileSync(prodIndexPath, 'utf-8');
        const html = injectDynamicVideoOgTags(template, videoId, meta);
        res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
      } catch {
        res.sendFile(prodIndexPath);
      }
    });

    // In production, serve the pre-built static bundle
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(prodIndexPath);
    });
  } else {
    // In development, dynamically load Vite middleware mode so production --omit=dev never requires vite
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: true,
        allowedHosts: true,
      },
      appType: 'spa',
    });

    app.get('/watch/:videoId', async (req, res, next) => {
      try {
        const videoId = String(req.params.videoId || '').trim();
        const [meta, rawTemplate] = await Promise.all([
          fetchVideoMetadataForOg(videoId),
          fs.promises.readFile(path.resolve(process.cwd(), 'index.html'), 'utf-8'),
        ]);
        const withOg = injectDynamicVideoOgTags(rawTemplate, videoId, meta);
        const html = await vite.transformIndexHtml(req.originalUrl, withOg);
        res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
      } catch (err) {
        next(err);
      }
    });

    app.use(vite.middlewares);
  }

  let dailySyncTimer: ReturnType<typeof setInterval> | null = null;
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (mode: ${isProduction ? 'production' : 'development'})`);
    // Defer background external GamePix sync until after the port is open and pre-warming passes
    setTimeout(() => {
      syncGamePixDaily();
      // Recurring 24-hour auto update (Rule 1: Every 24 hours fetch 5 new games)
      dailySyncTimer = setInterval(syncGamePixDaily, 24 * 60 * 60 * 1000);
    }, 2000);
  });

  const shutdown = () => {
    if (dailySyncTimer) {
      clearInterval(dailySyncTimer);
      dailySyncTimer = null;
    }
    server.close(() => {
      process.exit(0);
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startServer();
