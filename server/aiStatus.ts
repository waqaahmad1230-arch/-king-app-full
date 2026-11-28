import {
  getFalConfig,
  getModelConfig,
  listFalModelHealthSummaries,
  listProjectHealthSummaries,
  listResolvedFalKeys,
  listResolvedKeys,
  listSafeFalKeySummaries,
  scrubSecretText,
  syncVaultFromRemote,
  VERIFIED_FAL_MODELS,
  VERIFIED_GEMINI_MODELS,
  type FalModelHealthRecord,
  type FalQuotaScope,
  type ImageSelectionPolicy,
  type ProjectHealthRecord,
  type QuotaScope,
  type ResolvedExecutableKey,
  type VerifiedGeminiModelSpec,
} from './aiVault.ts';

export function getBackendHost(): 'nodejs-express' | 'vercel-serverless' {
  return process.env.VERCEL ? 'vercel-serverless' : 'nodejs-express';
}

export interface KeyDiagnosticStatus {
  keyIndex: number;
  id: string;
  label: string;
  projectId?: string;
  configured: boolean;
  enabled: boolean;
  source: 'admin_vault' | 'runtime_env';
  status: 'Ready' | 'Disabled' | 'Not Configured' | 'Quota Exhausted' | 'Invalid Key' | 'Error';
  quotaScope?: QuotaScope;
}

export interface FalPublicKeyStatus {
  keyIndex: number;
  id: string;
  label: string;
  enabled: boolean;
  source: 'admin_vault' | 'runtime_env';
  status: KeyDiagnosticStatus['status'];
  quotaScope?: FalQuotaScope;
}

export interface PublicAiCapabilityStatus {
  ok: true;
  configured: boolean;
  provider: 'google-gemini';
  backendHost: 'nodejs-express' | 'vercel-serverless';
  autoRoutingEnabled: boolean;
  imageSelectionPolicy: ImageSelectionPolicy;
  photoSupported: boolean;
  textSupported: boolean;
  photoModel: string;
  textModel: string;
  videoModel: string;
  supportedModels: string[];
  verifiedModels: Array<
    VerifiedGeminiModelSpec & {
      enabled: boolean;
      isPrimary: boolean;
    }
  >;
  routingArchitecture: {
    assistantPreferred: string;
    photoTiers: {
      lite: string | null;
      standard: string | null;
      pro: string | null;
    };
    videoExclusive: string | null;
  };
  videoSupported: boolean;
  videoReason: string;
  missingEnv: string[];
  activeKeyCount: number;
  healthyKeyCount: number;
  keyStatuses: KeyDiagnosticStatus[];
  projects?: ProjectHealthRecord[];
  falConfigured?: boolean;
  falImageSupported?: boolean;
  falVideoSupported?: boolean;
  falActiveKeyCount?: number;
  falHealthyKeyCount?: number;
  falKeyStatuses?: FalPublicKeyStatus[];
  falModelHealth?: FalModelHealthRecord[];
}

function mapStatusLabel(s: ResolvedExecutableKey['status']): KeyDiagnosticStatus['status'] {
  if (s === 'ready') return 'Ready';
  if (s === 'disabled') return 'Disabled';
  if (s === 'quota_exhausted') return 'Quota Exhausted';
  if (s === 'invalid') return 'Invalid Key';
  return 'Error';
}

