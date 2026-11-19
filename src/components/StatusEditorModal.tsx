import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpToLine,
  Bold,
  Check,
  Copy,
  Crop,
  Crosshair,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Italic,
  Layers,
  Lock,
  MessageCircle,
  Music,
  Palette,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Send,
  Smile,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCreatorProfile } from '../services/creatorProfileService';
import {
  DEFAULT_STATUS_PRIVACY,
  fetchDiscoverableUsers,
  MAX_PRIVACY_UID_LIST,
  resolveSocialErrorMessage,
  subscribeMyBlockedUsers,
  subscribeStatusPrivacy,
} from '../services/socialGraphService';
import { createStatusPost, STATUS_BG_GRADIENTS } from '../services/statusService';
import {
  SocialUserProfile,
  StatusAudioTrack,
  StatusEditorTextFont,
  StatusMediaOverlay,
  StatusMediaType,
  StatusOverlayTextEffect,
  StatusPrivacyMode,
  StatusPrivacySettings,
  StatusRecord,
  StatusTextStyle,
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
  moveOverlayLayer,
  normalizeOverlayRotation,
  OverlayLayerAction,
  PhotoEditState,
  resolveCanvasDimensions,
} from '../utils/statusCanvasExport';
import {
  compressStatusImage,
  compressStatusVideo,
  generateStatusVideoPosterDataUrl,
  MAX_STATUS_AUDIO_BYTES,
  MAX_STATUS_VIDEO_SECONDS,
  normalizeStatusWhatsAppCta,
  readMediaDurationSeconds,
  supportsClientVideoCompression,
  uploadStatusMediaToCloudinary,
} from '../utils/statusMediaUtils';
import CreatorAvatar from './CreatorAvatar';
import SystemCameraGalleryModal from './SystemCameraGalleryModal';

interface StatusEditorModalProps {
  isOpen: boolean;
  initialFile: File | null;
  currentUid: string | null;
  authorName: string;
  authorPhoto: string;
  onClose: () => void;
  onCreated: (status: StatusRecord) => void;
  onShowToast: (msg: string) => void;
}

type EditorTool =
  | 'none'
  | 'crop'
  | 'text'
  | 'sticker'
  | 'draw'
  | 'bg'
  | 'trim'
  | 'music'
  | 'whatsapp'
  | 'caption';

const EDITOR_FONTS: Array<{ id: StatusEditorTextFont; label: string }> = [
  { id: 'sans', label: 'Modern' },
  { id: 'display', label: 'Impact' },
  { id: 'serif', label: 'Editorial' },
  { id: 'mono', label: 'Mono' },
  { id: 'handwritten', label: 'Script' },
];

const COLOR_SWATCHES = [
  '#ffffff',
  '#000000',
  '#ef4444',
  '#3b82f6',
  '#facc15',
  '#22c55e',
  '#fb7185',
  '#a855f7',
  '#f97316',
  '#06b6d4',
];

const TEXT_BG_QUICK_SWATCHES = [
  '#060a14',
  '#ffffff',
  '#ef4444',
  '#2563eb',
  '#eab308',
  '#16a34a',
  '#9333ea',
];

const BG_SWATCHES = [
  { label: 'Midnight', color: '#060a14' },
  { label: 'Pure Black', color: '#000000' },
  { label: 'Royal Gold', color: '#1b1404' },
  { label: 'Deep Ocean', color: '#061826' },
  { label: 'Emerald', color: '#042f2e' },
  { label: 'Crimson', color: '#4c0519' },
  { label: 'Slate', color: '#1e293b' },
  { label: 'Crisp White', color: '#f8fafc' },
];

const STICKER_PALETTE = [
  '👑', '🔥', '❤️', '😂', '😍', '👏', '⚡', '🎉',
  '💯', '🙌', '✨', '🛍️', '💬', '🎬', '🏆', '🥳',
];

const ASPECT_PRESETS: Array<{ id: EditorAspectPreset; label: string }> = [
  { id: 'original', label: 'Original' },
  { id: '9:16', label: '9:16' },
  { id: '4:5', label: '4:5' },
  { id: '1:1', label: '1:1' },
  { id: '16:9', label: '16:9' },
];

const BRUSH_WIDTHS = [4, 8, 14, 22];

const INITIAL_PHOTO_STATE: PhotoEditState = {
  aspect: 'original',
  rotation: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  bgColor: '#060a14',
  strokes: [],
  overlays: [],
};

