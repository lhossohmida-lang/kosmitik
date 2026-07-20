/**
 * طبقة بيانات المنتجات على Firestore.
 * كل الكتابات fire-and-forget: نولّد ID محلياً ونطبّق على الكاش فوراً بلا انتظار الخادم،
 * فتظهر التغييرات لحظياً حتى بلا إنترنت.
 */
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  onSnapshot,
  query,
  orderBy,
  limit,
  type Unsubscribe,
} from 'firebase/firestore';
import { col, docRef } from './paths';
import type { Product } from './types';
import { patchPublicProduct, publishPublicProduct, removePublicProduct } from './orders';

/** الحقول القابلة للإدخال من النموذج (بلا الحقول المُدارة تلقائياً). */
export type ProductInput = Omit<Product, 'id' | 'nameLower' | 'createdAt' | 'updatedAt'>;

/** اشتراك لحظي بكل منتجات المتجر (مرتّبة بالاسم). يُعيد دالة إلغاء. */
export function subscribeProducts(
  storeId: string,
  onData: (products: Product[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(col(storeId, 'products'), orderBy('nameLower'));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product);
      onData(items);
    },
    (err) => onError?.(err as Error),
  );
}

/**
 * اشتراك سريع بأول (max) منتج فقط — للعرض اللحظي ثم يُحمَّل الباقي بالخلفية.
 * قراءة محدودة من الكاش = ظهور فوري حتى مع آلاف المنتجات.
 */
export function subscribeProductsLimited(
  storeId: string,
  max: number,
  onData: (products: Product[]) => void,
): Unsubscribe {
  const q = query(col(storeId, 'products'), orderBy('nameLower'), limit(max));
  return onSnapshot(q, (snap) =>
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product)),
  );
}

/**
 * حفظ منتج (إضافة أو تعديل) بأسلوب fire-and-forget.
 * - عند الإضافة: id غير ممرّر → نولّده محلياً.
 * - يُعيد المعرّف فوراً؛ الكتابة تُطبَّق على الكاش ثم تُزامَن لاحقاً.
 */
export function saveProduct(storeId: string, input: ProductInput, id?: string): string {
  const now = Date.now();
  const productId = id ?? doc(col(storeId, 'products')).id;
  const ref = docRef(storeId, 'products', productId);

  const data: Record<string, unknown> = {
    ...input,
    nameLower: input.name.trim().toLowerCase(),
    updatedAt: now,
  };
  if (!id) data.createdAt = now;

  // fire-and-forget: لا await. نلتقط الفشل دون تعطيل الواجهة.
  setDoc(ref, data, { merge: true }).catch((e) => {
    console.error('saveProduct فشل مزامنة (سيُعاد لاحقاً):', e);
  });
  publishPublicProduct(storeId, productId, input);

  return productId;
}

/** تعديل حقول محدّدة لمنتج (مخزون سريع، تفعيل زر سريع…) fire-and-forget. */
export function patchProduct(storeId: string, id: string, fields: Partial<Product>): void {
  updateDoc(docRef(storeId, 'products', id), { ...fields, updatedAt: Date.now() }).catch((e) =>
    console.error('patchProduct فشل (سيُعاد):', e),
  );
  patchPublicProduct(storeId, id, fields);
}

/** ربط باركود بمنتج موجود (يُضاف لمصفوفة barcodes بلا تكرار). fire-and-forget. */
export function addBarcodeToProduct(storeId: string, productId: string, barcode: string): void {
  const b = barcode.trim();
  if (!b) return;
  updateDoc(docRef(storeId, 'products', productId), {
    barcodes: arrayUnion(b),
    updatedAt: Date.now(),
  }).catch((e) => console.error('addBarcodeToProduct فشل (سيُعاد):', e));
}

/** حذف منتج (fire-and-forget). */
export function deleteProduct(storeId: string, id: string): void {
  deleteDoc(docRef(storeId, 'products', id)).catch((e) => {
    console.error('deleteProduct فشل مزامنة (سيُعاد لاحقاً):', e);
  });
  removePublicProduct(storeId, id);
}

/** true إذا كان الاسم مستخدماً في منتج آخر (تجاهل الأحرف والفراغات). */
export function isDuplicateName(products: Product[], name: string, exceptId?: string): boolean {
  const key = name.trim().toLowerCase();
  if (!key) return false;
  return products.some((p) => p.id !== exceptId && p.nameLower === key);
}

/** true إذا كان أي باركود مستخدماً في منتج آخر. يُعيد الباركود المتعارض إن وُجد. */
export function findDuplicateBarcode(
  products: Product[],
  barcodes: string[],
  exceptId?: string,
): string | null {
  const set = new Set(barcodes.map((b) => b.trim()).filter(Boolean));
  for (const p of products) {
    if (p.id === exceptId) continue;
    for (const b of p.barcodes) {
      if (set.has(b.trim())) return b.trim();
    }
  }
  return null;
}
