/**
 * كلمة سر محلية للعمليات الحسّاسة (إضافة مخزون سريعة، التقارير، صندوق النقود).
 * مؤقّتة هنا — ستُنقل لاحقاً إلى إعدادات المتجر في Firestore.
 * يمكن تجاوزها عبر NEXT_PUBLIC_APP_PASSWORD في .env.local.
 */
export const APP_PASSWORD = process.env.NEXT_PUBLIC_APP_PASSWORD || '1234';

export function checkPassword(input: string): boolean {
  return input === APP_PASSWORD;
}
