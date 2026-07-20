'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { formatMoney } from '@/lib/branding';
import { startOfDay, endOfDay, fromDateInput, toDateInput, formatDateTime } from '@/lib/dates';
import type { Sale, PaymentMode } from '@/lib/types';
import { subscribeSales, cancelSale, returnSaleItem } from '@/lib/sales';
import { subscribeExpenses, type Expense } from '@/lib/expenses';
import { subscribePayments, type CreditTxn } from '@/lib/customers';
import { useCustomers } from '@/lib/customerStore';
import type { Customer } from '@/lib/types';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import WorkHoursTable from '@/components/WorkHoursTable';

const round2 = (n: number) => Math.round(n * 100) / 100;
const itemsCost = (s: Sale) => round2(s.items.reduce((a, i) => a + i.unitPurchasePrice * i.qty, 0));

export default function ReportsPage() {
  return <ReportsInner />;
}

function ReportsInner() {
  const { storeId } = useAuth();
  const { t } = useLanguage();
  const [from, setFrom] = useState(toDateInput(Date.now()));
  const [to, setTo] = useState(toDateInput(Date.now()));
  const [payFilter, setPayFilter] = useState<'all' | PaymentMode>('all');

  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<CreditTxn[]>([]);
  const customers = useCustomers(storeId);

  const [openSale, setOpenSale] = useState<Sale | null>(null);
  const [toCancel, setToCancel] = useState<Sale | null>(null);
  const [showPayments, setShowPayments] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    const f = startOfDay(fromDateInput(from));
    const t = endOfDay(fromDateInput(to));
    const u1 = subscribeSales(storeId, f, t, setSales, () => {});
    const u2 = subscribeExpenses(storeId, f, t, setExpenses, () => {});
    const u3 = subscribePayments(storeId, f, t, setPayments);
    return () => { u1(); u2(); u3(); };
  }, [storeId, from, to]);

  const openLive = useMemo(
    () => (openSale ? sales.find((s) => s.id === openSale.id) ?? null : null),
    [openSale, sales],
  );

  const m = useMemo(() => {
    const active = sales.filter((s) => s.status === 'active');
    const filtered = payFilter === 'all' ? active : active.filter((s) => s.payment === payFilter);
    const cash = active.filter((s) => s.payment === 'cash');
    const credit = active.filter((s) => s.payment === 'credit');

    const totalSales = round2(filtered.reduce((a, s) => a + s.total, 0));
    const cashTotal = round2(cash.reduce((a, s) => a + s.total, 0));
    const cashCost = round2(cash.reduce((a, s) => a + itemsCost(s), 0));
    const cashProfit = round2(cashTotal - cashCost);
    const creditCost = round2(credit.reduce((a, s) => a + itemsCost(s), 0));
    const expensesTotal = round2(expenses.reduce((a, e) => a + e.amount, 0));
    const paymentsTotal = round2(payments.reduce((a, p) => a + p.amount, 0));
    const net = round2(cashTotal + paymentsTotal - expensesTotal);
    const deferredDebt = round2(
      customers.filter((c) => c.group === 'deferred').reduce((a, c) => a + Math.max(0, c.balance), 0),
    );

    return { filtered, totalSales, cashTotal, cashCost, cashProfit, creditCost, expensesTotal, paymentsTotal, net, deferredDebt, count: filtered.length };
  }, [sales, expenses, payments, customers, payFilter]);

  function exportCsv() {
    const header = [t('reports.csv.date'), t('reports.csv.payment'), t('reports.csv.customer'), t('reports.csv.itemCount'), t('reports.csv.discount'), t('reports.csv.total')];
    const lines = m.filtered.map((s) =>
      [formatDateTime(s.createdAt), s.payment === 'cash' ? t('reports.cash') : t('reports.credit'), s.customerName ?? '', s.items.length, s.discount, s.total].join(','),
    );
    const csv = '﻿' + [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t('reports.csv.filename')}_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* الفلاتر */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('reports.from')}</label>
        <input className="input" style={{ width: 'auto' }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('reports.to')}</label>
        <input className="input" style={{ width: 'auto' }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <select className="input" style={{ width: 'auto' }} value={payFilter} onChange={(e) => setPayFilter(e.target.value as 'all' | PaymentMode)}>
          <option value="all">{t('reports.allPayments')}</option>
          <option value="cash">{t('reports.cash')}</option>
          <option value="credit">{t('reports.credit')}</option>
        </select>
        <button className="btn-outline" onClick={exportCsv} style={{ marginInlineStart: 'auto' }}>{t('reports.exportCsv')}</button>
      </div>

      {/* البطاقات */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', marginBottom: 16 }}>
        <Card label={t('reports.card.totalSales')} value={formatMoney(m.totalSales)} icon="💰" />
        <Card label={t('reports.card.cash')} value={formatMoney(m.cashTotal)} icon="💵" />
        <Card label={t('reports.card.invoiceCount')} value={String(m.count)} icon="🧾" />
        <Card label={t('reports.card.totalExpenses')} value={formatMoney(m.expensesTotal)} icon="🔻" color="var(--danger)" />
        <Card label={t('reports.card.net')} value={formatMoney(m.net)} icon="📈" color="var(--success)" />
        <Card label={t('reports.card.deferredCredits')} value={formatMoney(m.deferredDebt)} icon="📒" color="var(--accent)" />
        <Card label={t('reports.card.creditPayments')} value={formatMoney(m.paymentsTotal)} icon="💳" onClick={() => setShowPayments(true)} />
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('reports.capitalProfit')}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
            <span>{t('reports.capital')} <b>{formatMoney(m.cashCost)}</b></span>
            <span>{t('reports.profit')} <b style={{ color: 'var(--success)' }}>{formatMoney(m.cashProfit)}</b></span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {t('reports.creditCostNote', { n: formatMoney(m.creditCost) })}
          </div>
        </div>
      </div>

      {/* جدول المبيعات */}
      <h3 style={{ fontSize: 15, margin: '4px 0 8px' }}>{t('reports.invoicesCount', { n: m.count })}</h3>
      {m.filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>{t('reports.noSalesInPeriod')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {m.filtered.map((s) => (
            <button key={s.id} onClick={() => setOpenSale(s)} className="card" style={{ textAlign: 'right', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', cursor: 'pointer' }}>
              <div>
                <b>{formatMoney(s.total)}</b>
                <span style={{ marginInlineStart: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  {s.payment === 'cash' ? t('reports.cash') : t('reports.creditWithName', { name: s.customerName ?? '' })} · {t('reports.itemsCount', { n: s.items.length })}
                </span>
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatDateTime(s.createdAt)}</div>
              </div>
              <span style={{ color: 'var(--primary)', fontSize: 13, fontWeight: 700 }}>{t('reports.details')}</span>
            </button>
          ))}
        </div>
      )}

      {/* جدول ساعات العمل والأجور */}
      {storeId && <WorkHoursTable storeId={storeId} from={startOfDay(fromDateInput(from))} to={endOfDay(fromDateInput(to))} />}

      {/* تفاصيل فاتورة + إرجاع/إلغاء */}
      {openLive && storeId && (
        <Modal open onClose={() => setOpenSale(null)} title={t('reports.invoiceDetails')} width={520}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 10 }}>
            {formatDateTime(openLive.createdAt)} · {openLive.payment === 'cash' ? t('reports.cash') : t('reports.creditWithNameDash', { name: openLive.customerName ?? '' })}
          </div>
          <div style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
            {openLive.items.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                <span>{it.name} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>× {it.qty}</span></span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <b>{formatMoney(it.lineTotal)}</b>
                  <button onClick={() => returnSaleItem(storeId, openLive, i)} style={{ border: '1px solid var(--danger)', background: '#fff', color: 'var(--danger)', borderRadius: 6, fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>
                    {t('reports.return')}
                  </button>
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, marginBottom: 14 }}>
            <span>{t('reports.total')}</span><span>{formatMoney(openLive.total)}</span>
          </div>
          <button className="btn" style={{ background: 'var(--danger)' }} onClick={() => setToCancel(openLive)}>{t('reports.cancelWholeInvoice')}</button>
        </Modal>
      )}

      {/* مدفوعات الكريديات */}
      <Modal open={showPayments} onClose={() => setShowPayments(false)} title={t('reports.creditPaymentsTitle')} width={480}>
        {payments.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>{t('reports.noPaymentsInPeriod')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
            {payments.map((p) => {
              const c = customers.find((x) => x.id === p.customerId);
              return (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <span>
                    <b>{c?.name ?? t('reports.customerFallback')}</b>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatDateTime(p.createdAt)}</div>
                  </span>
                  <b style={{ color: 'var(--success)' }}>{formatMoney(p.amount)}</b>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toCancel}
        title={t('reports.cancelInvoiceTitle')}
        message={t('reports.cancelInvoiceMsg')}
        confirmLabel={t('reports.cancelWholeInvoice')}
        danger
        onConfirm={() => { if (storeId && toCancel) cancelSale(storeId, toCancel); setToCancel(null); setOpenSale(null); }}
        onCancel={() => setToCancel(null)}
      />
    </div>
  );
}

function Card({ label, value, icon, color, onClick }: { label: string; value: string; icon: string; color?: string; onClick?: () => void }) {
  return (
    <div className="card" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', padding: 12 }}>
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  );
}
