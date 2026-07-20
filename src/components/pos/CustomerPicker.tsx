'use client';

import { useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import { formatMoney } from '@/lib/branding';
import type { Customer } from '@/lib/types';
import { useLanguage } from '@/context/LanguageContext';

/** اختيار عميل كريدي (F2). العملاء يُدارون بالكامل في الخطوة 6. */
export default function CustomerPicker({
  open,
  customers,
  onSelect,
  onClose,
}: {
  open: boolean;
  customers: Customer[];
  onSelect: (c: Customer) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return customers.filter((c) => !s || c.nameLower.includes(s) || (c.phone ?? '').includes(s));
  }, [customers, q]);

  return (
    <Modal open={open} onClose={onClose} title={t('customerPicker.title')} width={460}>
      <input
        className="input"
        autoFocus
        placeholder={t('customerPicker.searchPlaceholder')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      {customers.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, lineHeight: 1.8 }}>
          {t('customerPicker.noneYet')}
          <br />
          {t('customerPicker.addFromCredits')}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>{t('customerPicker.noResults')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: '#fff',
                textAlign: 'right',
              }}
            >
              <span>
                <b>{c.name}</b>
                {c.phone && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }} dir="ltr">
                    {' '}
                    {c.phone}
                  </span>
                )}
              </span>
              <span style={{ color: c.balance > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700, fontSize: 13 }}>
                {formatMoney(c.balance)}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
