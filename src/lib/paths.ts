/**
 * عزل بيانات كل محل تحت المسار stores/{storeId}/...
 * storeId = معرّف مستخدم Firebase (uid). محل جديد = حساب جديد = بيانات معزولة.
 * استخدم هذه الدوال دائماً بدل كتابة المسارات يدوياً لتفادي التسريب بين المحلات.
 */
import { collection, doc, type CollectionReference, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';

/** أسماء المجموعات تحت كل متجر (مركزيّة لتفادي الأخطاء الإملائية). */
export const COLLECTIONS = {
  products: 'products',
  sales: 'sales',
  purchases: 'purchases',
  customers: 'customers',       // عملاء الكريدي
  deferred: 'deferred',         // الكريديات الآجلة (تصنيف منفصل)
  creditTxns: 'creditTxns',     // معاملات الكريدي (دين/دفعة/تعديل)
  expenses: 'expenses',
  cashSessions: 'cashSessions', // صندوق النقود اليومي
  settings: 'settings',
  publicProducts: 'publicProducts',
  storeOrders: 'storeOrders',
  workers: 'workers',           // العمال
  workSessions: 'workSessions', // جلسات دخول/خروج العمال
  suppliers: 'suppliers',       // الموردون
  supplierTxns: 'supplierTxns', // معاملات الموردين (شراء/دفع)
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/** مرجع مجموعة داخل متجر: stores/{storeId}/{name} */
export function col(storeId: string, name: CollectionName): CollectionReference {
  return collection(db, 'stores', storeId, name);
}

/** مرجع مستند داخل متجر: stores/{storeId}/{name}/{id} */
export function docRef(storeId: string, name: CollectionName, id: string): DocumentReference {
  return doc(db, 'stores', storeId, name, id);
}

/** مستند إعدادات المتجر المفرد. */
export function storeDoc(storeId: string): DocumentReference {
  return doc(db, 'stores', storeId);
}
