import cloudinaryPkg from 'cloudinary';
const cloudinary = cloudinaryPkg.v2;
import { getCloudinaryCredentials } from '../api/_lib/cloudinaryConfig.ts';
import {
  getFalConfig,
  listFalModelHealthSummaries,
  listResolvedFalKeys,
  listSafeFalKeySummaries,
  recordFalKeyHealthResult,
  recordFalModelHealthResult,
  scrubSecretText,
  syncVaultFromRemote,
  VERIFIED_FAL_MODELS,
  type FalAiConfigState,
  type FalQuotaScope,
  type KeyHealthStatus,
  type ResolvedExecutableFalKey,
  type SafeFalKeySummary,
  type VerifiedFalModelSpec,
} from './aiVault.ts';

const VERCEL_SAFE_BASE64_THRESHOLD = 3_400_000;
const VERCEL_HARD_BASE64_LIMIT = 4_200_000;
const MAX_NODE_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FAL_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FAL_PROMPT_LENGTH = 2000;

const FAL_RPM_COOLDOWN_MS = 65 * 1000;
const FAL_MAX_RPM_COOLDOWN_MS = 180 * 1000;
const FAL_CONCURRENCY_COOLDOWN_MS = 20 * 1000;
const FAL_QUEUE_COOLDOWN_MS = 30 * 1000;
const FAL_TRANSIENT_COOLDOWN_MS = 30 * 1000;
const FAL_MODEL_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_TRANSIENT_RETRIES_PER_KEY = 1;

export type FalFetchLike = typeof fetch;

// In-process runtime concurrency & active queue job tracking per fal.ai API key
const activeInFlightByKey = new Map<string, number>();
const pendingQueueJobsByKey = new Map<string, number>();

export function getFalRuntimeMetrics(): {
  activeInFlightByKey: Record<string, number>;
  pendingQueueJobsByKey: Record<string, number>;
} {
  return {
    activeInFlightByKey: Object.fromEntries(activeInFlightByKey.entries()),
    pendingQueueJobsByKey: Object.fromEntries(pendingQueueJobsByKey.entries()),
  };
}

export function resetFalRuntimeMetricsForTests(): void {
  activeInFlightByKey.clear();
  pendingQueueJobsByKey.clear();
}

function tryAcquireFalConcurrencySlot(keyId: string, maxConcurrent: number): boolean {
  const current = activeInFlightByKey.get(keyId) || 0;
  if (current >= Math.max(1, maxConcurrent)) {
    return false;
  }
  activeInFlightByKey.set(keyId, current + 1);
  return true;
}

function releaseFalConcurrencySlot(keyId: string): void {
  const current = activeInFlightByKey.get(keyId) || 0;
  if (current <= 1) {
    activeInFlightByKey.delete(keyId);
  } else {
    activeInFlightByKey.set(keyId, current - 1);
  }
}

function incrementPendingQueueJob(keyId: string): void {
  pendingQueueJobsByKey.set(keyId, (pendingQueueJobsByKey.get(keyId) || 0) + 1);
}

function decrementPendingQueueJob(keyId: string): void {
  const current = pendingQueueJobsByKey.get(keyId) || 0;
  if (current <= 1) {
    pendingQueueJobsByKey.delete(keyId);
  } else {
    pendingQueueJobsByKey.set(keyId, current - 1);
  }
}

export type FalClassifiedErrorKind =
  | 'INVALID_KEY'
  | 'RATE_LIMITED'
  | 'CONCURRENCY_LIMITED'
  | 'QUEUE_SATURATED'
  | 'MODEL_UNAVAILABLE'
  | 'BAD_REQUEST'
  | 'REQUEST_TIMEOUT'
  | 'UPSTREAM_TRANSIENT';

export interface ClassifiedFalError {
  kind: FalClassifiedErrorKind;
  httpStatus: number;
  code: string;
  message: string;
  keyStatus?: KeyHealthStatus;
  quotaScope?: FalQuotaScope;
  cooldownMs?: number;
  isModelSpecificFailure?: boolean;
  retryableWithBackoff?: boolean;
}

function parseRetryAfterHeaderMs(
  retryAfterHeader: string | null | undefined,
  bodyText: string
): number | undefined {
  if (retryAfterHeader) {
    const asNum = Number(retryAfterHeader);
    if (Number.isFinite(asNum) && asNum > 0) {
      return Math.min(FAL_MAX_RPM_COOLDOWN_MS, Math.max(15_000, Math.round(asNum * 1000)));
    }
    const asDate = Date.parse(retryAfterHeader);
    if (Number.isFinite(asDate) && asDate > Date.now()) {
      return Math.min(FAL_MAX_RPM_COOLDOWN_MS, Math.max(15_000, asDate - Date.now()));
    }
  }
  const match = bodyText.match(/(?:retry[_ -]?after|try again in)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*s?/i);
  if (match) {
    const secs = Number(match[1]);
    if (Number.isFinite(secs) && secs > 0) {
      return Math.min(FAL_MAX_RPM_COOLDOWN_MS, Math.max(15_000, Math.round(secs * 1000)));
    }
  }
  return undefined;
}

