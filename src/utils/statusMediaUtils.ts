import { auth } from '../firebase';
import { StatusCloudinaryDeliveryType, StatusPrivacyMode } from '../types/social';

export const MAX_STATUS_VIDEO_SECONDS = 60;
export const MAX_STATUS_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_STATUS_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_STATUS_AUDIO_BYTES = 15 * 1024 * 1024;
export const STATUS_CLOUDINARY_FOLDER = 'king_status';
export const STATUS_CLOUD_NAME = 'xb0o3xwi';

export interface StatusUploadResult {
  secureUrl: string;
  thumbnailUrl: string;
  publicId: string;
  resourceType: 'image' | 'video' | 'raw';
  deliveryType: StatusCloudinaryDeliveryType;
  signedUploadUsed: boolean;
}

export function validateStatusVideoDuration(durationSec: number): { valid: boolean; error?: string } {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { valid: false, error: 'Could not read video duration. Please pick a valid video file.' };
  }
  if (durationSec > MAX_STATUS_VIDEO_SECONDS) {
    return {
      valid: false,
      error: `Status video cannot exceed ${MAX_STATUS_VIDEO_SECONDS} seconds (selected video is ${Math.ceil(
        durationSec
      )}s).`,
    };
  }
  return { valid: true };
}

export async function readMediaDurationSeconds(file: File, kind: 'video' | 'audio'): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind);
    const objectUrl = URL.createObjectURL(file);
    el.preload = 'metadata';
    el.src = objectUrl;

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    el.onloadedmetadata = () => {
      const duration = Number(el.duration);
      cleanup();
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    el.onerror = () => {
      cleanup();
      reject(new Error(`Unable to inspect ${kind} metadata.`));
    };
  });
}

export async function generateStatusVideoPosterDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.5, Math.max(0, (video.duration || 1) * 0.1));
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const maxW = 480;
        const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1;
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
          cleanup();
          resolve(dataUrl);
          return;
        }
      } catch {
        // Ignore canvas taint/draw issues
      }
      cleanup();
      resolve('');
    };

    video.onerror = () => {
      cleanup();
      resolve('');
    };
  });
}

export async function compressStatusImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= 450 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDim = 1600;
      const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
      const targetW = Math.max(1, Math.round(img.width * ratio));
      const targetH = Math.max(1, Math.round(img.height * ratio));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, targetW, targetH);
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0 && blob.size < file.size) {
            resolve(
              new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                type: 'image/jpeg',
              })
            );
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        0.84
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

export function supportsClientVideoCompression(): boolean {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return false;
  const canvas = document.createElement('canvas');
  return typeof (canvas as any).captureStream === 'function';
}

/**
 * Compresses video in-browser via Canvas + MediaRecorder when supported (max 720p @ ~1.6Mbps).
 * Automatically falls back to the original file if unsupported or if output exceeds original size.
 */
export async function compressStatusVideo(
  file: File,
  onProgress?: (percent: number, label: string) => void
): Promise<File> {
  if (!supportsClientVideoCompression() || file.size <= 6 * 1024 * 1024) {
    return file;
  }

  const mimeCandidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
  ];
  const supportedMime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (!supportedMime) {
    return file;
  }

  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    video.playsInline = true;
    video.muted = false;
    video.crossOrigin = 'anonymous';

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_STATUS_VIDEO_SECONDS) {
        cleanup();
        resolve(file);
        return;
      }

      try {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(video.videoWidth || 720, video.videoHeight || 1280));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(2, Math.round((video.videoWidth || 720) * scale));
        canvas.height = Math.max(2, Math.round((video.videoHeight || 1280) * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          resolve(file);
          return;
        }

        const canvasStream: MediaStream = (canvas as any).captureStream(24);
        const videoStream =
          typeof (video as any).captureStream === 'function'
            ? ((video as any).captureStream() as MediaStream)
            : null;
        if (videoStream) {
          videoStream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
        }

        const chunks: BlobPart[] = [];
        const recorder = new MediaRecorder(canvasStream, {
          mimeType: supportedMime,
          videoBitsPerSecond: 1_600_000,
        });

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunks.push(ev.data);
        };

        recorder.onstop = () => {
          cleanup();
          const blob = new Blob(chunks, { type: supportedMime.split(';')[0] });
          if (blob.size > 0 && blob.size < file.size * 0.92) {
            resolve(
              new File([blob], file.name.replace(/\.[^/.]+$/, '.webm'), {
                type: 'video/webm',
              })
            );
          } else {
            resolve(file);
          }
        };

        recorder.onerror = () => {
          cleanup();
          resolve(file);
        };

        let rafId = 0;
        const drawFrame = () => {
          if (video.paused || video.ended) {
            cancelAnimationFrame(rafId);
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          if (onProgress && duration > 0) {
            const pct = Math.min(99, Math.round((video.currentTime / duration) * 100));
            onProgress(pct, `Compressing video (${pct}%)...`);
          }
          rafId = requestAnimationFrame(drawFrame);
        };

        video.onended = () => {
          cancelAnimationFrame(rafId);
          if (recorder.state !== 'inactive') recorder.stop();
        };

        // Route via muted volume 0 output so user doesn't hear playback during transcode
        video.volume = 0;
        recorder.start(250);
        video
          .play()
          .then(() => {
            drawFrame();
          })
          .catch(() => {
            if (recorder.state !== 'inactive') recorder.stop();
          });
      } catch {
        cleanup();
        resolve(file);
      }
    };

    video.onerror = () => {
      cleanup();
      resolve(file);
    };
  });
}

