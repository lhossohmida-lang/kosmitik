/**
 * ضغط صور المنتجات بقوّة في المتصفّح قبل حفظها.
 * نخزّن الناتج كـ data URL (JPEG) داخل مستند المنتج في Firestore —
 * يتزامن كأي حقل ويعمل بلا إنترنت. نحرص أن يبقى الحجم صغيراً جداً
 * (أبعاد صغيرة + جودة منخفضة + سقف بايتات صارم) لتفادي حدّ مستند Firestore (1MiB)
 * وإبقاء المزامنة سريعة.
 */

/** حجم data URL التقريبي بالبايت. */
function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.ceil((b64.length * 3) / 4);
}

/** أبعاد مُصغَّرة تحافظ على النسبة بحيث لا يتجاوز أكبر بُعد maxDim. */
function fit(w: number, h: number, maxDim: number): { w: number; h: number } {
  if (w <= maxDim && h <= maxDim) return { w, h };
  const scale = maxDim / Math.max(w, h);
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

async function loadImage(
  file: Blob,
): Promise<{ draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; width: number; height: number }> {
  // createImageBitmap أسرع ويحترم اتجاه EXIF (صور الهاتف).
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), width: bmp.width, height: bmp.height };
    } catch {
      /* بديل عبر Image */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('image load'));
      i.src = url;
    });
    return { draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface CompressOptions {
  /** أكبر بُعد (بكسل). افتراضي 256. */
  maxDim?: number;
  /** سقف الحجم بالبايت. افتراضي 28000 (~28KB). */
  maxBytes?: number;
}

/** يضغط ملف/لقطة صورة إلى data URL صغير جداً (JPEG). يقبل File أو Blob (لقطة الكاميرا). */
export async function compressImage(file: Blob, opts: CompressOptions = {}): Promise<string> {
  const maxDim = opts.maxDim ?? 256;
  const maxBytes = opts.maxBytes ?? 28000;

  const src = await loadImage(file);
  let { w, h } = fit(src.width, src.height, maxDim);

  const render = (width: number, height: number, quality: number): string => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    src.draw(ctx, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  };

  let quality = 0.6;
  let out = render(w, h, quality);

  // خفّض الجودة تدريجياً حتى نصل للسقف.
  while (dataUrlBytes(out) > maxBytes && quality > 0.25) {
    quality -= 0.1;
    out = render(w, h, quality);
  }

  // إن بقيت كبيرة، صغّر الأبعاد مرّة أخرى.
  if (dataUrlBytes(out) > maxBytes) {
    w = Math.round(w * 0.7);
    h = Math.round(h * 0.7);
    out = render(w, h, 0.4);
  }

  return out;
}
