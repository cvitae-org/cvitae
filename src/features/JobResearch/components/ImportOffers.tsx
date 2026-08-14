"use client";

import { useCallback, useState } from 'react';
import { useLocale } from 'next-intl';
import type { ImportSummary } from '../import';
import { parseScrapedOffers } from '../import';
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
const listNameFor = (fileName: string): string =>
  fileName.replace(/\.[^.]+$/, '').trim() || 'Imported';

/** Turns the parse counts into one line a person can actually read. */
const describe = (summary: ImportSummary, listName: string | null): string => {
  const asides = [
    summary.duplicatesInFile > 0 &&
      `${summary.duplicatesInFile} repeated in the file`,
    summary.alreadyElsewhere > 0 &&
      `${summary.alreadyElsewhere} also in another tab`,
    summary.malformed > 0 && `${summary.malformed} unreadable`
  ].filter((part): part is string => Boolean(part));

  const added = summary.records.length;
  const head =
    added > 0 && listName
      ? `Imported ${added} offer${added === 1 ? '' : 's'} into “${listName}”`
      : 'Nothing to import';

  return asides.length ? `${head} — ${asides.join(', ')}.` : `${head}.`;
};

export function ImportOffers({ records }: ImportOffersProps) {
  const locale = useLocale();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

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
        const summary = parseScrapedOffers(contents, records, locale, listId);
        const listName =
          summary.records.length > 0
            ? uniqueListName(listNameFor(file.name))
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
          message: 'That file could not be read.'
        });
      }
    },
    [records, locale]
  );

  return (
    <div className="rounded-xl border border-dashed border-gray-200 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-700">
            Import from cvitae-scrapper
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Drop in a <code className="text-[11px]">.jsonl</code> file from the
            scraper&apos;s <code className="text-[11px]">out/</code> folder. Each
            file opens as its own tab, with what the board stated; re-run a row
            to fill the analysed fields.
          </p>
        </div>

        <label className="flex-shrink-0 cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-within:ring-2 focus-within:ring-[#65B7FF]">
          {status.kind === 'working' ? 'Reading…' : 'Choose file'}
          <input
            type="file"
            accept=".jsonl,.json,.txt,application/json,text/plain"
            onChange={handleFile}
            disabled={status.kind === 'working'}
            className="sr-only"
          />
        </label>
      </div>

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
