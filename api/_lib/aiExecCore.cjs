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

// api/_lib/aiExecEntry.ts
var aiExecEntry_exports = {};
__export(aiExecEntry_exports, {
  BadJsonBodyError: () => BadJsonBodyError,
  SUPER_ADMIN_EMAIL: () => SUPER_ADMIN_EMAIL,
  classifyAiTaskIntent: () => classifyAiTaskIntent,
  fetchLiveModelsFromGoogleApi: () => fetchLiveModelsFromGoogleApi,
  getAdminAiStateAsync: () => getAdminAiStateAsync,
  getEligibleModelsForDomain: () => getEligibleModelsForDomain,
  getPublicAiCapabilityStatus: () => getPublicAiCapabilityStatus,
  getPublicAiCapabilityStatusAsync: () => getPublicAiCapabilityStatusAsync,
  handleAdminAddFalKey: () => handleAdminAddFalKey,
  handleAdminAddKey: () => handleAdminAddKey,
  handleAdminDeleteFalKey: () => handleAdminDeleteFalKey,
  handleAdminDeleteKey: () => handleAdminDeleteKey,
  handleAdminUpdateFalConfig: () => handleAdminUpdateFalConfig,
  handleAdminUpdateFalKey: () => handleAdminUpdateFalKey,
  handleAdminUpdateKey: () => handleAdminUpdateKey,
  handleAdminUpdateModels: () => handleAdminUpdateModels,
  handleAutoRoutedAiRequest: () => handleAutoRoutedAiRequest,
  handlePostAiPhotoEdit: () => handlePostAiPhotoEdit,
  handlePostAiTextGenerate: () => handlePostAiTextGenerate,
  isVerifiedSuperAdmin: () => isVerifiedSuperAdmin,
  normalizeAiEndpointResult: () => normalizeAiEndpointResult,
  parseRequestJsonBody: () => parseRequestJsonBody,
  scrubSecretText: () => scrubSecretText,
  selectAutoImageModelOrder: () => selectAutoImageModelOrder,
  sendNormalizedAiJson: () => sendNormalizedAiJson,
  testSpecificFalKeyLive: () => testSpecificFalKeyLive2,
  testSpecificKeyLive: () => testSpecificKeyLive,
  testSpecificModelLive: () => testSpecificModelLive,
  verifyFirebaseBearerToken: () => verifyFirebaseBearerToken
});
module.exports = __toCommonJS(aiExecEntry_exports);

// server/aiBackend.ts
var import_genai = require("@google/genai");
var import_cloudinary2 = __toESM(require("cloudinary"), 1);

