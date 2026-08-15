"use client";

import { useCallback, useState } from 'react';
import { locales, type Locale } from '@/libs/i18n/config';
import { useCvDocument } from '@/features/CV/hooks/useCvDocument';
import type { JobRecord } from '@/features/JobResearch/types';
import type { Submission } from '../types';
import {
  applyMethodOf,
  countOfferGaps,
  isCvStale,
  isSendable,
  stageOf
} from '../types';
import { defaultSubject } from '../offerText';
import { patchApply, setLanguage } from '../store';
import { reopenSubmission, sendSubmission } from '../queue';
import { buildMailto, MAILTO_SAFE_BODY } from '../send';
import type { PendingAction } from '../hooks/useSubmitting';

/**
 * One application, from a queued offer to a sent email.
 *
 * The steps are laid out in the order they happen and none of them is hidden
 * behind the one before it — a draft can be written before the CV is
 * generated, and an offer that applies through a form skips the email
 * entirely. What the steps do is report their own state, so what is left to do
 * is readable without a wizard deciding it.
 */

type SubmissionDetailProps = {
  submission: Submission;
  pending: PendingAction;
  error: string | null;
  onGenerateCv: (submission: Submission) => void;
  onDraftEmail: (submission: Submission) => void;
  onDismissError: () => void;
  /** The research row behind this offer, while it still exists. */
  record: JobRecord | undefined;
  /** Fills the analysed fields from the stored text, without re-fetching. */
  onAnalyse: (submission: Submission) => void;
  /** Reads the posting again, for offers that carry no stored text. */
  onRerun: (submission: Submission) => void;
  isAnalysing: boolean;
};

/**
 * The language the CV and the email are written in.
 *
 * A per-application choice, not the app's: a Polish posting is worth answering
 * in Polish from an English UI. Changing it re-renders the CV preview in that
 * language too, so the generated summary and the document around it can never
 * disagree.
 */
