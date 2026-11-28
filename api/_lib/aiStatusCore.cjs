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

// server/aiStatus.ts
var aiStatus_exports = {};
__export(aiStatus_exports, {
  getBackendHost: () => getBackendHost,
  getPublicAiCapabilityStatus: () => getPublicAiCapabilityStatus,
  getPublicAiCapabilityStatusAsync: () => getPublicAiCapabilityStatusAsync,
  scrubSecretText: () => scrubSecretText
});
module.exports = __toCommonJS(aiStatus_exports);

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
function getModelConfig() {
  return readVaultData().modelConfig;
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getBackendHost,
  getPublicAiCapabilityStatus,
  getPublicAiCapabilityStatusAsync,
  scrubSecretText
});
