import { createVerify } from 'node:crypto';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';

export const FIREBASE_PROJECT_ID = 'king-5f52e';
export const FIRESTORE_DATABASE_ID = 'ai-studio-king-4e115b8f-6ca5-4501-8ff0-73c2c7c21a47';
export const SUPER_ADMIN_EMAIL = 'waqaahmad1230@gmail.com';
const FIREBASE_PUBLIC_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedFirebaseCerts: { certs: Record<string, string>; expiresAtMs: number } | null = null;

export interface VerifiedCaller {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

export function scrubBasicSecretText(text: string): string {
  return String(text || '').replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]');
}

export function getFirebaseAdminApp(): { app: App; hasExplicitCredentials: boolean } {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (getApps().length > 0) {
    return {
      app: getApps()[0],
      hasExplicitCredentials: Boolean(serviceAccountRaw),
    };
  }
  if (serviceAccountRaw) {
    try {
      const parsed = JSON.parse(serviceAccountRaw);
      const app = initializeApp({
        credential: cert(parsed),
        projectId: FIREBASE_PROJECT_ID,
      });
      return { app, hasExplicitCredentials: true };
    } catch (err) {
      console.warn('[authBackend] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', err);
    }
  }
  const app = initializeApp({ projectId: FIREBASE_PROJECT_ID });
  return { app, hasExplicitCredentials: false };
}

function decodeBase64UrlJson<T = any>(segment: string): T | null {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLength);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

async function fetchFirebasePublicCerts(forceRefresh = false): Promise<Record<string, string> | null> {
  if (!forceRefresh && cachedFirebaseCerts && Date.now() < cachedFirebaseCerts.expiresAtMs) {
    return cachedFirebaseCerts.certs;
  }
  try {
    const resp = await fetch(FIREBASE_PUBLIC_CERTS_URL);
    if (!resp.ok) return null;
    const certs = (await resp.json()) as Record<string, string>;
    if (!certs || typeof certs !== 'object') return null;
    const cacheControl = resp.headers.get('cache-control') || '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
    const ttlMs = maxAgeMatch ? Math.max(60_000, Number(maxAgeMatch[1]) * 1000) : 3_600_000;
    cachedFirebaseCerts = {
      certs,
      expiresAtMs: Date.now() + ttlMs,
    };
    return certs;
  } catch {
    return null;
  }
}

async function verifyFirebaseJwtWithGoogleCerts(idToken: string): Promise<VerifiedCaller | null> {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(encodedHeader);
  const payload = decodeBase64UrlJson<Record<string, any>>(encodedPayload);
  if (!header || !payload) return null;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) return null;

  let certs = await fetchFirebasePublicCerts(false);
  let pemCert = certs && Object.prototype.hasOwnProperty.call(certs, header.kid) ? certs[header.kid] : undefined;
  if (!pemCert) {
    certs = await fetchFirebasePublicCerts(true);
    pemCert = certs && Object.prototype.hasOwnProperty.call(certs, header.kid) ? certs[header.kid] : undefined;
  }
  if (!pemCert || typeof pemCert !== 'string') return null;

  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    const sigBase64 = encodedSignature.replace(/-/g, '+').replace(/_/g, '/');
    const sigPadded = sigBase64 + '='.repeat((4 - (sigBase64.length % 4)) % 4);
    const signatureValid = verifier.verify(pemCert, Buffer.from(sigPadded, 'base64'));
    if (!signatureValid) return null;
  } catch {
    return null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp);
  const iat = Number(payload.iat);
  const authTime = payload.auth_time !== undefined ? Number(payload.auth_time) : 0;
  if (!Number.isFinite(exp) || exp <= nowSec) return null;
  if (!Number.isFinite(iat) || iat > nowSec + 300) return null;
  if (payload.auth_time !== undefined && (!Number.isFinite(authTime) || authTime > nowSec + 300)) return null;
  if (payload.aud !== FIREBASE_PROJECT_ID) return null;
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return null;

  const uid = payload.sub;
  if (typeof uid !== 'string' || !uid || uid.length > 128) return null;

  return {
    uid,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified: Boolean(payload.email_verified),
    name: typeof payload.name === 'string' ? payload.name : undefined,
  };
}

export async function verifyFirebaseBearerToken(authHeader?: string | string[]): Promise<VerifiedCaller | null> {
  const rawHeader = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!rawHeader || !rawHeader.startsWith('Bearer ')) return null;
  const idToken = rawHeader.slice(7).trim();
  if (!idToken) return null;

  const { app } = getFirebaseAdminApp();
  try {
    // Dynamically import firebase-admin/auth at verification time so Vercel cold starts
    // never fail on synchronous require('jwks-rsa') -> require('jose') ERR_REQUIRE_ESM.
    const { getAuth } = await import('firebase-admin/auth');
    const decoded = await getAuth(app).verifyIdToken(idToken);
    if (decoded?.uid) {
      return {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: Boolean(decoded.email_verified),
        name: (decoded as any).name,
      };
    }
  } catch (err: any) {
    if (err?.code === 'auth/id-token-revoked') {
      return null;
    }
    // Fallback to cryptographic Firebase public-cert check / Google OIDC tokeninfo when Admin
    // ADC certs are unavailable or Node runtime rejects require(ESM) inside jwks-rsa -> jose.
  }

  const certVerified = await verifyFirebaseJwtWithGoogleCerts(idToken);
  if (certVerified) {
    return certVerified;
  }

  try {
    const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as any;
    if (
      data.error ||
      data.aud !== FIREBASE_PROJECT_ID ||
      data.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`
    ) {
      return null;
    }
    const exp = Number(data.exp);
    if (!exp || exp < Math.floor(Date.now() / 1000)) return null;
    const uid = data.sub || data.user_id;
    if (!uid || typeof uid !== 'string') return null;
    return {
      uid,
      email: data.email,
      emailVerified: data.email_verified === true || data.email_verified === 'true',
      name: data.name,
    };
  } catch {
    return null;
  }
}

export function isVerifiedSuperAdmin(caller: VerifiedCaller | null): boolean {
  return Boolean(caller && caller.email === SUPER_ADMIN_EMAIL && caller.emailVerified === true);
}
