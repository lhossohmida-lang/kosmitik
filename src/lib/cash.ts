/**
 * صندوق النقود اليومي.
 * جلسة لكل يوم (المعرّف = بداية اليوم بالمللي ثانية).
 * عند الحفظ نُرحّل «المتروك» إلى رصيد الغد الافتتاحي.
 */
import { setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { docRef } from './paths';
import { startOfDay } from './dates';

export interface CashSession {
  id: string;
  opening: number;
  kept: number;
  withdrawn: number;
  updatedAt: number;
}

export function dayId(ms: number): string {
  return String(startOfDay(ms));
}

export function subscribeCashSession(
  storeId: string,
  id: string,
  onData: (s: CashSession | null) => void,
): Unsubscribe {
  return onSnapshot(docRef(storeId, 'cashSessions', id), (snap) =>
    onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as CashSession) : null),
  );
}

export function saveCashSession(
  storeId: string,
  dayMs: number,
  data: { opening: number; kept: number; withdrawn: number },
): void {
  const now = Date.now();
  setDoc(docRef(storeId, 'cashSessions', dayId(dayMs)), { ...data, updatedAt: now }, { merge: true }).catch(
    (e) => console.error('saveCashSession:', e),
  );
  // ترحيل المتروك لرصيد الغد الافتتاحي.
  setDoc(
    docRef(storeId, 'cashSessions', dayId(dayMs + 24 * 3600 * 1000)),
    { opening: data.kept, updatedAt: now },
    { merge: true },
  ).catch((e) => console.error('ترحيل رصيد الغد:', e));
}
