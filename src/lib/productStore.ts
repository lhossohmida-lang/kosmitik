'use client';

/**
 * مخزن منتجات مشترك (singleton) — يُحمّل مرّة واحدة للجلسة كلها بدل إعادة القراءة
 * في كل دخول لصفحة. + كاش في localStorage (الإحصاءات + معاينة) لظهور فوري حتى
 * بعد إعادة تشغيل التطبيق.
 *
 * أي صفحة (المخزون، نقطة البيع، اللوحة) تستدعي useProducts(storeId) فتحصل على
 * البيانات فوراً من الذاكرة/الكاش، ثم تُحدَّث في الخلفية من Firestore.
 */
import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import { subscribeProducts } from './products';
import { stockStatus, isNearExpiry, type Product } from './types';

export interface ProductStats {
  count: number;
  value: number;
  out: number;
  low: number;
  expiry: number;
}

export interface ProductsSnapshot {
  products: Product[];
  stats: ProductStats;
  /** true بعد وصول القائمة الكاملة من Firestore (قبلها: معاينة الكاش). */
  ready: boolean;
}

const EMPTY_STATS: ProductStats = { count: 0, value: 0, out: 0, low: 0, expiry: 0 };

let currentStoreId: string | null = null;
let unsub: (() => void) | null = null;
let snapshot: ProductsSnapshot = { products: [], stats: EMPTY_STATS, ready: false };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function computeStats(items: Product[]): ProductStats {
  let value = 0, out = 0, low = 0, expiry = 0;
  for (const p of items) {
    value += p.stock * p.unitPurchasePrice;
    const s = stockStatus(p);
    if (s === 'out') out++;
    else if (s === 'low') low++;
    if (isNearExpiry(p)) expiry++;
  }
  return { count: items.length, value, out, low, expiry };
}

function persist(sid: string) {
  try {
    localStorage.setItem(`kosmitik_stats_${sid}`, JSON.stringify(snapshot.stats));
    // معاينة خفيفة (150 منتجاً بلا صور) لتفادي تجاوز حجم localStorage.
    const preview = snapshot.products.slice(0, 150).map((p) => ({ ...p, image: '' }));
    localStorage.setItem(`kosmitik_preview_${sid}`, JSON.stringify(preview));
  } catch {
    /* الحجم/الخصوصية — غير حرج */
  }
}

function loadCache(sid: string): ProductsSnapshot {
  try {
    const st = localStorage.getItem(`kosmitik_stats_${sid}`);
    const pv = localStorage.getItem(`kosmitik_preview_${sid}`);
    return {
      products: pv ? (JSON.parse(pv) as Product[]) : [],
      stats: st ? (JSON.parse(st) as ProductStats) : EMPTY_STATS,
      ready: false,
    };
  } catch {
    return { products: [], stats: EMPTY_STATS, ready: false };
  }
}

/** يُهيّئ المخزن لمتجر معيّن (يشترك مرّة واحدة). آمن للاستدعاء المتكرّر. */
export function initProductStore(sid: string) {
  if (currentStoreId === sid && unsub) return; // مشترك أصلاً لنفس المتجر
  if (unsub) { unsub(); unsub = null; }
  currentStoreId = sid;

  // اعرض كاش localStorage فوراً (إحصاءات + معاينة).
  snapshot = loadCache(sid);
  emit();

  // اشترك بالكامل في الخلفية.
  unsub = subscribeProducts(sid, (items) => {
    snapshot = { products: items, stats: computeStats(items), ready: true };
    persist(sid);
    emit();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
const getSnapshot = () => snapshot;

/** Hook: يُعيد المنتجات والإحصاءات فوراً (من الذاكرة/الكاش) ويُحدَّث لحظياً. */
export function useProducts(sid: string | null): ProductsSnapshot {
  useEffect(() => {
    if (sid) initProductStore(sid);
  }, [sid]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
