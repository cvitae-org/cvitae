"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ApplicationStatus, WorkMode } from '../types';
import type { BatchProgress } from '../hooks/useJobResearch';
import type {
  FacetOptions,
  Filters,
  Sort,
  SortKey
} from '../filtering';
import { sortKeys, toggleValue } from '../filtering';

type TableControlsProps = {
  filters: Filters;
  /**
   * Takes an updater rather than a value. Each pill patches one field of a
   * shared object, so writing `{ ...filters, ...patch }` from the prop reads a
   * snapshot that is already stale if another pill was clicked in the same
   * batch — the second write then drops the first, and turning on "remote"
   * silently switches "salary stated" back off. Sort keeps a plain value:
   * there, the last control clicked genuinely is the intended state.
   */
  onFiltersChange: React.Dispatch<React.SetStateAction<Filters>>;
  sort: Sort;
  onSortChange: (sort: Sort) => void;
  facets: FacetOptions;
  /** Rows after filtering, and the tab's total, for the count line. */
  shown: number;
  total: number;
  activeFilters: number;
  onReset: () => void;
  /**
   * Rows in this tab that still have empty analysed fields but kept their
   * posting text. Zero hides the action, which is the honest state for a tab of
   * rows researched one at a time — they are already analysed.
   */
  analysable: number;
  onAnalyseAll: () => void;
  /** Progress of a running batch, or null. */
  batch: BatchProgress | null;
  onStopBatch: () => void;
};

/** One toggle in a facet row. Shows its count so a dead end is visible before clicking. */
function Pill({
  label,
  count,
  active,
  onClick
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? 'border-[#65B7FF] bg-[#65B7FF]/10 text-[#2a7fc4]'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {label}
      <span
        className={`ml-1.5 tabular-nums ${active ? 'text-[#65B7FF]' : 'text-gray-400'}`}
      >
        {count}
      </span>
    </button>
  );
}

function FacetRow({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      <span className="w-[68px] flex-shrink-0 text-[10px] uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <div className="flex flex-1 flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function TableControls({
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  facets,
  shown,
  total,
  activeFilters,
  onReset,
  analysable,
  onAnalyseAll,
  batch,
  onStopBatch
}: TableControlsProps) {
  const t = useTranslations('research.controls');
  const statusT = useTranslations('research.statuses');
  const workModeT = useTranslations('research.workModes');
  // Collapsed by default: the facets run to a dozen pills on a scraped tab, and
  // most visits are a search-and-sort rather than a faceted narrowing.
  const [expanded, setExpanded] = useState(false);

  const set = (project: (current: Filters) => Partial<Filters>) =>
    onFiltersChange((current) => ({ ...current, ...project(current) }));

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => set(() => ({ query: event.target.value }))}
            placeholder={t('filterPlaceholder')}
            aria-label={t('filterAria')}
            className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-xs text-gray-900 transition-colors placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
          />
        </div>

        <label className="sr-only" htmlFor="sort-key">
          {t('sortBy')}
        </label>
        <select
          id="sort-key"
          value={sort.key}
          onChange={(event) =>
            onSortChange({ ...sort, key: event.target.value as SortKey })
          }
          className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 transition-colors hover:border-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
        >
          {sortKeys.map((key) => (
            <option key={key} value={key}>
              {t(`sort.${key}`)}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() =>
            onSortChange({
              ...sort,
              direction: sort.direction === 'asc' ? 'desc' : 'asc'
            })
          }
          title={
            sort.direction === 'asc'
              ? t('ascendingTitle')
              : t('descendingTitle')
          }
          aria-label={t('direction', {
            direction: sort.direction === 'asc' ? t('ascending') : t('descending')
          })}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
        >
          <svg
            className={`h-3.5 w-3.5 transition-transform ${sort.direction === 'asc' ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            activeFilters > 0
              ? 'border-[#65B7FF] bg-[#65B7FF]/10 text-[#2a7fc4]'
              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
          }`}
        >
          {t('filters')}
          {activeFilters > 0 && (
            <span className="rounded-full bg-[#65B7FF] px-1.5 text-[10px] tabular-nums text-white">
              {activeFilters}
            </span>
          )}
          <svg
            className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2.5 border-t border-gray-100 pt-3">
          <FacetRow label={t('salary')}>
            <Pill
              label={t('statedOnly')}
              count={facets.withSalary}
              active={filters.salaryOnly}
              onClick={() => set((current) => ({ salaryOnly: !current.salaryOnly }))}
            />
          </FacetRow>

          {facets.workModes.length > 0 && (
            <FacetRow label={t('workMode')}>
              {facets.workModes.map((option) => (
                <Pill
                  key={option.value}
                  label={workModeT(option.value)}
                  count={option.count}
                  active={filters.workModes.includes(option.value)}
                  onClick={() =>
                    set((current) => ({
                      workModes: toggleValue<WorkMode>(
                        current.workModes,
                        option.value
                      )
                    }))
                  }
                />
              ))}
            </FacetRow>
          )}

          {facets.contractTypes.length > 0 && (
            <FacetRow label={t('contract')}>
              {facets.contractTypes.map((option) => (
                <Pill
                  key={option.value}
                  label={option.value}
                  count={option.count}
                  active={filters.contractTypes.includes(option.value)}
                  onClick={() =>
                    set((current) => ({
                      contractTypes: toggleValue(
                        current.contractTypes,
                        option.value
                      )
                    }))
                  }
                />
              ))}
            </FacetRow>
          )}

          {facets.statuses.length > 0 && (
            <FacetRow label={t('status')}>
              {facets.statuses.map((option) => (
                <Pill
                  key={option.value}
                  label={statusT(option.value)}
                  count={option.count}
                  active={filters.statuses.includes(option.value)}
                  onClick={() =>
                    set((current) => ({
                      statuses: toggleValue<ApplicationStatus>(
                        current.statuses,
                        option.value
                      )
                    }))
                  }
                />
              ))}
            </FacetRow>
          )}
        </div>
      )}

      {(activeFilters > 0 || shown !== total || analysable > 0 || batch) && (
        <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-gray-100 pt-2 text-[11px] text-gray-500">
          <span className="tabular-nums">
            {t('showing', { shown, total })}
          </span>

          <div className="flex items-center gap-3">
            {batch ? (
              <>
                <span className="tabular-nums text-gray-600">
                  {t('analysing', {
                    done: batch.done + batch.failed,
                    total: batch.total,
                    failed: batch.failed > 0 ? t('failed', { count: batch.failed }) : ''
                  })}
                </span>
                {/* Safe to offer, and worth offering: every row that has
                    already landed is written, so stopping costs only what has
                    not been done yet. */}
                <button
                  type="button"
                  onClick={onStopBatch}
                  className="font-medium text-gray-500 transition-colors hover:text-gray-800"
                >
                  {t('stop')}
                </button>
              </>
            ) : (
              analysable > 0 && (
                <button
                  type="button"
                  onClick={onAnalyseAll}
                  title={t('analyseTitle')}
                  className="font-medium text-gray-500 transition-colors hover:text-gray-800"
                >
                  {t('analyse', { count: analysable })}
                </button>
              )
            )}

            {activeFilters > 0 && (
              <button
                type="button"
                onClick={onReset}
                className="font-medium text-gray-500 transition-colors hover:text-gray-800"
              >
                {t('reset')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
