import { NOT_STATED } from '@/features/JobResearch/types';
import {
  normalizeOfferText,
  normalizeRequirements
} from '@/features/JobResearch/requirements';
import { parseDocument } from '@/features/CV/document';
import type {
  ApplyDraft,
  EvidenceCvProposal,
  EvidenceCvVariant,
  LegacyCvVariant,
  OfferSnapshot,
  Submission,
  SubmittingState
} from './types';
import { asLocale, requirementMatchStatuses } from './types';
import {
  buildCvFactCatalog,
  fingerprintCv,
  fingerprintOffer,
  proposalMaterializationIssues,
  protectedFieldIssues,
  requiredChangeIds,
  validateEvidenceProposal
} from './evidence';

/**
 * What a stored queue of applications means.
 *
 * Kept under its own key rather than folded into the research payload, so that
 * clearing a research tab — which deletes rows outright — cannot take a
 * half-written application with it. Same versioned-payload and defensive-read
 * discipline as `JobResearch/storage.ts`: a corrupt entry is dropped, not
 * allowed to break the page. Where it is kept is `createPersistedStore`'s job.
 */

export const STORAGE_KEY = 'cvitae.submitting.v1';
export const STORAGE_VERSION = 2;

type StoredPayload = {
  version: number;
  submissions: Submission[];
  activeId?: string | null;
};

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const strList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

/**
 * Rebuilds the snapshot field by field.
 *
 * The snapshot is written from a `JobRecord`, and that record's shape has
 * already changed once (see `migrate` in research storage). Filling gaps here
 * means a submission queued under an older shape still renders, instead of
 * printing `undefined` into a prompt.
 */
const toSnapshot = (value: unknown): OfferSnapshot => {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const text = (key: string) => {
    const found = raw[key];
    return typeof found === 'string' && found.trim() ? found : NOT_STATED;
  };

  return {
    company: text('company'),
    company_type: text('company_type'),
    company_size: text('company_size'),
    position: text('position'),
    role_profile: text('role_profile'),
    seniority: text('seniority'),
    location: text('location'),
    work_mode:
      raw.work_mode === 'remote' ||
      raw.work_mode === 'hybrid' ||
      raw.work_mode === 'onsite'
        ? raw.work_mode
        : 'unknown',
    salary: text('salary'),
    contract_type: text('contract_type'),
    engagement_length: text('engagement_length'),
    start_date: text('start_date'),
    ideal_candidate: text('ideal_candidate'),
    responsibilities: strList(raw.responsibilities),
    team: text('team'),
    how_to_apply: text('how_to_apply'),
    required_skills: strList(raw.required_skills),
    requirements: normalizeRequirements(raw.requirements, {
      required_skills: strList(raw.required_skills),
      responsibilities: strList(raw.responsibilities)
    }),
    source_url: str(raw.source_url),
    locale: str(raw.locale, 'en'),
    offer_text: normalizeOfferText(str(raw.offer_text))
  };
};

const toApply = (value: unknown): ApplyDraft => {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    email: str(raw.email),
    subject: str(raw.subject),
    body: str(raw.body)
  };
};

const toLegacyVariant = (value: unknown): LegacyCvVariant | null => {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const summary = str(raw.summary);
  if (!summary.trim()) return null;
  return {
    version: 'legacy-v1-unverified',
    title: str(raw.title),
    summary,
    language: asLocale(raw.language),
    generatedAt: str(raw.generatedAt) || new Date(0).toISOString(),
    historicalSentAt:
      typeof raw.historicalSentAt === 'string'
        ? raw.historicalSentAt
        : undefined
  };
};

const stringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const citedText = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.text === 'string' &&
    stringArray(raw.evidenceIds) &&
    stringArray(raw.requirementIds)
  );
};

const toProposal = (value: unknown): EvidenceCvProposal | null => {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (
    !citedText(raw.headline) ||
    !Array.isArray(raw.summaryClaims) ||
    !raw.summaryClaims.every(citedText) ||
    !Array.isArray(raw.skills) ||
    !raw.skills.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).evidenceId === 'string' &&
        stringArray((item as Record<string, unknown>).requirementIds)
    ) ||
    !Array.isArray(raw.experience) ||
    !raw.experience.every((entry) => {
      if (typeof entry !== 'object' || entry === null) return false;
      const item = entry as Record<string, unknown>;
      return (
        typeof item.jobIndex === 'number' &&
        Array.isArray(item.bullets) &&
        item.bullets.every(
          (bullet) =>
            citedText(bullet) &&
            typeof (bullet as Record<string, unknown>).sourceEvidenceId === 'string'
        )
      );
    }) ||
    !Array.isArray(raw.requirementMatches) ||
    !raw.requirementMatches.every((entry) => {
      if (typeof entry !== 'object' || entry === null) return false;
      const item = entry as Record<string, unknown>;
      return (
        typeof item.requirementId === 'string' &&
        typeof item.status === 'string' &&
        (requirementMatchStatuses as readonly string[]).includes(item.status) &&
        stringArray(item.evidenceIds) &&
        typeof item.explanation === 'string'
      );
    })
  ) {
    return null;
  }
  return raw as unknown as EvidenceCvProposal;
};

