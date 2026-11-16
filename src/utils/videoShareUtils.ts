export const APP_SHARE_ORIGIN = 'https://king-app-full.vercel.app';
export const DEFAULT_KING_OG_IMAGE = `${APP_SHARE_ORIGIN}/king-logo.png`;

export function getWatchUrl(videoId?: string | null): string {
  const cleanId = typeof videoId === 'string' ? videoId.trim() : '';
  return cleanId
    ? `https://king-app-full.vercel.app/watch/${encodeURIComponent(cleanId)}`
    : 'https://king-app-full.vercel.app/';
}

export function buildVideoShareText(video: any): string {
  const videoId = video?.id || video?.videoId || '';
  return getWatchUrl(videoId);
}

export function getVideoThumbnailUrl(video: any): string {
  const candidates = [video?.thumbnailUrl, video?.thumbnail, video?.img];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      return c.trim();
    }
  }
  const rawVideoUrl = video?.videoUrl || video?.url || video?.uri || '';
  if (typeof rawVideoUrl === 'string' && rawVideoUrl.includes('res.cloudinary.com')) {
    const cleanUrl = rawVideoUrl.split('?')[0];
    return cleanUrl
      .replace(/\.[^/.]+$/, '.jpg')
      .replace('/video/upload/', '/video/upload/so_0,w_600,h_800,c_fill/');
  }
  return DEFAULT_KING_OG_IMAGE;
}

export function formatMetaCount(value: any, singular: string, plural: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return `0 ${plural}`;
    if (/[km]$/i.test(trimmed) || trimmed.toLowerCase().includes(singular)) {
      return trimmed.toLowerCase().includes(singular) ? trimmed : `${trimmed} ${plural}`;
    }
  }
  const num = Number(value) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M ${plural}`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K ${plural}`;
  return `${num} ${num === 1 ? singular : plural}`;
}

function upsertMetaTag(attrName: 'property' | 'name', attrValue: string, content: string) {
  if (typeof document === 'undefined') return;
  let meta = document.head.querySelector(`meta[${attrName}="${attrValue}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attrName, attrValue);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

export function applyVideoOpenGraphMeta(video: any, watchUrlOverride?: string) {
  if (typeof document === 'undefined' || !video) return;

  const videoTitle = (video?.title && String(video.title).trim()) || String(video?.id || video?.videoId || 'KING Video');
  const viewsText = formatMetaCount(video?.views, 'view', 'views');
  const likesText = formatMetaCount(video?.likes, 'like', 'likes');
  const description = `${videoTitle} • ${viewsText} • ${likesText} | Reel by KING App`;
  const imageUrl = getVideoThumbnailUrl(video);
  const watchUrl = watchUrlOverride || getWatchUrl(video?.id || video?.videoId);
  const videoUrl = (video?.videoUrl || video?.url || '').trim();

  document.title = 'KING App';
  upsertMetaTag('name', 'description', description);
  upsertMetaTag('property', 'og:site_name', 'KING App');
  upsertMetaTag('property', 'og:title', 'KING App');
  upsertMetaTag('property', 'og:description', description);
  upsertMetaTag('property', 'og:image', imageUrl);
  upsertMetaTag('property', 'og:url', watchUrl);
  upsertMetaTag('property', 'og:type', 'video.other');
  upsertMetaTag('name', 'twitter:card', 'summary_large_image');
  upsertMetaTag('name', 'twitter:title', 'KING App');
  upsertMetaTag('name', 'twitter:description', description);
  upsertMetaTag('name', 'twitter:image', imageUrl);

  if (videoUrl) {
    upsertMetaTag('property', 'og:video', videoUrl);
    upsertMetaTag('property', 'og:video:secure_url', videoUrl);
    upsertMetaTag('property', 'og:video:type', 'video/mp4');
  }
}

export function resetDefaultOpenGraphMeta() {
  if (typeof document === 'undefined') return;
  const defaultTitle = 'KING App';
  const defaultDesc = 'Watch viral videos | Reel by KING App';

  document.title = defaultTitle;
  upsertMetaTag('name', 'description', defaultDesc);
  upsertMetaTag('property', 'og:site_name', 'KING App');
  upsertMetaTag('property', 'og:title', defaultTitle);
  upsertMetaTag('property', 'og:description', defaultDesc);
  upsertMetaTag('property', 'og:image', DEFAULT_KING_OG_IMAGE);
  upsertMetaTag('property', 'og:url', `${APP_SHARE_ORIGIN}/`);
  upsertMetaTag('property', 'og:type', 'video.other');
  upsertMetaTag('name', 'twitter:title', defaultTitle);
  upsertMetaTag('name', 'twitter:description', defaultDesc);
  upsertMetaTag('name', 'twitter:image', DEFAULT_KING_OG_IMAGE);
}

export function cleanWhatsAppDigits(rawValue: unknown): string {
  if (typeof rawValue !== 'string' && typeof rawValue !== 'number') return '';
  const raw = String(rawValue).trim();
  if (!raw) return '';

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw);
      const phoneParam = parsed.searchParams.get('phone');
      if (phoneParam) {
        const digits = phoneParam.replace(/\D/g, '');
        if (digits.length >= 7) return digits;
      }
      const pathDigits = parsed.pathname.replace(/\D/g, '');
      if (pathDigits.length >= 7) return pathDigits;
      return '';
    } catch {
      // fall through to standard digit extraction
    }
  }

  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 ? digits : '';
}

export function getVideoOwnerWhatsAppNumber(
  video: any,
  creatorProfileWhatsApp?: string | null
): string {
  const candidates = [
    video?.user?.whatsappNumber,
    video?.user?.phoneNumber,
    video?.user?.phone,
    video?.user?.whatsapp,
    video?.author?.whatsapp,
    video?.author?.phoneNumber,
    video?.author?.phone,
    video?.userPhone,
    video?.whatsappNumber,
    video?.whatsapp,
    video?.phoneNumber,
    video?.phone,
    creatorProfileWhatsApp,
  ];

  for (const candidate of candidates) {
    const clean = cleanWhatsAppDigits(candidate);
    if (clean) return clean;
  }

  return '';
}

export function openVideoOwnerWhatsApp(
  video: any,
  creatorProfileWhatsApp?: string | null
): void {
  const ownerNumber = getVideoOwnerWhatsAppNumber(video, creatorProfileWhatsApp);

  if (!ownerNumber) {
    alert('This user has no WhatsApp number');
    return;
  }

  const cleanNumber = ownerNumber.replace(/\D/g, '');
  const text = `Hello! I saw your video on KING APP 👑`;
  const url = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

