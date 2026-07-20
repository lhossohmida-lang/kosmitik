'use client';

import { useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { formatMoney } from '@/lib/branding';
import type { Product } from '@/lib/types';
import {
  parseCsv,
  mapRows,
  mapSync,
  importProductsBatched,
  importSyncBatched,
  type MapResult,
  type SyncResult,
} from '@/lib/importProducts';
import { useLanguage } from '@/context/LanguageContext';

type ImportMode = 'new' | 'sync';

const FIELD_KEY: Record<string, string> = {
  name: 'importProducts.field.name',
  sellPrice: 'importProducts.field.sellPrice',
  cost: 'importProducts.field.cost',
  stock: 'importProducts.field.stock',
  minStock: 'importProducts.field.minStock',
  barcode: 'importProducts.field.barcode',
  category: 'importProducts.field.category',
  unit: 'importProducts.field.unit',
  inactive: 'importProducts.field.inactive',
};

export default function ImportProductsDialog({
  open,
  storeId,
  existingProducts,
  onClose,
  onDone,
}: {
  open: boolean;
  storeId: string;
  existingProducts: Product[];
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<ImportMode>('new');
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [skipInactive, setSkipInactive] = useState(true);
  const [skipExisting, setSkipExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ written?: number; updated?: number; created?: number; error?: string } | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const existing = useMemo(() => {
    const names = new Set(existingProducts.map((p) => p.nameLower));
    const bcs = new Set(existingProducts.flatMap((p) => p.barcodes));
    return { names, bcs };
  }, [existingProducts]);

  const mapped: MapResult | null = useMemo(() => {
    if (!csvText || mode !== 'new') return null;
    const parsed = parseCsv(csvText);
    return mapRows(parsed, {
      skipInactive,
      existingNames: skipExisting ? existing.names : undefined,
      existingBarcodes: skipExisting ? existing.bcs : undefined,
    });
  }, [csvText, skipInactive, skipExisting, existing, mode]);

  const synced: SyncResult | null = useMemo(() => {
    if (!csvText || mode !== 'sync') return null;
    return mapSync(parseCsv(csvText), existingProducts, { skipInactive });
  }, [csvText, existingProducts, skipInactive, mode]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    setResult(null);
    setFileName(f.name);
    try {
      const text = await f.text();
      const parsed = parseCsv(text);
      if (parsed.headers.length < 2 || parsed.rows.length === 0) {
        setError(t('importProducts.invalidCsv'));
        setCsvText('');
        return;
      }
      setHeaders(parsed.headers);
      setCsvText(text);
    } catch {
      setError(t('importProducts.readError'));
    }
  }

  async function runImport() {
    if (!navigator.onLine) {
      setError(t('importProducts.needsInternet'));
      return;
    }
    setError('');

    if (mode === 'new') {
      if (!mapped || mapped.products.length === 0) return;
      setBusy(true);
      setProgress({ done: 0, total: mapped.products.length });
      const res = await importProductsBatched(storeId, mapped.products, (done, total) => setProgress({ done, total }));
      setBusy(false);
      setResult(res);
      if (res.written > 0) onDone(res.written);
    } else {
      if (!synced || (synced.updates.length === 0 && synced.creates.length === 0)) return;
      const total = synced.updates.length + synced.creates.length;
      setBusy(true);
      setProgress({ done: 0, total });
      const res = await importSyncBatched(storeId, synced.updates, synced.creates, (done, tot) => setProgress({ done, total: tot }));
      setBusy(false);
      setResult(res);
      if ((res.updated ?? 0) + (res.created ?? 0) > 0) onDone((res.updated ?? 0) + (res.created ?? 0));
    }
  }

  const cols = (mode === 'new' ? mapped?.columns : synced?.columns) ?? {};

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={t('importProducts.title')} width={640}>
      {!csvText && !result && (
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.9, marginBottom: 14 }}>
            {t('importProducts.intro')}
          </p>
          <button className="btn" onClick={() => inputRef.current?.click()}>{t('importProducts.chooseFile')}</button>
          <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        </div>
      )}

      {csvText && !result && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>📄 {fileName}</div>

          {/* اختيار الوضع: إضافة جديد فقط / مزامنة الكميات */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {(['new', 'sync'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  flex: 1,
                  padding: '9px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 700,
                  border: `1.5px solid ${mode === m ? 'var(--primary)' : 'var(--border)'}`,
                  background: mode === m ? 'rgba(10,132,255,0.10)' : 'transparent',
                  color: mode === m ? 'var(--primary)' : 'var(--text)',
                }}
              >
                {t(m === 'new' ? 'importProducts.mode.new' : 'importProducts.mode.sync')}
              </button>
            ))}
          </div>
          {mode === 'sync' && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.7 }}>{t('importProducts.syncHint')}</div>
          )}

          {/* الأعمدة المكتشفة */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {(['name', 'sellPrice', 'cost', 'stock', 'minStock', 'barcode', 'category', 'unit', 'inactive'] as const).map((f) => (
              <span key={f} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: cols[f] != null ? '#dcfce7' : '#f1f5f9', color: cols[f] != null ? '#166534' : 'var(--text-muted)' }}>
                {t(FIELD_KEY[f])}: {cols[f] != null ? (headers[cols[f]!] ?? '✓') : '—'}
              </span>
            ))}
          </div>

          {/* خيارات */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: 14 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={skipInactive} onChange={(e) => setSkipInactive(e.target.checked)} />
              {t('importProducts.skipInactive')}
            </label>
            {mode === 'new' && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />
                {t('importProducts.skipExisting')}
              </label>
            )}
          </div>

          {/* إحصاءات + عيّنة حسب الوضع */}
          {mode === 'new' && mapped && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 8, marginBottom: 12 }}>
                <Stat label={t('importProducts.willAdd')} value={mapped.stats.ready} tone="var(--success)" big />
                <Stat label={t('importProducts.inactiveSkipped')} value={mapped.stats.skippedInactive} />
                <Stat label={t('importProducts.duplicateSkipped')} value={mapped.stats.skippedDuplicate} />
                <Stat label={t('importProducts.noPrice')} value={mapped.stats.noPrice} />
              </div>
              {mapped.products.length > 0 && (
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
                  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: '#f8fafc' }}><th style={cell}>{t('importProducts.col.name')}</th><th style={cell}>{t('importProducts.col.category')}</th><th style={cell}>{t('importProducts.col.stock')}</th><th style={cell}>{t('importProducts.col.sell')}</th></tr></thead>
                    <tbody>
                      {mapped.products.slice(0, 6).map((p, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={cell}>{p.name}</td>
                          <td style={{ ...cell, color: 'var(--text-muted)' }}>{p.category}</td>
                          <td style={cell}>{p.stock}</td>
                          <td style={cell}>{formatMoney(p.unitSellPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {mode === 'sync' && synced && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: 8, marginBottom: 12 }}>
                <Stat label={t('importProducts.willUpdate')} value={synced.stats.toUpdate} tone="var(--primary)" big />
                <Stat label={t('importProducts.willCreate')} value={synced.stats.toCreate} tone="var(--success)" big />
              </div>
              {(synced.updates.length + synced.creates.length) > 0 && (
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
                  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: '#f8fafc' }}><th style={cell}>{t('importProducts.col.name')}</th><th style={cell}>{t('importProducts.col.action')}</th><th style={cell}>{t('importProducts.col.newStock')}</th></tr></thead>
                    <tbody>
                      {synced.updates.slice(0, 5).map((u, i) => (
                        <tr key={'u' + i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={cell}>{u.name}</td>
                          <td style={{ ...cell, color: 'var(--primary)', fontWeight: 700 }}>{t('importProducts.action.update')}</td>
                          <td style={cell}>{u.fields.stock ?? '—'}</td>
                        </tr>
                      ))}
                      {synced.creates.slice(0, 5).map((p, i) => (
                        <tr key={'c' + i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={cell}>{p.name}</td>
                          <td style={{ ...cell, color: 'var(--success)', fontWeight: 700 }}>{t('importProducts.action.create')}</td>
                          <td style={cell}>{p.stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {!cols.name && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{t('importProducts.nameColMissing')}</div>}
          {mode === 'sync' && cols.name && cols.stock == null && (
            <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{t('importProducts.needStockCol')}</div>
          )}
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

          {busy && progress ? (
            <div>
              <div style={{ height: 10, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`, background: 'var(--primary)', transition: 'width .2s' }} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 13, marginTop: 6 }}>{t('importProducts.importing', { done: progress.done, total: progress.total })}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              {mode === 'new' ? (
                <button className="btn" onClick={runImport} disabled={!cols.name || !mapped || mapped.products.length === 0}>
                  {t('importProducts.importCount', { n: mapped?.products.length ?? 0 })}
                </button>
              ) : (
                <button className="btn" onClick={runImport} disabled={!cols.name || cols.stock == null || !synced || (synced.updates.length + synced.creates.length) === 0}>
                  {t('importProducts.runSync', { u: synced?.updates.length ?? 0, c: synced?.creates.length ?? 0 })}
                </button>
              )}
              <button className="btn-outline" onClick={() => { setCsvText(''); setFileName(''); }} style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}>{t('importProducts.anotherFile')}</button>
            </div>
          )}
        </div>
      )}

      {result && (
        <div style={{ textAlign: 'center', padding: 10 }}>
          <div style={{ fontSize: 44 }}>{result.error ? '⚠️' : '✅'}</div>
          <h3 style={{ fontSize: 18, margin: '8px 0' }}>
            {result.written != null
              ? t('importProducts.addedCount', { n: result.written })
              : t('importProducts.syncDone', { u: result.updated ?? 0, c: result.created ?? 0 })}
          </h3>
          {result.error && <p style={{ color: 'var(--danger)', fontSize: 13, lineHeight: 1.8 }}>{result.error}</p>}
          {!result.error && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('importProducts.appearedNote')}</p>}
          <button className="btn" onClick={onClose} style={{ marginTop: 12 }}>{t('importProducts.done')}</button>
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
