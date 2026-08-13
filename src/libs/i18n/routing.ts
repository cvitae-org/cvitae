import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
  locales: ['en', 'pl'],
  defaultLocale: 'en',
  // 'as-needed' keeps the default locale on the bare home path ("/"),
  // and prefixes the others ("/pl").
  localePrefix: 'as-needed'
});

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