// server/aiVault.ts
var import_node_crypto = __toESM(require("node:crypto"), 1);
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var import_node_path = __toESM(require("node:path"), 1);
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
var VERIFIED_FAL_MODELS = [
  {
    id: "fal-ai/flux/schnell",
    displayName: "FLUX.1 Schnell (Fast Image)",
    capability: "image",
    description: "Ultra-fast 4-step text-to-image generation on fal.ai.",
    defaultEnabled: true,
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"]
  },
  {
    id: "fal-ai/flux/dev",
    displayName: "FLUX.1 Dev (High Quality)",
    capability: "image",
    description: "High-detail image generation fallback on fal.ai.",
    defaultEnabled: true,
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"]
  },
  {
    id: "fal-ai/flux/dev/image-to-image",
    displayName: "FLUX.1 Dev (Image-to-Image Edit)",
    capability: "image_edit",
    description: "Restyle & image-to-image editing with uploaded source photos.",
    defaultEnabled: true,
    maxInputImageMb: 10,
    requiresSourceImage: true,
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"]
  },
  {
    id: "fal-ai/flux-kontext/pro",
    displayName: "FLUX Kontext Pro (Instruction Edit)",
    capability: "image_edit",
    description: "Instruction-guided precision photo editing on fal.ai.",
    defaultEnabled: true,
    maxInputImageMb: 10,
    requiresSourceImage: true,
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"]
  },
  {
    id: "fal-ai/wan/v2.1/1.3b/text-to-video",
    displayName: "Wan 2.1 Fast Text-to-Video",
    capability: "video",
    description: "Fast text-to-video generation on fal.ai queue.",
    defaultEnabled: true,
    supportedAspectRatios: ["16:9", "9:16"],
    supportedDurations: ["5s"]
  },
  {
    id: "fal-ai/kling-video/v2.1/standard/text-to-video",
    displayName: "Kling 2.1 Text-to-Video",
    capability: "video",
    description: "Cinematic text-to-video fallback on fal.ai.",
    defaultEnabled: true,
    supportedAspectRatios: ["16:9", "9:16"],
    supportedDurations: ["5s", "10s"]
  },
  {
    id: "fal-ai/kling-video/v2.1/standard/image-to-video",
    displayName: "Kling 2.1 Image-to-Video",
    capability: "image_to_video",
    description: "Animate a source still photo into video via fal.ai.",
    defaultEnabled: true,
    maxInputImageMb: 10,
    requiresSourceImage: true,
    supportedAspectRatios: ["16:9", "9:16"],
    supportedDurations: ["5s", "10s"]
  }
];
var VAULT_BASE_DIR = import_node_path.default.resolve(
  process.env.AI_VAULT_DIR?.trim() || (process.env.VERCEL ? import_node_os.default.tmpdir() : process.cwd())
);
var VAULT_FILE_PATH = import_node_path.default.join(VAULT_BASE_DIR, ".king-ai-vault.enc.json");
var VAULT_KEY_PATH = import_node_path.default.join(VAULT_BASE_DIR, ".king-ai-vault.key");
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
var DEFAULT_FAL_CONFIG = {
  enableFalKeyFallback: true,
  enableFalImageFallback: true,
  enableFalVideoFallback: true,
  preferFalForVideo: false,
  maxConcurrentPerKey: 2,
  requestTimeoutSec: 45,
  maxQueueWaitSec: 45,
  primaryFalImageModel: "fal-ai/flux/schnell",
  primaryFalImageEditModel: "fal-ai/flux/dev/image-to-image",
  primaryFalVideoModel: "fal-ai/wan/v2.1/1.3b/text-to-video",
  primaryFalImageToVideoModel: "fal-ai/kling-video/v2.1/standard/image-to-video"
};
var UPSTASH_VAULT_REDIS_KEY = "king:ai_vault:v1";
var REMOTE_SYNC_TTL_MS = 2e3;
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
  let perKeyDecryptFailures = 0;
  try {
    const vault = readVaultData();
    for (const rec of [...vault.keys, ...vault.falKeys]) {
      try {
        decryptText(rec.encryptedKey);
      } catch {
        perKeyDecryptFailures += 1;
      }
    }
  } catch {
  }
  const effectiveDecryptError = lastDecryptionError || (perKeyDecryptFailures > 0 ? `${perKeyDecryptFailures} stored API key record(s) failed AES-256-GCM decryption. Check AI_VAULT_SECRET consistency.` : void 0);
  const lastSyncedAt = lastSuccessfulRemoteSyncAt ? new Date(lastSuccessfulRemoteSyncAt).toISOString() : void 0;
  if (upstash.configured) {
    const remoteSyncStatus = lastRemoteSyncError || effectiveDecryptError ? "error" : "ok";
    const warnings2 = [];
    if (!hasEnvSecret) {
      warnings2.push(
        "Set AI_VAULT_SECRET env var so Upstash AES-256-GCM encrypted keys remain decryptable across serverless invocations."
      );
    }
    if (lastRemoteSyncError) {
      warnings2.push(lastRemoteSyncError);
    }
    if (effectiveDecryptError) {
      warnings2.push(effectiveDecryptError);
    }
    return {
      storageScope: "upstash_redis_encrypted",
      vaultPath: `upstash-redis://${UPSTASH_VAULT_REDIS_KEY}`,
      encryptionKeyPersistent: hasEnvSecret,
      multiInstanceSafe: hasEnvSecret && remoteSyncStatus === "ok",
      remoteSyncStatus,
      remoteError: lastRemoteSyncError,
      decryptionError: effectiveDecryptError,
      lastSyncedAt,
      warning: warnings2.length > 0 ? warnings2.join(" ") : void 0
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
  if (effectiveDecryptError) {
    warnings.push(effectiveDecryptError);
  }
  return {
    storageScope: hasCustomVolume ? "persistent_volume" : "ephemeral_container_disk",
    vaultPath: VAULT_FILE_PATH,
    encryptionKeyPersistent: hasEnvSecret,
    multiInstanceSafe,
    remoteSyncStatus: "unconfigured",
    decryptionError: effectiveDecryptError,
    warning: warnings.length > 0 ? warnings.join(" ") : void 0
  };
}
var memoryKeyBuffer = null;
function getVaultEncryptionKey() {
  const envSecret = (process.env.AI_VAULT_SECRET || process.env.SESSION_SECRET || "").trim();
  if (envSecret) {
    return import_node_crypto.default.createHash("sha256").update(`king-ai-vault:${envSecret}`).digest();
  }
  try {
    if (import_node_fs.default.existsSync(VAULT_KEY_PATH)) {
      const hex = import_node_fs.default.readFileSync(VAULT_KEY_PATH, "utf8").trim();
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        return Buffer.from(hex, "hex");
      }
    }
    import_node_fs.default.mkdirSync(VAULT_BASE_DIR, { recursive: true });
    const generated = import_node_crypto.default.randomBytes(32);
    import_node_fs.default.writeFileSync(VAULT_KEY_PATH, generated.toString("hex"), { mode: 384 });
    return generated;
  } catch {
    if (!memoryKeyBuffer) {
      memoryKeyBuffer = import_node_crypto.default.randomBytes(32);
    }
    return memoryKeyBuffer;
  }
}
function encryptText(plainText) {
  const key = getVaultEncryptionKey();
  const iv = import_node_crypto.default.randomBytes(12);
  const cipher = import_node_crypto.default.createCipheriv("aes-256-gcm", key, iv);
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
  const decipher = import_node_crypto.default.createDecipheriv(
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
    },
    falKeys: [],
    falEnvOverrides: {},
    falModelHealth: {},
    falConfig: { ...DEFAULT_FAL_CONFIG }
  };
}
var inMemoryFallbackVault = null;
var lastRemoteSyncAt = 0;
var lastSuccessfulRemoteSyncAt;
var lastRemoteSyncError;
var lastDecryptionError;
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
  const rawFalCfg = parsed.falConfig || {};
  const validFalIds = new Set(VERIFIED_FAL_MODELS.map((m) => m.id));
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
    },
    falKeys: Array.isArray(parsed.falKeys) ? parsed.falKeys : [],
    falEnvOverrides: parsed.falEnvOverrides && typeof parsed.falEnvOverrides === "object" ? parsed.falEnvOverrides : {},
    falModelHealth: parsed.falModelHealth && typeof parsed.falModelHealth === "object" ? parsed.falModelHealth : {},
    falConfig: {
      enableFalKeyFallback: typeof rawFalCfg.enableFalKeyFallback === "boolean" ? rawFalCfg.enableFalKeyFallback : DEFAULT_FAL_CONFIG.enableFalKeyFallback,
      enableFalImageFallback: typeof rawFalCfg.enableFalImageFallback === "boolean" ? rawFalCfg.enableFalImageFallback : DEFAULT_FAL_CONFIG.enableFalImageFallback,
      enableFalVideoFallback: typeof rawFalCfg.enableFalVideoFallback === "boolean" ? rawFalCfg.enableFalVideoFallback : DEFAULT_FAL_CONFIG.enableFalVideoFallback,
      preferFalForVideo: typeof rawFalCfg.preferFalForVideo === "boolean" ? rawFalCfg.preferFalForVideo : DEFAULT_FAL_CONFIG.preferFalForVideo,
      maxConcurrentPerKey: typeof rawFalCfg.maxConcurrentPerKey === "number" && Number.isFinite(rawFalCfg.maxConcurrentPerKey) ? Math.max(1, Math.min(10, Math.round(rawFalCfg.maxConcurrentPerKey))) : DEFAULT_FAL_CONFIG.maxConcurrentPerKey,
      requestTimeoutSec: typeof rawFalCfg.requestTimeoutSec === "number" && Number.isFinite(rawFalCfg.requestTimeoutSec) ? Math.max(10, Math.min(180, Math.round(rawFalCfg.requestTimeoutSec))) : DEFAULT_FAL_CONFIG.requestTimeoutSec,
      maxQueueWaitSec: typeof rawFalCfg.maxQueueWaitSec === "number" && Number.isFinite(rawFalCfg.maxQueueWaitSec) ? Math.max(15, Math.min(240, Math.round(rawFalCfg.maxQueueWaitSec))) : DEFAULT_FAL_CONFIG.maxQueueWaitSec,
      primaryFalImageModel: rawFalCfg.primaryFalImageModel && validFalIds.has(rawFalCfg.primaryFalImageModel) ? rawFalCfg.primaryFalImageModel : DEFAULT_FAL_CONFIG.primaryFalImageModel,
      primaryFalImageEditModel: rawFalCfg.primaryFalImageEditModel && validFalIds.has(rawFalCfg.primaryFalImageEditModel) ? rawFalCfg.primaryFalImageEditModel : DEFAULT_FAL_CONFIG.primaryFalImageEditModel,
      primaryFalVideoModel: rawFalCfg.primaryFalVideoModel && validFalIds.has(rawFalCfg.primaryFalVideoModel) ? rawFalCfg.primaryFalVideoModel : DEFAULT_FAL_CONFIG.primaryFalVideoModel,
      primaryFalImageToVideoModel: rawFalCfg.primaryFalImageToVideoModel && validFalIds.has(rawFalCfg.primaryFalImageToVideoModel) ? rawFalCfg.primaryFalImageToVideoModel : DEFAULT_FAL_CONFIG.primaryFalImageToVideoModel
    }
  };
}
function decryptVaultWrapper(wrapper) {
  const key = getVaultEncryptionKey();
  const decipher = import_node_crypto.default.createDecipheriv(
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
  const iv = import_node_crypto.default.randomBytes(12);
  const cipher = import_node_crypto.default.createCipheriv("aes-256-gcm", key, iv);
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
async function fetchRemoteUpstashVault(upstash) {
  const resp = await fetch(
    `${upstash.url}/get/${encodeURIComponent(UPSTASH_VAULT_REDIS_KEY)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${upstash.token}`
      }
    }
  );
  if (!resp.ok) {
    throw new Error(`Upstash Redis GET failed with HTTP ${resp.status}.`);
  }
  const body = await resp.json();
  if (body?.error) {
    throw new Error(`Upstash Redis error: ${body.error}`);
  }
  if (!body?.result || typeof body.result !== "string") {
    return { found: false };
  }
  const wrapper = JSON.parse(body.result);
  if (!wrapper?.iv || !wrapper?.tag || !wrapper?.ciphertext) {
    throw new Error("Malformed encrypted vault payload in Upstash Redis.");
  }
  const decrypted = decryptVaultWrapper(wrapper);
  return { found: true, vault: decrypted };
}
async function syncVaultFromRemote(force = false) {
  const upstash = getUpstashConfig();
  if (!upstash.configured) return;
  if (pendingRemoteWrites.length > 0) {
    await flushRemoteVaultWrites();
  }
  const now = Date.now();
  if (!force && inMemoryFallbackVault && now - lastRemoteSyncAt < REMOTE_SYNC_TTL_MS) {
    return;
  }
  if (!force && inFlightRemoteSync) {
    return inFlightRemoteSync;
  }
  const run = (async () => {
    try {
      const remote = await fetchRemoteUpstashVault(upstash);
      if (!remote.found) {
        if (!inMemoryFallbackVault) {
          inMemoryFallbackVault = createDefaultVaultData();
        }
        lastRemoteSyncError = void 0;
        lastDecryptionError = void 0;
        lastRemoteSyncAt = Date.now();
        lastSuccessfulRemoteSyncAt = Date.now();
        return;
      }
      if (remote.vault) {
        inMemoryFallbackVault = remote.vault;
        lastRemoteSyncError = void 0;
        lastDecryptionError = void 0;
        lastRemoteSyncAt = Date.now();
        lastSuccessfulRemoteSyncAt = Date.now();
      }
    } catch (err) {
      const msg = scrubSecretText(String(err?.message || "Failed to sync encrypted AI Vault from Upstash Redis."));
      if (msg.toLowerCase().includes("authenticate") || msg.toLowerCase().includes("unsupported state") || msg.toLowerCase().includes("malformed encrypted vault") || msg.toLowerCase().includes("json")) {
        lastDecryptionError = "Encrypted Upstash vault could not be decrypted with current AI_VAULT_SECRET.";
        lastRemoteSyncError = void 0;
      } else {
        lastRemoteSyncError = msg;
      }
    } finally {
      inFlightRemoteSync = null;
    }
  })();
  inFlightRemoteSync = run;
  return run;
}
async function flushRemoteVaultWrites(options) {
  if (pendingRemoteWrites.length === 0) return;
  const batch = pendingRemoteWrites.splice(0, pendingRemoteWrites.length);
  const results = await Promise.allSettled(batch.map((w) => w.promise));
  if (options?.throwOnError) {
    const firstRejected = results.find((r) => r.status === "rejected");
    if (firstRejected) {
      throw firstRejected.reason instanceof Error ? firstRejected.reason : new Error(String(firstRejected.reason || "Failed to persist AI Vault to Upstash Redis."));
    }
  }
}
function mergeHealthDeltaIntoRemoteVault(remote, local, delta) {
  const merged = {
    keys: remote.keys.map((k) => ({ ...k })),
    envOverrides: { ...remote.envOverrides },
    projectHealth: { ...remote.projectHealth },
    modelConfig: remote.modelConfig,
    falKeys: remote.falKeys.map((k) => ({ ...k })),
    falEnvOverrides: { ...remote.falEnvOverrides },
    falModelHealth: { ...remote.falModelHealth },
    falConfig: remote.falConfig
  };
  if (delta.provider === "fal") {
    if (delta.keyId) {
      if (delta.keyId.startsWith("env_")) {
        const localOv = local.falEnvOverrides[delta.keyId];
        if (localOv) {
          const remoteOv = merged.falEnvOverrides[delta.keyId];
          merged.falEnvOverrides[delta.keyId] = {
            ...remoteOv || localOv,
            status: localOv.status,
            quotaScope: localOv.quotaScope,
            failureCount: localOv.failureCount,
            consecutiveFailures: localOv.consecutiveFailures,
            lastError: localOv.lastError,
            lastTestedAt: localOv.lastTestedAt,
            cooldownUntil: localOv.cooldownUntil
          };
        }
      } else {
        const localRec = local.falKeys.find((k) => k.id === delta.keyId);
        const remoteIdx = merged.falKeys.findIndex((k) => k.id === delta.keyId);
        if (localRec && remoteIdx !== -1) {
          const remoteRec = merged.falKeys[remoteIdx];
          merged.falKeys[remoteIdx] = {
            ...remoteRec,
            status: localRec.status,
            quotaScope: localRec.quotaScope,
            failureCount: localRec.failureCount,
            consecutiveFailures: localRec.consecutiveFailures,
            lastError: localRec.lastError,
            lastTestedAt: localRec.lastTestedAt,
            cooldownUntil: localRec.cooldownUntil,
            updatedAt: localRec.updatedAt
          };
        }
      }
    }
    if (delta.falModelId && local.falModelHealth[delta.falModelId]) {
      merged.falModelHealth[delta.falModelId] = { ...local.falModelHealth[delta.falModelId] };
    }
    return merged;
  }
  if (delta.keyId) {
    if (delta.keyId.startsWith("env_")) {
      const localOv = local.envOverrides[delta.keyId];
      if (localOv) {
        const remoteOv = merged.envOverrides[delta.keyId];
        merged.envOverrides[delta.keyId] = {
          ...remoteOv || localOv,
          status: localOv.status,
          quotaScope: localOv.quotaScope,
          lastError: localOv.lastError,
          lastTestedAt: localOv.lastTestedAt,
          cooldownUntil: localOv.cooldownUntil
        };
      }
    } else {
      const localRec = local.keys.find((k) => k.id === delta.keyId);
      const remoteIdx = merged.keys.findIndex((k) => k.id === delta.keyId);
      if (localRec && remoteIdx !== -1) {
        const remoteRec = merged.keys[remoteIdx];
        merged.keys[remoteIdx] = {
          ...remoteRec,
          status: localRec.status,
          quotaScope: localRec.quotaScope,
          lastError: localRec.lastError,
          lastTestedAt: localRec.lastTestedAt,
          cooldownUntil: localRec.cooldownUntil,
          updatedAt: localRec.updatedAt
        };
      }
    }
  }
  if (delta.projectId && local.projectHealth[delta.projectId]) {
    merged.projectHealth[delta.projectId] = { ...local.projectHealth[delta.projectId] };
  }
  return merged;
}
async function writeUpstashSet(upstash, serialized) {
  const res = await fetch(upstash.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${upstash.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(["SET", UPSTASH_VAULT_REDIS_KEY, serialized])
  });
  if (!res.ok) {
    throw new Error(`Upstash Redis SET failed with HTTP ${res.status}.`);
  }
  const data = await res.json().catch(() => ({}));
  if (data?.error) {
    throw new Error(`Upstash Redis SET error: ${data.error}`);
  }
  lastRemoteSyncAt = Date.now();
  lastSuccessfulRemoteSyncAt = Date.now();
  lastRemoteSyncError = void 0;
}
function readVaultData() {
  const upstash = getUpstashConfig();
  if (upstash.configured && inMemoryFallbackVault) {
    return inMemoryFallbackVault;
  }
  try {
    if (!import_node_fs.default.existsSync(VAULT_FILE_PATH)) {
      return inMemoryFallbackVault || createDefaultVaultData();
    }
    const rawFile = import_node_fs.default.readFileSync(VAULT_FILE_PATH, "utf8");
    const wrapper = JSON.parse(rawFile);
    const normalized = decryptVaultWrapper(wrapper);
    inMemoryFallbackVault = normalized;
    return normalized;
  } catch {
    return inMemoryFallbackVault || createDefaultVaultData();
  }
}
function writeVaultData(data, options) {
  const upstash = getUpstashConfig();
  const hasEnvSecret = Boolean((process.env.AI_VAULT_SECRET || process.env.SESSION_SECRET || "").trim());
  const isVercel = Boolean(process.env.VERCEL);
  if (options?.strictRemoteSecret) {
    if (isVercel && !upstash.configured) {
      throw new Error(
        "Persistent serverless vault storage is not configured on Vercel. Add UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, and AI_VAULT_SECRET in Vercel Environment Variables once so Admin Panel keys persist across instances."
      );
    }
    if (upstash.configured && !hasEnvSecret) {
      throw new Error("AI_VAULT_SECRET environment variable is required to encrypt keys into Upstash Redis.");
    }
    if (upstash.configured && lastDecryptionError) {
      throw new Error(
        "Remote encrypted vault could not be decrypted with current AI_VAULT_SECRET. Restore the original AI_VAULT_SECRET before modifying keys so existing vault data is not overwritten."
      );
    }
  }
  inMemoryFallbackVault = data;
  const payload = encryptVaultWrapper(data);
  const serialized = JSON.stringify(payload);
  try {
    import_node_fs.default.mkdirSync(VAULT_BASE_DIR, { recursive: true });
    import_node_fs.default.writeFileSync(VAULT_FILE_PATH, serialized, { mode: 384 });
  } catch {
  }
  if (upstash.configured && hasEnvSecret) {
    const strict = Boolean(options?.strictRemoteSecret);
    const writePromise = (async () => {
      try {
        if (!strict && options?.healthDelta) {
          if (lastDecryptionError) return;
          try {
            const remote = await fetchRemoteUpstashVault(upstash);
            if (remote.found && remote.vault) {
              const merged = mergeHealthDeltaIntoRemoteVault(remote.vault, data, options.healthDelta);
              inMemoryFallbackVault = merged;
              const mergedSerialized = JSON.stringify(encryptVaultWrapper(merged));
              await writeUpstashSet(upstash, mergedSerialized);
              return;
            }
          } catch {
          }
        }
        await writeUpstashSet(upstash, serialized);
      } catch (err) {
        const msg = scrubSecretText(String(err?.message || "Failed to persist AI Vault to Upstash Redis."));
        lastRemoteSyncError = msg;
        if (strict) {
          throw new Error(msg);
        }
      }
    })();
    pendingRemoteWrites.push({ promise: writePromise, strict });
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
var FAL_ENV_KEY_SLOT_NAMES = [
  { id: "env_FAL_KEY", envVarName: "FAL_KEY", label: "Server Runtime Secret (FAL_KEY)", defaultPriority: 10 },
  { id: "env_FAL_KEY_1", envVarName: "FAL_KEY_1", label: "Server fal.ai Slot 1 (FAL_KEY_1)", defaultPriority: 11 },
  { id: "env_FAL_KEY_2", envVarName: "FAL_KEY_2", label: "Server fal.ai Slot 2 (FAL_KEY_2)", defaultPriority: 12 },
  { id: "env_FAL_KEY_3", envVarName: "FAL_KEY_3", label: "Server fal.ai Slot 3 (FAL_KEY_3)", defaultPriority: 13 }
];
function scrubSecretText(text) {
  let sanitized = String(text || "");
  sanitized = sanitized.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_API_KEY]");
  sanitized = sanitized.replace(/\bfal_[0-9A-Za-z_-]{16,}/g, "[REDACTED_FAL_KEY]");
  sanitized = sanitized.replace(/(Authorization:\s*Key\s+)[^\s"']+/gi, "$1[REDACTED_FAL_KEY]");
  const vault = readVaultData();
  const rawKeys = [
    ...ENV_KEY_SLOT_NAMES.map((slot) => process.env[slot.envVarName]),
    ...FAL_ENV_KEY_SLOT_NAMES.map((slot) => process.env[slot.envVarName]),
    ...vault.keys.map((k) => {
      try {
        return decryptText(k.encryptedKey);
      } catch {
        return "";
      }
    }),
    ...vault.falKeys.map((k) => {
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
  if (/^fal_/i.test(cleanKey) || /^[0-9a-f-]{16,}:[0-9a-f-]{16,}$/i.test(cleanKey)) {
    throw new Error("Looks like a fal.ai key. Add fal.ai credentials inside the separate fal.ai API Key Vault section.");
  }
  const cleanLabel = (params.label || "").trim() || `Admin Key ${Date.now().toString().slice(-4)}`;
  const vault = readVaultData();
  const id = `vk_${import_node_crypto.default.randomUUID().replace(/-/g, "").slice(0, 12)}`;
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
  writeVaultData(vault, {
    healthDelta: {
      provider: "gemini",
      keyId,
      projectId: resolvedProjectId
    }
  });
}
function getRuntimeFalEnvKeys() {
  const seenValues = /* @__PURE__ */ new Set();
  const active = [];
  for (const item of FAL_ENV_KEY_SLOT_NAMES) {
    const val = (process.env[item.envVarName] || "").trim();
    if (!val || seenValues.has(val)) continue;
    seenValues.add(val);
    active.push({
      id: item.id,
      envVarName: item.envVarName,
      label: item.label,
      rawKey: val,
      defaultPriority: item.defaultPriority
    });
  }
  return active;
}
function getFalConfig() {
  return readVaultData().falConfig;
}
function updateFalConfig(patch) {
  const vault = readVaultData();
  const validFalIds = new Set(VERIFIED_FAL_MODELS.map((m) => m.id));
  if (typeof patch.enableFalKeyFallback === "boolean") {
    vault.falConfig.enableFalKeyFallback = patch.enableFalKeyFallback;
  }
  if (typeof patch.enableFalImageFallback === "boolean") {
    vault.falConfig.enableFalImageFallback = patch.enableFalImageFallback;
  }
  if (typeof patch.enableFalVideoFallback === "boolean") {
    vault.falConfig.enableFalVideoFallback = patch.enableFalVideoFallback;
  }
  if (typeof patch.preferFalForVideo === "boolean") {
    vault.falConfig.preferFalForVideo = patch.preferFalForVideo;
  }
  if (typeof patch.maxConcurrentPerKey === "number" && Number.isFinite(patch.maxConcurrentPerKey)) {
    vault.falConfig.maxConcurrentPerKey = Math.max(1, Math.min(10, Math.round(patch.maxConcurrentPerKey)));
  }
  if (typeof patch.requestTimeoutSec === "number" && Number.isFinite(patch.requestTimeoutSec)) {
    vault.falConfig.requestTimeoutSec = Math.max(10, Math.min(180, Math.round(patch.requestTimeoutSec)));
  }
  if (typeof patch.maxQueueWaitSec === "number" && Number.isFinite(patch.maxQueueWaitSec)) {
    vault.falConfig.maxQueueWaitSec = Math.max(15, Math.min(240, Math.round(patch.maxQueueWaitSec)));
  }
  if (patch.primaryFalImageModel && validFalIds.has(patch.primaryFalImageModel)) {
    vault.falConfig.primaryFalImageModel = patch.primaryFalImageModel;
  }
  if (patch.primaryFalImageEditModel && validFalIds.has(patch.primaryFalImageEditModel)) {
    vault.falConfig.primaryFalImageEditModel = patch.primaryFalImageEditModel;
  }
  if (patch.primaryFalVideoModel && validFalIds.has(patch.primaryFalVideoModel)) {
    vault.falConfig.primaryFalVideoModel = patch.primaryFalVideoModel;
  }
  if (patch.primaryFalImageToVideoModel && validFalIds.has(patch.primaryFalImageToVideoModel)) {
    vault.falConfig.primaryFalImageToVideoModel = patch.primaryFalImageToVideoModel;
  }
  writeVaultData(vault, { strictRemoteSecret: true });
  return vault.falConfig;
}
function listResolvedFalKeys() {
  const vault = readVaultData();
  const now = Date.now();
  const resolved = [];
  for (const rec of vault.falKeys) {
    let rawKey = "";
    try {
      rawKey = decryptText(rec.encryptedKey).trim();
    } catch {
      rawKey = "";
    }
    if (!rawKey) continue;
    const isCooldownExpired = rec.cooldownUntil && rec.cooldownUntil <= now;
    const status = !rec.enabled ? "disabled" : rec.status === "quota_exhausted" && isCooldownExpired ? "ready" : rec.status === "error" && isCooldownExpired ? "ready" : rec.status;
    resolved.push({
      id: rec.id,
      label: rec.label,
      rawKey,
      source: "admin_vault",
      enabled: rec.enabled,
      priority: rec.priority,
      status,
      quotaScope: isCooldownExpired && rec.status === "quota_exhausted" ? void 0 : rec.quotaScope,
      cooldownUntil: isCooldownExpired ? void 0 : rec.cooldownUntil
    });
  }
  for (const envItem of getRuntimeFalEnvKeys()) {
    const ov = vault.falEnvOverrides[envItem.id];
    const enabled = ov ? ov.enabled : true;
    const isCooldownExpired = ov?.cooldownUntil && ov.cooldownUntil <= now;
    const rawStatus = ov?.status || "ready";
    const status = !enabled ? "disabled" : (rawStatus === "quota_exhausted" || rawStatus === "error") && isCooldownExpired ? "ready" : rawStatus;
    resolved.push({
      id: envItem.id,
      label: envItem.label,
      rawKey: envItem.rawKey,
      source: "runtime_env",
      enabled,
      priority: ov?.priority ?? envItem.defaultPriority,
      status,
      quotaScope: isCooldownExpired && rawStatus === "quota_exhausted" ? void 0 : ov?.quotaScope,
      cooldownUntil: isCooldownExpired ? void 0 : ov?.cooldownUntil
    });
  }
  return resolved.sort((a, b) => a.priority - b.priority);
}
function listSafeFalKeySummaries() {
  const vault = readVaultData();
  const now = Date.now();
  const summaries = [];
  for (const rec of vault.falKeys) {
    let raw = "";
    try {
      raw = decryptText(rec.encryptedKey).trim();
    } catch {
      raw = "";
    }
    const isCooldownExpired = rec.cooldownUntil && rec.cooldownUntil <= now;
    const status = !rec.enabled ? "disabled" : (rec.status === "quota_exhausted" || rec.status === "error") && isCooldownExpired ? "ready" : rec.status;
    summaries.push({
      id: rec.id,
      label: rec.label,
      maskedKey: raw ? maskSecretValue(raw) : "Decrypt Error",
      source: "admin_vault",
      enabled: rec.enabled,
      priority: rec.priority,
      status,
      quotaScope: isCooldownExpired && rec.status === "quota_exhausted" ? void 0 : rec.quotaScope,
      failureCount: rec.failureCount || 0,
      consecutiveFailures: rec.consecutiveFailures || 0,
      lastError: rec.lastError,
      lastTestedAt: rec.lastTestedAt,
      cooldownUntil: isCooldownExpired ? void 0 : rec.cooldownUntil
    });
  }
  for (const envItem of getRuntimeFalEnvKeys()) {
    const ov = vault.falEnvOverrides[envItem.id];
    const enabled = ov ? ov.enabled : true;
    const isCooldownExpired = ov?.cooldownUntil && ov.cooldownUntil <= now;
    const rawStatus = ov?.status || "ready";
    const status = !enabled ? "disabled" : (rawStatus === "quota_exhausted" || rawStatus === "error") && isCooldownExpired ? "ready" : rawStatus;
    summaries.push({
      id: envItem.id,
      label: envItem.label,
      maskedKey: maskSecretValue(envItem.rawKey),
      source: "runtime_env",
      envVarName: envItem.envVarName,
      enabled,
      priority: ov?.priority ?? envItem.defaultPriority,
      status,
      quotaScope: isCooldownExpired && rawStatus === "quota_exhausted" ? void 0 : ov?.quotaScope,
      failureCount: ov?.failureCount || 0,
      consecutiveFailures: ov?.consecutiveFailures || 0,
      lastError: ov?.lastError,
      lastTestedAt: ov?.lastTestedAt,
      cooldownUntil: isCooldownExpired ? void 0 : ov?.cooldownUntil
    });
  }
  return summaries.sort((a, b) => a.priority - b.priority);
}
function listFalModelHealthSummaries() {
  const vault = readVaultData();
  const now = Date.now();
  return Object.values(vault.falModelHealth || {}).map((rec) => {
    if (rec.status === "error" && rec.cooldownUntil && rec.cooldownUntil <= now) {
      return { ...rec, status: "ready", cooldownUntil: void 0 };
    }
    return rec;
  }).sort((a, b) => a.modelId.localeCompare(b.modelId));
}
function validateFalApiKeyFormat(rawKey) {
  const cleanKey = (rawKey || "").trim();
  if (!cleanKey || cleanKey.length < 16 || /\s/.test(cleanKey)) {
    throw new Error("Please enter a valid fal.ai API key.");
  }
  if (/^AIza/i.test(cleanKey)) {
    throw new Error(
      "This looks like a Google Gemini API key (AIza...). Add Gemini keys in the Google Gemini Vault above."
    );
  }
  return cleanKey;
}
function addFalVaultApiKey(params) {
  const cleanKey = validateFalApiKeyFormat(params.apiKey);
  const cleanLabel = (params.label || "").trim() || `fal.ai Key ${Date.now().toString().slice(-4)}`;
  const vault = readVaultData();
  const id = `fk_${import_node_crypto.default.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const nextPriority = typeof params.priority === "number" && Number.isFinite(params.priority) ? Math.max(1, Math.min(999, Math.round(params.priority))) : vault.falKeys.length + 1;
  vault.falKeys.push({
    id,
    label: cleanLabel.slice(0, 60),
    encryptedKey: encryptText(cleanKey),
    enabled: true,
    priority: nextPriority,
    status: "ready",
    failureCount: 0,
    consecutiveFailures: 0,
    createdAt: nowIso,
    updatedAt: nowIso
  });
  writeVaultData(vault, { strictRemoteSecret: true });
  return listSafeFalKeySummaries().find((k) => k.id === id);
}
function updateFalVaultApiKey(keyId, patch) {
  const vault = readVaultData();
  if (keyId.startsWith("env_FAL_")) {
    const envItem = getRuntimeFalEnvKeys().find((e) => e.id === keyId);
    if (!envItem) return null;
    const prev = vault.falEnvOverrides[keyId] || {
      enabled: true,
      priority: envItem.defaultPriority,
      status: "ready"
    };
    const nextEnabled = typeof patch.enabled === "boolean" ? patch.enabled : prev.enabled;
    vault.falEnvOverrides[keyId] = {
      ...prev,
      enabled: nextEnabled,
      priority: typeof patch.priority === "number" && Number.isFinite(patch.priority) ? Math.max(1, Math.min(999, Math.round(patch.priority))) : prev.priority,
      status: patch.resetHealth ? nextEnabled ? "ready" : "disabled" : !nextEnabled ? "disabled" : prev.status === "disabled" ? "ready" : prev.status,
      quotaScope: patch.resetHealth ? void 0 : prev.quotaScope,
      consecutiveFailures: patch.resetHealth ? 0 : prev.consecutiveFailures,
      lastError: patch.resetHealth ? void 0 : prev.lastError,
      cooldownUntil: patch.resetHealth ? void 0 : prev.cooldownUntil
    };
    writeVaultData(vault, { strictRemoteSecret: true });
    return listSafeFalKeySummaries().find((k) => k.id === keyId) || null;
  }
  const idx = vault.falKeys.findIndex((k) => k.id === keyId);
  if (idx === -1) return null;
  const current = vault.falKeys[idx];
  const updatedEnabled = typeof patch.enabled === "boolean" ? patch.enabled : current.enabled;
  let updatedEncrypted = current.encryptedKey;
  let updatedStatus = current.status;
  let updatedQuotaScope = current.quotaScope;
  let updatedError = current.lastError;
  let updatedCooldown = current.cooldownUntil;
  let updatedConsecutive = current.consecutiveFailures || 0;
  if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
    const cleanNew = validateFalApiKeyFormat(patch.apiKey);
    updatedEncrypted = encryptText(cleanNew);
    updatedStatus = updatedEnabled ? "ready" : "disabled";
    updatedQuotaScope = void 0;
    updatedError = void 0;
    updatedCooldown = void 0;
    updatedConsecutive = 0;
  } else if (patch.resetHealth) {
    updatedStatus = updatedEnabled ? "ready" : "disabled";
    updatedQuotaScope = void 0;
    updatedError = void 0;
    updatedCooldown = void 0;
    updatedConsecutive = 0;
  } else if (typeof patch.enabled === "boolean") {
    updatedStatus = updatedEnabled ? current.status === "disabled" ? "ready" : current.status : "disabled";
  }
  vault.falKeys[idx] = {
    ...current,
    label: typeof patch.label === "string" && patch.label.trim() ? patch.label.trim().slice(0, 60) : current.label,
    encryptedKey: updatedEncrypted,
    enabled: updatedEnabled,
    priority: typeof patch.priority === "number" && Number.isFinite(patch.priority) ? Math.max(1, Math.min(999, Math.round(patch.priority))) : current.priority,
    status: updatedStatus,
    quotaScope: updatedQuotaScope,
    consecutiveFailures: updatedConsecutive,
    lastError: updatedError,
    cooldownUntil: updatedCooldown,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeVaultData(vault, { strictRemoteSecret: true });
  return listSafeFalKeySummaries().find((k) => k.id === keyId) || null;
}
function deleteFalVaultApiKey(keyId) {
  if (keyId.startsWith("env_FAL_")) {
    throw new Error("Runtime server fal.ai environment keys cannot be deleted; disable them instead.");
  }
  const vault = readVaultData();
  const nextKeys = vault.falKeys.filter((k) => k.id !== keyId);
  if (nextKeys.length === vault.falKeys.length) return false;
  vault.falKeys = nextKeys;
  writeVaultData(vault, { strictRemoteSecret: true });
  return true;
}
function recordFalKeyHealthResult(keyId, result) {
  const vault = readVaultData();
  const now = Date.now();
  const safeError = result.error ? scrubSecretText(result.error).slice(0, 240) : void 0;
  const cooldownUntil = result.cooldownMs && result.cooldownMs > 0 ? now + result.cooldownMs : void 0;
  const testedAt = result.testedAt || new Date(now).toISOString();
  const isFailure = Boolean(result.incrementFailure) || result.status !== "ready";
  if (keyId.startsWith("env_FAL_")) {
    const envItem = getRuntimeFalEnvKeys().find((e) => e.id === keyId);
    const prev = vault.falEnvOverrides[keyId] || {
      enabled: true,
      priority: envItem?.defaultPriority ?? 10,
      status: "ready",
      failureCount: 0,
      consecutiveFailures: 0
    };
    vault.falEnvOverrides[keyId] = {
      ...prev,
      status: prev.enabled ? result.status : "disabled",
      quotaScope: result.status === "ready" ? void 0 : result.quotaScope,
      failureCount: isFailure ? (prev.failureCount || 0) + 1 : prev.failureCount || 0,
      consecutiveFailures: isFailure ? (prev.consecutiveFailures || 0) + 1 : 0,
      lastError: result.status === "ready" ? void 0 : safeError,
      lastTestedAt: testedAt,
      cooldownUntil
    };
  } else {
    const idx = vault.falKeys.findIndex((k) => k.id === keyId);
    if (idx === -1) return;
    const cur = vault.falKeys[idx];
    vault.falKeys[idx] = {
      ...cur,
      status: cur.enabled ? result.status : "disabled",
      quotaScope: result.status === "ready" ? void 0 : result.quotaScope,
      failureCount: isFailure ? (cur.failureCount || 0) + 1 : cur.failureCount || 0,
      consecutiveFailures: isFailure ? (cur.consecutiveFailures || 0) + 1 : 0,
      lastError: result.status === "ready" ? void 0 : safeError,
      lastTestedAt: testedAt,
      cooldownUntil,
      updatedAt: testedAt
    };
  }
  writeVaultData(vault, {
    healthDelta: {
      provider: "fal",
      keyId
    }
  });
}
function recordFalModelHealthResult(modelId, result) {
  const cleanId = (modelId || "").trim();
  if (!cleanId) return;
  const vault = readVaultData();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const prev = vault.falModelHealth[cleanId];
  const safeError = result.error ? scrubSecretText(result.error).slice(0, 240) : void 0;
  if (result.status === "ready") {
    vault.falModelHealth[cleanId] = {
      modelId: cleanId,
      status: "ready",
      failureCount: prev?.failureCount || 0,
      updatedAt: nowIso
    };
  } else {
    vault.falModelHealth[cleanId] = {
      modelId: cleanId,
      status: "error",
      failureCount: (prev?.failureCount || 0) + 1,
      cooldownUntil: result.cooldownMs && result.cooldownMs > 0 ? now + result.cooldownMs : void 0,
      lastError: safeError,
      updatedAt: nowIso
    };
  }
  writeVaultData(vault, {
    healthDelta: {
      provider: "fal",
      falModelId: cleanId
    }
  });
}

// server/aiStatus.ts
function getBackendHost() {
  return process.env.VERCEL ? "vercel-serverless" : "nodejs-express";
}
function mapStatusLabel(s) {
  if (s === "ready") return "Ready";
  if (s === "disabled") return "Disabled";
  if (s === "quota_exhausted") return "Quota Exhausted";
  if (s === "invalid") return "Invalid Key";
  return "Error";
}
function getPublicAiCapabilityStatus() {
  const keys = listResolvedKeys();
  const modelConfig = getModelConfig();
  const falKeys = listSafeFalKeySummaries();
  const falConfig = getFalConfig();
  const now = Date.now();
  const activeKeys = keys.filter((k) => k.enabled && k.status !== "invalid");
  const healthyKeys = activeKeys.filter(
    (k) => k.status === "ready" && (!k.cooldownUntil || k.cooldownUntil <= now)
  );
  const falActiveKeys = falKeys.filter((k) => k.enabled && k.status !== "invalid");
  const falHealthyKeys = falActiveKeys.filter(
    (k) => k.status === "ready" && (!k.cooldownUntil || k.cooldownUntil <= now)
  );
  const falConfigured = falActiveKeys.length > 0;
  const falImageSupported = falConfigured && falConfig.enableFalImageFallback;
  const falVideoSupported = falConfigured && (falConfig.enableFalVideoFallback || falConfig.preferFalForVideo);
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
  const geminiConfigured = activeKeys.length > 0;
  const configured = geminiConfigured || falConfigured;
  const geminiVideoSupported = geminiConfigured && enabledVideoModels.length > 0;
  const videoSupported = geminiVideoSupported || falVideoSupported;
  return {
    ok: true,
    configured,
    provider: "google-gemini",
    backendHost: getBackendHost(),
    autoRoutingEnabled: modelConfig.enableAutoRouting,
    imageSelectionPolicy: modelConfig.imageSelectionPolicy,
    photoSupported: geminiConfigured && enabledImageModels.length > 0 || falImageSupported,
    textSupported: geminiConfigured && enabledTextModels.length > 0,
    photoModel: primaryImageModel,
    textModel: primaryTextModel,
    videoModel: falVideoSupported && !geminiVideoSupported ? falConfig.primaryFalVideoModel : primaryVideoModel,
    supportedModels: [
      ...enabledImageModels.map((m) => m.id),
      ...falImageSupported ? VERIFIED_FAL_MODELS.filter((m) => m.capability === "image" || m.capability === "image_edit").map((m) => m.id) : []
    ],
    verifiedModels,
    routingArchitecture: {
      assistantPreferred: primaryTextModel,
      photoTiers: {
        lite: enabledImageModels.find((m) => m.qualityTier === "lite")?.id || null,
        standard: enabledImageModels.find((m) => m.qualityTier === "standard")?.id || null,
        pro: enabledImageModels.find((m) => m.qualityTier === "pro")?.id || null
      },
      videoExclusive: enabledVideoModels[0]?.id || (falVideoSupported ? falConfig.primaryFalVideoModel : null)
    },
    videoSupported,
    videoReason: geminiVideoSupported ? `Gemini Omni (${primaryVideoModel}) is configured for video routing via /api/ai/route${falVideoSupported ? ` (with fal.ai ${falConfig.primaryFalVideoModel} failover ready)` : ""}. Interactive timeline editing tools (Trim, Filters, Music, Text) are available in Post Editor.` : falVideoSupported ? `fal.ai (${falConfig.primaryFalVideoModel}) is configured for video routing via /api/ai/route.` : "Video AI requires an active Gemini API key with Gemini Omni or an active fal.ai API key in Admin Panel \u2192 AI Model Manager.",
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
    projects: listProjectHealthSummaries(),
    falConfigured,
    falImageSupported,
    falVideoSupported,
    falActiveKeyCount: falActiveKeys.length,
    falHealthyKeyCount: falHealthyKeys.length,
    falKeyStatuses: falKeys.map((k, idx) => ({
      keyIndex: idx + 1,
      id: k.id,
      label: k.source === "admin_vault" ? `fal.ai Slot ${idx + 1}` : `Server fal.ai Key ${idx + 1}`,
      enabled: k.enabled,
      source: k.source,
      status: mapStatusLabel(k.status),
      quotaScope: k.quotaScope
    })),
    falModelHealth: listFalModelHealthSummaries()
  };
}
async function getPublicAiCapabilityStatusAsync() {
  await syncVaultFromRemote();
  return getPublicAiCapabilityStatus();
}

// api/_lib/authBackend.ts
var import_node_crypto2 = require("node:crypto");
var import_app = require("firebase-admin/app");
var FIREBASE_PROJECT_ID = "king-5f52e";
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
    const verifier = (0, import_node_crypto2.createVerify)("RSA-SHA256");
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

// server/falBackend.ts
var import_cloudinary = __toESM(require("cloudinary"), 1);
var cloudinary = import_cloudinary.default.v2;
var VERCEL_SAFE_BASE64_THRESHOLD = 34e5;
var VERCEL_HARD_BASE64_LIMIT = 42e5;
var MAX_NODE_IMAGE_BYTES = 10 * 1024 * 1024;
var ALLOWED_FAL_IMAGE_MIMES = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp"]);
var MAX_FAL_PROMPT_LENGTH = 2e3;
var FAL_RPM_COOLDOWN_MS = 65 * 1e3;
var FAL_MAX_RPM_COOLDOWN_MS = 180 * 1e3;
var FAL_CONCURRENCY_COOLDOWN_MS = 20 * 1e3;
var FAL_QUEUE_COOLDOWN_MS = 30 * 1e3;
var FAL_TRANSIENT_COOLDOWN_MS = 30 * 1e3;
var FAL_MODEL_COOLDOWN_MS = 10 * 60 * 1e3;
var MAX_TRANSIENT_RETRIES_PER_KEY = 1;
var activeInFlightByKey = /* @__PURE__ */ new Map();
var pendingQueueJobsByKey = /* @__PURE__ */ new Map();
function getFalRuntimeMetrics() {
  return {
    activeInFlightByKey: Object.fromEntries(activeInFlightByKey.entries()),
    pendingQueueJobsByKey: Object.fromEntries(pendingQueueJobsByKey.entries())
  };
}
function tryAcquireFalConcurrencySlot(keyId, maxConcurrent) {
  const current = activeInFlightByKey.get(keyId) || 0;
  if (current >= Math.max(1, maxConcurrent)) {
    return false;
  }
  activeInFlightByKey.set(keyId, current + 1);
  return true;
}
function releaseFalConcurrencySlot(keyId) {
  const current = activeInFlightByKey.get(keyId) || 0;
  if (current <= 1) {
    activeInFlightByKey.delete(keyId);
  } else {
    activeInFlightByKey.set(keyId, current - 1);
  }
}
function incrementPendingQueueJob(keyId) {
  pendingQueueJobsByKey.set(keyId, (pendingQueueJobsByKey.get(keyId) || 0) + 1);
}
function decrementPendingQueueJob(keyId) {
  const current = pendingQueueJobsByKey.get(keyId) || 0;
  if (current <= 1) {
    pendingQueueJobsByKey.delete(keyId);
  } else {
    pendingQueueJobsByKey.set(keyId, current - 1);
  }
}
function parseRetryAfterHeaderMs(retryAfterHeader, bodyText) {
  if (retryAfterHeader) {
    const asNum = Number(retryAfterHeader);
    if (Number.isFinite(asNum) && asNum > 0) {
      return Math.min(FAL_MAX_RPM_COOLDOWN_MS, Math.max(15e3, Math.round(asNum * 1e3)));
    }
    const asDate = Date.parse(retryAfterHeader);
    if (Number.isFinite(asDate) && asDate > Date.now()) {
      return Math.min(FAL_MAX_RPM_COOLDOWN_MS, Math.max(15e3, asDate - Date.now()));
    }
  }
  const match = bodyText.match(/(?:retry[_ -]?after|try again in)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*s?/i);
  if (match) {
    const secs = Number(match[1]);
    if (Number.isFinite(secs) && secs > 0) {
      return Math.min(FAL_MAX_RPM_COOLDOWN_MS, Math.max(15e3, Math.round(secs * 1e3)));
    }
  }
  return void 0;
}
function classifyFalError(params) {
  const status = Number(params.status || 0);
  const cleanBody = scrubSecretText(String(params.bodyText || "").trim());
  const lower = cleanBody.toLowerCase();
  if (params.isTimeout || status === 504 || status === 408 || /timed?\s*out|abort(ed)?|deadline exceeded/i.test(lower)) {
    return {
      kind: "REQUEST_TIMEOUT",
      httpStatus: 504,
      code: "FAL_REQUEST_TIMEOUT",
      message: cleanBody ? `fal.ai request timed out: ${cleanBody.slice(0, 140)}` : "fal.ai request timed out before completion.",
      keyStatus: "error",
      cooldownMs: FAL_TRANSIENT_COOLDOWN_MS,
      retryableWithBackoff: true
    };
  }
  if (/concurrency\s*limit|too many concurrent|max\s*concurrent/i.test(lower)) {
    const retryMs = parseRetryAfterHeaderMs(params.retryAfterHeader, cleanBody) || FAL_CONCURRENCY_COOLDOWN_MS;
    return {
      kind: "CONCURRENCY_LIMITED",
      httpStatus: 429,
      code: "FAL_CONCURRENCY_LIMITED",
      message: `fal.ai concurrency limit reached (HTTP ${status || 429}). Key cooled down for ${Math.ceil(
        retryMs / 1e3
      )}s and failing over.`,
      keyStatus: "quota_exhausted",
      quotaScope: "concurrency_limit",
      cooldownMs: retryMs
    };
  }
  if (/queue\s*(?:length|capacity|size)?\s*(?:is\s*)?(?:full|limit|overflow|exceeded|saturated)|too many queued/i.test(lower)) {
    const retryMs = parseRetryAfterHeaderMs(params.retryAfterHeader, cleanBody) || FAL_QUEUE_COOLDOWN_MS;
    return {
      kind: "QUEUE_SATURATED",
      httpStatus: 429,
      code: "FAL_QUEUE_SATURATED",
      message: `fal.ai queue capacity saturated (HTTP ${status || 429}). Cooldown ${Math.ceil(
        retryMs / 1e3
      )}s without marking invalid.`,
      keyStatus: "quota_exhausted",
      quotaScope: "queue_limit",
      cooldownMs: retryMs
    };
  }
  if (status === 429 || /rate limit|too many requests|throttled/i.test(lower)) {
    const retryMs = parseRetryAfterHeaderMs(params.retryAfterHeader, cleanBody) || FAL_RPM_COOLDOWN_MS;
    return {
      kind: "RATE_LIMITED",
      httpStatus: 429,
      code: "FAL_RATE_LIMITED",
      message: `fal.ai temporary rate limit (HTTP 429). Key cooled down for ${Math.ceil(
        retryMs / 1e3
      )}s without marking invalid.`,
      keyStatus: "quota_exhausted",
      quotaScope: "rpm_throttle",
      cooldownMs: retryMs
    };
  }
  if (status === 401 || status === 403 || /invalid credentials|invalid api key|unauthorized|no credentials found|revoked key/i.test(lower)) {
    return {
      kind: "INVALID_KEY",
      httpStatus: status === 401 ? 401 : 403,
      code: "FAL_KEY_INVALID",
      message: `fal.ai API key rejected (HTTP ${status || 401}). Check or replace this key.`,
      keyStatus: "invalid"
    };
  }
  if (status === 404 || /endpoint.*not found|model.*not found|model.*unavailable|application.*not found|not deployed|deprecated endpoint/i.test(
    lower
  )) {
    return {
      kind: "MODEL_UNAVAILABLE",
      httpStatus: 404,
      code: "FAL_MODEL_UNAVAILABLE",
      message: `fal.ai model "${params.modelId || "selected"}" is unavailable or returned 404.`,
      isModelSpecificFailure: true
    };
  }
  if (status === 400 || status === 422) {
    const isModelRejected = /unsupported parameter|invalid endpoint|runner.*failed for model|unsupported aspect|unsupported duration/i.test(
      lower
    );
    if (isModelRejected) {
      return {
        kind: "MODEL_UNAVAILABLE",
        httpStatus: 422,
        code: "FAL_MODEL_INCOMPATIBLE",
        message: cleanBody.slice(0, 180) || `fal.ai model ${params.modelId || ""} rejected parameters.`,
        isModelSpecificFailure: true
      };
    }
    return {
      kind: "BAD_REQUEST",
      httpStatus: 400,
      code: "FAL_BAD_REQUEST",
      message: cleanBody.slice(0, 200) || "fal.ai rejected the prompt or media input."
    };
  }
  return {
    kind: "UPSTREAM_TRANSIENT",
    httpStatus: status >= 500 ? status : 502,
    code: "FAL_UPSTREAM_ERROR",
    message: cleanBody.slice(0, 180) || `fal.ai upstream error (HTTP ${status || 502}).`,
    keyStatus: "error",
    cooldownMs: FAL_TRANSIENT_COOLDOWN_MS,
    retryableWithBackoff: status === 0 || status >= 500
  };
}
function computeSafeBackoffMs(retryAttempt, baseMs = 450) {
  const exp = Math.min(2500, baseMs * Math.pow(2, Math.max(0, retryAttempt)));
  const jitter = Math.floor(Math.random() * 180);
  return exp + jitter;
}
async function sleepMs(ms) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
async function probeFalKeyConnection(rawKey, fetchImpl = fetch) {
  const cfg = getFalConfig();
  const timeoutMs = Math.min(15e3, Math.max(5e3, (cfg.requestTimeoutSec || 45) * 1e3));
  try {
    const resp = await fetchFalWithTimeout(
      fetchImpl,
      "https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai%2Fflux%2Fschnell",
      {
        method: "GET",
        headers: {
          Authorization: `Key ${rawKey}`,
          Accept: "application/json"
        }
      },
      timeoutMs
    );
    const bodyText = await resp.text();
    if (resp.ok) {
      return {
        ok: true,
        httpStatus: 200,
        keyStatus: "ready",
        message: "fal.ai API key connection verified (technical auth & rate-limit health OK)."
      };
    }
    const classified = classifyFalError({
      status: resp.status,
      bodyText,
      retryAfterHeader: resp.headers?.get?.("retry-after")
    });
    return {
      ok: false,
      httpStatus: classified.httpStatus,
      keyStatus: classified.keyStatus || "error",
      quotaScope: classified.quotaScope,
      cooldownMs: classified.cooldownMs,
      message: classified.message
    };
  } catch (err) {
    const isTimeout = err?.name === "AbortError" || /timed?\s*out/i.test(String(err?.message || ""));
    const classified = classifyFalError({
      status: isTimeout ? 504 : 502,
      bodyText: err?.message || "Unable to reach fal.ai API.",
      isTimeout
    });
    return {
      ok: false,
      httpStatus: classified.httpStatus,
      keyStatus: classified.keyStatus || "error",
      quotaScope: classified.quotaScope,
      cooldownMs: classified.cooldownMs,
      message: classified.message
    };
  }
}
async function testSpecificFalKeyLive(keyId, fetchImpl = fetch) {
  await syncVaultFromRemote(true);
  const keyItem = listResolvedFalKeys().find((k) => k.id === keyId);
  if (!keyItem) {
    return {
      status: 404,
      payload: { ok: false, error: "fal.ai API key slot not found." }
    };
  }
  const start = Date.now();
  const probe = await probeFalKeyConnection(keyItem.rawKey, fetchImpl);
  const latencyMs = Date.now() - start;
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  recordFalKeyHealthResult(keyItem.id, {
    status: probe.keyStatus,
    error: probe.ok ? void 0 : probe.message,
    cooldownMs: probe.cooldownMs,
    quotaScope: probe.quotaScope,
    incrementFailure: !probe.ok,
    testedAt: nowIso
  });
  return {
    status: probe.httpStatus,
    payload: {
      ok: probe.ok,
      keyId: keyItem.id,
      latencyMs,
      keyStatus: probe.keyStatus,
      quotaScope: probe.quotaScope,
      activeInFlight: activeInFlightByKey.get(keyItem.id) || 0,
      pendingQueueJobs: pendingQueueJobsByKey.get(keyItem.id) || 0,
      message: probe.ok ? `${probe.message} (${latencyMs}ms)` : void 0,
      error: probe.ok ? void 0 : probe.message
    }
  };
}
function getEligibleFalKeysForExecution(options) {
  const now = Date.now();
  const cfg = options?.overrideConfig || getFalConfig();
  const maxConc = Math.max(1, cfg.maxConcurrentPerKey || 2);
  const eligible = [...options?.overrideKeys || listResolvedFalKeys()].filter((k) => {
    if (!k.enabled) return false;
    if (k.status === "invalid" || k.status === "disabled") return false;
    if (k.status === "quota_exhausted" && (!k.cooldownUntil || k.cooldownUntil > now)) {
      return false;
    }
    if (k.status === "error" && k.cooldownUntil && k.cooldownUntil > now) {
      return false;
    }
    return true;
  }).sort((a, b) => {
    const aFull = (activeInFlightByKey.get(a.id) || 0) >= maxConc ? 1 : 0;
    const bFull = (activeInFlightByKey.get(b.id) || 0) >= maxConc ? 1 : 0;
    if (aFull !== bFull) return aFull - bFull;
    return a.priority - b.priority;
  });
  return cfg.enableFalKeyFallback ? eligible : eligible.slice(0, 1);
}
function buildFalExhaustedDiagnostic(options) {
  const safeSummaries = options?.overrideKeys ? options.overrideKeys.map((k) => ({
    id: k.id,
    label: k.label,
    maskedKey: k.rawKey.length > 8 ? `\u2022\u2022\u2022\u2022\u2022\u2022${k.rawKey.slice(-4)}` : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    source: k.source,
    enabled: k.enabled,
    priority: k.priority,
    status: k.status,
    quotaScope: k.quotaScope,
    failureCount: 0,
    consecutiveFailures: 0,
    cooldownUntil: k.cooldownUntil
  })) : listSafeFalKeySummaries();
  const configured = safeSummaries.length;
  const enabled = safeSummaries.filter((k) => k.enabled);
  const rateLimitedCount = enabled.filter((k) => k.quotaScope === "rpm_throttle").length;
  const concurrencyLimitedCount = enabled.filter(
    (k) => k.quotaScope === "concurrency_limit"
  ).length;
  const queueLimitedCount = enabled.filter((k) => k.quotaScope === "queue_limit").length;
  const invalidCount = enabled.filter((k) => k.status === "invalid").length;
  const transientErrorCount = enabled.filter((k) => k.status === "error").length;
  const cooldownTimes = enabled.map((k) => k.cooldownUntil).filter((ts) => typeof ts === "number" && ts > Date.now());
  const nextRetryAt = cooldownTimes.length > 0 ? new Date(Math.min(...cooldownTimes)).toISOString() : void 0;
  if (configured === 0) {
    return {
      status: 503,
      payload: {
        ok: false,
        provider: "fal-ai",
        code: "FAL_NO_KEYS_CONFIGURED",
        error: "No fal.ai API keys are configured in Admin Panel \u2192 AI Model Manager.",
        falDiagnostics: { configured: 0, enabled: 0, keys: [] }
      }
    };
  }
  if (enabled.length === 0) {
    return {
      status: 503,
      payload: {
        ok: false,
        provider: "fal-ai",
        code: "FAL_ALL_KEYS_DISABLED",
        error: `All ${configured} fal.ai API key(s) are currently disabled in Admin Panel.`,
        falDiagnostics: { configured, enabled: 0, keys: safeSummaries }
      }
    };
  }
  const chosenErr = options?.lastQuotaError || options?.lastClassified;
  const summaryParts = [];
  if (rateLimitedCount > 0) summaryParts.push(`${rateLimitedCount} rate limited (429)`);
  if (concurrencyLimitedCount > 0)
    summaryParts.push(`${concurrencyLimitedCount} at concurrency limit`);
  if (queueLimitedCount > 0) summaryParts.push(`${queueLimitedCount} queue saturated`);
  if (transientErrorCount > 0) summaryParts.push(`${transientErrorCount} transient/timeout errors`);
  if (invalidCount > 0) summaryParts.push(`${invalidCount} invalid auth (401/403)`);
  const status = chosenErr?.httpStatus || (rateLimitedCount + concurrencyLimitedCount + queueLimitedCount > 0 ? 429 : invalidCount === enabled.length ? 401 : 503);
  const diagnosticDetail = summaryParts.length > 0 ? `All ${enabled.length} enabled fal.ai key(s) are currently unavailable (${summaryParts.join(", ")}).${nextRetryAt ? ` Next cooldown retry at ${nextRetryAt}.` : ""}` : chosenErr?.message || `All ${enabled.length} enabled fal.ai key(s) failed or are cooling down.`;
  return {
    status,
    payload: {
      ok: false,
      provider: "fal-ai",
      code: chosenErr?.code || (rateLimitedCount === enabled.length ? "FAL_ALL_KEYS_RATE_LIMITED" : "FAL_ALL_KEYS_EXHAUSTED"),
      error: scrubSecretText(diagnosticDetail),
      nextRetryAt,
      attempts: options?.attempts || 0,
      falDiagnostics: {
        configured,
        enabled: enabled.length,
        rateLimitedCount,
        concurrencyLimitedCount,
        queueLimitedCount,
        transientErrorCount,
        invalidCount,
        nextRetryAt,
        keys: safeSummaries.map((k) => ({
          id: k.id,
          label: k.label,
          maskedKey: k.maskedKey,
          status: k.status,
          quotaScope: k.quotaScope,
          cooldownUntil: k.cooldownUntil,
          failureCount: k.failureCount,
          consecutiveFailures: k.consecutiveFailures,
          activeInFlight: activeInFlightByKey.get(k.id) || 0,
          pendingQueueJobs: pendingQueueJobsByKey.get(k.id) || 0,
          lastError: k.lastError
        }))
      }
    }
  };
}
function getCandidateFalModels(kind, requestedModel, cfg) {
  const falCfg = cfg || getFalConfig();
  const primary = kind === "image_edit" ? falCfg.primaryFalImageEditModel : kind === "video" ? falCfg.primaryFalVideoModel : kind === "image_to_video" ? falCfg.primaryFalImageToVideoModel : falCfg.primaryFalImageModel;
  const sameCap = VERIFIED_FAL_MODELS.filter((m) => m.capability === kind).map((m) => m.id);
  const all = Array.from(
    new Set(
      [
        ...requestedModel && requestedModel.startsWith("fal-ai/") ? [requestedModel] : [],
        primary,
        ...sameCap
      ].filter(Boolean)
    )
  );
  const now = Date.now();
  const modelHealthMap = new Map(
    listFalModelHealthSummaries().map((mh) => [mh.modelId, mh])
  );
  const healthy = all.filter((id) => {
    const mh = modelHealthMap.get(id);
    return !mh || mh.status === "ready" || !mh.cooldownUntil || mh.cooldownUntil <= now;
  });
  return healthy.length > 0 ? healthy : all;
}
function validateFalInputConstraints(params) {
  const prompt = (params.prompt || "").trim();
  if (!prompt) {
    return {
      ok: false,
      compatibleModels: [],
      status: 400,
      code: "FAL_EMPTY_PROMPT",
      error: "Prompt cannot be empty."
    };
  }
  if (prompt.length > MAX_FAL_PROMPT_LENGTH) {
    return {
      ok: false,
      compatibleModels: [],
      status: 400,
      code: "FAL_PROMPT_TOO_LONG",
      error: `Prompt exceeds ${MAX_FAL_PROMPT_LENGTH} characters.`
    };
  }
  const hasImage = Boolean(params.imageBase64 && params.imageBase64.trim());
  if ((params.taskKind === "image_edit" || params.taskKind === "image_to_video") && !hasImage) {
    return {
      ok: false,
      compatibleModels: [],
      status: 400,
      code: "FAL_MISSING_SOURCE_IMAGE",
      error: `Operation "${params.taskKind}" requires a source image.`
    };
  }
  let approxImageBytes = 0;
  if (hasImage) {
    const cleanMime = String(params.mimeType || "").trim().toLowerCase();
    if (!ALLOWED_FAL_IMAGE_MIMES.has(cleanMime)) {
      return {
        ok: false,
        compatibleModels: [],
        status: 400,
        code: "FAL_UNSUPPORTED_IMAGE_MIME",
        error: "Only JPEG, PNG, and WebP images are supported."
      };
    }
    const maxChars = process.env.VERCEL ? VERCEL_HARD_BASE64_LIMIT : Math.ceil(MAX_NODE_IMAGE_BYTES * 4 / 3);
    if (params.imageBase64.length > maxChars) {
      return {
        ok: false,
        compatibleModels: [],
        status: 413,
        code: "FAL_IMAGE_TOO_LARGE",
        error: "Source image exceeds maximum request payload limit."
      };
    }
    approxImageBytes = Math.round(params.imageBase64.length * 3 / 4);
  }
  const specs = new Map(VERIFIED_FAL_MODELS.map((m) => [m.id, m]));
  const compatible = params.candidateModels.filter((id) => {
    const spec = specs.get(id);
    if (!spec) return true;
    if (spec.maxInputImageMb && approxImageBytes > spec.maxInputImageMb * 1024 * 1024) {
      return false;
    }
    if (params.aspectRatio && spec.supportedAspectRatios && !spec.supportedAspectRatios.includes(params.aspectRatio)) {
      return false;
    }
    if (params.duration && spec.supportedDurations && !spec.supportedDurations.includes(params.duration)) {
      return false;
    }
    return true;
  });
  if (compatible.length === 0) {
    return {
      ok: false,
      compatibleModels: [],
      status: 400,
      code: "FAL_MODEL_CONSTRAINTS_UNMET",
      error: "Input size, aspect ratio, or duration is incompatible with enabled fal.ai models."
    };
  }
  return { ok: true, compatibleModels: compatible };
}
async function fetchFalWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`fal.ai request timed out after ${Math.round(timeoutMs / 1e3)}s`)),
    timeoutMs
  );
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
async function executeFalImageWithFallback(params) {
  const cfg = params.overrideConfig || getFalConfig();
  const keys = getEligibleFalKeysForExecution({
    overrideKeys: params.overrideKeys,
    overrideConfig: cfg
  });
  if (keys.length === 0) {
    return buildFalExhaustedDiagnostic({ overrideKeys: params.overrideKeys });
  }
  const isEdit = Boolean(params.imageBase64 && params.mimeType);
  const modelKind = isEdit ? "image_edit" : "image";
  const rawCandidateModels = getCandidateFalModels(modelKind, params.requestedModel, cfg);
  const validated = validateFalInputConstraints({
    prompt: params.prompt,
    taskKind: modelKind,
    imageBase64: params.imageBase64,
    mimeType: params.mimeType,
    aspectRatio: params.aspectRatio,
    candidateModels: rawCandidateModels
  });
  if (!validated.ok) {
    return {
      status: validated.status || 400,
      payload: { ok: false, provider: "fal-ai", code: validated.code, error: validated.error }
    };
  }
  const candidateModels = validated.compatibleModels;
  const fetchFn = params.fetchImpl || fetch;
  const maxConc = Math.max(1, cfg.maxConcurrentPerKey || 2);
  const configuredTimeoutMs = Math.max(1e4, Math.min(18e4, (cfg.requestTimeoutSec || 45) * 1e3));
  const perAttemptMs = process.env.VERCEL ? Math.min(25e3, configuredTimeoutMs) : configuredTimeoutMs;
  let lastClassified = null;
  let lastQuotaError = null;
  let attempts = 0;
  for (const keyItem of keys) {
    if (!tryAcquireFalConcurrencySlot(keyItem.id, maxConc)) {
      lastQuotaError = {
        kind: "CONCURRENCY_LIMITED",
        httpStatus: 429,
        code: "FAL_LOCAL_CONCURRENCY_LIMIT",
        message: `Key "${keyItem.label}" reached local concurrency limit (${maxConc}). Failing over to next key.`,
        quotaScope: "concurrency_limit"
      };
      continue;
    }
    try {
      for (const modelId of candidateModels) {
        let retryAttempt = 0;
        let switchToNextKey = false;
        let moveToNextModel = false;
        while (retryAttempt <= MAX_TRANSIENT_RETRIES_PER_KEY) {
          attempts += 1;
          try {
            const requestBody = {
              prompt: params.prompt.trim()
            };
            if (isEdit && params.imageBase64 && params.mimeType) {
              requestBody.image_url = `data:${params.mimeType};base64,${params.imageBase64}`;
            }
            const resp = await fetchFalWithTimeout(
              fetchFn,
              `https://fal.run/${modelId}`,
              {
                method: "POST",
                headers: {
                  Authorization: `Key ${keyItem.rawKey}`,
                  "Content-Type": "application/json",
                  Accept: "application/json"
                },
                body: JSON.stringify(requestBody)
              },
              perAttemptMs
            );
            const rawText = await resp.text();
            if (!resp.ok) {
              const classified = classifyFalError({
                status: resp.status,
                bodyText: rawText,
                retryAfterHeader: resp.headers?.get?.("retry-after"),
                modelId
              });
              lastClassified = classified;
              if (classified.kind === "BAD_REQUEST") {
                return {
                  status: 400,
                  payload: {
                    ok: false,
                    provider: "fal-ai",
                    code: classified.code,
                    error: classified.message,
                    attempts
                  }
                };
              }
              if (classified.isModelSpecificFailure || classified.kind === "MODEL_UNAVAILABLE") {
                if (!params.skipStateMutation) {
                  recordFalModelHealthResult(modelId, {
                    status: "error",
                    error: classified.message,
                    cooldownMs: FAL_MODEL_COOLDOWN_MS
                  });
                }
                moveToNextModel = true;
                break;
              }
              if (classified.retryableWithBackoff && retryAttempt < MAX_TRANSIENT_RETRIES_PER_KEY) {
                retryAttempt += 1;
                await sleepMs(computeSafeBackoffMs(retryAttempt - 1));
                continue;
              }
              if (classified.kind === "RATE_LIMITED" || classified.kind === "CONCURRENCY_LIMITED" || classified.kind === "QUEUE_SATURATED") {
                lastQuotaError = classified;
              }
              if (!params.skipStateMutation && classified.keyStatus) {
                recordFalKeyHealthResult(keyItem.id, {
                  status: classified.keyStatus,
                  error: classified.message,
                  cooldownMs: classified.cooldownMs,
                  quotaScope: classified.quotaScope,
                  incrementFailure: true
                });
              }
              switchToNextKey = true;
              break;
            }
            let json = {};
            try {
              json = JSON.parse(rawText || "{}");
            } catch {
              json = {};
            }
            const imageUrl = typeof json?.images?.[0]?.url === "string" && json.images[0].url.trim() || typeof json?.image?.url === "string" && json.image.url.trim() || "";
            const outMime = typeof json?.images?.[0]?.content_type === "string" && json.images[0].content_type || typeof json?.image?.content_type === "string" && json.image.content_type || "image/png";
            if (!imageUrl) {
              lastClassified = {
                kind: "MODEL_UNAVAILABLE",
                httpStatus: 502,
                code: "FAL_NO_IMAGE_OUTPUT",
                message: `fal.ai model ${modelId} completed without returning an image URL.`,
                isModelSpecificFailure: true
              };
              moveToNextModel = true;
              break;
            }
            if (!params.skipStateMutation) {
              recordFalKeyHealthResult(keyItem.id, { status: "ready" });
              recordFalModelHealthResult(modelId, { status: "ready" });
            }
            let outputBase64 = "";
            let resolvedMime = outMime;
            if (imageUrl.startsWith("data:")) {
              const commaIdx = imageUrl.indexOf(",");
              if (commaIdx !== -1) {
                outputBase64 = imageUrl.slice(commaIdx + 1);
              }
            } else {
              try {
                const imgResp = await fetchFalWithTimeout(fetchFn, imageUrl, { method: "GET" }, 15e3);
                if (imgResp.ok) {
                  const ab = await imgResp.arrayBuffer();
                  resolvedMime = imgResp.headers?.get?.("content-type") || outMime;
                  outputBase64 = Buffer.from(ab).toString("base64");
                }
              } catch {
              }
            }
            if (outputBase64 && outputBase64.length > VERCEL_SAFE_BASE64_THRESHOLD) {
              const cldCreds = getCloudinaryCredentials();
              if (cldCreds.configured) {
                try {
                  cloudinary.config({
                    cloud_name: cldCreds.cloudName,
                    api_key: cldCreds.apiKey,
                    api_secret: cldCreds.apiSecret,
                    secure: true
                  });
                  const uploaded = await cloudinary.uploader.upload(
                    `data:${resolvedMime};base64,${outputBase64}`,
                    { folder: "king_ai_generated", resource_type: "image", type: "upload" }
                  );
                  if (uploaded?.secure_url) {
                    return {
                      status: 200,
                      payload: {
                        ok: true,
                        provider: "fal-ai",
                        model: modelId,
                        keyIdUsed: keyItem.id,
                        attempts,
                        imageUrl: uploaded.secure_url,
                        mimeType: resolvedMime,
                        offloadedToCloudinary: true
                      }
                    };
                  }
                } catch {
                }
              }
              if (process.env.VERCEL && outputBase64.length > VERCEL_HARD_BASE64_LIMIT && imageUrl.startsWith("http")) {
                return {
                  status: 200,
                  payload: {
                    ok: true,
                    provider: "fal-ai",
                    model: modelId,
                    keyIdUsed: keyItem.id,
                    attempts,
                    imageUrl,
                    mimeType: resolvedMime
                  }
                };
              }
            }
            return {
              status: 200,
              payload: {
                ok: true,
                provider: "fal-ai",
                model: modelId,
                keyIdUsed: keyItem.id,
                attempts,
                ...outputBase64 ? { imageBase64: outputBase64 } : { imageUrl },
                mimeType: resolvedMime
              }
            };
          } catch (err) {
            const isTimeout = err?.name === "AbortError" || /timed?\s*out/i.test(String(err?.message || ""));
            const classified = classifyFalError({
              status: isTimeout ? 504 : Number(err?.status || 502),
              bodyText: err?.message || String(err || "fal.ai network failure"),
              modelId,
              isTimeout
            });
            lastClassified = classified;
            if (classified.retryableWithBackoff && retryAttempt < MAX_TRANSIENT_RETRIES_PER_KEY) {
              retryAttempt += 1;
              await sleepMs(computeSafeBackoffMs(retryAttempt - 1));
              continue;
            }
            if (!params.skipStateMutation && classified.keyStatus) {
              recordFalKeyHealthResult(keyItem.id, {
                status: classified.keyStatus,
                error: classified.message,
                cooldownMs: classified.cooldownMs,
                quotaScope: classified.quotaScope,
                incrementFailure: true
              });
            }
            switchToNextKey = true;
            break;
          }
        }
        if (switchToNextKey) break;
        if (moveToNextModel) continue;
      }
    } finally {
      releaseFalConcurrencySlot(keyItem.id);
    }
  }
  return buildFalExhaustedDiagnostic({
    overrideKeys: params.overrideKeys,
    lastClassified,
    lastQuotaError,
    attempts
  });
}
async function executeFalVideoWithFallback(params) {
  const cfg = params.overrideConfig || getFalConfig();
  const keys = getEligibleFalKeysForExecution({
    overrideKeys: params.overrideKeys,
    overrideConfig: cfg
  });
  if (keys.length === 0) {
    return buildFalExhaustedDiagnostic({ overrideKeys: params.overrideKeys });
  }
  const kind = params.task === "image_to_video" ? "image_to_video" : "video";
  const rawCandidateModels = getCandidateFalModels(kind, params.requestedModel, cfg);
  const validated = validateFalInputConstraints({
    prompt: params.prompt,
    taskKind: kind,
    imageBase64: params.imageBase64,
    mimeType: params.mimeType,
    aspectRatio: params.aspectRatio,
    duration: params.duration,
    candidateModels: rawCandidateModels
  });
  if (!validated.ok) {
    return {
      status: validated.status || 400,
      payload: { ok: false, provider: "fal-ai", code: validated.code, error: validated.error }
    };
  }
  const candidateModels = validated.compatibleModels;
  const fetchFn = params.fetchImpl || fetch;
  const maxConc = Math.max(1, cfg.maxConcurrentPerKey || 2);
  const queueWaitMs = Math.max(15e3, Math.min(24e4, (cfg.maxQueueWaitSec || 45) * 1e3));
  const runBudgetMs = process.env.VERCEL ? Math.min(45e3, queueWaitMs) : queueWaitMs;
  const deadlineMs = Date.now() + runBudgetMs;
  let lastClassified = null;
  let lastQuotaError = null;
  let attempts = 0;
  for (const keyItem of keys) {
    if (!tryAcquireFalConcurrencySlot(keyItem.id, maxConc)) {
      lastQuotaError = {
        kind: "CONCURRENCY_LIMITED",
        httpStatus: 429,
        code: "FAL_LOCAL_CONCURRENCY_LIMIT",
        message: `Key "${keyItem.label}" reached local concurrency limit (${maxConc}). Failing over to next key.`,
        quotaScope: "concurrency_limit"
      };
      continue;
    }
    try {
      for (const modelId of candidateModels) {
        let retryAttempt = 0;
        let switchToNextKey = false;
        let moveToNextModel = false;
        while (retryAttempt <= MAX_TRANSIENT_RETRIES_PER_KEY) {
          if (Date.now() >= deadlineMs - 2e3) {
            lastClassified = {
              kind: "REQUEST_TIMEOUT",
              httpStatus: 504,
              code: "FAL_VIDEO_TIMEOUT",
              message: "fal.ai video queue exceeded server time budget."
            };
            break;
          }
          attempts += 1;
          incrementPendingQueueJob(keyItem.id);
          try {
            const body = {
              prompt: params.prompt.trim(),
              ...params.aspectRatio ? { aspect_ratio: params.aspectRatio } : {},
              ...params.duration ? { duration: params.duration.replace(/s$/i, "") } : {}
            };
            if (params.task === "image_to_video" && params.imageBase64 && params.mimeType) {
              body.image_url = `data:${params.mimeType};base64,${params.imageBase64}`;
            }
            const submitResp = await fetchFalWithTimeout(
              fetchFn,
              `https://queue.fal.run/${modelId}`,
              {
                method: "POST",
                headers: {
                  Authorization: `Key ${keyItem.rawKey}`,
                  "Content-Type": "application/json",
                  Accept: "application/json"
                },
                body: JSON.stringify(body)
              },
              Math.min(2e4, Math.max(5e3, deadlineMs - Date.now()))
            );
            const submitText = await submitResp.text();
            if (!submitResp.ok) {
              const classified = classifyFalError({
                status: submitResp.status,
                bodyText: submitText,
                retryAfterHeader: submitResp.headers?.get?.("retry-after"),
                modelId
              });
              lastClassified = classified;
              if (classified.kind === "BAD_REQUEST") {
                return {
                  status: 400,
                  payload: {
                    ok: false,
                    provider: "fal-ai",
                    code: classified.code,
                    error: classified.message,
                    attempts
                  }
                };
              }
              if (classified.isModelSpecificFailure || classified.kind === "MODEL_UNAVAILABLE") {
                if (!params.skipStateMutation) {
                  recordFalModelHealthResult(modelId, {
                    status: "error",
                    error: classified.message,
                    cooldownMs: FAL_MODEL_COOLDOWN_MS
                  });
                }
                moveToNextModel = true;
                break;
              }
              if (classified.retryableWithBackoff && retryAttempt < MAX_TRANSIENT_RETRIES_PER_KEY && deadlineMs - Date.now() > 4e3) {
                retryAttempt += 1;
                await sleepMs(computeSafeBackoffMs(retryAttempt - 1));
                continue;
              }
              if (classified.kind === "RATE_LIMITED" || classified.kind === "CONCURRENCY_LIMITED" || classified.kind === "QUEUE_SATURATED") {
                lastQuotaError = classified;
              }
              if (!params.skipStateMutation && classified.keyStatus) {
                recordFalKeyHealthResult(keyItem.id, {
                  status: classified.keyStatus,
                  error: classified.message,
                  cooldownMs: classified.cooldownMs,
                  quotaScope: classified.quotaScope,
                  incrementFailure: true
                });
              }
              switchToNextKey = true;
              break;
            }
            let queueJson = {};
            try {
              queueJson = JSON.parse(submitText || "{}");
            } catch {
              queueJson = {};
            }
            const directVideoUrl = typeof queueJson?.video?.url === "string" && queueJson.video.url.trim() || typeof queueJson?.video_url === "string" && queueJson.video_url.trim() || "";
            let resolvedVideoUrl = directVideoUrl;
            let lastQueuePosition = typeof queueJson?.queue_position === "number" ? queueJson.queue_position : void 0;
            if (!resolvedVideoUrl && queueJson?.status_url && queueJson?.response_url) {
              while (Date.now() < deadlineMs - 2e3) {
                await sleepMs(1500);
                const stResp = await fetchFalWithTimeout(
                  fetchFn,
                  String(queueJson.status_url),
                  {
                    method: "GET",
                    headers: { Authorization: `Key ${keyItem.rawKey}` }
                  },
                  1e4
                );
                const stJson = await stResp.json().catch(() => ({}));
                if (typeof stJson?.queue_position === "number") {
                  lastQueuePosition = stJson.queue_position;
                }
                if (stJson?.status === "COMPLETED") {
                  const resResp = await fetchFalWithTimeout(
                    fetchFn,
                    String(queueJson.response_url),
                    {
                      method: "GET",
                      headers: { Authorization: `Key ${keyItem.rawKey}` }
                    },
                    15e3
                  );
                  const resJson = await resResp.json().catch(() => ({}));
                  resolvedVideoUrl = typeof resJson?.video?.url === "string" && resJson.video.url.trim() || typeof resJson?.video_url === "string" && resJson.video_url.trim() || "";
                  break;
                }
                if (stJson?.status === "FAILED" || stJson?.status === "CANCELLED") {
                  throw new Error(stJson?.error || `fal.ai queue job ${stJson.status}`);
                }
              }
            }
            if (!resolvedVideoUrl) {
              lastClassified = {
                kind: "REQUEST_TIMEOUT",
                httpStatus: 504,
                code: "FAL_VIDEO_TIMEOUT",
                message: `fal.ai video queue job on ${modelId} timed out before finishing${lastQueuePosition !== void 0 ? ` (last queue position: ${lastQueuePosition})` : ""}.`
              };
              moveToNextModel = true;
              break;
            }
            if (!params.skipStateMutation) {
              recordFalKeyHealthResult(keyItem.id, { status: "ready" });
              recordFalModelHealthResult(modelId, { status: "ready" });
            }
            return {
              status: 200,
              payload: {
                ok: true,
                provider: "fal-ai",
                model: modelId,
                task: params.task,
                keyIdUsed: keyItem.id,
                requestId: typeof queueJson?.request_id === "string" ? queueJson.request_id : void 0,
                attempts,
                videoUrl: resolvedVideoUrl,
                mimeType: "video/mp4"
              }
            };
          } catch (err) {
            const isTimeout = err?.name === "AbortError" || /timed?\s*out/i.test(String(err?.message || ""));
            const classified = classifyFalError({
              status: isTimeout ? 504 : Number(err?.status || 502),
              bodyText: err?.message || String(err || "fal.ai video error"),
              modelId,
              isTimeout
            });
            lastClassified = classified;
            if (classified.retryableWithBackoff && retryAttempt < MAX_TRANSIENT_RETRIES_PER_KEY && deadlineMs - Date.now() > 4e3) {
              retryAttempt += 1;
              await sleepMs(computeSafeBackoffMs(retryAttempt - 1));
              continue;
            }
            if (!params.skipStateMutation && classified.keyStatus) {
              recordFalKeyHealthResult(keyItem.id, {
                status: classified.keyStatus,
                error: classified.message,
                cooldownMs: classified.cooldownMs,
                quotaScope: classified.quotaScope,
                incrementFailure: true
              });
            }
            switchToNextKey = true;
            break;
          } finally {
            decrementPendingQueueJob(keyItem.id);
          }
        }
        if (switchToNextKey) break;
        if (moveToNextModel) continue;
      }
    } finally {
      releaseFalConcurrencySlot(keyItem.id);
    }
  }
  return buildFalExhaustedDiagnostic({
    overrideKeys: params.overrideKeys,
    lastClassified,
    lastQuotaError,
    attempts
  });
}

