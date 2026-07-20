/**
 * الموردون: CRUD + تعديل الرصيد (ما نُدين لهم به). fire-and-forget.
 * balance موجب = علينا دين للمورّد. الدفع يُنقصه، الشراء الآجل يزيده.
 */
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  onSnapshot,
  query,
  orderBy,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { col, docRef } from './paths';
import type { Supplier } from './types';

/** معاملة مورّد: شراء (بضاعة أخذناها)، دفع (سدّدنا له)، أو دين يدوي. */
export interface SupplierTxn {
  id: string;
  supplierId: string;
  type: 'purchase' | 'payment' | 'debt';
  /** إجمالي الشراء / المبلغ المدفوع / الدين. */
  amount: number;
  /** للشراء: كم دُفع منه فوراً. */
  paid?: number;
  /** ملخّص الأصناف أو ملاحظة. */
  note?: string;
  purchaseId?: string;
  createdAt: number;
}

export type SupplierInput = {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  /** المنتجات/البضاعة التي يبيعها المورّد. */
  products?: string;
  balance?: number;
};

export function subscribeSuppliers(
  storeId: string,
  onData: (suppliers: Supplier[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(col(storeId, 'suppliers'), orderBy('nameLower'));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Supplier)),
    (e) => onError?.(e as Error),
  );
}

export function saveSupplier(storeId: string, input: SupplierInput, id?: string): string {
  const now = Date.now();
  const sid = id ?? doc(col(storeId, 'suppliers')).id;
  const data: Record<string, unknown> = {
    name: input.name.trim(),
    nameLower: input.name.trim().toLowerCase(),
    phone: input.phone ?? '',
    address: input.address ?? '',
    notes: input.notes ?? '',
    products: input.products ?? '',
    updatedAt: now,
  };
  if (!id) {
    data.createdAt = now;
    data.balance = input.balance ?? 0;
  }
  setDoc(docRef(storeId, 'suppliers', sid), data, { merge: true }).catch((e) =>
    console.error('saveSupplier فشل (سيُعاد):', e),
  );
  return sid;
}

export function deleteSupplier(storeId: string, id: string): void {
  deleteDoc(docRef(storeId, 'suppliers', id)).catch((e) => console.error('deleteSupplier:', e));
}

/** تعديل رصيد المورّد: موجب = زيادة الدين علينا، سالب = دفع/تسديد. */
export function adjustSupplierBalance(storeId: string, id: string, delta: number): void {
  if (!Number.isFinite(delta) || delta === 0) return;
  updateDoc(docRef(storeId, 'suppliers', id), {
    balance: increment(delta),
    updatedAt: Date.now(),
  }).catch((e) => console.error('adjustSupplierBalance:', e));
}

/** تسجيل معاملة مورّد (شراء/دفع/دين). fire-and-forget. */
export function recordSupplierTxn(storeId: string, txn: Omit<SupplierTxn, 'id' | 'createdAt'>): void {
  const id = doc(col(storeId, 'supplierTxns')).id;
  setDoc(docRef(storeId, 'supplierTxns', id), { ...txn, createdAt: Date.now() }).catch((e) =>
    console.error('recordSupplierTxn:', e),
  );
}

/** اشتراك بمعاملات مورّد (الأحدث أولاً) — استعلام بالمساواة وترتيب محلي (بلا فهرس مركّب). */
export function subscribeSupplierTxns(
  storeId: string,
  supplierId: string,
  onData: (txns: SupplierTxn[]) => void,
): Unsubscribe {
  const q = query(col(storeId, 'supplierTxns'), where('supplierId', '==', supplierId));
  return onSnapshot(q, (snap) => {
    const t = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SupplierTxn);
    t.sort((a, b) => b.createdAt - a.createdAt);
    onData(t);
  });
}

/** تسديد للمورّد: يُنقص الدين ويُسجّل معاملة دفع. */
export function recordSupplierPayment(storeId: string, supplierId: string, amount: number, note?: string): void {
  adjustSupplierBalance(storeId, supplierId, -amount);
  recordSupplierTxn(storeId, { supplierId, type: 'payment', amount, note });
}

/** دين يدوي على المورّد: يزيد ما علينا ويُسجّل معاملة. */
export function recordSupplierDebt(storeId: string, supplierId: string, amount: number, note?: string): void {
  adjustSupplierBalance(storeId, supplierId, amount);
  recordSupplierTxn(storeId, { supplierId, type: 'debt', amount, note });
}

/** يضيف أسماء منتجات إلى نص «products» للمورّد بلا تكرار. */
export function appendSupplierProducts(storeId: string, supplierId: string, existing: string, names: string[]): void {
  const cur = new Set((existing || '').split(/[،,;؛\n|]+/).map((s) => s.trim()).filter(Boolean));
  let changed = false;
  for (const n of names) {
    const t = n.trim();
    if (t && !cur.has(t)) { cur.add(t); changed = true; }
  }
  if (!changed) return;
  updateDoc(docRef(storeId, 'suppliers', supplierId), {
    products: Array.from(cur).join('، '),
    updatedAt: Date.now(),
  }).catch(() => {});
}
