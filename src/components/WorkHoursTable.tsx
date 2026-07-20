'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '@/lib/branding';
import type { Worker, WorkSession } from '@/lib/types';
import { subscribeWorkers, subscribeWorkSessions } from '@/lib/workers';
import { useLanguage } from '@/context/LanguageContext';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** جدول ساعات العمل والأجور لكل عامل ضمن مدّة — يُعرض في التقارير. */
export default function WorkHoursTable({ storeId, from, to }: { storeId: string; from: number; to: number }) {
  const { t } = useLanguage();
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);

  useEffect(() => {
    const u1 = subscribeWorkSessions(storeId, from, to, setSessions, () => {});
    const u2 = subscribeWorkers(storeId, setWorkers, () => {});
    return () => { u1(); u2(); };
  }, [storeId, from, to]);

  const rows = useMemo(() => {
    const agg = new Map<string, { name: string; type: string; hours: number; wage: number }>();
    for (const s of sessions) {
      if (!s.clockOut) continue; // الجلسات المكتملة فقط
      const cur = agg.get(s.workerId) ?? { name: s.workerName, type: s.type, hours: 0, wage: 0 };
      cur.hours += s.hours;
      cur.wage += s.wage;
      agg.set(s.workerId, cur);
    }
    // ضمّ العمّال بلا جلسات (لعرض السلفة والأجر المحدّد).
    for (const w of workers) if (!agg.has(w.id)) agg.set(w.id, { name: w.name, type: w.type, hours: 0, wage: 0 });

    const advanceOf = new Map(workers.map((w) => [w.id, w] as const));
    return Array.from(agg.entries()).map(([id, v]) => {
      const w = advanceOf.get(id);
      return {
        id,
        name: v.name,
        type: v.type,
        hours: round1(v.hours),
        wage: v.type === 'hourly' ? v.wage : (w?.fixedWage ?? 0),
        advance: w?.advance ?? 0,
        hourly: v.type === 'hourly',
      };
    });
  }, [sessions, workers]);

  if (rows.length === 0) return null;

  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: 15, margin: '4px 0 8px' }}>{t('workHours.title')}</h3>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 460 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'right' }}>
              <th style={th}>{t('workHours.worker')}</th>
              <th style={th}>{t('workHours.type')}</th>
              <th style={th}>{t('workHours.hours')}</th>
              <th style={th}>{t('workHours.wage')}</th>
              <th style={th}>{t('workHours.advance')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={td}><b>{r.name}</b></td>
                <td style={{ ...td, color: 'var(--text-muted)', fontSize: 12 }}>{r.hourly ? t('workHours.hourly') : t('workHours.fixed')}</td>
                <td style={td}>{r.hours} {t('workHours.hourAbbr')}</td>
                <td style={{ ...td, fontWeight: 700, color: 'var(--success)' }}>{formatMoney(r.wage)}</td>
                <td style={{ ...td, color: r.advance > 0 ? 'var(--danger)' : 'var(--text)' }}>{formatMoney(r.advance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)' };
const td: React.CSSProperties = { padding: '10px 12px', textAlign: 'right' };
