import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Camera,
  Check,
  Copy,
  Crop,
  Italic,
  Link2,
  Loader2,
  Music,
  Palette,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCw,
  Scissors,
  Share,
  Smile,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  normalizeSelectedMediaFile,
  publishGalleryMediaPost,
} from '../services/centralContentService';
import { FeedContentType } from '../types/content';
import {
  StatusEditorTextFont,
  StatusMediaOverlay,
  StatusOverlayTextEffect,
} from '../types/social';
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
  normalizeStatusWhatsAppCta,
  readMediaDurationSeconds,
} from '../utils/statusMediaUtils';
import PostAiWorkspaceModal, { KingAiPetalIcon } from './PostAiWorkspaceModal';

interface PostEditorModalProps {
  isOpen: boolean;
  initialFile: File | null;
  selectionKey?: number;
  onClose: () => void;
  onRetake: () => void;
  onPublished: (info: { id: string; contentType: FeedContentType; mediaUrl: string }) => void;
}

type EffectCategoryTab = 'Featured' | 'Styles' | 'Moods' | 'Lighting';
type ActiveDrawer =
  | 'none'
  | 'emoji'
  | 'music'
  | 'trim'
  | 'link'
  | 'whatsapp'
  | 'crop'
  | 'draw'
  | 'bg';

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
  zoom: 1,
  panX: 0,
  panY: 0,
  bgColor: '#000000',
  filterCss: 'none',
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
  onClose,
  onRetake,
  onPublished,
}: PostEditorModalProps) {
  const { user, openAuthModal } = useAuth();

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

  // Drawing & Overlays
  const [brushColor, setBrushColor] = useState<string>('#38bdf8');
  const [brushWidth, setBrushWidth] = useState<number>(8);
  const [activeStroke, setActiveStroke] = useState<BrushStroke | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [liveDragPos, setLiveDragPos] = useState<{ id: string; x: number; y: number } | null>(null);

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
      stopBackgroundMusic();
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
    [replaceObjectUrl, stopBackgroundMusic]
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
      setPhotoHistory((prev) => {
        const sliced = prev.slice(0, photoHistoryIdx + 1);
        const updated = [...sliced, next].slice(-30);
        setPhotoHistoryIdx(updated.length - 1);
        return updated;
      });
    },
    [photoHistoryIdx]
  );

  const commitVideoOverlays = useCallback(
    (next: StatusMediaOverlay[]) => {
      setVideoOverlayHistory((prev) => {
        const sliced = prev.slice(0, videoOverlayIdx + 1);
        const updated = [...sliced, next].slice(-30);
        setVideoOverlayIdx(updated.length - 1);
        return updated;
      });
    },
    [videoOverlayIdx]
  );

  const activeOverlays =
    mediaType === 'photo' ? currentPhotoState.overlays : currentVideoOverlays;

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
      currentPhotoState.aspect,
      loadedImg.naturalWidth || loadedImg.width || 540,
      loadedImg.naturalHeight || loadedImg.height || 675,
      currentPhotoState.rotation,
      540
    );
  }, [loadedImg, currentPhotoState.aspect, currentPhotoState.rotation]);

  useEffect(() => {
    if (mediaType !== 'photo' || !loadedImg || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = canvasDims.width;
    canvas.height = canvasDims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewState: PhotoEditState = {
      ...currentPhotoState,
      filterCss: 'none',
      strokes: activeStroke
        ? [...currentPhotoState.strokes, activeStroke]
        : currentPhotoState.strokes,
      overlays: [],
    };
    drawPhotoCanvasFrame(ctx, canvasDims.width, canvasDims.height, loadedImg, previewState, true);
  }, [mediaType, loadedImg, canvasDims, currentPhotoState, activeStroke]);

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
    if (caption.trim().length > 0 || linkInput.trim().length > 0 || whatsappInput.trim().length > 0) {
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
        currentPhotoState.zoom !== 1 ||
        (currentPhotoState.filterCss && currentPhotoState.filterCss !== 'none')
      );
    }
    return (
      videoOverlayIdx > 0 ||
      currentVideoOverlays.length > 0 ||
      trimStartSec > 0.1 ||
      (rawVideoDuration > 0 && trimEndSec < rawVideoDuration - 0.1) ||
      videoMuted
    );
  }, [
    caption,
    linkInput,
    whatsappInput,
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
      setPhotoHistory((prev) => {
        const copy = [...prev];
        copy[photoHistoryIdx] = { ...copy[photoHistoryIdx], panX: nextPanX, panY: nextPanY };
        return copy;
      });
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
    panStartRef.current = null;
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

  // --- Publish to KING (Reuses Cloudinary + Firebase Central Content Service) ---
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

    let waSuffix = '';
    if (whatsappEnabled && whatsappInput.trim()) {
      const waCheck = normalizeStatusWhatsAppCta({
        enabled: true,
        phoneOrLink: whatsappInput.trim(),
      });
      if (!waCheck.valid) {
        setErrorMsg(waCheck.error || 'Enter a valid WhatsApp number or link.');
        setActiveDrawer('whatsapp');
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
          currentPhotoState.zoom !== 1 ||
          currentPhotoState.panX !== 0 ||
          currentPhotoState.panY !== 0 ||
          currentPhotoState.bgColor !== '#000000' ||
          (currentPhotoState.filterCss && currentPhotoState.filterCss !== 'none') ||
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
          setProgressPct(pct);
          setProgressLabel(statusText);
        },
        mediaType === 'video'
          ? {
              trimStartSec,
              trimEndSec,
              rawDurationSec: rawVideoDuration,
              muted: videoMuted,
              durationLabel: formatSec(trimmedDurationSec),
            }
          : undefined
      );

      onPublished({
        id: result.id,
        contentType: result.contentType,
        mediaUrl: result.mediaUrl,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to publish post. Please try again.');
    } finally {
      publishingLockRef.current = false;
      setIsPublishing(false);
    }
  };

  const tabPresets = EFFECT_PRESETS_BY_TAB[activeTab] || EFFECT_PRESETS_BY_TAB.Featured;

  const editorMarkup = (
    <div
      className="fixed inset-0 z-[150] bg-black flex flex-col items-center select-none animate-in fade-in duration-150 text-white overflow-y-auto [&::-webkit-scrollbar]:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="KING app editor"
    >
      {/* TOP BAR — Exact Screenshot Match: X left, Logo + "KING app editor" center, White circular check right */}
      <header className="w-full max-w-[420px] px-4 pt-3 pb-2 flex items-center justify-between shrink-0 z-30">
        <button
          type="button"
          disabled={isPublishing}
          onClick={requestClose}
          className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center text-[#9ca3af] hover:text-white hover:bg-white/10 cursor-pointer transition disabled:opacity-40"
          aria-label="Close Post Editor"
        >
          <X className="w-6 h-6" strokeWidth={2} />
        </button>

        <div className="flex items-center justify-center text-white font-medium text-[15px] tracking-[-0.01em] whitespace-nowrap">
          <span>KING app editor</span>
        </div>

        <button
          type="button"
          disabled={isPublishing}
          onClick={handleTopConfirmCheck}
          className="w-10 h-10 rounded-full bg-white text-[#111215] flex items-center justify-center cursor-pointer hover:bg-slate-200 active:scale-95 transition shadow-lg disabled:opacity-40 shrink-0"
          aria-label={previewOnly ? 'Show editing panel' : 'Confirm edit'}
        >
          <Check className="w-5 h-5 stroke-[2.6]" />
        </button>
      </header>

      {/* ERROR BANNER */}
      {errorMsg && (
        <div className="w-full max-w-[388px] px-4 mb-2 shrink-0 z-30">
          <div className="px-3 py-2 rounded-xl bg-rose-950/90 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="truncate">{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-rose-300 font-bold px-1.5 cursor-pointer"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* MAIN CENTER COLUMN: Large Rounded Media Preview + Overlapping Dark Bottom Editing Panel */}
      <div className="w-full max-w-[388px] mx-auto px-4 pt-1 pb-5 my-auto flex flex-col">
        {/* LARGE ROUNDED MEDIA PREVIEW CARD */}
        <div className="relative w-full aspect-[1/1.06] min-h-[265px] max-h-[410px] rounded-[24px] overflow-hidden bg-[#0a0b0e] flex items-center justify-center">
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
                  className={`w-full h-full block ${
                    currentPhotoState.aspect === 'original' ? 'object-cover' : 'object-contain'
                  }`}
                  style={{
                    filter: selectedEffectCss !== 'none' ? selectedEffectCss : undefined,
                  }}
                />
              ) : (
                <canvas
                  ref={canvasRef}
                  className={`w-full h-full block ${
                    currentPhotoState.aspect === 'original' ? 'object-cover' : 'object-contain'
                  }`}
                  style={{
                    filter: selectedEffectCss !== 'none' ? selectedEffectCss : undefined,
                  }}
                />
              )}

              {/* Draggable Text & Emoji Overlays */}
              {currentPhotoState.overlays.map((ov, ovIdx) => {
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
                  className="w-full h-full object-cover bg-black"
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

              {/* Video Play/Pause & Mute Floating Controls */}
              <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setVideoMuted((m) => !m);
                  }}
                  className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center border border-white/20 cursor-pointer"
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
                  className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center border border-white/20 cursor-pointer"
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
              className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-[#141824]/95 border border-white/15 rounded-2xl px-2 py-1 flex items-center gap-1 shadow-2xl max-w-[92%] overflow-x-auto [&::-webkit-scrollbar]:hidden"
            >
              {selectedOverlay.kind === 'text' && (
                <button
                  type="button"
                  onClick={() => openEditTextComposer(selectedOverlay)}
                  className="px-2 py-1 rounded-lg bg-[#2563eb] text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  updateSelectedOverlay({ scale: clampOverlayScale((selectedOverlay.scale || 1) - 0.15) })
                }
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-black cursor-pointer"
              >
                A-
              </button>
              <button
                type="button"
                onClick={() =>
                  updateSelectedOverlay({ scale: clampOverlayScale((selectedOverlay.scale || 1) + 0.15) })
                }
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-black cursor-pointer"
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
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                aria-label="Rotate overlay"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={duplicateSelectedOverlay}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                aria-label="Duplicate overlay"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={deleteSelectedOverlay}
                className="p-1.5 rounded-lg bg-rose-500/25 hover:bg-rose-500/40 text-rose-300 cursor-pointer"
                aria-label="Delete overlay"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* DARK ROUNDED BOTTOM EDITING PANEL — Overlaps the lower part of the media preview */}
        {!previewOnly && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="relative z-20 -mt-6 w-full bg-[#131417] border border-white/[0.06] rounded-[24px] px-3.5 pt-3.5 pb-3.5 shadow-[0_-14px_34px_rgba(0,0,0,0.88)] space-y-2.5 shrink-0"
          >
            {/* 1. WHATSAPP TOGGLE ROW + LINK ADD BUTTON */}
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-[#1b1c20] rounded-xl px-2.5 h-[40px] flex items-center justify-between border border-white/[0.05]">
                <button
                  type="button"
                  onClick={() =>
                    setActiveDrawer((d) => (d === 'whatsapp' ? 'none' : 'whatsapp'))
                  }
                  className="flex items-center gap-2 min-w-0 cursor-pointer"
                >
                  <span className="w-6 h-6 rounded-full bg-[#25D366] text-white flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
                      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm5.6 14.1c-.2.6-1.3 1.2-1.8 1.2-.5 0-1.1.2-3.6-.8-3-1.2-4.9-4.2-5.1-4.4-.1-.2-1.2-1.6-1.2-3.1s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5.2.6.8 2 .9 2.1.1.2.1.3 0 .5l-.4.5c-.1.2-.3.3-.1.6.2.3.8 1.3 1.8 2.2 1.2 1.1 2.2 1.4 2.5 1.6.3.1.5.1.7-.1l.8-.9c.2-.2.4-.2.7-.1.3.1 1.8.8 2.1 1 .3.2.5.2.6.4.1.2.1.9-.1 1.5z" />
                    </svg>
                  </span>
                  <span className="text-[13.5px] font-semibold text-white truncate">WhatsApp</span>
                </button>

                <button
                  type="button"
                  role="switch"
                  aria-checked={whatsappEnabled}
                  aria-label="Toggle WhatsApp link"
                  onClick={() => {
                    const next = !whatsappEnabled;
                    setWhatsappEnabled(next);
                    if (next) setActiveDrawer('whatsapp');
                    else if (activeDrawer === 'whatsapp') setActiveDrawer('none');
                  }}
                  className={`relative flex items-center w-[54px] h-[24px] rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                    whatsappEnabled ? 'bg-[#25D366]' : 'bg-[#383a42]'
                  }`}
                >
                  <span
                    className={`w-[19px] h-[19px] rounded-full shadow transition-transform duration-150 ${
                      whatsappEnabled
                        ? 'translate-x-[30px] bg-white'
                        : 'translate-x-0.5 bg-[#9ca3af]'
                    }`}
                  />
                  <span
                    className={`absolute text-[9px] font-bold tracking-tight ${
                      whatsappEnabled
                        ? 'left-2 text-white'
                        : 'right-2 text-[#cbd5e1]'
                    }`}
                  >
                    {whatsappEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setActiveDrawer((d) => (d === 'link' ? 'none' : 'link'))}
                className={`h-[40px] px-3 rounded-xl border text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition shrink-0 ${
                  activeDrawer === 'link' || linkInput.trim() || caption.trim()
                    ? 'bg-[#23262d] border-blue-400/50 text-white'
                    : 'bg-[#18191d] hover:bg-[#23252a] border-white/[0.12] text-white'
                }`}
              >
                <Link2 className="w-3.5 h-3.5 text-slate-300" />
                <span>Link Add</span>
              </button>
            </div>

            {/* Expandable Context Drawers (WhatsApp / Link & Caption / Emoji / Music / Photo Crop & Draw) */}
            {activeDrawer === 'whatsapp' && (
              <div className="bg-[#1b1c20] border border-white/10 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                  <span>WhatsApp Number or Link</span>
                  <button
                    type="button"
                    onClick={() => setActiveDrawer('none')}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    Done
                  </button>
                </div>
                <input
                  type="text"
                  value={whatsappInput}
                  onChange={(e) => {
                    setWhatsappInput(e.target.value);
                    if (e.target.value.trim() && !whatsappEnabled) setWhatsappEnabled(true);
                  }}
                  placeholder="+923001234567 or https://wa.me/..."
                  className="w-full bg-[#121316] border border-white/10 focus:border-[#25D366] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                />
              </div>
            )}

            {activeDrawer === 'link' && (
              <div className="bg-[#1b1c20] border border-white/10 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                  <span>Post Caption &amp; Link</span>
                  <button
                    type="button"
                    onClick={() => setActiveDrawer('none')}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    Done
                  </button>
                </div>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={350}
                  placeholder="Write a caption for your post..."
                  className="w-full bg-[#121316] border border-white/10 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                />
                <input
                  type="url"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  maxLength={140}
                  placeholder="Add external link (https://...)"
                  className="w-full bg-[#121316] border border-white/10 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                />
              </div>
            )}

            {activeDrawer === 'emoji' && (
              <div className="grid grid-cols-8 gap-1 bg-[#1b1c20] border border-white/10 rounded-xl p-2">
                {EMOJI_PALETTE.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => addEmojiOverlay(emoji)}
                    className="min-h-[34px] rounded-lg bg-white/5 hover:bg-white/15 text-lg flex items-center justify-center cursor-pointer active:scale-90 transition"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            {activeDrawer === 'music' && (
              <div className="bg-[#1b1c20] border border-white/10 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                  <span>Background Music (KING Royalty-Free)</span>
                  <div className="flex items-center gap-2">
                    {mediaType === 'video' && (
                      <button
                        type="button"
                        onClick={() => setVideoMuted((m) => !m)}
                        className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/10 text-slate-200 cursor-pointer"
                      >
                        {videoMuted ? 'Video Audio: Muted' : 'Video Audio: On'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveDrawer('none')}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {KING_ROYALTY_FREE_TRACKS.map((track) => {
                    const isPlaying = selectedMusicId === track.id;
                    return (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => handleToggleMusicTrack(track.id)}
                        className={`px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between gap-1.5 cursor-pointer transition ${
                          isPlaying
                            ? 'bg-emerald-500/20 border-emerald-400/60 text-white'
                            : 'bg-[#121316] border-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold truncate">{track.title}</p>
                          <p className="text-[9px] text-slate-400 truncate">{track.mood}</p>
                        </div>
                        {isPlaying ? (
                          <Pause className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Play className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeDrawer === 'crop' && mediaType === 'photo' && (
              <div className="bg-[#1b1c20] border border-white/10 rounded-xl p-2 space-y-2">
                <div className="flex items-center justify-between gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  <div className="flex items-center gap-1">
                    {ASPECT_PRESETS.map((ap) => (
                      <button
                        key={ap.id}
                        type="button"
                        onClick={() =>
                          commitPhotoState({ ...currentPhotoState, aspect: ap.id, panX: 0, panY: 0 })
                        }
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                          currentPhotoState.aspect === ap.id
                            ? 'bg-[#2563eb] text-white'
                            : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {ap.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      commitPhotoState({
                        ...currentPhotoState,
                        rotation: (((currentPhotoState.rotation + 90) % 360) as 0 | 90 | 180 | 270),
                      })
                    }
                    className="px-2 py-1 rounded-lg bg-white/10 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <RotateCw className="w-3 h-3" /> 90°
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-300">
                    Zoom {currentPhotoState.zoom.toFixed(1)}x
                  </span>
                  <input
                    type="range"
                    min={60}
                    max={300}
                    value={Math.round(currentPhotoState.zoom * 100)}
                    onChange={(e) => {
                      const zoom = Number(e.target.value) / 100;
                      setPhotoHistory((prev) => {
                        const copy = [...prev];
                        copy[photoHistoryIdx] = { ...copy[photoHistoryIdx], zoom };
                        return copy;
                      });
                    }}
                    className="flex-1 accent-blue-500 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {activeDrawer === 'draw' && mediaType === 'photo' && (
              <div className="bg-[#1b1c20] border border-white/10 rounded-xl p-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                    {COLOR_SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setBrushColor(c)}
                        className={`w-5 h-5 rounded-full border-2 shrink-0 cursor-pointer ${
                          brushColor === c ? 'border-blue-400 scale-110' : 'border-white/30'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  {currentPhotoState.strokes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => commitPhotoState({ ...currentPhotoState, strokes: [] })}
                      className="text-[10px] font-bold text-rose-400 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-300">Size</span>
                  {BRUSH_WIDTHS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setBrushWidth(w)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
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
              <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                {BG_SWATCHES.map((bg) => (
                  <button
                    key={bg.color}
                    type="button"
                    onClick={() => commitPhotoState({ ...currentPhotoState, bgColor: bg.color })}
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1.5 shrink-0 cursor-pointer ${
                      currentPhotoState.bgColor === bg.color
                        ? 'border-blue-500 bg-[#23262d] text-white'
                        : 'border-white/10 bg-[#1b1c20] text-slate-300'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full border border-white/30"
                      style={{ backgroundColor: bg.color }}
                    />
                    {bg.label}
                  </button>
                ))}
              </div>
            )}

            {/* Extra compact quick tools when activeDrawer === 'trim' */}
            {activeDrawer === 'trim' && mediaType === 'photo' && (
              <div className="flex items-center gap-1.5 justify-center">
                <button
                  type="button"
                  onClick={() => setActiveDrawer('crop')}
                  className="px-3 py-1.5 rounded-lg bg-[#1b1c20] border border-white/10 text-[11px] font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Crop className="w-3.5 h-3.5 text-emerald-400" /> Crop / Rotate
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDrawer('draw')}
                  className="px-3 py-1.5 rounded-lg bg-[#1b1c20] border border-white/10 text-[11px] font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5 text-pink-400" /> Draw
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDrawer('bg')}
                  className="px-3 py-1.5 rounded-lg bg-[#1b1c20] border border-white/10 text-[11px] font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Palette className="w-3.5 h-3.5 text-purple-400" /> BG
                </button>
              </div>
            )}

            {activeDrawer === 'trim' && mediaType === 'video' && (
              <div className="bg-[#1b1c20] border border-white/10 rounded-xl p-2.5 flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleTrimStartChange(trimStartSec - 0.5)}
                    className="px-2 py-1 rounded bg-white/10 text-white font-semibold cursor-pointer"
                  >
                    Start -
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTrimStartChange(trimStartSec + 0.5)}
                    className="px-2 py-1 rounded bg-white/10 text-white font-semibold cursor-pointer"
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
                    className="px-2 py-1 rounded bg-white/10 text-white font-semibold cursor-pointer"
                  >
                    End -
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTrimEndChange(trimEndSec + 0.5)}
                    className="px-2 py-1 rounded bg-white/10 text-white font-semibold cursor-pointer"
                  >
                    End +
                  </button>
                </div>
              </div>
            )}

            {/* 2. TABS ROW: Featured (Green active pill), Styles, Moods, Lighting */}
            <div className="flex items-center justify-center gap-2 pt-0.5">
              {EFFECT_TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-3.5 py-1.5 rounded-full text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-[#3b8744] text-white shadow-sm'
                        : 'bg-[#202227] text-[#d1d5db] hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {/* 3. THREE EFFECT CARDS ROW: Anime, Low-poly, 3D */}
            <div className="grid grid-cols-3 gap-2">
              {tabPresets.map((card) => {
                const isSelected = selectedEffectId === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => toggleEffectPreset(card)}
                    className={`rounded-2xl p-2 flex flex-col items-center gap-1.5 border transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#232730] border-[#3b8744]'
                        : 'bg-[#1a1b1f] hover:bg-[#212328] border-white/[0.05]'
                    }`}
                  >
                    <div className="w-[70px] h-[70px] sm:w-[74px] sm:h-[74px] rounded-xl overflow-hidden shrink-0">
                      <EffectThumbnailArtwork kind={card.thumbKind} />
                    </div>
                    <span className="text-[11px] font-medium text-slate-200 truncate max-w-full">
                      {card.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 4. FOUR EDITING TOOL CARDS: Add Text, Emoji, Background Music, Trim */}
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={openNewTextComposer}
                className="min-h-[60px] rounded-xl bg-[#1b1c20] hover:bg-[#23252a] border border-white/[0.05] flex flex-col items-center justify-center gap-1 px-1 py-2 text-center cursor-pointer transition"
              >
                <svg viewBox="0 0 24 24" className="w-[19px] h-[19px] text-white shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 6h11" />
                  <path d="M10.5 6v12" />
                  <path d="M8 18h4" />
                  <path d="M14.5 17.5l4-4 1.8 1.8-4 4-2.3.5.5-2.3z" />
                </svg>
                <span className="text-[10px] font-medium text-slate-200 leading-[1.15]">
                  Add Text
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDrawer((d) => (d === 'emoji' ? 'none' : 'emoji'))}
                className={`min-h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 px-1 py-2 text-center cursor-pointer transition ${
                  activeDrawer === 'emoji'
                    ? 'bg-[#242834] border-blue-500/60 text-white'
                    : 'bg-[#1b1c20] hover:bg-[#23252a] border-white/[0.05] text-slate-200'
                }`}
              >
                <Smile className="w-[19px] h-[19px] text-white" strokeWidth={1.8} />
                <span className="text-[10px] font-medium leading-[1.15]">Emoji</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDrawer((d) => (d === 'music' ? 'none' : 'music'))}
                className={`min-h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 px-1 py-2 text-center cursor-pointer transition ${
                  activeDrawer === 'music' || selectedMusicId
                    ? 'bg-[#242834] border-emerald-500/60 text-white'
                    : 'bg-[#1b1c20] hover:bg-[#23252a] border-white/[0.05] text-slate-200'
                }`}
              >
                <Music className="w-[19px] h-[19px] text-white" strokeWidth={1.8} />
                <span className="text-[10px] font-medium leading-[1.15]">
                  Background Music
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDrawer((d) => (d === 'trim' ? 'none' : 'trim'))}
                className={`min-h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 px-1 py-2 text-center cursor-pointer transition ${
                  activeDrawer === 'trim' || activeDrawer === 'crop' || activeDrawer === 'draw' || activeDrawer === 'bg'
                    ? 'bg-[#242834] border-amber-400/60 text-white'
                    : 'bg-[#1b1c20] hover:bg-[#23252a] border-white/[0.05] text-slate-200'
                }`}
              >
                <Scissors className="w-[19px] h-[19px] text-white" strokeWidth={1.8} />
                <span className="text-[10px] font-medium leading-[1.15]">Trim</span>
              </button>
            </div>

            {/* 4B. KING AI STUDIO LAUNCHER BAR (Relocated from top header to bottom tools section) */}
            <button
              type="button"
              disabled={isPublishing || !sourceFile}
              onClick={() => {
                setSelectedOverlayId(null);
                setShowAiWorkspace(true);
              }}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#0d1526] via-[#13213e] to-[#0d1526] hover:brightness-110 border border-blue-500/45 shadow-[0_0_16px_rgba(37,99,235,0.28)] flex items-center justify-between gap-2.5 cursor-pointer disabled:opacity-45 transition active:scale-[0.99]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[#091224] border border-blue-400/45 shadow-[0_0_10px_rgba(59,130,246,0.4)] flex items-center justify-center shrink-0">
                  <KingAiPetalIcon className="w-4 h-4" />
                </span>
                <div className="text-left min-w-0">
                  <div className="text-xs font-bold tracking-wide text-white flex items-center gap-1.5">
                    <span>KING AI</span>
                    {hasAiApplied && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/35">
                        Edited
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-blue-300/90 truncate">
                    {mediaType === 'photo'
                      ? 'Prompt Edit, Enhance Quality, Remove BG & Lighting'
                      : 'Check Video AI Status & Quick Video Tools'}
                  </div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-[#2563eb]/25 border border-blue-400/45 text-[10px] font-bold text-blue-200 shrink-0">
                AI EDIT
              </span>
            </button>

            {/* 5. VIDEO TIMELINE WITH START / END CONTROLS & DURATION LABELS */}
            <div className="space-y-1 px-0.5 pt-0.5">
              <div className="flex items-center justify-between text-[10px] text-[#9ca3af] tabular-nums">
                <span>{formatSec(trimStartSec)}</span>
                <span>{formatSec(trimEndSec)}</span>
              </div>

              <div
                ref={timelineTrackRef}
                onPointerDown={(e) => handleTimelinePointerDown(e, 'seek')}
                onPointerMove={handleTimelinePointerMove}
                onPointerUp={handleTimelinePointerUp}
                onPointerCancel={handleTimelinePointerUp}
                className="relative h-6 flex items-center select-none touch-none cursor-pointer"
              >
                {/* Base horizontal line */}
                <div className="w-full h-[2px] bg-[#2c2e34] rounded-full relative">
                  {/* Active trimmed segment */}
                  <div
                    className="absolute top-0 bottom-0 bg-[#c99b2c]"
                    style={{
                      left: `${startPct}%`,
                      right: `${Math.max(0, 100 - endPct)}%`,
                    }}
                  />
                </div>

                {/* Playhead Pin Indicator */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none"
                  style={{ left: `${playheadPct}%` }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#facc15] -mt-3 block" />
                  <span className="w-[1.5px] h-3.5 bg-[#facc15] block" />
                </div>

                {/* Left Amber Trim Handle (draggable across full bar) */}
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
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 flex items-center justify-center cursor-ew-resize z-10 touch-none"
                  style={{ left: `${Math.max(2, startPct)}%` }}
                >
                  <span className="w-3.5 h-2 rounded-[3px] bg-[#b4831f] border border-[#eab308] flex items-center justify-center">
                    <span className="w-1.5 h-[1.5px] bg-[#fde047] block" />
                  </span>
                </div>

                {/* Right Amber Trim Handle (draggable across full bar) */}
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
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 flex items-center justify-center cursor-ew-resize z-10 touch-none"
                  style={{ left: `${Math.min(98, endPct)}%` }}
                >
                  <span className="w-3.5 h-2 rounded-[3px] bg-[#b4831f] border border-[#eab308] flex items-center justify-center">
                    <span className="w-1.5 h-[1.5px] bg-[#fde047] block" />
                  </span>
                </div>
              </div>
            </div>

            {/* Real Upload Progress (only shown during publishing) */}
            {isPublishing && (
              <div className="space-y-1.5 bg-[#192233] border border-[#2563eb]/40 rounded-xl p-2.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-blue-300">
                  <span className="flex items-center gap-1.5 truncate">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span className="truncate">{progressLabel || 'Publishing...'}</span>
                  </span>
                  <span className="tabular-nums">{progressPct}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#2563eb] transition-all duration-200"
                    style={{ width: `${Math.max(5, progressPct)}%` }}
                  />
                </div>
              </div>
            )}

            {/* 6. BOTTOM ACTION BUTTONS: Retake + Blue Publish to KING */}
            <div className="flex items-center justify-center gap-2.5 pt-0.5">
              <button
                type="button"
                disabled={isPublishing}
                onClick={onRetake}
                className="min-h-[38px] px-4 rounded-xl bg-[#18191d] hover:bg-[#23252b] border border-white/[0.14] text-white text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 transition"
              >
                <Camera className="w-3.5 h-3.5 text-slate-200" />
                <span>Retake</span>
              </button>

              <button
                type="button"
                disabled={isPublishing || !sourceFile}
                onClick={handlePublishPost}
                className="min-h-[38px] px-4 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-[12px] font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-blue-600/25 active:scale-[0.98] cursor-pointer disabled:opacity-50 transition"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <Share className="w-3.5 h-3.5" />
                    <span>Publish to KING</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

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
