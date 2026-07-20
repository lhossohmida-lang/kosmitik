/**
 * مسح الباركود عبر ML Kit الأصلي على الهاتف (Capacitor).
 * scan() يفتح ماسح Google السريع: يقرأ الباركود مهما كان مائلاً/مقلوباً/صغيراً/في الحافة،
 * ثم **يُغلق تلقائياً** بعد أول قراءة. أسرع وأدق بكثير من ماسح الويب داخل WebView.
 *
 * يُعيد:
 *  - string : الكود المقروء.
 *  - null   : أُلغِي أو رُفض الإذن (لا حاجة لبديل).
 *  - يرمي استثناءً: ML Kit غير متاح → الطرف المستدعي يستخدم ماسح الويب (ZXing) كبديل.
 */

const BARCODE_FORMATS_CONFIG = () =>
  import('@capacitor-mlkit/barcode-scanning').then(({ BarcodeFormat }) => [
    BarcodeFormat.Ean13,
    BarcodeFormat.Ean8,
    BarcodeFormat.UpcA,
    BarcodeFormat.UpcE,
    BarcodeFormat.Code128,
    BarcodeFormat.Code39,
    BarcodeFormat.Itf,
    BarcodeFormat.QrCode,
  ]);

async function ensureModuleAvailable() {
  const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
  try {
    const avail = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!avail.available) await BarcodeScanner.installGoogleBarcodeScannerModule();
  } catch {
    /* قد يعمل scan() رغم ذلك */
  }
  return BarcodeScanner;
}

export async function nativeScan(): Promise<string | null> {
  const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');

  const perm = await BarcodeScanner.requestPermissions();
  if (perm.camera !== 'granted' && perm.camera !== 'limited') return null;

  const scanner = await ensureModuleAvailable();
  const formats = await BARCODE_FORMATS_CONFIG();
  const { barcodes } = await scanner.scan({ formats });

  return barcodes && barcodes.length ? barcodes[0].rawValue ?? null : null;
}

/**
 * مسح متعدد لـ ML Kit: يفتح الماسح مراراً حتى يضغط المستخدم "رجوع" / إلغاء.
 * onCode: يُستدعى في كل مرة يُقرأ فيها باركود جديد.
 * يُعيد عدد الباركودات المُقروءة.
 */
export async function nativeScanContinuous(
  onCode: (code: string) => void,
  signal?: AbortSignal,
): Promise<number> {
  let count = 0;

  const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
  const perm = await BarcodeScanner.requestPermissions();
  if (perm.camera !== 'granted' && perm.camera !== 'limited') return 0;

  const scanner = await ensureModuleAvailable();
  const formats = await BARCODE_FORMATS_CONFIG();

  while (!signal?.aborted) {
    let result: string | null = null;
    try {
      const { barcodes } = await scanner.scan({ formats });
      result = barcodes && barcodes.length ? barcodes[0].rawValue ?? null : null;
    } catch {
      break; // خطأ غير متوقع → أوقف الحلقة
    }
    if (!result) break; // المستخدم ضغط "رجوع" → إنهاء
    onCode(result);
    count++;
  }

  return count;
}
