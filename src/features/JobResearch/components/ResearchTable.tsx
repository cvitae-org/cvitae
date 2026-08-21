"use client";

import { Fragment, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ApplicationStatus, JobRecord } from '../types';
import { applicationStatuses, NOT_STATED } from '../types';
import type { Sort, SortKey } from '../filtering';
import { isStated } from '../filtering';
import { removeRecord, setStatus } from '../store';

type ResearchTableProps = {
  records: JobRecord[];
  /**
   * True when filters are narrowing the tab. Only changes the empty state:
   * "nothing matches" and "nothing collected yet" look identical otherwise,
   * and the fix for each is the opposite of the fix for the other.
   */
  filtered?: boolean;
  onRerun: (record: JobRecord) => void;
  /** Analyses an imported row from its stored text, without re-reading the board. */
  onAnalyse: (record: JobRecord) => void;
  /** Moves an offer into the submitting list, and this row to the bottom. */
  onQueue: (record: JobRecord) => void;
  /** Rows already queued, so the button can say so instead of duplicating. */
  queuedIds: Set<string>;
  isResearching: boolean;
  /** False while the stored offers are still being read out of IndexedDB. */
  hydrated: boolean;
  /** Shared with the controls bar, so the header and the dropdown always agree. */
  sort: Sort;
  onSortChange: (sort: Sort) => void;
};

/**
 * A column header that sorts by its column.
 *
 * Clicking the active column flips direction; clicking another switches to it.
 * The default direction is per-column rather than always ascending: the useful
 * first look at salary is the highest, and at a name it is A–Z.
 */