export function getPublicAiCapabilityStatus(): PublicAiCapabilityStatus {
  const keys = listResolvedKeys();
  const modelConfig = getModelConfig();
  const falKeys = listSafeFalKeySummaries();
  const falConfig = getFalConfig();
  const now = Date.now();

  const activeKeys = keys.filter((k) => k.enabled && k.status !== 'invalid');
  const healthyKeys = activeKeys.filter(
    (k) => k.status === 'ready' && (!k.cooldownUntil || k.cooldownUntil <= now)
  );

  const falActiveKeys = falKeys.filter((k) => k.enabled && k.status !== 'invalid');
  const falHealthyKeys = falActiveKeys.filter(
    (k) => k.status === 'ready' && (!k.cooldownUntil || k.cooldownUntil <= now)
  );
  const falConfigured = falActiveKeys.length > 0;
  const falImageSupported = falConfigured && falConfig.enableFalImageFallback;
  const falVideoSupported =
    falConfigured && (falConfig.enableFalVideoFallback || falConfig.preferFalForVideo);

  const verifiedModels = VERIFIED_GEMINI_MODELS.map((spec) => ({
    ...spec,
    enabled: Boolean(modelConfig.enabledModels[spec.id]),
    isPrimary:
      spec.id === modelConfig.primaryImageModel ||
      spec.id === modelConfig.primaryTextModel ||
      spec.id === modelConfig.primaryVideoModel,
  }));

  const enabledImageModels = verifiedModels.filter((m) => m.capability === 'image' && m.enabled);
  const enabledTextModels = verifiedModels.filter((m) => m.capability === 'text' && m.enabled);
  const enabledVideoModels = verifiedModels.filter((m) => m.capability === 'omni' && m.enabled);

  const primaryImageModel =
    enabledImageModels.find((m) => m.id === modelConfig.primaryImageModel)?.id ||
    enabledImageModels[0]?.id ||
    'gemini-3.1-flash-lite-image';

  const primaryTextModel =
    enabledTextModels.find((m) => m.id === modelConfig.primaryTextModel)?.id ||
    enabledTextModels[0]?.id ||
    'gemini-3.1-pro-preview';

  const primaryVideoModel =
    enabledVideoModels.find((m) => m.id === modelConfig.primaryVideoModel)?.id ||
    enabledVideoModels[0]?.id ||
    'gemini-omni-1.2-flash';

  const geminiConfigured = activeKeys.length > 0;
  const configured = geminiConfigured || falConfigured;
  const geminiVideoSupported = geminiConfigured && enabledVideoModels.length > 0;
  const videoSupported = geminiVideoSupported || falVideoSupported;

  return {
    ok: true,
    configured,
    provider: 'google-gemini',
    backendHost: getBackendHost(),
    autoRoutingEnabled: modelConfig.enableAutoRouting,
    imageSelectionPolicy: modelConfig.imageSelectionPolicy,
    photoSupported: (geminiConfigured && enabledImageModels.length > 0) || falImageSupported,
    textSupported: geminiConfigured && enabledTextModels.length > 0,
    photoModel: primaryImageModel,
    textModel: primaryTextModel,
    videoModel: falVideoSupported && !geminiVideoSupported ? falConfig.primaryFalVideoModel : primaryVideoModel,
    supportedModels: [
      ...enabledImageModels.map((m) => m.id),
      ...(falImageSupported
        ? VERIFIED_FAL_MODELS.filter((m) => m.capability === 'image' || m.capability === 'image_edit').map((m) => m.id)
        : []),
    ],
    verifiedModels,
    routingArchitecture: {
      assistantPreferred: primaryTextModel,
      photoTiers: {
        lite: enabledImageModels.find((m) => m.qualityTier === 'lite')?.id || null,
        standard: enabledImageModels.find((m) => m.qualityTier === 'standard')?.id || null,
        pro: enabledImageModels.find((m) => m.qualityTier === 'pro')?.id || null,
      },
      videoExclusive: enabledVideoModels[0]?.id || (falVideoSupported ? falConfig.primaryFalVideoModel : null),
    },
    videoSupported,
    videoReason: geminiVideoSupported
      ? `Gemini Omni (${primaryVideoModel}) is configured for video routing via /api/ai/route${
          falVideoSupported ? ` (with fal.ai ${falConfig.primaryFalVideoModel} failover ready)` : ''
        }. Interactive timeline editing tools (Trim, Filters, Music, Text) are available in Post Editor.`
      : falVideoSupported
      ? `fal.ai (${falConfig.primaryFalVideoModel}) is configured for video routing via /api/ai/route.`
      : 'Video AI requires an active Gemini API key with Gemini Omni or an active fal.ai API key in Admin Panel → AI Model Manager.',
    missingEnv: configured ? [] : ['ADMIN_VAULT_OR_SERVER_KEY'],
    activeKeyCount: activeKeys.length,
    healthyKeyCount: healthyKeys.length,
    keyStatuses: keys.map((k, idx) => ({
      keyIndex: idx + 1,
      id: k.id,
      label: k.source === 'admin_vault' ? `Key Slot ${idx + 1}` : `Server Key ${idx + 1}`,
      projectId: k.projectId,
      configured: true,
      enabled: k.enabled,
      source: k.source,
      status: mapStatusLabel(k.status),
      quotaScope: k.quotaScope,
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
      label: k.source === 'admin_vault' ? `fal.ai Slot ${idx + 1}` : `Server fal.ai Key ${idx + 1}`,
      enabled: k.enabled,
      source: k.source,
      status: mapStatusLabel(k.status),
      quotaScope: k.quotaScope,
    })),
    falModelHealth: listFalModelHealthSummaries(),
  };
}

export async function getPublicAiCapabilityStatusAsync(): Promise<PublicAiCapabilityStatus> {
  await syncVaultFromRemote();
  return getPublicAiCapabilityStatus();
}

export { scrubSecretText };

