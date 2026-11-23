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

// api/_lib/statusBackend.ts
var statusBackend_exports = {};
__export(statusBackend_exports, {
  CLOUDINARY_CLOUD_NAME: () => CLOUDINARY_CLOUD_NAME,
  FIREBASE_PROJECT_ID: () => FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID: () => FIRESTORE_DATABASE_ID,
  STATUS_CLOUDINARY_FOLDER: () => STATUS_CLOUDINARY_FOLDER,
  SUPER_ADMIN_EMAIL: () => SUPER_ADMIN_EMAIL,
  buildSignedStatusUploadPayload: () => buildSignedStatusUploadPayload,
  evaluateStatusVisibilityForViewer: () => evaluateStatusVisibilityForViewer,
  getCloudinaryCredentials: () => getCloudinaryCredentials,
  getFirebaseAdminApp: () => getFirebaseAdminApp,
  handleDeleteSingleStatusServer: () => handleDeleteSingleStatusServer,
  handleFetchAuthorizedStatusFeed: () => handleFetchAuthorizedStatusFeed,
  handleRunExpiredStatusCleanup: () => handleRunExpiredStatusCleanup,
  isAdminCredentialError: () => isAdminCredentialError,
  isVerifiedSuperAdmin: () => isVerifiedSuperAdmin,
  signAuthenticatedCloudinaryUrl: () => signAuthenticatedCloudinaryUrl,
  signAuthenticatedVideoThumbnailUrl: () => signAuthenticatedVideoThumbnailUrl,
  verifyFirebaseBearerToken: () => verifyFirebaseBearerToken
});
module.exports = __toCommonJS(statusBackend_exports);
var import_cloudinary = __toESM(require("cloudinary"), 1);
var import_firestore = require("firebase-admin/firestore");

// api/_lib/authBackend.ts
var import_node_crypto = require("node:crypto");
var import_app = require("firebase-admin/app");
var FIREBASE_PROJECT_ID = "king-5f52e";
var FIRESTORE_DATABASE_ID = "ai-studio-king-4e115b8f-6ca5-4501-8ff0-73c2c7c21a47";
var SUPER_ADMIN_EMAIL = "waqaahmad1230@gmail.com";
var FIREBASE_PUBLIC_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
var cachedFirebaseCerts = null;
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

// api/_lib/cloudinaryConfig.ts
var CLOUDINARY_CLOUD_NAME = "xb0o3xwi";
function getCloudinaryCredentials() {
  let cloudName = (process.env.CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME).trim() || CLOUDINARY_CLOUD_NAME;
  let apiKey = (process.env.CLOUDINARY_API_KEY || "").trim();
  let apiSecret = (process.env.CLOUDINARY_API_SECRET || "").trim();
  if ((!apiKey || !apiSecret) && process.env.CLOUDINARY_URL) {
    try {
      const parsedUrl = new URL(process.env.CLOUDINARY_URL.trim());
      if (parsedUrl.protocol === "cloudinary:") {
        if (!apiKey && parsedUrl.username) apiKey = decodeURIComponent(parsedUrl.username);
        if (!apiSecret && parsedUrl.password) apiSecret = decodeURIComponent(parsedUrl.password);
        if (parsedUrl.hostname && !process.env.CLOUDINARY_CLOUD_NAME) {
          cloudName = parsedUrl.hostname;
        }
      }
    } catch {
    }
  }
  return {
    cloudName,
    apiKey,
    apiSecret,
    configured: Boolean(cloudName && apiKey && apiSecret)
  };
}

