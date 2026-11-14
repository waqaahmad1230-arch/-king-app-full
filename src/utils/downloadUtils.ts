import { db, auth } from '../firebase';
import { collection, doc, setDoc, getDocs, orderBy, query, deleteDoc } from 'firebase/firestore';

export interface DownloadItem {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  videoUrl: string;
  downloadedAt: string;
  userId?: string;
  isPrivate?: boolean;
}

const LOCAL_STORAGE_KEY = 'king_downloads';
const KINGTUBE_LEGACY_KEY = 'kingtube_downloads';

/**
 * Save a video download record to Firestore (users/{uid}/downloads) and cache in localStorage (king_downloads).
 */
export const saveDownloadRecord = async (video: any, currentUserId?: string): Promise<DownloadItem> => {
  console.log("Download Started", video);

  const videoId = String(video.id || video.videoId || video.public_id || (video.videoUrl ? video.videoUrl : Date.now()));
  const title = video.title || video.name || 'Untitled Video';
  const videoUrl = video.videoUrl || video.url || video.uri || '';
  const thumbnailUrl = video.thumbnailUrl || video.thumbnail || video.img || '';
  const downloadedAt = new Date().toISOString();
  const userId = currentUserId || auth.currentUser?.uid || localStorage.getItem('king_uid') || localStorage.getItem('king_email') || 'anonymous';

  const record: DownloadItem = {
    videoId,
    title,
    thumbnailUrl,
    videoUrl,
    downloadedAt,
    userId,
  };

  // 1. Cache in localStorage (king_downloads)
  try {
    const localData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    const filtered = localData.filter((item: any) => item.videoId !== videoId);
    const updated = [record, ...filtered];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

    // Also sync to legacy kingtube_downloads format for channel clip upload picker
    try {
      const kingtubeClips = JSON.parse(localStorage.getItem(KINGTUBE_LEGACY_KEY) || '[]');
      const filteredKingtube = kingtubeClips.filter((c: any) => String(c.id) !== videoId);
      const newClip = {
        id: videoId,
        title,
        img: thumbnailUrl,
        videoUrl,
        url: videoUrl,
        duration: video.duration || '0:30',
        views: video.views || 'Downloaded',
        downloadedAt,
      };
      localStorage.setItem(KINGTUBE_LEGACY_KEY, JSON.stringify([newClip, ...filteredKingtube]));
    } catch {
      // ignore
    }
  } catch (err) {
    console.error("Error saving download to localStorage:", err);
  }

  // 2. Save in Firestore: users/{uid}/downloads
  const uid = auth.currentUser?.uid || (userId !== 'anonymous' ? userId : null);
  if (uid) {
    try {
      const downloadDocRef = doc(db, 'users', uid, 'downloads', videoId);
      await setDoc(downloadDocRef, record, { merge: true });
    } catch (fsErr) {
      console.warn("Could not save download to Firestore users/{uid}/downloads:", fsErr);
    }
  }

  console.log("Download Saved", record);
  return record;
};

/**
 * Trigger browser file download for a video
 */
export const downloadVideoFile = async (video: any, currentUserId?: string) => {
  const url = video.videoUrl || video.url || video.uri;
  if (!url) {
    console.warn("No video URL to download");
    return;
  }

  // Save record immediately
  await saveDownloadRecord(video, currentUserId);

  // Trigger file download
  try {
    const filename = `${(video.title || 'king-video').replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Fetch failed');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch (e) {
    console.warn("Direct blob download failed, falling back to direct anchor link:", e);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.download = `${(video.title || 'king-video').replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
};

/**
 * Load downloads list: Firestore first, localStorage fallback.
 */
export const loadDownloads = async (currentUserId?: string): Promise<DownloadItem[]> => {
  const uid = currentUserId || auth.currentUser?.uid || localStorage.getItem('king_uid');

  if (uid) {
    try {
      const collRef = collection(db, 'users', uid, 'downloads');
      const q = query(collRef, orderBy('downloadedAt', 'desc'));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const firestoreList: DownloadItem[] = [];
        snap.forEach((d) => {
          firestoreList.push(d.data() as DownloadItem);
        });

        console.log("Downloads Loaded", firestoreList);

        // Keep local cache in sync
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(firestoreList));
        } catch {
          // ignore
        }

        return firestoreList;
      }
    } catch (err) {
      console.warn("Failed to load downloads from Firestore, falling back to localStorage:", err);
    }
  }

  // Fallback to localStorage: king_downloads
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached) {
      const parsed: DownloadItem[] = JSON.parse(cached);
      console.log("Downloads Loaded", parsed);
      return parsed;
    }
  } catch (err) {
    console.error("Error reading localStorage downloads:", err);
  }

  console.log("Downloads Loaded", []);
  return [];
};

