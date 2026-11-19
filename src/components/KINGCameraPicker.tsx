import React, { useState, useRef, useEffect } from 'react';
import { Camera, SwitchCamera, Image as ImageIcon, X, Check, RotateCcw, Sparkles, AlertCircle, Loader2 } from 'lucide-react';

interface KINGCameraPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture?: (fileOrDataUrl: string) => void;
  onSelect?: (fileOrDataUrl: string, isVideo?: boolean) => void;
  title?: string;
  mode?: 'photo' | 'video' | 'both';
}

export default function KINGCameraPicker({
  isOpen,
  onClose,
  onCapture,
  onSelect,
  title = 'KING Camera Picker',
  mode = 'photo',
}: KINGCameraPickerProps) {
  const [activeTab, setActiveTab] = useState<'camera' | 'gallery'>('camera');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, facingMode]);

  const startCamera = async () => {
    setIsLoadingCamera(true);
    setCameraError(null);
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsLoadingCamera(false);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('Unable to access camera. Please allow camera permissions or use Phone Gallery.');
      setIsLoadingCamera(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const switchCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedImage(dataUrl);
      stopCamera();
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera();
  };

  const confirmPhoto = () => {
    if (capturedImage) {
      if (onSelect) onSelect(capturedImage, false);
      if (onCapture) onCapture(capturedImage);
      onClose();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const res = event.target.result as string;
          if (onSelect) onSelect(res, false);
          if (onCapture) onCapture(res);
          onClose();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-0 sm:p-4">
      <div className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-xl bg-[#0a0f1d] sm:rounded-3xl border border-[#D4AF37]/30 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#060a14]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-[#D4AF37] flex items-center justify-center shadow-lg shadow-amber-500/20 text-black font-black">
              <Camera className="w-5 h-5 text-black" />
            </div>
            <div>
              <h3 className="text-white font-black text-sm uppercase tracking-wider flex items-center gap-1.5">
                {title} <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              </h3>
              <p className="text-[11px] text-slate-400">KING High-Precision Media Suite</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 p-2 bg-[#060a14]/60 border-b border-slate-800/80">
          <button
            onClick={() => {
              setActiveTab('camera');
              setCapturedImage(null);
            }}
            className={`py-2.5 text-xs font-extrabold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'camera'
                ? 'bg-gradient-to-r from-amber-500 to-[#D4AF37] text-black shadow-lg shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" /> Live Camera
          </button>
          <button
            onClick={() => {
              setActiveTab('gallery');
              stopCamera();
            }}
            className={`py-2.5 text-xs font-extrabold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'gallery'
                ? 'bg-gradient-to-r from-amber-500 to-[#D4AF37] text-black shadow-lg shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ImageIcon className="w-4 h-4" /> Phone Gallery
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 relative flex flex-col items-center justify-center bg-black min-h-[380px] sm:min-h-[440px] overflow-hidden">
          {activeTab === 'camera' ? (
            <>
              {capturedImage ? (
                <div className="relative w-full h-full flex items-center justify-center p-4">
                  <img
                    src={capturedImage}
                    alt="Captured Preview"
                    className="max-h-[60vh] object-contain rounded-2xl border border-[#D4AF37]/40 shadow-2xl"
                  />
                  <div className="absolute bottom-6 flex items-center gap-4 bg-black/70 backdrop-blur-md px-6 py-3 rounded-full border border-slate-700">
                    <button
                      onClick={retakePhoto}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4 text-amber-400" /> Retake
                    </button>
                    <button
                      onClick={confirmPhoto}
                      className="flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-amber-500 to-[#D4AF37] hover:from-amber-400 hover:to-amber-300 text-black text-xs font-black transition shadow-lg shadow-amber-500/30 cursor-pointer"
                    >
                      <Check className="w-4 h-4" /> Use Photo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative w-full h-full flex items-center justify-center">
                  {isLoadingCamera && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 text-slate-300 gap-3">
                      <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
                      <p className="text-xs font-bold tracking-wider">Activating KING Camera...</p>
                    </div>
                  )}

                  {cameraError ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center max-w-sm space-y-4">
                      <div className="w-14 h-14 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center border border-red-500/30">
                        <AlertCircle className="w-7 h-7" />
                      </div>
                      <p className="text-sm font-bold text-red-200">{cameraError}</p>
                      <button
                        onClick={() => setActiveTab('gallery')}
                        className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-[#D4AF37] text-black text-xs font-black shadow-lg shadow-amber-500/20 cursor-pointer"
                      >
                        Choose from Gallery Instead
                      </button>
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      <canvas ref={canvasRef} className="hidden" />

                      {/* Camera Controls Overlay */}
                      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                        <button
                          onClick={switchCamera}
                          className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white flex items-center justify-center border border-slate-700 transition cursor-pointer"
                          title="Switch Camera"
                        >
                          <SwitchCamera className="w-5 h-5 text-amber-400" />
                        </button>
                      </div>

                      <div className="absolute bottom-6 flex items-center justify-center gap-6 z-10 w-full px-6">
                        <button
                          onClick={capturePhoto}
                          className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-600 via-amber-400 to-[#D4AF37] p-1 shadow-2xl shadow-amber-500/50 flex items-center justify-center hover:scale-105 active:scale-95 transition cursor-pointer"
                        >
                          <div className="w-14 h-14 rounded-full bg-black flex items-center justify-center">
                            <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-amber-500 to-[#D4AF37]" />
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-6 w-full h-full">
              <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[#D4AF37]">
                <ImageIcon className="w-10 h-10 animate-pulse" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h4 className="text-white font-bold text-base">Select from Phone Gallery</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Choose any high-resolution photo or media asset stored on your device or computer.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-[#D4AF37] hover:from-amber-400 hover:to-amber-300 text-black font-black text-xs uppercase tracking-wider shadow-xl shadow-amber-500/30 transition cursor-pointer flex items-center gap-2"
              >
                <ImageIcon className="w-4 h-4" /> Browse Files
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