export function classifyFalError(params: {
  status?: number;
  bodyText?: string;
  retryAfterHeader?: string | null;
  modelId?: string;
  isTimeout?: boolean;
}): ClassifiedFalError {
  const status = Number(params.status || 0);
  const cleanBody = scrubSecretText(String(params.bodyText || '').trim());
  const lower = cleanBody.toLowerCase();

  if (
    params.isTimeout ||
    status === 504 ||
    status === 408 ||
    /timed?\s*out|abort(ed)?|deadline exceeded/i.test(lower)
  ) {
    return {
      kind: 'REQUEST_TIMEOUT',
      httpStatus: 504,
      code: 'FAL_REQUEST_TIMEOUT',
      message: cleanBody
        ? `fal.ai request timed out: ${cleanBody.slice(0, 140)}`
        : 'fal.ai request timed out before completion.',
      keyStatus: 'error',
      cooldownMs: FAL_TRANSIENT_COOLDOWN_MS,
      retryableWithBackoff: true,
    };
  }

  if (/concurrency\s*limit|too many concurrent|max\s*concurrent/i.test(lower)) {
    const retryMs =
      parseRetryAfterHeaderMs(params.retryAfterHeader, cleanBody) || FAL_CONCURRENCY_COOLDOWN_MS;
    return {
      kind: 'CONCURRENCY_LIMITED',
      httpStatus: 429,
      code: 'FAL_CONCURRENCY_LIMITED',
      message: `fal.ai concurrency limit reached (HTTP ${status || 429}). Key cooled down for ${Math.ceil(
        retryMs / 1000
      )}s and failing over.`,
      keyStatus: 'quota_exhausted',
      quotaScope: 'concurrency_limit',
      cooldownMs: retryMs,
    };
  }

  if (/queue\s*(?:length|capacity|size)?\s*(?:is\s*)?(?:full|limit|overflow|exceeded|saturated)|too many queued/i.test(lower)) {
    const retryMs =
      parseRetryAfterHeaderMs(params.retryAfterHeader, cleanBody) || FAL_QUEUE_COOLDOWN_MS;
    return {
      kind: 'QUEUE_SATURATED',
      httpStatus: 429,
      code: 'FAL_QUEUE_SATURATED',
      message: `fal.ai queue capacity saturated (HTTP ${status || 429}). Cooldown ${Math.ceil(
        retryMs / 1000
      )}s without marking invalid.`,
      keyStatus: 'quota_exhausted',
      quotaScope: 'queue_limit',
      cooldownMs: retryMs,
    };
  }

  if (status === 429 || /rate limit|too many requests|throttled/i.test(lower)) {
    const retryMs = parseRetryAfterHeaderMs(params.retryAfterHeader, cleanBody) || FAL_RPM_COOLDOWN_MS;
    return {
      kind: 'RATE_LIMITED',
      httpStatus: 429,
      code: 'FAL_RATE_LIMITED',
      message: `fal.ai temporary rate limit (HTTP 429). Key cooled down for ${Math.ceil(
        retryMs / 1000
      )}s without marking invalid.`,
      keyStatus: 'quota_exhausted',
      quotaScope: 'rpm_throttle',
      cooldownMs: retryMs,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    /invalid credentials|invalid api key|unauthorized|no credentials found|revoked key/i.test(lower)
  ) {
    return {
      kind: 'INVALID_KEY',
      httpStatus: status === 401 ? 401 : 403,
      code: 'FAL_KEY_INVALID',
      message: `fal.ai API key rejected (HTTP ${status || 401}). Check or replace this key.`,
      keyStatus: 'invalid',
    };
  }

  if (
    status === 404 ||
    /endpoint.*not found|model.*not found|model.*unavailable|application.*not found|not deployed|deprecated endpoint/i.test(
      lower
    )
  ) {
    return {
      kind: 'MODEL_UNAVAILABLE',
      httpStatus: 404,
      code: 'FAL_MODEL_UNAVAILABLE',
      message: `fal.ai model "${params.modelId || 'selected'}" is unavailable or returned 404.`,
      isModelSpecificFailure: true,
    };
  }

  if (status === 400 || status === 422) {
    const isModelRejected =
      /unsupported parameter|invalid endpoint|runner.*failed for model|unsupported aspect|unsupported duration/i.test(
        lower
      );
    if (isModelRejected) {
      return {
        kind: 'MODEL_UNAVAILABLE',
        httpStatus: 422,
        code: 'FAL_MODEL_INCOMPATIBLE',
        message: cleanBody.slice(0, 180) || `fal.ai model ${params.modelId || ''} rejected parameters.`,
        isModelSpecificFailure: true,
      };
    }
    return {
      kind: 'BAD_REQUEST',
      httpStatus: 400,
      code: 'FAL_BAD_REQUEST',
      message: cleanBody.slice(0, 200) || 'fal.ai rejected the prompt or media input.',
    };
  }

  return {
    kind: 'UPSTREAM_TRANSIENT',
    httpStatus: status >= 500 ? status : 502,
    code: 'FAL_UPSTREAM_ERROR',
    message: cleanBody.slice(0, 180) || `fal.ai upstream error (HTTP ${status || 502}).`,
    keyStatus: 'error',
    cooldownMs: FAL_TRANSIENT_COOLDOWN_MS,
    retryableWithBackoff: status === 0 || status >= 500,
  };
}

export function computeSafeBackoffMs(retryAttempt: number, baseMs = 450): number {
  const exp = Math.min(2_500, baseMs * Math.pow(2, Math.max(0, retryAttempt)));
  const jitter = Math.floor(Math.random() * 180);
  return exp + jitter;
}

async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FalConnectionProbeResult {
  ok: boolean;
  httpStatus: number;
  keyStatus: KeyHealthStatus;
  quotaScope?: FalQuotaScope;
  cooldownMs?: number;
  message: string;
}

/**
 * Lightweight technical connectivity & auth check using an inference-scoped endpoint.
 * Does NOT call any billing, credits, balance, or payment endpoints.
 */
export async function probeFalKeyConnection(
  rawKey: string,
  fetchImpl: FalFetchLike = fetch
): Promise<FalConnectionProbeResult> {
  const cfg = getFalConfig();
  const timeoutMs = Math.min(15_000, Math.max(5_000, (cfg.requestTimeoutSec || 45) * 1000));
  try {
    const resp = await fetchFalWithTimeout(
      fetchImpl,
      'https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai%2Fflux%2Fschnell',
      {
        method: 'GET',
        headers: {
          Authorization: `Key ${rawKey}`,
          Accept: 'application/json',
        },
      },
      timeoutMs
    );
    const bodyText = await resp.text();
    if (resp.ok) {
      return {
        ok: true,
        httpStatus: 200,
        keyStatus: 'ready',
        message: 'fal.ai API key connection verified (technical auth & rate-limit health OK).',
      };
    }

    const classified = classifyFalError({
      status: resp.status,
      bodyText,
      retryAfterHeader: resp.headers?.get?.('retry-after'),
    });
    return {
      ok: false,
      httpStatus: classified.httpStatus,
      keyStatus: classified.keyStatus || 'error',
      quotaScope: classified.quotaScope,
      cooldownMs: classified.cooldownMs,
      message: classified.message,
    };
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError' || /timed?\s*out/i.test(String(err?.message || ''));
    const classified = classifyFalError({
      status: isTimeout ? 504 : 502,
      bodyText: err?.message || 'Unable to reach fal.ai API.',
      isTimeout,
    });
    return {
      ok: false,
      httpStatus: classified.httpStatus,
      keyStatus: classified.keyStatus || 'error',
      quotaScope: classified.quotaScope,
      cooldownMs: classified.cooldownMs,
      message: classified.message,
    };
  }
}

export async function testSpecificFalKeyLive(
  keyId: string,
  fetchImpl: FalFetchLike = fetch
): Promise<{
  status: number;
  payload: Record<string, any>;
}> {
  await syncVaultFromRemote(true);
  const keyItem = listResolvedFalKeys().find((k) => k.id === keyId);
  if (!keyItem) {
    return {
      status: 404,
      payload: { ok: false, error: 'fal.ai API key slot not found.' },
    };
  }

  const start = Date.now();
  const probe = await probeFalKeyConnection(keyItem.rawKey, fetchImpl);
  const latencyMs = Date.now() - start;
  const nowIso = new Date().toISOString();

  recordFalKeyHealthResult(keyItem.id, {
    status: probe.keyStatus,
    error: probe.ok ? undefined : probe.message,
    cooldownMs: probe.cooldownMs,
    quotaScope: probe.quotaScope,
    incrementFailure: !probe.ok,
    testedAt: nowIso,
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
      message: probe.ok ? `${probe.message} (${latencyMs}ms)` : undefined,
      error: probe.ok ? undefined : probe.message,
    },
  };
}

export function getEligibleFalKeysForExecution(options?: {
  overrideKeys?: ResolvedExecutableFalKey[];
  overrideConfig?: FalAiConfigState;
}): ResolvedExecutableFalKey[] {
  const now = Date.now();
  const cfg = options?.overrideConfig || getFalConfig();
  const maxConc = Math.max(1, cfg.maxConcurrentPerKey || 2);

  const eligible = [...(options?.overrideKeys || listResolvedFalKeys())]
    .filter((k) => {
      if (!k.enabled) return false;
      if (k.status === 'invalid' || k.status === 'disabled') return false;
      if (k.status === 'quota_exhausted' && (!k.cooldownUntil || k.cooldownUntil > now)) {
        return false;
      }
      if (k.status === 'error' && k.cooldownUntil && k.cooldownUntil > now) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Prefer keys with open concurrency headroom first, then priority
      const aFull = (activeInFlightByKey.get(a.id) || 0) >= maxConc ? 1 : 0;
      const bFull = (activeInFlightByKey.get(b.id) || 0) >= maxConc ? 1 : 0;
      if (aFull !== bFull) return aFull - bFull;
      return a.priority - b.priority;
    });

  return cfg.enableFalKeyFallback ? eligible : eligible.slice(0, 1);
}

export function buildFalExhaustedDiagnostic(options?: {
  overrideKeys?: ResolvedExecutableFalKey[];
  lastClassified?: ClassifiedFalError | null;
  lastQuotaError?: ClassifiedFalError | null;
  attempts?: number;
}): {
  status: number;
  payload: Record<string, any>;
} {
  const safeSummaries: SafeFalKeySummary[] = options?.overrideKeys
    ? options.overrideKeys.map((k) => ({
        id: k.id,
        label: k.label,
        maskedKey: k.rawKey.length > 8 ? `••••••${k.rawKey.slice(-4)}` : '••••••••',
        source: k.source,
        enabled: k.enabled,
        priority: k.priority,
        status: k.status,
        quotaScope: k.quotaScope,
        failureCount: 0,
        consecutiveFailures: 0,
        cooldownUntil: k.cooldownUntil,
      }))
    : listSafeFalKeySummaries();

  const configured = safeSummaries.length;
  const enabled = safeSummaries.filter((k) => k.enabled);
  const rateLimitedCount = enabled.filter((k) => k.quotaScope === 'rpm_throttle').length;
  const concurrencyLimitedCount = enabled.filter(
    (k) => k.quotaScope === 'concurrency_limit'
  ).length;
  const queueLimitedCount = enabled.filter((k) => k.quotaScope === 'queue_limit').length;
  const invalidCount = enabled.filter((k) => k.status === 'invalid').length;
  const transientErrorCount = enabled.filter((k) => k.status === 'error').length;

  const cooldownTimes = enabled
    .map((k) => k.cooldownUntil)
    .filter((ts): ts is number => typeof ts === 'number' && ts > Date.now());
  const nextRetryAt =
    cooldownTimes.length > 0 ? new Date(Math.min(...cooldownTimes)).toISOString() : undefined;

  if (configured === 0) {
    return {
      status: 503,
      payload: {
        ok: false,
        provider: 'fal-ai',
        code: 'FAL_NO_KEYS_CONFIGURED',
        error: 'No fal.ai API keys are configured in Admin Panel → AI Model Manager.',
        falDiagnostics: { configured: 0, enabled: 0, keys: [] },
      },
    };
  }

  if (enabled.length === 0) {
    return {
      status: 503,
      payload: {
        ok: false,
        provider: 'fal-ai',
        code: 'FAL_ALL_KEYS_DISABLED',
        error: `All ${configured} fal.ai API key(s) are currently disabled in Admin Panel.`,
        falDiagnostics: { configured, enabled: 0, keys: safeSummaries },
      },
    };
  }

  const chosenErr = options?.lastQuotaError || options?.lastClassified;
  const summaryParts: string[] = [];
  if (rateLimitedCount > 0) summaryParts.push(`${rateLimitedCount} rate limited (429)`);
  if (concurrencyLimitedCount > 0)
    summaryParts.push(`${concurrencyLimitedCount} at concurrency limit`);
  if (queueLimitedCount > 0) summaryParts.push(`${queueLimitedCount} queue saturated`);
  if (transientErrorCount > 0) summaryParts.push(`${transientErrorCount} transient/timeout errors`);
  if (invalidCount > 0) summaryParts.push(`${invalidCount} invalid auth (401/403)`);

  const status =
    chosenErr?.httpStatus ||
    (rateLimitedCount + concurrencyLimitedCount + queueLimitedCount > 0
      ? 429
      : invalidCount === enabled.length
      ? 401
      : 503);

  const diagnosticDetail =
    summaryParts.length > 0
      ? `All ${enabled.length} enabled fal.ai key(s) are currently unavailable (${summaryParts.join(', ')}).${
          nextRetryAt ? ` Next cooldown retry at ${nextRetryAt}.` : ''
        }`
      : chosenErr?.message ||
        `All ${enabled.length} enabled fal.ai key(s) failed or are cooling down.`;

  return {
    status,
    payload: {
      ok: false,
      provider: 'fal-ai',
      code:
        chosenErr?.code ||
        (rateLimitedCount === enabled.length ? 'FAL_ALL_KEYS_RATE_LIMITED' : 'FAL_ALL_KEYS_EXHAUSTED'),
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
          lastError: k.lastError,
        })),
      },
    },
  };
}

