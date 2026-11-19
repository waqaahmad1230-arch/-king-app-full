import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Zap,
  ZapOff,
  Wand2,
  RotateCcw,
  Images,
  Sparkles,
  Check,
  Video,
  Camera,
  AlertCircle,
  Play
} from 'lucide-react';

interface StoryCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMediaCaptured: (file: File) => void;
  title?: string;
}

type CaptureMode = 'photo' | 'video';
type FlashMode = 'off' | 'on' | 'auto';

interface VisualFilter {
  id: string;
  name: string;
  css: string;
  badgeColor: string;
}

const VISUAL_FILTERS: VisualFilter[] = [
  { id: 'normal', name: 'Normal', css: 'none', badgeColor: '#64748b' },
  { id: 'king-gold', name: 'King Gold', css: 'sepia(0.25) saturate(1.4) contrast(1.1) brightness(1.05)', badgeColor: '#f59e0b' },
  { id: 'cyber-neon', name: 'Cyber Blue', css: 'hue-rotate(185deg) contrast(1.25) saturate(1.3)', badgeColor: '#06b6d4' },
  { id: 'vivid-warm', name: 'Vivid Warm', css: 'saturate(1.45) contrast(1.15) brightness(1.02)', badgeColor: '#f97316' },
  { id: 'noir', name: 'Noir B&W', css: 'grayscale(1) contrast(1.3) brightness(0.95)', badgeColor: '#94a3b8' },
  { id: 'vintage', name: 'Vintage 90s', css: 'sepia(0.4) contrast(1.05) brightness(0.95) saturate(1.2)', badgeColor: '#d97706' },
  { id: 'emerald', name: 'Emerald', css: 'hue-rotate(70deg) contrast(1.15) saturate(1.2)', badgeColor: '#10b981' },
];

// Sample gallery strip thumbnails for quick status selection (matches user's screenshot gallery strip)
const RECENT_GALLERY_THUMBNAILS = [
  {
    id: 'thumb-1',
    type: 'image' as const,
    thumb: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=240&auto=format&fit=crop&q=80',
    title: 'Neon Abstract',
  },
  {
    id: 'thumb-2',
    type: 'image' as const,
    thumb: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=240&auto=format&fit=crop&q=80',
    title: 'Golden Art',
  },
  {
    id: 'thumb-3',
    type: 'image' as const,
    thumb: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=240&auto=format&fit=crop&q=80',
    title: 'Cyber Night',
  },
  {
    id: 'thumb-4',
    type: 'image' as const,
    thumb: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=240&auto=format&fit=crop&q=80',
    title: 'Golden Sunset',
  },
  {
    id: 'thumb-5',
    type: 'image' as const,
    thumb: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=240&auto=format&fit=crop&q=80',
    title: 'Tech Retro',
  },
  {
    id: 'thumb-6',
    type: 'image' as const,
    thumb: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=240&auto=format&fit=crop&q=80',
    title: 'Neon Crown',
  },
];

