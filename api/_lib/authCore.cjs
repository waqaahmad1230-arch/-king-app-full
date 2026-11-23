var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var import_app = require("firebase-admin/app");
var import_auth = require("firebase-admin/auth");
var FIREBASE_PROJECT_ID = "king-5f52e";
var FIRESTORE_DATABASE_ID = "ai-studio-king-4e115b8f-6ca5-4501-8ff0-73c2c7c21a47";
var SUPER_ADMIN_EMAIL = "waqaahmad1230@gmail.com";
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
async function verifyFirebaseBearerToken(authHeader) {
  const rawHeader = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!rawHeader || !rawHeader.startsWith("Bearer ")) return null;
  const idToken = rawHeader.slice(7).trim();
  if (!idToken) return null;
  const { app } = getFirebaseAdminApp();
  try {
    const decoded = await (0, import_auth.getAuth)(app).verifyIdToken(idToken);
    if (decoded?.uid) {
      return {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: Boolean(decoded.email_verified),
        name: decoded.name
      };
    }
  } catch {
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
