'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { subscribeSuppliers } from './suppliers';
import type { Supplier } from './types';

let currentStoreId: string | null = null;
let unsub: (() => void) | null = null;
let snapshot: Supplier[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function persist(sid: string) {
  try {
    const preview = snapshot.slice(0, 150);
    localStorage.setItem(`kosmitik_suppliers_${sid}`, JSON.stringify(preview));
  } catch (e: any) {
    if (e.name === 'QuotaExceededError' || e.message.includes('quota')) {
      localStorage.removeItem(`kosmitik_suppliers_${sid}`);
    }
  }
}

function loadCache(sid: string): Supplier[] {
  try {
    const val = localStorage.getItem(`kosmitik_suppliers_${sid}`);
    return val ? JSON.parse(val) : [];
  } catch {
    return [];
  }
}

export function initSupplierStore(sid: string) {
  if (currentStoreId === sid && unsub) return;
  if (unsub) { unsub(); unsub = null; }
  currentStoreId = sid;

  snapshot = loadCache(sid);
  emit();

  unsub = subscribeSuppliers(sid, (items) => {
    snapshot = items;
    persist(sid);
    emit();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
const getSnapshot = () => snapshot;

export function useSuppliers(sid: string | null): Supplier[] {
  useEffect(() => {
    if (sid) initSupplierStore(sid);
  }, [sid]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
