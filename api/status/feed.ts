import { handleFetchAuthorizedStatusFeed, verifyFirebaseBearerToken } from '../_lib/vercelCore.mjs';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const caller = await verifyFirebaseBearerToken(req.headers?.authorization);
    if (!caller) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await handleFetchAuthorizedStatusFeed(caller.uid);
    return res.status(result.status).json(result);
  } catch (err: any) {
    console.error('[/api/status/feed] Error:', err);
    return res.status(500).json({ error: err?.message || 'Internal status feed error' });
  }
}
