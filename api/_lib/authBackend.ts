import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export const FIREBASE_PROJECT_ID = 'king-5f52e';
export const FIRESTORE_DATABASE_ID = 'ai-studio-king-4e115b8f-6ca5-4501-8ff0-73c2c7c21a47';
export const SUPER_ADMIN_EMAIL = 'waqaahmad1230@gmail.com';

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

export async function verifyFirebaseBearerToken(authHeader?: string | string[]): Promise<VerifiedCaller | null> {
  const rawHeader = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!rawHeader || !rawHeader.startsWith('Bearer ')) return null;
  const idToken = rawHeader.slice(7).trim();
  if (!idToken) return null;

  const { app } = getFirebaseAdminApp();
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    if (decoded?.uid) {
      return {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: Boolean(decoded.email_verified),
        name: (decoded as any).name,
      };
    }
  } catch {
    // Fallback to Google OIDC tokeninfo endpoint when Admin ADC certs are unavailable locally
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
