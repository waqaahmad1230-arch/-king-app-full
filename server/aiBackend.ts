import { GoogleGenAI } from '@google/genai';
import cloudinaryPkg from 'cloudinary';
const cloudinary = cloudinaryPkg.v2;
import {
  getBackendHost,
  getPublicAiCapabilityStatus,
  getPublicAiCapabilityStatusAsync,
  type KeyDiagnosticStatus,
  type PublicAiCapabilityStatus,
} from './aiStatus.ts';
import {
  isVerifiedSuperAdmin,
  SUPER_ADMIN_EMAIL,
  verifyFirebaseBearerToken,
  type VerifiedCaller,
} from '../api/_lib/authBackend.ts';
import {
  getCloudinaryCredentials,
} from '../api/_lib/statusBackend.ts';
import {
  addVaultApiKey,
  deleteVaultApiKey,
  flushRemoteVaultWrites,
  getModelConfig,
  getVaultPersistenceInfo,
  listProjectHealthSummaries,
  listResolvedKeys,
  listSafeKeySummaries,
  recordKeyHealthResult,
  scrubSecretText,
  syncVaultFromRemote,
  updateModelConfig,
  updateVaultApiKey,
  VERIFIED_GEMINI_MODELS,
  type AiModelConfigState,
  type ImageQualityTier,
  type ImageSelectionPolicy,
  type ProjectHealthRecord,
  type QuotaScope,
  type ResolvedExecutableKey,
  type SafeKeySummary,
  type VaultPersistenceInfo,
  type VerifiedGeminiModelSpec,
} from './aiVault.ts';

export {
  getPublicAiCapabilityStatus,
  getPublicAiCapabilityStatusAsync,
  isVerifiedSuperAdmin,
  type KeyDiagnosticStatus,
  type PublicAiCapabilityStatus,
};

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_PROMPT_LENGTH = 2000;
const MAX_IMAGE_BASE64_CHARS = 12 * 1024 * 1024;
const VERCEL_SAFE_BASE64_THRESHOLD = 3_400_000;
const VERCEL_HARD_BASE64_LIMIT = 4_200_000;
const RPM_COOLDOWN_MS = 60 * 1000;
const MAX_RPM_COOLDOWN_MS = 180 * 1000;
const MIN_DAILY_RPD_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_DAILY_RPD_COOLDOWN_MS = 24 * 60 * 60 * 1000 + 60 * 1000;
const DAILY_RPD_FALLBACK_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export function getMsUntilDailyQuotaReset(nowMs = Date.now()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(nowMs));
    const map = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]));
    const hour = Number.isFinite(map.hour) ? map.hour % 24 : 0;
    const minute = Number.isFinite(map.minute) ? map.minute : 0;
    const second = Number.isFinite(map.second) ? map.second : 0;
    const elapsedSecondsToday = hour * 3600 + minute * 60 + second;
    const secondsUntilMidnight = Math.max(0, 86400 - elapsedSecondsToday) + 60;
    const ms = secondsUntilMidnight * 1000;
    return Math.min(MAX_DAILY_RPD_COOLDOWN_MS, Math.max(MIN_DAILY_RPD_COOLDOWN_MS, ms));
  } catch {
    return DAILY_RPD_FALLBACK_COOLDOWN_MS;
  }
}

export type AiTaskType =
  | 'text_chat'
  | 'photo_generation'
  | 'photo_editing'
  | 'video_generation'
  | 'image_to_video'
  | 'video_editing';

export type AiExecutionDomain = 'text' | 'image' | 'video';

export interface AiRoutingDecision {
  detectedTask: AiTaskType;
  domain: AiExecutionDomain;
  selectedTier: ImageQualityTier | 'pro_assistant' | 'omni_video';
  selectedModel: string;
  candidateModels: string[];
  isVoiceRequest: boolean;
  reason: string;
}

export interface AiClientAdapter {
  generateContent: (params: {
    model: string;
    contents: any;
    config?: any;
  }) => Promise<any>;
  createInteraction?: (params: any, options?: any) => Promise<any>;
}

export type AiClientFactory = (apiKey: string, apiVersion?: 'v1' | 'v1beta') => AiClientAdapter;

function defaultClientFactory(apiKey: string, apiVersion?: 'v1' | 'v1beta'): AiClientAdapter {
  const ai = new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  return {
    generateContent: (params) => ai.models.generateContent(params),
    createInteraction: (params, options) => (ai.interactions as any).create(params, options),
  };
}

export interface AdminAiManagerState {
  ok: true;
  backendHost: 'nodejs-express' | 'vercel-serverless';
  storageMode: 'aes-256-gcm-backend-vault';
  persistence: VaultPersistenceInfo;
  models: Array<
    VerifiedGeminiModelSpec & {
      enabled: boolean;
      isPrimary: boolean;
    }
  >;
  modelConfig: AiModelConfigState;
  keys: SafeKeySummary[];
  projects?: ProjectHealthRecord[];
}

export type ClassifiedErrorKind =
  | 'INVALID_KEY'
  | 'QUOTA_EXCEEDED'
  | 'MODEL_UNAVAILABLE'
  | 'BAD_REQUEST'
  | 'UPSTREAM_TRANSIENT';

export interface ClassifiedGeminiError {
  kind: ClassifiedErrorKind;
  httpStatus: number;
  code: string;
  message: string;
  quotaScope?: QuotaScope;
  retryAfterMs?: number;
}

