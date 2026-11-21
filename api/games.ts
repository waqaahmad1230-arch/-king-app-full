import {
  isVerifiedSuperAdmin,
  scrubSecretText,
  verifyFirebaseBearerToken,
} from './_lib/vercelCore.mjs';

function parseGamesSubPath(req: any): string {
  const queryPath = req?.query?.path;
  if (typeof queryPath === 'string' && queryPath.trim()) {
    return queryPath.replace(/^\/+|\/+$/g, '');
  }
  if (Array.isArray(queryPath) && queryPath.length > 0) {
    return queryPath.join('/').replace(/^\/+|\/+$/g, '');
  }
  try {
    const pathname = new URL(String(req?.url || ''), 'https://localhost').pathname;
    return pathname.replace(/^\/api\/games\/?/, '').replace(/^\/+|\/+$/g, '');
  } catch {
    return '';
  }
}

export default async function handler(req: any, res: any) {
  const subPath = parseGamesSubPath(req);
  const method = String(req.method || 'GET').toUpperCase();

  try {
    // GET /api/games/daily
    if (subPath === 'daily') {
      if (method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const reqOffset = Number(req.query?.offset || 0) || 0;
      const url = `https://games.gamepix.com/games?sid=PN8G3&limit=5&order=d&offset=${reqOffset}`;
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(502).json({ error: `GamePix API responded with status ${response.status}` });
      }
      const data = await response.json();
      return res.status(200).json(data);
    }

    // GET /api/games/gamepix-trending
    if (subPath === 'gamepix-trending') {
      if (method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const limit = Number(req.query?.limit || 20) || 20;
      const order = encodeURIComponent(String(req.query?.order || 'd'));
      const url = `https://games.gamepix.com/games?sid=PN8G3&limit=${limit}&order=${order}`;
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(502).json({ error: `GamePix API responded with status ${response.status}` });
      }
      const data = await response.json();
      return res.status(200).json(data);
    }

    // POST /api/games/sync-now (Super Admin only)
    if (subPath === 'sync-now') {
      if (method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const caller = await verifyFirebaseBearerToken(req.headers?.authorization);
      if (!caller) {
        return res.status(401).json({
          error: { message: 'Authentication required. Missing or invalid Bearer token.' },
        });
      }
      if (!isVerifiedSuperAdmin(caller)) {
        return res.status(403).json({
          error: { message: 'Access denied. Verified Super Admin privileges required.' },
        });
      }

      const url = `https://games.gamepix.com/games?sid=PN8G3&limit=5&order=d&offset=0`;
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(502).json({ error: `GamePix API responded with status ${response.status}` });
      }
      const json = (await response.json()) as any;
      const items = Array.isArray(json?.data) ? json.data : [];
      const newGames = items.map((item: any) => ({
        id: `gpx-${item.id}`,
        title: String(item.title || 'GamePix Game').trim(),
        name: String(item.title || 'GamePix Game').trim(),
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

      return res.status(200).json({
        success: true,
        lastSync: Date.now(),
        totalGames: newGames.length,
        games: newGames,
      });
    }

    return res.status(404).json({ error: `Unknown games route: ${subPath}` });
  } catch (err: any) {
    console.error('[/api/games] Error:', scrubSecretText(err?.message || 'Games endpoint error'));
    return res.status(500).json({ error: scrubSecretText(err?.message || 'Failed to query games feed') });
  }
}
