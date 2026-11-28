import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
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

export type FalQuotaScope = 'rpm_throttle' | 'concurrency_limit' | 'queue_limit';

export interface FalModelHealthRecord {
  modelId: string;
  status: 'ready' | 'error';
  failureCount: number;
  cooldownUntil?: number;
  lastError?: string;
  updatedAt: string;
}

export interface StoredFalVaultKeyRecord {
  id: string;
  label: string;
  encryptedKey: string;
  enabled: boolean;
  priority: number;
  status: KeyHealthStatus;
  quotaScope?: FalQuotaScope;
  failureCount?: number;
  consecutiveFailures?: number;
  lastError?: string;
  lastTestedAt?: string;
  cooldownUntil?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FalEnvKeyOverrideRecord {
  enabled: boolean;
  priority: number;
  status: KeyHealthStatus;
  quotaScope?: FalQuotaScope;
  failureCount?: number;
  consecutiveFailures?: number;
  lastError?: string;
  lastTestedAt?: string;
  cooldownUntil?: number;
}

export interface VerifiedFalModelSpec {
  id: string;
  displayName: string;
  capability: 'image' | 'image_edit' | 'video' | 'image_to_video';
  description: string;
  defaultEnabled: boolean;
  maxInputImageMb?: number;
  supportedAspectRatios?: Array<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>;
  supportedDurations?: string[];
  requiresSourceImage?: boolean;
}

export const VERIFIED_FAL_MODELS: VerifiedFalModelSpec[] = [
  {
    id: 'fal-ai/flux/schnell',
    displayName: 'FLUX.1 Schnell (Fast Image)',
    capability: 'image',
    description: 'Ultra-fast 4-step text-to-image generation on fal.ai.',
    defaultEnabled: true,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  },
  {
    id: 'fal-ai/flux/dev',
    displayName: 'FLUX.1 Dev (High Quality)',
    capability: 'image',
    description: 'High-detail image generation fallback on fal.ai.',
    defaultEnabled: true,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  },
  {
    id: 'fal-ai/flux/dev/image-to-image',
    displayName: 'FLUX.1 Dev (Image-to-Image Edit)',
    capability: 'image_edit',
    description: 'Restyle & image-to-image editing with uploaded source photos.',
    defaultEnabled: true,
    maxInputImageMb: 10,
    requiresSourceImage: true,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  },
  {
    id: 'fal-ai/flux-kontext/pro',
    displayName: 'FLUX Kontext Pro (Instruction Edit)',
    capability: 'image_edit',
    description: 'Instruction-guided precision photo editing on fal.ai.',
    defaultEnabled: true,
    maxInputImageMb: 10,
    requiresSourceImage: true,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  },
  {
    id: 'fal-ai/wan/v2.1/1.3b/text-to-video',
    displayName: 'Wan 2.1 Fast Text-to-Video',
    capability: 'video',
    description: 'Fast text-to-video generation on fal.ai queue.',
    defaultEnabled: true,
    supportedAspectRatios: ['16:9', '9:16'],
    supportedDurations: ['5s'],
  },
  {
    id: 'fal-ai/kling-video/v2.1/standard/text-to-video',
    displayName: 'Kling 2.1 Text-to-Video',
    capability: 'video',
    description: 'Cinematic text-to-video fallback on fal.ai.',
    defaultEnabled: true,
    supportedAspectRatios: ['16:9', '9:16'],
    supportedDurations: ['5s', '10s'],
  },
  {
    id: 'fal-ai/kling-video/v2.1/standard/image-to-video',
    displayName: 'Kling 2.1 Image-to-Video',
    capability: 'image_to_video',
    description: 'Animate a source still photo into video via fal.ai.',
    defaultEnabled: true,
    maxInputImageMb: 10,
    requiresSourceImage: true,
    supportedAspectRatios: ['16:9', '9:16'],
    supportedDurations: ['5s', '10s'],
  },
];

export interface FalAiConfigState {
  enableFalKeyFallback: boolean;
  enableFalImageFallback: boolean;
  enableFalVideoFallback: boolean;
  preferFalForVideo: boolean;
  maxConcurrentPerKey: number;
  requestTimeoutSec: number;
  maxQueueWaitSec: number;
  primaryFalImageModel: string;
  primaryFalImageEditModel: string;
  primaryFalVideoModel: string;
  primaryFalImageToVideoModel: string;
}

export interface SafeFalKeySummary {
  id: string;
  label: string;
  maskedKey: string;
  source: 'admin_vault' | 'runtime_env';
  envVarName?: string;
  enabled: boolean;
  priority: number;
  status: KeyHealthStatus;
  quotaScope?: FalQuotaScope;
  failureCount: number;
  consecutiveFailures: number;
  lastError?: string;
  lastTestedAt?: string;
  cooldownUntil?: number;
}

export interface ResolvedExecutableFalKey {
  id: string;
  label: string;
  rawKey: string;
  source: 'admin_vault' | 'runtime_env';
  enabled: boolean;
  priority: number;
  status: KeyHealthStatus;
  quotaScope?: FalQuotaScope;
  cooldownUntil?: number;
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
  falKeys: StoredFalVaultKeyRecord[];
  falEnvOverrides: Record<string, FalEnvKeyOverrideRecord>;
  falModelHealth: Record<string, FalModelHealthRecord>;
  falConfig: FalAiConfigState;
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

const VAULT_BASE_DIR = path.resolve(
  process.env.AI_VAULT_DIR?.trim() || (process.env.VERCEL ? os.tmpdir() : process.cwd())
);
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

const DEFAULT_FAL_CONFIG: FalAiConfigState = {
  enableFalKeyFallback: true,
  enableFalImageFallback: true,
  enableFalVideoFallback: true,
  preferFalForVideo: false,
  maxConcurrentPerKey: 2,
  requestTimeoutSec: 45,
  maxQueueWaitSec: 45,
  primaryFalImageModel: 'fal-ai/flux/schnell',
  primaryFalImageEditModel: 'fal-ai/flux/dev/image-to-image',
  primaryFalVideoModel: 'fal-ai/wan/v2.1/1.3b/text-to-video',
  primaryFalImageToVideoModel: 'fal-ai/kling-video/v2.1/standard/image-to-video',
};

const UPSTASH_VAULT_REDIS_KEY = 'king:ai_vault:v1';
const REMOTE_SYNC_TTL_MS = 2_000;

export interface VaultPersistenceInfo {
  storageScope: 'upstash_redis_encrypted' | 'persistent_volume' | 'ephemeral_container_disk';
  vaultPath: string;
  encryptionKeyPersistent: boolean;
  multiInstanceSafe: boolean;
  remoteSyncStatus?: 'ok' | 'unconfigured' | 'error';
  remoteError?: string;
  decryptionError?: string;
  lastSyncedAt?: string;
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

