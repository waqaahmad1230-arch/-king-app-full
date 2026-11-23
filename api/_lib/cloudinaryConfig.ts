export const CLOUDINARY_CLOUD_NAME = 'xb0o3xwi';

export function getCloudinaryCredentials() {
  let cloudName =
    (process.env.CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME).trim() || CLOUDINARY_CLOUD_NAME;
  let apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  let apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

  if ((!apiKey || !apiSecret) && process.env.CLOUDINARY_URL) {
    try {
      const parsedUrl = new URL(process.env.CLOUDINARY_URL.trim());
      if (parsedUrl.protocol === 'cloudinary:') {
        if (!apiKey && parsedUrl.username) apiKey = decodeURIComponent(parsedUrl.username);
        if (!apiSecret && parsedUrl.password) apiSecret = decodeURIComponent(parsedUrl.password);
        if (parsedUrl.hostname && !process.env.CLOUDINARY_CLOUD_NAME) {
          cloudName = parsedUrl.hostname;
        }
      }
    } catch {
      // Ignore malformed CLOUDINARY_URL; fall back to explicit missing-env 503
    }
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    configured: Boolean(cloudName && apiKey && apiSecret),
  };
}
