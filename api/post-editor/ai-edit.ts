import { getPostAiCapabilityStatus, handlePostAiPhotoEdit } from '../_lib/postAiBackend.ts';

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    return res.status(200).json(getPostAiCapabilityStatus());
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const result = await handlePostAiPhotoEdit({
      authHeader: req.headers?.authorization,
      body,
    });
    return res.status(result.status).json(result.payload);
  } catch (err: any) {
    console.error('[/api/post-editor/ai-edit] Error:', err);
    return res.status(500).json({
      ok: false,
      code: 'POST_AI_INTERNAL_ERROR',
      error: err?.message || 'Unexpected AI editor server error.',
    });
  }
}
