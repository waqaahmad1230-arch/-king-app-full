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
  const shareUrl = getWatchUrl(videoId);
  return `👑 KING App\n🎬 Watch viral video\n${shareUrl}`;
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

  const title = (video?.title && String(video.title).trim()) || 'Watch Viral Videos';
  const fullTitle = `👑 KING App - ${title}`;
  const viewsText = formatMetaCount(video?.views, 'view', 'views');
  const likesText = formatMetaCount(video?.likes, 'like', 'likes');
  const description = `${viewsText} • ${likesText} | Watch viral videos on KING App`;
  const imageUrl = getVideoThumbnailUrl(video);
  const watchUrl = watchUrlOverride || getWatchUrl(video?.id || video?.videoId);
  const videoUrl = (video?.videoUrl || video?.url || '').trim();

  document.title = fullTitle;
  upsertMetaTag('name', 'description', description);
  upsertMetaTag('property', 'og:site_name', 'KING App');
  upsertMetaTag('property', 'og:title', fullTitle);
  upsertMetaTag('property', 'og:description', description);
  upsertMetaTag('property', 'og:image', imageUrl);
  upsertMetaTag('property', 'og:url', watchUrl);
  upsertMetaTag('property', 'og:type', 'video.other');
  upsertMetaTag('name', 'twitter:card', 'summary_large_image');
  upsertMetaTag('name', 'twitter:title', fullTitle);
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
  const defaultTitle = '👑 KING App - Watch Viral Videos';
  const defaultDesc = '12M views • 228K likes | Watch viral videos on KING App';

  document.title = defaultTitle;
  upsertMetaTag('name', 'description', defaultDesc);
  upsertMetaTag('property', 'og:site_name', 'KING App');
  upsertMetaTag('property', 'og:title', defaultTitle);
  upsertMetaTag('property', 'og:description', defaultDesc);
  upsertMetaTag('property', 'og:image', DEFAULT_KING_OG_IMAGE);
  upsertMetaTag('property', 'og:url', `${APP_SHARE_ORIGIN}/`);
  upsertMetaTag('property', 'og:type', 'website');
  upsertMetaTag('name', 'twitter:title', defaultTitle);
  upsertMetaTag('name', 'twitter:description', defaultDesc);
  upsertMetaTag('name', 'twitter:image', DEFAULT_KING_OG_IMAGE);
}
