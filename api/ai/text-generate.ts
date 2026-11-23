import {
  handlePostAiTextGenerate,
  scrubSecretText,
} from '../_lib/aiExecCore.cjs';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const result = await handlePostAiTextGenerate({
      authHeader: req.headers?.authorization,
      body,
    });
    return res.status(result.status).json(result.payload);
  } catch (err: any) {
    const safeErr = scrubSecretText(err?.message || 'Unexpected AI text generation error.');
    console.error('[/api/ai/text-generate] Error:', safeErr);
    return res.status(500).json({
      ok: false,
      code: 'TEXT_AI_INTERNAL_ERROR',
      error: safeErr,
    });
  }
}
