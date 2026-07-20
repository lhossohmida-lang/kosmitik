'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { formatMoney } from '@/lib/branding';
import { startOfDay, endOfDay, fromDateInput, toDateInput } from '@/lib/dates';
import type { Sale } from '@/lib/types';
import { subscribeSales } from '@/lib/sales';
import { subscribeExpenses, type Expense } from '@/lib/expenses';
import { subscribePayments, type CreditTxn } from '@/lib/customers';
import { subscribeCashSession, saveCashSession, dayId, type CashSession } from '@/lib/cash';

export default function CashPage() {
  return <CashInner />;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function CashInner() {
  const { storeId } = useAuth();
  const { t } = useLanguage();
  const [day, setDay] = useState(toDateInput(Date.now()));
  const dayMs = fromDateInput(day);

  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<CreditTxn[]>([]);
  const [session, setSession] = useState<CashSession | null>(null);

  const [opening, setOpening] = useState('0');
  const [kept, setKept] = useState('');
  const [withdrawn, setWithdrawn] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!storeId) return;
    const f = startOfDay(dayMs);
    const t = endOfDay(dayMs);
    const u1 = subscribeSales(storeId, f, t, setSales, () => {});
    const u2 = subscribeExpenses(storeId, f, t, setExpenses, () => {});
    const u3 = subscribePayments(storeId, f, t, setPayments);
    const u4 = subscribeCashSession(storeId, dayId(dayMs), setSession);
    return () => { u1(); u2(); u3(); u4(); };
  }, [storeId, day]); // eslint-disable-line react-hooks/exhaustive-deps

  // حمّل قيم الجلسة المحفوظة عند تغيّر اليوم.
  useEffect(() => {
    setOpening(String(session?.opening ?? 0));
    setKept(session?.kept ? String(session.kept) : '');
    setWithdrawn(session?.withdrawn ? String(session.withdrawn) : '');
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMemo(() => {
    const active = sales.filter((s) => s.status === 'active');
    const cashSales = round2(active.filter((s) => s.payment === 'cash').reduce((a, s) => a + s.total, 0));
    const paymentsReceived = round2(payments.reduce((a, p) => a + p.amount, 0));
    const expensesTotal = round2(expenses.reduce((a, e) => a + e.amount, 0));
    const open = Number(opening) || 0;
    const current = round2(open + cashSales + paymentsReceived - expensesTotal);
    return { cashSales, paymentsReceived, expensesTotal, current };
  }, [sales, payments, expenses, opening]);

  function save() {
    if (!storeId) return;
    saveCashSession(storeId, dayMs, {
      opening: Number(opening) || 0,
      kept: Number(kept) || 0,
      withdrawn: Number(withdrawn) || 0,
    });
    setMsg(t('cash.saved'));
    setTimeout(() => setMsg(''), 3000);
  }

  const rows: [string, string, string?][] = [
    [t('cash.opening'), formatMoney(Number(opening) || 0), '+'],
    [t('cash.cashSales'), formatMoney(m.cashSales), '+'],
    [t('cash.paymentsReceived'), formatMoney(m.paymentsReceived), '+'],
    [t('cash.expenses'), formatMoney(m.expensesTotal), '−'],
  ];

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(280px, 1fr) minmax(260px, 360px)', alignItems: 'start' }} className="cash-grid">
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('cash.day')}</label>
          <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ width: 'auto' }} />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{t('cash.opening')}</label>
          <input className="input" type="number" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </div>

        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          {rows.map(([label, val, sign]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#f8fafc', borderRadius: 8 }}>
              <span style={{ color: 'var(--text-muted)' }}>{sign} {label}</span>
              <b style={{ color: sign === '−' ? 'var(--danger)' : 'var(--text)' }}>{val}</b>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, fontWeight: 800, padding: '10px 0', borderTop: '2px solid var(--border)' }}>
          <span>{t('cash.current')}</span>
          <span style={{ color: 'var(--primary)' }}>{formatMoney(m.current)}</span>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>{t('cash.carryOverTitle')}</h3>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{t('cash.keepForTomorrow')}</label>
          <input className="input" type="number" value={kept} onChange={(e) => setKept(e.target.value)} placeholder="0" />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{t('cash.withdraw')}</label>
          <input className="input" type="number" value={withdrawn} onChange={(e) => setWithdrawn(e.target.value)} placeholder="0" />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {t('cash.carryNote')}
        </div>
        {msg && <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{msg}</div>}
        <button className="btn" style={{ width: '100%' }} onClick={save}>{t('common.save')}</button>
      </div>

      <style jsx>{`
        @media (max-width: 780px) {
          .cash-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
