/**
 * حسابات العمال: إنشاء حساب Firebase للعامل (بريد + كلمة سر) وربطه بمتجره.
 * العامل يدخل بحسابه الخاص فيرى **واجهة بيع فقط** على بيانات متجر صاحب العمل.
 *
 * مهم: ننشئ حساب العامل عبر **تطبيق Firebase ثانوي** حتى لا يخرج صاحب المتجر
 * من جلسته (createUserWithEmailAndPassword يسجّل دخول المستخدم الجديد افتراضياً).
 *
 * ملاحظة: دخول العامل يتطلّب نشر قواعد Firestore المحدّثة (وصول العامل لبيانات المتجر).
 */
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, getDocFromServer, setDoc, updateDoc } from 'firebase/firestore';
import { db, firebaseConfig } from './firebase';

export interface WorkerAccount {
  storeId: string;
  workerId: string;
  name: string;
  email: string;
  active: boolean;
  createdAt: number;
}

/** ينشئ حساب Firebase للعامل عبر تطبيق ثانوي. يُعيد uid العامل. */
export async function createWorkerAuth(email: string, password: string): Promise<string> {
  const app = initializeApp(firebaseConfig, 'worker-create-' + Date.now());
  try {
    const cred = await createUserWithEmailAndPassword(getAuth(app), email.trim(), password);
    await signOut(getAuth(app)).catch(() => {});
    return cred.user.uid;
  } finally {
    await deleteApp(app).catch(() => {});
  }
}

/**
 * حساب Auth موجود مسبقاً (من محاولة سابقة فشل حفظ مستند ربطها)؟
 * ندخل به عبر تطبيق ثانوي لجلب uid فقط — دون إخراج المالك من جلسته.
 */
export async function signInWorkerForUid(email: string, password: string): Promise<string> {
  const app = initializeApp(firebaseConfig, 'worker-relink-' + Date.now());
  try {
    const cred = await signInWithEmailAndPassword(getAuth(app), email.trim(), password);
    await signOut(getAuth(app)).catch(() => {});
    return cred.user.uid;
  } finally {
    await deleteApp(app).catch(() => {});
  }
}

/** ينشئ حساب العامل ويربطه بالمتجر ويحدّث مستند العامل. */
export async function createAndLinkWorkerAccount(
  storeId: string,
  workerId: string,
  workerName: string,
  email: string,
  password: string,
): Promise<void> {
  let uid: string;
  try {
    uid = await createWorkerAuth(email, password);
  } catch (e) {
    const code = (e as { code?: string })?.code ?? '';
    if (code === 'auth/email-already-in-use') {
      // البريد مسجّل من محاولة سابقة لم يُحفَظ مستندُها → نجلب uid بالدخول ونعيد الربط.
      uid = await signInWorkerForUid(email, password);
    } else {
      throw e;
    }
  }
  // بحث عكسي عام (top-level) ليجد العامل متجره عند الدخول.
  await setDoc(doc(db, 'workerAccounts', uid), {
    storeId,
    workerId,
    name: workerName,
    email: email.trim(),
    active: true,
    createdAt: Date.now(),
  } satisfies WorkerAccount);

  // مهم: مع التخزين المحلي، setDoc ينجح محلياً حتى لو رفَض الخادمُ الكتابةَ
  // (مثلاً تجاوز حصّة الكتابة اليومية للخطة المجانية). عندها لن يجد العاملُ
  // مستندَه عند الدخول → يدخل كمتجر جديد فارغ. لذا نتحقّق أنه وصل الخادم فعلاً.
  try {
    const check = await getDocFromServer(doc(db, 'workerAccounts', uid));
    if (!check.exists()) throw { code: 'not-persisted' };
  } catch (e) {
    const code = (e as { code?: string })?.code ?? '';
    if (code === 'resource-exhausted') throw { code: 'quota-exceeded' };
    if (code === 'not-persisted') throw { code: 'not-persisted' };
    throw e; // خطأ آخر أثناء التحقق
  }

  // نحفظ المرجع على مستند العامل أيضاً.
  await updateDoc(doc(db, 'stores', storeId, 'workers', workerId), {
    email: email.trim(),
    authUid: uid,
    updatedAt: Date.now(),
  }).catch((e) => console.error('ربط حساب العامل:', e));
}

/** يقرأ حساب العامل بالـ uid (لتحديد الدور والمتجر عند الدخول). */
export async function getWorkerAccount(uid: string): Promise<WorkerAccount | null> {
  try {
    const snap = await getDoc(doc(db, 'workerAccounts', uid));
    return snap.exists() ? (snap.data() as WorkerAccount) : null;
  } catch {
    return null; // القواعد غير منشورة → يُعامَل كمالك متجره الخاص
  }
}