export const updateDownloadItem = async (videoId: string, updates: Partial<DownloadItem>): Promise<DownloadItem[]> => {
  console.log("DIAGNOSTIC [downloadUtils] updateDownloadItem called with videoId:", videoId, "updates:", updates);
  let currentList: DownloadItem[] = [];
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached) currentList = JSON.parse(cached);
  } catch {}
  if (currentList.length === 0) {
    currentList = await loadDownloads();
  }
  const updatedList = currentList.map(item => 
    (String(item.videoId) === String(videoId) || String((item as any).id) === String(videoId) || (item.videoUrl && item.videoUrl === videoId))
      ? { ...item, ...updates }
      : item
  );
  
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedList));
    console.log("DIAGNOSTIC [downloadUtils] updatedList saved to localStorage:", LOCAL_STORAGE_KEY);
  } catch (err) {
    console.error("Error saving updated downloads to localStorage:", err);
  }

  const uid = auth.currentUser?.uid || localStorage.getItem('king_uid');
  if (uid) {
    try {
      const item = updatedList.find(i => String(i.videoId) === String(videoId) || String((i as any).id) === String(videoId) || (i.videoUrl && i.videoUrl === videoId));
      if (item) {
        const rawId = item.videoId || videoId;
        const safeDocId = String(rawId).replace(/\//g, '_');
        const downloadDocRef = doc(db, 'users', uid, 'downloads', safeDocId);
        await setDoc(downloadDocRef, item, { merge: true });
        console.log("DIAGNOSTIC [downloadUtils] updated in Firestore:", safeDocId);
      }
    } catch (fsErr) {
      console.warn("Could not update download in Firestore:", fsErr);
    }
  }

  return updatedList;
};

export const deleteDownloadItem = async (videoId: string): Promise<DownloadItem[]> => {
  console.log("DIAGNOSTIC [downloadUtils] deleteDownloadItem called with videoId:", videoId);
  let currentList: DownloadItem[] = [];
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached) currentList = JSON.parse(cached);
  } catch {}
  if (currentList.length === 0) {
    currentList = await loadDownloads();
  }
  const updatedList = currentList.filter(item => 
    String(item.videoId) !== String(videoId) && 
    String((item as any).id) !== String(videoId) && 
    (!item.videoUrl || item.videoUrl !== videoId)
  );

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedList));
    console.log("DIAGNOSTIC [downloadUtils] updatedList after delete saved to localStorage");
    try {
      const legacy = JSON.parse(localStorage.getItem(KINGTUBE_LEGACY_KEY) || '[]');
      const updatedLegacy = legacy.filter((c: any) => String(c.id) !== String(videoId) && String(c.videoId) !== String(videoId));
      localStorage.setItem(KINGTUBE_LEGACY_KEY, JSON.stringify(updatedLegacy));
    } catch {}
  } catch (err) {
    console.error("Error updating downloads after delete in localStorage:", err);
  }

  const uid = auth.currentUser?.uid || localStorage.getItem('king_uid');
  if (uid) {
    try {
      const safeDocId = String(videoId).replace(/\//g, '_');
      const downloadDocRef = doc(db, 'users', uid, 'downloads', safeDocId);
      await deleteDoc(downloadDocRef);
      console.log("DIAGNOSTIC [downloadUtils] deleted from Firestore:", safeDocId);
    } catch (fsErr) {
      console.warn("Could not delete download from Firestore:", fsErr);
    }
  }

  return updatedList;
};
