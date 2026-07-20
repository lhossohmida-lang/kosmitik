'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { branding, formatMoney } from '@/lib/branding';
import { startOfDay, endOfDay } from '@/lib/dates';
import { stockStatus, type Sale, type Product, type Customer } from '@/lib/types';
import { subscribeSales } from '@/lib/sales';
import { subscribeProducts } from '@/lib/products';
import { useCustomers } from '@/lib/customerStore';

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function DashboardPage() {
  const { storeId } = useAuth();
  const { t } = useLanguage();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const customers = useCustomers(storeId);

  useEffect(() => {
    if (!storeId) return;
    const u1 = subscribeSales(storeId, startOfDay(Date.now()), endOfDay(Date.now()), setSales, () => {});
    const u2 = subscribeProducts(storeId, setProducts);
    return () => { u1(); u2(); };
  }, [storeId]);

  const d = useMemo(() => {
    const active = sales.filter((s) => s.status === 'active');
    const total = round2(active.reduce((a, s) => a + s.total, 0));
    const count = active.length;
    const avg = count ? round2(total / count) : 0;

    // أفضل منتج اليوم (بالكمية).
    const qtyByName = new Map<string, number>();
    for (const s of active) for (const it of s.items) qtyByName.set(it.name, (qtyByName.get(it.name) ?? 0) + it.qty);
    let best = '—';
    let bestQty = 0;
    qtyByName.forEach((q, name) => {
      if (q > bestQty) { bestQty = q; best = name; }
    });

    const alerts = products.filter((p) => stockStatus(p) !== 'ok').length;
    const debts = round2(customers.reduce((a, c) => a + Math.max(0, c.balance), 0));

    return { total, count, avg, best, bestQty, alerts, debts };
  }, [sales, products, customers]);

  const cards = [
    { label: t('dashboard.todaySales'), value: formatMoney(d.total), icon: '💰', href: '/reports' },
    { label: t('dashboard.invoiceCount'), value: String(d.count), icon: '🧾', href: '/reports' },
    { label: t('dashboard.avgInvoice'), value: formatMoney(d.avg), icon: '📈' },
    { label: t('dashboard.stockAlerts'), value: String(d.alerts), icon: '⚠️', href: '/products' },
    { label: t('dashboard.totalDebts'), value: formatMoney(d.debts), icon: '📒', href: '/credits' },
    { label: t('dashboard.bestProduct'), value: d.best, icon: '⭐', sub: d.bestQty ? `${d.bestQty} ${t('dashboard.unit')}` : '' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>{t('dashboard.welcome', { store: branding.storeName })}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('dashboard.summary')}</p>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
        {cards.map((c) => {
          const inner = (
            <div className="card" style={{ height: '100%' }}>
              <div style={{ fontSize: 22 }}>{c.icon}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.value}
              </div>
              {'sub' in c && c.sub ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.sub}</div> : null}
            </div>
          );
          return c.href ? (
            <Link key={c.label} href={c.href}>{inner}</Link>
          ) : (
            <div key={c.label}>{inner}</div>
          );
        })}
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/pos" className="btn">{t('dashboard.startSale')}</Link>
        <Link href="/products" className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center' }}>{t('dashboard.goStock')}</Link>
      </div>
    </div>
  );
}
