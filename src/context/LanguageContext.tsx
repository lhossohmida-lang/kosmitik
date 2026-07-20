'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { translate, type Lang } from '@/lib/i18n';

type LanguageState = {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const STORAGE_KEY = 'kosmitik.lang';
const LanguageContext = createContext<LanguageState | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ar');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ar' || saved === 'fr') {
      setLangState(saved);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang, isLoaded]);

  const value: LanguageState = {
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    setLang: setLangState,
    t: (key, vars) => translate(lang, key, vars),
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageState {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage يجب استخدامه داخل <LanguageProvider>');
  return ctx;
}
