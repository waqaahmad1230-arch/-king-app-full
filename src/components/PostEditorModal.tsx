import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  Bold,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crop,
  Eye,
  FlipHorizontal2,
  FlipVertical2,
  Globe,
  Image as ImageIcon,
  Italic,
  Link2,
  Loader2,
  Lock,
  MapPin,
  Music,
  Palette,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  RotateCw,
  Scissors,
  Share,
  Sliders,
  Smile,
  Sparkles,
  Trash2,
  Undo2,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  normalizeSelectedMediaFile,
  publishGalleryMediaPost,
} from '../services/centralContentService';
import { createStatusPost } from '../services/statusService';
import { FeedContentType } from '../types/content';
import {
  StatusAudioTrack,
  StatusEditorTextFont,
  StatusMediaOverlay,
  StatusOverlayTextEffect,
  StatusPrivacyMode,
} from '../types/social';
import { uploadFileToCloudinary } from '../utils/cloudinaryUpload';
import { KING_ROYALTY_FREE_TRACKS, StatusRoyaltyFreePlayer } from '../utils/statusAudioEngine';
import {
  BrushStroke,
  clampOverlayPosition,
  clampOverlayScale,
  drawPhotoCanvasFrame,
  duplicateOverlayItem,
  EditorAspectPreset,
  exportEditedPhotoToFile,
  getOverlayTextDisplayStyle,
  normalizeOverlayRotation,
  PhotoEditState,
  resolveCanvasDimensions,
} from '../utils/statusCanvasExport';
import {
  compressStatusImage,
  MAX_STATUS_IMAGE_BYTES,
  MAX_STATUS_VIDEO_SECONDS,
  normalizeStatusWhatsAppCta,
  readMediaDurationSeconds,
  uploadStatusMediaToCloudinary,
} from '../utils/statusMediaUtils';
import PostAiWorkspaceModal, { KingAiPetalIcon } from './PostAiWorkspaceModal';

interface PostEditorModalProps {
  isOpen: boolean;
  initialFile: File | null;
  selectionKey?: number;
  creationType?: 'post' | 'story';
  onClose: () => void;
  onRetake: () => void;
  onPublished: (info: { id: string; contentType: FeedContentType; mediaUrl: string }) => void;
}

type EffectCategoryTab = 'Featured' | 'Styles' | 'Moods' | 'Lighting';
type ActiveDrawer =
  | 'none'
  | 'filters'
  | 'emoji'
  | 'music'
  | 'trim'
  | 'cover'
  | 'crop'
  | 'draw'
  | 'bg'
  | 'adjust';

interface EffectPresetCard {
  id: string;
  label: string;
  css: string;
  thumbKind:
    | 'anime'
    | 'lowpoly'
    | '3d'
    | 'vivid'
    | 'bw'
    | 'retro'
    | 'warm'
    | 'cool'
    | 'cinema'
    | 'studio'
    | 'neon'
    | 'sunset';
}

const EFFECT_TABS: readonly EffectCategoryTab[] = ['Featured', 'Styles', 'Moods', 'Lighting'];

const EFFECT_PRESETS_BY_TAB: Record<EffectCategoryTab, EffectPresetCard[]> = {
  Featured: [
    {
      id: 'anime',
      label: 'Anime',
      css: 'saturate(1.42) contrast(1.08) brightness(1.04)',
      thumbKind: 'anime',
    },
    {
      id: 'lowpoly',
      label: 'Low-poly',
      css: 'contrast(1.26) saturate(1.18) hue-rotate(-10deg)',
      thumbKind: 'lowpoly',
    },
    {
      id: '3d',
      label: '3D',
      css: 'contrast(1.14) brightness(1.05) saturate(1.06)',
      thumbKind: '3d',
    },
  ],
  Styles: [
    {
      id: 'vivid',
      label: 'Vivid',
      css: 'saturate(1.5) contrast(1.1)',
      thumbKind: 'vivid',
    },
    {
      id: 'bw',
      label: 'Noir B&W',
      css: 'grayscale(1) contrast(1.2)',
      thumbKind: 'bw',
    },
    {
      id: 'retro',
      label: 'Retro',
      css: 'sepia(0.35) contrast(1.08) saturate(1.15)',
      thumbKind: 'retro',
    },
  ],
  Moods: [
    {
      id: 'warm',
      label: 'Warm Glow',
      css: 'sepia(0.24) saturate(1.3) brightness(1.04)',
      thumbKind: 'warm',
    },
    {
      id: 'cool',
      label: 'Arctic Cool',
      css: 'hue-rotate(15deg) saturate(1.15) brightness(1.02)',
      thumbKind: 'cool',
    },
    {
      id: 'cinema',
      label: 'Cinema',
      css: 'contrast(1.22) saturate(0.88) brightness(0.95)',
      thumbKind: 'cinema',
    },
  ],
  Lighting: [
    {
      id: 'studio',
      label: 'Studio',
      css: 'brightness(1.12) contrast(1.08)',
      thumbKind: 'studio',
    },
    {
      id: 'neon',
      label: 'Neon Pop',
      css: 'saturate(1.6) contrast(1.2)',
      thumbKind: 'neon',
    },
    {
      id: 'sunset',
      label: 'Golden',
      css: 'sepia(0.3) brightness(1.06) saturate(1.35)',
      thumbKind: 'sunset',
    },
  ],
};

const EDITOR_FONTS: Array<{ id: StatusEditorTextFont; label: string }> = [
  { id: 'display', label: 'Impact' },
  { id: 'sans', label: 'Modern' },
  { id: 'serif', label: 'Editorial' },
  { id: 'mono', label: 'Mono' },
  { id: 'handwritten', label: 'Script' },
];

const COLOR_SWATCHES = [
  '#ffffff',
  '#000000',
  '#facc15',
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#fb7185',
  '#a855f7',
  '#f97316',
  '#06b6d4',
];

const BG_SWATCHES = [
  { label: 'Black', color: '#000000' },
  { label: 'Charcoal', color: '#121316' },
  { label: 'Ocean', color: '#061826' },
  { label: 'Crimson', color: '#4c0519' },
  { label: 'White', color: '#f8fafc' },
];

const EMOJI_PALETTE = [
  '👑', '🔥', '🍔', '❤️', '😂', '😍', '⚡', '🎉',
  '💯', '🙌', '✨', '🛍️', '💬', '🎬', '🏆', '🥳',
];

const ASPECT_PRESETS: Array<{ id: EditorAspectPreset; label: string }> = [
  { id: 'original', label: 'Original' },
  { id: '1:1', label: '1:1' },
  { id: '4:5', label: '4:5' },
  { id: '9:16', label: '9:16' },
  { id: '16:9', label: '16:9' },
];

const BRUSH_WIDTHS = [4, 8, 14, 22];

