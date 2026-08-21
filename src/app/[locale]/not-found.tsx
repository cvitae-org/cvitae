"use client";

import { useTranslations } from 'next-intl';
import { Link } from '@/libs/i18n/routing';

export default function NotFound() {
  const t = useTranslations('system');

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-gray-900">
          {t('notFoundTitle')}
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {t('notFoundDescription')}
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-lg bg-[#65B7FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#529ED5]"
        >
          {t('backToCv')}
        </Link>
      </div>
    </main>
  );
}