function getCandidateFalModels(
  kind: 'image' | 'image_edit' | 'video' | 'image_to_video',
  requestedModel?: string,
  cfg?: FalAiConfigState
): string[] {
  const falCfg = cfg || getFalConfig();
  const primary =
    kind === 'image_edit'
      ? falCfg.primaryFalImageEditModel
      : kind === 'video'
      ? falCfg.primaryFalVideoModel
      : kind === 'image_to_video'
      ? falCfg.primaryFalImageToVideoModel
      : falCfg.primaryFalImageModel;

  const sameCap = VERIFIED_FAL_MODELS.filter((m) => m.capability === kind).map((m) => m.id);
  const all = Array.from(
    new Set(
      [
        ...(requestedModel && requestedModel.startsWith('fal-ai/') ? [requestedModel] : []),
        primary,
        ...sameCap,
      ].filter(Boolean)
    )
  );

  // Skip models currently in active falModelHealth error cooldown when healthy alternatives exist
  const now = Date.now();
  const modelHealthMap = new Map(
    listFalModelHealthSummaries().map((mh) => [mh.modelId, mh] as const)
  );
  const healthy = all.filter((id) => {
    const mh = modelHealthMap.get(id);
    return !mh || mh.status === 'ready' || !mh.cooldownUntil || mh.cooldownUntil <= now;
  });
  return healthy.length > 0 ? healthy : all;
}

