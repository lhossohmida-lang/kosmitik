/**
 * كتابة المنتجات المستوردة على دفعات إلى Firestore.
 * منطق التحليل/المطابقة في csv.ts (بلا Firebase، قابل للاختبار) ونُعيد تصديره هنا.
 */
import { writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';
import { col, docRef } from './paths';
import type { NewProductDoc, ProductUpdate } from './csv';

export { parseCsv, detectColumns, mapRows, mapSync } from './csv';
export type { ImportField, ParsedCsv, NewProductDoc, MapOptions, MapResult, ProductUpdate, SyncResult } from './csv';

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

/** يكتب المنتجات على دفعات (400) مع تأكيد فعلي وتقدّم. يتطلّب اتصالاً بالإنترنت. */
export async function importProductsBatched(
  storeId: string,
  products: NewProductDoc[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ written: number; error?: string }> {
  const now = Date.now();
  const CHUNK = 400;
  let written = 0;

  for (let i = 0; i < products.length; i += CHUNK) {
    const slice = products.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const p of slice) {
      const ref = doc(col(storeId, 'products'));
      batch.set(ref, { ...p, createdAt: now, updatedAt: now });
    }
    try {
      await Promise.race([batch.commit(), timeout(30000)]);
    } catch {
      return { written, error: `توقّف الاستيراد بعد ${written} منتج. تأكّد من الاتصال بالإنترنت وأعد المحاولة (المكرّر سيُتجاوز).` };
    }
    written += slice.length;
    onProgress?.(written, products.length);
  }
  return { written };
}

/**
 * مزامنة: يُحدّث كميات/أسعار المنتجات الموجودة (batch.update) ويضيف الجديدة (batch.set)،
 * على دفعات (400) مع تأكيد فعلي وتقدّم. يتطلّب اتصالاً بالإنترنت.
 */
export async function importSyncBatched(
  storeId: string,
  updates: ProductUpdate[],
  creates: NewProductDoc[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ updated: number; created: number; error?: string }> {
  const now = Date.now();
  const CHUNK = 400;
  const total = updates.length + creates.length;
  let updated = 0;
  let created = 0;

  // 1) تحديث الموجود
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const u of slice) batch.update(docRef(storeId, 'products', u.id), { ...u.fields, updatedAt: now });
    try {
      await Promise.race([batch.commit(), timeout(30000)]);
    } catch {
      return { updated, created, error: `توقّف التحديث بعد ${updated} منتج. تأكّد من الاتصال بالإنترنت وأعد المحاولة.` };
    }
    updated += slice.length;
    onProgress?.(updated + created, total);
  }

  // 2) إضافة الجديد
  for (let i = 0; i < creates.length; i += CHUNK) {
    const slice = creates.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const p of slice) batch.set(doc(col(storeId, 'products')), { ...p, createdAt: now, updatedAt: now });
    try {
      await Promise.race([batch.commit(), timeout(30000)]);
    } catch {
      return { updated, created, error: `حُدّثت الكميات، لكن توقّفت إضافة الجديد بعد ${created}. أعد المحاولة (المكرّر يُتجاوز).` };
    }
    created += slice.length;
    onProgress?.(updated + created, total);
  }

  return { updated, created };
}
