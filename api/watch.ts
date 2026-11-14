// Vercel Serverless Function for dynamic Open Graph meta tags on /watch/:id
// Serves WhatsApp, Facebook, Twitter, Telegram, and other link crawlers without JS execution.

const PROJECT_ID = 'king-5f52e';
const DATABASE_ID = 'ai-studio-king-4e115b8f-6ca5-4501-8ff0-73c2c7c21a47';
const APP_ORIGIN = 'https://king-app-full.vercel.app';

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatViewsLabel(raw: any): string {
  const num = Number(raw) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M views`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K views`;
  return `${num} ${num === 1 ? 'view' : 'views'}`;
}

function readFirestoreValue(field: any): string | number | undefined {
  if (!field) return undefined;
  if (typeof field.stringValue === 'string') return field.stringValue;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return Number(field.doubleValue);
  return undefined;
}

export default async function handler(
  req: { query?: Record<string, string | string[]>; url?: string },
  res: {
    status: (code: number) => any;
    setHeader: (name: string, value: string) => void;
    send: (body: string) => void;
  }
) {
  let rawId = '';
  if (req.query?.id) {
    rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  } else if (req.url) {
    const match = req.url.match(/\/watch\/([^/?#]+)/i);
    if (match) rawId = match[1];
  }
  const videoId = decodeURIComponent((rawId || '').trim());
  const watchUrl = videoId ? `${APP_ORIGIN}/watch/${encodeURIComponent(videoId)}` : APP_ORIGIN;

  let videoTitle = 'Watch Viral Videos';
  let viewsLabel = '0 views';
  let likesLabel = '0 likes';
  let thumbnailUrl = `${APP_ORIGIN}/king-logo.png`;
  let videoUrl = '';

  if (videoId) {
    try {
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/videos/${encodeURIComponent(
        videoId
      )}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const docRes = await fetch(firestoreUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (docRes.ok) {
        const docJson = (await docRes.json()) as { fields?: Record<string, any> };
        const fields = docJson?.fields || {};
        const titleVal = readFirestoreValue(fields.title);
        if (typeof titleVal === 'string' && titleVal.trim()) {
          videoTitle = titleVal.trim();
        }
        const viewsVal = readFirestoreValue(fields.views);
        viewsLabel = formatViewsLabel(viewsVal);
        const likesNum = Number(readFirestoreValue(fields.likes)) || 0;
        likesLabel =
          likesNum >= 1_000_000
            ? `${(likesNum / 1_000_000).toFixed(1).replace(/\.0$/, '')}M likes`
            : likesNum >= 1_000
            ? `${(likesNum / 1_000).toFixed(1).replace(/\.0$/, '')}K likes`
            : `${likesNum} ${likesNum === 1 ? 'like' : 'likes'}`;

        const vidVal = readFirestoreValue(fields.videoUrl) || readFirestoreValue(fields.url);
        if (typeof vidVal === 'string' && vidVal.trim()) {
          videoUrl = vidVal.trim();
        }

        const thumbVal =
          readFirestoreValue(fields.thumbnailUrl) ||
          readFirestoreValue(fields.thumbnail) ||
          readFirestoreValue(fields.img);
        if (typeof thumbVal === 'string' && thumbVal.trim()) {
          thumbnailUrl = thumbVal.trim();
        } else if (videoUrl && videoUrl.includes('res.cloudinary.com')) {
          thumbnailUrl = videoUrl.split('?')[0].replace(/\.[^/.]+$/, '.jpg');
        }
      }
    } catch {
      // Fall back to default metadata if Firestore REST fetch times out or fails
    }
  }

  const ogTitle = escapeHtml(`👑 KING App - ${videoTitle}`);
  const ogDescription = escapeHtml(`${viewsLabel} • ${likesLabel} | Viral on KING App`);
  const ogImage = escapeHtml(thumbnailUrl);
  const ogUrl = escapeHtml(watchUrl);
  const ogVideo = videoUrl ? escapeHtml(videoUrl) : '';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${ogTitle}</title>
    <meta name="description" content="${ogDescription}" />
    <meta property="og:site_name" content="KING App" />
    <meta property="og:title" content="${ogTitle}" />
    <meta property="og:description" content="${ogDescription}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:secure_url" content="${ogImage}" />
    <meta property="og:image:width" content="720" />
    <meta property="og:image:height" content="1280" />
    <meta property="og:url" content="${ogUrl}" />
    <meta property="og:type" content="video.other" />
    ${
      ogVideo
        ? `<meta property="og:video" content="${ogVideo}" />
    <meta property="og:video:secure_url" content="${ogVideo}" />
    <meta property="og:video:type" content="video/mp4" />
    <meta property="og:video:width" content="720" />
    <meta property="og:video:height" content="1280" />`
        : ''
    }
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${ogTitle}" />
    <meta name="twitter:description" content="${ogDescription}" />
    <meta name="twitter:image" content="${ogImage}" />
    <meta http-equiv="refresh" content="0;url=${ogUrl}" />
  </head>
  <body style="background:#040812;color:#ffffff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
    <p>Opening <a href="${ogUrl}" style="color:#D4AF37;">${ogTitle}</a>...</p>
  </body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
}
