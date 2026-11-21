import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Key,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Sparkles,
  CheckCircle2,
  Server,
  Cpu,
} from 'lucide-react';
import {
  KeyDiagnosticStatus,
  PostAiCapabilityResponse,
  testAdminAiKey,
} from '../services/postAiService';
import { useAuth } from '../context/AuthContext';
import { AUTHORIZED_ADMIN_EMAIL } from '../services/centralContentService';

interface GeminiManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  keyStatuses?: KeyDiagnosticStatus[];
  capability?: PostAiCapabilityResponse | null;
  onRefreshStatus?: () => void;
}

export default function GeminiManagerModal({
  isOpen,
  onClose,
  keyStatuses = [],
  capability,
  onRefreshStatus,
}: GeminiManagerModalProps) {
  const { user } = useAuth();
  const isSuperAdmin =
    user?.email === AUTHORIZED_ADMIN_EMAIL && user?.emailVerified !== false;

  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTestResult(null);
      onRefreshStatus?.();
    }
  }, [isOpen, onRefreshStatus]);

  if (!isOpen) return null;

  const handleTestKey = async (keyItem: KeyDiagnosticStatus) => {
    if (!keyItem.id || !isSuperAdmin) return;
    setTestingKeyId(keyItem.id);
    setTestResult(null);
    try {
      const res = await testAdminAiKey(keyItem.id);
      setTestResult({
        id: keyItem.id,
        success: Boolean(res.ok),
        message:
          res.message ||
          res.error ||
          (res.ok ? `${keyItem.label} passed live Gemini API check.` : `Test failed for ${keyItem.label}.`),
      });
      onRefreshStatus?.();
    } catch (err: any) {
      setTestResult({
        id: keyItem.id,
        success: false,
        message: err?.message || `Live test failed for ${keyItem.label}.`,
      });
    } finally {
      setTestingKeyId(null);
    }
  };

  const activeCount = capability?.activeKeyCount ?? keyStatuses.filter((k) => k.configured && k.enabled !== false).length;
  const healthyCount = capability?.healthyKeyCount ?? keyStatuses.filter((k) => k.status === 'Ready').length;
  const enabledModels = (capability?.verifiedModels || []).filter((m) => m.enabled);

  const modalContent = (
    <div
      className="fixed inset-0 z-[180] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Gemini Manager"
    >
      <div
        className="w-full max-w-lg bg-[#0c1424] border border-blue-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 text-white max-h-[90dvh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 border border-blue-400/50 flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.45)]">
              <Key className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                <span>Gemini Manager</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/35 font-mono font-bold">
                  Server Vault
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Secure Node.js Backend &amp; Verified Gemini Models
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition cursor-pointer"
            aria-label="Close Gemini Manager"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Secure Architecture Summary */}
        <div className="p-3.5 rounded-2xl bg-[#131b2e] border border-blue-500/30 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs leading-relaxed text-slate-300">
            <p className="font-bold text-white flex items-center gap-1.5">
              <span>
                {capability?.backendHost === 'vercel-serverless'
                  ? 'Vercel Serverless Backend'
                  : 'Node.js Express Backend'}{' '}
                • AES-256-GCM Server Vault
              </span>
            </p>
            <p>
              All Gemini API calls execute server-side. Eligible keys fail over cleanly on quota limits or invalid credentials without exposing secrets to the browser.
            </p>
          </div>
        </div>

        {/* Live Key Pool Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-blue-400" />
              Backend Key Pool ({healthyCount}/{activeCount} Healthy)
            </span>
          </div>

          {keyStatuses.length === 0 ? (
            <div className="p-4 rounded-2xl bg-[#070b14] border border-amber-500/30 text-xs text-amber-200 leading-relaxed">
              No active Gemini API keys are configured in the server vault yet. Sign in as Super Admin and open <strong>Admin Panel → AI Model Manager</strong> to add an encrypted API key.
            </div>
          ) : (
            <div className="space-y-2">
              {keyStatuses.map((slot) => {
                const isReady = slot.status === 'Ready';
                const isTesting = Boolean(slot.id && testingKeyId === slot.id);
                return (
                  <div
                    key={slot.id || slot.keyIndex}
                    className="p-3 rounded-2xl bg-[#070b14] border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                          isReady
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : slot.status === 'Disabled'
                            ? 'bg-slate-800 text-slate-500 border border-slate-700'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        K{slot.keyIndex}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {slot.label}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full ${
                              isReady
                                ? 'bg-emerald-400 animate-pulse'
                                : slot.status === 'Disabled'
                                ? 'bg-slate-500'
                                : 'bg-amber-400'
                            }`}
                          />
                          <span>{slot.status}</span>
                        </div>
                      </div>
                    </div>

                    {isSuperAdmin && slot.id && (
                      <button
                        type="button"
                        disabled={isTesting}
                        onClick={() => handleTestKey(slot)}
                        className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-bold disabled:opacity-40 transition cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        {isTesting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        <span>Test</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {testResult && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              testResult.success
                ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/80 border border-rose-500/40 text-rose-200'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span className="leading-snug">{testResult.message}</span>
          </div>
        )}

        {/* Active Verified Models */}
        {enabledModels.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-[#09101f] border border-slate-800 space-y-2">
            <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <span>Enabled Verified Models ({enabledModels.length})</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {enabledModels.map((m) => (
                <span
                  key={m.id}
                  className="px-2 py-1 rounded-lg bg-[#121c33] border border-blue-500/25 text-[10px] font-semibold text-blue-200"
                >
                  {m.displayName} ({m.id})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-slate-400">
            {isSuperAdmin
              ? 'Manage keys & models in Secret Admin Panel → AI Models'
              : 'Managed securely by KING Admin'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 cursor-pointer transition active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
