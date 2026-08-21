"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import type { Locale } from '@/libs/i18n/config';
import {
  MASTER_CV_LOCALE_COOKIE,
  MASTER_CV_LOCALE_MAX_AGE
} from '../masterCvLocale';

export { MASTER_CV_LOCALE_COOKIE } from '../masterCvLocale';

type MasterCvLocaleValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const MasterCvLocaleContext = createContext<MasterCvLocaleValue | null>(null);

export function MasterCvLocaleProvider({
  initialLocale,
  children
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    document.cookie = `${MASTER_CV_LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=${MASTER_CV_LOCALE_MAX_AGE}; SameSite=Lax`;
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <MasterCvLocaleContext.Provider value={value}>
      {children}
    </MasterCvLocaleContext.Provider>
  );
}

export const useMasterCvLocale = (): MasterCvLocaleValue => {
  const context = useContext(MasterCvLocaleContext);
  if (!context) {
    throw new Error('useMasterCvLocale must be used within MasterCvLocaleProvider');
  }
  return context;
};

export const useMasterCvLocaleOptional = () => useContext(MasterCvLocaleContext);