function LanguagePicker({
  value,
  onChange,
  disabled
}: {
  value: Locale;
  onChange: (language: Locale) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Language of the CV and email"
      className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-gray-200 p-0.5"
    >
      {locales.map((locale) => {
        const isActive = locale === value;

        return (
          <button
            key={locale}
            type="button"
            onClick={() => onChange(locale)}
            disabled={disabled}
            aria-pressed={isActive}
            title={`Write the CV and email in ${locale.toUpperCase()}`}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold uppercase transition-colors disabled:opacity-50 ${
              isActive
                ? 'bg-[#65B7FF] text-white'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            {locale}
          </button>
        );
      })}
    </div>
  );
}

function Step({
  index,
  title,
  hint,
  done,
  children
}: {
  index: number;
  title: string;
  hint?: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-gray-200 pt-4">
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
            done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {done ? '✓' : index}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-gray-900">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

function SendIcon() {
  return (
    <svg
      className="h-4 w-4"
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
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function SubmissionDetail({
  submission,
  pending,
  error,
  onGenerateCv,
  onDraftEmail,
  onDismissError,
  record,
  onAnalyse,
  onRerun,
  isAnalysing
}: SubmissionDetailProps) {
  const [copied, setCopied] = useState(false);

  const { offer, apply, cv } = submission;

  // The name on the subject line comes from the CV being sent, in the language
  // it was written in — not from `messages`, where it used to live as
  // `cv.name`. A person's name is not a translation, and the copy under
  // `messages` could not be corrected by editing the CV.
  const { document: cvDocument } = useCvDocument(submission.language);
  const stage = stageOf(submission);
  const method = applyMethodOf(submission);
  const sent = Boolean(submission.sentAt);

  // Any model call blocks the others: they share one panel, and a second
  // click landing on top of the first would leave the panel describing work
  // that is no longer happening.
  const busy = pending !== null || isAnalysing;

  // Only imported rows carry the scrape, and only they arrive with the
  // analysed fields empty. A row researched from a URL was analysed on the way
  // in and has nothing to fill.
  const canAnalyse = Boolean(record?.offer_text);
  const canRerun = Boolean(record?.source_url);
  const gaps = countOfferGaps(offer);

  // An empty subject is not a blocker — it resolves to this, and the input
  // shows it as a placeholder so what will be sent is never a surprise.
  const subject =
    apply.subject.trim() ||
    defaultSubject(offer, cvDocument.personal.name, submission.language);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(apply.body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [apply.body]);

  const overLong = apply.body.length > MAILTO_SAFE_BODY;
  const sendable = isSendable(submission);

  /**
   * Where the send goes: a pre-written draft in the mail client, or the
   * board's own page. Either way it is a real link, so the browser does the
   * navigating and the click handler only has to record that it happened.
   */
  const sendHref =
    method === 'email'
      ? buildMailto({ to: apply.email.trim(), subject, body: apply.body })
      : offer.source_url;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gray-900">
            {offer.position}
          </h2>
          <p className="mt-0.5 truncate text-sm text-gray-500">
            {offer.company}
            {offer.location ? ` · ${offer.location}` : ''}
          </p>
          {offer.source_url && (
            <a
              href={offer.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block truncate text-xs text-[#65B7FF] hover:underline"
            >
              {offer.source_url}
            </a>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {sent && (
            <span className="rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-medium text-green-700">
              Sent {new Date(submission.sentAt as string).toLocaleDateString()}
            </span>
          )}

          <LanguagePicker
            value={submission.language}
            onChange={(language) => setLanguage(submission.id, language)}
            disabled={busy}
          />

          {/* The research table's own two actions, on the offer being applied
              to. Same icons, same wording, so they are recognisably the same
              thing done from a different page. */}
          {canAnalyse && (
            <button
              type="button"
              onClick={() => onAnalyse(submission)}
              disabled={busy}
              title="Fill the analysed fields from the stored text (no re-fetch)"
              aria-label={`Analyse the stored text for ${offer.position} at ${offer.company}`}
              className="rounded-md p-1.5 text-gray-300 transition-colors hover:bg-gray-100 hover:text-[#65B7FF] disabled:opacity-40"
            >
              {isAnalysing ? (
                <Spinner />
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                  />
                </svg>
              )}
            </button>
          )}

          {canRerun && (
            <button
              type="button"
              onClick={() => onRerun(submission)}
              disabled={busy}
              title="Read the posting again and re-run the analysis"
              aria-label={`Re-run the analysis for ${offer.position} at ${offer.company}`}
              className="rounded-md p-1.5 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
            >
              {isAnalysing && !canAnalyse ? (
                <Spinner />
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              )}
            </button>
          )}
        </div>
      </header>

      {/* The reason to press Analyse, stated rather than left to be noticed:
          an imported offer reaches this page with most of its analysed fields
          empty, and those are what a tailored CV is built out of. */}
      {gaps > 0 && (
        <p className="text-xs text-gray-500">
          {gaps} analysed field{gaps === 1 ? '' : 's'} still empty
          {canAnalyse
            ? ' — Analyse fills them from the stored offer text, which gives the CV and the email more to work with.'
            : canRerun
              ? ' — Re-run reads the posting again to fill them.'
              : ' — the offer stated nothing about them.'}
        </p>
      )}

      {!record && (
        <p className="text-xs text-gray-500">
          The research row for this offer has been deleted. The application
          still works from the copy stored here, but the offer cannot be
          analysed again.
        </p>
      )}

      {error && (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            aria-label="Dismiss"
            className="flex-shrink-0 text-amber-600 hover:text-amber-800"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      <Step
        index={1}
        title="Tailor the CV"
        hint={`Rewrites the title and summary for this offer, in ${submission.language.toUpperCase()}. Everything else on the CV is fact and stays as it is.`}
        done={Boolean(cv)}
      >
        {cv ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-400">
              Title
            </p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">
              {cv.title}
            </p>
            <p className="mt-2.5 text-[10px] uppercase tracking-wider text-gray-400">
              Summary
            </p>
            <p className="mt-0.5 text-sm italic leading-relaxed text-gray-700">
              {cv.summary}
            </p>
            <p className="mt-2.5 text-[11px] text-gray-400">
              Generated {new Date(cv.generatedAt).toLocaleString()} in{' '}
              {cv.language.toUpperCase()} — the full CV is below.
            </p>

            {/* Two ways a generated CV goes out of date, both of them silent
                without saying so: the language moved on under it, or the offer
                it was written from got fuller. */}
            {cv.language !== submission.language && (
              <p className="mt-2 text-xs text-amber-700">
                The application is now set to{' '}
                {submission.language.toUpperCase()} — regenerate to write the
                title and summary in it. The rest of the CV below has already
                switched.
              </p>
            )}

            {isCvStale(submission) && (
              <p className="mt-2 text-xs text-amber-700">
                The offer was analysed again after this was written — regenerate
                to use what that filled in.
              </p>
            )}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => onGenerateCv(submission)}
          disabled={busy}
          className={`mt-3 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:bg-gray-300 ${
            cv
              ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:bg-white disabled:opacity-50'
              : 'bg-[#65B7FF] text-white hover:bg-[#529ED5]'
          }`}
        >
          {pending === 'cv' ? (
            <>
              <Spinner />
              Generating…
            </>
          ) : (
            <>
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              {cv ? 'Regenerate' : 'Generate CV'}
            </>
          )}
        </button>
      </Step>

      <Step
        index={2}
        title="Where it goes"
        hint={
          method === 'email'
            ? 'Taken from the posting where it printed an address. Correct it if it is wrong.'
            : 'No address in the posting — this one applies through its own page. Add an address here to send by email instead.'
        }
        done={method === 'email' || Boolean(offer.source_url)}
      >
        <label
          htmlFor="apply-email"
          className="block text-xs font-medium text-gray-600"
        >
          Send to
        </label>
        <input
          id="apply-email"
          type="email"
          value={apply.email}
          onChange={(event) =>
            patchApply(submission.id, { email: event.target.value })
          }
          placeholder="recruitment@company.com"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 transition-colors placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
        />

        {offer.how_to_apply && offer.how_to_apply !== 'Not stated' && (
          <p className="mt-2 text-xs text-gray-500">
            The offer says: {offer.how_to_apply}
          </p>
        )}
      </Step>

      {method === 'email' && (
        <Step
          index={3}
          title="The email"
          hint={`A short covering note, in ${submission.language.toUpperCase()}. The CV is attached to it, so it does not repeat the CV.`}
          done={apply.body.trim() !== ''}
        >
          <label
            htmlFor="apply-subject"
            className="block text-xs font-medium text-gray-600"
          >
            Subject
          </label>
          <input
            id="apply-subject"
            type="text"
            value={apply.subject}
            onChange={(event) =>
              patchApply(submission.id, { subject: event.target.value })
            }
            placeholder={subject}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 transition-colors placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
          />

          <label
            htmlFor="apply-body"
            className="mt-3 block text-xs font-medium text-gray-600"
          >
            Message
          </label>
          <textarea
            id="apply-body"
            value={apply.body}
            onChange={(event) =>
              patchApply(submission.id, { body: event.target.value })
            }
            placeholder="Write it yourself, or draft it below and edit."
            className="mt-1 h-56 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed text-gray-900 transition-colors placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onDraftEmail(submission)}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg border border-[#65B7FF] bg-white px-3 py-1.5 text-xs font-medium text-[#65B7FF] transition-colors hover:bg-[#65B7FF]/10 disabled:opacity-50"
            >
              {pending === 'email' ? (
                <>
                  <Spinner />
                  Drafting…
                </>
              ) : (
                <>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  {apply.body.trim() ? 'Redraft with AI' : 'Draft with AI'}
                </>
              )}
            </button>

            {apply.body.trim() && (
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}

            {apply.body.trim() && (
              <span className="text-[11px] text-gray-400">
                {apply.body.length} characters
              </span>
            )}
          </div>

          {overLong && (
            <p className="mt-2 text-xs text-amber-700">
              Long messages can be cut off on the way to a mail client. If the
              draft opens truncated, copy it and paste it in.
            </p>
          )}
        </Step>
      )}

      <Step
        index={method === 'email' ? 4 : 3}
        title="Send"
        hint={
          method === 'email'
            ? 'Opens a draft in your mail client, already addressed and written. Attach the CV PDF — download it from beside the preview below — and send it from there. The offer is marked applied in research.'
            : 'Opens the posting so you can apply through its form, and marks the offer applied in research.'
        }
        done={sent}
      >
        {sent ? (
          <div className="flex flex-wrap items-center gap-3">
            {/* Deliberately does not report what the research row now says:
                a row already moved to "interview" keeps that, and a claim
                that it reads "applied" would be wrong exactly there. */}
            <p className="text-sm text-gray-600">
              Marked as sent on{' '}
              {new Date(submission.sentAt as string).toLocaleString()}.
            </p>
            <button
              type="button"
              onClick={() => reopenSubmission(submission.id)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              Mark as not sent
            </button>
          </div>
        ) : (
          <>
            {sendable ? (
              <a
                href={sendHref}
                // A mail draft belongs in the mail client, not a browser tab;
                // the board's page does belong in one, and must not be able to
                // reach back into this page through window.opener.
                {...(method === 'email'
                  ? {}
                  : { target: '_blank', rel: 'noopener noreferrer' })}
                onClick={() => sendSubmission(submission.id)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#65B7FF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#529ED5]"
              >
                <SendIcon />
                {method === 'email' ? 'Send' : 'Open the posting & mark applied'}
              </a>
            ) : (
              // A link cannot be disabled, and a disabled-looking link that
              // still navigates is worse than a button that says no.
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-gray-300 px-4 py-2 text-sm font-medium text-white"
              >
                <SendIcon />
                {method === 'email' ? 'Send' : 'Open the posting & mark applied'}
              </button>
            )}

            {stage !== 'ready' && (
              <p className="mt-2 text-xs text-gray-500">
                {!cv
                  ? 'Generate the CV first — it is what is being sent.'
                  : method === 'email'
                    ? 'Write or draft the message first.'
                    : 'This offer has no address and no link, so there is nowhere to send it. Add an address above.'}
              </p>
            )}
          </>
        )}
      </Step>
    </div>
  );
}
