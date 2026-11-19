import { auth } from '../firebase';

export interface PostAiCapabilityResponse {
  ok: boolean;
  configured: boolean;
  provider: string;
  photoSupported: boolean;
  photoModel: string;
  videoSupported: boolean;
  videoReason?: string;
  missingEnv?: string[];
}

export interface PostAiEditResult {
  file: File;
  previewUrl: string;
  model: string;
  note?: string;
}

const MAX_UPLOAD_DIMENSION = 1536;

async function prepareImageBase64Payload(file: File): Promise<{
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not load photo for AI processing.'));
      el.src = objectUrl;
    });

    const srcW = img.naturalWidth || img.width || 1080;
    const srcH = img.naturalHeight || img.height || 1080;
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(srcW, srcH));
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas unavailable for image preparation.');
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const outMime: 'image/jpeg' | 'image/png' =
      file.type === 'image/png' && file.size <= 2 * 1024 * 1024 ? 'image/png' : 'image/jpeg';
    const dataUrl =
      outMime === 'image/png'
        ? canvas.toDataURL('image/png')
        : canvas.toDataURL('image/jpeg', 0.88);
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) {
      throw new Error('Failed to encode photo payload.');
    }
    return {
      base64: dataUrl.slice(commaIdx + 1),
      mimeType: outMime,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function base64ToFile(base64: string, mimeType: string, originalFileName: string): File {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const cleanMime = mimeType || 'image/png';
  const ext =
    cleanMime === 'image/jpeg' ? 'jpg' : cleanMime === 'image/webp' ? 'webp' : 'png';
  const baseName = (originalFileName || 'king_post').replace(/\.[^/.]+$/, '');
  const blob = new Blob([bytes], { type: cleanMime });
  return new File([blob], `${baseName}_king_ai.${ext}`, {
    type: cleanMime,
    lastModified: Date.now(),
  });
}

export async function checkPostAiAvailability(): Promise<PostAiCapabilityResponse> {
  const res = await fetch('/api/post-editor/ai-edit', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    return parsed as PostAiCapabilityResponse;
  } catch {
    return {
      ok: false,
      configured: false,
      provider: 'google-gemini',
      photoSupported: false,
      photoModel: 'gemini-3.1-flash-lite-image',
      videoSupported: false,
      videoReason: 'AI backend endpoint did not return JSON.',
    };
  }
}

export async function requestAiPhotoEdit(params: {
  file: File;
  prompt: string;
  presetAction?: string;
  onProgress?: (pct: number, label: string) => void;
}): Promise<PostAiEditResult> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in first to use KING AI editing.');
  }

  params.onProgress?.(15, 'Preparing photo for KING AI...');
  const { base64, mimeType } = await prepareImageBase64Payload(params.file);

  params.onProgress?.(35, 'Verifying session...');
  const idToken = await user.getIdToken();

  params.onProgress?.(55, 'Editing photo with KING AI...');
  const res = await fetch('/api/post-editor/ai-edit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      mediaType: 'photo',
      mimeType,
      imageBase64: base64,
      prompt: params.prompt,
      presetAction: params.presetAction,
    }),
  });

  const rawText = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error(
      `AI backend endpoint returned an invalid response (HTTP ${res.status}). Ensure /api/post-editor/ai-edit is active.`
    );
  }

  if (!res.ok || !json?.ok || !json?.imageBase64) {
    throw new Error(json?.error || `AI edit failed (HTTP ${res.status}).`);
  }

  params.onProgress?.(90, 'Rendering edited preview...');
  const editedFile = base64ToFile(
    json.imageBase64,
    json.mimeType || 'image/png',
    params.file.name
  );
  const previewUrl = URL.createObjectURL(editedFile);

  params.onProgress?.(100, 'Ready');
  return {
    file: editedFile,
    previewUrl,
    model: json.model || 'gemini-3.1-flash-lite-image',
    note: json.note,
  };
}
