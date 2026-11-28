import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Camera,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
  SwitchCamera,
  Timer,
  X,
  Zap,
  ZapOff,
} from 'lucide-react';
import { normalizeSelectedMediaFile } from '../services/centralContentService';
import { FeedContentType } from '../types/content';
import PostAiWorkspaceModal, { KingAiPetalIcon } from './PostAiWorkspaceModal';

interface PostMediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMediaSelected: (file: File, creationType?: 'post' | 'story') => void;
}

type CameraMode = 'photo' | 'video';

interface CameraFilter {
  id: string;
  label: string;
  css: string;
}

const CAMERA_FILTERS: CameraFilter[] = [
  { id: 'normal', label: 'Normal', css: 'none' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.24) saturate(1.25) brightness(1.03)' },
  { id: 'cinema', label: 'Cinema', css: 'contrast(1.2) saturate(0.9) brightness(0.95)' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.45) contrast(1.12)' },
  { id: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.22)' },
  { id: 'sunset', label: 'Golden', css: 'sepia(0.3) saturate(1.35) brightness(1.06)' },
  { id: 'neon', label: 'Neon', css: 'saturate(1.5) contrast(1.18) hue-rotate(15deg)' },
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function PostMediaPickerModal({
  isOpen,
  onClose,
  onMediaSelected,
}: PostMediaPickerModalProps) {
  const uid = useId();
  const galleryInputId = `${uid}-gallery`;
  const nativeCamFallbackId = `${uid}-native-cam`;

  const [mode, setMode] = useState<CameraMode>('photo');
  const [creationType, setCreationType] = useState<'post' | 'story'>('post');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [flashOn, setFlashOn] = useState<boolean>(false);
  const [timerMode, setTimerMode] = useState<0 | 3 | 10>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [activeFilterId, setActiveFilterId] = useState<string>('normal');
  const [showFilterDrawer, setShowFilterDrawer] = useState<boolean>(false);
  const [isLoadingCamera, setIsLoadingCamera] = useState<boolean>(false);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [flashNotice, setFlashNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);

  const [aiDraftFile, setAiDraftFile] = useState<File | null>(null);
  const [aiDraftOriginalFile, setAiDraftOriginalFile] = useState<File | null>(null);
  const [aiDraftUrl, setAiDraftUrl] = useState<string>('');
  const [hasAiApplied, setHasAiApplied] = useState<boolean>(false);
  const [showAiWorkspace, setShowAiWorkspace] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const cameraSessionRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const filterRecordRafRef = useRef<number | null>(null);
  const filterCaptureStreamRef = useRef<MediaStream | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activePreviewUrlRef = useRef<string>('');
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCamFallbackRef = useRef<HTMLInputElement | null>(null);

  const revokeAiDraftUrl = useCallback(() => {
    if (activePreviewUrlRef.current) {
      try {
        URL.revokeObjectURL(activePreviewUrlRef.current);
      } catch {}
      activePreviewUrlRef.current = '';
    }
    setAiDraftUrl('');
  }, []);

  const clearRecordTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const stopFilterRecordingPipeline = useCallback(() => {
    if (filterRecordRafRef.current !== null) {
      cancelAnimationFrame(filterRecordRafRef.current);
      filterRecordRafRef.current = null;
    }
    if (filterCaptureStreamRef.current) {
      filterCaptureStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      filterCaptureStreamRef.current = null;
    }
  }, []);

  const cancelCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
  }, []);

  const stopStream = useCallback(() => {
    cameraSessionRef.current += 1;
    clearRecordTimer();
    cancelCountdown();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    stopFilterRecordingPipeline();
    setIsRecording(false);
    setRecordingSeconds(0);

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {}
    }
    setCameraReady(false);
    setFlashOn(false);
    setHasTorch(false);
  }, [clearRecordTimer, cancelCountdown, stopFilterRecordingPipeline]);

  const startCamera = useCallback(
    async (targetFacing: 'environment' | 'user', targetMode: CameraMode) => {
      stopStream();
      const sessionId = ++cameraSessionRef.current;

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setIsLoadingCamera(false);
        setCameraReady(false);
        setErrorMsg(
          'Live camera is not supported in this browser. You can still choose a photo or video from your gallery.'
        );
        return;
      }

      setIsLoadingCamera(true);
      setErrorMsg(null);

      let newStream: MediaStream | null = null;
      try {
        const videoConstraints: MediaTrackConstraints = {
          facingMode: { ideal: targetFacing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        };

        if (targetMode === 'video') {
          try {
            newStream = await navigator.mediaDevices.getUserMedia({
              video: videoConstraints,
              audio: true,
            });
          } catch {
            newStream = await navigator.mediaDevices.getUserMedia({
              video: videoConstraints,
              audio: false,
            });
          }
        } else {
          try {
            newStream = await navigator.mediaDevices.getUserMedia({
              video: videoConstraints,
              audio: false,
            });
          } catch {
            newStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }

        // If modal closed, switched to preview, or another startCamera ran while waiting
        if (cameraSessionRef.current !== sessionId) {
          newStream.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {}
          });
          return;
        }

        mediaStreamRef.current = newStream;
        const videoTrack = newStream.getVideoTracks()[0];
        if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
          try {
            const caps = videoTrack.getCapabilities() as { torch?: boolean };
            setHasTorch(Boolean(caps?.torch));
          } catch {
            setHasTorch(false);
          }
        } else {
          setHasTorch(false);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      } catch (err: any) {
        if (cameraSessionRef.current !== sessionId) return;
        const errName = err?.name || '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          setErrorMsg(
            'Camera permission was denied. Please enable camera permission in your browser settings (Settings > Site Settings > Camera) or use your phone gallery.'
          );
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setErrorMsg(
            'No camera hardware was detected on this device. Choose a photo or video from your gallery.'
          );
        } else {
          setErrorMsg(
            'Could not start live camera preview. Please check camera permissions in browser settings or choose media from your gallery.'
          );
        }
        setCameraReady(false);
      } finally {
        if (cameraSessionRef.current === sessionId) {
          setIsLoadingCamera(false);
        }
      }
    },
    [stopStream]
  );

  // Manage camera lifecycle cleanly
  useEffect(() => {
    if (!isOpen) {
      stopStream();
      revokeAiDraftUrl();
      setAiDraftFile(null);
      setAiDraftOriginalFile(null);
      setHasAiApplied(false);
      setShowAiWorkspace(false);
      setErrorMsg(null);
      setFlashNotice(null);
      setMode('photo');
      setCreationType('post');
      setFacingMode('environment');
      setTimerMode(0);
      setActiveFilterId('normal');
      setShowFilterDrawer(false);
      return;
    }

    if (showAiWorkspace) {
      stopStream();
      return;
    }

    startCamera(facingMode, mode);
    return () => {
      stopStream();
    };
  }, [isOpen, showAiWorkspace, facingMode, mode, startCamera, stopStream, revokeAiDraftUrl]);

  // Ensure tracks and URLs are always cleaned up on unmount
  useEffect(() => {
    return () => {
      stopStream();
      revokeAiDraftUrl();
    };
  }, [stopStream, revokeAiDraftUrl]);

  if (!isOpen) return null;

  const setAiDraftMedia = (file: File, keepOriginalBackup = false) => {
    revokeAiDraftUrl();
    const nextUrl = URL.createObjectURL(file);
    activePreviewUrlRef.current = nextUrl;
    setAiDraftUrl(nextUrl);
    setAiDraftFile(file);
    if (!keepOriginalBackup) {
      setAiDraftOriginalFile(file);
      setHasAiApplied(false);
    }
    setErrorMsg(null);
  };

  const handoffToEditor = (file: File) => {
    stopStream();
    revokeAiDraftUrl();
    setAiDraftFile(null);
    setAiDraftOriginalFile(null);
    setHasAiApplied(false);
    setShowAiWorkspace(false);
    setErrorMsg(null);
    onMediaSelected(file, creationType);
  };

  const handleCloseModal = () => {
    stopStream();
    revokeAiDraftUrl();
    setAiDraftFile(null);
    setAiDraftOriginalFile(null);
    setHasAiApplied(false);
    setShowAiWorkspace(false);
    setErrorMsg(null);
    onClose();
  };

  const handleToggleFlash = async () => {
    setFlashNotice(null);
    const stream = mediaStreamRef.current;
    const videoTrack = stream?.getVideoTracks()[0];
    if (!hasTorch || !videoTrack) {
      setFlashNotice('Flash hardware is not supported on this camera.');
      setTimeout(() => setFlashNotice(null), 2200);
      return;
    }

    const nextFlash = !flashOn;
    try {
      await (videoTrack as any).applyConstraints({
        advanced: [{ torch: nextFlash }],
      });
      setFlashOn(nextFlash);
    } catch {
      setHasTorch(false);
      setFlashOn(false);
      setFlashNotice('Unable to control flash on this device.');
      setTimeout(() => setFlashNotice(null), 2200);
    }
  };

  const handleFlipCamera = () => {
    if (isRecording || isLoadingCamera) return;
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleSwitchMode = (nextMode: CameraMode) => {
    if (nextMode === mode) return;
    if (isRecording) {
      stopVideoRecording();
      return;
    }
    setMode(nextMode);
  };

  const handleCapturePhoto = () => {
    const videoEl = videoRef.current;
    if (!videoEl || !cameraReady || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      setErrorMsg('Camera frame is not ready yet. Please wait a moment or pick from gallery.');
      return;
    }

    const width = videoEl.videoWidth;
    const height = videoEl.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    const currentFilter = CAMERA_FILTERS.find((f) => f.id === activeFilterId);
    if (currentFilter && currentFilter.css !== 'none') {
      ctx.filter = currentFilter.css;
    }
    ctx.drawImage(videoEl, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setErrorMsg('Could not capture photo. Please try again.');
          return;
        }
        const rawFile = new File([blob], `king_photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const check = normalizeSelectedMediaFile(rawFile, 'photo');
        if (!check.valid || !check.file) {
          setErrorMsg(check.error || 'Captured photo could not be processed.');
          return;
        }
        handoffToEditor(check.file);
      },
      'image/jpeg',
      0.93
    );
  };

  const stopVideoRecording = () => {
    clearRecordTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        stopFilterRecordingPipeline();
        setIsRecording(false);
      }
    } else {
      stopFilterRecordingPipeline();
      setIsRecording(false);
    }
  };

  const startVideoRecording = () => {
    const stream = mediaStreamRef.current;
    const videoEl = videoRef.current;
    if (!stream || !cameraReady) {
      setErrorMsg('Camera is still starting. Please wait a moment.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setErrorMsg('In-browser video recording is unavailable. Use Gallery or Device Camera.');
      return;
    }

    try {
      recordedChunksRef.current = [];
      stopFilterRecordingPipeline();

      let streamToRecord: MediaStream = stream;
      const currentFilter = CAMERA_FILTERS.find((f) => f.id === activeFilterId);
      const needsMirror = facingMode === 'user';
      const hasLiveFilter = Boolean(currentFilter && currentFilter.css !== 'none');

      if (
        videoEl &&
        videoEl.videoWidth > 0 &&
        videoEl.videoHeight > 0 &&
        (hasLiveFilter || needsMirror) &&
        typeof HTMLCanvasElement !== 'undefined' &&
        typeof (document.createElement('canvas') as any).captureStream === 'function'
      ) {
        try {
          const recCanvas = document.createElement('canvas');
          recCanvas.width = Math.min(1280, videoEl.videoWidth);
          recCanvas.height = Math.round((recCanvas.width / videoEl.videoWidth) * videoEl.videoHeight);
          const recCtx = recCanvas.getContext('2d');
          if (recCtx) {
            const drawLoop = () => {
              if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
              recCtx.save();
              if (needsMirror) {
                recCtx.translate(recCanvas.width, 0);
                recCtx.scale(-1, 1);
              }
              recCtx.filter = hasLiveFilter && currentFilter ? currentFilter.css : 'none';
              recCtx.drawImage(videoEl, 0, 0, recCanvas.width, recCanvas.height);
              recCtx.restore();
              filterRecordRafRef.current = requestAnimationFrame(drawLoop);
            };
            const captured = (recCanvas as any).captureStream(30) as MediaStream;
            stream.getAudioTracks().forEach((at) => captured.addTrack(at));
            filterCaptureStreamRef.current = captured;
            streamToRecord = captured;
            filterRecordRafRef.current = requestAnimationFrame(drawLoop);
          }
        } catch {
          stopFilterRecordingPipeline();
          streamToRecord = stream;
        }
      }

      const candidateMimes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ];
      let chosenMime = '';
      for (const candidate of candidateMimes) {
        if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(candidate)) {
          chosenMime = candidate;
          break;
        }
      }

      const recorder = chosenMime
        ? new MediaRecorder(streamToRecord, { mimeType: chosenMime })
        : new MediaRecorder(streamToRecord);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        clearRecordTimer();
        stopFilterRecordingPipeline();
        setIsRecording(false);
        const mime = recorder.mimeType || chosenMime || 'video/webm';
        const fullBlob = new Blob(recordedChunksRef.current, { type: mime });
        recordedChunksRef.current = [];
        mediaRecorderRef.current = null;

        if (fullBlob.size === 0) {
          setErrorMsg('Recorded video was empty. Hold recording slightly longer.');
          return;
        }

        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        const rawFile = new File([fullBlob], `king_video_${Date.now()}.${ext}`, { type: mime });
        const check = normalizeSelectedMediaFile(rawFile, 'video');
        if (!check.valid || !check.file) {
          setErrorMsg(check.error || 'Recorded video could not be processed.');
          return;
        }
        handoffToEditor(check.file);
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      setErrorMsg(null);

      const startedAt = Date.now();
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        if (elapsed >= 60) {
          setRecordingSeconds(60);
          stopVideoRecording();
        } else {
          setRecordingSeconds(elapsed);
        }
      }, 250);
    } catch {
      stopFilterRecordingPipeline();
      setIsRecording(false);
      setErrorMsg('Video recording could not start on this browser. You can select a video from Gallery.');
    }
  };

  const handleCycleTimer = () => {
    setTimerMode((prev) => (prev === 0 ? 3 : prev === 3 ? 10 : 0));
  };

  const handleShutterAction = () => {
    if (isRecording) {
      stopVideoRecording();
      return;
    }
    if (countdown !== null) {
      cancelCountdown();
      return;
    }
    if (timerMode > 0) {
      setCountdown(timerMode);
      let remaining = timerMode;
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          cancelCountdown();
          if (mode === 'photo') {
            handleCapturePhoto();
          } else {
            startVideoRecording();
          }
        } else {
          setCountdown(remaining);
        }
      }, 1000);
      return;
    }

    if (mode === 'photo') {
      handleCapturePhoto();
    } else {
      startVideoRecording();
    }
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    fallbackHint?: FeedContentType
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const check = normalizeSelectedMediaFile(file, fallbackHint);
    if (!check.valid || !check.file || !check.mediaType) {
      setErrorMsg(check.error || 'Unsupported photo or video file.');
      return;
    }

    handoffToEditor(check.file);
  };

  const handleOpenAiWorkspace = () => {
    if (isRecording) return;
    stopStream();
    setShowAiWorkspace(true);
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[160] bg-black text-white flex flex-col h-[100dvh] w-full overflow-hidden select-none animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="KING Camera"
    >
      {/* Hidden Android/WebView-safe gallery & native camera inputs */}
      <input
        id={galleryInputId}
        ref={galleryInputRef}
        type="file"
        accept="image/*,video/*"
        onClick={(e) => {
          e.stopPropagation();
          e.currentTarget.value = '';
        }}
        onChange={(e) => handleFileChange(e)}
        className="sr-only"
        aria-label="Choose photo or video from gallery"
      />
      <input
        id={nativeCamFallbackId}
        ref={nativeCamFallbackRef}
        type="file"
        accept={mode === 'video' ? 'video/*' : 'image/*'}
        capture="environment"
        onClick={(e) => {
          e.stopPropagation();
          e.currentTarget.value = '';
        }}
        onChange={(e) => handleFileChange(e, mode)}
        className="sr-only"
        aria-label="Open device camera app"
      />

      {/* ================= LIVE KING CAMERA SCREEN ================= */}
      <>
          {/* Viewfinder */}
          <div className="relative flex-1 w-full bg-[#05070e] overflow-hidden flex items-center justify-center">
            {(() => {
              const currentFilter = CAMERA_FILTERS.find((f) => f.id === activeFilterId);
              const liveFilterCss = currentFilter ? currentFilter.css : 'none';
              return (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-transform duration-200 ${
                    facingMode === 'user' ? 'scale-x-[-1]' : ''
                  }`}
                  style={{
                    filter: liveFilterCss !== 'none' ? liveFilterCss : undefined,
                  }}
                />
              );
            })()}

            {/* Top Overlay Controls: Close | Status Pill | Flash | Timer | Effects */}
            <div className="absolute top-0 inset-x-0 z-30 px-3.5 pt-[max(12px,env(safe-area-inset-top))] pb-5 bg-gradient-to-b from-black/80 via-black/35 to-transparent flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleCloseModal}
                aria-label="Close Camera"
                className="w-10 h-10 rounded-full bg-black/55 hover:bg-black/75 backdrop-blur-md border border-white/15 text-white flex items-center justify-center cursor-pointer active:scale-95 transition"
              >
                <X className="w-5 h-5" />
              </button>

              {isRecording ? (
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-600/90 text-white font-mono text-xs font-bold shadow-lg animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span>REC {formatDuration(recordingSeconds)}</span>
                </div>
              ) : (
                <div className="px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-[11px] font-bold tracking-wider uppercase text-white/90">
                  KING Camera · {mode === 'photo' ? 'Photo' : 'Video'}
                </div>
              )}

              <div className="flex items-center gap-1.5">
                {/* Timer Control: Off / 3s / 10s */}
                <button
                  type="button"
                  disabled={isRecording}
                  onClick={handleCycleTimer}
                  aria-label={`Timer: ${timerMode === 0 ? 'Off' : `${timerMode}s`}`}
                  title="Camera Timer"
                  className={`h-10 px-2.5 rounded-full backdrop-blur-md border flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition ${
                    timerMode > 0
                      ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-[0_0_14px_rgba(251,191,36,0.5)]'
                      : 'bg-black/55 hover:bg-black/75 text-white border-white/15'
                  }`}
                >
                  <Timer className="w-4 h-4" />
                  <span className="text-[11px] font-black">{timerMode === 0 ? 'Off' : `${timerMode}s`}</span>
                </button>

                {/* Filter / Effects Drawer Toggle */}
                <button
                  type="button"
                  disabled={isRecording}
                  onClick={() => setShowFilterDrawer((prev) => !prev)}
                  aria-label="Camera Effects & Filters"
                  title="Effects & Filters"
                  className={`w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center cursor-pointer active:scale-95 transition ${
                    activeFilterId !== 'normal' || showFilterDrawer
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white border-pink-400 shadow-[0_0_14px_rgba(236,72,153,0.5)]'
                      : 'bg-black/55 hover:bg-black/75 text-white border-white/15'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                </button>

                {/* Flash Toggle */}
                <button
                  type="button"
                  onClick={handleToggleFlash}
                  aria-label={
                    !hasTorch
                      ? 'Flash unavailable on this camera'
                      : flashOn
                      ? 'Turn flash off'
                      : 'Turn flash on'
                  }
                  title={hasTorch ? 'Toggle Flash' : 'Flash not supported on this camera'}
                  className={`w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center cursor-pointer active:scale-95 transition ${
                    flashOn && hasTorch
                      ? 'bg-amber-400 text-black border-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.6)]'
                      : hasTorch
                      ? 'bg-black/55 hover:bg-black/75 text-white border-white/15'
                      : 'bg-black/40 text-white/45 border-white/10'
                  }`}
                >
                  {flashOn && hasTorch ? (
                    <Zap className="w-4 h-4 fill-black" />
                  ) : (
                    <ZapOff className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Flash Unsupported Notice */}
            {flashNotice && (
              <div className="absolute top-[max(62px,calc(env(safe-area-inset-top)+50px))] left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-full bg-black/80 border border-white/15 text-[11px] font-medium text-slate-200 whitespace-nowrap shadow-lg">
                {flashNotice}
              </div>
            )}

            {/* Countdown Overlay */}
            {countdown !== null && (
              <div
                onClick={cancelCountdown}
                className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center cursor-pointer select-none"
              >
                <div className="w-28 h-28 rounded-full border-4 border-white/90 bg-black/70 flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.4)] animate-pulse">
                  <span className="text-6xl font-black text-white">{countdown}</span>
                </div>
                <p className="mt-4 text-xs font-bold text-slate-200 uppercase tracking-widest bg-black/80 px-4 py-1.5 rounded-full border border-white/20">
                  Tap anywhere to cancel
                </p>
              </div>
            )}

            {/* Camera Filters Drawer */}
            {showFilterDrawer && (
              <div className="absolute bottom-3 inset-x-3 z-30 bg-black/85 backdrop-blur-md border border-white/15 rounded-2xl p-2.5 shadow-2xl">
                <div className="flex items-center justify-between px-1 pb-2 text-[11px] font-bold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                    <span>Live Camera Filters</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFilterDrawer(false)}
                    className="text-slate-400 hover:text-white text-xs cursor-pointer"
                  >
                    Done
                  </button>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 [&::-webkit-scrollbar]:hidden">
                  {CAMERA_FILTERS.map((f) => {
                    const isSelected = activeFilterId === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setActiveFilterId(f.id)}
                        className={`px-3 py-1 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer ${
                          isSelected
                            ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow'
                            : 'bg-white/10 hover:bg-white/20 text-slate-300'
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Loading Camera Overlay */}
            {isLoadingCamera && (
              <div className="absolute inset-0 z-20 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center gap-2.5">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <p className="text-xs font-semibold text-slate-200">Starting KING Camera...</p>
              </div>
            )}

            {/* Camera Unavailable Fallback Actions */}
            {!cameraReady && !isLoadingCamera && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center gap-3 pointer-events-auto">
                <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center">
                  <Camera className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
                  {errorMsg || 'Start live camera or choose a photo or video directly from your gallery.'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <label
                    htmlFor={galleryInputId}
                    className="px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg transition"
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>Choose from Gallery</span>
                  </label>
                  <label
                    htmlFor={nativeCamFallbackId}
                    className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Device Camera</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => startCamera(facingMode, mode)}
                    className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                </div>
              </div>
            )}

            {/* Inline Error Banner */}
            {errorMsg && cameraReady && (
              <div className="absolute bottom-3 inset-x-3 z-30 px-3 py-2 rounded-xl bg-rose-950/90 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-2 shadow-xl">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="truncate">{errorMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="text-rose-300 font-bold px-1 cursor-pointer shrink-0"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          {/* Bottom Camera Controls Deck */}
          <div className="shrink-0 bg-[#05070e] border-t border-white/10 px-4 pt-3 pb-[max(18px,env(safe-area-inset-bottom))] space-y-3">
            {/* Story vs Post Mode Switcher */}
            <div className="flex items-center justify-center gap-6 text-xs font-black tracking-wider uppercase">
              <button
                type="button"
                onClick={() => setCreationType('post')}
                className={`transition cursor-pointer ${
                  creationType === 'post'
                    ? 'text-white border-b-2 border-blue-500 pb-0.5'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                POST
              </button>
              <button
                type="button"
                onClick={() => setCreationType('story')}
                className={`transition cursor-pointer ${
                  creationType === 'story'
                    ? 'text-amber-400 border-b-2 border-amber-400 pb-0.5'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                STORY
              </button>
            </div>

            {/* Main Row: Choose from Gallery | Central Shutter | Switch Front/Back */}
            <div className="max-w-sm mx-auto w-full flex items-center justify-between gap-3">
              <label
                htmlFor={galleryInputId}
                aria-label="Choose from Gallery"
                className="min-w-[82px] px-2.5 py-2 rounded-2xl bg-[#111624] hover:bg-[#192034] border border-white/15 flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95 transition"
              >
                <ImagePlus className="w-5 h-5 text-sky-400" />
                <span className="text-[10px] font-bold text-slate-100 leading-none">
                  Gallery
                </span>
              </label>

              {/* Central Capture / Record Shutter */}
              <button
                type="button"
                disabled={!cameraReady}
                onClick={handleShutterAction}
                aria-label={
                  mode === 'photo'
                    ? 'Capture Photo'
                    : isRecording
                    ? 'Stop Video Recording'
                    : 'Start Video Recording'
                }
                className={`w-[74px] h-[74px] rounded-full border-4 flex items-center justify-center transition active:scale-95 shadow-2xl cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  isRecording
                    ? 'border-red-500 bg-red-950/50 animate-pulse'
                    : mode === 'video'
                    ? 'border-white bg-black/40'
                    : 'border-white bg-transparent'
                }`}
              >
                {isRecording ? (
                  <span className="w-7 h-7 rounded-lg bg-red-500 shadow" />
                ) : mode === 'photo' ? (
                  <span className="w-[58px] h-[58px] rounded-full bg-white shadow-inner block" />
                ) : (
                  <span className="w-[58px] h-[58px] rounded-full bg-red-600 shadow-inner flex items-center justify-center">
                    <span className="w-3.5 h-3.5 rounded-full bg-white" />
                  </span>
                )}
              </button>

              <button
                type="button"
                disabled={isRecording || isLoadingCamera}
                onClick={handleFlipCamera}
                aria-label="Switch Front or Back Camera"
                title="Switch Camera"
                className="min-w-[82px] px-2.5 py-2 rounded-2xl bg-[#111624] hover:bg-[#192034] border border-white/15 flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-40 active:scale-95 transition"
              >
                <SwitchCamera className="w-5 h-5 text-white" />
                <span className="text-[10px] font-bold text-slate-100 leading-none">
                  {facingMode === 'environment' ? 'Front' : 'Back'}
                </span>
              </button>
            </div>

            {/* Bottom Row: Photo / Video Mode Switcher + Dedicated KING AI Button */}
            <div className="max-w-sm mx-auto w-full flex items-center justify-between gap-2">
              <div className="flex items-center p-1 rounded-full bg-[#111624] border border-white/12">
                <button
                  type="button"
                  onClick={() => handleSwitchMode('photo')}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                    mode === 'photo'
                      ? 'bg-[#2563eb] text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Photo
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchMode('video')}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                    mode === 'video'
                      ? 'bg-red-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Video
                </button>
              </div>

              <button
                type="button"
                disabled={isRecording}
                onClick={handleOpenAiWorkspace}
                className="px-3.5 py-2 rounded-full bg-gradient-to-r from-[#0d1930] to-[#15284c] hover:brightness-110 border border-blue-400/50 shadow-[0_0_16px_rgba(37,99,235,0.4)] flex items-center gap-2 cursor-pointer disabled:opacity-40 active:scale-95 transition shrink-0"
              >
                <KingAiPetalIcon className="w-4 h-4" />
                <span className="text-xs font-extrabold tracking-wide text-white">KING AI</span>
              </button>
            </div>
          </div>
        </>

      {/* EXISTING KING AI STUDIO WORKSPACE */}
      <PostAiWorkspaceModal
        isOpen={showAiWorkspace}
        mediaType="photo"
        currentFile={aiDraftFile}
        currentMediaUrl={aiDraftUrl}
        hasOriginalBackup={Boolean(hasAiApplied && aiDraftOriginalFile)}
        onClose={() => {
          setShowAiWorkspace(false);
          revokeAiDraftUrl();
          setAiDraftFile(null);
          setAiDraftOriginalFile(null);
          setHasAiApplied(false);
        }}
        onPickPhotoFile={(pickedFile) => {
          setAiDraftMedia(pickedFile);
        }}
        onApplyPhoto={(editedFile) => {
          handoffToEditor(editedFile);
        }}
        onRestoreOriginal={() => {
          if (aiDraftOriginalFile) {
            setAiDraftMedia(aiDraftOriginalFile, true);
            setHasAiApplied(false);
          }
        }}
      />
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
