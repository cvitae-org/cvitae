"use client";

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { AuditBar, type AuditSection } from '@/components/AuditBar';
import { useCvDocument } from '@/features/CV/hooks/useCvDocument';
import { runResearchAudit, type ResearchAuditCategory } from '../audit';
import type { JobRecord } from '../types';

const categories: ResearchAuditCategory[] = [
  'best-fit',
  'offer-coverage',
  'posting-quality',
  'pipeline'
];

/**
 * The audit for the research stage, scoped to the tab that is open.
 *
 * Tabs partition the table rather than filtering it, so "this tab" is the only
 * scope that means anything — a best match drawn from every offer ever
 * collected would name a row the user is not looking at.
 */
export function ResearchAuditBar({
  records,
  queuedIds,
  tabName
}: {
  records: JobRecord[];
  queuedIds: Set<string>;
  tabName: string;
}) {
  const t = useTranslations('research.audit');
  const { document } = useCvDocument();

  const report = useMemo(
    () => runResearchAudit({ records, cv: document, queuedIds }),
    [records, document, queuedIds]
  );

  const sections: AuditSection[] = categories.map((category) => ({
    key: category,
    // Best fit is the answer to the question the page is actually asking, and
    // it names offers rather than counting them, so it gets the full width.
    span: category === 'best-fit',
    title: t(`categories.${category}`),
    items: report[category].map((item, index) => ({
      key: `${item.code}-${index}`,
      severity: item.severity,
      text: t(`findings.${item.messageKey}`, item.values)
    }))
  }));

  return (
    <AuditBar
      title={t('title', { tab: tabName })}
      sections={sections}
      disclaimer={t('disclaimer')}
    />
  );
}
