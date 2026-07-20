'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { formatMoney } from '@/lib/branding';
import { startOfDay, endOfDay } from '@/lib/dates';
import type { Worker, WorkerType, WorkSession } from '@/lib/types';
import {
  subscribeWorkers,
  subscribeWorkSessions,
  saveWorker,
  deleteWorker,
  toggleClock,
  adjustAdvance,
  type WorkerInput,
} from '@/lib/workers';
import { createAndLinkWorkerAccount } from '@/lib/workerAuth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { NAV_ITEMS } from '@/lib/nav';

const round1 = (n: number) => Math.round(n * 10) / 10;

function fmtHours(h: number, hourAbbr: string, minuteAbbr: string): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}${hourAbbr} ${mm}${minuteAbbr}`;
}

export default function WorkersPage() {
  const { storeId } = useAuth();
  const { t } = useLanguage();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [now, setNow] = useState(Date.now());

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [advanceFor, setAdvanceFor] = useState<Worker | null>(null);
  const [accountFor, setAccountFor] = useState<Worker | null>(null);
  const [toDelete, setToDelete] = useState<Worker | null>(null);

  useEffect(() => {
    if (!storeId) return;
    const u1 = subscribeWorkers(storeId, setWorkers, () => {});
    const u2 = subscribeWorkSessions(storeId, startOfDay(Date.now()), endOfDay(Date.now()), setSessions, () => {});
    return () => { u1(); u2(); };
  }, [storeId]);

  // تحديث دوري للساعات الحيّة للعمال الداخلين.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  const todayHours = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) if (s.clockOut) map.set(s.workerId, (map.get(s.workerId) ?? 0) + s.hours);
    return map;
  }, [sessions]);

  function liveHours(w: Worker): number {
    const base = todayHours.get(w.id) ?? 0;
    if (w.active && w.clockInAt) return base + Math.max(0, (now - w.clockInAt) / 3_600_000);
    return base;
  }

  function handleSave(input: WorkerInput, id?: string) {
    if (!storeId) return;
    saveWorker(storeId, input, id);
    setFormOpen(false);
    setEditing(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>{t('workers.title')}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('workers.subtitle')}</p>
        </div>
        <button className="btn" onClick={() => { setEditing(null); setFormOpen(true); }}>{t('workers.newWorker')}</button>
      </div>

      {workers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
          {t('workers.noneYet')}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(250px,1fr))' }}>
          {workers.map((w) => {
            const hrs = liveHours(w);
            return (
              <div key={w.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <b style={{ fontSize: 17 }}>{w.name}</b>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {w.type === 'hourly' ? t('workers.hourlyRate', { n: formatMoney(w.hourlyRate) }) : t('workers.fixedWage', { n: formatMoney(w.fixedWage) })}
                    </div>
                  </div>
                  {w.active && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', background: '#dcfce7', padding: '2px 8px', borderRadius: 999 }}>
                      {t('workers.activeNow')}
                    </span>
                  )}
                </div>

                {/* زر الدخول/الخروج الكبير */}
                <button
                  onClick={() => storeId && toggleClock(storeId, w)}
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius)',
                    border: 'none',
                    fontSize: 18,
                    fontWeight: 800,
                    color: '#fff',
                    background: w.active ? 'var(--danger)' : 'var(--success)',
                  }}
                >
                  {w.active ? t('workers.clockOut') : t('workers.clockIn')}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('workers.todayHours')}</span>
                  <b>{fmtHours(round1(hrs), t('workers.hourAbbr'), t('workers.minuteAbbr'))}</b>
                </div>
                {w.type === 'hourly' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{t('workers.todayWageEstimate')}</span>
                    <b style={{ color: 'var(--success)' }}>{formatMoney(round1(hrs) * w.hourlyRate)}</b>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('workers.advance')}</span>
                  <b style={{ color: w.advance > 0 ? 'var(--danger)' : 'var(--text)' }}>{formatMoney(w.advance)}</b>
                </div>

                {/* حساب دخول العامل (واجهة بيع فقط) */}
                {w.email ? (
                  <div style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }} dir="ltr">
                    🔑 {w.email}
                    <button
                      onClick={() => setAccountFor(w)}
                      title={t('workers.relink')}
                      style={{ border: '1px solid var(--border)', background: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 700, padding: '1px 6px', color: 'var(--primary)', cursor: 'pointer' }}
                    >
                      🔗 {t('workers.relink')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAccountFor(w)}
                    className="btn-outline"
                    style={{ padding: '6px', fontSize: 13, background: 'transparent', border: '1.5px dashed var(--primary)', color: 'var(--primary)', borderRadius: 'var(--radius)' }}
                  >
                    {t('workers.createAccount')}
                  </button>
                )}

                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button className="btn-outline" onClick={() => setAdvanceFor(w)} style={{ flex: 1, padding: '6px', fontSize: 13, background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}>{t('workers.advanceBtn')}</button>
                  <button className="btn-outline" onClick={() => { setEditing(w); setFormOpen(true); }} style={{ flex: 1, padding: '6px', fontSize: 13, background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}>{t('workers.edit')}</button>
                  <button onClick={() => setToDelete(w)} style={{ padding: '6px 10px', fontSize: 13, fontWeight: 700, border: '1.5px solid #fecaca', background: '#fef2f2', color: 'var(--danger)', borderRadius: 'var(--radius)' }}>{t('workers.delete')}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} title={editing ? t('workers.editWorkerTitle') : t('workers.newWorkerTitle')} width={420}>
        <WorkerForm editing={editing} onSubmit={handleSave} onClose={() => { setFormOpen(false); setEditing(null); }} />
      </Modal>

      {advanceFor && storeId && (
        <AdvanceDialog
          worker={advanceFor}
          onClose={() => setAdvanceFor(null)}
          onSubmit={(delta) => { adjustAdvance(storeId, advanceFor.id, delta); setAdvanceFor(null); }}
        />
      )}

      {accountFor && storeId && (
        <AccountDialog
          worker={accountFor}
          onClose={() => setAccountFor(null)}
          onCreate={(email, password) => createAndLinkWorkerAccount(storeId, accountFor.id, accountFor.name, email, password)}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title={t('workers.deleteWorkerTitle')}
        message={t('workers.deleteConfirm', { name: toDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => { if (storeId && toDelete) deleteWorker(storeId, toDelete.id); setToDelete(null); }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function WorkerForm({ editing, onSubmit, onClose }: { editing?: Worker | null; onSubmit: (i: WorkerInput, id?: string) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<WorkerType>(editing?.type ?? 'hourly');
  const [hourlyRate, setHourlyRate] = useState(String(editing?.hourlyRate ?? ''));
  const [fixedWage, setFixedWage] = useState(String(editing?.fixedWage ?? ''));
  const [advance, setAdvance] = useState('');
  const [permissions, setPermissions] = useState<string[]>(editing?.permissions || []);
  const [error, setError] = useState('');

  const isAdmin = permissions.includes('*');

  function togglePermission(href: string) {
    if (isAdmin) return;
    setPermissions((prev) => (prev.includes(href) ? prev.filter((p) => p !== href) : [...prev, href]));
  }

  const label: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t('workers.form.nameRequired'));
    onSubmit(
      {
        name: name.trim(),
        type,
        hourlyRate: Number(hourlyRate) || 0,
        fixedWage: Number(fixedWage) || 0,
        ...(editing ? {} : { advance: Number(advance) || 0 }),
        permissions,
      },
      editing?.id,
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <div>
        <label style={label}>{t('workers.form.name')}</label>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div>
        <label style={label}>{t('workers.form.wageType')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['hourly', t('workers.form.hourly')], ['fixed', t('workers.form.fixed')]] as const).map(([v, label2]) => (
            <button
              type="button"
              key={v}
              onClick={() => setType(v)}
              style={{
                flex: 1, padding: 10, borderRadius: 'var(--radius)',
                border: `1.5px solid ${type === v ? 'var(--primary)' : 'var(--border)'}`,
                background: type === v ? 'rgba(15,118,110,0.08)' : '#fff',
                fontWeight: 700, color: type === v ? 'var(--primary)' : 'var(--text)',
              }}
            >
              {label2}
            </button>
          ))}
        </div>
      </div>

      {type === 'hourly' ? (
        <div>
          <label style={label}>{t('workers.form.hourlyRate')}</label>
          <input className="input" type="number" min={0} value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
        </div>
      ) : (
        <div>
          <label style={label}>{t('workers.form.fixedWage')}</label>
          <input className="input" type="number" min={0} value={fixedWage} onChange={(e) => setFixedWage(e.target.value)} />
        </div>
      )}

      {!editing && (
        <div>
          <label style={label}>{t('workers.form.openingAdvance')}</label>
          <input className="input" type="number" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0" />
        </div>
      )}

      <div>
        <label style={label}>الصلاحيات الخانات الإضافية</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setPermissions(e.target.checked ? ['*'] : [])}
          />
          <span style={{ fontSize: 14, fontWeight: 700 }}>الكل (صلاحيات مدير كاملة)</span>
        </div>
        {!isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: 'var(--surface)', padding: 10, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            {NAV_ITEMS.map((item) => {
              if (item.href === '/pos') return null; // POS is always allowed
              return (
                <label key={item.href} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={permissions.includes(item.href)}
                    onChange={() => togglePermission(item.href)}
                  />
                  <span>{item.icon} {t(item.labelKey)}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" type="submit">{editing ? t('common.save') : t('common.add')}</button>
        <button type="button" className="btn-outline" onClick={onClose} style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}>{t('common.cancel')}</button>
      </div>
    </form>
  );
}

function AdvanceDialog({ worker, onSubmit, onClose }: { worker: Worker; onSubmit: (delta: number) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  function go(sign: 1 | -1) {
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return setError(t('workers.amountRequired'));
    onSubmit(sign * a);
  }

  return (
    <Modal open onClose={onClose} title={t('workers.advanceTitle', { name: worker.name })} width={360}>
      <div style={{ marginBottom: 10, fontSize: 14 }}>
        {t('workers.currentAdvance')} <b style={{ color: 'var(--danger)' }}>{formatMoney(worker.advance)}</b>
      </div>
      <input className="input" type="number" autoFocus placeholder={t('workers.amountPlaceholder')} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ marginBottom: 10 }} />
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" onClick={() => go(1)} style={{ background: 'var(--danger)' }}>{t('workers.addAdvance')}</button>
        <button className="btn" onClick={() => go(-1)} style={{ background: 'var(--success)' }}>{t('workers.settleAdvance')}</button>
      </div>
    </Modal>
  );
}

function AccountDialog({ worker, onCreate, onClose }: { worker: Worker; onCreate: (email: string, password: string) => Promise<void>; onClose: () => void }) {
  const { t } = useLanguage();
  const [email, setEmail] = useState(worker.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !email.includes('@')) return setError(t('workers.form.emailInvalid'));
    if (password.length < 6) return setError(t('workers.form.passwordShort'));
    // إنشاء حساب Firebase عملية شبكة إجبارية — لا تعمل بلا إنترنت. نمنع التعليق الصامت.
    if (typeof navigator !== 'undefined' && !navigator.onLine) return setError(t('workers.error.offline'));
    setBusy(true);
    try {
      // مهلة أمان: لا نترك الزر معلّقاً على «جارٍ الإنشاء…» إلى الأبد عند بطء/انقطاع الشبكة.
      await Promise.race([
        onCreate(email.trim(), password),
        new Promise((_, reject) => setTimeout(() => reject({ code: 'timeout' }), 30000)),
      ]);
      setDone(true);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      setError(
        code === 'auth/email-already-in-use' ? t('workers.error.emailInUse')
          : code === 'auth/invalid-email' ? t('workers.error.invalidEmail')
          : code === 'auth/weak-password' ? t('workers.error.weakPassword')
          : code === 'auth/wrong-password' || code === 'auth/invalid-credential' ? t('workers.error.relinkWrongPassword')
          : code === 'auth/network-request-failed' || code === 'timeout' ? t('workers.error.offline')
          : code === 'auth/operation-not-allowed' ? t('workers.error.notAllowed')
          : code === 'quota-exceeded' || code === 'resource-exhausted' ? t('workers.error.quota')
          : code === 'not-persisted' ? t('workers.error.notPersisted')
          : t('workers.error.generic'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('workers.accountTitle', { name: worker.name })} width={400}>
      {done ? (
        <div style={{ textAlign: 'center', padding: 8 }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <p style={{ lineHeight: 1.9, fontSize: 14 }}>
            {t('workers.accountCreated')}<br />
            {t('workers.accountCreatedDetail')}
          </p>
          <button className="btn" onClick={onClose} style={{ marginTop: 8 }}>{t('workers.done')}</button>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
            {t('workers.accountScopeNote')}
          </p>
          <input className="input" type="email" placeholder={t('workers.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" style={{ textAlign: 'right' }} autoFocus />
          <input className="input" type="password" placeholder={t('workers.passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" style={{ textAlign: 'right' }} />
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
          <button className="btn" type="submit" disabled={busy}>{busy ? t('workers.creating') : t('workers.createAccountBtn')}</button>
        </form>
      )}
    </Modal>
  );
}
