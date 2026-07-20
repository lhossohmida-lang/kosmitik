'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { subscribeCustomers } from './customers';
import type { Customer } from './types';

let currentStoreId: string | null = null;
let unsub: (() => void) | null = null;
let snapshot: Customer[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function persist(sid: string) {
  try {
    const preview = snapshot.slice(0, 150);
    localStorage.setItem(`kosmitik_customers_${sid}`, JSON.stringify(preview));
  } catch (e: any) {
    if (e.name === 'QuotaExceededError' || e.message.includes('quota')) {
      localStorage.removeItem(`kosmitik_customers_${sid}`);
    }
  }
}

function loadCache(sid: string): Customer[] {
  try {
    const val = localStorage.getItem(`kosmitik_customers_${sid}`);
    return val ? JSON.parse(val) : [];
  } catch {
    return [];
  }
}

export function initCustomerStore(sid: string) {
  if (currentStoreId === sid && unsub) return;
  if (unsub) { unsub(); unsub = null; }
  currentStoreId = sid;

  snapshot = loadCache(sid);
  emit();

  unsub = subscribeCustomers(sid, (items) => {
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

export function useCustomers(sid: string | null): Customer[] {
  useEffect(() => {
    if (sid) initCustomerStore(sid);
  }, [sid]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
