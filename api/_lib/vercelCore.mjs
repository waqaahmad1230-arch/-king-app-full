// server/aiBackend.ts
import { GoogleGenAI } from "@google/genai";
import cloudinaryPkg2 from "cloudinary";

// api/_lib/statusBackend.ts
import cloudinaryPkg from "cloudinary";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
var cloudinary = cloudinaryPkg.v2;
var FIREBASE_PROJECT_ID = "king-5f52e";
var FIRESTORE_DATABASE_ID = "ai-studio-king-4e115b8f-6ca5-4501-8ff0-73c2c7c21a47";
var SUPER_ADMIN_EMAIL = "waqaahmad1230@gmail.com";
var CLOUDINARY_CLOUD_NAME = "xb0o3xwi";
var STATUS_CLOUDINARY_FOLDER = "king_status";
function getFirebaseAdminApp() {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (getApps().length > 0) {
    return {
      app: getApps()[0],
      hasExplicitCredentials: Boolean(serviceAccountRaw)
    };
  }
  if (serviceAccountRaw) {
    try {
      const parsed = JSON.parse(serviceAccountRaw);
      const app2 = initializeApp({
        credential: cert(parsed),
        projectId: FIREBASE_PROJECT_ID
      });
      return { app: app2, hasExplicitCredentials: true };
    } catch (err) {
      console.warn("[statusBackend] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", err);
    }
  }
  const app = initializeApp({ projectId: FIREBASE_PROJECT_ID });
  return { app, hasExplicitCredentials: false };
}
async function verifyFirebaseBearerToken(authHeader) {
  const rawHeader = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!rawHeader || !rawHeader.startsWith("Bearer ")) return null;
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
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);
  try {
    const now = Timestamp.now();
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
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);
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
        expiresAt: Timestamp.fromMillis(Date.now() - 1e3),
        cleanupPending: true,
        cleanupAttempts: FieldValue.increment(1),
        lastCleanupError: errDetail.slice(0, 300),
        lastCleanupAttemptAt: FieldValue.serverTimestamp()
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
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);
  try {
    const now = Timestamp.now();
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
            cleanupAttempts: FieldValue.increment(1),
            lastCleanupError: errDetail.slice(0, 300),
            lastCleanupAttemptAt: FieldValue.serverTimestamp()
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

// server/aiVault.ts
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var VERIFIED_GEMINI_MODELS = [
  {
    id: "gemini-3.1-flash-lite-image",
    displayName: "Nano Banana 2 Lite",
    aliasLabel: "Nano Banana 2 Lite (Default Primary \xB7 Fast & Economical)",
    capability: "image",
    qualityTier: "lite",
    description: "Safest verified general text-to-image generation & quick photo editing (1:1, 3:4, 4:3, 9:16, 16:9).",
    paidKeyRequired: true,
    defaultEnabled: true,
    priority: 1
  },
  {
    id: "gemini-nano-banana-2.1",
    displayName: "Nano Banana 2.1",
    aliasLabel: "Nano Banana 2.1 (1K\u20134K & Search)",
    capability: "image",
    qualityTier: "standard",
    description: "High-resolution 1K\u20134K image generation, extended ratios & Search grounding.",
    paidKeyRequired: true,
    defaultEnabled: true,
    priority: 2
  },
  {
    id: "gemini-3-pro-image",
    displayName: "Nano Banana Pro",
    aliasLabel: "Nano Banana Pro (Premium 1K\u20134K Studio)",
    capability: "image",
    qualityTier: "pro",
    description: "Premium studio photography, accurate text rendering & multi-reference edits.",
    paidKeyRequired: true,
    defaultEnabled: true,
    priority: 3
  },
  {
    id: "gemini-3.1-flash-image",
    displayName: "Nano Banana 2",
    aliasLabel: "Nano Banana 2 (Optional \xB7 Unverified Pending Live Check)",
    capability: "image",
    qualityTier: "standard",
    description: "Optional unverified alias; disabled by default until confirmed active via live Google models API.",
    paidKeyRequired: true,
    defaultEnabled: false,
    priority: 4
  },
  {
    id: "gemini-2.5-flash-image",
    displayName: "Nano Banana (2.5)",
    aliasLabel: "Nano Banana Classic (2.5 Flash Image)",
    capability: "image",
    qualityTier: "lite",
    description: "Classic Gemini 2.5 Flash native image generation & editing fallback.",
    paidKeyRequired: true,
    defaultEnabled: false,
    priority: 5
  },
  {
    id: "gemini-3.1-pro-preview",
    displayName: "Gemini 3.1 Pro",
    aliasLabel: "Gemini 3.1 Pro (Preferred AI Assistant)",
    capability: "text",
    description: "Preferred model for AI chat, Q&A, reasoning, text generation & voice-transcribed text requests (v1beta).",
    paidKeyRequired: true,
    defaultEnabled: true,
    priority: 1,
    apiVersion: "v1beta"
  },
  {
    id: "gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash",
    aliasLabel: "Gemini 3.8 Flash (Assistant Fallback)",
    capability: "text",
    description: "Balanced high-speed multimodal & general assistant fallback.",
    paidKeyRequired: false,
    defaultEnabled: true,
    priority: 2
  },
  {
    id: "gemini-3.5-flash",
    displayName: "Gemini 3.5 Flash",
    aliasLabel: "Gemini 3.5 Flash (Assistant Fallback)",
    capability: "text",
    description: "Reliable Flash-class text generation fallback.",
    paidKeyRequired: false,
    defaultEnabled: true,
    priority: 3
  },
  {
    id: "gemini-3.1-flash-lite",
    displayName: "Gemini 3.1 Flash Lite",
    aliasLabel: "Flash Lite (Fast Text & Diagnostics)",
    capability: "text",
    description: "Ultra-fast text generation fallback & live API key diagnostics.",
    paidKeyRequired: false,
    defaultEnabled: true,
    priority: 4
  },
  {
    id: "gemini-omni-1.2-flash",
    displayName: "Gemini Omni 1.2 Flash",
    aliasLabel: "Gemini Omni 1.2 Flash (Video AI Only)",
    capability: "omni",
    supportsVideoGeneration: true,
    supportsImageToVideo: true,
    supportsVideoEditing: true,
    description: "Exclusive Video AI for text-to-video, image-to-video & video editing via v1beta Interactions API. Never used for photos.",
    paidKeyRequired: true,
    defaultEnabled: true,
    priority: 1,
    apiVersion: "v1beta"
  },
  {
    id: "gemini-omni-1.1-flash",
    displayName: "Gemini Omni 1.1 Flash",
    aliasLabel: "Gemini Omni 1.1 Flash (Legacy Video Fallback)",
    capability: "omni",
    supportsVideoGeneration: true,
    supportsImageToVideo: true,
    supportsVideoEditing: true,
    description: "Optional legacy Omni Video fallback if enabled and verified on project key (v1beta).",
    paidKeyRequired: true,
    defaultEnabled: false,
    priority: 2,
    apiVersion: "v1beta"
  }
];
var VAULT_BASE_DIR = path.resolve(
  process.env.AI_VAULT_DIR?.trim() || (process.env.VERCEL ? os.tmpdir() : process.cwd())
);
var VAULT_FILE_PATH = path.join(VAULT_BASE_DIR, ".king-ai-vault.enc.json");
var VAULT_KEY_PATH = path.join(VAULT_BASE_DIR, ".king-ai-vault.key");
var CURRENT_MODEL_CONFIG_VERSION = 3;
var DEFAULT_MODEL_CONFIG = {
  configVersion: CURRENT_MODEL_CONFIG_VERSION,
  enabledModels: Object.fromEntries(
    VERIFIED_GEMINI_MODELS.map((m) => [m.id, m.defaultEnabled])
  ),
  primaryImageModel: "gemini-3.1-flash-lite-image",
  primaryTextModel: "gemini-3.1-pro-preview",
  primaryVideoModel: "gemini-omni-1.2-flash",
  imageSelectionPolicy: "balanced",
  enableAutoRouting: true,
  enableKeyFallback: true,
  enableModelFallback: true
};
var UPSTASH_VAULT_REDIS_KEY = "king:ai_vault:v1";
var REMOTE_SYNC_TTL_MS = 8e3;
function getUpstashConfig() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/+$/, "");
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  return {
    url,
    token,
    configured: Boolean(url && token)
  };
}
function getVaultPersistenceInfo() {
  const hasEnvSecret = Boolean((process.env.AI_VAULT_SECRET || process.env.SESSION_SECRET || "").trim());
  const hasCustomVolume = Boolean(process.env.AI_VAULT_DIR?.trim());
  const upstash = getUpstashConfig();
  const isVercel = Boolean(process.env.VERCEL);
  if (upstash.configured) {
    return {
      storageScope: "upstash_redis_encrypted",
      vaultPath: `upstash-redis://${UPSTASH_VAULT_REDIS_KEY}`,
      encryptionKeyPersistent: hasEnvSecret,
      multiInstanceSafe: hasEnvSecret,
      warning: hasEnvSecret ? void 0 : "Set AI_VAULT_SECRET env var so Upstash AES-256-GCM encrypted keys remain decryptable across serverless invocations."
    };
  }
  const multiInstanceSafe = hasEnvSecret && hasCustomVolume;
  const warnings = [];
  if (!hasEnvSecret) {
    warnings.push("Set AI_VAULT_SECRET env var so encrypted keys remain decryptable across restarts.");
  }
  if (!hasCustomVolume) {
    warnings.push(
      isVercel ? "Vercel serverless filesystem is ephemeral. Configure UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN + AI_VAULT_SECRET for persistent Admin Vault storage (Vercel GEMINI_API_KEY env secrets persist automatically)." : "Vault file currently uses local disk (single-instance unless UPSTASH_REDIS_REST_URL or AI_VAULT_DIR is configured; GEMINI_API_KEY env secrets persist automatically)."
    );
  }
  return {
    storageScope: hasCustomVolume ? "persistent_volume" : "ephemeral_container_disk",
    vaultPath: VAULT_FILE_PATH,
    encryptionKeyPersistent: hasEnvSecret,
    multiInstanceSafe,
    warning: warnings.length > 0 ? warnings.join(" ") : void 0
  };
}
var memoryKeyBuffer = null;
function getVaultEncryptionKey() {
  const envSecret = (process.env.AI_VAULT_SECRET || process.env.SESSION_SECRET || "").trim();
  if (envSecret) {
    return crypto.createHash("sha256").update(`king-ai-vault:${envSecret}`).digest();
  }
  try {
    if (fs.existsSync(VAULT_KEY_PATH)) {
      const hex = fs.readFileSync(VAULT_KEY_PATH, "utf8").trim();
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        return Buffer.from(hex, "hex");
      }
    }
    fs.mkdirSync(VAULT_BASE_DIR, { recursive: true });
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(VAULT_KEY_PATH, generated.toString("hex"), { mode: 384 });
    return generated;
  } catch {
    if (!memoryKeyBuffer) {
      memoryKeyBuffer = crypto.randomBytes(32);
    }
    return memoryKeyBuffer;
  }
}
function encryptText(plainText) {
  const key = getVaultEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    d: encrypted.toString("base64")
  });
}
function decryptText(serialized) {
  const parsed = JSON.parse(serialized);
  const key = getVaultEncryptionKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(parsed.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(parsed.d, "base64")),
    decipher.final()
  ]);
  return plain.toString("utf8");
}
function normalizeProjectId(raw) {
  if (typeof raw !== "string") return void 0;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return cleaned || void 0;
}
function createDefaultVaultData() {
  return {
    keys: [],
    envOverrides: {},
    projectHealth: {},
    modelConfig: {
      ...DEFAULT_MODEL_CONFIG,
      enabledModels: { ...DEFAULT_MODEL_CONFIG.enabledModels }
    }
  };
}
var inMemoryFallbackVault = null;
var lastRemoteSyncAt = 0;
var inFlightRemoteSync = null;
var pendingRemoteWrites = [];
function normalizePlainVaultData(parsed) {
  const defaults = createDefaultVaultData();
  const rawCfg = parsed.modelConfig || {};
  const rawVersion = Number(rawCfg.configVersion || 0);
  const isLegacyConfigVersion = rawVersion < CURRENT_MODEL_CONFIG_VERSION;
  const mergedEnabledModels = {
    ...defaults.modelConfig.enabledModels,
    ...rawCfg.enabledModels || {}
  };
  if (rawVersion < 2) {
    mergedEnabledModels["gemini-3.1-pro-preview"] = true;
    mergedEnabledModels["gemini-omni-1.2-flash"] = true;
  }
  if (isLegacyConfigVersion) {
    mergedEnabledModels["gemini-3.1-flash-lite-image"] = true;
    mergedEnabledModels["gemini-nano-banana-2.1"] = true;
    mergedEnabledModels["gemini-3.1-flash-image"] = false;
  }
  const resolvedPrimaryImage = rawCfg.primaryImageModel && VERIFIED_GEMINI_MODELS.some((m) => m.id === rawCfg.primaryImageModel && m.capability === "image") ? rawVersion < 3 && rawCfg.primaryImageModel === "gemini-3.1-flash-image" ? defaults.modelConfig.primaryImageModel : rawCfg.primaryImageModel : defaults.modelConfig.primaryImageModel;
  const resolvedPrimaryText = rawCfg.primaryTextModel && VERIFIED_GEMINI_MODELS.some((m) => m.id === rawCfg.primaryTextModel && m.capability === "text") ? rawVersion < 2 && rawCfg.primaryTextModel === "gemini-3.1-flash-lite" ? defaults.modelConfig.primaryTextModel : rawCfg.primaryTextModel : defaults.modelConfig.primaryTextModel;
  const resolvedPrimaryVideo = rawCfg.primaryVideoModel && VERIFIED_GEMINI_MODELS.some((m) => m.id === rawCfg.primaryVideoModel && m.capability === "omni") ? rawCfg.primaryVideoModel : defaults.modelConfig.primaryVideoModel;
  const validPolicies = /* @__PURE__ */ new Set([
    "balanced",
    "economy_first",
    "quality_first",
    "manual_primary"
  ]);
  const resolvedPolicy = rawCfg.imageSelectionPolicy && validPolicies.has(rawCfg.imageSelectionPolicy) ? rawCfg.imageSelectionPolicy : defaults.modelConfig.imageSelectionPolicy;
  return {
    keys: Array.isArray(parsed.keys) ? parsed.keys : [],
    envOverrides: parsed.envOverrides && typeof parsed.envOverrides === "object" ? parsed.envOverrides : {},
    projectHealth: parsed.projectHealth && typeof parsed.projectHealth === "object" ? parsed.projectHealth : {},
    modelConfig: {
      configVersion: CURRENT_MODEL_CONFIG_VERSION,
      enabledModels: mergedEnabledModels,
      primaryImageModel: resolvedPrimaryImage,
      primaryTextModel: resolvedPrimaryText,
      primaryVideoModel: resolvedPrimaryVideo,
      imageSelectionPolicy: resolvedPolicy,
      enableAutoRouting: typeof rawCfg.enableAutoRouting === "boolean" ? rawCfg.enableAutoRouting : defaults.modelConfig.enableAutoRouting,
      enableKeyFallback: typeof rawCfg.enableKeyFallback === "boolean" ? rawCfg.enableKeyFallback : defaults.modelConfig.enableKeyFallback,
      enableModelFallback: typeof rawCfg.enableModelFallback === "boolean" ? rawCfg.enableModelFallback : defaults.modelConfig.enableModelFallback
    }
  };
}
function decryptVaultWrapper(wrapper) {
  const key = getVaultEncryptionKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(wrapper.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(wrapper.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(wrapper.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
  return normalizePlainVaultData(JSON.parse(plain));
}
function encryptVaultWrapper(data) {
  const key = getVaultEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plain = JSON.stringify(data);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}
async function syncVaultFromRemote(force = false) {
  const upstash = getUpstashConfig();
  if (!upstash.configured) return;
  const now = Date.now();
  if (!force && inMemoryFallbackVault && now - lastRemoteSyncAt < REMOTE_SYNC_TTL_MS) {
    return;
  }
  if (!force && inFlightRemoteSync) {
    return inFlightRemoteSync;
  }
  const run = (async () => {
    try {
      const resp = await fetch(
        `${upstash.url}/get/${encodeURIComponent(UPSTASH_VAULT_REDIS_KEY)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${upstash.token}`
          }
        }
      );
      if (!resp.ok) return;
      const body = await resp.json();
      if (!body?.result || typeof body.result !== "string") {
        if (!inMemoryFallbackVault) {
          inMemoryFallbackVault = createDefaultVaultData();
        }
        lastRemoteSyncAt = Date.now();
        return;
      }
      const wrapper = JSON.parse(body.result);
      if (wrapper?.iv && wrapper?.tag && wrapper?.ciphertext) {
        inMemoryFallbackVault = decryptVaultWrapper(wrapper);
        lastRemoteSyncAt = Date.now();
      }
    } catch {
    } finally {
      inFlightRemoteSync = null;
    }
  })();
  inFlightRemoteSync = run;
  return run;
}
async function flushRemoteVaultWrites() {
  if (pendingRemoteWrites.length === 0) return;
  const batch = pendingRemoteWrites.splice(0, pendingRemoteWrites.length);
  await Promise.all(batch);
}
function readVaultData() {
  const upstash = getUpstashConfig();
  if (upstash.configured && inMemoryFallbackVault) {
    return inMemoryFallbackVault;
  }
  try {
    if (!fs.existsSync(VAULT_FILE_PATH)) {
      return inMemoryFallbackVault || createDefaultVaultData();
    }
    const rawFile = fs.readFileSync(VAULT_FILE_PATH, "utf8");
    const wrapper = JSON.parse(rawFile);
    const normalized = decryptVaultWrapper(wrapper);
    inMemoryFallbackVault = normalized;
    return normalized;
  } catch {
    return inMemoryFallbackVault || createDefaultVaultData();
  }
}
function writeVaultData(data, options) {
  inMemoryFallbackVault = data;
  const upstash = getUpstashConfig();
  const hasEnvSecret = Boolean((process.env.AI_VAULT_SECRET || process.env.SESSION_SECRET || "").trim());
  if (upstash.configured && options?.strictRemoteSecret && !hasEnvSecret) {
    throw new Error("AI_VAULT_SECRET environment variable is required to encrypt keys into Upstash Redis.");
  }
  const payload = encryptVaultWrapper(data);
  const serialized = JSON.stringify(payload);
  try {
    fs.mkdirSync(VAULT_BASE_DIR, { recursive: true });
    fs.writeFileSync(VAULT_FILE_PATH, serialized, { mode: 384 });
  } catch {
  }
  if (upstash.configured && hasEnvSecret) {
    const writePromise = fetch(upstash.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstash.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(["SET", UPSTASH_VAULT_REDIS_KEY, serialized])
    }).then((res) => {
      if (res.ok) {
        lastRemoteSyncAt = Date.now();
      }
    }).catch(() => {
    });
    pendingRemoteWrites.push(writePromise);
  }
}
function maskSecretValue(raw) {
  const clean = (raw || "").trim();
  if (!clean) return "Not Set";
  if (clean.length <= 8) return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  return `\u2022\u2022\u2022\u2022\u2022\u2022${clean.slice(-4)}`;
}
var ENV_KEY_SLOT_NAMES = [
  { id: "env_GEMINI_API_KEY", envVarName: "GEMINI_API_KEY", label: "Server Runtime Secret (GEMINI_API_KEY)", defaultPriority: 10, slotIndex: 0 },
  { id: "env_GEMINI_API_KEY_1", envVarName: "GEMINI_API_KEY_1", label: "Server Secret Slot 1 (GEMINI_API_KEY_1)", defaultPriority: 11, slotIndex: 1 },
  { id: "env_GEMINI_API_KEY_2", envVarName: "GEMINI_API_KEY_2", label: "Server Secret Slot 2 (GEMINI_API_KEY_2)", defaultPriority: 12, slotIndex: 2 },
  { id: "env_GEMINI_API_KEY_3", envVarName: "GEMINI_API_KEY_3", label: "Server Secret Slot 3 (GEMINI_API_KEY_3)", defaultPriority: 13, slotIndex: 3 },
  { id: "env_GEMINI_API_KEY_4", envVarName: "GEMINI_API_KEY_4", label: "Server Secret Slot 4 (GEMINI_API_KEY_4)", defaultPriority: 14, slotIndex: 4 },
  { id: "env_GEMINI_API_KEY_5", envVarName: "GEMINI_API_KEY_5", label: "Server Secret Slot 5 (GEMINI_API_KEY_5)", defaultPriority: 15, slotIndex: 5 },
  { id: "env_GEMINI_API_KEY_6", envVarName: "GEMINI_API_KEY_6", label: "Server Secret Slot 6 (GEMINI_API_KEY_6)", defaultPriority: 16, slotIndex: 6 },
  { id: "env_GEMINI_API_KEY_7", envVarName: "GEMINI_API_KEY_7", label: "Server Secret Slot 7 (GEMINI_API_KEY_7)", defaultPriority: 17, slotIndex: 7 },
  { id: "env_GEMINI_API_KEY_8", envVarName: "GEMINI_API_KEY_8", label: "Server Secret Slot 8 (GEMINI_API_KEY_8)", defaultPriority: 18, slotIndex: 8 }
];
function scrubSecretText(text) {
  let sanitized = String(text || "");
  sanitized = sanitized.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_API_KEY]");
  const vault = readVaultData();
  const rawKeys = [
    ...ENV_KEY_SLOT_NAMES.map((slot) => process.env[slot.envVarName]),
    ...vault.keys.map((k) => {
      try {
        return decryptText(k.encryptedKey);
      } catch {
        return "";
      }
    })
  ];
  for (const raw of rawKeys) {
    const trimmed = (raw || "").trim();
    if (trimmed && trimmed.length >= 8) {
      sanitized = sanitized.split(trimmed).join("[REDACTED_API_KEY]");
    }
  }
  return sanitized;
}
function getRuntimeEnvKeys() {
  const projectList = (process.env.GEMINI_API_KEY_PROJECTS || "").split(",").map((p) => normalizeProjectId(p));
  const seenValues = /* @__PURE__ */ new Set();
  const active = [];
  for (const item of ENV_KEY_SLOT_NAMES) {
    const val = (process.env[item.envVarName] || "").trim();
    if (!val || seenValues.has(val)) continue;
    seenValues.add(val);
    const explicitPerSlotProject = normalizeProjectId(process.env[`${item.envVarName}_PROJECT`]);
    const listProject = item.slotIndex >= 1 ? projectList[item.slotIndex - 1] : void 0;
    active.push({
      id: item.id,
      envVarName: item.envVarName,
      label: item.label,
      rawKey: val,
      defaultPriority: item.defaultPriority,
      envProjectId: explicitPerSlotProject || listProject
    });
  }
  return active;
}
function resolveEffectiveProjectHealth(vault, projectId, now) {
  if (!projectId) return void 0;
  const rec = vault.projectHealth?.[projectId];
  if (!rec) return void 0;
  const isExpired = rec.cooldownUntil && rec.cooldownUntil <= now;
  if (rec.status === "quota_exhausted" && isExpired) {
    return {
      ...rec,
      status: "ready",
      cooldownUntil: void 0,
      quotaScope: void 0
    };
  }
  return rec;
}
function listProjectHealthSummaries() {
  const vault = readVaultData();
  const now = Date.now();
  const seenProjects = /* @__PURE__ */ new Set();
  for (const k of vault.keys) {
    const pid = normalizeProjectId(k.projectId);
    if (pid) seenProjects.add(pid);
  }
  for (const envItem of getRuntimeEnvKeys()) {
    const ov = vault.envOverrides[envItem.id];
    const pid = normalizeProjectId(ov?.projectId) || envItem.envProjectId;
    if (pid) seenProjects.add(pid);
  }
  for (const pid of Object.keys(vault.projectHealth || {})) {
    if (pid) seenProjects.add(pid);
  }
  const summaries = [];
  for (const pid of Array.from(seenProjects).sort()) {
    const active = resolveEffectiveProjectHealth(vault, pid, now);
    summaries.push(
      active || {
        projectId: pid,
        status: "ready",
        updatedAt: new Date(now).toISOString()
      }
    );
  }
  return summaries;
}
function listResolvedKeys() {
  const vault = readVaultData();
  const now = Date.now();
  const resolved = [];
  for (const rec of vault.keys) {
    let rawKey = "";
    try {
      rawKey = decryptText(rec.encryptedKey).trim();
    } catch {
      rawKey = "";
    }
    if (!rawKey) continue;
    const projectId = normalizeProjectId(rec.projectId);
    const projHealth = resolveEffectiveProjectHealth(vault, projectId, now);
    const isCooldownExpired = rec.cooldownUntil && rec.cooldownUntil <= now;
    const keyStatus = !rec.enabled ? "disabled" : rec.status === "quota_exhausted" && isCooldownExpired ? "ready" : rec.status;
    const effectiveStatus = keyStatus === "ready" && projHealth?.status === "quota_exhausted" ? "quota_exhausted" : keyStatus;
    resolved.push({
      id: rec.id,
      label: rec.label,
      projectId,
      rawKey,
      source: "admin_vault",
      enabled: rec.enabled,
      priority: rec.priority,
      status: effectiveStatus,
      quotaScope: projHealth?.status === "quota_exhausted" ? projHealth.quotaScope : rec.quotaScope,
      cooldownUntil: isCooldownExpired ? void 0 : rec.cooldownUntil,
      projectCooldownUntil: projHealth?.status === "quota_exhausted" ? projHealth.cooldownUntil : void 0
    });
  }
  const envKeys = getRuntimeEnvKeys();
  for (const envItem of envKeys) {
    const ov = vault.envOverrides[envItem.id];
    const enabled = ov ? ov.enabled : true;
    const projectId = normalizeProjectId(ov?.projectId) || envItem.envProjectId;
    const projHealth = resolveEffectiveProjectHealth(vault, projectId, now);
    const isCooldownExpired = ov?.cooldownUntil && ov.cooldownUntil <= now;
    const rawStatus = ov?.status || "ready";
    const keyStatus = !enabled ? "disabled" : rawStatus === "quota_exhausted" && isCooldownExpired ? "ready" : rawStatus;
    const effectiveStatus = keyStatus === "ready" && projHealth?.status === "quota_exhausted" ? "quota_exhausted" : keyStatus;
    resolved.push({
      id: envItem.id,
      label: envItem.label,
      projectId,
      rawKey: envItem.rawKey,
      source: "runtime_env",
      enabled,
      priority: ov?.priority ?? envItem.defaultPriority,
      status: effectiveStatus,
      quotaScope: projHealth?.status === "quota_exhausted" ? projHealth.quotaScope : ov?.quotaScope,
      cooldownUntil: isCooldownExpired ? void 0 : ov?.cooldownUntil,
      projectCooldownUntil: projHealth?.status === "quota_exhausted" ? projHealth.cooldownUntil : void 0
    });
  }
  return resolved.sort((a, b) => a.priority - b.priority);
}
function listSafeKeySummaries() {
  const vault = readVaultData();
  const now = Date.now();
  const summaries = [];
  for (const rec of vault.keys) {
    let raw = "";
    try {
      raw = decryptText(rec.encryptedKey).trim();
    } catch {
      raw = "";
    }
    const projectId = normalizeProjectId(rec.projectId);
    const projHealth = resolveEffectiveProjectHealth(vault, projectId, now);
    const isCooldownExpired = rec.cooldownUntil && rec.cooldownUntil <= now;
    const keyStatus = !rec.enabled ? "disabled" : rec.status === "quota_exhausted" && isCooldownExpired ? "ready" : rec.status;
    const status = keyStatus === "ready" && projHealth?.status === "quota_exhausted" ? "quota_exhausted" : keyStatus;
    summaries.push({
      id: rec.id,
      label: rec.label,
      projectId,
      maskedKey: raw ? maskSecretValue(raw) : "Decrypt Error",
      source: "admin_vault",
      enabled: rec.enabled,
      priority: rec.priority,
      status,
      quotaScope: projHealth?.status === "quota_exhausted" ? projHealth.quotaScope : rec.quotaScope,
      projectCooldownUntil: projHealth?.status === "quota_exhausted" ? projHealth.cooldownUntil : void 0,
      lastError: rec.lastError || (projHealth?.status === "quota_exhausted" ? projHealth.lastError : void 0),
      lastTestedAt: rec.lastTestedAt,
      cooldownUntil: isCooldownExpired ? void 0 : rec.cooldownUntil
    });
  }
  for (const envItem of getRuntimeEnvKeys()) {
    const ov = vault.envOverrides[envItem.id];
    const enabled = ov ? ov.enabled : true;
    const projectId = normalizeProjectId(ov?.projectId) || envItem.envProjectId;
    const projHealth = resolveEffectiveProjectHealth(vault, projectId, now);
    const isCooldownExpired = ov?.cooldownUntil && ov.cooldownUntil <= now;
    const rawStatus = ov?.status || "ready";
    const keyStatus = !enabled ? "disabled" : rawStatus === "quota_exhausted" && isCooldownExpired ? "ready" : rawStatus;
    const status = keyStatus === "ready" && projHealth?.status === "quota_exhausted" ? "quota_exhausted" : keyStatus;
    summaries.push({
      id: envItem.id,
      label: envItem.label,
      projectId,
      maskedKey: maskSecretValue(envItem.rawKey),
      source: "runtime_env",
      envVarName: envItem.envVarName,
      enabled,
      priority: ov?.priority ?? envItem.defaultPriority,
      status,
      quotaScope: projHealth?.status === "quota_exhausted" ? projHealth.quotaScope : ov?.quotaScope,
      projectCooldownUntil: projHealth?.status === "quota_exhausted" ? projHealth.cooldownUntil : void 0,
      lastError: ov?.lastError || (projHealth?.status === "quota_exhausted" ? projHealth.lastError : void 0),
      lastTestedAt: ov?.lastTestedAt,
      cooldownUntil: isCooldownExpired ? void 0 : ov?.cooldownUntil
    });
  }
  return summaries.sort((a, b) => a.priority - b.priority);
}
function getModelConfig() {
  return readVaultData().modelConfig;
}
function updateModelConfig(patch) {
  const vault = readVaultData();
  const validIds = new Set(VERIFIED_GEMINI_MODELS.map((m) => m.id));
  vault.modelConfig.configVersion = CURRENT_MODEL_CONFIG_VERSION;
  if (patch.enabledModels && typeof patch.enabledModels === "object") {
    for (const [id, enabled] of Object.entries(patch.enabledModels)) {
      if (validIds.has(id) && typeof enabled === "boolean") {
        vault.modelConfig.enabledModels[id] = enabled;
      }
    }
  }
  if (patch.primaryImageModel && validIds.has(patch.primaryImageModel)) {
    const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === patch.primaryImageModel);
    if (spec?.capability === "image") {
      vault.modelConfig.primaryImageModel = patch.primaryImageModel;
      vault.modelConfig.enabledModels[patch.primaryImageModel] = true;
    }
  }
  if (patch.primaryTextModel && validIds.has(patch.primaryTextModel)) {
    const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === patch.primaryTextModel);
    if (spec?.capability === "text") {
      vault.modelConfig.primaryTextModel = patch.primaryTextModel;
      vault.modelConfig.enabledModels[patch.primaryTextModel] = true;
    }
  }
  if (patch.primaryVideoModel && validIds.has(patch.primaryVideoModel)) {
    const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === patch.primaryVideoModel);
    if (spec?.capability === "omni") {
      vault.modelConfig.primaryVideoModel = patch.primaryVideoModel;
      vault.modelConfig.enabledModels[patch.primaryVideoModel] = true;
    }
  }
  if (patch.imageSelectionPolicy && ["balanced", "economy_first", "quality_first", "manual_primary"].includes(patch.imageSelectionPolicy)) {
    vault.modelConfig.imageSelectionPolicy = patch.imageSelectionPolicy;
  }
  if (typeof patch.enableAutoRouting === "boolean") {
    vault.modelConfig.enableAutoRouting = patch.enableAutoRouting;
  }
  if (typeof patch.enableKeyFallback === "boolean") {
    vault.modelConfig.enableKeyFallback = patch.enableKeyFallback;
  }
  if (typeof patch.enableModelFallback === "boolean") {
    vault.modelConfig.enableModelFallback = patch.enableModelFallback;
  }
  writeVaultData(vault, { strictRemoteSecret: true });
  return vault.modelConfig;
}
function addVaultApiKey(params) {
  const cleanKey = (params.apiKey || "").trim();
  if (!cleanKey || cleanKey.length < 16) {
    throw new Error("Please enter a valid Google Gemini API key.");
  }
  const cleanLabel = (params.label || "").trim() || `Admin Key ${Date.now().toString().slice(-4)}`;
  const vault = readVaultData();
  const id = `vk_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const nextPriority = typeof params.priority === "number" && Number.isFinite(params.priority) ? Math.max(1, Math.min(999, Math.round(params.priority))) : vault.keys.length + 1;
  vault.keys.push({
    id,
    label: cleanLabel.slice(0, 60),
    projectId: normalizeProjectId(params.projectId),
    encryptedKey: encryptText(cleanKey),
    enabled: true,
    priority: nextPriority,
    status: "ready",
    createdAt: nowIso,
    updatedAt: nowIso
  });
  writeVaultData(vault, { strictRemoteSecret: true });
  return listSafeKeySummaries().find((k) => k.id === id);
}
function updateVaultApiKey(keyId, patch) {
  const vault = readVaultData();
  if (keyId.startsWith("env_")) {
    const envItem = getRuntimeEnvKeys().find((e) => e.id === keyId);
    if (!envItem) return null;
    const prev = vault.envOverrides[keyId] || {
      enabled: true,
      priority: envItem.defaultPriority,
      status: "ready"
    };
    const nextEnabled = typeof patch.enabled === "boolean" ? patch.enabled : prev.enabled;
    const nextProjectId2 = patch.projectId !== void 0 ? normalizeProjectId(patch.projectId) : normalizeProjectId(prev.projectId) || envItem.envProjectId;
    vault.envOverrides[keyId] = {
      ...prev,
      projectId: nextProjectId2,
      enabled: nextEnabled,
      priority: typeof patch.priority === "number" && Number.isFinite(patch.priority) ? Math.max(1, Math.min(999, Math.round(patch.priority))) : prev.priority,
      status: patch.resetHealth ? "ready" : !nextEnabled ? "disabled" : prev.status === "disabled" ? "ready" : prev.status,
      quotaScope: patch.resetHealth ? void 0 : prev.quotaScope,
      lastError: patch.resetHealth ? void 0 : prev.lastError,
      cooldownUntil: patch.resetHealth ? void 0 : prev.cooldownUntil
    };
    if (patch.resetHealth && nextProjectId2 && vault.projectHealth[nextProjectId2]) {
      delete vault.projectHealth[nextProjectId2];
    }
    writeVaultData(vault, { strictRemoteSecret: true });
    return listSafeKeySummaries().find((k) => k.id === keyId) || null;
  }
  const idx = vault.keys.findIndex((k) => k.id === keyId);
  if (idx === -1) return null;
  const current = vault.keys[idx];
  const updatedEnabled = typeof patch.enabled === "boolean" ? patch.enabled : current.enabled;
  const nextProjectId = patch.projectId !== void 0 ? normalizeProjectId(patch.projectId) : normalizeProjectId(current.projectId);
  let updatedEncrypted = current.encryptedKey;
  let updatedStatus = current.status;
  let updatedError = current.lastError;
  let updatedCooldown = current.cooldownUntil;
  let updatedQuotaScope = current.quotaScope;
  if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
    const cleanNew = patch.apiKey.trim();
    if (cleanNew.length < 16) {
      throw new Error("Replacement Gemini API key is too short.");
    }
    updatedEncrypted = encryptText(cleanNew);
    updatedStatus = updatedEnabled ? "ready" : "disabled";
    updatedError = void 0;
    updatedCooldown = void 0;
    updatedQuotaScope = void 0;
  } else if (patch.resetHealth) {
    updatedStatus = updatedEnabled ? "ready" : "disabled";
    updatedError = void 0;
    updatedCooldown = void 0;
    updatedQuotaScope = void 0;
    if (nextProjectId && vault.projectHealth[nextProjectId]) {
      delete vault.projectHealth[nextProjectId];
    }
  } else if (typeof patch.enabled === "boolean") {
    updatedStatus = updatedEnabled ? current.status === "disabled" ? "ready" : current.status : "disabled";
  }
  vault.keys[idx] = {
    ...current,
    label: typeof patch.label === "string" && patch.label.trim() ? patch.label.trim().slice(0, 60) : current.label,
    projectId: nextProjectId,
    encryptedKey: updatedEncrypted,
    enabled: updatedEnabled,
    priority: typeof patch.priority === "number" && Number.isFinite(patch.priority) ? Math.max(1, Math.min(999, Math.round(patch.priority))) : current.priority,
    status: updatedStatus,
    quotaScope: updatedQuotaScope,
    lastError: updatedError,
    cooldownUntil: updatedCooldown,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeVaultData(vault, { strictRemoteSecret: true });
  return listSafeKeySummaries().find((k) => k.id === keyId) || null;
}
function deleteVaultApiKey(keyId) {
  if (keyId.startsWith("env_")) {
    throw new Error("Runtime server environment keys cannot be deleted; disable them instead.");
  }
  const vault = readVaultData();
  const nextKeys = vault.keys.filter((k) => k.id !== keyId);
  if (nextKeys.length === vault.keys.length) return false;
  vault.keys = nextKeys;
  writeVaultData(vault, { strictRemoteSecret: true });
  return true;
}
function recordKeyHealthResult(keyId, result) {
  const vault = readVaultData();
  const now = Date.now();
  const safeError = result.error ? scrubSecretText(result.error).slice(0, 240) : void 0;
  const cooldownUntil = result.cooldownMs ? now + result.cooldownMs : void 0;
  const testedAt = result.testedAt || new Date(now).toISOString();
  let resolvedProjectId = normalizeProjectId(result.projectId);
  if (keyId.startsWith("env_")) {
    const envItem = getRuntimeEnvKeys().find((e) => e.id === keyId);
    const prev = vault.envOverrides[keyId] || {
      enabled: true,
      priority: envItem?.defaultPriority ?? 10,
      status: "ready"
    };
    if (!resolvedProjectId) {
      resolvedProjectId = normalizeProjectId(prev.projectId) || envItem?.envProjectId;
    }
    vault.envOverrides[keyId] = {
      ...prev,
      status: prev.enabled ? result.status : "disabled",
      quotaScope: result.status === "ready" ? void 0 : result.quotaScope,
      lastError: safeError,
      lastTestedAt: testedAt,
      cooldownUntil
    };
  } else {
    const idx = vault.keys.findIndex((k) => k.id === keyId);
    if (idx === -1) return;
    const cur = vault.keys[idx];
    if (!resolvedProjectId) {
      resolvedProjectId = normalizeProjectId(cur.projectId);
    }
    vault.keys[idx] = {
      ...cur,
      status: cur.enabled ? result.status : "disabled",
      quotaScope: result.status === "ready" ? void 0 : result.quotaScope,
      lastError: safeError,
      lastTestedAt: testedAt,
      cooldownUntil,
      updatedAt: testedAt
    };
  }
  if (resolvedProjectId) {
    if (result.status === "ready") {
      vault.projectHealth[resolvedProjectId] = {
        projectId: resolvedProjectId,
        status: "ready",
        updatedAt: testedAt
      };
    } else if (result.status === "quota_exhausted" && result.projectCooldownMs && result.projectCooldownMs > 0) {
      vault.projectHealth[resolvedProjectId] = {
        projectId: resolvedProjectId,
        status: "quota_exhausted",
        quotaScope: result.quotaScope,
        cooldownUntil: now + result.projectCooldownMs,
        lastError: safeError,
        updatedAt: testedAt
      };
    }
  }
  writeVaultData(vault);
}

// server/aiBackend.ts
var cloudinary2 = cloudinaryPkg2.v2;
var ALLOWED_IMAGE_MIMES = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp"]);
var ALLOWED_VIDEO_MIMES = /* @__PURE__ */ new Set(["video/mp4", "video/webm", "video/quicktime"]);
var MAX_PROMPT_LENGTH = 2e3;
var MAX_IMAGE_BASE64_CHARS = 12 * 1024 * 1024;
var VERCEL_SAFE_BASE64_THRESHOLD = 34e5;
var VERCEL_HARD_BASE64_LIMIT = 42e5;
var RPM_COOLDOWN_MS = 60 * 1e3;
var MAX_RPM_COOLDOWN_MS = 180 * 1e3;
var MIN_DAILY_RPD_COOLDOWN_MS = 15 * 60 * 1e3;
var MAX_DAILY_RPD_COOLDOWN_MS = 24 * 60 * 60 * 1e3 + 60 * 1e3;
var DAILY_RPD_FALLBACK_COOLDOWN_MS = 6 * 60 * 60 * 1e3;
function getMsUntilDailyQuotaReset(nowMs = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).formatToParts(new Date(nowMs));
    const map = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]));
    const hour = Number.isFinite(map.hour) ? map.hour % 24 : 0;
    const minute = Number.isFinite(map.minute) ? map.minute : 0;
    const second = Number.isFinite(map.second) ? map.second : 0;
    const elapsedSecondsToday = hour * 3600 + minute * 60 + second;
    const secondsUntilMidnight = Math.max(0, 86400 - elapsedSecondsToday) + 60;
    const ms = secondsUntilMidnight * 1e3;
    return Math.min(MAX_DAILY_RPD_COOLDOWN_MS, Math.max(MIN_DAILY_RPD_COOLDOWN_MS, ms));
  } catch {
    return DAILY_RPD_FALLBACK_COOLDOWN_MS;
  }
}
function getBackendHost() {
  return process.env.VERCEL ? "vercel-serverless" : "nodejs-express";
}
function defaultClientFactory(apiKey, apiVersion) {
  const ai = new GoogleGenAI({
    apiKey,
    ...apiVersion ? { apiVersion } : {},
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
  return {
    generateContent: (params) => ai.models.generateContent(params),
    createInteraction: (params, options) => ai.interactions.create(params, options)
  };
}
function extractRetryAfterMs(text) {
  const retryMatch = text.match(/(?:retry in|retrydelay["':\s]+)(\d+(?:\.\d+)?)\s*s/i);
  if (retryMatch) {
    const secs = Number(retryMatch[1]);
    if (Number.isFinite(secs) && secs > 0) {
      return Math.round(secs * 1e3);
    }
  }
  return void 0;
}
function resolveCooldownForQuotaError(classified, nowMs = Date.now()) {
  const scope = classified.quotaScope || "rpm_throttle";
  if (scope === "daily_rpd" || scope === "billing") {
    const dailyMs = getMsUntilDailyQuotaReset(nowMs);
    return {
      keyCooldownMs: dailyMs,
      projectCooldownMs: dailyMs,
      quotaScope: scope
    };
  }
  const rpmMs = classified.retryAfterMs ? Math.min(MAX_RPM_COOLDOWN_MS, Math.max(3e4, classified.retryAfterMs)) : RPM_COOLDOWN_MS;
  return {
    keyCooldownMs: rpmMs,
    projectCooldownMs: rpmMs,
    quotaScope: "rpm_throttle"
  };
}
function classifyGeminiError(err, modelId) {
  const extraDetails = (() => {
    try {
      if (err?.errorDetails || err?.details) {
        return scrubSecretText(JSON.stringify(err.errorDetails || err.details));
      }
    } catch {
      return "";
    }
    return "";
  })();
  const rawMessage = scrubSecretText(String(err?.message || err || "AI processing failed."));
  const combined = `${rawMessage} ${extraDetails}`.trim();
  const lower = combined.toLowerCase();
  const statusCode = Number(err?.status || err?.code || 0);
  if (statusCode === 401 || statusCode === 403 || lower.includes("permission_denied") || lower.includes("api_key_invalid") || lower.includes("api key not valid") || lower.includes("invalid api key") || lower.includes("unauthenticated")) {
    return {
      kind: "INVALID_KEY",
      httpStatus: 403,
      code: "GEMINI_KEY_INVALID",
      message: "API key was rejected or lacks Gemini API permission."
    };
  }
  if (statusCode === 429 || lower.includes("resource_exhausted") || lower.includes("quota") || lower.includes("rate limit") || lower.includes("too many requests")) {
    const retryAfterMs = extractRetryAfterMs(combined);
    const isBilling = /check your plan and billing|billing account|billing_not_active|spend limit/i.test(combined);
    const isDailyQuota = isBilling || /requestsperday|per_?day|\brpd\b|daily[_ ]?(?:quota|limit|requests)|generate_content_free_tier_requests.*(?:day|0)|limit:\s*0/i.test(
      combined
    );
    const quotaScope = isBilling ? "billing" : isDailyQuota ? "daily_rpd" : "rpm_throttle";
    return {
      kind: "QUOTA_EXCEEDED",
      httpStatus: 429,
      code: quotaScope === "rpm_throttle" ? "GEMINI_RPM_RATE_LIMITED" : quotaScope === "billing" ? "GEMINI_BILLING_QUOTA_EXCEEDED" : "GEMINI_DAILY_QUOTA_EXCEEDED",
      message: quotaScope === "rpm_throttle" ? "Gemini API per-minute rate limit (RPM) reached; rotating to next healthy key/project." : "Gemini project daily quota (RPD) exhausted; failing over to next healthy Google Cloud project.",
      quotaScope,
      retryAfterMs
    };
  }
  if (statusCode === 404 || lower.includes("not_found") || lower.includes("is not found") || lower.includes("not supported for generatecontent")) {
    return {
      kind: "MODEL_UNAVAILABLE",
      httpStatus: 404,
      code: "GEMINI_MODEL_UNAVAILABLE",
      message: `Gemini model (${modelId || "selected"}) is unavailable or requires a higher API tier.`
    };
  }
  if (statusCode === 400 || lower.includes("invalid_argument") || lower.includes("safety")) {
    return {
      kind: "BAD_REQUEST",
      httpStatus: 400,
      code: "GEMINI_BAD_REQUEST",
      message: rawMessage || "Request could not be processed by Gemini."
    };
  }
  return {
    kind: "UPSTREAM_TRANSIENT",
    httpStatus: 502,
    code: "GEMINI_UPSTREAM_ERROR",
    message: rawMessage || "Temporary upstream Gemini error."
  };
}
function mapStatusLabel(s) {
  if (s === "ready") return "Ready";
  if (s === "disabled") return "Disabled";
  if (s === "quota_exhausted") return "Quota Exhausted";
  if (s === "invalid") return "Invalid Key";
  return "Error";
}
function isVerifiedSuperAdmin(caller) {
  return Boolean(caller && caller.email === SUPER_ADMIN_EMAIL && caller.emailVerified === true);
}
function getPublicAiCapabilityStatus() {
  const keys = listResolvedKeys();
  const modelConfig = getModelConfig();
  const activeKeys = keys.filter((k) => k.enabled && k.status !== "invalid");
  const healthyKeys = activeKeys.filter(
    (k) => k.status === "ready" && (!k.cooldownUntil || k.cooldownUntil <= Date.now())
  );
  const verifiedModels = VERIFIED_GEMINI_MODELS.map((spec) => ({
    ...spec,
    enabled: Boolean(modelConfig.enabledModels[spec.id]),
    isPrimary: spec.id === modelConfig.primaryImageModel || spec.id === modelConfig.primaryTextModel || spec.id === modelConfig.primaryVideoModel
  }));
  const enabledImageModels = verifiedModels.filter((m) => m.capability === "image" && m.enabled);
  const enabledTextModels = verifiedModels.filter((m) => m.capability === "text" && m.enabled);
  const enabledVideoModels = verifiedModels.filter((m) => m.capability === "omni" && m.enabled);
  const primaryImageModel = enabledImageModels.find((m) => m.id === modelConfig.primaryImageModel)?.id || enabledImageModels[0]?.id || "gemini-3.1-flash-lite-image";
  const primaryTextModel = enabledTextModels.find((m) => m.id === modelConfig.primaryTextModel)?.id || enabledTextModels[0]?.id || "gemini-3.1-pro-preview";
  const primaryVideoModel = enabledVideoModels.find((m) => m.id === modelConfig.primaryVideoModel)?.id || enabledVideoModels[0]?.id || "gemini-omni-1.2-flash";
  const configured = activeKeys.length > 0;
  const videoSupported = configured && enabledVideoModels.length > 0;
  return {
    ok: true,
    configured,
    provider: "google-gemini",
    backendHost: getBackendHost(),
    autoRoutingEnabled: modelConfig.enableAutoRouting,
    imageSelectionPolicy: modelConfig.imageSelectionPolicy,
    photoSupported: configured && enabledImageModels.length > 0,
    textSupported: configured && enabledTextModels.length > 0,
    photoModel: primaryImageModel,
    textModel: primaryTextModel,
    videoModel: primaryVideoModel,
    supportedModels: enabledImageModels.map((m) => m.id),
    verifiedModels,
    routingArchitecture: {
      assistantPreferred: primaryTextModel,
      photoTiers: {
        lite: enabledImageModels.find((m) => m.qualityTier === "lite")?.id || null,
        standard: enabledImageModels.find((m) => m.qualityTier === "standard")?.id || null,
        pro: enabledImageModels.find((m) => m.qualityTier === "pro")?.id || null
      },
      videoExclusive: enabledVideoModels[0]?.id || null
    },
    videoSupported,
    videoReason: videoSupported ? `Gemini Omni (${primaryVideoModel}) is configured for video routing via /api/ai/route. Interactive timeline editing tools (Trim, Filters, Music, Text) are available in Post Editor.` : "Video AI requires an active paid-tier Gemini API key and an enabled Gemini Omni model in Admin Panel \u2192 AI Model Manager.",
    missingEnv: configured ? [] : ["ADMIN_VAULT_OR_SERVER_KEY"],
    activeKeyCount: activeKeys.length,
    healthyKeyCount: healthyKeys.length,
    keyStatuses: keys.map((k, idx) => ({
      keyIndex: idx + 1,
      id: k.id,
      label: k.source === "admin_vault" ? `Key Slot ${idx + 1}` : `Server Key ${idx + 1}`,
      projectId: k.projectId,
      configured: true,
      enabled: k.enabled,
      source: k.source,
      status: mapStatusLabel(k.status),
      quotaScope: k.quotaScope
    })),
    projects: listProjectHealthSummaries()
  };
}
async function getPublicAiCapabilityStatusAsync() {
  await syncVaultFromRemote();
  return getPublicAiCapabilityStatus();
}
function getAdminAiState() {
  const modelConfig = getModelConfig();
  const keys = listSafeKeySummaries();
  const models = VERIFIED_GEMINI_MODELS.map((spec) => ({
    ...spec,
    enabled: Boolean(modelConfig.enabledModels[spec.id]),
    isPrimary: spec.id === modelConfig.primaryImageModel || spec.id === modelConfig.primaryTextModel || spec.id === modelConfig.primaryVideoModel
  }));
  return {
    ok: true,
    backendHost: getBackendHost(),
    storageMode: "aes-256-gcm-backend-vault",
    persistence: getVaultPersistenceInfo(),
    models,
    modelConfig,
    keys,
    projects: listProjectHealthSummaries()
  };
}
async function getAdminAiStateAsync() {
  await syncVaultFromRemote(true);
  return getAdminAiState();
}
var projectRotationCursor = 0;
function getEligibleKeysForExecution(options) {
  const now = Date.now();
  const allKeys = [...options?.overrideKeys || listResolvedKeys()].sort(
    (a, b) => a.priority - b.priority
  );
  const modelCfg = options?.overrideConfig || getModelConfig();
  const allowFallback = typeof options?.allowFallback === "boolean" ? options.allowFallback : modelCfg.enableKeyFallback;
  const projectHealthList = options?.overrideProjectHealth || listProjectHealthSummaries();
  const activeCooldownProjects = /* @__PURE__ */ new Set();
  for (const ph of projectHealthList) {
    if (ph.status === "quota_exhausted" && ph.cooldownUntil && ph.cooldownUntil > now) {
      activeCooldownProjects.add(ph.projectId);
    }
  }
  const eligible = allKeys.filter((k) => {
    if (!k.enabled || k.status === "invalid" || k.status === "disabled") return false;
    if (k.cooldownUntil && k.cooldownUntil > now) return false;
    if (k.projectCooldownUntil && k.projectCooldownUntil > now) return false;
    if (k.status === "quota_exhausted" && (!k.cooldownUntil || k.cooldownUntil > now)) {
      return false;
    }
    if (k.projectId && activeCooldownProjects.has(k.projectId)) return false;
    return true;
  });
  if (eligible.length <= 1) {
    return allowFallback ? eligible : eligible.slice(0, 1);
  }
  const projectBuckets = /* @__PURE__ */ new Map();
  const ungrouped = [];
  for (const key of eligible) {
    if (key.projectId) {
      const bucket = projectBuckets.get(key.projectId) || [];
      bucket.push(key);
      projectBuckets.set(key.projectId, bucket);
    } else {
      ungrouped.push(key);
    }
  }
  let ordered = [];
  if (projectBuckets.size > 1) {
    const projectIds = Array.from(projectBuckets.keys());
    const startOffset = options?.rotateProjects === false ? 0 : projectRotationCursor % projectIds.length;
    if (options?.rotateProjects !== false) {
      projectRotationCursor = (projectRotationCursor + 1) % 1e5;
    }
    const rotatedProjects = [
      ...projectIds.slice(startOffset),
      ...projectIds.slice(0, startOffset)
    ];
    const maxLen = Math.max(...rotatedProjects.map((pid) => projectBuckets.get(pid).length));
    for (let i = 0; i < maxLen; i++) {
      for (const pid of rotatedProjects) {
        const bucket = projectBuckets.get(pid);
        if (i < bucket.length) ordered.push(bucket[i]);
      }
    }
    ordered.push(...ungrouped);
  } else {
    ordered = eligible;
  }
  return allowFallback ? ordered : ordered.slice(0, 1);
}
var PRO_QUALITY_IMAGE_REGEX = /\b(4k|8k|ultra|studio|pro|professional|editorial|luxury|cinematic|poster|billboard|typography|exact text|logo design|product shoot|architecture|hyper[- ]?realistic|photorealistic|multi[- ]?reference|magazine|high[- ]?res(?:olution)?)\b/i;
var LITE_ECONOMY_IMAGE_REGEX = /\b(fast|quick|draft|preview|simple|minimal|sketch|icon|sticker|lite|economical|thumbnail|lighting|brighten|enhance quality|remove bg|remove background)\b/i;
var IMAGE_TO_VIDEO_REGEX = /\b(turn (?:this |the )?(?:photo|image|picture) into (?:an? )?(?:\w+\s+){0,4}(?:video|clip|reel|animation)|animate (?:this |the )?(?:photo|image|picture)|image[- ]?to[- ]?video|make (?:an? )?(?:\w+\s+){0,4}(?:video|clip|reel|animation) (?:from|of) (?:this|the)(?: (?:photo|image|picture))?)\b/i;
var VIDEO_EDIT_REGEX = /\b(edit|modify|change|extend|continue|replace|swap|stabilize|color grade|upscale)\b.{0,30}\b(video|clip|footage|reel)\b/i;
var VIDEO_GENERATION_REGEX = /\b(?:(?:generate|create|make|render|produce|shoot|animate|build)\b.{0,35}\b(video|clip|reel|short film|animation|motion clip|timelapse|time-lapse)|text[- ]?to[- ]?video|video generation)\b/i;
var PHOTO_EDIT_REGEX = /\b(?:(?:edit|retouch|upscale|fix|change background|remove background|remove object|enhance)\b.{0,30}\b(photo|image|picture|portrait|selfie))\b/i;
var PHOTO_GENERATION_REGEX = /\b(?:(?:generate|create|make|draw|paint|design|illustrate|sketch|render|show me)\b.{0,35}\b(image|photo|picture|portrait|logo|poster|wallpaper|avatar|artwork|illustration|banner|thumbnail|icon))\b/i;
function classifyAiTaskIntent(params) {
  const prompt = (params.prompt || "").trim();
  const mediaType = (params.mediaType || "").toLowerCase();
  const isVoiceRequest = Boolean(params.isVoiceRequest) || params.explicitTask === "voice_request";
  if (params.explicitTask && params.explicitTask !== "auto" && params.explicitTask !== "voice_request") {
    const task = params.explicitTask;
    const domain = task === "text_chat" ? "text" : task === "photo_generation" || task === "photo_editing" ? "image" : "video";
    return {
      task,
      domain,
      isVoiceRequest,
      reason: `Explicit task routing: ${task}`
    };
  }
  if (params.hasSourceVideo || mediaType === "video" && VIDEO_EDIT_REGEX.test(prompt)) {
    return {
      task: "video_editing",
      domain: "video",
      isVoiceRequest,
      reason: "Source video or video-editing instruction detected; routing exclusively to Video AI (Omni)."
    };
  }
  if (params.hasSourceImage) {
    if (mediaType === "video" || IMAGE_TO_VIDEO_REGEX.test(prompt)) {
      return {
        task: "image_to_video",
        domain: "video",
        isVoiceRequest,
        reason: "Image-to-video animation intent detected; routing exclusively to Video AI (Omni)."
      };
    }
    return {
      task: "photo_editing",
      domain: "image",
      isVoiceRequest,
      reason: "Source photo attached; routing strictly to Nano Banana Photo Editing AI."
    };
  }
  if (mediaType === "video" || VIDEO_GENERATION_REGEX.test(prompt)) {
    return {
      task: "video_generation",
      domain: "video",
      isVoiceRequest,
      reason: "Video generation intent detected; routing exclusively to Video AI (Omni)."
    };
  }
  if (VIDEO_EDIT_REGEX.test(prompt)) {
    return {
      task: "video_editing",
      domain: "video",
      isVoiceRequest,
      reason: "Video editing intent detected; routing exclusively to Video AI (Omni)."
    };
  }
  if (PHOTO_EDIT_REGEX.test(prompt)) {
    return {
      task: "photo_editing",
      domain: "image",
      isVoiceRequest,
      reason: "Photo editing intent detected; routing strictly to Nano Banana Photo AI."
    };
  }
  if (mediaType === "photo" || Boolean(params.presetAction?.trim()) || PHOTO_GENERATION_REGEX.test(prompt)) {
    return {
      task: "photo_generation",
      domain: "image",
      isVoiceRequest,
      reason: "Photo generation intent detected; routing strictly to Nano Banana Photo AI."
    };
  }
  return {
    task: "text_chat",
    domain: "text",
    isVoiceRequest,
    reason: isVoiceRequest ? "Voice-transcribed assistant request detected; routing to Gemini 3.1 Pro." : "Assistant chat / Q&A / reasoning request detected; routing to Gemini 3.1 Pro."
  };
}
function selectAutoImageModelOrder(params) {
  const cfg = params.overrideConfig || getModelConfig();
  const enabledImageSpecs = VERIFIED_GEMINI_MODELS.filter(
    (m) => m.capability === "image" && cfg.enabledModels[m.id]
  ).sort((a, b) => a.priority - b.priority);
  if (enabledImageSpecs.length === 0) {
    return {
      selectedTier: "standard",
      orderedModels: [],
      reason: "All image models are disabled in Admin Policy."
    };
  }
  const primarySpec = enabledImageSpecs.find((s) => s.id === cfg.primaryImageModel) || enabledImageSpecs[0];
  const combinedText = `${params.presetAction || ""} ${params.prompt || ""}`.trim();
  let targetTier = primarySpec?.qualityTier || "lite";
  let reason = `Auto-selected photo model tier (${targetTier}).`;
  if (!cfg.enableAutoRouting && !params.qualityHint) {
    targetTier = primarySpec?.qualityTier || "lite";
    reason = `Auto-routing disabled: using configured primary image model (${cfg.primaryImageModel}) strictly.`;
  } else if (params.qualityHint) {
    targetTier = params.qualityHint;
    reason = `Explicit quality hint "${targetTier}" applied.`;
  } else if (cfg.imageSelectionPolicy === "manual_primary") {
    targetTier = primarySpec?.qualityTier || "lite";
    reason = `Admin policy enforces primary image model (${cfg.primaryImageModel}).`;
  } else if (cfg.imageSelectionPolicy === "economy_first") {
    targetTier = "lite";
    reason = "Admin policy prefers economical fast photo model (Nano Banana 2 Lite).";
  } else if (cfg.imageSelectionPolicy === "quality_first") {
    targetTier = "pro";
    reason = "Admin policy prefers premium studio quality photo model (Nano Banana Pro).";
  } else if (cfg.imageSelectionPolicy === "balanced") {
    if (PRO_QUALITY_IMAGE_REGEX.test(combinedText)) {
      targetTier = "pro";
      reason = "High-detail / studio / typography cues detected -> auto-selected Nano Banana Pro.";
    } else if (LITE_ECONOMY_IMAGE_REGEX.test(combinedText) || params.presetAction && /lighting|enhance|remove bg/i.test(params.presetAction)) {
      targetTier = "lite";
      reason = "Fast / quick-adjustment cues detected -> auto-selected Nano Banana 2 Lite.";
    } else {
      targetTier = "standard";
      reason = params.hasSourceImage ? "Standard photo editing task -> auto-selected Nano Banana 2.1 / standard." : "Standard photo generation task -> auto-selected Nano Banana 2.1 / standard.";
    }
  }
  const tierPriorityOrder = {
    lite: [
      "gemini-3.1-flash-lite-image",
      "gemini-nano-banana-2.1",
      "gemini-3-pro-image",
      "gemini-3.1-flash-image",
      "gemini-2.5-flash-image"
    ],
    standard: [
      cfg.primaryImageModel,
      "gemini-nano-banana-2.1",
      "gemini-3.1-flash-lite-image",
      "gemini-3-pro-image",
      "gemini-3.1-flash-image",
      "gemini-2.5-flash-image"
    ],
    pro: [
      "gemini-3-pro-image",
      "gemini-nano-banana-2.1",
      "gemini-3.1-flash-lite-image",
      "gemini-3.1-flash-image",
      "gemini-2.5-flash-image"
    ]
  };
  const enabledSet = new Set(enabledImageSpecs.map((s) => s.id));
  const orderedIds = [];
  if (params.requestedModel && enabledSet.has(params.requestedModel)) {
    orderedIds.push(params.requestedModel);
    reason = `Manual image model override: ${params.requestedModel}.`;
  }
  if ((!cfg.enableAutoRouting || cfg.imageSelectionPolicy === "manual_primary") && enabledSet.has(cfg.primaryImageModel)) {
    if (!orderedIds.includes(cfg.primaryImageModel)) {
      orderedIds.push(cfg.primaryImageModel);
    }
  }
  for (const candidateId of tierPriorityOrder[targetTier]) {
    if (enabledSet.has(candidateId) && !orderedIds.includes(candidateId)) {
      if (orderedIds.length === 0 || cfg.enableModelFallback) {
        orderedIds.push(candidateId);
      }
    }
  }
  if (cfg.enableModelFallback) {
    for (const s of enabledImageSpecs) {
      if (!orderedIds.includes(s.id)) orderedIds.push(s.id);
    }
  }
  return {
    selectedTier: targetTier,
    orderedModels: orderedIds.slice(0, cfg.enableModelFallback ? orderedIds.length : 1),
    reason
  };
}
function getEligibleModelsForDomain(domain, options) {
  const cfg = options?.overrideConfig || getModelConfig();
  if (domain === "image") {
    return selectAutoImageModelOrder({
      prompt: "",
      requestedModel: options?.requestedModel,
      overrideConfig: cfg
    }).orderedModels;
  }
  if (domain === "text") {
    const candidates2 = VERIFIED_GEMINI_MODELS.filter(
      (m) => m.capability === "text" && cfg.enabledModels[m.id]
    ).sort((a, b) => a.priority - b.priority);
    const ordered2 = [];
    if (options?.requestedModel && candidates2.some((m) => m.id === options.requestedModel)) {
      ordered2.push(options.requestedModel);
    }
    if (candidates2.some((m) => m.id === cfg.primaryTextModel) && !ordered2.includes(cfg.primaryTextModel)) {
      ordered2.push(cfg.primaryTextModel);
    }
    if (cfg.enableModelFallback) {
      for (const c of candidates2) {
        if (!ordered2.includes(c.id)) ordered2.push(c.id);
      }
    }
    return ordered2.slice(0, cfg.enableModelFallback ? ordered2.length : 1);
  }
  const vTask = options?.videoTask || "video_generation";
  const candidates = VERIFIED_GEMINI_MODELS.filter((m) => {
    if (m.capability !== "omni" || !cfg.enabledModels[m.id]) return false;
    if (vTask === "video_generation") return Boolean(m.supportsVideoGeneration);
    if (vTask === "image_to_video") return Boolean(m.supportsImageToVideo);
    if (vTask === "video_editing") return Boolean(m.supportsVideoEditing);
    return true;
  }).sort((a, b) => a.priority - b.priority);
  const ordered = [];
  if (options?.requestedModel && candidates.some((m) => m.id === options.requestedModel)) {
    ordered.push(options.requestedModel);
  }
  if (candidates.some((m) => m.id === cfg.primaryVideoModel) && !ordered.includes(cfg.primaryVideoModel)) {
    ordered.push(cfg.primaryVideoModel);
  }
  if (cfg.enableModelFallback) {
    for (const c of candidates) {
      if (!ordered.includes(c.id)) ordered.push(c.id);
    }
  }
  return ordered.slice(0, cfg.enableModelFallback ? ordered.length : 1);
}
function buildPhotoInstruction(prompt, presetAction, hasSourcePhoto) {
  const cleanPrompt = prompt.trim();
  const actionContext = typeof presetAction === "string" && presetAction.trim() ? `Requested tool: ${presetAction.trim()}. ` : "";
  if (hasSourcePhoto) {
    return [
      "Edit the provided user photo faithfully according to these instructions while preserving the main subject identity and natural proportions unless explicitly asked to change them.",
      actionContext + cleanPrompt,
      "Return the edited image directly."
    ].join(" ");
  }
  return `Generate a high-quality, cohesive image matching this prompt: ${actionContext}${cleanPrompt}`;
}
async function executeImageAiWithFallback(params) {
  const keys = getEligibleKeysForExecution({
    overrideKeys: params.overrideKeys,
    overrideConfig: params.overrideConfig,
    overrideProjectHealth: params.overrideProjectHealth
  });
  if (keys.length === 0) {
    return {
      status: 503,
      payload: {
        ok: false,
        code: "AI_PROVIDER_NOT_CONFIGURED",
        error: "No active healthy Gemini API keys are available. Add or enable a valid API key in Admin Panel \u2192 AI Model Manager."
      }
    };
  }
  const hasSourcePhoto = Boolean(params.imageBase64 && params.mimeType);
  const autoPlan = selectAutoImageModelOrder({
    prompt: params.prompt,
    presetAction: params.presetAction,
    hasSourceImage: hasSourcePhoto,
    requestedModel: params.requestedModel,
    qualityHint: params.qualityHint,
    overrideConfig: params.overrideConfig
  });
  const models = autoPlan.orderedModels;
  if (models.length === 0) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: "NO_ENABLED_IMAGE_MODELS",
        error: "All Gemini image models are currently disabled by Admin."
      }
    };
  }
  const factory = params.clientFactory || defaultClientFactory;
  const instruction = buildPhotoInstruction(params.prompt, params.presetAction, hasSourcePhoto);
  let lastClassified = null;
  let attempts = 0;
  const throttledProjectsInRun = /* @__PURE__ */ new Set();
  for (let kIdx = 0; kIdx < keys.length; kIdx++) {
    const keyItem = keys[kIdx];
    if (keyItem.projectId && throttledProjectsInRun.has(keyItem.projectId)) {
      continue;
    }
    for (const modelId of models) {
      const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === modelId);
      if (!spec || spec.capability !== "image") continue;
      const client = factory(keyItem.rawKey, spec?.apiVersion);
      attempts++;
      try {
        const parts = [];
        if (hasSourcePhoto) {
          parts.push({
            inlineData: {
              data: params.imageBase64,
              mimeType: params.mimeType
            }
          });
        }
        parts.push({ text: instruction });
        const response = await client.generateContent({
          model: modelId,
          contents: { parts }
        });
        const resParts = response?.candidates?.[0]?.content?.parts ?? [];
        let outputBase64 = "";
        let outputMime = "image/png";
        let modelNote = "";
        for (const part of resParts) {
          if (part?.inlineData?.data && !outputBase64) {
            outputBase64 = part.inlineData.data;
            outputMime = part.inlineData.mimeType || "image/png";
          } else if (typeof part?.text === "string" && part.text.trim()) {
            modelNote = modelNote ? `${modelNote} ${part.text.trim()}` : part.text.trim();
          }
        }
        if (outputBase64) {
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, { status: "ready" });
          }
          if (outputBase64.length > VERCEL_SAFE_BASE64_THRESHOLD) {
            const cldCreds = getCloudinaryCredentials();
            if (cldCreds.configured) {
              try {
                cloudinary2.config({
                  cloud_name: cldCreds.cloudName,
                  api_key: cldCreds.apiKey,
                  api_secret: cldCreds.apiSecret,
                  secure: true
                });
                const uploaded = await cloudinary2.uploader.upload(
                  `data:${outputMime};base64,${outputBase64}`,
                  {
                    folder: "king_ai_generated",
                    resource_type: "image",
                    type: "upload"
                  }
                );
                if (uploaded?.secure_url) {
                  return {
                    status: 200,
                    payload: {
                      ok: true,
                      provider: "google-gemini",
                      model: modelId,
                      keyIdUsed: keyItem.id,
                      keyIndexUsed: kIdx + 1,
                      attempts,
                      imageUrl: uploaded.secure_url,
                      mimeType: outputMime,
                      offloadedToCloudinary: true,
                      note: modelNote || void 0
                    }
                  };
                }
              } catch (cldErr) {
                console.warn("[aiBackend] Large AI image Cloudinary offload notice:", cldErr?.message || cldErr);
              }
            }
            if (process.env.VERCEL && outputBase64.length > VERCEL_HARD_BASE64_LIMIT) {
              return {
                status: 413,
                payload: {
                  ok: false,
                  code: "AI_IMAGE_PAYLOAD_TOO_LARGE",
                  error: "Generated image exceeded Vercel 4.5 MB payload limit. Configure CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET for automatic URL offload or select Nano Banana 2 Lite."
                }
              };
            }
          }
          return {
            status: 200,
            payload: {
              ok: true,
              provider: "google-gemini",
              model: modelId,
              keyIdUsed: keyItem.id,
              keyIndexUsed: kIdx + 1,
              attempts,
              imageBase64: outputBase64,
              mimeType: outputMime,
              note: modelNote || void 0
            }
          };
        }
        lastClassified = {
          kind: "MODEL_UNAVAILABLE",
          httpStatus: 502,
          code: "GEMINI_NO_IMAGE_OUTPUT",
          message: modelNote || `Model ${modelId} did not return an image.`
        };
      } catch (err) {
        const classified = classifyGeminiError(err, modelId);
        lastClassified = classified;
        if (classified.kind === "BAD_REQUEST") {
          return {
            status: 400,
            payload: {
              ok: false,
              code: classified.code,
              error: classified.message,
              attempts
            }
          };
        }
        if (classified.kind === "INVALID_KEY") {
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, {
              status: "invalid",
              error: classified.message
            });
          }
          break;
        }
        if (classified.kind === "QUOTA_EXCEEDED") {
          const { keyCooldownMs, projectCooldownMs, quotaScope } = resolveCooldownForQuotaError(classified);
          if (keyItem.projectId) {
            throttledProjectsInRun.add(keyItem.projectId);
          }
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, {
              status: "quota_exhausted",
              error: classified.message,
              cooldownMs: keyCooldownMs,
              quotaScope,
              projectId: keyItem.projectId,
              projectCooldownMs
            });
          }
          break;
        }
        continue;
      }
    }
  }
  return {
    status: lastClassified?.httpStatus || 502,
    payload: {
      ok: false,
      code: lastClassified?.code || "GEMINI_EDIT_FAILED",
      error: lastClassified?.message || "All active Gemini keys or image models failed or exceeded quota.",
      attempts
    }
  };
}
async function executeTextAiWithFallback(params) {
  const keys = getEligibleKeysForExecution({
    overrideKeys: params.overrideKeys,
    overrideConfig: params.overrideConfig,
    overrideProjectHealth: params.overrideProjectHealth
  });
  if (keys.length === 0) {
    return {
      status: 503,
      payload: {
        ok: false,
        code: "AI_PROVIDER_NOT_CONFIGURED",
        error: "No active healthy Gemini API keys are available. Add or enable a valid API key in Admin Panel \u2192 AI Model Manager."
      }
    };
  }
  const models = getEligibleModelsForDomain("text", {
    requestedModel: params.requestedModel,
    overrideConfig: params.overrideConfig
  });
  if (models.length === 0) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: "NO_ENABLED_TEXT_MODELS",
        error: "All Gemini assistant text models are currently disabled by Admin."
      }
    };
  }
  const factory = params.clientFactory || defaultClientFactory;
  let lastClassified = null;
  let attempts = 0;
  const throttledProjectsInRun = /* @__PURE__ */ new Set();
  for (let kIdx = 0; kIdx < keys.length; kIdx++) {
    const keyItem = keys[kIdx];
    if (keyItem.projectId && throttledProjectsInRun.has(keyItem.projectId)) {
      continue;
    }
    for (const modelId of models) {
      const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === modelId);
      if (!spec || spec.capability !== "text") continue;
      const client = factory(keyItem.rawKey, spec?.apiVersion);
      attempts++;
      try {
        const response = await client.generateContent({
          model: modelId,
          contents: params.prompt.trim(),
          ...params.systemInstruction ? { config: { systemInstruction: params.systemInstruction.trim() } } : {}
        });
        const textOut = typeof response?.text === "string" ? response.text.trim() : "";
        if (textOut) {
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, { status: "ready" });
          }
          return {
            status: 200,
            payload: {
              ok: true,
              provider: "google-gemini",
              model: modelId,
              keyIdUsed: keyItem.id,
              keyIndexUsed: kIdx + 1,
              attempts,
              text: textOut
            }
          };
        }
      } catch (err) {
        const classified = classifyGeminiError(err, modelId);
        lastClassified = classified;
        if (classified.kind === "BAD_REQUEST") {
          return {
            status: 400,
            payload: {
              ok: false,
              code: classified.code,
              error: classified.message,
              attempts
            }
          };
        }
        if (classified.kind === "INVALID_KEY") {
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, { status: "invalid", error: classified.message });
          }
          break;
        }
        if (classified.kind === "QUOTA_EXCEEDED") {
          const { keyCooldownMs, projectCooldownMs, quotaScope } = resolveCooldownForQuotaError(classified);
          if (keyItem.projectId) {
            throttledProjectsInRun.add(keyItem.projectId);
          }
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, {
              status: "quota_exhausted",
              error: classified.message,
              cooldownMs: keyCooldownMs,
              quotaScope,
              projectId: keyItem.projectId,
              projectCooldownMs
            });
          }
          break;
        }
        continue;
      }
    }
  }
  return {
    status: lastClassified?.httpStatus || 502,
    payload: {
      ok: false,
      code: lastClassified?.code || "GEMINI_TEXT_FAILED",
      error: lastClassified?.message || "Text generation failed across eligible Gemini keys.",
      attempts
    }
  };
}
async function executeVideoAiWithFallback(params) {
  const keys = getEligibleKeysForExecution({
    overrideKeys: params.overrideKeys,
    overrideConfig: params.overrideConfig,
    overrideProjectHealth: params.overrideProjectHealth
  });
  if (keys.length === 0) {
    return {
      status: 503,
      payload: {
        ok: false,
        code: "AI_PROVIDER_NOT_CONFIGURED",
        error: "No active healthy Gemini API keys are available. Add or enable a valid API key in Admin Panel \u2192 AI Model Manager."
      }
    };
  }
  if (params.task === "image_to_video" && (!params.imageBase64 || !params.mimeType)) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: "MISSING_SOURCE_IMAGE",
        error: "Image-to-video generation requires a valid source photo."
      }
    };
  }
  if (params.task === "video_editing" && !params.videoUri && (!params.videoBase64 || !params.videoMimeType)) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: "MISSING_SOURCE_VIDEO",
        error: "Video editing requires a source video URI or inline video clip. For interactive editing right now, use Post Editor timeline tools."
      }
    };
  }
  const models = getEligibleModelsForDomain("video", {
    requestedModel: params.requestedModel,
    videoTask: params.task,
    overrideConfig: params.overrideConfig
  });
  if (models.length === 0) {
    return {
      status: 501,
      payload: {
        ok: false,
        code: "NO_COMPATIBLE_VIDEO_MODEL",
        error: `No compatible verified Video AI model (Gemini Omni) is enabled for "${params.task}". Photo models cannot be used as a video fallback.`
      }
    };
  }
  const factory = params.clientFactory || defaultClientFactory;
  let lastClassified = null;
  let attempts = 0;
  const throttledProjectsInRun = /* @__PURE__ */ new Set();
  for (let kIdx = 0; kIdx < keys.length; kIdx++) {
    const keyItem = keys[kIdx];
    if (keyItem.projectId && throttledProjectsInRun.has(keyItem.projectId)) {
      continue;
    }
    for (const modelId of models) {
      const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === modelId);
      if (!spec || spec.capability !== "omni") continue;
      const client = factory(keyItem.rawKey, "v1beta");
      if (!client.createInteraction) {
        return {
          status: 500,
          payload: {
            ok: false,
            code: "INTERACTIONS_API_UNAVAILABLE",
            error: "Interactions API adapter is unavailable on this server build."
          }
        };
      }
      attempts++;
      try {
        let interactionInput = params.prompt.trim();
        if (params.task === "image_to_video") {
          interactionInput = [
            {
              type: "image",
              mime_type: params.mimeType,
              data: params.imageBase64
            },
            {
              type: "text",
              text: params.prompt.trim()
            }
          ];
        } else if (params.task === "video_editing") {
          const videoPart2 = params.videoUri ? { type: "video", uri: params.videoUri } : { type: "video", mime_type: params.videoMimeType, data: params.videoBase64 };
          interactionInput = [
            videoPart2,
            {
              type: "text",
              text: params.prompt.trim()
            }
          ];
        }
        const interaction = await client.createInteraction(
          {
            model: modelId,
            input: interactionInput,
            background: false,
            store: false,
            stream: false,
            response_format: {
              type: "video",
              aspect_ratio: params.aspectRatio === "9:16" ? "9:16" : "16:9",
              ...params.duration ? { duration: params.duration } : { duration: "5s" },
              ...params.resolution ? { resolution: params.resolution } : { resolution: "720p" }
            }
          },
          { timeout: process.env.VERCEL ? 55e3 : 24e4 }
        );
        const videoPart = interaction?.output_video || interaction?.outputs?.find((o) => o?.type === "video");
        const outBase64 = typeof videoPart?.data === "string" ? videoPart.data : "";
        const outUri = typeof videoPart?.uri === "string" ? videoPart.uri : "";
        const outMime = videoPart?.mime_type || "video/mp4";
        if (outBase64 || outUri) {
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, { status: "ready" });
          }
          if (outBase64 && outBase64.length > VERCEL_SAFE_BASE64_THRESHOLD) {
            const cldCreds = getCloudinaryCredentials();
            if (cldCreds.configured) {
              try {
                cloudinary2.config({
                  cloud_name: cldCreds.cloudName,
                  api_key: cldCreds.apiKey,
                  api_secret: cldCreds.apiSecret,
                  secure: true
                });
                const uploaded = await cloudinary2.uploader.upload(
                  `data:${outMime};base64,${outBase64}`,
                  {
                    folder: "king_ai_video_generated",
                    resource_type: "video",
                    type: "upload"
                  }
                );
                if (uploaded?.secure_url) {
                  return {
                    status: 200,
                    payload: {
                      ok: true,
                      provider: "google-gemini",
                      model: modelId,
                      task: params.task,
                      keyIdUsed: keyItem.id,
                      keyIndexUsed: kIdx + 1,
                      attempts,
                      videoUrl: uploaded.secure_url,
                      mimeType: outMime,
                      offloadedToCloudinary: true
                    }
                  };
                }
              } catch (cldErr) {
                console.warn("[aiBackend] Video Cloudinary offload notice:", scrubSecretText(cldErr?.message || cldErr));
              }
            }
            if (process.env.VERCEL && outBase64.length > VERCEL_HARD_BASE64_LIMIT) {
              return {
                status: 413,
                payload: {
                  ok: false,
                  code: "AI_VIDEO_PAYLOAD_TOO_LARGE",
                  error: "Generated video exceeded serverless payload limit. Configure CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET for automatic video URL offload."
                }
              };
            }
          }
          return {
            status: 200,
            payload: {
              ok: true,
              provider: "google-gemini",
              model: modelId,
              task: params.task,
              keyIdUsed: keyItem.id,
              keyIndexUsed: kIdx + 1,
              attempts,
              ...outUri ? { videoUrl: outUri } : {},
              ...outBase64 ? { videoBase64: outBase64 } : {},
              mimeType: outMime
            }
          };
        }
        lastClassified = {
          kind: "MODEL_UNAVAILABLE",
          httpStatus: 502,
          code: "GEMINI_NO_VIDEO_OUTPUT",
          message: `Video AI model ${modelId} did not return a video payload.`
        };
      } catch (err) {
        const classified = classifyGeminiError(err, modelId);
        lastClassified = classified;
        if (classified.kind === "BAD_REQUEST") {
          return {
            status: 400,
            payload: {
              ok: false,
              code: classified.code,
              error: classified.message,
              attempts
            }
          };
        }
        if (classified.kind === "INVALID_KEY") {
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, { status: "invalid", error: classified.message });
          }
          break;
        }
        if (classified.kind === "QUOTA_EXCEEDED") {
          const { keyCooldownMs, projectCooldownMs, quotaScope } = resolveCooldownForQuotaError(classified);
          if (keyItem.projectId) {
            throttledProjectsInRun.add(keyItem.projectId);
          }
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, {
              status: "quota_exhausted",
              error: classified.message,
              cooldownMs: keyCooldownMs,
              quotaScope,
              projectId: keyItem.projectId,
              projectCooldownMs
            });
          }
          break;
        }
        continue;
      }
    }
  }
  return {
    status: lastClassified?.httpStatus || 502,
    payload: {
      ok: false,
      code: lastClassified?.code || "GEMINI_VIDEO_FAILED",
      error: lastClassified?.message || "Video AI execution failed across configured Gemini Omni models and eligible keys.",
      attempts
    }
  };
}
async function executeAutoRoutedAiTask(params) {
  const cfg = params.overrideConfig || getModelConfig();
  const hasSourceImage = Boolean(params.imageBase64 && params.mimeType);
  const hasSourceVideo = Boolean(params.videoUri || params.videoBase64 && params.videoMimeType);
  const classification = (() => {
    if (!cfg.enableAutoRouting) {
      const isVoiceRequest = Boolean(params.isVoiceRequest) || params.task === "voice_request";
      if (params.task && params.task !== "auto" && params.task !== "voice_request") {
        const domain = params.task === "text_chat" ? "text" : params.task === "photo_generation" || params.task === "photo_editing" ? "image" : "video";
        return {
          task: params.task,
          domain,
          isVoiceRequest,
          reason: `Auto-routing disabled (enableAutoRouting=false): honoring explicit task "${params.task}" without prompt inference.`
        };
      }
      const mediaType = (params.mediaType || "").toLowerCase();
      if (hasSourceVideo || mediaType === "video") {
        const task = hasSourceVideo ? "video_editing" : "video_generation";
        return {
          task,
          domain: "video",
          isVoiceRequest,
          reason: `Auto-routing disabled: deterministic video mediaType mapping -> ${task}.`
        };
      }
      if (hasSourceImage || mediaType === "photo") {
        const task = hasSourceImage ? "photo_editing" : "photo_generation";
        return {
          task,
          domain: "image",
          isVoiceRequest,
          reason: `Auto-routing disabled: deterministic photo mediaType mapping -> ${task}.`
        };
      }
      return {
        task: "text_chat",
        domain: "text",
        isVoiceRequest,
        reason: "Auto-routing disabled (enableAutoRouting=false): bypassing prompt classification and routing deterministically to primary text assistant."
      };
    }
    return classifyAiTaskIntent({
      prompt: params.prompt,
      explicitTask: params.task,
      mediaType: params.mediaType,
      hasSourceImage,
      hasSourceVideo,
      isVoiceRequest: params.isVoiceRequest,
      presetAction: params.presetAction
    });
  })();
  if (classification.domain === "image") {
    const imagePlan = selectAutoImageModelOrder({
      prompt: params.prompt,
      presetAction: params.presetAction,
      hasSourceImage,
      requestedModel: params.requestedModel,
      qualityHint: params.qualityHint,
      overrideConfig: cfg
    });
    const res2 = await executeImageAiWithFallback({
      prompt: params.prompt,
      presetAction: params.presetAction,
      imageBase64: params.imageBase64,
      mimeType: params.mimeType,
      requestedModel: params.requestedModel,
      qualityHint: params.qualityHint,
      overrideKeys: params.overrideKeys,
      overrideConfig: cfg,
      overrideProjectHealth: params.overrideProjectHealth,
      clientFactory: params.clientFactory,
      skipStateMutation: params.skipStateMutation
    });
    return {
      status: res2.status,
      payload: {
        ...res2.payload,
        routing: {
          detectedTask: classification.task,
          domain: "image",
          selectedTier: imagePlan.selectedTier,
          selectedModel: res2.payload.model || imagePlan.orderedModels[0] || null,
          candidateModels: imagePlan.orderedModels,
          isVoiceRequest: classification.isVoiceRequest,
          reason: `${classification.reason} ${imagePlan.reason}`
        }
      }
    };
  }
  if (classification.domain === "video") {
    const videoTask = classification.task === "image_to_video" || classification.task === "video_editing" ? classification.task : "video_generation";
    const candidateModels2 = getEligibleModelsForDomain("video", {
      requestedModel: params.requestedModel,
      videoTask,
      overrideConfig: cfg
    });
    const res2 = await executeVideoAiWithFallback({
      task: videoTask,
      prompt: params.prompt,
      imageBase64: params.imageBase64,
      mimeType: params.mimeType,
      videoBase64: params.videoBase64,
      videoMimeType: params.videoMimeType,
      videoUri: params.videoUri,
      aspectRatio: params.aspectRatio,
      duration: params.duration,
      resolution: params.resolution,
      requestedModel: params.requestedModel,
      overrideKeys: params.overrideKeys,
      overrideConfig: cfg,
      overrideProjectHealth: params.overrideProjectHealth,
      clientFactory: params.clientFactory,
      skipStateMutation: params.skipStateMutation
    });
    return {
      status: res2.status,
      payload: {
        ...res2.payload,
        routing: {
          detectedTask: videoTask,
          domain: "video",
          selectedTier: "omni_video",
          selectedModel: res2.payload.model || candidateModels2[0] || null,
          candidateModels: candidateModels2,
          isVoiceRequest: classification.isVoiceRequest,
          reason: classification.reason
        }
      }
    };
  }
  const candidateModels = getEligibleModelsForDomain("text", {
    requestedModel: params.requestedModel,
    overrideConfig: cfg
  });
  const res = await executeTextAiWithFallback({
    prompt: params.prompt,
    systemInstruction: params.systemInstruction,
    requestedModel: params.requestedModel,
    overrideKeys: params.overrideKeys,
    overrideConfig: cfg,
    overrideProjectHealth: params.overrideProjectHealth,
    clientFactory: params.clientFactory,
    skipStateMutation: params.skipStateMutation
  });
  return {
    status: res.status,
    payload: {
      ...res.payload,
      routing: {
        detectedTask: "text_chat",
        domain: "text",
        selectedTier: "pro_assistant",
        selectedModel: res.payload.model || candidateModels[0] || null,
        candidateModels,
        isVoiceRequest: classification.isVoiceRequest,
        reason: classification.reason
      }
    }
  };
}
async function handleAutoRoutedAiRequest(params) {
  const caller = await verifyFirebaseBearerToken(params.authHeader);
  if (!caller) {
    return {
      status: 401,
      payload: {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Please sign in to use KING AI."
      }
    };
  }
  const body = params.body || {};
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: "INVALID_PROMPT",
        error: "Prompt is required for AI routing."
      }
    };
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: "PROMPT_TOO_LONG",
        error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or less.`
      }
    };
  }
  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
  const videoBase64 = typeof body.videoBase64 === "string" ? body.videoBase64.trim() : "";
  const videoMimeType = typeof body.videoMimeType === "string" ? body.videoMimeType.trim().toLowerCase() : "";
  const videoUri = typeof body.videoUri === "string" ? body.videoUri.trim() : "";
  const effectiveMaxChars = process.env.VERCEL ? VERCEL_HARD_BASE64_LIMIT : MAX_IMAGE_BASE64_CHARS;
  if (imageBase64) {
    if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
      return {
        status: 400,
        payload: {
          ok: false,
          code: "UNSUPPORTED_IMAGE_TYPE",
          error: "Only JPEG, PNG, and WebP photos are supported."
        }
      };
    }
    if (imageBase64.length > effectiveMaxChars) {
      return {
        status: 413,
        payload: {
          ok: false,
          code: "INVALID_IMAGE_PAYLOAD",
          error: "Photo payload exceeds request limit."
        }
      };
    }
  }
  if (videoBase64) {
    if (!ALLOWED_VIDEO_MIMES.has(videoMimeType)) {
      return {
        status: 400,
        payload: {
          ok: false,
          code: "UNSUPPORTED_VIDEO_TYPE",
          error: "Only MP4, WebM, and MOV clips are supported for inline Video AI."
        }
      };
    }
    if (videoBase64.length > effectiveMaxChars) {
      return {
        status: 413,
        payload: {
          ok: false,
          code: "INVALID_VIDEO_PAYLOAD",
          error: "Video payload exceeds request limit. Upload or trim clip first."
        }
      };
    }
  }
  await syncVaultFromRemote();
  try {
    return await executeAutoRoutedAiTask({
      prompt,
      task: typeof body.task === "string" ? body.task.trim() : "auto",
      mediaType: typeof body.mediaType === "string" ? body.mediaType.trim() : void 0,
      isVoiceRequest: Boolean(body.isVoiceRequest),
      presetAction: typeof body.presetAction === "string" ? body.presetAction.trim() : void 0,
      imageBase64: imageBase64 || void 0,
      mimeType: mimeType || void 0,
      videoBase64: videoBase64 || void 0,
      videoMimeType: videoMimeType || void 0,
      videoUri: videoUri || void 0,
      systemInstruction: typeof body.systemInstruction === "string" ? body.systemInstruction.trim() : void 0,
      requestedModel: typeof body.model === "string" && body.model.trim() ? body.model.trim() : void 0,
      qualityHint: body.qualityHint === "lite" || body.qualityHint === "standard" || body.qualityHint === "pro" ? body.qualityHint : void 0,
      aspectRatio: body.aspectRatio === "9:16" ? "9:16" : "16:9",
      duration: typeof body.duration === "string" ? body.duration.trim() : void 0,
      resolution: body.resolution === "360p" || body.resolution === "720p" || body.resolution === "1080p" || body.resolution === "4k" ? body.resolution : void 0
    });
  } finally {
    await flushRemoteVaultWrites();
  }
}
async function handlePostAiPhotoEdit(params) {
  const caller = await verifyFirebaseBearerToken(params.authHeader);
  if (!caller) {
    return {
      status: 401,
      payload: {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Please sign in to use KING AI studio."
      }
    };
  }
  const body = params.body || {};
  const mediaType = String(body.mediaType || "photo").toLowerCase();
  if (mediaType === "video") {
    return {
      status: 400,
      payload: {
        ok: false,
        code: "VIDEO_AI_UNSUPPORTED",
        error: "Post Studio photo editor accepts still images only. For Video AI tasks use /api/ai/route (Gemini Omni) or Post Editor timeline tools."
      }
    };
  }
  const rawPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!rawPrompt) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: "INVALID_PROMPT",
        error: "Describe what you want to change or generate first."
      }
    };
  }
  if (rawPrompt.length > MAX_PROMPT_LENGTH) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: "PROMPT_TOO_LONG",
        error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or less.`
      }
    };
  }
  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
  const effectiveMaxImageChars = process.env.VERCEL ? VERCEL_HARD_BASE64_LIMIT : MAX_IMAGE_BASE64_CHARS;
  if (imageBase64) {
    if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
      return {
        status: 400,
        payload: {
          ok: false,
          code: "UNSUPPORTED_IMAGE_TYPE",
          error: "Only JPEG, PNG, and WebP photos are supported by AI editing."
        }
      };
    }
    if (imageBase64.length > effectiveMaxImageChars) {
      return {
        status: 413,
        payload: {
          ok: false,
          code: "INVALID_IMAGE_PAYLOAD",
          error: "Photo payload is too large for serverless processing. Please try a smaller photo."
        }
      };
    }
  }
  const requestedModel = typeof body.model === "string" && body.model.trim() ? body.model.trim() : void 0;
  const qualityHint = body.qualityHint === "lite" || body.qualityHint === "standard" || body.qualityHint === "pro" ? body.qualityHint : void 0;
  await syncVaultFromRemote();
  try {
    return await executeImageAiWithFallback({
      prompt: rawPrompt,
      presetAction: typeof body.presetAction === "string" ? body.presetAction : void 0,
      imageBase64: imageBase64 || void 0,
      mimeType: mimeType || void 0,
      requestedModel,
      qualityHint
    });
  } finally {
    await flushRemoteVaultWrites();
  }
}
async function handlePostAiTextGenerate(params) {
  const caller = await verifyFirebaseBearerToken(params.authHeader);
  if (!caller) {
    return {
      status: 401,
      payload: {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Please sign in to use KING AI text generation."
      }
    };
  }
  const body = params.body || {};
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return {
      status: 400,
      payload: { ok: false, code: "INVALID_PROMPT", error: "Prompt is required." }
    };
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: "PROMPT_TOO_LONG",
        error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or less.`
      }
    };
  }
  const requestedModel = typeof body.model === "string" ? body.model.trim() : void 0;
  const systemInstruction = typeof body.systemInstruction === "string" ? body.systemInstruction.trim() : void 0;
  await syncVaultFromRemote();
  try {
    return await executeTextAiWithFallback({
      prompt,
      systemInstruction,
      requestedModel
    });
  } finally {
    await flushRemoteVaultWrites();
  }
}
async function handleAdminUpdateModels(patch) {
  await syncVaultFromRemote();
  const modelConfig = updateModelConfig(patch);
  await flushRemoteVaultWrites();
  return { ok: true, modelConfig, state: getAdminAiState() };
}
async function handleAdminAddKey(params) {
  await syncVaultFromRemote();
  const key = addVaultApiKey(params);
  await flushRemoteVaultWrites();
  return { ok: true, key, state: getAdminAiState() };
}
async function handleAdminUpdateKey(keyId, patch) {
  await syncVaultFromRemote();
  const key = updateVaultApiKey(keyId, patch);
  await flushRemoteVaultWrites();
  return key ? { ok: true, key, state: getAdminAiState() } : null;
}
async function handleAdminDeleteKey(keyId) {
  await syncVaultFromRemote();
  const deleted = deleteVaultApiKey(keyId);
  await flushRemoteVaultWrites();
  return deleted ? { ok: true, state: getAdminAiState() } : null;
}
async function testSpecificKeyLive(keyId) {
  await syncVaultFromRemote();
  const keyItem = listResolvedKeys().find((k) => k.id === keyId);
  if (!keyItem) {
    return {
      status: 404,
      payload: { ok: false, error: "API key slot not found." }
    };
  }
  const start = Date.now();
  const factory = defaultClientFactory;
  const client = factory(keyItem.rawKey);
  const probeModel = "gemini-3.1-flash-lite";
  try {
    const res = await client.generateContent({
      model: probeModel,
      contents: "Reply with OK."
    });
    const text = typeof res?.text === "string" ? res.text.trim() : "";
    const latencyMs = Date.now() - start;
    recordKeyHealthResult(keyItem.id, { status: "ready", projectId: keyItem.projectId });
    await flushRemoteVaultWrites();
    return {
      status: 200,
      payload: {
        ok: true,
        keyId: keyItem.id,
        projectId: keyItem.projectId,
        model: probeModel,
        latencyMs,
        replyPreview: text.slice(0, 60),
        message: `Key "${keyItem.label}" passed live Gemini API check (${latencyMs}ms).`
      }
    };
  } catch (err) {
    const classified = classifyGeminiError(err, probeModel);
    const latencyMs = Date.now() - start;
    const statusMap = {
      INVALID_KEY: "invalid",
      QUOTA_EXCEEDED: "quota_exhausted",
      MODEL_UNAVAILABLE: "error",
      BAD_REQUEST: "ready",
      UPSTREAM_TRANSIENT: "error"
    };
    const quotaCooldown = classified.kind === "QUOTA_EXCEEDED" ? resolveCooldownForQuotaError(classified) : null;
    recordKeyHealthResult(keyItem.id, {
      status: statusMap[classified.kind],
      error: classified.message,
      cooldownMs: quotaCooldown?.keyCooldownMs,
      quotaScope: quotaCooldown?.quotaScope,
      projectId: keyItem.projectId,
      projectCooldownMs: quotaCooldown?.projectCooldownMs
    });
    await flushRemoteVaultWrites();
    return {
      status: classified.httpStatus,
      payload: {
        ok: false,
        keyId: keyItem.id,
        model: probeModel,
        latencyMs,
        code: classified.code,
        error: classified.message
      }
    };
  }
}
async function testSpecificModelLive(params) {
  await syncVaultFromRemote();
  const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === params.modelId);
  if (!spec) {
    return {
      status: 400,
      payload: { ok: false, error: `Unknown or unverified model ID: ${params.modelId}` }
    };
  }
  const allKeys = listResolvedKeys();
  const candidates = params.keyId ? allKeys.filter((k) => k.id === params.keyId) : allKeys.filter((k) => k.enabled && k.status !== "invalid");
  if (candidates.length === 0) {
    return {
      status: 503,
      payload: {
        ok: false,
        code: "NO_ELIGIBLE_KEYS",
        error: "No eligible enabled API key found to test this model."
      }
    };
  }
  const keyItem = candidates[0];
  const client = defaultClientFactory(keyItem.rawKey, spec.apiVersion);
  const start = Date.now();
  try {
    if (spec.capability === "omni") {
      const betaAi = new GoogleGenAI({
        apiKey: keyItem.rawKey,
        apiVersion: "v1beta",
        httpOptions: { headers: { "User-Agent": "aistudio-build" } }
      });
      const res = await betaAi.interactions.create({
        model: spec.id,
        input: 'Say "Omni online" in 3 words.',
        response_modalities: ["text"]
      });
      const outputText = typeof res?.output_text === "string" ? res.output_text.trim() : JSON.stringify(res?.outputs?.[0] || "").slice(0, 120);
      return {
        status: 200,
        payload: {
          ok: true,
          modelId: spec.id,
          capability: "omni",
          keyId: keyItem.id,
          latencyMs: Date.now() - start,
          previewText: outputText || "Interaction response received"
        }
      };
    }
    if (spec.capability === "text") {
      const resp = await client.generateContent({
        model: spec.id,
        contents: 'Say "Model online" in 3 words.'
      });
      const text = typeof resp?.text === "string" ? resp.text.trim() : "";
      const latencyMs = Date.now() - start;
      return {
        status: 200,
        payload: {
          ok: true,
          modelId: spec.id,
          capability: "text",
          keyId: keyItem.id,
          latencyMs,
          previewText: text.slice(0, 120) || "(empty response)"
        }
      };
    } else {
      const resp = await client.generateContent({
        model: spec.id,
        contents: {
          parts: [{ text: "Minimalist glowing royal blue crown emblem on dark obsidian background" }]
        }
      });
      const parts = resp?.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find((p) => p?.inlineData?.data);
      const latencyMs = Date.now() - start;
      if (imgPart?.inlineData?.data) {
        return {
          status: 200,
          payload: {
            ok: true,
            modelId: spec.id,
            capability: "image",
            keyId: keyItem.id,
            latencyMs,
            imageBytesApprox: Math.round(imgPart.inlineData.data.length * 3 / 4)
          }
        };
      }
      return {
        status: 502,
        payload: {
          ok: false,
          modelId: spec.id,
          capability: "image",
          latencyMs,
          error: "Model responded without an inline image payload."
        }
      };
    }
  } catch (err) {
    const classified = classifyGeminiError(err, spec.id);
    return {
      status: classified.httpStatus,
      payload: {
        ok: false,
        modelId: spec.id,
        capability: spec.capability,
        latencyMs: Date.now() - start,
        code: classified.code,
        error: classified.message
      }
    };
  }
}
async function fetchLiveModelsFromGoogleApi(overrideApiKey) {
  await syncVaultFromRemote();
  let rawKey = (overrideApiKey || "").trim();
  if (!rawKey) {
    const keys = listResolvedKeys().filter((k) => k.enabled && k.status !== "invalid");
    if (keys.length === 0) {
      return {
        ok: false,
        httpStatus: 503,
        models: [],
        error: "No active Gemini API key available on server."
      };
    }
    rawKey = keys[0].rawKey;
  }
  try {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      method: "GET",
      headers: {
        "x-goog-api-key": rawKey,
        "User-Agent": "aistudio-build"
      }
    });
    const data = await resp.json();
    if (!resp.ok) {
      return {
        ok: false,
        httpStatus: resp.status,
        models: [],
        error: scrubSecretText(data?.error?.message || `Models API failed with HTTP ${resp.status}`)
      };
    }
    const models = (Array.isArray(data?.models) ? data.models : []).map((m) => {
      const fullName = String(m?.name || "");
      return {
        name: fullName,
        id: fullName.replace(/^models\//, ""),
        displayName: String(m?.displayName || fullName),
        description: String(m?.description || ""),
        supportedGenerationMethods: Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods : [],
        inputTokenLimit: typeof m?.inputTokenLimit === "number" ? m.inputTokenLimit : void 0,
        outputTokenLimit: typeof m?.outputTokenLimit === "number" ? m.outputTokenLimit : void 0
      };
    });
    return {
      ok: true,
      httpStatus: 200,
      models
    };
  } catch (err) {
    return {
      ok: false,
      httpStatus: 502,
      models: [],
      error: scrubSecretText(err?.message || "Failed to query Gemini models API.")
    };
  }
}
export {
  FIRESTORE_DATABASE_ID,
  SUPER_ADMIN_EMAIL,
  buildSignedStatusUploadPayload,
  classifyAiTaskIntent,
  fetchLiveModelsFromGoogleApi,
  getAdminAiStateAsync,
  getEligibleModelsForDomain,
  getFirebaseAdminApp,
  getPublicAiCapabilityStatus,
  getPublicAiCapabilityStatusAsync,
  handleAdminAddKey,
  handleAdminDeleteKey,
  handleAdminUpdateKey,
  handleAdminUpdateModels,
  handleAutoRoutedAiRequest,
  handleDeleteSingleStatusServer,
  handleFetchAuthorizedStatusFeed,
  handlePostAiPhotoEdit,
  handlePostAiTextGenerate,
  handleRunExpiredStatusCleanup,
  isVerifiedSuperAdmin,
  scrubSecretText,
  selectAutoImageModelOrder,
  testSpecificKeyLive,
  testSpecificModelLive,
  verifyFirebaseBearerToken
};
