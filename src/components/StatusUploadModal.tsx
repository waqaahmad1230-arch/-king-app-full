import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Film,
  Image as ImageIcon,
  Lock,
  Music,
  Play,
  Square,
  Type,
  Upload,
  Video,
  X,
} from 'lucide-react';
import {
  DEFAULT_STATUS_PRIVACY,
  fetchDiscoverableUsers,
  MAX_PRIVACY_UID_LIST,
  resolveSocialErrorMessage,
  subscribeMyBlockedUsers,
  subscribeStatusPrivacy,
} from '../services/socialGraphService';
import {
  createStatusPost,
  STATUS_BG_GRADIENTS,
} from '../services/statusService';
import {
  SocialUserProfile,
  STATUS_PRIVACY_OPTIONS,
  StatusAudioTrack,
  StatusMediaType,
  StatusPrivacyMode,
  StatusPrivacySettings,
  StatusRecord,
  StatusTextStyle,
} from '../types/social';
import {
  KING_ROYALTY_FREE_TRACKS,
  StatusRoyaltyFreePlayer,
} from '../utils/statusAudioEngine';
import {
  compressStatusImage,
  compressStatusVideo,
  generateStatusVideoPosterDataUrl,
  MAX_STATUS_AUDIO_BYTES,
  MAX_STATUS_VIDEO_SECONDS,
  readMediaDurationSeconds,
  supportsClientVideoCompression,
  uploadStatusMediaToCloudinary,
  validateStatusVideoDuration,
} from '../utils/statusMediaUtils';
import CreatorAvatar from './CreatorAvatar';

interface StatusUploadModalProps {
  isOpen: boolean;
  currentUid: string | null;
  authorName: string;
  authorPhoto: string;
  onClose: () => void;
  onCreated: (status: StatusRecord) => void;
  onShowToast: (msg: string) => void;
}

const TEXT_STYLES: { id: StatusTextStyle; label: string; className: string }[] = [
  { id: 'classic', label: 'Classic', className: 'font-bold tracking-normal' },
  { id: 'bold', label: 'Impact', className: 'font-black uppercase tracking-wide' },
  { id: 'editorial', label: 'Editorial', className: 'font-serif italic font-semibold' },
  { id: 'mono', label: 'Code', className: 'font-mono font-bold tracking-tight' },
];

