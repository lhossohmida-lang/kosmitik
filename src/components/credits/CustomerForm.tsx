'use client';

import { useState } from 'react';
import type { Customer, CustomerGroup } from '@/lib/types';
import type { CustomerInput } from '@/lib/customers';
import { useLanguage } from '@/context/LanguageContext';

export default function CustomerForm({
  editing,
  group,
  onSubmit,
  onClose,
}: {
  editing?: Customer | null;
  group: CustomerGroup;
  onSubmit: (input: CustomerInput, id?: string) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(editing?.name ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [creditLimit, setCreditLimit] = useState(String(editing?.creditLimit ?? ''));
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? '');
  const [opening, setOpening] = useState('');
  const [error, setError] = useState('');

  const label: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t('credits.form.nameRequired'));
    onSubmit(
      {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        creditLimit: Number(creditLimit) || 0,
        dueDate: dueDate || null,
        group,
        ...(editing ? {} : { balance: Number(opening) || 0 }),
      },
      editing?.id,
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <div>
        <label style={label}>{t('credits.form.name')}</label>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <label style={label}>{t('credits.form.phone')}</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" style={{ textAlign: 'right' }} />
        </div>
        <div>
          <label style={label}>{t('credits.form.creditLimit')}</label>
          <input className="input" type="number" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
        </div>
      </div>
      <div>
        <label style={label}>{t('credits.form.address')}</label>
        <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <label style={label}>{t('credits.form.dueDate')}</label>
          <input className="input" type="date" value={dueDate ?? ''} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        {!editing && (
          <div>
            <label style={label}>{t('credits.form.opening')}</label>
            <input className="input" type="number" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" />
          </div>
        )}
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" type="submit">{editing ? t('common.save') : t('credits.form.addCustomer')}</button>
        <button type="button" className="btn-outline" onClick={onClose} style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