// server/aiBackend.ts
var cloudinary2 = import_cloudinary2.default.v2;
var ALLOWED_IMAGE_MIMES = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp"]);
var ALLOWED_VIDEO_MIMES = /* @__PURE__ */ new Set(["video/mp4", "video/webm", "video/quicktime"]);
var MAX_PROMPT_LENGTH = 2e3;
var MAX_IMAGE_BASE64_CHARS = 12 * 1024 * 1024;
var VERCEL_SAFE_BASE64_THRESHOLD2 = 34e5;
var VERCEL_HARD_BASE64_LIMIT2 = 42e5;
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
function defaultClientFactory(apiKey, apiVersion) {
  const ai = new import_genai.GoogleGenAI({
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
var PER_ATTEMPT_TIMEOUT_MS_VERCEL = 28e3;
var PER_ATTEMPT_TIMEOUT_MS_NODE = 9e4;
var TOTAL_RUN_BUDGET_MS_VERCEL = 5e4;
var TOTAL_RUN_BUDGET_MS_NODE = 15e4;
var BadJsonBodyError = class extends Error {
  constructor(message = "Invalid JSON request body.") {
    super(message);
    this.status = 400;
    this.code = "INVALID_JSON_BODY";
    this.name = "BadJsonBodyError";
  }
};
function parseRequestJsonBody(rawBody) {
  if (rawBody === void 0 || rawBody === null || rawBody === "") return {};
  if (typeof rawBody === "string") {
    const trimmed = rawBody.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new BadJsonBodyError("Request body must be a JSON object.");
      }
      return parsed;
    } catch (err) {
      if (err instanceof BadJsonBodyError) throw err;
      throw new BadJsonBodyError("Malformed JSON request body.");
    }
  }
  if (typeof rawBody === "object" && !Array.isArray(rawBody)) {
    return rawBody;
  }
  throw new BadJsonBodyError("Request body must be a JSON object.");
}
function normalizeAiEndpointResult(result, options) {
  const rawPayload = result?.payload && typeof result.payload === "object" && !Array.isArray(result.payload) ? { ...result.payload } : {
    ok: false,
    code: "INVALID_BACKEND_PAYLOAD",
    error: "AI backend produced an invalid payload structure."
  };
  if (typeof rawPayload.error === "string") {
    rawPayload.error = scrubSecretText(rawPayload.error);
  }
  if (typeof rawPayload.note === "string") {
    rawPayload.note = scrubSecretText(rawPayload.note);
  }
  let status = typeof result?.status === "number" && result.status >= 100 ? result.status : 500;
  if (rawPayload.ok !== true) {
    if (status >= 200 && status < 300) {
      status = 502;
    }
    if (!rawPayload.error) {
      rawPayload.error = "AI request failed.";
    }
    rawPayload.ok = false;
    return { status, payload: rawPayload };
  }
  if (options?.requireImage) {
    const hasImg = typeof rawPayload.imageBase64 === "string" && rawPayload.imageBase64.trim().length > 0 || typeof rawPayload.imageUrl === "string" && rawPayload.imageUrl.trim().length > 0;
    if (!hasImg) {
      return {
        status: 502,
        payload: {
          ok: false,
          code: "GEMINI_NO_IMAGE_OUTPUT",
          error: "Gemini completed without returning generated image data."
        }
      };
    }
  }
  if (options?.requireText) {
    const hasText = typeof rawPayload.text === "string" && rawPayload.text.trim().length > 0;
    if (!hasText) {
      return {
        status: 502,
        payload: {
          ok: false,
          code: "GEMINI_NO_TEXT_OUTPUT",
          error: "Gemini completed without returning generated text."
        }
      };
    }
  }
  return { status, payload: rawPayload };
}
function sendNormalizedAiJson(res, status, payload, options) {
  const normalized = normalizeAiEndpointResult({ status, payload }, options);
  if (typeof res?.setHeader === "function") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
  }
  return res.status(normalized.status).json(normalized.payload);
}
async function withExecutionTimeout(promise, timeoutMs, label) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          const timeoutErr = new Error(`${label} timed out after ${Math.round(timeoutMs / 1e3)}s.`);
          timeoutErr.status = 504;
          timeoutErr.code = "DEADLINE_EXCEEDED";
          reject(timeoutErr);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function classifyGeminiError(err, modelId) {
  const extraDetails = (() => {
    try {
      const detailCandidates = [
        err?.errorDetails,
        err?.details,
        err?.error?.details,
        err?.error?.message,
        err?.error?.status,
        err?.cause?.message
      ].filter(Boolean);
      if (detailCandidates.length > 0) {
        return scrubSecretText(JSON.stringify(detailCandidates));
      }
    } catch {
      return "";
    }
    return "";
  })();
  const rawMessage = scrubSecretText(String(err?.message || err || "AI processing failed."));
  const combined = `${rawMessage} ${extraDetails}`.trim();
  const lower = combined.toLowerCase();
  const statusCode = Number(err?.status || err?.code || err?.error?.code || err?.response?.status || 0);
  if (statusCode === 401 || statusCode === 403 || lower.includes("permission_denied") || lower.includes("api_key_invalid") || lower.includes("api key not valid") || lower.includes("invalid api key") || lower.includes("unauthenticated")) {
    return {
      kind: "INVALID_KEY",
      httpStatus: 403,
      code: "GEMINI_KEY_INVALID",
      message: "API key was rejected or lacks Gemini API permission."
    };
  }
  if (statusCode === 429 || lower.includes("resource_exhausted") || lower.includes("quota") || lower.includes("rate limit") || lower.includes("too many requests") || lower.includes("quotafailure")) {
    const retryAfterMs = extractRetryAfterMs(combined);
    const isBilling = /check your plan and billing|billing account|billing_not_active|spend limit/i.test(combined);
    const isModelSpecificQuota = !isBilling && /"limit"\s*:\s*"?0"?|\blimit:\s*0\b|"quotavalue"\s*:\s*"?0"?|free_?tier.*(?:limit["':\s]+0|not enabled|zero)|per_?model|perprojectpermodel/i.test(
      combined
    );
    const isDailyQuota = isBilling || isModelSpecificQuota || /requests_?per_?day|per_?day|\brpd\b|daily[_ ]?(?:quota|limit|requests)|generate_?content_?free_?tier_?requests.*(?:day|0)/i.test(
      combined
    );
    const quotaScope = isBilling ? "billing" : isDailyQuota ? "daily_rpd" : "rpm_throttle";
    return {
      kind: "QUOTA_EXCEEDED",
      httpStatus: 429,
      code: quotaScope === "rpm_throttle" ? "GEMINI_RPM_RATE_LIMITED" : quotaScope === "billing" ? "GEMINI_BILLING_QUOTA_EXCEEDED" : "GEMINI_DAILY_QUOTA_EXCEEDED",
      message: isModelSpecificQuota ? `Model ${modelId || "selected"} has zero/exhausted quota (limit: 0) on this tier.` : quotaScope === "rpm_throttle" ? "Gemini API per-minute rate limit (RPM) reached for this project." : quotaScope === "billing" ? "Gemini project billing or spend quota is exhausted." : "Gemini project daily quota (RPD) is exhausted.",
      quotaScope,
      retryAfterMs,
      isModelSpecificQuota
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
    projects: listProjectHealthSummaries(),
    falKeys: listSafeFalKeySummaries(),
    falConfig: getFalConfig(),
    falModels: VERIFIED_FAL_MODELS,
    falModelHealth: listFalModelHealthSummaries(),
    falRuntimeMetrics: getFalRuntimeMetrics()
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
function buildNoEligibleKeysResult(options) {
  const allKeys = options?.overrideKeys || listResolvedKeys();
  const enabledKeys = allKeys.filter((k) => k.enabled);
  if (enabledKeys.length === 0) {
    return {
      status: 503,
      payload: {
        ok: false,
        code: "AI_PROVIDER_NOT_CONFIGURED",
        error: "No active Gemini API keys are configured. Add or enable a valid API key in Admin Panel \u2192 AI Model Manager."
      }
    };
  }
  const now = Date.now();
  const projectHealth = options?.overrideProjectHealth || listProjectHealthSummaries();
  const exhaustedProjects = new Set(
    projectHealth.filter((p) => p.status === "quota_exhausted" && p.cooldownUntil && p.cooldownUntil > now).map((p) => p.projectId.toLowerCase())
  );
  const quotaBlockedKeys = enabledKeys.filter(
    (k) => k.status === "quota_exhausted" || k.cooldownUntil && k.cooldownUntil > now || k.projectCooldownUntil && k.projectCooldownUntil > now || k.projectId && exhaustedProjects.has(k.projectId.toLowerCase())
  );
  if (quotaBlockedKeys.length > 0) {
    const scopes = quotaBlockedKeys.map((k) => k.quotaScope).filter(Boolean);
    const hasDailyOrBilling = scopes.includes("daily_rpd") || scopes.includes("billing") || scopes.length === 0;
    const isBillingOnly = scopes.length > 0 && scopes.every((s) => s === "billing");
    if (!hasDailyOrBilling) {
      return {
        status: 429,
        payload: {
          ok: false,
          code: "GEMINI_RPM_RATE_LIMITED",
          error: "All configured Google Cloud Gemini projects/keys are temporarily rate-limited (RPM). Please wait a few seconds and try again."
        }
      };
    }
    return {
      status: 429,
      payload: {
        ok: false,
        code: isBillingOnly ? "GEMINI_BILLING_QUOTA_EXCEEDED" : "GEMINI_DAILY_QUOTA_EXCEEDED",
        error: "All configured Google Cloud Gemini projects/keys have exhausted their daily quota (RPD). Add an API key from another Google Cloud project in Admin Panel \u2192 AI Model Manager or try again after the daily quota reset."
      }
    };
  }
  if (enabledKeys.every((k) => k.status === "invalid")) {
    return {
      status: 403,
      payload: {
        ok: false,
        code: "GEMINI_KEY_INVALID",
        error: "All configured Gemini API keys were rejected or lack permission. Update keys in Admin Panel \u2192 AI Model Manager."
      }
    };
  }
  return {
    status: 503,
    payload: {
      ok: false,
      code: "AI_PROVIDER_NOT_CONFIGURED",
      error: "No active healthy Gemini API keys are available. Check key health in Admin Panel \u2192 AI Model Manager."
    }
  };
}
function buildExhaustedFailureResult(params) {
  const { lastClassified, lastQuotaError, attempts, defaultCode, defaultMessage } = params;
  if (lastClassified?.kind === "QUOTA_EXCEEDED") {
    const scope = lastClassified.quotaScope || "daily_rpd";
    return {
      status: 429,
      payload: {
        ok: false,
        code: lastClassified.code,
        quotaScope: scope,
        error: scope === "rpm_throttle" ? "All eligible Google Cloud Gemini projects/keys reached their per-minute rate limit (RPM). Please wait briefly and try again." : scope === "billing" ? "All eligible Google Cloud Gemini projects/keys exceeded billing/spend quota." : "All eligible Google Cloud Gemini projects/keys have exhausted their daily quota (RPD). Add a key from another Google Cloud project or try again after reset.",
        attempts
      }
    };
  }
  const effective = lastClassified || lastQuotaError;
  if (effective) {
    return {
      status: effective.httpStatus || 502,
      payload: {
        ok: false,
        code: effective.code || defaultCode,
        error: effective.message || defaultMessage,
        attempts
      }
    };
  }
  return {
    status: 502,
    payload: {
      ok: false,
      code: defaultCode,
      error: defaultMessage,
      attempts
    }
  };
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
    return buildNoEligibleKeysResult({
      overrideKeys: params.overrideKeys,
      overrideProjectHealth: params.overrideProjectHealth
    });
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
  let lastQuotaError = null;
  let attempts = 0;
  const throttledProjectsInRun = /* @__PURE__ */ new Set();
  const throttledKeyIdsInRun = /* @__PURE__ */ new Set();
  const runBudgetMs = process.env.VERCEL ? TOTAL_RUN_BUDGET_MS_VERCEL : TOTAL_RUN_BUDGET_MS_NODE;
  const perAttemptCapMs = process.env.VERCEL ? PER_ATTEMPT_TIMEOUT_MS_VERCEL : PER_ATTEMPT_TIMEOUT_MS_NODE;
  const deadlineMs = Date.now() + runBudgetMs;
  for (let kIdx = 0; kIdx < keys.length; kIdx++) {
    const remainingBudget = deadlineMs - Date.now();
    if (remainingBudget <= 1500) {
      lastClassified = {
        kind: "UPSTREAM_TRANSIENT",
        httpStatus: 504,
        code: "AI_EXECUTION_TIMEOUT",
        message: "AI processing exceeded the server time budget before completing. Please try again."
      };
      break;
    }
    const keyItem = keys[kIdx];
    const normalizedProject = keyItem.projectId ? keyItem.projectId.toLowerCase() : "";
    if (throttledKeyIdsInRun.has(keyItem.id)) {
      continue;
    }
    if (normalizedProject && throttledProjectsInRun.has(normalizedProject)) {
      continue;
    }
    for (const modelId of models) {
      const attemptRemaining = deadlineMs - Date.now();
      if (attemptRemaining <= 1500) {
        lastClassified = {
          kind: "UPSTREAM_TRANSIENT",
          httpStatus: 504,
          code: "AI_EXECUTION_TIMEOUT",
          message: "AI processing exceeded the server time budget before completing. Please try again."
        };
        break;
      }
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
        const response = await withExecutionTimeout(
          client.generateContent({
            model: modelId,
            contents: { parts }
          }),
          Math.min(perAttemptCapMs, attemptRemaining - 500),
          `Gemini model ${modelId}`
        );
        const resParts = response?.candidates?.[0]?.content?.parts ?? [];
        let outputBase64 = "";
        let outputMime = "image/png";
        let modelNote = "";
        for (const part of resParts) {
          if (part?.inlineData?.data && !outputBase64) {
            outputBase64 = String(part.inlineData.data).trim();
            outputMime = part.inlineData.mimeType || "image/png";
          } else if (typeof part?.text === "string" && part.text.trim()) {
            modelNote = modelNote ? `${modelNote} ${part.text.trim()}` : part.text.trim();
          }
        }
        if (outputBase64) {
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, { status: "ready", projectId: keyItem.projectId });
          }
          if (outputBase64.length > VERCEL_SAFE_BASE64_THRESHOLD2) {
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
                console.warn("[aiBackend] Large AI image Cloudinary offload notice:", scrubSecretText(cldErr?.message || cldErr));
              }
            }
            if (process.env.VERCEL && outputBase64.length > VERCEL_HARD_BASE64_LIMIT2) {
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
          throttledKeyIdsInRun.add(keyItem.id);
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, {
              status: "invalid",
              error: classified.message,
              projectId: keyItem.projectId
            });
          }
          break;
        }
        if (classified.kind === "QUOTA_EXCEEDED") {
          lastQuotaError = classified;
          if (classified.isModelSpecificQuota) {
            continue;
          }
          const { keyCooldownMs, projectCooldownMs, quotaScope } = resolveCooldownForQuotaError(classified);
          throttledKeyIdsInRun.add(keyItem.id);
          if (normalizedProject) {
            throttledProjectsInRun.add(normalizedProject);
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
  return buildExhaustedFailureResult({
    lastClassified,
    lastQuotaError,
    attempts,
    defaultCode: "GEMINI_EDIT_FAILED",
    defaultMessage: "All active Gemini keys or image models failed or exceeded quota."
  });
}
async function executeTextAiWithFallback(params) {
  const keys = getEligibleKeysForExecution({
    overrideKeys: params.overrideKeys,
    overrideConfig: params.overrideConfig,
    overrideProjectHealth: params.overrideProjectHealth
  });
  if (keys.length === 0) {
    return buildNoEligibleKeysResult({
      overrideKeys: params.overrideKeys,
      overrideProjectHealth: params.overrideProjectHealth
    });
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
  let lastQuotaError = null;
  let attempts = 0;
  const throttledProjectsInRun = /* @__PURE__ */ new Set();
  const throttledKeyIdsInRun = /* @__PURE__ */ new Set();
  const runBudgetMs = process.env.VERCEL ? TOTAL_RUN_BUDGET_MS_VERCEL : TOTAL_RUN_BUDGET_MS_NODE;
  const perAttemptCapMs = process.env.VERCEL ? PER_ATTEMPT_TIMEOUT_MS_VERCEL : PER_ATTEMPT_TIMEOUT_MS_NODE;
  const deadlineMs = Date.now() + runBudgetMs;
  for (let kIdx = 0; kIdx < keys.length; kIdx++) {
    const remainingBudget = deadlineMs - Date.now();
    if (remainingBudget <= 1500) {
      lastClassified = {
        kind: "UPSTREAM_TRANSIENT",
        httpStatus: 504,
        code: "AI_EXECUTION_TIMEOUT",
        message: "Text generation exceeded the server time budget before completing."
      };
      break;
    }
    const keyItem = keys[kIdx];
    const normalizedProject = keyItem.projectId ? keyItem.projectId.toLowerCase() : "";
    if (throttledKeyIdsInRun.has(keyItem.id)) {
      continue;
    }
    if (normalizedProject && throttledProjectsInRun.has(normalizedProject)) {
      continue;
    }
    for (const modelId of models) {
      const attemptRemaining = deadlineMs - Date.now();
      if (attemptRemaining <= 1500) {
        lastClassified = {
          kind: "UPSTREAM_TRANSIENT",
          httpStatus: 504,
          code: "AI_EXECUTION_TIMEOUT",
          message: "Text generation exceeded the server time budget before completing."
        };
        break;
      }
      const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === modelId);
      if (!spec || spec.capability !== "text") continue;
      const client = factory(keyItem.rawKey, spec?.apiVersion);
      attempts++;
      try {
        const response = await withExecutionTimeout(
          client.generateContent({
            model: modelId,
            contents: params.prompt.trim(),
            ...params.systemInstruction ? { config: { systemInstruction: params.systemInstruction.trim() } } : {}
          }),
          Math.min(perAttemptCapMs, attemptRemaining - 500),
          `Gemini model ${modelId}`
        );
        const textOut = typeof response?.text === "string" ? response.text.trim() : "";
        if (textOut) {
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, { status: "ready", projectId: keyItem.projectId });
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
        lastClassified = {
          kind: "MODEL_UNAVAILABLE",
          httpStatus: 502,
          code: "GEMINI_NO_TEXT_OUTPUT",
          message: `Model ${modelId} returned an empty text response.`
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
          throttledKeyIdsInRun.add(keyItem.id);
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, {
              status: "invalid",
              error: classified.message,
              projectId: keyItem.projectId
            });
          }
          break;
        }
        if (classified.kind === "QUOTA_EXCEEDED") {
          lastQuotaError = classified;
          if (classified.isModelSpecificQuota) {
            continue;
          }
          const { keyCooldownMs, projectCooldownMs, quotaScope } = resolveCooldownForQuotaError(classified);
          throttledKeyIdsInRun.add(keyItem.id);
          if (normalizedProject) {
            throttledProjectsInRun.add(normalizedProject);
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
  return buildExhaustedFailureResult({
    lastClassified,
    lastQuotaError,
    attempts,
    defaultCode: "GEMINI_TEXT_FAILED",
    defaultMessage: "Text generation failed across eligible Gemini keys."
  });
}
async function executeVideoAiWithFallback(params) {
  const keys = getEligibleKeysForExecution({
    overrideKeys: params.overrideKeys,
    overrideConfig: params.overrideConfig,
    overrideProjectHealth: params.overrideProjectHealth
  });
  if (keys.length === 0) {
    return buildNoEligibleKeysResult({
      overrideKeys: params.overrideKeys,
      overrideProjectHealth: params.overrideProjectHealth
    });
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
  let lastQuotaError = null;
  let attempts = 0;
  const throttledProjectsInRun = /* @__PURE__ */ new Set();
  const throttledKeyIdsInRun = /* @__PURE__ */ new Set();
  for (let kIdx = 0; kIdx < keys.length; kIdx++) {
    const keyItem = keys[kIdx];
    const normalizedProject = keyItem.projectId ? keyItem.projectId.toLowerCase() : "";
    if (throttledKeyIdsInRun.has(keyItem.id)) {
      continue;
    }
    if (normalizedProject && throttledProjectsInRun.has(normalizedProject)) {
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
          if (outBase64 && outBase64.length > VERCEL_SAFE_BASE64_THRESHOLD2) {
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
            if (process.env.VERCEL && outBase64.length > VERCEL_HARD_BASE64_LIMIT2) {
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
          throttledKeyIdsInRun.add(keyItem.id);
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, {
              status: "invalid",
              error: classified.message,
              projectId: keyItem.projectId
            });
          }
          break;
        }
        if (classified.kind === "QUOTA_EXCEEDED") {
          lastQuotaError = classified;
          if (classified.isModelSpecificQuota) {
            continue;
          }
          const { keyCooldownMs, projectCooldownMs, quotaScope } = resolveCooldownForQuotaError(classified);
          const normalizedProject2 = keyItem.projectId ? keyItem.projectId.toLowerCase() : "";
          throttledKeyIdsInRun.add(keyItem.id);
          if (normalizedProject2) {
            throttledProjectsInRun.add(normalizedProject2);
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
  return buildExhaustedFailureResult({
    lastClassified,
    lastQuotaError,
    attempts,
    defaultCode: "GEMINI_VIDEO_FAILED",
    defaultMessage: "Video AI execution failed across configured Gemini Omni models and eligible keys."
  });
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
    const falCfg = getFalConfig();
    const wantsFalExplicit = Boolean(params.requestedModel && params.requestedModel.startsWith("fal-ai/"));
    let res2;
    if (wantsFalExplicit) {
      res2 = await executeFalImageWithFallback({
        prompt: params.prompt,
        imageBase64: params.imageBase64,
        mimeType: params.mimeType,
        requestedModel: params.requestedModel,
        overrideConfig: falCfg,
        skipStateMutation: params.skipStateMutation
      });
    } else {
      res2 = await executeImageAiWithFallback({
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
      const canFallbackToFal = res2.status !== 200 && res2.status !== 400 && res2.status !== 413 && falCfg.enableFalImageFallback && !params.overrideKeys && listResolvedFalKeys().some((k) => k.enabled);
      if (canFallbackToFal) {
        const falRes = await executeFalImageWithFallback({
          prompt: params.prompt,
          imageBase64: params.imageBase64,
          mimeType: params.mimeType,
          overrideConfig: falCfg,
          skipStateMutation: params.skipStateMutation
        });
        if (falRes.status === 200) {
          res2 = {
            ...falRes,
            payload: { ...falRes.payload, fallbackFrom: "google-gemini" }
          };
        } else if (falRes.payload?.falDiagnostics) {
          res2 = {
            ...res2,
            payload: {
              ...res2.payload,
              falDiagnostics: falRes.payload.falDiagnostics,
              error: `${res2.payload.error || "Gemini failed."} fal.ai fallback also failed: ${falRes.payload.error || "Exhausted."}`
            }
          };
        }
      }
    }
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
    const falCfg = getFalConfig();
    const hasEnabledFal = !params.overrideKeys && listResolvedFalKeys().some((k) => k.enabled);
    const wantsFalExplicit = Boolean(params.requestedModel && params.requestedModel.startsWith("fal-ai/"));
    const supportsFalVideoTask = videoTask === "video_generation" || videoTask === "image_to_video";
    let res2;
    if (supportsFalVideoTask && (wantsFalExplicit || falCfg.preferFalForVideo && hasEnabledFal)) {
      res2 = await executeFalVideoWithFallback({
        task: videoTask,
        prompt: params.prompt,
        imageBase64: params.imageBase64,
        mimeType: params.mimeType,
        aspectRatio: params.aspectRatio,
        duration: params.duration,
        requestedModel: params.requestedModel,
        overrideConfig: falCfg,
        skipStateMutation: params.skipStateMutation
      });
      if (res2.status !== 200 && res2.status !== 400 && !wantsFalExplicit && listResolvedKeys().some((k) => k.enabled)) {
        const gemRes = await executeVideoAiWithFallback({
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
        if (gemRes.status === 200) {
          res2 = { ...gemRes, payload: { ...gemRes.payload, fallbackFrom: "fal-ai" } };
        }
      }
    } else {
      res2 = await executeVideoAiWithFallback({
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
      if (res2.status !== 200 && res2.status !== 400 && supportsFalVideoTask && falCfg.enableFalVideoFallback && hasEnabledFal) {
        const falRes = await executeFalVideoWithFallback({
          task: videoTask,
          prompt: params.prompt,
          imageBase64: params.imageBase64,
          mimeType: params.mimeType,
          aspectRatio: params.aspectRatio,
          duration: params.duration,
          overrideConfig: falCfg,
          skipStateMutation: params.skipStateMutation
        });
        if (falRes.status === 200) {
          res2 = { ...falRes, payload: { ...falRes.payload, fallbackFrom: "google-gemini" } };
        } else if (falRes.payload?.falDiagnostics) {
          res2 = {
            ...res2,
            payload: {
              ...res2.payload,
              falDiagnostics: falRes.payload.falDiagnostics,
              error: `${res2.payload.error || "Gemini Video AI failed."} fal.ai fallback also failed: ${falRes.payload.error || "Exhausted."}`
            }
          };
        }
      }
    }
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
  const effectiveMaxChars = process.env.VERCEL ? VERCEL_HARD_BASE64_LIMIT2 : MAX_IMAGE_BASE64_CHARS;
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
    const rawResult = await executeAutoRoutedAiTask({
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
    const domain = rawResult?.payload?.routing?.domain;
    return normalizeAiEndpointResult(rawResult, {
      requireImage: domain === "image",
      requireText: domain === "text"
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
  const effectiveMaxImageChars = process.env.VERCEL ? VERCEL_HARD_BASE64_LIMIT2 : MAX_IMAGE_BASE64_CHARS;
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
  const requestedProvider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : void 0;
  const qualityHint = body.qualityHint === "lite" || body.qualityHint === "standard" || body.qualityHint === "pro" ? body.qualityHint : void 0;
  await syncVaultFromRemote();
  try {
    const falCfg = getFalConfig();
    const wantsFal = requestedProvider === "fal-ai" || Boolean(requestedModel && requestedModel.startsWith("fal-ai/"));
    let rawResult;
    if (wantsFal) {
      rawResult = await executeFalImageWithFallback({
        prompt: rawPrompt,
        imageBase64: imageBase64 || void 0,
        mimeType: mimeType || void 0,
        requestedModel,
        overrideConfig: falCfg
      });
    } else {
      rawResult = await executeImageAiWithFallback({
        prompt: rawPrompt,
        presetAction: typeof body.presetAction === "string" ? body.presetAction : void 0,
        imageBase64: imageBase64 || void 0,
        mimeType: mimeType || void 0,
        requestedModel,
        qualityHint
      });
      const canFallbackToFal = rawResult.status !== 200 && rawResult.status !== 400 && rawResult.status !== 413 && falCfg.enableFalImageFallback && listResolvedFalKeys().some((k) => k.enabled);
      if (canFallbackToFal) {
        const falRes = await executeFalImageWithFallback({
          prompt: rawPrompt,
          imageBase64: imageBase64 || void 0,
          mimeType: mimeType || void 0,
          overrideConfig: falCfg
        });
        if (falRes.status === 200) {
          rawResult = {
            ...falRes,
            payload: { ...falRes.payload, fallbackFrom: "google-gemini" }
          };
        } else if (falRes.payload?.falDiagnostics) {
          rawResult = {
            ...rawResult,
            payload: {
              ...rawResult.payload,
              falDiagnostics: falRes.payload.falDiagnostics,
              error: `${rawResult.payload.error || "Gemini failed."} fal.ai fallback also failed: ${falRes.payload.error || "Exhausted."}`
            }
          };
        }
      }
    }
    return normalizeAiEndpointResult(rawResult, { requireImage: true });
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
    const rawResult = await executeTextAiWithFallback({
      prompt,
      systemInstruction,
      requestedModel
    });
    return normalizeAiEndpointResult(rawResult, { requireText: true });
  } finally {
    await flushRemoteVaultWrites();
  }
}
async function handleAdminUpdateModels(patch) {
  await syncVaultFromRemote(true);
  const modelConfig = updateModelConfig(patch);
  await flushRemoteVaultWrites({ throwOnError: true });
  return { ok: true, modelConfig, state: getAdminAiState() };
}
async function handleAdminAddKey(params) {
  await syncVaultFromRemote(true);
  const key = addVaultApiKey(params);
  await flushRemoteVaultWrites({ throwOnError: true });
  return { ok: true, key, state: getAdminAiState() };
}
async function handleAdminUpdateKey(keyId, patch) {
  await syncVaultFromRemote(true);
  const key = updateVaultApiKey(keyId, patch);
  await flushRemoteVaultWrites({ throwOnError: true });
  return key ? { ok: true, key, state: getAdminAiState() } : null;
}
async function handleAdminDeleteKey(keyId) {
  await syncVaultFromRemote(true);
  const deleted = deleteVaultApiKey(keyId);
  await flushRemoteVaultWrites({ throwOnError: true });
  return deleted ? { ok: true, state: getAdminAiState() } : null;
}
async function handleAdminAddFalKey(params) {
  await syncVaultFromRemote(true);
  const key = addFalVaultApiKey(params);
  await flushRemoteVaultWrites({ throwOnError: true });
  return { ok: true, key, state: getAdminAiState() };
}
async function handleAdminUpdateFalKey(keyId, patch) {
  await syncVaultFromRemote(true);
  const key = updateFalVaultApiKey(keyId, patch);
  await flushRemoteVaultWrites({ throwOnError: true });
  return key ? { ok: true, key, state: getAdminAiState() } : null;
}
async function handleAdminDeleteFalKey(keyId) {
  await syncVaultFromRemote(true);
  const deleted = deleteFalVaultApiKey(keyId);
  await flushRemoteVaultWrites({ throwOnError: true });
  return deleted ? { ok: true, state: getAdminAiState() } : null;
}
async function handleAdminUpdateFalConfig(patch) {
  await syncVaultFromRemote(true);
  const falConfig = updateFalConfig(patch);
  await flushRemoteVaultWrites({ throwOnError: true });
  return { ok: true, falConfig, state: getAdminAiState() };
}
async function testSpecificFalKeyLive2(keyId) {
  const result = await testSpecificFalKeyLive(keyId);
  await flushRemoteVaultWrites();
  return result;
}
async function testSpecificKeyLive(keyId) {
  await syncVaultFromRemote(true);
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
    const quotaCooldown = classified.kind === "QUOTA_EXCEEDED" && !classified.isModelSpecificQuota ? resolveCooldownForQuotaError(classified) : null;
    recordKeyHealthResult(keyItem.id, {
      status: classified.isModelSpecificQuota ? "ready" : statusMap[classified.kind],
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
  await syncVaultFromRemote(true);
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
      const betaAi = new import_genai.GoogleGenAI({
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
  await syncVaultFromRemote(true);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BadJsonBodyError,
  SUPER_ADMIN_EMAIL,
  classifyAiTaskIntent,
  fetchLiveModelsFromGoogleApi,
  getAdminAiStateAsync,
  getEligibleModelsForDomain,
  getPublicAiCapabilityStatus,
  getPublicAiCapabilityStatusAsync,
  handleAdminAddFalKey,
  handleAdminAddKey,
  handleAdminDeleteFalKey,
  handleAdminDeleteKey,
  handleAdminUpdateFalConfig,
  handleAdminUpdateFalKey,
  handleAdminUpdateKey,
  handleAdminUpdateModels,
  handleAutoRoutedAiRequest,
  handlePostAiPhotoEdit,
  handlePostAiTextGenerate,
  isVerifiedSuperAdmin,
  normalizeAiEndpointResult,
  parseRequestJsonBody,
  scrubSecretText,
  selectAutoImageModelOrder,
  sendNormalizedAiJson,
  testSpecificFalKeyLive,
  testSpecificKeyLive,
  testSpecificModelLive,
  verifyFirebaseBearerToken
});
