// Tiny i18n: typed message catalogs, a React context, and t(key, vars).
// shortcut: no plural rules / ICU; strings use {var} interpolation only. Swap in i18next if a third
// language or plural-heavy copy shows up.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en } from './en';
import { id } from './id';

export type Lang = 'en' | 'id';
export type MessageKey = keyof typeof en;

// The Indonesian catalog must have exactly the same keys as English (enforced by the type below).
const CATALOGS: Record<Lang, Record<MessageKey, string>> = { en, id };
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'id', label: 'Bahasa Indonesia' }
];

const KEY = 'vps_hub_lang';
const detect = (): Lang => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'id') return saved;
  } catch { /* private mode */ }
  return typeof navigator !== 'undefined' && /^id\b|^in\b/i.test(navigator.language) ? 'id' : 'en';
};

export type Vars = Record<string, string | number>;

export function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  return format(CATALOGS[lang][key] ?? CATALOGS.en[key] ?? key, vars);
}

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Locale for Intl / toLocaleString. */
  locale: string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detect);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* private mode */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo<I18nCtx>(
    () => ({ lang, setLang, t: (k, v) => translate(lang, k, v), locale: lang === 'id' ? 'id-ID' : 'en-US' }),
    [lang, setLang]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside <I18nProvider>');
  return v;
}

/** Shorthand when only t() is needed. */
export const useT = () => useI18n().t;
