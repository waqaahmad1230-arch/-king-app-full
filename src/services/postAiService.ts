import { auth } from '../firebase';

export type GeminiModelCapability = 'image' | 'text' | 'omni';
export type ImageQualityTier = 'lite' | 'standard' | 'pro';
export type ImageSelectionPolicy = 'balanced' | 'economy_first' | 'quality_first' | 'manual_primary';
export type AiTaskType =
  | 'text_chat'
  | 'photo_generation'
  | 'photo_editing'
  | 'video_generation'
  | 'image_to_video'
  | 'video_editing';
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

export interface VerifiedGeminiModelView {
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
  enabled: boolean;
  isPrimary: boolean;
}

export interface KeyDiagnosticStatus {
  keyIndex: number;
  id?: string;
  label: string;
  projectId?: string;
  configured: boolean;
  enabled?: boolean;
  source?: 'admin_vault' | 'runtime_env';
  status: 'Ready' | 'Disabled' | 'Not Configured' | 'Quota Exhausted' | 'Invalid Key' | 'Error';
  quotaScope?: QuotaScope;
}

export interface SafeAdminKeySummary {
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

export interface AiModelConfigState {
  configVersion?: number;
  enabledModels: Record<string, boolean>;
  primaryImageModel: string;
  primaryTextModel: string;
  primaryVideoModel?: string;
  imageSelectionPolicy?: ImageSelectionPolicy;
  enableAutoRouting?: boolean;
  enableKeyFallback: boolean;
  enableModelFallback: boolean;
}

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

export type FalQuotaScope = 'rpm_throttle' | 'concurrency_limit' | 'queue_limit';

export interface FalModelHealthRecord {
  modelId: string;
  status: 'ready' | 'error';
  failureCount: number;
  cooldownUntil?: number;
  lastError?: string;
  updatedAt: string;
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

export interface FalAiConfigState {
  enableFalKeyFallback: boolean;
  enableFalImageFallback: boolean;
  enableFalVideoFallback: boolean;
  preferFalForVideo: boolean;
  maxConcurrentPerKey?: number;
  requestTimeoutSec?: number;
  maxQueueWaitSec?: number;
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

export interface AdminAiManagerState {
  ok: true;
  backendHost: string;
  storageMode: string;
  persistence?: VaultPersistenceInfo;
  models: VerifiedGeminiModelView[];
  modelConfig: AiModelConfigState;
  keys: SafeAdminKeySummary[];
  projects?: ProjectHealthRecord[];
  falKeys?: SafeFalKeySummary[];
  falConfig?: FalAiConfigState;
  falModels?: VerifiedFalModelSpec[];
  falModelHealth?: FalModelHealthRecord[];
  falRuntimeMetrics?: {
    activeInFlightByKey: Record<string, number>;
    pendingQueueJobsByKey: Record<string, number>;
  };
}

export type AiBackendHealthState = 'healthy' | 'zero_keys' | 'server_error' | 'unavailable';

export interface PostAiCapabilityResponse {
  ok: boolean;
  configured: boolean;
  healthState?: AiBackendHealthState;
  httpStatus?: number;
  backendError?: string;
  provider: string;
  backendHost?: string;
  autoRoutingEnabled?: boolean;
  imageSelectionPolicy?: ImageSelectionPolicy;
  photoSupported: boolean;
  textSupported?: boolean;
  photoModel: string;
  textModel?: string;
  videoModel?: string;
  supportedModels?: string[];
  verifiedModels?: VerifiedGeminiModelView[];
  routingArchitecture?: {
    assistantPreferred: string;
    photoTiers: {
      lite: string | null;
      standard: string | null;
      pro: string | null;
    };
    videoExclusive: string | null;
  };
  videoSupported: boolean;
  videoReason?: string;
  missingEnv?: string[];
  activeKeyCount?: number;
  healthyKeyCount?: number;
  keyStatuses?: KeyDiagnosticStatus[];
  projects?: ProjectHealthRecord[];
  falConfigured?: boolean;
  falImageSupported?: boolean;
  falVideoSupported?: boolean;
  falActiveKeyCount?: number;
  falHealthyKeyCount?: number;
}

export interface AiRoutingMetadata {
  detectedTask: AiTaskType;
  domain: 'text' | 'image' | 'video';
  selectedTier: ImageQualityTier | 'pro_assistant' | 'omni_video';
  selectedModel: string | null;
  candidateModels: string[];
  isVoiceRequest: boolean;
  reason: string;
}

export interface AutoRoutedAiResult {
  ok: boolean;
  provider: string;
  model: string;
  routing: AiRoutingMetadata;
  text?: string;
  imageBase64?: string;
  imageUrl?: string;
  videoBase64?: string;
  videoUrl?: string;
  mimeType?: string;
  note?: string;
}

export interface PostAiEditResult {
  file: File;
  previewUrl: string;
  model: string;
  note?: string;
}

const MAX_UPLOAD_DIMENSION = 1536;
const MAX_REQUEST_BASE64_CHARS = 2_900_000;

async function prepareImageBase64Payload(file: File): Promise<{
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not load photo for AI processing.'));
      el.src = objectUrl;
    });

