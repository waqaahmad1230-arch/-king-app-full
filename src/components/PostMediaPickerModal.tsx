import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  RefreshCw,
  RotateCcw,
  SwitchCamera,
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
  onMediaSelected: (file: File) => void;
}

type CameraMode = 'photo' | 'video';

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
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [flashOn, setFlashOn] = useState<boolean>(false);
  const [isLoadingCamera, setIsLoadingCamera] = useState<boolean>(false);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flashNotice, setFlashNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);

  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewOriginalFile, setPreviewOriginalFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewType, setPreviewType] = useState<FeedContentType>('photo');
  const [hasAiApplied, setHasAiApplied] = useState<boolean>(false);
  const [showAiWorkspace, setShowAiWorkspace] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const cameraSessionRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activePreviewUrlRef = useRef<string>('');
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCamFallbackRef = useRef<HTMLInputElement | null>(null);

  const revokePreviewUrl = useCallback(() => {
    if (activePreviewUrlRef.current) {
      try {
        URL.revokeObjectURL(activePreviewUrlRef.current);
      } catch {}
      activePreviewUrlRef.current = '';
    }
    setPreviewUrl('');
  }, []);

  const clearRecordTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    cameraSessionRef.current += 1;
    clearRecordTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
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
  }, [clearRecordTimer]);

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
        setCameraError(
          'Live camera is not supported in this browser. You can still choose a photo or video from your gallery.'
        );
        return;
      }

      setIsLoadingCamera(true);
      setCameraError(null);
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
          setCameraError(
            'Camera permission was denied. Allow camera access or choose media from your phone gallery.'
          );
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setCameraError(
            'No camera hardware was detected on this device. Choose a photo or video from your gallery.'
          );
        } else {
          setCameraError(
            'Could not start live camera preview. Retry camera or choose media from your gallery.'
          );
        }
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
      revokePreviewUrl();
      setPreviewFile(null);
      setPreviewOriginalFile(null);
      setHasAiApplied(false);
      setShowAiWorkspace(false);
      setErrorMsg(null);
      setCameraError(null);
      setFlashNotice(null);
      setMode('photo');
      setFacingMode('environment');
      return;
    }

    if (previewFile || showAiWorkspace) {
      stopStream();
      return;
    }

    startCamera(facingMode, mode);
    return () => {
      stopStream();
    };
  }, [isOpen, previewFile, showAiWorkspace, facingMode, mode, startCamera, stopStream, revokePreviewUrl]);

  // Ensure tracks and URLs are always cleaned up on unmount
  useEffect(() => {
    return () => {
      stopStream();
      revokePreviewUrl();
    };
  }, [stopStream, revokePreviewUrl]);

  if (!isOpen) return null;

  const setLoadedPreview = (file: File, type: FeedContentType, keepOriginalBackup = false) => {
    stopStream();
    revokePreviewUrl();
    const nextUrl = URL.createObjectURL(file);
    activePreviewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
    setPreviewFile(file);
    setPreviewType(type);
    if (!keepOriginalBackup) {
      setPreviewOriginalFile(file);
      setHasAiApplied(false);
    }
    setErrorMsg(null);
  };

  const handleCloseModal = () => {
    stopStream();
    revokePreviewUrl();
    setPreviewFile(null);
    setPreviewOriginalFile(null);
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
        setLoadedPreview(check.file, 'photo');
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
        setIsRecording(false);
      }
    } else {
      setIsRecording(false);
    }
  };

  const startVideoRecording = () => {
    const stream = mediaStreamRef.current;
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
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        clearRecordTimer();
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
        setLoadedPreview(check.file, 'video');
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
      setIsRecording(false);
      setErrorMsg('Video recording could not start on this browser. You can select a video from Gallery.');
    }
  };

  const handleShutterAction = () => {
    if (mode === 'photo') {
      handleCapturePhoto();
    } else if (isRecording) {
      stopVideoRecording();
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

    setLoadedPreview(check.file, check.mediaType);
  };

  const handleRetake = () => {
    revokePreviewUrl();
    setPreviewFile(null);
    setPreviewOriginalFile(null);
    setHasAiApplied(false);
    setErrorMsg(null);
  };

  const handleContinueToEditor = () => {
    if (!previewFile) return;
    const selected = previewFile;
    stopStream();
    revokePreviewUrl();
    setPreviewFile(null);
    setPreviewOriginalFile(null);
    setHasAiApplied(false);
    onMediaSelected(selected);
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
      aria-label={previewFile ? 'KING Media Preview' : 'KING Camera'}
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

      {!previewFile ? (
        /* ================= LIVE KING CAMERA SCREEN ================= */
        <>
          {/* Viewfinder */}
          <div className="relative flex-1 w-full bg-[#05070e] overflow-hidden flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-transform duration-200 ${
                facingMode === 'user' ? 'scale-x-[-1]' : ''
              }`}
            />

            {/* Top Overlay Controls */}
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
                  <Zap className="w-5 h-5 fill-black" />
                ) : (
                  <ZapOff className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Flash Unsupported Notice */}
            {flashNotice && (
              <div className="absolute top-[max(62px,calc(env(safe-area-inset-top)+50px))] left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-full bg-black/80 border border-white/15 text-[11px] font-medium text-slate-200 whitespace-nowrap shadow-lg">
                {flashNotice}
              </div>
            )}

            {/* Loading Camera Overlay */}
            {isLoadingCamera && (
              <div className="absolute inset-0 z-20 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center gap-2.5">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <p className="text-xs font-semibold text-slate-200">Starting KING Camera...</p>
              </div>
            )}

            {/* Camera Permission / Device Unavailable Fallback */}
            {cameraError && !isLoadingCamera && (
              <div className="absolute inset-0 z-20 bg-gradient-to-b from-[#070b14] via-[#04060c] to-black flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/15 border border-blue-500/35 text-blue-400 flex items-center justify-center shadow-[0_0_24px_rgba(37,99,235,0.25)]">
                  <Camera className="w-8 h-8" />
                </div>
                <div className="space-y-1.5 max-w-xs">
                  <h3 className="text-sm font-bold text-white">Camera Access Needed</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{cameraError}</p>
                </div>
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  <label
                    htmlFor={galleryInputId}
                    className="w-full min-h-[42px] px-4 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-600/30 transition"
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>Choose from Gallery</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => startCamera(facingMode, mode)}
                      className="min-h-[38px] px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Camera</span>
                    </button>
                    <label
                      htmlFor={nativeCamFallbackId}
                      className="min-h-[38px] px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Device Cam</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Inline Error Banner */}
            {errorMsg && (
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
          <div className="shrink-0 bg-[#05070e] border-t border-white/10 px-4 pt-3.5 pb-[max(18px,env(safe-area-inset-bottom))] space-y-3.5">
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
      ) : (
        /* ================= MEDIA PREVIEW SCREEN ================= */
        <>
          {/* Top Preview Header Overlay */}
          <div className="shrink-0 px-3.5 pt-[max(12px,env(safe-area-inset-top))] pb-2.5 bg-[#070a12] border-b border-white/10 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleRetake}
              aria-label="Back to Camera"
              className="h-9 px-3 rounded-xl bg-[#111624] hover:bg-[#192034] border border-white/10 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Camera</span>
            </button>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white">
                {previewType === 'photo' ? 'Photo Preview' : 'Video Preview'}
              </span>
              {hasAiApplied && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/35 text-emerald-300">
                  AI Edited
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleCloseModal}
              aria-label="Close Preview"
              className="w-9 h-9 rounded-full bg-[#111624] hover:bg-[#192034] border border-white/10 text-white flex items-center justify-center cursor-pointer transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Large Uncropped Media Preview */}
          <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
            {previewType === 'photo' ? (
              <img
                src={previewUrl}
                alt="Selected photo preview"
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <video
                src={previewUrl}
                controls
                playsInline
                autoPlay
                loop
                className="w-full h-full object-contain bg-black"
              />
            )}
          </div>

          {/* Bottom Preview Action Bar: Retake | KING AI | Continue */}
          <div className="shrink-0 bg-[#070a12] border-t border-white/10 px-3.5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
            <div className="max-w-md mx-auto w-full flex items-center gap-2">
              <button
                type="button"
                onClick={handleRetake}
                className="min-h-[44px] px-3.5 rounded-xl bg-[#141824] hover:bg-[#1b2133] border border-white/15 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition"
              >
                <RotateCcw className="w-4 h-4 text-slate-200" />
                <span>Retake</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAiWorkspace}
                className="min-h-[44px] px-3.5 rounded-xl bg-gradient-to-r from-[#0d1930] to-[#15284c] hover:brightness-110 border border-blue-400/50 shadow-[0_0_16px_rgba(37,99,235,0.35)] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition"
              >
                <KingAiPetalIcon className="w-4 h-4" />
                <span>KING AI</span>
              </button>

              <button
                type="button"
                onClick={handleContinueToEditor}
                className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_18px_rgba(37,99,235,0.45)] cursor-pointer active:scale-95 transition"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Continue</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* EXISTING KING AI STUDIO WORKSPACE */}
      <PostAiWorkspaceModal
        isOpen={showAiWorkspace}
        mediaType={previewFile ? previewType : mode}
        currentFile={previewFile}
        currentMediaUrl={previewUrl}
        hasOriginalBackup={Boolean(hasAiApplied && previewOriginalFile)}
        onClose={() => setShowAiWorkspace(false)}
        onPickPhotoFile={(pickedFile) => {
          setLoadedPreview(pickedFile, 'photo');
        }}
        onApplyPhoto={(editedFile) => {
          setLoadedPreview(editedFile, 'photo', Boolean(previewOriginalFile));
          setHasAiApplied(true);
        }}
        onRestoreOriginal={() => {
          if (previewOriginalFile) {
            setLoadedPreview(previewOriginalFile, previewType, true);
            setHasAiApplied(false);
          }
        }}
        onJumpToVideoTool={() => {
          setShowAiWorkspace(false);
          if (previewFile) {
            handleContinueToEditor();
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
