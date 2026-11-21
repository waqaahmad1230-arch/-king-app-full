import { getFirestore } from 'firebase-admin/firestore';
import {
  FIRESTORE_DATABASE_ID,
  getFirebaseAdminApp,
  scrubSecretText,
  verifyFirebaseBearerToken,
} from './_lib/vercelCore.mjs';

const META_APP_ID = process.env.META_APP_ID || '1801486577814226';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'king_meta_verify_token_secure';

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseMetaSubPath(req: any): string {
  const queryPath = req?.query?.path;
  if (typeof queryPath === 'string' && queryPath.trim()) {
    return queryPath.replace(/^\/+|\/+$/g, '');
  }
  if (Array.isArray(queryPath) && queryPath.length > 0) {
    return queryPath.join('/').replace(/^\/+|\/+$/g, '');
  }
  try {
    const pathname = new URL(String(req?.url || ''), 'https://localhost').pathname;
    return pathname.replace(/^\/api\/meta\/?/, '').replace(/^\/+|\/+$/g, '');
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

function getRequestOrigin(req: any): string {
  const protoRaw = req.headers?.['x-forwarded-proto'] || 'https';
  const protocol = String(Array.isArray(protoRaw) ? protoRaw[0] : protoRaw).split(',')[0].trim() || 'https';
  const hostRaw = req.headers?.['x-forwarded-host'] || req.headers?.host || 'king-app-full.vercel.app';
  const host = String(Array.isArray(hostRaw) ? hostRaw[0] : hostRaw).split(',')[0].trim();
  return `${protocol}://${host}`;
}

export default async function handler(req: any, res: any) {
  const subPath = parseMetaSubPath(req);
  const method = String(req.method || 'GET').toUpperCase();

  try {
    // GET /api/meta/auth-url
    if (subPath === 'auth-url') {
      if (method !== 'GET') return res.status(405).json({ error: { message: 'Method not allowed' } });
      const caller = await verifyFirebaseBearerToken(req.headers?.authorization);
      if (!caller) {
        return res.status(401).json({ error: { message: 'Authentication required. Missing or invalid Bearer token.' } });
      }
      const redirectUri = `${getRequestOrigin(req)}/api/meta/callback`;
      const scopes =
        'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publishing';
      const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${encodeURIComponent(caller.uid)}`;
      return res.status(200).json({ url: authUrl });
    }

    // GET /api/meta/fbe/auth-url
    if (subPath === 'fbe/auth-url') {
      if (method !== 'GET') return res.status(405).json({ error: { message: 'Method not allowed' } });
      const caller = await verifyFirebaseBearerToken(req.headers?.authorization);
      if (!caller) {
        return res.status(401).json({ error: { message: 'Authentication required. Missing or invalid Bearer token.' } });
      }
      const redirectUri = `${getRequestOrigin(req)}/api/meta/callback`;
      const externalBusinessId = `king_user_${caller.uid}`;
      const scopes =
        'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publishing';
      const fbeUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${encodeURIComponent(
        caller.uid
      )}&external_business_id=${encodeURIComponent(externalBusinessId)}`;
      return res.status(200).json({ url: fbeUrl, external_business_id: externalBusinessId });
    }

    // GET & POST /api/meta/webhook
    if (subPath === 'webhook') {
      if (method === 'GET') {
        const mode = req.query?.['hub.mode'];
        const token = req.query?.['hub.verify_token'];
        const challenge = req.query?.['hub.challenge'];
        if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
          return res.status(200).send(challenge);
        }
        return res.status(403).send('Forbidden');
      }
      if (method === 'POST') {
        const body = parseJsonBody(req);
        if (body.object === 'page' || body.object === 'instagram' || body.object === 'application') {
          const entries = body.entry || [];
          for (const entry of entries) {
            if (entry.changes) {
              for (const change of entry.changes) {
                if (change.field === 'uninstall' || change.field === 'permissions') {
                  console.log('[Meta Webhook] Change detected:', change.field);
                }
              }
            }
          }
        }
        return res.status(200).send('EVENT_RECEIVED');
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // GET /api/meta/callback
    if (subPath === 'callback') {
      if (method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const code = typeof req.query?.code === 'string' ? req.query.code : '';
      const uid = typeof req.query?.state === 'string' ? req.query.state : '';
      const error = typeof req.query?.error === 'string' ? req.query.error : '';
      const errorDescription =
        typeof req.query?.error_description === 'string' ? req.query.error_description : '';

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (error) {
        return res
          .status(400)
          .send(
            `<html><body style="background:#060a14; color:white; font-family:sans-serif; text-align:center; padding-top:50px;"><h3>Meta Auth Failed:</h3><p>${escapeHtml(
              errorDescription || error
            )}</p><script>setTimeout(() => window.close(), 3000);</script></body></html>`
          );
      }
      if (!code || !uid) {
        return res
          .status(400)
          .send(
            `<html><body style="background:#060a14; color:white; font-family:sans-serif; text-align:center; padding-top:50px;"><h3>Invalid OAuth Request</h3><script>setTimeout(() => window.close(), 2000);</script></body></html>`
          );
      }

      const redirectUri = `${getRequestOrigin(req)}/api/meta/callback`;
      const tokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(
          redirectUri
        )}&client_secret=${encodeURIComponent(META_APP_SECRET)}&code=${encodeURIComponent(code)}`
      );
      const tokenData = (await tokenRes.json()) as any;
      if (!tokenData.access_token) {
        throw new Error(tokenData.error?.message || 'Failed to obtain Meta access token');
      }

      const longTokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${encodeURIComponent(
          META_APP_SECRET
        )}&fb_exchange_token=${encodeURIComponent(tokenData.access_token)}`
      );
      const longTokenData = (await longTokenRes.json()) as any;
      const userAccessToken = longTokenData.access_token || tokenData.access_token;

      const pagesRes = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(userAccessToken)}`
      );
      const pagesData = (await pagesRes.json()) as any;
      const pages = pagesData.data || [];

      const { app } = getFirebaseAdminApp();
      const dbAdmin = getFirestore(app, FIRESTORE_DATABASE_ID);
      const connectionsRef = dbAdmin.collection('users').doc(uid).collection('metaConnections');

      for (const page of pages) {
        const pageId = page.id;
        const pageName = page.name;
        const pageAccessToken = page.access_token;
        let igUserId = '';
        let igUsername = '';

        try {
          const igRes = await fetch(
            `https://graph.facebook.com/v19.0/${encodeURIComponent(
              pageId
            )}?fields=instagram_business_account&access_token=${encodeURIComponent(pageAccessToken)}`
          );
          const igData = (await igRes.json()) as any;
          if (igData.instagram_business_account?.id) {
            igUserId = igData.instagram_business_account.id;
            const igUserRes = await fetch(
              `https://graph.facebook.com/v19.0/${encodeURIComponent(
                igUserId
              )}?fields=username&access_token=${encodeURIComponent(pageAccessToken)}`
            );
            const igUserData = (await igUserRes.json()) as any;
            igUsername = igUserData.username || '';
          }
        } catch {
          // Non-fatal IG lookup warning
        }

        await connectionsRef.doc(pageId).set(
          {
            pageId,
            pageName,
            pageAccessToken,
            igUserId,
            igUsername,
            updatedAt: new Date().toISOString(),
            connected: true,
          },
          { merge: true }
        );
      }

      return res.status(200).send(`
        <html>
          <body style="background:#060a14; color:white; font-family:sans-serif; text-align:center; padding-top:50px;">
            <h2 style="color:#00d4ff;">Meta Business Connection Successful!</h2>
            <p>Facebook Pages and Instagram accounts linked successfully.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'META_OAUTH_SUCCESS' }, '*');
                setTimeout(() => window.close(), 1200);
              } else {
                setTimeout(() => window.location.href = '/', 1500);
              }
            </script>
          </body>
        </html>
      `);
    }

    // GET /api/meta/connections
    if (subPath === 'connections') {
      if (method !== 'GET') return res.status(405).json({ error: { message: 'Method not allowed' } });
      const caller = await verifyFirebaseBearerToken(req.headers?.authorization);
      if (!caller) {
        return res.status(401).json({ error: { message: 'Authentication required. Missing or invalid Bearer token.' } });
      }
      const { app } = getFirebaseAdminApp();
      const dbAdmin = getFirestore(app, FIRESTORE_DATABASE_ID);
      const snap = await dbAdmin.collection('users').doc(caller.uid).collection('metaConnections').get();
      const sanitized = snap.docs.map((d) => {
        const c = d.data();
        return {
          pageId: c.pageId,
          pageName: c.pageName,
          igUserId: c.igUserId,
          igUsername: c.igUsername,
          connected: c.connected,
          updatedAt: c.updatedAt,
        };
      });
      return res.status(200).json({ connections: sanitized });
    }

    // POST /api/meta/disconnect
    if (subPath === 'disconnect') {
      if (method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });
      const caller = await verifyFirebaseBearerToken(req.headers?.authorization);
      if (!caller) {
        return res.status(401).json({ error: { message: 'Authentication required. Missing or invalid Bearer token.' } });
      }
      const body = parseJsonBody(req);
      const pageId = typeof body?.pageId === 'string' ? body.pageId.trim() : '';
      if (!pageId) {
        return res.status(400).json({ error: { message: 'Page ID is required' } });
      }
      const { app } = getFirebaseAdminApp();
      const dbAdmin = getFirestore(app, FIRESTORE_DATABASE_ID);
      await dbAdmin.collection('users').doc(caller.uid).collection('metaConnections').doc(pageId).delete();
      return res.status(200).json({ success: true });
    }

    return res.status(404).json({ error: { message: `Unknown Meta route: ${subPath}` } });
  } catch (err: any) {
    const safeErr = scrubSecretText(err?.message || 'Meta integration endpoint error.');
    console.error('[/api/meta] Error:', safeErr);
    if (subPath === 'callback') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res
        .status(500)
        .send(
          `<html><body style="background:#060a14; color:white; font-family:sans-serif; text-align:center; padding-top:50px;"><h3>Meta Connection Error</h3><p>${escapeHtml(
            safeErr
          )}</p></body></html>`
        );
    }
    return res.status(500).json({ error: { message: safeErr } });
  }
}
