import {
  getPublicAiCapabilityStatusAsync,
  scrubSecretText,
} from '../_lib/aiStatusCore.cjs';

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const status = await getPublicAiCapabilityStatusAsync();
    return res.status(200).json(status);
  } catch (err: any) {
    const safeErr = scrubSecretText(err?.message || 'Failed to read AI status.');
    console.error('[/api/ai/status] Error:', safeErr);
    return res.status(500).json({ ok: false, error: safeErr });
  }
}
