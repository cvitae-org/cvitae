"use client";

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('system');
  const common = useTranslations('common');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-gray-900">
          {t('errorTitle')}
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {t('errorDescription')}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-[#65B7FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#529ED5]"
        >
          {t('tryAgain')}
        </button>
        {(error.digest || error.message) && (
          <details className="mt-4 text-left text-xs text-gray-500">
            <summary className="cursor-pointer text-center">
              {common('technicalDetails')}
            </summary>
            <p className="mt-2 break-words font-mono">
              {error.digest || error.message}
            </p>
          </details>
        )}
      </div>
    </main>
  );
}