export interface FalInputValidationResult {
  ok: boolean;
  compatibleModels: string[];
  status?: number;
  code?: string;
  error?: string;
}

export function validateFalInputConstraints(params: {
  prompt: string;
  taskKind: 'image' | 'image_edit' | 'video' | 'image_to_video';
  imageBase64?: string;
  mimeType?: string;
  aspectRatio?: string;
  duration?: string;
  candidateModels: string[];
}): FalInputValidationResult {
  const prompt = (params.prompt || '').trim();
  if (!prompt) {
    return {
      ok: false,
      compatibleModels: [],
      status: 400,
      code: 'FAL_EMPTY_PROMPT',
      error: 'Prompt cannot be empty.',
    };
  }
  if (prompt.length > MAX_FAL_PROMPT_LENGTH) {
    return {
      ok: false,
      compatibleModels: [],
      status: 400,
      code: 'FAL_PROMPT_TOO_LONG',
      error: `Prompt exceeds ${MAX_FAL_PROMPT_LENGTH} characters.`,
    };
  }

  const hasImage = Boolean(params.imageBase64 && params.imageBase64.trim());
  if ((params.taskKind === 'image_edit' || params.taskKind === 'image_to_video') && !hasImage) {
    return {
      ok: false,
      compatibleModels: [],
      status: 400,
      code: 'FAL_MISSING_SOURCE_IMAGE',
      error: `Operation "${params.taskKind}" requires a source image.`,
    };
  }

  let approxImageBytes = 0;
  if (hasImage) {
    const cleanMime = String(params.mimeType || '').trim().toLowerCase();
    if (!ALLOWED_FAL_IMAGE_MIMES.has(cleanMime)) {
      return {
        ok: false,
        compatibleModels: [],
        status: 400,
        code: 'FAL_UNSUPPORTED_IMAGE_MIME',
        error: 'Only JPEG, PNG, and WebP images are supported.',
      };
    }
    const maxChars = process.env.VERCEL
      ? VERCEL_HARD_BASE64_LIMIT
      : Math.ceil((MAX_NODE_IMAGE_BYTES * 4) / 3);
    if (params.imageBase64!.length > maxChars) {
      return {
        ok: false,
        compatibleModels: [],
        status: 413,
        code: 'FAL_IMAGE_TOO_LARGE',
        error: 'Source image exceeds maximum request payload limit.',
      };
    }
    approxImageBytes = Math.round((params.imageBase64!.length * 3) / 4);
  }

  const specs = new Map<string, VerifiedFalModelSpec>(VERIFIED_FAL_MODELS.map((m) => [m.id, m]));
  const compatible = params.candidateModels.filter((id) => {
    const spec = specs.get(id);
    if (!spec) return true;
    if (spec.maxInputImageMb && approxImageBytes > spec.maxInputImageMb * 1024 * 1024) {
      return false;
    }
    if (
      params.aspectRatio &&
      spec.supportedAspectRatios &&
      !spec.supportedAspectRatios.includes(params.aspectRatio as any)
    ) {
      return false;
    }
    if (
      params.duration &&
      spec.supportedDurations &&
      !spec.supportedDurations.includes(params.duration)
    ) {
      return false;
    }
    return true;
  });

  if (compatible.length === 0) {
    return {
      ok: false,
      compatibleModels: [],
      status: 400,
      code: 'FAL_MODEL_CONSTRAINTS_UNMET',
      error: 'Input size, aspect ratio, or duration is incompatible with enabled fal.ai models.',
    };
  }

  return { ok: true, compatibleModels: compatible };
}

