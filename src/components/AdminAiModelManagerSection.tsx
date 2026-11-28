import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Edit3,
  Image as ImageIcon,
  Key,
  Layers,
  Loader2,
  MessageSquare,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  addAdminAiKey,
  addAdminFalKey,
  AdminAiManagerState,
  deleteAdminAiKey,
  deleteAdminFalKey,
  FalAiConfigState,
  fetchAdminAiState,
  fetchAdminLiveModels,
  requestAiTextGenerate,
  SafeAdminKeySummary,
  SafeFalKeySummary,
  testAdminAiKey,
  testAdminAiModel,
  testAdminFalKey,
  updateAdminAiKey,
  updateAdminAiModels,
  updateAdminFalConfig,
  updateAdminFalKey,
} from '../services/postAiService';

interface AdminAiModelManagerSectionProps {
  showToast: (msg: string) => void;
}

function formatQuotaScopeLabel(scope?: string): string | null {
  if (scope === 'rpm_throttle') return 'RPM Throttle (429)';
  if (scope === 'daily_rpd') return 'Daily RPD';
  if (scope === 'billing') return 'Billing Exhausted';
  if (scope === 'concurrency_limit') return 'Concurrency Limit';
  if (scope === 'queue_limit') return 'Queue Limit';
  return null;
}

