import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type GeminiModelCapability = 'image' | 'text' | 'omni';
export type ImageQualityTier = 'lite' | 'standard' | 'pro';
export type ImageSelectionPolicy = 'balanced' | 'economy_first' | 'quality_first' | 'manual_primary';

export interface VerifiedGeminiModelSpec {
  id: string;
  displayName: string;
  aliasLabel: string;
  capability: GeminiModelCapability;
  qualityTier?: ImageQualityTier;
  supportsVideoGeneration?: boolean;
  supportsImageToVideo?: boolean;
  supportsVideoEditing?: boolean;
  description: string;
  paidKeyRequired: boolean;
  defaultEnabled: boolean;
  priority: number;
  apiVersion?: 'v1' | 'v1beta';
}

/**
 * KING APP Phase 1 Verified Model & Routing Architecture:
 *
 * 1. PHOTO GENERATION & EDITING AI (Nano Banana family ONLY):
 *    - Nano Banana 2 Lite: gemini-3.1-flash-lite-image (safest default primary; fast & economical)
 *    - Nano Banana 2.1:    gemini-nano-banana-2.1 (high-res 1K-4K & Search)
 *    - Nano Banana Pro:    gemini-3-pro-image (premium 1K-4K studio & typography)
 *    - Nano Banana 2:      gemini-3.1-flash-image (disabled/optional pending live models API verification)
 *    - Nano Banana (2.5):  gemini-2.5-flash-image (legacy fallback if enabled)
 *
 * 2. AI ASSISTANT (Text, Chat, Q&A, Reasoning, Voice Text Requests):
 *    - Preferred:          gemini-3.1-pro-preview (Gemini 3.1 Pro, v1beta)
 *    - Compatible Fallbacks: gemini-3.8-flash, gemini-3.5-flash, gemini-3.1-flash-lite
 *
 * 3. VIDEO AI (Omni EXCLUSIVE — NEVER used for photo generation/editing):
 *    - Primary:            gemini-omni-1.2-flash (v1beta Interactions API video generation/i2v/edit)
 *    - Legacy Compatible:  gemini-omni-1.1-flash (disabled by default unless verified/enabled)
 */
export const VERIFIED_GEMINI_MODELS: VerifiedGeminiModelSpec[] = [
  {
    id: 'gemini-3.1-flash-lite-image',
    displayName: 'Nano Banana 2 Lite',
    aliasLabel: 'Nano Banana 2 Lite (Default Primary · Fast & Economical)',
    capability: 'image',
    qualityTier: 'lite',
    description: 'Safest verified general text-to-image generation & quick photo editing (1:1, 3:4, 4:3, 9:16, 16:9).',
    paidKeyRequired: true,
    defaultEnabled: true,
    priority: 1,
  },
  {
    id: 'gemini-nano-banana-2.1',
    displayName: 'Nano Banana 2.1',
    aliasLabel: 'Nano Banana 2.1 (1K–4K & Search)',
    capability: 'image',
    qualityTier: 'standard',
    description: 'High-resolution 1K–4K image generation, extended ratios & Search grounding.',
    paidKeyRequired: true,
    defaultEnabled: true,
    priority: 2,
  },
  {
    id: 'gemini-3-pro-image',
    displayName: 'Nano Banana Pro',
    aliasLabel: 'Nano Banana Pro (Premium 1K–4K Studio)',
    capability: 'image',
    qualityTier: 'pro',
    description: 'Premium studio photography, accurate text rendering & multi-reference edits.',
    paidKeyRequired: true,
    defaultEnabled: true,
    priority: 3,
  },
  {
    id: 'gemini-3.1-flash-image',
    displayName: 'Nano Banana 2',
    aliasLabel: 'Nano Banana 2 (Optional · Unverified Pending Live Check)',
    capability: 'image',
    qualityTier: 'standard',
    description: 'Optional unverified alias; disabled by default until confirmed active via live Google models API.',
    paidKeyRequired: true,
    defaultEnabled: false,
    priority: 4,
  },
  {
    id: 'gemini-2.5-flash-image',
    displayName: 'Nano Banana (2.5)',
    aliasLabel: 'Nano Banana Classic (2.5 Flash Image)',
    capability: 'image',
    qualityTier: 'lite',
    description: 'Classic Gemini 2.5 Flash native image generation & editing fallback.',
    paidKeyRequired: true,
    defaultEnabled: false,
    priority: 5,
  },
  {
    id: 'gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro',
    aliasLabel: 'Gemini 3.1 Pro (Preferred AI Assistant)',
    capability: 'text',
    description: 'Preferred model for AI chat, Q&A, reasoning, text generation & voice-transcribed text requests (v1beta).',
    paidKeyRequired: true,
    defaultEnabled: true,
    priority: 1,
    apiVersion: 'v1beta',
  },
  {
    id: 'gemini-3.8-flash',
    displayName: 'Gemini 3.8 Flash',
    aliasLabel: 'Gemini 3.8 Flash (Assistant Fallback)',
    capability: 'text',
    description: 'Balanced high-speed multimodal & general assistant fallback.',
    paidKeyRequired: false,
    defaultEnabled: true,
    priority: 2,
  },
  {
    id: 'gemini-3.5-flash',
    displayName: 'Gemini 3.5 Flash',
    aliasLabel: 'Gemini 3.5 Flash (Assistant Fallback)',
    capability: 'text',
    description: 'Reliable Flash-class text generation fallback.',
    paidKeyRequired: false,
    defaultEnabled: true,
    priority: 3,
  },
  {
    id: 'gemini-3.1-flash-lite',
    displayName: 'Gemini 3.1 Flash Lite',
    aliasLabel: 'Flash Lite (Fast Text & Diagnostics)',
    capability: 'text',
    description: 'Ultra-fast text generation fallback & live API key diagnostics.',
    paidKeyRequired: false,
    defaultEnabled: true,
    priority: 4,
  },
  {
    id: 'gemini-omni-1.2-flash',
    displayName: 'Gemini Omni 1.2 Flash',
    aliasLabel: 'Gemini Omni 1.2 Flash (Video AI Only)',
    capability: 'omni',
    supportsVideoGeneration: true,
    supportsImageToVideo: true,
    supportsVideoEditing: true,
    description: 'Exclusive Video AI for text-to-video, image-to-video & video editing via v1beta Interactions API. Never used for photos.',
    paidKeyRequired: true,
    defaultEnabled: true,
    priority: 1,
    apiVersion: 'v1beta',
  },
  {
    id: 'gemini-omni-1.1-flash',
    displayName: 'Gemini Omni 1.1 Flash',
    aliasLabel: 'Gemini Omni 1.1 Flash (Legacy Video Fallback)',
    capability: 'omni',
    supportsVideoGeneration: true,
    supportsImageToVideo: true,
    supportsVideoEditing: true,
    description: 'Optional legacy Omni Video fallback if enabled and verified on project key (v1beta).',
    paidKeyRequired: true,
    defaultEnabled: false,
    priority: 2,
    apiVersion: 'v1beta',
  },
];