/**
 * Returns optimized Cloudinary progressive video delivery URL for standard public assets.
 * Preserves signed authenticated URLs untouched and does NOT fabricate HLS adaptive streaming.
 */
export function getStatusVideoDeliveryUrl(
  mediaUrl: string,
  deliveryType: StatusCloudinaryDeliveryType
): string {
  if (!mediaUrl) return '';
  if (deliveryType === 'authenticated' || mediaUrl.includes('/s--')) {
    return mediaUrl;
  }
  if (mediaUrl.includes(`res.cloudinary.com/${STATUS_CLOUD_NAME}/video/upload/`)) {
    const [base, rest] = mediaUrl.split('/video/upload/');
    if (rest && !rest.startsWith('q_auto')) {
      return `${base}/video/upload/q_auto:good,f_auto/${rest}`;
    }
  }
  return mediaUrl;
}

/**
 * Uploads Status media exclusively into Cloudinary folder `king_status/` without altering
 * KING Shop (`cloudinaryUpload.ts`) or KINGTUBE (`kingtube`) upload behavior.
 */
export async function uploadStatusMediaToCloudinary(
  file: File,
  resourceType: 'image' | 'video',
  privacyMode: StatusPrivacyMode,
  onProgress?: (percent: number, label: string) => void
): Promise<StatusUploadResult> {
  if (resourceType === 'image' && file.size > MAX_STATUS_IMAGE_BYTES) {
    throw new Error('Status image exceeds 10MB limit.');
  }
  if (resourceType === 'video' && file.size > MAX_STATUS_VIDEO_BYTES) {
    throw new Error('Status video exceeds 50MB limit.');
  }

  if (!auth.currentUser) {
    throw new Error('Please sign in to upload Status media.');
  }

  const idToken = await auth.currentUser.getIdToken();
  const signRes = await fetch('/api/status/sign-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ resourceType, privacyMode }),
  });

  const signMeta: any = await signRes.json().catch(() => ({}));
  if (
    !signRes.ok ||
    !signMeta?.signed ||
    !signMeta?.signature ||
    !signMeta?.apiKey ||
    !signMeta?.timestamp
  ) {
    throw new Error(
      signMeta?.message ||
        signMeta?.error ||
        `Signed Status upload is unavailable (HTTP ${signRes.status}). Server Cloudinary credentials are required.`
    );
  }

  const deliveryType: StatusCloudinaryDeliveryType =
    signMeta.deliveryType === 'upload' ? 'upload' : 'authenticated';
  const endpoint = `https://api.cloudinary.com/v1_1/${signMeta.cloudName || STATUS_CLOUD_NAME}/${resourceType}/upload`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', signMeta.folder || STATUS_CLOUDINARY_FOLDER);
  formData.append('api_key', String(signMeta.apiKey));
  formData.append('timestamp', String(signMeta.timestamp));
  formData.append('signature', String(signMeta.signature));
  formData.append('type', deliveryType);

  const uploadResponse: any = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        onProgress(pct, `Uploading to king_status (${pct}%)...`);
      }
    };
    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && parsed.secure_url) {
          resolve(parsed);
        } else {
          reject(new Error(parsed?.error?.message || `Upload failed (HTTP ${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error uploading status media.'));
    xhr.open('POST', endpoint, true);
    xhr.send(formData);
  });

  const secureUrl = String(uploadResponse.secure_url || '');
  const publicId = String(uploadResponse.public_id || '');

  const thumbnailUrl =
    resourceType === 'video' && deliveryType === 'upload'
      ? secureUrl
          .split('?')[0]
          .replace(/\.[^/.]+$/, '.jpg')
          .replace('/video/upload/', '/video/upload/so_0,w_480,h_800,c_fill/')
      : resourceType === 'image'
      ? secureUrl
      : '';

  return {
    secureUrl,
    thumbnailUrl,
    publicId,
    resourceType,
    deliveryType,
    signedUploadUsed: true,
  };
}
