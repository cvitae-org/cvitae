"use client";

import { useMemo, useState } from 'react';
import type { EvidenceChange, EvidenceCvVariant } from '../types';
import {
  buildVariantChanges,
  EvidenceValidationError,
  requiredChangeIds
} from '../evidence';
import {
  acceptAllVariantChanges,
  approveEvidenceCV,
  editVariantChange,
  toggleVariantChange
} from '../store';

function ChangeCard({
  submissionId,
  change,
  accepted,
  frozen
}: {
  submissionId: string;
  change: EvidenceChange;
  accepted: boolean;
  frozen: boolean;
}) {
  const [draft, setDraft] = useState(change.after);

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-xs font-semibold text-gray-800">{change.label}</h4>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <input
            type="checkbox"
            checked={accepted}
            disabled={frozen}
            onChange={() => toggleVariantChange(submissionId, change.id)}
            className="rounded border-gray-300 text-[#65B7FF] focus:ring-[#65B7FF]"
          />
          Accepted
        </label>
      </div>

      <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">
        Before
      </p>
      <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-gray-500">
        {change.before || 'Not present'}
      </p>

      <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">
        After
      </p>
      {change.editable && !frozen ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== change.after) {
              editVariantChange(submissionId, change.id, draft);
            }
          }}
          className="mt-1 min-h-20 w-full resize-y rounded-md border border-gray-300 px-2.5 py-2 text-xs leading-relaxed text-gray-800 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
        />
      ) : (
        <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-gray-800">
          {change.after || 'Removed from this variant'}
        </p>
      )}

      {change.evidence.length > 0 && (
        <div className="mt-2 rounded-md bg-green-50 px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-green-700">
            CV evidence
          </p>
          {change.evidence.map((item, index) => (
            <p key={`${index}-${item}`} className="mt-0.5 text-[11px] leading-relaxed text-green-900">
              {item}
            </p>
          ))}
        </div>
      )}
      {change.requirements.length > 0 && (
        <div className="mt-2 rounded-md bg-blue-50 px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">
            Matched vacancy requirement
          </p>
          {change.requirements.map((item, index) => (
            <p key={`${index}-${item}`} className="mt-0.5 text-[11px] leading-relaxed text-blue-900">
              {item}
            </p>
          ))}
        </div>
      )}
    </article>
  );
}

export function EvidenceReview({
  submissionId,
  variant,
  staleReasons,
  sent
}: {
  submissionId: string;
  variant: EvidenceCvVariant;
  staleReasons: string[];
  sent: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const changes = useMemo(() => buildVariantChanges(variant), [variant]);
  const required = useMemo(() => requiredChangeIds(variant), [variant]);
  const accepted = useMemo(
    () => new Set(variant.acceptedChangeIds),
    [variant.acceptedChangeIds]
  );
  const remaining = required.filter((id) => !accepted.has(id)).length;
  const frozen = variant.reviewState === 'approved' || sent;

  const approve = () => {
    setError(null);
    if (staleReasons.length > 0) {
      setError(`Regenerate first: ${staleReasons.join(', ')}.`);
      return;
    }
    try {
      approveEvidenceCV(submissionId);
    } catch (cause) {
      setError(
        cause instanceof EvidenceValidationError
          ? cause.issues.join(' ')
          : 'The variant could not be approved.'
      );
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {variant.output.skills.role}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {variant.meta.provider} / {variant.meta.model} · {variant.meta.promptVersion} ·{' '}
              {new Date(variant.meta.generatedAt).toLocaleString()}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
              variant.reviewState === 'approved'
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {variant.reviewState}
          </span>
        </div>
        {staleReasons.length > 0 && !sent && (
          <p className="mt-2 text-xs text-amber-700">
            Stale: {staleReasons.join(', ')}. Regenerate and review before sending.
          </p>
        )}
        {sent && (
          <p className="mt-2 text-xs text-gray-500">
            This sent variant is frozen with its original CV and offer snapshots.
          </p>
        )}
      </div>

      <div className="space-y-2">{changes.map((change) => (
        <ChangeCard
          key={change.id}
          submissionId={submissionId}
          change={change}
          accepted={accepted.has(change.id)}
          frozen={frozen}
        />
      ))}</div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <h4 className="text-xs font-semibold text-gray-800">Requirement evidence</h4>
        <div className="mt-2 space-y-1.5">
          {variant.proposal.requirementMatches.map((match) => {
            const requirement = variant.source.offer.requirements.find(
              (item) => item.id === match.requirementId
            );
            return (
              <div key={match.requirementId} className="flex items-start justify-between gap-3 text-[11px]">
                <div>
                  <p className="text-gray-800">{requirement?.exactText ?? match.requirementId}</p>
                  {match.explanation && <p className="text-gray-500">{match.explanation}</p>}
                </div>
                <span className="whitespace-nowrap rounded bg-white px-1.5 py-0.5 font-medium text-gray-600">
                  {match.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {!frozen && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => acceptAllVariantChanges(submissionId)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Accept all changes
          </button>
          <button
            type="button"
            onClick={approve}
            disabled={remaining > 0 || staleReasons.length > 0}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Approve variant
          </button>
          <span className="text-[11px] text-gray-500">
            {remaining === 0 ? 'Every change reviewed.' : `${remaining} change(s) still need acceptance.`}
          </span>
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
