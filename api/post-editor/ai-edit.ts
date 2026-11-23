import {
  BadJsonBodyError,
  getPublicAiCapabilityStatusAsync,
  handlePostAiPhotoEdit,
  parseRequestJsonBody,
  scrubSecretText,
  sendNormalizedAiJson,
} from '../_lib/aiExecCore.cjs';

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

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
    const body = parseRequestJsonBody(req.body);
    const result = await handlePostAiPhotoEdit({
      authHeader: req.headers?.authorization,
      body,
    });
    return sendNormalizedAiJson(res, result.status, result.payload, { requireImage: true });
  } catch (err: any) {
    const status = err instanceof BadJsonBodyError ? err.status : 500;
    const code = err instanceof BadJsonBodyError ? err.code : 'POST_AI_INTERNAL_ERROR';
    const safeErr = scrubSecretText(err?.message || 'Unexpected AI editor server error.');
    console.error('[/api/post-editor/ai-edit] Error:', safeErr);
    return res.status(status).json({
      ok: false,
      code,
      error: safeErr,
    });
  }
}
