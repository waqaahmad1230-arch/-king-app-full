import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Eye,
  Film,
  ImagePlus,
  Loader2,
  RotateCcw,
  Scissors,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  Undo2,
  Wand2,
} from 'lucide-react';
import { FeedContentType } from '../types/content';
import {
  checkPostAiAvailability,
  PostAiCapabilityResponse,
  requestAiPhotoEdit,
} from '../services/postAiService';
import { normalizeSelectedMediaFile } from '../services/centralContentService';

interface AiPhotoSnapshot {
  id: string;
  file: File;
  url: string;
  promptLabel: string;
}

interface PostAiWorkspaceModalProps {
  isOpen: boolean;
  mediaType: FeedContentType;
  currentFile: File | null;
  currentMediaUrl: string;
  hasOriginalBackup: boolean;
  onClose: () => void;
  onApplyPhoto: (editedFile: File) => void;
  onRestoreOriginal: () => void;
  onJumpToVideoTool?: (tool: 'trim' | 'text' | 'emoji' | 'music' | 'effects') => void;
  onPickPhotoFile?: (file: File) => void;
}

interface PhotoQuickTool {
  id: string;
  label: string;
  sublabel: string;
  prompt: string;
  kind: 'enhance' | 'lighting' | 'bg_blue' | 'bg_remove' | 'object' | 'cinematic';
}

const PHOTO_QUICK_TOOLS: PhotoQuickTool[] = [
  {
    id: 'enhance',
    label: 'Enhance Quality',
    sublabel: 'Sharper & cleaner',
    prompt: 'Enhance photo quality, sharpen natural details, reduce noise, and make the image look crisp and professional.',
    kind: 'enhance',
  },
  {
    id: 'lighting',
    label: 'Lighting & Color',
    sublabel: 'Brighter & balanced',
    prompt: 'Improve lighting and clarity with natural exposure, clean highlights, and balanced colors.',
    kind: 'lighting',
  },
  {
    id: 'bg_blue',
    label: 'Luxury Blue BG',
    sublabel: 'Studio backdrop',
    prompt: 'Remove the background and add a luxury dark royal blue studio background with subtle lighting.',
    kind: 'bg_blue',
  },
  {
    id: 'bg_remove',
    label: 'Remove BG',
    sublabel: 'Clean cutout',
    prompt: 'Remove the background cleanly while keeping hair, edges, and the main subject sharp on a clean neutral background.',
    kind: 'bg_remove',
  },
  {
    id: 'object',
    label: 'Remove Object',
    sublabel: 'Clean background',
    prompt: 'Remove distracting objects in the background seamlessly while preserving the natural scene.',
    kind: 'object',
  },
  {
    id: 'cinematic',
    label: 'AI Cinematic',
    sublabel: 'Film look',
    prompt: 'Make this photo cinematic with rich dramatic lighting, depth, and professional film color grading.',
    kind: 'cinematic',
  },
];

const EXAMPLE_PROMPTS = [
  'Remove the background and add a luxury blue background.',
  'Make this photo cinematic.',
  'Improve lighting and clarity.',
  'Remove the object in the background.',
  'Make the image look professional.',
  'Change the background to a sunset.',
];

function QuickToolIcon({ kind }: { kind: PhotoQuickTool['kind'] }) {
  if (kind === 'enhance') return <Sparkles className="w-4 h-4 text-sky-400" />;
  if (kind === 'lighting') return <Sun className="w-4 h-4 text-amber-400" />;
  if (kind === 'bg_blue') return <ImagePlus className="w-4 h-4 text-blue-400" />;
  if (kind === 'bg_remove') return <Scissors className="w-4 h-4 text-cyan-400" />;
  if (kind === 'object') return <Trash2 className="w-4 h-4 text-rose-400" />;
  return <Wand2 className="w-4 h-4 text-indigo-400" />;
}

export function KingAiPetalIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="4.5" r="2.1" fill="#ec4899" />
      <circle cx="17.3" cy="6.7" r="2.1" fill="#a855f7" />
      <circle cx="19.5" cy="12" r="2.1" fill="#6366f1" />
      <circle cx="17.3" cy="17.3" r="2.1" fill="#38bdf8" />
      <circle cx="12" cy="19.5" r="2.1" fill="#22d3ee" />
      <circle cx="6.7" cy="17.3" r="2.1" fill="#818cf8" />
      <circle cx="4.5" cy="12" r="2.1" fill="#c084fc" />
      <circle cx="6.7" cy="6.7" r="2.1" fill="#f472b6" />
    </svg>
  );
}

