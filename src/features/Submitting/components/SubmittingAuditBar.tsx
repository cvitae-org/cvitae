"use client";

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { AuditBar, type AuditSection } from '@/components/AuditBar';
import { runSubmittingAudit, type SubmittingAuditCategory } from '../audit';
import type { Submission } from '../types';

const categories: SubmittingAuditCategory[] = [
  'awaiting-reply',
  'ready-to-send',
  'blocked',
  'queue-health'
];

/** The audit for the submitting stage: what is waiting, and on whom. */
export function SubmittingAuditBar({
  submissions
}: {
  submissions: Submission[];
}) {
  const t = useTranslations('submitting.audit');

  const report = useMemo(
    () => runSubmittingAudit({ submissions }),
    [submissions]
  );

  const sections: AuditSection[] = categories.map((category) => ({
    key: category,
    // The silence is the finding nobody else will surface, so it is the one
    // that gets room to name names.
    span: category === 'awaiting-reply',
    title: t(`categories.${category}`),
    items: report[category].map((item, index) => ({
      key: `${item.code}-${index}`,
      severity: item.severity,
      text: t(`findings.${item.messageKey}`, item.values)
    }))
  }));

  return (
    <AuditBar
      title={t('title')}
      sections={sections}
      disclaimer={t('disclaimer')}
    />
  );
}
