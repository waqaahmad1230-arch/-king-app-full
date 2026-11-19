import React, { useEffect, useRef, useState } from 'react';
import { Camera, Film, ImagePlus, Loader2, Send, X, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { publishGalleryMediaPost, validateGalleryMediaFile } from '../services/centralContentService';
import { FeedContentType } from '../types/content';
import StatusEditorModal from './StatusEditorModal';

interface SocialPostComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onPublished?: (info: { id: string; contentType: FeedContentType }) => void;
}

export default function SocialPostComposer({ isOpen, onClose, onPublished }: SocialPostComposerProps) {
  const { user, openAuthModal } = useAuth();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoCameraInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<FeedContentType | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isStatusEditorOpen, setIsStatusEditorOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const clearSelection = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setMediaType(null);
    setPreviewUrl(null);
    setIsStatusEditorOpen(false);
    setCaption('');
    setProgress(0);
    setStatusLabel('');
    setErrorMsg(null);
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (videoCameraInputRef.current) videoCameraInputRef.current.value = '';
  };

  const handleCloseModal = () => {
    if (isPublishing) return;
    clearSelection();
    onClose();
  };

  const handleOpenGallery = () => {
    setErrorMsg(null);
    if (!user) {
      openAuthModal('login');
      return;
    }
    galleryInputRef.current?.click();
  };

  const handleOpenPhotoCamera = () => {
    setErrorMsg(null);
    if (!user) {
      openAuthModal('login');
      return;
    }
    cameraInputRef.current?.click();
  };

  const handleOpenVideoCamera = () => {
    setErrorMsg(null);
    if (!user) {
      openAuthModal('login');
      return;
    }
    videoCameraInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const validation = validateGalleryMediaFile(file);
    if (!validation.valid || !validation.mediaType) {
      setErrorMsg(validation.error || 'Unsupported file.');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setMediaType(validation.mediaType);
    setPreviewUrl(URL.createObjectURL(file));
    setErrorMsg(null);
    setIsStatusEditorOpen(true);
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal('login');
      return;
    }
    if (!selectedFile) {
      setErrorMsg('Please select or capture a photo or video first.');
      return;
    }

    setIsPublishing(true);
    setErrorMsg(null);
    setProgress(5);
    setStatusLabel('Starting upload...');

    try {
      const result = await publishGalleryMediaPost(
        selectedFile,
        caption,
        {
          uid: user.uid,
          displayName: user.displayName,
          photoURL: user.photoURL,
          email: user.email,
        },
        (pct, text) => {
          setProgress(pct);
          setStatusLabel(text);
        }
      );

      clearSelection();
      if (onPublished) {
        onPublished({ id: result.id, contentType: result.contentType });
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to publish post. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={handleCloseModal}
      role="dialog"
      aria-modal="true"
      aria-label="Create KING Post"
    >
      <div
        className="w-full max-w-md bg-[#0b1322] border border-slate-800 rounded-3xl p-4 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={videoCameraInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-sky-500/40 bg-slate-900 shrink-0 flex items-center justify-center">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-black text-sky-400">
                  {(user?.displayName || user?.email || 'K').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">Open Camera &amp; Post System</h3>
              <p className="text-[11px] text-slate-400 truncate">
                {user?.displayName || user?.email?.split('@')[0] || 'Sign in required'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseModal}
            disabled={isPublishing}
            aria-label="Close post composer"
            className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center justify-center cursor-pointer disabled:opacity-40 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Real Camera & Gallery Capture Options when no media chosen yet */}
        {!selectedFile && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleOpenPhotoCamera}
                className="min-h-[100px] rounded-2xl border border-sky-500/40 bg-[#060b16] hover:bg-sky-950/40 transition flex flex-col items-center justify-center gap-2 p-3 text-center cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Take Photo</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Open Real Camera</p>
                </div>
              </button>

              <button
                type="button"
                onClick={handleOpenVideoCamera}
                className="min-h-[100px] rounded-2xl border border-cyan-500/40 bg-[#060b16] hover:bg-cyan-950/40 transition flex flex-col items-center justify-center gap-2 p-3 text-center cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Record Video</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Open Real Video Cam</p>
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={handleOpenGallery}
              className="w-full min-h-[64px] rounded-2xl border border-dashed border-slate-700 bg-[#060b16] hover:bg-[#091224] hover:border-slate-500 transition flex items-center justify-center gap-2.5 px-4 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
                <ImagePlus className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-white">Choose from Gallery</p>
                <p className="text-[10px] text-slate-400">Select existing photos or videos</p>
              </div>
            </button>

            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1">
              <span>Photos → Home Feed</span>
              <span>Videos → Home &amp; Videos</span>
            </div>
          </div>
        )}

        {/* Error Notice */}
        {errorMsg && (
          <div className="p-2.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Active Gallery Preview & Caption Composer */}
        {selectedFile && previewUrl && (
          <form onSubmit={handlePublish} className="space-y-3 animate-in fade-in duration-150">
            <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 max-h-72 flex items-center justify-center">
              {mediaType === 'photo' ? (
                <img src={previewUrl} alt="Preview" className="w-full max-h-72 object-contain" />
              ) : (
                <video src={previewUrl} controls playsInline className="w-full max-h-72 object-contain" />
              )}

              {!isPublishing && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/80 hover:bg-red-600 text-white flex items-center justify-center transition cursor-pointer"
                  aria-label="Discard selected media"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>{mediaType === 'video' ? 'Video · Appears on Home & Videos' : 'Photo · Appears on Home Feed'}</span>
              {!isPublishing && (
                <button
                  type="button"
                  onClick={handleOpenGallery}
                  className="text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
                >
                  Change media
                </button>
              )}
            </div>

            <textarea
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={isPublishing}
              maxLength={500}
              placeholder={
                mediaType === 'video'
                  ? 'Write a video title or caption...'
                  : 'Write a caption for your photo...'
              }
              className="w-full bg-[#060b16] border border-slate-700 focus:border-sky-500 rounded-2xl px-3 py-2 text-xs text-white focus:outline-none resize-none"
            />

            {isPublishing && (
              <div className="space-y-1.5 bg-sky-950/30 border border-sky-500/30 rounded-2xl p-2.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-sky-300">
                  <span className="flex items-center gap-1.5 truncate">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span className="truncate">{statusLabel || 'Uploading...'}</span>
                  </span>
                  <span className="tabular-nums">{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isPublishing}
                onClick={handleCloseModal}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPublishing}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-sky-500/20 active:scale-95 transition cursor-pointer disabled:opacity-50"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Publish Now</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      <StatusEditorModal
        isOpen={isStatusEditorOpen}
        initialFile={selectedFile}
        currentUid={user?.uid || null}
        authorName={user?.displayName || 'KING Creator'}
        authorPhoto={user?.photoURL || ''}
        onClose={() => {
          setIsStatusEditorOpen(false);
          clearSelection();
        }}
        onCreated={(created) => {
          setIsStatusEditorOpen(false);
          clearSelection();
          if (onPublished) {
            onPublished({ id: created.id, contentType: created.type === 'video' ? 'video' : 'photo' });
          }
          onClose();
        }}
        onShowToast={() => {}}
      />
    </div>
  );
}