async function fetchFalWithTimeout(
  fetchImpl: FalFetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`fal.ai request timed out after ${Math.round(timeoutMs / 1000)}s`)),
    timeoutMs
  );
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function executeFalImageWithFallback(params: {
  prompt: string;
  imageBase64?: string;
  mimeType?: string;
  aspectRatio?: string;
  requestedModel?: string;
  overrideKeys?: ResolvedExecutableFalKey[];
  overrideConfig?: FalAiConfigState;
  fetchImpl?: FalFetchLike;
  skipStateMutation?: boolean;
}): Promise<{
  status: number;
  payload: Record<string, any>;
}> {
  const cfg = params.overrideConfig || getFalConfig();
  const keys = getEligibleFalKeysForExecution({
    overrideKeys: params.overrideKeys,
    overrideConfig: cfg,
  });

  if (keys.length === 0) {
    return buildFalExhaustedDiagnostic({ overrideKeys: params.overrideKeys });
  }

  const isEdit = Boolean(params.imageBase64 && params.mimeType);
  const modelKind = isEdit ? 'image_edit' : 'image';
  const rawCandidateModels = getCandidateFalModels(modelKind, params.requestedModel, cfg);
  const validated = validateFalInputConstraints({
    prompt: params.prompt,
    taskKind: modelKind,
    imageBase64: params.imageBase64,
    mimeType: params.mimeType,
    aspectRatio: params.aspectRatio,
    candidateModels: rawCandidateModels,
  });
  if (!validated.ok) {
    return {
      status: validated.status || 400,
      payload: { ok: false, provider: 'fal-ai', code: validated.code, error: validated.error },
    };
  }
  const candidateModels = validated.compatibleModels;

  const fetchFn = params.fetchImpl || fetch;
  const maxConc = Math.max(1, cfg.maxConcurrentPerKey || 2);
  const configuredTimeoutMs = Math.max(10_000, Math.min(180_000, (cfg.requestTimeoutSec || 45) * 1000));
  const perAttemptMs = process.env.VERCEL ? Math.min(25_000, configuredTimeoutMs) : configuredTimeoutMs;

  let lastClassified: ClassifiedFalError | null = null;
  let lastQuotaError: ClassifiedFalError | null = null;
  let attempts = 0;

  for (const keyItem of keys) {
    if (!tryAcquireFalConcurrencySlot(keyItem.id, maxConc)) {
      lastQuotaError = {
        kind: 'CONCURRENCY_LIMITED',
        httpStatus: 429,
        code: 'FAL_LOCAL_CONCURRENCY_LIMIT',
        message: `Key "${keyItem.label}" reached local concurrency limit (${maxConc}). Failing over to next key.`,
        quotaScope: 'concurrency_limit',
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
            const requestBody: Record<string, any> = {
              prompt: params.prompt.trim(),
            };
            if (isEdit && params.imageBase64 && params.mimeType) {
              requestBody.image_url = `data:${params.mimeType};base64,${params.imageBase64}`;
            }

            const resp = await fetchFalWithTimeout(
              fetchFn,
              `https://fal.run/${modelId}`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Key ${keyItem.rawKey}`,
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                },
                body: JSON.stringify(requestBody),
              },
              perAttemptMs
            );

            const rawText = await resp.text();
            if (!resp.ok) {
              const classified = classifyFalError({
                status: resp.status,
                bodyText: rawText,
                retryAfterHeader: resp.headers?.get?.('retry-after'),
                modelId,
              });
              lastClassified = classified;

              if (classified.kind === 'BAD_REQUEST') {
                return {
                  status: 400,
                  payload: {
                    ok: false,
                    provider: 'fal-ai',
                    code: classified.code,
                    error: classified.message,
                    attempts,
                  },
                };
              }

              if (classified.isModelSpecificFailure || classified.kind === 'MODEL_UNAVAILABLE') {
                if (!params.skipStateMutation) {
                  recordFalModelHealthResult(modelId, {
                    status: 'error',
                    error: classified.message,
                    cooldownMs: FAL_MODEL_COOLDOWN_MS,
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

              if (
                classified.kind === 'RATE_LIMITED' ||
                classified.kind === 'CONCURRENCY_LIMITED' ||
                classified.kind === 'QUEUE_SATURATED'
              ) {
                lastQuotaError = classified;
              }

              if (!params.skipStateMutation && classified.keyStatus) {
                recordFalKeyHealthResult(keyItem.id, {
                  status: classified.keyStatus,
                  error: classified.message,
                  cooldownMs: classified.cooldownMs,
                  quotaScope: classified.quotaScope,
                  incrementFailure: true,
                });
              }
              switchToNextKey = true;
              break;
            }

            let json: any = {};
            try {
              json = JSON.parse(rawText || '{}');
            } catch {
              json = {};
            }

            const imageUrl =
              (typeof json?.images?.[0]?.url === 'string' && json.images[0].url.trim()) ||
              (typeof json?.image?.url === 'string' && json.image.url.trim()) ||
              '';
            const outMime =
              (typeof json?.images?.[0]?.content_type === 'string' && json.images[0].content_type) ||
              (typeof json?.image?.content_type === 'string' && json.image.content_type) ||
              'image/png';

            if (!imageUrl) {
              lastClassified = {
                kind: 'MODEL_UNAVAILABLE',
                httpStatus: 502,
                code: 'FAL_NO_IMAGE_OUTPUT',
                message: `fal.ai model ${modelId} completed without returning an image URL.`,
                isModelSpecificFailure: true,
              };
              moveToNextModel = true;
              break;
            }

            if (!params.skipStateMutation) {
              recordFalKeyHealthResult(keyItem.id, { status: 'ready' });
              recordFalModelHealthResult(modelId, { status: 'ready' });
            }

            // Download image bytes server-side to avoid browser CORS errors on Post Editor canvas
            let outputBase64 = '';
            let resolvedMime = outMime;
            if (imageUrl.startsWith('data:')) {
              const commaIdx = imageUrl.indexOf(',');
              if (commaIdx !== -1) {
                outputBase64 = imageUrl.slice(commaIdx + 1);
              }
            } else {
              try {
                const imgResp = await fetchFalWithTimeout(fetchFn, imageUrl, { method: 'GET' }, 15_000);
                if (imgResp.ok) {
                  const ab = await imgResp.arrayBuffer();
                  resolvedMime = imgResp.headers?.get?.('content-type') || outMime;
                  outputBase64 = Buffer.from(ab).toString('base64');
                }
              } catch {
                // Fall back to direct imageUrl below if CDN download transiently fails
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
                    secure: true,
                  });
                  const uploaded = await cloudinary.uploader.upload(
                    `data:${resolvedMime};base64,${outputBase64}`,
                    { folder: 'king_ai_generated', resource_type: 'image', type: 'upload' }
                  );
                  if (uploaded?.secure_url) {
                    return {
                      status: 200,
                      payload: {
                        ok: true,
                        provider: 'fal-ai',
                        model: modelId,
                        keyIdUsed: keyItem.id,
                        attempts,
                        imageUrl: uploaded.secure_url,
                        mimeType: resolvedMime,
                        offloadedToCloudinary: true,
                      },
                    };
                  }
                } catch {
                  // Fall back to imageUrl
                }
              }
              if (
                process.env.VERCEL &&
                outputBase64.length > VERCEL_HARD_BASE64_LIMIT &&
                imageUrl.startsWith('http')
              ) {
                return {
                  status: 200,
                  payload: {
                    ok: true,
                    provider: 'fal-ai',
                    model: modelId,
                    keyIdUsed: keyItem.id,
                    attempts,
                    imageUrl,
                    mimeType: resolvedMime,
                  },
                };
              }
            }

            return {
              status: 200,
              payload: {
                ok: true,
                provider: 'fal-ai',
                model: modelId,
                keyIdUsed: keyItem.id,
                attempts,
                ...(outputBase64 ? { imageBase64: outputBase64 } : { imageUrl }),
                mimeType: resolvedMime,
              },
            };
          } catch (err: any) {
            const isTimeout =
              err?.name === 'AbortError' || /timed?\s*out/i.test(String(err?.message || ''));
            const classified = classifyFalError({
              status: isTimeout ? 504 : Number(err?.status || 502),
              bodyText: err?.message || String(err || 'fal.ai network failure'),
              modelId,
              isTimeout,
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
                incrementFailure: true,
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
    attempts,
  });
}

export async function executeFalVideoWithFallback(params: {
  task: 'video_generation' | 'image_to_video';
  prompt: string;
  imageBase64?: string;
  mimeType?: string;
  aspectRatio?: '16:9' | '9:16';
  duration?: string;
  requestedModel?: string;
  overrideKeys?: ResolvedExecutableFalKey[];
  overrideConfig?: FalAiConfigState;
  fetchImpl?: FalFetchLike;
  skipStateMutation?: boolean;
}): Promise<{
  status: number;
  payload: Record<string, any>;
}> {
  const cfg = params.overrideConfig || getFalConfig();
  const keys = getEligibleFalKeysForExecution({
    overrideKeys: params.overrideKeys,
    overrideConfig: cfg,
  });

  if (keys.length === 0) {
    return buildFalExhaustedDiagnostic({ overrideKeys: params.overrideKeys });
  }

  const kind = params.task === 'image_to_video' ? 'image_to_video' : 'video';
  const rawCandidateModels = getCandidateFalModels(kind, params.requestedModel, cfg);
  const validated = validateFalInputConstraints({
    prompt: params.prompt,
    taskKind: kind,
    imageBase64: params.imageBase64,
    mimeType: params.mimeType,
    aspectRatio: params.aspectRatio,
    duration: params.duration,
    candidateModels: rawCandidateModels,
  });
  if (!validated.ok) {
    return {
      status: validated.status || 400,
      payload: { ok: false, provider: 'fal-ai', code: validated.code, error: validated.error },
    };
  }
  const candidateModels = validated.compatibleModels;

  const fetchFn = params.fetchImpl || fetch;
  const maxConc = Math.max(1, cfg.maxConcurrentPerKey || 2);
  const queueWaitMs = Math.max(15_000, Math.min(240_000, (cfg.maxQueueWaitSec || 45) * 1000));
  const runBudgetMs = process.env.VERCEL ? Math.min(45_000, queueWaitMs) : queueWaitMs;
  const deadlineMs = Date.now() + runBudgetMs;

  let lastClassified: ClassifiedFalError | null = null;
  let lastQuotaError: ClassifiedFalError | null = null;
  let attempts = 0;

  for (const keyItem of keys) {
    if (!tryAcquireFalConcurrencySlot(keyItem.id, maxConc)) {
      lastQuotaError = {
        kind: 'CONCURRENCY_LIMITED',
        httpStatus: 429,
        code: 'FAL_LOCAL_CONCURRENCY_LIMIT',
        message: `Key "${keyItem.label}" reached local concurrency limit (${maxConc}). Failing over to next key.`,
        quotaScope: 'concurrency_limit',
      };
      continue;
    }

    try {
      for (const modelId of candidateModels) {
        let retryAttempt = 0;
        let switchToNextKey = false;
        let moveToNextModel = false;

        while (retryAttempt <= MAX_TRANSIENT_RETRIES_PER_KEY) {
          if (Date.now() >= deadlineMs - 2_000) {
            lastClassified = {
              kind: 'REQUEST_TIMEOUT',
              httpStatus: 504,
              code: 'FAL_VIDEO_TIMEOUT',
              message: 'fal.ai video queue exceeded server time budget.',
            };
            break;
          }

          attempts += 1;
          incrementPendingQueueJob(keyItem.id);
          try {
            const body: Record<string, any> = {
              prompt: params.prompt.trim(),
              ...(params.aspectRatio ? { aspect_ratio: params.aspectRatio } : {}),
              ...(params.duration ? { duration: params.duration.replace(/s$/i, '') } : {}),
            };
            if (params.task === 'image_to_video' && params.imageBase64 && params.mimeType) {
              body.image_url = `data:${params.mimeType};base64,${params.imageBase64}`;
            }

            const submitResp = await fetchFalWithTimeout(
              fetchFn,
              `https://queue.fal.run/${modelId}`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Key ${keyItem.rawKey}`,
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                },
                body: JSON.stringify(body),
              },
              Math.min(20_000, Math.max(5_000, deadlineMs - Date.now()))
            );

            const submitText = await submitResp.text();
            if (!submitResp.ok) {
              const classified = classifyFalError({
                status: submitResp.status,
                bodyText: submitText,
                retryAfterHeader: submitResp.headers?.get?.('retry-after'),
                modelId,
              });
              lastClassified = classified;

              if (classified.kind === 'BAD_REQUEST') {
                return {
                  status: 400,
                  payload: {
                    ok: false,
                    provider: 'fal-ai',
                    code: classified.code,
                    error: classified.message,
                    attempts,
                  },
                };
              }
              if (classified.isModelSpecificFailure || classified.kind === 'MODEL_UNAVAILABLE') {
                if (!params.skipStateMutation) {
                  recordFalModelHealthResult(modelId, {
                    status: 'error',
                    error: classified.message,
                    cooldownMs: FAL_MODEL_COOLDOWN_MS,
                  });
                }
                moveToNextModel = true;
                break;
              }
              if (
                classified.retryableWithBackoff &&
                retryAttempt < MAX_TRANSIENT_RETRIES_PER_KEY &&
                deadlineMs - Date.now() > 4_000
              ) {
                retryAttempt += 1;
                await sleepMs(computeSafeBackoffMs(retryAttempt - 1));
                continue;
              }
              if (
                classified.kind === 'RATE_LIMITED' ||
                classified.kind === 'CONCURRENCY_LIMITED' ||
                classified.kind === 'QUEUE_SATURATED'
              ) {
                lastQuotaError = classified;
              }
              if (!params.skipStateMutation && classified.keyStatus) {
                recordFalKeyHealthResult(keyItem.id, {
                  status: classified.keyStatus,
                  error: classified.message,
                  cooldownMs: classified.cooldownMs,
                  quotaScope: classified.quotaScope,
                  incrementFailure: true,
                });
              }
              switchToNextKey = true;
              break;
            }

            let queueJson: any = {};
            try {
              queueJson = JSON.parse(submitText || '{}');
            } catch {
              queueJson = {};
            }

            const directVideoUrl =
              (typeof queueJson?.video?.url === 'string' && queueJson.video.url.trim()) ||
              (typeof queueJson?.video_url === 'string' && queueJson.video_url.trim()) ||
              '';
            let resolvedVideoUrl = directVideoUrl;
            let lastQueuePosition: number | undefined =
              typeof queueJson?.queue_position === 'number' ? queueJson.queue_position : undefined;

            if (!resolvedVideoUrl && queueJson?.status_url && queueJson?.response_url) {
              while (Date.now() < deadlineMs - 2_000) {
                await sleepMs(1500);
                const stResp = await fetchFalWithTimeout(
                  fetchFn,
                  String(queueJson.status_url),
                  {
                    method: 'GET',
                    headers: { Authorization: `Key ${keyItem.rawKey}` },
                  },
                  10_000
                );
                const stJson = (await stResp.json().catch(() => ({}))) as any;
                if (typeof stJson?.queue_position === 'number') {
                  lastQueuePosition = stJson.queue_position;
                }
                if (stJson?.status === 'COMPLETED') {
                  const resResp = await fetchFalWithTimeout(
                    fetchFn,
                    String(queueJson.response_url),
                    {
                      method: 'GET',
                      headers: { Authorization: `Key ${keyItem.rawKey}` },
                    },
                    15_000
                  );
                  const resJson = (await resResp.json().catch(() => ({}))) as any;
                  resolvedVideoUrl =
                    (typeof resJson?.video?.url === 'string' && resJson.video.url.trim()) ||
                    (typeof resJson?.video_url === 'string' && resJson.video_url.trim()) ||
                    '';
                  break;
                }
                if (stJson?.status === 'FAILED' || stJson?.status === 'CANCELLED') {
                  throw new Error(stJson?.error || `fal.ai queue job ${stJson.status}`);
                }
              }
            }

            if (!resolvedVideoUrl) {
              lastClassified = {
                kind: 'REQUEST_TIMEOUT',
                httpStatus: 504,
                code: 'FAL_VIDEO_TIMEOUT',
                message: `fal.ai video queue job on ${modelId} timed out before finishing${
                  lastQueuePosition !== undefined ? ` (last queue position: ${lastQueuePosition})` : ''
                }.`,
              };
              moveToNextModel = true;
              break;
            }

            if (!params.skipStateMutation) {
              recordFalKeyHealthResult(keyItem.id, { status: 'ready' });
              recordFalModelHealthResult(modelId, { status: 'ready' });
            }

            return {
              status: 200,
              payload: {
                ok: true,
                provider: 'fal-ai',
                model: modelId,
                task: params.task,
                keyIdUsed: keyItem.id,
                requestId: typeof queueJson?.request_id === 'string' ? queueJson.request_id : undefined,
                attempts,
                videoUrl: resolvedVideoUrl,
                mimeType: 'video/mp4',
              },
            };
          } catch (err: any) {
            const isTimeout =
              err?.name === 'AbortError' || /timed?\s*out/i.test(String(err?.message || ''));
            const classified = classifyFalError({
              status: isTimeout ? 504 : Number(err?.status || 502),
              bodyText: err?.message || String(err || 'fal.ai video error'),
              modelId,
              isTimeout,
            });
            lastClassified = classified;

            if (
              classified.retryableWithBackoff &&
              retryAttempt < MAX_TRANSIENT_RETRIES_PER_KEY &&
              deadlineMs - Date.now() > 4_000
            ) {
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
                incrementFailure: true,
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
    attempts,
  });
}
