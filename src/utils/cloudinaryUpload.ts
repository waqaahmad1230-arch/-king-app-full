/**
 * KING Shop Cloudinary Upload Service
 * Handles direct unsigned uploads to Cloudinary with preset 'kingtube'
 * Cloud Name: xb0o3xwi
 * Preset: kingtube
 * Supports images (max 10MB) and videos (max 50MB) with upload progress
 */

export const CLOUDINARY_CLOUD_NAME = 'xb0o3xwi';
export const CLOUDINARY_PRESET = 'kingtube';

export interface UploadProgressCallback {
  (percent: number, statusText: string): void;
}

export function validateProductFile(file: File, type: 'image' | 'video'): { valid: boolean; error?: string } {
  if (type === 'image') {
    if (!file.type.startsWith('image/')) {
      return { valid: false, error: `File "${file.name}" is not a valid image format.` };
    }
    // 10MB max for images
    if (file.size > 10 * 1024 * 1024) {
      return { valid: false, error: `Image "${file.name}" exceeds maximum allowed size of 10MB.` };
    }
  } else if (type === 'video') {
    if (!file.type.startsWith('video/')) {
      return { valid: false, error: `File "${file.name}" is not a valid video format.` };
    }
    // 50MB max for videos
    if (file.size > 50 * 1024 * 1024) {
      return { valid: false, error: `Video "${file.name}" exceeds maximum allowed size of 50MB.` };
    }
  }
  return { valid: true };
}

/**
 * Uploads a single file to Cloudinary (image or video resource) using XMLHttpRequest for progress tracking with fetch fallback
 */
export async function uploadFileToCloudinary(
  file: File,
  resourceType: 'image' | 'video',
  onProgress?: UploadProgressCallback
): Promise<string> {
  const validation = validateProductFile(file, resourceType);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid file format or size');
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

  // If XMLHttpRequest is not available in current JS runtime (e.g. Node.js test runner), use Fetch API
  if (typeof XMLHttpRequest === 'undefined') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_PRESET);

    if (onProgress) onProgress(30, `Uploading ${file.name}...`);
    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });

    const json = await res.json();
    if (res.ok && json.secure_url) {
      if (onProgress) onProgress(100, `Uploaded ${file.name}`);
      return json.secure_url;
    }
    throw new Error(json.error?.message || `Upload failed for ${file.name}`);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_PRESET);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent, `Uploading ${file.name} (${percent}%)...`);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.secure_url) {
            if (onProgress) onProgress(100, `Uploaded ${file.name}`);
            resolve(response.secure_url);
          } else {
            reject(new Error(response.error?.message || 'Cloudinary did not return a secure URL'));
          }
        } catch (e) {
          reject(new Error('Failed to parse Cloudinary response'));
        }
      } else {
        try {
          const response = JSON.parse(xhr.responseText);
          reject(new Error(response.error?.message || `Upload failed with status ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed with HTTP status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = async () => {
      // Fallback to Fetch API if XHR network event fails
      try {
        if (onProgress) onProgress(50, `Retrying ${file.name}...`);
        const fallbackForm = new FormData();
        fallbackForm.append('file', file);
        fallbackForm.append('upload_preset', CLOUDINARY_PRESET);

        const fetchRes = await fetch(endpoint, {
          method: 'POST',
          body: fallbackForm,
        });

        const fetchJson = await fetchRes.json();
        if (fetchRes.ok && fetchJson.secure_url) {
          if (onProgress) onProgress(100, `Uploaded ${file.name}`);
          resolve(fetchJson.secure_url);
        } else {
          reject(new Error(fetchJson.error?.message || `Upload failed for ${file.name}`));
        }
      } catch (fallbackErr: any) {
        reject(new Error(`Network error uploading ${file.name}: ${fallbackErr.message || 'Connection failed'}`));
      }
    };

    xhr.open('POST', endpoint, true);
    xhr.send(formData);
  });
}

/**
 * Uploads multiple files sequentially with overall progress callbacks
 */
export async function uploadBatchFilesToCloudinary(
  files: File[],
  resourceType: 'image' | 'video',
  onProgress?: (overallPercent: number, statusText: string) => void
): Promise<string[]> {
  const uploadedUrls: string[] = [];
  const totalFiles = files.length;

  for (let i = 0; i < totalFiles; i++) {
    const file = files[i];
    const fileNum = i + 1;

    try {
      const url = await uploadFileToCloudinary(file, resourceType, (filePercent) => {
        if (onProgress) {
          const overall = Math.round(((i + filePercent / 100) / totalFiles) * 100);
          onProgress(
            overall,
            `Uploading ${resourceType} ${fileNum} of ${totalFiles}: ${file.name} (${filePercent}%)`
          );
        }
      });
      uploadedUrls.push(url);
    } catch (err: any) {
      console.error(`Failed to upload ${file.name}:`, err);
      throw new Error(`Failed uploading ${resourceType} "${file.name}": ${err.message || 'Upload error'}`);
    }
  }

  return uploadedUrls;
}