const INITIAL_PHOTO_STATE: PhotoEditState = {
  aspect: 'original',
  rotation: 0,
  flipX: false,
  flipY: false,
  zoom: 1,
  panX: 0,
  panY: 0,
  bgColor: '#000000',
  filterCss: 'none',
  brightness: 1,
  contrast: 1,
  saturation: 1,
  exposure: 1,
  blur: 0,
  strokes: [],
  overlays: [],
};

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatSec(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function EffectThumbnailArtwork({ kind }: { kind: EffectPresetCard['thumbKind'] }) {
  if (kind === 'anime') {
    return (
      <div className="w-full h-full bg-gradient-to-br from-[#fdf2f8] via-[#ffffff] to-[#ecfdf5] relative flex items-center justify-center overflow-hidden">
        <div className="w-11 h-11 rounded-full bg-gradient-to-b from-[#fbcfe8] via-[#fff5f7] to-[#a7f3d0] shadow-[inset_0_-3px_6px_rgba(0,0,0,0.06)] flex flex-col items-center justify-center relative border border-white">
          <div className="flex items-center gap-2.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1e293b] block" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#1e293b] block" />
          </div>
          <span className="w-2 h-1 border-b-[1.5px] border-[#334155] rounded-b-full mt-1 block" />
          <span className="absolute left-1.5 top-[22px] w-1.5 h-1 rounded-full bg-[#f472b6]/60" />
          <span className="absolute right-1.5 top-[22px] w-1.5 h-1 rounded-full bg-[#f472b6]/60" />
        </div>
        <span className="absolute top-1.5 left-1.5 text-[7px] text-[#f472b6]">♥</span>
        <span className="absolute bottom-1.5 right-1.5 text-[7px] text-[#34d399]">✦</span>
      </div>
    );
  }

  if (kind === 'lowpoly') {
    return (
      <div className="w-full h-full bg-gradient-to-b from-[#7e22ce] via-[#6b21a8] to-[#581c87] flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 64 64" className="w-12 h-12 drop-shadow-[0_4px_6px_rgba(0,0,0,0.45)]" aria-hidden="true">
          <polygon points="32,7 48,14 32,25" fill="#c084fc" />
          <polygon points="32,7 32,25 16,14" fill="#a855f7" />
          <polygon points="16,14 32,25 21,38 9,28" fill="#9333ea" />
          <polygon points="48,14 55,28 43,38 32,25" fill="#7e22ce" />
          <polygon points="32,25 43,38 21,38" fill="#a855f7" />
          <polygon points="9,28 21,38 15,49" fill="#6b21a8" />
          <polygon points="55,28 49,49 43,38" fill="#581c87" />
          <polygon points="21,38 43,38 32,57" fill="#7e22ce" />
          <polygon points="15,49 21,38 32,57" fill="#4c1d95" />
          <polygon points="49,49 32,57 43,38" fill="#3b0764" />
        </svg>
      </div>
    );
  }

  if (kind === '3d') {
    return (
      <div className="w-full h-full bg-gradient-to-br from-[#ebe2d6] to-[#ded3c3] flex items-center justify-center overflow-hidden relative">
        <div
          className="w-11 h-11 rounded-full shadow-[5px_7px_12px_rgba(70,56,40,0.3)]"
          style={{
            background:
              'radial-gradient(circle at 35% 30%, #fffdf8 0%, #ede6da 46%, #c7bcab 84%, #a89d8b 100%)',
          }}
        />
      </div>
    );
  }

  const swatches: Record<string, string> = {
    vivid: 'from-rose-500 via-amber-400 to-cyan-400',
    bw: 'from-zinc-200 via-zinc-500 to-zinc-900',
    retro: 'from-amber-200 via-orange-400 to-amber-900',
    warm: 'from-amber-300 via-orange-500 to-rose-600',
    cool: 'from-sky-300 via-blue-500 to-indigo-800',
    cinema: 'from-slate-600 via-indigo-900 to-black',
    studio: 'from-white via-slate-200 to-slate-500',
    neon: 'from-fuchsia-500 via-purple-600 to-cyan-400',
    sunset: 'from-yellow-300 via-rose-500 to-purple-800',
  };

  return (
    <div
      className={`w-full h-full bg-gradient-to-br ${swatches[kind] || 'from-slate-500 to-slate-800'} flex items-center justify-center`}
    >
      <div className="w-9 h-9 rounded-full bg-white/25 backdrop-blur-sm border border-white/40 shadow-inner" />
    </div>
  );
}

export default function PostEditorModal({
  isOpen,
  initialFile,
  selectionKey = 0,
  creationType = 'post',
  onClose,
  onRetake,
  onPublished,
}: PostEditorModalProps) {
  const { user, openAuthModal } = useAuth();

  const [editorStep, setEditorStep] = useState<'edit' | 'details'>('edit');
  const [postPrivacy, setPostPrivacy] = useState<'public' | 'friends' | 'private'>('public');
  const [postLocation, setPostLocation] = useState<string>('');
  const [shareToFeed, setShareToFeed] = useState<boolean>(true);
  const [shareToStory, setShareToStory] = useState<boolean>(creationType === 'story');
  const [editedPreviewDataUrl, setEditedPreviewDataUrl] = useState<string | null>(null);

  const [mediaType, setMediaType] = useState<FeedContentType>('photo');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);

  const [activeTab, setActiveTab] = useState<EffectCategoryTab>('Featured');
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [selectedEffectCss, setSelectedEffectCss] = useState<string>('none');
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>('none');
  const [previewOnly, setPreviewOnly] = useState<boolean>(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);
  const [showAiWorkspace, setShowAiWorkspace] = useState<boolean>(false);
  const [hasAiApplied, setHasAiApplied] = useState<boolean>(false);

  // WhatsApp & Link Add / Caption
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean>(false);
  const [whatsappInput, setWhatsappInput] = useState<string>('');
  const [linkInput, setLinkInput] = useState<string>('');
  const [caption, setCaption] = useState<string>('');

  // Background Music (Real synthesized KING audio preview)
  const [selectedMusicId, setSelectedMusicId] = useState<string | null>(null);
  const audioPlayerRef = useRef<StatusRoyaltyFreePlayer | null>(null);

  // Photo Edit State + History
  const [photoHistory, setPhotoHistory] = useState<PhotoEditState[]>([INITIAL_PHOTO_STATE]);
  const [photoHistoryIdx, setPhotoHistoryIdx] = useState<number>(0);
  const currentPhotoState = photoHistory[photoHistoryIdx] || INITIAL_PHOTO_STATE;
  const [livePhotoPatch, setLivePhotoPatch] = useState<Partial<PhotoEditState> | null>(null);
  const livePhotoPatchRef = useRef<Partial<PhotoEditState> | null>(null);
  const effectivePhotoState = useMemo<PhotoEditState>(
    () => (livePhotoPatch ? { ...currentPhotoState, ...livePhotoPatch } : currentPhotoState),
    [currentPhotoState, livePhotoPatch]
  );

  // Drawing & Overlays
  const [brushColor, setBrushColor] = useState<string>('#38bdf8');
  const [brushWidth, setBrushWidth] = useState<number>(8);
  const [activeStroke, setActiveStroke] = useState<BrushStroke | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [liveDragPos, setLiveDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [showOptionalMeta, setShowOptionalMeta] = useState<boolean>(false);

  // Text Composer
  const [showTextComposer, setShowTextComposer] = useState<boolean>(false);
  const [editingTextOverlayId, setEditingTextOverlayId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState<string>('');
  const [textDraftFont, setTextDraftFont] = useState<StatusEditorTextFont>('display');
  const [textDraftColor, setTextDraftColor] = useState<string>('#facc15');
  const [textDraftAlign, setTextDraftAlign] = useState<'left' | 'center' | 'right'>('center');
  const [textDraftBgMode, setTextDraftBgMode] = useState<'none' | 'dark' | 'accent'>('none');
  const [textDraftScale, setTextDraftScale] = useState<number>(1);
  const [textDraftRotation, setTextDraftRotation] = useState<number>(0);
  const [textDraftBold, setTextDraftBold] = useState<boolean>(true);
  const [textDraftItalic, setTextDraftItalic] = useState<boolean>(false);
  const [textDraftEffect, setTextDraftEffect] = useState<StatusOverlayTextEffect>('outline');

  // Video Edit & Trim State
  const [rawVideoDuration, setRawVideoDuration] = useState<number>(15);
  const [trimStartSec, setTrimStartSec] = useState<number>(0);
  const [trimEndSec, setTrimEndSec] = useState<number>(15);
  const [videoCurrentSec, setVideoCurrentSec] = useState<number>(0);
  const [videoPlaying, setVideoPlaying] = useState<boolean>(true);
  const [videoMuted, setVideoMuted] = useState<boolean>(false);
  const [videoOverlayHistory, setVideoOverlayHistory] = useState<StatusMediaOverlay[][]>([[]]);
  const [videoOverlayIdx, setVideoOverlayIdx] = useState<number>(0);
  const currentVideoOverlays = videoOverlayHistory[videoOverlayIdx] || [];
  const [customVideoThumbnail, setCustomVideoThumbnail] = useState<string | null>(null);

  const captureVideoThumbnail = () => {
    const vid = videoPreviewRef.current;
    if (!vid) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = vid.videoWidth || 540;
      canvas.height = vid.videoHeight || 960;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCustomVideoThumbnail(dataUrl);
    } catch {
      // ignore
    }
  };

  // Publish state
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const publishingLockRef = useRef<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const photoStageRef = useRef<HTMLDivElement | null>(null);
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const timelineDragModeRef = useRef<'start' | 'end' | 'seek' | null>(null);
  const activeObjectUrlRef = useRef<string>('');
  const untouchedOriginalFileRef = useRef<File | null>(null);

  const dragOverlayRef = useRef<{
    pointerId: number;
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    lastX: number;
    lastY: number;
    stageW: number;
    stageH: number;
    moved: boolean;
  } | null>(null);

  const panStartRef = useRef<{
    x: number;
    y: number;
    origPanX: number;
    origPanY: number;
    stageW: number;
    stageH: number;
  } | null>(null);

  const stopBackgroundMusic = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.stop();
    }
  }, []);

  const replaceObjectUrl = useCallback((nextUrl: string) => {
    if (activeObjectUrlRef.current && activeObjectUrlRef.current !== nextUrl) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
    }
    activeObjectUrlRef.current = nextUrl;
    setObjectUrl(nextUrl);
  }, []);

  const loadMediaFile = useCallback(
    (file: File | null) => {
      setErrorMsg(null);
      setEditorStep('edit');
      setPostPrivacy('public');
      setPostLocation('');
      setShareToFeed(true);
      setShareToStory(creationType === 'story');
      setEditedPreviewDataUrl(null);
      setActiveTab('Featured');
      setSelectedEffectId(null);
      setSelectedEffectCss('none');
      setActiveDrawer('none');
      setPreviewOnly(false);
      setSelectedOverlayId(null);
      setShowTextComposer(false);
      setShowDiscardConfirm(false);
      setShowAiWorkspace(false);
      setHasAiApplied(false);
      setWhatsappEnabled(false);
      setWhatsappInput('');
      setLinkInput('');
      setCaption('');
      setSelectedMusicId(null);
      setCustomVideoThumbnail(null);
      stopBackgroundMusic();
      setShowOptionalMeta(false);
      livePhotoPatchRef.current = null;
      setLivePhotoPatch(null);
      setProgressPct(0);
      setProgressLabel('');
      setIsPublishing(false);
      publishingLockRef.current = false;

      if (!file) {
        untouchedOriginalFileRef.current = null;
        setSourceFile(null);
        setLoadedImg(null);
        replaceObjectUrl('');
        return;
      }

      const normalized = normalizeSelectedMediaFile(file);
      if (!normalized.valid || !normalized.file || !normalized.mediaType) {
        setErrorMsg(normalized.error || 'Unsupported file.');
        return;
      }

      const safeFile = normalized.file;
      untouchedOriginalFileRef.current = safeFile;
      const nextUrl = URL.createObjectURL(safeFile);
      replaceObjectUrl(nextUrl);
      setSourceFile(safeFile);
      setMediaType(normalized.mediaType);

      if (normalized.mediaType === 'video') {
        setLoadedImg(null);
        setVideoMuted(false);
        setVideoPlaying(true);
        setVideoOverlayHistory([[]]);
        setVideoOverlayIdx(0);
        setVideoCurrentSec(0);

        readMediaDurationSeconds(safeFile, 'video')
          .then((dur) => {
            const validDur = Math.max(1, dur || 15);
            setRawVideoDuration(validDur);
            setTrimStartSec(0);
            setTrimEndSec(validDur);
            setVideoCurrentSec(0);
          })
          .catch(() => {
            setRawVideoDuration(15);
            setTrimStartSec(0);
            setTrimEndSec(15);
          });
      } else {
        setLoadedImg(null);
        setPhotoHistory([INITIAL_PHOTO_STATE]);
        setPhotoHistoryIdx(0);
        setRawVideoDuration(15);
        setTrimStartSec(0);
        setTrimEndSec(15);
        setVideoCurrentSec(0);

        const img = new Image();
        img.onload = () => setLoadedImg(img);
        img.onerror = () => setErrorMsg('Could not decode selected image file.');
        img.src = nextUrl;
      }
    },
    [creationType, replaceObjectUrl, stopBackgroundMusic]
  );

  useEffect(() => {
    if (!isOpen) {
      loadMediaFile(null);
      return;
    }
    if (initialFile) {
      loadMediaFile(initialFile);
    }
  }, [isOpen, initialFile, selectionKey, loadMediaFile]);

  useEffect(() => {
    return () => {
      stopBackgroundMusic();
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = '';
      }
    };
  }, [stopBackgroundMusic]);

  const commitPhotoState = useCallback(
    (next: PhotoEditState) => {
      livePhotoPatchRef.current = null;
      setLivePhotoPatch(null);
      setPhotoHistory((prev) => {
        const sliced = prev.slice(0, photoHistoryIdx + 1);
        const updated = [...sliced, next].slice(-60);
        setPhotoHistoryIdx(updated.length - 1);
        return updated;
      });
    },
    [photoHistoryIdx]
  );

  const updateLivePhotoPatch = useCallback((patch: Partial<PhotoEditState>) => {
    const merged = { ...(livePhotoPatchRef.current || {}), ...patch };
    livePhotoPatchRef.current = merged;
    setLivePhotoPatch(merged);
  }, []);

  const flushLivePhotoPatch = useCallback(() => {
    const pending = livePhotoPatchRef.current;
    if (!pending) return;
    livePhotoPatchRef.current = null;
    setLivePhotoPatch(null);
    const hasChanged = (Object.keys(pending) as Array<keyof PhotoEditState>).some(
      (k) => pending[k] !== currentPhotoState[k]
    );
    if (hasChanged) {
      commitPhotoState({ ...currentPhotoState, ...pending });
    }
  }, [currentPhotoState, commitPhotoState]);

  const handlePhotoUndo = () => {
    livePhotoPatchRef.current = null;
    setLivePhotoPatch(null);
    setPhotoHistoryIdx((idx) => Math.max(0, idx - 1));
  };

  const handlePhotoRedo = () => {
    livePhotoPatchRef.current = null;
    setLivePhotoPatch(null);
    setPhotoHistoryIdx((idx) => Math.min(photoHistory.length - 1, idx + 1));
  };

  const commitVideoOverlays = useCallback(
    (next: StatusMediaOverlay[]) => {
      setVideoOverlayHistory((prev) => {
        const sliced = prev.slice(0, videoOverlayIdx + 1);
        const updated = [...sliced, next].slice(-60);
        setVideoOverlayIdx(updated.length - 1);
        return updated;
      });
    },
    [videoOverlayIdx]
  );

  const activeOverlays =
    mediaType === 'photo' ? effectivePhotoState.overlays : currentVideoOverlays;

  const setOverlaysWithHistory = useCallback(
    (nextOverlays: StatusMediaOverlay[]) => {
      if (mediaType === 'photo') {
        commitPhotoState({ ...currentPhotoState, overlays: nextOverlays });
      } else {
        commitVideoOverlays(nextOverlays);
      }
    },
    [mediaType, currentPhotoState, commitPhotoState, commitVideoOverlays]
  );

  const selectedOverlay = useMemo(
    () => activeOverlays.find((o) => o.id === selectedOverlayId) || null,
    [activeOverlays, selectedOverlayId]
  );

  const canvasDims = useMemo(() => {
    if (!loadedImg) return { width: 540, height: 675 };
    return resolveCanvasDimensions(
      effectivePhotoState.aspect,
      loadedImg.naturalWidth || loadedImg.width || 540,
      loadedImg.naturalHeight || loadedImg.height || 675,
      effectivePhotoState.rotation,
      540
    );
  }, [loadedImg, effectivePhotoState.aspect, effectivePhotoState.rotation]);

  useEffect(() => {
    if (mediaType !== 'photo' || !loadedImg || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = canvasDims.width;
    canvas.height = canvasDims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewState: PhotoEditState = {
      ...effectivePhotoState,
      strokes: activeStroke
        ? [...effectivePhotoState.strokes, activeStroke]
        : effectivePhotoState.strokes,
      overlays: [],
    };
    drawPhotoCanvasFrame(ctx, canvasDims.width, canvasDims.height, loadedImg, previewState, true);
  }, [mediaType, loadedImg, canvasDims, effectivePhotoState, activeStroke]);

  useEffect(() => {
    const vid = videoPreviewRef.current;
    if (!vid || mediaType !== 'video') return;
    vid.muted = videoMuted;
    if (videoPlaying) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  }, [mediaType, videoPlaying, videoMuted]);

  const hasUnsavedEdits = useMemo(() => {
    if (
      caption.trim().length > 0 ||
      linkInput.trim().length > 0 ||
      whatsappInput.trim().length > 0 ||
      postLocation.trim().length > 0
    ) {
      return true;
    }
    if (selectedMusicId) return true;
    if (hasAiApplied) return true;
    if (mediaType === 'photo') {
      return (
        photoHistoryIdx > 0 ||
        currentPhotoState.strokes.length > 0 ||
        currentPhotoState.overlays.length > 0 ||
        currentPhotoState.aspect !== 'original' ||
        currentPhotoState.rotation !== 0 ||
        Boolean(currentPhotoState.flipX) ||
        Boolean(currentPhotoState.flipY) ||
        currentPhotoState.zoom !== 1 ||
        (currentPhotoState.brightness ?? 1) !== 1 ||
        (currentPhotoState.contrast ?? 1) !== 1 ||
        (currentPhotoState.saturation ?? 1) !== 1 ||
        (currentPhotoState.exposure ?? 1) !== 1 ||
        (currentPhotoState.blur ?? 0) > 0 ||
        (currentPhotoState.filterCss && currentPhotoState.filterCss !== 'none')
      );
    }
    return (
      videoOverlayIdx > 0 ||
      currentVideoOverlays.length > 0 ||
      trimStartSec > 0.1 ||
      (rawVideoDuration > 0 && trimEndSec < rawVideoDuration - 0.1) ||
      videoMuted ||
      Boolean(customVideoThumbnail)
    );
  }, [
    caption,
    linkInput,
    whatsappInput,
    postLocation,
    selectedMusicId,
    hasAiApplied,
    mediaType,
    photoHistoryIdx,
    currentPhotoState,
    videoOverlayIdx,
    currentVideoOverlays.length,
    trimStartSec,
    trimEndSec,
    rawVideoDuration,
    videoMuted,
    customVideoThumbnail,
  ]);

  const applyAiEditedPhotoFile = useCallback(
    (editedFile: File) => {
      if (mediaType !== 'photo') return;
      const nextUrl = URL.createObjectURL(editedFile);
      replaceObjectUrl(nextUrl);
      setSourceFile(editedFile);
      setHasAiApplied(true);
      setSelectedEffectId(null);
      setSelectedEffectCss('none');
      setErrorMsg(null);
      setPhotoHistory((prev) => {
        const latest = prev[photoHistoryIdx] || INITIAL_PHOTO_STATE;
        const preservedState: PhotoEditState = {
          ...latest,
          filterCss: 'none',
        };
        return [...prev.slice(0, photoHistoryIdx + 1), preservedState].slice(-30);
      });
      setPhotoHistoryIdx((idx) => Math.min(idx + 1, 29));

      const img = new Image();
      img.onload = () => setLoadedImg(img);
      img.onerror = () => setErrorMsg('Could not decode AI edited photo.');
      img.src = nextUrl;
    },
    [mediaType, photoHistoryIdx, replaceObjectUrl]
  );

  const restoreOriginalMediaFile = useCallback(() => {
    const orig = untouchedOriginalFileRef.current;
    if (!orig || mediaType !== 'photo') return;
    const nextUrl = URL.createObjectURL(orig);
    replaceObjectUrl(nextUrl);
    setSourceFile(orig);
    setHasAiApplied(false);
    setSelectedEffectId(null);
    setSelectedEffectCss('none');
    setErrorMsg(null);

    const img = new Image();
    img.onload = () => setLoadedImg(img);
    img.onerror = () => setErrorMsg('Could not decode original photo.');
    img.src = nextUrl;
  }, [mediaType, replaceObjectUrl]);

  const handleJumpToVideoTool = useCallback(
    (tool: 'trim' | 'text' | 'emoji' | 'music' | 'effects') => {
      setPreviewOnly(false);
      if (tool === 'trim') {
        setActiveDrawer('trim');
      } else if (tool === 'emoji') {
        setActiveDrawer('emoji');
      } else if (tool === 'music') {
        setActiveDrawer('music');
      } else if (tool === 'effects') {
        setActiveDrawer('none');
        setActiveTab('Moods');
      } else if (tool === 'text') {
        setEditingTextOverlayId(null);
        setTextDraft('');
        setShowTextComposer(true);
      }
    },
    []
  );

  if (!isOpen) return null;

  const toggleEffectPreset = (card: EffectPresetCard) => {
    const isSame = selectedEffectId === card.id;
    const nextId = isSame ? null : card.id;
    const nextCss = isSame ? 'none' : card.css;
    setSelectedEffectId(nextId);
    setSelectedEffectCss(nextCss);
    if (mediaType === 'photo') {
      commitPhotoState({ ...currentPhotoState, filterCss: nextCss });
    }
  };

  const handleToggleMusicTrack = (trackId: string) => {
    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new StatusRoyaltyFreePlayer();
    }
    if (selectedMusicId === trackId) {
      stopBackgroundMusic();
      setSelectedMusicId(null);
      return;
    }
    setSelectedMusicId(trackId);
    audioPlayerRef.current.start(trackId, 0.7, false);
  };

  // --- Photo Canvas Drawing & Panning ---
  const getNormalizedPoint = (el: HTMLElement, clientX: number, clientY: number) => {
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height))),
    };
  };

  const handlePhotoStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (previewOnly || mediaType !== 'photo') return;
    const stage = photoStageRef.current;
    if (!stage) return;

    if (activeDrawer === 'draw') {
      e.currentTarget.setPointerCapture(e.pointerId);
      const pt = getNormalizedPoint(stage, e.clientX, e.clientY);
      setSelectedOverlayId(null);
      setActiveStroke({
        id: makeId('st'),
        color: brushColor,
        width: brushWidth,
        points: [pt],
      });
      return;
    }

    if (activeDrawer === 'crop') {
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = stage.getBoundingClientRect();
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        origPanX: currentPhotoState.panX,
        origPanY: currentPhotoState.panY,
        stageW: rect.width,
        stageH: rect.height,
      };
      return;
    }

    setSelectedOverlayId(null);
  };

  const handlePhotoStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const stage = photoStageRef.current;
    if (!stage) return;

    if (activeStroke && activeDrawer === 'draw') {
      const pt = getNormalizedPoint(stage, e.clientX, e.clientY);
      setActiveStroke((prev) => (prev ? { ...prev, points: [...prev.points, pt] } : null));
      return;
    }

    if (panStartRef.current && activeDrawer === 'crop') {
      const start = panStartRef.current;
      const dx = (e.clientX - start.x) / Math.max(1, start.stageW);
      const dy = (e.clientY - start.y) / Math.max(1, start.stageH);
      const nextPanX = Math.max(-0.5, Math.min(0.5, start.origPanX + dx));
      const nextPanY = Math.max(-0.5, Math.min(0.5, start.origPanY + dy));
      updateLivePhotoPatch({ panX: nextPanX, panY: nextPanY });
    }
  };

  const handlePhotoStagePointerUp = () => {
    if (activeStroke) {
      const finished = activeStroke;
      setActiveStroke(null);
      if (finished.points.length > 0) {
        commitPhotoState({
          ...currentPhotoState,
          strokes: [...currentPhotoState.strokes, finished],
        });
      }
    }
    if (panStartRef.current) {
      panStartRef.current = null;
      flushLivePhotoPatch();
    }
  };

  // --- Overlay Dragging ---
  const handleOverlayPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    ov: StatusMediaOverlay
  ) => {
    if (previewOnly || activeDrawer === 'draw') return;
    e.stopPropagation();
    const stage = mediaType === 'photo' ? photoStageRef.current : videoStageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setSelectedOverlayId(ov.id);
    dragOverlayRef.current = {
      pointerId: e.pointerId,
      id: ov.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: ov.x,
      origY: ov.y,
      lastX: ov.x,
      lastY: ov.y,
      stageW: rect.width,
      stageH: rect.height,
      moved: false,
    };
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragOverlayRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const dx = (e.clientX - drag.startX) / Math.max(1, drag.stageW);
    const dy = (e.clientY - drag.startY) / Math.max(1, drag.stageH);
    if (Math.abs(dx) > 0.004 || Math.abs(dy) > 0.004) drag.moved = true;
    const clamped = clampOverlayPosition(drag.origX + dx, drag.origY + dy);
    drag.lastX = clamped.x;
    drag.lastY = clamped.y;
    setLiveDragPos({ id: drag.id, x: clamped.x, y: clamped.y });
  };

  const handleOverlayPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    const drag = dragOverlayRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    dragOverlayRef.current = null;
    setLiveDragPos(null);
    if (drag.moved) {
      const next = activeOverlays.map((item) =>
        item.id === drag.id ? { ...item, x: drag.lastX, y: drag.lastY } : item
      );
      setOverlaysWithHistory(next);
    }
  };

  // --- Text & Emoji Helpers ---
  const openNewTextComposer = () => {
    setEditingTextOverlayId(null);
    setTextDraft('');
    setTextDraftFont('display');
    setTextDraftColor('#facc15');
    setTextDraftAlign('center');
    setTextDraftBgMode('none');
    setTextDraftScale(1);
    setTextDraftRotation(0);
    setTextDraftBold(true);
    setTextDraftItalic(false);
    setTextDraftEffect('outline');
    setShowTextComposer(true);
  };

  const openEditTextComposer = (ov: StatusMediaOverlay) => {
    setEditingTextOverlayId(ov.id);
    setTextDraft(ov.content);
    setTextDraftFont(ov.font || 'display');
    setTextDraftColor(ov.color || '#facc15');
    setTextDraftAlign(ov.align || 'center');
    setTextDraftBgMode(ov.bgMode === 'dark' || ov.bgMode === 'accent' ? ov.bgMode : 'none');
    setTextDraftScale(ov.scale || 1);
    setTextDraftRotation(ov.rotation || 0);
    setTextDraftBold(typeof ov.bold === 'boolean' ? ov.bold : true);
    setTextDraftItalic(typeof ov.italic === 'boolean' ? ov.italic : false);
    setTextDraftEffect(ov.effect || 'outline');
    setShowTextComposer(true);
  };

  const saveTextOverlay = () => {
    const clean = textDraft.trim().slice(0, 180);
    if (!clean) {
      setShowTextComposer(false);
      return;
    }
    if (editingTextOverlayId) {
      const updated = activeOverlays.map((ov) =>
        ov.id === editingTextOverlayId
          ? {
              ...ov,
              content: clean,
              font: textDraftFont,
              color: textDraftColor,
              align: textDraftAlign,
              bgMode: textDraftBgMode,
              scale: clampOverlayScale(textDraftScale),
              rotation: normalizeOverlayRotation(textDraftRotation),
              bold: textDraftBold,
              italic: textDraftItalic,
              effect: textDraftEffect,
            }
          : ov
      );
      setOverlaysWithHistory(updated);
      setSelectedOverlayId(editingTextOverlayId);
    } else {
      const textCount = activeOverlays.filter((o) => o.kind === 'text').length;
      const offsetY = Math.min(0.72, 0.2 + (textCount % 4) * 0.1);
      const nextOv: StatusMediaOverlay = {
        id: makeId('txt'),
        kind: 'text',
        content: clean,
        x: 0.5,
        y: offsetY,
        scale: clampOverlayScale(textDraftScale),
        rotation: normalizeOverlayRotation(textDraftRotation),
        font: textDraftFont,
        color: textDraftColor,
        align: textDraftAlign,
        bgMode: textDraftBgMode,
        bold: textDraftBold,
        italic: textDraftItalic,
        effect: textDraftEffect,
      };
      setOverlaysWithHistory([...activeOverlays, nextOv]);
      setSelectedOverlayId(nextOv.id);
    }
    setActiveDrawer('none');
    setShowTextComposer(false);
  };

  const addEmojiOverlay = (emoji: string) => {
    const nextOv: StatusMediaOverlay = {
      id: makeId('emo'),
      kind: 'sticker',
      content: emoji,
      x: 0.5,
      y: 0.42,
      scale: 1.2,
      rotation: 0,
    };
    setOverlaysWithHistory([...activeOverlays, nextOv]);
    setSelectedOverlayId(nextOv.id);
    setActiveDrawer('none');
  };

  const updateSelectedOverlay = (patch: Partial<StatusMediaOverlay>) => {
    if (!selectedOverlayId) return;
    const updated = activeOverlays.map((ov) => {
      if (ov.id !== selectedOverlayId) return ov;
      const merged = { ...ov, ...patch };
      return {
        ...merged,
        scale: clampOverlayScale(merged.scale),
        rotation: normalizeOverlayRotation(merged.rotation || 0),
      };
    });
    setOverlaysWithHistory(updated);
  };

  const duplicateSelectedOverlay = () => {
    if (!selectedOverlay) return;
    const res = duplicateOverlayItem(activeOverlays, selectedOverlay.id, makeId('ov'));
    if (res.duplicatedId) {
      setOverlaysWithHistory(res.overlays);
      setSelectedOverlayId(res.duplicatedId);
    }
  };

  const deleteSelectedOverlay = () => {
    if (!selectedOverlayId) return;
    setOverlaysWithHistory(activeOverlays.filter((ov) => ov.id !== selectedOverlayId));
    setSelectedOverlayId(null);
  };

  // --- Video Trim Controls ---
  const trimmedDurationSec = Math.max(1, Number((trimEndSec - trimStartSec).toFixed(1)));
  const timelineMaxSec = Math.max(1, rawVideoDuration || 15);
  const startPct = Math.max(0, Math.min(95, (trimStartSec / timelineMaxSec) * 100));
  const endPct = Math.max(startPct + 5, Math.min(100, (trimEndSec / timelineMaxSec) * 100));
  const playheadPct = Math.max(
    startPct,
    Math.min(endPct, (videoCurrentSec / timelineMaxSec) * 100)
  );

  const handleTrimStartChange = (nextStart: number) => {
    const clampedStart = Math.max(0, Math.min(trimEndSec - 1, nextStart));
    setTrimStartSec(clampedStart);
    if (videoPreviewRef.current && mediaType === 'video') {
      videoPreviewRef.current.currentTime = clampedStart;
    }
    setVideoCurrentSec(clampedStart);
  };

  const handleTrimEndChange = (nextEnd: number) => {
    const clampedEnd = Math.max(trimStartSec + 1, Math.min(timelineMaxSec, nextEnd));
    setTrimEndSec(clampedEnd);
    if (
      videoPreviewRef.current &&
      mediaType === 'video' &&
      videoPreviewRef.current.currentTime > clampedEnd
    ) {
      videoPreviewRef.current.currentTime = trimStartSec;
      setVideoCurrentSec(trimStartSec);
    }
  };

  const resolveSecFromTimelineX = (clientX: number): number => {
    const el = timelineTrackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return Math.round(ratio * timelineMaxSec * 2) / 2;
  };

  const handleTimelinePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    mode: 'start' | 'end' | 'seek'
  ) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    timelineDragModeRef.current = mode;
    const sec = resolveSecFromTimelineX(e.clientX);
    if (mode === 'start') {
      handleTrimStartChange(sec);
    } else if (mode === 'end') {
      handleTrimEndChange(sec);
    } else {
      const clamped = Math.max(trimStartSec, Math.min(trimEndSec, sec));
      setVideoCurrentSec(clamped);
      if (videoPreviewRef.current && mediaType === 'video') {
        videoPreviewRef.current.currentTime = clamped;
      }
    }
  };

  const handleTimelinePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const mode = timelineDragModeRef.current;
    if (!mode) return;
    e.stopPropagation();
    const sec = resolveSecFromTimelineX(e.clientX);
    if (mode === 'start') {
      handleTrimStartChange(sec);
    } else if (mode === 'end') {
      handleTrimEndChange(sec);
    } else {
      const clamped = Math.max(trimStartSec, Math.min(trimEndSec, sec));
      setVideoCurrentSec(clamped);
      if (videoPreviewRef.current && mediaType === 'video') {
        videoPreviewRef.current.currentTime = clamped;
      }
    }
  };

  const handleTimelinePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!timelineDragModeRef.current) return;
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    timelineDragModeRef.current = null;
  };

  const requestClose = () => {
    if (isPublishing) return;
    if (hasUnsavedEdits) {
      setShowDiscardConfirm(true);
    } else {
      stopBackgroundMusic();
      onClose();
    }
  };

  const handleTopConfirmCheck = () => {
    if (isPublishing) return;
    if (activeDrawer !== 'none') {
      setActiveDrawer('none');
      setSelectedOverlayId(null);
      return;
    }
    setSelectedOverlayId(null);
    setPreviewOnly((prev) => !prev);
  };

  const handleProceedToDetails = async () => {
    if (!sourceFile || isPublishing) return;
    setErrorMsg(null);
    const pendingPatch = livePhotoPatchRef.current;
    const exportPhotoState = pendingPatch
      ? { ...currentPhotoState, ...pendingPatch }
      : currentPhotoState;
    if (pendingPatch) {
      flushLivePhotoPatch();
    }
    if (mediaType === 'photo') {
      if (loadedImg) {
        try {
          const exported = await exportEditedPhotoToFile(loadedImg, exportPhotoState, sourceFile.name);
          setEditedPreviewDataUrl(exported.previewDataUrl);
        } catch {
          if (canvasRef.current) {
            try {
              setEditedPreviewDataUrl(canvasRef.current.toDataURL('image/jpeg', 0.85));
            } catch {}
          }
        }
      } else if (canvasRef.current) {
        try {
          setEditedPreviewDataUrl(canvasRef.current.toDataURL('image/jpeg', 0.85));
        } catch {}
      }
    } else if (mediaType === 'video') {
      if (!customVideoThumbnail && videoPreviewRef.current) {
        captureVideoThumbnail();
      }
    }
    setSelectedOverlayId(null);
    setActiveDrawer('none');
    setPreviewOnly(false);
    setEditorStep('details');
  };

  // --- Publish to KING (Reuses Cloudinary + Firebase Central Content Service & Status Service) ---
  const handlePublishPost = async () => {
    if (isPublishing || publishingLockRef.current) return;

    if (!user?.uid) {
      openAuthModal('login');
      return;
    }
    if (!sourceFile) {
      setErrorMsg('Please select or capture a photo or video first.');
      return;
    }
    if (!shareToFeed && !shareToStory) {
      setErrorMsg('Select at least one destination (KING Feed or 24h Story).');
      return;
    }
    if (shareToStory && mediaType === 'video' && trimmedDurationSec > MAX_STATUS_VIDEO_SECONDS) {
      setErrorMsg(
        `24h Story videos cannot exceed ${MAX_STATUS_VIDEO_SECONDS} seconds. Trim the clip or uncheck Story.`
      );
      return;
    }

    let waSuffix = '';
    const waCheck = normalizeStatusWhatsAppCta({
      enabled: whatsappEnabled && Boolean(whatsappInput.trim()),
      phoneOrLink: whatsappInput.trim(),
    });
    if (whatsappEnabled && whatsappInput.trim()) {
      if (!waCheck.valid) {
        setErrorMsg(waCheck.error || 'Enter a valid WhatsApp number or link.');
        setShowOptionalMeta(true);
        return;
      }
      if (waCheck.cta?.url) {
        waSuffix = `WhatsApp: ${waCheck.cta.url}`;
      }
    }

    const cleanLink = linkInput.trim();
    const captionParts = [caption.trim(), cleanLink, waSuffix].filter(Boolean);
    const finalCaption = captionParts.join(' • ').slice(0, 500);

    publishingLockRef.current = true;
    stopBackgroundMusic();
    setIsPublishing(true);
    setErrorMsg(null);
    setProgressPct(5);
    setProgressLabel(mediaType === 'photo' ? 'Preparing edited photo...' : 'Preparing video post...');

    try {
      let fileToUpload = sourceFile;

      if (mediaType === 'photo' && loadedImg) {
        const hasPhotoEdits =
          currentPhotoState.aspect !== 'original' ||
          currentPhotoState.rotation !== 0 ||
          Boolean(currentPhotoState.flipX) ||
          Boolean(currentPhotoState.flipY) ||
          currentPhotoState.zoom !== 1 ||
          currentPhotoState.panX !== 0 ||
          currentPhotoState.panY !== 0 ||
          currentPhotoState.bgColor !== '#000000' ||
          (currentPhotoState.filterCss && currentPhotoState.filterCss !== 'none') ||
          (currentPhotoState.brightness ?? 1) !== 1 ||
          (currentPhotoState.contrast ?? 1) !== 1 ||
          (currentPhotoState.saturation ?? 1) !== 1 ||
          (currentPhotoState.exposure ?? 1) !== 1 ||
          (currentPhotoState.blur ?? 0) > 0 ||
          currentPhotoState.strokes.length > 0 ||
          currentPhotoState.overlays.length > 0;

        if (hasPhotoEdits) {
          setProgressPct(10);
          setProgressLabel('Applying photo edits...');
          const exported = await exportEditedPhotoToFile(loadedImg, currentPhotoState, sourceFile.name);
          fileToUpload = exported.file;
        }
        if (fileToUpload.size > MAX_STATUS_IMAGE_BYTES) {
          setProgressLabel('Optimizing photo size...');
          fileToUpload = await compressStatusImage(fileToUpload);
        }
      }

      let uploadedVideoThumbUrl: string | undefined;
      if (mediaType === 'video' && customVideoThumbnail) {
        if (customVideoThumbnail.startsWith('data:')) {
          try {
            setProgressPct(12);
            setProgressLabel('Uploading custom video cover frame...');
            const resp = await fetch(customVideoThumbnail);
            const blob = await resp.blob();
            const thumbFile = new File([blob], `cover_${Date.now()}.jpg`, {
              type: blob.type || 'image/jpeg',
            });
            uploadedVideoThumbUrl = await uploadFileToCloudinary(thumbFile, 'image');
          } catch {
            // Fall back cleanly to auto-derived Cloudinary frame thumbnail
            uploadedVideoThumbUrl = undefined;
          }
        } else if (customVideoThumbnail.startsWith('http') && customVideoThumbnail.length <= 2000) {
          uploadedVideoThumbUrl = customVideoThumbnail;
        }
      }

      let publishedResult: { id: string; contentType: FeedContentType; mediaUrl: string } | null = null;

      if (shareToFeed) {
        const result = await publishGalleryMediaPost(
          fileToUpload,
          finalCaption,
          {
            uid: user.uid,
            displayName: user.displayName,
            photoURL: user.photoURL,
            email: user.email,
          },
          (pct, statusText) => {
            const scaledPct = shareToStory ? Math.min(72, Math.max(15, Math.round(pct * 0.72))) : pct;
            setProgressPct(scaledPct);
            setProgressLabel(statusText);
          },
          mediaType === 'video'
            ? {
                trimStartSec,
                trimEndSec,
                rawDurationSec: rawVideoDuration,
                muted: videoMuted,
                durationLabel: formatSec(trimmedDurationSec),
                location: postLocation.trim() || undefined,
                privacy: postPrivacy,
                thumbnailUrl: uploadedVideoThumbUrl,
              }
            : {
                location: postLocation.trim() || undefined,
                privacy: postPrivacy,
              }
        );
        publishedResult = {
          id: result.id,
          contentType: result.contentType,
          mediaUrl: result.mediaUrl,
        };
      }

      if (shareToStory) {
        const storyPrivacy: StatusPrivacyMode =
          postPrivacy === 'private' ? 'only_me' : postPrivacy === 'friends' ? 'friends' : 'public';
        setProgressPct(shareToFeed ? 80 : 35);
        setProgressLabel('Uploading 24h Story media...');
        const storyUpload = await uploadStatusMediaToCloudinary(
          fileToUpload,
          mediaType === 'video' ? 'video' : 'image',
          storyPrivacy,
          (pct, lbl) => {
            const base = shareToFeed ? 80 : 35;
            const span = shareToFeed ? 15 : 55;
            setProgressPct(Math.min(96, base + Math.round((pct / 100) * span)));
            setProgressLabel(lbl);
          }
        );

        const pickedTrack = selectedMusicId
          ? KING_ROYALTY_FREE_TRACKS.find((t) => t.id === selectedMusicId)
          : null;
        const audioTrack: StatusAudioTrack = pickedTrack
          ? { mode: 'royalty_free', label: pickedTrack.title, presetId: pickedTrack.id }
          : {
              mode: 'original',
              label:
                mediaType === 'video'
                  ? videoMuted
                    ? 'Muted Video'
                    : 'Original Video Sound'
                  : 'Ambient Silent',
            };

        setProgressPct(97);
        setProgressLabel('Publishing 24h Story...');
        const createdStatus = await createStatusPost({
          authorUid: user.uid,
          authorName: user.displayName || user.email?.split('@')[0] || 'KING Creator',
          authorPhoto: user.photoURL || '',
          type: mediaType === 'video' ? 'video' : 'image',
          mediaUrl: storyUpload.secureUrl,
          thumbnailUrl: uploadedVideoThumbUrl || storyUpload.thumbnailUrl,
          cloudinaryPublicId: storyUpload.publicId,
          cloudinaryResourceType: storyUpload.resourceType,
          cloudinaryDeliveryType: storyUpload.deliveryType,
          caption: finalCaption,
          durationSec: mediaType === 'video' ? Math.max(1, Math.round(trimmedDurationSec)) : 6,
          audioTrack,
          whatsappCta: waCheck.cta,
          videoEdits:
            mediaType === 'video'
              ? {
                  trimStartSec: Number(trimStartSec.toFixed(2)),
                  trimEndSec: Number(trimEndSec.toFixed(2)),
                  muted: videoMuted,
                  overlays: currentVideoOverlays,
                }
              : undefined,
          privacyMode: storyPrivacy,
        });

        if (!publishedResult) {
          publishedResult = {
            id: createdStatus.id,
            contentType: mediaType,
            mediaUrl: createdStatus.mediaUrl || storyUpload.secureUrl,
          };
        }
      }

      if (publishedResult) {
        onPublished(publishedResult);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to publish post. Please try again.');
    } finally {
      publishingLockRef.current = false;
      setIsPublishing(false);
    }
  };

  const tabPresets = EFFECT_PRESETS_BY_TAB[activeTab] || EFFECT_PRESETS_BY_TAB.Featured;
  const effectiveFilterCss =
    mediaType === 'photo' ? currentPhotoState.filterCss || 'none' : selectedEffectCss;

  const editorMarkup = (
    <div
      className="fixed inset-0 z-[150] h-[100dvh] w-full bg-[#050811] flex flex-col select-none animate-in fade-in duration-150 text-white overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={editorStep === 'details' ? 'Create KING Post' : 'KING app editor'}
    >
      {/* TOP BAR — KING AI locked first on left, "KING app editor" center, Check + Close right */}
      {editorStep === 'edit' ? (
        <header className="w-full px-3.5 pt-[max(10px,env(safe-area-inset-top))] pb-2 flex items-center justify-between gap-2 shrink-0 z-30 bg-gradient-to-b from-black/90 via-black/55 to-transparent">
          <button
            type="button"
            disabled={isPublishing || !sourceFile}
            onClick={() => {
              setSelectedOverlayId(null);
              setShowAiWorkspace(true);
            }}
            aria-label="Open KING AI Studio"
            className="h-9 px-3 rounded-full bg-gradient-to-r from-[#0d1930] to-[#15284c] hover:brightness-110 border border-blue-400/50 shadow-[0_0_16px_rgba(37,99,235,0.4)] flex items-center gap-1.5 cursor-pointer disabled:opacity-40 active:scale-95 transition shrink-0"
          >
            <KingAiPetalIcon className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-extrabold tracking-wide text-white whitespace-nowrap">
              KING AI
            </span>
            {hasAiApplied && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
            )}
          </button>

          <div className="flex items-center justify-center text-white font-medium text-[15px] tracking-[-0.01em] whitespace-nowrap truncate">
            <span>KING app editor</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={isPublishing}
              onClick={handleTopConfirmCheck}
              className="w-9 h-9 rounded-full bg-white text-[#111215] flex items-center justify-center cursor-pointer hover:bg-slate-200 active:scale-95 transition shadow-lg disabled:opacity-40 shrink-0"
              aria-label={previewOnly ? 'Show editing panel' : 'Toggle clean preview'}
            >
              <Check className="w-4 h-4 stroke-[2.6]" />
            </button>

            <button
              type="button"
              disabled={isPublishing}
              onClick={requestClose}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#9ca3af] hover:text-white hover:bg-white/10 cursor-pointer transition disabled:opacity-40 shrink-0"
              aria-label="Close Post Editor"
            >
              <X className="w-5 h-5" strokeWidth={2} />
            </button>
          </div>
        </header>
      ) : (
        <header className="w-full px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between gap-2 border-b border-blue-500/20 bg-[#080d1a] shrink-0 z-30">
          <button
            type="button"
            disabled={isPublishing}
            onClick={() => setEditorStep('edit')}
            className="min-h-[44px] px-3.5 rounded-full bg-[#131a2b] hover:bg-[#1a243b] border border-white/15 text-slate-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-40"
            aria-label="Back to Editor"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Edit</span>
          </button>

          <div className="text-white font-bold text-[15px] tracking-[-0.01em] whitespace-nowrap">
            New Post
          </div>

          <button
            type="button"
            disabled={isPublishing}
            onClick={requestClose}
            className="w-11 h-11 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer transition disabled:opacity-40"
            aria-label="Close Post Creation"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </header>
      )}

      {/* ERROR BANNER */}
      {errorMsg && (
        <div className="w-full max-w-2xl mx-auto px-4 pt-1 pb-1 shrink-0 z-30">
          <div className="px-3 py-2 rounded-xl bg-rose-950/90 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="truncate">{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-rose-300 font-bold px-2 py-1 cursor-pointer"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* MAIN WORKSPACE */}
      {editorStep === 'edit' ? (
        <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
          {/* EDGE-TO-EDGE FULL-SCREEN MEDIA STAGE */}
          <div className="relative flex-1 min-h-0 w-full bg-black flex items-center justify-center overflow-hidden">
            {/* Floating Undo / Redo Bar (Always reachable & non-blocking) */}
            {!previewOnly && (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="absolute top-2 left-3 z-30 flex items-center gap-1.5"
              >
                {mediaType === 'photo' ? (
                  <>
                    <button
                      type="button"
                      disabled={photoHistoryIdx <= 0}
                      onClick={handlePhotoUndo}
                      aria-label="Undo photo edit"
                      className="min-h-[40px] px-3 rounded-full bg-black/70 backdrop-blur-md border border-white/15 hover:bg-black/85 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-35 cursor-pointer transition shadow-lg"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Undo</span>
                    </button>
                    <button
                      type="button"
                      disabled={photoHistoryIdx >= photoHistory.length - 1}
                      onClick={handlePhotoRedo}
                      aria-label="Redo photo edit"
                      className="min-h-[40px] px-3 rounded-full bg-black/70 backdrop-blur-md border border-white/15 hover:bg-black/85 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-35 cursor-pointer transition shadow-lg"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                      <span>Redo</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={videoOverlayIdx <= 0}
                      onClick={() => setVideoOverlayIdx((idx) => Math.max(0, idx - 1))}
                      aria-label="Undo video overlay"
                      className="min-h-[40px] px-3 rounded-full bg-black/70 backdrop-blur-md border border-white/15 hover:bg-black/85 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-35 cursor-pointer transition shadow-lg"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Undo</span>
                    </button>
                    <button
                      type="button"
                      disabled={videoOverlayIdx >= videoOverlayHistory.length - 1}
                      onClick={() => setVideoOverlayIdx((idx) => Math.min(videoOverlayHistory.length - 1, idx + 1))}
                      aria-label="Redo video overlay"
                      className="min-h-[40px] px-3 rounded-full bg-black/70 backdrop-blur-md border border-white/15 hover:bg-black/85 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-35 cursor-pointer transition shadow-lg"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                      <span>Redo</span>
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Photo Canvas vs Video Stage */}
            {mediaType === 'photo' ? (
              <div
                ref={photoStageRef}
                onPointerDown={handlePhotoStagePointerDown}
                onPointerMove={handlePhotoStagePointerMove}
                onPointerUp={handlePhotoStagePointerUp}
                onPointerCancel={handlePhotoStagePointerUp}
                className={`relative w-full h-full flex items-center justify-center ${
                  activeDrawer === 'draw'
                    ? 'cursor-crosshair touch-none'
                    : activeDrawer === 'crop' || liveDragPos
                    ? 'cursor-grab touch-none'
                    : ''
                }`}
              >
                {!loadedImg && objectUrl ? (
                  <img
                    src={objectUrl}
                    alt="Selected photo preview"
                    className="w-full h-full object-contain block"
                    style={{
                      filter: effectiveFilterCss !== 'none' ? effectiveFilterCss : undefined,
                    }}
                  />
                ) : (
                  <canvas
                    ref={canvasRef}
                    className="w-full h-full object-contain block"
                  />
                )}

                {activeDrawer === 'crop' && !previewOnly && (
                  <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-black/70 border border-blue-400/35 text-[11px] font-medium text-slate-200 whitespace-nowrap">
                    Drag photo to reposition crop
                  </div>
                )}

                {/* Draggable Text & Emoji Overlays */}
                {effectivePhotoState.overlays.map((ov, ovIdx) => {
                  const isSelected = !previewOnly && selectedOverlayId === ov.id;
                  const renderX = liveDragPos?.id === ov.id ? liveDragPos.x : ov.x;
                  const renderY = liveDragPos?.id === ov.id ? liveDragPos.y : ov.y;
                  return (
                    <div
                      key={ov.id}
                      onPointerDown={(e) => handleOverlayPointerDown(e, ov)}
                      onPointerMove={handleOverlayPointerMove}
                      onPointerUp={handleOverlayPointerUp}
                      onPointerCancel={handleOverlayPointerUp}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (ov.kind === 'text' && !previewOnly) openEditTextComposer(ov);
                      }}
                      className={`absolute touch-none select-none cursor-move ${
                        isSelected
                          ? 'ring-2 ring-blue-400 rounded-xl p-1 shadow-[0_0_16px_rgba(59,130,246,0.45)]'
                          : ''
                      }`}
                      style={{
                        left: `${renderX * 100}%`,
                        top: `${renderY * 100}%`,
                        zIndex: 10 + ovIdx,
                        transform: `translate(-50%, -50%) rotate(${ov.rotation || 0}deg) scale(${ov.scale || 1})`,
                      }}
                    >
                      {ov.kind === 'sticker' ? (
                        <span className="text-4xl leading-none drop-shadow-lg">{ov.content}</span>
                      ) : (
                        <div
                          className={`px-3 py-1 rounded-xl max-w-[260px] whitespace-pre-wrap break-words text-xl leading-tight ${
                            ov.font === 'display' ? 'uppercase tracking-wide' : ''
                          } ${
                            ov.align === 'left'
                              ? 'text-left'
                              : ov.align === 'right'
                              ? 'text-right'
                              : 'text-center'
                          }`}
                          style={getOverlayTextDisplayStyle(ov)}
                        >
                          {ov.content}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                ref={videoStageRef}
                onClick={() => setSelectedOverlayId(null)}
                className="relative w-full h-full flex items-center justify-center bg-black"
              >
                {objectUrl && (
                  <video
                    ref={videoPreviewRef}
                    src={objectUrl}
                    playsInline
                    muted={videoMuted}
                    className="w-full h-full object-contain bg-black"
                    style={{
                      filter: selectedEffectCss !== 'none' ? selectedEffectCss : undefined,
                    }}
                    onTimeUpdate={(e) => {
                      const v = e.currentTarget;
                      if (v.currentTime < trimStartSec) {
                        v.currentTime = trimStartSec;
                      } else if (v.currentTime >= trimEndSec) {
                        v.currentTime = trimStartSec;
                        if (videoPlaying) v.play().catch(() => {});
                      }
                      setVideoCurrentSec(v.currentTime);
                    }}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      if (Number.isFinite(v.duration) && v.duration > 0) {
                        const dur = Math.max(1, v.duration);
                        setRawVideoDuration(dur);
                        setTrimEndSec(dur);
                      }
                      v.currentTime = trimStartSec;
                      if (videoPlaying) v.play().catch(() => {});
                    }}
                  />
                )}

                {/* Video Floating Play/Pause, Mute & Cover Frame Status */}
                <div className="absolute top-2 right-3 z-30 flex items-center gap-2">
                  {customVideoThumbnail && !previewOnly && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDrawer((d) => (d === 'cover' ? 'none' : 'cover'));
                      }}
                      className="h-10 px-2.5 rounded-full bg-black/70 border border-blue-400/50 text-sky-300 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-lg"
                    >
                      <img
                        src={customVideoThumbnail}
                        alt="Cover"
                        className="w-5 h-5 rounded-full object-cover border border-white/40"
                      />
                      <span>Cover Set</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setVideoMuted((m) => !m);
                    }}
                    className="w-11 h-11 rounded-full bg-black/65 hover:bg-black/85 backdrop-blur-md text-white flex items-center justify-center border border-white/20 cursor-pointer shadow-lg"
                    aria-label={videoMuted ? 'Unmute video' : 'Mute video'}
                  >
                    {videoMuted ? (
                      <VolumeX className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setVideoPlaying((p) => !p);
                    }}
                    className="w-11 h-11 rounded-full bg-black/65 hover:bg-black/85 backdrop-blur-md text-white flex items-center justify-center border border-white/20 cursor-pointer shadow-lg"
                    aria-label={videoPlaying ? 'Pause video' : 'Play video'}
                  >
                    {videoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                </div>

                {/* Video Overlays (Text & Emoji) */}
                {currentVideoOverlays.map((ov, ovIdx) => {
                  const isSelected = !previewOnly && selectedOverlayId === ov.id;
                  const renderX = liveDragPos?.id === ov.id ? liveDragPos.x : ov.x;
                  const renderY = liveDragPos?.id === ov.id ? liveDragPos.y : ov.y;
                  return (
                    <div
                      key={ov.id}
                      onPointerDown={(e) => handleOverlayPointerDown(e, ov)}
                      onPointerMove={handleOverlayPointerMove}
                      onPointerUp={handleOverlayPointerUp}
                      onPointerCancel={handleOverlayPointerUp}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (ov.kind === 'text' && !previewOnly) openEditTextComposer(ov);
                      }}
                      className={`absolute touch-none select-none cursor-move ${
                        isSelected
                          ? 'ring-2 ring-blue-400 rounded-xl p-1 shadow-[0_0_16px_rgba(59,130,246,0.45)]'
                          : ''
                      }`}
                      style={{
                        left: `${renderX * 100}%`,
                        top: `${renderY * 100}%`,
                        zIndex: 10 + ovIdx,
                        transform: `translate(-50%, -50%) rotate(${ov.rotation || 0}deg) scale(${ov.scale || 1})`,
                      }}
                    >
                      {ov.kind === 'sticker' ? (
                        <span className="text-4xl leading-none drop-shadow-lg">{ov.content}</span>
                      ) : (
                        <div
                          className={`px-3 py-1 rounded-xl max-w-[260px] whitespace-pre-wrap break-words text-xl leading-tight ${
                            ov.font === 'display' ? 'uppercase tracking-wide' : ''
                          } ${
                            ov.align === 'left'
                              ? 'text-left'
                              : ov.align === 'right'
                              ? 'text-right'
                              : 'text-center'
                          }`}
                          style={getOverlayTextDisplayStyle(ov)}
                        >
                          {ov.content}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Selected Overlay Quick Bar */}
            {!previewOnly && selectedOverlay && (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 bg-[#0d1526]/95 backdrop-blur-md border border-blue-400/35 rounded-2xl px-2 py-1.5 flex items-center gap-1 shadow-2xl max-w-[94%] overflow-x-auto [&::-webkit-scrollbar]:hidden"
              >
                {selectedOverlay.kind === 'text' && (
                  <button
                    type="button"
                    onClick={() => openEditTextComposer(selectedOverlay)}
                    className="min-h-[36px] px-2.5 rounded-lg bg-[#2563eb] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    updateSelectedOverlay({ scale: clampOverlayScale((selectedOverlay.scale || 1) - 0.15) })
                  }
                  className="min-h-[36px] px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-black cursor-pointer"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateSelectedOverlay({ scale: clampOverlayScale((selectedOverlay.scale || 1) + 0.15) })
                  }
                  className="min-h-[36px] px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-black cursor-pointer"
                >
                  A+
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateSelectedOverlay({
                      rotation: normalizeOverlayRotation((selectedOverlay.rotation || 0) + 15),
                    })
                  }
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                  aria-label="Rotate overlay"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={duplicateSelectedOverlay}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                  aria-label="Duplicate overlay"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedOverlay}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-rose-500/25 hover:bg-rose-500/40 text-rose-300 cursor-pointer"
                  aria-label="Delete overlay"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Clean preview restore button */}
            {previewOnly && (
              <button
                type="button"
                onClick={() => setPreviewOnly(false)}
                className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40 min-h-[44px] px-5 rounded-full bg-[#0d1930]/90 hover:bg-[#132547] border border-blue-400/50 text-white text-xs font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.45)] cursor-pointer"
              >
                <Eye className="w-4 h-4 text-sky-300" />
                <span>Show Editing Tools</span>
              </button>
            )}
          </div>

          {/* BOTTOM-DOCKED EDITING CONTROLS (KING BLUE-GLOW DARK THEME) */}
          {!previewOnly && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 z-30 w-full bg-[#080d1a]/95 backdrop-blur-xl border-t border-blue-500/25 shadow-[0_-14px_40px_rgba(0,0,0,0.9)] px-3 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))]"
            >
              <div className="max-w-2xl mx-auto w-full space-y-2">
                {/* ACTIVE TOOL DRAWERS */}
                {activeDrawer === 'crop' && mediaType === 'photo' && (
                  <div className="bg-[#0e1628] border border-blue-500/25 rounded-2xl p-2.5 space-y-2.5 max-h-[34dvh] overflow-y-auto">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-200">Crop, Rotate &amp; Flip</span>
                      <button
                        type="button"
                        onClick={() => setActiveDrawer('none')}
                        className="text-xs font-semibold text-sky-300 hover:text-white cursor-pointer px-2 py-1"
                      >
                        Done
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-0.5">
                      <div className="flex items-center gap-1">
                        {ASPECT_PRESETS.map((ap) => (
                          <button
                            key={ap.id}
                            type="button"
                            onClick={() =>
                              commitPhotoState({ ...currentPhotoState, aspect: ap.id, panX: 0, panY: 0 })
                            }
                            className={`min-h-[36px] px-2.5 rounded-xl text-[11px] font-bold cursor-pointer shrink-0 ${
                              effectivePhotoState.aspect === ap.id
                                ? 'bg-[#2563eb] text-white shadow'
                                : 'bg-white/10 text-slate-300'
                            }`}
                          >
                            {ap.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            commitPhotoState({
                              ...currentPhotoState,
                              rotation: (((currentPhotoState.rotation + 90) % 360) as 0 | 90 | 180 | 270),
                            })
                          }
                          className="min-h-[36px] px-2.5 rounded-xl bg-white/10 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <RotateCw className="w-3.5 h-3.5" /> 90°
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            commitPhotoState({
                              ...currentPhotoState,
                              flipX: !currentPhotoState.flipX,
                            })
                          }
                          className={`min-h-[36px] px-2.5 rounded-xl text-[11px] font-bold cursor-pointer ${
                            effectivePhotoState.flipX ? 'bg-[#2563eb] text-white' : 'bg-white/10 text-slate-300'
                          }`}
                        >
                          Flip H
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            commitPhotoState({
                              ...currentPhotoState,
                              flipY: !currentPhotoState.flipY,
                            })
                          }
                          className={`min-h-[36px] px-2.5 rounded-xl text-[11px] font-bold cursor-pointer ${
                            effectivePhotoState.flipY ? 'bg-[#2563eb] text-white' : 'bg-white/10 text-slate-300'
                          }`}
                        >
                          Flip V
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-bold text-slate-300 tabular-nums shrink-0">
                        Zoom {effectivePhotoState.zoom.toFixed(1)}x
                      </span>
                      <input
                        type="range"
                        min={60}
                        max={300}
                        value={Math.round(effectivePhotoState.zoom * 100)}
                        onChange={(e) => {
                          const zoom = Number(e.target.value) / 100;
                          updateLivePhotoPatch({ zoom });
                        }}
                        onPointerUp={flushLivePhotoPatch}
                        onTouchEnd={flushLivePhotoPatch}
                        onKeyUp={flushLivePhotoPatch}
                        onBlur={flushLivePhotoPatch}
                        className="flex-1 h-7 accent-blue-500 cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {activeDrawer === 'adjust' && mediaType === 'photo' && (
                  <div className="bg-[#0e1628] border border-blue-500/25 rounded-2xl p-3 space-y-2.5 max-h-[36dvh] overflow-y-auto">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                      <span>Adjust Photo</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            commitPhotoState({
                              ...currentPhotoState,
                              brightness: 1,
                              contrast: 1,
                              saturation: 1,
                              exposure: 1,
                              blur: 0,
                            })
                          }
                          className="text-slate-400 hover:text-white cursor-pointer"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveDrawer('none')}
                          className="text-sky-300 hover:text-white cursor-pointer"
                        >
                          Done
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[11px] text-slate-300 tabular-nums">
                          <span>Brightness</span>
                          <span>{Math.round((effectivePhotoState.brightness ?? 1) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={200}
                          value={Math.round((effectivePhotoState.brightness ?? 1) * 100)}
                          onChange={(e) => updateLivePhotoPatch({ brightness: Number(e.target.value) / 100 })}
                          onPointerUp={flushLivePhotoPatch}
                          onTouchEnd={flushLivePhotoPatch}
                          onKeyUp={flushLivePhotoPatch}
                          onBlur={flushLivePhotoPatch}
                          className="w-full h-7 accent-blue-500 cursor-pointer"
                        />
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[11px] text-slate-300 tabular-nums">
                          <span>Contrast</span>
                          <span>{Math.round((effectivePhotoState.contrast ?? 1) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={200}
                          value={Math.round((effectivePhotoState.contrast ?? 1) * 100)}
                          onChange={(e) => updateLivePhotoPatch({ contrast: Number(e.target.value) / 100 })}
                          onPointerUp={flushLivePhotoPatch}
                          onTouchEnd={flushLivePhotoPatch}
                          onKeyUp={flushLivePhotoPatch}
                          onBlur={flushLivePhotoPatch}
                          className="w-full h-7 accent-blue-500 cursor-pointer"
                        />
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[11px] text-slate-300 tabular-nums">
                          <span>Saturation</span>
                          <span>{Math.round((effectivePhotoState.saturation ?? 1) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={300}
                          value={Math.round((effectivePhotoState.saturation ?? 1) * 100)}
                          onChange={(e) => updateLivePhotoPatch({ saturation: Number(e.target.value) / 100 })}
                          onPointerUp={flushLivePhotoPatch}
                          onTouchEnd={flushLivePhotoPatch}
                          onKeyUp={flushLivePhotoPatch}
                          onBlur={flushLivePhotoPatch}
                          className="w-full h-7 accent-blue-500 cursor-pointer"
                        />
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[11px] text-slate-300 tabular-nums">
                          <span>Exposure</span>
                          <span>{Math.round((effectivePhotoState.exposure ?? 1) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={200}
                          value={Math.round((effectivePhotoState.exposure ?? 1) * 100)}
                          onChange={(e) => updateLivePhotoPatch({ exposure: Number(e.target.value) / 100 })}
                          onPointerUp={flushLivePhotoPatch}
                          onTouchEnd={flushLivePhotoPatch}
                          onKeyUp={flushLivePhotoPatch}
                          onBlur={flushLivePhotoPatch}
                          className="w-full h-7 accent-blue-500 cursor-pointer"
                        />
                      </div>

                      <div className="space-y-0.5 sm:col-span-2">
                        <div className="flex justify-between text-[11px] text-slate-300 tabular-nums">
                          <span>Blur</span>
                          <span>{effectivePhotoState.blur ?? 0}px</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={20}
                          value={effectivePhotoState.blur ?? 0}
                          onChange={(e) => updateLivePhotoPatch({ blur: Number(e.target.value) })}
                          onPointerUp={flushLivePhotoPatch}
                          onTouchEnd={flushLivePhotoPatch}
                          onKeyUp={flushLivePhotoPatch}
                          onBlur={flushLivePhotoPatch}
                          className="w-full h-7 accent-blue-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeDrawer === 'draw' && mediaType === 'photo' && (
                  <div className="bg-[#0e1628] border border-blue-500/25 rounded-2xl p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-200">Draw on Photo</span>
                      <div className="flex items-center gap-3">
                        {currentPhotoState.strokes.length > 0 && (
                          <button
                            type="button"
                            onClick={() => commitPhotoState({ ...currentPhotoState, strokes: [] })}
                            className="text-xs font-bold text-rose-400 cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setActiveDrawer('none')}
                          className="text-xs font-semibold text-sky-300 hover:text-white cursor-pointer"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden py-0.5">
                      {COLOR_SWATCHES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setBrushColor(c)}
                          className={`w-7 h-7 rounded-full border-2 shrink-0 cursor-pointer ${
                            brushColor === c ? 'border-blue-400 scale-110' : 'border-white/30'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-300">Size</span>
                      {BRUSH_WIDTHS.map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setBrushWidth(w)}
                          className={`min-h-[34px] px-2.5 rounded-lg text-xs font-bold cursor-pointer ${
                            brushWidth === w ? 'bg-[#2563eb] text-white' : 'bg-white/10 text-slate-300'
                          }`}
                        >
                          {w}px
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeDrawer === 'bg' && mediaType === 'photo' && (
                  <div className="bg-[#0e1628] border border-blue-500/25 rounded-2xl p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">Canvas Background</span>
                      <button
                        type="button"
                        onClick={() => setActiveDrawer('none')}
                        className="text-xs font-semibold text-sky-300 hover:text-white cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                      {BG_SWATCHES.map((bg) => (
                        <button
                          key={bg.color}
                          type="button"
                          onClick={() => commitPhotoState({ ...currentPhotoState, bgColor: bg.color })}
                          className={`min-h-[38px] px-3 rounded-xl border text-xs font-bold flex items-center gap-2 shrink-0 cursor-pointer ${
                            currentPhotoState.bgColor === bg.color
                              ? 'border-blue-400 bg-[#172542] text-white'
                              : 'border-white/10 bg-[#11182b] text-slate-300'
                          }`}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/30"
                            style={{ backgroundColor: bg.color }}
                          />
                          {bg.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeDrawer === 'emoji' && (
                  <div className="bg-[#0e1628] border border-blue-500/25 rounded-2xl p-2.5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                      <span>Add Emoji / Sticker</span>
                      <button
                        type="button"
                        onClick={() => setActiveDrawer('none')}
                        className="text-sky-300 hover:text-white cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                    <div className="grid grid-cols-8 gap-1.5">
                      {EMOJI_PALETTE.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => addEmojiOverlay(emoji)}
                          className="min-h-[40px] rounded-xl bg-white/5 hover:bg-white/15 text-xl flex items-center justify-center cursor-pointer active:scale-90 transition"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeDrawer === 'music' && (
                  <div className="bg-[#0e1628] border border-blue-500/25 rounded-2xl p-2.5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-200 gap-2">
                      <div className="min-w-0">
                        <span className="font-bold block">Background Music (KING Audio)</span>
                        <span className="text-[10px] text-slate-400 block">
                          Preview track — saved when sharing to 24h Story
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {mediaType === 'video' && (
                          <button
                            type="button"
                            onClick={() => setVideoMuted((m) => !m)}
                            className="min-h-[34px] text-[11px] font-bold px-2.5 rounded-lg bg-white/10 text-slate-200 cursor-pointer"
                          >
                            {videoMuted ? 'Video: Muted' : 'Video: Sound On'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setActiveDrawer('none')}
                          className="text-sky-300 hover:text-white cursor-pointer px-2 py-1"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {KING_ROYALTY_FREE_TRACKS.map((track) => {
                        const isPlaying = selectedMusicId === track.id;
                        return (
                          <button
                            key={track.id}
                            type="button"
                            onClick={() => handleToggleMusicTrack(track.id)}
                            className={`min-h-[44px] px-3 py-1.5 rounded-xl border text-left flex items-center justify-between gap-2 cursor-pointer transition ${
                              isPlaying
                                ? 'bg-emerald-500/20 border-emerald-400/60 text-white'
                                : 'bg-[#0b1120] border-white/10 text-slate-300 hover:text-white'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold truncate">{track.title}</p>
                              <p className="text-[10px] text-slate-400 truncate">{track.mood}</p>
                            </div>
                            {isPlaying ? (
                              <Pause className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <Play className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeDrawer === 'cover' && mediaType === 'video' && (
                  <div className="bg-[#0e1628] border border-blue-500/25 rounded-2xl p-2.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">
                        Select Video Cover Frame ({formatSec(videoCurrentSec)})
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveDrawer('none')}
                        className="text-xs font-semibold text-sky-300 hover:text-white cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, timelineMaxSec)}
                      step={0.1}
                      value={Math.min(timelineMaxSec, Math.max(0, videoCurrentSec))}
                      onChange={(e) => {
                        const sec = Number(e.target.value);
                        setVideoPlaying(false);
                        setVideoCurrentSec(sec);
                        if (videoPreviewRef.current) {
                          videoPreviewRef.current.pause();
                          videoPreviewRef.current.currentTime = sec;
                        }
                      }}
                      className="w-full h-7 accent-blue-500 cursor-pointer"
                      aria-label="Scrub video frame for cover"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {customVideoThumbnail ? (
                          <img
                            src={customVideoThumbnail}
                            alt="Selected cover thumbnail"
                            className="w-10 h-10 rounded-lg object-cover border border-blue-400/50 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                            <ImageIcon className="w-4 h-4 text-slate-400" />
                          </div>
                        )}
                        <span className="text-[11px] text-slate-300 truncate">
                          {customVideoThumbnail ? 'Cover frame ready for post' : 'Scrub & capture frame'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={captureVideoThumbnail}
                        className="min-h-[40px] px-3.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold cursor-pointer shrink-0 transition"
                      >
                        Set Cover Frame
                      </button>
                    </div>
                  </div>
                )}

                {activeDrawer === 'trim' && mediaType === 'video' && (
                  <div className="bg-[#0e1628] border border-blue-500/25 rounded-2xl p-2.5 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleTrimStartChange(trimStartSec - 0.5)}
                          className="min-h-[38px] px-2.5 rounded-xl bg-white/10 text-white font-semibold cursor-pointer"
                        >
                          Start -
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTrimStartChange(trimStartSec + 0.5)}
                          className="min-h-[38px] px-2.5 rounded-xl bg-white/10 text-white font-semibold cursor-pointer"
                        >
                          Start +
                        </button>
                      </div>
                      <span className="text-amber-400 font-bold tabular-nums">
                        Clip {formatSec(trimmedDurationSec)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleTrimEndChange(trimEndSec - 0.5)}
                          className="min-h-[38px] px-2.5 rounded-xl bg-white/10 text-white font-semibold cursor-pointer"
                        >
                          End -
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTrimEndChange(trimEndSec + 0.5)}
                          className="min-h-[38px] px-2.5 rounded-xl bg-white/10 text-white font-semibold cursor-pointer"
                        >
                          End +
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/10">
                      <span className="text-slate-300 text-[11px]">
                        {customVideoThumbnail ? 'Cover frame captured ✓' : 'Capture current frame as cover'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={captureVideoThumbnail}
                          className="min-h-[36px] px-3 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold cursor-pointer transition"
                        >
                          Capture Cover
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveDrawer('none')}
                          className="min-h-[36px] px-2.5 text-sky-300 hover:text-white font-semibold cursor-pointer"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* VIDEO-ONLY TRIM TIMELINE (Never shown in Photo mode) */}
                {mediaType === 'video' && (
                  <div className="space-y-1 px-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-300 tabular-nums">
                      <span>Start {formatSec(trimStartSec)}</span>
                      <span className="text-amber-400 font-bold">
                        Duration {formatSec(trimmedDurationSec)}
                      </span>
                      <span>End {formatSec(trimEndSec)}</span>
                    </div>

                    <div
                      ref={timelineTrackRef}
                      onPointerDown={(e) => handleTimelinePointerDown(e, 'seek')}
                      onPointerMove={handleTimelinePointerMove}
                      onPointerUp={handleTimelinePointerUp}
                      onPointerCancel={handleTimelinePointerUp}
                      className="relative h-7 flex items-center select-none touch-none cursor-pointer"
                    >
                      <div className="w-full h-[3px] bg-[#242c42] rounded-full relative">
                        <div
                          className="absolute top-0 bottom-0 bg-[#eab308]"
                          style={{
                            left: `${startPct}%`,
                            right: `${Math.max(0, 100 - endPct)}%`,
                          }}
                        />
                      </div>

                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none"
                        style={{ left: `${playheadPct}%` }}
                      >
                        <span className="w-2 h-2 rounded-full bg-[#facc15] -mt-3 block" />
                        <span className="w-[2px] h-4 bg-[#facc15] block" />
                      </div>

                      <div
                        role="slider"
                        tabIndex={0}
                        aria-label="Trim start time"
                        aria-valuemin={0}
                        aria-valuemax={Math.max(0, timelineMaxSec - 1)}
                        aria-valuenow={trimStartSec}
                        onPointerDown={(e) => handleTimelinePointerDown(e, 'start')}
                        onPointerMove={handleTimelinePointerMove}
                        onPointerUp={handleTimelinePointerUp}
                        onPointerCancel={handleTimelinePointerUp}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 flex items-center justify-center cursor-ew-resize z-10 touch-none"
                        style={{ left: `${Math.max(2, startPct)}%` }}
                      >
                        <span className="w-4 h-3 rounded-[4px] bg-[#b4831f] border border-[#eab308] flex items-center justify-center shadow">
                          <span className="w-1.5 h-[2px] bg-[#fde047] block" />
                        </span>
                      </div>

                      <div
                        role="slider"
                        tabIndex={0}
                        aria-label="Trim end time"
                        aria-valuemin={Math.min(timelineMaxSec, trimStartSec + 1)}
                        aria-valuemax={timelineMaxSec}
                        aria-valuenow={trimEndSec}
                        onPointerDown={(e) => handleTimelinePointerDown(e, 'end')}
                        onPointerMove={handleTimelinePointerMove}
                        onPointerUp={handleTimelinePointerUp}
                        onPointerCancel={handleTimelinePointerUp}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 flex items-center justify-center cursor-ew-resize z-10 touch-none"
                        style={{ left: `${Math.min(98, endPct)}%` }}
                      >
                        <span className="w-4 h-3 rounded-[4px] bg-[#b4831f] border border-[#eab308] flex items-center justify-center shadow">
                          <span className="w-1.5 h-[2px] bg-[#fde047] block" />
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* EFFECTS TABS + CARDS (Shown cleanly when no sub-drawer is open, or Filters selected) */}
                {(activeDrawer === 'none' || activeDrawer === 'filters') && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                        {EFFECT_TABS.map((tab) => {
                          const isActive = activeTab === tab;
                          return (
                            <button
                              key={tab}
                              type="button"
                              onClick={() => setActiveTab(tab)}
                              className={`min-h-[32px] px-3 rounded-full text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                                isActive
                                  ? 'bg-[#3b8744] text-white shadow-sm'
                                  : 'bg-[#141c30] text-slate-300 hover:text-white'
                              }`}
                            >
                              {tab}
                            </button>
                          );
                        })}
                      </div>
                      {mediaType === 'video' && (
                        <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                          Preview &amp; Story
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {tabPresets.map((card) => {
                        const isSelected =
                          mediaType === 'photo'
                            ? effectiveFilterCss === card.css
                            : selectedEffectId === card.id;
                        return (
                          <button
                            key={card.id}
                            type="button"
                            onClick={() => toggleEffectPreset(card)}
                            className={`rounded-xl p-1.5 flex items-center gap-2 border transition cursor-pointer ${
                              isSelected
                                ? 'bg-[#172848] border-[#3b8744] shadow-[0_0_12px_rgba(59,135,68,0.3)]'
                                : 'bg-[#0f1628] hover:bg-[#15203b] border-white/10'
                            }`}
                          >
                            <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0">
                              <EffectThumbnailArtwork kind={card.thumbKind} />
                            </div>
                            <span className="text-[11px] font-semibold text-slate-100 truncate">
                              {card.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* DIRECT MODE-SPECIFIC EDITING TOOL STRIP */}
                {mediaType === 'photo' ? (
                  <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-0.5">
                    <button
                      type="button"
                      onClick={() => setActiveDrawer((d) => (d === 'crop' ? 'none' : 'crop'))}
                      className={`min-h-[48px] min-w-[62px] px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer transition ${
                        activeDrawer === 'crop'
                          ? 'bg-[#18294a] border-blue-400 text-white'
                          : 'bg-[#101729] hover:bg-[#17223d] border-white/10 text-slate-200'
                      }`}
                    >
                      <Crop className="w-4 h-4 text-emerald-400" />
                      <span className="text-[10px] font-semibold whitespace-nowrap">Crop</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveDrawer((d) => (d === 'adjust' ? 'none' : 'adjust'))}
                      className={`min-h-[48px] min-w-[62px] px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer transition ${
                        activeDrawer === 'adjust'
                          ? 'bg-[#18294a] border-blue-400 text-white'
                          : 'bg-[#101729] hover:bg-[#17223d] border-white/10 text-slate-200'
                      }`}
                    >
                      <Sliders className="w-4 h-4 text-sky-400" />
                      <span className="text-[10px] font-semibold whitespace-nowrap">Adjust</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        commitPhotoState({ ...currentPhotoState, flipX: !currentPhotoState.flipX })
                      }
                      className={`min-h-[48px] min-w-[62px] px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer transition ${
                        effectivePhotoState.flipX
                          ? 'bg-[#18294a] border-blue-400 text-white'
                          : 'bg-[#101729] hover:bg-[#17223d] border-white/10 text-slate-200'
                      }`}
                    >
                      <FlipHorizontal2 className="w-4 h-4 text-blue-400" />
                      <span className="text-[10px] font-semibold whitespace-nowrap">Flip H</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        commitPhotoState({ ...currentPhotoState, flipY: !currentPhotoState.flipY })
                      }
                      className={`min-h-[48px] min-w-[62px] px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer transition ${
                        effectivePhotoState.flipY
                          ? 'bg-[#18294a] border-blue-400 text-white'
                          : 'bg-[#101729] hover:bg-[#17223d] border-white/10 text-slate-200'
                      }`}
                    >
                      <FlipVertical2 className="w-4 h-4 text-blue-400" />
                      <span className="text-[10px] font-semibold whitespace-nowrap">Flip V</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveDrawer((d) => (d === 'filters' ? 'none' : 'filters'))}
                      className={`min-h-[48px] min-w-[62px] px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer transition ${
                        activeDrawer === 'filters' || effectiveFilterCss !== 'none'
                          ? 'bg-[#18294a] border-emerald-400/70 text-white'
                          : 'bg-[#101729] hover:bg-[#17223d] border-white/10 text-slate-200'
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span className="text-[10px] font-semibold whitespace-nowrap">Filters</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveDrawer((d) => (d === 'draw' ? 'none' : 'draw'))}
                      className={`min-h-[48px] min-w-[62px] px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer transition ${
                        activeDrawer === 'draw'
                          ? 'bg-[#18294a] border-blue-400 text-white'
                          : 'bg-[#101729] hover:bg-[#17223d] border-white/10 text-slate-200'
                      }`}
                    >
                      <Pencil className="w-4 h-4 text-pink-400" />
                      <span className="text-[10px] font-semibold whitespace-nowrap">Draw</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveDrawer((d) => (d === 'bg' ? 'none' : 'bg'))}
                      className={`min-h-[48px] min-w-[62px] px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer transition ${
                        activeDrawer === 'bg'
                          ? 'bg-[#18294a] border-blue-400 text-white'
                          : 'bg-[#101729] hover:bg-[#17223d] border-white/10 text-slate-200'
                      }`}
                    >
                      <Palette className="w-4 h-4 text-purple-400" />
                      <span className="text-[10px] font-semibold whitespace-nowrap">BG</span>
                    </button>

                    <button
                      type="button"
                      onClick={openNewTextComposer}
                      className="min-h-[48px] min-w-[66px] px-2.5 rounded-xl bg-[#101729] hover:bg-[#17223d] border border-white/10 flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer transition text-slate-200"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 text-white shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 6h11" />
                        <path d="M10.5 6v12" />
                        <path d="M8 18h4" />
                        <path d="M14.5 17.5l4-4 1.8 1.8-4 4-2.3.5.5-2.3z" />
                      </svg>
                      <span className="text-[10px] font-semibold whitespace-nowrap">Add Text</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveDrawer((d) => (d === 'emoji' ? 'none' : 'emoji'))}
                      className={`min-h-[48px] min-w-[62px] px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer transition ${
                        activeDrawer === 'emoji'
                          ? 'bg-[#18294a] border-blue-400 text-white'
                          : 'bg-[#101729] hover:bg-[#17223d] border-white/10 text-slate-200'
                      }`}
                    >
                      <Smile className="w-4 h-4 text-yellow-300" />
                      <span className="text-[10px] font-semibold whitespace-nowrap">Emoji</span>
                    </button>
                  </div>
                ) : (
                  /* VIDEO TOOL STRIP: Preserves Add Text, Emoji, Background Music, Trim order + Cover Frame */
                  <div className="grid grid-cols-5 gap-1.5">
                    <button
                      type="button"
                      onClick={openNewTextComposer}
                      className="min-h-[52px] rounded-xl bg-[#101729] hover:bg-[#17223d] border border-white/10 flex flex-col items-center justify-center gap-1 px-1 py-1.5 text-center cursor-pointer transition"
                    >
                      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] text-white shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 6h11" />
                        <path d="M10.5 6v12" />
                        <path d="M8 18h4" />
                        <path d="M14.5 17.5l4-4 1.8 1.8-4 4-2.3.5.5-2.3z" />
                      </svg>
                      <span className="text-[10px] font-semibold text-slate-200 leading-tight whitespace-nowrap">
                        Add Text
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveDrawer((d) => (d === 'emoji' ? 'none' : 'emoji'))}
                      className={`min-h-[52px] rounded-xl border flex flex-col items-center justify-center gap-1 px-1 py-1.5 text-center cursor-pointer transition ${
                        activeDrawer === 'emoji'
                          ? 'bg-[#18294a] border-blue-400 text-white'
                          : 'bg-[#101729] hover:bg-[#17223d] border-white/10 text-slate-200'
                      }`}
                    >
                      <Smile className="w-[18px] h-[18px] text-white" strokeWidth={1.8} />
                      <span className="text-[10px] font-semibold leading-tight whitespace-nowrap">Emoji</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveDrawer((d) => (d === 'music' ? 'none' : 'music'))}
                      className={`min-h-[52px] rounded-xl border flex flex-col items-center justify-center gap-1 px-1 py-1.5 text-center cursor-pointer transition ${
                        activeDrawer === 'music' || selectedMusicId
                          ? 'bg-[#18294a] border-emerald-400/70 text-white'
                          : 'bg-[#101729] hover:bg-[#17223d] border-white/10 text-slate-200'
                      }`}
                    >
                      <Music className="w-[18px] h-[18px] text-white" strokeWidth={1.8} />
                      <span className="text-[10px] font-semibold leading-tight truncate max-w-full">
                        Music
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveDrawer((d) => (d === 'trim' ? 'none' : 'trim'))}
                      className={`min-h-[52px] rounded-xl border flex flex-col items-center justify-center gap-1 px-1 py-1.5 text-center cursor-pointer transition ${
                        activeDrawer === 'trim'
                          ? 'bg-[#18294a] border-amber-400/70 text-white'
                          : 'bg-[#101729] hover:bg-[#17223d] border-white/10 text-slate-200'
                      }`}
                    >
                      <Scissors className="w-[18px] h-[18px] text-white" strokeWidth={1.8} />
                      <span className="text-[10px] font-semibold leading-tight whitespace-nowrap">Trim</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveDrawer((d) => (d === 'cover' ? 'none' : 'cover'))}
                      className={`min-h-[52px] rounded-xl border flex flex-col items-center justify-center gap-1 px-1 py-1.5 text-center cursor-pointer transition ${
                        activeDrawer === 'cover' || customVideoThumbnail
                          ? 'bg-[#18294a] border-blue-400 text-white'
                          : 'bg-[#101729] hover:bg-[#17223d] border-white/10 text-slate-200'
                      }`}
                    >
                      <ImageIcon className="w-[18px] h-[18px] text-sky-400" strokeWidth={1.8} />
                      <span className="text-[10px] font-semibold leading-tight whitespace-nowrap">Cover</span>
                    </button>
                  </div>
                )}

                {/* BOTTOM ACTION ROW: Retake + Continue */}
                <div className="flex items-center gap-2.5 pt-0.5">
                  <button
                    type="button"
                    disabled={isPublishing}
                    onClick={() => {
                      stopBackgroundMusic();
                      onRetake();
                    }}
                    className="min-h-[44px] px-4 rounded-xl bg-[#101729] hover:bg-[#17223d] border border-white/15 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 transition"
                  >
                    <Camera className="w-4 h-4 text-sky-300" />
                    <span>Retake</span>
                  </button>

                  <button
                    type="button"
                    disabled={isPublishing || !sourceFile}
                    onClick={handleProceedToDetails}
                    className="flex-1 min-h-[44px] px-5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(37,99,235,0.45)] active:scale-[0.98] cursor-pointer disabled:opacity-50 transition"
                  >
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ================= CLEAN FULL-SCREEN POST DETAILS SCREEN ================= */
        <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden bg-[#050811]">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="max-w-2xl mx-auto w-full space-y-4">
              {/* Final Media Preview + Caption */}
              <div className="flex flex-col sm:flex-row gap-3.5 items-stretch bg-[#0b1222] border border-blue-500/20 rounded-2xl p-3.5">
                <div className="relative w-full sm:w-36 aspect-[4/5] sm:aspect-[3/4] rounded-xl overflow-hidden bg-black border border-white/10 shrink-0 flex items-center justify-center">
                  {mediaType === 'photo' ? (
                    <img
                      src={editedPreviewDataUrl || objectUrl}
                      alt="Final edited post preview"
                      className="w-full h-full object-contain"
                    />
                  ) : customVideoThumbnail ? (
                    <img
                      src={customVideoThumbnail}
                      alt="Selected video cover preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      src={objectUrl}
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  )}
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-bold text-white uppercase tabular-nums">
                    {mediaType === 'video' ? formatSec(trimmedDurationSec) : 'Photo'}
                  </span>
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">
                      {mediaType === 'photo' ? 'Ready to Post Photo' : 'Ready to Post Video'}
                    </span>
                    <button
                      type="button"
                      disabled={isPublishing}
                      onClick={() => setEditorStep('edit')}
                      className="text-xs font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
                    >
                      Edit Media
                    </button>
                  </div>

                  <textarea
                    rows={4}
                    maxLength={480}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write a caption, add #hashtags or @mentions..."
                    className="w-full flex-1 bg-[#10182b] border border-white/10 focus:border-blue-500 rounded-xl p-3 text-sm text-white placeholder:text-slate-500 resize-none focus:outline-none"
                  />

                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                      {['#KING', '#Trending', '#Gaming', '#Viral', '#Reels'].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() =>
                            setCaption((prev) => {
                              if (prev.includes(tag)) return prev;
                              const next = prev.trim() ? `${prev.trim()} ${tag}` : tag;
                              return next.slice(0, 480);
                            })
                          }
                          className="min-h-[30px] px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 font-semibold cursor-pointer shrink-0"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    <span className="tabular-nums shrink-0">{caption.length}/480</span>
                  </div>
                </div>
              </div>

              {/* Where to Share: KING Feed vs 24h Story */}
              <div className="bg-[#0b1222] border border-blue-500/20 rounded-2xl p-3.5 space-y-2.5">
                <div className="text-xs font-bold text-slate-200">Where to Share</div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShareToFeed((v) => !v)}
                    className={`min-h-[56px] px-3.5 py-2.5 rounded-xl border text-left transition cursor-pointer ${
                      shareToFeed
                        ? 'bg-blue-600/20 border-blue-500 text-white shadow-[0_0_14px_rgba(37,99,235,0.2)]'
                        : 'bg-[#10182b] border-white/10 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">KING Feed</span>
                      {shareToFeed && <Check className="w-4 h-4 text-blue-400" />}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Home feed{mediaType === 'video' ? ' & Videos' : ''}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShareToStory((v) => !v)}
                    className={`min-h-[56px] px-3.5 py-2.5 rounded-xl border text-left transition cursor-pointer ${
                      shareToStory
                        ? 'bg-amber-500/20 border-amber-400 text-white'
                        : 'bg-[#10182b] border-white/10 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">24h Story</span>
                      {shareToStory && <Check className="w-4 h-4 text-amber-400" />}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Visible in Stories bar
                    </div>
                  </button>
                </div>
              </div>

              {/* Honest Visibility Scope (No misleading Feed privacy controls) */}
              <div className="bg-[#0b1222] border border-blue-500/20 rounded-2xl p-3.5 space-y-2.5">
                {shareToStory ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-200">24h Story Visibility</span>
                      <span className="text-[11px] text-slate-400">
                        {shareToFeed ? 'KING Feed posts are always Public' : 'Applies to your 24h Story'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'public' as const, label: 'Public', Icon: Globe },
                        { id: 'friends' as const, label: 'Friends', Icon: Users },
                        { id: 'private' as const, label: 'Only Me', Icon: Lock },
                      ].map(({ id, label, Icon }) => {
                        const active = postPrivacy === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setPostPrivacy(id)}
                            className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                              active
                                ? 'bg-[#2563eb]/25 border-blue-400 text-white'
                                : 'bg-[#10182b] border-white/10 text-slate-300 hover:text-white'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Globe className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>KING Feed posts are public to all KING users.</span>
                  </div>
                )}
              </div>

              {/* Optional Location, Link & WhatsApp CTA */}
              <div className="bg-[#0b1222] border border-blue-500/20 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowOptionalMeta((v) => !v)}
                  className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-200 hover:bg-white/5 cursor-pointer transition"
                >
                  <span className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-rose-400" />
                    <span>Location, Link &amp; WhatsApp (Optional)</span>
                  </span>
                  {showOptionalMeta ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {showOptionalMeta && (
                  <div className="px-3.5 pb-3.5 pt-1 space-y-2.5 border-t border-white/10">
                    <input
                      type="text"
                      maxLength={80}
                      value={postLocation}
                      onChange={(e) => setPostLocation(e.target.value)}
                      placeholder="Add city or place..."
                      className="w-full bg-[#10182b] border border-white/10 focus:border-blue-500 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <input
                        type="url"
                        value={linkInput}
                        onChange={(e) => setLinkInput(e.target.value)}
                        maxLength={140}
                        placeholder="Add external link (https://...)"
                        className="flex-1 bg-[#10182b] border border-white/10 focus:border-blue-500 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">WhatsApp Button</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={whatsappEnabled}
                          onClick={() => setWhatsappEnabled((v) => !v)}
                          className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition ${
                            whatsappEnabled ? 'bg-[#25D366] text-white' : 'bg-white/10 text-slate-300'
                          }`}
                        >
                          {whatsappEnabled ? 'ON' : 'OFF'}
                        </button>
                      </div>
                      {whatsappEnabled && (
                        <input
                          type="text"
                          value={whatsappInput}
                          onChange={(e) => setWhatsappInput(e.target.value)}
                          placeholder="+923001234567 or https://wa.me/..."
                          className="w-full bg-[#10182b] border border-white/10 focus:border-[#25D366] rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Real Upload Progress */}
              {isPublishing && (
                <div className="space-y-1.5 bg-[#0e1a33] border border-[#2563eb]/40 rounded-xl p-3">
                  <div className="flex items-center justify-between text-xs font-bold text-blue-300">
                    <span className="flex items-center gap-1.5 truncate">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span className="truncate">{progressLabel || 'Publishing...'}</span>
                    </span>
                    <span className="tabular-nums">{progressPct}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2563eb] transition-all duration-200"
                      style={{ width: `${Math.max(5, progressPct)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* STICKY BOTTOM PUBLISH BAR */}
          <div className="shrink-0 w-full border-t border-blue-500/20 bg-[#080d1a]/95 backdrop-blur-xl px-4 py-3 pb-[max(14px,env(safe-area-inset-bottom))]">
            <div className="max-w-2xl mx-auto w-full flex items-center gap-2.5">
              <button
                type="button"
                disabled={isPublishing}
                onClick={() => setEditorStep('edit')}
                className="min-h-[46px] px-4 rounded-xl bg-[#10182b] hover:bg-[#17233f] border border-white/15 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                type="button"
                disabled={isPublishing || !sourceFile || (!shareToFeed && !shareToStory)}
                onClick={handlePublishPost}
                className="flex-1 min-h-[46px] px-5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(37,99,235,0.45)] active:scale-[0.98] cursor-pointer disabled:opacity-50 transition"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <Share className="w-4 h-4" />
                    <span>
                      {shareToFeed && shareToStory
                        ? 'Publish Post & Story'
                        : shareToStory
                        ? 'Share to Story'
                        : 'Publish Post'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEXT OVERLAY COMPOSER MODAL */}
      {showTextComposer && (
        <div className="fixed inset-0 z-[165] bg-black/90 backdrop-blur-md flex flex-col justify-between p-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowTextComposer(false)}
              className="min-h-[42px] px-4 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>

            <div className="flex items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setTextDraftBold((b) => !b)}
                className={`min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center cursor-pointer ${
                  textDraftBold ? 'bg-[#2563eb] text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setTextDraftItalic((i) => !i)}
                className={`min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center cursor-pointer ${
                  textDraftItalic ? 'bg-[#2563eb] text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                <Italic className="w-4 h-4" />
              </button>
              {(['left', 'center', 'right'] as const).map((al) => (
                <button
                  key={al}
                  type="button"
                  onClick={() => setTextDraftAlign(al)}
                  className={`min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center cursor-pointer ${
                    textDraftAlign === al ? 'bg-[#2563eb] text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {al === 'left' ? (
                    <AlignLeft className="w-4 h-4" />
                  ) : al === 'right' ? (
                    <AlignRight className="w-4 h-4" />
                  ) : (
                    <AlignCenter className="w-4 h-4" />
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  setTextDraftBgMode((b) =>
                    b === 'none' ? 'dark' : b === 'dark' ? 'accent' : 'none'
                  )
                }
                className="min-h-[36px] px-2.5 rounded-xl bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                BG: {textDraftBgMode}
              </button>
            </div>

            <button
              type="button"
              onClick={saveTextOverlay}
              className="min-h-[42px] px-4 rounded-xl bg-[#2563eb] hover:bg-blue-500 text-white text-xs font-black flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{editingTextOverlayId ? 'Save' : 'Add'}</span>
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center px-4">
            <textarea
              autoFocus
              rows={3}
              maxLength={180}
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder="Write your text..."
              className={`w-full max-w-md focus:outline-none resize-none text-2xl p-3 rounded-2xl ${
                textDraftFont === 'display' ? 'uppercase tracking-wider' : ''
              } ${
                textDraftAlign === 'left'
                  ? 'text-left'
                  : textDraftAlign === 'right'
                  ? 'text-right'
                  : 'text-center'
              }`}
              style={{
                ...getOverlayTextDisplayStyle({
                  id: 'draft',
                  kind: 'text',
                  content: textDraft,
                  x: 0.5,
                  y: 0.5,
                  scale: textDraftScale,
                  rotation: textDraftRotation,
                  font: textDraftFont,
                  color: textDraftColor,
                  bold: textDraftBold,
                  italic: textDraftItalic,
                  align: textDraftAlign,
                  bgMode: textDraftBgMode,
                  effect: textDraftEffect,
                }),
                transform: `rotate(${textDraftRotation}deg)`,
              }}
            />
          </div>

          <div className="space-y-2.5 max-w-lg mx-auto w-full">
            <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              {EDITOR_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTextDraftFont(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
                    textDraftFont === f.id ? 'bg-[#2563eb] text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              {(['none', 'shadow', 'outline'] as StatusOverlayTextEffect[]).map((ef) => (
                <button
                  key={ef}
                  type="button"
                  onClick={() => setTextDraftEffect(ef)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold capitalize shrink-0 cursor-pointer ${
                    textDraftEffect === ef ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {ef}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTextDraftColor(c)}
                  className={`w-7 h-7 rounded-full border-2 shrink-0 cursor-pointer ${
                    textDraftColor === c ? 'border-blue-400 scale-110' : 'border-white/25'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DISCARD CONFIRMATION DIALOG */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[175] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xs rounded-2xl bg-[#121316] border border-white/15 p-4 space-y-3 shadow-2xl">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-white">Discard Post Edits?</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Your adjustments, text, and caption will be discarded.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="flex-1 min-h-[42px] rounded-xl bg-[#1b1c20] hover:bg-[#25272d] text-white text-xs font-bold cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  stopBackgroundMusic();
                  onClose();
                }}
                className="flex-1 min-h-[42px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KING AI EDITING WORKSPACE MODAL */}
      <PostAiWorkspaceModal
        isOpen={showAiWorkspace}
        mediaType={mediaType}
        currentFile={sourceFile}
        currentMediaUrl={objectUrl}
        hasOriginalBackup={hasAiApplied && Boolean(untouchedOriginalFileRef.current)}
        onClose={() => setShowAiWorkspace(false)}
        onApplyPhoto={applyAiEditedPhotoFile}
        onRestoreOriginal={restoreOriginalMediaFile}
        onJumpToVideoTool={handleJumpToVideoTool}
      />
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(editorMarkup, document.body);
  }
  return editorMarkup;
}
