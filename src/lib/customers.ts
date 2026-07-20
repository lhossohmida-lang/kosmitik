/**
 * عملاء الكريدي: CRUD + عمليات الدين/الدفعة + سجل المعاملات.
 * كل الكتابات fire-and-forget؛ الرصيد يتغيّر ذرّياً عبر increment.
 * مجموعة واحدة «customers» بحقل group ('credit' | 'deferred').
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
import type { Customer, CustomerGroup } from './types';

export interface CreditTxn {
  id: string;
  customerId: string;
  type: 'purchase' | 'debt' | 'payment' | 'adjust';
  amount: number;
  note?: string;
  saleId?: string;
  createdAt: number;
}

export type CustomerInput = Omit<Customer, 'id' | 'nameLower' | 'createdAt' | 'updatedAt' | 'balance'> & {
  balance?: number;
};

export function subscribeCustomers(
  storeId: string,
  onData: (customers: Customer[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(col(storeId, 'customers'), orderBy('nameLower'));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Customer)),
    (e) => onError?.(e as Error),
  );
}

/** حفظ عميل (إضافة/تعديل). عند الإضافة يُضبط الرصيد الافتتاحي = balance المُمرَّر. */
export function saveCustomer(storeId: string, input: CustomerInput, id?: string): string {
  const now = Date.now();
  const cid = id ?? doc(col(storeId, 'customers')).id;
  const data: Record<string, unknown> = {
    ...input,
    nameLower: input.name.trim().toLowerCase(),
    updatedAt: now,
  };
  if (!id) {
    data.createdAt = now;
    data.balance = input.balance ?? 0; // دين افتتاحي
  } else {
    delete data.balance; // لا نلمس الرصيد عند التعديل (يُدار بالمعاملات)
  }
  setDoc(docRef(storeId, 'customers', cid), data, { merge: true }).catch((e) =>
    console.error('saveCustomer فشل (سيُعاد):', e),
  );
  return cid;
}

export function deleteCustomer(storeId: string, id: string): void {
  deleteDoc(docRef(storeId, 'customers', id)).catch((e) => console.error('deleteCustomer:', e));
}

function addTxn(
  storeId: string,
  customerId: string,
  type: CreditTxn['type'],
  amount: number,
  note?: string,
): void {
  const id = doc(col(storeId, 'creditTxns')).id;
  setDoc(docRef(storeId, 'creditTxns', id), {
    customerId,
    type,
    amount,
    note: note ?? '',
    createdAt: Date.now(),
  }).catch((e) => console.error('addTxn فشل (سيُعاد):', e));
}

/** إضافة دين يدوي: يزيد الرصيد. */
export function addDebt(storeId: string, customerId: string, amount: number, note?: string): void {
  updateDoc(docRef(storeId, 'customers', customerId), {
    balance: increment(amount),
    updatedAt: Date.now(),
  }).catch((e) => console.error('addDebt:', e));
  addTxn(storeId, customerId, 'debt', amount, note);
}

/** تسجيل دفعة: تُنقص الرصيد لحظياً. */
export function recordPayment(storeId: string, customerId: string, amount: number, note?: string): void {
  updateDoc(docRef(storeId, 'customers', customerId), {
    balance: increment(-amount),
    updatedAt: Date.now(),
  }).catch((e) => console.error('recordPayment:', e));
  addTxn(storeId, customerId, 'payment', amount, note);
}

/**
 * اشتراك لحظي بمعاملات عميل معيّن (الأحدث أولاً).
 * نستعلم بالمساواة فقط ونرتّب محلياً — لتفادي الحاجة لفهرس مركّب في Firestore.
 */
export function subscribeCustomerTxns(
  storeId: string,
  customerId: string,
  onData: (txns: CreditTxn[]) => void,
): Unsubscribe {
  const q = query(col(storeId, 'creditTxns'), where('customerId', '==', customerId));
  return onSnapshot(q, (snap) => {
    const txns = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CreditTxn);
    txns.sort((a, b) => b.createdAt - a.createdAt);
    onData(txns);
  });
}

/**
 * اشتراك بمعاملات الدفع ضمن نطاق زمني (لتقرير مدفوعات الكريديات).
 * نستعلم بنطاق createdAt فقط ونصفّي النوع محلياً — لتفادي الفهرس المركّب.
 */
export function subscribePayments(
  storeId: string,
  from: number,
  to: number,
  onData: (txns: CreditTxn[]) => void,
): Unsubscribe {
  const q = query(
    col(storeId, 'creditTxns'),
    where('createdAt', '>=', from),
    where('createdAt', '<=', to),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) =>
    onData(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as CreditTxn)
        .filter((t) => t.type === 'payment'),
    ),
  );
}

export const CUSTOMER_GROUPS: { key: CustomerGroup; labelKey: string }[] = [
  { key: 'credit', labelKey: 'credits.group.credit' },
  { key: 'deferred', labelKey: 'credits.group.deferred' },
];