function makeOverlayId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatSec(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function getPrivacyDisplayMeta(mode: StatusPrivacyMode): { label: string; sub: string } {
  switch (mode) {
    case 'public':
      return { label: 'Everyone', sub: 'Public on KING App' };
    case 'friends':
      return { label: 'My Contacts', sub: 'Mutual friends' };
    case 'followers':
      return { label: 'Followers', sub: 'Channel followers' };
    case 'selected':
      return { label: 'Selected Users', sub: 'Only picked people' };
    case 'except':
      return { label: 'Contacts Except...', sub: 'Hide from excluded' };
    case 'only_me':
      return { label: 'Only Me', sub: 'Private draft' };
  }
}

export default function StatusEditorModal({
  isOpen,
  initialFile,
  currentUid,
  authorName,
  authorPhoto,
  onClose,
  onCreated,
  onShowToast,
}: StatusEditorModalProps) {
  const { profile: myPublicProfile } = useCreatorProfile(currentUid);

  const [step, setStep] = useState<'edit' | 'publish'>('edit');
  const [previewOnly, setPreviewOnly] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<EditorTool>('none');

  const [mediaType, setMediaType] = useState<StatusMediaType>('image');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);

  // Photo Edit State + Undo/Redo History
  const [photoHistory, setPhotoHistory] = useState<PhotoEditState[]>([INITIAL_PHOTO_STATE]);
  const [photoHistoryIdx, setPhotoHistoryIdx] = useState<number>(0);
  const currentPhotoState = photoHistory[photoHistoryIdx] || INITIAL_PHOTO_STATE;

  // Live drawing stroke & selected overlay
  const [brushColor, setBrushColor] = useState<string>('#38bdf8');
  const [brushWidth, setBrushWidth] = useState<number>(8);
  const [activeStroke, setActiveStroke] = useState<BrushStroke | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [liveDragPos, setLiveDragPos] = useState<{ id: string; x: number; y: number } | null>(null);

  // Text Composer modal/bar
  const [textDraft, setTextDraft] = useState<string>('');
  const [textDraftFont, setTextDraftFont] = useState<StatusEditorTextFont>('sans');
  const [textDraftColor, setTextDraftColor] = useState<string>('#ffffff');
  const [textDraftAlign, setTextDraftAlign] = useState<'left' | 'center' | 'right'>('center');
  const [textDraftBgMode, setTextDraftBgMode] = useState<'none' | 'dark' | 'accent' | 'custom'>('dark');
  const [textDraftBgColor, setTextDraftBgColor] = useState<string>('#060a14');
  const [textDraftScale, setTextDraftScale] = useState<number>(1);
  const [textDraftRotation, setTextDraftRotation] = useState<number>(0);
  const [textDraftBold, setTextDraftBold] = useState<boolean>(true);
  const [textDraftItalic, setTextDraftItalic] = useState<boolean>(false);
  const [textDraftEffect, setTextDraftEffect] = useState<StatusOverlayTextEffect>('shadow');
  const [editingTextOverlayId, setEditingTextOverlayId] = useState<string | null>(null);
  const [showTextComposer, setShowTextComposer] = useState<boolean>(false);

  // Video Edit State + Undo/Redo for Overlays
  const [rawVideoDuration, setRawVideoDuration] = useState<number>(0);
  const [trimStartSec, setTrimStartSec] = useState<number>(0);
  const [trimEndSec, setTrimEndSec] = useState<number>(15);
  const [videoCurrentSec, setVideoCurrentSec] = useState<number>(0);
  const [videoPlaying, setVideoPlaying] = useState<boolean>(true);
  const [videoMuted, setVideoMuted] = useState<boolean>(false);
  const [videoOverlayHistory, setVideoOverlayHistory] = useState<StatusMediaOverlay[][]>([[]]);
  const [videoOverlayIdx, setVideoOverlayIdx] = useState<number>(0);
  const currentVideoOverlays = videoOverlayHistory[videoOverlayIdx] || [];
  const [videoCompressIfLarge, setVideoCompressIfLarge] = useState<boolean>(false);

  // Optional Text-Only Status fallback inside editor
  const [textStatusContent, setTextStatusContent] = useState<string>('');
  const [textStatusGradient, setTextStatusGradient] = useState<string>(STATUS_BG_GRADIENTS[0].css);
  const [textStatusStyle, setTextStatusStyle] = useState<StatusTextStyle>('classic');

  // Audio state
  const [audioMode, setAudioMode] = useState<'original' | 'royalty_free' | 'custom_audio'>('original');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(KING_ROYALTY_FREE_TRACKS[0].id);
  const [customAudioFile, setCustomAudioFile] = useState<File | null>(null);
  const [previewPlayingTrackId, setPreviewPlayingTrackId] = useState<string | null>(null);
  const royaltyPlayerRef = useRef<StatusRoyaltyFreePlayer | null>(null);

  // WhatsApp CTA State
  const [waEnabled, setWaEnabled] = useState<boolean>(false);
  const [waPhoneOrLink, setWaPhoneOrLink] = useState<string>('');
  const [waButtonLabel, setWaButtonLabel] = useState<string>('Chat on WhatsApp');
  const waPrefilledRef = useRef<boolean>(false);

  // Caption & Audience / Privacy
  const [caption, setCaption] = useState<string>('');
  const [privacyMode, setPrivacyMode] = useState<StatusPrivacyMode>('friends');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [exceptUids, setExceptUids] = useState<string[]>([]);
  const [blockedUids, setBlockedUids] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<SocialUserProfile[]>([]);
  const [pickerSearch, setPickerSearch] = useState<string>('');

  // Baked preview image & transition/discard states
  const [bakedPhotoPreviewUrl, setBakedPhotoPreviewUrl] = useState<string>('');
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);
  const [applyingDone, setApplyingDone] = useState<boolean>(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);
  const [previewVideoMuted, setPreviewVideoMuted] = useState<boolean>(true);

  // Submission State (guards duplicate uploads)
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [progressPct, setProgressPct] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const photoStageRef = useRef<HTMLDivElement | null>(null);
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const publishVideoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const customAudioInputRef = useRef<HTMLInputElement | null>(null);
  const replaceMediaInputRef = useRef<HTMLInputElement | null>(null);

  // Pointer gesture state for pan & overlay dragging
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

  // Load user's saved WhatsApp link into editor input once when opening
  useEffect(() => {
    if (!isOpen) {
      waPrefilledRef.current = false;
      return;
    }
    if (!waPrefilledRef.current && myPublicProfile?.socialLinks?.whatsapp) {
      setWaPhoneOrLink(myPublicProfile.socialLinks.whatsapp);
      waPrefilledRef.current = true;
    }
  }, [isOpen, myPublicProfile?.socialLinks?.whatsapp]);

  // Load privacy defaults, blocks, and discoverable users
  useEffect(() => {
    if (!isOpen || !currentUid) return;

    let privacyInit = false;
    const unsubPrivacy = subscribeStatusPrivacy(currentUid, (settings: StatusPrivacySettings) => {
      if (!privacyInit) {
        setPrivacyMode(settings.visibility || DEFAULT_STATUS_PRIVACY.visibility);
        setSelectedUids(settings.selectedUids || []);
        setExceptUids(settings.exceptUids || []);
        privacyInit = true;
      }
    });

    const unsubBlocks = subscribeMyBlockedUsers(currentUid, (list) => {
      setBlockedUids(list.map((b) => b.blockedUid));
    });

    fetchDiscoverableUsers(currentUid, 80)
      .then(setAvailableUsers)
      .catch(() => {});

    return () => {
      unsubPrivacy();
      unsubBlocks();
    };
  }, [isOpen, currentUid]);

  // Load file into editor whenever modal opens with an initialFile or replacement file
  const loadMediaFile = useCallback((file: File | null) => {
    setErrorMsg(null);
    setStep('edit');
    setPreviewOnly(false);
    setActiveTool('none');
    setSelectedOverlayId(null);
    setShowTextComposer(false);
    setShowDiscardConfirm(false);
    setApplyingDone(false);
    setBakedPhotoPreviewUrl('');
    setCaption('');
    setAudioMode('original');
    setCustomAudioFile(null);
    royaltyPlayerRef.current?.stop();
    setPreviewPlayingTrackId(null);

    if (!file) {
      setSourceFile(null);
      setLoadedImg(null);
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return nextUrl;
    });
    setSourceFile(file);

    if (file.type.startsWith('video/')) {
      setMediaType('video');
      setLoadedImg(null);
      setVideoMuted(false);
      setVideoPlaying(true);
      setVideoOverlayHistory([[]]);
      setVideoOverlayIdx(0);
      setVideoCompressIfLarge(file.size > 38 * 1024 * 1024);

      readMediaDurationSeconds(file, 'video')
        .then((dur) => {
          const validDur = Math.max(1, dur || 1);
          setRawVideoDuration(validDur);
          setTrimStartSec(0);
          setTrimEndSec(Math.min(MAX_STATUS_VIDEO_SECONDS, validDur));
          setVideoCurrentSec(0);
        })
        .catch(() => {
          setRawVideoDuration(10);
          setTrimStartSec(0);
          setTrimEndSec(10);
        });
    } else if (file.type.startsWith('image/')) {
      setMediaType('image');
      setPhotoHistory([INITIAL_PHOTO_STATE]);
      setPhotoHistoryIdx(0);

      const img = new Image();
      img.onload = () => setLoadedImg(img);
      img.onerror = () => setErrorMsg('Could not decode selected image file.');
      img.src = nextUrl;
    } else {
      setErrorMsg('Please select a photo or video file.');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      royaltyPlayerRef.current?.stop();
      setPreviewPlayingTrackId(null);
      return;
    }
    if (initialFile) {
      loadMediaFile(initialFile);
    }
  }, [isOpen, initialFile, loadMediaFile]);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      royaltyPlayerRef.current?.stop();
    };
  }, [objectUrl]);

  // Photo History Commit Helper
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

  // Video Overlays History Commit Helper
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

  const canUndo =
    mediaType === 'image' ? photoHistoryIdx > 0 : mediaType === 'video' ? videoOverlayIdx > 0 : false;
  const canRedo =
    mediaType === 'image'
      ? photoHistoryIdx < photoHistory.length - 1
      : mediaType === 'video'
      ? videoOverlayIdx < videoOverlayHistory.length - 1
      : false;

  const handleUndo = useCallback(() => {
    setSelectedOverlayId(null);
    if (mediaType === 'image' && photoHistoryIdx > 0) {
      setPhotoHistoryIdx((i) => Math.max(0, i - 1));
    } else if (mediaType === 'video' && videoOverlayIdx > 0) {
      setVideoOverlayIdx((i) => Math.max(0, i - 1));
    }
  }, [mediaType, photoHistoryIdx, videoOverlayIdx]);

  const handleRedo = useCallback(() => {
    setSelectedOverlayId(null);
    if (mediaType === 'image' && photoHistoryIdx < photoHistory.length - 1) {
      setPhotoHistoryIdx((i) => Math.min(photoHistory.length - 1, i + 1));
    } else if (mediaType === 'video' && videoOverlayIdx < videoOverlayHistory.length - 1) {
      setVideoOverlayIdx((i) => Math.min(videoOverlayHistory.length - 1, i + 1));
    }
  }, [mediaType, photoHistoryIdx, photoHistory.length, videoOverlayIdx, videoOverlayHistory.length]);

  const activeOverlays = mediaType === 'image' ? currentPhotoState.overlays : currentVideoOverlays;
  const setOverlaysWithHistory = useCallback(
    (nextOverlays: StatusMediaOverlay[]) => {
      if (mediaType === 'image') {
        commitPhotoState({ ...currentPhotoState, overlays: nextOverlays });
      } else if (mediaType === 'video') {
        commitVideoOverlays(nextOverlays);
      }
    },
    [mediaType, currentPhotoState, commitPhotoState, commitVideoOverlays]
  );

  const selectedOverlay = useMemo(
    () => activeOverlays.find((o) => o.id === selectedOverlayId) || null,
    [activeOverlays, selectedOverlayId]
  );

  const selectedOverlayIndex = useMemo(
    () => (selectedOverlayId ? activeOverlays.findIndex((o) => o.id === selectedOverlayId) : -1),
    [activeOverlays, selectedOverlayId]
  );

  const canvasDims = useMemo(() => {
    if (!loadedImg) return { width: 540, height: 960 };
    return resolveCanvasDimensions(
      currentPhotoState.aspect,
      loadedImg.naturalWidth || loadedImg.width || 540,
      loadedImg.naturalHeight || loadedImg.height || 960,
      currentPhotoState.rotation,
      540
    );
  }, [loadedImg, currentPhotoState.aspect, currentPhotoState.rotation]);

  // Draw live Photo + Brush Strokes onto interactive canvas (Text/Stickers rendered smoothly on top in DOM until export)
  useEffect(() => {
    if (mediaType !== 'image' || !loadedImg || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = canvasDims.width;
    canvas.height = canvasDims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewState: PhotoEditState = {
      ...currentPhotoState,
      strokes: activeStroke ? [...currentPhotoState.strokes, activeStroke] : currentPhotoState.strokes,
      overlays: [], // rendered interactively above canvas
    };
    drawPhotoCanvasFrame(ctx, canvasDims.width, canvasDims.height, loadedImg, previewState, true);
  }, [step, mediaType, loadedImg, canvasDims, currentPhotoState, activeStroke]);

  // Video Preview Loop synced to [trimStartSec, trimEndSec] & mute
  useEffect(() => {
    const vid = videoPreviewRef.current;
    if (!vid || mediaType !== 'video' || step !== 'edit') return;
    vid.muted = videoMuted || audioMode !== 'original';
    if (videoPlaying) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  }, [mediaType, step, videoPlaying, videoMuted, audioMode]);

  // Audio playback preview inside editor
  const stopAudioPreview = useCallback(() => {
    royaltyPlayerRef.current?.stop();
    setPreviewPlayingTrackId(null);
  }, []);

  const togglePresetPreview = (trackId: string) => {
    if (!royaltyPlayerRef.current) {
      royaltyPlayerRef.current = new StatusRoyaltyFreePlayer();
    }
    if (previewPlayingTrackId === trackId) {
      stopAudioPreview();
    } else {
      royaltyPlayerRef.current.start(trackId, 0.7, false);
      setPreviewPlayingTrackId(trackId);
    }
  };

  // WhatsApp validation memo
  const normalizedWhatsApp = useMemo(
    () =>
      normalizeStatusWhatsAppCta({
        enabled: waEnabled,
        phoneOrLink: waPhoneOrLink,
        label: waButtonLabel,
      }),
    [waEnabled, waPhoneOrLink, waButtonLabel]
  );

  // Blocked filter for audience pickers
  const blockedSet = useMemo(() => new Set(blockedUids), [blockedUids]);
  const filteredUsers = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return availableUsers.filter((u) => {
      if (blockedSet.has(u.uid)) return false;
      if (!q) return true;
      return u.displayName.toLowerCase().includes(q) || u.uid.toLowerCase().includes(q);
    });
  }, [availableUsers, blockedSet, pickerSearch]);

  // Track whether user has edits/settings worth protecting with Discard confirmation
  const hasUnsavedEdits = useMemo(() => {
    if (step === 'publish') return true;
    if (caption.trim().length > 0 || waEnabled || audioMode !== 'original') return true;
    if (mediaType === 'text') return textStatusContent.trim().length > 0;
    if (mediaType === 'image') {
      return (
        photoHistoryIdx > 0 ||
        currentPhotoState.strokes.length > 0 ||
        currentPhotoState.overlays.length > 0 ||
        currentPhotoState.aspect !== 'original' ||
        currentPhotoState.rotation !== 0 ||
        currentPhotoState.zoom !== 1 ||
        currentPhotoState.panX !== 0 ||
        currentPhotoState.panY !== 0 ||
        currentPhotoState.bgColor !== '#060a14'
      );
    }
    if (mediaType === 'video') {
      const defaultEnd = rawVideoDuration > 0 ? Math.min(MAX_STATUS_VIDEO_SECONDS, rawVideoDuration) : 15;
      return (
        videoOverlayIdx > 0 ||
        currentVideoOverlays.length > 0 ||
        trimStartSec > 0 ||
        (rawVideoDuration > 0 && Math.abs(trimEndSec - defaultEnd) > 0.25) ||
        videoMuted
      );
    }
    return false;
  }, [
    step,
    caption,
    waEnabled,
    audioMode,
    mediaType,
    textStatusContent,
    photoHistoryIdx,
    currentPhotoState,
    videoOverlayIdx,
    currentVideoOverlays.length,
    trimStartSec,
    trimEndSec,
    rawVideoDuration,
    videoMuted,
  ]);

  if (!isOpen) return null;

  // --- Photo Stage Drawing & Pan Handlers ---
  const getNormalizedPoint = (el: HTMLElement, clientX: number, clientY: number) => {
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
    return { x, y, width: rect.width, height: rect.height };
  };

  const handlePhotoStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (previewOnly || mediaType !== 'image') return;
    const stage = photoStageRef.current;
    if (!stage) return;

    if (activeTool === 'draw') {
      e.currentTarget.setPointerCapture(e.pointerId);
      const pt = getNormalizedPoint(stage, e.clientX, e.clientY);
      setSelectedOverlayId(null);
      setActiveStroke({
        id: makeOverlayId('st'),
        color: brushColor,
        width: brushWidth,
        points: [{ x: pt.x, y: pt.y }],
      });
      return;
    }

    if (activeTool === 'crop') {
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

    if (activeStroke && activeTool === 'draw') {
      const pt = getNormalizedPoint(stage, e.clientX, e.clientY);
      setActiveStroke((prev) =>
        prev ? { ...prev, points: [...prev.points, { x: pt.x, y: pt.y }] } : null
      );
      return;
    }

    if (panStartRef.current && activeTool === 'crop') {
      const start = panStartRef.current;
      const dx = (e.clientX - start.x) / Math.max(1, start.stageW);
      const dy = (e.clientY - start.y) / Math.max(1, start.stageH);
      const nextPanX = Math.max(-0.5, Math.min(0.5, start.origPanX + dx));
      const nextPanY = Math.max(-0.5, Math.min(0.5, start.origPanY + dy));
      // Update live current state snapshot without creating 50 history steps while dragging
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

  // --- Shared Overlay Dragging (works on BOTH Photo & Video stages) ---
  const handleOverlayPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    ov: StatusMediaOverlay
  ) => {
    if (previewOnly || activeTool === 'draw') return;
    e.stopPropagation();
    const stage = mediaType === 'image' ? photoStageRef.current : videoStageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without pointer capture support
    }
    setSelectedOverlayId(ov.id);
    if (ov.kind === 'text') {
      setActiveTool('text');
    }
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
    if (Math.abs(dx) > 0.004 || Math.abs(dy) > 0.004) {
      drag.moved = true;
    }
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
    } catch {
      // Ignore release failure
    }
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

  // --- Text / Sticker Add, Live Update, Layering, Duplicate & Delete ---
  const openNewTextComposer = () => {
    setEditingTextOverlayId(null);
    setTextDraft('');
    setTextDraftFont('sans');
    setTextDraftColor('#ffffff');
    setTextDraftAlign('center');
    setTextDraftBgMode('dark');
    setTextDraftBgColor('#060a14');
    setTextDraftScale(1);
    setTextDraftRotation(0);
    setTextDraftBold(true);
    setTextDraftItalic(false);
    setTextDraftEffect('shadow');
    setShowTextComposer(true);
  };

  const openEditTextComposer = (ov: StatusMediaOverlay) => {
    setEditingTextOverlayId(ov.id);
    setTextDraft(ov.content);
    setTextDraftFont(ov.font || 'sans');
    setTextDraftColor(ov.color || '#ffffff');
    setTextDraftAlign(ov.align || 'center');
    setTextDraftBgMode(ov.bgMode || 'none');
    setTextDraftBgColor(ov.bgColor || '#060a14');
    setTextDraftScale(ov.scale || 1);
    setTextDraftRotation(ov.rotation || 0);
    setTextDraftBold(typeof ov.bold === 'boolean' ? ov.bold : (ov.font || 'sans') === 'sans' || ov.font === 'display');
    setTextDraftItalic(typeof ov.italic === 'boolean' ? ov.italic : ov.font === 'serif');
    setTextDraftEffect(ov.effect || (ov.bgMode && ov.bgMode !== 'none' ? 'none' : 'shadow'));
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
              bgColor: textDraftBgMode === 'custom' ? textDraftBgColor : undefined,
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
      const offsetY = Math.min(0.75, 0.42 + (textCount % 4) * 0.08);
      const nextOv: StatusMediaOverlay = {
        id: makeOverlayId('txt'),
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
        bgColor: textDraftBgMode === 'custom' ? textDraftBgColor : undefined,
        bold: textDraftBold,
        italic: textDraftItalic,
        effect: textDraftEffect,
      };
      setOverlaysWithHistory([...activeOverlays, nextOv]);
      setSelectedOverlayId(nextOv.id);
    }
    setActiveTool('text');
    setShowTextComposer(false);
  };

  const updateSelectedOverlay = (patch: Partial<StatusMediaOverlay>) => {
    if (!selectedOverlayId) return;
    const updated = activeOverlays.map((ov) => {
      if (ov.id !== selectedOverlayId) return ov;
      const merged: StatusMediaOverlay = { ...ov, ...patch };
      const clampedPos = clampOverlayPosition(merged.x, merged.y);
      return {
        ...merged,
        x: clampedPos.x,
        y: clampedPos.y,
        scale: clampOverlayScale(merged.scale),
        rotation: normalizeOverlayRotation(merged.rotation || 0),
      };
    });
    setOverlaysWithHistory(updated);
  };

  const handleLayerAction = (action: OverlayLayerAction) => {
    if (!selectedOverlayId) return;
    setOverlaysWithHistory(moveOverlayLayer(activeOverlays, selectedOverlayId, action));
  };

  const duplicateSelectedOverlay = () => {
    if (!selectedOverlay) return;
    const prefix = selectedOverlay.kind === 'sticker' ? 'stk' : 'txt';
    const res = duplicateOverlayItem(activeOverlays, selectedOverlay.id, makeOverlayId(prefix));
    if (res.duplicatedId) {
      setOverlaysWithHistory(res.overlays);
      setSelectedOverlayId(res.duplicatedId);
    }
  };

  const nudgeSelectedOverlay = (dx: number, dy: number) => {
    if (!selectedOverlay) return;
    const next = clampOverlayPosition(selectedOverlay.x + dx, selectedOverlay.y + dy);
    updateSelectedOverlay({ x: next.x, y: next.y });
  };

  const addStickerOverlay = (emoji: string) => {
    const nextOv: StatusMediaOverlay = {
      id: makeOverlayId('stk'),
      kind: 'sticker',
      content: emoji,
      x: 0.5,
      y: 0.42,
      scale: 1.15,
      rotation: 0,
    };
    setOverlaysWithHistory([...activeOverlays, nextOv]);
    setSelectedOverlayId(nextOv.id);
    setActiveTool('none');
  };

  const updateSelectedScale = (delta: number) => {
    if (!selectedOverlay) return;
    updateSelectedOverlay({ scale: clampOverlayScale((selectedOverlay.scale || 1) + delta) });
  };

  const deleteSelectedOverlay = () => {
    if (!selectedOverlayId) return;
    setOverlaysWithHistory(activeOverlays.filter((ov) => ov.id !== selectedOverlayId));
    setSelectedOverlayId(null);
  };

  // --- Trim Timeline Helpers ---
  const trimmedDurationSec = Math.max(
    1,
    Math.min(MAX_STATUS_VIDEO_SECONDS, Number((trimEndSec - trimStartSec).toFixed(1)))
  );

  const handleTrimStartChange = (nextStart: number) => {
    const clampedStart = Math.max(0, Math.min(trimEndSec - 1, nextStart));
    let nextEnd = trimEndSec;
    if (nextEnd - clampedStart > MAX_STATUS_VIDEO_SECONDS) {
      nextEnd = clampedStart + MAX_STATUS_VIDEO_SECONDS;
    }
    setTrimStartSec(clampedStart);
    setTrimEndSec(nextEnd);
    if (videoPreviewRef.current) {
      videoPreviewRef.current.currentTime = clampedStart;
    }
    setVideoCurrentSec(clampedStart);
  };

  const handleTrimEndChange = (nextEnd: number) => {
    const maxAllowedEnd = Math.min(rawVideoDuration || MAX_STATUS_VIDEO_SECONDS, trimStartSec + MAX_STATUS_VIDEO_SECONDS);
    const clampedEnd = Math.max(trimStartSec + 1, Math.min(maxAllowedEnd, nextEnd));
    setTrimEndSec(clampedEnd);
    if (videoPreviewRef.current && videoPreviewRef.current.currentTime > clampedEnd) {
      videoPreviewRef.current.currentTime = trimStartSec;
    }
  };

  const requestDiscardClose = () => {
    if (submitting || applyingDone) return;
    if (hasUnsavedEdits) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  // --- DONE (✓): Save & Apply Editing Changes -> Open Final Status Preview (No Auto-Publish) ---
  const handleDoneEditing = async () => {
    if (applyingDone || submitting) return;
    setErrorMsg(null);
    stopAudioPreview();

    if (waEnabled && !normalizedWhatsApp.valid) {
      setErrorMsg(normalizedWhatsApp.error || 'Please fix your WhatsApp number or link.');
      setActiveTool('whatsapp');
      return;
    }

    if (mediaType === 'text' && !textStatusContent.trim()) {
      setErrorMsg('Please write text for your Status.');
      return;
    }

    if ((mediaType === 'image' || mediaType === 'video') && !sourceFile) {
      setErrorMsg('Please select a photo or video from your gallery first.');
      return;
    }

    if (mediaType === 'video' && trimmedDurationSec > MAX_STATUS_VIDEO_SECONDS) {
      setErrorMsg(`Please trim clip to ${MAX_STATUS_VIDEO_SECONDS} seconds or less.`);
      setActiveTool('trim');
      return;
    }

    setApplyingDone(true);
    try {
      if (mediaType === 'image' && loadedImg && sourceFile) {
        try {
          const exported = await exportEditedPhotoToFile(loadedImg, currentPhotoState, sourceFile.name);
          setBakedPhotoPreviewUrl(exported.previewDataUrl);
        } catch {
          setBakedPhotoPreviewUrl(objectUrl);
        }
      }

      setPreviewVideoMuted(videoMuted || audioMode !== 'original');
      setSelectedOverlayId(null);
      setActiveTool('none');
      setPreviewOnly(false);
      setStep('publish');
    } finally {
      setApplyingDone(false);
    }
  };

  // --- Audience Helper ---
  const toggleAudienceUid = (uid: string) => {
    const isPicked = privacyMode === 'selected';
    const current = isPicked ? selectedUids : exceptUids;
    const setter = isPicked ? setSelectedUids : setExceptUids;

    if (current.includes(uid)) {
      setter(current.filter((id) => id !== uid));
      return;
    }
    if (current.length >= MAX_PRIVACY_UID_LIST) {
      setErrorMsg(`Maximum ${MAX_PRIVACY_UID_LIST} users allowed.`);
      return;
    }
    setter([...current, uid]);
  };

  // --- Publish Status (Cloudinary + Firestore) ---
  const handlePublish = async () => {
    if (submitting) return;
    if (!currentUid) {
      setErrorMsg('Please sign in first to publish a Status.');
      return;
    }
    if (waEnabled && !normalizedWhatsApp.valid) {
      setErrorMsg(normalizedWhatsApp.error || 'Please enter a valid WhatsApp number or link.');
      return;
    }
    if (mediaType === 'video' && trimmedDurationSec > MAX_STATUS_VIDEO_SECONDS) {
      setErrorMsg(`Video Status clip cannot exceed ${MAX_STATUS_VIDEO_SECONDS} seconds.`);
      return;
    }
    if (privacyMode === 'selected' && selectedUids.length === 0) {
      setErrorMsg('Select at least one person for "Selected Users" privacy.');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);

    try {
      let mediaUrl = '';
      let thumbnailUrl = '';
      let cloudinaryPublicId = '';
      let cloudinaryResourceType: 'image' | 'video' | 'raw' | '' = '';
      let cloudinaryDeliveryType: 'upload' | 'authenticated' | 'none' = 'none';

      if (mediaType === 'image' && sourceFile) {
        setProgressLabel('Rendering edited photo...');
        setProgressPct(15);
        let editedFile = sourceFile;
        if (loadedImg) {
          const exported = await exportEditedPhotoToFile(loadedImg, currentPhotoState, sourceFile.name);
          editedFile = exported.file;
        }
        editedFile = await compressStatusImage(editedFile);

        const uploaded = await uploadStatusMediaToCloudinary(
          editedFile,
          'image',
          privacyMode,
          (pct, lbl) => {
            setProgressPct(20 + Math.round(pct * 0.7));
            setProgressLabel(lbl);
          }
        );

        mediaUrl = uploaded.secureUrl;
        thumbnailUrl = uploaded.thumbnailUrl;
        cloudinaryPublicId = uploaded.publicId;
        cloudinaryResourceType = uploaded.resourceType;
        cloudinaryDeliveryType = uploaded.deliveryType;
      } else if (mediaType === 'video' && sourceFile) {
        let uploadVideoFile = sourceFile;
        // Preserve original video quality unless user opted in for huge files or file exceeds 50MB Cloudinary limit
        if (
          (videoCompressIfLarge || sourceFile.size > 48 * 1024 * 1024) &&
          supportsClientVideoCompression() &&
          rawVideoDuration <= MAX_STATUS_VIDEO_SECONDS
        ) {
          setProgressLabel('Optimizing large video...');
          uploadVideoFile = await compressStatusVideo(sourceFile, (pct, lbl) => {
            setProgressPct(Math.round(pct * 0.4));
            setProgressLabel(lbl);
          });
        }

        const posterDataUrl = await generateStatusVideoPosterDataUrl(sourceFile, trimStartSec);

        const uploaded = await uploadStatusMediaToCloudinary(
          uploadVideoFile,
          'video',
          privacyMode,
          (pct, lbl) => {
            setProgressPct(15 + Math.round(pct * 0.72));
            setProgressLabel(lbl);
          }
        );

        mediaUrl = uploaded.secureUrl;
        thumbnailUrl = uploaded.thumbnailUrl || posterDataUrl;
        cloudinaryPublicId = uploaded.publicId;
        cloudinaryResourceType = uploaded.resourceType;
        cloudinaryDeliveryType = uploaded.deliveryType;
      }

      // Audio track resolution
      let audioTrack: StatusAudioTrack = {
        mode: 'original',
        label: mediaType === 'video' ? (videoMuted ? 'Muted Video' : 'Original Video Sound') : 'Ambient Silent',
      };

      if (audioMode === 'royalty_free') {
        const preset =
          KING_ROYALTY_FREE_TRACKS.find((t) => t.id === selectedPresetId) || KING_ROYALTY_FREE_TRACKS[0];
        audioTrack = {
          mode: 'royalty_free',
          label: preset.title,
          presetId: preset.id,
        };
      } else if (audioMode === 'custom_audio' && customAudioFile) {
        setProgressLabel('Uploading audio track...');
        setProgressPct(92);
        const audioUpload = await uploadStatusMediaToCloudinary(customAudioFile, 'video', privacyMode);
        audioTrack = {
          mode: 'custom_audio',
          label: customAudioFile.name.replace(/\.[^/.]+$/, '').slice(0, 60) || 'Custom Audio',
          audioUrl: audioUpload.secureUrl,
          cloudinaryPublicId: audioUpload.publicId,
        };
      }

      setProgressLabel('Publishing Status...');
      setProgressPct(97);

      const cleanAllowed = selectedUids.filter((id) => !blockedSet.has(id));
      const cleanExcluded = exceptUids.filter((id) => !blockedSet.has(id));

      const hasVideoEdits =
        mediaType === 'video' &&
        (trimStartSec > 0 ||
          trimEndSec < rawVideoDuration ||
          videoMuted ||
          currentVideoOverlays.length > 0);

      const created = await createStatusPost({
        authorUid: currentUid,
        authorName,
        authorPhoto,
        type: mediaType,
        mediaUrl,
        thumbnailUrl,
        cloudinaryPublicId,
        cloudinaryResourceType,
        cloudinaryDeliveryType,
        caption,
        textContent: mediaType === 'text' ? textStatusContent : '',
        bgGradient: textStatusGradient,
        textStyle: textStatusStyle,
        durationSec: mediaType === 'video' ? Math.max(1, Math.round(trimmedDurationSec)) : 6,
        audioTrack,
        whatsappCta: normalizedWhatsApp.cta,
        videoEdits: hasVideoEdits
          ? {
              trimStartSec: Number(trimStartSec.toFixed(2)),
              trimEndSec: Number(trimEndSec.toFixed(2)),
              muted: videoMuted,
              overlays: currentVideoOverlays,
            }
          : undefined,
        privacyMode,
        allowedUids: privacyMode === 'selected' ? cleanAllowed : [],
        excludedUids: privacyMode === 'except' ? cleanExcluded : [],
      });

      onCreated(created);
      onShowToast('Your 24h Status is live!');
      onClose();
    } catch (err: any) {
      setErrorMsg(resolveSocialErrorMessage(err, 'Failed to publish Status.'));
    } finally {
      setSubmitting(false);
      setProgressLabel('');
      setProgressPct(0);
    }
  };

  const activeAudienceCount =
    privacyMode === 'selected'
      ? selectedUids.length
      : privacyMode === 'except'
      ? exceptUids.length
      : 0;

  const editorModalMarkup = (
    <div className="fixed inset-0 z-[150] bg-[#04070f] flex flex-col select-none animate-in fade-in duration-150">
      {/* Hidden inputs for replacing media or picking custom audio */}
      <input
        ref={replaceMediaInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadMediaFile(file);
          e.target.value = '';
        }}
      />
      <input
        ref={customAudioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          if (!f.type.startsWith('audio/')) {
            setErrorMsg('Please choose a valid audio file.');
            return;
          }
          if (f.size > MAX_STATUS_AUDIO_BYTES) {
            setErrorMsg('Audio file cannot exceed 15 MB.');
            return;
          }
          setCustomAudioFile(f);
          setAudioMode('custom_audio');
          stopAudioPreview();
        }}
      />

      {step === 'edit' ? (
        <>
          {/* EDITOR TOP BAR (Exact Screenshot Design) */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#121212] border-b border-white/10 shrink-0 z-30">
            <button
              type="button"
              onClick={requestDiscardClose}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/15 cursor-pointer transition"
              aria-label="Close editor"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-1.5 text-white font-extrabold text-sm tracking-wide">
              <span>✨</span>
              <span>KING app editor</span>
            </div>

            <button
              type="button"
              disabled={applyingDone}
              onClick={handleDoneEditing}
              className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center cursor-pointer hover:bg-slate-200 transition shadow-lg disabled:opacity-50"
              aria-label="Done editing"
            >
              <Check className="w-5 h-5 stroke-[3]" />
            </button>
          </div>

          {errorMsg && (
            <div className="mx-3 mt-2 px-3 py-2 rounded-xl bg-red-950/75 border border-red-500/40 text-red-200 text-xs font-semibold flex items-center justify-between gap-2 shrink-0">
              <span>{errorMsg}</span>
              <button type="button" onClick={() => setErrorMsg(null)} className="text-red-300 font-bold px-1">
                ×
              </button>
            </div>
          )}

          {/* MAIN INTERACTIVE STAGE */}
          <div className="flex-1 min-h-0 flex items-center justify-center p-2 sm:p-4 overflow-hidden relative bg-black">
            {/* PHOTO STAGE */}
            {mediaType === 'image' && (
              <div
                ref={photoStageRef}
                onPointerDown={handlePhotoStagePointerDown}
                onPointerMove={handlePhotoStagePointerMove}
                onPointerUp={handlePhotoStagePointerUp}
                onPointerCancel={handlePhotoStagePointerUp}
                className={`relative max-h-full max-w-full rounded-2xl overflow-hidden shadow-2xl border border-slate-800 ${
                  activeTool === 'draw'
                    ? 'cursor-crosshair touch-none'
                    : activeTool === 'crop' || liveDragPos
                    ? 'cursor-grab touch-none'
                    : ''
                }`}
                style={{
                  aspectRatio: `${canvasDims.width} / ${canvasDims.height}`,
                  height: 'min(100%, 72vh)',
                  maxWidth: '100%',
                }}
              >
                <canvas ref={canvasRef} className="w-full h-full block" />

                {/* Interactive Draggable Overlays (Text & Stickers) */}
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
                        isSelected ? 'ring-2 ring-blue-400 rounded-xl p-1 shadow-[0_0_16px_rgba(59,130,246,0.45)]' : ''
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
                          className={`px-3 py-1.5 rounded-xl max-w-[260px] whitespace-pre-wrap break-words text-lg leading-snug ${
                            ov.font === 'display' ? 'uppercase tracking-wider' : ''
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

                {/* Live Caption & WhatsApp Button Preview */}
                {!selectedOverlayId && (
                  <div className="absolute bottom-3 inset-x-3 z-20 flex flex-col items-center gap-2 pointer-events-none">
                    {caption.trim() && (
                      <p className="bg-black/70 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-xl border border-white/10 text-center max-w-xs line-clamp-2">
                        {caption}
                      </p>
                    )}
                    {waEnabled && normalizedWhatsApp.valid && normalizedWhatsApp.cta && (
                      <span className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-500 text-black text-xs font-black shadow-lg">
                        <MessageCircle className="w-4 h-4 fill-current" />
                        <span>{normalizedWhatsApp.cta.label}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* VIDEO STAGE */}
            {mediaType === 'video' && (
              <div
                ref={videoStageRef}
                onClick={() => setSelectedOverlayId(null)}
                className="relative h-[min(100%,72vh)] aspect-[9/16] max-w-full rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-2xl flex items-center justify-center"
              >
                {objectUrl && (
                  <video
                    ref={videoPreviewRef}
                    src={objectUrl}
                    playsInline
                    muted={videoMuted || audioMode !== 'original'}
                    className="w-full h-full object-contain bg-black"
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
                      v.currentTime = trimStartSec;
                      if (videoPlaying) v.play().catch(() => {});
                    }}
                  />
                )}

                {/* Play/Pause Toggle Button */}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setVideoPlaying((p) => !p);
                  }}
                  className="absolute top-3 right-3 z-40 min-w-[40px] min-h-[40px] rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center border border-white/20 cursor-pointer"
                  aria-label={videoPlaying ? 'Pause video' : 'Play video'}
                >
                  {videoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                {/* Video Overlays (Text & Stickers) */}
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
                        isSelected ? 'ring-2 ring-blue-400 rounded-xl p-1 shadow-[0_0_16px_rgba(59,130,246,0.45)]' : ''
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
                          className={`px-3 py-1.5 rounded-xl max-w-[260px] whitespace-pre-wrap break-words text-lg leading-snug ${
                            ov.font === 'display' ? 'uppercase tracking-wider' : ''
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

                {/* Live Video Info + Caption + WhatsApp Preview */}
                <div className="absolute bottom-3 inset-x-3 z-20 flex flex-col items-center gap-2 pointer-events-none">
                  {caption.trim() && (
                    <p className="bg-black/70 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-xl border border-white/10 text-center max-w-xs line-clamp-2">
                      {caption}
                    </p>
                  )}
                  {waEnabled && normalizedWhatsApp.valid && normalizedWhatsApp.cta && (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-500 text-black text-xs font-black shadow-lg">
                      <MessageCircle className="w-4 h-4 fill-current" />
                      <span>{normalizedWhatsApp.cta.label}</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* TEXT-ONLY STATUS STAGE */}
            {mediaType === 'text' && (
              <div
                className="relative h-[min(100%,72vh)] aspect-[9/16] max-w-full rounded-2xl overflow-hidden border border-white/15 p-6 flex flex-col items-center justify-center shadow-2xl"
                style={{ background: textStatusGradient }}
              >
                <textarea
                  value={textStatusContent}
                  onChange={(e) => setTextStatusContent(e.target.value)}
                  maxLength={700}
                  rows={5}
                  placeholder="Type your 24h Status update..."
                  className={`w-full bg-transparent text-center text-white placeholder:text-white/50 text-xl focus:outline-none resize-none ${
                    textStatusStyle === 'bold'
                      ? 'font-black uppercase'
                      : textStatusStyle === 'editorial'
                      ? 'font-serif italic font-semibold'
                      : textStatusStyle === 'mono'
                      ? 'font-mono font-bold'
                      : 'font-bold'
                  }`}
                />
                {waEnabled && normalizedWhatsApp.valid && normalizedWhatsApp.cta && (
                  <span className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-500 text-black text-xs font-black shadow-lg">
                    <MessageCircle className="w-4 h-4 fill-current" />
                    <span>{normalizedWhatsApp.cta.label}</span>
                  </span>
                )}
              </div>
            )}

            {/* Selected Overlay Quick Floating Controls */}
            {!previewOnly && selectedOverlay && (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-[#0b1222]/95 border border-slate-700 rounded-2xl px-2 py-1 flex items-center gap-1 shadow-2xl max-w-[95vw] overflow-x-auto [&::-webkit-scrollbar]:hidden"
              >
                {selectedOverlay.kind === 'text' && (
                  <button
                    type="button"
                    onClick={() => openEditTextComposer(selectedOverlay)}
                    className="px-2.5 py-1.5 rounded-xl bg-blue-500/20 border border-blue-400/50 hover:bg-blue-500/30 text-blue-200 text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    Edit Words
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => updateSelectedScale(-0.15)}
                  className="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black cursor-pointer"
                  aria-label="Shrink overlay"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => updateSelectedScale(0.15)}
                  className="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black cursor-pointer"
                  aria-label="Enlarge overlay"
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
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                  aria-label="Rotate overlay +15 degrees"
                  title="Rotate +15°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={duplicateSelectedOverlay}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                  aria-label="Duplicate overlay"
                  title="Duplicate"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedOverlay}
                  className="p-1.5 rounded-xl bg-red-950/80 hover:bg-red-900 text-red-300 cursor-pointer"
                  aria-label="Delete overlay"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* TOOL CONTEXT PANEL + BOTTOM TOOL DOCK */}
          {!previewOnly && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#080d1a] border-t border-slate-800/80 shrink-0 z-40"
            >
              {/* COMPLETE LIVE TEXT TOOLBAR (Color, BG, Fonts, Bold/Italic, Effect, Rotation, Position & Layer Controls) */}
              {activeTool === 'text' && mediaType !== 'text' && (
                <div className="p-2.5 sm:p-3 border-b border-slate-800 space-y-2.5 max-h-[38vh] overflow-y-auto">
                  {/* Top Bar: Add Text + Existing Layer Selector Chips */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden min-w-0">
                      <button
                        type="button"
                        onClick={openNewTextComposer}
                        className="px-2.5 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-[11px] font-black flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> New Text
                      </button>

                      {activeOverlays.map((item, idx) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedOverlayId(item.id)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold truncate max-w-[100px] shrink-0 border cursor-pointer ${
                            selectedOverlayId === item.id
                              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                          }`}
                        >
                          L{idx + 1}: {item.content}
                        </button>
                      ))}
                    </div>

                    {selectedOverlay?.kind === 'text' && (
                      <button
                        type="button"
                        onClick={() => openEditTextComposer(selectedOverlay)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                      >
                        Edit Text
                      </button>
                    )}
                  </div>

                  {selectedOverlay?.kind === 'text' ? (
                    <>
                      {/* Text Color Palette + Custom Color Picker */}
                      <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden py-0.5">
                        <span className="text-[10px] font-black uppercase text-slate-400 shrink-0 w-10">Color</span>
                        {COLOR_SWATCHES.map((c) => {
                          const active = (selectedOverlay.color || '#ffffff').toLowerCase() === c.toLowerCase();
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => updateSelectedOverlay({ color: c })}
                              aria-label={`Set text color ${c}`}
                              className={`w-7 h-7 rounded-full border-2 shrink-0 cursor-pointer transition ${
                                active ? 'border-blue-400 scale-110 ring-2 ring-blue-400/40' : 'border-white/30'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          );
                        })}
                        <label
                          className="min-h-[28px] px-2 rounded-lg bg-slate-800 border border-slate-600 text-[10px] font-bold text-slate-200 flex items-center gap-1.5 shrink-0 cursor-pointer"
                          title="Pick custom text color"
                        >
                          <input
                            type="color"
                            aria-label="Custom text color"
                            value={selectedOverlay.color || '#ffffff'}
                            onChange={(e) => updateSelectedOverlay({ color: e.target.value })}
                            className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer"
                          />
                          <span>Custom</span>
                        </label>
                      </div>

                      {/* Text Background Color + Custom BG Picker */}
                      <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden py-0.5">
                        <span className="text-[10px] font-black uppercase text-slate-400 shrink-0 w-10">BG</span>
                        <button
                          type="button"
                          onClick={() => updateSelectedOverlay({ bgMode: 'none', bgColor: undefined })}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 cursor-pointer ${
                            !selectedOverlay.bgMode || selectedOverlay.bgMode === 'none'
                              ? 'bg-blue-500 text-white'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          None
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedOverlay({ bgMode: 'dark', bgColor: undefined })}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 cursor-pointer ${
                            selectedOverlay.bgMode === 'dark'
                              ? 'bg-blue-500 text-white'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          Dark
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedOverlay({ bgMode: 'accent', bgColor: undefined })}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 cursor-pointer ${
                            selectedOverlay.bgMode === 'accent'
                              ? 'bg-blue-500 text-white'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          Sky
                        </button>
                        {TEXT_BG_QUICK_SWATCHES.map((bg) => (
                          <button
                            key={bg}
                            type="button"
                            onClick={() => updateSelectedOverlay({ bgMode: 'custom', bgColor: bg })}
                            aria-label={`Set text background ${bg}`}
                            className={`w-6 h-6 rounded-md border shrink-0 cursor-pointer ${
                              selectedOverlay.bgMode === 'custom' && selectedOverlay.bgColor === bg
                                ? 'border-blue-400 scale-110'
                                : 'border-white/30'
                            }`}
                            style={{ backgroundColor: bg }}
                          />
                        ))}
                        <label
                          className="min-h-[26px] px-2 rounded-lg bg-slate-800 border border-slate-600 text-[10px] font-bold text-slate-200 flex items-center gap-1 shrink-0 cursor-pointer"
                          title="Custom background color"
                        >
                          <input
                            type="color"
                            aria-label="Custom background color"
                            value={selectedOverlay.bgColor || '#060a14'}
                            onChange={(e) =>
                              updateSelectedOverlay({ bgMode: 'custom', bgColor: e.target.value })
                            }
                            className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer"
                          />
                          <span>BG</span>
                        </label>
                      </div>

                      {/* Fonts + Bold / Italic + Align + Shadow/Outline */}
                      <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                        {EDITOR_FONTS.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => updateSelectedOverlay({ font: f.id })}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer ${
                              (selectedOverlay.font || 'sans') === f.id
                                ? 'bg-blue-500 text-white'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                        <span className="h-5 w-px bg-slate-700 shrink-0 mx-0.5" />
                        <button
                          type="button"
                          onClick={() => {
                            const curBold =
                              typeof selectedOverlay.bold === 'boolean'
                                ? selectedOverlay.bold
                                : (selectedOverlay.font || 'sans') === 'sans' || selectedOverlay.font === 'display';
                            updateSelectedOverlay({ bold: !curBold });
                          }}
                          aria-label="Toggle Bold"
                          className={`p-1.5 rounded-lg cursor-pointer shrink-0 ${
                            (typeof selectedOverlay.bold === 'boolean'
                              ? selectedOverlay.bold
                              : (selectedOverlay.font || 'sans') === 'sans' || selectedOverlay.font === 'display')
                              ? 'bg-blue-500 text-white'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          <Bold className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const curItalic =
                              typeof selectedOverlay.italic === 'boolean'
                                ? selectedOverlay.italic
                                : selectedOverlay.font === 'serif';
                            updateSelectedOverlay({ italic: !curItalic });
                          }}
                          aria-label="Toggle Italic"
                          className={`p-1.5 rounded-lg cursor-pointer shrink-0 ${
                            (typeof selectedOverlay.italic === 'boolean'
                              ? selectedOverlay.italic
                              : selectedOverlay.font === 'serif')
                              ? 'bg-blue-500 text-white'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          <Italic className="w-3.5 h-3.5" />
                        </button>
                        {(['left', 'center', 'right'] as const).map((al) => (
                          <button
                            key={al}
                            type="button"
                            onClick={() => updateSelectedOverlay({ align: al })}
                            aria-label={`Align ${al}`}
                            className={`p-1.5 rounded-lg cursor-pointer shrink-0 ${
                              (selectedOverlay.align || 'center') === al
                                ? 'bg-blue-500 text-white'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {al === 'left' ? (
                              <AlignLeft className="w-3.5 h-3.5" />
                            ) : al === 'right' ? (
                              <AlignRight className="w-3.5 h-3.5" />
                            ) : (
                              <AlignCenter className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ))}
                        {(['none', 'shadow', 'outline'] as StatusOverlayTextEffect[]).map((ef) => (
                          <button
                            key={ef}
                            type="button"
                            onClick={() => updateSelectedOverlay({ effect: ef })}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold capitalize shrink-0 cursor-pointer ${
                              (selectedOverlay.effect ||
                                (selectedOverlay.bgMode && selectedOverlay.bgMode !== 'none' ? 'none' : 'shadow')) === ef
                                ? 'bg-amber-500 text-black'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {ef}
                          </button>
                        ))}
                      </div>

                      {/* Size & Rotation Sliders */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="flex items-center gap-2 text-[10px] font-bold text-slate-300">
                          <span className="w-9">Size</span>
                          <input
                            type="range"
                            min={50}
                            max={280}
                            value={Math.round((selectedOverlay.scale || 1) * 100)}
                            onChange={(e) =>
                              updateSelectedOverlay({ scale: clampOverlayScale(Number(e.target.value) / 100) })
                            }
                            className="flex-1 accent-blue-400 cursor-pointer"
                          />
                          <span className="w-9 text-right font-mono">
                            {Math.round((selectedOverlay.scale || 1) * 100)}%
                          </span>
                        </label>

                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300">
                          <span className="w-10">Rotate</span>
                          <input
                            type="range"
                            min={-180}
                            max={180}
                            value={selectedOverlay.rotation || 0}
                            onChange={(e) =>
                              updateSelectedOverlay({ rotation: normalizeOverlayRotation(Number(e.target.value)) })
                            }
                            className="flex-1 accent-cyan-400 cursor-pointer"
                          />
                          <span className="w-9 text-right font-mono">{selectedOverlay.rotation || 0}°</span>
                          <button
                            type="button"
                            onClick={() => updateSelectedOverlay({ rotation: 0 })}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                            title="Reset rotation"
                            aria-label="Reset rotation"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Position Nudge Controls + Layer Ordering (Back / Backward / Forward / Front / Duplicate / Delete) */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold text-slate-400 mr-1 flex items-center gap-0.5">
                            <Crosshair className="w-3 h-3" /> Pos
                          </span>
                          <button
                            type="button"
                            onClick={() => nudgeSelectedOverlay(-0.04, 0)}
                            aria-label="Move text left"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => nudgeSelectedOverlay(0, -0.04)}
                            aria-label="Move text up"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => nudgeSelectedOverlay(0, 0.04)}
                            aria-label="Move text down"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => nudgeSelectedOverlay(0.04, 0)}
                            aria-label="Move text right"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSelectedOverlay({ x: 0.5, y: 0.5 })}
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-200 cursor-pointer"
                          >
                            Center
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold text-slate-400 mr-0.5 flex items-center gap-0.5">
                            <Layers className="w-3 h-3" /> {selectedOverlayIndex + 1}/{activeOverlays.length}
                          </span>
                          <button
                            type="button"
                            disabled={selectedOverlayIndex <= 0}
                            onClick={() => handleLayerAction('back')}
                            title="Send to Back"
                            aria-label="Send to Back"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-200 cursor-pointer"
                          >
                            <ArrowDownToLine className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={selectedOverlayIndex <= 0}
                            onClick={() => handleLayerAction('backward')}
                            title="Send Backward"
                            aria-label="Send Backward"
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-[10px] font-bold text-slate-200 cursor-pointer"
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            disabled={selectedOverlayIndex < 0 || selectedOverlayIndex >= activeOverlays.length - 1}
                            onClick={() => handleLayerAction('forward')}
                            title="Bring Forward"
                            aria-label="Bring Forward"
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-[10px] font-bold text-slate-200 cursor-pointer"
                          >
                            Fwd
                          </button>
                          <button
                            type="button"
                            disabled={selectedOverlayIndex < 0 || selectedOverlayIndex >= activeOverlays.length - 1}
                            onClick={() => handleLayerAction('front')}
                            title="Bring to Front"
                            aria-label="Bring to Front"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-200 cursor-pointer"
                          >
                            <ArrowUpToLine className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={duplicateSelectedOverlay}
                            title="Duplicate Text"
                            aria-label="Duplicate Text"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={deleteSelectedOverlay}
                            title="Delete Selected Text"
                            aria-label="Delete Selected Text"
                            className="p-1.5 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-300 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      Tap <span className="text-blue-300 font-bold">+ New Text</span> or tap any text on the canvas to change its color, size, rotation, position, and layer order.
                    </p>
                  )}
                </div>
              )}
              {/* CONTEXT DRAWER */}
              {activeTool === 'crop' && mediaType === 'image' && (
                <div className="p-3 border-b border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                    <div className="flex items-center gap-1.5">
                      {ASPECT_PRESETS.map((ap) => (
                        <button
                          key={ap.id}
                          type="button"
                          onClick={() =>
                            commitPhotoState({ ...currentPhotoState, aspect: ap.id, panX: 0, panY: 0 })
                          }
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap ${
                            currentPhotoState.aspect === ap.id
                              ? 'bg-blue-500 text-white'
                              : 'bg-slate-800 text-slate-300 hover:text-white'
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
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" /> Rotate 90°
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-slate-300 whitespace-nowrap">
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
                      className="flex-1 accent-blue-400 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        commitPhotoState({
                          ...currentPhotoState,
                          aspect: 'original',
                          rotation: 0,
                          zoom: 1,
                          panX: 0,
                          panY: 0,
                        })
                      }
                      className="text-[11px] font-bold text-blue-400 hover:text-blue-300 cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}

              {activeTool === 'draw' && mediaType === 'image' && (
                <div className="p-3 border-b border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {COLOR_SWATCHES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setBrushColor(c)}
                          className={`w-7 h-7 rounded-full border-2 cursor-pointer transition ${
                            brushColor === c ? 'border-blue-400 scale-110' : 'border-white/25'
                          }`}
                          style={{ backgroundColor: c }}
                          aria-label={`Brush color ${c}`}
                        />
                      ))}
                    </div>
                    {currentPhotoState.strokes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => commitPhotoState({ ...currentPhotoState, strokes: [] })}
                        className="text-xs font-bold text-red-400 hover:text-red-300 cursor-pointer whitespace-nowrap"
                      >
                        Clear Drawing
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-300">Thickness</span>
                    {BRUSH_WIDTHS.map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setBrushWidth(w)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer ${
                          brushWidth === w
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {w}px
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeTool === 'bg' && mediaType === 'image' && (
                <div className="p-3 border-b border-slate-800 flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  <span className="text-[11px] font-bold text-slate-300 shrink-0">Canvas BG</span>
                  {BG_SWATCHES.map((bg) => (
                    <button
                      key={bg.color}
                      type="button"
                      onClick={() => commitPhotoState({ ...currentPhotoState, bgColor: bg.color })}
                      className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 shrink-0 cursor-pointer ${
                        currentPhotoState.bgColor === bg.color
                          ? 'border-blue-400 text-white bg-slate-800'
                          : 'border-slate-700 text-slate-300 bg-[#0c1324]'
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
              )}

              {activeTool === 'sticker' && (
                <div className="p-3 border-b border-slate-800">
                  <div className="grid grid-cols-8 gap-1.5">
                    {STICKER_PALETTE.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => addStickerOverlay(emoji)}
                        className="min-h-[42px] rounded-xl bg-[#0c1426] hover:bg-slate-800 text-2xl flex items-center justify-center cursor-pointer active:scale-90 transition"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeTool === 'trim' && mediaType === 'video' && (
                <div className="p-3 border-b border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white tabular-nums">
                      Clip: {formatSec(trimStartSec)} – {formatSec(trimEndSec)} ({formatSec(trimmedDurationSec)} / 60s max)
                    </span>
                    <button
                      type="button"
                      onClick={() => setVideoMuted((m) => !m)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                        videoMuted
                          ? 'bg-rose-500/20 border border-rose-400/50 text-rose-200'
                          : 'bg-slate-800 text-slate-200'
                      }`}
                    >
                      {videoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      {videoMuted ? 'Muted' : 'Sound On'}
                    </button>
                  </div>

                  {/* Interactive Timeline Start / End Handles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="flex items-center gap-2 text-[11px] text-slate-300">
                      <span className="w-10 font-bold">Start</span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, Math.floor((rawVideoDuration || 10) - 1))}
                        step={0.5}
                        value={trimStartSec}
                        onChange={(e) => handleTrimStartChange(Number(e.target.value))}
                        className="flex-1 accent-blue-400 cursor-pointer"
                      />
                      <span className="w-10 text-right font-mono">{formatSec(trimStartSec)}</span>
                    </label>

                    <label className="flex items-center gap-2 text-[11px] text-slate-300">
                      <span className="w-10 font-bold">End</span>
                      <input
                        type="range"
                        min={Math.min(rawVideoDuration || 10, trimStartSec + 1)}
                        max={Math.min(rawVideoDuration || MAX_STATUS_VIDEO_SECONDS, trimStartSec + MAX_STATUS_VIDEO_SECONDS)}
                        step={0.5}
                        value={trimEndSec}
                        onChange={(e) => handleTrimEndChange(Number(e.target.value))}
                        className="flex-1 accent-amber-400 cursor-pointer"
                      />
                      <span className="w-10 text-right font-mono">{formatSec(trimEndSec)}</span>
                    </label>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-400 transition-all duration-100"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(
                            100,
                            ((videoCurrentSec - trimStartSec) / Math.max(0.5, trimEndSec - trimStartSec)) * 100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {activeTool === 'music' && (
                <div className="p-3 border-b border-slate-800 space-y-2.5">
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setAudioMode('original');
                        stopAudioPreview();
                      }}
                      className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                        audioMode === 'original'
                          ? 'bg-blue-500/20 border-blue-400 text-white'
                          : 'bg-[#060a14] border-slate-800 text-slate-400'
                      }`}
                    >
                      {mediaType === 'video' ? 'Original Sound' : 'No Music'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudioMode('royalty_free')}
                      className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                        audioMode === 'royalty_free'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-[#060a14] border-slate-800 text-slate-400'
                      }`}
                    >
                      KING Beats (Free)
                    </button>
                    <button
                      type="button"
                      onClick={() => customAudioInputRef.current?.click()}
                      className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                        audioMode === 'custom_audio'
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                          : 'bg-[#060a14] border-slate-800 text-slate-400'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5 inline mr-1" /> Upload Audio
                    </button>
                  </div>

                  {audioMode === 'royalty_free' && (
                    <div className="grid grid-cols-2 gap-1.5">
                      {KING_ROYALTY_FREE_TRACKS.map((track) => {
                        const isSel = selectedPresetId === track.id;
                        const isPlay = previewPlayingTrackId === track.id;
                        return (
                          <div
                            key={track.id}
                            onClick={() => setSelectedPresetId(track.id)}
                            className={`p-2 rounded-xl border flex items-center justify-between gap-2 cursor-pointer ${
                              isSel
                                ? 'bg-amber-500/15 border-amber-400/60 text-white'
                                : 'bg-[#060a14] border-slate-800 text-slate-300'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold truncate">{track.title}</div>
                              <div className="text-[9.5px] text-slate-400">{track.mood}</div>
                            </div>
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setSelectedPresetId(track.id);
                                togglePresetPreview(track.id);
                              }}
                              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 flex items-center justify-center shrink-0 cursor-pointer"
                            >
                              {isPlay ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {audioMode === 'custom_audio' && (
                    <div className="flex items-center justify-between p-2 rounded-xl bg-[#060a14] border border-emerald-500/30 text-xs">
                      <span className="truncate text-emerald-300 font-semibold">
                        {customAudioFile ? customAudioFile.name : 'No audio selected'}
                      </span>
                      <button
                        type="button"
                        onClick={() => customAudioInputRef.current?.click()}
                        className="text-blue-400 font-bold ml-2 shrink-0 cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeTool === 'whatsapp' && (
                <div className="p-3 border-b border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-white">Add WhatsApp Button</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWaEnabled((v) => !v)}
                      className={`px-3 py-1 rounded-full text-[11px] font-black cursor-pointer transition ${
                        waEnabled ? 'bg-emerald-500 text-black' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {waEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={waPhoneOrLink}
                      onChange={(e) => {
                        setWaPhoneOrLink(e.target.value);
                        if (!waEnabled && e.target.value.trim()) setWaEnabled(true);
                      }}
                      placeholder="Phone (+923001234567) or wa.me link"
                      className="w-full bg-[#060a14] border border-slate-700 focus:border-emerald-400 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                    <input
                      type="text"
                      maxLength={40}
                      value={waButtonLabel}
                      onChange={(e) => setWaButtonLabel(e.target.value)}
                      placeholder="Button text (e.g. Chat on WhatsApp)"
                      className="w-full bg-[#060a14] border border-slate-700 focus:border-emerald-400 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>

                  {waEnabled && !normalizedWhatsApp.valid && (
                    <p className="text-[11px] text-rose-400 font-semibold">{normalizedWhatsApp.error}</p>
                  )}

                  {waEnabled && normalizedWhatsApp.valid && normalizedWhatsApp.cta && (
                    <div className="flex items-center justify-between gap-2 bg-[#060a14] border border-emerald-500/30 rounded-xl px-3 py-2">
                      <span className="text-[11px] text-slate-400 truncate">
                        Preview: {normalizedWhatsApp.cta.url}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500 text-black text-[11px] font-black shrink-0">
                        <MessageCircle className="w-3.5 h-3.5 fill-current" />
                        {normalizedWhatsApp.cta.label}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {activeTool === 'caption' && (
                <div className="p-3 border-b border-slate-800">
                  <input
                    type="text"
                    maxLength={300}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Add a caption..."
                    className="w-full bg-[#060a14] border border-slate-700 focus:border-blue-400 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
                  />
                </div>
              )}

              {mediaType === 'text' && (
                <div className="p-2.5 border-b border-slate-800 flex items-center justify-between gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  <div className="flex items-center gap-2">
                    {STATUS_BG_GRADIENTS.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setTextStatusGradient(g.css)}
                        className={`w-7 h-7 rounded-full border-2 cursor-pointer shrink-0 ${
                          textStatusGradient === g.css ? 'border-white scale-110' : 'border-white/25'
                        }`}
                        style={{ background: g.css }}
                        aria-label={g.label}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(['classic', 'bold', 'editorial', 'mono'] as StatusTextStyle[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setTextStatusStyle(st)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold capitalize cursor-pointer ${
                          textStatusStyle === st ? 'bg-purple-500 text-white' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* HORIZONTAL TOOL BAR */}
              <div className="flex items-center justify-around sm:justify-center gap-1.5 px-2 py-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                {mediaType === 'image' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveTool((t) => (t === 'crop' ? 'none' : 'crop'))}
                      className={`min-h-[44px] px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer shrink-0 ${
                        activeTool === 'crop' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <Crop className="w-4 h-4" />
                      <span>Crop</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedOverlay?.kind === 'text') {
                          setActiveTool((t) => (t === 'text' ? 'none' : 'text'));
                        } else if (activeOverlays.some((o) => o.kind === 'text') && activeTool !== 'text') {
                          const lastTxt = [...activeOverlays].reverse().find((o) => o.kind === 'text');
                          if (lastTxt) setSelectedOverlayId(lastTxt.id);
                          setActiveTool('text');
                        } else {
                          openNewTextComposer();
                        }
                      }}
                      className={`min-h-[44px] px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer shrink-0 ${
                        activeTool === 'text' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <Type className="w-4 h-4" />
                      <span>Text</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTool((t) => (t === 'sticker' ? 'none' : 'sticker'))}
                      className={`min-h-[44px] px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer shrink-0 ${
                        activeTool === 'sticker' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <Smile className="w-4 h-4" />
                      <span>Stickers</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTool((t) => (t === 'draw' ? 'none' : 'draw'))}
                      className={`min-h-[44px] px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer shrink-0 ${
                        activeTool === 'draw' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Draw</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTool((t) => (t === 'bg' ? 'none' : 'bg'))}
                      className={`min-h-[44px] px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer shrink-0 ${
                        activeTool === 'bg' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <Palette className="w-4 h-4" />
                      <span>BG Color</span>
                    </button>
                  </>
                )}

                {mediaType === 'video' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveTool((t) => (t === 'trim' ? 'none' : 'trim'))}
                      className={`min-h-[44px] px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer shrink-0 ${
                        activeTool === 'trim' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <Crop className="w-4 h-4" />
                      <span>Trim / Mute</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedOverlay?.kind === 'text') {
                          setActiveTool((t) => (t === 'text' ? 'none' : 'text'));
                        } else if (activeOverlays.some((o) => o.kind === 'text') && activeTool !== 'text') {
                          const lastTxt = [...activeOverlays].reverse().find((o) => o.kind === 'text');
                          if (lastTxt) setSelectedOverlayId(lastTxt.id);
                          setActiveTool('text');
                        } else {
                          openNewTextComposer();
                        }
                      }}
                      className={`min-h-[44px] px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer shrink-0 ${
                        activeTool === 'text' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <Type className="w-4 h-4" />
                      <span>Text</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTool((t) => (t === 'sticker' ? 'none' : 'sticker'))}
                      className={`min-h-[44px] px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer shrink-0 ${
                        activeTool === 'sticker' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <Smile className="w-4 h-4" />
                      <span>Stickers</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTool((t) => (t === 'music' ? 'none' : 'music'))}
                      className={`min-h-[44px] px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer shrink-0 ${
                        activeTool === 'music' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <Music className="w-4 h-4" />
                      <span>Music</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setActiveTool((t) => (t === 'whatsapp' ? 'none' : 'whatsapp'))}
                  className={`min-h-[44px] px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer shrink-0 ${
                    activeTool === 'whatsapp'
                      ? 'bg-emerald-500 text-black'
                      : waEnabled && normalizedWhatsApp.cta
                      ? 'text-emerald-400 bg-emerald-500/15'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>WhatsApp</span>
                </button>

                {mediaType !== 'text' && (
                  <button
                    type="button"
                    onClick={() => setActiveTool((t) => (t === 'caption' ? 'none' : 'caption'))}
                    className={`min-h-[44px] px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer shrink-0 ${
                      activeTool === 'caption' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Type className="w-4 h-4" />
                    <span>Caption</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TEXT OVERLAY COMPOSER MODAL (Confirm uses "Apply" so top-right "DONE" remains strictly unique) */}
          {showTextComposer && (
            <div className="fixed inset-0 z-[160] bg-black/88 backdrop-blur-md flex flex-col justify-between p-4">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowTextComposer(false)}
                  className="min-h-[44px] px-4 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold cursor-pointer shrink-0"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={() => setTextDraftBold((b) => !b)}
                    aria-label="Draft bold"
                    className={`min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center cursor-pointer ${
                      textDraftBold ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <Bold className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextDraftItalic((v) => !v)}
                    aria-label="Draft italic"
                    className={`min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center cursor-pointer ${
                      textDraftItalic ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <Italic className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextDraftAlign('left')}
                    className={`min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center cursor-pointer ${
                      textDraftAlign === 'left' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <AlignLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextDraftAlign('center')}
                    className={`min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center cursor-pointer ${
                      textDraftAlign === 'center' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <AlignCenter className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextDraftAlign('right')}
                    className={`min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center cursor-pointer ${
                      textDraftAlign === 'right' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <AlignRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTextDraftBgMode((b) =>
                        b === 'none' ? 'dark' : b === 'dark' ? 'accent' : b === 'accent' ? 'custom' : 'none'
                      )
                    }
                    className="min-h-[38px] px-2.5 rounded-xl bg-slate-800 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    BG: {textDraftBgMode}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={saveTextOverlay}
                  className="min-h-[44px] px-4 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-black flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingTextOverlayId ? 'Apply' : 'Add'}</span>
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
                      bgColor: textDraftBgColor,
                      effect: textDraftEffect,
                    }),
                    transform: `rotate(${textDraftRotation}deg)`,
                  }}
                />
              </div>

              <div className="space-y-2.5 max-w-lg mx-auto w-full">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-300">Size</span>
                    <input
                      type="range"
                      min={50}
                      max={280}
                      value={Math.round(textDraftScale * 100)}
                      onChange={(e) => setTextDraftScale(clampOverlayScale(Number(e.target.value) / 100))}
                      className="flex-1 accent-blue-400 cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-300">Tilt</span>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={textDraftRotation}
                      onChange={(e) => setTextDraftRotation(normalizeOverlayRotation(Number(e.target.value)))}
                      className="flex-1 accent-cyan-400 cursor-pointer"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  {EDITOR_FONTS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setTextDraftFont(f.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
                        textDraftFont === f.id
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-800 text-slate-300'
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
                  <label className="min-h-[28px] px-2 rounded-lg bg-slate-800 border border-slate-600 text-[10px] font-bold text-slate-200 flex items-center gap-1 shrink-0 cursor-pointer">
                    <input
                      type="color"
                      value={textDraftColor}
                      onChange={(e) => setTextDraftColor(e.target.value)}
                      className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer"
                    />
                    <span>Color</span>
                  </label>
                  <label className="min-h-[28px] px-2 rounded-lg bg-slate-800 border border-slate-600 text-[10px] font-bold text-slate-200 flex items-center gap-1 shrink-0 cursor-pointer">
                    <input
                      type="color"
                      value={textDraftBgColor}
                      onChange={(e) => {
                        setTextDraftBgColor(e.target.value);
                        setTextDraftBgMode('custom');
                      }}
                      className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer"
                    />
                    <span>BG</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* STEP 2: FINAL STATUS PREVIEW & SEND SCREEN */
        <>
          <div className="flex items-center justify-between px-4 py-3 bg-[#080d1a] border-b border-slate-800 shrink-0">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setStep('edit')}
              className="min-h-[44px] px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Edit
            </button>
            <h2 className="text-sm font-black text-white">Final Status Preview</h2>
            <button
              type="button"
              disabled={submitting}
              onClick={requestDiscardClose}
              className="min-h-[44px] px-3 rounded-xl text-rose-300 hover:bg-rose-950/50 text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              Discard
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 max-w-2xl w-full mx-auto space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-2xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            {/* Final Status Preview Card + Caption */}
            <div className="grid grid-cols-1 sm:grid-cols-[176px_1fr] gap-4 bg-[#0b1222] border border-slate-800 rounded-2xl p-3.5">
              <div className="relative w-[164px] h-[258px] mx-auto sm:mx-0 rounded-2xl overflow-hidden bg-[#060a14] border border-slate-700 shrink-0 shadow-xl">
                {mediaType === 'image' && (
                  <img
                    src={bakedPhotoPreviewUrl || objectUrl}
                    alt="Final edited status preview"
                    className="w-full h-full object-contain"
                  />
                )}
                {mediaType === 'video' && objectUrl && (
                  <>
                    <video
                      ref={publishVideoPreviewRef}
                      src={objectUrl}
                      muted={previewVideoMuted}
                      playsInline
                      autoPlay
                      loop
                      className="w-full h-full object-contain bg-black"
                      onLoadedMetadata={(e) => {
                        if (trimStartSec > 0) e.currentTarget.currentTime = trimStartSec;
                      }}
                      onTimeUpdate={(e) => {
                        const v = e.currentTarget;
                        if (v.currentTime < trimStartSec || v.currentTime >= trimEndSec) {
                          v.currentTime = trimStartSec;
                        }
                      }}
                    />

                    {/* Render preserved video text & sticker overlays inside Final Preview */}
                    {currentVideoOverlays.map((ov, ovIdx) => (
                      <div
                        key={ov.id}
                        className="absolute pointer-events-none select-none"
                        style={{
                          left: `${ov.x * 100}%`,
                          top: `${ov.y * 100}%`,
                          zIndex: 10 + ovIdx,
                          transform: `translate(-50%, -50%) rotate(${ov.rotation || 0}deg) scale(${(ov.scale || 1) * 0.55})`,
                        }}
                      >
                        {ov.kind === 'sticker' ? (
                          <span className="text-4xl leading-none drop-shadow-lg">{ov.content}</span>
                        ) : (
                          <div
                            className={`px-2.5 py-1 rounded-lg max-w-[220px] whitespace-pre-wrap break-words text-base leading-snug ${
                              ov.font === 'display' ? 'uppercase tracking-wider' : ''
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
                    ))}

                    <button
                      type="button"
                      onClick={() => setPreviewVideoMuted((m) => !m)}
                      className="absolute top-2 right-2 z-20 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center border border-white/20 cursor-pointer"
                      aria-label={previewVideoMuted ? 'Unmute video preview' : 'Mute video preview'}
                    >
                      {previewVideoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                  </>
                )}
                {mediaType === 'text' && (
                  <div
                    className="w-full h-full p-3 flex items-center justify-center text-center text-white text-xs font-bold"
                    style={{ background: textStatusGradient }}
                  >
                    <span className="line-clamp-5">{textStatusContent}</span>
                  </div>
                )}

                {waEnabled && normalizedWhatsApp.valid && normalizedWhatsApp.cta && (
                  <div className="absolute bottom-2 inset-x-2 z-20 flex justify-center">
                    <span className="px-2.5 py-1 rounded-xl bg-emerald-500 text-black text-[10px] font-black flex items-center gap-1 truncate max-w-full shadow-lg">
                      <MessageCircle className="w-3 h-3 shrink-0 fill-current" />
                      <span className="truncate">{normalizedWhatsApp.cta.label}</span>
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-200">Status Caption</label>
                    <span className="text-[11px] text-slate-400 tabular-nums">{caption.length}/300</span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={300}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write a caption for your Status..."
                    className="w-full bg-[#060a14] border border-slate-700 focus:border-blue-400 rounded-xl px-3 py-2 text-xs text-white focus:outline-none resize-none"
                  />
                </div>

                {mediaType === 'video' && sourceFile && sourceFile.size > 15 * 1024 * 1024 && supportsClientVideoCompression() && (
                  <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#060a14] border border-slate-800 cursor-pointer">
                    <div>
                      <div className="text-xs font-bold text-white">
                        Compress large video ({(sourceFile.size / (1024 * 1024)).toFixed(1)} MB)
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Off by default to preserve original quality
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={videoCompressIfLarge}
                      onChange={(e) => setVideoCompressIfLarge(e.target.checked)}
                      className="w-4 h-4 accent-blue-400 shrink-0"
                    />
                  </label>
                )}

                <div className="text-[11px] text-slate-300 font-medium tabular-nums">
                  {mediaType === 'image' && (
                    <span>
                      Applied: {currentPhotoState.aspect === 'original' ? 'Original' : currentPhotoState.aspect}
                      {currentPhotoState.rotation ? ` · ${currentPhotoState.rotation}°` : ''}
                      {currentPhotoState.overlays.length > 0 ? ` · ${currentPhotoState.overlays.length} overlay(s)` : ''}
                      {currentPhotoState.strokes.length > 0 ? ` · ${currentPhotoState.strokes.length} drawing stroke(s)` : ''}
                    </span>
                  )}
                  {mediaType === 'video' && (
                    <span>
                      Clip: {formatSec(trimStartSec)}–{formatSec(trimEndSec)} ({Math.round(trimmedDurationSec)}s)
                      {' · '}
                      {audioMode === 'royalty_free'
                        ? 'KING Beats'
                        : audioMode === 'custom_audio'
                        ? customAudioFile?.name || 'Custom Audio'
                        : videoMuted
                        ? 'Muted'
                        : 'Original Sound'}
                      {currentVideoOverlays.length > 0 ? ` · ${currentVideoOverlays.length} overlay(s)` : ''}
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-400">
                  Expires automatically after 24 hours · Stored in <span className="text-slate-200 font-semibold">king_status/</span>
                </div>
              </div>
            </div>

            {/* Audience / Privacy Settings */}
            <div className="bg-[#0b1222] border border-slate-800 rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-blue-400" /> Who can view this Status
                </span>
                {activeAudienceCount > 0 && (
                  <span className="text-[11px] font-bold text-blue-400 tabular-nums">
                    {activeAudienceCount} selected
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(['public', 'friends', 'followers', 'selected', 'except', 'only_me'] as StatusPrivacyMode[]).map(
                  (mode) => {
                    const meta = getPrivacyDisplayMeta(mode);
                    const active = privacyMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPrivacyMode(mode)}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          active
                            ? 'bg-blue-500/20 border-blue-400 text-white'
                            : 'bg-[#060a14] border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 text-xs font-bold">
                          <span className="truncate">{meta.label}</span>
                          {active && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">{meta.sub}</div>
                      </button>
                    );
                  }
                )}
              </div>

              {(privacyMode === 'selected' || privacyMode === 'except') && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Search people (blocked users excluded)..."
                    className="w-full bg-[#060a14] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-400"
                  />
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {filteredUsers.map((u) => {
                      const list = privacyMode === 'selected' ? selectedUids : exceptUids;
                      const picked = list.includes(u.uid);
                      return (
                        <button
                          key={u.uid}
                          type="button"
                          onClick={() => toggleAudienceUid(u.uid)}
                          className={`w-full flex items-center justify-between p-2 rounded-xl border text-left text-xs cursor-pointer ${
                            picked
                              ? 'bg-blue-500/15 border-blue-500/50 text-white'
                              : 'bg-[#060a14] border-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <CreatorAvatar
                              uid={u.uid}
                              fallbackPhoto={u.photoURL}
                              fallbackName={u.displayName}
                              className="w-6 h-6 rounded-full shrink-0"
                            />
                            <span className="truncate font-semibold">{u.displayName}</span>
                          </div>
                          {picked && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* WhatsApp Button Settings */}
            <div className="bg-[#0b1222] border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-emerald-400" />
                  <div>
                    <div className="text-xs font-black text-white">WhatsApp Contact Button</div>
                    <div className="text-[10px] text-slate-400">
                      Let authorized viewers open your WhatsApp chat directly
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWaEnabled((v) => !v)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-black cursor-pointer transition ${
                    waEnabled ? 'bg-emerald-500 text-black' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {waEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              {waEnabled && (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={waPhoneOrLink}
                      onChange={(e) => setWaPhoneOrLink(e.target.value)}
                      placeholder="Phone (+923001234567) or wa.me link"
                      className="w-full bg-[#060a14] border border-slate-700 focus:border-emerald-400 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                    <input
                      type="text"
                      maxLength={40}
                      value={waButtonLabel}
                      onChange={(e) => setWaButtonLabel(e.target.value)}
                      placeholder="Custom button text"
                      className="w-full bg-[#060a14] border border-slate-700 focus:border-emerald-400 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                  {!normalizedWhatsApp.valid && (
                    <p className="text-[11px] text-rose-400 font-semibold">{normalizedWhatsApp.error}</p>
                  )}
                </div>
              )}
            </div>

            {submitting && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-blue-300">
                  <span>{progressLabel || 'Publishing...'}</span>
                  <span className="tabular-nums">{progressPct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-200"
                    style={{ width: `${Math.max(8, progressPct)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* PUBLISH FOOTER (Exact Screenshot Design: Retake & Publish to KING) */}
          <div className="p-3.5 bg-[#121212] border-t border-white/10 flex items-center gap-3 max-w-2xl w-full mx-auto shrink-0">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setShowCameraModal(true)}
              className="min-h-[48px] px-5 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50 transition border border-white/20"
            >
              <span>📷</span>
              <span>Retake</span>
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handlePublish}
              className="flex-1 min-h-[48px] rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-amber-500 hover:brightness-110 text-white text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer disabled:opacity-50 transition"
            >
              <Upload className="w-4 h-4" />
              <span>{submitting ? 'Publishing to KING...' : 'Publish to KING'}</span>
            </button>
          </div>
        </>
      )}

      {/* System Camera & Gallery Modal */}
      <SystemCameraGalleryModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onMediaCaptured={(file) => loadMediaFile(file)}
        onShowToast={onShowToast}
      />

      {/* DISCARD CONFIRMATION DIALOG (Prevents Accidental Loss of Edits) */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[170] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xs rounded-2xl bg-[#0b1222] border border-slate-700 p-4 space-y-3 shadow-2xl">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-white">Discard Status Edits?</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Your photo/video adjustments, overlays, music, and WhatsApp settings will be lost.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="flex-1 min-h-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
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
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(editorModalMarkup, document.body);
  }
  return editorModalMarkup;
}
