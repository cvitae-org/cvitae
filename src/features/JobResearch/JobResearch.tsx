"use client";

import { useCallback, useMemo } from 'react';
import { useJobResearch } from './hooks/useJobResearch';
import { ResearchForm } from './components/ResearchForm';
import { ResearchTable } from './components/ResearchTable';
import { clearRecords } from './store';
import { toCsv } from './storage';
import type { JobRecord } from './types';
import { SheetNavLink } from '@/components/SheetNavLink';
import { Sheet } from '@/components/Sheet';

export function JobResearch() {
  const { records, research, isResearching, error, clearError } =
    useJobResearch();

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

  const handleExport = useCallback(() => {
    const blob = new Blob([toCsv(records)], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `job-research-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [records]);

  const handleClear = useCallback(() => {
    if (
      window.confirm(
        `Delete all ${records.length} researched offers? This cannot be undone.`
      )
    ) {
      clearRecords();
    }
  }, [records.length]);

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
                {records.length === 0
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
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  Clear all
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

            <ResearchTable
              records={records}
              onRerun={handleRerun}
              isResearching={isResearching}
            />

            <p className="text-xs text-gray-400">
              Stored in this browser only (localStorage). Clearing site data
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