function extractRetryAfterMs(text: string): number | undefined {
  const retryMatch = text.match(/(?:retry in|retrydelay["':\s]+)(\d+(?:\.\d+)?)\s*s/i);
  if (retryMatch) {
    const secs = Number(retryMatch[1]);
    if (Number.isFinite(secs) && secs > 0) {
      return Math.round(secs * 1000);
    }
  }
  return undefined;
}

export function resolveCooldownForQuotaError(
  classified: ClassifiedGeminiError,
  nowMs = Date.now()
): {
  keyCooldownMs: number;
  projectCooldownMs?: number;
  quotaScope: QuotaScope;
} {
  const scope: QuotaScope = classified.quotaScope || 'rpm_throttle';
  if (scope === 'daily_rpd' || scope === 'billing') {
    const dailyMs = getMsUntilDailyQuotaReset(nowMs);
    return {
      keyCooldownMs: dailyMs,
      projectCooldownMs: dailyMs,
      quotaScope: scope,
    };
  }
  const rpmMs = classified.retryAfterMs
    ? Math.min(MAX_RPM_COOLDOWN_MS, Math.max(30_000, classified.retryAfterMs))
    : RPM_COOLDOWN_MS;
  return {
    keyCooldownMs: rpmMs,
    projectCooldownMs: rpmMs,
    quotaScope: 'rpm_throttle',
  };
}

const PER_ATTEMPT_TIMEOUT_MS_VERCEL = 28_000;
const PER_ATTEMPT_TIMEOUT_MS_NODE = 90_000;
const TOTAL_RUN_BUDGET_MS_VERCEL = 50_000;
const TOTAL_RUN_BUDGET_MS_NODE = 150_000;

export class BadJsonBodyError extends Error {
  status = 400;
  code = 'INVALID_JSON_BODY';
  constructor(message = 'Invalid JSON request body.') {
    super(message);
    this.name = 'BadJsonBodyError';
  }
}

export function parseRequestJsonBody(rawBody: any): Record<string, any> {
  if (rawBody === undefined || rawBody === null || rawBody === '') return {};
  if (typeof rawBody === 'string') {
    const trimmed = rawBody.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new BadJsonBodyError('Request body must be a JSON object.');
      }
      return parsed;
    } catch (err: any) {
      if (err instanceof BadJsonBodyError) throw err;
      throw new BadJsonBodyError('Malformed JSON request body.');
    }
  }
  if (typeof rawBody === 'object' && !Array.isArray(rawBody)) {
    return rawBody;
  }
  throw new BadJsonBodyError('Request body must be a JSON object.');
}

export function normalizeAiEndpointResult(
  result: { status?: number; payload?: any },
  options?: { requireImage?: boolean; requireText?: boolean }
): { status: number; payload: Record<string, any> } {
  const rawPayload =
    result?.payload && typeof result.payload === 'object' && !Array.isArray(result.payload)
      ? { ...result.payload }
      : {
          ok: false,
          code: 'INVALID_BACKEND_PAYLOAD',
          error: 'AI backend produced an invalid payload structure.',
        };

  if (typeof rawPayload.error === 'string') {
    rawPayload.error = scrubSecretText(rawPayload.error);
  }
  if (typeof rawPayload.note === 'string') {
    rawPayload.note = scrubSecretText(rawPayload.note);
  }

  let status = typeof result?.status === 'number' && result.status >= 100 ? result.status : 500;

  // Critical invariant: NEVER return HTTP 200 for an unsuccessful payload
  if (rawPayload.ok !== true) {
    if (status >= 200 && status < 300) {
      status = 502;
    }
    if (!rawPayload.error) {
      rawPayload.error = 'AI request failed.';
    }
    rawPayload.ok = false;
    return { status, payload: rawPayload };
  }

  // Critical invariant: Photo edit HTTP 200 MUST contain imageBase64 or imageUrl
  if (options?.requireImage) {
    const hasImg =
      (typeof rawPayload.imageBase64 === 'string' && rawPayload.imageBase64.trim().length > 0) ||
      (typeof rawPayload.imageUrl === 'string' && rawPayload.imageUrl.trim().length > 0);
    if (!hasImg) {
      return {
        status: 502,
        payload: {
          ok: false,
          code: 'GEMINI_NO_IMAGE_OUTPUT',
          error: 'Gemini completed without returning generated image data.',
        },
      };
    }
  }

  // Critical invariant: Text generate HTTP 200 MUST contain text
  if (options?.requireText) {
    const hasText = typeof rawPayload.text === 'string' && rawPayload.text.trim().length > 0;
    if (!hasText) {
      return {
        status: 502,
        payload: {
          ok: false,
          code: 'GEMINI_NO_TEXT_OUTPUT',
          error: 'Gemini completed without returning generated text.',
        },
      };
    }
  }

  return { status, payload: rawPayload };
}

export function sendNormalizedAiJson(
  res: any,
  status: number,
  payload: any,
  options?: { requireImage?: boolean; requireText?: boolean }
) {
  const normalized = normalizeAiEndpointResult({ status, payload }, options);
  if (typeof res?.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
  }
  return res.status(normalized.status).json(normalized.payload);
}

async function withExecutionTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          const timeoutErr: any = new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`);
          timeoutErr.status = 504;
          timeoutErr.code = 'DEADLINE_EXCEEDED';
          reject(timeoutErr);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function classifyGeminiError(err: any, modelId?: string): ClassifiedGeminiError {
  const extraDetails = (() => {
    try {
      const detailCandidates = [
        err?.errorDetails,
        err?.details,
        err?.error?.details,
        err?.error?.message,
        err?.error?.status,
        err?.cause?.message,
      ].filter(Boolean);
      if (detailCandidates.length > 0) {
        return scrubSecretText(JSON.stringify(detailCandidates));
      }
    } catch {
      return '';
    }
    return '';
  })();
  const rawMessage = scrubSecretText(String(err?.message || err || 'AI processing failed.'));
  const combined = `${rawMessage} ${extraDetails}`.trim();
  const lower = combined.toLowerCase();
  const statusCode = Number(err?.status || err?.code || err?.error?.code || err?.response?.status || 0);

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key') ||
    lower.includes('unauthenticated')
  ) {
    return {
      kind: 'INVALID_KEY',
      httpStatus: 403,
      code: 'GEMINI_KEY_INVALID',
      message: 'API key was rejected or lacks Gemini API permission.',
    };
  }

  if (
    statusCode === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('quotafailure')
  ) {
    const retryAfterMs = extractRetryAfterMs(combined);
    const isBilling =
      /check your plan and billing|billing account|billing_not_active|spend limit/i.test(combined);
    const isDailyQuota =
      isBilling ||
      /requests_?per_?day|per_?day|\brpd\b|daily[_ ]?(?:quota|limit|requests)|generate_?content_?free_?tier_?requests.*(?:day|0)|free_?tier.*(?:per_?day|limit["':\s]+0)|"limit"\s*:\s*"?0"?|\blimit:\s*0\b/i.test(
        combined
      );
    const quotaScope: QuotaScope = isBilling
      ? 'billing'
      : isDailyQuota
      ? 'daily_rpd'
      : 'rpm_throttle';

    return {
      kind: 'QUOTA_EXCEEDED',
      httpStatus: 429,
      code:
        quotaScope === 'rpm_throttle'
          ? 'GEMINI_RPM_RATE_LIMITED'
          : quotaScope === 'billing'
          ? 'GEMINI_BILLING_QUOTA_EXCEEDED'
          : 'GEMINI_DAILY_QUOTA_EXCEEDED',
      message:
        quotaScope === 'rpm_throttle'
          ? 'Gemini API per-minute rate limit (RPM) reached for this project.'
          : quotaScope === 'billing'
          ? 'Gemini project billing or spend quota is exhausted.'
          : 'Gemini project daily quota (RPD) is exhausted.',
      quotaScope,
      retryAfterMs,
    };
  }

  if (
    statusCode === 404 ||
    lower.includes('not_found') ||
    lower.includes('is not found') ||
    lower.includes('not supported for generatecontent')
  ) {
    return {
      kind: 'MODEL_UNAVAILABLE',
      httpStatus: 404,
      code: 'GEMINI_MODEL_UNAVAILABLE',
      message: `Gemini model (${modelId || 'selected'}) is unavailable or requires a higher API tier.`,
    };
  }

  if (statusCode === 400 || lower.includes('invalid_argument') || lower.includes('safety')) {
    return {
      kind: 'BAD_REQUEST',
      httpStatus: 400,
      code: 'GEMINI_BAD_REQUEST',
      message: rawMessage || 'Request could not be processed by Gemini.',
    };
  }

  return {
    kind: 'UPSTREAM_TRANSIENT',
    httpStatus: 502,
    code: 'GEMINI_UPSTREAM_ERROR',
    message: rawMessage || 'Temporary upstream Gemini error.',
  };
}

export function getAdminAiState(): AdminAiManagerState {
  const modelConfig = getModelConfig();
  const keys = listSafeKeySummaries();
  const models = VERIFIED_GEMINI_MODELS.map((spec) => ({
    ...spec,
    enabled: Boolean(modelConfig.enabledModels[spec.id]),
    isPrimary:
      spec.id === modelConfig.primaryImageModel ||
      spec.id === modelConfig.primaryTextModel ||
      spec.id === modelConfig.primaryVideoModel,
  }));
  return {
    ok: true,
    backendHost: getBackendHost(),
    storageMode: 'aes-256-gcm-backend-vault',
    persistence: getVaultPersistenceInfo(),
    models,
    modelConfig,
    keys,
    projects: listProjectHealthSummaries(),
  };
}

export async function getAdminAiStateAsync(): Promise<AdminAiManagerState> {
  await syncVaultFromRemote(true);
  return getAdminAiState();
}

let projectRotationCursor = 0;

export function resetProjectRotationCursorForTests(value = 0): void {
  projectRotationCursor = value;
}

export function getEligibleKeysForExecution(options?: {
  overrideKeys?: ResolvedExecutableKey[];
  overrideConfig?: AiModelConfigState;
  overrideProjectHealth?: ProjectHealthRecord[];
  allowFallback?: boolean;
  rotateProjects?: boolean;
}): ResolvedExecutableKey[] {
  const now = Date.now();
  const allKeys = [...(options?.overrideKeys || listResolvedKeys())].sort(
    (a, b) => a.priority - b.priority
  );
  const modelCfg = options?.overrideConfig || getModelConfig();
  const allowFallback =
    typeof options?.allowFallback === 'boolean'
      ? options.allowFallback
      : modelCfg.enableKeyFallback;

  const projectHealthList = options?.overrideProjectHealth || listProjectHealthSummaries();
  const activeCooldownProjects = new Set<string>();
  for (const ph of projectHealthList) {
    if (ph.status === 'quota_exhausted' && ph.cooldownUntil && ph.cooldownUntil > now) {
      activeCooldownProjects.add(ph.projectId);
    }
  }

  const eligible = allKeys.filter((k) => {
    if (!k.enabled || k.status === 'invalid' || k.status === 'disabled') return false;
    if (k.cooldownUntil && k.cooldownUntil > now) return false;
    if (k.projectCooldownUntil && k.projectCooldownUntil > now) return false;
    if (k.status === 'quota_exhausted' && (!k.cooldownUntil || k.cooldownUntil > now)) {
      // If overrideKeys explicitly passed status='quota_exhausted' without cooldown, keep excluded;
      // vault-resolved keys already reset status to 'ready' once cooldown expires.
      return false;
    }
    if (k.projectId && activeCooldownProjects.has(k.projectId)) return false;
    return true;
  });

  if (eligible.length <= 1) {
    return allowFallback ? eligible : eligible.slice(0, 1);
  }

  // Safe rotation between healthy Google Cloud projects + round-robin interleaving
  // so healthy projects share load and a single project's failure moves immediately to another project.
  const projectBuckets = new Map<string, ResolvedExecutableKey[]>();
  const ungrouped: ResolvedExecutableKey[] = [];

  for (const key of eligible) {
    if (key.projectId) {
      const bucket = projectBuckets.get(key.projectId) || [];
      bucket.push(key);
      projectBuckets.set(key.projectId, bucket);
    } else {
      ungrouped.push(key);
    }
  }

  let ordered: ResolvedExecutableKey[] = [];
  if (projectBuckets.size > 1) {
    const projectIds = Array.from(projectBuckets.keys());
    const startOffset =
      options?.rotateProjects === false ? 0 : projectRotationCursor % projectIds.length;
    if (options?.rotateProjects !== false) {
      projectRotationCursor = (projectRotationCursor + 1) % 100000;
    }
    const rotatedProjects = [
      ...projectIds.slice(startOffset),
      ...projectIds.slice(0, startOffset),
    ];
    const maxLen = Math.max(...rotatedProjects.map((pid) => projectBuckets.get(pid)!.length));
    for (let i = 0; i < maxLen; i++) {
      for (const pid of rotatedProjects) {
        const bucket = projectBuckets.get(pid)!;
        if (i < bucket.length) ordered.push(bucket[i]);
      }
    }
    ordered.push(...ungrouped);
  } else {
    ordered = eligible;
  }

  return allowFallback ? ordered : ordered.slice(0, 1);
}

function buildNoEligibleKeysResult(options?: {
  overrideKeys?: ResolvedExecutableKey[];
  overrideProjectHealth?: ProjectHealthRecord[];
}): { status: number; payload: Record<string, any> } {
  const allKeys = options?.overrideKeys || listResolvedKeys();
  const enabledKeys = allKeys.filter((k) => k.enabled);
  if (enabledKeys.length === 0) {
    return {
      status: 503,
      payload: {
        ok: false,
        code: 'AI_PROVIDER_NOT_CONFIGURED',
        error:
          'No active Gemini API keys are configured. Add or enable a valid API key in Admin Panel → AI Model Manager.',
      },
    };
  }

  const now = Date.now();
  const projectHealth = options?.overrideProjectHealth || listProjectHealthSummaries();
  const exhaustedProjects = new Set(
    projectHealth
      .filter((p) => p.status === 'quota_exhausted' && p.cooldownUntil && p.cooldownUntil > now)
      .map((p) => p.projectId.toLowerCase())
  );

  const quotaBlockedKeys = enabledKeys.filter(
    (k) =>
      k.status === 'quota_exhausted' ||
      (k.cooldownUntil && k.cooldownUntil > now) ||
      (k.projectCooldownUntil && k.projectCooldownUntil > now) ||
      (k.projectId && exhaustedProjects.has(k.projectId.toLowerCase()))
  );

  if (quotaBlockedKeys.length > 0) {
    const scopes = quotaBlockedKeys.map((k) => k.quotaScope).filter(Boolean);
    const hasDailyOrBilling =
      scopes.includes('daily_rpd') || scopes.includes('billing') || scopes.length === 0;
    const isBillingOnly = scopes.length > 0 && scopes.every((s) => s === 'billing');

    if (!hasDailyOrBilling) {
      return {
        status: 429,
        payload: {
          ok: false,
          code: 'GEMINI_RPM_RATE_LIMITED',
          error:
            'All configured Google Cloud Gemini projects/keys are temporarily rate-limited (RPM). Please wait a few seconds and try again.',
        },
      };
    }

    return {
      status: 429,
      payload: {
        ok: false,
        code: isBillingOnly ? 'GEMINI_BILLING_QUOTA_EXCEEDED' : 'GEMINI_DAILY_QUOTA_EXCEEDED',
        error:
          'All configured Google Cloud Gemini projects/keys have exhausted their daily quota (RPD). Add an API key from another Google Cloud project in Admin Panel → AI Model Manager or try again after the daily quota reset.',
      },
    };
  }

  if (enabledKeys.every((k) => k.status === 'invalid')) {
    return {
      status: 403,
      payload: {
        ok: false,
        code: 'GEMINI_KEY_INVALID',
        error:
          'All configured Gemini API keys were rejected or lack permission. Update keys in Admin Panel → AI Model Manager.',
      },
    };
  }

  return {
    status: 503,
    payload: {
      ok: false,
      code: 'AI_PROVIDER_NOT_CONFIGURED',
      error:
        'No active healthy Gemini API keys are available. Check key health in Admin Panel → AI Model Manager.',
    },
  };
}

function buildExhaustedFailureResult(params: {
  lastClassified: ClassifiedGeminiError | null;
  lastQuotaError: ClassifiedGeminiError | null;
  attempts: number;
  defaultCode: string;
  defaultMessage: string;
}): { status: number; payload: Record<string, any> } {
  const { lastClassified, lastQuotaError, attempts, defaultCode, defaultMessage } = params;
  if (lastClassified?.kind === 'QUOTA_EXCEEDED') {
    const scope = lastClassified.quotaScope || 'daily_rpd';
    return {
      status: 429,
      payload: {
        ok: false,
        code: lastClassified.code,
        quotaScope: scope,
        error:
          scope === 'rpm_throttle'
            ? 'All eligible Google Cloud Gemini projects/keys reached their per-minute rate limit (RPM). Please wait briefly and try again.'
            : scope === 'billing'
            ? 'All eligible Google Cloud Gemini projects/keys exceeded billing/spend quota.'
            : 'All eligible Google Cloud Gemini projects/keys have exhausted their daily quota (RPD). Add a key from another Google Cloud project or try again after reset.',
        attempts,
      },
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
        attempts,
      },
    };
  }

  return {
    status: 502,
    payload: {
      ok: false,
      code: defaultCode,
      error: defaultMessage,
      attempts,
    },
  };
}

const PRO_QUALITY_IMAGE_REGEX =
  /\b(4k|8k|ultra|studio|pro|professional|editorial|luxury|cinematic|poster|billboard|typography|exact text|logo design|product shoot|architecture|hyper[- ]?realistic|photorealistic|multi[- ]?reference|magazine|high[- ]?res(?:olution)?)\b/i;

const LITE_ECONOMY_IMAGE_REGEX =
  /\b(fast|quick|draft|preview|simple|minimal|sketch|icon|sticker|lite|economical|thumbnail|lighting|brighten|enhance quality|remove bg|remove background)\b/i;

const IMAGE_TO_VIDEO_REGEX =
  /\b(turn (?:this |the )?(?:photo|image|picture) into (?:an? )?(?:\w+\s+){0,4}(?:video|clip|reel|animation)|animate (?:this |the )?(?:photo|image|picture)|image[- ]?to[- ]?video|make (?:an? )?(?:\w+\s+){0,4}(?:video|clip|reel|animation) (?:from|of) (?:this|the)(?: (?:photo|image|picture))?)\b/i;

const VIDEO_EDIT_REGEX =
  /\b(edit|modify|change|extend|continue|replace|swap|stabilize|color grade|upscale)\b.{0,30}\b(video|clip|footage|reel)\b/i;

const VIDEO_GENERATION_REGEX =
  /\b(?:(?:generate|create|make|render|produce|shoot|animate|build)\b.{0,35}\b(video|clip|reel|short film|animation|motion clip|timelapse|time-lapse)|text[- ]?to[- ]?video|video generation)\b/i;

const PHOTO_EDIT_REGEX =
  /\b(?:(?:edit|retouch|upscale|fix|change background|remove background|remove object|enhance)\b.{0,30}\b(photo|image|picture|portrait|selfie))\b/i;

const PHOTO_GENERATION_REGEX =
  /\b(?:(?:generate|create|make|draw|paint|design|illustrate|sketch|render|show me)\b.{0,35}\b(image|photo|picture|portrait|logo|poster|wallpaper|avatar|artwork|illustration|banner|thumbnail|icon))\b/i;

export function classifyAiTaskIntent(params: {
  prompt: string;
  explicitTask?: AiTaskType | 'auto' | 'voice_request';
  mediaType?: string;
  hasSourceImage?: boolean;
  hasSourceVideo?: boolean;
  isVoiceRequest?: boolean;
  presetAction?: string;
}): {
  task: AiTaskType;
  domain: AiExecutionDomain;
  isVoiceRequest: boolean;
  reason: string;
} {
  const prompt = (params.prompt || '').trim();
  const mediaType = (params.mediaType || '').toLowerCase();
  const isVoiceRequest =
    Boolean(params.isVoiceRequest) || params.explicitTask === 'voice_request';

  // 1. Honor explicit domain tasks directly
  if (
    params.explicitTask &&
    params.explicitTask !== 'auto' &&
    params.explicitTask !== 'voice_request'
  ) {
    const task = params.explicitTask;
    const domain: AiExecutionDomain =
      task === 'text_chat'
        ? 'text'
        : task === 'photo_generation' || task === 'photo_editing'
        ? 'image'
        : 'video';
    return {
      task,
      domain,
      isVoiceRequest,
      reason: `Explicit task routing: ${task}`,
    };
  }

  // 2. Source video present -> video editing via Omni
  if (params.hasSourceVideo || (mediaType === 'video' && VIDEO_EDIT_REGEX.test(prompt))) {
    return {
      task: 'video_editing',
      domain: 'video',
      isVoiceRequest,
      reason: 'Source video or video-editing instruction detected; routing exclusively to Video AI (Omni).',
    };
  }

  // 3. Source image present: check whether user requested animation (image-to-video) vs photo edit
  if (params.hasSourceImage) {
    if (mediaType === 'video' || IMAGE_TO_VIDEO_REGEX.test(prompt)) {
      return {
        task: 'image_to_video',
        domain: 'video',
        isVoiceRequest,
        reason: 'Image-to-video animation intent detected; routing exclusively to Video AI (Omni).',
      };
    }
    return {
      task: 'photo_editing',
      domain: 'image',
      isVoiceRequest,
      reason: 'Source photo attached; routing strictly to Nano Banana Photo Editing AI.',
    };
  }

  // 4. Video workspace or voice/text video prompt without source media -> video generation
  if (mediaType === 'video' || VIDEO_GENERATION_REGEX.test(prompt)) {
    return {
      task: 'video_generation',
      domain: 'video',
      isVoiceRequest,
      reason: 'Video generation intent detected; routing exclusively to Video AI (Omni).',
    };
  }
  if (VIDEO_EDIT_REGEX.test(prompt)) {
    return {
      task: 'video_editing',
      domain: 'video',
      isVoiceRequest,
      reason: 'Video editing intent detected; routing exclusively to Video AI (Omni).',
    };
  }

  // 5. Photo workspace or voice/text photo prompt without source image
  if (PHOTO_EDIT_REGEX.test(prompt)) {
    return {
      task: 'photo_editing',
      domain: 'image',
      isVoiceRequest,
      reason: 'Photo editing intent detected; routing strictly to Nano Banana Photo AI.',
    };
  }
  if (mediaType === 'photo' || Boolean(params.presetAction?.trim()) || PHOTO_GENERATION_REGEX.test(prompt)) {
    return {
      task: 'photo_generation',
      domain: 'image',
      isVoiceRequest,
      reason: 'Photo generation intent detected; routing strictly to Nano Banana Photo AI.',
    };
  }

  // 6. Default: AI Chat, Q&A, Reasoning, Text Generation & general Voice Assistant queries
  return {
    task: 'text_chat',
    domain: 'text',
    isVoiceRequest,
    reason: isVoiceRequest
      ? 'Voice-transcribed assistant request detected; routing to Gemini 3.1 Pro.'
      : 'Assistant chat / Q&A / reasoning request detected; routing to Gemini 3.1 Pro.',
  };
}

export function selectAutoImageModelOrder(params: {
  prompt: string;
  presetAction?: string;
  hasSourceImage?: boolean;
  requestedModel?: string;
  qualityHint?: ImageQualityTier;
  overrideConfig?: AiModelConfigState;
}): {
  selectedTier: ImageQualityTier;
  orderedModels: string[];
  reason: string;
} {
  const cfg = params.overrideConfig || getModelConfig();
  // STRICT IMAGE DOMAIN ISOLATION: Only Nano Banana / capability==='image' models can EVER enter this pool.
  const enabledImageSpecs = VERIFIED_GEMINI_MODELS.filter(
    (m) => m.capability === 'image' && cfg.enabledModels[m.id]
  ).sort((a, b) => a.priority - b.priority);

  if (enabledImageSpecs.length === 0) {
    return {
      selectedTier: 'standard',
      orderedModels: [],
      reason: 'All image models are disabled in Admin Policy.',
    };
  }

  const primarySpec = enabledImageSpecs.find((s) => s.id === cfg.primaryImageModel) || enabledImageSpecs[0];
  const combinedText = `${params.presetAction || ''} ${params.prompt || ''}`.trim();
  let targetTier: ImageQualityTier = primarySpec?.qualityTier || 'lite';
  let reason = `Auto-selected photo model tier (${targetTier}).`;

  // Condition 10: Strictly enforce enableAutoRouting=false across image model selection
  if (!cfg.enableAutoRouting && !params.qualityHint) {
    targetTier = primarySpec?.qualityTier || 'lite';
    reason = `Auto-routing disabled: using configured primary image model (${cfg.primaryImageModel}) strictly.`;
  } else if (params.qualityHint) {
    targetTier = params.qualityHint;
    reason = `Explicit quality hint "${targetTier}" applied.`;
  } else if (cfg.imageSelectionPolicy === 'manual_primary') {
    targetTier = primarySpec?.qualityTier || 'lite';
    reason = `Admin policy enforces primary image model (${cfg.primaryImageModel}).`;
  } else if (cfg.imageSelectionPolicy === 'economy_first') {
    targetTier = 'lite';
    reason = 'Admin policy prefers economical fast photo model (Nano Banana 2 Lite).';
  } else if (cfg.imageSelectionPolicy === 'quality_first') {
    targetTier = 'pro';
    reason = 'Admin policy prefers premium studio quality photo model (Nano Banana Pro).';
  } else if (cfg.imageSelectionPolicy === 'balanced') {
    if (PRO_QUALITY_IMAGE_REGEX.test(combinedText)) {
      targetTier = 'pro';
      reason = 'High-detail / studio / typography cues detected -> auto-selected Nano Banana Pro.';
    } else if (
      LITE_ECONOMY_IMAGE_REGEX.test(combinedText) ||
      (params.presetAction && /lighting|enhance|remove bg/i.test(params.presetAction))
    ) {
      targetTier = 'lite';
      reason = 'Fast / quick-adjustment cues detected -> auto-selected Nano Banana 2 Lite.';
    } else {
      targetTier = 'standard';
      reason = params.hasSourceImage
        ? 'Standard photo editing task -> auto-selected Nano Banana 2.1 / standard.'
        : 'Standard photo generation task -> auto-selected Nano Banana 2.1 / standard.';
    }
  }

  const tierPriorityOrder: Record<ImageQualityTier, string[]> = {
    lite: [
      'gemini-3.1-flash-lite-image',
      'gemini-nano-banana-2.1',
      'gemini-3-pro-image',
      'gemini-3.1-flash-image',
      'gemini-2.5-flash-image',
    ],
    standard: [
      cfg.primaryImageModel,
      'gemini-nano-banana-2.1',
      'gemini-3.1-flash-lite-image',
      'gemini-3-pro-image',
      'gemini-3.1-flash-image',
      'gemini-2.5-flash-image',
    ],
    pro: [
      'gemini-3-pro-image',
      'gemini-nano-banana-2.1',
      'gemini-3.1-flash-lite-image',
      'gemini-3.1-flash-image',
      'gemini-2.5-flash-image',
    ],
  };

  const enabledSet = new Set(enabledImageSpecs.map((s) => s.id));
  const orderedIds: string[] = [];

  if (params.requestedModel && enabledSet.has(params.requestedModel)) {
    orderedIds.push(params.requestedModel);
    reason = `Manual image model override: ${params.requestedModel}.`;
  }

  if (
    (!cfg.enableAutoRouting || cfg.imageSelectionPolicy === 'manual_primary') &&
    enabledSet.has(cfg.primaryImageModel)
  ) {
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
    reason,
  };
}

export function getEligibleModelsForDomain(
  domain: AiExecutionDomain,
  options?: {
    requestedModel?: string;
    videoTask?: 'video_generation' | 'image_to_video' | 'video_editing';
    overrideConfig?: AiModelConfigState;
  }
): string[] {
  const cfg = options?.overrideConfig || getModelConfig();

  if (domain === 'image') {
    return selectAutoImageModelOrder({
      prompt: '',
      requestedModel: options?.requestedModel,
      overrideConfig: cfg,
    }).orderedModels;
  }

  if (domain === 'text') {
    // STRICT TEXT DOMAIN ISOLATION: Only capability === 'text' models
    const candidates = VERIFIED_GEMINI_MODELS.filter(
      (m) => m.capability === 'text' && cfg.enabledModels[m.id]
    ).sort((a, b) => a.priority - b.priority);

    const ordered: string[] = [];
    if (options?.requestedModel && candidates.some((m) => m.id === options.requestedModel)) {
      ordered.push(options.requestedModel);
    }
    if (candidates.some((m) => m.id === cfg.primaryTextModel) && !ordered.includes(cfg.primaryTextModel)) {
      ordered.push(cfg.primaryTextModel);
    }
    if (cfg.enableModelFallback) {
      for (const c of candidates) {
        if (!ordered.includes(c.id)) ordered.push(c.id);
      }
    }
    return ordered.slice(0, cfg.enableModelFallback ? ordered.length : 1);
  }

  // STRICT VIDEO DOMAIN ISOLATION: ONLY capability === 'omni' models supporting the exact video op.
  // NEVER includes any 'image' (Nano Banana) or 'text' model!
  const vTask = options?.videoTask || 'video_generation';
  const candidates = VERIFIED_GEMINI_MODELS.filter((m) => {
    if (m.capability !== 'omni' || !cfg.enabledModels[m.id]) return false;
    if (vTask === 'video_generation') return Boolean(m.supportsVideoGeneration);
    if (vTask === 'image_to_video') return Boolean(m.supportsImageToVideo);
    if (vTask === 'video_editing') return Boolean(m.supportsVideoEditing);
    return true;
  }).sort((a, b) => a.priority - b.priority);

  const ordered: string[] = [];
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

function buildPhotoInstruction(prompt: string, presetAction?: string, hasSourcePhoto?: boolean): string {
  const cleanPrompt = prompt.trim();
  const actionContext =
    typeof presetAction === 'string' && presetAction.trim()
      ? `Requested tool: ${presetAction.trim()}. `
      : '';
  if (hasSourcePhoto) {
    return [
      'Edit the provided user photo faithfully according to these instructions while preserving the main subject identity and natural proportions unless explicitly asked to change them.',
      actionContext + cleanPrompt,
      'Return the edited image directly.',
    ].join(' ');
  }
  return `Generate a high-quality, cohesive image matching this prompt: ${actionContext}${cleanPrompt}`;
}

export async function executeImageAiWithFallback(params: {
  prompt: string;
  presetAction?: string;
  imageBase64?: string;
  mimeType?: string;
  requestedModel?: string;
  qualityHint?: ImageQualityTier;
  overrideKeys?: ResolvedExecutableKey[];
  overrideConfig?: AiModelConfigState;
  overrideProjectHealth?: ProjectHealthRecord[];
  clientFactory?: AiClientFactory;
  skipStateMutation?: boolean;
}): Promise<{
  status: number;
  payload: Record<string, any>;
}> {
  const keys = getEligibleKeysForExecution({
    overrideKeys: params.overrideKeys,
    overrideConfig: params.overrideConfig,
    overrideProjectHealth: params.overrideProjectHealth,
  });
  if (keys.length === 0) {
    return buildNoEligibleKeysResult({
      overrideKeys: params.overrideKeys,
      overrideProjectHealth: params.overrideProjectHealth,
    });
  }

  const hasSourcePhoto = Boolean(params.imageBase64 && params.mimeType);
  const autoPlan = selectAutoImageModelOrder({
    prompt: params.prompt,
    presetAction: params.presetAction,
    hasSourceImage: hasSourcePhoto,
    requestedModel: params.requestedModel,
    qualityHint: params.qualityHint,
    overrideConfig: params.overrideConfig,
  });
  const models = autoPlan.orderedModels;
  if (models.length === 0) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'NO_ENABLED_IMAGE_MODELS',
        error: 'All Gemini image models are currently disabled by Admin.',
      },
    };
  }

  const factory = params.clientFactory || defaultClientFactory;
  const instruction = buildPhotoInstruction(params.prompt, params.presetAction, hasSourcePhoto);
  let lastClassified: ClassifiedGeminiError | null = null;
  let lastQuotaError: ClassifiedGeminiError | null = null;
  let attempts = 0;
  const throttledProjectsInRun = new Set<string>();
  const throttledKeyIdsInRun = new Set<string>();
  const runBudgetMs = process.env.VERCEL ? TOTAL_RUN_BUDGET_MS_VERCEL : TOTAL_RUN_BUDGET_MS_NODE;
  const perAttemptCapMs = process.env.VERCEL ? PER_ATTEMPT_TIMEOUT_MS_VERCEL : PER_ATTEMPT_TIMEOUT_MS_NODE;
  const deadlineMs = Date.now() + runBudgetMs;

  for (let kIdx = 0; kIdx < keys.length; kIdx++) {
    const remainingBudget = deadlineMs - Date.now();
    if (remainingBudget <= 1_500) {
      lastClassified = {
        kind: 'UPSTREAM_TRANSIENT',
        httpStatus: 504,
        code: 'AI_EXECUTION_TIMEOUT',
        message: 'AI processing exceeded the server time budget before completing. Please try again.',
      };
      break;
    }

    const keyItem = keys[kIdx];
    const normalizedProject = keyItem.projectId ? keyItem.projectId.toLowerCase() : '';
    if (throttledKeyIdsInRun.has(keyItem.id)) {
      continue;
    }
    if (normalizedProject && throttledProjectsInRun.has(normalizedProject)) {
      continue;
    }

    for (const modelId of models) {
      const attemptRemaining = deadlineMs - Date.now();
      if (attemptRemaining <= 1_500) {
        lastClassified = {
          kind: 'UPSTREAM_TRANSIENT',
          httpStatus: 504,
          code: 'AI_EXECUTION_TIMEOUT',
          message: 'AI processing exceeded the server time budget before completing. Please try again.',
        };
        break;
      }

      const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === modelId);
      if (!spec || spec.capability !== 'image') continue; // Hard guard: NEVER run Omni or text models on image path
      const client = factory(keyItem.rawKey, spec?.apiVersion);
      attempts++;
      try {
        const parts: any[] = [];
        if (hasSourcePhoto) {
          parts.push({
            inlineData: {
              data: params.imageBase64,
              mimeType: params.mimeType,
            },
          });
        }
        parts.push({ text: instruction });

        const response = await withExecutionTimeout(
          client.generateContent({
            model: modelId,
            contents: { parts },
          }),
          Math.min(perAttemptCapMs, attemptRemaining - 500),
          `Gemini model ${modelId}`
        );

        const resParts = response?.candidates?.[0]?.content?.parts ?? [];
        let outputBase64 = '';
        let outputMime = 'image/png';
        let modelNote = '';

        for (const part of resParts) {
          if (part?.inlineData?.data && !outputBase64) {
            outputBase64 = String(part.inlineData.data).trim();
            outputMime = part.inlineData.mimeType || 'image/png';
          } else if (typeof part?.text === 'string' && part.text.trim()) {
            modelNote = modelNote ? `${modelNote} ${part.text.trim()}` : part.text.trim();
          }
        }

        if (outputBase64) {
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, { status: 'ready', projectId: keyItem.projectId });
          }

          if (outputBase64.length > VERCEL_SAFE_BASE64_THRESHOLD) {
            const cldCreds = getCloudinaryCredentials();
            if (cldCreds.configured) {
              try {
                cloudinary.config({
                  cloud_name: cldCreds.cloudName,
                  api_key: cldCreds.apiKey,
                  api_secret: cldCreds.apiSecret,
                  secure: true,
                });
                const uploaded = await cloudinary.uploader.upload(
                  `data:${outputMime};base64,${outputBase64}`,
                  {
                    folder: 'king_ai_generated',
                    resource_type: 'image',
                    type: 'upload',
                  }
                );
                if (uploaded?.secure_url) {
                  return {
                    status: 200,
                    payload: {
                      ok: true,
                      provider: 'google-gemini',
                      model: modelId,
                      keyIdUsed: keyItem.id,
                      keyIndexUsed: kIdx + 1,
                      attempts,
                      imageUrl: uploaded.secure_url,
                      mimeType: outputMime,
                      offloadedToCloudinary: true,
                      note: modelNote || undefined,
                    },
                  };
                }
              } catch (cldErr: any) {
                console.warn('[aiBackend] Large AI image Cloudinary offload notice:', scrubSecretText(cldErr?.message || cldErr));
              }
            }

            if (process.env.VERCEL && outputBase64.length > VERCEL_HARD_BASE64_LIMIT) {
              return {
                status: 413,
                payload: {
                  ok: false,
                  code: 'AI_IMAGE_PAYLOAD_TOO_LARGE',
                  error:
                    'Generated image exceeded Vercel 4.5 MB payload limit. Configure CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET for automatic URL offload or select Nano Banana 2 Lite.',
                },
              };
            }
          }

          return {
            status: 200,
            payload: {
              ok: true,
              provider: 'google-gemini',
              model: modelId,
              keyIdUsed: keyItem.id,
              keyIndexUsed: kIdx + 1,
              attempts,
              imageBase64: outputBase64,
              mimeType: outputMime,
              note: modelNote || undefined,
            },
          };
        }

        // Model responded with text only instead of image
        lastClassified = {
          kind: 'MODEL_UNAVAILABLE',
          httpStatus: 502,
          code: 'GEMINI_NO_IMAGE_OUTPUT',
          message: modelNote || `Model ${modelId} did not return an image.`,
        };
      } catch (err: any) {
        const classified = classifyGeminiError(err, modelId);
        lastClassified = classified;

        if (classified.kind === 'BAD_REQUEST') {
          return {
            status: 400,
            payload: {
              ok: false,
              code: classified.code,
              error: classified.message,
              attempts,
            },
          };
        }

        if (classified.kind === 'INVALID_KEY') {
          throttledKeyIdsInRun.add(keyItem.id);
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, {
              status: 'invalid',
              error: classified.message,
              projectId: keyItem.projectId,
            });
          }
          break; // Do not try other models on an invalid key
        }

        if (classified.kind === 'QUOTA_EXCEEDED') {
          lastQuotaError = classified;
          const { keyCooldownMs, projectCooldownMs, quotaScope } = resolveCooldownForQuotaError(classified);
          throttledKeyIdsInRun.add(keyItem.id);
          if (normalizedProject) {
            throttledProjectsInRun.add(normalizedProject);
          }
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, {
              status: 'quota_exhausted',
              error: classified.message,
              cooldownMs: keyCooldownMs,
              quotaScope,
              projectId: keyItem.projectId,
              projectCooldownMs,
            });
          }
          break; // Project/key quota exhausted — skip sibling keys in this project and try next healthy project
        }

        // MODEL_UNAVAILABLE or UPSTREAM_TRANSIENT: try next model on same key
        continue;
      }
    }
  }

  return buildExhaustedFailureResult({
    lastClassified,
    lastQuotaError,
    attempts,
    defaultCode: 'GEMINI_EDIT_FAILED',
    defaultMessage: 'All active Gemini keys or image models failed or exceeded quota.',
  });
}

export async function executeTextAiWithFallback(params: {
  prompt: string;
  systemInstruction?: string;
  requestedModel?: string;
  overrideKeys?: ResolvedExecutableKey[];
  overrideConfig?: AiModelConfigState;
  overrideProjectHealth?: ProjectHealthRecord[];
  clientFactory?: AiClientFactory;
  skipStateMutation?: boolean;
}): Promise<{
  status: number;
  payload: Record<string, any>;
}> {
  const keys = getEligibleKeysForExecution({
    overrideKeys: params.overrideKeys,
    overrideConfig: params.overrideConfig,
    overrideProjectHealth: params.overrideProjectHealth,
  });
  if (keys.length === 0) {
    return buildNoEligibleKeysResult({
      overrideKeys: params.overrideKeys,
      overrideProjectHealth: params.overrideProjectHealth,
    });
  }

  const models = getEligibleModelsForDomain('text', {
    requestedModel: params.requestedModel,
    overrideConfig: params.overrideConfig,
  });
  if (models.length === 0) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'NO_ENABLED_TEXT_MODELS',
        error: 'All Gemini assistant text models are currently disabled by Admin.',
      },
    };
  }

  const factory = params.clientFactory || defaultClientFactory;
  let lastClassified: ClassifiedGeminiError | null = null;
  let lastQuotaError: ClassifiedGeminiError | null = null;
  let attempts = 0;
  const throttledProjectsInRun = new Set<string>();
  const throttledKeyIdsInRun = new Set<string>();
  const runBudgetMs = process.env.VERCEL ? TOTAL_RUN_BUDGET_MS_VERCEL : TOTAL_RUN_BUDGET_MS_NODE;
  const perAttemptCapMs = process.env.VERCEL ? PER_ATTEMPT_TIMEOUT_MS_VERCEL : PER_ATTEMPT_TIMEOUT_MS_NODE;
  const deadlineMs = Date.now() + runBudgetMs;

  for (let kIdx = 0; kIdx < keys.length; kIdx++) {
    const remainingBudget = deadlineMs - Date.now();
    if (remainingBudget <= 1_500) {
      lastClassified = {
        kind: 'UPSTREAM_TRANSIENT',
        httpStatus: 504,
        code: 'AI_EXECUTION_TIMEOUT',
        message: 'Text generation exceeded the server time budget before completing.',
      };
      break;
    }

    const keyItem = keys[kIdx];
    const normalizedProject = keyItem.projectId ? keyItem.projectId.toLowerCase() : '';
    if (throttledKeyIdsInRun.has(keyItem.id)) {
      continue;
    }
    if (normalizedProject && throttledProjectsInRun.has(normalizedProject)) {
      continue;
    }

    for (const modelId of models) {
      const attemptRemaining = deadlineMs - Date.now();
      if (attemptRemaining <= 1_500) {
        lastClassified = {
          kind: 'UPSTREAM_TRANSIENT',
          httpStatus: 504,
          code: 'AI_EXECUTION_TIMEOUT',
          message: 'Text generation exceeded the server time budget before completing.',
        };
        break;
      }

      const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === modelId);
      if (!spec || spec.capability !== 'text') continue; // Hard guard: strictly assistant text models
      const client = factory(keyItem.rawKey, spec?.apiVersion);
      attempts++;
      try {
        const response = await withExecutionTimeout(
          client.generateContent({
            model: modelId,
            contents: params.prompt.trim(),
            ...(params.systemInstruction
              ? { config: { systemInstruction: params.systemInstruction.trim() } }
              : {}),
          }),
          Math.min(perAttemptCapMs, attemptRemaining - 500),
          `Gemini model ${modelId}`
        );

        const textOut = typeof response?.text === 'string' ? response.text.trim() : '';
        if (textOut) {
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, { status: 'ready', projectId: keyItem.projectId });
          }
          return {
            status: 200,
            payload: {
              ok: true,
              provider: 'google-gemini',
              model: modelId,
              keyIdUsed: keyItem.id,
              keyIndexUsed: kIdx + 1,
              attempts,
              text: textOut,
            },
          };
        }

        lastClassified = {
          kind: 'MODEL_UNAVAILABLE',
          httpStatus: 502,
          code: 'GEMINI_NO_TEXT_OUTPUT',
          message: `Model ${modelId} returned an empty text response.`,
        };
      } catch (err: any) {
        const classified = classifyGeminiError(err, modelId);
        lastClassified = classified;

        if (classified.kind === 'BAD_REQUEST') {
          return {
            status: 400,
            payload: {
              ok: false,
              code: classified.code,
              error: classified.message,
              attempts,
            },
          };
        }
        if (classified.kind === 'INVALID_KEY') {
          throttledKeyIdsInRun.add(keyItem.id);
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, {
              status: 'invalid',
              error: classified.message,
              projectId: keyItem.projectId,
            });
          }
          break;
        }
        if (classified.kind === 'QUOTA_EXCEEDED') {
          lastQuotaError = classified;
          const { keyCooldownMs, projectCooldownMs, quotaScope } = resolveCooldownForQuotaError(classified);
          throttledKeyIdsInRun.add(keyItem.id);
          if (normalizedProject) {
            throttledProjectsInRun.add(normalizedProject);
          }
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, {
              status: 'quota_exhausted',
              error: classified.message,
              cooldownMs: keyCooldownMs,
              quotaScope,
              projectId: keyItem.projectId,
              projectCooldownMs,
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
    defaultCode: 'GEMINI_TEXT_FAILED',
    defaultMessage: 'Text generation failed across eligible Gemini keys.',
  });
}

export async function executeVideoAiWithFallback(params: {
  task: 'video_generation' | 'image_to_video' | 'video_editing';
  prompt: string;
  imageBase64?: string;
  mimeType?: string;
  videoBase64?: string;
  videoMimeType?: string;
  videoUri?: string;
  aspectRatio?: '16:9' | '9:16';
  duration?: string;
  resolution?: '360p' | '720p' | '1080p' | '4k';
  requestedModel?: string;
  overrideKeys?: ResolvedExecutableKey[];
  overrideConfig?: AiModelConfigState;
  overrideProjectHealth?: ProjectHealthRecord[];
  clientFactory?: AiClientFactory;
  skipStateMutation?: boolean;
}): Promise<{
  status: number;
  payload: Record<string, any>;
}> {
  const keys = getEligibleKeysForExecution({
    overrideKeys: params.overrideKeys,
    overrideConfig: params.overrideConfig,
    overrideProjectHealth: params.overrideProjectHealth,
  });
  if (keys.length === 0) {
    return buildNoEligibleKeysResult({
      overrideKeys: params.overrideKeys,
      overrideProjectHealth: params.overrideProjectHealth,
    });
  }

  // Validate operation inputs before burning quota
  if (params.task === 'image_to_video' && (!params.imageBase64 || !params.mimeType)) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'MISSING_SOURCE_IMAGE',
        error: 'Image-to-video generation requires a valid source photo.',
      },
    };
  }
  if (params.task === 'video_editing' && !params.videoUri && (!params.videoBase64 || !params.videoMimeType)) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'MISSING_SOURCE_VIDEO',
        error:
          'Video editing requires a source video URI or inline video clip. For interactive editing right now, use Post Editor timeline tools.',
      },
    };
  }

  // STRICT DOMAIN ISOLATION: Only enabled capability === 'omni' models supporting this video op!
  // NEVER falls back to Nano Banana image models.
  const models = getEligibleModelsForDomain('video', {
    requestedModel: params.requestedModel,
    videoTask: params.task,
    overrideConfig: params.overrideConfig,
  });

  if (models.length === 0) {
    return {
      status: 501,
      payload: {
        ok: false,
        code: 'NO_COMPATIBLE_VIDEO_MODEL',
        error: `No compatible verified Video AI model (Gemini Omni) is enabled for "${params.task}". Photo models cannot be used as a video fallback.`,
      },
    };
  }

  const factory = params.clientFactory || defaultClientFactory;
  let lastClassified: ClassifiedGeminiError | null = null;
  let lastQuotaError: ClassifiedGeminiError | null = null;
  let attempts = 0;
  const throttledProjectsInRun = new Set<string>();
  const throttledKeyIdsInRun = new Set<string>();

  for (let kIdx = 0; kIdx < keys.length; kIdx++) {
    const keyItem = keys[kIdx];
    const normalizedProject = keyItem.projectId ? keyItem.projectId.toLowerCase() : '';
    if (throttledKeyIdsInRun.has(keyItem.id)) {
      continue;
    }
    if (normalizedProject && throttledProjectsInRun.has(normalizedProject)) {
      continue;
    }

    for (const modelId of models) {
      const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === modelId);
      if (!spec || spec.capability !== 'omni') continue; // Hard guard: NEVER execute non-video model on video path
      const client = factory(keyItem.rawKey, 'v1beta');
      if (!client.createInteraction) {
        return {
          status: 500,
          payload: {
            ok: false,
            code: 'INTERACTIONS_API_UNAVAILABLE',
            error: 'Interactions API adapter is unavailable on this server build.',
          },
        };
      }

      attempts++;
      try {
        let interactionInput: any = params.prompt.trim();
        if (params.task === 'image_to_video') {
          interactionInput = [
            {
              type: 'image',
              mime_type: params.mimeType,
              data: params.imageBase64,
            },
            {
              type: 'text',
              text: params.prompt.trim(),
            },
          ];
        } else if (params.task === 'video_editing') {
          const videoPart = params.videoUri
            ? { type: 'video', uri: params.videoUri }
            : { type: 'video', mime_type: params.videoMimeType, data: params.videoBase64 };
          interactionInput = [
            videoPart,
            {
              type: 'text',
              text: params.prompt.trim(),
            },
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
              type: 'video',
              aspect_ratio: params.aspectRatio === '9:16' ? '9:16' : '16:9',
              ...(params.duration ? { duration: params.duration } : { duration: '5s' }),
              ...(params.resolution ? { resolution: params.resolution } : { resolution: '720p' }),
            },
          },
          { timeout: process.env.VERCEL ? 55_000 : 240_000 }
        );

        const videoPart =
          interaction?.output_video ||
          interaction?.outputs?.find((o: any) => o?.type === 'video');
        const outBase64 = typeof videoPart?.data === 'string' ? videoPart.data : '';
        const outUri = typeof videoPart?.uri === 'string' ? videoPart.uri : '';
        const outMime = videoPart?.mime_type || 'video/mp4';

        if (outBase64 || outUri) {
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, { status: 'ready' });
          }

          if (outBase64 && outBase64.length > VERCEL_SAFE_BASE64_THRESHOLD) {
            const cldCreds = getCloudinaryCredentials();
            if (cldCreds.configured) {
              try {
                cloudinary.config({
                  cloud_name: cldCreds.cloudName,
                  api_key: cldCreds.apiKey,
                  api_secret: cldCreds.apiSecret,
                  secure: true,
                });
                const uploaded = await cloudinary.uploader.upload(
                  `data:${outMime};base64,${outBase64}`,
                  {
                    folder: 'king_ai_video_generated',
                    resource_type: 'video',
                    type: 'upload',
                  }
                );
                if (uploaded?.secure_url) {
                  return {
                    status: 200,
                    payload: {
                      ok: true,
                      provider: 'google-gemini',
                      model: modelId,
                      task: params.task,
                      keyIdUsed: keyItem.id,
                      keyIndexUsed: kIdx + 1,
                      attempts,
                      videoUrl: uploaded.secure_url,
                      mimeType: outMime,
                      offloadedToCloudinary: true,
                    },
                  };
                }
              } catch (cldErr: any) {
                console.warn('[aiBackend] Video Cloudinary offload notice:', scrubSecretText(cldErr?.message || cldErr));
              }
            }

            if (process.env.VERCEL && outBase64.length > VERCEL_HARD_BASE64_LIMIT) {
              return {
                status: 413,
                payload: {
                  ok: false,
                  code: 'AI_VIDEO_PAYLOAD_TOO_LARGE',
                  error:
                    'Generated video exceeded serverless payload limit. Configure CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET for automatic video URL offload.',
                },
              };
            }
          }

          return {
            status: 200,
            payload: {
              ok: true,
              provider: 'google-gemini',
              model: modelId,
              task: params.task,
              keyIdUsed: keyItem.id,
              keyIndexUsed: kIdx + 1,
              attempts,
              ...(outUri ? { videoUrl: outUri } : {}),
              ...(outBase64 ? { videoBase64: outBase64 } : {}),
              mimeType: outMime,
            },
          };
        }

        lastClassified = {
          kind: 'MODEL_UNAVAILABLE',
          httpStatus: 502,
          code: 'GEMINI_NO_VIDEO_OUTPUT',
          message: `Video AI model ${modelId} did not return a video payload.`,
        };
      } catch (err: any) {
        const classified = classifyGeminiError(err, modelId);
        lastClassified = classified;

        if (classified.kind === 'BAD_REQUEST') {
          return {
            status: 400,
            payload: {
              ok: false,
              code: classified.code,
              error: classified.message,
              attempts,
            },
          };
        }

        if (classified.kind === 'INVALID_KEY') {
          throttledKeyIdsInRun.add(keyItem.id);
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, {
              status: 'invalid',
              error: classified.message,
              projectId: keyItem.projectId,
            });
          }
          break;
        }

        if (classified.kind === 'QUOTA_EXCEEDED') {
          lastQuotaError = classified;
          const { keyCooldownMs, projectCooldownMs, quotaScope } = resolveCooldownForQuotaError(classified);
          const normalizedProject = keyItem.projectId ? keyItem.projectId.toLowerCase() : '';
          throttledKeyIdsInRun.add(keyItem.id);
          if (normalizedProject) {
            throttledProjectsInRun.add(normalizedProject);
          }
          if (!params.skipStateMutation) {
            recordKeyHealthResult(keyItem.id, {
              status: 'quota_exhausted',
              error: classified.message,
              cooldownMs: keyCooldownMs,
              quotaScope,
              projectId: keyItem.projectId,
              projectCooldownMs,
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
    defaultCode: 'GEMINI_VIDEO_FAILED',
    defaultMessage: 'Video AI execution failed across configured Gemini Omni models and eligible keys.',
  });
}

export async function executeAutoRoutedAiTask(params: {
  prompt: string;
  task?: AiTaskType | 'auto' | 'voice_request';
  mediaType?: string;
  isVoiceRequest?: boolean;
  presetAction?: string;
  imageBase64?: string;
  mimeType?: string;
  videoBase64?: string;
  videoMimeType?: string;
  videoUri?: string;
  systemInstruction?: string;
  requestedModel?: string;
  qualityHint?: ImageQualityTier;
  aspectRatio?: '16:9' | '9:16';
  duration?: string;
  resolution?: '360p' | '720p' | '1080p' | '4k';
  overrideKeys?: ResolvedExecutableKey[];
  overrideConfig?: AiModelConfigState;
  overrideProjectHealth?: ProjectHealthRecord[];
  clientFactory?: AiClientFactory;
  skipStateMutation?: boolean;
}): Promise<{
  status: number;
  payload: Record<string, any>;
}> {
  const cfg = params.overrideConfig || getModelConfig();
  const hasSourceImage = Boolean(params.imageBase64 && params.mimeType);
  const hasSourceVideo = Boolean(params.videoUri || (params.videoBase64 && params.videoMimeType));

  const classification: {
    task: AiTaskType;
    domain: AiExecutionDomain;
    isVoiceRequest: boolean;
    reason: string;
  } = (() => {
    if (!cfg.enableAutoRouting) {
      const isVoiceRequest =
        Boolean(params.isVoiceRequest) || params.task === 'voice_request';
      if (params.task && params.task !== 'auto' && params.task !== 'voice_request') {
        const domain: AiExecutionDomain =
          params.task === 'text_chat'
            ? 'text'
            : params.task === 'photo_generation' || params.task === 'photo_editing'
            ? 'image'
            : 'video';
        return {
          task: params.task,
          domain,
          isVoiceRequest,
          reason: `Auto-routing disabled (enableAutoRouting=false): honoring explicit task "${params.task}" without prompt inference.`,
        };
      }
      const mediaType = (params.mediaType || '').toLowerCase();
      if (hasSourceVideo || mediaType === 'video') {
        const task: AiTaskType = hasSourceVideo ? 'video_editing' : 'video_generation';
        return {
          task,
          domain: 'video',
          isVoiceRequest,
          reason: `Auto-routing disabled: deterministic video mediaType mapping -> ${task}.`,
        };
      }
      if (hasSourceImage || mediaType === 'photo') {
        const task: AiTaskType = hasSourceImage ? 'photo_editing' : 'photo_generation';
        return {
          task,
          domain: 'image',
          isVoiceRequest,
          reason: `Auto-routing disabled: deterministic photo mediaType mapping -> ${task}.`,
        };
      }
      return {
        task: 'text_chat',
        domain: 'text',
        isVoiceRequest,
        reason: 'Auto-routing disabled (enableAutoRouting=false): bypassing prompt classification and routing deterministically to primary text assistant.',
      };
    }

    return classifyAiTaskIntent({
      prompt: params.prompt,
      explicitTask: params.task,
      mediaType: params.mediaType,
      hasSourceImage,
      hasSourceVideo,
      isVoiceRequest: params.isVoiceRequest,
      presetAction: params.presetAction,
    });
  })();

  if (classification.domain === 'image') {
    const imagePlan = selectAutoImageModelOrder({
      prompt: params.prompt,
      presetAction: params.presetAction,
      hasSourceImage,
      requestedModel: params.requestedModel,
      qualityHint: params.qualityHint,
      overrideConfig: cfg,
    });
    const res = await executeImageAiWithFallback({
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
      skipStateMutation: params.skipStateMutation,
    });
    return {
      status: res.status,
      payload: {
        ...res.payload,
        routing: {
          detectedTask: classification.task,
          domain: 'image',
          selectedTier: imagePlan.selectedTier,
          selectedModel: res.payload.model || imagePlan.orderedModels[0] || null,
          candidateModels: imagePlan.orderedModels,
          isVoiceRequest: classification.isVoiceRequest,
          reason: `${classification.reason} ${imagePlan.reason}`,
        } satisfies Omit<AiRoutingDecision, 'selectedModel'> & { selectedModel: string | null },
      },
    };
  }

  if (classification.domain === 'video') {
    const videoTask =
      classification.task === 'image_to_video' || classification.task === 'video_editing'
        ? classification.task
        : 'video_generation';
    const candidateModels = getEligibleModelsForDomain('video', {
      requestedModel: params.requestedModel,
      videoTask,
      overrideConfig: cfg,
    });
    const res = await executeVideoAiWithFallback({
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
      skipStateMutation: params.skipStateMutation,
    });
    return {
      status: res.status,
      payload: {
        ...res.payload,
        routing: {
          detectedTask: videoTask,
          domain: 'video',
          selectedTier: 'omni_video',
          selectedModel: res.payload.model || candidateModels[0] || null,
          candidateModels,
          isVoiceRequest: classification.isVoiceRequest,
          reason: classification.reason,
        },
      },
    };
  }

  // Domain === 'text' -> Gemini 3.1 Pro preferred assistant
  const candidateModels = getEligibleModelsForDomain('text', {
    requestedModel: params.requestedModel,
    overrideConfig: cfg,
  });
  const res = await executeTextAiWithFallback({
    prompt: params.prompt,
    systemInstruction: params.systemInstruction,
    requestedModel: params.requestedModel,
    overrideKeys: params.overrideKeys,
    overrideConfig: cfg,
    overrideProjectHealth: params.overrideProjectHealth,
    clientFactory: params.clientFactory,
    skipStateMutation: params.skipStateMutation,
  });
  return {
    status: res.status,
    payload: {
      ...res.payload,
      routing: {
        detectedTask: 'text_chat',
        domain: 'text',
        selectedTier: 'pro_assistant',
        selectedModel: res.payload.model || candidateModels[0] || null,
        candidateModels,
        isVoiceRequest: classification.isVoiceRequest,
        reason: classification.reason,
      },
    },
  };
}

export async function handleAutoRoutedAiRequest(params: {
  authHeader?: string | string[];
  body: any;
}): Promise<{
  status: number;
  payload: Record<string, any>;
}> {
  const caller = await verifyFirebaseBearerToken(params.authHeader);
  if (!caller) {
    return {
      status: 401,
      payload: {
        ok: false,
        code: 'AUTH_REQUIRED',
        error: 'Please sign in to use KING AI.',
      },
    };
  }

  const body = params.body || {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'INVALID_PROMPT',
        error: 'Prompt is required for AI routing.',
      },
    };
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'PROMPT_TOO_LONG',
        error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or less.`,
      },
    };
  }

  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';
  const videoBase64 = typeof body.videoBase64 === 'string' ? body.videoBase64.trim() : '';
  const videoMimeType = typeof body.videoMimeType === 'string' ? body.videoMimeType.trim().toLowerCase() : '';
  const videoUri = typeof body.videoUri === 'string' ? body.videoUri.trim() : '';
  const effectiveMaxChars = process.env.VERCEL ? VERCEL_HARD_BASE64_LIMIT : MAX_IMAGE_BASE64_CHARS;

  if (imageBase64) {
    if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
      return {
        status: 400,
        payload: {
          ok: false,
          code: 'UNSUPPORTED_IMAGE_TYPE',
          error: 'Only JPEG, PNG, and WebP photos are supported.',
        },
      };
    }
    if (imageBase64.length > effectiveMaxChars) {
      return {
        status: 413,
        payload: {
          ok: false,
          code: 'INVALID_IMAGE_PAYLOAD',
          error: 'Photo payload exceeds request limit.',
        },
      };
    }
  }

  if (videoBase64) {
    if (!ALLOWED_VIDEO_MIMES.has(videoMimeType)) {
      return {
        status: 400,
        payload: {
          ok: false,
          code: 'UNSUPPORTED_VIDEO_TYPE',
          error: 'Only MP4, WebM, and MOV clips are supported for inline Video AI.',
        },
      };
    }
    if (videoBase64.length > effectiveMaxChars) {
      return {
        status: 413,
        payload: {
          ok: false,
          code: 'INVALID_VIDEO_PAYLOAD',
          error: 'Video payload exceeds request limit. Upload or trim clip first.',
        },
      };
    }
  }

  await syncVaultFromRemote();
  try {
    const rawResult = await executeAutoRoutedAiTask({
      prompt,
      task: typeof body.task === 'string' ? (body.task.trim() as any) : 'auto',
      mediaType: typeof body.mediaType === 'string' ? body.mediaType.trim() : undefined,
      isVoiceRequest: Boolean(body.isVoiceRequest),
      presetAction: typeof body.presetAction === 'string' ? body.presetAction.trim() : undefined,
      imageBase64: imageBase64 || undefined,
      mimeType: mimeType || undefined,
      videoBase64: videoBase64 || undefined,
      videoMimeType: videoMimeType || undefined,
      videoUri: videoUri || undefined,
      systemInstruction: typeof body.systemInstruction === 'string' ? body.systemInstruction.trim() : undefined,
      requestedModel: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined,
      qualityHint:
        body.qualityHint === 'lite' || body.qualityHint === 'standard' || body.qualityHint === 'pro'
          ? body.qualityHint
          : undefined,
      aspectRatio: body.aspectRatio === '9:16' ? '9:16' : '16:9',
      duration: typeof body.duration === 'string' ? body.duration.trim() : undefined,
      resolution:
        body.resolution === '360p' ||
        body.resolution === '720p' ||
        body.resolution === '1080p' ||
        body.resolution === '4k'
          ? body.resolution
          : undefined,
    });
    const domain = rawResult?.payload?.routing?.domain;
    return normalizeAiEndpointResult(rawResult, {
      requireImage: domain === 'image',
      requireText: domain === 'text',
    });
  } finally {
    await flushRemoteVaultWrites();
  }
}

