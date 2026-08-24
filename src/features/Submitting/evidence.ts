import type { Locale } from '@/libs/i18n/config';
import type { CvDocument } from '@/features/CV/document';
import type { OfferRequirement } from '@/features/JobResearch/types';
import { fingerprintContent, stableSerialize } from '@/libs/fingerprint';
import type {
  CvEvidenceFact,
  EvidenceChange,
  EvidenceCvProposal,
  EvidenceCvVariant,
  EvidenceGenerateRequest,
  EvidenceProposalResponse,
  OfferSnapshot,
  ProposedBullet,
  SanitizedCvCatalog,
  VariantOrigin,
  VariantStalenessReason
} from './types';

const clone = <T>(value: T): T =>
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);

const normalized = (value: string): string =>
  value.normalize('NFC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

export const fingerprintCv = (document: CvDocument): string =>
  fingerprintContent(document);

export const fingerprintOffer = (offer: OfferSnapshot): string =>
  fingerprintContent(offer);

const redactContacts = (value: string): string =>
  value
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[contact removed]')
    .replace(/(?:\+?\d[\d ().-]{7,}\d)/g, '[contact removed]');

/**
 * Builds the only CV content sent to the model. Contact details and `sources`
 * never enter this catalog, while every remaining claim has a snapshot-local
 * id that the response must cite.
 */
export const buildCvFactCatalog = (
  document: CvDocument,
  language: Locale
): SanitizedCvCatalog => {
  const facts: CvEvidenceFact[] = [];
  const add = (fact: CvEvidenceFact) => {
    if (fact.text.trim()) facts.push({ ...fact, text: fact.text.trim() });
  };

  add({ id: 'role:0', kind: 'role', text: document.skills.role });
  add({ id: 'summary:0', kind: 'summary', text: document.role_description });

  document.skills.groups.forEach((group, groupIndex) => {
    group.items.forEach((text, itemIndex) =>
      add({
        id: `skill:${groupIndex}:${itemIndex}`,
        kind: 'skill',
        text,
        groupIndex,
        itemIndex,
        groupLabel: group.label
      })
    );
  });

  document.experience.forEach((job, jobIndex) => {
    add({
      id: `experience:${jobIndex}:title`,
      kind: 'experience-title',
      text: job.title,
      jobIndex
    });
    job.highlights.forEach((text, bulletIndex) =>
      add({
        id: `experience:${jobIndex}:bullet:${bulletIndex}`,
        kind: 'experience-bullet',
        text,
        jobIndex,
        bulletIndex
      })
    );
  });

  document.education.forEach((item, index) =>
    add({
      id: `education:${index}`,
      kind: 'education',
      text: [item.degree, item.university, item.thesis, item.mark]
        .filter(Boolean)
        .join(' — ')
    })
  );
  document.certificates.forEach((item, index) =>
    add({
      id: `certificate:${index}`,
      kind: 'certificate',
      text: [item.name, item.issuer].filter(Boolean).join(' — ')
    })
  );
  document.languages.forEach((item, index) =>
    add({
      id: `language:${index}`,
      kind: 'language',
      text: [item.name, item.level].filter(Boolean).join(' — ')
    })
  );

  return { version: 1, language, facts };
};

export const buildEvidenceRequest = (
  document: CvDocument,
  offer: OfferSnapshot,
  language: Locale
): EvidenceGenerateRequest => {
  const catalog = buildCvFactCatalog(document, language);
  return {
    version: 'evidence-v2',
    language,
    sourceCvFingerprint: fingerprintCv(document),
    sourceOfferFingerprint: fingerprintOffer(offer),
    candidate: {
      ...catalog,
      facts: catalog.facts.map((fact) => ({
        ...fact,
        text: redactContacts(fact.text)
      }))
    },
    offer: {
      company: redactContacts(offer.company),
      position: redactContacts(offer.position),
      requirements: offer.requirements.map((requirement) => ({
        ...clone(requirement),
        exactText: redactContacts(requirement.exactText),
        sourceQuote: redactContacts(requirement.sourceQuote)
      }))
    }
  };
};

export class EvidenceValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join(' '));
    this.name = 'EvidenceValidationError';
    this.issues = issues;
  }
}

const numericTokens = (value: string): string[] =>
  value.match(/\b\d+(?:[.,]\d+)?(?:\s?(?:[%+]|[kKmMbB]))?\b/g) ?? [];

const STOP_WORDS = new Set([
  'and', 'the', 'with', 'for', 'from', 'using', 'use', 'experience', 'knowledge',
  'required', 'preferred', 'skills', 'skill', 'development', 'developer', 'software',
  'or', 'in', 'of', 'to', 'a', 'an', 'is', 'are', 'as', 'on', 'at', 'plus',
  'oraz', 'lub', 'dla', 'jako', 'praca', 'wymagane', 'mile', 'widziane',
  'doświadczenie', 'znajomość', 'technologie', 'technologii'
]);

const COMMON_TECHNOLOGIES = [
  'react', 'angular', 'vue', 'svelte', 'next.js', 'node.js', 'typescript',
  'javascript', 'python', 'java', 'c#', 'c++', 'rust', 'kotlin', 'swift',
  'kubernetes', 'docker', 'aws', 'azure', 'gcp', 'graphql', 'postgresql',
  'mysql', 'mongodb', 'redis', 'terraform', 'kafka', 'spark', '.net',
  'django', 'flask', 'rails', 'solidity', 'solana'
] as const;

