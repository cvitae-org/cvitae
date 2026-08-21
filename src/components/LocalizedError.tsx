"use client";

import { useTranslations } from 'next-intl';
import type { ErrorDescriptor } from '@/libs/i18n/errors';

type LocalizedErrorProps = {
  error: ErrorDescriptor;
  className?: string;
  detailClassName?: string;
};

/**
 * Keeps raw provider/server diagnostics available without making them the
 * interface copy. The summary always comes from the active message catalog.
 */
export function LocalizedError({
  error,
  className,
  detailClassName
}: LocalizedErrorProps) {
  const errors = useTranslations('errors');
  const common = useTranslations('common');

  return (
    <div className={className}>
      <p>{errors(error.code, error.values)}</p>
      {error.detail && (
        <details className={detailClassName ?? 'mt-1 text-xs opacity-80'}>
          <summary className="cursor-pointer select-none">
            {common('technicalDetails')}
          </summary>
          <p className="mt-1 break-words font-mono text-[11px] leading-relaxed">
            {error.detail}
          </p>
        </details>
      )}
    </div>
  );
}
