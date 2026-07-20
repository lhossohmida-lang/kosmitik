/**
 * تسجيل المبيعات + خصم المخزون الفوري.
 * كله fire-and-forget: نولّد ID محلياً، نطبّق على الكاش فوراً، نتزامن لاحقاً.
 * خصم المخزون عبر increment(-qty) الذرّي → يظهر فوراً حتى بلا إنترنت.
 */
import {
  doc,
  setDoc,
  updateDoc,
  increment,
  onSnapshot,
  query,
  orderBy,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { col, docRef } from './paths';
import type { Sale } from './types';
import { adjustPublicStock } from './orders';

export type SaleInput = Omit<Sale, 'id' | 'createdAt' | 'status'>;

/**
 * يسجّل بيعاً ويطبّق آثاره ذرّياً:
 *  1) مستند البيع.
 *  2) خصم مخزون كل صنف increment(-qty).
 *  3) للكريدي: زيادة دين العميل + معاملة كريدي.
 * كل عملية في catch مستقل (فشل واحدة لا يُجهض البقية).
 */
export function recordSale(storeId: string, input: SaleInput): string {
  const now = Date.now();
  const id = doc(col(storeId, 'sales')).id;

  setDoc(docRef(storeId, 'sales', id), {
    ...input,
    createdAt: now,
    status: 'active',
  }).catch((e) => console.error('recordSale فشل (سيُعاد):', e));

  for (const it of input.items) {
    updateDoc(docRef(storeId, 'products', it.productId), {
      stock: increment(-it.qty),
      updatedAt: now,
    }).catch((e) => console.error('خصم المخزون فشل (سيُعاد):', e));
    adjustPublicStock(storeId, it.productId, -it.qty);
  }

  if (input.payment === 'credit' && input.customerId) {
    updateDoc(docRef(storeId, 'customers', input.customerId), {
      balance: increment(input.total),
      updatedAt: now,
    }).catch((e) => console.error('زيادة دين العميل فشل (سيُعاد):', e));

    const txnId = doc(col(storeId, 'creditTxns')).id;
    setDoc(docRef(storeId, 'creditTxns', txnId), {
      customerId: input.customerId,
      type: 'purchase',
      amount: input.total,
      saleId: id,
      note: 'بيع كريدي',
      createdAt: now,
    }).catch((e) => console.error('معاملة كريدي فشل (سيُعاد):', e));
  }

  return id;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** إلغاء كامل لفاتورة: إرجاع كل الأصناف للمخزون + وسم ملغاة + تصحيح دين الكريدي. */
export function cancelSale(storeId: string, sale: Sale): void {
  const now = Date.now();
  updateDoc(docRef(storeId, 'sales', sale.id), { status: 'cancelled', updatedAt: now }).catch((e) =>
    console.error('cancelSale:', e),
  );
  for (const it of sale.items) {
    updateDoc(docRef(storeId, 'products', it.productId), {
      stock: increment(it.qty),
      updatedAt: now,
    }).catch((e) => console.error('إرجاع مخزون:', e));
    adjustPublicStock(storeId, it.productId, it.qty);
  }
  if (sale.payment === 'credit' && sale.customerId) {
    updateDoc(docRef(storeId, 'customers', sale.customerId), {
      balance: increment(-sale.total),
      updatedAt: now,
    }).catch((e) => console.error('تصحيح دين:', e));
    const id = doc(col(storeId, 'creditTxns')).id;
    setDoc(docRef(storeId, 'creditTxns', id), {
      customerId: sale.customerId,
      type: 'adjust',
      amount: -sale.total,
      note: 'إلغاء فاتورة',
      saleId: sale.id,
      createdAt: now,
    }).catch((e) => console.error('معاملة تصحيح:', e));
  }
}

/** إرجاع جزئي لصنف واحد من فاتورة: إرجاعه للمخزون وتحديث الإجماليات. */
export function returnSaleItem(storeId: string, sale: Sale, index: number): void {
  const item = sale.items[index];
  if (!item) return;
  const now = Date.now();

  updateDoc(docRef(storeId, 'products', item.productId), {
    stock: increment(item.qty),
    updatedAt: now,
  }).catch((e) => console.error('إرجاع مخزون:', e));
  adjustPublicStock(storeId, item.productId, item.qty);

  const newItems = sale.items.filter((_, i) => i !== index);
  const newSubtotal = round2(newItems.reduce((s, i) => s + i.lineTotal, 0));
  const newTotal = round2(Math.max(0, newSubtotal - sale.discount));

  updateDoc(docRef(storeId, 'sales', sale.id), {
    items: newItems,
    subtotal: newSubtotal,
    total: newTotal,
    updatedAt: now,
    ...(newItems.length === 0 ? { status: 'cancelled' } : {}),
  }).catch((e) => console.error('تحديث الفاتورة:', e));

  if (sale.payment === 'credit' && sale.customerId) {
    const diff = round2(sale.total - newTotal);
    if (diff > 0) {
      updateDoc(docRef(storeId, 'customers', sale.customerId), {
        balance: increment(-diff),
        updatedAt: now,
      }).catch((e) => console.error('تصحيح دين:', e));
      const id = doc(col(storeId, 'creditTxns')).id;
      setDoc(docRef(storeId, 'creditTxns', id), {
        customerId: sale.customerId,
        type: 'adjust',
        amount: -diff,
        note: 'إرجاع صنف',
        saleId: sale.id,
        createdAt: now,
      }).catch((e) => console.error('معاملة تصحيح:', e));
    }
  }
}

/** اشتراك لحظي بمبيعات المتجر ضمن نطاق زمني [from, to] (ms). */
export function subscribeSales(
  storeId: string,
  from: number,
  to: number,
  onData: (sales: Sale[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(
    col(storeId, 'sales'),
    where('createdAt', '>=', from),
    where('createdAt', '<=', to),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Sale)),
    (e) => onError?.(e as Error),
  );
}