export async function handlePostAiPhotoEdit(params: {
  authHeader?: string | string[];
  body: any;
}): Promise<{
  status: number;
  payload: Record<string, any>;
}> {
  const caller = await verifyFirebaseBearerToken(params.authHeader);
  if (!caller) {
    return {
      status: 401,
      payload: {
        ok: false,
        code: 'AUTH_REQUIRED',
        error: 'Please sign in to use KING AI studio.',
      },
    };
  }

  const body = params.body || {};
  const mediaType = String(body.mediaType || 'photo').toLowerCase();
  if (mediaType === 'video') {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'VIDEO_AI_UNSUPPORTED',
        error:
          'Post Studio photo editor accepts still images only. For Video AI tasks use /api/ai/route (Gemini Omni) or Post Editor timeline tools.',
      },
    };
  }

  const rawPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!rawPrompt) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'INVALID_PROMPT',
        error: 'Describe what you want to change or generate first.',
      },
    };
  }
  if (rawPrompt.length > MAX_PROMPT_LENGTH) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'PROMPT_TOO_LONG',
        error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or less.`,
      },
    };
  }

  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';

  const effectiveMaxImageChars = process.env.VERCEL
    ? VERCEL_HARD_BASE64_LIMIT
    : MAX_IMAGE_BASE64_CHARS;

  if (imageBase64) {
    if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
      return {
        status: 400,
        payload: {
          ok: false,
          code: 'UNSUPPORTED_IMAGE_TYPE',
          error: 'Only JPEG, PNG, and WebP photos are supported by AI editing.',
        },
      };
    }
    if (imageBase64.length > effectiveMaxImageChars) {
      return {
        status: 413,
        payload: {
          ok: false,
          code: 'INVALID_IMAGE_PAYLOAD',
          error: 'Photo payload is too large for serverless processing. Please try a smaller photo.',
        },
      };
    }
  }

  const requestedModel = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined;
  const qualityHint =
    body.qualityHint === 'lite' || body.qualityHint === 'standard' || body.qualityHint === 'pro'
      ? body.qualityHint
      : undefined;

  await syncVaultFromRemote();
  try {
    const rawResult = await executeImageAiWithFallback({
      prompt: rawPrompt,
      presetAction: typeof body.presetAction === 'string' ? body.presetAction : undefined,
      imageBase64: imageBase64 || undefined,
      mimeType: mimeType || undefined,
      requestedModel,
      qualityHint,
    });
    return normalizeAiEndpointResult(rawResult, { requireImage: true });
  } finally {
    await flushRemoteVaultWrites();
  }
}

export async function handlePostAiTextGenerate(params: {
  authHeader?: string | string[];
  body: any;
}): Promise<{
  status: number;
  payload: Record<string, any>;
}> {
  const caller = await verifyFirebaseBearerToken(params.authHeader);
  if (!caller) {
    return {
      status: 401,
      payload: {
        ok: false,
        code: 'AUTH_REQUIRED',
        error: 'Please sign in to use KING AI text generation.',
      },
    };
  }

  const body = params.body || {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return {
      status: 400,
      payload: { ok: false, code: 'INVALID_PROMPT', error: 'Prompt is required.' },
    };
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'PROMPT_TOO_LONG',
        error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or less.`,
      },
    };
  }

  const requestedModel = typeof body.model === 'string' ? body.model.trim() : undefined;
  const systemInstruction =
    typeof body.systemInstruction === 'string' ? body.systemInstruction.trim() : undefined;

  await syncVaultFromRemote();
  try {
    const rawResult = await executeTextAiWithFallback({
      prompt,
      systemInstruction,
      requestedModel,
    });
    return normalizeAiEndpointResult(rawResult, { requireText: true });
  } finally {
    await flushRemoteVaultWrites();
  }
}