    const srcW = img.naturalWidth || img.width || 1080;
    const srcH = img.naturalHeight || img.height || 1080;
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(srcW, srcH));
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas unavailable for image preparation.');
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);

    let outMime: 'image/jpeg' | 'image/png' =
      file.type === 'image/png' && file.size <= 1.5 * 1024 * 1024 ? 'image/png' : 'image/jpeg';
    let dataUrl =
      outMime === 'image/png'
        ? canvas.toDataURL('image/png')
        : canvas.toDataURL('image/jpeg', 0.88);
    let commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) {
      throw new Error('Failed to encode photo payload.');
    }
    let base64 = dataUrl.slice(commaIdx + 1);

    // Ensure outgoing JSON body fits comfortably inside Vercel's 4.5 MB payload cap
    if (base64.length > MAX_REQUEST_BASE64_CHARS) {
      outMime = 'image/jpeg';
      for (const quality of [0.82, 0.72, 0.6]) {
        dataUrl = canvas.toDataURL('image/jpeg', quality);
        commaIdx = dataUrl.indexOf(',');
        if (commaIdx !== -1) {
          base64 = dataUrl.slice(commaIdx + 1);
          if (base64.length <= MAX_REQUEST_BASE64_CHARS) break;
        }
      }
    }

    return {
      base64,
      mimeType: outMime,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function base64ToFile(base64: string, mimeType: string, originalFileName: string): File {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const cleanMime = mimeType || 'image/png';
  const ext =
    cleanMime === 'image/jpeg' ? 'jpg' : cleanMime === 'image/webp' ? 'webp' : 'png';
  const baseName = (originalFileName || 'king_ai_image').replace(/\.[^/.]+$/, '');
  const blob = new Blob([bytes], { type: cleanMime });
  return new File([blob], `${baseName}_king_ai.${ext}`, {
    type: cleanMime,
    lastModified: Date.now(),
  });
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in first to access KING AI.');
  }
  const idToken = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  };
}

function buildHealthFallbackResponse(params: {
  healthState: 'server_error' | 'unavailable';
  httpStatus?: number;
  backendError: string;
}): PostAiCapabilityResponse {
  return {
    ok: false,
    configured: false,
    healthState: params.healthState,
    httpStatus: params.httpStatus,
    backendError: params.backendError,
    provider: 'google-gemini',
    photoSupported: false,
    photoModel: 'gemini-3.1-flash-lite-image',
    textModel: 'gemini-3.1-pro-preview',
    videoModel: 'gemini-omni-1.2-flash',
    videoSupported: false,
    videoReason: params.backendError,
  };
}

