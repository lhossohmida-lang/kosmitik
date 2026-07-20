/**
 * هوية المتجر والعملة والألوان — مصدر واحد للحقيقة.
 * غيّر القيم هنا فقط لتتغيّر في كل الواجهة ووصولات الطباعة.
 */

export const branding = {
  /** اسم المحل الظاهر في الواجهة وأعلى وصل الطباعة. */
  storeName: 'stor',
  /** شعار اختياري (ضعه في public/logo.png). */
  logo: '/logo.png',
  /** معلومات تُطبع على رأس/ذيل الوصل (تُملأ لاحقاً من الإعدادات). */
  phone: '',
  address: '',

  currency: {
    code: 'DZD',
    /** الرمز الظاهر بجانب المبالغ. */
    symbol: 'د.ج',
    /** عدد المنازل العشرية في العرض. */
    decimals: 2,
  },

  /** ألوان الواجهة — تُسقَط أيضاً كمتغيّرات CSS في globals.css. */
  colors: {
    primary: '#0a84ff', // أزرق iOS محايد (تصميم زجاجي)
    primaryDark: '#0060df',
    accent: '#ff9f0a',
    danger: '#ff3b30',
    success: '#30d158',
  },
} as const;

/** تنسيق مبلغ بعملة المتجر: 1234.5 → "1٬234.50 د.ج". */
export function formatMoney(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  const formatted = n.toLocaleString('ar-DZ', {
    minimumFractionDigits: branding.currency.decimals,
    maximumFractionDigits: branding.currency.decimals,
  });
  return `${formatted} ${branding.currency.symbol}`;
}
