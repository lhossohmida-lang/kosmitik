'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { formatMoney } from '@/lib/branding';
import { startOfDay, endOfDay, fromDateInput, toDateInput, formatDateTime } from '@/lib/dates';
import { subscribeExpenses, addExpense, deleteExpense, type Expense } from '@/lib/expenses';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function ExpensesPage() {
  const { storeId } = useAuth();
  const { t } = useLanguage();
  const [from, setFrom] = useState(toDateInput(Date.now()));
  const [to, setTo] = useState(toDateInput(Date.now()));
  const [items, setItems] = useState<Expense[]>([]);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(toDateInput(Date.now()));
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState<Expense | null>(null);

  useEffect(() => {
    if (!storeId) return;
    return subscribeExpenses(storeId, startOfDay(fromDateInput(from)), endOfDay(fromDateInput(to)), setItems, () => {});
  }, [storeId, from, to]);

  const total = useMemo(() => items.reduce((s, e) => s + e.amount, 0), [items]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const a = Number(amount);
    if (!description.trim()) return setError(t('expenses.descRequired'));
    if (!Number.isFinite(a) || a <= 0) return setError(t('expenses.amountRequired'));
    if (!storeId) return;
    addExpense(storeId, { description: description.trim(), amount: a, note: note.trim(), createdAt: fromDateInput(date) + 12 * 3600 * 1000 });
    setDescription('');
    setAmount('');
    setNote('');
  }

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(280px, 360px) 1fr', alignItems: 'start' }} className="exp-grid">
      <div className="card">
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>{t('expenses.registerTitle')}</h2>
        <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
          <input className="input" placeholder={t('expenses.description')} value={description} onChange={(e) => setDescription(e.target.value)} />
          <input className="input" type="number" placeholder={t('expenses.amount')} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="input" placeholder={t('expenses.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
          <button className="btn" type="submit">{t('common.add')}</button>
        </form>
      </div>

      <div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('reports.from')}</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto' }} />
          <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('reports.to')}</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto' }} />
          <div className="card" style={{ padding: '6px 14px', marginInlineStart: 'auto' }}>
            {t('expenses.total')} <b style={{ color: 'var(--danger)' }}>{formatMoney(total)}</b>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>{t('expenses.noneInPeriod')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {items.map((e) => (
              <div key={e.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}>
                <div>
                  <b>{e.description}</b>
                  {e.note && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> — {e.note}</span>}
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatDateTime(e.createdAt)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <b style={{ color: 'var(--danger)' }}>{formatMoney(e.amount)}</b>
                  <button onClick={() => setToDelete(e)} style={{ border: 'none', background: 'none', color: 'var(--danger)', fontWeight: 800 }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title={t('expenses.deleteTitle')}
        message={t('expenses.deleteConfirm', { name: toDelete?.description ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => { if (storeId && toDelete) deleteExpense(storeId, toDelete.id); setToDelete(null); }}
        onCancel={() => setToDelete(null)}
      />

      <style jsx>{`
        @media (max-width: 780px) {
          .exp-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