function formatCooldownTimer(cooldownUntil: number | undefined, nowMs: number): string | null {
  if (!cooldownUntil || cooldownUntil <= nowMs) return null;
  const remainingSec = Math.max(1, Math.ceil((cooldownUntil - nowMs) / 1000));
  if (remainingSec < 60) return `${remainingSec}s`;
  const remainingMin = Math.ceil(remainingSec / 60);
  if (remainingMin < 60) return `${remainingMin}m`;
  const hours = Math.floor(remainingMin / 60);
  const mins = remainingMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function AdminAiModelManagerSection({ showToast }: AdminAiModelManagerSectionProps) {
  const [aiState, setAiState] = useState<AdminAiManagerState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Add Key Form State
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyProjectId, setNewKeyProjectId] = useState('');
  const [newKeySecret, setNewKeySecret] = useState('');
  const [savingNewKey, setSavingNewKey] = useState(false);

  // Inline Key Update State
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editProjectId, setEditProjectId] = useState('');
  const [editSecret, setEditSecret] = useState('');
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);

  // Model & Test State
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [modelTestOutput, setModelTestOutput] = useState<{
    modelId: string;
    ok: boolean;
    detail: string;
  } | null>(null);

  // Live Text Prompt Sandbox
  const [textPrompt, setTextPrompt] = useState('Write a 1-sentence motivational tagline for KING App creators.');
  const [runningTextGen, setRunningTextGen] = useState(false);
  const [textGenResult, setTextGenResult] = useState<{ model: string; text: string } | null>(null);

  // Live Google Models API Verification
  const [checkingLiveCatalog, setCheckingLiveCatalog] = useState(false);
  const [liveCatalogSummary, setLiveCatalogSummary] = useState<{
    ok: boolean;
    totalCount: number;
    matchedIds: string[];
    missingIds: string[];
    error?: string;
  } | null>(null);

  // fal.ai Isolated Key Vault & Operational Health Form State
  const [newFalLabel, setNewFalLabel] = useState('');
  const [newFalSecret, setNewFalSecret] = useState('');
  const [newFalPriority, setNewFalPriority] = useState('1');
  const [savingNewFalKey, setSavingNewFalKey] = useState(false);
  const [editingFalKeyId, setEditingFalKeyId] = useState<string | null>(null);
  const [editFalLabel, setEditFalLabel] = useState('');
  const [editFalSecret, setEditFalSecret] = useState('');
  const [editFalPriority, setEditFalPriority] = useState('1');
  const [busyFalKeyId, setBusyFalKeyId] = useState<string | null>(null);
  const [busyFalConfig, setBusyFalConfig] = useState(false);
  const [falTestBanner, setFalTestBanner] = useState<{
    ok: boolean;
    keyLabel: string;
    detail: string;
  } | null>(null);

  const loadState = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchAdminAiState();
      setAiState(data);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load Admin AI Model Manager state.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    const now = Date.now();
    const hasActiveCooldown = Boolean(
      aiState?.keys.some((k) => {
        const until = Math.max(k.cooldownUntil || 0, k.projectCooldownUntil || 0);
        return until > now;
      }) ||
        aiState?.projects?.some((p) => (p.cooldownUntil || 0) > now) ||
        aiState?.falKeys?.some((fk) => (fk.cooldownUntil || 0) > now) ||
        aiState?.falModelHealth?.some((mh) => (mh.cooldownUntil || 0) > now)
    );
    if (!hasActiveCooldown) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, [aiState]);

  const handleToggleModel = async (modelId: string, nextEnabled: boolean) => {
    if (!aiState) return;
    try {
      const res = await updateAdminAiModels({
        enabledModels: {
          ...aiState.modelConfig.enabledModels,
          [modelId]: nextEnabled,
        },
      });
      setAiState(res.state);
      showToast(`${modelId} ${nextEnabled ? 'enabled' : 'disabled'}.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to update model.');
    }
  };

  const handleSetPrimaryModel = async (capability: 'image' | 'text', modelId: string) => {
    try {
      const res = await updateAdminAiModels(
        capability === 'image'
          ? { primaryImageModel: modelId }
          : { primaryTextModel: modelId }
      );
      setAiState(res.state);
      showToast(`Primary ${capability} model set to ${modelId}.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to set primary model.');
    }
  };

  const handleToggleFallbackFlag = async (
    field: 'enableKeyFallback' | 'enableModelFallback',
    nextVal: boolean
  ) => {
    try {
      const res = await updateAdminAiModels({ [field]: nextVal });
      setAiState(res.state);
      showToast('Fallback policy updated.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update fallback policy.');
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeySecret.trim() || savingNewKey) return;
    setSavingNewKey(true);
    try {
      const res = await addAdminAiKey({
        label: newKeyLabel.trim() || 'Admin Gemini Key',
        projectId: newKeyProjectId.trim() || undefined,
        apiKey: newKeySecret.trim(),
      });
      setAiState(res.state);
      setNewKeyLabel('');
      setNewKeyProjectId('');
      setNewKeySecret('');
      showToast('API key encrypted and stored in backend vault.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to add API key.');
    } finally {
      setSavingNewKey(false);
    }
  };

  const handleToggleKeyEnabled = async (keyItem: SafeAdminKeySummary) => {
    setBusyKeyId(keyItem.id);
    try {
      const res = await updateAdminAiKey(keyItem.id, { enabled: !keyItem.enabled });
      setAiState(res.state);
      showToast(`${keyItem.label} ${!keyItem.enabled ? 'enabled' : 'disabled'}.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to update key.');
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleResetKeyHealth = async (keyItem: SafeAdminKeySummary) => {
    setBusyKeyId(keyItem.id);
    try {
      const res = await updateAdminAiKey(keyItem.id, { resetHealth: true, enabled: true });
      setAiState(res.state);
      showToast(`${keyItem.label} health reset.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to reset key.');
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleSaveKeyEdit = async (keyItem: SafeAdminKeySummary) => {
    setBusyKeyId(keyItem.id);
    try {
      const res = await updateAdminAiKey(keyItem.id, {
        ...(keyItem.source === 'admin_vault'
          ? {
              label: editLabel.trim() || undefined,
              apiKey: editSecret.trim() || undefined,
            }
          : {}),
        projectId: editProjectId.trim(),
      });
      setAiState(res.state);
      setEditingKeyId(null);
      setEditLabel('');
      setEditProjectId('');
      setEditSecret('');
      showToast('API key updated securely.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update key.');
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleDeleteKey = async (keyItem: SafeAdminKeySummary) => {
    setBusyKeyId(keyItem.id);
    try {
      const res = await deleteAdminAiKey(keyItem.id);
      setAiState(res.state);
      showToast(`Deleted ${keyItem.label}.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete key.');
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleTestKey = async (keyItem: SafeAdminKeySummary) => {
    setBusyKeyId(keyItem.id);
    try {
      const res = await testAdminAiKey(keyItem.id);
      if (res.state) setAiState(res.state);
      showToast(
        res.ok
          ? res.message || `${keyItem.label} is live (${res.latencyMs}ms)`
          : res.error || `${keyItem.label} test failed`
      );
    } catch (err: any) {
      showToast(err?.message || 'Key test failed.');
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleTestModel = async (modelId: string) => {
    setTestingModelId(modelId);
    setModelTestOutput(null);
    try {
      const res = await testAdminAiModel({ modelId });
      setModelTestOutput({
        modelId,
        ok: Boolean(res.ok),
        detail: res.ok
          ? res.capability === 'text' || res.capability === 'omni'
            ? `OK (${res.latencyMs}ms): "${res.previewText}"`
            : `OK (${res.latencyMs}ms): Generated ~${Math.round((res.imageBytesApprox || 0) / 1024)} KB image`
          : `${res.code || 'ERROR'}: ${res.error || 'Model test failed'}`,
      });
    } catch (err: any) {
      setModelTestOutput({
        modelId,
        ok: false,
        detail: err?.message || 'Model test failed.',
      });
    } finally {
      setTestingModelId(null);
    }
  };

  const handleRunTextGenTest = async () => {
    if (!textPrompt.trim() || runningTextGen) return;
    setRunningTextGen(true);
    setTextGenResult(null);
    try {
      const res = await requestAiTextGenerate({
        prompt: textPrompt.trim(),
        model: aiState?.modelConfig.primaryTextModel || 'gemini-3.1-flash-lite',
      });
      setTextGenResult(res);
    } catch (err: any) {
      showToast(err?.message || 'Text generation failed.');
    } finally {
      setRunningTextGen(false);
    }
  };

  const handleVerifyLiveCatalog = async () => {
    if (checkingLiveCatalog) return;
    setCheckingLiveCatalog(true);
    try {
      const res = await fetchAdminLiveModels();
      if (!res.ok) {
        setLiveCatalogSummary({
          ok: false,
          totalCount: 0,
          matchedIds: [],
          missingIds: [],
          error: res.error || 'Failed to query live Google Models API.',
        });
        return;
      }
      const liveSet = new Set(res.models.map((m) => m.id));
      const configuredIds = (aiState?.models || []).map((m) => m.id);
      const matchedIds = configuredIds.filter((id) => liveSet.has(id));
      const missingIds = configuredIds.filter((id) => !liveSet.has(id));
      setLiveCatalogSummary({
        ok: true,
        totalCount: res.models.length,
        matchedIds,
        missingIds,
      });
      showToast(`Verified ${matchedIds.length}/${configuredIds.length} models against Google API (${res.models.length} total).`);
    } catch (err: any) {
      setLiveCatalogSummary({
        ok: false,
        totalCount: 0,
        matchedIds: [],
        missingIds: [],
        error: err?.message || 'Live Models API query failed.',
      });
    } finally {
      setCheckingLiveCatalog(false);
    }
  };

  // --- fal.ai ISOLATED ADMIN HANDLERS ---

  const handleUpdateFalConfigPatch = async (patch: Partial<FalAiConfigState>) => {
    if (busyFalConfig) return;
    setBusyFalConfig(true);
    try {
      const res = await updateAdminFalConfig(patch);
      setAiState(res.state);
      showToast('fal.ai routing & failover policy updated.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update fal.ai configuration.');
    } finally {
      setBusyFalConfig(false);
    }
  };

  const handleAddFalKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFalSecret.trim() || savingNewFalKey) return;
    setSavingNewFalKey(true);
    try {
      const priorityNum = Number(newFalPriority);
      const res = await addAdminFalKey({
        label: newFalLabel.trim() || 'Admin fal.ai Key',
        apiKey: newFalSecret.trim(),
        priority: Number.isFinite(priorityNum) && priorityNum >= 1 ? Math.round(priorityNum) : undefined,
      });
      setAiState(res.state);
      setNewFalLabel('');
      setNewFalSecret('');
      setNewFalPriority('1');
      showToast('fal.ai key encrypted and stored in isolated vault.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to add fal.ai API key.');
    } finally {
      setSavingNewFalKey(false);
    }
  };

  const handleToggleFalKeyEnabled = async (keyItem: SafeFalKeySummary) => {
    setBusyFalKeyId(keyItem.id);
    try {
      const res = await updateAdminFalKey(keyItem.id, { enabled: !keyItem.enabled });
      setAiState(res.state);
      showToast(`${keyItem.label} ${!keyItem.enabled ? 'enabled' : 'disabled'}.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to update fal.ai key.');
    } finally {
      setBusyFalKeyId(null);
    }
  };

  const handleResetFalKeyHealth = async (keyItem: SafeFalKeySummary) => {
    setBusyFalKeyId(keyItem.id);
    try {
      const res = await updateAdminFalKey(keyItem.id, { resetHealth: true, enabled: true });
      setAiState(res.state);
      showToast(`${keyItem.label} health & cooldown cleared.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to reset fal.ai key health.');
    } finally {
      setBusyFalKeyId(null);
    }
  };

  const handleSaveFalKeyEdit = async (keyItem: SafeFalKeySummary) => {
    setBusyFalKeyId(keyItem.id);
    try {
      const priorityNum = Number(editFalPriority);
      const res = await updateAdminFalKey(keyItem.id, {
        ...(keyItem.source === 'admin_vault'
          ? {
              label: editFalLabel.trim() || undefined,
              apiKey: editFalSecret.trim() || undefined,
            }
          : {}),
        priority: Number.isFinite(priorityNum) && priorityNum >= 1 ? Math.round(priorityNum) : undefined,
      });
      setAiState(res.state);
      setEditingFalKeyId(null);
      setEditFalLabel('');
      setEditFalSecret('');
      showToast('fal.ai API key updated securely.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update fal.ai key.');
    } finally {
      setBusyFalKeyId(null);
    }
  };

  const handleDeleteFalKey = async (keyItem: SafeFalKeySummary) => {
    setBusyFalKeyId(keyItem.id);
    try {
      const res = await deleteAdminFalKey(keyItem.id);
      setAiState(res.state);
      showToast(`Deleted ${keyItem.label}.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete fal.ai key.');
    } finally {
      setBusyFalKeyId(null);
    }
  };

  const handleTestFalKey = async (keyItem: SafeFalKeySummary) => {
    setBusyFalKeyId(keyItem.id);
    setFalTestBanner(null);
    try {
      const res = await testAdminFalKey(keyItem.id);
      if (res.state) setAiState(res.state);
      const detail = res.ok
        ? res.message || `${keyItem.label} passed fal.ai connection check (${res.latencyMs ?? 0}ms).`
        : res.error || res.message || `${keyItem.label} fal.ai test failed.`;
      setFalTestBanner({
        ok: Boolean(res.ok),
        keyLabel: keyItem.label,
        detail,
      });
      showToast(detail);
    } catch (err: any) {
      const msg = err?.message || 'fal.ai key test failed.';
      setFalTestBanner({ ok: false, keyLabel: keyItem.label, detail: msg });
      showToast(msg);
    } finally {
      setBusyFalKeyId(null);
    }
  };

  if (loading && !aiState) {
    return (
      <div className="p-6 rounded-2xl bg-[#070c17] border border-blue-500/30 flex items-center justify-center gap-2 text-xs text-slate-300">
        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
        <span>Loading Admin AI Model Manager...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => void loadState()}
            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-white font-bold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Architecture Security & Persistence Banner */}
      <div className="p-3.5 rounded-2xl bg-[#0c1424] border border-blue-500/40 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="font-black text-white flex items-center gap-2 flex-wrap">
                <span>
                  {aiState?.backendHost === 'vercel-serverless'
                    ? 'Vercel Serverless Backend'
                    : 'Node.js Express Backend'}{' '}
                  • AES-256-GCM Vault
                </span>
                {aiState?.persistence?.remoteSyncStatus === 'error' ||
                aiState?.persistence?.decryptionError ? (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold uppercase">
                    Vault Sync / Decrypt Error
                  </span>
                ) : aiState?.persistence?.storageScope === 'upstash_redis_encrypted' &&
                  aiState.persistence.encryptionKeyPersistent ? (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold uppercase">
                    Upstash Redis Persistent
                  </span>
                ) : (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold uppercase">
                    Local / Ephemeral Vault
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                API keys added below are encrypted server-side with AES-256-GCM before storage and never exposed to browsers or public Firestore.
                {aiState?.persistence?.storageScope === 'upstash_redis_encrypted'
                  ? ' Vault records and model configurations persist across serverless cold starts in encrypted Upstash Redis.'
                  : ' Configure UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, and AI_VAULT_SECRET for persistent serverless vault storage.'}
              </p>
              {aiState?.persistence?.lastSyncedAt && (
                <div className="text-[10px] text-slate-400 font-mono">
                  Last Upstash Sync: {new Date(aiState.persistence.lastSyncedAt).toLocaleString()}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadState()}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer shrink-0"
            title="Refresh AI state"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {(aiState?.persistence?.decryptionError || aiState?.persistence?.remoteError) && (
          <div className="p-2.5 rounded-xl bg-rose-950/75 border border-rose-500/45 flex items-start gap-2 text-[11px] text-rose-200 leading-snug">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              {aiState.persistence.decryptionError && (
                <div>
                  <span className="font-bold">Decryption Recovery Alert: </span>
                  <span>{aiState.persistence.decryptionError}</span>
                </div>
              )}
              {aiState.persistence.remoteError && (
                <div>
                  <span className="font-bold">Remote Storage Error: </span>
                  <span>{aiState.persistence.remoteError}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {aiState?.persistence?.warning &&
          aiState.persistence.warning !== aiState.persistence.decryptionError &&
          aiState.persistence.warning !== aiState.persistence.remoteError && (
            <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-500/35 flex items-start gap-2 text-[11px] text-amber-200 leading-snug">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Persistence Notice: </span>
                <span>{aiState.persistence.warning}</span>
              </div>
            </div>
          )}
      </div>

      {/* SECTION 1: ENCRYPTED API KEY VAULT */}
      <div className="p-4 bg-[#070b14] border border-slate-800 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-black text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
            <Key className="w-4 h-4" />
            <span>API Key Vault ({aiState?.keys.length || 0} Configured)</span>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(aiState?.modelConfig.enableKeyFallback)}
              onChange={(e) => void handleToggleFallbackFlag('enableKeyFallback', e.target.checked)}
              className="accent-blue-500"
            />
            <span>Auto-Fallback Eligible Keys</span>
          </label>
        </div>

        {/* Add Key Form */}
        <form onSubmit={handleAddKey} className="p-3 rounded-xl bg-[#03060d] border border-slate-800 space-y-2">
          <div className="text-[11px] font-bold text-slate-200">Add Gemini API Key (Encrypted on Server)</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              placeholder="Label (e.g. Primary Paid Project)"
              className="bg-[#080d1a] border border-slate-700 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              value={newKeyProjectId}
              onChange={(e) => setNewKeyProjectId(e.target.value)}
              placeholder="Google Cloud Project ID (e.g. gcp-ai-1)"
              className="bg-[#080d1a] border border-slate-700 text-white px-3 py-2 rounded-xl text-xs font-mono focus:outline-none focus:border-blue-500"
            />
            <input
              type="password"
              value={newKeySecret}
              onChange={(e) => setNewKeySecret(e.target.value)}
              placeholder="Paste AIza... Gemini API Key"
              autoComplete="new-password"
              className="bg-[#080d1a] border border-slate-700 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={savingNewKey || !newKeySecret.trim()}
            className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer transition"
          >
            {savingNewKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            <span>Encrypt &amp; Save Key to Backend</span>
          </button>
        </form>

        {/* Google Cloud Project Quota Health Summary */}
        {(aiState?.projects || []).length > 0 && (
          <div className="p-3 rounded-xl bg-[#03060d] border border-slate-800 space-y-2">
            <div className="text-[11px] font-bold text-slate-200 flex items-center justify-between gap-2">
              <span>Google Cloud Project Rotation Pool ({aiState!.projects!.length})</span>
              <span className="text-[10px] font-normal text-slate-400">Round-robin across healthy projects</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {aiState!.projects!.map((p) => {
                const projTimer = formatCooldownTimer(p.cooldownUntil, nowMs);
                const projScope = formatQuotaScopeLabel(p.quotaScope);
                const projBadge =
                  p.status === 'ready'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : p.status === 'quota_exhausted'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40';
                return (
                  <div
                    key={p.projectId}
                    className="p-2.5 rounded-lg bg-[#070b14] border border-slate-800/90 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <span className="text-[11px] font-mono font-bold text-blue-300 truncate">
                        {p.projectId}
                      </span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {projScope && p.status !== 'ready' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-950/70 text-amber-300 border border-amber-500/30 font-semibold">
                            {projScope}
                          </span>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold uppercase ${projBadge}`}>
                          {p.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    {projTimer && (
                      <div className="text-[10px] text-amber-300 font-mono">
                        Cooldown: {projTimer} remaining
                      </div>
                    )}
                    {p.lastError && p.status !== 'ready' && (
                      <div className="text-[10px] text-slate-400 truncate" title={p.lastError}>
                        {p.lastError}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Key List */}
        <div className="space-y-2">
          {(aiState?.keys || []).length === 0 ? (
            <div className="text-xs text-slate-500 py-3 text-center">
              No API keys configured yet. Add a Gemini API key above.
            </div>
          ) : (
            aiState!.keys.map((k) => {
              const isBusy = busyKeyId === k.id;
              const isEditing = editingKeyId === k.id;
              const effectiveCooldownUntil = Math.max(k.cooldownUntil || 0, k.projectCooldownUntil || 0) || undefined;
              const cooldownRemaining = formatCooldownTimer(effectiveCooldownUntil, nowMs);
              const quotaScopeLabel = formatQuotaScopeLabel(k.quotaScope);
              const statusBadgeClass =
                k.status === 'ready'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : k.status === 'disabled'
                  ? 'bg-slate-800 text-slate-400 border-slate-700'
                  : k.status === 'quota_exhausted'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40';

              return (
                <div
                  key={k.id}
                  className="p-3 rounded-xl bg-[#03060d] border border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white flex items-center gap-2 flex-wrap">
                        <span className="truncate">{k.label}</span>
                        <span className="font-mono text-[10px] text-slate-400">{k.maskedKey}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-800 uppercase">
                          {k.source === 'admin_vault' ? 'Vault' : 'Env'}
                        </span>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full border font-mono ${
                            k.projectId
                              ? 'bg-blue-500/15 text-blue-300 border-blue-500/35'
                              : 'bg-slate-900 text-slate-500 border-slate-800'
                          }`}
                        >
                          {k.projectId ? `Project: ${k.projectId}` : 'No Project ID'}
                        </span>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase ${statusBadgeClass}`}>
                          {k.status.replace('_', ' ')}
                        </span>
                        {quotaScopeLabel && k.status !== 'ready' && k.status !== 'disabled' && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-950/70 text-amber-300 border border-amber-500/30 font-semibold">
                            {quotaScopeLabel}
                          </span>
                        )}
                      </div>
                      {(cooldownRemaining || k.lastTestedAt) && (
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                          {cooldownRemaining && (
                            <span className="text-amber-300 font-mono">
                              Cooldown: {cooldownRemaining} remaining
                            </span>
                          )}
                          {k.lastTestedAt && (
                            <span>Last checked: {new Date(k.lastTestedAt).toLocaleString()}</span>
                          )}
                        </div>
                      )}
                      {k.lastError && (
                        <div className="text-[10px] text-amber-300 mt-1 break-words">
                          {k.lastError}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleTestKey(k)}
                        className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/35 border border-blue-500/40 text-blue-300 text-[10px] font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1"
                        title="Run live Gemini API test with this key"
                      >
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        <span>Test</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleKeyEnabled(k)}
                        className={`p-1.5 rounded-lg border text-[10px] cursor-pointer ${
                          k.enabled
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                        title={k.enabled ? 'Disable key' : 'Enable key'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>

                      {k.status !== 'ready' && k.enabled && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleResetKeyHealth(k)}
                          className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 cursor-pointer"
                          title="Clear cooldown / error status"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setEditingKeyId(isEditing ? null : k.id);
                          setEditLabel(k.label);
                          setEditProjectId(k.projectId || '');
                          setEditSecret('');
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                        title={
                          k.source === 'admin_vault'
                            ? 'Update key, label, or Project ID'
                            : 'Assign Google Cloud Project ID'
                        }
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {k.source === 'admin_vault' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDeleteKey(k)}
                          className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-400 cursor-pointer"
                          title="Delete key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div
                      className={`pt-2 border-t border-slate-800 grid grid-cols-1 ${
                        k.source === 'admin_vault' ? 'sm:grid-cols-4' : 'sm:grid-cols-2'
                      } gap-2`}
                    >
                      {k.source === 'admin_vault' && (
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          placeholder="Key label"
                          className="bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs"
                        />
                      )}
                      <input
                        type="text"
                        value={editProjectId}
                        onChange={(e) => setEditProjectId(e.target.value)}
                        placeholder="Project ID (e.g. gcp-ai-1)"
                        className="bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-mono"
                      />
                      {k.source === 'admin_vault' && (
                        <input
                          type="password"
                          value={editSecret}
                          onChange={(e) => setEditSecret(e.target.value)}
                          placeholder="New key (optional)"
                          autoComplete="new-password"
                          className="bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs"
                        />
                      )}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleSaveKeyEdit(k)}
                        className="py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
                      >
                        Save Changes
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* SECTION 2: VERIFIED GOOGLE GEMINI MODELS MANAGER */}
      <div className="p-4 bg-[#070c17] border border-blue-500/40 rounded-2xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs font-black text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-4 h-4" />
            <span>Verified Google Gemini Models</span>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              disabled={checkingLiveCatalog}
              onClick={() => void handleVerifyLiveCatalog()}
              className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/35 border border-blue-500/40 text-blue-300 text-[10px] font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1"
            >
              {checkingLiveCatalog ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              <span>Verify Live Models API</span>
            </button>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(aiState?.modelConfig.enableModelFallback)}
                onChange={(e) => void handleToggleFallbackFlag('enableModelFallback', e.target.checked)}
                className="accent-blue-500"
              />
              <span>Auto-Fallback Between Enabled Models</span>
            </label>
          </div>
        </div>

        {liveCatalogSummary && (
          <div
            className={`p-2.5 rounded-xl text-[11px] leading-snug ${
              liveCatalogSummary.ok
                ? 'bg-emerald-950/60 border border-emerald-500/35 text-emerald-200'
                : 'bg-rose-950/60 border border-rose-500/35 text-rose-200'
            }`}
          >
            {liveCatalogSummary.ok ? (
              <span>
                Live Google v1beta/models returned <strong>{liveCatalogSummary.totalCount}</strong> models. Matched{' '}
                <strong>{liveCatalogSummary.matchedIds.length}/{(aiState?.models || []).length}</strong> configured catalog IDs
                {liveCatalogSummary.missingIds.length > 0
                  ? ` (Missing: ${liveCatalogSummary.missingIds.join(', ')})`
                  : ' (100% catalog match).'}
              </span>
            ) : (
              <span>{liveCatalogSummary.error}</span>
            )}
          </div>
        )}

        {modelTestOutput && (
          <div
            className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
              modelTestOutput.ok
                ? 'bg-emerald-950/75 border border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/75 border border-rose-500/40 text-rose-200'
            }`}
          >
            {modelTestOutput.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            )}
            <div className="min-w-0">
              <div className="font-mono font-bold text-[10px]">{modelTestOutput.modelId}</div>
              <div className="leading-snug">{modelTestOutput.detail}</div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {(aiState?.models || []).map((m) => {
            const isTesting = testingModelId === m.id;
            return (
              <div
                key={m.id}
                className="p-3 bg-[#040711] border border-slate-800 rounded-xl flex items-center justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                    {m.capability === 'image' ? (
                      <ImageIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    ) : m.capability === 'omni' ? (
                      <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    ) : (
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    )}
                    <span>{m.displayName}</span>
                    {m.capability === 'omni' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold uppercase">
                        OMNI
                      </span>
                    )}
                    {m.isPrimary && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 font-bold">
                        PRIMARY
                      </span>
                    )}
                    {m.paidKeyRequired && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono">
                        Paid Key Tier
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-blue-300 mt-0.5">{m.id}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{m.description}</div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={isTesting}
                    onClick={() => void handleTestModel(m.id)}
                    className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/35 border border-blue-500/40 text-blue-300 text-[10px] font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1"
                  >
                    {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    <span>Test</span>
                  </button>

                  {!m.isPrimary && m.enabled && m.capability !== 'omni' && (
                    <button
                      type="button"
                      onClick={() => void handleSetPrimaryModel(m.capability as 'image' | 'text', m.id)}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold cursor-pointer"
                    >
                      Set Primary
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleToggleModel(m.id, !m.enabled)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                      m.enabled
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    {m.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: GEMINI TEXT GENERATION SANDBOX */}
      <div className="p-4 bg-[#070b14] border border-slate-800 rounded-2xl space-y-2.5">
        <div className="text-xs font-black text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4" />
          <span>Gemini Text Generation Test ({aiState?.modelConfig.primaryTextModel || 'gemini-3.1-flash-lite'})</span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={textPrompt}
            onChange={(e) => setTextPrompt(e.target.value)}
            placeholder="Enter test prompt for Gemini Pro..."
            className="flex-1 bg-[#03060d] border border-slate-800 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            disabled={runningTextGen || !textPrompt.trim()}
            onClick={() => void handleRunTextGenTest()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5 shrink-0"
          >
            {runningTextGen ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Generate</span>
          </button>
        </div>
        {textGenResult && (
          <div className="p-3 rounded-xl bg-[#03060d] border border-indigo-500/30 text-xs text-slate-200 space-y-1">
            <div className="text-[10px] font-mono text-indigo-300">Model: {textGenResult.model}</div>
            <div>{textGenResult.text}</div>
          </div>
        )}
      </div>

      {/* SECTION 4: ISOLATED fal.ai KEY VAULT & TECHNICAL FAILOVER */}
      <div className="p-4 bg-[#070b14] border border-amber-500/35 rounded-2xl space-y-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-amber-400" />
            <span>fal.ai Media Key Vault &amp; Operational Health ({aiState?.falKeys?.length || 0} Configured)</span>
          </div>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-500/35 font-bold uppercase">
            Isolated Provider Namespace • Photo &amp; Video Only
          </span>
        </div>

        <p className="text-[11px] text-slate-300 leading-relaxed">
          fal.ai credentials are stored in a separate AES-256-GCM vault namespace and never mixed with Google Gemini keys. Rate limits (HTTP 429), concurrency caps, queue saturation, timeouts, and 5xx transient errors trigger safe backoff retries, temporary cooldowns (without marking keys invalid), and automatic failover across healthy keys or compatible models.
        </p>

        {/* fal.ai Routing & Operational Policy */}
        {aiState?.falConfig && (
          <div className="p-3 rounded-xl bg-[#03060d] border border-slate-800 space-y-2.5">
            <div className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <span>fal.ai Technical Quota, Concurrency &amp; Failover Policy</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={busyFalConfig}
                  checked={Boolean(aiState.falConfig.enableFalKeyFallback)}
                  onChange={(e) => void handleUpdateFalConfigPatch({ enableFalKeyFallback: e.target.checked })}
                  className="accent-amber-500"
                />
                <span>Auto-Fallback Across fal.ai Keys</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={busyFalConfig}
                  checked={Boolean(aiState.falConfig.enableFalImageFallback)}
                  onChange={(e) => void handleUpdateFalConfigPatch({ enableFalImageFallback: e.target.checked })}
                  className="accent-amber-500"
                />
                <span>Image Failover (Gemini → fal.ai)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={busyFalConfig}
                  checked={Boolean(aiState.falConfig.enableFalVideoFallback)}
                  onChange={(e) => void handleUpdateFalConfigPatch({ enableFalVideoFallback: e.target.checked })}
                  className="accent-amber-500"
                />
                <span>Video Failover (Gemini → fal.ai)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={busyFalConfig}
                  checked={Boolean(aiState.falConfig.preferFalForVideo)}
                  onChange={(e) => void handleUpdateFalConfigPatch({ preferFalForVideo: e.target.checked })}
                  className="accent-amber-500"
                />
                <span>Prefer fal.ai Primary for Video</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1.5 border-t border-slate-800/80">
              <label className="space-y-1 text-[10px] text-slate-400">
                <span className="font-semibold text-slate-300">Max Concurrent / Key (1-10)</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  disabled={busyFalConfig}
                  value={aiState.falConfig.maxConcurrentPerKey ?? 2}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val >= 1 && val <= 10) {
                      void handleUpdateFalConfigPatch({ maxConcurrentPerKey: Math.round(val) });
                    }
                  }}
                  className="w-full bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-mono"
                />
              </label>
              <label className="space-y-1 text-[10px] text-slate-400">
                <span className="font-semibold text-slate-300">Request Timeout (10-180s)</span>
                <input
                  type="number"
                  min={10}
                  max={180}
                  disabled={busyFalConfig}
                  value={aiState.falConfig.requestTimeoutSec ?? 45}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val >= 10 && val <= 180) {
                      void handleUpdateFalConfigPatch({ requestTimeoutSec: Math.round(val) });
                    }
                  }}
                  className="w-full bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-mono"
                />
              </label>
              <label className="space-y-1 text-[10px] text-slate-400">
                <span className="font-semibold text-slate-300">Max Queue Wait (15-240s)</span>
                <input
                  type="number"
                  min={15}
                  max={240}
                  disabled={busyFalConfig}
                  value={aiState.falConfig.maxQueueWaitSec ?? 45}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val >= 15 && val <= 240) {
                      void handleUpdateFalConfigPatch({ maxQueueWaitSec: Math.round(val) });
                    }
                  }}
                  className="w-full bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-mono"
                />
              </label>
            </div>

            {(aiState.falModels || []).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5 border-t border-slate-800/80">
                <label className="space-y-1 text-[10px] text-slate-400">
                  <span className="font-semibold text-slate-300">Primary fal.ai Image Model</span>
                  <select
                    disabled={busyFalConfig}
                    value={aiState.falConfig.primaryFalImageModel}
                    onChange={(e) => void handleUpdateFalConfigPatch({ primaryFalImageModel: e.target.value })}
                    className="w-full bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs"
                  >
                    {aiState.falModels!
                      .filter((m) => m.capability === 'image')
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="space-y-1 text-[10px] text-slate-400">
                  <span className="font-semibold text-slate-300">Primary fal.ai Photo Edit Model</span>
                  <select
                    disabled={busyFalConfig}
                    value={aiState.falConfig.primaryFalImageEditModel}
                    onChange={(e) => void handleUpdateFalConfigPatch({ primaryFalImageEditModel: e.target.value })}
                    className="w-full bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs"
                  >
                    {aiState.falModels!
                      .filter((m) => m.capability === 'image_edit')
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}{m.maxInputImageMb ? ` (max ${m.maxInputImageMb}MB)` : ''}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="space-y-1 text-[10px] text-slate-400">
                  <span className="font-semibold text-slate-300">Primary fal.ai Text-to-Video Model</span>
                  <select
                    disabled={busyFalConfig}
                    value={aiState.falConfig.primaryFalVideoModel}
                    onChange={(e) => void handleUpdateFalConfigPatch({ primaryFalVideoModel: e.target.value })}
                    className="w-full bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs"
                  >
                    {aiState.falModels!
                      .filter((m) => m.capability === 'video')
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}{m.supportedDurations ? ` (${m.supportedDurations.join('/')})` : ''}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="space-y-1 text-[10px] text-slate-400">
                  <span className="font-semibold text-slate-300">Primary fal.ai Image-to-Video Model</span>
                  <select
                    disabled={busyFalConfig}
                    value={aiState.falConfig.primaryFalImageToVideoModel}
                    onChange={(e) => void handleUpdateFalConfigPatch({ primaryFalImageToVideoModel: e.target.value })}
                    className="w-full bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs"
                  >
                    {aiState.falModels!
                      .filter((m) => m.capability === 'image_to_video')
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}{m.supportedDurations ? ` (${m.supportedDurations.join('/')})` : ''}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Add fal.ai Key Form */}
        <form onSubmit={handleAddFalKey} className="p-3 rounded-xl bg-[#03060d] border border-slate-800 space-y-2">
          <div className="text-[11px] font-bold text-slate-200">Add fal.ai API Key (Encrypted on Server)</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="text"
              value={newFalLabel}
              onChange={(e) => setNewFalLabel(e.target.value)}
              placeholder="Label (e.g. fal Primary Account)"
              className="sm:col-span-1 bg-[#080d1a] border border-slate-700 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-amber-500"
            />
            <input
              type="password"
              value={newFalSecret}
              onChange={(e) => setNewFalSecret(e.target.value)}
              placeholder="Paste fal_... or key_id:secret"
              autoComplete="new-password"
              className="sm:col-span-2 bg-[#080d1a] border border-slate-700 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-amber-500"
            />
            <input
              type="number"
              min={1}
              max={99}
              value={newFalPriority}
              onChange={(e) => setNewFalPriority(e.target.value)}
              placeholder="Priority (1)"
              title="Failover priority (1 runs first)"
              className="sm:col-span-1 bg-[#080d1a] border border-slate-700 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-amber-500"
            />
          </div>
          <button
            type="submit"
            disabled={savingNewFalKey || !newFalSecret.trim()}
            className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer transition"
          >
            {savingNewFalKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            <span>Encrypt &amp; Save fal.ai Key</span>
          </button>
        </form>

        {falTestBanner && (
          <div
            className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
              falTestBanner.ok
                ? 'bg-emerald-950/75 border border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/75 border border-rose-500/40 text-rose-200'
            }`}
          >
            {falTestBanner.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            )}
            <div className="min-w-0">
              <div className="font-bold text-[10px] uppercase">{falTestBanner.keyLabel}</div>
              <div className="leading-snug">{falTestBanner.detail}</div>
            </div>
          </div>
        )}

        {/* fal.ai Keys List */}
        <div className="space-y-2">
          {(aiState?.falKeys || []).length === 0 ? (
            <div className="text-xs text-slate-500 py-3 text-center">
              No fal.ai keys configured yet. Add a fal.ai key above to enable media operational health checks and failover.
            </div>
          ) : (
            aiState!.falKeys!.map((fk) => {
              const isBusy = busyFalKeyId === fk.id;
              const isEditing = editingFalKeyId === fk.id;
              const cooldownRemaining = formatCooldownTimer(fk.cooldownUntil, nowMs);
              const quotaScopeLabel = formatQuotaScopeLabel(fk.quotaScope);
              const activeInFlight = aiState?.falRuntimeMetrics?.activeInFlightByKey?.[fk.id] ?? 0;
              const pendingQueueJobs = aiState?.falRuntimeMetrics?.pendingQueueJobsByKey?.[fk.id] ?? 0;
              const maxConcurrent = aiState?.falConfig?.maxConcurrentPerKey ?? 2;
              const statusBadgeClass =
                fk.status === 'ready'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : fk.status === 'disabled'
                  ? 'bg-slate-800 text-slate-400 border-slate-700'
                  : fk.status === 'quota_exhausted'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40';

              return (
                <div
                  key={fk.id}
                  className="p-3 rounded-xl bg-[#03060d] border border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="text-xs font-bold text-white flex items-center gap-2 flex-wrap">
                        <span className="truncate">{fk.label}</span>
                        <span className="font-mono text-[10px] text-slate-400">{fk.maskedKey}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-800 uppercase">
                          {fk.source === 'admin_vault' ? 'Vault' : 'Env'} • P{fk.priority}
                        </span>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase ${statusBadgeClass}`}>
                          {fk.status.replace('_', ' ')}
                        </span>
                        {quotaScopeLabel && fk.status !== 'ready' && fk.status !== 'disabled' && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-950/70 text-amber-300 border border-amber-500/30 font-semibold">
                            {quotaScopeLabel}
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-400 flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-cyan-300">
                          In-flight: {activeInFlight}/{maxConcurrent}
                        </span>
                        <span className="font-mono text-slate-300">
                          Queue: {pendingQueueJobs}
                        </span>
                        <span>
                          Failures: {fk.failureCount} ({fk.consecutiveFailures} streak)
                        </span>
                        {cooldownRemaining && (
                          <span className="text-amber-300 font-mono">
                            Cooldown: {cooldownRemaining} remaining
                          </span>
                        )}
                        {fk.lastTestedAt && (
                          <span>Tested: {new Date(fk.lastTestedAt).toLocaleString()}</span>
                        )}
                      </div>

                      {fk.lastError && (
                        <div className="text-[10px] text-amber-300 break-words">{fk.lastError}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleTestFalKey(fk)}
                        className="px-2.5 py-1 rounded-lg bg-amber-600/20 hover:bg-amber-600/35 border border-amber-500/40 text-amber-300 text-[10px] font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1"
                        title="Run technical fal.ai key auth & rate-limit health check"
                      >
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        <span>Test</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleFalKeyEnabled(fk)}
                        className={`p-1.5 rounded-lg border text-[10px] cursor-pointer ${
                          fk.enabled
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                        title={fk.enabled ? 'Disable fal.ai key' : 'Enable fal.ai key'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>

                      {fk.status !== 'ready' && fk.enabled && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleResetFalKeyHealth(fk)}
                          className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 cursor-pointer"
                          title="Clear fal.ai cooldown / failure status"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setEditingFalKeyId(isEditing ? null : fk.id);
                          setEditFalLabel(fk.label);
                          setEditFalPriority(String(fk.priority || 1));
                          setEditFalSecret('');
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                        title="Edit fal.ai key settings"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {fk.source === 'admin_vault' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDeleteFalKey(fk)}
                          className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-400 cursor-pointer"
                          title="Delete fal.ai key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div
                      className={`pt-2 border-t border-slate-800 grid grid-cols-1 ${
                        fk.source === 'admin_vault' ? 'sm:grid-cols-4' : 'sm:grid-cols-2'
                      } gap-2`}
                    >
                      {fk.source === 'admin_vault' && (
                        <input
                          type="text"
                          value={editFalLabel}
                          onChange={(e) => setEditFalLabel(e.target.value)}
                          placeholder="Key label"
                          className="bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs"
                        />
                      )}
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={editFalPriority}
                        onChange={(e) => setEditFalPriority(e.target.value)}
                        placeholder="Priority (1)"
                        className="bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-mono"
                      />
                      {fk.source === 'admin_vault' && (
                        <input
                          type="password"
                          value={editFalSecret}
                          onChange={(e) => setEditFalSecret(e.target.value)}
                          placeholder="New fal.ai key (optional)"
                          autoComplete="new-password"
                          className="bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs"
                        />
                      )}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleSaveFalKeyEdit(fk)}
                        className="py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
                      >
                        Save Changes
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Model-Specific fal.ai Health Diagnostics (Tracked independently from key & rate-limit health) */}
        {(aiState?.falModelHealth || []).length > 0 && (
          <div className="p-3 rounded-xl bg-[#03060d] border border-slate-800 space-y-2">
            <div className="text-[11px] font-bold text-slate-200 flex items-center justify-between gap-2">
              <span>fal.ai Model-Specific Health ({aiState!.falModelHealth!.length})</span>
              <span className="text-[10px] font-normal text-slate-400">
                Tracked independently from key &amp; rate-limit health
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {aiState!.falModelHealth!.map((mh) => {
                const cooldownLeft = formatCooldownTimer(mh.cooldownUntil, nowMs);
                return (
                  <div
                    key={mh.modelId}
                    className="p-2.5 rounded-lg bg-[#070b14] border border-slate-800/90 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono font-bold text-amber-300 truncate">
                        {mh.modelId}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold uppercase ${
                          mh.status === 'ready'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        {mh.status} • {mh.failureCount} fails
                      </span>
                    </div>
                    {cooldownLeft && (
                      <div className="text-[10px] text-amber-300 font-mono">
                        Model cooldown: {cooldownLeft} remaining
                      </div>
                    )}
                    {mh.lastError && (
                      <div className="text-[10px] text-slate-400 truncate" title={mh.lastError}>
                        {mh.lastError}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
