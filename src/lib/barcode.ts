/**
 * أدوات معالجة الباركود — خاصة مشكلة لوحة AZERTY.
 *
 * قارئ USB يرسل مفاتيح صفّ الأرقام الفيزيائية. على AZERTY تُترجَم إلى رموز:
 *   & → 1   é → 2   " → 3   ' → 4   ( → 5   - → 6   è → 7   _ → 8   ç → 9   à → 0
 * الحل الأدق: قراءة الرقم من المفتاح الفيزيائي عبر e.code (Digit0-9/Numpad0-9).
 * وكحلٍّ على مستوى النص (حين لا نملك e.code) نحوّل الرموز أعلاه إلى أرقام —
 * لكن فقط إذا كان النص باركوداً (بلا حروف)، حتى لا نُفسد الأسماء الفرنسية/العربية.
 */

/** رموز صفّ أرقام AZERTY → أرقام لاتينية. */
const AZERTY_SYMBOL_TO_DIGIT: Record<string, string> = {
  '&': '1',
  'é': '2',
  '"': '3',
  "'": '4',
  '(': '5',
  '-': '6',
  'è': '7',
  '_': '8',
  'ç': '9',
  'à': '0',
};

/** أرقام عربية-هندية (٠-٩) → لاتينية (0-9). */
const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  // النسخة الفارسية أيضاً
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/** تحويل الأرقام العربية إلى لاتينية داخل نص. */
export function normalizeArabicDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => ARABIC_DIGITS[d] ?? d);
}

/** هل يحوي النص حروفاً (لاتينية أو عربية)؟ نستثني الأرقام العربية من «الحروف». */
export function hasLetters(s: string): boolean {
  const norm = normalizeArabicDigits(s);
  return /[A-Za-zء-ي]/.test(norm);
}

/** استخراج الرقم من المفتاح الفيزيائي: 'Digit3'|'Numpad3' → '3'. غير رقمي → null. */
export function digitFromCode(code: string): string | null {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  return m ? m[1] : null;
}

/**
 * تحويل ذكي لنص ملتقَط من القارئ:
 *  - إن كان يحوي حروفاً (اسم منتج) → أعده كما هو بعد توحيد الأرقام العربية فقط.
 *  - إن كان باركوداً (أرقام/رموز) → حوّل رموز AZERTY والأرقام العربية إلى أرقام لاتينية.
 */
export function smartBarcodeConvert(text: string): string {
  const norm = normalizeArabicDigits(text.trim());
  if (hasLetters(norm)) return norm;
  return norm
    .split('')
    .map((ch) => AZERTY_SYMBOL_TO_DIGIT[ch] ?? ch)
    .join('');
}

/** أنواع الباركود المدعومة (تُمرَّر لماسحات الكاميرا). */
export const SUPPORTED_FORMATS = [
  'EAN_13',
  'EAN_8',
  'UPC_A',
  'UPC_E',
  'CODE_128',
  'CODE_39',
  'QR_CODE',
] as const;
