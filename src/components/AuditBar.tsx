"use client";

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/**
 * The docked audit bar, and the shape of what goes in it.
 *
 * Every stage of the flow has a question it should be able to answer without
 * being asked — is this CV going to survive a parser, which of these offers is
 * worth the afternoon, what has been sent and heard nothing back. Those are
 * three unrelated bodies of knowledge, so the checks live with the feature they
 * are about; what they share is the place the answer appears, which is here.
 *
 * The shell owns only the chrome: the collapsed row and its counts, the
 * disclosure, the dock. Findings arrive already translated, because the
 * alternative is a message catalogue in this file describing pages it knows
 * nothing about.
 */

export type AuditSeverity = 'block' | 'warning' | 'info';

export type AuditItem = {
  key: string;
  text: string;
  severity: AuditSeverity;
  /** Rendered under the text, for anything that needs its own disclosure. */
  detail?: ReactNode;
};

export type AuditSection = {
  key: string;
  title: string;
  items: AuditItem[];
  /** Full width instead of a grid cell. For findings that interrupt the work. */
  span?: boolean;
};

const severityClass: Record<AuditSeverity, string> = {
  block: 'text-red-700',
  warning: 'text-amber-700',
  info: 'text-gray-600'
};

export function AuditBar({
  id,
  title,
  sections,
  notice,
  disclaimer,
  forceOpen = false,
  docked = true,
  className = ''
}: {
  id?: string;
  title: string;
  sections: AuditSection[];
  /** A standing caveat about the page, not a finding. Shown above the grid. */
  notice?: ReactNode;
  disclaimer?: string;
  /**
   * Opens the bar when it becomes true. For findings that answer "why did
   * nothing happen?" — those must not stay folded behind a summary row.
   */
  forceOpen?: boolean;
  docked?: boolean;
  className?: string;
}) {
  const t = useTranslations('audit');

  const counts = useMemo(() => {
    const items = sections.flatMap((section) => section.items);
    return {
      blocks: items.filter((item) => item.severity === 'block').length,
      warnings: items.filter((item) => item.severity === 'warning').length
    };
  }, [sections]);

  const [open, setOpen] = useState(false);

  // Adjusted during render rather than in an effect: an effect would paint the
  // collapsed bar once before correcting itself, and the correction is not a
  // synchronisation with anything outside React.
  const [wasForced, setWasForced] = useState(forceOpen);
  if (forceOpen !== wasForced) {
    setWasForced(forceOpen);
    if (forceOpen) setOpen(true);
  }

  return (
    <details
      id={id}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className={`rounded-lg border border-gray-200 bg-gray-50 print:hidden ${
        docked
          ? 'fixed bottom-4 left-1/2 z-40 w-[min(64rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] -translate-x-1/2 bg-white/95 shadow-lg backdrop-blur'
          : ''
      } ${className}`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs font-semibold text-gray-800 [&::-webkit-details-marker]:hidden">
        <svg
          className={`h-3 w-3 flex-shrink-0 text-gray-400 transition-transform ${
            open ? 'rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="flex-1 truncate">{title}</span>
        {counts.blocks > 0 && (
          <span className="flex-shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            {t('blockCount', { count: counts.blocks })}
          </span>
        )}
        {counts.warnings > 0 && (
          <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            {t('warningCount', { count: counts.warnings })}
          </span>
        )}
        {counts.blocks === 0 && counts.warnings === 0 && (
          <span className="flex-shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            {t('allClear')}
          </span>
        )}
      </summary>

      <div
        className={`border-t border-gray-200 p-3 ${
          docked ? 'max-h-[60vh] overflow-y-auto' : ''
        }`}
      >
        {notice}

        <div className={`grid gap-3 sm:grid-cols-2 ${notice ? 'mt-3' : ''}`}>
          {sections.map((section) => (
            <section
              key={section.key}
              className={section.span ? 'sm:col-span-2' : undefined}
            >
              <h4 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {section.title}
              </h4>
              <ul className="mt-1 space-y-1">
                {section.items.map((item) => (
                  <li
                    key={item.key}
                    className={`text-[11px] leading-relaxed ${severityClass[item.severity]}`}
                  >
                    {item.text}
                    {item.detail}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {disclaimer && (
          <p className="mt-3 text-[10px] text-gray-400">{disclaimer}</p>
        )}
      </div>
    </details>
  );
}
