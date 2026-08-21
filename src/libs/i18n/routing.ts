import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
import { defaultLocale, locales } from './config';

export const routing = defineRouting({
  locales,
  defaultLocale,
  // 'as-needed' keeps the default locale on the bare home path ("/"),
  // and prefixes the others ("/pl").
  localePrefix: 'as-needed',
  localeDetection: true
});

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
