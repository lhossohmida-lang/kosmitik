/**
 * العمال: CRUD + تسجيل الدخول/الخروج (حساب ساعات العمل) + السلفة.
 * نوعان: 'hourly' (أجر بالساعة يُحسب من الدخول للخروج) و'fixed' (أجر محدّد).
 * كل الكتابات fire-and-forget.
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
import type { Worker, WorkSession } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export type WorkerInput = {
  name: string;
  type: Worker['type'];
  hourlyRate: number;
  fixedWage: number;
  advance?: number;
  permissions?: string[];
};

export function subscribeWorkers(
  storeId: string,
  onData: (workers: Worker[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(col(storeId, 'workers'), orderBy('nameLower'));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Worker)),
    (e) => onError?.(e as Error),
  );
}

export function saveWorker(storeId: string, input: WorkerInput, id?: string): string {
  const now = Date.now();
  const wid = id ?? doc(col(storeId, 'workers')).id;
  const data: Record<string, unknown> = {
    name: input.name.trim(),
    nameLower: input.name.trim().toLowerCase(),
    type: input.type,
    hourlyRate: input.hourlyRate,
    fixedWage: input.fixedWage,
    permissions: input.permissions ?? [],
    updatedAt: now,
  };
  if (!id) {
    data.createdAt = now;
    data.active = false;
    data.clockInAt = null;
    data.currentSessionId = null;
    data.advance = input.advance ?? 0; // السلفة الافتتاحية
  }
  setDoc(docRef(storeId, 'workers', wid), data, { merge: true }).catch((e) =>
    console.error('saveWorker فشل (سيُعاد):', e),
  );
  return wid;
}

export function deleteWorker(storeId: string, id: string): void {
  deleteDoc(docRef(storeId, 'workers', id)).catch((e) => console.error('deleteWorker:', e));
}

/** تسجيل دخول: يفتح جلسة جديدة. */
export function clockIn(storeId: string, worker: Worker): void {
  if (worker.active) return;
  const now = Date.now();
  const sessionId = doc(col(storeId, 'workSessions')).id;
  setDoc(docRef(storeId, 'workSessions', sessionId), {
    workerId: worker.id,
    workerName: worker.name,
    type: worker.type,
    rate: worker.hourlyRate,
    clockIn: now,
    clockOut: null,
    hours: 0,
    wage: 0,
    createdAt: now,
  }).catch((e) => console.error('clockIn جلسة فشل:', e));
  updateDoc(docRef(storeId, 'workers', worker.id), {
    active: true,
    clockInAt: now,
    currentSessionId: sessionId,
    updatedAt: now,
  }).catch((e) => console.error('clockIn عامل فشل:', e));
}

/** تسجيل خروج: يُغلق الجلسة ويحسب الساعات والأجر. */
export function clockOut(storeId: string, worker: Worker): void {
  if (!worker.active || !worker.currentSessionId || !worker.clockInAt) return;
  const now = Date.now();
  const hours = round2(Math.max(0, (now - worker.clockInAt) / 3_600_000));
  const wage = worker.type === 'hourly' ? round2(hours * worker.hourlyRate) : 0;
  updateDoc(docRef(storeId, 'workSessions', worker.currentSessionId), {
    clockOut: now,
    hours,
    wage,
  }).catch((e) => console.error('clockOut جلسة فشل:', e));
  updateDoc(docRef(storeId, 'workers', worker.id), {
    active: false,
    clockInAt: null,
    currentSessionId: null,
    updatedAt: now,
  }).catch((e) => console.error('clockOut عامل فشل:', e));
}

/** زر واحد: دخول إن كان خارجاً، خروج إن كان داخلاً. */
export function toggleClock(storeId: string, worker: Worker): void {
  if (worker.active) clockOut(storeId, worker);
  else clockIn(storeId, worker);
}

/** إضافة سلفة (موجب) أو تسديد (سالب) — يعدّل الإجمالي ذرّياً. */
export function adjustAdvance(storeId: string, workerId: string, delta: number): void {
  if (!Number.isFinite(delta) || delta === 0) return;
  updateDoc(docRef(storeId, 'workers', workerId), {
    advance: increment(delta),
    updatedAt: Date.now(),
  }).catch((e) => console.error('adjustAdvance:', e));
}

/** اشتراك بجلسات العمل ضمن نطاق زمني (لجدول ساعات العمل في التقارير). */
export function subscribeWorkSessions(
  storeId: string,
  from: number,
  to: number,
  onData: (sessions: WorkSession[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(
    col(storeId, 'workSessions'),
    where('createdAt', '>=', from),
    where('createdAt', '<=', to),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WorkSession)),
    (e) => onError?.(e as Error),
  );
}