export type KeyHealthStatus = 'ready' | 'disabled' | 'quota_exhausted' | 'invalid' | 'error';
export type QuotaScope = 'rpm_throttle' | 'daily_rpd' | 'billing';

export interface ProjectHealthRecord {
  projectId: string;
  status: 'ready' | 'quota_exhausted' | 'error';
  quotaScope?: QuotaScope;
  cooldownUntil?: number;
  lastError?: string;
  updatedAt: string;
}

export interface StoredVaultKeyRecord {
  id: string;
  label: string;
  projectId?: string;
  encryptedKey: string;
  enabled: boolean;
  priority: number;
  status: KeyHealthStatus;
  quotaScope?: QuotaScope;
  lastError?: string;
  lastTestedAt?: string;
  cooldownUntil?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EnvKeyOverrideRecord {
  enabled: boolean;
  priority: number;
  projectId?: string;
  status: KeyHealthStatus;
  quotaScope?: QuotaScope;
  lastError?: string;
  lastTestedAt?: string;
  cooldownUntil?: number;
}

export interface AiModelConfigState {
  configVersion?: number;
  enabledModels: Record<string, boolean>;
  primaryImageModel: string;
  primaryTextModel: string;
  primaryVideoModel: string;
  imageSelectionPolicy: ImageSelectionPolicy;
  enableAutoRouting: boolean;
  enableKeyFallback: boolean;
  enableModelFallback: boolean;
}

interface EncryptedVaultFilePayload {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

interface PlainVaultData {
  keys: StoredVaultKeyRecord[];
  envOverrides: Record<string, EnvKeyOverrideRecord>;
  projectHealth: Record<string, ProjectHealthRecord>;
  modelConfig: AiModelConfigState;
}

export interface SafeKeySummary {
  id: string;
  label: string;
  projectId?: string;
  maskedKey: string;
  source: 'admin_vault' | 'runtime_env';
  envVarName?: string;
  enabled: boolean;
  priority: number;
  status: KeyHealthStatus;
  quotaScope?: QuotaScope;
  projectCooldownUntil?: number;
  lastError?: string;
  lastTestedAt?: string;
  cooldownUntil?: number;
}

export interface ResolvedExecutableKey {
  id: string;
  label: string;
  projectId?: string;
  rawKey: string;
  source: 'admin_vault' | 'runtime_env';
  enabled: boolean;
  priority: number;
  status: KeyHealthStatus;
  quotaScope?: QuotaScope;
  cooldownUntil?: number;
  projectCooldownUntil?: number;
}

const VAULT_BASE_DIR = path.resolve(process.env.AI_VAULT_DIR?.trim() || process.cwd());
const VAULT_FILE_PATH = path.join(VAULT_BASE_DIR, '.king-ai-vault.enc.json');
const VAULT_KEY_PATH = path.join(VAULT_BASE_DIR, '.king-ai-vault.key');

const CURRENT_MODEL_CONFIG_VERSION = 3;

const DEFAULT_MODEL_CONFIG: AiModelConfigState = {
  configVersion: CURRENT_MODEL_CONFIG_VERSION,
  enabledModels: Object.fromEntries(
    VERIFIED_GEMINI_MODELS.map((m) => [m.id, m.defaultEnabled])
  ),
  primaryImageModel: 'gemini-3.1-flash-lite-image',
  primaryTextModel: 'gemini-3.1-pro-preview',
  primaryVideoModel: 'gemini-omni-1.2-flash',
  imageSelectionPolicy: 'balanced',
  enableAutoRouting: true,
  enableKeyFallback: true,
  enableModelFallback: true,
};

const UPSTASH_VAULT_REDIS_KEY = 'king:ai_vault:v1';
const REMOTE_SYNC_TTL_MS = 8_000;

export interface VaultPersistenceInfo {
  storageScope: 'upstash_redis_encrypted' | 'persistent_volume' | 'ephemeral_container_disk';
  vaultPath: string;
  encryptionKeyPersistent: boolean;
  multiInstanceSafe: boolean;
  warning?: string;
}

function getUpstashConfig(): { url: string; token: string; configured: boolean } {
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  return {
    url,
    token,
    configured: Boolean(url && token),
  };
}

export function getVaultPersistenceInfo(): VaultPersistenceInfo {
  const hasEnvSecret = Boolean((process.env.AI_VAULT_SECRET || process.env.SESSION_SECRET || '').trim());
  const hasCustomVolume = Boolean(process.env.AI_VAULT_DIR?.trim());
  const upstash = getUpstashConfig();
  const isVercel = Boolean(process.env.VERCEL);

  if (upstash.configured) {
    return {
      storageScope: 'upstash_redis_encrypted',
      vaultPath: `upstash-redis://${UPSTASH_VAULT_REDIS_KEY}`,
      encryptionKeyPersistent: hasEnvSecret,
      multiInstanceSafe: hasEnvSecret,
      warning: hasEnvSecret
        ? undefined
        : 'Set AI_VAULT_SECRET env var so Upstash AES-256-GCM encrypted keys remain decryptable across serverless invocations.',
    };
  }

  const multiInstanceSafe = hasEnvSecret && hasCustomVolume;
  const warnings: string[] = [];

  if (!hasEnvSecret) {
    warnings.push('Set AI_VAULT_SECRET env var so encrypted keys remain decryptable across restarts.');
  }
  if (!hasCustomVolume) {
    warnings.push(
      isVercel
        ? 'Vercel serverless filesystem is ephemeral. Configure UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN + AI_VAULT_SECRET for persistent Admin Vault storage (Vercel GEMINI_API_KEY env secrets persist automatically).'
        : 'Vault file currently uses local disk (single-instance unless UPSTASH_REDIS_REST_URL or AI_VAULT_DIR is configured; GEMINI_API_KEY env secrets persist automatically).'
    );
  }

  return {
    storageScope: hasCustomVolume ? 'persistent_volume' : 'ephemeral_container_disk',
    vaultPath: VAULT_FILE_PATH,
    encryptionKeyPersistent: hasEnvSecret,
    multiInstanceSafe,
    warning: warnings.length > 0 ? warnings.join(' ') : undefined,
  };
}

let memoryKeyBuffer: Buffer | null = null;

function getVaultEncryptionKey(): Buffer {
  const envSecret = (process.env.AI_VAULT_SECRET || process.env.SESSION_SECRET || '').trim();
  if (envSecret) {
    return crypto.createHash('sha256').update(`king-ai-vault:${envSecret}`).digest();
  }

  try {
    if (fs.existsSync(VAULT_KEY_PATH)) {
      const hex = fs.readFileSync(VAULT_KEY_PATH, 'utf8').trim();
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        return Buffer.from(hex, 'hex');
      }
    }
    fs.mkdirSync(VAULT_BASE_DIR, { recursive: true });
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(VAULT_KEY_PATH, generated.toString('hex'), { mode: 0o600 });
    return generated;
  } catch {
    if (!memoryKeyBuffer) {
      memoryKeyBuffer = crypto.randomBytes(32);
    }
    return memoryKeyBuffer;
  }
}

function encryptText(plainText: string): string {
  const key = getVaultEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    d: encrypted.toString('base64'),
  });
}

