import {
  getPublicAiCapabilityStatusAsync,
  handleAutoRoutedAiRequest,
  scrubSecretText,
} from '../_lib/aiExecCore.cjs';

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    try {
      return res.status(200).json(await getPublicAiCapabilityStatusAsync());
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: scrubSecretText(err?.message || 'Status error') });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const result = await handleAutoRoutedAiRequest({
      authHeader: req.headers?.authorization,
      body,
    });
    return res.status(result.status).json(result.payload);
  } catch (err: any) {
    const safeErr = scrubSecretText(err?.message || 'Unexpected AI routing server error.');
    console.error('[/api/ai/route] Error:', safeErr);
    return res.status(500).json({
      ok: false,
      code: 'AI_ROUTE_INTERNAL_ERROR',
      error: safeErr,
    });
  }
}
