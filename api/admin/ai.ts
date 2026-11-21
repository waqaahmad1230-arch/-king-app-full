import {
  fetchLiveModelsFromGoogleApi,
  getAdminAiStateAsync,
  handleAdminAddKey,
  handleAdminDeleteKey,
  handleAdminUpdateKey,
  handleAdminUpdateModels,
  isVerifiedSuperAdmin,
  scrubSecretText,
  testSpecificKeyLive,
  testSpecificModelLive,
  verifyFirebaseBearerToken,
} from '../_lib/vercelCore.mjs';

function parseAdminSubPath(req: any): string {
  const queryPath = req?.query?.path;
  if (typeof queryPath === 'string' && queryPath.trim()) {
    return queryPath.replace(/^\/+|\/+$/g, '');
  }
  if (Array.isArray(queryPath) && queryPath.length > 0) {
    return queryPath.join('/').replace(/^\/+|\/+$/g, '');
  }
  const rawUrl = String(req?.url || '');
  try {
    const pathname = new URL(rawUrl, 'https://localhost').pathname;
    const stripped = pathname.replace(/^\/api\/admin\/ai\/?/, '').replace(/^\/+|\/+$/g, '');
    return stripped;
  } catch {
    return '';
  }
}

function parseJsonBody(req: any): Record<string, any> {
  if (!req?.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req: any, res: any) {
  try {
    const caller = await verifyFirebaseBearerToken(req.headers?.authorization);
    if (!caller) {
      return res.status(401).json({
        ok: false,
        error: { message: 'Authentication required. Missing or invalid Bearer token.' },
      });
    }
    if (!isVerifiedSuperAdmin(caller)) {
      return res.status(403).json({
        ok: false,
        error: { message: 'Access denied. Verified Super Admin privileges required.' },
      });
    }

    const subPath = parseAdminSubPath(req);
    const method = String(req.method || 'GET').toUpperCase();
    const body = parseJsonBody(req);

    // GET /api/admin/ai/state
    if (subPath === 'state' || subPath === '') {
      if (method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
      return res.status(200).json(await getAdminAiStateAsync());
    }

    // POST /api/admin/ai/models
    if (subPath === 'models') {
      if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
      try {
        const result = await handleAdminUpdateModels(body);
        return res.status(200).json(result);
      } catch (err: any) {
        return res.status(400).json({ ok: false, error: scrubSecretText(err?.message || 'Invalid model configuration') });
      }
    }

    // POST /api/admin/ai/keys
    if (subPath === 'keys') {
      if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
      try {
        const result = await handleAdminAddKey({
          label: String(body?.label || ''),
          apiKey: String(body?.apiKey || ''),
          priority: body?.priority !== undefined ? Number(body.priority) : undefined,
          projectId: typeof body?.projectId === 'string' ? body.projectId : undefined,
        });
        return res.status(201).json(result);
      } catch (err: any) {
        return res.status(400).json({ ok: false, error: scrubSecretText(err?.message || 'Could not save API key.') });
      }
    }

    // PATCH or DELETE /api/admin/ai/keys/:id
    if (subPath.startsWith('keys/')) {
      const keyId = decodeURIComponent(subPath.slice('keys/'.length)).trim();
      if (!keyId) {
        return res.status(400).json({ ok: false, error: 'Key ID is required.' });
      }

      if (method === 'PATCH') {
        try {
          const result = await handleAdminUpdateKey(keyId, body);
          if (!result) return res.status(404).json({ ok: false, error: 'Key slot not found.' });
          return res.status(200).json(result);
        } catch (err: any) {
          return res.status(400).json({ ok: false, error: scrubSecretText(err?.message || 'Could not update API key.') });
        }
      }

      if (method === 'DELETE') {
        try {
          const result = await handleAdminDeleteKey(keyId);
          if (!result) return res.status(404).json({ ok: false, error: 'Key slot not found.' });
          return res.status(200).json(result);
        } catch (err: any) {
          return res.status(400).json({ ok: false, error: scrubSecretText(err?.message || 'Could not delete API key.') });
        }
      }

      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    // POST /api/admin/ai/test-key
    if (subPath === 'test-key') {
      if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
      const keyId = String(body?.keyId || '').trim();
      if (!keyId) {
        return res.status(400).json({ ok: false, error: 'keyId is required.' });
      }
      const result = await testSpecificKeyLive(keyId);
      return res.status(result.status).json({ ...result.payload, state: await getAdminAiStateAsync() });
    }

    // POST /api/admin/ai/test-model
    if (subPath === 'test-model') {
      if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
      const modelId = String(body?.modelId || '').trim();
      const keyId = typeof body?.keyId === 'string' ? body.keyId.trim() : undefined;
      if (!modelId) {
        return res.status(400).json({ ok: false, error: 'modelId is required.' });
      }
      const result = await testSpecificModelLive({ modelId, keyId });
      return res.status(result.status).json(result.payload);
    }

    // GET /api/admin/ai/live-models
    if (subPath === 'live-models') {
      if (method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
      const catalog = await fetchLiveModelsFromGoogleApi();
      return res.status(catalog.httpStatus).json(catalog);
    }

    return res.status(404).json({ ok: false, error: `Unknown admin AI route: ${subPath}` });
  } catch (err: any) {
    const safeErr = scrubSecretText(err?.message || 'Admin AI endpoint failure.');
    console.error('[/api/admin/ai] Error:', safeErr);
    return res.status(500).json({ ok: false, error: safeErr });
  }
}
