import React, { useCallback, useEffect, useState } from 'react';
import {
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
  AdminAiManagerState,
  deleteAdminAiKey,
  fetchAdminAiState,
  fetchAdminLiveModels,
  requestAiTextGenerate,
  SafeAdminKeySummary,
  testAdminAiKey,
  testAdminAiModel,
  updateAdminAiKey,
  updateAdminAiModels,
} from '../services/postAiService';

interface AdminAiModelManagerSectionProps {
  showToast: (msg: string) => void;
}

export function AdminAiModelManagerSection({ showToast }: AdminAiModelManagerSectionProps) {
  const [aiState, setAiState] = useState<AdminAiManagerState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add Key Form State
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeySecret, setNewKeySecret] = useState('');
  const [savingNewKey, setSavingNewKey] = useState(false);

  // Inline Key Update State
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
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
        apiKey: newKeySecret.trim(),
      });
      setAiState(res.state);
      setNewKeyLabel('');
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

  const handleSaveKeyEdit = async (keyId: string) => {
    setBusyKeyId(keyId);
    try {
      const res = await updateAdminAiKey(keyId, {
        label: editLabel.trim() || undefined,
        apiKey: editSecret.trim() || undefined,
      });
      setAiState(res.state);
      setEditingKeyId(null);
      setEditLabel('');
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
                {aiState?.persistence?.storageScope === 'upstash_redis_encrypted' &&
                  aiState.persistence.encryptionKeyPersistent && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold uppercase">
                      Upstash Redis Persistent
                    </span>
                  )}
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                API keys added below are encrypted server-side with AES-256-GCM before storage and never exposed to browsers or public Firestore.
                {aiState?.persistence?.storageScope === 'upstash_redis_encrypted'
                  ? ' Vault records and model configurations persist across serverless cold starts in encrypted Upstash Redis.'
                  : ' Configure UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, and AI_VAULT_SECRET for persistent serverless vault storage.'}
              </p>
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

        {aiState?.persistence?.warning && (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              placeholder="Label (e.g. Primary Paid Project)"
              className="bg-[#080d1a] border border-slate-700 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-blue-500"
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
                        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase ${statusBadgeClass}`}>
                          {k.status.replace('_', ' ')}
                        </span>
                      </div>
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

                      {k.source === 'admin_vault' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingKeyId(isEditing ? null : k.id);
                              setEditLabel(k.label);
                              setEditSecret('');
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                            title="Update key or label"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDeleteKey(k)}
                            className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-400 cursor-pointer"
                            title="Delete key"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing && k.source === 'admin_vault' && (
                    <div className="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        placeholder="Key label"
                        className="bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs"
                      />
                      <input
                        type="password"
                        value={editSecret}
                        onChange={(e) => setEditSecret(e.target.value)}
                        placeholder="New key (optional)"
                        autoComplete="new-password"
                        className="bg-[#080d1a] border border-slate-700 text-white px-2.5 py-1.5 rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleSaveKeyEdit(k.id)}
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
    </div>
  );
}