// --- ADMIN ENDPOINT HANDLERS ---

export async function handleAdminUpdateModels(patch: Partial<AiModelConfigState>) {
  await syncVaultFromRemote();
  const modelConfig = updateModelConfig(patch);
  await flushRemoteVaultWrites();
  return { ok: true as const, modelConfig, state: getAdminAiState() };
}

export async function handleAdminAddKey(params: {
  label: string;
  apiKey: string;
  priority?: number;
  projectId?: string;
}) {
  await syncVaultFromRemote();
  const key = addVaultApiKey(params);
  await flushRemoteVaultWrites();
  return { ok: true as const, key, state: getAdminAiState() };
}

export async function handleAdminUpdateKey(
  keyId: string,
  patch: {
    label?: string;
    projectId?: string;
    apiKey?: string;
    enabled?: boolean;
    priority?: number;
    resetHealth?: boolean;
  }
) {
  await syncVaultFromRemote();
  const key = updateVaultApiKey(keyId, patch);
  await flushRemoteVaultWrites();
  return key ? { ok: true as const, key, state: getAdminAiState() } : null;
}

export async function handleAdminDeleteKey(keyId: string) {
  await syncVaultFromRemote();
  const deleted = deleteVaultApiKey(keyId);
  await flushRemoteVaultWrites();
  return deleted ? { ok: true as const, state: getAdminAiState() } : null;
}

