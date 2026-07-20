'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { branding, formatMoney } from '@/lib/branding';
import { formatDateTime } from '@/lib/dates';
import { printHtml } from '@/lib/print';
import type { Customer, CustomerGroup } from '@/lib/types';
import {
  saveCustomer,
  deleteCustomer,
  addDebt,
  recordPayment,
  subscribeCustomerTxns,
  CUSTOMER_GROUPS,
  type CustomerInput,
  type CreditTxn,
} from '@/lib/customers';
import { useCustomers } from '@/lib/customerStore';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import CustomerForm from '@/components/credits/CustomerForm';
import PeopleImportDialog from '@/components/PeopleImportDialog';

export default function CreditsPage() {
  const { storeId } = useAuth();
  const { t } = useLanguage();
  const [group, setGroup] = useState<CustomerGroup>('credit');
  const customers = useCustomers(storeId);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [amountModal, setAmountModal] = useState<'debt' | 'payment' | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const existingNames = useMemo(() => new Set(customers.map((c) => c.nameLower)), [customers]);

  // مزامنة العميل المحدّد مع أحدث نسخة (لتحديث الرصيد فوراً).
  const selectedLive = useMemo(
    () => (selected ? customers.find((c) => c.id === selected.id) ?? selected : null),
    [selected, customers],
  );

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return customers
      .filter((c) => c.group === group)
      .filter((c) => !s || c.nameLower.includes(s) || (c.phone ?? '').includes(s));
  }, [customers, group, search]);

  const totalDebt = useMemo(
    () => list.reduce((sum, c) => sum + Math.max(0, c.balance), 0),
    [list],
  );

  function handleSave(input: CustomerInput, id?: string) {
    if (!storeId) return;
    saveCustomer(storeId, input, id);
    setFormOpen(false);
    setEditing(null);
  }

  return (
    <div>
      {/* تبويبات المجموعة */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {CUSTOMER_GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setGroup(g.key)}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius)',
              border: `1.5px solid ${group === g.key ? 'var(--primary)' : 'var(--border)'}`,
              background: group === g.key ? 'var(--primary)' : '#fff',
              color: group === g.key ? '#fff' : 'var(--text)',
              fontWeight: 700,
            }}
          >
            {t(g.labelKey)}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 180 }}
          placeholder={t('credits.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="card" style={{ padding: '8px 14px' }}>
          {t('credits.totalDebts')} <b style={{ color: 'var(--danger)' }}>{formatMoney(totalDebt)}</b>
        </div>
        <button className="btn-outline" onClick={() => setImportOpen(true)} title={t('credits.importTitle')}>{t('credits.import')}</button>
        <button className="btn" onClick={() => { setEditing(null); setFormOpen(true); }}>
          {t('credits.newCustomer')}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
          {t('credits.noneInGroup')}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))' }}>
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className="card"
              style={{ textAlign: 'right', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: 16 }}>{c.name}</b>
                <span style={{ color: c.balance > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 800 }}>
                  {formatMoney(c.balance)}
                </span>
              </div>
              {c.phone && <span style={{ fontSize: 12, color: 'var(--text-muted)' }} dir="ltr">{c.phone}</span>}
            </button>
          ))}
        </div>
      )}

      {/* نموذج إضافة/تعديل */}
      <Modal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} title={editing ? t('credits.editCustomer') : t('credits.newCustomerTitle')} width={480}>
        <CustomerForm editing={editing} group={group} onSubmit={handleSave} onClose={() => { setFormOpen(false); setEditing(null); }} />
      </Modal>

      {/* بطاقة تفاصيل العميل */}
      {selectedLive && storeId && (
        <CustomerDetail
          storeId={storeId}
          customer={selectedLive}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selectedLive); setFormOpen(true); }}
          onDelete={() => setToDelete(selectedLive)}
          onAddDebt={() => setAmountModal('debt')}
          onPay={() => setAmountModal('payment')}
        />
      )}

      {/* نافذة مبلغ (دين/دفعة) — تظهر فوق بطاقة التفاصيل */}
      {amountModal && selectedLive && storeId && (
        <AmountDialog
          kind={amountModal}
          onClose={() => setAmountModal(null)}
          onConfirm={(amount, note) => {
            if (amountModal === 'debt') addDebt(storeId, selectedLive.id, amount, note);
            else recordPayment(storeId, selectedLive.id, amount, note);
            setAmountModal(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title={t('credits.deleteCustomerTitle')}
        message={t('credits.deleteCustomerConfirm', { name: toDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => { if (storeId && toDelete) deleteCustomer(storeId, toDelete.id); setToDelete(null); setSelected(null); }}
        onCancel={() => setToDelete(null)}
      />

      {storeId && (
        <PeopleImportDialog
          open={importOpen}
          storeId={storeId}
          kind="customer"
          existingNames={existingNames}
          onClose={() => setImportOpen(false)}
          onDone={() => {}}
        />
      )}
    </div>
  );
}

function CustomerDetail({
  storeId,
  customer,
  onClose,
  onEdit,
  onDelete,
  onAddDebt,
  onPay,
}: {
  storeId: string;
  customer: Customer;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddDebt: () => void;
  onPay: () => void;
}) {
  const { t, lang } = useLanguage();
  const TXN_LABEL: Record<CreditTxn['type'], string> = {
    purchase: t('credits.txn.purchase'),
    debt: t('credits.txn.debt'),
    payment: t('credits.txn.payment'),
    adjust: t('credits.txn.adjust'),
  };
  const [txns, setTxns] = useState<CreditTxn[]>([]);
  useEffect(() => subscribeCustomerTxns(storeId, customer.id, setTxns), [storeId, customer.id]);

  function printStatement() {
    const dir: 'rtl' | 'ltr' = lang === 'ar' ? 'rtl' : 'ltr';
    const align = dir === 'rtl' ? 'right' : 'left';
    const rows = txns
      .map(
        (tx) =>
          `<tr><td>${formatDateTime(tx.createdAt)}</td><td>${TXN_LABEL[tx.type]}</td><td style="text-align:left">${tx.amount.toFixed(2)}</td></tr>`,
      )
      .join('');
    printHtml(`<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8">
      <style>body{font-family:'Segoe UI',Tahoma,sans-serif;padding:16px;color:#000}
      h2,h3{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
      td,th{border-bottom:1px solid #ccc;padding:6px;text-align:${align}}</style></head><body>
      <h2>${branding.storeName}</h2><h3>${t('credits.statementTitle', { name: customer.name })}</h3>
      <div>${t('credits.currentBalance')}: <b>${formatMoney(customer.balance)}</b></div>
      <table><thead><tr><th>${t('credits.date')}</th><th>${t('credits.type')}</th><th>${t('credits.amount')}</th></tr></thead><tbody>${rows}</tbody></table>
      </body></html>`);
  }

  return (
    <Modal open onClose={onClose} title={customer.name} width={520}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('credits.currentBalance')}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: customer.balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {formatMoney(customer.balance)}
          </div>
        </div>
        {customer.phone && <div dir="ltr" style={{ color: 'var(--text-muted)' }}>{customer.phone}</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="btn" onClick={onPay} style={{ background: 'var(--success)' }}>{t('credits.recordPayment')}</button>
        <button className="btn" onClick={onAddDebt} style={{ background: 'var(--danger)' }}>{t('credits.addDebt')}</button>
        <button className="btn-outline" onClick={printStatement} style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}>{t('credits.printStatement')}</button>
        <button className="btn-outline" onClick={onEdit} style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}>{t('common.edit')}</button>
        <button onClick={onDelete} style={{ marginInlineStart: 'auto', border: 'none', background: 'none', color: 'var(--danger)', fontWeight: 700 }}>{t('common.delete')}</button>
      </div>

      <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('credits.txnLog')}</div>
      <div style={{ display: 'grid', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
        {txns.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>{t('credits.noTxnsYet')}</div>
        ) : (
          txns.map((tx) => (
            <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
              <span>
                <b style={{ color: tx.type === 'payment' ? 'var(--success)' : 'var(--danger)' }}>{TXN_LABEL[tx.type]}</b>
                {tx.note ? <span style={{ color: 'var(--text-muted)' }}> — {tx.note}</span> : null}
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatDateTime(tx.createdAt)}</div>
              </span>
              <b>{formatMoney(tx.amount)}</b>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

function AmountDialog({
  kind,
  onConfirm,
  onClose,
}: {
  kind: 'debt' | 'payment';
  onConfirm: (amount: number, note: string) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const isPay = kind === 'payment';

  return (
    <Modal open onClose={onClose} title={isPay ? t('credits.recordPayment') : t('credits.addDebt')} width={360}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const a = Number(amount);
          if (!Number.isFinite(a) || a <= 0) return setError(t('credits.amountRequired'));
          onConfirm(a, note.trim());
        }}
        style={{ display: 'grid', gap: 12 }}
      >
        <input className="input" type="number" min={1} autoFocus placeholder={t('credits.amountPlaceholder')} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="input" placeholder={t('credits.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        <button className="btn" type="submit" style={{ background: isPay ? 'var(--success)' : 'var(--danger)' }}>
          {isPay ? t('credits.confirmPayment') : t('credits.confirmDebt')}
        </button>
      </form>
    </Modal>
  );
}
