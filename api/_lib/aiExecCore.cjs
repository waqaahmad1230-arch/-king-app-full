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
  handleAdminAddKey: () => handleAdminAddKey,
  handleAdminDeleteKey: () => handleAdminDeleteKey,
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
  inMemoryFallbackVault = data;
  const upstash = getUpstashConfig();
  const hasEnvSecret = Boolean((process.env.AI_VAULT_SECRET || process.env.SESSION_SECRET || "").trim());
  if (upstash.configured && options?.strictRemoteSecret && !hasEnvSecret) {
    throw new Error("AI_VAULT_SECRET environment variable is required to encrypt keys into Upstash Redis.");
  }
  const payload = encryptVaultWrapper(data);
  const serialized = JSON.stringify(payload);
  try {
    import_node_fs.default.mkdirSync(VAULT_BASE_DIR, { recursive: true });
    import_node_fs.default.writeFileSync(VAULT_FILE_PATH, serialized, { mode: 384 });
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
  writeVaultData(vault);
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

// api/_lib/authBackend.ts
var import_app = require("firebase-admin/app");
var import_auth = require("firebase-admin/auth");
var FIREBASE_PROJECT_ID = "king-5f52e";
var SUPER_ADMIN_EMAIL = "waqaahmad1230@gmail.com";
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

// api/_lib/statusBackend.ts
var import_cloudinary = __toESM(require("cloudinary"), 1);
var import_firestore = require("firebase-admin/firestore");
var cloudinary = import_cloudinary.default.v2;
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

// server/aiBackend.ts
var cloudinary2 = import_cloudinary2.default.v2;
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
    const isDailyQuota = isBilling || /requests_?per_?day|per_?day|\brpd\b|daily[_ ]?(?:quota|limit|requests)|generate_?content_?free_?tier_?requests.*(?:day|0)|free_?tier.*(?:per_?day|limit["':\s]+0)|"limit"\s*:\s*"?0"?|\blimit:\s*0\b/i.test(
      combined
    );
    const quotaScope = isBilling ? "billing" : isDailyQuota ? "daily_rpd" : "rpm_throttle";
    return {
      kind: "QUOTA_EXCEEDED",
      httpStatus: 429,
      code: quotaScope === "rpm_throttle" ? "GEMINI_RPM_RATE_LIMITED" : quotaScope === "billing" ? "GEMINI_BILLING_QUOTA_EXCEEDED" : "GEMINI_DAILY_QUOTA_EXCEEDED",
      message: quotaScope === "rpm_throttle" ? "Gemini API per-minute rate limit (RPM) reached for this project." : quotaScope === "billing" ? "Gemini project billing or spend quota is exhausted." : "Gemini project daily quota (RPD) is exhausted.",
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
                console.warn("[aiBackend] Large AI image Cloudinary offload notice:", scrubSecretText(cldErr?.message || cldErr));
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
    const rawResult = await executeImageAiWithFallback({
      prompt: rawPrompt,
      presetAction: typeof body.presetAction === "string" ? body.presetAction : void 0,
      imageBase64: imageBase64 || void 0,
      mimeType: mimeType || void 0,
      requestedModel,
      qualityHint
    });
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
  handleAdminAddKey,
  handleAdminDeleteKey,
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
  testSpecificKeyLive,
  testSpecificModelLive,
  verifyFirebaseBearerToken
});
