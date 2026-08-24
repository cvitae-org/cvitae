"use client";

import { useCallback, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useJobResearch } from './hooks/useJobResearch';
import { useTableView } from './hooks/useTableView';
import { ResearchForm } from './components/ResearchForm';
import { ResearchTable } from './components/ResearchTable';
import { ResearchTabs } from './components/ResearchTabs';
import { TableControls } from './components/TableControls';
import { ImportOffers } from './components/ImportOffers';
import { ResearchAuditBar } from './components/ResearchAuditBar';
import { clearList, removeList, renameList, setActiveList } from './store';
import { toCsv } from './storage';
import { MANUAL_LIST_ID } from './types';
import type { JobRecord } from './types';
import { isAnalysable } from './filtering';
import { SheetNavigation } from '@/components/SheetNavigation';
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
  const t = useTranslations('research');
  const {
    records,
    allRecords,
    lists,
    activeListId,
    hydrated,
    research,
    isResearching,
    analysingIds,
    researchMany,
    stopBatch,
    batch,
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

  /**
   * Rows in this tab that an import left blank and that still hold their
   * posting, which is exactly what the batch can fill.
   *
   * `isAnalysable` is shared with the filter and the row marker, so the count
   * in the header and the rows the "not analysed" pill shows can never drift
   * apart. Taken from `records` rather than `visible`: a filter narrows
   * what is being looked at, not what needs work, and having the count jump
   * around as pills are toggled would make it read like a filtered subtotal.
   */
  const unanalysed = useMemo(() => records.filter(isAnalysable), [records]);

  const activeList = lists.find((list) => list.id === activeListId);
  const activeListName =
    activeList?.id === MANUAL_LIST_ID
      ? t('tabs.manual')
      : activeList?.name ?? '';

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
        t('confirmClear', { count: records.length, name: activeListName })
      )
    ) {
      clearList(activeListId);
    }
  }, [records.length, activeListName, activeListId, t]);

  /** Closing a tab takes its offers with it — there is no other tab they sit in. */
  const handleCloseList = useCallback(
    (listId: string) => {
      const list = lists.find((item) => item.id === listId);
      const count = counts[listId] ?? 0;

      if (
        count > 0 &&
        !window.confirm(
          t('confirmClose', { name: list?.name ?? '', count })
        )
      ) {
        return;
      }

      removeList(listId);
    },
    [lists, counts, t]
  );

  return (
    <div className="min-h-screen py-8 pb-28">
      <div className="flex items-start justify-center gap-4 px-4">
        <div className="sticky top-8 print:hidden">
          <SheetNavigation />
        </div>

        <Sheet>
          <header className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {t('title')}
              </h1>
              <p className="mt-0.5 text-sm text-gray-500">
                {!hydrated || records.length === 0
                  ? t('emptyDescription')
                  : t('stats', {
                      offers: records.length,
                      salary: stats.withSalary,
                      remote: stats.remote
                    })}
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
                    ? t('exportCsv')
                    : t('exportShown', { count: visible.length })}
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  {lists.length > 1 ? t('clearTab') : t('clearAll')}
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
                  analysable={unanalysed.length}
                  onAnalyseAll={() => researchMany(unanalysed)}
                  batch={batch}
                  onStopBatch={stopBatch}
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
                analysingIds={analysingIds}
                hydrated={hydrated}
                sort={sort}
                onSortChange={setSort}
              />
            </div>

            <p className="text-xs text-gray-400">
              {t('storageNote')}
            </p>
          </div>
        </Sheet>

        {/* Balances the nav column so the sheet lands in the same place as on
            the CV page, which has control buttons on both sides. */}
        <div className="w-9 flex-shrink-0 print:hidden" aria-hidden="true" />
      </div>

      <ResearchAuditBar
        records={records}
        queuedIds={queuedIds}
        tabName={activeListName}
      />
    </div>
  );
}
