'use client';

import { useLanguage } from '@/context/LanguageContext';

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useLanguage();

  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'ar' ? 'fr' : 'ar')}
      className="no-select"
      title={lang === 'ar' ? 'Passer en français' : 'التبديل إلى العربية'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: compact ? '4px 8px' : '6px 12px',
        borderRadius: 999,
        border: '1.5px solid var(--border)',
        background: 'transparent',
        fontSize: compact ? 11 : 13,
        fontWeight: 700,
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      🌐 {lang === 'ar' ? 'FR' : 'AR'}
    </button>
  );
}
