'use client';

import Modal from './Modal';
import { useLanguage } from '@/context/LanguageContext';

/** نافذة تأكيد بديلة عن window.confirm (الذي يُجمّد WebView). */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const resolvedTitle = title ?? t('confirmDialog.title');
  const resolvedConfirm = confirmLabel ?? t('common.confirm');
  const resolvedCancel = cancelLabel ?? t('common.cancel');
  return (
    <Modal open={open} onClose={onCancel} title={resolvedTitle} width={400}>
      <p style={{ marginBottom: 20, lineHeight: 1.8 }}>{message}</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-start' }}>
        <button
          className="btn"
          onClick={onConfirm}
          style={danger ? { background: 'var(--danger)' } : undefined}
        >
          {resolvedConfirm}
        </button>
        <button
          className="btn-outline"
          onClick={onCancel}
          style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}
        >
          {resolvedCancel}
        </button>
      </div>
    </Modal>
  );
}