export default function StatusUploadModal({
  isOpen,
  currentUid,
  authorName,
  authorPhoto,
  onClose,
  onCreated,
  onShowToast,
}: StatusUploadModalProps) {
  const [statusType, setStatusType] = useState<StatusMediaType>('image');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [videoPosterDataUrl, setVideoPosterDataUrl] = useState<string>('');
  const [videoDurationSec, setVideoDurationSec] = useState<number>(6);
  const [compressEnabled, setCompressEnabled] = useState<boolean>(true);
  const [caption, setCaption] = useState<string>('');

  // Text status states
  const [textContent, setTextContent] = useState<string>('');
  const [bgGradient, setBgGradient] = useState<string>(STATUS_BG_GRADIENTS[0].css);
  const [textStyle, setTextStyle] = useState<StatusTextStyle>('classic');

  // Audio states
  const [audioMode, setAudioMode] = useState<'original' | 'royalty_free' | 'custom_audio'>('original');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(KING_ROYALTY_FREE_TRACKS[0].id);
  const [customAudioFile, setCustomAudioFile] = useState<File | null>(null);
  const [previewPlayingTrackId, setPreviewPlayingTrackId] = useState<string | null>(null);
  const royaltyPlayerRef = useRef<StatusRoyaltyFreePlayer | null>(null);

  // Privacy states
  const [privacyMode, setPrivacyMode] = useState<StatusPrivacyMode>('friends');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [exceptUids, setExceptUids] = useState<string[]>([]);
  const [blockedUids, setBlockedUids] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<SocialUserProfile[]>([]);
  const [pickerSearch, setPickerSearch] = useState<string>('');

  // Upload progress / error state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [progressPct, setProgressPct] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const photoGalleryRef = useRef<HTMLInputElement>(null);
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const videoGalleryRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);
  const customAudioRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !currentUid) return;

    let privacyInitialized = false;
    const unsubPrivacy = subscribeStatusPrivacy(currentUid, (settings: StatusPrivacySettings) => {
      if (!privacyInitialized) {
        setPrivacyMode(settings.visibility || DEFAULT_STATUS_PRIVACY.visibility);
        setSelectedUids(settings.selectedUids || []);
        setExceptUids(settings.exceptUids || []);
        privacyInitialized = true;
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

  // Clean up object URL and preview audio on unmount / close
  useEffect(() => {
    if (!isOpen) {
      royaltyPlayerRef.current?.stop();
      setPreviewPlayingTrackId(null);
      setErrorMsg(null);
      setProgressLabel('');
      setProgressPct(0);
    }
    return () => {
      royaltyPlayerRef.current?.stop();
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const blockedSet = useMemo(() => new Set(blockedUids), [blockedUids]);
  const filteredUsers = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return availableUsers.filter((u) => {
      if (blockedSet.has(u.uid)) return false;
      if (!q) return true;
      return u.displayName.toLowerCase().includes(q) || u.uid.toLowerCase().includes(q);
    });
  }, [availableUsers, blockedSet, pickerSearch]);

  if (!isOpen) return null;

  const stopPreviewAudio = () => {
    royaltyPlayerRef.current?.stop();
    setPreviewPlayingTrackId(null);
  };

  const togglePreviewTrack = (trackId: string) => {
    if (!royaltyPlayerRef.current) {
      royaltyPlayerRef.current = new StatusRoyaltyFreePlayer();
    }
    if (previewPlayingTrackId === trackId) {
      stopPreviewAudio();
    } else {
      royaltyPlayerRef.current.start(trackId, 0.7, false);
      setPreviewPlayingTrackId(trackId);
    }
  };

  const resetSelectedMedia = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl('');
    setVideoPosterDataUrl('');
    setVideoDurationSec(6);
    setErrorMsg(null);
  };

  const handleImagePick = (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setStatusType('image');
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setVideoDurationSec(6);
  };

  const handleVideoPick = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    if (!file.type.startsWith('video/')) {
      setErrorMsg('Please select a valid video file.');
      return;
    }

    try {
      const duration = await readMediaDurationSeconds(file, 'video');
      const check = validateStatusVideoDuration(duration);
      if (!check.valid) {
        setErrorMsg(check.error || `Video exceeds ${MAX_STATUS_VIDEO_SECONDS}s limit.`);
        return;
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const nextPreviewUrl = URL.createObjectURL(file);
      setStatusType('video');
      setSelectedFile(file);
      setPreviewUrl(nextPreviewUrl);
      setVideoDurationSec(Math.max(1, Math.min(MAX_STATUS_VIDEO_SECONDS, Math.ceil(duration))));

      const poster = await generateStatusVideoPosterDataUrl(file);
      setVideoPosterDataUrl(poster);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to read selected video.');
    }
  };

  const handleCustomAudioPick = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    if (!file.type.startsWith('audio/')) {
      setErrorMsg('Please choose a valid audio file (MP3, M4A, WAV, OGG).');
      return;
    }
    if (file.size > MAX_STATUS_AUDIO_BYTES) {
      setErrorMsg('Custom audio cannot exceed 15 MB.');
      return;
    }
    try {
      const duration = await readMediaDurationSeconds(file, 'audio');
      if (duration > MAX_STATUS_VIDEO_SECONDS * 2) {
        setErrorMsg('Please keep custom audio under 120 seconds.');
        return;
      }
      setCustomAudioFile(file);
      setAudioMode('custom_audio');
      stopPreviewAudio();
    } catch {
      setErrorMsg('Could not read audio file metadata.');
    }
  };

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

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUid) {
      setErrorMsg('Please sign in first to post a Status.');
      return;
    }
    setErrorMsg(null);
    stopPreviewAudio();

    if (statusType === 'text' && !textContent.trim()) {
      setErrorMsg('Please write your Text Status message.');
      return;
    }
    if ((statusType === 'image' || statusType === 'video') && !selectedFile) {
      setErrorMsg(`Please pick or capture a ${statusType === 'image' ? 'photo' : 'video'} first.`);
      return;
    }
    if (audioMode === 'custom_audio' && !customAudioFile) {
      setErrorMsg('Please choose an audio file or switch to Original / Royalty-Free.');
      return;
    }

    setSubmitting(true);
    try {
      let mediaUrl = '';
      let thumbnailUrl = '';
      let cloudinaryPublicId = '';
      let cloudinaryResourceType: 'image' | 'video' | 'raw' | '' = '';
      let cloudinaryDeliveryType: 'upload' | 'authenticated' | 'none' = 'none';

      // 1. Optional Client Compression + Cloudinary Upload (`king_status/` folder)
      if ((statusType === 'image' || statusType === 'video') && selectedFile) {
        let uploadFile = selectedFile;
        if (compressEnabled) {
          if (statusType === 'image') {
            setProgressLabel('Optimizing photo...');
            setProgressPct(15);
            uploadFile = await compressStatusImage(selectedFile);
          } else if (statusType === 'video' && supportsClientVideoCompression()) {
            setProgressLabel('Compressing video...');
            uploadFile = await compressStatusVideo(selectedFile, (pct, lbl) => {
              setProgressPct(Math.round(pct * 0.45));
              setProgressLabel(lbl);
            });
          }
        }

        const uploaded = await uploadStatusMediaToCloudinary(
          uploadFile,
          statusType,
          privacyMode,
          (pct, lbl) => {
            setProgressPct(compressEnabled && statusType === 'video' ? 45 + Math.round(pct * 0.45) : pct);
            setProgressLabel(lbl);
          }
        );

        mediaUrl = uploaded.secureUrl;
        thumbnailUrl = uploaded.thumbnailUrl || videoPosterDataUrl;
        cloudinaryPublicId = uploaded.publicId;
        cloudinaryResourceType = uploaded.resourceType;
        cloudinaryDeliveryType = uploaded.deliveryType;
      }

      // 2. Audio Track Upload / Config
      let audioTrack: StatusAudioTrack = {
        mode: 'original',
        label: statusType === 'video' ? 'Original Video Sound' : 'Ambient Silent',
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
        setProgressLabel('Uploading custom audio...');
        setProgressPct(92);
        const audioUpload = await uploadStatusMediaToCloudinary(
          customAudioFile,
          'video',
          privacyMode
        );
        audioTrack = {
          mode: 'custom_audio',
          label: customAudioFile.name.replace(/\.[^/.]+$/, '').slice(0, 60) || 'Custom Audio',
          audioUrl: audioUpload.secureUrl,
          cloudinaryPublicId: audioUpload.publicId,
        };
      }

      setProgressLabel('Publishing 24h Status...');
      setProgressPct(98);

      const cleanAllowed = selectedUids.filter((id) => !blockedSet.has(id));
      const cleanExcluded = exceptUids.filter((id) => !blockedSet.has(id));

      const created = await createStatusPost({
        authorUid: currentUid,
        authorName,
        authorPhoto,
        type: statusType,
        mediaUrl,
        thumbnailUrl,
        cloudinaryPublicId,
        cloudinaryResourceType,
        cloudinaryDeliveryType,
        caption,
        textContent,
        bgGradient,
        textStyle,
        durationSec: statusType === 'video' ? videoDurationSec : 6,
        audioTrack,
        privacyMode,
        allowedUids: privacyMode === 'selected' ? cleanAllowed : [],
        excludedUids: privacyMode === 'except' ? cleanExcluded : [],
      });

      onCreated(created);
      onShowToast('Your 24h Status is live!');
      resetSelectedMedia();
      setCaption('');
      setTextContent('');
      setCustomAudioFile(null);
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

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg max-h-[92vh] bg-[#0a0f1f] border border-slate-800 rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/80 bg-[#0d1426] shrink-0">
          <div className="flex items-center gap-2.5">
            <CreatorAvatar
              uid={currentUid}
              fallbackPhoto={authorPhoto}
              fallbackName={authorName}
              className="w-8 h-8 rounded-full border border-amber-400/50"
            />
            <div>
              <h2 className="text-sm font-black text-white leading-none">Create KING Status</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Expires automatically after 24 hours</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-50"
            aria-label="Close Status Creator"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden Inputs for Camera & Phone Gallery */}
        <input
          ref={photoGalleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handleImagePick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraPhotoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            handleImagePick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={videoGalleryRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            handleVideoPick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraVideoRef}
          type="file"
          accept="video/*"
          capture="user"
          className="hidden"
          onChange={(e) => {
            handleVideoPick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={customAudioRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            handleCustomAudioPick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <form onSubmit={handlePublish} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Type Switcher */}
          <div className="grid grid-cols-3 gap-2 bg-[#060a14] p-1 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setStatusType('image');
                setErrorMsg(null);
              }}
              className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                statusType === 'image'
                  ? 'bg-cyan-500 text-black font-black shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ImageIcon className="w-4 h-4" /> Photo
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusType('video');
                setErrorMsg(null);
              }}
              className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                statusType === 'video'
                  ? 'bg-amber-400 text-black font-black shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Film className="w-4 h-4" /> Video (60s)
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusType('text');
                setErrorMsg(null);
              }}
              className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                statusType === 'text'
                  ? 'bg-purple-500 text-white font-black shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Type className="w-4 h-4" /> Text
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {/* PHOTO OR VIDEO STAGE */}
          {(statusType === 'image' || statusType === 'video') && (
            <div className="space-y-3">
              {!selectedFile || !previewUrl ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      statusType === 'image'
                        ? cameraPhotoRef.current?.click()
                        : cameraVideoRef.current?.click()
                    }
                    className="p-4 rounded-2xl bg-[#0d1426] hover:bg-[#131d37] border border-slate-700/80 hover:border-cyan-400 flex flex-col items-center justify-center gap-2 transition cursor-pointer min-h-[112px]"
                  >
                    <div className="w-11 h-11 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                      {statusType === 'image' ? (
                        <Camera className="w-5 h-5" />
                      ) : (
                        <Video className="w-5 h-5" />
                      )}
                    </div>
                    <span className="text-xs font-extrabold text-white">
                      {statusType === 'image' ? 'Take Photo' : 'Record Video'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {statusType === 'video' ? `Up to ${MAX_STATUS_VIDEO_SECONDS}s` : 'Camera'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      statusType === 'image'
                        ? photoGalleryRef.current?.click()
                        : videoGalleryRef.current?.click()
                    }
                    className="p-4 rounded-2xl bg-[#0d1426] hover:bg-[#131d37] border border-slate-700/80 hover:border-amber-400 flex flex-col items-center justify-center gap-2 transition cursor-pointer min-h-[112px]"
                  >
                    <div className="w-11 h-11 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                      <Upload className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-extrabold text-white">Phone Gallery</span>
                    <span className="text-[10px] text-slate-400">
                      {statusType === 'video' ? `Max ${MAX_STATUS_VIDEO_SECONDS}s • 50MB` : 'JPG, PNG, WebP'}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-700 max-h-72 flex items-center justify-center">
                    {statusType === 'image' ? (
                      <img
                        src={previewUrl}
                        alt="Status preview"
                        className="max-h-72 w-full object-contain"
                      />
                    ) : (
                      <video
                        src={previewUrl}
                        controls
                        playsInline
                        className="max-h-72 w-full object-contain bg-black"
                      />
                    )}
                    <button
                      type="button"
                      onClick={resetSelectedMedia}
                      className="absolute top-2.5 right-2.5 px-3 py-1.5 rounded-xl bg-black/75 hover:bg-black text-white text-xs font-bold border border-white/20 cursor-pointer"
                    >
                      Change
                    </button>
                    {statusType === 'video' && (
                      <span className="absolute bottom-2.5 left-2.5 px-2 py-1 rounded-lg bg-black/75 text-amber-300 font-mono text-[11px] font-bold border border-amber-500/30">
                        {videoDurationSec}s / {MAX_STATUS_VIDEO_SECONDS}s max
                      </span>
                    )}
                  </div>

                  {/* Compression toggle */}
                  <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#0d1426] border border-slate-800 cursor-pointer">
                    <div>
                      <div className="text-xs font-bold text-white">
                        Optimize media before upload ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {statusType === 'image'
                          ? 'Fast smart resize up to 1600px JPEG'
                          : supportsClientVideoCompression()
                          ? 'In-browser 720p compression when larger than 6 MB'
                          : 'Direct high-quality progressive upload (compression unsupported on this browser)'}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={compressEnabled}
                      onChange={(e) => setCompressEnabled(e.target.checked)}
                      className="w-4 h-4 accent-cyan-400 shrink-0"
                    />
                  </label>
                </div>
              )}

              {/* Caption */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Caption (Optional)
                  </label>
                  <span className="text-[10px] text-slate-500">{caption.length}/300</span>
                </div>
                <input
                  type="text"
                  maxLength={300}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write a caption for your Status..."
                  className="w-full bg-[#060a14] border border-slate-800 focus:border-cyan-400 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* TEXT STATUS STAGE */}
          {statusType === 'text' && (
            <div className="space-y-3">
              <div
                className="rounded-3xl p-5 min-h-[210px] flex items-center justify-center border border-white/15 shadow-inner transition-all"
                style={{ background: bgGradient }}
              >
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  maxLength={700}
                  rows={4}
                  placeholder="Share a thought with your KING friends..."
                  className={`w-full bg-transparent text-center text-white placeholder:text-white/50 text-lg focus:outline-none resize-none ${
                    TEXT_STYLES.find((s) => s.id === textStyle)?.className || 'font-bold'
                  }`}
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {STATUS_BG_GRADIENTS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setBgGradient(g.css)}
                      className={`w-8 h-8 rounded-full border-2 transition cursor-pointer ${
                        bgGradient === g.css ? 'border-white scale-110' : 'border-white/25'
                      }`}
                      style={{ background: g.css }}
                      title={g.label}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-slate-400">{textContent.length}/700</span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {TEXT_STYLES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setTextStyle(st.id)}
                    className={`py-2 rounded-xl text-[11px] border cursor-pointer transition ${
                      textStyle === st.id
                        ? 'bg-purple-500/25 border-purple-400 text-white font-bold'
                        : 'bg-[#060a14] border-slate-800 text-slate-300'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* SOUND & ROYALTY-FREE AUDIO TRACK */}
          <div className="bg-[#0d1426] border border-slate-800 rounded-2xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5" /> Status Audio Track
              </span>
              <span className="text-[10px] text-slate-400">Royalty-free or own audio</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAudioMode('original');
                  stopPreviewAudio();
                }}
                className={`py-2 px-2 rounded-xl text-[11px] font-bold border cursor-pointer transition ${
                  audioMode === 'original'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                    : 'bg-[#060a14] border-slate-800 text-slate-400'
                }`}
              >
                {statusType === 'video' ? 'Original Sound' : 'Silent'}
              </button>
              <button
                type="button"
                onClick={() => setAudioMode('royalty_free')}
                className={`py-2 px-2 rounded-xl text-[11px] font-bold border cursor-pointer transition ${
                  audioMode === 'royalty_free'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                    : 'bg-[#060a14] border-slate-800 text-slate-400'
                }`}
              >
                KING Beats
              </button>
              <button
                type="button"
                onClick={() => customAudioRef.current?.click()}
                className={`py-2 px-2 rounded-xl text-[11px] font-bold border cursor-pointer transition ${
                  audioMode === 'custom_audio'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                    : 'bg-[#060a14] border-slate-800 text-slate-400'
                }`}
              >
                Upload Audio
              </button>
            </div>

            {audioMode === 'royalty_free' && (
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {KING_ROYALTY_FREE_TRACKS.map((track) => {
                  const isSelected = selectedPresetId === track.id;
                  const isPreviewing = previewPlayingTrackId === track.id;
                  return (
                    <div
                      key={track.id}
                      onClick={() => setSelectedPresetId(track.id)}
                      className={`p-2 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-400/60 text-white'
                          : 'bg-[#060a14] border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold truncate">{track.title}</div>
                        <div className="text-[9px] text-slate-400">{track.mood}</div>
                      </div>
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSelectedPresetId(track.id);
                          togglePreviewTrack(track.id);
                        }}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 flex items-center justify-center shrink-0 cursor-pointer"
                        aria-label={isPreviewing ? 'Stop preview' : 'Preview sound'}
                      >
                        {isPreviewing ? (
                          <Square className="w-3 h-3 fill-current" />
                        ) : (
                          <Play className="w-3 h-3 fill-current ml-0.5" />
                        )}
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
                  onClick={() => customAudioRef.current?.click()}
                  className="text-[11px] text-cyan-400 font-bold shrink-0 ml-2 cursor-pointer"
                >
                  Choose file
                </button>
              </div>
            )}
          </div>

          {/* STATUS PRIVACY AUDIENCE (All 6 Phase 1 Modes) */}
          <div className="bg-[#0d1426] border border-slate-800 rounded-2xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Who can view this Status
              </span>
              {activeAudienceCount > 0 && (
                <span className="text-[10px] font-bold text-cyan-400">
                  {activeAudienceCount} users
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {STATUS_PRIVACY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPrivacyMode(opt.value)}
                  className={`py-2 px-2.5 rounded-xl text-[11px] font-bold border text-left transition cursor-pointer flex items-center justify-between gap-1 ${
                    privacyMode === opt.value
                      ? 'bg-cyan-500/20 border-cyan-400 text-white'
                      : 'bg-[#060a14] border-slate-800 text-slate-300'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {privacyMode === opt.value && <Check className="w-3 h-3 text-cyan-300 shrink-0" />}
                </button>
              ))}
            </div>

            {(privacyMode === 'selected' || privacyMode === 'except') && (
              <div className="space-y-2 pt-1 border-t border-slate-800">
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search people (blocked users excluded)..."
                  className="w-full bg-[#060a14] border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400"
                />
                <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
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
                            ? 'bg-cyan-500/15 border-cyan-500/50 text-white'
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
                        {picked && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {submitting && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-cyan-300">
                <span>{progressLabel || 'Publishing Status...'}</span>
                <span>{progressPct}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-amber-400 transition-all duration-200"
                  style={{ width: `${Math.max(8, progressPct)}%` }}
                />
              </div>
            </div>
          )}

          {/* Submit Footer */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-cyan-400 text-black font-black text-xs shadow-lg active:scale-95 transition cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Publishing...' : 'Publish 24h Status'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
