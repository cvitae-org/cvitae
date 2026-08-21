import { CV } from "@/features/CV";
import { cookies } from 'next/headers';
import { locales, type Locale } from '@/libs/i18n/config';
import { MASTER_CV_LOCALE_COOKIE } from '@/features/CV/masterCvLocale';

const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (locales as readonly string[]).includes(value);

export default async function HomePage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const [{ locale: routeLocale }, cookieStore] = await Promise.all([
    params,
    cookies()
  ]);
  const savedLocale = cookieStore.get(MASTER_CV_LOCALE_COOKIE)?.value;
  const initialLocale = isLocale(savedLocale)
    ? savedLocale
    : isLocale(routeLocale)
      ? routeLocale
      : 'en';

  return <CV initialLocale={initialLocale} />;
}
