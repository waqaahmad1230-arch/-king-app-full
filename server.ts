import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const app = express();

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

// Super Admin Authorization Middleware: rejects non-admins with HTTP 403
const requireSuperAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user as VerifiedFirebaseUser | undefined;
  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: { message: 'Access denied. Super Admin privileges required.' } });
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

// Serve GamePix ads.txt directly with Content-Type text/plain
app.get('/ads.txt', (_req, res) => {
  const adsPath = path.resolve(process.cwd(), 'public/ads.txt');
  if (fs.existsSync(adsPath)) {
    return res.type('text/plain').sendFile(adsPath);
  }
  return res.type('text/plain').sendFile(path.join(__dirname, 'public/ads.txt'));
});

// Explicitly serve public assets
app.use('/public', express.static(path.resolve(process.cwd(), 'public')));

const FIRESTORE_DATABASE_ID = 'ai-studio-king-4e115b8f-6ca5-4501-8ff0-73c2c7c21a47';
const CANONICAL_APP_ORIGIN = 'https://king-app-full.vercel.app';

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
    // In development, mount Vite middleware mode with unrestricted hosts
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (mode: ${isProduction ? 'production' : 'development'})`);
    // Defer background external GamePix sync until after the port is open and pre-warming passes
    setTimeout(() => {
      syncGamePixDaily();
      // Recurring 24-hour auto update (Rule 1: Every 24 hours fetch 5 new games)
      setInterval(syncGamePixDaily, 24 * 60 * 60 * 1000);
    }, 2000);
  });
}

startServer();
