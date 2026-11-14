export const APP_SHARE_ORIGIN = 'https://king-app-full.vercel.app';
export const DEFAULT_KING_OG_IMAGE = `${APP_SHARE_ORIGIN}/icon.png`;

export function getWatchUrl(videoId?: string | null): string {
  const cleanId = typeof videoId === 'string' ? videoId.trim() : '';
  return cleanId
    ? `${APP_SHARE_ORIGIN}/watch/${encodeURIComponent(cleanId)}`
    : APP_SHARE_ORIGIN;
}

export function buildVideoShareText(video: any): string {
  const videoId = video?.id || video?.videoId || '';
  const watchUrl = getWatchUrl(videoId);
  return `👑 KING App\n🎬 Watch this viral video on KING App\n${watchUrl}`;
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
    return cleanUrl.replace(/\.[^/.]+$/, '.jpg');
  }
  return DEFAULT_KING_OG_IMAGE;
}

export function formatMetaViews(views: any): string {
  if (typeof views === 'string') {
    const trimmed = views.trim();
    if (!trimmed) return '0 views';
    if (/[km]$/i.test(trimmed) || trimmed.toLowerCase().includes('view')) {
      return trimmed.toLowerCase().includes('view') ? trimmed : `${trimmed} views`;
    }
  }
  const num = Number(views) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M views`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K views`;
  return `${num} ${num === 1 ? 'view' : 'views'}`;
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

  const title = (video?.title && String(video.title).trim()) || 'Viral Video';
  const fullTitle = `${title} - KING App`;
  const viewsText = formatMetaViews(video?.views);
  const description = `Watch on KING App - ${viewsText}`;
  const imageUrl = getVideoThumbnailUrl(video);
  const watchUrl = watchUrlOverride || getWatchUrl(video?.id || video?.videoId);
  const videoUrl = (video?.videoUrl || video?.url || '').trim();

  document.title = fullTitle;
  upsertMetaTag('name', 'description', description);
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
  const defaultDesc = 'Watch trending videos on KING App';

  document.title = defaultTitle;
  upsertMetaTag('name', 'description', defaultDesc);
  upsertMetaTag('property', 'og:title', defaultTitle);
  upsertMetaTag('property', 'og:description', defaultDesc);
  upsertMetaTag('property', 'og:image', DEFAULT_KING_OG_IMAGE);
  upsertMetaTag('property', 'og:url', APP_SHARE_ORIGIN);
  upsertMetaTag('property', 'og:type', 'website');
  upsertMetaTag('name', 'twitter:title', defaultTitle);
  upsertMetaTag('name', 'twitter:description', defaultDesc);
  upsertMetaTag('name', 'twitter:image', DEFAULT_KING_OG_IMAGE);
}
