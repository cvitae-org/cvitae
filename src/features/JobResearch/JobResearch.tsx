"use client";

import { useCallback, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useJobResearch } from './hooks/useJobResearch';
import { useTableView } from './hooks/useTableView';
import { ResearchForm } from './components/ResearchForm';
import { ResearchTable } from './components/ResearchTable';
import { ResearchTabs } from './components/ResearchTabs';
import { TableControls } from './components/TableControls';
import { ImportOffers } from './components/ImportOffers';
import { clearList, removeList, renameList, setActiveList } from './store';
import { toCsv } from './storage';
import type { JobRecord } from './types';
import { SheetNavLink } from '@/components/SheetNavLink';
import { Sheet } from '@/components/Sheet';
import { queueOffer } from '@/features/Submitting/queue';
import { asLocale } from '@/features/Submitting/types';
import { useQueuedRecordIds } from '@/features/Submitting/hooks/useSubmitting';
import { useRouter } from '@/libs/i18n/routing';

/** Turns a tab name into something safe to hand a filesystem. */
const toFileSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'job-research';

export function JobResearch() {
  const {
    records,
    allRecords,
    lists,
    activeListId,
    hydrated,
    research,
    isResearching,
    error,
    clearError
  } = useJobResearch();

  const locale = useLocale();
  const router = useRouter();
  const queuedIds = useQueuedRecordIds();

  const {
    filters,
    setFilters,
    sort,
    setSort,
    facets,
    visible,
    activeFilters,
    reset: resetFilters
  } = useTableView(records);

  const activeList = lists.find((list) => list.id === activeListId);

  const counts = useMemo(() => {
    const byList: Record<string, number> = {};
    for (const record of allRecords) {
      byList[record.listId] = (byList[record.listId] ?? 0) + 1;
    }
    return byList;
  }, [allRecords]);

  const stats = useMemo(() => {
    const stated = (value?: string) =>
      Boolean(value) && value !== 'Not stated' && value !== 'Unknown';
    return {
      withSalary: records.filter((r) => stated(r.salary)).length,
      remote: records.filter((r) => r.work_mode === 'remote').length
    };
  }, [records]);

  const handleRerun = useCallback(
    (record: JobRecord) => {
      research({ url: record.source_url, replaceId: record.id });
    },
    [research]
  );

  /**
   * Fills the inferred fields of an imported row from the text already stored
   * on it. Same model cost as a re-run, but the board is not read again — which
   * is the difference between this working and not once a posting expires.
   */
  const handleAnalyse = useCallback(
    (record: JobRecord) => {
      if (!record.offer_text) return;
      research({
        url: record.source_url,
        offerText: record.offer_text,
        replaceId: record.id,
        textSource: 'scraper',
        boardFacts: record.board_facts
      });
    },
    [research]
  );

  /**
   * Deciding to apply is a decision to go and do it, so this follows the
   * offer to the page where that happens rather than leaving the user to find
   * their way there. `queueOffer` selects the submission, so it is already
   * open on arrival.
   */
  const handleQueue = useCallback(
    (record: JobRecord) => {
      // The application starts in the language the app is being used in, which
      // is also the one the CV renders in. It is changed per application from
      // the submitting panel.
      queueOffer(record, asLocale(locale));
      router.push('/submitting');
    },
    [router, locale]
  );

  /**
   * Exports what is on screen, not the whole tab.
   *
   * Filtering down to a shortlist and exporting it is the point of having
   * filters at all; an export that quietly ignored them would hand back 1,000
   * rows when eleven were asked for. With no filters active the two are the
   * same thing.
   */
  const handleExport = useCallback(() => {
    const blob = new Blob([toCsv(visible)], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    // Named after the tab, since that is what is in the file.
    link.download = `${toFileSlug(activeList?.name ?? '')}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [visible, activeList]);

  const handleClear = useCallback(() => {
    if (
      window.confirm(
        `Delete all ${records.length} offers in “${activeList?.name}”? This cannot be undone.`
      )
    ) {
      clearList(activeListId);
    }
  }, [records.length, activeList, activeListId]);

  /** Closing a tab takes its offers with it — there is no other tab they sit in. */
  const handleCloseList = useCallback(
    (listId: string) => {
      const list = lists.find((item) => item.id === listId);
      const count = counts[listId] ?? 0;

      if (
        count > 0 &&
        !window.confirm(
          `Close “${list?.name}” and delete its ${count} offer${
            count === 1 ? '' : 's'
          }? This cannot be undone.`
        )
      ) {
        return;
      }

      removeList(listId);
    },
    [lists, counts]
  );

  return (
    <div className="min-h-screen py-8">
      <div className="flex items-start justify-center gap-4 px-4">
        <div className="sticky top-8 print:hidden flex flex-col gap-2">
          <SheetNavLink href="/" title="CV">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </SheetNavLink>
          <SheetNavLink href="/submitting" title="Submitting">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </SheetNavLink>
          <SheetNavLink href="/settings" title="Settings">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </SheetNavLink>
        </div>

        <Sheet>
          <header className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Job offer research
              </h1>
              <p className="mt-0.5 text-sm text-gray-500">
                {!hydrated || records.length === 0
                  ? 'Collect what each offer actually says, in one place.'
                  : `${records.length} offer${records.length === 1 ? '' : 's'} · ${stats.withSalary} with salary · ${stats.remote} remote`}
              </p>
            </div>

            {records.length > 0 && (
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleExport}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {/* Says what will actually be in the file, since filters
                      narrow it and a silent "Export CSV" would not. */}
                  {visible.length === records.length
                    ? 'Export CSV'
                    : `Export ${visible.length} shown`}
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  {lists.length > 1 ? 'Clear tab' : 'Clear all'}
                </button>
              </div>
            )}
          </header>

          <div className="space-y-5">
            <ResearchForm
              onResearch={research}
              isResearching={isResearching}
              error={error}
              onDismissError={clearError}
            />

            <ImportOffers records={allRecords} />

            {/* The strip belongs to the table it scopes, so the two sit
                closer together than the sections around them. */}
            <div className="space-y-3">
              <ResearchTabs
                lists={lists}
                activeListId={activeListId}
                counts={counts}
                onSelect={setActiveList}
                onRename={renameList}
                onClose={handleCloseList}
              />

              {records.length > 0 && (
                <TableControls
                  filters={filters}
                  onFiltersChange={setFilters}
                  sort={sort}
                  onSortChange={setSort}
                  facets={facets}
                  shown={visible.length}
                  total={records.length}
                  activeFilters={activeFilters}
                  onReset={resetFilters}
                />
              )}

              <ResearchTable
                records={visible}
                filtered={activeFilters > 0}
                onRerun={handleRerun}
                onAnalyse={handleAnalyse}
                onQueue={handleQueue}
                queuedIds={queuedIds}
                isResearching={isResearching}
                hydrated={hydrated}
                sort={sort}
                onSortChange={setSort}
              />
            </div>

            <p className="text-xs text-gray-400">
              Stored in this browser only (IndexedDB). Clearing site data
              removes it — export to CSV to keep a copy.
            </p>
          </div>
        </Sheet>

        {/* Balances the nav column so the sheet lands in the same place as on
            the CV page, which has control buttons on both sides. */}
        <div className="w-9 flex-shrink-0 print:hidden" aria-hidden="true" />
      </div>
    </div>
  );
}
