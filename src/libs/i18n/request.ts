import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

type AppLocale = (typeof routing.locales)[number];

const isSupportedLocale = (value: unknown): value is AppLocale =>
  typeof value === 'string' && routing.locales.includes(value as AppLocale);

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!isSupportedLocale(locale)) {
    locale = routing.defaultLocale;
  }

  const messages = (await import(`../../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    timeZone: 'Europe/Warsaw'
  };
});
