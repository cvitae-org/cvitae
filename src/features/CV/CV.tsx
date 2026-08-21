"use client";

import type { Locale } from '@/libs/i18n/config';
import { CVContent } from "./components/CVContent";
import { MasterCvLocaleProvider } from './contexts/MasterCvLocaleContext';

export const CV = ({ initialLocale }: { initialLocale: Locale }) => {
  return (
    <MasterCvLocaleProvider initialLocale={initialLocale}>
      <CVContent />
    </MasterCvLocaleProvider>
  );
};
