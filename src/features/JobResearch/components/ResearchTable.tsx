"use client";

import { Fragment, useState } from 'react';
import type { ApplicationStatus, JobRecord } from '../types';
import { applicationStatuses, NOT_STATED } from '../types';
import { removeRecord, setStatus } from '../store';

const isStated = (value?: string): boolean =>
  Boolean(value) && value !== NOT_STATED && value !== 'Unknown';

type ResearchTableProps = {
  records: JobRecord[];
  onRerun: (record: JobRecord) => void;
  isResearching: boolean;
};

export function ResearchTable({
  records,
  onRerun,
  isResearching
}: ResearchTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
        <p className="text-sm font-medium text-gray-700">
          No offers researched yet
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Paste a job offer URL above to get started.
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
            <th className="py-2 pr-3 font-medium">Offer</th>
            <th className="w-[132px] py-2 pr-3 font-medium">Salary</th>
            <th className="w-[74px] py-2 pr-3 font-medium">Contract</th>
            <th className="w-[104px] py-2 pr-3 font-medium">Status</th>
            <th className="w-[52px] py-2 pr-2" />
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const isExpanded = expandedId === record.id;

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
                      aria-label={`${isExpanded ? 'Hide' : 'Show'} analysis for ${record.position} at ${record.company}`}
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
                      {record.position}
                    </span>
                    <span className="mt-0.5 block truncate text-xs leading-tight text-gray-500">
                      {record.company}
                    </span>
                    <span className="mt-1 block truncate text-[11px] leading-tight text-gray-400">
                      {[record.location, record.seniority, record.work_mode]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </td>
                  <td className="py-3 pr-3 align-middle text-[11px] leading-tight text-gray-600">
                    {isStated(record.salary) ? (
                      record.salary
                    ) : (
                      <span className="italic text-gray-400">{NOT_STATED}</span>
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
                      aria-label={`Application status for ${record.position} at ${record.company}`}
                      className="w-full rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] capitalize text-gray-600 transition-colors hover:border-gray-300 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
                    >
                      {applicationStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 pr-2 align-middle">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => onRerun(record)}
                        disabled={isResearching}
                        title="Re-run the analysis"
                        aria-label={`Re-run analysis for ${record.position} at ${record.company}`}
                        className="rounded-md p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRecord(record.id)}
                        title="Delete this row"
                        aria-label={`Delete ${record.position} at ${record.company}`}
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
  const missing = !value || value === NOT_STATED || value === 'Unknown';

  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-gray-400">
        {label}
      </dt>
      <dd
        className={`truncate text-xs ${missing ? 'italic text-gray-400' : 'text-gray-700'}`}
        title={value}
      >
        {value || NOT_STATED}
      </dd>
    </div>
  );
}

function RecordDetail({ record }: { record: JobRecord }) {
  return (
    <div className="border-t border-gray-200 bg-gray-50 px-4 py-4">
      <dl className="mb-4 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
        <Fact label="Company type" value={record.company_type} />
        <Fact label="Company size" value={record.company_size} />
        <Fact label="Team" value={record.team} />
        <Fact label="Salary" value={record.salary} />
        <Fact label="Contract" value={record.contract_type} />
        <Fact label="Length" value={record.engagement_length} />
        <Fact label="Starts" value={record.start_date} />
        <Fact label="Role" value={record.role_profile} />
        <Fact
          label="Checked"
          value={new Date(record.checked_at).toLocaleString()}
        />
      </dl>

      {record.ideal_candidate && (
        <div className="mb-4 border-t border-gray-200 pt-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Ideal candidate
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-gray-700">
            {record.ideal_candidate}
          </p>
        </div>
      )}

      {record.responsibilities?.length > 0 && (
        <div className="mb-4 border-t border-gray-200 pt-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Responsibilities ({record.responsibilities.length})
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
          Required skills ({record.required_skills?.length ?? 0})
        </h4>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(record.required_skills ?? []).length === 0 ? (
            <span className="text-sm text-gray-400">None listed</span>
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
            Source:{' '}
            {record.source_mode === 'url'
              ? 'fetched from URL'
              : 'pasted manually'}
            {record.source_note ? ` — ${record.source_note}` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
