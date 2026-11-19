import React from 'react';
import { StatusEditorTextFont, StatusMediaOverlay } from '../types/social';

export type EditorAspectPreset = 'original' | '9:16' | '4:5' | '1:1' | '16:9';
export type OverlayLayerAction = 'forward' | 'backward' | 'front' | 'back';

export interface BrushStroke {
  id: string;
  color: string;
  width: number; // relative to 540px reference width
  points: Array<{ x: number; y: number }>; // normalized 0..1
}

export interface PhotoEditState {
  aspect: EditorAspectPreset;
  rotation: 0 | 90 | 180 | 270;
  zoom: number;
  panX: number; // normalized -0.5..0.5
  panY: number; // normalized -0.5..0.5
  bgColor: string;
  filterCss?: string;
  strokes: BrushStroke[];
  overlays: StatusMediaOverlay[];
}

export const EDITOR_FONT_FAMILIES: Record<StatusEditorTextFont, string> = {
  sans: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  display: 'Impact, "Arial Black", sans-serif',
  handwritten: '"Brush Script MT", "Comic Sans MS", cursive',
};

export function clampOverlayPosition(x: number, y: number): { x: number; y: number } {
  return {
    x: Number(Math.max(0.06, Math.min(0.94, Number.isFinite(x) ? x : 0.5)).toFixed(4)),
    y: Number(Math.max(0.06, Math.min(0.94, Number.isFinite(y) ? y : 0.5)).toFixed(4)),
  };
}

export function clampOverlayScale(scale: number): number {
  const safe = Number.isFinite(scale) ? scale : 1;
  return Number(Math.max(0.5, Math.min(2.8, safe)).toFixed(2));
}

export function normalizeOverlayRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let n = Math.round(deg);
  while (n > 180) n -= 360;
  while (n < -180) n += 360;
  return n;
}

export function moveOverlayLayer(
  overlays: StatusMediaOverlay[],
  id: string,
  action: OverlayLayerAction
): StatusMediaOverlay[] {
  const idx = overlays.findIndex((o) => o.id === id);
  if (idx < 0) return overlays;
  const copy = [...overlays];
  const [item] = copy.splice(idx, 1);

  if (action === 'forward') {
    const nextIdx = Math.min(overlays.length - 1, idx + 1);
    copy.splice(nextIdx, 0, item);
    return copy;
  }
  if (action === 'backward') {
    const nextIdx = Math.max(0, idx - 1);
    copy.splice(nextIdx, 0, item);
    return copy;
  }
  if (action === 'front') {
    copy.push(item);
    return copy;
  }
  // 'back'
  copy.unshift(item);
  return copy;
}

export function duplicateOverlayItem(
  overlays: StatusMediaOverlay[],
  id: string,
  newId: string
): { overlays: StatusMediaOverlay[]; duplicatedId: string | null } {
  const src = overlays.find((o) => o.id === id);
  if (!src) return { overlays, duplicatedId: null };
  const shifted = clampOverlayPosition(src.x + 0.05, src.y + 0.05);
  const clone: StatusMediaOverlay = {
    ...src,
    id: newId,
    x: shifted.x,
    y: shifted.y,
  };
  return {
    overlays: [...overlays, clone],
    duplicatedId: newId,
  };
}

export function resolveOverlayBgCss(ov: StatusMediaOverlay): string | undefined {
  if (ov.bgMode === 'custom') {
    return ov.bgColor || 'rgba(6, 10, 20, 0.82)';
  }
  if (ov.bgMode === 'dark') return 'rgba(6, 10, 20, 0.8)';
  if (ov.bgMode === 'accent') return 'rgba(14, 165, 233, 0.9)';
  return undefined;
}

export function getOverlayTextDisplayStyle(ov: StatusMediaOverlay): React.CSSProperties {
  const fontKey: StatusEditorTextFont = ov.font || 'sans';
  const bgCss = resolveOverlayBgCss(ov);
  const effect = ov.effect || (ov.bgMode && ov.bgMode !== 'none' ? 'none' : 'shadow');
  const isBold = typeof ov.bold === 'boolean' ? ov.bold : fontKey === 'display' || fontKey === 'sans';
  const isItalic = typeof ov.italic === 'boolean' ? ov.italic : fontKey === 'serif';

  let textShadow: string | undefined;
  let WebkitTextStroke: string | undefined;
  if (effect === 'outline') {
    textShadow =
      '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 2px 6px rgba(0,0,0,0.85)';
    WebkitTextStroke = '0.75px #000000';
  } else if (effect === 'shadow') {
    textShadow = '0 2px 8px rgba(0, 0, 0, 0.9), 0 1px 3px rgba(0, 0, 0, 0.9)';
  }

  return {
    color: ov.color || '#ffffff',
    fontFamily: EDITOR_FONT_FAMILIES[fontKey] || EDITOR_FONT_FAMILIES.sans,
    fontWeight: isBold ? 800 : 500,
    fontStyle: isItalic ? 'italic' : 'normal',
    backgroundColor: bgCss,
    textShadow,
    WebkitTextStroke,
  };
}

