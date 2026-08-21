"use client";

import { useCallback, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ImportSummary } from '../import';
import { parseImportedOffers } from '../import';
import { addImportedList, uniqueListName } from '../store';
import { createId } from '../storage';
import type { JobRecord } from '../types';

type ImportOffersProps = {
  /** Every record, across all tabs — the overlap count is measured against it. */
  records: JobRecord[];
};

type Status =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; message: string; added: number }
  | { kind: 'error'; message: string };

/**
 * The tab is named after the file, minus its extension, because that is what
 * the user already calls this batch of offers.
 */
const listNameFor = (fileName: string, fallback: string): string =>
  fileName.replace(/\.[^.]+$/, '').trim() || fallback;

/**
 * Every key `parseImportedOffers` reads, in the order it is worth reading them.
 *
 * Listed here rather than derived from a type because the interesting half is
 * not the name — it is which one cannot be left out, and which one costs the
 * user the analysis step if they skip it. Keys are literal JSON and are never
 * translated; only the sentence beside each one is.
 */
const IMPORT_FIELDS: ReadonlyArray<{
  key: string;
  emphasis?: 'required' | 'recommended';
  type: string;
}> = [
  { key: 'source_url', emphasis: 'required', type: 'string' },
  { key: 'title', type: 'string' },
  { key: 'company', type: 'string' },
  { key: 'location', type: 'string' },
  { key: 'work_mode', type: '"remote" | "hybrid" | "onsite" | "unknown"' },
  { key: 'salary', type: 'string' },
  { key: 'contract_type', type: 'string' },
  { key: 'seniority', type: 'string' },
  { key: 'start_date', type: 'string' },
  { key: 'required_skills', type: 'string[]' },
  { key: 'text', emphasis: 'recommended', type: 'string' },
  { key: 'collected_at', type: 'string (ISO 8601)' },
  { key: 'posted_at', type: 'string (ISO 8601)' },
  { key: 'board', type: 'string' }
];

const RULES = ['lines', 'extraKeys', 'duplicates', 'analysed'] as const;

/**
 * Pretty-printed, which the format does not allow — see `spec.exampleNote`.
 * A single 400-character line is the truthful rendering and an unreadable one,
 * so the example is formatted and the constraint is stated in words beside it.
 */
const EXAMPLE = `{
  "source_url": "https://example.com/jobs/frontend-developer",
  "title": "Frontend Developer",
  "company": "Example Sp. z o.o.",
  "location": "Warszawa",
  "work_mode": "hybrid",
  "salary": "18 000 - 23 000 PLN B2B",
  "contract_type": "B2B",
  "seniority": "Mid",
  "start_date": "ASAP",
  "required_skills": ["React", "TypeScript", "GraphQL"],
  "text": "We are looking for a frontend developer...",
  "collected_at": "2026-08-14T09:30:00.000Z",
  "posted_at": "2026-08-12",
  "board": "example.com"
}`;

export function ImportOffers({ records }: ImportOffersProps) {
  const locale = useLocale();
  const t = useTranslations('research.import');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const describe = useCallback(
    (summary: ImportSummary, listName: string | null): string => {
      const asides = [
        summary.duplicatesInFile > 0 &&
          t('repeated', { count: summary.duplicatesInFile }),
        summary.alreadyElsewhere > 0 &&
          t('elsewhere', { count: summary.alreadyElsewhere }),
        summary.malformed > 0 && t('unreadable', { count: summary.malformed })
      ].filter((part): part is string => Boolean(part));
      const head =
        summary.records.length > 0 && listName
          ? t('imported', { count: summary.records.length, name: listName })
          : t('nothing');
      return t('summary', {
        head,
        asides: asides.length ? ` — ${asides.join(', ')}` : ''
      });
    },
    [t]
  );

  const handleFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      // Resetting the value lets the same file be chosen twice; without it the
      // change event does not fire on a second pick of an unchanged filename.
      event.target.value = '';

      if (!file) return;

      setStatus({ kind: 'working' });

      try {
        const contents = await file.text();

        // The id is minted before the parse so every row can carry it, and the
        // tab is registered only once the file turns out to hold something —
        // a file of nothing but malformed lines should not leave an empty tab
        // behind.
        const listId = createId();
        const summary = parseImportedOffers(contents, records, locale, listId);
        const listName =
          summary.records.length > 0
            ? uniqueListName(listNameFor(file.name, t('defaultList')))
            : null;

        if (listName) {
          addImportedList(
            { id: listId, name: listName, createdAt: new Date().toISOString() },
            summary.records
          );
        }

        setStatus({
          kind: 'done',
          added: summary.records.length,
          message: describe(summary, listName)
        });
      } catch {
        setStatus({
          kind: 'error',
          message: t('unreadableFile')
        });
      }
    },
    [records, locale, describe, t]
  );

  return (
    <div className="rounded-xl border border-dashed border-gray-200 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-700">
            {t('title')}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {t('description')}
          </p>
        </div>

        <label className="flex-shrink-0 cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-within:ring-2 focus-within:ring-[#65B7FF]">
          {status.kind === 'working' ? t('reading') : t('choose')}
          <input
            type="file"
            accept=".jsonl,.json,.txt,application/json,text/plain"
            onChange={handleFile}
            disabled={status.kind === 'working'}
            className="sr-only"
          />
        </label>
      </div>

      <details className="mt-3 border-t border-gray-100 pt-2">
        <summary className="cursor-pointer text-xs font-medium text-gray-600 hover:text-gray-800">
          {t('spec.toggle')}
        </summary>

        <div className="mt-2 space-y-3">
          <p className="text-xs leading-relaxed text-gray-600">
            {t('spec.intro')}
          </p>

          <dl className="space-y-1.5">
            {IMPORT_FIELDS.map((field) => (
              <div key={field.key} className="text-xs leading-relaxed">
                <dt className="flex flex-wrap items-baseline gap-x-2">
                  <code className="font-mono text-[11px] font-semibold text-gray-800">
                    {field.key}
                  </code>
                  <span className="font-mono text-[10px] text-gray-400">
                    {field.type}
                  </span>
                  {field.emphasis && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                        field.emphasis === 'required'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {t(`spec.${field.emphasis}`)}
                    </span>
                  )}
                </dt>
                <dd className="text-gray-500">
                  {t(`spec.fields.${field.key}`)}
                </dd>
              </div>
            ))}
          </dl>

          <div>
            <p className="text-xs font-medium text-gray-600">
              {t('spec.exampleTitle')}
            </p>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-50 p-3 font-mono text-[10px] leading-relaxed text-gray-700">
              {EXAMPLE}
            </pre>
            <p className="mt-1 text-[11px] text-gray-400">
              {t('spec.exampleNote')}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600">
              {t('spec.rulesTitle')}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-gray-500">
              {RULES.map((rule) => (
                <li key={rule}>{t(`spec.rules.${rule}`)}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      {(status.kind === 'done' || status.kind === 'error') && (
        <p
          role="status"
          className={`mt-2 text-xs ${
            status.kind === 'error'
              ? 'text-red-600'
              : status.added > 0
                ? 'text-green-700'
                : 'text-gray-500'
          }`}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