function decryptText(serialized: string): string {
  const parsed = JSON.parse(serialized) as { v: number; iv: string; tag: string; d: string };
  const key = getVaultEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(parsed.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(parsed.d, 'base64')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}

function normalizeProjectId(raw?: string): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return cleaned || undefined;
}

function createDefaultVaultData(): PlainVaultData {
  return {
    keys: [],
    envOverrides: {},
    projectHealth: {},
    modelConfig: {
      ...DEFAULT_MODEL_CONFIG,
      enabledModels: { ...DEFAULT_MODEL_CONFIG.enabledModels },
    },
  };
}

let inMemoryFallbackVault: PlainVaultData | null = null;
let lastRemoteSyncAt = 0;
let inFlightRemoteSync: Promise<void> | null = null;
let pendingRemoteWrites: Promise<void>[] = [];

function normalizePlainVaultData(parsed: Partial<PlainVaultData>): PlainVaultData {
  const defaults = createDefaultVaultData();
  const rawCfg = parsed.modelConfig || ({} as Partial<AiModelConfigState>);
  const rawVersion = Number(rawCfg.configVersion || 0);
  const isLegacyConfigVersion = rawVersion < CURRENT_MODEL_CONFIG_VERSION;

  const mergedEnabledModels: Record<string, boolean> = {
    ...defaults.modelConfig.enabledModels,
    ...(rawCfg.enabledModels || {}),
  };

  if (rawVersion < 2) {
    mergedEnabledModels['gemini-3.1-pro-preview'] = true;
    mergedEnabledModels['gemini-omni-1.2-flash'] = true;
  }

  // Phase 2 upgrade: keep unverified gemini-3.1-flash-image disabled by default and prefer gemini-3.1-flash-lite-image
  if (isLegacyConfigVersion) {
    mergedEnabledModels['gemini-3.1-flash-lite-image'] = true;
    mergedEnabledModels['gemini-nano-banana-2.1'] = true;
    mergedEnabledModels['gemini-3.1-flash-image'] = false;
  }

  const resolvedPrimaryImage =
    rawCfg.primaryImageModel &&
    VERIFIED_GEMINI_MODELS.some((m) => m.id === rawCfg.primaryImageModel && m.capability === 'image')
      ? rawVersion < 3 && rawCfg.primaryImageModel === 'gemini-3.1-flash-image'
        ? defaults.modelConfig.primaryImageModel
        : rawCfg.primaryImageModel
      : defaults.modelConfig.primaryImageModel;

  const resolvedPrimaryText =
    rawCfg.primaryTextModel &&
    VERIFIED_GEMINI_MODELS.some((m) => m.id === rawCfg.primaryTextModel && m.capability === 'text')
      ? rawVersion < 2 && rawCfg.primaryTextModel === 'gemini-3.1-flash-lite'
        ? defaults.modelConfig.primaryTextModel
        : rawCfg.primaryTextModel
      : defaults.modelConfig.primaryTextModel;

  const resolvedPrimaryVideo =
    rawCfg.primaryVideoModel &&
    VERIFIED_GEMINI_MODELS.some((m) => m.id === rawCfg.primaryVideoModel && m.capability === 'omni')
      ? rawCfg.primaryVideoModel
      : defaults.modelConfig.primaryVideoModel;

  const validPolicies = new Set<ImageSelectionPolicy>([
    'balanced',
    'economy_first',
    'quality_first',
    'manual_primary',
  ]);
  const resolvedPolicy =
    rawCfg.imageSelectionPolicy && validPolicies.has(rawCfg.imageSelectionPolicy)
      ? rawCfg.imageSelectionPolicy
      : defaults.modelConfig.imageSelectionPolicy;

  return {
    keys: Array.isArray(parsed.keys) ? parsed.keys : [],
    envOverrides: parsed.envOverrides && typeof parsed.envOverrides === 'object' ? parsed.envOverrides : {},
    projectHealth: parsed.projectHealth && typeof parsed.projectHealth === 'object' ? parsed.projectHealth : {},
    modelConfig: {
      configVersion: CURRENT_MODEL_CONFIG_VERSION,
      enabledModels: mergedEnabledModels,
      primaryImageModel: resolvedPrimaryImage,
      primaryTextModel: resolvedPrimaryText,
      primaryVideoModel: resolvedPrimaryVideo,
      imageSelectionPolicy: resolvedPolicy,
      enableAutoRouting:
        typeof rawCfg.enableAutoRouting === 'boolean'
          ? rawCfg.enableAutoRouting
          : defaults.modelConfig.enableAutoRouting,
      enableKeyFallback:
        typeof rawCfg.enableKeyFallback === 'boolean'
          ? rawCfg.enableKeyFallback
          : defaults.modelConfig.enableKeyFallback,
      enableModelFallback:
        typeof rawCfg.enableModelFallback === 'boolean'
          ? rawCfg.enableModelFallback
          : defaults.modelConfig.enableModelFallback,
    },
  };
}