export async function testSpecificKeyLive(keyId: string): Promise<{
  status: number;
  payload: Record<string, any>;
}> {
  await syncVaultFromRemote();
  const keyItem = listResolvedKeys().find((k) => k.id === keyId);
  if (!keyItem) {
    return {
      status: 404,
      payload: { ok: false, error: 'API key slot not found.' },
    };
  }

  const start = Date.now();
  const factory = defaultClientFactory;
  const client = factory(keyItem.rawKey);
  const probeModel = 'gemini-3.1-flash-lite';

  try {
    const res = await client.generateContent({
      model: probeModel,
      contents: 'Reply with OK.',
    });
    const text = typeof res?.text === 'string' ? res.text.trim() : '';
    const latencyMs = Date.now() - start;
    recordKeyHealthResult(keyItem.id, { status: 'ready', projectId: keyItem.projectId });
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
        message: `Key "${keyItem.label}" passed live Gemini API check (${latencyMs}ms).`,
      },
    };
  } catch (err: any) {
    const classified = classifyGeminiError(err, probeModel);
    const latencyMs = Date.now() - start;
    const statusMap: Record<ClassifiedErrorKind, ResolvedExecutableKey['status']> = {
      INVALID_KEY: 'invalid',
      QUOTA_EXCEEDED: 'quota_exhausted',
      MODEL_UNAVAILABLE: 'error',
      BAD_REQUEST: 'ready',
      UPSTREAM_TRANSIENT: 'error',
    };
    const quotaCooldown =
      classified.kind === 'QUOTA_EXCEEDED' ? resolveCooldownForQuotaError(classified) : null;
    recordKeyHealthResult(keyItem.id, {
      status: statusMap[classified.kind],
      error: classified.message,
      cooldownMs: quotaCooldown?.keyCooldownMs,
      quotaScope: quotaCooldown?.quotaScope,
      projectId: keyItem.projectId,
      projectCooldownMs: quotaCooldown?.projectCooldownMs,
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
        error: classified.message,
      },
    };
  }
}