// api/_lib/statusBackend.ts
var cloudinary = import_cloudinary.default.v2;
var STATUS_CLOUDINARY_FOLDER = "king_status";
function buildSignedStatusUploadPayload(params) {
  const { cloudName, apiKey, apiSecret, configured } = getCloudinaryCredentials();
  const resourceType = params.resourceType === "video" || params.resourceType === "raw" ? params.resourceType : "image";
  const isPublic = params.privacyMode === "public";
  const deliveryType = isPublic ? "upload" : "authenticated";
  if (!configured) {
    const missingEnv = [];
    if (!cloudName) missingEnv.push("CLOUDINARY_CLOUD_NAME");
    if (!apiKey) missingEnv.push("CLOUDINARY_API_KEY");
    if (!apiSecret) missingEnv.push("CLOUDINARY_API_SECRET");
    return {
      ok: false,
      status: 503,
      signed: false,
      code: "CLOUDINARY_UNCONFIGURED",
      cloudName,
      folder: STATUS_CLOUDINARY_FOLDER,
      resourceType,
      deliveryType,
      missingEnv,
      message: "Signed Status upload credentials (CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET) are not configured on the server."
    };
  }
  const timestamp = Math.floor(Date.now() / 1e3);
  const toSign = {
    folder: STATUS_CLOUDINARY_FOLDER,
    timestamp,
    type: deliveryType
  };
  const signature = cloudinary.utils.api_sign_request(toSign, apiSecret);
  return {
    ok: true,
    status: 200,
    signed: true,
    mode: "signed",
    cloudName,
    apiKey,
    timestamp,
    signature,
    folder: STATUS_CLOUDINARY_FOLDER,
    resourceType,
    deliveryType
  };
}
function signAuthenticatedCloudinaryUrl(publicId, resourceType, deliveryType) {
  if (!publicId || deliveryType !== "authenticated") return null;
  const { cloudName, apiKey, apiSecret, configured } = getCloudinaryCredentials();
  if (!configured) return null;
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
  return cloudinary.url(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    sign_url: true,
    secure: true
  });
}
function signAuthenticatedVideoThumbnailUrl(publicId, startOffsetSec = 0) {
  if (!publicId) return null;
  const { cloudName, apiKey, apiSecret, configured } = getCloudinaryCredentials();
  if (!configured) return null;
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
  const safeOffset = String(Math.max(0, Math.floor(Number(startOffsetSec) || 0)));
  return cloudinary.url(publicId, {
    resource_type: "video",
    type: "authenticated",
    format: "jpg",
    transformation: [{ start_offset: safeOffset, width: 480, height: 800, crop: "fill" }],
    sign_url: true,
    secure: true
  });
}
async function destroyCloudinaryAssetWithRetry(publicId, resourceType, deliveryType, maxAttempts = 2) {
  if (!publicId) return { status: "deleted" };
  const { cloudName, apiKey, apiSecret, configured } = getCloudinaryCredentials();
  if (!configured) {
    return {
      status: "skipped_missing_secret",
      error: "Missing CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET on server."
    };
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
  const resType = resourceType === "video" || resourceType === "raw" ? resourceType : "image";
  const type = deliveryType === "authenticated" ? "authenticated" : "upload";
  let lastError = "Unknown Cloudinary error";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await cloudinary.uploader.destroy(publicId, {
        resource_type: resType,
        type,
        invalidate: true
      });
      if (resp?.result === "ok" || resp?.result === "not found") {
        return { status: "deleted" };
      }
      lastError = `Unexpected Cloudinary destroy result: ${String(resp?.result || "empty")}`;
    } catch (err) {
      lastError = err?.message || String(err);
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  console.error("[statusBackend] Cloudinary asset deletion failed:", {
    publicId,
    resourceType: resType,
    deliveryType: type,
    attempts: maxAttempts,
    error: lastError
  });
  return { status: "failed", error: lastError };
}
function isAdminCredentialError(err) {
  const msg = String(err?.message || err || "");
  return msg.includes("Could not load the default credentials") || msg.includes("UNAUTHENTICATED") || msg.includes("Missing or insufficient permissions") || msg.includes("Unable to detect a Project Id") || msg.includes("metadata server");
}
function evaluateStatusVisibilityForViewer(status, viewerUid, relations, nowMs = Date.now()) {
  if (!status || !viewerUid) return false;
  if (status.authorUid === viewerUid) return true;
  if (!status.expiresAtMs || status.expiresAtMs <= nowMs) return false;
  if (relations.blockedByMe.has(status.authorUid) || relations.blockedMe.has(status.authorUid)) {
    return false;
  }
  switch (status.privacyMode) {
    case "only_me":
      return false;
    case "public":
      return true;
    case "friends":
      return relations.friendUids.has(status.authorUid);
    case "followers":
      return relations.followingUids.has(status.authorUid);
    case "selected":
      return Array.isArray(status.allowedUids) && status.allowedUids.includes(viewerUid);
    case "except": {
      const inAudience = relations.friendUids.has(status.authorUid) || relations.followingUids.has(status.authorUid);
      return inAudience && (!Array.isArray(status.excludedUids) || !status.excludedUids.includes(viewerUid));
    }
    default:
      return false;
  }
}
function toMillis(val) {
  if (!val) return 0;
  if (typeof val.toMillis === "function") return val.toMillis();
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}
async function handleFetchAuthorizedStatusFeed(callerUid) {
  const { app } = getFirebaseAdminApp();
  const db = (0, import_firestore.getFirestore)(app, FIRESTORE_DATABASE_ID);
  try {
    const now = import_firestore.Timestamp.now();
    const nowMs = now.toMillis();
    const [statusSnap, friendSnap, followSnap, blockedByMeSnap, blockedMeSnap] = await Promise.all([
      db.collection("statuses").where("expiresAt", ">", now).limit(200).get(),
      db.collection("friendships").where("users", "array-contains", callerUid).get(),
      db.collection("follows").where("followerUid", "==", callerUid).get(),
      db.collection("blocks").where("blockerUid", "==", callerUid).get(),
      db.collection("blocks").where("blockedUid", "==", callerUid).get()
    ]);
    const friendUids = /* @__PURE__ */ new Set();
    friendSnap.forEach((d) => {
      const data = d.data();
      if (data.status === "accepted" && Array.isArray(data.users)) {
        for (const u of data.users) {
          if (typeof u === "string" && u !== callerUid) friendUids.add(u);
        }
      }
    });
    const followingUids = /* @__PURE__ */ new Set();
    followSnap.forEach((d) => {
      const t = d.data()?.targetUid;
      if (typeof t === "string") followingUids.add(t);
    });
    const blockedByMe = /* @__PURE__ */ new Set();
    blockedByMeSnap.forEach((d) => {
      const b = d.data()?.blockedUid;
      if (typeof b === "string") blockedByMe.add(b);
    });
    const blockedMe = /* @__PURE__ */ new Set();
    blockedMeSnap.forEach((d) => {
      const b = d.data()?.blockerUid;
      if (typeof b === "string") blockedMe.add(b);
    });
    const visibleDocs = [];
    statusSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const normalized = {
        id: docSnap.id,
        authorUid: String(data.authorUid || ""),
        authorName: String(data.authorName || "KING Creator"),
        authorPhoto: String(data.authorPhoto || ""),
        type: data.type === "video" || data.type === "text" ? data.type : "image",
        mediaUrl: String(data.mediaUrl || ""),
        thumbnailUrl: String(data.thumbnailUrl || ""),
        cloudinaryPublicId: String(data.cloudinaryPublicId || ""),
        cloudinaryResourceType: data.cloudinaryResourceType || "",
        cloudinaryDeliveryType: data.cloudinaryDeliveryType || "none",
        caption: String(data.caption || ""),
        textContent: String(data.textContent || ""),
        bgGradient: String(data.bgGradient || ""),
        textStyle: data.textStyle || "classic",
        durationSec: Number(data.durationSec) || 0,
        audioTrack: data.audioTrack || { mode: "original", label: "Original Sound" },
        ...data.whatsappCta?.enabled && data.whatsappCta?.url ? {
          whatsappCta: {
            enabled: true,
            url: String(data.whatsappCta.url).slice(0, 300),
            label: String(data.whatsappCta.label || "Chat on WhatsApp").slice(0, 40)
          }
        } : {},
        ...data.videoEdits ? { videoEdits: data.videoEdits } : {},
        privacyMode: data.privacyMode || "friends",
        allowedUids: Array.isArray(data.allowedUids) ? data.allowedUids : [],
        excludedUids: Array.isArray(data.excludedUids) ? data.excludedUids : [],
        viewsCount: Number(data.viewsCount) || 0,
        likesCount: Number(data.likesCount) || 0,
        createdAtMs: toMillis(data.createdAt),
        expiresAtMs: toMillis(data.expiresAt)
      };
      if (evaluateStatusVisibilityForViewer(
        normalized,
        callerUid,
        { friendUids, followingUids, blockedByMe, blockedMe },
        nowMs
      )) {
        if (normalized.cloudinaryDeliveryType === "authenticated") {
          if (normalized.cloudinaryPublicId) {
            const resType = normalized.cloudinaryResourceType === "video" || normalized.cloudinaryResourceType === "raw" ? normalized.cloudinaryResourceType : "image";
            const signedMedia = signAuthenticatedCloudinaryUrl(
              normalized.cloudinaryPublicId,
              resType,
              "authenticated"
            );
            if (signedMedia) normalized.mediaUrl = signedMedia;
            if (resType === "image" && signedMedia) {
              normalized.thumbnailUrl = signedMedia;
            } else if (resType === "video") {
              const signedThumb = signAuthenticatedVideoThumbnailUrl(
                normalized.cloudinaryPublicId,
                normalized.videoEdits?.trimStartSec || 0
              );
              if (signedThumb) normalized.thumbnailUrl = signedThumb;
            }
          }
          if (normalized.audioTrack?.cloudinaryPublicId) {
            const signedAudio = signAuthenticatedCloudinaryUrl(
              normalized.audioTrack.cloudinaryPublicId,
              "video",
              "authenticated"
            );
            if (signedAudio) {
              normalized.audioTrack = {
                ...normalized.audioTrack,
                audioUrl: signedAudio
              };
            }
          }
        }
        visibleDocs.push(normalized);
      }
    });
    const viewRefs = visibleDocs.map((s) => db.collection("status_views").doc(`${s.id}_${callerUid}`));
    const likeRefs = visibleDocs.map((s) => db.collection("status_likes").doc(`${s.id}_${callerUid}`));
    const [viewSnaps, likeSnaps] = visibleDocs.length ? await Promise.all([db.getAll(...viewRefs), db.getAll(...likeRefs)]) : [[], []];
    const sanitizedItems = visibleDocs.map((s, idx) => {
      const isOwner = s.authorUid === callerUid;
      const likeSnap = likeSnaps[idx];
      const viewSnap = viewSnaps[idx];
      return {
        ...s,
        // Never leak private selected/except recipient lists to other viewers
        allowedUids: isOwner ? s.allowedUids : void 0,
        excludedUids: isOwner ? s.excludedUids : void 0,
        viewedByMe: isOwner ? true : Boolean(viewSnap?.exists),
        myReaction: likeSnap?.exists ? likeSnap.data()?.emoji || null : null
      };
    });
    sanitizedItems.sort((a, b) => a.createdAtMs - b.createdAtMs);
    return {
      ok: true,
      status: 200,
      statuses: sanitizedItems,
      cloudinarySignedDelivery: getCloudinaryCredentials().configured
    };
  } catch (err) {
    if (isAdminCredentialError(err)) {
      return {
        ok: false,
        status: 503,
        code: "BACKEND_ADMIN_UNCONFIGURED",
        missingEnv: ["FIREBASE_SERVICE_ACCOUNT_KEY"],
        message: "Server-side Firebase Admin credentials (FIREBASE_SERVICE_ACCOUNT_KEY) are not configured. Multi-user backend privacy filtering requires Admin SDK access."
      };
    }
    throw err;
  }
}
async function deleteCollectionDocsByStatusId(db, collectionName, statusId) {
  let totalDeleted = 0;
  while (true) {
    const snap = await db.collection(collectionName).where("statusId", "==", statusId).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    totalDeleted += snap.size;
    if (snap.size < 400) break;
  }
  return totalDeleted;
}
async function handleDeleteSingleStatusServer(statusId, caller) {
  const { app } = getFirebaseAdminApp();
  const db = (0, import_firestore.getFirestore)(app, FIRESTORE_DATABASE_ID);
  try {
    const statusRef = db.collection("statuses").doc(statusId);
    const snap = await statusRef.get();
    if (!snap.exists) {
      return { ok: true, status: 200, deleted: false, cloudinaryResult: "deleted" };
    }
    const data = snap.data() || {};
    const isSuperAdmin = caller.email === SUPER_ADMIN_EMAIL;
    if (data.authorUid !== caller.uid && !isSuperAdmin) {
      return { ok: false, status: 403, code: "FORBIDDEN", message: "Not status owner." };
    }
    const mediaDestroy = await destroyCloudinaryAssetWithRetry(
      String(data.cloudinaryPublicId || ""),
      data.cloudinaryResourceType || "",
      String(data.cloudinaryDeliveryType || "upload")
    );
    const audioDestroy = data.audioTrack?.cloudinaryPublicId ? await destroyCloudinaryAssetWithRetry(
      String(data.audioTrack.cloudinaryPublicId),
      "video",
      String(data.cloudinaryDeliveryType || "upload")
    ) : { status: "deleted" };
    const [deletedViews, deletedLikes, deletedReplies, deletedNotifications] = await Promise.all([
      deleteCollectionDocsByStatusId(db, "status_views", statusId),
      deleteCollectionDocsByStatusId(db, "status_likes", statusId),
      deleteCollectionDocsByStatusId(db, "status_replies", statusId),
      deleteCollectionDocsByStatusId(db, "notifications", statusId)
    ]);
    const cloudinaryFailed = mediaDestroy.status !== "deleted" || audioDestroy.status !== "deleted";
    if (cloudinaryFailed) {
      const errDetail = mediaDestroy.error || audioDestroy.error || "Cloudinary delete pending retry";
      await statusRef.update({
        expiresAt: import_firestore.Timestamp.fromMillis(Date.now() - 1e3),
        cleanupPending: true,
        cleanupAttempts: import_firestore.FieldValue.increment(1),
        lastCleanupError: errDetail.slice(0, 300),
        lastCleanupAttemptAt: import_firestore.FieldValue.serverTimestamp()
      });
      return {
        ok: true,
        status: 200,
        deleted: true,
        queuedForAssetRetry: true,
        cloudinaryResult: mediaDestroy.status,
        deletedViews,
        deletedLikes,
        deletedReplies,
        deletedNotifications
      };
    }
    await statusRef.delete();
    return {
      ok: true,
      status: 200,
      deleted: true,
      queuedForAssetRetry: false,
      cloudinaryResult: mediaDestroy.status,
      deletedViews,
      deletedLikes,
      deletedReplies,
      deletedNotifications
    };
  } catch (err) {
    if (isAdminCredentialError(err)) {
      return {
        ok: false,
        status: 503,
        code: "BACKEND_ADMIN_UNCONFIGURED",
        missingEnv: ["FIREBASE_SERVICE_ACCOUNT_KEY"],
        message: "Server-side Admin credentials are required for server cascade & Cloudinary deletion."
      };
    }
    throw err;
  }
}
async function handleRunExpiredStatusCleanup(options) {
  const rawAuth = Array.isArray(options.authHeader) ? options.authHeader[0] : options.authHeader || "";
  const cronSecret = (process.env.CRON_SECRET || "").trim();
  const hasCronAuth = Boolean(cronSecret && rawAuth === `Bearer ${cronSecret}`);
  const isSuperAdmin = options.caller?.email === SUPER_ADMIN_EMAIL;
  if (!hasCronAuth && !isSuperAdmin) {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "Cleanup requires CRON_SECRET Bearer auth or Super Admin credentials."
    };
  }
  const { app } = getFirebaseAdminApp();
  const db = (0, import_firestore.getFirestore)(app, FIRESTORE_DATABASE_ID);
  try {
    const now = import_firestore.Timestamp.now();
    const BATCH_SIZE = 50;
    const MAX_BATCHES = 10;
    let deletedStatuses = 0;
    let deletedViews = 0;
    let deletedLikes = 0;
    let deletedReplies = 0;
    let deletedNotifications = 0;
    let deletedCloudinaryAssets = 0;
    let failedCloudinaryAssets = 0;
    let failedStatuses = 0;
    let hasMore = false;
    let lastDoc = null;
    for (let batchNum = 0; batchNum < MAX_BATCHES; batchNum++) {
      let q = db.collection("statuses").where("expiresAt", "<=", now).orderBy("expiresAt", "asc").limit(BATCH_SIZE);
      if (lastDoc) {
        q = q.startAfter(lastDoc);
      }
      const expiredSnap = await q.get();
      if (expiredSnap.empty) {
        hasMore = false;
        break;
      }
      lastDoc = expiredSnap.docs[expiredSnap.docs.length - 1];
      for (const statusDoc of expiredSnap.docs) {
        const data = statusDoc.data();
        const statusId = statusDoc.id;
        const mediaRes = data.cloudinaryPublicId ? await destroyCloudinaryAssetWithRetry(
          String(data.cloudinaryPublicId),
          data.cloudinaryResourceType || "",
          String(data.cloudinaryDeliveryType || "upload")
        ) : { status: "deleted" };
        if (data.cloudinaryPublicId) {
          if (mediaRes.status === "deleted") deletedCloudinaryAssets++;
          else failedCloudinaryAssets++;
        }
        const audioRes = data.audioTrack?.cloudinaryPublicId ? await destroyCloudinaryAssetWithRetry(
          String(data.audioTrack.cloudinaryPublicId),
          "video",
          String(data.cloudinaryDeliveryType || "upload")
        ) : { status: "deleted" };
        if (data.audioTrack?.cloudinaryPublicId) {
          if (audioRes.status === "deleted") deletedCloudinaryAssets++;
          else failedCloudinaryAssets++;
        }
        const [v, l, r, n] = await Promise.all([
          deleteCollectionDocsByStatusId(db, "status_views", statusId),
          deleteCollectionDocsByStatusId(db, "status_likes", statusId),
          deleteCollectionDocsByStatusId(db, "status_replies", statusId),
          deleteCollectionDocsByStatusId(db, "notifications", statusId)
        ]);
        deletedViews += v;
        deletedLikes += l;
        deletedReplies += r;
        deletedNotifications += n;
        if (mediaRes.status !== "deleted" || audioRes.status !== "deleted") {
          failedStatuses++;
          const errDetail = mediaRes.error || audioRes.error || "Cloudinary deletion incomplete";
          await statusDoc.ref.update({
            cleanupPending: true,
            cleanupAttempts: import_firestore.FieldValue.increment(1),
            lastCleanupError: errDetail.slice(0, 300),
            lastCleanupAttemptAt: import_firestore.FieldValue.serverTimestamp()
          });
          continue;
        }
        await statusDoc.ref.delete();
        deletedStatuses++;
      }
      if (expiredSnap.size < BATCH_SIZE) {
        hasMore = false;
        break;
      }
      if (batchNum === MAX_BATCHES - 1) {
        hasMore = true;
      }
    }
    return {
      ok: true,
      status: 200,
      deletedStatuses,
      deletedViews,
      deletedLikes,
      deletedReplies,
      deletedNotifications,
      deletedCloudinaryAssets,
      failedCloudinaryAssets,
      failedStatuses,
      hasMore,
      cloudinaryConfigured: getCloudinaryCredentials().configured
    };
  } catch (err) {
    if (isAdminCredentialError(err)) {
      return {
        ok: false,
        status: 503,
        code: "BACKEND_ADMIN_UNCONFIGURED",
        missingEnv: ["FIREBASE_SERVICE_ACCOUNT_KEY"],
        message: "Server-side FIREBASE_SERVICE_ACCOUNT_KEY is required to run scheduled 24h expiry cleanup."
      };
    }
    throw err;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CLOUDINARY_CLOUD_NAME,
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  STATUS_CLOUDINARY_FOLDER,
  SUPER_ADMIN_EMAIL,
  buildSignedStatusUploadPayload,
  evaluateStatusVisibilityForViewer,
  getCloudinaryCredentials,
  getFirebaseAdminApp,
  handleDeleteSingleStatusServer,
  handleFetchAuthorizedStatusFeed,
  handleRunExpiredStatusCleanup,
  isAdminCredentialError,
  isVerifiedSuperAdmin,
  signAuthenticatedCloudinaryUrl,
  signAuthenticatedVideoThumbnailUrl,
  verifyFirebaseBearerToken
});