function SortHeader({
  label,
  sortKey,
  sort,
  onSortChange,
  defaultDirection = 'asc',
  className = ''
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSortChange: (sort: Sort) => void;
  defaultDirection?: Sort['direction'];
  className?: string;
}) {
  const t = useTranslations('research.table');
  const active = sort.key === sortKey;

  return (
    // aria-sort belongs to the column header itself, not the control inside
    // it — a button has no sortable semantics for it to describe.
    <th
      className={`py-2 pr-3 font-medium ${className}`}
      aria-sort={
        active
          ? sort.direction === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none'
      }
    >
      <button
        type="button"
        onClick={() =>
          onSortChange(
            active
              ? { key: sortKey, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
              : { key: sortKey, direction: defaultDirection }
          )
        }
        aria-label={t('sortBy', { label })}
        className={`flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-gray-600 ${
          active ? 'text-gray-600' : ''
        }`}
      >
        {label}
        <svg
          className={`h-3 w-3 transition-all ${
            active
              ? sort.direction === 'asc'
                ? 'rotate-180 opacity-100'
                : 'opacity-100'
              : 'opacity-0'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      </button>
    </th>
  );
}

export function ResearchTable({
  records,
  filtered = false,
  onRerun,
  onAnalyse,
  onQueue,
  queuedIds,
  isResearching,
  hydrated,
  sort,
  onSortChange
}: ResearchTableProps) {
  const t = useTranslations('research.table');
  const statusT = useTranslations('research.statuses');
  const workModeT = useTranslations('research.workModes');
  const commonT = useTranslations('common');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const localizeSentinel = (value: string) =>
    value === 'Unknown'
      ? commonT('unknown')
      : value === NOT_STATED
        ? commonT('notStated')
        : value;

  // The store reads asynchronously now, so an empty table means one of two
  // opposite things for the first moments of a page load. Telling someone with
  // forty saved offers that they have none is the worse of the two.
  if (!hydrated) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
        <p className="text-sm text-gray-400">{t('loading')}</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
        <p className="text-sm font-medium text-gray-700">
          {filtered ? t('noMatches') : t('none')}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {filtered
            ? t('widen')
            : t('start')}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-[11px] uppercase tracking-wider text-gray-400">
            <th className="w-7 py-2 pl-2" />
            <SortHeader
              label={t('offer')}
              sortKey="position"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortHeader
              label={t('salary')}
              sortKey="salary"
              sort={sort}
              onSortChange={onSortChange}
              // Highest first: the reason to sort on salary is to find the top
              // of the range, and ascending would open on the unstated rows.
              defaultDirection="desc"
              className="w-[132px]"
            />
            <th className="w-[74px] py-2 pr-3 font-medium">{t('contract')}</th>
            <SortHeader
              label={t('status')}
              sortKey="status"
              sort={sort}
              onSortChange={onSortChange}
              className="w-[104px]"
            />
            <th className="w-[108px] py-2 pr-2" />
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const isExpanded = expandedId === record.id;
            const isQueued = queuedIds.has(record.id);
            const position = localizeSentinel(record.position);
            const company = localizeSentinel(record.company);

            return (
              <Fragment key={record.id}>
                <tr
                  className={`border-b border-gray-100 transition-colors ${
                    isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50/70'
                  }`}
                >
                  <td className="py-3 pl-2 align-middle">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : record.id)}
                      aria-expanded={isExpanded}
                      aria-label={t(isExpanded ? 'hideAnalysis' : 'showAnalysis', {
                        position,
                        company
                      })}
                      className="rounded p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    >
                      <svg
                        className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </td>
                  <td className="py-3 pr-3 align-middle">
                    <span className="block truncate text-[13px] font-semibold leading-tight text-gray-900">
                      {position}
                    </span>
                    <span className="mt-0.5 block truncate text-xs leading-tight text-gray-500">
                      {company}
                    </span>
                    <span className="mt-1 block truncate text-[11px] leading-tight text-gray-400">
                      {[
                        localizeSentinel(record.location),
                        localizeSentinel(record.seniority),
                        workModeT(record.work_mode)
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </td>
                  <td className="py-3 pr-3 align-middle text-[11px] leading-tight text-gray-600">
                    {isStated(record.salary) ? (
                      record.salary
                    ) : (
                      <span className="italic text-gray-400">{commonT('notStated')}</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 align-middle text-[11px] text-gray-600">
                    {isStated(record.contract_type) ? (
                      record.contract_type
                    ) : (
                      <span className="italic text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 align-middle">
                    <select
                      value={record.status}
                      onChange={(event) =>
                        setStatus(
                          record.id,
                          event.target.value as ApplicationStatus
                        )
                      }
                      aria-label={t('applicationStatus', {
                        position,
                        company
                      })}
                      className="w-full rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] capitalize text-gray-600 transition-colors hover:border-gray-300 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
                    >
                      {applicationStatuses.map((status) => (
                        <option key={status} value={status}>
                          {statusT(status)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 pr-2 align-middle">
                    <div className="flex items-center justify-end gap-0.5">
                      {/* Sends the offer to the submitting list. The row stays
                          here — it is still a real offer with a status worth
                          tracking — but drops to the bottom of the tab, since
                          it is no longer waiting to be triaged. */}
                      <button
                        type="button"
                        onClick={() => onQueue(record)}
                        title={
                          isQueued
                            ? t('queuedTitle')
                            : t('queueTitle')
                        }
                        aria-label={t(isQueued ? 'queuedAria' : 'queueAria', {
                          position,
                          company
                        })}
                        className={`rounded-md p-1 transition-colors ${
                          isQueued
                            ? 'text-green-500 hover:bg-green-50'
                            : 'text-gray-300 hover:bg-gray-100 hover:text-[#65B7FF]'
                        }`}
                      >
                        <svg
                          className={`h-4 w-4${isQueued ? "" : " rotate-45"}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="miter"
                            strokeWidth={2}
                            d={
                              isQueued
                                ? 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
                                : 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8'
                            }
                          />
                        </svg>
                      </button>

                      {/* Imported rows carry their text, so the inferred
                          fields can be filled without reading the board
                          again. Rows researched normally have no stored text
                          and no gap to fill. */}
                      {record.offer_text && (
                        <button
                          type="button"
                          onClick={() => onAnalyse(record)}
                          disabled={isResearching}
                          title={t('analyseTitle')}
                          aria-label={t('analyseAria', {
                            position,
                            company
                          })}
                          className="rounded-md p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-[#65B7FF] disabled:opacity-40"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRerun(record)}
                        disabled={isResearching}
                        title={t('rerunTitle')}
                        aria-label={t('rerunAria', {
                          position,
                          company
                        })}
                        className="rounded-md p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRecord(record.id)}
                        title={t('deleteTitle')}
                        aria-label={t('deleteAria', {
                          position,
                          company
                        })}
                        className="rounded-md p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>

                {isExpanded && (
                  <tr className="border-b border-gray-100">
                    <td colSpan={6} className="p-0">
                      <RecordDetail record={record} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One offer fact. Absent values still render, greyed — knowing the offer says
 * nothing about the contract type is itself useful when comparing offers.
 */
function Fact({ label, value }: { label: string; value?: string }) {
  const commonT = useTranslations('common');
  const missing = !value || value === NOT_STATED || value === 'Unknown';
  const displayValue = missing
    ? value === 'Unknown'
      ? commonT('unknown')
      : commonT('notStated')
    : value;

  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-gray-400">
        {label}
      </dt>
      <dd
        className={`truncate text-xs ${missing ? 'italic text-gray-400' : 'text-gray-700'}`}
        title={displayValue}
      >
        {displayValue}
      </dd>
    </div>
  );
}

function RecordDetail({ record }: { record: JobRecord }) {
  const t = useTranslations('research.table');
  const priorityT = useTranslations('research.requirements.priority');
  const categoryT = useTranslations('research.requirements.category');
  const commonT = useTranslations('common');
  const format = useFormatter();

  return (
    <div className="border-t border-gray-200 bg-gray-50 px-4 py-4">
      <dl className="mb-4 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
        <Fact label={t('facts.companyType')} value={record.company_type} />
        <Fact label={t('facts.companySize')} value={record.company_size} />
        <Fact label={t('facts.team')} value={record.team} />
        <Fact label={t('facts.salary')} value={record.salary} />
        <Fact label={t('facts.contract')} value={record.contract_type} />
        <Fact label={t('facts.length')} value={record.engagement_length} />
        <Fact label={t('facts.starts')} value={record.start_date} />
        <Fact label={t('facts.role')} value={record.role_profile} />
        <Fact
          label={t('facts.checked')}
          value={format.dateTime(new Date(record.checked_at), {
            dateStyle: 'medium',
            timeStyle: 'short'
          })}
        />
      </dl>

      {isStated(record.ideal_candidate) && (
        <div className="mb-4 border-t border-gray-200 pt-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {t('idealCandidate')}
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-gray-700">
            {record.ideal_candidate}
          </p>
        </div>
      )}

      {record.responsibilities?.length > 0 && (
        <div className="mb-4 border-t border-gray-200 pt-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {t('responsibilities', { count: record.responsibilities.length })}
          </h4>
          <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
            {record.responsibilities.map((item, index) => (
              <li
                key={index}
                className="flex gap-1.5 text-sm leading-snug text-gray-700"
              >
                <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-gray-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-gray-200 pt-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          {t('requiredSkills', { count: record.required_skills?.length ?? 0 })}
        </h4>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(record.required_skills ?? []).length === 0 ? (
            <span className="text-sm text-gray-400">{t('noneListed')}</span>
          ) : (
            (record.required_skills ?? []).map((skill) => (
              <span
                key={skill}
                className="rounded-md bg-gray-200 px-2 py-0.5 text-xs text-gray-700"
              >
                {skill}
              </span>
            ))
          )}
        </div>

        {record.requirements.length > 0 && (
          <div className="mt-4 border-t border-gray-200 pt-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {t('requirementCatalog', { count: record.requirements.length })}
            </h4>
            <ul className="mt-2 space-y-2">
              {record.requirements.map((requirement) => (
                <li key={requirement.id} className="rounded-md border border-gray-200 bg-white px-2.5 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-gray-800">
                      {requirement.exactText}
                    </span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                      {priorityT(requirement.priority)}
                    </span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                      {categoryT(requirement.category)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] italic leading-relaxed text-gray-500">
                    “{requirement.sourceQuote}”
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 space-y-1 border-t border-gray-200 pt-3 text-xs text-gray-500">
          {record.source_url && (
            <a
              href={record.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-[#65B7FF] hover:underline"
            >
              {record.source_url}
            </a>
          )}
          <p>
            {t('source', {
              mode: record.source_mode === 'url' ? t('fetched') : t('pasted')
            })}
          </p>
          {record.source_note && (
            <details className="text-[11px] text-gray-400">
              <summary className="cursor-pointer">{commonT('technicalDetails')}</summary>
              <p className="mt-1 break-words">{record.source_note}</p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
