import React, { useState, useEffect, useRef } from 'react';
import { getHistory, clearHistory } from '../utils/historyUtils';
import { loadDownloads, DownloadItem, downloadVideoFile, updateDownloadItem, deleteDownloadItem } from '../utils/downloadUtils';
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { 
  Eye, 
  Clock, 
  Copy, 
  Check, 
  History, 
  Download, 
  ThumbsUp, 
  ListMusic, 
  UserCheck, 
  ChevronRight,
  ShieldCheck,
  Play,
  Pause,
  Volume2,
  VolumeX,
  X,
  Share2,
  CheckCircle2,
  ArrowLeft,
  MoreVertical,
  Maximize2,
  Repeat,
  Lock,
  Calendar,
  Music,
  Video,
  Search,
  LayoutGrid,
  List,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Trash2,
  Edit3,
  Folder
} from 'lucide-react';

export default function LibraryView() {
  const [watchHistory, setWatchHistory] = useState<any[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [activeHistoryMenuIndex, setActiveHistoryMenuIndex] = useState<number | null>(null);
  const [downloadsList, setDownloadsList] = useState<DownloadItem[]>([]);
  const [showDownloadsModal, setShowDownloadsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [isListView, setIsListView] = useState(false);
  const [activeAudio, setActiveAudio] = useState<DownloadItem | null>(null);
  const [audioIsPlaying, setAudioIsPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const [activePlayingVideo, setActivePlayingVideo] = useState<any | null>(null);
  const [libraryVideoAspect, setLibraryVideoAspect] = useState<'portrait' | 'landscape'>('landscape');

  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const playerScrollRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Record<string, boolean>>({});

  const [downloadTab, setDownloadTab] = useState<'videos' | 'audio' | 'private'>('videos');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [activeMenuVideoId, setActiveMenuVideoId] = useState<string | null>(null);
  const [deleteConfirmVideo, setDeleteConfirmVideo] = useState<DownloadItem | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState<boolean>(false);
  const [renameModalVideo, setRenameModalVideo] = useState<DownloadItem | null>(null);
  const [renameInputTitle, setRenameInputTitle] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 2500);
  };

  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startLongPress = (videoId: string) => {
    pressTimerRef.current = setTimeout(() => {
      setIsSelectionMode(true);
      setSelectedVideoIds(prev => prev.includes(videoId) ? prev : [...prev, videoId]);
    }, 500);
  };

  const cancelLongPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const toggleSelectVideo = (videoId: string, e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedVideoIds(prev => 
      prev.includes(videoId) ? prev.filter(id => id !== videoId) : [...prev, videoId]
    );
  };

  // 1. RENAME HANDLER
  const handleRenameConfirm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!renameModalVideo) return;
    const trimmed = renameInputTitle.trim();
    if (!trimmed) return;
    const targetId = renameModalVideo.videoId || (renameModalVideo as any).id;
    
    // Optimistic UI update
    setDownloadsList(prev => prev.map(item => 
      (item.videoId === targetId || (item as any).id === targetId || (item.videoUrl && item.videoUrl === renameModalVideo.videoUrl))
        ? { ...item, title: trimmed }
        : item
    ));
    setRenameModalVideo(null);
    setRenameInputTitle('');
    showToast("Video renamed successfully");

    try {
      await updateDownloadItem(targetId, { title: trimmed });
    } catch (err) {
      console.error("Rename save error:", err);
    }
  };

  // 2. SHARE HANDLER
  const handleShareVideo = async (video: DownloadItem, e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setActiveMenuVideoId(null);
    const fullUrl = video.videoUrl || '';
    const cleanBaseUrl = fullUrl.split('?')[0];
    const parts = cleanBaseUrl.split('/');
    const lastPart = parts[parts.length - 1] || '';
    const publicId = lastPart.split('.')[0];
    const shortLink =
      cleanBaseUrl.includes('res.cloudinary.com') && publicId
        ? `https://res.cloudinary.com/xb0o3xwi/video/upload/${publicId}.mp4`
        : cleanBaseUrl || window.location.href;
    const displayId = publicId || video.title || video.videoId || 'KING Video';
    const shareText = `👑 KING App\n\n🎬 ${displayId}\n\n▶️ Watch Now:\n${shortLink}`;

    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
        showToast("Shared successfully!");
        return;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.warn("Native share failed, falling back to clipboard:", err);
    }

    // Fallback: Copy to clipboard
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = shareText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      showToast("Link Copied! Paste in WhatsApp");
    } catch {
      showToast("Link: " + shortLink);
    }
  };

  // 3. MOVE TO PRIVATE / DOWNLOADS HANDLER
  const handleTogglePrivate = async (video: DownloadItem, e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setActiveMenuVideoId(null);
    const targetId = video.videoId || (video as any).id;
    const newPrivate = !video.isPrivate;

    // Optimistic UI update
    setDownloadsList(prev => prev.map(item => 
      (item.videoId === targetId || (item as any).id === targetId || (item.videoUrl && item.videoUrl === video.videoUrl))
        ? { ...item, isPrivate: newPrivate }
        : item
    ));
    setSelectedVideoIds(prev => prev.filter(id => id !== targetId));
    showToast(newPrivate ? "Moved to Private Folder" : "Moved to Downloads");

    try {
      await updateDownloadItem(targetId, { isPrivate: newPrivate });
    } catch (err) {
      console.error("Toggle private error:", err);
    }
  };

  // 4. DELETE CONFIRMATION HANDLER
  const handleConfirmDelete = async () => {
    if (!deleteConfirmVideo) return;
    const targetId = deleteConfirmVideo.videoId || (deleteConfirmVideo as any).id;
    const targetUrl = deleteConfirmVideo.videoUrl;

    // Optimistic UI update
    setDownloadsList(prev => prev.filter(item => 
      item.videoId !== targetId && (item as any).id !== targetId && (!targetUrl || item.videoUrl !== targetUrl)
    ));
    setSelectedVideoIds(prev => prev.filter(id => id !== targetId));
    setDeleteConfirmVideo(null);
    showToast("Video deleted successfully");

    try {
      await deleteDownloadItem(targetId);
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  // BULK ACTIONS
  const handleBulkShare = async () => {
    const selectedItems = downloadsList.filter(v => selectedVideoIds.includes(v.videoId));
    if (selectedItems.length === 0) return;
    const formatShortLink = (url: string) => {
      const clean = (url || '').split('?')[0];
      const parts = clean.split('/');
      const lastPart = parts[parts.length - 1] || '';
      const publicId = lastPart.split('.')[0];
      return clean.includes('res.cloudinary.com') && publicId
        ? `https://res.cloudinary.com/xb0o3xwi/video/upload/${publicId}.mp4`
        : clean;
    };
    try {
      if (navigator.share && selectedItems.length === 1) {
        const item = selectedItems[0];
        const shareText = `👑 KING - Blue Official\n${item.title || item.videoId || 'KING Video'}\n\n${formatShortLink(item.videoUrl)}`;
        await navigator.share({ text: shareText });
        showToast("Shared successfully!");
      } else {
        const urls = selectedItems.map(i => `${i.title}: ${formatShortLink(i.videoUrl)}`).join('\n');
        await navigator.clipboard.writeText(urls);
        showToast(`${selectedItems.length} links copied to clipboard`);
      }
    } catch {
      showToast(`${selectedItems.length} links ready`);
    }
    setSelectedVideoIds([]);
    setIsSelectionMode(false);
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedVideoIds.length === 0) return;
    const idsToDelete = [...selectedVideoIds];

    // Optimistic UI update
    setDownloadsList(prev => prev.filter(item => !idsToDelete.includes(item.videoId) && !idsToDelete.includes((item as any).id)));
    setSelectedVideoIds([]);
    setShowBulkDeleteConfirm(false);
    setIsSelectionMode(false);
    showToast(`${idsToDelete.length} videos deleted`);

    try {
      for (const id of idsToDelete) {
        await deleteDownloadItem(id);
      }
    } catch (err) {
      console.error("Bulk delete error:", err);
    }
  };

  const handleBulkMovePrivate = async () => {
    if (selectedVideoIds.length === 0) return;
    const targetPrivate = downloadTab !== 'private';
    const idsToMove = [...selectedVideoIds];

    // Optimistic UI update
    setDownloadsList(prev => prev.map(item => 
      idsToMove.includes(item.videoId) || idsToMove.includes((item as any).id)
        ? { ...item, isPrivate: targetPrivate }
        : item
    ));
    setSelectedVideoIds([]);
    setIsSelectionMode(false);
    showToast(targetPrivate ? `${idsToMove.length} moved to Private Folder` : `${idsToMove.length} moved to Downloads`);

    try {
      for (const id of idsToMove) {
        await updateDownloadItem(id, { isPrivate: targetPrivate });
      }
    } catch (err) {
      console.error("Bulk move private error:", err);
    }
  };

  const formatVideoTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const togglePlay = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const video = videoPlayerRef.current;
    if (video) {
      console.log("togglePlay - video.src:", video.src, "readyState:", video.readyState, "paused:", video.paused, "error:", video.error);
      if (video.paused) {
        try {
          if (video.readyState < 2) {
            video.load();
          }
          await video.play();
          console.log("video.play() resolved successfully");
          setIsPlaying(true);
          startHideTimer();
        } catch (err: any) {
          if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) {
            console.log("video.play() request was interrupted (normal):", err);
          } else {
            console.error("video.play() rejected:", err);
            alert(`Playback failed: ${err instanceof Error ? err.message : 'Unable to play video'}`);
          }
          setIsPlaying(false);
        }
      } else {
        video.pause();
        setIsPlaying(false);
      }
    } else {
      console.warn("videoPlayerRef.current is null");
    }
  };

  const toggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (videoPlayerRef.current) {
      videoPlayerRef.current.muted = !videoPlayerRef.current.muted;
      setIsMuted(videoPlayerRef.current.muted);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = time;
    }
  };

  const toggleFullscreen = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (videoPlayerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        (videoPlayerRef.current as any).requestFullscreen?.().catch(() => {});
      }
    }
  };

  const startHideTimer = () => {
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (videoPlayerRef.current && !videoPlayerRef.current.paused) {
      hideControlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
        console.log("Controls Hidden");
      }, 3000);
    }
  };

  const handleVideoContainerClick = () => {
    console.log("Video Tapped");
    if (showControls) {
      setShowControls(false);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      console.log("Controls Hidden");
    } else {
      setShowControls(true);
      console.log("Controls Shown");
      startHideTimer();
    }
  };

  const getThumbnail = (v: any): string => {
    if (v.thumbnailUrl && typeof v.thumbnailUrl === 'string' && v.thumbnailUrl.trim()) return v.thumbnailUrl;
    if (v.thumbnail && typeof v.thumbnail === 'string' && v.thumbnail.trim()) return v.thumbnail;
    const videoUrl = v.videoUrl || v.url;
    if (videoUrl && typeof videoUrl === 'string' && videoUrl.includes('cloudinary.com')) {
      return videoUrl.replace(/\.[^/.]+$/, ".jpg");
    }
    return "";
  };

  const getChannelName = (v: any) => v.channelName || v.uploader || "KING Official";
  const getChannelInitial = (v: any) => getChannelName(v).charAt(0).toUpperCase() || "K";

  const formatViews = (count: number | undefined): string => {
    const num = count || 0;
    if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M views`;
    if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}K views`;
    return `${num} ${num === 1 ? 'view' : 'views'}`;
  };

  const formatTimeAgo = (timestamp: any): string => {
    if (!timestamp) return 'Recently';
    let date: Date;
    if (typeof timestamp?.toDate === 'function') date = timestamp.toDate();
    else if (timestamp?.seconds) date = new Date(timestamp.seconds * 1000);
    else date = new Date(timestamp);
    const now = new Date();
    const diff = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  };

  const handleDownload = async (v: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!v) return;
    setDownloadingId(v.id || v.videoId);
    try {
      await downloadVideoFile(v);
      setDownloadedIds(prev => ({ ...prev, [v.id || v.videoId]: true }));
    } catch (err) {
      console.error("Error downloading:", err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleShare = (v: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const fullUrl = v?.videoUrl || v?.url || '';
    const cleanBaseUrl = fullUrl.split('?')[0];
    const parts = cleanBaseUrl.split('/');
    const lastPart = parts[parts.length - 1] || '';
    const publicId = lastPart.split('.')[0];
    const shortLink =
      cleanBaseUrl.includes('res.cloudinary.com') && publicId
        ? `https://res.cloudinary.com/xb0o3xwi/video/upload/${publicId}.mp4`
        : cleanBaseUrl || window.location.href;
    const displayId = publicId || v?.title || v?.id || 'KING Video';
    const shareText = `👑 KING App\n\n🎬 ${displayId}\n\n▶️ Watch Now:\n${shortLink}`;
    if (navigator.share) {
      navigator.share({ text: shareText }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(shareText);
      showToast("Link Copied! Paste in WhatsApp");
    }
  };

  const refreshHistory = () => {
    const history = getHistory();
    setWatchHistory(history);
  };

  const refreshDownloads = async () => {
    const list = await loadDownloads();
    setDownloadsList(list);
  };

  const handleHistoryItemClick = async (item: any) => {
    console.log("History Item Clicked");
    console.log("History Item Clicked:", item);

    let url = item.videoUrl || item.url;

    // If videoUrl is missing, fetch it from Firestore videos collection
    if (!url && (item.videoId || item.id || item.title)) {
      try {
        const docId = item.videoId || item.id;
        if (docId) {
          const videoDoc = await getDoc(doc(db, "videos", docId));
          if (videoDoc.exists()) {
            const data = videoDoc.data();
            url = data?.videoUrl || data?.url;
          }
        }
        if (!url && item.title) {
          const q = query(collection(db, "videos"), where("title", "==", item.title), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const data = snap.docs[0].data();
            url = data?.videoUrl || data?.url;
          }
        }
      } catch (err) {
        console.error("Error fetching video from Firestore:", err);
      }
    }

    if (url) {
      console.log("Video URL Found");
      console.log("Video URL Found:", url);
      console.log("Playback Started");
      setActivePlayingVideo({
        ...item,
        url,
        title: item.title || 'Watched Video',
        poster: item.thumbnailUrl
      });
    } else {
      console.warn("No video URL found for this history item");
      alert("Video URL not available");
    }
  };

  const playDownloadItem = async (item: DownloadItem) => {
    console.log("Play Download Item:", item);
    let url = item.videoUrl;

    // If videoUrl is missing, try fetching from Firestore videos collection
    if (!url && item.videoId) {
      try {
        const videoDoc = await getDoc(doc(db, "videos", item.videoId));
        if (videoDoc.exists()) {
          const data = videoDoc.data();
          url = data?.videoUrl || data?.url;
        }
      } catch (err) {
        console.error("Error fetching video for download:", err);
      }
    }

    if (url) {
      console.log("Video URL Resolved:", url);
      setActivePlayingVideo({
        ...item,
        url,
        title: item.title || 'Downloaded Video',
        poster: item.thumbnailUrl
      });
    } else {
      console.warn("No video URL found for this download item");
      alert("Video URL not available");
    }
  };

  const handleDownloadItemClick = async (item: DownloadItem) => {
    await playDownloadItem(item);
  };

  const handlePreviousVideo = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!activePlayingVideo || downloadsList.length === 0) return;
    const idx = downloadsList.findIndex(v => (v.videoId && v.videoId === activePlayingVideo.videoId) || v.videoUrl === activePlayingVideo.videoUrl || v.videoUrl === (activePlayingVideo as any).url);
    const targetIdx = idx > 0 ? idx - 1 : downloadsList.length - 1;
    if (targetIdx >= 0 && targetIdx < downloadsList.length) {
      await playDownloadItem(downloadsList[targetIdx]);
    }
  };

  const handleNextVideo = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!activePlayingVideo || downloadsList.length === 0) return;
    const idx = downloadsList.findIndex(v => (v.videoId && v.videoId === activePlayingVideo.videoId) || v.videoUrl === activePlayingVideo.videoUrl || v.videoUrl === (activePlayingVideo as any).url);
    const targetIdx = (idx >= 0 && idx < downloadsList.length - 1) ? idx + 1 : 0;
    if (targetIdx >= 0 && targetIdx < downloadsList.length) {
      await playDownloadItem(downloadsList[targetIdx]);
    }
  };

  useEffect(() => {
    refreshHistory();
    refreshDownloads();
  }, []);

  useEffect(() => {
    const handleClickOutside = () => {
      if (activeMenuVideoId !== null) {
        setActiveMenuVideoId(null);
      }
    };
    if (activeMenuVideoId !== null) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [activeMenuVideoId]);

  useEffect(() => {
    if (activePlayingVideo && videoPlayerRef.current) {
      console.log("activePlayingVideo updated. URL:", activePlayingVideo.url);
      videoPlayerRef.current.load();
      videoPlayerRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) {
          console.log("Autoplay interrupted (normal):", err);
        } else {
          console.warn("Autoplay promise rejected or blocked:", err);
        }
        setIsPlaying(false);
      });
    }
  }, [activePlayingVideo]);

  const libraryItems = [
    { label: 'Downloads', count: `${downloadsList.length} offline videos`, icon: Download, color: 'text-emerald-400 bg-emerald-500/10' },
    { label: 'Liked Videos', count: '89 videos', icon: ThumbsUp, color: 'text-rose-400 bg-rose-500/10' },
    { label: 'Playlists', count: '4 created', icon: ListMusic, color: 'text-purple-400 bg-purple-500/10' },
    { label: 'Subscriptions', count: '28 channels', icon: UserCheck, color: 'text-amber-400 bg-amber-500/10' },
  ];

  return (
    <div className="p-4 pb-24 space-y-5">
      {/* History Shelf (Matching Screenshot Design) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center border border-blue-500/30 shadow">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white tracking-wide">History</h3>
              <p className="text-[10px] text-slate-400 leading-none mt-0.5">Recently watched videos</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              refreshHistory();
              setShowHistoryModal(true);
            }}
            className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-0.5 cursor-pointer"
          >
            See all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {watchHistory.length === 0 ? (
          <div className="bg-[#0b1220] border border-slate-800/80 rounded-3xl p-6 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto">
              <History className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-white">No history yet</p>
            <p className="text-[11px] text-slate-400">Watch videos from the Videos section to see them here!</p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none pr-1">
            {watchHistory.slice(0, 6).map((video: any, index: number) => {
              const isShelfMenuOpen = activeHistoryMenuIndex === index;
              return (
                <div
                  key={video.videoId || index}
                  onClick={() => handleHistoryItemClick(video)}
                  className="w-44 sm:w-48 flex-shrink-0 bg-[#0b1220] hover:bg-[#101b30] border border-slate-800/80 hover:border-sky-500/50 rounded-2xl p-2.5 flex flex-col justify-between transition cursor-pointer group active:scale-[0.99] relative"
                >
                  {/* Thumbnail */}
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-900 shadow-md">
                    {video.thumbnailUrl ? (
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={(e: any) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">🎬</div>
                    )}
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
                      <Play className="w-4 h-4 text-white fill-current opacity-75 group-hover:opacity-100 group-hover:scale-110 text-sky-400 transition-all" />
                    </div>
                    <div className="absolute bottom-1 right-1 bg-black/85 text-[9px] text-white font-mono px-1.5 py-0.5 rounded font-bold">
                      {video.duration || '12:45'}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="mt-2 min-w-0 pr-5">
                    <h4 
                      className="text-xs font-bold text-white line-clamp-2 group-hover:text-sky-300 transition-colors leading-snug"
                      title={video.title}
                    >
                      {video.title}
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-1 truncate font-medium">
                      {video.channelName || video.uploader || 'Stage Drama Official'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate font-mono">
                      {video.views || '1.2M views'} • {video.watchedAt ? new Date(video.watchedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '2 days ago'}
                    </p>
                  </div>

                  {/* Watched Badge */}
                  <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between">
                    <div className="bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm">
                      <Check className="w-3 h-3" /> Watched
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveHistoryMenuIndex(isShelfMenuOpen ? null : index);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                      title="Options"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Dropdown Menu */}
                  {isShelfMenuOpen && (
                    <div 
                      className="absolute right-2 bottom-10 z-50 w-[140px] bg-[#0c1424] border border-slate-800 rounded-xl shadow-xl py-1 text-xs font-semibold text-white animate-in fade-in zoom-in-95 duration-100" 
                      onClick={e => { e.stopPropagation(); e.preventDefault(); }}
                      onPointerDown={e => e.stopPropagation()}
                      onTouchStart={e => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setActiveHistoryMenuIndex(null);
                          const newHistory = watchHistory.filter((_, i) => i !== index);
                          localStorage.setItem('king_watch_history', JSON.stringify(newHistory));
                          refreshHistory();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-800/60 flex items-center gap-2 text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Library Navigation Options */}
      <div className="space-y-2 pt-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Personal Media & Library
        </h3>
        <div className="bg-[#0b1220] border border-slate-800/80 rounded-3xl divide-y divide-slate-800/60 overflow-hidden shadow-lg">
          {libraryItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                onClick={
                  item.label === 'History'
                    ? () => {
                        refreshHistory();
                        setShowHistoryModal(true);
                      }
                    : item.label === 'Downloads'
                    ? () => {
                        refreshDownloads();
                        setShowDownloadsModal(true);
                      }
                    : () => alert(`Opening ${item.label} (${item.count})`)
                }
                className="flex items-center justify-between p-3.5 hover:bg-slate-800/40 cursor-pointer transition"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${item.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{item.label}</div>
                    <div className="text-[10px] text-slate-400">{item.count}</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </div>
            );
          })}
        </div>
      </div>



      {/* Watch History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md sm:max-w-lg bg-[#0c1424] border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl relative flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shadow">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Watch History</h3>
                  <p className="text-[10px] text-slate-400 leading-none mt-0.5">{watchHistory.length} videos watched</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {watchHistory.length > 0 && (
                  <button
                    onClick={() => {
                      clearHistory();
                      refreshHistory();
                    }}
                    className="text-[10px] font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 px-2.5 py-1 rounded-xl transition cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto mt-3 space-y-2.5 pr-1">
              {watchHistory.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto">
                    <History className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-bold text-white">No history yet</div>
                  <p className="text-xs text-slate-400">
                    Watch videos from the Videos section to see your watch history here!
                  </p>
                </div>
              ) : (
                watchHistory.map((video: any, index: number) => {
                  const isHistoryMenuOpen = activeHistoryMenuIndex === index;
                  return (
                    <div
                      key={video.videoId || index}
                      onClick={() => handleHistoryItemClick(video)}
                      className="relative flex items-center gap-3.5 bg-[#0b1220] hover:bg-[#101b30] p-2.5 rounded-2xl border border-slate-800/80 hover:border-sky-500/50 transition cursor-pointer group active:scale-[0.99]"
                    >
                      {/* Thumbnail with 16:9 aspect ratio and duration */}
                      <div className="relative w-32 h-20 sm:w-36 sm:h-20 rounded-xl overflow-hidden bg-slate-900 flex-shrink-0 shadow-md">
                        {video.thumbnailUrl ? (
                          <img
                            src={video.thumbnailUrl}
                            alt={video.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            onError={(e: any) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">🎬</div>
                        )}
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
                          <Play className="w-4 h-4 text-white fill-current opacity-75 group-hover:opacity-100 group-hover:scale-110 text-sky-400 transition-all" />
                        </div>
                        <div className="absolute bottom-1 right-1 bg-black/85 text-[9px] text-white font-mono px-1.5 py-0.5 rounded font-bold">
                          {video.duration || '3:45'}
                        </div>
                      </div>

                      {/* YouTube Style Details: Title, Channel, Watch Info */}
                      <div className="flex-1 min-w-0 pr-6 py-0.5">
                        <h4 
                          className="text-xs font-bold text-white line-clamp-2 group-hover:text-sky-300 transition-colors leading-snug"
                          title={video.title}
                        >
                          {video.title}
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-1 truncate font-medium flex items-center gap-1.5">
                          <span>{video.channelName || video.uploader || 'KING Official'}</span>
                          <span>•</span>
                          <span>{video.views || '1.2K views'}</span>
                        </p>
                        <p className="text-[10px] text-sky-400 mt-1 flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          <span>Watched {video.watchedAt ? new Date(video.watchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}</span>
                        </p>
                      </div>

                      {/* Three-Dot Menu Button */}
                      <div className="absolute right-2 top-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveHistoryMenuIndex(isHistoryMenuOpen ? null : index);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition cursor-pointer"
                          title="Options"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Dropdown Menu */}
                        {isHistoryMenuOpen && (
                          <div 
                            className="absolute right-0 top-8 z-50 w-[150px] bg-[#0c1424] border border-slate-800 rounded-xl shadow-xl py-1 text-xs font-semibold text-white animate-in fade-in zoom-in-95 duration-100" 
                            onClick={e => { e.stopPropagation(); e.preventDefault(); }}
                            onPointerDown={e => e.stopPropagation()}
                            onTouchStart={e => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setActiveHistoryMenuIndex(null);
                                const newHistory = watchHistory.filter((_, i) => i !== index);
                                localStorage.setItem('king_watch_history', JSON.stringify(newHistory));
                                refreshHistory();
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-slate-800/60 flex items-center gap-2 text-red-400 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Downloads / MX Player-Inspired Media Library */}
      {showDownloadsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full h-[100dvh] sm:h-[90vh] sm:max-h-[850px] sm:max-w-lg bg-[#0c1424] sm:border sm:border-slate-800 sm:rounded-3xl p-3 sm:p-5 shadow-2xl relative flex flex-col overflow-hidden">
            {/* Top Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-black font-bold flex items-center justify-center shadow-md">
                  <Download className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">KING Media</h3>
                  <p className="text-[10px] text-slate-400 leading-none mt-0.5">{downloadsList.length} offline files</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowSearchInput(!showSearchInput)}
                  className={`p-1.5 rounded-xl transition cursor-pointer ${showSearchInput ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  title="Search Media"
                >
                  <Search className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsListView(!isListView)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title={isListView ? "Card View" : "List View"}
                >
                  {isListView ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => setShowDownloadsModal(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Search Input Bar (when toggled) */}
            {showSearchInput && (
              <div className="mt-2 animate-in fade-in duration-200">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search downloaded videos & audio..."
                    className="w-full bg-[#070c17] text-white pl-9 pr-3 py-1.5 rounded-xl border border-slate-700/80 text-xs focus:outline-none focus:border-emerald-400"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Compact Second Row: Tabs (Videos, Audio, Private Folder) */}
            <div className="grid grid-cols-3 gap-1.5 mt-2 p-1 bg-[#070c17] rounded-xl border border-slate-800/80">
              <button
                type="button"
                onClick={() => setDownloadTab('videos')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  downloadTab === 'videos'
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Video className="w-3.5 h-3.5" /> Videos ({downloadsList.filter(v => !v.isPrivate).length})
              </button>

              <button
                type="button"
                onClick={() => setDownloadTab('audio')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  downloadTab === 'audio'
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Music className="w-3.5 h-3.5" /> Audio
              </button>

              <button
                type="button"
                onClick={() => setDownloadTab('private')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  downloadTab === 'private'
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Lock className="w-3.5 h-3.5" /> Private ({downloadsList.filter(v => v.isPrivate).length})
              </button>
            </div>

            {/* Tab Content Area */}
            <div className="flex-1 overflow-y-auto mt-3 space-y-2.5 pr-1 relative pb-16">
              {downloadTab === 'videos' || downloadTab === 'private' ? (
                <div>
                  {downloadsList.filter(v => {
                    const matchesSearch = v.title.toLowerCase().includes(searchQuery.toLowerCase());
                    if (downloadTab === 'private') return matchesSearch && v.isPrivate;
                    return matchesSearch && !v.isPrivate;
                  }).length === 0 ? (
                    <div className="py-16 text-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-xl">
                        {downloadTab === 'private' ? <Lock className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                      </div>
                      <div className="text-sm font-bold text-white">
                        {downloadTab === 'private' ? 'Private Folder is Empty' : 'No Videos Found'}
                      </div>
                      <p className="text-xs text-slate-400">
                        {searchQuery ? 'No downloads match your search.' : (downloadTab === 'private' ? 'Move downloaded videos here to keep them private.' : 'Download any video from the feed to watch offline!')}
                      </p>
                    </div>
                  ) : (
                    <div className={isListView ? "space-y-2" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>
                      {downloadsList
                        .filter(v => {
                          const matchesSearch = v.title.toLowerCase().includes(searchQuery.toLowerCase());
                          if (downloadTab === 'private') return matchesSearch && v.isPrivate;
                          return matchesSearch && !v.isPrivate;
                        })
                        .map((video: DownloadItem, index: number) => {
                          const isSelected = selectedVideoIds.includes(video.videoId);
                          const isMenuOpen = activeMenuVideoId === video.videoId;

                          return (
                            <div
                              key={video.videoId || index}
                              onTouchStart={() => startLongPress(video.videoId)}
                              onTouchEnd={cancelLongPress}
                              onMouseDown={() => startLongPress(video.videoId)}
                              onMouseUp={cancelLongPress}
                              onClick={() => {
                                if (isSelectionMode || selectedVideoIds.length > 0) {
                                  toggleSelectVideo(video.videoId);
                                } else {
                                  setShowDownloadsModal(false);
                                  handleDownloadItemClick(video);
                                }
                              }}
                              className={`relative flex ${isListView ? 'items-center gap-3 p-2' : 'flex-col p-2'} bg-[#070c17] hover:bg-[#0d1627] rounded-2xl border ${isSelected ? 'border-emerald-500 bg-emerald-950/20' : 'border-slate-800/80 hover:border-emerald-500/50'} transition cursor-pointer group active:scale-[0.99]`}
                            >
                              {/* Checkbox */}
                              {(isSelectionMode || isSelected) && (
                                <div className="absolute top-3 left-3 z-20">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => toggleSelectVideo(video.videoId, e as any)}
                                    className="w-4 h-4 accent-emerald-500 cursor-pointer rounded"
                                  />
                                </div>
                              )}

                              {/* Thumbnail */}
                              <div className={`relative ${isListView ? 'w-20 h-14 rounded-xl' : 'w-full aspect-video rounded-xl'} overflow-hidden bg-slate-950 flex-shrink-0`}>
                                {video.thumbnailUrl ? (
                                  <img
                                    src={video.thumbnailUrl}
                                    alt={video.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    onError={(e: any) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-500 text-xs">
                                    🎬
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                  <Play className="w-4 h-4 text-white fill-current opacity-75 group-hover:opacity-100 group-hover:scale-110 text-emerald-400 transition-all" />
                                </div>
                              </div>

                              {/* Title & Date & Three-Dot Menu */}
                              <div className="flex-1 min-w-0 pt-1.5 flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <h4 
                                    className="text-xs font-bold text-white truncate group-hover:text-emerald-300 transition-colors"
                                    title={video.title}
                                  >
                                    {video.title}
                                  </h4>
                                  <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 font-mono">
                                    <Calendar className="w-3 h-3 text-emerald-400" />
                                    {video.downloadedAt ? new Date(video.downloadedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Downloaded'}
                                  </p>
                                </div>

                                {/* Three-Dot Menu Button */}
                                <div 
                                  className="relative flex-shrink-0"
                                  onClick={(e) => { e.stopPropagation(); }}
                                  onPointerDown={(e) => { e.stopPropagation(); }}
                                  onTouchStart={(e) => { e.stopPropagation(); }}
                                  onMouseDown={(e) => { e.stopPropagation(); }}
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      setActiveMenuVideoId(isMenuOpen ? null : video.videoId);
                                    }}
                                    onPointerDown={(e) => { e.stopPropagation(); }}
                                    onTouchStart={(e) => { e.stopPropagation(); }}
                                    onMouseDown={(e) => { e.stopPropagation(); }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                                    title="Options"
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </button>

                                  {/* Dropdown Menu (Compact 4 options) */}
                                  {isMenuOpen && (
                                    <div 
                                      className="absolute right-0 top-8 z-50 w-44 bg-[#0c1424] border border-slate-700/80 rounded-xl shadow-2xl py-1 text-xs font-semibold text-white animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-800/80" 
                                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                      onPointerDown={(e) => { e.stopPropagation(); }}
                                      onTouchStart={(e) => { e.stopPropagation(); }}
                                      onMouseDown={(e) => { e.stopPropagation(); }}
                                    >
                                      <div className="py-0.5">
                                        {/* 1. Rename */}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            setActiveMenuVideoId(null);
                                            setRenameModalVideo(video);
                                            setRenameInputTitle(video.title);
                                          }}
                                          onPointerDown={(e) => { e.stopPropagation(); }}
                                          onTouchStart={(e) => { e.stopPropagation(); }}
                                          className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2 text-slate-200 cursor-pointer transition-colors"
                                        >
                                          <Edit3 className="w-3.5 h-3.5 text-cyan-400" /> Rename
                                        </button>

                                        {/* 2. Share */}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            handleShareVideo(video, e);
                                          }}
                                          onPointerDown={(e) => { e.stopPropagation(); }}
                                          onTouchStart={(e) => { e.stopPropagation(); }}
                                          className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2 text-slate-200 cursor-pointer transition-colors"
                                        >
                                          <Share2 className="w-3.5 h-3.5 text-emerald-400" /> Share
                                        </button>

                                        {/* 3. Move to Private / Move to Downloads */}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            handleTogglePrivate(video, e);
                                          }}
                                          onPointerDown={(e) => { e.stopPropagation(); }}
                                          onTouchStart={(e) => { e.stopPropagation(); }}
                                          className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2 text-amber-300 cursor-pointer transition-colors"
                                        >
                                          <Lock className="w-3.5 h-3.5" /> {video.isPrivate ? 'Move to Downloads' : 'Move to Private'}
                                        </button>
                                      </div>

                                      <div className="py-0.5">
                                        {/* 4. Delete */}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            setActiveMenuVideoId(null);
                                            setDeleteConfirmVideo(video);
                                          }}
                                          onPointerDown={(e) => { e.stopPropagation(); }}
                                          onTouchStart={(e) => { e.stopPropagation(); }}
                                          className="w-full text-left px-3 py-2 hover:bg-red-950/40 flex items-center gap-2 text-red-400 cursor-pointer transition-colors"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" /> Delete
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              ) : (
                /* AUDIO TAB */
                <div>
                  {downloadsList.filter(v => !v.isPrivate && v.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                    <div className="py-16 text-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-xl">
                        <Music className="w-6 h-6" />
                      </div>
                      <div className="text-sm font-bold text-white">No Audio Found</div>
                      <p className="text-xs text-slate-400">
                        {searchQuery ? 'No audio matches your search.' : 'Downloaded videos are automatically available as audio tracks!'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {downloadsList
                        .filter(v => !v.isPrivate && v.title.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((video: DownloadItem, index: number) => {
                          const isCurrentAudio = activeAudio?.videoId === video.videoId;
                          return (
                            <div
                              key={video.videoId || index}
                              onClick={() => {
                                setActiveAudio(video);
                                setAudioIsPlaying(true);
                                if (audioElementRef.current) {
                                  audioElementRef.current.src = video.videoUrl;
                                  audioElementRef.current.play().catch(() => {});
                                }
                              }}
                              className={`flex items-center gap-3 p-2.5 rounded-2xl border transition cursor-pointer group active:scale-[0.99] ${
                                isCurrentAudio 
                                  ? 'bg-emerald-950/40 border-emerald-500/60' 
                                  : 'bg-[#070c17] hover:bg-[#0d1627] border-slate-800/80 hover:border-emerald-500/40'
                              }`}
                            >
                              {/* Audio Icon / Thumbnail */}
                              <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-900 flex-shrink-0 flex items-center justify-center text-emerald-400 border border-slate-800">
                                {video.thumbnailUrl ? (
                                  <img
                                    src={video.thumbnailUrl}
                                    alt={video.title}
                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100"
                                    onError={(e: any) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <Music className="w-5 h-5 text-emerald-400" />
                                )}
                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                  {isCurrentAudio && audioIsPlaying ? (
                                    <span className="flex items-center gap-0.5">
                                      <span className="w-1 h-3 bg-emerald-400 animate-pulse rounded-full" />
                                      <span className="w-1 h-4 bg-emerald-400 animate-pulse delay-75 rounded-full" />
                                      <span className="w-1 h-2 bg-emerald-400 animate-pulse delay-150 rounded-full" />
                                    </span>
                                  ) : (
                                    <Play className="w-4 h-4 text-white fill-current opacity-70 group-hover:opacity-100 text-emerald-400" />
                                  )}
                                </div>
                              </div>

                              {/* Title & Artist */}
                              <div className="flex-1 min-w-0">
                                <h4 
                                  className={`text-xs font-bold truncate transition-colors ${isCurrentAudio ? 'text-emerald-300' : 'text-white group-hover:text-emerald-300'}`}
                                  title={video.title}
                                >
                                  {video.title}
                                </h4>
                                <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 font-mono">
                                  <span>KING Official Audio</span>
                                  <span>•</span>
                                  <span>{video.downloadedAt ? new Date(video.downloadedAt).toLocaleDateString() : 'Offline'}</span>
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isCurrentAudio && audioIsPlaying) {
                                    setAudioIsPlaying(false);
                                    audioElementRef.current?.pause();
                                  } else {
                                    setActiveAudio(video);
                                    setAudioIsPlaying(true);
                                    if (audioElementRef.current) {
                                      audioElementRef.current.src = video.videoUrl;
                                      audioElementRef.current.play().catch(() => {});
                                    }
                                  }
                                }}
                                className="w-9 h-9 rounded-full bg-slate-800 hover:bg-emerald-500 hover:text-black text-slate-300 flex items-center justify-center transition shadow"
                              >
                                {isCurrentAudio && audioIsPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bulk Action Bar (when items are selected) */}
            {selectedVideoIds.length > 0 && (
              <div className="absolute bottom-0 left-0 right-0 z-40 bg-[#070c17] border-t border-slate-800 p-3 flex items-center justify-between animate-in slide-in-from-bottom duration-200">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVideoIds([]);
                      setIsSelectionMode(false);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    title="Close Selection"
                  >
                    ✕
                  </button>
                  <span className="text-xs font-bold text-emerald-400">{selectedVideoIds.length} selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBulkShare}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkMovePrivate}
                    className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" /> {downloadTab === 'private' ? 'Move to Downloads' : 'Private Folder'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBulkDeleteConfirm(true)}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Mini Audio Player Bar (when audio is active) */}
            {activeAudio && (
              <div className="mt-3 pt-3 border-t border-slate-800 bg-[#070c17] -mx-4 -mb-4 p-4 rounded-b-3xl flex flex-col gap-2">
                <audio
                  ref={audioElementRef}
                  src={activeAudio.videoUrl}
                  autoPlay
                  onPlay={() => setAudioIsPlaying(true)}
                  onPause={() => setAudioIsPlaying(false)}
                  onTimeUpdate={(e) => setAudioCurrentTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration || 0)}
                  onEnded={() => setAudioIsPlaying(false)}
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 overflow-hidden flex-shrink-0 border border-slate-800">
                      {activeAudio.thumbnailUrl ? (
                        <img src={activeAudio.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-emerald-400">🎵</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{activeAudio.title}</p>
                      <p className="text-[10px] text-emerald-400 font-mono">Playing Audio Track</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (audioIsPlaying) {
                          setAudioIsPlaying(false);
                          audioElementRef.current?.pause();
                        } else {
                          setAudioIsPlaying(true);
                          audioElementRef.current?.play().catch(() => {});
                        }
                      }}
                      className="w-10 h-10 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow-lg hover:bg-emerald-400 transition cursor-pointer"
                    >
                      {audioIsPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        audioElementRef.current?.pause();
                        setActiveAudio(null);
                        setAudioIsPlaying(false);
                      }}
                      className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
                      title="Close Audio"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TOAST NOTIFICATION */}
            {toastMessage && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-black font-bold text-xs px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150 pointer-events-none">
                <CheckCircle2 className="w-4 h-4 text-black flex-shrink-0" />
                <span>{toastMessage}</span>
              </div>
            )}

            {/* RENAME MODAL */}
            {renameModalVideo && (
              <div 
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-100"
                onClick={() => setRenameModalVideo(null)}
              >
                <div 
                  className="w-full max-w-sm bg-[#0c1424] border border-slate-700/80 rounded-2xl p-4 shadow-2xl text-left space-y-3"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                      <Edit3 className="w-4 h-4" />
                      <span>Rename Video</span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setRenameModalVideo(null)}
                      className="text-slate-400 hover:text-white text-sm"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleRenameConfirm} className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400 font-medium">Video Title</label>
                      <input 
                        type="text"
                        value={renameInputTitle}
                        onChange={e => setRenameInputTitle(e.target.value)}
                        placeholder="Enter new title..."
                        className="w-full bg-[#070c17] text-white px-3 py-2 rounded-xl border border-slate-700 text-xs focus:outline-none focus:border-cyan-400"
                        autoFocus
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setRenameModalVideo(null)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!renameInputTitle.trim()}
                        className="px-4 py-1.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-black transition disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* SINGLE DELETE CONFIRMATION MODAL */}
            {deleteConfirmVideo && (
              <div 
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-100"
                onClick={() => setDeleteConfirmVideo(null)}
              >
                <div 
                  className="w-full max-w-sm bg-[#0c1424] border border-slate-700/80 rounded-2xl p-4 shadow-2xl text-left space-y-3"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                    <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </div>
                    <span>Delete Download?</span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    Are you sure you want to delete <span className="font-bold text-white">"{deleteConfirmVideo.title}"</span>? This will remove the offline video from your device.
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmVideo(null)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      className="px-4 py-1.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition shadow-lg shadow-red-900/30"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* BULK DELETE CONFIRMATION MODAL */}
            {showBulkDeleteConfirm && (
              <div 
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-100"
                onClick={() => setShowBulkDeleteConfirm(false)}
              >
                <div 
                  className="w-full max-w-sm bg-[#0c1424] border border-slate-700/80 rounded-2xl p-4 shadow-2xl text-left space-y-3"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                    <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </div>
                    <span>Delete {selectedVideoIds.length} Downloads?</span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    Are you sure you want to delete all <span className="font-bold text-white">{selectedVideoIds.length}</span> selected offline videos?
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowBulkDeleteConfirm(false)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmBulkDelete}
                      className="px-4 py-1.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition shadow-lg shadow-red-900/30"
                    >
                      Delete All
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Video Playback Modal (Downloads and History Player - HD Video Player Layout) */}
      {activePlayingVideo && (
        <div 
          ref={playerScrollRef}
          className="fixed inset-0 z-50 bg-black flex flex-col w-full h-[100dvh] overflow-hidden animate-in fade-in duration-150 select-none"
        >
          {/* STICKY PLAYER CONTAINER - FULLSCREEN */}
          <div 
            className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden"
            onClick={handleVideoContainerClick}
          >
            {/* Top Bar: Back Button (Left) & Bookmark + 3-Dot Menu (Right) */}
            {!isLocked && (
              <div 
                className={`absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none transition-opacity duration-300 ${
                  showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActivePlayingVideo(null);
                    setShowDownloadsModal(true);
                  }}
                  className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-md transition pointer-events-auto shadow-lg cursor-pointer active:scale-95"
                  title="Back"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-3 pointer-events-auto">
                  <div 
                    className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center backdrop-blur-md border border-emerald-500/40 shadow"
                    title="Saved Video"
                  >
                    <Check className="w-4 h-4" />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowMenu(!showMenu)}
                    className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-md transition shadow-lg cursor-pointer active:scale-95 relative"
                    title="More Options"
                    aria-label="More Options"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>

                {/* 3-Dot Dropdown Menu */}
                {showMenu && (
                  <div className="absolute top-14 right-4 z-50 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 text-xs font-semibold text-white pointer-events-auto animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        if (videoPlayerRef.current && (videoPlayerRef.current as any).requestFullscreen) {
                          (videoPlayerRef.current as any).requestFullscreen().catch(() => {});
                        }
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                    >
                      <Maximize2 className="w-4 h-4 text-cyan-400" /> Full Screen
                    </button>

                    <div className="px-4 py-2 border-t border-slate-800">
                      <p className="text-[10px] text-slate-400 mb-1">Playback Speed: {playbackSpeed}x</p>
                      <div className="grid grid-cols-5 gap-1">
                        {[0.5, 1, 1.25, 1.5, 2].map((spd) => (
                          <button
                            key={spd}
                            type="button"
                            onClick={() => {
                              setPlaybackSpeed(spd);
                              if (videoPlayerRef.current) videoPlayerRef.current.playbackRate = spd;
                            }}
                            className={`py-1 rounded text-[10px] font-bold ${playbackSpeed === spd ? 'bg-emerald-500 text-black' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                          >
                            {spd}x
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsLooping(!isLooping);
                        if (videoPlayerRef.current) videoPlayerRef.current.loop = !isLooping;
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-800 flex items-center justify-between cursor-pointer border-t border-slate-800"
                    >
                      <span className="flex items-center gap-2.5">
                        <Repeat className="w-4 h-4 text-amber-400" /> Loop Video
                      </span>
                      <span className={`w-3 h-3 rounded-full border ${isLooping ? 'bg-amber-400 border-amber-400' : 'border-slate-600'}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        setIsLocked(true);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer border-t border-slate-800 text-amber-300"
                    >
                      <Lock className="w-4 h-4" /> Lock Screen
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Lock Mode Overlay */}
            {isLocked && (
              <div 
                className="absolute inset-0 z-50 bg-transparent flex items-start justify-start p-4 cursor-default"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIsLocked(false);
                  }}
                  className="pointer-events-auto w-11 h-11 rounded-full bg-black/95 text-amber-400 flex items-center justify-center backdrop-blur-md shadow-2xl border border-amber-500/60 cursor-pointer active:scale-95 transition"
                  title="Tap to Unlock"
                >
                  <Lock className="w-5 h-5 text-amber-400 animate-pulse" />
                </button>
              </div>
            )}

            {/* Video Element (Full screen fitting width/height without stretch) */}
            <video
              ref={videoPlayerRef}
              key={activePlayingVideo.url}
              src={activePlayingVideo.url}
              poster={getThumbnail(activePlayingVideo)}
              controls={false}
              autoPlay
              playsInline
              loop={isLooping}
              className={`w-full h-full object-contain ${libraryVideoAspect === 'portrait' ? 'max-h-screen' : 'w-full h-full'}`}
              onLoadedMetadata={(e) => {
                const el = e.currentTarget;
                console.log("Video loadedmetadata - duration:", el.duration, "readyState:", el.readyState, "src:", el.src);
                const w = el.videoWidth;
                const h = el.videoHeight;
                setDuration(el.duration || 0);
                if (h > w) {
                  setLibraryVideoAspect('portrait');
                } else {
                  setLibraryVideoAspect('landscape');
                }
              }}
              onCanPlay={(e) => {
                const el = e.currentTarget;
                console.log("Video canplay - readyState:", el.readyState, "paused:", el.paused);
                el.play().then(() => {
                  setIsPlaying(true);
                  startHideTimer();
                }).catch((err) => {
                  console.warn("Autoplay promise rejected/blocked:", err);
                  setIsPlaying(false);
                });
              }}
              onPlay={() => {
                console.log("Video event: play");
                setIsPlaying(true);
                startHideTimer();
              }}
              onPlaying={() => {
                console.log("Video event: playing");
                setIsPlaying(true);
              }}
              onPause={() => {
                console.log("Video event: pause");
                setIsPlaying(false);
                if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
                setShowControls(true);
              }}
              onError={(e) => {
                const err = e.currentTarget.error;
                console.error("Video error event - code:", err?.code, "message:", err?.message, "src:", e.currentTarget.src);
                alert(`Playback Error: ${err?.message || 'Could not play video file.'}`);
              }}
              onTimeUpdate={(e) => {
                setCurrentTime(e.currentTarget.currentTime);
              }}
              onEnded={() => {
                console.log("Video event: ended");
                setIsPlaying(false);
                if (isLooping && videoPlayerRef.current) {
                  videoPlayerRef.current.currentTime = 0;
                  videoPlayerRef.current.play().catch(() => {});
                }
              }}
            />

            {/* Bottom Overlay Controls (HD Video Player Layout) */}
            {!isLocked && showControls && (
              <div 
                className="absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-4 py-4 flex flex-col gap-3 transition-opacity duration-300 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Progress Bar & Time */}
                <div className="flex flex-col gap-1">
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-slate-600/80 rounded-lg appearance-none cursor-pointer accent-emerald-400 hover:accent-emerald-300"
                  />
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 px-0.5">
                    <span>{formatVideoTime(currentTime)}</span>
                    <span>{formatVideoTime(duration)}</span>
                  </div>
                </div>

                {/* Main Controls Row: Screen-Lock (Left), Center Playback Controls (Prev | Play/Pause | Next), Volume/Fullscreen (Right) */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setIsLocked(true)}
                    className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-amber-400 flex items-center justify-center backdrop-blur-md transition shadow cursor-pointer active:scale-95 border border-amber-500/30"
                    title="Lock Screen"
                    aria-label="Lock Screen"
                  >
                    <Lock className="w-4 h-4 text-amber-400" />
                  </button>

                  {/* Bottom-Center Playback Controls: Previous | Play/Pause | Next */}
                  <div className="flex items-center gap-4 bg-black/60 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                    <button
                      type="button"
                      onClick={handlePreviousVideo}
                      className="p-1.5 text-white hover:text-emerald-400 transition cursor-pointer active:scale-95"
                      title="Previous Video"
                    >
                      <SkipBack className="w-5 h-5 fill-current" />
                    </button>

                    <button
                      type="button"
                      onClick={togglePlay}
                      className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center transition cursor-pointer active:scale-95 shadow-lg"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={handleNextVideo}
                      className="p-1.5 text-white hover:text-emerald-400 transition cursor-pointer active:scale-95"
                      title="Next Video"
                    >
                      <SkipForward className="w-5 h-5 fill-current" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="p-2 text-white hover:text-emerald-400 transition cursor-pointer"
                      title={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                    </button>

                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      className="p-2 text-white hover:text-emerald-400 transition cursor-pointer"
                      title="Fullscreen"
                    >
                      <Maximize2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
