import {
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { col, docRef } from './paths';
import type { Product, PublicProduct, StoreOrder, StoreOrderStatus } from './types';

type PublicProductSource = Pick<
  Product,
  'name' | 'category' | 'unitSellPrice' | 'stock' | 'unit' | 'image'
> & { updatedAt?: number };

export type StoreOrderInput = Omit<
  StoreOrder,
  'id' | 'status' | 'saleId' | 'createdAt' | 'updatedAt'
>;

function toPublicProduct(productId: string, product: PublicProductSource): Omit<PublicProduct, 'id'> {
  return {
    name: product.name,
    nameLower: product.name.trim().toLowerCase(),
    category: product.category ?? '',
    unitSellPrice: product.unitSellPrice,
    stock: product.stock,
    unit: product.unit,
    image: product.image ?? '',
    updatedAt: Date.now(),
    srcUpdatedAt: product.updatedAt ?? 0,
  };
}

export function publishPublicProduct(
  storeId: string,
  productId: string,
  product: PublicProductSource,
): void {
  setDoc(docRef(storeId, 'publicProducts', productId), toPublicProduct(productId, product), { merge: true }).catch((e) =>
    console.error('publishPublicProduct failed:', e),
  );
}

export function patchPublicProduct(storeId: string, productId: string, fields: Partial<Product>): void {
  const out: Partial<PublicProduct> = { updatedAt: Date.now() };

  if (typeof fields.name === 'string') {
    out.name = fields.name;
    out.nameLower = fields.name.trim().toLowerCase();
  }
  if (typeof fields.category === 'string') out.category = fields.category;
  if (typeof fields.unitSellPrice === 'number') out.unitSellPrice = fields.unitSellPrice;
  if (typeof fields.stock === 'number') out.stock = fields.stock;
  if (typeof fields.unit === 'string') out.unit = fields.unit;
  if (typeof fields.image === 'string') out.image = fields.image;

  if (Object.keys(out).length <= 1) return;

  updateDoc(docRef(storeId, 'publicProducts', productId), out).catch((e) =>
    console.error('patchPublicProduct failed:', e),
  );
}

export function adjustPublicStock(storeId: string, productId: string, delta: number): void {
  if (!Number.isFinite(delta) || delta === 0) return;
  updateDoc(docRef(storeId, 'publicProducts', productId), {
    stock: increment(delta),
    updatedAt: Date.now(),
  }).catch((e) => console.error('adjustPublicStock failed:', e));
}

export function removePublicProduct(storeId: string, productId: string): void {
  deleteDoc(docRef(storeId, 'publicProducts', productId)).catch((e) =>
    console.error('removePublicProduct failed:', e),
  );
}

/**
 * مزامنة الكتالوج العام مع المخزون — **فارقة** (نكتب فقط الجديد/المتغيّر).
 * سابقاً كانت تعيد كتابة كل منتج في كل مرة (آلاف الكتابات لكل زيارة) فتستنزف
 * حصّة الكتابة اليومية المجانية. الآن نقرأ الموجود أولاً (القراءات أرخص/أكبر حصّة)
 * ونقارن srcUpdatedAt، فلا نكتب إلا ما تغيّر فعلاً → قرب الصفر عند عدم وجود تغييرات.
 */
export async function publishPublicCatalog(storeId: string, products: Product[]): Promise<void> {
  const ids = new Set(products.map((p) => p.id));

  const existing = new Map<string, number>(); // id → srcUpdatedAt المنشور
  try {
    const snap = await getDocs(col(storeId, 'publicProducts'));
    snap.docs.forEach((d) => {
      const data = d.data() as Partial<PublicProduct>;
      existing.set(d.id, data.srcUpdatedAt ?? -1);
      // احذف ما لم يعد في المخزون.
      if (!ids.has(d.id)) removePublicProduct(storeId, d.id);
    });
  } catch (e) {
    console.error('publishPublicCatalog read failed:', e);
    // تعذّرت القراءة → لا نُغرق الخادم بآلاف الكتابات؛ نتوقّف بأمان.
    return;
  }

  for (const product of products) {
    const publishedSrc = existing.get(product.id);
    // اكتب فقط إن كان جديداً أو تغيّر updatedAt عن آخر نسخة منشورة.
    if (publishedSrc === undefined || publishedSrc !== (product.updatedAt ?? 0)) {
      publishPublicProduct(storeId, product.id, product);
    }
  }
}

export function subscribePublicProducts(
  storeId: string,
  onData: (products: PublicProduct[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(col(storeId, 'publicProducts'), orderBy('nameLower'));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PublicProduct)),
    (e) => onError?.(e as Error),
  );
}

export function createStoreOrder(storeId: string, input: StoreOrderInput): string {
  const now = Date.now();
  const id = doc(col(storeId, 'storeOrders')).id;

  setDoc(docRef(storeId, 'storeOrders', id), {
    ...input,
    status: 'new',
    saleId: null,
    createdAt: now,
    updatedAt: now,
  }).catch((e) => console.error('createStoreOrder failed:', e));

  return id;
}

export function subscribeStoreOrders(
  storeId: string,
  onData: (orders: StoreOrder[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(col(storeId, 'storeOrders'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StoreOrder)),
    (e) => onError?.(e as Error),
  );
}

export function updateStoreOrder(
  storeId: string,
  orderId: string,
  fields: Partial<Pick<StoreOrder, 'status' | 'saleId'>>,
): void {
  updateDoc(docRef(storeId, 'storeOrders', orderId), {
    ...fields,
    updatedAt: Date.now(),
  }).catch((e) => console.error('updateStoreOrder failed:', e));
}

export function statusLabel(status: StoreOrderStatus, lang: 'ar' | 'fr' = 'ar'): string {
  const ar: Record<StoreOrderStatus, string> = { new: 'جديد', accepted: 'مؤكد', done: 'تم التسليم', cancelled: 'ملغى' };
  const fr: Record<StoreOrderStatus, string> = { new: 'Nouveau', accepted: 'Confirmé', done: 'Livré', cancelled: 'Annulé' };
  return (lang === 'fr' ? fr : ar)[status];
}