export default function StoryCameraModal({
  isOpen,
  onClose,
  onMediaCaptured,
  title = 'Create Story / Status',
}: StoryCameraModalProps) {
  const [mode, setMode] = useState<CaptureMode>('photo');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [activeFilterId, setActiveFilterId] = useState<string>('normal');
  const [showFiltersDrawer, setShowFiltersDrawer] = useState<boolean>(false);

  // Camera State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [screenFlash, setScreenFlash] = useState<boolean>(false);

  // Video Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);

  const activeFilter = VISUAL_FILTERS.find((f) => f.id === activeFilterId) || VISUAL_FILTERS[0];

  // Stop camera stream tracks
  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          // ignore
        }
      });
      setStream(null);
    }
  }, [stream]);

  // Start camera stream
  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera API is not supported on this browser or environment.');
      return;
    }

    setIsLoadingCamera(true);
    setCameraError(null);

    // Stop previous stream
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }

    try {
      let newStream: MediaStream;
      try {
        // Attempt with audio for video capability
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: true,
        });
      } catch (audioErr) {
        // If microphone was denied or unavailable, fallback to video-only
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      }

      setStream(newStream);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch(() => {});
      }

      // Check if hardware torch is supported
      const videoTrack = newStream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = (videoTrack.getCapabilities && videoTrack.getCapabilities()) as any;
        setHasTorch(Boolean(capabilities?.torch));
      }
    } catch (err: any) {
      console.warn('[StoryCamera] Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission denied. Allow camera access or pick photos from gallery.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera found on this device. You can select photos & videos from your gallery.');
      } else {
        setCameraError('Could not start camera. You can select from gallery below.');
      }
    } finally {
      setIsLoadingCamera(false);
    }
  }, [stream]);

  // Initialize camera when modal opens
  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopStream();
      if (isRecording) {
        stopVideoRecording();
      }
    }
    return () => {
      stopStream();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isOpen]);

  // Handle facing mode change
  const handleToggleFacingMode = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    startCamera(nextFacing);
  };

  // Handle Flash / Torch toggle
  const handleToggleFlash = async () => {
    const nextFlash: FlashMode = flashMode === 'off' ? 'on' : 'off';
    setFlashMode(nextFlash);

    if (stream && hasTorch) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          await (videoTrack as any).applyConstraints({
            advanced: [{ torch: nextFlash === 'on' }],
          });
        } catch (e) {
          console.warn('Torch constraint error:', e);
        }
      }
    }
  };

  // Capture Photo
  const handleCapturePhoto = () => {
    // Screen flash visual effect
    setScreenFlash(true);
    setTimeout(() => setScreenFlash(false), 200);

    const videoEl = videoRef.current;
    if (!videoEl) return;

    const width = videoEl.videoWidth || 1080;
    const height = videoEl.videoHeight || 1920;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle selfie mirror
    if (facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    // Apply active filter to 2D canvas context if needed
    if (activeFilter.id !== 'normal') {
      ctx.filter = activeFilter.css;
    }

    ctx.drawImage(videoEl, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `king_status_${Date.now()}.jpg`, { type: 'image/jpeg' });
        stopStream();
        onMediaCaptured(file);
      },
      'image/jpeg',
      0.94
    );
  };

  // Start Video Recording
  const startVideoRecording = () => {
    if (!stream) return;

    try {
      recordedChunksRef.current = [];
      const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
      let selectedMime = 'video/webm';
      for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType: selectedMime });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const fullBlob = new Blob(recordedChunksRef.current, { type: selectedMime });
        const ext = selectedMime.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([fullBlob], `king_status_video_${Date.now()}.${ext}`, {
          type: selectedMime,
        });
        stopStream();
        onMediaCaptured(file);
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 60) {
            // Auto stop at 60s
            stopVideoRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (recErr) {
      console.error('[StoryCamera] MediaRecorder start error:', recErr);
    }
  };

  // Stop Video Recording
  const stopVideoRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    setIsRecording(false);
  };

  // Center Shutter Button Action
  const handleShutterAction = () => {
    if (mode === 'photo') {
      handleCapturePhoto();
    } else {
      if (isRecording) {
        stopVideoRecording();
      } else {
        startVideoRecording();
      }
    }
  };

  // Handle Phone Gallery Input Change
  const handleGalleryFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stopStream();
    onMediaCaptured(file);
  };

  // Handle Quick Thumbnail Selection
  const handleSelectQuickThumbnail = async (item: (typeof RECENT_GALLERY_THUMBNAILS)[0]) => {
    try {
      const response = await fetch(item.thumb);
      const blob = await response.blob();
      const file = new File([blob], `${item.title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });
      stopStream();
      onMediaCaptured(file);
    } catch (err) {
      console.warn('Could not load sample thumbnail file:', err);
      // Fallback: open gallery picker
      fileInputRef.current?.click();
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] bg-black text-white flex flex-col justify-between select-none overflow-hidden animate-in fade-in duration-200">
      {/* Hidden File Input for Native Phone Gallery Picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleGalleryFileSelect}
        className="hidden"
      />

      {/* Screen Flash Visual Simulation */}
      {screenFlash && (
        <div className="absolute inset-0 z-50 bg-white opacity-85 pointer-events-none transition-opacity duration-150" />
      )}

      {/* TOP HEADER CONTROLS (Matches User's Screenshot: Close X on left, Flash on right) */}
      <div className="absolute top-0 inset-x-0 z-40 p-4 pt-6 flex items-center justify-between pointer-events-auto bg-gradient-to-b from-black/80 via-black/30 to-transparent">
        {/* Left: Close Button */}
        <button
          type="button"
          onClick={() => {
            stopStream();
            onClose();
          }}
          aria-label="Close Camera"
          className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md border border-white/15 flex items-center justify-center text-white active:scale-90 transition-transform shadow-lg cursor-pointer"
        >
          <X className="w-6 h-6 stroke-[2.4]" />
        </button>

        {/* Center: Live Recording Indicator / Mode Status */}
        {isRecording ? (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-600/90 text-white font-mono text-xs font-bold shadow-lg animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
            <span>REC {formatTimer(recordingSeconds)}</span>
          </div>
        ) : (
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-white/70 px-3 py-1 rounded-full bg-black/30 backdrop-blur-sm border border-white/10">
            {mode === 'photo' ? 'Photo Mode' : 'Video Mode'}
          </div>
        )}

        {/* Right: Flash / Torch Toggle */}
        <button
          type="button"
          onClick={handleToggleFlash}
          aria-label="Toggle Flash"
          className={`w-11 h-11 rounded-full backdrop-blur-md border flex items-center justify-center active:scale-90 transition-transform shadow-lg cursor-pointer ${
            flashMode === 'on'
              ? 'bg-amber-400 text-black border-amber-300'
              : 'bg-black/45 text-white border-white/15'
          }`}
        >
          {flashMode === 'on' ? (
            <Zap className="w-5 h-5 fill-black stroke-[2.2]" />
          ) : (
            <ZapOff className="w-5 h-5 stroke-[2.2]" />
          )}
        </button>
      </div>

      {/* MAIN CAMERA VIEWFINDER (Live Video Feed) */}
      <div className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center bg-[#070b14]">
        {/* Live Camera Video Feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ filter: activeFilter.css }}
          className={`w-full h-full object-cover transition-all duration-300 ${
            facingMode === 'user' ? 'scale-x-[-1]' : ''
          }`}
        />

        {/* Loading / Camera Initializing State */}
        {isLoadingCamera && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm space-y-3">
            <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
            <p className="text-xs font-semibold text-slate-300 tracking-wide">Starting Camera...</p>
          </div>
        )}

        {/* Camera Permission / Error Fallback Backdrop */}
        {cameraError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-slate-950/90 via-[#0a1020] to-black">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-4 shadow-xl">
              <Camera className="w-8 h-8 stroke-[1.8]" />
            </div>
            <h3 className="text-base font-bold text-white mb-1.5">Camera Unavailable</h3>
            <p className="text-xs text-slate-300 max-w-xs mb-5 leading-relaxed">
              {cameraError}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 transition-all active:scale-95 cursor-pointer"
              >
                <Images className="w-4 h-4" />
                <span>Open Phone Gallery</span>
              </button>
              <button
                type="button"
                onClick={() => startCamera(facingMode)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition active:scale-95"
              >
                Retry Camera
              </button>
            </div>
          </div>
        )}

        {/* Live Filter Indicator Badge */}
        {activeFilter.id !== 'normal' && (
          <div className="absolute top-20 left-4 z-30 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10.5px] font-bold text-white flex items-center gap-1.5 shadow-md">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: activeFilter.badgeColor }}
            />
            <span>{activeFilter.name}</span>
          </div>
        )}
      </div>

      {/* FILTER DRAWER CAROUSEL (Appears when magic wand is tapped) */}
      {showFiltersDrawer && (
        <div className="absolute bottom-[200px] inset-x-0 z-40 px-4 py-3 bg-black/70 backdrop-blur-lg border-y border-white/10 animate-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5" /> Camera Filters & Effects
            </span>
            <button
              onClick={() => setShowFiltersDrawer(false)}
              className="text-[10px] text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar py-1">
            {VISUAL_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilterId(f.id)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 ${
                  activeFilterId === f.id
                    ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/30'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: f.badgeColor }}
                />
                <span>{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* BOTTOM CONTROLS SECTION (Matches Screenshot Exactly) */}
      <div className="relative z-40 pb-6 pt-3 px-4 flex flex-col items-center bg-gradient-to-t from-black via-black/85 to-transparent">
        {/* 1. RECENT MEDIA THUMBNAIL STRIP (Directly above shutter, matches screenshot) */}
        <div className="w-full mb-4">
          {/* Top Pill / Drag indicator */}
          <div className="w-full flex justify-center mb-2">
            <span className="w-8 h-1 rounded-full bg-white/40" />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-1">
            {/* Gallery Open Icon as First Card */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 w-14 h-16 rounded-xl bg-slate-900 border-2 border-dashed border-cyan-400/60 hover:border-cyan-400 flex flex-col items-center justify-center gap-1 text-cyan-400 active:scale-95 transition-transform shadow-md"
              title="Pick from Gallery"
            >
              <Images className="w-5 h-5" />
              <span className="text-[9px] font-bold">Gallery</span>
            </button>

            {/* Recent Gallery Cards */}
            {RECENT_GALLERY_THUMBNAILS.map((thumb) => (
              <button
                key={thumb.id}
                type="button"
                onClick={() => handleSelectQuickThumbnail(thumb)}
                className="flex-shrink-0 relative w-14 h-16 rounded-xl overflow-hidden border border-white/20 hover:border-cyan-400 active:scale-95 transition-all shadow-md group"
              >
                <img
                  src={thumb.thumb}
                  alt={thumb.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent" />
                <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-black/60 flex items-center justify-center text-white text-[8px]">
                  ✓
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. SHUTTER & MAIN CONTROLS ROW */}
        <div className="w-full flex items-center justify-around px-2 max-w-sm mb-4">
          {/* Control 1: Gallery Picker Button (Left) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Open Device Gallery"
            title="Open Phone Gallery"
            className="w-12 h-12 rounded-2xl bg-black/45 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-black/60 active:scale-90 transition-transform shadow-lg cursor-pointer"
          >
            <Images className="w-6 h-6 stroke-[1.8]" />
          </button>

          {/* Control 2: Magic Wand / Filters (Middle Left) */}
          <button
            type="button"
            onClick={() => setShowFiltersDrawer((prev) => !prev)}
            aria-label="Toggle Effects and Filters"
            title="Filters & Effects"
            className={`w-12 h-12 rounded-2xl backdrop-blur-md border flex items-center justify-center active:scale-90 transition-transform shadow-lg cursor-pointer ${
              showFiltersDrawer || activeFilter.id !== 'normal'
                ? 'bg-cyan-500/30 text-cyan-300 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'bg-black/45 text-white border-white/20 hover:bg-black/60'
            }`}
          >
            <Wand2 className="w-6 h-6 stroke-[1.8]" />
          </button>

          {/* Control 3: BIG SHUTTER BUTTON (Center, Matches Screenshot Circular Shutter) */}
          <div className="relative flex items-center justify-center">
            {/* Outer Ring */}
            <button
              type="button"
              onClick={handleShutterAction}
              aria-label={
                mode === 'photo'
                  ? 'Take Photo'
                  : isRecording
                  ? 'Stop Recording'
                  : 'Record Video'
              }
              className={`w-[78px] h-[78px] rounded-full border-4 flex items-center justify-center transition-all duration-200 active:scale-95 shadow-2xl cursor-pointer ${
                isRecording
                  ? 'border-red-500 bg-red-950/40 animate-pulse'
                  : 'border-white bg-transparent hover:border-slate-200'
              }`}
            >
              {/* Inner Circle / Shutter State */}
              {isRecording ? (
                <div className="w-7 h-7 rounded-lg bg-red-500 shadow-md" />
              ) : mode === 'photo' ? (
                <div className="w-[62px] h-[62px] rounded-full bg-white shadow-inner active:scale-90 transition-transform" />
              ) : (
                <div className="w-[62px] h-[62px] rounded-full bg-red-600 shadow-inner flex items-center justify-center active:scale-90 transition-transform">
                  <div className="w-4 h-4 rounded-full bg-white" />
                </div>
              )}
            </button>
          </div>

          {/* Control 4: Flip / Switch Camera Button (Right) */}
          <button
            type="button"
            onClick={handleToggleFacingMode}
            aria-label="Switch Camera"
            title="Switch Front/Back Camera"
            className="w-12 h-12 rounded-2xl bg-black/45 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-black/60 active:scale-90 transition-transform shadow-lg cursor-pointer"
          >
            <RotateCcw className="w-6 h-6 stroke-[1.8]" />
          </button>
        </div>

        {/* 3. BOTTOM MODE SWITCHER: VIDEO | PHOTO (Matches Screenshot Exactly) */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15">
          <button
            type="button"
            onClick={() => {
              if (isRecording) stopVideoRecording();
              setMode('video');
            }}
            className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
              mode === 'video'
                ? 'bg-[#181f30] text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Video
          </button>
          <button
            type="button"
            onClick={() => {
              if (isRecording) stopVideoRecording();
              setMode('photo');
            }}
            className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
              mode === 'photo'
                ? 'bg-[#181f30] text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Photo
          </button>
        </div>
      </div>
    </div>
  );
}
