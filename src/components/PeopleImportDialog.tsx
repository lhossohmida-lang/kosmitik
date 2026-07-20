'use client';

import { useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { formatMoney } from '@/lib/branding';
import { readSheet, type SheetData } from '@/lib/sheet';
import { mapPeople, importPeopleBatched, type MapPeopleResult, type PersonKind, type PersonField } from '@/lib/importPeople';
import type { CustomerGroup } from '@/lib/types';
import { useLanguage } from '@/context/LanguageContext';

const FIELD_KEY: Record<string, string> = {
  name: 'peopleImport.field.name',
  phone: 'peopleImport.field.phone',
  address: 'peopleImport.field.address',
  debt: 'peopleImport.field.debt',
  notes: 'peopleImport.field.notes',
  products: 'peopleImport.field.products',
};

export default function PeopleImportDialog({
  open,
  storeId,
  kind,
  existingNames,
  onClose,
  onDone,
}: {
  open: boolean;
  storeId: string;
  kind: PersonKind;
  existingNames: Set<string>;
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const { t } = useLanguage();
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [skipExisting, setSkipExisting] = useState(true);
  const [group, setGroup] = useState<CustomerGroup>('credit');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ written: number; error?: string } | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const who = kind === 'customer' ? t('peopleImport.whoCustomers') : t('peopleImport.whoSuppliers');
  const previewFields: PersonField[] = kind === 'supplier'
    ? ['name', 'phone', 'address', 'debt', 'products', 'notes']
    : ['name', 'phone', 'address', 'debt'];

  const mapped: MapPeopleResult | null = useMemo(() => {
    if (!sheet) return null;
    return mapPeople(sheet, { existingNames: skipExisting ? existingNames : undefined });
  }, [sheet, skipExisting, existingNames]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    setResult(null);
    setFileName(f.name);
    try {
      const data = await readSheet(f);
      if (data.headers.length < 1 || data.rows.length === 0) {
        setError(t('peopleImport.invalidData'));
        setSheet(null);
        return;
      }
      setSheet(data);
    } catch {
      setError(t('peopleImport.readError'));
    }
  }

  async function runImport() {
    if (!mapped || mapped.records.length === 0) return;
    if (!navigator.onLine) {
      setError(t('peopleImport.needsInternet'));
      return;
    }
    setBusy(true);
    setError('');
    setProgress({ done: 0, total: mapped.records.length });
    const res = await importPeopleBatched(storeId, kind, mapped.records, group, (done, total) => setProgress({ done, total }));
    setBusy(false);
    setResult(res);
    if (res.written > 0) onDone(res.written);
  }

  const cols = mapped?.columns ?? {};

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={t('peopleImport.title', { who })} width={620}>
      {!sheet && !result && (
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.9, marginBottom: 14 }}>
            {t('peopleImport.intro', { extra: kind === 'supplier' ? t('peopleImport.introExtraSupplier') : '' })}
          </p>
          {kind === 'supplier' && (
            <div style={{
              fontSize: 12, background: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: 8, padding: '8px 12px', marginBottom: 12, color: '#166534',
            }}>
              💡 {t('peopleImport.supplierHint')}
            </div>
          )}
          <button className="btn" onClick={() => inputRef.current?.click()}>{t('peopleImport.chooseFile')}</button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,text/csv" hidden onChange={onFile} />
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        </div>
      )}

      {sheet && mapped && !result && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>📄 {fileName}</div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {previewFields.map((f) => (
              <span key={f} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: cols[f] != null ? '#dcfce7' : '#f1f5f9', color: cols[f] != null ? '#166534' : 'var(--text-muted)' }}>
                {t(FIELD_KEY[f])}: {cols[f] != null ? (sheet.headers[cols[f]!] ?? '✓') : '—'}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: 14, alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />
              {t('peopleImport.skipExisting')}
            </label>
            {kind === 'customer' && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {t('peopleImport.group')}
                <select className="input" value={group} onChange={(e) => setGroup(e.target.value as CustomerGroup)} style={{ width: 'auto', padding: '4px 8px' }}>
                  <option value="credit">{t('peopleImport.groupCredit')}</option>
                  <option value="deferred">{t('peopleImport.groupDeferred')}</option>
                </select>
              </label>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 8, marginBottom: 12 }}>
            <Stat label={t('peopleImport.willAdd')} value={mapped.stats.ready} tone="var(--success)" big />
            <Stat label={t('peopleImport.withDebt')} value={mapped.stats.withDebt} />
            <Stat label={t('peopleImport.duplicateSkipped')} value={mapped.stats.skippedDup} />
            <Stat label={t('peopleImport.noName')} value={mapped.stats.noName} />
          </div>

          {mapped.records.length > 0 && (
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                    <th style={cell}>{t('peopleImport.col.name')}</th>
                    <th style={cell}>{t('peopleImport.col.phone')}</th>
                    <th style={cell}>{t('peopleImport.col.debt')}</th>
                    {kind === 'supplier' && <th style={{ ...cell, color: '#166534' }}>{t('peopleImport.col.products')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {mapped.records.slice(0, 10).map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                      <td style={{ ...cell, fontWeight: 600 }}>{r.name}</td>
                      <td style={{ ...cell, color: 'var(--text-muted)' }} dir="ltr">{r.phone || '—'}</td>
                      <td style={cell}>{r.balance ? formatMoney(r.balance) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                      {kind === 'supplier' && (
                        <td style={{ ...cell, color: r.products ? '#166534' : 'var(--text-muted)', fontSize: 12, maxWidth: 200, wordBreak: 'break-word', whiteSpace: 'normal' }}>
                          {r.products || '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* تنبيهات */}
          {!cols.name && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{t('peopleImport.nameColMissing')}</div>}
          {kind === 'supplier' && !cols.products && (
            <div style={{
              fontSize: 12, background: '#fef9c3', border: '1px solid #fde047',
              borderRadius: 8, padding: '8px 12px', marginBottom: 10, color: '#78350f',
            }}>
              ⚠️ {t('peopleImport.productsColMissing')}
            </div>
          )}
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

          {busy && progress ? (
            <div>
              <div style={{ height: 10, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((progress.done / progress.total) * 100)}%`, background: 'var(--primary)' }} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 13, marginTop: 6 }}>{t('peopleImport.importing', { done: progress.done, total: progress.total })}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={runImport} disabled={!cols.name || mapped.records.length === 0}>
                {t('peopleImport.importCount', { n: mapped.records.length })}
              </button>
              <button className="btn-outline" onClick={() => { setSheet(null); setFileName(''); }} style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}>{t('peopleImport.anotherFile')}</button>
            </div>
          )}
        </div>
      )}

      {result && (
        <div style={{ textAlign: 'center', padding: 10 }}>
          <div style={{ fontSize: 44 }}>{result.error ? '⚠️' : '✅'}</div>
          <h3 style={{ fontSize: 18, margin: '8px 0' }}>{t('peopleImport.addedCount', { n: result.written })}</h3>
          {result.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{result.error}</p>}
          <button className="btn" onClick={onClose} style={{ marginTop: 12 }}>{t('peopleImport.done')}</button>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: number; tone?: string; big?: boolean }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: big ? 24 : 18, fontWeight: 800, color: tone ?? 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

const cell: React.CSSProperties = { padding: '6px 10px', textAlign: 'right' };