export async function parseSafeApiJson(res: Response, endpointLabel = 'AI backend'): Promise<any> {
  let rawText = '';
  try {
    rawText = await res.text();
  } catch (err: any) {
    throw new Error(`${endpointLabel} response could not be read (HTTP ${res.status}): ${err?.message || 'read error'}`);
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error(`${endpointLabel} returned an empty response (HTTP ${res.status}).`);
  }

  const lowerStart = trimmed.slice(0, 64).toLowerCase();
  if (
    lowerStart.startsWith('<!doctype') ||
    lowerStart.startsWith('<html') ||
    lowerStart.startsWith('<head') ||
    lowerStart.startsWith('<body')
  ) {
    throw new Error(
      `${endpointLabel} returned an HTML page instead of JSON (HTTP ${res.status}). Check API route configuration.`
    );
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${endpointLabel} returned an unexpected non-object response (HTTP ${res.status}).`);
    }
    return parsed;
  } catch (err: any) {
    if (err instanceof Error && err.message.startsWith(`${endpointLabel} returned an unexpected`)) {
      throw err;
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      throw new Error(`${endpointLabel} returned malformed JSON (HTTP ${res.status}).`);
    }

    // Plain-text server or serverless platform errors (e.g. "A server error has occurred\nFUNCTION_INVOCATION_FAILED")
    if (/FUNCTION_INVOCATION_FAILED/i.test(trimmed)) {
      throw new Error(`${endpointLabel} crashed on server (HTTP ${res.status}: FUNCTION_INVOCATION_FAILED).`);
    }
    if (/FUNCTION_PAYLOAD_TOO_LARGE/i.test(trimmed)) {
      throw new Error(`${endpointLabel} rejected request: payload too large (HTTP ${res.status}).`);
    }
    const singleLine = trimmed.replace(/\s+/g, ' ').slice(0, 160);
    throw new Error(`${endpointLabel} error (HTTP ${res.status}): ${singleLine}`);
  }
}

function extractApiErrorMessage(json: any, httpStatus: number, fallback: string): string {
  const candidate = json?.error?.message || json?.error || json?.message;
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }
  return `${fallback} (HTTP ${httpStatus}).`;
}

export async function checkPostAiAvailability(): Promise<PostAiCapabilityResponse> {
  let res: Response;
  try {
    res = await fetch('/api/ai/status', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (err: any) {
    return buildHealthFallbackResponse({
      healthState: 'unavailable',
      backendError: err?.message || 'Unable to reach AI backend endpoint (/api/ai/status).',
    });
  }

  let parsed: any = null;
  try {
    parsed = await parseSafeApiJson(res, 'AI status endpoint');
  } catch (parseErr: any) {
    if (!res.ok) {
      return buildHealthFallbackResponse({
        healthState: 'server_error',
        httpStatus: res.status,
        backendError: parseErr?.message || `Backend returned HTTP ${res.status}.`,
      });
    }
    return buildHealthFallbackResponse({
      healthState: 'unavailable',
      httpStatus: res.status,
      backendError: parseErr?.message || 'AI backend route (/api/ai/status) returned a non-JSON response.',
    });
  }

  if (!res.ok) {
    return buildHealthFallbackResponse({
      healthState: 'server_error',
      httpStatus: res.status,
      backendError: extractApiErrorMessage(parsed, res.status, 'Backend returned an error'),
    });
  }

  if (parsed.ok === false) {
    return buildHealthFallbackResponse({
      healthState: 'server_error',
      httpStatus: res.status,
      backendError: extractApiErrorMessage(parsed, res.status, 'AI backend reported an internal error'),
    });
  }

  const cap = parsed as PostAiCapabilityResponse;
  const activeCount = cap.activeKeyCount ?? (cap.keyStatuses?.filter((k) => k.configured && k.enabled !== false).length || 0);
  return {
    ...cap,
    httpStatus: res.status,
    healthState: cap.configured || activeCount > 0 ? 'healthy' : 'zero_keys',
  };
}

export async function requestAiPhotoEdit(params: {
  file?: File | null;
  prompt: string;
  presetAction?: string;
  model?: string;
  qualityHint?: ImageQualityTier;
  onProgress?: (pct: number, label: string) => void;
}): Promise<PostAiEditResult> {
  const headers = await getAuthHeaders();

  let base64: string | undefined;
  let mimeType: string | undefined;

  if (params.file) {
    params.onProgress?.(20, 'Preparing photo for KING AI...');
    const encoded = await prepareImageBase64Payload(params.file);
    base64 = encoded.base64;
    mimeType = encoded.mimeType;
  } else {
    params.onProgress?.(25, 'Preparing AI image prompt...');
  }

  params.onProgress?.(55, 'Generating image with Gemini...');
  const res = await fetch('/api/post-editor/ai-edit', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mediaType: 'photo',
      mimeType,
      imageBase64: base64,
      prompt: params.prompt,
      presetAction: params.presetAction,
      model: params.model,
      qualityHint: params.qualityHint,
    }),
  });

  const json = await parseSafeApiJson(res, 'AI Edit endpoint');

  if (!res.ok || json.ok !== true) {
    throw new Error(extractApiErrorMessage(json, res.status, 'AI generation failed'));
  }

  const hasImageBase64 = typeof json.imageBase64 === 'string' && json.imageBase64.trim().length > 0;
  const hasImageUrl = typeof json.imageUrl === 'string' && json.imageUrl.trim().length > 0;
  if (!hasImageBase64 && !hasImageUrl) {
    throw new Error(
      json.error || `AI Edit succeeded (HTTP ${res.status}) without returning generated image data.`
    );
  }

  params.onProgress?.(90, 'Rendering image preview...');
  let editedFile: File;
  if (hasImageBase64) {
    editedFile = base64ToFile(
      json.imageBase64,
      json.mimeType || 'image/png',
      params.file?.name || 'king_ai_generated'
    );
  } else {
    const imgResp = await fetch(String(json.imageUrl));
    if (!imgResp.ok) {
      throw new Error('Generated AI image could not be downloaded from CDN.');
    }
    const blob = await imgResp.blob();
    const cleanMime = blob.type || json.mimeType || 'image/png';
    const ext =
      cleanMime === 'image/jpeg' ? 'jpg' : cleanMime === 'image/webp' ? 'webp' : 'png';
    const baseName = (params.file?.name || 'king_ai_generated').replace(/\.[^/.]+$/, '');
    editedFile = new File([blob], `${baseName}_king_ai.${ext}`, {
      type: cleanMime,
      lastModified: Date.now(),
    });
  }
  const previewUrl = URL.createObjectURL(editedFile);

  params.onProgress?.(100, 'Ready');
  return {
    file: editedFile,
    previewUrl,
    model: json.model || params.model || 'gemini-3.1-flash-lite-image',
    note: json.note,
  };
}

export async function requestAiTextGenerate(params: {
  prompt: string;
  systemInstruction?: string;
  model?: string;
}): Promise<{ text: string; model: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/text-generate', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: params.prompt,
      systemInstruction: params.systemInstruction,
      model: params.model,
    }),
  });
  const json = await parseSafeApiJson(res, 'AI Text endpoint');
  if (!res.ok || json.ok !== true) {
    throw new Error(extractApiErrorMessage(json, res.status, 'AI text generation failed'));
  }
  if (typeof json.text !== 'string' || !json.text.trim()) {
    throw new Error(`AI Text endpoint succeeded (HTTP ${res.status}) without returning text output.`);
  }
  return {
    text: json.text,
    model: json.model || params.model || 'gemini-3.1-pro-preview',
  };
}

export async function requestAutoRoutedAi(params: {
  prompt: string;
  task?: AiTaskType | 'auto' | 'voice_request';
  mediaType?: 'photo' | 'video' | 'text' | 'audio';
  isVoiceRequest?: boolean;
  file?: File | null;
  videoUri?: string;
  presetAction?: string;
  systemInstruction?: string;
  qualityHint?: ImageQualityTier;
  aspectRatio?: '16:9' | '9:16';
  duration?: string;
  resolution?: '360p' | '720p' | '1080p' | '4k';
}): Promise<AutoRoutedAiResult> {
  const headers = await getAuthHeaders();

  let imageBase64: string | undefined;
  let mimeType: string | undefined;
  if (params.file && params.file.type.startsWith('image/')) {
    const encoded = await prepareImageBase64Payload(params.file);
    imageBase64 = encoded.base64;
    mimeType = encoded.mimeType;
  }

  const res = await fetch('/api/ai/route', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: params.prompt,
      task: params.task || 'auto',
      mediaType: params.mediaType,
      isVoiceRequest: Boolean(params.isVoiceRequest),
      presetAction: params.presetAction,
      imageBase64,
      mimeType,
      videoUri: params.videoUri,
      systemInstruction: params.systemInstruction,
      qualityHint: params.qualityHint,
      aspectRatio: params.aspectRatio,
      duration: params.duration,
      resolution: params.resolution,
    }),
  });

  const json = await parseSafeApiJson(res, 'AI Router endpoint');

  if (!res.ok || json.ok !== true) {
    throw new Error(extractApiErrorMessage(json, res.status, 'AI routing failed'));
  }

  return json as AutoRoutedAiResult;
}

// --- ADMIN PANEL AI MODEL MANAGER & KEY VAULT CLIENT CALLS ---

async function adminFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers || {}),
    },
  });
  const json = await parseSafeApiJson(res, 'Admin AI endpoint');
  if (!res.ok || json.ok === false) {
    throw new Error(extractApiErrorMessage(json, res.status, 'Admin AI request failed'));
  }
  return json as T;
}

export async function fetchAdminAiState(): Promise<AdminAiManagerState> {
  return adminFetch<AdminAiManagerState>('/api/admin/ai/state', { method: 'GET' });
}

export async function fetchAdminLiveModels(): Promise<{
  ok: boolean;
  httpStatus: number;
  models: Array<{
    name: string;
    id: string;
    displayName: string;
    description: string;
    supportedGenerationMethods: string[];
  }>;
  error?: string;
}> {
  return adminFetch('/api/admin/ai/live-models', { method: 'GET' });
}

export async function updateAdminAiModels(
  patch: Partial<AiModelConfigState>
): Promise<{ ok: boolean; state: AdminAiManagerState }> {
  return adminFetch('/api/admin/ai/models', {
    method: 'POST',
    body: JSON.stringify(patch),
  });
}

export async function addAdminAiKey(params: {
  label: string;
  apiKey: string;
  priority?: number;
  projectId?: string;
}): Promise<{ ok: boolean; key: SafeAdminKeySummary; state: AdminAiManagerState }> {
  return adminFetch('/api/admin/ai/keys', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function updateAdminAiKey(
  keyId: string,
  patch: {
    label?: string;
    projectId?: string;
    apiKey?: string;
    enabled?: boolean;
    priority?: number;
    resetHealth?: boolean;
  }
): Promise<{ ok: boolean; key: SafeAdminKeySummary; state: AdminAiManagerState }> {
  return adminFetch(`/api/admin/ai/keys/${encodeURIComponent(keyId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteAdminAiKey(
  keyId: string
): Promise<{ ok: boolean; state: AdminAiManagerState }> {
  return adminFetch(`/api/admin/ai/keys/${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
  });
}

export async function testAdminAiKey(keyId: string): Promise<{
  ok: boolean;
  latencyMs?: number;
  model?: string;
  message?: string;
  error?: string;
  state: AdminAiManagerState;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/ai/test-key', {
    method: 'POST',
    headers,
    body: JSON.stringify({ keyId }),
  });
  return parseSafeApiJson(res, 'Admin key test endpoint');
}

export async function testAdminAiModel(params: {
  modelId: string;
  keyId?: string;
}): Promise<{
  ok: boolean;
  modelId: string;
  capability?: string;
  latencyMs?: number;
  previewText?: string;
  imageBytesApprox?: number;
  error?: string;
  code?: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/ai/test-model', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  return parseSafeApiJson(res, 'Admin model test endpoint');
}

// --- ADMIN fal.ai KEY VAULT & TECHNICAL FAILOVER CLIENT CALLS ---

export async function updateAdminFalConfig(
  patch: Partial<FalAiConfigState>
): Promise<{ ok: boolean; falConfig: FalAiConfigState; state: AdminAiManagerState }> {
  return adminFetch('/api/admin/ai/fal/config', {
    method: 'POST',
    body: JSON.stringify(patch),
  });
}

export async function addAdminFalKey(params: {
  label: string;
  apiKey: string;
  priority?: number;
}): Promise<{ ok: boolean; key: SafeFalKeySummary; state: AdminAiManagerState }> {
  return adminFetch('/api/admin/ai/fal/keys', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function updateAdminFalKey(
  keyId: string,
  patch: {
    label?: string;
    apiKey?: string;
    enabled?: boolean;
    priority?: number;
    resetHealth?: boolean;
  }
): Promise<{ ok: boolean; key: SafeFalKeySummary; state: AdminAiManagerState }> {
  return adminFetch(`/api/admin/ai/fal/keys/${encodeURIComponent(keyId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteAdminFalKey(
  keyId: string
): Promise<{ ok: boolean; state: AdminAiManagerState }> {
  return adminFetch(`/api/admin/ai/fal/keys/${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
  });
}

export async function testAdminFalKey(keyId: string): Promise<{
  ok: boolean;
  keyId?: string;
  latencyMs?: number;
  quotaScope?: FalQuotaScope;
  code?: string;
  message?: string;
  error?: string;
  state: AdminAiManagerState;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/ai/fal/test-key', {
    method: 'POST',
    headers,
    body: JSON.stringify({ keyId }),
  });
  return parseSafeApiJson(res, 'Admin fal.ai key test endpoint');
}
