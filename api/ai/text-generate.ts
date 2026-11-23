import {
  BadJsonBodyError,
  handlePostAiTextGenerate,
  parseRequestJsonBody,
  scrubSecretText,
  sendNormalizedAiJson,
} from '../_lib/aiExecCore.cjs';

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = parseRequestJsonBody(req.body);
    const result = await handlePostAiTextGenerate({
      authHeader: req.headers?.authorization,
      body,
    });
    return sendNormalizedAiJson(res, result.status, result.payload, { requireText: true });
  } catch (err: any) {
    const status = err instanceof BadJsonBodyError ? err.status : 500;
    const code = err instanceof BadJsonBodyError ? err.code : 'TEXT_AI_INTERNAL_ERROR';
    const safeErr = scrubSecretText(err?.message || 'Unexpected AI text generation error.');
    console.error('[/api/ai/text-generate] Error:', safeErr);
    return res.status(status).json({
      ok: false,
      code,
      error: safeErr,
    });
  }
}
