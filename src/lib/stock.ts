/**
 * تعديل المخزون بشكل ذرّي (increment) — يُستعمل في:
 *  - إضافة كمية سريعة لمنتج نافد من نقطة البيع.
 *  - استلام المشتريات لاحقاً (الخطوة 7).
 * fire-and-forget: يظهر الأثر فوراً على الكاش المحلي.
 */
import { updateDoc, increment } from 'firebase/firestore';
import { docRef } from './paths';
import { adjustPublicStock } from './orders';

export function addStock(storeId: string, productId: string, qty: number): void {
  updateDoc(docRef(storeId, 'products', productId), {
    stock: increment(qty),
    updatedAt: Date.now(),
  }).catch((e) => console.error('addStock فشل (سيُعاد):', e));
  adjustPublicStock(storeId, productId, qty);
}
