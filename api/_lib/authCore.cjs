var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// api/_lib/authBackend.ts
var authBackend_exports = {};
__export(authBackend_exports, {
  FIREBASE_PROJECT_ID: () => FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID: () => FIRESTORE_DATABASE_ID,
  SUPER_ADMIN_EMAIL: () => SUPER_ADMIN_EMAIL,
  getFirebaseAdminApp: () => getFirebaseAdminApp,
  isVerifiedSuperAdmin: () => isVerifiedSuperAdmin,
  scrubBasicSecretText: () => scrubBasicSecretText,
  verifyFirebaseBearerToken: () => verifyFirebaseBearerToken
});
module.exports = __toCommonJS(authBackend_exports);
var import_node_crypto = require("node:crypto");
var import_app = require("firebase-admin/app");
var FIREBASE_PROJECT_ID = "king-5f52e";
var FIRESTORE_DATABASE_ID = "ai-studio-king-4e115b8f-6ca5-4501-8ff0-73c2c7c21a47";
var SUPER_ADMIN_EMAIL = "waqaahmad1230@gmail.com";
var FIREBASE_PUBLIC_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
var cachedFirebaseCerts = null;
function scrubBasicSecretText(text) {
  return String(text || "").replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_API_KEY]");
}
function getFirebaseAdminApp() {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if ((0, import_app.getApps)().length > 0) {
    return {
      app: (0, import_app.getApps)()[0],
      hasExplicitCredentials: Boolean(serviceAccountRaw)
    };
  }
  if (serviceAccountRaw) {
    try {
      const parsed = JSON.parse(serviceAccountRaw);
      const app2 = (0, import_app.initializeApp)({
        credential: (0, import_app.cert)(parsed),
        projectId: FIREBASE_PROJECT_ID
      });
      return { app: app2, hasExplicitCredentials: true };
    } catch (err) {
      console.warn("[authBackend] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", err);
    }
  }
  const app = (0, import_app.initializeApp)({ projectId: FIREBASE_PROJECT_ID });
  return { app, hasExplicitCredentials: false };
}
function decodeBase64UrlJson(segment) {
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - normalized.length % 4) % 4;
    const padded = normalized + "=".repeat(padLength);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}
async function fetchFirebasePublicCerts(forceRefresh = false) {
  if (!forceRefresh && cachedFirebaseCerts && Date.now() < cachedFirebaseCerts.expiresAtMs) {
    return cachedFirebaseCerts.certs;
  }
  try {
    const resp = await fetch(FIREBASE_PUBLIC_CERTS_URL);
    if (!resp.ok) return null;
    const certs = await resp.json();
    if (!certs || typeof certs !== "object") return null;
    const cacheControl = resp.headers.get("cache-control") || "";
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
    const ttlMs = maxAgeMatch ? Math.max(6e4, Number(maxAgeMatch[1]) * 1e3) : 36e5;
    cachedFirebaseCerts = {
      certs,
      expiresAtMs: Date.now() + ttlMs
    };
    return certs;
  } catch {
    return null;
  }
}
async function verifyFirebaseJwtWithGoogleCerts(idToken) {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;
  const header = decodeBase64UrlJson(encodedHeader);
  const payload = decodeBase64UrlJson(encodedPayload);
  if (!header || !payload) return null;
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) return null;
  let certs = await fetchFirebasePublicCerts(false);
  let pemCert = certs && Object.prototype.hasOwnProperty.call(certs, header.kid) ? certs[header.kid] : void 0;
  if (!pemCert) {
    certs = await fetchFirebasePublicCerts(true);
    pemCert = certs && Object.prototype.hasOwnProperty.call(certs, header.kid) ? certs[header.kid] : void 0;
  }
  if (!pemCert || typeof pemCert !== "string") return null;
  try {
    const verifier = (0, import_node_crypto.createVerify)("RSA-SHA256");
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    const sigBase64 = encodedSignature.replace(/-/g, "+").replace(/_/g, "/");
    const sigPadded = sigBase64 + "=".repeat((4 - sigBase64.length % 4) % 4);
    const signatureValid = verifier.verify(pemCert, Buffer.from(sigPadded, "base64"));
    if (!signatureValid) return null;
  } catch {
    return null;
  }
  const nowSec = Math.floor(Date.now() / 1e3);
  const exp = Number(payload.exp);
  const iat = Number(payload.iat);
  const authTime = payload.auth_time !== void 0 ? Number(payload.auth_time) : 0;
  if (!Number.isFinite(exp) || exp <= nowSec) return null;
  if (!Number.isFinite(iat) || iat > nowSec + 300) return null;
  if (payload.auth_time !== void 0 && (!Number.isFinite(authTime) || authTime > nowSec + 300)) return null;
  if (payload.aud !== FIREBASE_PROJECT_ID) return null;
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return null;
  const uid = payload.sub;
  if (typeof uid !== "string" || !uid || uid.length > 128) return null;
  return {
    uid,
    email: typeof payload.email === "string" ? payload.email : void 0,
    emailVerified: Boolean(payload.email_verified),
    name: typeof payload.name === "string" ? payload.name : void 0
  };
}
async function verifyFirebaseBearerToken(authHeader) {
  const rawHeader = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!rawHeader || !rawHeader.startsWith("Bearer ")) return null;
  const idToken = rawHeader.slice(7).trim();
  if (!idToken) return null;
  const { app } = getFirebaseAdminApp();
  try {
    const { getAuth } = await import("firebase-admin/auth");
    const decoded = await getAuth(app).verifyIdToken(idToken);
    if (decoded?.uid) {
      return {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: Boolean(decoded.email_verified),
        name: decoded.name
      };
    }
  } catch (err) {
    if (err?.code === "auth/id-token-revoked") {
      return null;
    }
  }
  const certVerified = await verifyFirebaseJwtWithGoogleCerts(idToken);
  if (certVerified) {
    return certVerified;
  }
  try {
    const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.error || data.aud !== FIREBASE_PROJECT_ID || data.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
      return null;
    }
    const exp = Number(data.exp);
    if (!exp || exp < Math.floor(Date.now() / 1e3)) return null;
    const uid = data.sub || data.user_id;
    if (!uid || typeof uid !== "string") return null;
    return {
      uid,
      email: data.email,
      emailVerified: data.email_verified === true || data.email_verified === "true",
      name: data.name
    };
  } catch {
    return null;
  }
}
function isVerifiedSuperAdmin(caller) {
  return Boolean(caller && caller.email === SUPER_ADMIN_EMAIL && caller.emailVerified === true);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  SUPER_ADMIN_EMAIL,
  getFirebaseAdminApp,
  isVerifiedSuperAdmin,
  scrubBasicSecretText,
  verifyFirebaseBearerToken
});
