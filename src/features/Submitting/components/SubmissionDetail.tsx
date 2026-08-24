"use client";

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { LocalizedError } from '@/components/LocalizedError';
import type { ErrorDescriptor } from '@/libs/i18n/errors';
import { locales, type Locale } from '@/libs/i18n/config';
import { useCvDocument } from '@/features/CV/hooks/useCvDocument';
import { NOT_STATED, type JobRecord } from '@/features/JobResearch/types';
import type { Submission, VariantStalenessReason } from '../types';
import {
  applyMethodOf,
  countOfferGaps,
  isSendable
} from '../types';
import { defaultSubject } from '../offerText';
import { patchApply, setLanguage } from '../store';
import { reopenSubmission, sendSubmission } from '../queue';
import {
  blobToBase64,
  buildMailto,
  createGmailDraft,
  readMailboxStatus,
  verifyRecipient,
  MAILTO_SAFE_BODY,
  type MailboxStatus,
  type RecipientVerification
} from '../send';
import { generateAtsPdf } from '@/features/CV/pdf/atsPdf';
import { portraitSource } from '@/features/CV/portrait';
import { usePortrait } from '@/features/CV/hooks/usePortrait';
import type { PendingAction } from '../hooks/useSubmitting';
import {
  EVIDENCE_SECTIONS,
  type EvidenceSection,
  variantStalenessReasons
} from '../evidence';
import { EvidenceReview } from './EvidenceReview';
import { ReadinessPanel } from '@/features/CV/components/ReadinessPanel';

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
  error: ErrorDescriptor | null;
  onGenerateCv: (
    submission: Submission,
    sections?: readonly EvidenceSection[]
  ) => void;
  /** Attaches the master CV unchanged, with no model call. */
  onAttachCvAsIs: (submission: Submission) => void;
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
  const t = useTranslations('submitting.detail');
  const common = useTranslations('common');

  return (
    <div
      role="group"
      aria-label={t('languageAria')}
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
            title={t('writeLanguage', {
              language: common(locale === 'en' ? 'english' : 'polish')
            })}
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
      className="h-4 w-4 rotate-45"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="miter"
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
  onAttachCvAsIs,
  onDraftEmail,
  onDismissError,
  record,
  onAnalyse,
  onRerun,
  isAnalysing
}: SubmissionDetailProps) {
  const t = useTranslations('submitting');
  const common = useTranslations('common');
  const format = useFormatter();
  // The attachment has to be the same document the download produces, portrait
  // included. A CV that differs depending on how it was sent is a CV nobody can
  // reason about after the fact.
  const { portrait } = usePortrait();
  const [copied, setCopied] = useState(false);

  /**
   * Which sections the next generation may write.
   *
   * The summary alone by default — the paragraph beside the portrait is the
   * part a vacancy actually changes the wording of, and the part a reader can
   * check in one read. Rewriting the headline, the skill order and every bullet
   * on a first press produces a document that has to be reviewed line by line
   * before anyone can tell whether it is still true.
   *
   * Clearing the row is how to ask for everything, and the hint says so.
   */
  const [sections, setSections] = useState<EvidenceSection[]>(['summary']);

  const { offer, apply, cv } = submission;
  const display = (value: string) =>
    value === 'Unknown'
      ? common('unknown')
      : value === NOT_STATED
        ? common('notStated')
        : value;
  const offerPosition = display(offer.position);
  const offerCompany = display(offer.company);
  const offerLocation = display(offer.location);

  // The name on the subject line comes from the CV being sent, in the language
  // it was written in — not from `messages`, where it used to live as
  // `cv.name`. A person's name is not a translation, and the copy under
  // `messages` could not be corrected by editing the CV.
  const { document: cvDocument } = useCvDocument(submission.language);
  const method = applyMethodOf(submission);
  const sent = Boolean(submission.sentAt);
  const staleReasons =
    cv && !sent
      ? variantStalenessReasons(
          cv,
          cvDocument,
          submission.offer,
          submission.language
        )
      : [];
  const staleText = (reasons: VariantStalenessReason[]) =>
    reasons.map((reason) => t(`stale.${reason}`)).join(', ');
  const applicationLanguage = submission.language.toUpperCase();

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

  /**
   * What other sources say the recipient should be.
   *
   * Tagged with its submission for the same reason the draft is: switching
   * offers must not leave the last one's findings on screen beside a different
   * address. Never auto-applied — `use` below is the only thing that writes to
   * the field, and it runs from a click.
   */
  const [verification, setVerification] = useState<{
    submissionId: string;
    result: RecipientVerification;
  } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<{
    submissionId: string;
    error: ErrorDescriptor;
  } | null>(null);

  const checked =
    verification?.submissionId === submission.id ? verification.result : null;
  const checkError =
    verifyError?.submissionId === submission.id ? verifyError.error : null;

  const handleVerify = useCallback(async (searchWeb = false) => {
    setVerifying(true);
    setVerifyError(null);

    const outcome = await verifyRecipient({
      searchWeb,
      offerText: record?.offer_text ?? undefined,
      url: offer.source_url || undefined,
      company: offer.company === NOT_STATED ? '' : offer.company,
      position: offer.position === NOT_STATED ? '' : offer.position,
      location: offer.location === NOT_STATED || offer.location === 'Unknown' ? '' : offer.location,
      current: apply.email
    });

    if (outcome.status === 'ok') {
      setVerification({ submissionId: submission.id, result: outcome.verification });
    } else {
      setVerifyError({
        submissionId: submission.id,
        error: outcome.error as ErrorDescriptor
      });
    }

    setVerifying(false);
  }, [
    apply.email,
    offer.company,
    offer.location,
    offer.position,
    offer.source_url,
    record?.offer_text,
    submission.id
  ]);

  /**
   * Whether the application can go straight into Gmail.
   *
   * Read once on mount rather than pushed from the server, because it is an
   * optional local process whose state changes outside this app entirely — a
   * mailbox connected in a browser tab five minutes ago, a service started
   * after the page loaded. A stale "not connected" costs one refresh; a
   * missing button costs the feature.
   */
  const [mailbox, setMailbox] = useState<MailboxStatus | null>(null);
  const [drafting, setDrafting] = useState(false);

  /**
   * The last draft and the last failure, each tagged with the submission it
   * belongs to.
   *
   * Tagged rather than cleared by an effect on `submission.id`, because an
   * effect that resets state runs *after* a render — so switching submission
   * would paint the previous offer's "draft created" confirmation for a frame
   * beside a different Send button. Comparing the tag while rendering has no
   * such window, and needs no effect at all.
   */
  const [draft, setDraft] = useState<{ submissionId: string; id: string } | null>(
    null
  );
  const [failure, setFailure] = useState<{
    submissionId: string;
    error: ErrorDescriptor;
  } | null>(null);

  const draftedId = draft?.submissionId === submission.id ? draft.id : null;
  const draftError =
    failure?.submissionId === submission.id ? failure.error : null;

  useEffect(() => {
    let cancelled = false;
    void readMailboxStatus().then((status) => {
      if (!cancelled) setMailbox(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Builds the CV, then the draft.
   *
   * The ATS export rather than the designed one, and that is the whole reason
   * this is worth automating: the designed PDF is a raster with no text layer,
   * so an applicant tracking system reads nothing from it. The file a person
   * would have picked out of ~/Downloads is the wrong one about half the time.
   *
   * `preflight` is honoured exactly as `AtsDownloadButton` honours it — a
   * document that fails its integrity check is not quietly attached to an
   * application.
   */
  const handleGmailDraft = useCallback(async () => {
    if (!cv) return;

    setDrafting(true);
    setFailure(null);
    setDraft(null);

    try {
      const pdf = await generateAtsPdf({
        document: cv.output,
        locale: submission.language,
        targetRole: offer.position,
        company: offer.company,
        portrait: portraitSource(portrait)
      });

      if (!pdf.preflight.ok) {
        setFailure({
          submissionId: submission.id,
          error: { code: 'submitting.mailAttachmentBlocked' }
        });
        return;
      }

      const outcome = await createGmailDraft({
        to: apply.email,
        subject,
        body: apply.body,
        fromName: cvDocument.personal.name,
        attachments: [
          {
            filename: pdf.filename,
            contentType: 'application/pdf',
            base64: await blobToBase64(pdf.blob)
          }
        ]
      });

      if (outcome.status === 'ok') {
        setDraft({ submissionId: submission.id, id: outcome.id });
        // Deliberately does *not* mark the submission sent. Nothing has been
        // sent — the draft is sitting in Gmail waiting to be read, and marking
        // it now would put "applied" against an application still in a folder.
        return;
      }

      setFailure({
        submissionId: submission.id,
        error: outcome.error as ErrorDescriptor
      });

      // A mailbox that turns out not to be connected is worth re-reading, so
      // the panel switches to the Connect link instead of offering the button
      // that just failed.
      if (outcome.reason === 'not_connected') {
        setMailbox(await readMailboxStatus());
      }
    } catch (cause) {
      setFailure({
        submissionId: submission.id,
        error: {
          code: 'submitting.mailDraftFailed',
          detail: cause instanceof Error ? cause.message.slice(0, 500) : undefined
        }
      });
    } finally {
      setDrafting(false);
    }
  }, [
    apply.body,
    apply.email,
    cv,
    cvDocument.personal.name,
    offer.company,
    offer.position,
    portrait,
    subject,
    submission.id,
    submission.language
  ]);

  const overLong = apply.body.length > MAILTO_SAFE_BODY;
  const sendable = isSendable(submission) && staleReasons.length === 0;

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
            {offerPosition}
          </h2>
          <p className="mt-0.5 truncate text-sm text-gray-500">
            {offerCompany}
            {offerLocation ? ` · ${offerLocation}` : ''}
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
              {t('detail.sentDate', {
                date: format.dateTime(new Date(submission.sentAt as string), {
                  dateStyle: 'medium'
                })
              })}
            </span>
          )}

          <LanguagePicker
            value={submission.language}
            onChange={(language) => setLanguage(submission.id, language)}
            disabled={busy || sent}
          />

          {/* The research table's own two actions, on the offer being applied
              to. Same icons, same wording, so they are recognisably the same
              thing done from a different page. */}
          {canAnalyse && (
            <button
              type="button"
              onClick={() => onAnalyse(submission)}
              disabled={busy || sent}
              title={t('detail.analyseTitle')}
              aria-label={t('detail.analyseAria', {
                position: offerPosition,
                company: offerCompany
              })}
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
              disabled={busy || sent}
              title={t('detail.rerunTitle')}
              aria-label={t('detail.rerunAria', {
                position: offerPosition,
                company: offerCompany
              })}
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
          {t(
            canAnalyse
              ? 'detail.gapsStored'
              : canRerun
                ? 'detail.gapsRerun'
                : 'detail.gapsUnstated',
            { count: gaps }
          )}
        </p>
      )}

      {!record && (
        <p className="text-xs text-gray-500">
          {t('detail.recordDeleted')}
        </p>
      )}

      {error && (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <LocalizedError error={error} className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={onDismissError}
            aria-label={common('dismiss')}
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
        title={t('detail.cvStepTitle')}
        hint={t('detail.cvStepHint', { language: applicationLanguage })}
        done={cv?.reviewState === 'approved'}
      >
        {cv && (
          <EvidenceReview
            submissionId={submission.id}
            variant={cv}
            staleReasons={staleReasons}
            sent={sent}
          />
        )}

        {!cv && submission.legacyVariants?.length ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {t('detail.legacyWarning')}
          </p>
        ) : null}

        <div className="mt-3">
          <ReadinessPanel document={cv?.output ?? cvDocument} variant={cv} />
        </div>

        {/*
          Which parts of an existing proposal a regeneration is allowed to
          replace. Absent before the first generation, when there is nothing to
          keep, and hidden once the variant is sent and frozen.
        */}
        {!sent && (
          <fieldset className="mt-3">
            <legend className="text-xs font-medium text-gray-700">
              {t('detail.regenerateSections')}
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {EVIDENCE_SECTIONS.map((section) => {
                const picked = sections.includes(section);
                return (
                  <button
                    key={section}
                    type="button"
                    onClick={() =>
                      setSections((current) =>
                        current.includes(section)
                          ? current.filter((name) => name !== section)
                          : [...current, section]
                      )
                    }
                    aria-pressed={picked}
                    className={`rounded px-2 py-1 text-[11px] transition-colors ${
                      picked
                        ? 'bg-[#65B7FF] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {t(`detail.sections.${section}`)}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              {sections.length === 0
                ? t('detail.regenerateAllHint')
                : t('detail.regenerateSomeHint')}
            </p>
          </fieldset>
        )}

        {/*
          Two ways past this step, side by side rather than one behind the
          other. Tailoring is what the page is for, so it keeps the primary
          button — but an application is not blocked on it: a CV that is
          already right for the vacancy can be attached as written, and that
          answer should not be hidden behind the one that costs a model call.
        */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onGenerateCv(submission, sections.length > 0 ? sections : undefined)
            }
            disabled={busy || sent}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:bg-gray-300 ${
              cv
                ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:bg-white disabled:opacity-50'
                : 'bg-[#65B7FF] text-white hover:bg-[#529ED5]'
            }`}
          >
            {pending === 'cv' ? (
              <>
                <Spinner />
                {t('detail.generating')}
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
                {cv ? t('detail.generateNew') : t('detail.generate')}
              </>
            )}
          </button>

          {!sent && (
            <button
              type="button"
              onClick={() => onAttachCvAsIs(submission)}
              // Nothing to do when the CV already sits here unchanged and
              // still matches the document it was copied from. Once it is
              // stale this is the one-click way to refresh it.
              disabled={
                busy ||
                (cv?.meta.origin === 'as-is' && staleReasons.length === 0)
              }
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              {cv?.meta.origin === 'as-is'
                ? t('detail.reattachAsIs')
                : t('detail.attachAsIs')}
            </button>
          )}
        </div>

        {!sent && (
          <p className="mt-1.5 text-[11px] text-gray-400">
            {t('detail.attachAsIsHint')}
          </p>
        )}
      </Step>

      <Step
        index={2}
        title={t('detail.destinationTitle')}
        hint={
          method === 'email'
            ? t('detail.destinationEmailHint')
            : t('detail.destinationLinkHint')
        }
        done={method === 'email' || Boolean(offer.source_url)}
      >
        <label
          htmlFor="apply-email"
          className="block text-xs font-medium text-gray-600"
        >
          {t('detail.sendTo')}
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

        {offer.how_to_apply &&
          offer.how_to_apply !== NOT_STATED &&
          offer.how_to_apply !== 'Unknown' && (
          <p className="mt-2 text-xs text-gray-500">
            {t('detail.offerSays', { instruction: offer.how_to_apply })}
          </p>
        )}

        {/* Where it goes, checked against sources the posting does not control.
            Everything below is a suggestion: only the Use button writes to the
            field above, and only from a click. */}
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleVerify(false)}
              disabled={verifying}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {verifying ? (
                <>
                  <Spinner />
                  {t('detail.verifyRunning')}
                </>
              ) : (
                t(checked ? 'detail.verifyRecheck' : 'detail.verifyRun')
              )}
            </button>
            <span className="text-[11px] text-gray-400">{t('detail.verifyHint')}</span>
          </div>

          {checkError && (
            <LocalizedError error={checkError} className="mt-2 text-xs text-red-600" />
          )}

          {checked && (
            <div className="mt-3 space-y-2">
              {/* What is in the field now. Warnings, never a block. */}
              {checked.current.warnings.length > 0 ? (
                <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2">
                  {checked.current.warnings.map((warning) => (
                    <li key={warning} className="text-xs text-amber-800">
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : (
                apply.email.trim() && (
                  <p className="text-xs text-green-700">{t('detail.verifyCurrentOk')}</p>
                )
              )}

              {checked.company_publishes_no_address && (
                <p className="text-xs text-gray-600">{t('detail.verifyFormOnly')}</p>
              )}

              {/* The right answer when the employer takes no email at all. */}
              {checked.apply_url && (
                <p className="text-xs text-gray-600">
                  {t('detail.verifyApplyLink')}{' '}
                  <a
                    href={checked.apply_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#65B7FF] hover:underline"
                  >
                    {checked.apply_url}
                  </a>
                </p>
              )}

              {/* How much the domain comparison behind every badge is worth. */}
              {checked.anchor_trust === 'guessed' && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {t('detail.verifyGuessedDomain')}
                </p>
              )}
              {checked.anchor_trust === 'discovered' && (
                <p className="text-[11px] text-gray-500">
                  {t('detail.verifyDiscoveredDomain')}
                </p>
              )}

              {/* The pages that were read, as links.
                  When an employer publishes no address — which is most of them
                  now — this *is* the answer: a careers page you can open and
                  apply through, rather than a count of sources that helps
                  nobody. It was already being gathered and only summarised. */}
              {checked.sources_read.some((s) => s.source === 'company_site') && (
                <>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {t('detail.verifyCompanyPages')}
                  </p>
                  <ul className="space-y-1">
                    {checked.sources_read
                      .filter((source) => source.source === 'company_site')
                      // Careers first: it is the one worth clicking.
                      .sort((a, b) =>
                        Number(b.page === 'careers') - Number(a.page === 'careers')
                      )
                      .map((source) => (
                        <li key={source.url} className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              source.page === 'careers'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {t(
                              source.page === 'careers'
                                ? 'detail.verifyPageCareers'
                                : source.page === 'contact'
                                  ? 'detail.verifyPageContact'
                                  : 'detail.verifyPageHome'
                            )}
                          </span>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-xs text-[#65B7FF] hover:underline"
                          >
                            {source.url}
                          </a>
                        </li>
                      ))}
                  </ul>
                </>
              )}

              {checked.candidates.length === 0 ? (
                <p className="text-xs text-gray-500">{t('detail.verifyNoFindings')}</p>
              ) : (
                <>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {t('detail.verifyCandidates')}
                  </p>
                  <ul className="space-y-2">
                    {checked.candidates.map((candidate) => (
                      <li
                        key={candidate.address}
                        className="rounded-lg border border-gray-200 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              candidate.confidence === 'high'
                                ? 'bg-green-100 text-green-700'
                                : candidate.confidence === 'medium'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {t(
                              candidate.confidence === 'high'
                                ? 'detail.verifyConfidenceHigh'
                                : candidate.confidence === 'medium'
                                  ? 'detail.verifyConfidenceMedium'
                                  : 'detail.verifyConfidenceLow'
                            )}
                          </span>
                          <span className="font-mono text-xs text-gray-900">
                            {candidate.address}
                          </span>
                          {candidate.address !== apply.email.trim().toLowerCase() && (
                            <button
                              type="button"
                              onClick={() =>
                                patchApply(submission.id, { email: candidate.address })
                              }
                              className="ml-auto rounded-md border border-[#65B7FF] px-2 py-0.5 text-[11px] font-medium text-[#65B7FF] transition-colors hover:bg-[#65B7FF]/10"
                            >
                              {t('detail.verifyUse')}
                            </button>
                          )}
                        </div>

                        <ul className="mt-1 space-y-0.5">
                          {candidate.why.map((reason) => (
                            <li key={reason} className="text-[11px] text-gray-500">
                              {reason}
                            </li>
                          ))}
                        </ul>

                        {/* Provenance, so a person can go and look rather than
                            take the confidence chip on trust. */}
                        <ul className="mt-1 space-y-0.5">
                          {candidate.evidence.map((entry) => (
                            <li key={entry.url} className="truncate">
                              <a
                                href={entry.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-[#65B7FF] hover:underline"
                              >
                                {entry.url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* Escalation, offered only once the free tiers have run and
                  produced nothing on a domain anyone vouched for. */}
              {checked.anchor_trust !== 'board' &&
                !checked.candidates.some((c) => c.confidence === 'high') && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleVerify(true)}
                      disabled={verifying}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                      {verifying ? (
                        <>
                          <Spinner />
                          {t('detail.verifySearching')}
                        </>
                      ) : (
                        t('detail.verifySearchWeb')
                      )}
                    </button>
                    <span className="text-[11px] text-gray-400">
                      {t('detail.verifySearchHint')}
                    </span>
                  </div>
                )}

              <p className="text-[11px] text-gray-400">
                {t('detail.verifySourcesRead', { count: checked.sources_read.length })}
              </p>
            </div>
          )}
        </div>
      </Step>

      {method === 'email' && (
        <Step
          index={3}
          title={t('detail.emailTitle')}
          hint={t('detail.emailHint', { language: applicationLanguage })}
          done={apply.body.trim() !== ''}
        >
          <label
            htmlFor="apply-subject"
            className="block text-xs font-medium text-gray-600"
          >
            {t('detail.subject')}
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
            {t('detail.message')}
          </label>
          <textarea
            id="apply-body"
            value={apply.body}
            onChange={(event) =>
              patchApply(submission.id, { body: event.target.value })
            }
            placeholder={t('detail.messagePlaceholder')}
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
                  {t('detail.drafting')}
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
                  {apply.body.trim()
                    ? t('detail.redraft')
                    : t('detail.draft')}
                </>
              )}
            </button>

            {apply.body.trim() && (
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {copied ? t('detail.copied') : t('detail.copy')}
              </button>
            )}

            {apply.body.trim() && (
              <span className="text-[11px] text-gray-400">
                {t('detail.characters', { count: apply.body.length })}
              </span>
            )}
          </div>

          {overLong && (
            <p className="mt-2 text-xs text-amber-700">
              {t('detail.longMessage')}
            </p>
          )}
        </Step>
      )}

      <Step
        index={method === 'email' ? 4 : 3}
        title={t('detail.sendTitle')}
        hint={
          method === 'email'
            ? t('detail.sendEmailHint')
            : t('detail.sendLinkHint')
        }
        done={sent}
      >
        {sent ? (
          <div className="flex flex-wrap items-center gap-3">
            {/* Deliberately does not report what the research row now says:
                a row already moved to "interview" keeps that, and a claim
                that it reads "applied" would be wrong exactly there. */}
            <p className="text-sm text-gray-600">
              {t('detail.markedSent', {
                date: format.dateTime(new Date(submission.sentAt as string), {
                  dateStyle: 'medium',
                  timeStyle: 'short'
                })
              })}
            </p>
            <button
              type="button"
              onClick={() => reopenSubmission(submission.id)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              {t('detail.markNotSent')}
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
                onClick={(event) => {
                  if (!sendSubmission(submission.id)) event.preventDefault();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-[#65B7FF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#529ED5]"
              >
                <SendIcon />
                {method === 'email'
                  ? t('detail.send')
                  : t('detail.openAndMark')}
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
                {method === 'email'
                  ? t('detail.send')
                  : t('detail.openAndMark')}
              </button>
            )}

            {/* The Gmail path, beside the mail-client one rather than instead
                of it. A mailbox nobody connected, or a service nobody started,
                falls back to exactly the flow that existed before. */}
            {method === 'email' && sendable && mailbox && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                {draftedId ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-green-700">
                      {t('detail.gmailDraftReady')}
                    </p>
                    <a
                      href="https://mail.google.com/mail/u/0/#drafts"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      {t('detail.gmailOpenDrafts')}
                    </a>
                  </div>
                ) : !mailbox.running ? (
                  <p className="text-xs text-gray-500">
                    {t('detail.gmailNotRunning')}
                  </p>
                ) : !mailbox.connected ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href={mailbox.connectUrl ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-[#65B7FF] bg-white px-3 py-1.5 text-xs font-medium text-[#65B7FF] transition-colors hover:bg-[#65B7FF]/10"
                    >
                      {t('detail.gmailConnect')}
                    </a>
                    <span className="text-xs text-gray-500">
                      {t('detail.gmailConnectHint')}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleGmailDraft}
                      disabled={drafting}
                      className="inline-flex items-center gap-2 rounded-lg border border-[#65B7FF] bg-white px-3 py-1.5 text-xs font-medium text-[#65B7FF] transition-colors hover:bg-[#65B7FF]/10 disabled:opacity-50"
                    >
                      {drafting ? (
                        <>
                          <Spinner />
                          {t('detail.gmailDrafting')}
                        </>
                      ) : (
                        t('detail.gmailDraft')
                      )}
                    </button>
                    {mailbox.email && (
                      <span className="text-[11px] text-gray-400">
                        {t('detail.gmailAccount', { email: mailbox.email })}
                      </span>
                    )}
                  </div>
                )}

                {draftError && (
                  <LocalizedError error={draftError} className="mt-2 text-xs text-red-600" />
                )}
              </div>
            )}

            {!sendable && (
              <p className="mt-2 text-xs text-gray-500">
                {!cv
                  ? t('detail.blockerNoCv')
                  : cv.reviewState !== 'approved'
                    ? t('detail.blockerUnapproved')
                    : staleReasons.length > 0
                      ? t('detail.blockerStale', {
                          reasons: staleText(staleReasons)
                        })
                      : method === 'email'
                        ? t('detail.blockerMessage')
                        : t('detail.blockerDestination')}
              </p>
            )}
          </>
        )}
      </Step>
    </div>
  );
}