function decryptVaultWrapper(wrapper: EncryptedVaultFilePayload): PlainVaultData {
  const key = getVaultEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(wrapper.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(wrapper.tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(wrapper.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return normalizePlainVaultData(JSON.parse(plain) as Partial<PlainVaultData>);
}

function encryptVaultWrapper(data: PlainVaultData): EncryptedVaultFilePayload {
  const key = getVaultEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = JSON.stringify(data);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export async function syncVaultFromRemote(force = false): Promise<void> {
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
          method: 'GET',
          headers: {
            Authorization: `Bearer ${upstash.token}`,
          },
        }
      );
      if (!resp.ok) return;
      const body = (await resp.json()) as { result?: string | null };
      if (!body?.result || typeof body.result !== 'string') {
        if (!inMemoryFallbackVault) {
          inMemoryFallbackVault = createDefaultVaultData();
        }
        lastRemoteSyncAt = Date.now();
        return;
      }
      const wrapper = JSON.parse(body.result) as EncryptedVaultFilePayload;
      if (wrapper?.iv && wrapper?.tag && wrapper?.ciphertext) {
        inMemoryFallbackVault = decryptVaultWrapper(wrapper);
        lastRemoteSyncAt = Date.now();
      }
    } catch {
      // Preserve in-memory/local state if Upstash read fails transiently or key secret changed
    } finally {
      inFlightRemoteSync = null;
    }
  })();

  inFlightRemoteSync = run;
  return run;
}

export async function flushRemoteVaultWrites(): Promise<void> {
  if (pendingRemoteWrites.length === 0) return;
  const batch = pendingRemoteWrites.splice(0, pendingRemoteWrites.length);
  await Promise.all(batch);
}

function readVaultData(): PlainVaultData {
  const upstash = getUpstashConfig();
  if (upstash.configured && inMemoryFallbackVault) {
    return inMemoryFallbackVault;
  }
  try {
    if (!fs.existsSync(VAULT_FILE_PATH)) {
      return inMemoryFallbackVault || createDefaultVaultData();
    }
    const rawFile = fs.readFileSync(VAULT_FILE_PATH, 'utf8');
    const wrapper = JSON.parse(rawFile) as EncryptedVaultFilePayload;
    const normalized = decryptVaultWrapper(wrapper);
    inMemoryFallbackVault = normalized;
    return normalized;
  } catch {
    return inMemoryFallbackVault || createDefaultVaultData();
  }
}

function writeVaultData(data: PlainVaultData, options?: { strictRemoteSecret?: boolean }): void {
  inMemoryFallbackVault = data;
  const upstash = getUpstashConfig();
  const hasEnvSecret = Boolean((process.env.AI_VAULT_SECRET || process.env.SESSION_SECRET || '').trim());

  if (upstash.configured && options?.strictRemoteSecret && !hasEnvSecret) {
    throw new Error('AI_VAULT_SECRET environment variable is required to encrypt keys into Upstash Redis.');
  }

  const payload = encryptVaultWrapper(data);
  const serialized = JSON.stringify(payload);

  try {
    fs.mkdirSync(VAULT_BASE_DIR, { recursive: true });
    fs.writeFileSync(VAULT_FILE_PATH, serialized, { mode: 0o600 });
  } catch {
    // Expected on read-only Vercel serverless filesystem; Upstash handles persistence
  }

  if (upstash.configured && hasEnvSecret) {
    const writePromise = fetch(upstash.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${upstash.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', UPSTASH_VAULT_REDIS_KEY, serialized]),
    })
      .then((res) => {
        if (res.ok) {
          lastRemoteSyncAt = Date.now();
        }
      })
      .catch(() => {
        // Non-fatal in background health tracking
      });
    pendingRemoteWrites.push(writePromise);
  }
}