export function getEditorFontClass(font?: StatusEditorTextFont): string {
  switch (font) {
    case 'serif':
      return 'font-serif italic font-semibold';
    case 'mono':
      return 'font-mono font-bold';
    case 'display':
      return 'font-black uppercase tracking-wider';
    case 'handwritten':
      return 'font-serif italic font-medium tracking-wide';
    default:
      return 'font-extrabold tracking-tight';
  }
}

export function resolveCanvasDimensions(
  aspect: EditorAspectPreset,
  imgWidth: number,
  imgHeight: number,
  rotation: 0 | 90 | 180 | 270,
  maxSide = 1440
): { width: number; height: number } {
  const rotatedW = rotation === 90 || rotation === 270 ? imgHeight : imgWidth;
  const rotatedH = rotation === 90 || rotation === 270 ? imgWidth : imgHeight;

  let ratio = rotatedW > 0 && rotatedH > 0 ? rotatedW / rotatedH : 9 / 16;
  if (aspect === '9:16') ratio = 9 / 16;
  else if (aspect === '4:5') ratio = 4 / 5;
  else if (aspect === '1:1') ratio = 1;
  else if (aspect === '16:9') ratio = 16 / 9;

  if (ratio >= 1) {
    const w = Math.min(maxSide, aspect === 'original' ? Math.max(720, rotatedW) : maxSide);
    return { width: Math.round(w), height: Math.max(2, Math.round(w / ratio)) };
  }
  const h = Math.min(maxSide, aspect === 'original' ? Math.max(720, rotatedH) : maxSide);
  return { width: Math.max(2, Math.round(h * ratio)), height: Math.round(h) };
}

