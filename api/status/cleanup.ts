import {
  handleDeleteSingleStatusServer,
  handleRunExpiredStatusCleanup,
  verifyFirebaseBearerToken,
} from '../_lib/statusBackend.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const caller = await verifyFirebaseBearerToken(req.headers?.authorization);
    const body =
      typeof req.body === 'string'
        ? (() => {
            try {
              return JSON.parse(req.body || '{}');
            } catch {
              return {};
            }
          })()
        : req.body || {};
    const statusId =
      (typeof req.query?.statusId === 'string' && req.query.statusId) ||
      (typeof body?.statusId === 'string' && body.statusId) ||
      '';

    if (statusId && (req.method === 'DELETE' || req.method === 'POST')) {
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const delRes = await handleDeleteSingleStatusServer(statusId.trim(), caller);
      return res.status(delRes.status).json(delRes);
    }

    const cleanupRes = await handleRunExpiredStatusCleanup({
      authHeader: req.headers?.authorization,
      caller,
    });
    return res.status(cleanupRes.status).json(cleanupRes);
  } catch (err: any) {
    console.error('[/api/status/cleanup] Error:', err);
    return res.status(500).json({ error: err?.message || 'Status cleanup error' });
  }
}