export function maskSecretValue(raw: string): string {
  const clean = (raw || '').trim();
  if (!clean) return 'Not Set';
  if (clean.length <= 8) return '••••••••';
  return `••••••${clean.slice(-4)}`;
}

const ENV_KEY_SLOT_NAMES = [
  { id: 'env_GEMINI_API_KEY', envVarName: 'GEMINI_API_KEY', label: 'Server Runtime Secret (GEMINI_API_KEY)', defaultPriority: 10, slotIndex: 0 },
  { id: 'env_GEMINI_API_KEY_1', envVarName: 'GEMINI_API_KEY_1', label: 'Server Secret Slot 1 (GEMINI_API_KEY_1)', defaultPriority: 11, slotIndex: 1 },
  { id: 'env_GEMINI_API_KEY_2', envVarName: 'GEMINI_API_KEY_2', label: 'Server Secret Slot 2 (GEMINI_API_KEY_2)', defaultPriority: 12, slotIndex: 2 },
  { id: 'env_GEMINI_API_KEY_3', envVarName: 'GEMINI_API_KEY_3', label: 'Server Secret Slot 3 (GEMINI_API_KEY_3)', defaultPriority: 13, slotIndex: 3 },
  { id: 'env_GEMINI_API_KEY_4', envVarName: 'GEMINI_API_KEY_4', label: 'Server Secret Slot 4 (GEMINI_API_KEY_4)', defaultPriority: 14, slotIndex: 4 },
  { id: 'env_GEMINI_API_KEY_5', envVarName: 'GEMINI_API_KEY_5', label: 'Server Secret Slot 5 (GEMINI_API_KEY_5)', defaultPriority: 15, slotIndex: 5 },
  { id: 'env_GEMINI_API_KEY_6', envVarName: 'GEMINI_API_KEY_6', label: 'Server Secret Slot 6 (GEMINI_API_KEY_6)', defaultPriority: 16, slotIndex: 6 },
  { id: 'env_GEMINI_API_KEY_7', envVarName: 'GEMINI_API_KEY_7', label: 'Server Secret Slot 7 (GEMINI_API_KEY_7)', defaultPriority: 17, slotIndex: 7 },
  { id: 'env_GEMINI_API_KEY_8', envVarName: 'GEMINI_API_KEY_8', label: 'Server Secret Slot 8 (GEMINI_API_KEY_8)', defaultPriority: 18, slotIndex: 8 },
] as const;

export function scrubSecretText(text: string): string {
  let sanitized = String(text || '');
  // Redact standard Google API key patterns
  sanitized = sanitized.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]');

  // Redact any known active server keys (all 8 env slots + Admin Vault) from error text
  const vault = readVaultData();
  const rawKeys = [
    ...ENV_KEY_SLOT_NAMES.map((slot) => process.env[slot.envVarName]),
    ...vault.keys.map((k) => {
      try {
        return decryptText(k.encryptedKey);
      } catch {
        return '';
      }
    }),
  ];

  for (const raw of rawKeys) {
    const trimmed = (raw || '').trim();
    if (trimmed && trimmed.length >= 8) {
      sanitized = sanitized.split(trimmed).join('[REDACTED_API_KEY]');
    }
  }
  return sanitized;
}

function getRuntimeEnvKeys(): Array<{
  id: string;
  envVarName: string;
  label: string;
  rawKey: string;
  defaultPriority: number;
  envProjectId?: string;
}> {
  const projectList = (process.env.GEMINI_API_KEY_PROJECTS || '')
    .split(',')
    .map((p) => normalizeProjectId(p));

  const seenValues = new Set<string>();
  const active: Array<{
    id: string;
    envVarName: string;
    label: string;
    rawKey: string;
    defaultPriority: number;
    envProjectId?: string;
  }> = [];

  for (const item of ENV_KEY_SLOT_NAMES) {
    const val = (process.env[item.envVarName] || '').trim();
    if (!val || seenValues.has(val)) continue;
    seenValues.add(val);
    const explicitPerSlotProject = normalizeProjectId(process.env[`${item.envVarName}_PROJECT`]);
    const listProject = item.slotIndex >= 1 ? projectList[item.slotIndex - 1] : undefined;
    active.push({
      id: item.id,
      envVarName: item.envVarName,
      label: item.label,
      rawKey: val,
      defaultPriority: item.defaultPriority,
      envProjectId: explicitPerSlotProject || listProject,
    });
  }
  return active;
}

function resolveEffectiveProjectHealth(
  vault: PlainVaultData,
  projectId: string | undefined,
  now: number
): ProjectHealthRecord | undefined {
  if (!projectId) return undefined;
  const rec = vault.projectHealth?.[projectId];
  if (!rec) return undefined;
  const isExpired = rec.cooldownUntil && rec.cooldownUntil <= now;
  if (rec.status === 'quota_exhausted' && isExpired) {
    return {
      ...rec,
      status: 'ready',
      cooldownUntil: undefined,
      quotaScope: undefined,
    };
  }
  return rec;
}

export function listProjectHealthSummaries(): ProjectHealthRecord[] {
  const vault = readVaultData();
  const now = Date.now();
  const seenProjects = new Set<string>();

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

  const summaries: ProjectHealthRecord[] = [];
  for (const pid of Array.from(seenProjects).sort()) {
    const active = resolveEffectiveProjectHealth(vault, pid, now);
    summaries.push(
      active || {
        projectId: pid,
        status: 'ready',
        updatedAt: new Date(now).toISOString(),
      }
    );
  }
  return summaries;
}

