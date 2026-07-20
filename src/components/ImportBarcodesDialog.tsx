'use client';

import { useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { parseCsv, detectColumns } from '@/lib/csv';
import { addBarcodeToProduct } from '@/lib/products';
import type { Product } from '@/lib/types';
import { useLanguage } from '@/context/LanguageContext';

/** سجل باركود جاهز للربط بمنتج موجود. */
interface BarcodeMatch {
  productName: string;
  productId: string;
  barcode: string;
  status: 'new' | 'exists' | 'notFound';
}

/** نتيجة تحليل الملف. */
interface AnalysisResult {
  matches: BarcodeMatch[];
  stats: {
    total: number;
    matched: number;
    newBarcodes: number;
    alreadyExists: number;
    notFound: number;
  };
  hasNameCol: boolean;
  hasBarcodeCol: boolean;
}

function analyzeFile(
  csvText: string,
  products: Product[],
): AnalysisResult {
  const parsed = parseCsv(csvText);
  const cols = detectColumns(parsed.headers);
  const hasNameCol = cols.name != null;

  // اكتشاف جميع أعمدة الباركود (مثلاً Barcode1, Barcode2...)
  const barcodeColIndices: number[] = [];
  parsed.headers.forEach((h, i) => {
    const norm = h.toLowerCase().normalize('NFD').replace(/[\s_\-.]/g, '');
    if (
      norm.includes('barcode') ||
      norm.includes('codebarre') ||
      norm.includes('باركود') ||
      norm.includes('ean') ||
      cols.barcode === i
    ) {
      barcodeColIndices.push(i);
    }
  });

  const hasBarcodeCol = barcodeColIndices.length > 0;

  if (!hasNameCol || !hasBarcodeCol) {
    return {
      matches: [],
      stats: { total: 0, matched: 0, newBarcodes: 0, alreadyExists: 0, notFound: 0 },
      hasNameCol,
      hasBarcodeCol,
    };
  }

  // بناء خريطة بالأسماء للبحث السريع
  const nameMap = new Map<string, Product>();
  for (const p of products) {
    nameMap.set(p.nameLower, p);
  }

  // بناء مجموعة كل الباركودات المسجلة
  const allBarcodes = new Set<string>();
  for (const p of products) {
    for (const b of p.barcodes) allBarcodes.add(b.trim());
  }

  const matches: BarcodeMatch[] = [];
  const stats = { total: 0, matched: 0, newBarcodes: 0, alreadyExists: 0, notFound: 0 };

  for (const row of parsed.rows) {
    const name = (row[cols.name!] ?? '').trim();
    if (!name) continue;

    // تجميع الباركودات من كل أعمدة الباركود في هذا الصف
    const rawBarcodes: string[] = [];
    for (const idx of barcodeColIndices) {
      const val = (row[idx] ?? '').trim();
      if (val) rawBarcodes.push(val);
    }

    if (rawBarcodes.length === 0) continue;

    const nameLower = name.toLowerCase();
    const product = nameMap.get(nameLower);

    // تقسيم الخانات التي قد تحتوي عدة باركودات داخلياً
    const barcodes = rawBarcodes
      .flatMap((raw) => raw.split(/[,;|،؛\n\r\t]+/))
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    for (const barcode of barcodes) {
      stats.total++;

      if (!product) {
        stats.notFound++;
        matches.push({ productName: name, productId: '', barcode, status: 'notFound' });
        continue;
      }

      stats.matched++;
      if (allBarcodes.has(barcode)) {
        stats.alreadyExists++;
        matches.push({ productName: product.name, productId: product.id, barcode, status: 'exists' });
      } else {
        stats.newBarcodes++;
        allBarcodes.add(barcode); // لمنع تكرار نفس الباركود في صفوف لاحقة
        matches.push({ productName: product.name, productId: product.id, barcode, status: 'new' });
      }
    }
  }

  return { matches, stats, hasNameCol, hasBarcodeCol };
}

export default function ImportBarcodesDialog({
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
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ written: number } | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const analysis: AnalysisResult | null = useMemo(() => {
    if (!csvText) return null;
    return analyzeFile(csvText, existingProducts);
  }, [csvText, existingProducts]);

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
        setError(t('importBarcodes.invalidCsv'));
        setCsvText('');
        return;
      }
      setCsvText(text);
    } catch {
      setError(t('importBarcodes.readError'));
    }
  }

  async function runImport() {
    if (!analysis) return;
    const toAdd = analysis.matches.filter((m) => m.status === 'new');
    if (toAdd.length === 0) return;

    setBusy(true);
    setError('');
    setProgress({ done: 0, total: toAdd.length });

    let done = 0;
    for (const m of toAdd) {
      addBarcodeToProduct(storeId, m.productId, m.barcode);
      done++;
      setProgress({ done, total: toAdd.length });
      // انتظار صغير كل 50 عملية لتحديث الواجهة
      if (done % 50 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    setBusy(false);
    setResult({ written: done });
    onDone(done);
  }

  const newCount = analysis?.stats.newBarcodes ?? 0;

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={t('importBarcodes.title')} width={640}>
      {/* المرحلة 1: اختيار ملف */}
      {!csvText && !result && (
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.9, marginBottom: 14 }}>
            {t('importBarcodes.intro')}
          </p>
          <button className="btn" onClick={() => inputRef.current?.click()}>{t('importBarcodes.chooseFile')}</button>
          <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        </div>
      )}

      {/* المرحلة 2: معاينة المطابقات */}
      {csvText && analysis && !result && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>📄 {fileName}</div>

          {/* الأعمدة المكتشفة */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {(['name', 'barcode'] as const).map((f) => {
              const detected = f === 'name' ? analysis.hasNameCol : analysis.hasBarcodeCol;
              return (
                <span key={f} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: detected ? '#dcfce7' : '#fef2f2', color: detected ? '#166534' : '#991b1b' }}>
                  {t(`importBarcodes.field.${f}`)}: {detected ? '✓' : '—'}
                </span>
              );
            })}
          </div>

          {/* تحذيرات الأعمدة المفقودة */}
          {!analysis.hasNameCol && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{t('importBarcodes.nameColMissing')}</div>}
          {!analysis.hasBarcodeCol && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{t('importBarcodes.barcodeColMissing')}</div>}

          {/* إحصاءات */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 8, marginBottom: 12 }}>
            <Stat label={t('importBarcodes.newBarcodes')} value={analysis.stats.newBarcodes} tone="var(--success)" big />
            <Stat label={t('importBarcodes.matched')} value={analysis.stats.matched} tone="var(--primary)" />
            <Stat label={t('importBarcodes.alreadyExists')} value={analysis.stats.alreadyExists} />
            <Stat label={t('importBarcodes.notFound')} value={analysis.stats.notFound} tone="var(--danger)" />
          </div>

          {/* جدول معاينة */}
          {analysis.matches.length > 0 && (
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                    <th style={cell}>{t('importBarcodes.col.product')}</th>
                    <th style={cell}>{t('importBarcodes.col.barcode')}</th>
                    <th style={cell}>{t('importBarcodes.col.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.matches.slice(0, 50).map((m, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)', background: m.status === 'new' ? '#f0fdf4' : m.status === 'notFound' ? '#fef2f2' : '#fff' }}>
                      <td style={cell}>{m.productName}</td>
                      <td style={{ ...cell, direction: 'ltr', fontFamily: 'monospace', fontSize: 12 }}>{m.barcode}</td>
                      <td style={{ ...cell, fontSize: 12 }}>
                        {m.status === 'new' ? t('importBarcodes.statusNew') : m.status === 'exists' ? t('importBarcodes.statusExists') : t('importBarcodes.statusNotFound')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

          {busy && progress ? (
            <div>
              <div style={{ height: 10, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((progress.done / progress.total) * 100)}%`, background: 'var(--primary)', transition: 'width .2s' }} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 13, marginTop: 6 }}>{t('importBarcodes.importing', { done: progress.done, total: progress.total })}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={runImport} disabled={newCount === 0 || !analysis.hasNameCol || !analysis.hasBarcodeCol}>
                {newCount > 0 ? t('importBarcodes.importBtn', { n: newCount }) : t('importBarcodes.nothingToImport')}
              </button>
              <button className="btn-outline" onClick={() => { setCsvText(''); setFileName(''); }} style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}>{t('importBarcodes.anotherFile')}</button>
            </div>
          )}
        </div>
      )}

      {/* المرحلة 3: النتيجة */}
      {result && (
        <div style={{ textAlign: 'center', padding: 10 }}>
          <div style={{ fontSize: 44 }}>✅</div>
          <h3 style={{ fontSize: 18, margin: '8px 0' }}>{t('importBarcodes.doneCount', { n: result.written })}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('importBarcodes.doneNote')}</p>
          <button className="btn" onClick={onClose} style={{ marginTop: 12 }}>{t('importBarcodes.done')}</button>
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