  // Inspect whether any stored vault keys fail decryption under current secret
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
    // ignore read fallback here; whole-vault errors are surfaced in lastDecryptionError
  }

  const effectiveDecryptError =
    lastDecryptionError ||
    (perKeyDecryptFailures > 0
      ? `${perKeyDecryptFailures} stored API key record(s) failed AES-256-GCM decryption. Check AI_VAULT_SECRET consistency.`
      : undefined);

  const lastSyncedAt = lastSuccessfulRemoteSyncAt
    ? new Date(lastSuccessfulRemoteSyncAt).toISOString()
    : undefined;

  if (upstash.configured) {
    const remoteSyncStatus: 'ok' | 'error' =
      lastRemoteSyncError || effectiveDecryptError ? 'error' : 'ok';
    const warnings: string[] = [];
    if (!hasEnvSecret) {
      warnings.push(
        'Set AI_VAULT_SECRET env var so Upstash AES-256-GCM encrypted keys remain decryptable across serverless invocations.'
      );
    }
    if (lastRemoteSyncError) {
      warnings.push(lastRemoteSyncError);
    }
    if (effectiveDecryptError) {
      warnings.push(effectiveDecryptError);
    }
    return {
      storageScope: 'upstash_redis_encrypted',
      vaultPath: `upstash-redis://${UPSTASH_VAULT_REDIS_KEY}`,
      encryptionKeyPersistent: hasEnvSecret,
      multiInstanceSafe: hasEnvSecret && remoteSyncStatus === 'ok',
      remoteSyncStatus,
      remoteError: lastRemoteSyncError,
      decryptionError: effectiveDecryptError,
      lastSyncedAt,
      warning: warnings.length > 0 ? warnings.join(' ') : undefined,
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
  if (effectiveDecryptError) {
    warnings.push(effectiveDecryptError);
  }

  return {
    storageScope: hasCustomVolume ? 'persistent_volume' : 'ephemeral_container_disk',
    vaultPath: VAULT_FILE_PATH,
    encryptionKeyPersistent: hasEnvSecret,
    multiInstanceSafe,
    remoteSyncStatus: 'unconfigured',
    decryptionError: effectiveDecryptError,
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
    falKeys: [],
    falEnvOverrides: {},
    falModelHealth: {},
    falConfig: { ...DEFAULT_FAL_CONFIG },
  };
}

let inMemoryFallbackVault: PlainVaultData | null = null;
let lastRemoteSyncAt = 0;
let lastSuccessfulRemoteSyncAt: number | undefined;
let lastRemoteSyncError: string | undefined;
let lastDecryptionError: string | undefined;
let inFlightRemoteSync: Promise<void> | null = null;

interface QueuedRemoteWrite {
  promise: Promise<void>;
  strict: boolean;
}
let pendingRemoteWrites: QueuedRemoteWrite[] = [];

export function resetVaultRuntimeCacheForTests(): void {
  inMemoryFallbackVault = null;
  memoryKeyBuffer = null;
  lastRemoteSyncAt = 0;
  lastSuccessfulRemoteSyncAt = undefined;
  lastRemoteSyncError = undefined;
  lastDecryptionError = undefined;
  inFlightRemoteSync = null;
  pendingRemoteWrites = [];
}

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

  const rawFalCfg = parsed.falConfig || ({} as Partial<FalAiConfigState>);
  const validFalIds = new Set(VERIFIED_FAL_MODELS.map((m) => m.id));

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
    falKeys: Array.isArray(parsed.falKeys) ? parsed.falKeys : [],
    falEnvOverrides:
      parsed.falEnvOverrides && typeof parsed.falEnvOverrides === 'object' ? parsed.falEnvOverrides : {},
    falModelHealth:
      parsed.falModelHealth && typeof parsed.falModelHealth === 'object' ? parsed.falModelHealth : {},
    falConfig: {
      enableFalKeyFallback:
        typeof rawFalCfg.enableFalKeyFallback === 'boolean'
          ? rawFalCfg.enableFalKeyFallback
          : DEFAULT_FAL_CONFIG.enableFalKeyFallback,
      enableFalImageFallback:
        typeof rawFalCfg.enableFalImageFallback === 'boolean'
          ? rawFalCfg.enableFalImageFallback
          : DEFAULT_FAL_CONFIG.enableFalImageFallback,
      enableFalVideoFallback:
        typeof rawFalCfg.enableFalVideoFallback === 'boolean'
          ? rawFalCfg.enableFalVideoFallback
          : DEFAULT_FAL_CONFIG.enableFalVideoFallback,
      preferFalForVideo:
        typeof rawFalCfg.preferFalForVideo === 'boolean'
          ? rawFalCfg.preferFalForVideo
          : DEFAULT_FAL_CONFIG.preferFalForVideo,
      maxConcurrentPerKey:
        typeof rawFalCfg.maxConcurrentPerKey === 'number' && Number.isFinite(rawFalCfg.maxConcurrentPerKey)
          ? Math.max(1, Math.min(10, Math.round(rawFalCfg.maxConcurrentPerKey)))
          : DEFAULT_FAL_CONFIG.maxConcurrentPerKey,
      requestTimeoutSec:
        typeof rawFalCfg.requestTimeoutSec === 'number' && Number.isFinite(rawFalCfg.requestTimeoutSec)
          ? Math.max(10, Math.min(180, Math.round(rawFalCfg.requestTimeoutSec)))
          : DEFAULT_FAL_CONFIG.requestTimeoutSec,
      maxQueueWaitSec:
        typeof rawFalCfg.maxQueueWaitSec === 'number' && Number.isFinite(rawFalCfg.maxQueueWaitSec)
          ? Math.max(15, Math.min(240, Math.round(rawFalCfg.maxQueueWaitSec)))
          : DEFAULT_FAL_CONFIG.maxQueueWaitSec,
      primaryFalImageModel:
        rawFalCfg.primaryFalImageModel && validFalIds.has(rawFalCfg.primaryFalImageModel)
          ? rawFalCfg.primaryFalImageModel
          : DEFAULT_FAL_CONFIG.primaryFalImageModel,
      primaryFalImageEditModel:
        rawFalCfg.primaryFalImageEditModel && validFalIds.has(rawFalCfg.primaryFalImageEditModel)
          ? rawFalCfg.primaryFalImageEditModel
          : DEFAULT_FAL_CONFIG.primaryFalImageEditModel,
      primaryFalVideoModel:
        rawFalCfg.primaryFalVideoModel && validFalIds.has(rawFalCfg.primaryFalVideoModel)
          ? rawFalCfg.primaryFalVideoModel
          : DEFAULT_FAL_CONFIG.primaryFalVideoModel,
      primaryFalImageToVideoModel:
        rawFalCfg.primaryFalImageToVideoModel && validFalIds.has(rawFalCfg.primaryFalImageToVideoModel)
          ? rawFalCfg.primaryFalImageToVideoModel
          : DEFAULT_FAL_CONFIG.primaryFalImageToVideoModel,
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

async function fetchRemoteUpstashVault(upstash: { url: string; token: string }): Promise<{
  found: boolean;
  vault?: PlainVaultData;
}> {
  const resp = await fetch(
    `${upstash.url}/get/${encodeURIComponent(UPSTASH_VAULT_REDIS_KEY)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${upstash.token}`,
      },
    }
  );
  if (!resp.ok) {
    throw new Error(`Upstash Redis GET failed with HTTP ${resp.status}.`);
  }
  const body = (await resp.json()) as { result?: string | null; error?: string };
  if (body?.error) {
    throw new Error(`Upstash Redis error: ${body.error}`);
  }
  if (!body?.result || typeof body.result !== 'string') {
    return { found: false };
  }
  const wrapper = JSON.parse(body.result) as EncryptedVaultFilePayload;
  if (!wrapper?.iv || !wrapper?.tag || !wrapper?.ciphertext) {
    throw new Error('Malformed encrypted vault payload in Upstash Redis.');
  }
  const decrypted = decryptVaultWrapper(wrapper);
  return { found: true, vault: decrypted };
}

export async function syncVaultFromRemote(force = false): Promise<void> {
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
        lastRemoteSyncError = undefined;
        lastDecryptionError = undefined;
        lastRemoteSyncAt = Date.now();
        lastSuccessfulRemoteSyncAt = Date.now();
        return;
      }
      if (remote.vault) {
        inMemoryFallbackVault = remote.vault;
        lastRemoteSyncError = undefined;
        lastDecryptionError = undefined;
        lastRemoteSyncAt = Date.now();
        lastSuccessfulRemoteSyncAt = Date.now();
      }
    } catch (err: any) {
      const msg = scrubSecretText(String(err?.message || 'Failed to sync encrypted AI Vault from Upstash Redis.'));
      if (
        msg.toLowerCase().includes('authenticate') ||
        msg.toLowerCase().includes('unsupported state') ||
        msg.toLowerCase().includes('malformed encrypted vault') ||
        msg.toLowerCase().includes('json')
      ) {
        lastDecryptionError =
          'Encrypted Upstash vault could not be decrypted with current AI_VAULT_SECRET.';
        lastRemoteSyncError = undefined;
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

export async function flushRemoteVaultWrites(options?: { throwOnError?: boolean }): Promise<void> {
  if (pendingRemoteWrites.length === 0) return;
  const batch = pendingRemoteWrites.splice(0, pendingRemoteWrites.length);
  const results = await Promise.allSettled(batch.map((w) => w.promise));
  if (options?.throwOnError) {
    const firstRejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (firstRejected) {
      throw firstRejected.reason instanceof Error
        ? firstRejected.reason
        : new Error(String(firstRejected.reason || 'Failed to persist AI Vault to Upstash Redis.'));
    }
  }
}

interface HealthUpdateDelta {
  provider?: 'gemini' | 'fal';
  keyId?: string;
  projectId?: string;
  falModelId?: string;
}

function mergeHealthDeltaIntoRemoteVault(
  remote: PlainVaultData,
  local: PlainVaultData,
  delta: HealthUpdateDelta
): PlainVaultData {
  const merged: PlainVaultData = {
    keys: remote.keys.map((k) => ({ ...k })),
    envOverrides: { ...remote.envOverrides },
    projectHealth: { ...remote.projectHealth },
    modelConfig: remote.modelConfig,
    falKeys: remote.falKeys.map((k) => ({ ...k })),
    falEnvOverrides: { ...remote.falEnvOverrides },
    falModelHealth: { ...remote.falModelHealth },
    falConfig: remote.falConfig,
  };

  if (delta.provider === 'fal') {
    if (delta.keyId) {
      if (delta.keyId.startsWith('env_')) {
        const localOv = local.falEnvOverrides[delta.keyId];
        if (localOv) {
          const remoteOv = merged.falEnvOverrides[delta.keyId];
          merged.falEnvOverrides[delta.keyId] = {
            ...(remoteOv || localOv),
            status: localOv.status,
            quotaScope: localOv.quotaScope,
            failureCount: localOv.failureCount,
            consecutiveFailures: localOv.consecutiveFailures,
            lastError: localOv.lastError,
            lastTestedAt: localOv.lastTestedAt,
            cooldownUntil: localOv.cooldownUntil,
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
            updatedAt: localRec.updatedAt,
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
    if (delta.keyId.startsWith('env_')) {
      const localOv = local.envOverrides[delta.keyId];
      if (localOv) {
        const remoteOv = merged.envOverrides[delta.keyId];
        merged.envOverrides[delta.keyId] = {
          ...(remoteOv || localOv),
          status: localOv.status,
          quotaScope: localOv.quotaScope,
          lastError: localOv.lastError,
          lastTestedAt: localOv.lastTestedAt,
          cooldownUntil: localOv.cooldownUntil,
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
          updatedAt: localRec.updatedAt,
        };
      }
    }
  }

  if (delta.projectId && local.projectHealth[delta.projectId]) {
    merged.projectHealth[delta.projectId] = { ...local.projectHealth[delta.projectId] };
  }

  return merged;
}

async function writeUpstashSet(
  upstash: { url: string; token: string },
  serialized: string
): Promise<void> {
  const res = await fetch(upstash.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${upstash.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['SET', UPSTASH_VAULT_REDIS_KEY, serialized]),
  });
  if (!res.ok) {
    throw new Error(`Upstash Redis SET failed with HTTP ${res.status}.`);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (data?.error) {
    throw new Error(`Upstash Redis SET error: ${data.error}`);
  }
  lastRemoteSyncAt = Date.now();
  lastSuccessfulRemoteSyncAt = Date.now();
  lastRemoteSyncError = undefined;
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

function writeVaultData(
  data: PlainVaultData,
  options?: { strictRemoteSecret?: boolean; healthDelta?: HealthUpdateDelta }
): void {
  const upstash = getUpstashConfig();
  const hasEnvSecret = Boolean((process.env.AI_VAULT_SECRET || process.env.SESSION_SECRET || '').trim());
  const isVercel = Boolean(process.env.VERCEL);

  if (options?.strictRemoteSecret) {
    if (isVercel && !upstash.configured) {
      throw new Error(
        'Persistent serverless vault storage is not configured on Vercel. Add UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, and AI_VAULT_SECRET in Vercel Environment Variables once so Admin Panel keys persist across instances.'
      );
    }
    if (upstash.configured && !hasEnvSecret) {
      throw new Error('AI_VAULT_SECRET environment variable is required to encrypt keys into Upstash Redis.');
    }
    if (upstash.configured && lastDecryptionError) {
      throw new Error(
        'Remote encrypted vault could not be decrypted with current AI_VAULT_SECRET. Restore the original AI_VAULT_SECRET before modifying keys so existing vault data is not overwritten.'
      );
    }
  }

  inMemoryFallbackVault = data;
  const payload = encryptVaultWrapper(data);
  const serialized = JSON.stringify(payload);

  try {
    fs.mkdirSync(VAULT_BASE_DIR, { recursive: true });
    fs.writeFileSync(VAULT_FILE_PATH, serialized, { mode: 0o600 });
  } catch {
    // Expected on read-only Vercel serverless filesystem; Upstash handles persistence
  }

  if (upstash.configured && hasEnvSecret) {
    const strict = Boolean(options?.strictRemoteSecret);
    const writePromise = (async () => {
      try {
        if (!strict && options?.healthDelta) {
          // Conflict-safe merge: preserve concurrently added/deleted keys or model config edits
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
            // Fall back to direct SET if remote read transiently fails
          }
        }
        await writeUpstashSet(upstash, serialized);
      } catch (err: any) {
        const msg = scrubSecretText(String(err?.message || 'Failed to persist AI Vault to Upstash Redis.'));
        lastRemoteSyncError = msg;
        if (strict) {
          throw new Error(msg);
        }
      }
    })();
    pendingRemoteWrites.push({ promise: writePromise, strict });
  }
}

export function verifyEncryptedVaultPersistence(): {
  ok: boolean;
  encryptedKeysCount: number;
  decryptedKeysCount: number;
  failedDecryptCount: number;
  persistence: VaultPersistenceInfo;
} {
  const vault = readVaultData();
  let decryptedKeysCount = 0;
  let failedDecryptCount = 0;

  for (const rec of [...vault.keys, ...vault.falKeys]) {
    try {
      const plain = decryptText(rec.encryptedKey).trim();
      if (plain) decryptedKeysCount += 1;
      else failedDecryptCount += 1;
    } catch {
      failedDecryptCount += 1;
    }
  }

  const persistence = getVaultPersistenceInfo();
  const ok = failedDecryptCount === 0 && !persistence.decryptionError && persistence.remoteSyncStatus !== 'error';
  return {
    ok,
    encryptedKeysCount: vault.keys.length + vault.falKeys.length,
    decryptedKeysCount,
    failedDecryptCount,
    persistence,
  };
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

const FAL_ENV_KEY_SLOT_NAMES = [
  { id: 'env_FAL_KEY', envVarName: 'FAL_KEY', label: 'Server Runtime Secret (FAL_KEY)', defaultPriority: 10 },
  { id: 'env_FAL_KEY_1', envVarName: 'FAL_KEY_1', label: 'Server fal.ai Slot 1 (FAL_KEY_1)', defaultPriority: 11 },
  { id: 'env_FAL_KEY_2', envVarName: 'FAL_KEY_2', label: 'Server fal.ai Slot 2 (FAL_KEY_2)', defaultPriority: 12 },
  { id: 'env_FAL_KEY_3', envVarName: 'FAL_KEY_3', label: 'Server fal.ai Slot 3 (FAL_KEY_3)', defaultPriority: 13 },
] as const;

export function scrubSecretText(text: string): string {
  let sanitized = String(text || '');
  // Redact standard Google API key patterns
  sanitized = sanitized.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]');
  // Redact standard fal.ai key patterns & headers
  sanitized = sanitized.replace(/\bfal_[0-9A-Za-z_-]{16,}/g, '[REDACTED_FAL_KEY]');
  sanitized = sanitized.replace(/(Authorization:\s*Key\s+)[^\s"']+/gi, '$1[REDACTED_FAL_KEY]');

  // Redact any known active server keys (Gemini + fal.ai env slots & Admin Vault)
  const vault = readVaultData();
  const rawKeys = [
    ...ENV_KEY_SLOT_NAMES.map((slot) => process.env[slot.envVarName]),
    ...FAL_ENV_KEY_SLOT_NAMES.map((slot) => process.env[slot.envVarName]),
    ...vault.keys.map((k) => {
      try {
        return decryptText(k.encryptedKey);
      } catch {
        return '';
      }
    }),
    ...vault.falKeys.map((k) => {
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
  if (/^fal_/i.test(cleanKey) || /^[0-9a-f-]{16,}:[0-9a-f-]{16,}$/i.test(cleanKey)) {
    throw new Error('Looks like a fal.ai key. Add fal.ai credentials inside the separate fal.ai API Key Vault section.');
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

  writeVaultData(vault, {
    healthDelta: {
      provider: 'gemini',
      keyId,
      projectId: resolvedProjectId,
    },
  });
}

// ============================================================================
// ISOLATED fal.ai PROVIDER NAMESPACE (Never mixed with Google Gemini keys)
// ============================================================================

function getRuntimeFalEnvKeys(): Array<{
  id: string;
  envVarName: string;
  label: string;
  rawKey: string;
  defaultPriority: number;
}> {
  const seenValues = new Set<string>();
  const active: Array<{
    id: string;
    envVarName: string;
    label: string;
    rawKey: string;
    defaultPriority: number;
  }> = [];

  for (const item of FAL_ENV_KEY_SLOT_NAMES) {
    const val = (process.env[item.envVarName] || '').trim();
    if (!val || seenValues.has(val)) continue;
    seenValues.add(val);
    active.push({
      id: item.id,
      envVarName: item.envVarName,
      label: item.label,
      rawKey: val,
      defaultPriority: item.defaultPriority,
    });
  }
  return active;
}

export function getFalConfig(): FalAiConfigState {
  return readVaultData().falConfig;
}

export function updateFalConfig(patch: Partial<FalAiConfigState>): FalAiConfigState {
  const vault = readVaultData();
  const validFalIds = new Set(VERIFIED_FAL_MODELS.map((m) => m.id));

  if (typeof patch.enableFalKeyFallback === 'boolean') {
    vault.falConfig.enableFalKeyFallback = patch.enableFalKeyFallback;
  }
  if (typeof patch.enableFalImageFallback === 'boolean') {
    vault.falConfig.enableFalImageFallback = patch.enableFalImageFallback;
  }
  if (typeof patch.enableFalVideoFallback === 'boolean') {
    vault.falConfig.enableFalVideoFallback = patch.enableFalVideoFallback;
  }
  if (typeof patch.preferFalForVideo === 'boolean') {
    vault.falConfig.preferFalForVideo = patch.preferFalForVideo;
  }
  if (typeof patch.maxConcurrentPerKey === 'number' && Number.isFinite(patch.maxConcurrentPerKey)) {
    vault.falConfig.maxConcurrentPerKey = Math.max(1, Math.min(10, Math.round(patch.maxConcurrentPerKey)));
  }
  if (typeof patch.requestTimeoutSec === 'number' && Number.isFinite(patch.requestTimeoutSec)) {
    vault.falConfig.requestTimeoutSec = Math.max(10, Math.min(180, Math.round(patch.requestTimeoutSec)));
  }
  if (typeof patch.maxQueueWaitSec === 'number' && Number.isFinite(patch.maxQueueWaitSec)) {
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

export function listResolvedFalKeys(): ResolvedExecutableFalKey[] {
  const vault = readVaultData();
  const now = Date.now();
  const resolved: ResolvedExecutableFalKey[] = [];

  for (const rec of vault.falKeys) {
    let rawKey = '';
    try {
      rawKey = decryptText(rec.encryptedKey).trim();
    } catch {
      rawKey = '';
    }
    if (!rawKey) continue;
    const isCooldownExpired = rec.cooldownUntil && rec.cooldownUntil <= now;
    const status: KeyHealthStatus = !rec.enabled
      ? 'disabled'
      : rec.status === 'quota_exhausted' && isCooldownExpired
      ? 'ready'
      : rec.status === 'error' && isCooldownExpired
      ? 'ready'
      : rec.status;
    resolved.push({
      id: rec.id,
      label: rec.label,
      rawKey,
      source: 'admin_vault',
      enabled: rec.enabled,
      priority: rec.priority,
      status,
      quotaScope: isCooldownExpired && rec.status === 'quota_exhausted' ? undefined : rec.quotaScope,
      cooldownUntil: isCooldownExpired ? undefined : rec.cooldownUntil,
    });
  }

  for (const envItem of getRuntimeFalEnvKeys()) {
    const ov = vault.falEnvOverrides[envItem.id];
    const enabled = ov ? ov.enabled : true;
    const isCooldownExpired = ov?.cooldownUntil && ov.cooldownUntil <= now;
    const rawStatus = ov?.status || 'ready';
    const status: KeyHealthStatus = !enabled
      ? 'disabled'
      : (rawStatus === 'quota_exhausted' || rawStatus === 'error') && isCooldownExpired
      ? 'ready'
      : rawStatus;

    resolved.push({
      id: envItem.id,
      label: envItem.label,
      rawKey: envItem.rawKey,
      source: 'runtime_env',
      enabled,
      priority: ov?.priority ?? envItem.defaultPriority,
      status,
      quotaScope: isCooldownExpired && rawStatus === 'quota_exhausted' ? undefined : ov?.quotaScope,
      cooldownUntil: isCooldownExpired ? undefined : ov?.cooldownUntil,
    });
  }

  return resolved.sort((a, b) => a.priority - b.priority);
}

export function listSafeFalKeySummaries(): SafeFalKeySummary[] {
  const vault = readVaultData();
  const now = Date.now();
  const summaries: SafeFalKeySummary[] = [];

  for (const rec of vault.falKeys) {
    let raw = '';
    try {
      raw = decryptText(rec.encryptedKey).trim();
    } catch {
      raw = '';
    }
    const isCooldownExpired = rec.cooldownUntil && rec.cooldownUntil <= now;
    const status: KeyHealthStatus = !rec.enabled
      ? 'disabled'
      : (rec.status === 'quota_exhausted' || rec.status === 'error') && isCooldownExpired
      ? 'ready'
      : rec.status;

    summaries.push({
      id: rec.id,
      label: rec.label,
      maskedKey: raw ? maskSecretValue(raw) : 'Decrypt Error',
      source: 'admin_vault',
      enabled: rec.enabled,
      priority: rec.priority,
      status,
      quotaScope: isCooldownExpired && rec.status === 'quota_exhausted' ? undefined : rec.quotaScope,
      failureCount: rec.failureCount || 0,
      consecutiveFailures: rec.consecutiveFailures || 0,
      lastError: rec.lastError,
      lastTestedAt: rec.lastTestedAt,
      cooldownUntil: isCooldownExpired ? undefined : rec.cooldownUntil,
    });
  }

  for (const envItem of getRuntimeFalEnvKeys()) {
    const ov = vault.falEnvOverrides[envItem.id];
    const enabled = ov ? ov.enabled : true;
    const isCooldownExpired = ov?.cooldownUntil && ov.cooldownUntil <= now;
    const rawStatus = ov?.status || 'ready';
    const status: KeyHealthStatus = !enabled
      ? 'disabled'
      : (rawStatus === 'quota_exhausted' || rawStatus === 'error') && isCooldownExpired
      ? 'ready'
      : rawStatus;

    summaries.push({
      id: envItem.id,
      label: envItem.label,
      maskedKey: maskSecretValue(envItem.rawKey),
      source: 'runtime_env',
      envVarName: envItem.envVarName,
      enabled,
      priority: ov?.priority ?? envItem.defaultPriority,
      status,
      quotaScope: isCooldownExpired && rawStatus === 'quota_exhausted' ? undefined : ov?.quotaScope,
      failureCount: ov?.failureCount || 0,
      consecutiveFailures: ov?.consecutiveFailures || 0,
      lastError: ov?.lastError,
      lastTestedAt: ov?.lastTestedAt,
      cooldownUntil: isCooldownExpired ? undefined : ov?.cooldownUntil,
    });
  }

  return summaries.sort((a, b) => a.priority - b.priority);
}

export function listFalModelHealthSummaries(): FalModelHealthRecord[] {
  const vault = readVaultData();
  const now = Date.now();
  return Object.values(vault.falModelHealth || {})
    .map((rec) => {
      if (rec.status === 'error' && rec.cooldownUntil && rec.cooldownUntil <= now) {
        return { ...rec, status: 'ready' as const, cooldownUntil: undefined };
      }
      return rec;
    })
    .sort((a, b) => a.modelId.localeCompare(b.modelId));
}

function validateFalApiKeyFormat(rawKey: string): string {
  const cleanKey = (rawKey || '').trim();
  if (!cleanKey || cleanKey.length < 16 || /\s/.test(cleanKey)) {
    throw new Error('Please enter a valid fal.ai API key.');
  }
  if (/^AIza/i.test(cleanKey)) {
    throw new Error(
      'This looks like a Google Gemini API key (AIza...). Add Gemini keys in the Google Gemini Vault above.'
    );
  }
  return cleanKey;
}

export function addFalVaultApiKey(params: {
  label: string;
  apiKey: string;
  priority?: number;
}): SafeFalKeySummary {
  const cleanKey = validateFalApiKeyFormat(params.apiKey);
  const cleanLabel = (params.label || '').trim() || `fal.ai Key ${Date.now().toString().slice(-4)}`;
  const vault = readVaultData();

  const id = `fk_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const nowIso = new Date().toISOString();
  const nextPriority =
    typeof params.priority === 'number' && Number.isFinite(params.priority)
      ? Math.max(1, Math.min(999, Math.round(params.priority)))
      : vault.falKeys.length + 1;

  vault.falKeys.push({
    id,
    label: cleanLabel.slice(0, 60),
    encryptedKey: encryptText(cleanKey),
    enabled: true,
    priority: nextPriority,
    status: 'ready',
    failureCount: 0,
    consecutiveFailures: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  writeVaultData(vault, { strictRemoteSecret: true });
  return listSafeFalKeySummaries().find((k) => k.id === id)!;
}

export function updateFalVaultApiKey(
  keyId: string,
  patch: {
    label?: string;
    apiKey?: string;
    enabled?: boolean;
    priority?: number;
    resetHealth?: boolean;
  }
): SafeFalKeySummary | null {
  const vault = readVaultData();

  if (keyId.startsWith('env_FAL_')) {
    const envItem = getRuntimeFalEnvKeys().find((e) => e.id === keyId);
    if (!envItem) return null;
    const prev = vault.falEnvOverrides[keyId] || {
      enabled: true,
      priority: envItem.defaultPriority,
      status: 'ready' as KeyHealthStatus,
    };
    const nextEnabled = typeof patch.enabled === 'boolean' ? patch.enabled : prev.enabled;
    vault.falEnvOverrides[keyId] = {
      ...prev,
      enabled: nextEnabled,
      priority:
        typeof patch.priority === 'number' && Number.isFinite(patch.priority)
          ? Math.max(1, Math.min(999, Math.round(patch.priority)))
          : prev.priority,
      status: patch.resetHealth
        ? nextEnabled
          ? 'ready'
          : 'disabled'
        : !nextEnabled
        ? 'disabled'
        : prev.status === 'disabled'
        ? 'ready'
        : prev.status,
      quotaScope: patch.resetHealth ? undefined : prev.quotaScope,
      consecutiveFailures: patch.resetHealth ? 0 : prev.consecutiveFailures,
      lastError: patch.resetHealth ? undefined : prev.lastError,
      cooldownUntil: patch.resetHealth ? undefined : prev.cooldownUntil,
    };

    writeVaultData(vault, { strictRemoteSecret: true });
    return listSafeFalKeySummaries().find((k) => k.id === keyId) || null;
  }

  const idx = vault.falKeys.findIndex((k) => k.id === keyId);
  if (idx === -1) return null;
  const current = vault.falKeys[idx];
  const updatedEnabled = typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled;
  let updatedEncrypted = current.encryptedKey;
  let updatedStatus = current.status;
  let updatedQuotaScope = current.quotaScope;
  let updatedError = current.lastError;
  let updatedCooldown = current.cooldownUntil;
  let updatedConsecutive = current.consecutiveFailures || 0;

  if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
    const cleanNew = validateFalApiKeyFormat(patch.apiKey);
    updatedEncrypted = encryptText(cleanNew);
    updatedStatus = updatedEnabled ? 'ready' : 'disabled';
    updatedQuotaScope = undefined;
    updatedError = undefined;
    updatedCooldown = undefined;
    updatedConsecutive = 0;
  } else if (patch.resetHealth) {
    updatedStatus = updatedEnabled ? 'ready' : 'disabled';
    updatedQuotaScope = undefined;
    updatedError = undefined;
    updatedCooldown = undefined;
    updatedConsecutive = 0;
  } else if (typeof patch.enabled === 'boolean') {
    updatedStatus = updatedEnabled ? (current.status === 'disabled' ? 'ready' : current.status) : 'disabled';
  }

  vault.falKeys[idx] = {
    ...current,
    label: typeof patch.label === 'string' && patch.label.trim() ? patch.label.trim().slice(0, 60) : current.label,
    encryptedKey: updatedEncrypted,
    enabled: updatedEnabled,
    priority:
      typeof patch.priority === 'number' && Number.isFinite(patch.priority)
        ? Math.max(1, Math.min(999, Math.round(patch.priority)))
        : current.priority,
    status: updatedStatus,
    quotaScope: updatedQuotaScope,
    consecutiveFailures: updatedConsecutive,
    lastError: updatedError,
    cooldownUntil: updatedCooldown,
    updatedAt: new Date().toISOString(),
  };

  writeVaultData(vault, { strictRemoteSecret: true });
  return listSafeFalKeySummaries().find((k) => k.id === keyId) || null;
}

export function deleteFalVaultApiKey(keyId: string): boolean {
  if (keyId.startsWith('env_FAL_')) {
    throw new Error('Runtime server fal.ai environment keys cannot be deleted; disable them instead.');
  }
  const vault = readVaultData();
  const nextKeys = vault.falKeys.filter((k) => k.id !== keyId);
  if (nextKeys.length === vault.falKeys.length) return false;
  vault.falKeys = nextKeys;
  writeVaultData(vault, { strictRemoteSecret: true });
  return true;
}

export function recordFalKeyHealthResult(
  keyId: string,
  result: {
    status: KeyHealthStatus;
    error?: string;
    cooldownMs?: number;
    quotaScope?: FalQuotaScope;
    incrementFailure?: boolean;
    testedAt?: string;
  }
): void {
  const vault = readVaultData();
  const now = Date.now();
  const safeError = result.error ? scrubSecretText(result.error).slice(0, 240) : undefined;
  const cooldownUntil = result.cooldownMs && result.cooldownMs > 0 ? now + result.cooldownMs : undefined;
  const testedAt = result.testedAt || new Date(now).toISOString();
  const isFailure = Boolean(result.incrementFailure) || result.status !== 'ready';

  if (keyId.startsWith('env_FAL_')) {
    const envItem = getRuntimeFalEnvKeys().find((e) => e.id === keyId);
    const prev = vault.falEnvOverrides[keyId] || {
      enabled: true,
      priority: envItem?.defaultPriority ?? 10,
      status: 'ready' as KeyHealthStatus,
      failureCount: 0,
      consecutiveFailures: 0,
    };
    vault.falEnvOverrides[keyId] = {
      ...prev,
      status: prev.enabled ? result.status : 'disabled',
      quotaScope: result.status === 'ready' ? undefined : result.quotaScope,
      failureCount: isFailure ? (prev.failureCount || 0) + 1 : prev.failureCount || 0,
      consecutiveFailures: isFailure ? (prev.consecutiveFailures || 0) + 1 : 0,
      lastError: result.status === 'ready' ? undefined : safeError,
      lastTestedAt: testedAt,
      cooldownUntil,
    };
  } else {
    const idx = vault.falKeys.findIndex((k) => k.id === keyId);
    if (idx === -1) return;
    const cur = vault.falKeys[idx];

    vault.falKeys[idx] = {
      ...cur,
      status: cur.enabled ? result.status : 'disabled',
      quotaScope: result.status === 'ready' ? undefined : result.quotaScope,
      failureCount: isFailure ? (cur.failureCount || 0) + 1 : cur.failureCount || 0,
      consecutiveFailures: isFailure ? (cur.consecutiveFailures || 0) + 1 : 0,
      lastError: result.status === 'ready' ? undefined : safeError,
      lastTestedAt: testedAt,
      cooldownUntil,
      updatedAt: testedAt,
    };
  }

  writeVaultData(vault, {
    healthDelta: {
      provider: 'fal',
      keyId,
    },
  });
}

export function recordFalModelHealthResult(
  modelId: string,
  result: {
    status: 'ready' | 'error';
    error?: string;
    cooldownMs?: number;
  }
): void {
  const cleanId = (modelId || '').trim();
  if (!cleanId) return;
  const vault = readVaultData();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const prev = vault.falModelHealth[cleanId];
  const safeError = result.error ? scrubSecretText(result.error).slice(0, 240) : undefined;

  if (result.status === 'ready') {
    vault.falModelHealth[cleanId] = {
      modelId: cleanId,
      status: 'ready',
      failureCount: prev?.failureCount || 0,
      updatedAt: nowIso,
    };
  } else {
    vault.falModelHealth[cleanId] = {
      modelId: cleanId,
      status: 'error',
      failureCount: (prev?.failureCount || 0) + 1,
      cooldownUntil: result.cooldownMs && result.cooldownMs > 0 ? now + result.cooldownMs : undefined,
      lastError: safeError,
      updatedAt: nowIso,
    };
  }

  writeVaultData(vault, {
    healthDelta: {
      provider: 'fal',
      falModelId: cleanId,
    },
  });
}