export function listResolvedKeys(): ResolvedExecutableKey[] {
  const vault = readVaultData();
  const now = Date.now();
  const resolved: ResolvedExecutableKey[] = [];

  for (const rec of vault.keys) {
    let rawKey = '';
    try {
      rawKey = decryptText(rec.encryptedKey).trim();
    } catch {
      rawKey = '';
    }
    if (!rawKey) continue;
    const projectId = normalizeProjectId(rec.projectId);
    const projHealth = resolveEffectiveProjectHealth(vault, projectId, now);
    const isCooldownExpired = rec.cooldownUntil && rec.cooldownUntil <= now;
    const keyStatus: KeyHealthStatus = !rec.enabled
      ? 'disabled'
      : rec.status === 'quota_exhausted' && isCooldownExpired
      ? 'ready'
      : rec.status;
    const effectiveStatus: KeyHealthStatus =
      keyStatus === 'ready' && projHealth?.status === 'quota_exhausted'
        ? 'quota_exhausted'
        : keyStatus;
    resolved.push({
      id: rec.id,
      label: rec.label,
      projectId,
      rawKey,
      source: 'admin_vault',
      enabled: rec.enabled,
      priority: rec.priority,
      status: effectiveStatus,
      quotaScope: projHealth?.status === 'quota_exhausted' ? projHealth.quotaScope : rec.quotaScope,
      cooldownUntil: isCooldownExpired ? undefined : rec.cooldownUntil,
      projectCooldownUntil: projHealth?.status === 'quota_exhausted' ? projHealth.cooldownUntil : undefined,
    });
  }

  const envKeys = getRuntimeEnvKeys();
  for (const envItem of envKeys) {
    const ov = vault.envOverrides[envItem.id];
    const enabled = ov ? ov.enabled : true;
    const projectId = normalizeProjectId(ov?.projectId) || envItem.envProjectId;
    const projHealth = resolveEffectiveProjectHealth(vault, projectId, now);
    const isCooldownExpired = ov?.cooldownUntil && ov.cooldownUntil <= now;
    const rawStatus = ov?.status || 'ready';
    const keyStatus: KeyHealthStatus = !enabled
      ? 'disabled'
      : rawStatus === 'quota_exhausted' && isCooldownExpired
      ? 'ready'
      : rawStatus;
    const effectiveStatus: KeyHealthStatus =
      keyStatus === 'ready' && projHealth?.status === 'quota_exhausted'
        ? 'quota_exhausted'
        : keyStatus;

    resolved.push({
      id: envItem.id,
      label: envItem.label,
      projectId,
      rawKey: envItem.rawKey,
      source: 'runtime_env',
      enabled,
      priority: ov?.priority ?? envItem.defaultPriority,
      status: effectiveStatus,
      quotaScope: projHealth?.status === 'quota_exhausted' ? projHealth.quotaScope : ov?.quotaScope,
      cooldownUntil: isCooldownExpired ? undefined : ov?.cooldownUntil,
      projectCooldownUntil: projHealth?.status === 'quota_exhausted' ? projHealth.cooldownUntil : undefined,
    });
  }

  return resolved.sort((a, b) => a.priority - b.priority);
}

export function listSafeKeySummaries(): SafeKeySummary[] {
  const vault = readVaultData();
  const now = Date.now();
  const summaries: SafeKeySummary[] = [];

  for (const rec of vault.keys) {
    let raw = '';
    try {
      raw = decryptText(rec.encryptedKey).trim();
    } catch {
      raw = '';
    }
    const projectId = normalizeProjectId(rec.projectId);
    const projHealth = resolveEffectiveProjectHealth(vault, projectId, now);
    const isCooldownExpired = rec.cooldownUntil && rec.cooldownUntil <= now;
    const keyStatus: KeyHealthStatus = !rec.enabled
      ? 'disabled'
      : rec.status === 'quota_exhausted' && isCooldownExpired
      ? 'ready'
      : rec.status;
    const status: KeyHealthStatus =
      keyStatus === 'ready' && projHealth?.status === 'quota_exhausted'
        ? 'quota_exhausted'
        : keyStatus;

    summaries.push({
      id: rec.id,
      label: rec.label,
      projectId,
      maskedKey: raw ? maskSecretValue(raw) : 'Decrypt Error',
      source: 'admin_vault',
      enabled: rec.enabled,
      priority: rec.priority,
      status,
      quotaScope: projHealth?.status === 'quota_exhausted' ? projHealth.quotaScope : rec.quotaScope,
      projectCooldownUntil: projHealth?.status === 'quota_exhausted' ? projHealth.cooldownUntil : undefined,
      lastError: rec.lastError || (projHealth?.status === 'quota_exhausted' ? projHealth.lastError : undefined),
      lastTestedAt: rec.lastTestedAt,
      cooldownUntil: isCooldownExpired ? undefined : rec.cooldownUntil,
    });
  }

  for (const envItem of getRuntimeEnvKeys()) {
    const ov = vault.envOverrides[envItem.id];
    const enabled = ov ? ov.enabled : true;
    const projectId = normalizeProjectId(ov?.projectId) || envItem.envProjectId;
    const projHealth = resolveEffectiveProjectHealth(vault, projectId, now);
    const isCooldownExpired = ov?.cooldownUntil && ov.cooldownUntil <= now;
    const rawStatus = ov?.status || 'ready';
    const keyStatus: KeyHealthStatus = !enabled
      ? 'disabled'
      : rawStatus === 'quota_exhausted' && isCooldownExpired
      ? 'ready'
      : rawStatus;
    const status: KeyHealthStatus =
      keyStatus === 'ready' && projHealth?.status === 'quota_exhausted'
        ? 'quota_exhausted'
        : keyStatus;

    summaries.push({
      id: envItem.id,
      label: envItem.label,
      projectId,
      maskedKey: maskSecretValue(envItem.rawKey),
      source: 'runtime_env',
      envVarName: envItem.envVarName,
      enabled,
      priority: ov?.priority ?? envItem.defaultPriority,
      status,
      quotaScope: projHealth?.status === 'quota_exhausted' ? projHealth.quotaScope : ov?.quotaScope,
      projectCooldownUntil: projHealth?.status === 'quota_exhausted' ? projHealth.cooldownUntil : undefined,
      lastError: ov?.lastError || (projHealth?.status === 'quota_exhausted' ? projHealth.lastError : undefined),
      lastTestedAt: ov?.lastTestedAt,
      cooldownUntil: isCooldownExpired ? undefined : ov?.cooldownUntil,
    });
  }

  return summaries.sort((a, b) => a.priority - b.priority);
}

