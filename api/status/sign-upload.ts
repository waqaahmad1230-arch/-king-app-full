import { buildSignedStatusUploadPayload, verifyFirebaseBearerToken } from '../_lib/statusCore.cjs';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const caller = await verifyFirebaseBearerToken(req.headers?.authorization);
    if (!caller) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const payload = buildSignedStatusUploadPayload({
      callerUid: caller.uid,
      resourceType: body.resourceType,
      privacyMode: body.privacyMode,
    });
    return res.status(payload.status).json(payload);
  } catch (err: any) {
    console.error('[/api/status/sign-upload] Error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to prepare upload signature' });
  }
}