/** Defensive reconstruction of v2 while keeping snapshot documents parseable. */
const toEvidenceVariant = (value: unknown): EvidenceCvVariant | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 'evidence-v2') return undefined;
  const source =
    typeof raw.source === 'object' && raw.source !== null
      ? (raw.source as Record<string, unknown>)
      : null;
  const meta =
    typeof raw.meta === 'object' && raw.meta !== null
      ? (raw.meta as Record<string, unknown>)
      : null;
  const proposal = toProposal(raw.proposal);
  if (
    !source ||
    !meta ||
    !proposal
  ) {
    return undefined;
  }

  const language = asLocale(meta.language);
  const sourceCv = parseDocument(source.cv, language);
  const sourceOffer = toSnapshot(source.offer);
  const output = parseDocument(raw.output, language);
  const cvFingerprint = str(source.cvFingerprint);
  const offerFingerprint = str(source.offerFingerprint);
  const acceptedChangeIds = strList(raw.acceptedChangeIds);
  const reconstructed: EvidenceCvVariant = {
    version: 'evidence-v2',
    id: str(raw.id) || `variant-${Date.now()}`,
    source: {
      cv: sourceCv,
      offer: sourceOffer,
      cvFingerprint,
      offerFingerprint
    },
    output,
    proposal,
    acceptedChangeIds,
    reviewState: 'draft',
    meta: {
      provider: str(meta.provider, 'unknown'),
      model: str(meta.model, 'unknown'),
      promptVersion: str(meta.promptVersion, 'unknown'),
      generatedAt: str(meta.generatedAt) || new Date(0).toISOString(),
      updatedAt: str(meta.updatedAt) || str(meta.generatedAt) || new Date(0).toISOString(),
      language
    }
  };
  const accepted = new Set(acceptedChangeIds);
  const locallyValid =
    cvFingerprint === fingerprintCv(sourceCv) &&
    offerFingerprint === fingerprintOffer(sourceOffer) &&
    protectedFieldIssues(sourceCv, output).length === 0 &&
    proposalMaterializationIssues(
      sourceCv,
      output,
      proposal,
      language
    ).length === 0 &&
    validateEvidenceProposal(
      proposal,
      buildCvFactCatalog(sourceCv, language),
      sourceOffer.requirements
    ).length === 0 &&
    requiredChangeIds(reconstructed).every((id) => accepted.has(id));

  return {
    ...reconstructed,
    reviewState:
      raw.reviewState === 'approved' && locallyValid ? 'approved' : 'draft',
    approvedAt:
      raw.reviewState === 'approved' && locallyValid && typeof raw.approvedAt === 'string'
        ? raw.approvedAt
        : undefined
  };
};

/**
 * An entry is kept if it can be identified and pointed at an offer. Everything
 * below that — the draft, the tailored CV — is optional by design: a submission
 * queued a minute ago has none of it.
 */
const toSubmission = (value: unknown): Submission | null => {
  if (typeof value !== 'object' || value === null) return null;

  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string') return null;

  const cvRaw =
    typeof raw.cv === 'object' && raw.cv !== null
      ? (raw.cv as Record<string, unknown>)
      : null;

  const offer = toSnapshot(raw.offer);

  const evidenceCv = toEvidenceVariant(raw.cv);
  const cvHistory = Array.isArray(raw.cvHistory)
    ? raw.cvHistory
        .map(toEvidenceVariant)
        .filter((item): item is EvidenceCvVariant => item !== undefined)
    : [];
  const existingLegacy = Array.isArray(raw.legacyVariants)
    ? raw.legacyVariants
        .map(toLegacyVariant)
        .filter((item): item is LegacyCvVariant => item !== null)
    : [];
  const migratedLegacy =
    !evidenceCv && cvRaw
      ? toLegacyVariant({
          ...cvRaw,
          language: cvRaw.language ?? raw.language ?? offer.locale,
          historicalSentAt: raw.sentAt
        })
      : null;

  return {
    id: raw.id,
    recordId: str(raw.recordId),
    offer,
    // Written since the first release. An entry from before it falls back to
    // the locale the offer was researched in, which is the locale the app was
    // being used in at the time — the same value the field would have been
    // given had it existed.
    language: asLocale(raw.language ?? offer.locale),
    queuedAt: str(raw.queuedAt) || new Date().toISOString(),
    cv: evidenceCv,
    cvHistory: cvHistory.length > 0 ? cvHistory : undefined,
    legacyVariants:
      migratedLegacy || existingLegacy.length > 0
        ? [...existingLegacy, ...(migratedLegacy ? [migratedLegacy] : [])]
        : undefined,
    apply: toApply(raw.apply),
    offerUpdatedAt:
      typeof raw.offerUpdatedAt === 'string' ? raw.offerUpdatedAt : undefined,
    sentAt: typeof raw.sentAt === 'string' ? raw.sentAt : undefined
  };
};

export const emptyState = (): SubmittingState => ({
  submissions: [],
  activeId: null
});

export const parseState = (stored: unknown): SubmittingState => {
  try {
    const parsed = stored as StoredPayload;
    if (!parsed || !Array.isArray(parsed.submissions)) return emptyState();

    const submissions = parsed.submissions
      .map(toSubmission)
      .filter((item): item is Submission => item !== null);

    // A stored selection that no longer exists would leave the detail panel
    // blank with no way to tell why.
    const activeId =
      typeof parsed.activeId === 'string' &&
      submissions.some((item) => item.id === parsed.activeId)
        ? parsed.activeId
        : null;

    return { submissions, activeId };
  } catch (error) {
    console.warn('Could not read stored submissions; starting empty.', error);
    return emptyState();
  }
};

export const serializeState = (state: SubmittingState): StoredPayload => ({
  version: STORAGE_VERSION,
  ...state
});
