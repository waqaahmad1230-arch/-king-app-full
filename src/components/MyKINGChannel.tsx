import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Settings as SettingsIcon, 
  Heart, 
  Bell, 
  Check, 
  LogOut, 
  ShieldCheck, 
  Trash2, 
  ExternalLink, 
  UserCheck, 
  Play, 
  Plus, 
  X,
  Edit2,
  Sparkles,
  SkipBack,
  SkipForward,
  Download,
  Facebook,
  Users
} from 'lucide-react';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  collection,
  getDocs,
  serverTimestamp,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { 
  updateProfile, 
  signOut, 
  signInWithPopup, 
  GoogleAuthProvider, 
  FacebookAuthProvider,
  User as FirebaseUser
} from 'firebase/auth';
import { auth, db, storage } from '../firebase';
import { generateVideoThumbnail, getVideoDuration } from '../utils/videoUtils';
import { saveToHistory } from '../utils/historyUtils';
import { downloadVideoFile } from '../utils/downloadUtils';
import { useAuth } from '../context/AuthContext';
import CreatorAvatar from './CreatorAvatar';
import {
  ProfileRelationshipBar,
  SocialHubSection,
  StatusPrivacySettingsCard,
} from './SocialNetworkPanel';
import {
  subscribeMyFollowers,
  subscribeMyFollowing,
  subscribeMyFriendships,
} from '../services/socialGraphService';
import {
  markAllMyNotificationsRead,
  markNotificationRead,
  subscribeMyNotifications,
} from '../services/statusService';
import { AppNotificationRecord } from '../types/social';

export interface ChannelVideoItem {
  id: string | number;
  title: string;
  views: string;
  img: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  url?: string;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  duration?: string;
  uri?: string;
  uploadedAt?: string;
  crossPostedPlatforms?: string[];
  userId?: string;
  uid?: string;
  channelAvatar?: string;
  uploaderPhoto?: string;
  likes?: number;
}
// ... rest of the component


interface MyKINGChannelProps {
  isOpen?: boolean;
  onClose: () => void;
  currentUser: FirebaseUser | null;
  profileUserId?: string | null;
  onOpenTab?: (tab: 'home' | 'games' | 'videos' | 'library') => void;
}