export function getModelConfig(): AiModelConfigState {
  return readVaultData().modelConfig;
}

export function updateModelConfig(patch: Partial<AiModelConfigState>): AiModelConfigState {
  const vault = readVaultData();
  const validIds = new Set(VERIFIED_GEMINI_MODELS.map((m) => m.id));
  vault.modelConfig.configVersion = CURRENT_MODEL_CONFIG_VERSION;

  if (patch.enabledModels && typeof patch.enabledModels === 'object') {
    for (const [id, enabled] of Object.entries(patch.enabledModels)) {
      if (validIds.has(id) && typeof enabled === 'boolean') {
        vault.modelConfig.enabledModels[id] = enabled;
      }
    }
  }

  if (patch.primaryImageModel && validIds.has(patch.primaryImageModel)) {
    const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === patch.primaryImageModel);
    if (spec?.capability === 'image') {
      vault.modelConfig.primaryImageModel = patch.primaryImageModel;
      vault.modelConfig.enabledModels[patch.primaryImageModel] = true;
    }
  }

  if (patch.primaryTextModel && validIds.has(patch.primaryTextModel)) {
    const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === patch.primaryTextModel);
    if (spec?.capability === 'text') {
      vault.modelConfig.primaryTextModel = patch.primaryTextModel;
      vault.modelConfig.enabledModels[patch.primaryTextModel] = true;
    }
  }

  if (patch.primaryVideoModel && validIds.has(patch.primaryVideoModel)) {
    const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === patch.primaryVideoModel);
    if (spec?.capability === 'omni') {
      vault.modelConfig.primaryVideoModel = patch.primaryVideoModel;
      vault.modelConfig.enabledModels[patch.primaryVideoModel] = true;
    }
  }

  if (
    patch.imageSelectionPolicy &&
    ['balanced', 'economy_first', 'quality_first', 'manual_primary'].includes(patch.imageSelectionPolicy)
  ) {
    vault.modelConfig.imageSelectionPolicy = patch.imageSelectionPolicy;
  }

  if (typeof patch.enableAutoRouting === 'boolean') {
    vault.modelConfig.enableAutoRouting = patch.enableAutoRouting;
  }
  if (typeof patch.enableKeyFallback === 'boolean') {
    vault.modelConfig.enableKeyFallback = patch.enableKeyFallback;
  }
  if (typeof patch.enableModelFallback === 'boolean') {
    vault.modelConfig.enableModelFallback = patch.enableModelFallback;
  }

  writeVaultData(vault, { strictRemoteSecret: true });
  return vault.modelConfig;
}

