import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, Flashlight, Image as ImageIcon, RotateCw, Video, X, Zap, ZapOff } from 'lucide-react';

interface SystemCameraGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMediaCaptured: (file: File) => void;
  onShowToast: (msg: string) => void;
}

const SAMPLE_GALLERY_ITEMS = [
  { id: '1', type: 'image', label: 'Screenshot 1', url: '/public/assets/aistudio/Screenshot_20261118-145833_deeff59b.png' },
  { id: '2', type: 'image', label: 'Screenshot 2', url: '/public/assets/aistudio/Screenshot_20261118-121146_5283508e.png' },
  { id: '3', type: 'image', label: 'Logo', url: '/src/assets/king-logo.png' },
  { id: '4', type: 'video', label: 'Sample Video', url: '/sample_test.mp4' },
];

export default function SystemCameraGalleryModal({
  isOpen,
  onClose,
  onMediaCaptured,
  onShowToast,
}: SystemCameraGalleryModalProps) {
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [flashOn, setFlashOn] = useState<boolean>(false);
  const [facingUser, setFacingUser] = useState<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Start live camera stream
  const startCamera = useCallback(async () => {
    setErrorMsg(null);
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingUser ? 'user' : 'environment' },
        audio: cameraMode === 'video',
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch {
      setCameraActive(false);
      setErrorMsg('Camera access unavailable. You can pick any photo or video from your phone gallery below.');
    }
  }, [facingUser, cameraMode]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    }
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    };
  }, [isOpen, startCamera]);

  const handleCaptureShutter = () => {
    if (!cameraActive || !videoRef.current) {
      fileInputRef.current?.click();
      return;
    }
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        onShowToast('Failed to capture photo from camera');
        return;
      }
      const file = new File([blob], `king_camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
      onMediaCaptured(file);
      onClose();
    }, 'image/jpeg', 0.92);
  };

  const handleSelectSampleOrFile = async (url: string, type: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = type === 'video' ? 'mp4' : 'jpg';
      const file = new File([blob], `king_media_${Date.now()}.${ext}`, { type: blob.type || (type === 'video' ? 'video/mp4' : 'image/jpeg') });
      onMediaCaptured(file);
      onClose();
    } catch {
      fileInputRef.current?.click();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      onMediaCaptured(file);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col justify-between text-white select-none animate-in fade-in duration-200">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* TOP BAR */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 rounded-full bg-black/50 hover:bg-black/75 flex items-center justify-center text-white cursor-pointer"
          aria-label="Close camera"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setFlashOn((v) => !v)}
            className="w-11 h-11 rounded-full bg-black/50 hover:bg-black/75 flex items-center justify-center text-amber-300 cursor-pointer"
            aria-label="Toggle flash"
          >
            {flashOn ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* CAMERA VIEWFINDER OR FALLBACK */}
      <div className="absolute inset-0 bg-[#120c18] flex items-center justify-center overflow-hidden">
        {cameraActive ? (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Camera className="w-8 h-8" />
            </div>
            <p className="text-sm font-bold text-white max-w-xs">
              {errorMsg || 'Camera view active'}
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-cyan-400 text-black text-xs font-black shadow-lg cursor-pointer"
            >
              Choose from Gallery
            </button>
          </div>
        )}

        {/* Subtle vignette gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/50 pointer-events-none" />
      </div>

      {/* BOTTOM CONTROLS & GALLERY TRAY */}
      <div className="relative z-30 pb-6 pt-4 px-4 flex flex-col gap-4 bg-gradient-to-t from-black via-black/80 to-transparent">
        {/* GALLERY TRAY / FILMSTRIP (Recent screenshots & photos) */}
        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
          {SAMPLE_GALLERY_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectSampleOrFile(item.url, item.type)}
              className="relative w-16 h-20 sm:w-20 sm:h-24 rounded-2xl overflow-hidden border-2 border-white/30 hover:border-amber-400 shrink-0 group cursor-pointer shadow-lg transition"
            >
              <img
                src={item.url}
                alt={item.label}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              />
              {item.type === 'video' && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <Video className="w-5 h-5 text-amber-300 drop-shadow" />
                </div>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-16 h-20 sm:w-20 sm:h-24 rounded-2xl bg-white/10 hover:bg-white/20 border-2 border-dashed border-white/40 flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer transition"
          >
            <ImageIcon className="w-6 h-6 text-cyan-300" />
            <span className="text-[10px] font-bold text-white">Gallery</span>
          </button>
        </div>

        {/* SHUTTER & MODE CONTROLS */}
        <div className="flex items-center justify-between px-6 pt-2">
          {/* Gallery button left */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-12 h-12 rounded-2xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white border border-white/30 cursor-pointer shadow-lg"
            title="Open phone gallery"
          >
            <ImageIcon className="w-6 h-6 text-amber-300" />
          </button>

          {/* Center Big Shutter Button */}
          <button
            type="button"
            onClick={handleCaptureShutter}
            className="w-20 h-20 rounded-full border-4 border-white p-1 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition shadow-2xl bg-black/20"
            aria-label="Capture shutter"
          >
            <div className="w-full h-full rounded-full bg-white hover:bg-slate-100 transition" />
          </button>

          {/* Switch Camera Right */}
          <button
            type="button"
            onClick={() => setFacingUser((v) => !v)}
            className="w-12 h-12 rounded-2xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white border border-white/30 cursor-pointer shadow-lg"
            title="Switch camera"
          >
            <RotateCw className="w-5 h-5" />
          </button>
        </div>

        {/* MODE SWITCHER: Video / Photo */}
        <div className="flex items-center justify-center gap-6 pt-1">
          <button
            type="button"
            onClick={() => setCameraMode('video')}
            className={`text-xs font-black tracking-wider uppercase cursor-pointer transition ${
              cameraMode === 'video' ? 'text-amber-400 scale-105' : 'text-white/60 hover:text-white'
            }`}
          >
            Video
          </button>
          <button
            type="button"
            onClick={() => setCameraMode('photo')}
            className={`text-xs font-black tracking-wider uppercase cursor-pointer transition ${
              cameraMode === 'photo' ? 'text-amber-400 scale-105' : 'text-white/60 hover:text-white'
            }`}
          >
            Photo
          </button>
        </div>
      </div>
    </div>
  );
}