export function drawPhotoCanvasFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  img: HTMLImageElement,
  state: PhotoEditState,
  includeOverlaysAndStrokes = true
) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // 1. Background Color
  ctx.fillStyle = state.bgColor || '#060a14';
  ctx.fillRect(0, 0, width, height);

  // 2. Rotated + Zoomed + Panned Photo
  const isSwap = state.rotation === 90 || state.rotation === 270;
  const naturalW = img.naturalWidth || img.width || 1;
  const naturalH = img.naturalHeight || img.height || 1;
  const rotW = isSwap ? naturalH : naturalW;
  const rotH = isSwap ? naturalW : naturalH;

  // Use contain when original / cover-like base scaled by user zoom
  const baseScale =
    state.aspect === 'original'
      ? Math.min(width / rotW, height / rotH)
      : Math.max(width / rotW, height / rotH);
  const finalScale = baseScale * Math.max(0.4, Math.min(3.5, state.zoom));

  ctx.save();
  ctx.translate(width / 2 + state.panX * width, height / 2 + state.panY * height);
  ctx.rotate((state.rotation * Math.PI) / 180);
  if (state.filterCss && state.filterCss !== 'none') {
    try {
      ctx.filter = state.filterCss;
    } catch {
      // ignore
    }
  }
  const drawW = naturalW * finalScale;
  const drawH = naturalH * finalScale;
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  if (!includeOverlaysAndStrokes) {
    ctx.restore();
    return;
  }

  // 3. Freehand Brush Strokes
  const strokeScale = width / 540;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of state.strokes) {
    if (!stroke.points.length) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = Math.max(1.5, stroke.width * strokeScale);
    ctx.beginPath();
    const p0 = stroke.points[0];
    ctx.moveTo(p0.x * width, p0.y * height);
    if (stroke.points.length === 1) {
      ctx.lineTo(p0.x * width + 0.1, p0.y * height + 0.1);
    } else {
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * width, stroke.points[i].y * height);
      }
    }
    ctx.stroke();
  }

  // 4. Text & Sticker Overlays (bottom-to-top z-order preserved)
  for (const ov of state.overlays) {
    const cx = ov.x * width;
    const cy = ov.y * height;
    const rotRad = ((ov.rotation || 0) * Math.PI) / 180;

    ctx.save();
    ctx.translate(cx, cy);
    if (rotRad !== 0) {
      ctx.rotate(rotRad);
    }

    if (ov.kind === 'sticker') {
      const fontSize = Math.round(44 * (ov.scale || 1) * strokeScale);
      ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ov.content, 0, 0);
    } else {
      const fontSize = Math.round(24 * (ov.scale || 1) * strokeScale);
      const fontKey = ov.font || 'sans';
      const fontFamily = EDITOR_FONT_FAMILIES[fontKey] || EDITOR_FONT_FAMILIES.sans;
      const isBold = typeof ov.bold === 'boolean' ? ov.bold : fontKey === 'display' || fontKey === 'sans';
      const isItalic = typeof ov.italic === 'boolean' ? ov.italic : fontKey === 'serif';
      const weight = isBold ? '800' : '500';
      const italicStr = isItalic ? 'italic ' : '';
      ctx.font = `${italicStr}${weight} ${fontSize}px ${fontFamily}`;

      const textValue = fontKey === 'display' ? ov.content.toUpperCase() : ov.content;
      const lines = textValue.split('\n');
      const lineHeight = fontSize * 1.25;
      const align = ov.align || 'center';

      let maxLineW = 0;
      for (const line of lines) {
        maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
      }
      const totalH = lines.length * lineHeight;
      const padX = fontSize * 0.5;
      const padY = fontSize * 0.28;
      const rectW = maxLineW + padX * 2;
      const rectH = totalH + padY * 2;
      const rectX = -rectW / 2;
      const rectY = -rectH / 2;

      const bgFill = resolveOverlayBgCss(ov);
      if (bgFill) {
        ctx.fillStyle = bgFill;
        const r = Math.min(14 * strokeScale, rectH / 2);
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(rectX, rectY, rectW, rectH, r);
        } else {
          ctx.moveTo(rectX + r, rectY);
          ctx.lineTo(rectX + rectW - r, rectY);
          ctx.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + r);
          ctx.lineTo(rectX + rectW, rectY + rectH - r);
          ctx.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - r, rectY + rectH);
          ctx.lineTo(rectX + r, rectY + rectH);
          ctx.quadraticCurveTo(rectX, rectY + rectH, rectX, rectY + rectH - r);
          ctx.lineTo(rectX, rectY + r);
          ctx.quadraticCurveTo(rectX, rectY, rectX + r, rectY);
          ctx.closePath();
        }
        ctx.fill();
      }

      const effect = ov.effect || (ov.bgMode && ov.bgMode !== 'none' ? 'none' : 'shadow');
      if (effect === 'shadow') {
        ctx.shadowColor = 'rgba(0,0,0,0.88)';
        ctx.shadowBlur = 9 * strokeScale;
        ctx.shadowOffsetY = 2 * strokeScale;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }

      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      const lineX =
        align === 'left' ? rectX + padX : align === 'right' ? rectX + rectW - padX : 0;
      const startY = -((lines.length - 1) * lineHeight) / 2;

      ctx.fillStyle = ov.color || '#ffffff';
      lines.forEach((line, idx) => {
        const yPos = startY + idx * lineHeight;
        if (effect === 'outline') {
          ctx.save();
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = Math.max(2, fontSize * 0.16);
          ctx.lineJoin = 'round';
          ctx.strokeText(line, lineX, yPos);
          ctx.restore();
        }
        ctx.fillText(line, lineX, yPos);
      });
    }
    ctx.restore();
  }

  ctx.restore();
}

export async function exportEditedPhotoToFile(
  img: HTMLImageElement,
  state: PhotoEditState,
  originalFileName: string
): Promise<{ file: File; previewDataUrl: string }> {
  const { width, height } = resolveCanvasDimensions(
    state.aspect,
    img.naturalWidth || img.width || 1080,
    img.naturalHeight || img.height || 1920,
    state.rotation,
    1440
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize image export canvas.');
  }

  drawPhotoCanvasFrame(ctx, width, height, img, state, true);

  const previewDataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
  );
  if (!blob) {
    throw new Error('Failed to export edited image.');
  }

  const cleanBase = originalFileName.replace(/\.[^/.]+$/, '') || 'king_status';
  const file = new File([blob], `${cleanBase}_edited.jpg`, { type: 'image/jpeg' });
  return { file, previewDataUrl };
}