export function addVaultApiKey(params: {
  label: string;
  apiKey: string;
  priority?: number;
  projectId?: string;
}): SafeKeySummary {
  const cleanKey = (params.apiKey || '').trim();
  if (!cleanKey || cleanKey.length < 16) {
    throw new Error('Please enter a valid Google Gemini API key.');
  }
  const cleanLabel = (params.label || '').trim() || `Admin Key ${Date.now().toString().slice(-4)}`;
  const vault = readVaultData();

  const id = `vk_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const nowIso = new Date().toISOString();
  const nextPriority =
    typeof params.priority === 'number' && Number.isFinite(params.priority)
      ? Math.max(1, Math.min(999, Math.round(params.priority)))
      : vault.keys.length + 1;

  vault.keys.push({
    id,
    label: cleanLabel.slice(0, 60),
    projectId: normalizeProjectId(params.projectId),
    encryptedKey: encryptText(cleanKey),
    enabled: true,
    priority: nextPriority,
    status: 'ready',
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  writeVaultData(vault, { strictRemoteSecret: true });
  return listSafeKeySummaries().find((k) => k.id === id)!;
}

export function updateVaultApiKey(
  keyId: string,
  patch: {
    label?: string;
    projectId?: string;
    apiKey?: string;
    enabled?: boolean;
    priority?: number;
    resetHealth?: boolean;
  }
): SafeKeySummary | null {
  const vault = readVaultData();

  if (keyId.startsWith('env_')) {
    const envItem = getRuntimeEnvKeys().find((e) => e.id === keyId);
    if (!envItem) return null;
    const prev = vault.envOverrides[keyId] || {
      enabled: true,
      priority: envItem.defaultPriority,
      status: 'ready' as KeyHealthStatus,
    };
    const nextEnabled = typeof patch.enabled === 'boolean' ? patch.enabled : prev.enabled;
    const nextProjectId =
      patch.projectId !== undefined
        ? normalizeProjectId(patch.projectId)
        : normalizeProjectId(prev.projectId) || envItem.envProjectId;

    vault.envOverrides[keyId] = {
      ...prev,
      projectId: nextProjectId,
      enabled: nextEnabled,
      priority:
        typeof patch.priority === 'number' && Number.isFinite(patch.priority)
          ? Math.max(1, Math.min(999, Math.round(patch.priority)))
          : prev.priority,
      status: patch.resetHealth ? 'ready' : !nextEnabled ? 'disabled' : prev.status === 'disabled' ? 'ready' : prev.status,
      quotaScope: patch.resetHealth ? undefined : prev.quotaScope,
      lastError: patch.resetHealth ? undefined : prev.lastError,
      cooldownUntil: patch.resetHealth ? undefined : prev.cooldownUntil,
    };

    if (patch.resetHealth && nextProjectId && vault.projectHealth[nextProjectId]) {
      delete vault.projectHealth[nextProjectId];
    }

    writeVaultData(vault, { strictRemoteSecret: true });
    return listSafeKeySummaries().find((k) => k.id === keyId) || null;
  }

  const idx = vault.keys.findIndex((k) => k.id === keyId);
  if (idx === -1) return null;
  const current = vault.keys[idx];

  const updatedEnabled = typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled;
  const nextProjectId =
    patch.projectId !== undefined ? normalizeProjectId(patch.projectId) : normalizeProjectId(current.projectId);
  let updatedEncrypted = current.encryptedKey;
  let updatedStatus = current.status;
  let updatedError = current.lastError;
  let updatedCooldown = current.cooldownUntil;
  let updatedQuotaScope = current.quotaScope;

  if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
    const cleanNew = patch.apiKey.trim();
    if (cleanNew.length < 16) {
      throw new Error('Replacement Gemini API key is too short.');
    }
    updatedEncrypted = encryptText(cleanNew);
    updatedStatus = updatedEnabled ? 'ready' : 'disabled';
    updatedError = undefined;
    updatedCooldown = undefined;
    updatedQuotaScope = undefined;
  } else if (patch.resetHealth) {
    updatedStatus = updatedEnabled ? 'ready' : 'disabled';
    updatedError = undefined;
    updatedCooldown = undefined;
    updatedQuotaScope = undefined;
    if (nextProjectId && vault.projectHealth[nextProjectId]) {
      delete vault.projectHealth[nextProjectId];
    }
  } else if (typeof patch.enabled === 'boolean') {
    updatedStatus = updatedEnabled ? (current.status === 'disabled' ? 'ready' : current.status) : 'disabled';
  }

  vault.keys[idx] = {
    ...current,
    label: typeof patch.label === 'string' && patch.label.trim() ? patch.label.trim().slice(0, 60) : current.label,
    projectId: nextProjectId,
    encryptedKey: updatedEncrypted,
    enabled: updatedEnabled,
    priority:
      typeof patch.priority === 'number' && Number.isFinite(patch.priority)
        ? Math.max(1, Math.min(999, Math.round(patch.priority)))
        : current.priority,
    status: updatedStatus,
    quotaScope: updatedQuotaScope,
    lastError: updatedError,
    cooldownUntil: updatedCooldown,
    updatedAt: new Date().toISOString(),
  };

  writeVaultData(vault, { strictRemoteSecret: true });
  return listSafeKeySummaries().find((k) => k.id === keyId) || null;
}

export function deleteVaultApiKey(keyId: string): boolean {
  if (keyId.startsWith('env_')) {
    throw new Error('Runtime server environment keys cannot be deleted; disable them instead.');
  }
  const vault = readVaultData();
  const nextKeys = vault.keys.filter((k) => k.id !== keyId);
  if (nextKeys.length === vault.keys.length) return false;
  vault.keys = nextKeys;
  writeVaultData(vault, { strictRemoteSecret: true });
  return true;
}

export function recordKeyHealthResult(
  keyId: string,
  result: {
    status: KeyHealthStatus;
    error?: string;
    cooldownMs?: number;
    quotaScope?: QuotaScope;
    projectId?: string;
    projectCooldownMs?: number;
    testedAt?: string;
  }
): void {
  const vault = readVaultData();
  const now = Date.now();
  const safeError = result.error ? scrubSecretText(result.error).slice(0, 240) : undefined;
  const cooldownUntil = result.cooldownMs ? now + result.cooldownMs : undefined;
  const testedAt = result.testedAt || new Date(now).toISOString();

  let resolvedProjectId = normalizeProjectId(result.projectId);

  if (keyId.startsWith('env_')) {
    const envItem = getRuntimeEnvKeys().find((e) => e.id === keyId);
    const prev = vault.envOverrides[keyId] || {
      enabled: true,
      priority: envItem?.defaultPriority ?? 10,
      status: 'ready' as KeyHealthStatus,
    };
    if (!resolvedProjectId) {
      resolvedProjectId = normalizeProjectId(prev.projectId) || envItem?.envProjectId;
    }
    vault.envOverrides[keyId] = {
      ...prev,
      status: prev.enabled ? result.status : 'disabled',
      quotaScope: result.status === 'ready' ? undefined : result.quotaScope,
      lastError: safeError,
      lastTestedAt: testedAt,
      cooldownUntil,
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
      status: cur.enabled ? result.status : 'disabled',
      quotaScope: result.status === 'ready' ? undefined : result.quotaScope,
      lastError: safeError,
      lastTestedAt: testedAt,
      cooldownUntil,
      updatedAt: testedAt,
    };
  }

  if (resolvedProjectId) {
    if (result.status === 'ready') {
      vault.projectHealth[resolvedProjectId] = {
        projectId: resolvedProjectId,
        status: 'ready',
        updatedAt: testedAt,
      };
    } else if (result.status === 'quota_exhausted' && result.projectCooldownMs && result.projectCooldownMs > 0) {
      vault.projectHealth[resolvedProjectId] = {
        projectId: resolvedProjectId,
        status: 'quota_exhausted',
        quotaScope: result.quotaScope,
        cooldownUntil: now + result.projectCooldownMs,
        lastError: safeError,
        updatedAt: testedAt,
      };
    }
  }

  writeVaultData(vault);
}