export default function PostAiWorkspaceModal({
  isOpen,
  mediaType,
  currentFile,
  currentMediaUrl,
  hasOriginalBackup,
  onClose,
  onApplyPhoto,
  onRestoreOriginal,
  onJumpToVideoTool,
  onPickPhotoFile,
}: PostAiWorkspaceModalProps) {
  const [capability, setCapability] = useState<PostAiCapabilityResponse | null>(null);
  const [checkingCapability, setCheckingCapability] = useState<boolean>(false);

  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const [history, setHistory] = useState<AiPhotoSnapshot[]>([]);
  const [compareMode, setCompareMode] = useState<'after' | 'before'>('after');
  const [holdingOriginal, setHoldingOriginal] = useState<boolean>(false);

  const [pickedLocalFile, setPickedLocalFile] = useState<File | null>(null);
  const [pickedLocalUrl, setPickedLocalUrl] = useState<string>('');
  const createdUrlsRef = useRef<string[]>([]);
  const aiPhotoPickInputRef = useRef<HTMLInputElement | null>(null);

  const revokeCreatedUrls = () => {
    createdUrlsRef.current.forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch {}
    });
    createdUrlsRef.current = [];
  };

  useEffect(() => {
    if (!isOpen) {
      revokeCreatedUrls();
      setHistory([]);
      setPrompt('');
      setSelectedToolId(null);
      setIsProcessing(false);
      setProgressPct(0);
      setProgressLabel('');
      setErrorMsg(null);
      setAiNote(null);
      setCompareMode('after');
      setHoldingOriginal(false);
      setPickedLocalFile(null);
      setPickedLocalUrl('');
      return;
    }

    let cancelled = false;
    setCheckingCapability(true);
    setErrorMsg(null);
    checkPostAiAvailability()
      .then((cap) => {
        if (!cancelled) setCapability(cap);
      })
      .catch(() => {
        if (!cancelled) {
          setCapability({
            ok: false,
            configured: false,
            provider: 'google-gemini',
            photoSupported: false,
            photoModel: 'gemini-3.1-flash-lite-image',
            videoSupported: false,
            videoReason: 'Could not reach AI capability endpoint.',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingCapability(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      revokeCreatedUrls();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, onClose]);

  const baseSourceFile = currentFile || pickedLocalFile;
  const baseMediaUrl = currentMediaUrl || pickedLocalUrl;
  const latestSnapshot = history.length > 0 ? history[history.length - 1] : null;
  const activeSourceFile = latestSnapshot ? latestSnapshot.file : baseSourceFile;

  const displayedPhotoUrl = useMemo(() => {
    if (holdingOriginal || compareMode === 'before') {
      return baseMediaUrl;
    }
    return latestSnapshot ? latestSnapshot.url : baseMediaUrl;
  }, [holdingOriginal, compareMode, baseMediaUrl, latestSnapshot]);

  if (!isOpen) return null;

  const handleGenerateEdit = async () => {
    if (isProcessing || mediaType !== 'photo') return;
    if (!activeSourceFile) {
      setErrorMsg('No photo is currently loaded.');
      return;
    }
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setErrorMsg('Please describe what you want to change or tap a quick AI tool.');
      return;
    }

    const activeTool = PHOTO_QUICK_TOOLS.find((t) => t.id === selectedToolId);
    setIsProcessing(true);
    setErrorMsg(null);
    setAiNote(null);
    setProgressPct(10);
    setProgressLabel('Starting KING AI...');

    try {
      const result = await requestAiPhotoEdit({
        file: activeSourceFile,
        prompt: cleanPrompt,
        presetAction: activeTool?.label,
        onProgress: (pct, text) => {
          setProgressPct(pct);
          setProgressLabel(text);
        },
      });

      createdUrlsRef.current.push(result.previewUrl);
      setHistory((prev) => [
        ...prev,
        {
          id: `ai_${Date.now()}`,
          file: result.file,
          url: result.previewUrl,
          promptLabel: activeTool?.label || cleanPrompt.slice(0, 42),
        },
      ]);
      setCompareMode('after');
      if (result.note) setAiNote(result.note);
    } catch (err: any) {
      setErrorMsg(err?.message || 'AI editing failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUndoWorkspaceEdit = () => {
    if (history.length === 0 || isProcessing) return;
    setHistory((prev) => prev.slice(0, -1));
    setCompareMode('after');
    setErrorMsg(null);
  };

  const handleApplyResult = () => {
    if (!latestSnapshot || isProcessing) return;
    onApplyPhoto(latestSnapshot.file);
    onClose();
  };

  const handleRestore = () => {
    if (isProcessing) return;
    setHistory([]);
    onRestoreOriginal();
    onClose();
  };

  const isBackendConnected = Boolean(capability?.configured);

  const markup = (
    <div
      className="fixed inset-0 z-[168] bg-[#04060c] text-white flex flex-col h-[100dvh] w-full overflow-hidden select-none animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="KING AI Studio"
    >
      {/* SCROLLABLE BODY (FULL-BLEED TOP PREVIEW + MOBILE SAFE WORKSPACE) */}
      <div className="flex-1 overflow-y-auto pt-0 pb-3 space-y-3 w-full [&::-webkit-scrollbar]:hidden">
        {/* ENLARGED EDGE-TO-EDGE MEDIA PREVIEW STAGE */}
        <div className="relative w-full h-[46dvh] min-h-[320px] max-h-[540px] bg-black border-b border-blue-500/25 shadow-[0_8px_28px_rgba(37,99,235,0.16)] overflow-hidden flex items-center justify-center">
          {mediaType === 'photo' ? (
            displayedPhotoUrl ? (
              <img
                src={displayedPhotoUrl}
                alt="AI workspace photo preview"
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 px-6 text-center">
                <input
                  ref={aiPhotoPickInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    e.target.value = '';
                    if (!picked) return;
                    const check = normalizeSelectedMediaFile(picked, 'photo');
                    if (!check.valid || !check.file || check.mediaType !== 'photo') {
                      setErrorMsg(check.error || 'Please choose a photo image for KING AI Photo Studio.');
                      return;
                    }
                    const nextUrl = URL.createObjectURL(check.file);
                    createdUrlsRef.current.push(nextUrl);
                    setErrorMsg(null);
                    setPickedLocalFile(check.file);
                    setPickedLocalUrl(nextUrl);
                    onPickPhotoFile?.(check.file);
                  }}
                />
                <div className="w-12 h-12 rounded-2xl bg-[#0d1930] border border-blue-500/40 flex items-center justify-center shadow-[0_0_16px_rgba(37,99,235,0.35)]">
                  <KingAiPetalIcon className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-white">KING AI Photo Studio</p>
                  <p className="text-[11px] text-slate-400">
                    Choose a photo from your gallery or go back to capture with camera
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => aiPhotoPickInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold flex items-center gap-1.5 shadow-[0_0_16px_rgba(37,99,235,0.45)] cursor-pointer transition active:scale-95"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>Choose Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-xl bg-[#13192b] hover:bg-[#1b233d] border border-white/15 text-slate-200 text-xs font-semibold cursor-pointer transition"
                  >
                    Back to Camera
                  </button>
                </div>
              </div>
            )
          ) : currentMediaUrl ? (
            <video
              src={currentMediaUrl}
              controls
              playsInline
              muted
              className="w-full h-full object-contain bg-black"
            />
          ) : (
            <p className="text-xs text-slate-400">No video loaded</p>
          )}

          {/* Subtle Floating Overlay Controls (Zero Header Height Consumed) */}
          <div className="absolute top-[max(10px,env(safe-area-inset-top))] left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
            <div className="flex items-center gap-1.5 pointer-events-auto">
              <button
                type="button"
                disabled={isProcessing}
                onClick={onClose}
                aria-label="Back to Post Editor"
                title="Back"
                className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-white flex items-center justify-center cursor-pointer disabled:opacity-40 transition active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              {mediaType === 'photo' && latestSnapshot && (
                <div className="flex items-center gap-1 bg-black/75 backdrop-blur-md border border-white/15 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => setCompareMode('before')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition ${
                      compareMode === 'before' && !holdingOriginal
                        ? 'bg-white text-black'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareMode('after')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition ${
                      compareMode === 'after' && !holdingOriginal
                        ? 'bg-[#2563eb] text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    AI Edited ({history.length})
                  </button>
                </div>
              )}
            </div>

            {mediaType === 'photo' && latestSnapshot && (
              <button
                type="button"
                onPointerDown={() => setHoldingOriginal(true)}
                onPointerUp={() => setHoldingOriginal(false)}
                onPointerLeave={() => setHoldingOriginal(false)}
                onPointerCancel={() => setHoldingOriginal(false)}
                className="pointer-events-auto px-2.5 py-1.5 rounded-xl bg-black/75 hover:bg-black/90 border border-white/15 text-[10px] font-semibold text-white flex items-center gap-1 cursor-pointer"
              >
                <Eye className="w-3 h-3 text-blue-400" />
                <span>{holdingOriginal ? 'Original' : 'Hold Original'}</span>
              </button>
            )}
          </div>

          {/* Processing Overlay */}
          {isProcessing && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-5 text-center space-y-2.5">
              <div className="w-11 h-11 rounded-2xl bg-blue-600/25 border border-blue-400/50 flex items-center justify-center shadow-[0_0_24px_rgba(37,99,235,0.5)]">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              </div>
              <div className="text-xs font-bold text-white">{progressLabel || 'Editing with KING AI...'}</div>
              <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#2563eb] transition-all duration-300"
                  style={{ width: `${Math.max(8, progressPct)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* WORKSPACE CONTROLS CONTAINER */}
        <div className="px-3.5 sm:px-4 space-y-3">
        {/* PHOTO MODE WORKSPACE */}
        {mediaType === 'photo' ? (
          <>
            {/* Honest Backend Configuration Notice when GEMINI_API_KEY is not set */}
            {!checkingCapability && !isBackendConnected && (
              <div className="rounded-2xl bg-[#111522] border border-amber-500/40 p-3 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-[11px] leading-relaxed">
                  <div className="font-bold text-amber-300">
                    AI Backend Not Yet Connected
                  </div>
                  <p className="text-slate-300">
                    Server environment key <span className="font-mono text-white">GEMINI_API_KEY</span> is not configured yet, so live Gemini photo generation cannot run until the administrator connects it. No fake edits will be generated.
                  </p>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {errorMsg && (
              <div className="rounded-xl bg-rose-950/85 border border-rose-500/40 px-3 py-2 text-xs text-rose-200 flex items-center justify-between gap-2">
                <span className="leading-snug">{errorMsg}</span>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="text-rose-300 font-bold px-1.5 cursor-pointer shrink-0"
                >
                  ×
                </button>
              </div>
            )}

            {aiNote && (
              <div className="rounded-xl bg-blue-950/50 border border-blue-500/30 px-3 py-2 text-[11px] text-blue-200">
                {aiNote}
              </div>
            )}

            {/* Prompt Area */}
            <div className="rounded-2xl bg-[#0c101b] border border-white/10 p-3 space-y-2.5">
              <label
                htmlFor="king-ai-prompt-input"
                className="text-xs font-bold text-white flex items-center justify-between"
              >
                <span>Describe your AI edit</span>
                <span className="text-[10px] font-medium text-blue-400">
                  Photo AI ({capability?.photoModel || 'gemini-3.1-flash-lite-image'})
                </span>
              </label>

              <textarea
                id="king-ai-prompt-input"
                rows={2}
                maxLength={600}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what you want to change..."
                className="w-full rounded-xl bg-[#05070e] border border-white/12 focus:border-blue-500 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none resize-none"
              />

              {/* Prompt Examples */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setPrompt(ex);
                      setSelectedToolId(null);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-[#151b2c] hover:bg-[#1c253d] border border-white/10 text-[10px] text-slate-200 whitespace-nowrap cursor-pointer shrink-0 transition"
                  >
                    {ex}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={isProcessing || !prompt.trim()}
                onClick={handleGenerateEdit}
                className="w-full min-h-[42px] rounded-xl bg-gradient-to-r from-[#2563eb] via-[#1d4ed8] to-[#2563eb] hover:brightness-110 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.45)] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed transition active:scale-[0.99]"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Photo...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{isBackendConnected ? 'Generate AI Edit' : 'Generate AI Edit (Requires Server Key)'}</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick AI Tools Grid */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-300 px-0.5">
                Quick Photo AI Tools
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PHOTO_QUICK_TOOLS.map((tool) => {
                  const active = selectedToolId === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      disabled={isProcessing}
                      onClick={() => {
                        setSelectedToolId(tool.id);
                        setPrompt(tool.prompt);
                        setErrorMsg(null);
                      }}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 cursor-pointer transition disabled:opacity-50 ${
                        active
                          ? 'bg-[#122140] border-blue-500 shadow-[0_0_14px_rgba(37,99,235,0.3)]'
                          : 'bg-[#0c101b] hover:bg-[#13192b] border-white/[0.08]'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#161e33] flex items-center justify-center shrink-0">
                        <QuickToolIcon kind={tool.kind} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-white truncate">
                          {tool.label}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {tool.sublabel}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          /* VIDEO MODE — Honest Supported vs Unsupported Notice */
          <div className="space-y-3">
            <div className="rounded-2xl bg-[#111522] border border-amber-500/40 p-3.5 space-y-2">
              <div className="flex items-start gap-2.5">
                <Film className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-amber-300">
                    AI Video Prompt Editing Is Not Available Yet
                  </h3>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {capability?.videoReason ||
                      'The configured Gemini photo model edits still photos only. Automated AI video enhancement, video background removal, and prompt-based video transformation are not enabled on this server yet.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[#0c101b] border border-white/10 p-3.5 space-y-2.5">
              <div className="text-xs font-bold text-white">
                Real Video Tools Available Right Now
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                You can edit this video right now in the Post Editor using these working tools:
              </p>

              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onJumpToVideoTool?.('trim');
                    onClose();
                  }}
                  className="p-2.5 rounded-xl bg-[#13192b] hover:bg-[#1a243f] border border-blue-500/30 text-left flex items-center gap-2 cursor-pointer transition"
                >
                  <Scissors className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-[11px] font-bold text-white">Trim Video</div>
                    <div className="text-[9px] text-slate-400">Start &amp; end timeline</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onJumpToVideoTool?.('effects');
                    onClose();
                  }}
                  className="p-2.5 rounded-xl bg-[#13192b] hover:bg-[#1a243f] border border-blue-500/30 text-left flex items-center gap-2 cursor-pointer transition"
                >
                  <Sliders className="w-4 h-4 text-sky-400 shrink-0" />
                  <div>
                    <div className="text-[11px] font-bold text-white">Styles &amp; Moods</div>
                    <div className="text-[9px] text-slate-400">Cinema, Neon, Warm filters</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onJumpToVideoTool?.('text');
                    onClose();
                  }}
                  className="p-2.5 rounded-xl bg-[#13192b] hover:bg-[#1a243f] border border-white/10 text-left flex items-center gap-2 cursor-pointer transition"
                >
                  <Wand2 className="w-4 h-4 text-blue-400 shrink-0" />
                  <div>
                    <div className="text-[11px] font-bold text-white">Add Text</div>
                    <div className="text-[9px] text-slate-400">Custom styled titles</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onJumpToVideoTool?.('music');
                    onClose();
                  }}
                  className="p-2.5 rounded-xl bg-[#13192b] hover:bg-[#1a243f] border border-white/10 text-left flex items-center gap-2 cursor-pointer transition"
                >
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-[11px] font-bold text-white">Music &amp; Mute</div>
                    <div className="text-[9px] text-slate-400">KING royalty-free tracks</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* FIXED BOTTOM BAR — SAFE AREA COMPATIBLE */}
      <footer className="w-full px-3.5 sm:px-4 pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))] border-t border-white/[0.08] bg-[#070a12] shrink-0">
        {mediaType === 'photo' ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isProcessing || history.length === 0}
              onClick={handleUndoWorkspaceEdit}
              className="min-h-[40px] px-3 rounded-xl bg-[#131722] hover:bg-[#1a2030] border border-white/10 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-35 transition"
              title="Undo last AI edit"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>

            <button
              type="button"
              disabled={isProcessing || (!hasOriginalBackup && history.length === 0)}
              onClick={handleRestore}
              className="min-h-[40px] px-3 rounded-xl bg-[#131722] hover:bg-[#1a2030] border border-white/10 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-35 transition"
              title="Restore original photo"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore</span>
            </button>

            <button
              type="button"
              disabled={isProcessing || !latestSnapshot}
              onClick={handleApplyResult}
              className="flex-1 min-h-[40px] px-4 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_18px_rgba(37,99,235,0.45)] cursor-pointer disabled:opacity-40 transition"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Apply Edited Result</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[42px] rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-[0_0_18px_rgba(37,99,235,0.35)] cursor-pointer transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Video Post Editor</span>
          </button>
        )}
      </footer>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(markup, document.body);
  }
  return markup;
}
