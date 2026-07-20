'use client';

/**
 * سياق المصادقة.
 *  - صاحب المتجر: role='owner'، storeId = uid (عزل بياناته).
 *  - العامل: role='seller'، storeId = متجر صاحب العمل (من workerAccounts/{uid}).
 * كل الصفحات تقرأ storeId من هنا؛ والعامل يُقيَّد بواجهة البيع فقط.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, firebaseConfigured } from '@/lib/firebase';
import { getWorkerAccount } from '@/lib/workerAuth';

export type Role = 'owner' | 'seller';

type AuthState = {
  user: User | null;
  /** معرّف المتجر الفعّال (متجر المالك، أو متجر صاحب العمل للعامل). */
  storeId: string | null;
  role: Role;
  /** true إذا كان المستخدم عاملاً (واجهة بيع فقط). */
  isSeller: boolean;
  permissions: string[];
  loading: boolean;
  configured: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('owner');
  const [permissions, setPermissions] = useState<string[]>(['*']);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setStoreId(null);
        setRole('owner');
        setPermissions(['*']);
        setLoading(false);
        return;
      }
      // نحدّد الدور: عامل (له مستند في workerAccounts) أم مالك.
      const account = await getWorkerAccount(u.uid);
      if (account && account.active) {
        setStoreId(account.storeId);
        setRole('seller');
        
        try {
          const wSnap = await getDoc(doc(db, 'stores', account.storeId, 'workers', account.workerId));
          if (wSnap.exists()) {
            const wData = wSnap.data();
            setPermissions(wData.permissions || []);
          } else {
            setPermissions([]);
          }
        } catch (e) {
          console.error(e);
          setPermissions([]);
        }
      } else {
        setStoreId(u.uid);
        setRole('owner');
        setPermissions(['*']);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const value: AuthState = {
    user,
    storeId,
    role,
    isSeller: role === 'seller',
    permissions,
    loading,
    configured: firebaseConfigured,
    login: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    register: async (email, password) => {
      await createUserWithEmailAndPassword(auth, email, password);
    },
    logout: async () => {
      await signOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth يجب استخدامه داخل <AuthProvider>');
  return ctx;
}
