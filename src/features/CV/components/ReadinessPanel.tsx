"use client";

import { useMemo } from 'react';
import type { CvDocument } from '../document';
import type { EvidenceCvVariant } from '@/features/Submitting/types';
import {
  runReadinessChecks,
  type ReadinessCategory
} from '../readiness';

const labels: Record<ReadinessCategory, string> = {
  'pdf-integrity': 'PDF integrity',
  'parsed-field-coverage': 'Parsed-field coverage',
  'role-evidence': 'Role evidence',
  'human-scan-quality': 'Human scan quality',
  'application-knockouts': 'Application knockouts'
};

export function ReadinessPanel({
  document,
  variant
}: {
  document: CvDocument;
  variant?: EvidenceCvVariant;
}) {
  const report = useMemo(
    () => runReadinessChecks({ document, variant }),
    [document, variant]
  );

  return (
    <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-gray-800">
        Readiness checks (separate, evidence-based results)
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(Object.keys(labels) as ReadinessCategory[]).map((category) => (
          <section key={category}>
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {labels[category]}
            </h4>
            <ul className="mt-1 space-y-1">
              {report[category].map((item, index) => (
                <li
                  key={`${item.code}-${index}`}
                  className={`text-[11px] leading-relaxed ${
                    item.severity === 'block'
                      ? 'text-red-700'
                      : item.severity === 'warning'
                        ? 'text-amber-700'
                        : 'text-gray-600'
                  }`}
                >
                  {item.message}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-gray-400">
        These checks do not predict callbacks and are not an ATS score.
      </p>
    </details>
  );
}
