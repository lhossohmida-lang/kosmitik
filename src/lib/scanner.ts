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
export async function nativeScan(): Promise<string | null> {
  const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');

  const perm = await BarcodeScanner.requestPermissions();
  if (perm.camera !== 'granted' && perm.camera !== 'limited') return null;

  // تأكيد توفّر وحدة الماسح (تُنزَّل مرّة عند أول استخدام إن لزم).
  try {
    const avail = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!avail.available) await BarcodeScanner.installGoogleBarcodeScannerModule();
  } catch {
    /* قد يعمل scan() رغم ذلك */
  }

  const { barcodes } = await BarcodeScanner.scan({
    formats: [
      BarcodeFormat.Ean13,
      BarcodeFormat.Ean8,
      BarcodeFormat.UpcA,
      BarcodeFormat.UpcE,
      BarcodeFormat.Code128,
      BarcodeFormat.Code39,
      BarcodeFormat.Itf,
      BarcodeFormat.QrCode,
    ],
  });

  return barcodes && barcodes.length ? barcodes[0].rawValue ?? null : null;
}