const technologyTokens = (requirements: OfferRequirement[]): string[] => {
  const result = new Set<string>();
  requirements
    .filter((requirement) => requirement.category === 'skill')
    .forEach((requirement) => {
      for (const match of requirement.exactText.matchAll(/[\p{L}][\p{L}\d+#./-]{1,}/gu)) {
        const token = normalized(match[0]);
        if (token.length >= 2 && !STOP_WORDS.has(token)) result.add(token);
      }
    });
  return [...result];
};

const containsToken = (haystack: string, token: string): boolean => {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\d])${escaped}([^\\p{L}\\d]|$)`, 'iu').test(
    haystack
  );
};

const assertRefs = (
  label: string,
  evidenceIds: string[],
  requirementIds: string[],
  evidence: Map<string, CvEvidenceFact>,
  requirements: Set<string>,
  issues: string[],
  requireEvidence = true
) => {
  if (requireEvidence && evidenceIds.length === 0) {
    issues.push(`${label} has no CV evidence.`);
  }
  for (const id of evidenceIds) {
    if (!evidence.has(id)) issues.push(`${label} cites unknown evidence "${id}".`);
  }
  for (const id of requirementIds) {
    if (!requirements.has(id)) {
      issues.push(`${label} cites unknown requirement "${id}".`);
    }
  }
};

const assertNumbers = (
  label: string,
  text: string,
  evidenceIds: string[],
  evidence: Map<string, CvEvidenceFact>,
  issues: string[]
) => {
  const cited = evidenceIds
    .map((id) => evidence.get(id)?.text ?? '')
    .join(' ')
    .replace(/\s+/g, '')
    .toLocaleLowerCase();
  for (const token of numericTokens(text)) {
    if (!cited.includes(token.replace(/\s+/g, '').toLocaleLowerCase())) {
      issues.push(`${label} adds unsupported numeric claim "${token}".`);
    }
  }
};

/**
 * Validates the proposal against the exact catalogs it was given.
 *
 * `origin` decides which half of the rules apply. The truth rules — cited ids
 * must exist, numbers and technologies must appear in the evidence, seniority
 * must not be inflated, a bullet must belong to its own job — hold for every
 * proposal, because they are what makes the output checkable at all. The rules
 * about *written* text hold only for a model's proposal: a CV attached as it
 * stands has no headline to inflate and no summary to pad, and rejecting it for
 * having one sentence, or none, would be rejecting the author's own document.
 */
export const validateEvidenceProposal = (
  proposal: EvidenceCvProposal,
  catalog: SanitizedCvCatalog,
  requirements: OfferRequirement[],
  origin: VariantOrigin = 'model'
): string[] => {
  const issues: string[] = [];
  const evidence = new Map(catalog.facts.map((fact) => [fact.id, fact]));
  const requirementIds = new Set(requirements.map((item) => item.id));
  const written = origin === 'model';

  if (written && !proposal.headline.text.trim()) issues.push('Headline is empty.');
  assertRefs(
    'Headline',
    proposal.headline.evidenceIds,
    proposal.headline.requirementIds,
    evidence,
    requirementIds,
    issues,
    written || proposal.headline.text.trim() !== ''
  );
  assertNumbers(
    'Headline',
    proposal.headline.text,
    proposal.headline.evidenceIds,
    evidence,
    issues
  );
  const seniorityTerms = proposal.headline.text.match(
    /\b(?:senior|lead|principal|staff|manager|director|head|starszy|lider|kierownik)\b/giu
  );
  if (seniorityTerms) {
    const candidateText = normalized(catalog.facts.map((fact) => fact.text).join(' '));
    seniorityTerms.forEach((term) => {
      if (!containsToken(candidateText, normalized(term))) {
        issues.push(`Headline inflates unsupported seniority "${term}".`);
      }
    });
  }

  /*
   * Two or three sentences, unless the summary is the CV's own.
   *
   * The rule is about what a model may write: not a one-liner, not an essay.
   * A proposal that restates the existing summary verbatim — which is what a
   * generation narrowed to other sections produces — is not writing anything,
   * and a CV whose summary happens to be one sentence long is not a fault this
   * check should invent. Compared against the catalogue's own summary fact, so
   * only an exact restatement is exempt.
   */
  const restated = proposal.summaryClaims
    .map((claim) => claim.text.trim())
    .filter(Boolean)
    .join(' ');
  const sourceSummary =
    catalog.facts.find((fact) => fact.kind === 'summary')?.text.trim() ?? '';
  const summaryUnchanged = restated !== '' && restated === sourceSummary;

  if (
    written &&
    !summaryUnchanged &&
    (proposal.summaryClaims.length < 2 || proposal.summaryClaims.length > 3)
  ) {
    issues.push('Summary must contain two or three cited sentences.');
  }
  proposal.summaryClaims.forEach((claim, index) => {
    const label = `Summary sentence ${index + 1}`;
    if (!claim.text.trim()) issues.push(`${label} is empty.`);
    assertRefs(
      label,
      claim.evidenceIds,
      claim.requirementIds,
      evidence,
      requirementIds,
      issues
    );
    assertNumbers(label, claim.text, claim.evidenceIds, evidence, issues);
  });

  const selectedSkills = new Set<string>();
  proposal.skills.forEach((skill, index) => {
    const fact = evidence.get(skill.evidenceId);
    if (!fact || fact.kind !== 'skill') {
      issues.push(`Selected skill ${index + 1} is not a CV skill evidence id.`);
    } else {
      const key = normalized(fact.text);
      if (selectedSkills.has(key)) issues.push(`Skill "${fact.text}" is duplicated.`);
      selectedSkills.add(key);
    }
    assertRefs(
      `Selected skill ${index + 1}`,
      [skill.evidenceId],
      skill.requirementIds,
      evidence,
      requirementIds,
      issues
    );
  });

  const jobs = new Set<number>();
  const sourceJobs = new Set(
    catalog.facts
      .map((fact) => fact.jobIndex)
      .filter((jobIndex): jobIndex is number => jobIndex !== undefined)
  );
  proposal.experience.forEach((entry) => {
    if (!Number.isInteger(entry.jobIndex) || entry.jobIndex < 0) {
      issues.push(`Experience entry has invalid job index ${entry.jobIndex}.`);
      return;
    }
    if (!sourceJobs.has(entry.jobIndex)) {
      issues.push(`Experience entry points to unknown job ${entry.jobIndex}.`);
    }
    if (jobs.has(entry.jobIndex)) {
      issues.push(`Job ${entry.jobIndex} appears more than once.`);
    }
    jobs.add(entry.jobIndex);

    const sourceIds = new Set<string>();
    entry.bullets.forEach((bullet, bulletIndex) => {
      const label = `Job ${entry.jobIndex + 1}, bullet ${bulletIndex + 1}`;
      const source = evidence.get(bullet.sourceEvidenceId);
      if (
        !source ||
        source.kind !== 'experience-bullet' ||
        source.jobIndex !== entry.jobIndex
      ) {
        issues.push(`${label} does not point to a bullet from the same job.`);
      }
      if (sourceIds.has(bullet.sourceEvidenceId)) {
        issues.push(`${label} selects the same source bullet twice.`);
      }
      sourceIds.add(bullet.sourceEvidenceId);

      assertRefs(
        label,
        bullet.evidenceIds,
        bullet.requirementIds,
        evidence,
        requirementIds,
        issues
      );
      for (const id of bullet.evidenceIds) {
        const cited = evidence.get(id);
        if (
          cited?.jobIndex !== undefined &&
          cited.jobIndex !== entry.jobIndex
        ) {
          issues.push(`${label} uses evidence from another job (${id}).`);
        }
      }
      if (!bullet.evidenceIds.includes(bullet.sourceEvidenceId)) {
        issues.push(`${label} must cite its source bullet.`);
      }
      assertNumbers(label, bullet.text, bullet.evidenceIds, evidence, issues);
    });
  });

  const matchIds = new Set<string>();
  proposal.requirementMatches.forEach((match) => {
    if (!requirementIds.has(match.requirementId)) {
      issues.push(`Requirement match cites unknown requirement "${match.requirementId}".`);
    }
    if (matchIds.has(match.requirementId)) {
      issues.push(`Requirement "${match.requirementId}" is matched more than once.`);
    }
    matchIds.add(match.requirementId);
    assertRefs(
      `Requirement match ${match.requirementId}`,
      match.evidenceIds,
      [],
      evidence,
      requirementIds,
      issues,
      match.status === 'direct' || match.status === 'transferable'
    );
  });
  // Only a proposal that claims to answer the vacancy owes an answer for every
  // requirement. An untailored CV was never asked the question, and inventing
  // "missing" for each one would report gaps nobody assessed.
  if (written) {
    for (const id of requirementIds) {
      if (!matchIds.has(id)) issues.push(`Requirement "${id}" has no match result.`);
    }
  }

  const candidateCorpus = catalog.facts.map((fact) => normalized(fact.text)).join(' ');
  const outputCorpus = normalized(
    [
      proposal.headline.text,
      ...proposal.summaryClaims.map((claim) => claim.text),
      ...proposal.experience.flatMap((entry) =>
        entry.bullets.map((bullet) => bullet.text)
      )
    ].join(' ')
  );
  for (const token of new Set([
    ...technologyTokens(requirements),
    ...COMMON_TECHNOLOGIES
  ])) {
    if (
      containsToken(outputCorpus, token) &&
      !containsToken(candidateCorpus, token)
    ) {
      issues.push(`Proposal adds unsupported technology "${token}".`);
    }
  }

  return [...new Set(issues)];
};

const factMap = (catalog: SanitizedCvCatalog) =>
  new Map(catalog.facts.map((fact) => [fact.id, fact]));

/** Applies a validated proposal without giving it access to protected fields. */
const sourceOrderForJob = (catalog: SanitizedCvCatalog, jobIndex: number) =>
  catalog.facts
    .filter(
      (fact) => fact.kind === 'experience-bullet' && fact.jobIndex === jobIndex
    )
    .sort((left, right) => (left.bulletIndex ?? 0) - (right.bulletIndex ?? 0))
    .map((fact) => fact.id);

/**
 * Which proposed changes to apply, by change id, or null for all of them.
 *
 * `null` is what generation uses, before anything has been reviewed. A set is
 * what the review panel uses: a change the reader has switched off falls back
 * to the source CV's own wording, which is the one substitution that is always
 * safe — it is the user's own writing, already in the document this variant was
 * derived from. Every string in the output is therefore either cited and
 * proposed, or verbatim from the CV. Nothing else can get in.
 */
export type ChangeDecisions = ReadonlySet<string> | null;

const applies = (decisions: ChangeDecisions, id: string): boolean =>
  decisions === null || decisions.has(id);

export const materializeEvidenceProposal = (
  source: CvDocument,
  proposal: EvidenceCvProposal,
  catalog: SanitizedCvCatalog,
  decisions: ChangeDecisions = null
): CvDocument => {
  const output = clone(source);
  const facts = factMap(catalog);

  output.skills.role = applies(decisions, 'headline')
    ? proposal.headline.text.trim()
    : source.skills.role;

  const keptClaims = proposal.summaryClaims
    .map((claim, index) => ({ claim, index }))
    .filter(({ index }) => applies(decisions, `summary:${index}`))
    .map(({ claim }) => claim.text.trim())
    .filter(Boolean);

  // Every claim switched off is a request to keep the summary as written, not
  // a request for an empty one — dropping the last claim would otherwise blank
  // a paragraph the reader never asked to remove.
  output.role_description = keptClaims.length
    ? keptClaims.join(' ')
    : source.role_description;

  if (applies(decisions, 'skills')) {
    const groups = new Map<number, { label: string; items: string[] }>();
    for (const selected of proposal.skills) {
      const fact = facts.get(selected.evidenceId);
      if (!fact || fact.kind !== 'skill' || fact.groupIndex === undefined) continue;
      const group = groups.get(fact.groupIndex) ?? {
        label: fact.groupLabel ?? '',
        items: []
      };
      group.items.push(fact.text);
      groups.set(fact.groupIndex, group);
    }
    output.skills.groups = [...groups.values()];
  }

  const byJob = new Map(
    proposal.experience.map((entry) => [entry.jobIndex, entry.bullets])
  );
  output.experience = output.experience.map((job, jobIndex) => {
    const proposed = byJob.get(jobIndex);

    // Omission means no proposed change. To remove every bullet the model
    // must include the job with an explicit empty selection, which creates a
    // visible before/after review card instead of a silent deletion.
    if (!proposed) return job;

    // The selection change is *which* bullets survive and in what order. It
    // only exists as a decision when the two differ, so the order is compared
    // before the decision is consulted — otherwise a job whose selection was
    // never in question would revert for want of an id nobody was offered.
    const selectionChanged =
      stableSerialize(proposed.map((bullet) => bullet.sourceEvidenceId)) !==
      stableSerialize(sourceOrderForJob(catalog, jobIndex));

    // Refusing it returns the job whole, which also makes the per-bullet
    // decisions inside it moot — there is no rewritten bullet left to keep.
    if (selectionChanged && !applies(decisions, `experience:${jobIndex}:selection`)) {
      return job;
    }

    return {
      ...job,
      highlights: proposed.map((bullet) =>
        applies(decisions, `experience:${jobIndex}:${bullet.sourceEvidenceId}`)
          ? bullet.text.trim()
          : (facts.get(bullet.sourceEvidenceId)?.text ?? bullet.text).trim()
      )
    };
  });

  output.updated_at = new Date().toISOString();
  return output;
};

/** Protected facts are compared independently of proposal validation. */
export const protectedFieldIssues = (
  source: CvDocument,
  output: CvDocument
): string[] => {
  const issues: string[] = [];
  const equal = (left: unknown, right: unknown) =>
    stableSerialize(left) === stableSerialize(right);

  if (!equal(source.personal, output.personal)) issues.push('Contact data changed.');
  if (source.experience.length !== output.experience.length) {
    issues.push('An employer was added or removed.');
  }
  source.experience.forEach((job, index) => {
    const next = output.experience[index];
    if (!next) return;
    if (
      !equal(
        [job.company, job.title, job.started, job.finished],
        [next.company, next.title, next.started, next.finished]
      )
    ) {
      issues.push(`Protected fields changed for job ${index + 1}.`);
    }
  });
  if (!equal(source.education, output.education)) issues.push('Education changed.');
  if (!equal(source.certificates, output.certificates)) {
    issues.push('Certifications changed.');
  }
  if (!equal(source.languages, output.languages)) issues.push('Languages changed.');
  if (!equal(source.sources, output.sources)) issues.push('Source metadata changed.');
  return issues;
};

const tailoredProjection = (document: CvDocument) => ({
  role: document.skills.role,
  summary: document.role_description,
  skillGroups: document.skills.groups,
  highlights: document.experience.map((job) => job.highlights)
});

export const proposalMaterializationIssues = (
  source: CvDocument,
  output: CvDocument,
  proposal: EvidenceCvProposal,
  language: Locale,
  decisions: ChangeDecisions = null
): string[] => {
  const expected = materializeEvidenceProposal(
    source,
    proposal,
    buildCvFactCatalog(source, language),
    decisions
  );
  return stableSerialize(tailoredProjection(expected)) ===
    stableSerialize(tailoredProjection(output))
    ? []
    : ['Materialized output does not match the reviewed proposal.'];
};


/**
 * The parts of a proposal that can be regenerated on their own.
 *
 * Named after what they are on the page rather than after the field they live
 * in: `summary` is the paragraph beside the portrait, which is the one people
 * ask to redo most often and the one a whole regeneration used to take with it.
 */
/**
 * The CV's summary as two or three sentences, for an identity proposal.
 *
 * Rejoining these with a single space must reproduce the paragraph, so the
 * terminator stays attached and nothing is trimmed away — an identity claim
 * that paraphrased its own source would be a change pretending not to be one.
 * A tail beyond the third sentence is folded into it rather than dropped.
 */
const summarySentences = (summary: string): string[] => {
  const text = summary.trim();
  if (!text) return [];

  const parts = text.match(/[^.!?]+[.!?]*\s*/g)?.map((part) => part.trim()) ?? [];
  const sentences = parts.filter(Boolean);

  if (sentences.length <= 1) return sentences;
  if (sentences.length <= 3) return sentences;

  return [sentences[0], sentences[1], sentences.slice(2).join(' ')];
};

/**
 * The CV proposing itself: every section cited to the fact it came from.
 *
 * The starting point for a generation that is only allowed to touch some
 * sections. A proposal has to be whole — the schema says so and the validators
 * assume it — so "leave the skills alone" cannot be expressed by omitting them;
 * it has to be expressed as a proposal to keep each one exactly as written.
 *
 * Trivially evidence-backed, since each entry's text is its own evidence, and
 * it materializes to a document identical to the source. Nothing here can
 * introduce a claim, which is what makes it a safe floor to merge onto.
 */
export const identityProposal = (
  source: CvDocument,
  catalog: SanitizedCvCatalog
): EvidenceCvProposal => {
  const has = (id: string) => catalog.facts.some((fact) => fact.id === id);

  return {
    headline: {
      text: source.skills.role,
      evidenceIds: has('role:0') ? ['role:0'] : [],
      requirementIds: []
    },
    /*
     * Split into sentences, because a proposal must carry two or three summary
     * claims and the CV carries one paragraph. Splitting keeps the wording
     * exactly — the claims rejoin, on the space they were split at, into the
     * summary that was already there — while satisfying a rule written for a
     * model's output and applied to every proposal alike.
     */
    summaryClaims: summarySentences(source.role_description).map((text) => ({
      text,
      evidenceIds: has('summary:0') ? ['summary:0'] : [],
      requirementIds: []
    })),
    skills: catalog.facts
      .filter((fact) => fact.kind === 'skill')
      .map((fact) => ({ evidenceId: fact.id, requirementIds: [] })),
    experience: source.experience.map((job, jobIndex) => ({
      jobIndex,
      bullets: job.highlights
        .map((text, bulletIndex) => ({
          text,
          sourceEvidenceId: `experience:${jobIndex}:bullet:${bulletIndex}`,
          evidenceIds: [`experience:${jobIndex}:bullet:${bulletIndex}`],
          requirementIds: []
        }))
        .filter((bullet) => has(bullet.sourceEvidenceId))
    })),
    requirementMatches: []
  };
};

export const EVIDENCE_SECTIONS = [
  'headline',
  'summary',
  'skills',
  'experience'
] as const;
export type EvidenceSection = (typeof EVIDENCE_SECTIONS)[number];

/** Which section a review change id belongs to, for carrying decisions over. */
export const sectionOfChangeId = (id: string): EvidenceSection => {
  if (id === 'headline') return 'headline';
  if (id === 'skills') return 'skills';
  if (id.startsWith('summary:')) return 'summary';
  return 'experience';
};

/**
 * Adopts the named sections from a fresh proposal, keeping the rest.
 *
 * The model is still asked for a whole proposal — the schema requires one, and
 * a partial prompt would need a second set of validators that could disagree
 * with the first. What changes is how much of the answer is kept. Regenerating
 * one paragraph therefore costs a full call, and buys back the four other
 * decisions the reader had already made.
 *
 * `requirementMatches` always comes from the new call. It maps the vacancy's
 * requirements onto catalogue evidence ids rather than onto anything in the
 * proposal, so it stays true regardless of which sections were adopted, and the
 * newer reading is the better one.
 */
export const mergeProposal = (
  current: EvidenceCvProposal,
  incoming: EvidenceCvProposal,
  sections: readonly EvidenceSection[]
): EvidenceCvProposal => {
  const take = new Set(sections);
  return clone({
    headline: take.has('headline') ? incoming.headline : current.headline,
    summaryClaims: take.has('summary')
      ? incoming.summaryClaims
      : current.summaryClaims,
    skills: take.has('skills') ? incoming.skills : current.skills,
    experience: take.has('experience') ? incoming.experience : current.experience,
    requirementMatches: incoming.requirementMatches
  });
};

/**
 * Which changes should be applied after a partial regeneration.
 *
 * A regenerated section is new text nobody has ruled on, so it starts applied,
 * like a fresh variant. A section left alone keeps whatever the reader decided
 * about it — declining a bullet and then rewriting the summary should not
 * quietly reinstate the bullet.
 */
export const carryDecisions = (
  nextRequired: string[],
  previousRequired: string[],
  previousAccepted: string[],
  regenerated: readonly EvidenceSection[]
): string[] => {
  const fresh = new Set(regenerated);
  const known = new Set(previousRequired);
  const accepted = new Set(previousAccepted);

  return nextRequired.filter(
    (id) =>
      fresh.has(sectionOfChangeId(id)) || !known.has(id) || accepted.has(id)
  );
};

/**
 * The skills a proposal selects, in the order it selects them.
 *
 * Read from the proposal rather than from `variant.output`, because the output
 * reflects the decisions already made: a declined skills change materializes to
 * the source list, which would make the change look like no change and remove
 * the card that is the only way to put it back.
 */
const proposedSkillList = (
  proposal: EvidenceCvProposal,
  catalog: SanitizedCvCatalog
): string[] => {
  const facts = factMap(catalog);
  const groups = new Map<number, string[]>();

  for (const selected of proposal.skills) {
    const fact = facts.get(selected.evidenceId);
    if (!fact || fact.kind !== 'skill' || fact.groupIndex === undefined) continue;
    const group = groups.get(fact.groupIndex) ?? [];
    group.push(fact.text);
    groups.set(fact.groupIndex, group);
  }

  return [...groups.values()].flat();
};

const sameText = (left: string, right: string): boolean =>
  left.trim() === right.trim();

/**
 * The changes a proposal actually makes, as decision ids.
 *
 * Only differences count. A proposal may restate a section exactly as the CV
 * has it — that is what every section outside a narrowed generation does, and
 * what a model does when it decides the original was already right. Listing
 * those produced a review panel full of cards whose before and after were the
 * same text, which reads as "it regenerated everything" and buries the two
 * lines that did change.
 *
 * Every comparison is proposal against source, never output against source: the
 * output already reflects the decisions, so a declined change would compare
 * equal, drop off this list, and take with it the only control that could put
 * it back.
 */
export const requiredChangeIds = (variant: EvidenceCvVariant): string[] => {
  const result: string[] = [];
  const source = variant.source.cv;

  if (!sameText(variant.proposal.headline.text, source.skills.role)) {
    result.push('headline');
  }

  const catalog = buildCvFactCatalog(source, variant.meta.language);
  const facts = factMap(catalog);

  variant.proposal.summaryClaims.forEach((claim, index) => {
    // Only the first claim replaces anything; the rest are additions, and an
    // addition is a change unless it is empty.
    const replaced = index === 0 ? source.role_description : '';
    if (!sameText(claim.text, replaced)) result.push(`summary:${index}`);
  });

  if (
    !sameText(
      proposedSkillList(variant.proposal, catalog).join(', '),
      source.skills.groups.flatMap((group) => group.items).join(', ')
    )
  ) {
    result.push('skills');
  }

  variant.proposal.experience.forEach((entry) => {
    const selected = entry.bullets.map((bullet) => bullet.sourceEvidenceId);
    if (stableSerialize(selected) !== stableSerialize(sourceOrderForJob(catalog, entry.jobIndex))) {
      result.push(`experience:${entry.jobIndex}:selection`);
    }
    entry.bullets.forEach((bullet) => {
      if (!sameText(bullet.text, facts.get(bullet.sourceEvidenceId)?.text ?? '')) {
        result.push(`experience:${entry.jobIndex}:${bullet.sourceEvidenceId}`);
      }
    });
  });

  return [...new Set(result)];
};

const makeId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createEvidenceVariant = ({
  sourceCv,
  sourceOffer,
  language,
  response,
  origin = 'model'
}: {
  sourceCv: CvDocument;
  sourceOffer: OfferSnapshot;
  language: Locale;
  response: EvidenceProposalResponse;
  origin?: VariantOrigin;
}): EvidenceCvVariant => {
  const catalog = buildCvFactCatalog(sourceCv, language);
  const issues = validateEvidenceProposal(
    response.proposal,
    catalog,
    sourceOffer.requirements,
    origin
  );
  if (issues.length > 0) throw new EvidenceValidationError(issues);

  const output = materializeEvidenceProposal(sourceCv, response.proposal, catalog);
  const protectedIssues = protectedFieldIssues(sourceCv, output);
  if (protectedIssues.length > 0) throw new EvidenceValidationError(protectedIssues);

  const generatedAt = response.generatedAt || new Date().toISOString();
  const variant: EvidenceCvVariant = {
    version: 'evidence-v2',
    id: makeId(),
    source: {
      cv: clone(sourceCv),
      offer: clone(sourceOffer),
      cvFingerprint: fingerprintCv(sourceCv),
      offerFingerprint: fingerprintOffer(sourceOffer)
    },
    output,
    proposal: clone(response.proposal),
    acceptedChangeIds: [],
    reviewState: 'draft',
    meta: {
      provider: response.provider,
      model: response.model,
      promptVersion: response.promptVersion,
      generatedAt,
      updatedAt: generatedAt,
      language,
      origin
    }
  };

  /*
   * Every change starts applied, and the review panel is where they are taken
   * back off. The reverse — nothing applied until each box is ticked — makes
   * the first thing anyone sees a preview of the document they already had,
   * which reads as a generation that did nothing.
   *
   * It also has to match `output`, which was materialized with no decisions and
   * therefore holds all of them: the approval check re-materializes from these
   * ids and compares, so a variant claiming to have accepted nothing while
   * showing everything would refuse to approve.
   */
  return { ...variant, acceptedChangeIds: requiredChangeIds(variant) };
};

/** The prompt version recorded for a variant nothing was prompted for. */
export const IDENTITY_PROMPT_VERSION = 'as-is-v1';

/**
 * The CV attached to an application exactly as written, with no model call.
 *
 * The whole first step is otherwise gated on a generation: nothing can be sent
 * until a variant exists and is approved, and the only way to get one was to
 * ask a model to rewrite a document that may already be right. This is the
 * other answer — the CV is the proposal, so there is no rewrite to review and
 * no reason to leave it in draft.
 *
 * It is a real variant rather than a bypass, which is the point: the send path,
 * the ATS export, the staleness check and the stored history all keep working
 * on a snapshot of the document that was actually attached, instead of reading
 * a live store that has moved on since.
 */
export const createIdentityVariant = ({
  sourceCv,
  sourceOffer,
  language,
  now = new Date().toISOString()
}: {
  sourceCv: CvDocument;
  sourceOffer: OfferSnapshot;
  language: Locale;
  now?: string;
}): EvidenceCvVariant =>
  approveVariant(
    createEvidenceVariant({
      sourceCv,
      sourceOffer,
      language,
      origin: 'as-is',
      response: {
        version: 'evidence-v2',
        proposal: identityProposal(
          sourceCv,
          buildCvFactCatalog(sourceCv, language)
        ),
        provider: '',
        model: '',
        promptVersion: IDENTITY_PROMPT_VERSION,
        generatedAt: now
      }
    })
  );

export const rebuildVariant = (
  variant: EvidenceCvVariant,
  proposal: EvidenceCvProposal,
  acceptedChangeIds: string[] = variant.acceptedChangeIds
): EvidenceCvVariant => {
  const catalog = buildCvFactCatalog(variant.source.cv, variant.meta.language);
  return {
    ...variant,
    proposal: clone(proposal),
    output: materializeEvidenceProposal(
      variant.source.cv,
      proposal,
      catalog,
      new Set(acceptedChangeIds)
    ),
    acceptedChangeIds,
    reviewState: 'draft',
    approvedAt: undefined,
    meta: { ...variant.meta, updatedAt: new Date().toISOString() }
  };
};

/**
 * Freezes the variant as it currently stands.
 *
 * It used to refuse until every proposed change had been ticked, which made the
 * checkbox a record of having *looked* at a change rather than a decision about
 * it: there was no way to keep one rewrite and decline the next, only a way to
 * be blocked. A cleared box now means the source CV's own wording is used, and
 * approving is allowed at any time — declining every change approves the CV
 * unchanged, which is a legitimate answer to a tailoring proposal.
 *
 * The checks that remain are the ones about truthfulness rather than taste:
 * the proposal must still be evidence-backed, protected fields untouched, and
 * the output must still be exactly what these decisions produce.
 */
export const approveVariant = (variant: EvidenceCvVariant): EvidenceCvVariant => {
  const catalog = buildCvFactCatalog(variant.source.cv, variant.meta.language);
  const issues = [
    ...validateEvidenceProposal(
      variant.proposal,
      catalog,
      variant.source.offer.requirements,
      variant.meta.origin
    ),
    ...protectedFieldIssues(variant.source.cv, variant.output),
    ...proposalMaterializationIssues(
      variant.source.cv,
      variant.output,
      variant.proposal,
      variant.meta.language,
      new Set(variant.acceptedChangeIds)
    )
  ];
  if (issues.length > 0) throw new EvidenceValidationError(issues);

  const approvedAt = new Date().toISOString();
  return {
    ...variant,
    reviewState: 'approved',
    approvedAt,
    meta: { ...variant.meta, updatedAt: approvedAt }
  };
};

export const variantStalenessReasons = (
  variant: EvidenceCvVariant,
  liveCv: CvDocument,
  liveOffer: OfferSnapshot,
  language: Locale
): VariantStalenessReason[] => {
  const reasons: VariantStalenessReason[] = [];
  if (variant.meta.language !== language) reasons.push('application-language');
  if (variant.source.cvFingerprint !== fingerprintCv(liveCv)) {
    reasons.push('master-cv');
  }
  if (variant.source.offerFingerprint !== fingerprintOffer(liveOffer)) {
    reasons.push('job-offer');
  }
  return reasons;
};

const evidenceText = (variant: EvidenceCvVariant, ids: string[]) => {
  const facts = factMap(buildCvFactCatalog(variant.source.cv, variant.meta.language));
  return ids.map((id) => facts.get(id)?.text ?? id);
};

const requirementText = (variant: EvidenceCvVariant, ids: string[]) => {
  const requirements = new Map(
    variant.source.offer.requirements.map((item) => [item.id, item.exactText])
  );
  return ids.map((id) => requirements.get(id) ?? id);
};

export const buildVariantChanges = (variant: EvidenceCvVariant): EvidenceChange[] => {
  const changes: EvidenceChange[] = [];
  if (variant.proposal.headline.text.trim() !== variant.source.cv.skills.role.trim()) {
    changes.push({
      id: 'headline',
      labelKey: 'headline',
      before: variant.source.cv.skills.role,
      after: variant.proposal.headline.text,
      evidence: evidenceText(variant, variant.proposal.headline.evidenceIds),
      requirements: requirementText(variant, variant.proposal.headline.requirementIds),
      editable: true
    });
  }
  variant.proposal.summaryClaims.forEach((claim, index) =>
    changes.push({
      id: `summary:${index}`,
      labelKey: 'summary',
      labelValues: { number: index + 1 },
      before: index === 0 ? variant.source.cv.role_description : '',
      after: claim.text,
      evidence: evidenceText(variant, claim.evidenceIds),
      requirements: requirementText(variant, claim.requirementIds),
      editable: true
    })
  );

  const catalogForSkills = buildCvFactCatalog(
    variant.source.cv,
    variant.meta.language
  );
  changes.push({
    id: 'skills',
    labelKey: 'skills',
    before: variant.source.cv.skills.groups.flatMap((group) => group.items).join(', '),
    after: proposedSkillList(variant.proposal, catalogForSkills).join(', '),
    evidence: evidenceText(
      variant,
      variant.proposal.skills.map((skill) => skill.evidenceId)
    ),
    requirements: requirementText(
      variant,
      variant.proposal.skills.flatMap((skill) => skill.requirementIds)
    ),
    editable: false
  });

  const catalog = buildCvFactCatalog(variant.source.cv, variant.meta.language);
  const facts = factMap(catalog);
  variant.proposal.experience.forEach((entry) => {
    const selected = entry.bullets.map((bullet) => bullet.sourceEvidenceId);
    if (stableSerialize(selected) !== stableSerialize(sourceOrderForJob(catalog, entry.jobIndex))) {
      changes.push({
        id: `experience:${entry.jobIndex}:selection`,
        labelKey: 'bulletSelection',
        labelValues: {
          company:
            variant.source.cv.experience[entry.jobIndex]?.company || ''
        },
        before: variant.source.cv.experience[entry.jobIndex]?.highlights.join(' • ') ?? '',
        after: entry.bullets.map((bullet) => bullet.text).join(' • '),
        evidence: selected.map((id) => facts.get(id)?.text ?? id),
        requirements: requirementText(
          variant,
          entry.bullets.flatMap((bullet) => bullet.requirementIds)
        ),
        editable: false
      });
    }
    entry.bullets.forEach((bullet) => {
      const source = facts.get(bullet.sourceEvidenceId);
      changes.push({
        id: `experience:${entry.jobIndex}:${bullet.sourceEvidenceId}`,
        labelKey: 'bullet',
        labelValues: {
          company:
            variant.source.cv.experience[entry.jobIndex]?.company || ''
        },
        before: source?.text ?? '',
        after: bullet.text,
        evidence: evidenceText(variant, bullet.evidenceIds),
        requirements: requirementText(variant, bullet.requirementIds),
        editable: true
      });
    });
  });

  /*
   * A card whose before and after are the same text is not a change, and it is
   * the bulk of what a narrowed generation produces: every section that was not
   * picked is proposed exactly as the CV already has it. Rendering those made
   * the panel look like it had rewritten the whole document. Filtered here
   * rather than at each push so this cannot drift from `requiredChangeIds`,
   * which applies the same rule to decide what needs deciding.
   */
  return changes.filter((change) => !sameText(change.before, change.after));
};

export const editProposalText = (
  proposal: EvidenceCvProposal,
  changeId: string,
  text: string
): EvidenceCvProposal => {
  const next = clone(proposal);
  if (changeId === 'headline') next.headline.text = text;
  else if (changeId.startsWith('summary:')) {
    const index = Number(changeId.split(':')[1]);
    if (next.summaryClaims[index]) next.summaryClaims[index].text = text;
  } else if (changeId.startsWith('experience:')) {
    const [, jobValue, ...sourceParts] = changeId.split(':');
    const jobIndex = Number(jobValue);
    const sourceId = sourceParts.join(':');
    const bullet = next.experience
      .find((entry) => entry.jobIndex === jobIndex)
      ?.bullets.find((entry) => entry.sourceEvidenceId === sourceId);
    if (bullet) bullet.text = text;
  }
  return next;
};

export const requirementGaps = (variant: EvidenceCvVariant) =>
  variant.proposal.requirementMatches.filter(
    (match) => match.status === 'missing' || match.status === 'needs-confirmation'
  );

/** Narrowing helper for defensive API/storage reads. */
export const isEvidenceVariant = (value: unknown): value is EvidenceCvVariant =>
  typeof value === 'object' &&
  value !== null &&
  (value as { version?: unknown }).version === 'evidence-v2';

/** The proposal's bullet refs are useful in tests and review components. */
export const bulletChangeId = (jobIndex: number, bullet: ProposedBullet): string =>
  `experience:${jobIndex}:${bullet.sourceEvidenceId}`;
