/**
 * المشتريات (استلام بضاعة). عند الحفظ لكل صنف:
 *  - زيادة المخزون بالوحدات (كرتونة → كراتين × وحدات الكرتونة).
 *  - تحديث سعر شراء الوحدة بالمتوسط المرجّح:
 *      الجديد = (مخزون قديم×سعر قديم + كمية جديدة×سعر جديد) ÷ المجموع
 * كله fire-and-forget؛ المخزون يزيد ذرّياً عبر increment.
 */
import {
  doc,
  setDoc,
  updateDoc,
  increment,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import { col, docRef } from './paths';
import type { Product } from './types';
import { adjustSupplierBalance, recordSupplierTxn } from './suppliers';

export interface PurchaseItemInput {
  productId: string;
  name: string;
  /** نوع الإدخال: كرتونة أم وحدة. */
  isCarton: boolean;
  /** وحدات الكرتونة (1 لغير الكرتونة). */
  unitsPerCarton: number;
  /** الكمية: عدد كراتين (كرتونة) أو وحدات (وحدة). */
  qty: number;
  /** التكلفة: سعر الكرتونة (كرتونة) أو سعر الوحدة (وحدة). */
  cost: number;
}

export interface PurchaseInput {
  /** معرّف المورّد في Firestore (إن اختير من القائمة). */
  supplierId?: string;
  /** اسم المورّد (للعرض). */
  supplier: string;
  invoiceNo: string;
  paymentMethod: string;
  items: PurchaseItemInput[];
  total: number;
  /** المبلغ المدفوع نقداً (في حالة الشراء الآجل بتسديد جزئي). */
  paidAmount?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function recordPurchase(storeId: string, input: PurchaseInput, products: Product[]): string {
  const now = Date.now();
  const id = doc(col(storeId, 'purchases')).id;

  setDoc(docRef(storeId, 'purchases', id), { ...input, createdAt: now }).catch((e) =>
    console.error('recordPurchase فشل (سيُعاد):', e),
  );

  // ربط الشراء بالمورّد: تسجيل معاملة + تعديل الرصيد (ما تبقّى علينا).
  if (input.supplierId) {
    const paid = input.paidAmount ?? input.total;
    const unpaid = round2(input.total - paid);
    if (unpaid !== 0) adjustSupplierBalance(storeId, input.supplierId, unpaid);
    const summary = input.items.map((it) => `${it.name}×${it.qty}`).join('، ').slice(0, 400);
    recordSupplierTxn(storeId, {
      supplierId: input.supplierId,
      type: 'purchase',
      amount: input.total,
      paid,
      note: summary,
      purchaseId: id,
    });
  }

  for (const it of input.items) {
    const addedUnits = it.isCarton ? it.qty * it.unitsPerCarton : it.qty;
    const newUnitCost = it.isCarton ? it.cost / it.unitsPerCarton : it.cost;
    if (addedUnits <= 0) continue;

    const p = products.find((pr) => pr.id === it.productId);
    const oldStock = p ? Math.max(0, p.stock) : 0;
    const oldUnitCost = p ? p.unitPurchasePrice : newUnitCost;
    const weighted =
      oldStock + addedUnits > 0
        ? round2((oldStock * oldUnitCost + addedUnits * newUnitCost) / (oldStock + addedUnits))
        : newUnitCost;

    const fields: Record<string, unknown> = {
      stock: increment(addedUnits),
      unitPurchasePrice: weighted,
      updatedAt: now,
    };
    if (it.isCarton) fields.cartonPurchasePrice = it.cost;

    updateDoc(docRef(storeId, 'products', it.productId), fields).catch((e) =>
      console.error('تحديث المخزون/التكلفة فشل (سيُعاد):', e),
    );
  }

  return id;
}

export interface Purchase extends PurchaseInput {
  id: string;
  supplierId?: string;
  createdAt: number;
}

export function subscribePurchases(
  storeId: string,
  onData: (items: Purchase[]) => void,
  max = 50,
): Unsubscribe {
  const q = query(col(storeId, 'purchases'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) =>
    onData(snap.docs.slice(0, max).map((d) => ({ id: d.id, ...d.data() }) as Purchase)),
  );
}