export async function testSpecificModelLive(params: {
  modelId: string;
  keyId?: string;
}): Promise<{
  status: number;
  payload: Record<string, any>;
}> {
  await syncVaultFromRemote();
  const spec = VERIFIED_GEMINI_MODELS.find((m) => m.id === params.modelId);
  if (!spec) {
    return {
      status: 400,
      payload: { ok: false, error: `Unknown or unverified model ID: ${params.modelId}` },
    };
  }

  const allKeys = listResolvedKeys();
  const candidates = params.keyId
    ? allKeys.filter((k) => k.id === params.keyId)
    : allKeys.filter((k) => k.enabled && k.status !== 'invalid');

  if (candidates.length === 0) {
    return {
      status: 503,
      payload: {
        ok: false,
        code: 'NO_ELIGIBLE_KEYS',
        error: 'No eligible enabled API key found to test this model.',
      },
    };
  }

  const keyItem = candidates[0];
  const client = defaultClientFactory(keyItem.rawKey, spec.apiVersion);
  const start = Date.now();

  try {
    if (spec.capability === 'omni') {
      const betaAi = new GoogleGenAI({
        apiKey: keyItem.rawKey,
        apiVersion: 'v1beta',
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const res = await betaAi.interactions.create({
        model: spec.id,
        input: 'Say "Omni online" in 3 words.',
        response_modalities: ['text'],
      } as any);
      const outputText = typeof (res as any)?.output_text === 'string'
        ? (res as any).output_text.trim()
        : JSON.stringify((res as any)?.outputs?.[0] || '').slice(0, 120);
      return {
        status: 200,
        payload: {
          ok: true,
          modelId: spec.id,
          capability: 'omni',
          keyId: keyItem.id,
          latencyMs: Date.now() - start,
          previewText: outputText || 'Interaction response received',
        },
      };
    }

    if (spec.capability === 'text') {
      const resp = await client.generateContent({
        model: spec.id,
        contents: 'Say "Model online" in 3 words.',
      });
      const text = typeof resp?.text === 'string' ? resp.text.trim() : '';
      const latencyMs = Date.now() - start;
      return {
        status: 200,
        payload: {
          ok: true,
          modelId: spec.id,
          capability: 'text',
          keyId: keyItem.id,
          latencyMs,
          previewText: text.slice(0, 120) || '(empty response)',
        },
      };
    } else {
      const resp = await client.generateContent({
        model: spec.id,
        contents: {
          parts: [{ text: 'Minimalist glowing royal blue crown emblem on dark obsidian background' }],
        },
      });
      const parts = resp?.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find((p: any) => p?.inlineData?.data);
      const latencyMs = Date.now() - start;
      if (imgPart?.inlineData?.data) {
        return {
          status: 200,
          payload: {
            ok: true,
            modelId: spec.id,
            capability: 'image',
            keyId: keyItem.id,
            latencyMs,
            imageBytesApprox: Math.round((imgPart.inlineData.data.length * 3) / 4),
          },
        };
      }
      return {
        status: 502,
        payload: {
          ok: false,
          modelId: spec.id,
          capability: 'image',
          latencyMs,
          error: 'Model responded without an inline image payload.',
        },
      };
    }
  } catch (err: any) {
    const classified = classifyGeminiError(err, spec.id);
    return {
      status: classified.httpStatus,
      payload: {
        ok: false,
        modelId: spec.id,
        capability: spec.capability,
        latencyMs: Date.now() - start,
        code: classified.code,
        error: classified.message,
      },
    };
  }
}

export async function fetchLiveModelsFromGoogleApi(overrideApiKey?: string): Promise<{
  ok: boolean;
  httpStatus: number;
  models: Array<{
    name: string;
    id: string;
    displayName: string;
    description: string;
    supportedGenerationMethods: string[];
    inputTokenLimit?: number;
    outputTokenLimit?: number;
  }>;
  error?: string;
}> {
  await syncVaultFromRemote();
  let rawKey = (overrideApiKey || '').trim();
  if (!rawKey) {
    const keys = listResolvedKeys().filter((k) => k.enabled && k.status !== 'invalid');
    if (keys.length === 0) {
      return {
        ok: false,
        httpStatus: 503,
        models: [],
        error: 'No active Gemini API key available on server.',
      };
    }
    rawKey = keys[0].rawKey;
  }

  try {
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      method: 'GET',
      headers: {
        'x-goog-api-key': rawKey,
        'User-Agent': 'aistudio-build',
      },
    });
    const data = (await resp.json()) as any;
    if (!resp.ok) {
      return {
        ok: false,
        httpStatus: resp.status,
        models: [],
        error: scrubSecretText(data?.error?.message || `Models API failed with HTTP ${resp.status}`),
      };
    }

    const models = (Array.isArray(data?.models) ? data.models : []).map((m: any) => {
      const fullName = String(m?.name || '');
      return {
        name: fullName,
        id: fullName.replace(/^models\//, ''),
        displayName: String(m?.displayName || fullName),
        description: String(m?.description || ''),
        supportedGenerationMethods: Array.isArray(m?.supportedGenerationMethods)
          ? m.supportedGenerationMethods
          : [],
        inputTokenLimit: typeof m?.inputTokenLimit === 'number' ? m.inputTokenLimit : undefined,
        outputTokenLimit: typeof m?.outputTokenLimit === 'number' ? m.outputTokenLimit : undefined,
      };
    });

    return {
      ok: true,
      httpStatus: 200,
      models,
    };
  } catch (err: any) {
    return {
      ok: false,
      httpStatus: 502,
      models: [],
      error: scrubSecretText(err?.message || 'Failed to query Gemini models API.'),
    };
  }
}

export async function runLiveModelMatrixAudit(candidateModelIds: string[]): Promise<{
  ok: boolean;
  liveApiModelsCount: number;
  liveApiModels: Array<{ id: string; displayName: string; methods: string[] }>;
  probeResults: Array<{
    modelId: string;
    existsInModelsList: boolean;
    mode: string;
    httpStatus: number;
    ok: boolean;
    latencyMs: number;
    detail: string;
  }>;
}> {
  const catalogRes = await fetchLiveModelsFromGoogleApi();
  const liveIds = new Set(catalogRes.models.map((m) => m.id));
  const keys = listResolvedKeys().filter((k) => k.enabled && k.status !== 'invalid');
  if (keys.length === 0) {
    return {
      ok: false,
      liveApiModelsCount: catalogRes.models.length,
      liveApiModels: catalogRes.models.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        methods: m.supportedGenerationMethods,
      })),
      probeResults: [],
    };
  }

  const keyItem = keys[0];
  const ai = new GoogleGenAI({
    apiKey: keyItem.rawKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const probeResults = await Promise.all(
    candidateModelIds.map(async (modelId) => {
      const start = Date.now();
      const isImage = modelId.includes('image') || modelId.includes('banana') || modelId.includes('imagen');
      const isOmni = modelId.includes('omni');
      const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
        Promise.race([
          p,
          new Promise<T>((_, rej) => setTimeout(() => rej(new Error('Probe timed out after 12s')), 12000)),
        ]);

      try {
        if (isOmni) {
          const betaAi = new GoogleGenAI({
            apiKey: keyItem.rawKey,
            apiVersion: 'v1beta',
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
          });
          const res = await withTimeout(
            betaAi.interactions.create({
              model: modelId,
              input: 'Say OK.',
              response_modalities: ['text'],
            } as any)
          );
          return {
            modelId,
            existsInModelsList: liveIds.has(modelId),
            mode: 'interactions.create(v1beta)',
            httpStatus: 200,
            ok: true,
            latencyMs: Date.now() - start,
            detail: scrubSecretText(String((res as any)?.output_text || 'Interaction ok').slice(0, 80)),
          };
        }
        if (isImage) {
          const res = await withTimeout(
            ai.models.generateContent({
              model: modelId,
              contents: { parts: [{ text: 'Minimalist glowing royal blue crown emblem on dark background' }] },
            })
          );
          const parts = res?.candidates?.[0]?.content?.parts ?? [];
          const imgPart = parts.find((p: any) => p?.inlineData?.data);
          const imgBytes = imgPart?.inlineData?.data
            ? Math.round((imgPart.inlineData.data.length * 3) / 4)
            : 0;
          return {
            modelId,
            existsInModelsList: liveIds.has(modelId),
            mode: 'generateContent(image)',
            httpStatus: imgPart ? 200 : 502,
            ok: Boolean(imgPart),
            latencyMs: Date.now() - start,
            detail: imgPart
              ? `Generated ${imgPart.inlineData?.mimeType || 'image'} ~${imgBytes} bytes`
              : scrubSecretText(String(res?.text || 'No image payload returned').slice(0, 100)),
          };
        }
        const textAi = modelId.includes('preview') || modelId.includes('latest')
          ? new GoogleGenAI({
              apiKey: keyItem.rawKey,
              apiVersion: 'v1beta',
              httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
            })
          : ai;
        const res = await withTimeout(
          textAi.models.generateContent({
            model: modelId,
            contents: 'Reply with OK.',
          })
        );
        return {
          modelId,
          existsInModelsList: liveIds.has(modelId),
          mode: modelId.includes('preview') ? 'generateContent(v1beta)' : 'generateContent(text)',
          httpStatus: 200,
          ok: true,
          latencyMs: Date.now() - start,
          detail: scrubSecretText(String(res?.text || '').trim().slice(0, 80)),
        };
      } catch (err: any) {
        const classified = classifyGeminiError(err, modelId);
        return {
          modelId,
          existsInModelsList: liveIds.has(modelId),
          mode: isOmni ? 'interactions.create(v1beta)' : isImage ? 'generateContent(image)' : 'generateContent(text)',
          httpStatus: Number(err?.status || classified.httpStatus || 500),
          ok: false,
          latencyMs: Date.now() - start,
          detail: scrubSecretText(`${classified.code}: ${err?.message || classified.message}`).slice(0, 220),
        };
      }
    })
  );

  return {
    ok: catalogRes.ok,
    liveApiModelsCount: catalogRes.models.length,
    liveApiModels: catalogRes.models.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      methods: m.supportedGenerationMethods,
    })),
    probeResults,
  };
}

export {
  addVaultApiKey,
  deleteVaultApiKey,
  flushRemoteVaultWrites,
  scrubSecretText,
  syncVaultFromRemote,
  updateModelConfig,
  updateVaultApiKey,
};
