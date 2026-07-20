/** المصاريف: إضافة/حذف/اشتراك ضمن نطاق زمني. fire-and-forget. */
import {
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { col, docRef } from './paths';

export interface Expense {
  id: string;
  description: string;
  amount: number;
  note?: string;
  createdAt: number;
}

export function addExpense(
  storeId: string,
  data: { description: string; amount: number; note?: string; createdAt?: number },
): string {
  const id = doc(col(storeId, 'expenses')).id;
  setDoc(docRef(storeId, 'expenses', id), {
    description: data.description,
    amount: data.amount,
    note: data.note ?? '',
    createdAt: data.createdAt ?? Date.now(),
  }).catch((e) => console.error('addExpense فشل (سيُعاد):', e));
  return id;
}

export function deleteExpense(storeId: string, id: string): void {
  deleteDoc(docRef(storeId, 'expenses', id)).catch((e) => console.error('deleteExpense:', e));
}

export function subscribeExpenses(
  storeId: string,
  from: number,
  to: number,
  onData: (items: Expense[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(
    col(storeId, 'expenses'),
    where('createdAt', '>=', from),
    where('createdAt', '<=', to),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense)),
    (e) => onError?.(e as Error),
  );
}