export default function MyKINGChannel({ isOpen, onClose, currentUser, profileUserId, onOpenTab }: MyKINGChannelProps) {
  const authUser = currentUser || auth.currentUser;
  const signedInUid = authUser?.uid || '';
  const [internalProfileUid, setInternalProfileUid] = useState<string | null>(null);
  const [socialCounts, setSocialCounts] = useState({ friends: 0, incomingRequests: 0, followers: 0, following: 0 });
  const openAuthModal = (_mode: string) => {
    alert('Please sign in first');
  };

  // Navigation sub-views: channel, settings, liked, notifications
  const [subView, setSubView] = useState<'channel' | 'settings' | 'liked' | 'notifications'>('channel');
  
  // Real Firestore Data States
  const [subscribersCount, setSubscribersCount] = useState<number>(1340);
  const [videoCount, setVideoCount] = useState<number>(6);
  const [activeTab, setActiveTab] = useState<'videos' | 'subs'>('videos');
  
  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Social Links State (Firestore Synced)
  const [socialLinks, setSocialLinks] = useState({
    whatsapp: '',
    facebook: '',
    youtube: '',
    instagram: '',
    tiktok: '',
  });
  const [savingSocialKey, setSavingSocialKey] = useState<string | null>(null);

  const activeTargetProfileUid = internalProfileUid ?? profileUserId ?? null;
  const effectiveUserId = activeTargetProfileUid || signedInUid;
  const isViewingOtherCreator = Boolean(
    activeTargetProfileUid && activeTargetProfileUid !== signedInUid
  );

  // Meta Business Connections State
  const [metaConnections, setMetaConnections] = useState<any[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const fetchMetaConnections = async () => {
    if (!auth.currentUser) return;
    try {
      setLoadingMeta(true);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/meta/connections', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMetaConnections(data.connections || []);
      }
    } catch (err) {
      console.error('Error fetching meta connections:', err);
    } finally {
      setLoadingMeta(false);
    }
  };

  useEffect(() => {
    if (signedInUid && !isViewingOtherCreator) {
      fetchMetaConnections();
    }
  }, [signedInUid, isViewingOtherCreator]);

  const handleConnectMetaBusiness = async () => {
    if (!auth.currentUser) {
      openAuthModal('login');
      return;
    }
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/meta/auth-url', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        throw new Error('Failed to get Meta auth URL');
      }
      const { url } = await res.json();
      const authWindow = window.open(url, 'meta_oauth', 'width=600,height=700');
      if (!authWindow) {
        alert('Please allow popups for this site to connect Meta Business.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not initiate Meta connection.');
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        return;
      }
      if (event.data?.type === 'META_OAUTH_SUCCESS') {
        showToast('Meta Business Connected Successfully!');
        fetchMetaConnections();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleDisconnectMeta = async (pageId: string) => {
    if (!auth.currentUser) return;
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/meta/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ pageId }),
      });
      if (res.ok) {
        showToast('Meta Account Disconnected.');
        fetchMetaConnections();
      } else {
        showToast('Failed to disconnect account.');
      }
    } catch {
      showToast('Error disconnecting Meta account.');
    }
  };

  // Reset subView and internal navigation whenever external profileUserId or open state changes
  useEffect(() => {
    setInternalProfileUid(null);
    setSubView('channel');
    setActiveTab('videos');
    setSelectedChannelVideo(null);
    setPlayingVideoIndex(null);
  }, [profileUserId, isOpen]);

  // Keep live friends / incoming request / followers counts synced on own channel
  useEffect(() => {
    if (!signedInUid) {
      setSocialCounts({ friends: 0, incomingRequests: 0, followers: 0, following: 0 });
      return;
    }
    if (isViewingOtherCreator || isOpen === false) return;
    const u1 = subscribeMyFriendships(signedInUid, (records) => {
      const friends = records.filter((r) => r.status === 'accepted').length;
      const incomingRequests = records.filter(
        (r) => r.status === 'pending' && r.targetUid === signedInUid
      ).length;
      setSocialCounts((prev) => ({ ...prev, friends, incomingRequests }));
    });
    const u2 = subscribeMyFollowers(signedInUid, (followers) => {
      setSocialCounts((prev) => ({ ...prev, followers: followers.length }));
    });
    const u3 = subscribeMyFollowing(signedInUid, (following) => {
      setSocialCounts((prev) => ({ ...prev, following: following.length }));
    });
    return () => {
      u1();
      u2();
      u3();
    };
  }, [signedInUid, isViewingOtherCreator, isOpen]);

  // Profile Edit State in Settings
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [channelProfile, setChannelProfile] = useState<any | null>(null);
  const [dbPhotoURL, setDbPhotoURL] = useState<string | null>(null);
  
  // Fetch channel profile (publicProfiles first, fallback to users only when viewing own profile)
  useEffect(() => {
    const fetchUserData = async () => {
      const activeUid = effectiveUserId;
      if (!activeUid) {
        setChannelProfile(null);
        setDbPhotoURL(null);
        setSocialLinks({ whatsapp: '', facebook: '', youtube: '', instagram: '', tiktok: '' });
        return;
      }
      try {
        // Try publicProfiles first
        const pubRef = doc(db, 'publicProfiles', activeUid);
        const pubSnap = await getDoc(pubRef);
        if (pubSnap.exists()) {
          const data = pubSnap.data();
          setChannelProfile(data);
          setDbPhotoURL(data?.photoURL || null);
          setSocialLinks({
            whatsapp: data?.socialLinks?.whatsapp || '',
            facebook: data?.socialLinks?.facebook || '',
            youtube: data?.socialLinks?.youtube || '',
            instagram: data?.socialLinks?.instagram || '',
            tiktok: data?.socialLinks?.tiktok || '',
          });
          if (typeof data?.subscribersCount === 'number') {
            setSubscribersCount(data.subscribersCount);
          }
        } else if (!isViewingOtherCreator) {
          // Fallback to private /users/{uid} ONLY for signed-in owner
          const userRef = doc(db, 'users', activeUid);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const data = snap.data();
            setChannelProfile(data);
            setDbPhotoURL(data?.photoURL || null);
            setSocialLinks({
              whatsapp: data?.socialLinks?.whatsapp || '',
              facebook: data?.socialLinks?.facebook || '',
              youtube: data?.socialLinks?.youtube || '',
              instagram: data?.socialLinks?.instagram || '',
              tiktok: data?.socialLinks?.tiktok || '',
            });
          } else {
            setChannelProfile(null);
          }
        } else {
          setChannelProfile(null);
          setDbPhotoURL(null);
          setSocialLinks({ whatsapp: '', facebook: '', youtube: '', instagram: '', tiktok: '' });
        }
      } catch (err) {
        console.warn("Error loading channel profile:", err);
      }
    };
    fetchUserData();
  }, [effectiveUserId, isViewingOtherCreator]);

  const realName = isViewingOtherCreator
    ? (channelProfile?.displayName || channelProfile?.name || 'KING Creator')
    : (authUser?.displayName || currentUser?.displayName || channelProfile?.displayName || channelProfile?.name || authUser?.email?.split('@')[0] || 'KING User');
  const realEmail = isViewingOtherCreator ? '' : (authUser?.email || currentUser?.email || 'No Email');
  const realHandle = isViewingOtherCreator
    ? `@${realName.toLowerCase().replace(/\s+/g, '_')}`
    : (authUser?.email ? `@${authUser.email.split('@')[0]}` : '@KINGUser');

  const getLargeFacebookPhoto = (url: string | null) => {
    if (url && url.includes('graph.facebook.com')) {
        try {
            const urlObj = new URL(url);
            urlObj.searchParams.set('type', 'large');
            return urlObj.toString();
        } catch (e) {
            return url.replace(/(\?|&)type=[^&]+/, '') + (url.includes('?') ? '&' : '?') + 'type=large';
        }
    }
    return url;
  };
  const rawPhoto = (!isViewingOtherCreator ? (dbPhotoURL || authUser?.photoURL || currentUser?.photoURL) : null) || 
    channelProfile?.photoURL || 
    null;
  const cleanRawPhoto = rawPhoto && (rawPhoto.includes('HsTZSDw4avx') || rawPhoto.includes('static.xx.fbcdn.net/rsrc.php'))
    ? null
    : rawPhoto;
  const realPhoto = getLargeFacebookPhoto(cleanRawPhoto);
  const [avatarError, setAvatarError] = useState(false);
  const [settingsAvatarError, setSettingsAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
    setSettingsAvatarError(false);
  }, [effectiveUserId, dbPhotoURL, authUser?.photoURL]);

  // Add Video Direct Flow States
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [uploadStep, setUploadStep] = useState<'select_source' | 'kingtube_folder' | 'confirm'>('select_source');
  const [selectedVideo, setSelectedVideo] = useState<ChannelVideoItem | null>(null);
  const [videoTitle, setVideoTitle] = useState(''); // Added
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // Added
  const [isGenerating, setIsGenerating] = useState(false); // Added
  const [targetPlatforms, setTargetPlatforms] = useState({
    whatsapp: true,
    facebook: true,
    youtube: true,
    instagram: true,
    tiktok: true,
  });

  const togglePlatform = (key: 'whatsapp' | 'facebook' | 'youtube' | 'instagram' | 'tiktok') => {
    setTargetPlatforms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Helper to load downloaded clips for KINGTUBE Folder view
  const getKingtubeDownloads = (): ChannelVideoItem[] => {
    try {
      const stored = localStorage.getItem('kingtube_downloads');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      // ignore
    }
    return [];
  };

  // Real Uploaded Videos List (Initialized empty until user uploads)
  const [channelVideos, setChannelVideos] = useState<ChannelVideoItem[]>([]);

  // Liked videos state
  const [likedList, setLikedList] = useState([
    { id: 101, title: 'KING App • Official Viral Promo', channel: 'KING AI Studio', duration: '0:16' },
    { id: 102, title: 'KING Shop Cyber Audio Showcase', channel: 'KING Shop Official', duration: '4:20' },
  ]);

  // Real-time Firestore Notifications (Status reactions, replies & social alerts)
  const [notifications, setNotifications] = useState<AppNotificationRecord[]>([]);

  useEffect(() => {
    if (!signedInUid) {
      setNotifications([]);
      return;
    }
    return subscribeMyNotifications(signedInUid, setNotifications);
  }, [signedInUid]);

  const showToast = (text: string) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load videos from collection "videos" for effective channel user
  useEffect(() => {
    if (!effectiveUserId) {
      setChannelVideos([]);
      return;
    }
    
    console.log("Channel Videos Target UID:", effectiveUserId);
    
    const q = query(collection(db, "videos"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const channelVids = all.filter((v: any) => {
          const belongs = v.uid === effectiveUserId || v.userId === effectiveUserId;
          if (!belongs) return false;
          if (isViewingOtherCreator && (v.publicationStatus === 'unpublished' || v.publicationStatus === 'rejected' || v.status === 'unpublished' || v.status === 'rejected')) {
            return false;
          }
          return true;
        });
        console.log("Total Channel Videos:", channelVids.length);
        setChannelVideos(channelVids as ChannelVideoItem[]);
      },
      (err) => {
        console.warn("[MyKINGChannel] Videos snapshot notice:", err);
      }
    );
  }, [effectiveUserId]);



  // 2. Real Social Links (uses user's saved Firestore link or notifies if not set)
  const openSocialLink = (platform: 'whatsapp' | 'facebook' | 'youtube' | 'instagram' | 'tiktok') => {
    let link = socialLinks[platform]?.trim();
    if (!link) {
      showToast('Link not set');
      return;
    }

    // Auto format whatsapp phone numbers
    if (platform === 'whatsapp' && !link.startsWith('http')) {
      const cleanNum = link.replace(/[^0-9]/g, '');
      link = `https://wa.me/${cleanNum}`;
    } else if (!link.startsWith('http://') && !link.startsWith('https://')) {
      link = `https://${link}`;
    }

    window.open(link, '_blank', 'noopener,noreferrer');
  };

  // Save single social link to Firebase Firestore
  const handleSaveSocialLink = async (key: 'whatsapp' | 'facebook' | 'youtube' | 'instagram' | 'tiktok') => {
    const activeUid = auth.currentUser?.uid;
    if (!activeUid) {
      showToast('Please sign in first to save links');
      return;
    }

    setSavingSocialKey(key);
    try {
      const userRef = doc(db, 'users', activeUid);
      let val = (socialLinks[key] || '').trim();

      // Auto-format WhatsApp if user typed raw numbers or username
      if (key === 'whatsapp' && val) {
        if (!val.startsWith('http://') && !val.startsWith('https://')) {
          const cleanNum = val.replace(/[^0-9]/g, '');
          if (cleanNum) {
            val = `https://wa.me/${cleanNum}`;
          }
        }
      }

      const updated = {
        ...socialLinks,
        [key]: val,
      };
      setSocialLinks(updated);

      await setDoc(
        userRef,
        {
          socialLinks: updated,
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      );

      // Sync public profile
      await setDoc(
        doc(db, 'publicProfiles', activeUid),
        {
          uid: activeUid,
          displayName: realName,
          name: realName,
          photoURL: realPhoto,
          socialLinks: updated,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      const labels: Record<string, string> = {
        whatsapp: 'WhatsApp',
        facebook: 'Facebook',
        youtube: 'YouTube',
        instagram: 'Instagram',
        tiktok: 'TikTok',
      };
      showToast(val ? `${labels[key]} link saved successfully!` : `${labels[key]} link removed`);
    } catch (err: any) {
      console.error('Error saving link:', err);
      showToast('Failed to save link. Please check connection.');
    } finally {
      setSavingSocialKey(null);
    }
  };

  // Save all 5 social links together
  const handleSaveAllSocialLinks = async () => {
    const activeUid = auth.currentUser?.uid;
    if (!activeUid) {
      showToast('Please sign in first to save links');
      return;
    }

    setSavingSocialKey('all');
    try {
      const userRef = doc(db, 'users', activeUid);
      const updatedLinks = {
        whatsapp: socialLinks.whatsapp.trim(),
        facebook: socialLinks.facebook.trim(),
        youtube: socialLinks.youtube.trim(),
        instagram: socialLinks.instagram.trim(),
        tiktok: socialLinks.tiktok.trim(),
      };
      await setDoc(
        userRef,
        {
          socialLinks: updatedLinks,
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      );

      // Sync public profile
      await setDoc(
        doc(db, 'publicProfiles', activeUid),
        {
          uid: activeUid,
          displayName: realName,
          name: realName,
          photoURL: realPhoto,
          socialLinks: updatedLinks,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      showToast('All 5 Channel Links Saved to Firestore!');
    } catch (err: any) {
      console.error('Error saving all links:', err);
      showToast('Failed to save links. Please try again.');
    } finally {
      setSavingSocialKey(null);
    }
  };

  // 3. Back button handler
  const handleBack = () => {
    if (subView !== 'channel') {
      setSubView('channel');
    } else if (internalProfileUid) {
      setInternalProfileUid(null);
      setActiveTab('subs');
    } else {
      onClose();
    }
  };

  // Real Edit Profile Name Save
  const handleSaveProfileName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newName.trim()) return;
    setSavingProfile(true);
    const activeUid = auth.currentUser.uid;
    try {
      await updateProfile(auth.currentUser, { displayName: newName.trim() });
      await setDoc(
        doc(db, 'users', activeUid),
        { name: newName.trim(), displayName: newName.trim() },
        { merge: true }
      );
      // Sync public profile
      await setDoc(
        doc(db, 'publicProfiles', activeUid),
        {
          uid: activeUid,
          displayName: newName.trim(),
          name: newName.trim(),
          photoURL: realPhoto,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setEditingName(false);
      showToast('Profile name updated successfully!');
    } catch (e: any) {
      showToast(e.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  // Open direct upload flow
  const handleOpenUploadModal = () => {
    setUploadStep('select_source');
    setSelectedVideo(null);
    setShowAddModal(true);
  };

  // In-channel video player state
  const [playingVideoIndex, setPlayingVideoIndex] = useState<number | null>(null);
  const [selectedChannelVideo, setSelectedChannelVideo] = useState<ChannelVideoItem | null>(null);
  const [channelVideoAspect, setChannelVideoAspect] = useState<'portrait' | 'landscape'>('landscape');

  // Handle video card click -> Play directly inside MyKINGChannel without redirecting
  const handleVideoCardClick = (video: any, index?: number) => {
    console.log("CHANNEL CARD CLICKED");
    console.log(video.id);
    console.log(video.title);
    console.log(video.videoUrl || video.url || video.uri);
    console.log("Card Clicked");
    console.log("Opening Channel Player");

    // Save to watch history
    saveToHistory(video);

    // Determine target index in channelVideos
    const targetIdx = typeof index === 'number' && index >= 0
      ? index
      : channelVideos.findIndex(v => v.id === video.id);

    const activeVid = (targetIdx >= 0 && channelVideos[targetIdx]) ? channelVideos[targetIdx] : video;
    setSelectedChannelVideo(activeVid);
    setPlayingVideoIndex(targetIdx >= 0 ? targetIdx : 0);
  };

  const handleNextVideo = () => {
    if (channelVideos.length === 0) return;
    const currentIdx = playingVideoIndex !== null 
      ? playingVideoIndex 
      : channelVideos.findIndex(v => v.id === selectedChannelVideo?.id);
    const nextIdx = (currentIdx + 1) % channelVideos.length;
    const nextVid = channelVideos[nextIdx];
    console.log("Card Clicked");
    console.log("Opening Channel Player");
    console.log("Auto-loaded next video:", nextVid.title);
    saveToHistory(nextVid);
    setSelectedChannelVideo(nextVid);
    setPlayingVideoIndex(nextIdx);
  };

  const handlePrevVideo = () => {
    if (channelVideos.length === 0) return;
    const currentIdx = playingVideoIndex !== null 
      ? playingVideoIndex 
      : channelVideos.findIndex(v => v.id === selectedChannelVideo?.id);
    const prevIdx = (currentIdx - 1 + channelVideos.length) % channelVideos.length;
    const prevVid = channelVideos[prevIdx];
    console.log("Card Clicked");
    console.log("Opening Channel Player");
    saveToHistory(prevVid);
    setSelectedChannelVideo(prevVid);
    setPlayingVideoIndex(prevIdx);
  };

  const handleClosePlayer = () => {
    setSelectedChannelVideo(null);
    setPlayingVideoIndex(null);
  };

  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);

  // Handle Gallery file selection from phone
  const handleGalleryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedVideoFile(file);
      setIsGenerating(true);
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      const sizeInMB = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      const fileUri = URL.createObjectURL(file);

      try {
        const thumbnail = await generateVideoThumbnail(file);
        const durationSec = await getVideoDuration(file);
        const duration = Math.floor(durationSec / 60) + ':' + Math.floor(durationSec % 60).toString().padStart(2, '0');

        const newVid: ChannelVideoItem = {
          id: Date.now().toString(),
          title: cleanName || file.name,
          fileName: file.name,
          fileSize: sizeInMB,
          fileType: file.type || 'video/mp4',
          duration: duration,
          uri: fileUri,
          views: '0 views • Phone Gallery',
          img: thumbnail,
          uploadedAt: new Date().toISOString(),
        };
        setSelectedVideo(newVid);
        setVideoTitle(cleanName || file.name);
        setUploadStep('confirm');
      } catch (err) {
        console.error('Error generating thumbnail:', err);
        showToast('Error processing video');
      } finally {
        setIsGenerating(false);
      }
    }
  };

  // Add new video & upload to Cloudinary (using backend proxy with direct fallback)
  const handleAddVideo = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }

    if (!auth.currentUser) {
      alert("Sign in karo pehle");
      return;
    }

    const fileToUpload = selectedVideoFile;
    const clipToUpload = selectedVideo;

    if (!fileToUpload && !clipToUpload?.uri) {
      console.log("No file or video selected for upload");
      alert("Please select a video file or clip to upload");
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(10);
    
    try {
      let finalSecureUrl = "";
      let finalThumbnailUrl = "";
      const videoTitleName = videoTitle || (fileToUpload ? fileToUpload.name : clipToUpload?.title) || "KING Video";

      // If already a hosted cloud video (e.g. from downloads that has an http/https URL)
      if (!fileToUpload && clipToUpload?.uri && (clipToUpload.uri.startsWith('http://') || clipToUpload.uri.startsWith('https://'))) {
        finalSecureUrl = clipToUpload.uri;
        finalThumbnailUrl = clipToUpload.img || clipToUpload.thumbnailUrl || "";
      } else {
        // We have a file or local blob
        let payloadBlob: Blob | File | null = fileToUpload;
        let filename = fileToUpload?.name || `${Date.now()}.mp4`;
        let mimeType = fileToUpload?.type || 'video/mp4';

        if (!payloadBlob && clipToUpload?.uri) {
          try {
            const blobRes = await fetch(clipToUpload.uri);
            payloadBlob = await blobRes.blob();
            filename = clipToUpload.fileName || `${clipToUpload.title || 'video'}.mp4`;
            mimeType = payloadBlob.type || 'video/mp4';
          } catch (blobErr) {
            console.warn("Could not convert clip URI to blob, using directly if URL", blobErr);
          }
        }

        if (payloadBlob) {
          let data: any = null;

          // Attempt 1: Try backend upload proxy route /api/upload-video with Firebase ID Token
          try {
            setUploadProgress(30);
            const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
            const headers: Record<string, string> = {
              'Content-Type': mimeType,
              'x-filename': encodeURIComponent(filename),
            };
            if (idToken) {
              headers['Authorization'] = `Bearer ${idToken}`;
            }

            const proxyRes = await fetch('/api/upload-video', {
              method: 'POST',
              headers,
              body: payloadBlob,
            });

            if (proxyRes.ok) {
              data = await proxyRes.json();
              console.log("PROXY UPLOAD SUCCESS:", data);
            } else {
              console.warn("Proxy returned status:", proxyRes.status);
            }
          } catch (proxyErr) {
            console.warn("Proxy upload failed, trying direct Cloudinary upload:", proxyErr);
          }

          // Attempt 2: Direct Cloudinary fetch fallback if proxy failed or didn't return secure_url
          if (!data || !data.secure_url) {
            setUploadProgress(50);
            const formData = new FormData();
            formData.append("file", payloadBlob, filename);
            formData.append("upload_preset", "kingtube");

            const res = await fetch("https://api.cloudinary.com/v1_1/xb0o3xwi/video/upload", { 
              method: "POST", 
              body: formData 
            });

            data = await res.json();
            console.log("DIRECT CLOUDINARY RESPONSE:", data);
          }

          if (!data?.secure_url) {
            throw new Error(data?.error?.message || "Failed to upload video to cloud storage");
          }

          finalSecureUrl = data.secure_url;
          finalThumbnailUrl = data.secure_url.replace(/\.[^/.]+$/, ".jpg");
        }
      }

      setUploadProgress(85);

      if (!finalSecureUrl) {
        throw new Error("Could not obtain video URL");
      }

      console.log("Final Video URL:", finalSecureUrl);
      console.log("Final Thumbnail URL:", finalThumbnailUrl);
      
      await addDoc(collection(db, "videos"), {
        url: finalSecureUrl,
        videoUrl: finalSecureUrl,
        thumbnailUrl: finalThumbnailUrl || selectedVideo?.img || "",
        title: videoTitleName,
        userId: auth.currentUser.uid,
        uid: auth.currentUser.uid,
        uploaderPhoto: realPhoto || "",
        channelAvatar: realPhoto || "",
        uploaderName: realName || "KING Creator",
        channelName: realName || "KING Creator",
        contentType: "video",
        publicationStatus: "published",
        status: "published",
        likes: 0,
        views: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
        type: "video"
      });
      
      setUploadProgress(100);
      alert("Upload SUCCESS - KINGTUBE me agayi!");
      
      setSelectedVideoFile(null);
      setSelectedVideo(null);
      setShowAddModal(false);
      setUploadStep('select_source');
      
    } catch (e: any) {
      console.error("Upload error details:", e);
      alert("FAIL: " + (e?.message || "Failed to upload video. Please try again."));
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle Sign Out from Settings
  const handleSignOut = async () => {
    await signOut(auth);
    showToast('Signed out from KING Channel');
    setSubView('channel');
  };

  const { loginWithGoogle, loginWithFacebook } = useAuth();
  const [authLoading, setAuthLoading] = useState(false);

  // Quick Facebook Login
  const handleFacebookLogin = async () => {
    if (authLoading) return;
    setAuthLoading(true);
    try {
      await loginWithFacebook();
      showToast('Welcome to your KING Channel!');
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/user-cancelled' ||
        err?.code === 'auth/cancelled-popup-request'
      ) {
        console.log("Facebook login cancelled or superseded.");
      } else if (err?.code === 'auth/operation-not-allowed') {
        console.warn("Facebook provider is not enabled in Firebase Console.");
        showToast("Facebook login is not enabled in Firebase Console. Please sign in with Google!");
      } else {
        console.warn("Facebook Login notice:", err);
        showToast(err?.message || 'Facebook login failed. Please try Google Sign-In.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // Quick Google Login
  const handleGoogleLogin = async () => {
    if (authLoading) return;
    setAuthLoading(true);
    try {
      await loginWithGoogle();
      showToast('Welcome to your KING Channel!');
    } catch (error: any) {
      if (
        error?.code === 'auth/popup-closed-by-user' ||
        error?.code === 'auth/user-cancelled' ||
        error?.code === 'auth/cancelled-popup-request'
      ) {
        console.log("Google login cancelled or superseded.");
      } else {
        console.warn("Google login notice:", error?.message || error);
        showToast(error?.message || 'Google login failed');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  if (isOpen === false) return null;

  // User details already declared at top-level component scope
  return (
    <div className="fixed inset-0 z-[130] overflow-y-auto min-h-screen bg-[#060a14] text-white p-0">
      
      {/* Real Floating Toast */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-emerald-500 to-teal-500 text-black text-xs font-black px-4 py-2.5 rounded-full shadow-2xl shadow-emerald-500/50 flex items-center gap-2 animate-in slide-in-from-top-3">
          <Check className="w-4 h-4 stroke-[3]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header (Real Navigation) */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0a0e1f] border-b border-gray-800 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <button 
            onClick={handleBack} 
            className="p-2 bg-[#1a1f35] hover:bg-[#252c4a] rounded-full text-base cursor-pointer transition active:scale-95"
            aria-label="Back"
          >
            ←
          </button>
          <h1 className="text-xl font-black italic leading-tight">
            <span className="text-white">My</span> <span className="text-[#00d4ff]">KING</span> <br />{' '}
            <span className="text-[#00d4ff]">Channel</span>
          </h1>
        </div>

        {/* 1. Top Right 3 Real Clickable Icons */}
        <div className="flex gap-2">
          {/* Heart -> /liked */}
          <button
            onClick={() => setSubView(subView === 'liked' ? 'channel' : 'liked')}
            className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition active:scale-95 ${
              subView === 'liked' ? 'bg-rose-600 shadow-[0_0_12px_#e11d48]' : 'bg-[#1a1f35] hover:bg-[#242b47]'
            }`}
            title="Liked Videos"
          >
            ❤️
          </button>

          {/* Bell -> /notifications */}
          <button
            onClick={() => setSubView(subView === 'notifications' ? 'channel' : 'notifications')}
            className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer relative transition active:scale-95 ${
              subView === 'notifications' ? 'bg-amber-600 shadow-[0_0_12px_#d97706]' : 'bg-[#1a1f35] hover:bg-[#242b47]'
            }`}
            title="Notifications"
          >
            🔔
            {notifications.some((n) => !n.read) && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-black rounded-full ring-2 ring-[#0a0e1f] flex items-center justify-center">
                {notifications.filter((n) => !n.read).length > 9 ? '9+' : notifications.filter((n) => !n.read).length}
              </span>
            )}
          </button>

          {/* Gear -> /settings (Real Settings Page, only for own channel) */}
          {!isViewingOtherCreator && (
            <button
              onClick={() => setSubView(subView === 'settings' ? 'channel' : 'settings')}
              className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition active:scale-95 ${
                subView === 'settings' ? 'bg-cyan-600 shadow-[0_0_12px_#06b6d4]' : 'bg-[#1a1f35] hover:bg-[#242b47]'
              }`}
              title="Channel Settings"
            >
              ⚙️
            </button>
          )}
        </div>
      </div>

      {/* SUB-VIEW 1: REAL SETTINGS PAGE */}
      {subView === 'settings' && !isViewingOtherCreator && (
        <div className="p-4 max-w-md mx-auto space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-gray-800">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <span>⚙️</span> Channel Settings & Account
            </h2>
            <button
              onClick={() => setSubView('channel')}
              className="text-xs bg-[#1a1f35] hover:bg-slate-800 px-3 py-1.5 rounded-full text-slate-300"
            >
              Done
            </button>
          </div>

          {/* Profile Card */}
          <div className="bg-[#0b1222] border border-slate-800 p-4 rounded-2xl flex items-center gap-3">
            {realPhoto && !settingsAvatarError ? (
              <img
                src={realPhoto}
                alt="Avatar"
                className="w-14 h-14 rounded-full object-cover border-2 border-cyan-400"
                onError={() => setSettingsAvatarError(true)}
              />
            ) : (
              <div className="w-14 h-14 rounded-full border-2 border-cyan-400 bg-gradient-to-tr from-amber-600/40 via-slate-800 to-cyan-500/30 flex items-center justify-center text-xl shadow-md">
                👑
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                {realName}
                <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">
                  Verified
                </span>
              </div>
              {realEmail && <div className="text-xs text-slate-400 truncate">{realEmail}</div>}
              {(authUser?.uid || currentUser?.uid) ? (
                <div className="text-[10px] text-amber-400 font-mono mt-0.5">UID: {authUser?.uid || currentUser?.uid}</div>
              ) : (
                <div className="text-[10px] text-emerald-400 font-bold mt-0.5">KING Member</div>
              )}
            </div>
          </div>

          {/* Edit Display Name */}
          <div className="bg-[#0b1222] border border-slate-800 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Channel Display Name</span>
              {!editingName && (
                <button
                  onClick={() => setEditingName(true)}
                  className="text-xs text-cyan-400 hover:underline flex items-center gap-1 font-bold"
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              )}
            </div>

            {editingName ? (
              <form onSubmit={handleSaveProfileName} className="space-y-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full bg-[#060a14] border border-cyan-500/50 text-white px-3 py-2 rounded-xl text-xs focus:outline-none"
                  required
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="flex-1 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs rounded-lg transition"
                  >
                    {savingProfile ? 'Saving...' : 'Save Name'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingName(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-sm font-semibold text-white bg-[#060a14] p-2.5 rounded-xl border border-gray-800">
                {realName}
              </div>
            )}
          </div>

          {/* MY CHANNEL LINKS (Editable) - 5 Social Inputs + Save */}
          <div className="bg-[#0b1222] border border-slate-800 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-800/80">
              <div>
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🔗</span> MY CHANNEL LINKS (Editable)
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Saved directly to your Firestore profile. Opened by the 5 channel buttons.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveAllSocialLinks}
                disabled={savingSocialKey === 'all'}
                className="text-[10px] bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 px-2.5 py-1 rounded-lg font-bold transition active:scale-95 disabled:opacity-50"
              >
                {savingSocialKey === 'all' ? 'Saving...' : 'Save All Links'}
              </button>
            </div>

            <div className="space-y-3 pt-1">
              {/* 1. WhatsApp Link */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-300 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#0a0e1f] border border-gray-700 p-0.5 flex items-center justify-center flex-shrink-0">
                      <img src="https://cdn-icons-png.flaticon.com/512/3670/3670053.png" alt="WhatsApp" className="w-5 h-5 object-contain" />
                    </span>
                    1. WhatsApp Link
                  </label>
                  {socialLinks.whatsapp && (
                    <span className="text-[9px] text-green-400 font-mono">Saved ✓</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={socialLinks.whatsapp}
                    onChange={(e) => setSocialLinks({ ...socialLinks, whatsapp: e.target.value })}
                    placeholder="https://wa.me/923001234567 or phone number"
                    className="flex-1 bg-[#060a14] border border-gray-800 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-green-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveSocialLink('whatsapp')}
                    disabled={savingSocialKey === 'whatsapp'}
                    className="px-3.5 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-xl transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {savingSocialKey === 'whatsapp' ? '...' : 'Save'}
                  </button>
                </div>
              </div>

              {/* 2. Facebook Link */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-300 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#0a0e1f] border border-gray-700 p-0.5 flex items-center justify-center flex-shrink-0">
                      <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" alt="Facebook" className="w-5 h-5 object-contain" />
                    </span>
                    2. Facebook Link
                  </label>
                  {socialLinks.facebook && (
                    <span className="text-[9px] text-blue-400 font-mono">Saved ✓</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={socialLinks.facebook}
                    onChange={(e) => setSocialLinks({ ...socialLinks, facebook: e.target.value })}
                    placeholder="https://facebook.com/yourprofile"
                    className="flex-1 bg-[#060a14] border border-gray-800 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveSocialLink('facebook')}
                    disabled={savingSocialKey === 'facebook'}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {savingSocialKey === 'facebook' ? '...' : 'Save'}
                  </button>
                </div>
              </div>

              {/* 3. YouTube Link */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-300 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#0a0e1f] border border-gray-700 p-0.5 flex items-center justify-center flex-shrink-0">
                      <img src="https://cdn-icons-png.flaticon.com/512/1384/1384060.png" alt="YouTube" className="w-5 h-5 object-contain" />
                    </span>
                    3. YouTube Link
                  </label>
                  {socialLinks.youtube && (
                    <span className="text-[9px] text-red-400 font-mono">Saved ✓</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={socialLinks.youtube}
                    onChange={(e) => setSocialLinks({ ...socialLinks, youtube: e.target.value })}
                    placeholder="https://youtube.com/@yourchannel"
                    className="flex-1 bg-[#060a14] border border-gray-800 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-red-500"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await loginWithGoogle();
                        showToast('YouTube Connected Successfully!');
                        // Update Firestore to mark YouTube as connected
                        if (currentUser?.uid) {
                          await setDoc(doc(db, 'users', currentUser.uid), { youtubeConnected: true }, { merge: true });
                        }
                      } catch (e) {
                        console.error('YouTube connection error:', e);
                        showToast('Failed to connect YouTube account.');
                      }
                    }}
                    className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition active:scale-95 cursor-pointer"
                  >
                    Connect
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      // Update Firestore to mark YouTube as disconnected
                      if (currentUser?.uid) {
                        await setDoc(doc(db, 'users', currentUser.uid), { youtubeConnected: false }, { merge: true });
                        showToast('YouTube Disconnected.');
                      }
                    }}
                    className="px-3.5 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold rounded-xl transition active:scale-95 cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {/* 4. Instagram Link */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-300 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#0a0e1f] border border-gray-700 p-0.5 flex items-center justify-center flex-shrink-0">
                      <img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" alt="Instagram" className="w-5 h-5 object-contain" />
                    </span>
                    4. Instagram Link
                  </label>
                  {socialLinks.instagram && (
                    <span className="text-[9px] text-pink-400 font-mono">Saved ✓</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={socialLinks.instagram}
                    onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })}
                    placeholder="https://instagram.com/yourusername"
                    className="flex-1 bg-[#060a14] border border-gray-800 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-pink-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveSocialLink('instagram')}
                    disabled={savingSocialKey === 'instagram'}
                    className="px-3.5 py-2 bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold rounded-xl transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {savingSocialKey === 'instagram' ? '...' : 'Save'}
                  </button>
                </div>
              </div>

              {/* 5. TikTok Link */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-300 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#0a0e1f] border border-gray-700 p-0.5 flex items-center justify-center flex-shrink-0">
                      <img src="https://cdn-icons-png.flaticon.com/512/3046/3046121.png" alt="TikTok" className="w-5 h-5 object-contain" />
                    </span>
                    5. TikTok Link
                  </label>
                  {socialLinks.tiktok && (
                    <span className="text-[9px] text-cyan-400 font-mono">Saved ✓</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={socialLinks.tiktok}
                    onChange={(e) => setSocialLinks({ ...socialLinks, tiktok: e.target.value })}
                    placeholder="https://tiktok.com/@yourusername"
                    className="flex-1 bg-[#060a14] border border-gray-800 text-white px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveSocialLink('tiktok')}
                    disabled={savingSocialKey === 'tiktok'}
                    className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {savingSocialKey === 'tiktok' ? '...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>



          {/* Meta Business Connection Card */}
          {!isViewingOtherCreator && (
            <div className="bg-[#0b1222] border border-blue-500/40 p-4 rounded-2xl space-y-3 shadow-lg shadow-blue-950/30">
              <div className="flex items-center justify-between pb-2 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                    <Facebook className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Meta Business Connection</h3>
                    <p className="text-[10px] text-slate-400">Facebook Pages & Instagram Professional</p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                  Ready for Auto-Publish
                </span>
              </div>

              {metaConnections.length === 0 ? (
                <div className="space-y-2.5 pt-1">
                  <p className="text-xs text-slate-300">
                    Connect your Meta Business account to enable one-click publishing from KING to your Facebook Page and Instagram Professional account.
                  </p>
                  <button
                    type="button"
                    onClick={handleConnectMetaBusiness}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(24,119,242,0.5)] border border-blue-400/40 cursor-pointer transition active:scale-95"
                  >
                    <Facebook className="w-4 h-4 fill-current" />
                    <span>Connect Meta Business</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    <span>Connected Accounts ({metaConnections.length})</span>
                  </div>

                  <div className="space-y-2">
                    {metaConnections.map((conn: any) => (
                      <div key={conn.pageId} className="bg-[#060a14] border border-slate-800 p-3 rounded-xl flex items-center justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                            <Facebook className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span>{conn.pageName || 'Facebook Page'}</span>
                          </div>
                          {conn.igUsername ? (
                            <div className="text-[11px] text-pink-400 truncate flex items-center gap-1.5">
                              <span className="font-semibold">IG:</span> @{conn.igUsername}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-500">No Instagram Professional account linked</div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={handleConnectMetaBusiness}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold cursor-pointer"
                            title="Reconnect or add accounts"
                          >
                            Manage
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDisconnectMeta(conn.pageId)}
                            className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 text-[10px] font-bold cursor-pointer"
                          >
                            Disconnect
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleConnectMetaBusiness}
                      className="flex-1 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-bold transition cursor-pointer"
                    >
                      Reconnect / Add More
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status Privacy Settings (Phase 1 pre-configuration for future Status visibility) */}
          <StatusPrivacySettingsCard
            currentUid={signedInUid}
            onShowToast={showToast}
          />

          {/* Legal Section */}
          <div className="bg-[#0b1222] border border-slate-800 p-4 rounded-2xl space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Legal</h3>
            <div className="space-y-2">
              <button 
                onClick={() => window.open('https://sites.google.com/view/king-app-privacy-policy/home', '_blank')}
                className="w-full text-left text-xs text-slate-400 hover:text-cyan-400 py-1.5 border-b border-gray-800/50"
              >
                Privacy Policy
              </button>
              <button 
                onClick={() => window.open('https://sites.google.com/view/king-app-terms-of-service/home', '_blank')}
                className="w-full text-left text-xs text-slate-400 hover:text-cyan-400 py-1.5 border-b border-gray-800/50"
              >
                Terms of Service
              </button>
              <button 
                onClick={() => window.open('https://sites.google.com/view/king-app-user-data-deletion/home', '_blank')}
                className="w-full text-left text-xs text-slate-400 hover:text-cyan-400 py-1.5"
              >
                User Data Deletion
              </button>
            </div>
            <p className="text-[9px] text-slate-500 pt-2">
              Note: The User Data Deletion link provides instructions. Automated account deletion is not implemented in-app.
            </p>
          </div>

          {/* Authentication Actions */}
          <div className="pt-2 space-y-2">
            {currentUser ? (
              <>
                <button
                  onClick={handleSignOut}
                  className="w-full py-2.5 bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-400 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out from {currentUser.email || 'KING'}
                </button>
                {currentUser.email === 'waqaahmad1230@gmail.com' && (
                  <button
                    onClick={() => { /* Open Admin Panel */ }}
                    className="w-full py-2.5 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 text-rose-400 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Secret Admin Panel
                  </button>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <button
                  disabled={authLoading}
                  onClick={handleGoogleLogin}
                  className="w-full py-2.5 bg-white hover:bg-slate-100 disabled:opacity-50 text-black font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition active:scale-95 shadow cursor-pointer disabled:cursor-not-allowed"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /></svg>
                  {authLoading ? 'Signing in...' : 'Sign In with Google'}
                </button>
                <button
                  disabled={authLoading}
                  onClick={handleFacebookLogin}
                  className="w-full py-2.5 bg-[#1877f2] hover:bg-[#166fe5] disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition active:scale-95 shadow cursor-pointer disabled:cursor-not-allowed"
                >
                  <Facebook className="w-3.5 h-3.5" />
                  {authLoading ? 'Signing in...' : 'Sign In with Facebook'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}


      {/* SUB-VIEW 2: LIKED VIDEOS PAGE (/liked) */}
      {subView === 'liked' && (
        <div className="p-4 max-w-md mx-auto space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-gray-800">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <span className="text-rose-500">❤️</span> Liked Videos ({likedList.length})
            </h2>
            <button
              onClick={() => setSubView('channel')}
              className="text-xs bg-[#1a1f35] px-3 py-1.5 rounded-full text-slate-300"
            >
              Back
            </button>
          </div>

          <div className="space-y-2.5">
            {likedList.map((vid) => (
              <div
                key={vid.id}
                className="flex items-center justify-between p-3 bg-[#0a0e1f] border border-gray-800 rounded-2xl hover:border-slate-700 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white line-clamp-1">{vid.title}</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">{vid.channel} • {vid.duration}</p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setLikedList(likedList.filter(l => l.id !== vid.id));
                    showToast('Removed from Liked Videos');
                  }}
                  className="text-slate-500 hover:text-red-400 p-2"
                  title="Unlike"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: NOTIFICATIONS PAGE (/notifications) */}
      {subView === 'notifications' && (
        <div className="p-4 max-w-md mx-auto space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-gray-800">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <span className="text-amber-500">🔔</span> Notifications
            </h2>
            {notifications.some((n) => !n.read) && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await markAllMyNotificationsRead(notifications);
                    showToast('All notifications marked as read');
                  } catch {
                    showToast('Unable to update notifications right now');
                  }
                }}
                className="text-xs text-cyan-400 hover:underline font-bold cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          {!signedInUid ? (
            <div className="p-5 bg-[#0a0e1f] border border-gray-800 rounded-2xl text-center text-xs text-slate-400">
              Sign in to receive Status reaction & reply notifications.
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-6 bg-[#0a0e1f] border border-dashed border-gray-800 rounded-2xl text-center space-y-1.5">
              <Bell className="w-7 h-7 text-slate-600 mx-auto" />
              <div className="text-xs font-bold text-slate-300">No notifications yet</div>
              <p className="text-[11px] text-slate-500">
                Status reactions and private replies from friends will appear here in real time.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {notifications.map((n) => {
                const diffSec = n.createdAtMs ? Math.max(0, Math.floor((Date.now() - n.createdAtMs) / 1000)) : 0;
                const relTime =
                  !n.createdAtMs
                    ? 'Just now'
                    : diffSec < 60
                    ? `${diffSec}s ago`
                    : diffSec < 3600
                    ? `${Math.floor(diffSec / 60)}m ago`
                    : `${Math.floor(diffSec / 3600)}h ago`;

                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (!n.read) {
                        markNotificationRead(n.id).catch(() => {});
                      }
                    }}
                    className={`w-full text-left p-3.5 rounded-2xl border transition cursor-pointer ${
                      !n.read
                        ? 'bg-[#0e1830] border-cyan-500/40 text-white'
                        : 'bg-[#0a0e1f] border-gray-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <CreatorAvatar
                        uid={n.actorUid}
                        fallbackPhoto={n.actorPhoto}
                        fallbackName={n.actorName}
                        className="w-9 h-9 rounded-full shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                            {!n.read && <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />}
                            <span className="truncate">{n.title}</span>
                          </h4>
                          <span className="text-[10px] text-slate-400 shrink-0">{relTime}</span>
                        </div>
                        {n.body && <p className="text-xs text-slate-300 mt-1 break-words">{n.body}</p>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MAIN VIEW: ORIGINAL MY KING CHANNEL SCREEN */}
      {subView === 'channel' && (
        <div className="relative pb-16">
          {/* Banner */}
          <div className="h-48 bg-gradient-to-br from-orange-400 via-purple-500 to-cyan-400"></div>
          <div className="absolute top-4 right-4 bg-[#0f1830] border border-cyan-500/30 px-3 py-1 rounded-full text-xs font-bold text-cyan-300">
            ✨ VIP PARTNER
          </div>

          {/* Profile Details */}
          <div className="flex flex-col items-center -mt-16">
            <div className="relative">
              {realPhoto && !avatarError ? (
                <img
                  src={realPhoto}
                  className="w-28 h-28 rounded-full border-4 border-[#060a14] object-cover bg-slate-900 shadow-xl"
                  alt={realName}
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <div className="w-28 h-28 rounded-full border-4 border-[#060a14] bg-gradient-to-tr from-amber-500/40 via-[#0d1627] to-cyan-500/30 flex items-center justify-center text-4xl shadow-xl">
                  👑
                </div>
              )}
              <div className="absolute bottom-1 right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-[#060a14]"></div>
            </div>

            {/* Real Name */}
            <h2 className="mt-3 text-3xl font-black italic flex items-center gap-2">
              {realName}{' '}
              <span className="bg-[#00d4ff] text-black w-7 h-7 rounded-full flex items-center justify-center text-sm font-black">
                ✓
              </span>
            </h2>

            {/* 2. Real Official Social Links (Conditional - Only show if link exists) */}
            {(() => {
              const hasWhatsapp = Boolean(socialLinks?.whatsapp?.trim());
              const hasFacebook = Boolean(socialLinks?.facebook?.trim());
              const hasYoutube = Boolean(socialLinks?.youtube?.trim());
              const hasInstagram = Boolean(socialLinks?.instagram?.trim());
              const hasTiktok = Boolean(socialLinks?.tiktok?.trim());

              const hasAnySocial = hasWhatsapp || hasFacebook || hasYoutube || hasInstagram || hasTiktok;

              if (!hasAnySocial) {
                if (isViewingOtherCreator) return null;
                return (
                  <div className="mt-4 flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => setSubView('settings')}
                      className="text-xs text-slate-400 hover:text-cyan-400 bg-[#0d1424] border border-gray-800 hover:border-cyan-500/50 px-4 py-2 rounded-full flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow"
                    >
                      <span>No social links - Set in Settings ⚙️</span>
                    </button>
                  </div>
                );
              }

              return (
                <div className="flex gap-3 mt-4 flex-wrap justify-center">
                  {/* WhatsApp */}
                  {hasWhatsapp && (
                    <button
                      type="button"
                      onClick={() => openSocialLink('whatsapp')}
                      className="w-14 h-14 rounded-full bg-[#0a0e1f] border border-green-500/50 hover:border-green-400 flex items-center justify-center p-3 shadow-[0_0_15px_rgba(34,197,94,0.6)] cursor-pointer transition active:scale-95 group"
                      title="Open WhatsApp"
                    >
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
                        alt="WhatsApp"
                        className="w-8 h-8 object-contain group-hover:scale-110 transition"
                      />
                    </button>
                  )}

                  {/* Facebook */}
                  {hasFacebook && (
                    <button
                      type="button"
                      onClick={() => openSocialLink('facebook')}
                      className="w-14 h-14 rounded-full bg-[#0a0e1f] border border-blue-500/50 hover:border-blue-400 flex items-center justify-center p-3 shadow-[0_0_15px_rgba(37,99,235,0.6)] cursor-pointer transition active:scale-95 group"
                      title="Open Facebook"
                    >
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg"
                        alt="Facebook"
                        className="w-8 h-8 object-contain group-hover:scale-110 transition"
                      />
                    </button>
                  )}

                  {/* YouTube */}
                  {hasYoutube && (
                    <button
                      type="button"
                      onClick={() => openSocialLink('youtube')}
                      className="w-14 h-14 rounded-full bg-[#0a0e1f] border border-red-500/50 hover:border-red-400 flex items-center justify-center p-3 shadow-[0_0_15px_rgba(239,68,68,0.6)] cursor-pointer transition active:scale-95 group"
                      title="Open YouTube"
                    >
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg"
                        alt="YouTube"
                        className="w-8 h-8 object-contain group-hover:scale-110 transition"
                      />
                    </button>
                  )}

                  {/* Instagram */}
                  {hasInstagram && (
                    <button
                      type="button"
                      onClick={() => openSocialLink('instagram')}
                      className="w-14 h-14 rounded-full bg-[#0a0e1f] border border-pink-500/50 hover:border-pink-400 flex items-center justify-center p-3 shadow-[0_0_15px_rgba(236,72,153,0.6)] cursor-pointer transition active:scale-95 group"
                      title="Open Instagram"
                    >
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg"
                        alt="Instagram"
                        className="w-8 h-8 object-contain group-hover:scale-110 transition"
                      />
                    </button>
                  )}

                  {/* TikTok */}
                  {hasTiktok && (
                    <button
                      type="button"
                      onClick={() => openSocialLink('tiktok')}
                      className="w-14 h-14 rounded-full bg-[#0a0e1f] border border-cyan-400/50 hover:border-cyan-300 flex items-center justify-center p-3 shadow-[0_0_15px_rgba(6,182,212,0.6)] cursor-pointer transition active:scale-95 group"
                      title="Open TikTok"
                    >
                      <img
                        src="https://upload.wikimedia.org/wikipedia/en/a/a9/TikTok_logo.svg"
                        alt="TikTok"
                        className="w-8 h-8 object-contain group-hover:scale-110 transition"
                      />
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Handle & Real Stats */}
            <p className="mt-4 text-sm text-center px-4">
              <span className="text-cyan-400 font-bold">{realHandle}</span>{' '}
              <span className="mx-2">•</span>{' '}
              {!isViewingOtherCreator && signedInUid ? (
                <>
                  <span className="font-bold">{socialCounts.friends} Friends</span>{' '}
                  <span className="mx-1.5">•</span>{' '}
                  <span className="font-bold">{socialCounts.followers} Followers</span>{' '}
                  <span className="mx-1.5">•</span>{' '}
                  <span className="font-bold">{socialCounts.following} Following</span>{' '}
                  <span className="mx-1.5">•</span>{' '}
                </>
              ) : (
                <>
                  <span className="font-bold">{(subscribersCount / 1000).toFixed(1)}K Subscribers</span>{' '}
                  <span className="mx-2">•</span>{' '}
                </>
              )}
              {channelVideos.length} Videos
            </p>

            <p className="mt-3 text-center text-gray-400 text-sm px-6 max-w-md">
              Welcome to my official KING Channel ✨! Uploading HD Movies, Kids Cartoons, Cyber Gaming &
              Trending Video...
            </p>

            {/* Relationship Actions when viewing another creator */}
            {isViewingOtherCreator && activeTargetProfileUid && (
              <ProfileRelationshipBar
                currentUid={signedInUid}
                targetUid={activeTargetProfileUid}
                targetName={realName}
                onRequireAuth={() => openAuthModal('login')}
                onShowToast={showToast}
              />
            )}

            {/* + KINGTUBE Action */}
            {!isViewingOtherCreator && (
              <button 
                onClick={handleOpenUploadModal}
                className="mt-5 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 px-8 py-3 rounded-full font-black flex items-center gap-2 shadow-[0_0_20px_rgba(220,38,38,0.5)] active:scale-95 transition cursor-pointer"
              >
                + KINGTUBE
              </button>
            )}


            {/* 5. Clickable Tabs with activeTab State */}
            <div className="flex w-full max-w-md mt-6 border-b border-gray-800 px-4 gap-6">
              <button
                type="button"
                onClick={() => setActiveTab('videos')}
                className={`pb-3 font-bold flex items-center gap-2 cursor-pointer transition ${
                  activeTab === 'videos'
                    ? 'border-b-2 border-cyan-400 text-cyan-400'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                📹 VIDEOS ({channelVideos.length})
              </button>
              {!isViewingOtherCreator && (
                <button
                  type="button"
                  onClick={() => setActiveTab('subs')}
                  className={`pb-3 font-bold flex items-center gap-2 cursor-pointer transition ${
                    activeTab === 'subs'
                      ? 'border-b-2 border-cyan-400 text-cyan-400'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>FRIENDS & SOCIAL</span>
                  {socialCounts.incomingRequests > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black">
                      {socialCounts.incomingRequests}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Content for Active Tab 1: VIDEOS */}
            {activeTab === 'videos' && (
              <div className="w-full max-w-md px-4 mt-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-lg">
                    CHANNEL UPLOADS{' '}
                    <span className="text-gray-500 text-sm font-normal ml-2">
                      {channelVideos.length} uploaded items
                    </span>
                  </h3>
                  {!isViewingOtherCreator && (
                    <button 
                      onClick={handleOpenUploadModal}
                      className="bg-[#2a1a1a] hover:bg-[#3d2020] border border-red-900 text-red-400 px-4 py-1 rounded-full text-sm font-bold transition active:scale-95 cursor-pointer"
                    >
                      + ADD
                    </button>
                  )}
                </div>

                {/* Responsive 2-column YouTube-style grid layout */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {channelVideos.length === 0 ? (
                    <div className="col-span-2 py-10 bg-[#0a0e1f] border border-dashed border-gray-800 rounded-2xl text-center space-y-2 p-4">
                      <div className="w-10 h-10 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                      <p className="text-xs font-bold text-slate-300">No videos uploaded yet</p>
                      <p className="text-[10px] text-slate-500">
                        {!isViewingOtherCreator ? "Tap + ADD to upload your first video to KINGTUBE" : "This creator has not uploaded any videos yet"}
                      </p>
                    </div>
                  ) : (
                    channelVideos.map((item) => {
                      console.log("Card Rendered");
                      console.log("Card Rendered", item.id, item.title);
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleVideoCardClick(item)}
                          style={{ pointerEvents: 'auto' }}
                          className="group bg-[#0a0e1f] hover:bg-[#0e162d] p-2.5 rounded-2xl border border-gray-800 hover:border-cyan-500/40 transition-all duration-200 flex flex-col justify-between shadow-md cursor-pointer pointer-events-auto relative z-10"
                        >
                          {/* Video Thumbnail on Top */}
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleVideoCardClick(item);
                            }}
                            style={{ pointerEvents: 'auto' }}
                            className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 mb-2 cursor-pointer pointer-events-auto"
                          >
                            <img
                              src={item.thumbnailUrl || item.img || "https://placehold.co/320x180/060a14/00d4ff?text=Video"}
                              alt={item.title}
                              onLoad={() => console.log("Thumbnail Loaded")}
                              onError={() => console.log("Thumbnail Error")}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                            />
                            {/* Play overlay indicator */}
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
                              <div className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all pointer-events-none">
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5 text-cyan-400" />
                              </div>
                            </div>
                          </div>

                          {/* Title & Metadata Below */}
                          <div 
                            style={{ pointerEvents: 'auto' }}
                            className="flex-1 flex flex-col justify-between pointer-events-auto"
                          >
                            <div className="flex items-start gap-2">
                              <CreatorAvatar
                                uid={(item as any).userId || (item as any).uid || effectiveUserId}
                                fallbackPhoto={realPhoto}
                                fallbackName={realName}
                                className="w-6 h-6 rounded-full shrink-0 overflow-hidden shadow mt-0.5 border border-slate-700/50"
                              />
                              <h4 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleVideoCardClick(item);
                                }}
                                style={{ pointerEvents: 'auto' }}
                                className="text-xs font-bold text-white line-clamp-2 leading-tight group-hover:text-cyan-300 transition-colors cursor-pointer pointer-events-auto flex-1 min-w-0"
                                title={item.title}
                              >
                                {item.title}
                              </h4>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1.5 font-medium flex items-center justify-between pointer-events-none pl-8">
                              <span>{item.views || '0 views'}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Content for Active Tab 2: FRIENDS & SOCIAL (Real Firestore Graph) */}
            {activeTab === 'subs' && !isViewingOtherCreator && (
              <SocialHubSection
                currentUid={signedInUid}
                onOpenUserProfile={(uid) => {
                  setInternalProfileUid(uid);
                  setActiveTab('videos');
                }}
                onRequireAuth={() => openAuthModal('login')}
                onShowToast={showToast}
                onCountsChange={setSocialCounts}
              />
            )}

          </div>
        </div>
      )}

      {/* Hidden File Input for Phone Gallery selection */}
      <input
        type="file"
        ref={fileInputRef}
        accept="video/*"
        onChange={handleGalleryFileChange}
        className="hidden"
      />

      {/* Upload Direct Modal (No Title Input) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#0c1424] border border-slate-800 rounded-3xl p-5 shadow-2xl relative">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                {uploadStep === 'select_source' && <span>📁 Select Video Source</span>}
                {uploadStep === 'kingtube_folder' && <span>🔴 KINGTUBE Downloads Folder</span>}
                {uploadStep === 'confirm' && <span className="text-red-500">🔴 Upload to KINGTUBE</span>}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* STEP 1: Select Source (Gallery vs KINGTUBE Downloads) */}
            {uploadStep === 'select_source' && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-slate-300">Choose where to select your video from:</p>
                
                {/* 1. Gallery Option */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-4 bg-[#0a0e1f] hover:bg-[#121833] border border-slate-700 hover:border-cyan-500 rounded-2xl flex items-center gap-3 transition active:scale-95 group text-left cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-2xl group-hover:scale-110 transition">
                    🖼️
                  </div>
                  <div>
                    <div className="text-xs font-black text-white group-hover:text-cyan-400 transition">
                      Gallery - Choose from Phone
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Select video files stored on your device storage
                    </div>
                  </div>
                </button>

                {/* 2. KINGTUBE Option */}
                <button
                  type="button"
                  onClick={() => setUploadStep('kingtube_folder')}
                  className="w-full p-4 bg-[#0a0e1f] hover:bg-[#121833] border border-slate-700 hover:border-red-500 rounded-2xl flex items-center gap-3 transition active:scale-95 group text-left cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center text-2xl group-hover:scale-110 transition">
                    🔴
                  </div>
                  <div>
                    <div className="text-xs font-black text-white group-hover:text-red-400 transition">
                      KINGTUBE - Choose from Downloads
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Select from your downloaded clips folder in KING
                    </div>
                  </div>
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-6 py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* STEP 1.B: KINGTUBE Folder View */}
            {uploadStep === 'kingtube_folder' && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">Select a Downloaded Video:</span>
                  <button
                    type="button"
                    onClick={() => setUploadStep('select_source')}
                    className="text-[11px] text-cyan-400 hover:underline"
                  >
                    ← Back
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {getKingtubeDownloads().map((clip) => (
                    <div
                      key={clip.id}
                      onClick={() => {
                        setSelectedVideo(clip);
                        setUploadStep('confirm');
                      }}
                      className="p-2.5 bg-[#060a14] hover:bg-[#111a33] border border-gray-800 hover:border-red-500 rounded-2xl flex items-center gap-3 cursor-pointer transition active:scale-95"
                    >
                      <img
                        src={clip.img}
                        alt={clip.title}
                        className="w-16 h-12 rounded-lg object-cover flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{clip.title}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">{clip.views}</p>
                      </div>
                      <span className="text-xs font-bold bg-red-600 text-white px-2 py-1 rounded-lg">
                        Select
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 2: Confirm Upload + 5 Icons (NO TITLE INPUT) */}
            {uploadStep === 'confirm' && selectedVideo && (
              <form onSubmit={handleAddVideo} className="mt-4 space-y-3">
                
                {/* Selected Video Preview Card - Real File Picked */}
                <div className="p-3 bg-[#060a14] border border-cyan-500/40 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> SELECTED VIDEO FILE
                    </span>
                    {selectedVideo.fileSize && (
                      <span className="text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30">
                        {selectedVideo.fileSize}
                      </span>
                    )}
                  </div>

                  <div className="flex items-start gap-3">
                    {/* Live Video element thumbnail */}
                    {selectedVideo.uri ? (
                      <video
                        src={selectedVideo.uri}
                        className="w-20 h-16 rounded-xl object-cover bg-black border border-slate-800 shrink-0"
                        muted
                        playsInline
                      />
                    ) : (
                      <img
                        src={selectedVideo.img}
                        alt={selectedVideo.title}
                        className="w-20 h-16 rounded-xl object-cover bg-black border border-slate-800 shrink-0"
                      />
                    )}

                    <div className="flex-1 min-w-0 space-y-1">
                      <h4 className="text-xs font-black text-white truncate" title={selectedVideo.fileName || selectedVideo.title}>
                        {selectedVideo.fileName || selectedVideo.title}
                      </h4>
                      
                      {selectedVideo.fileType && (
                        <p className="text-[10px] text-slate-400 font-mono">
                          Type: <span className="text-slate-200">{selectedVideo.fileType}</span>
                        </p>
                      )}

                      {selectedVideo.uri && (
                        <p className="text-[9px] text-slate-500 font-mono truncate max-w-[180px]" title={selectedVideo.uri}>
                          URI: {selectedVideo.uri}
                        </p>
                      )}
                    </div>
                  </div>
                </div>


                {/* 1. Locked Top Destination: KINGTUBE */}
                <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🔴</span>
                    <div>
                      <div className="text-xs font-black text-white flex items-center gap-1.5">
                        KINGTUBE
                        <span className="text-[9px] bg-red-500/30 text-red-300 border border-red-500/40 px-1.5 py-0.2 rounded font-bold">
                          Primary
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-300">Always upload to your KING Channel</div>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    ✅ Locked
                  </span>
                </div>


                {/* Submit Buttons */}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleAddVideo}
                    disabled={isUploading}
                    className="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 text-white font-black text-xs rounded-xl shadow-lg transition active:scale-95 cursor-pointer"
                  >
                    {isUploading ? `${uploadProgress}% Uploading...` : "Upload Now"}
                  </button>
                  {isUploading && (
                    <div className="mt-2 w-full">
                      <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                        <div className="bg-cyan-500 h-full transition-all" style={{width: `${uploadProgress}%`}}></div>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setUploadStep('select_source')}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
                  >
                    Back
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* IN-CHANNEL VIDEO PLAYER (EDGE-TO-EDGE, NO OUTER CARD, NO BLACK SIDE BARS) */}
      {selectedChannelVideo && (
        <div 
          className="fixed inset-0 z-50 bg-[#040812] flex flex-col overflow-y-auto w-full animate-in fade-in duration-150"
          style={{ width: '100%', maxWidth: '100%' }}
        >
          {/* STICKY PLAYER CONTAINER: position: sticky; top: 0; z-index: high */}
          <div 
            className="sticky top-0 z-40 w-full bg-[#040812] shadow-2xl shrink-0"
            style={{ position: 'sticky', top: 0, zIndex: 40 }}
          >
            {/* Minimal Top Controls Bar - Only Close (left) & Save (right), minimal top spacing */}
            <div className="w-full flex items-center justify-between px-3 py-1.5 shrink-0 bg-[#040812]">
              <button
                type="button"
                onClick={handleClosePlayer}
                className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0 active:scale-95"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 shrink-0">
                {(selectedChannelVideo.videoUrl || selectedChannelVideo.url || selectedChannelVideo.uri) && (
                  <button
                    type="button"
                    onClick={() => downloadVideoFile(selectedChannelVideo)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold transition border border-emerald-500/30 cursor-pointer active:scale-95"
                    title="Download Video"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                )}
              </div>
            </div>

            {/* Video Container - Full Available Width, Edge to Edge */}
            <div 
              className={`w-full bg-black relative flex items-center justify-center overflow-hidden shrink-0 ${
                channelVideoAspect === 'portrait' 
                  ? 'h-[54vh] sm:h-[62vh] max-h-[72vh]' 
                  : 'w-full aspect-video'
              }`}
              style={{ width: '100%', maxWidth: '100%' }}
            >
              {selectedChannelVideo.videoUrl || selectedChannelVideo.url || selectedChannelVideo.uri ? (
                <video
                  key={String(selectedChannelVideo.id) || selectedChannelVideo.videoUrl || selectedChannelVideo.url}
                  src={selectedChannelVideo.videoUrl || selectedChannelVideo.url || selectedChannelVideo.uri}
                  poster={selectedChannelVideo.thumbnailUrl || selectedChannelVideo.img}
                  controls
                  autoPlay
                  playsInline
                  className={`w-full h-full block ${
                    channelVideoAspect === 'portrait' ? 'object-cover' : 'object-contain'
                  }`}
                  style={{ width: '100%', maxWidth: '100%' }}
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    const w = v.videoWidth;
                    const h = v.videoHeight;
                    const ar = h > 0 ? (w / h).toFixed(2) : 'N/A';
                    console.log("Video Width:", w);
                    console.log("Video Height:", h);
                    console.log("Aspect Ratio:", ar);
                    if (h > w) {
                      setChannelVideoAspect('portrait');
                    } else {
                      setChannelVideoAspect('landscape');
                    }
                  }}
                  onPlay={() => console.log("Playback Started")}
                  onEnded={handleNextVideo}
                />
              ) : (
                <div className="w-full h-48 flex flex-col items-center justify-center text-slate-400 text-xs">
                  <p>Video URL not available</p>
                </div>
              )}
            </div>
          </div>

          {/* Video Controls & Navigation */}
          <div className="flex-1 flex flex-col p-3 sm:p-4 gap-4 pb-24 w-full max-w-3xl mx-auto">
            {/* Title, Channel and Views below the video */}
            <div className="flex items-start gap-3">
              <CreatorAvatar
                uid={selectedChannelVideo.userId || selectedChannelVideo.uid || effectiveUserId}
                fallbackPhoto={realPhoto}
                fallbackName={realName}
                className="w-10 h-10 rounded-full shrink-0 overflow-hidden shadow-md border border-slate-700/60 mt-0.5"
              />
              <div>
                <h2 className="text-white font-bold text-sm sm:text-base leading-snug">
                  {selectedChannelVideo.title || "KING Video"}
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                  <span className="text-cyan-400 font-semibold">{realName}</span>
                  <span>•</span>
                  <span>
                    {typeof selectedChannelVideo.views === 'number' 
                      ? `${selectedChannelVideo.views} ${selectedChannelVideo.views === 1 ? 'view' : 'views'}` 
                      : (selectedChannelVideo.views || "0 views")}
                  </span>
                  {selectedChannelVideo.likes !== undefined && (
                    <>
                      <span>•</span>
                      <span className="text-red-400 font-medium flex items-center gap-1">
                        <Heart className="w-3 h-3 fill-current inline" />
                        {selectedChannelVideo.likes}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 shrink-0">
              <button
                type="button"
                onClick={handlePrevVideo}
                disabled={channelVideos.length <= 1}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 bg-[#060a14] hover:bg-[#111a33] text-slate-300 hover:text-white text-xs sm:text-sm font-bold rounded-xl border border-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <SkipBack className="w-3.5 h-3.5" /> Prev Video
              </button>

              <span className="text-[10px] sm:text-xs text-slate-400 font-mono">
                {(channelVideos.findIndex(v => v.id === selectedChannelVideo.id) >= 0 
                  ? channelVideos.findIndex(v => v.id === selectedChannelVideo.id) + 1 
                  : 1)} of {Math.max(channelVideos.length, 1)}
              </span>

              <button
                type="button"
                onClick={handleNextVideo}
                disabled={channelVideos.length <= 1}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs sm:text-sm font-bold rounded-xl shadow transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Next Video <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
