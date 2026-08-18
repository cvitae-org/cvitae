import {
  offerRequirementCategories,
  offerRequirementPriorities,
  type OfferAnalysis,
  type OfferRequirement,
  type OfferRequirementCategory,
  type OfferRequirementPriority
} from './types';

/** Keeps the posting readable and fingerprint-stable without paraphrasing it. */
export const normalizeOfferText = (value: string): string =>
  value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const hash = (value: string): string => {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
};

const categoryOf = (value: unknown): OfferRequirementCategory =>
  typeof value === 'string' &&
  (offerRequirementCategories as readonly string[]).includes(value)
    ? (value as OfferRequirementCategory)
    : 'other';

const priorityOf = (value: unknown): OfferRequirementPriority =>
  typeof value === 'string' &&
  (offerRequirementPriorities as readonly string[]).includes(value)
    ? (value as OfferRequirementPriority)
    : 'unknown';

const stringValue = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const safeRequirementId = (value: unknown): string => {
  const candidate = stringValue(value);
  return /^[a-zA-Z0-9:_-]{1,80}$/.test(candidate) ? candidate : '';
};

/**
 * Defensive requirement reader used at every persistence/API boundary.
 * Duplicate wording is collapsed, while the first source quote and ordering
 * survive so a diff still points to what the vacancy actually said.
 */
export const normalizeRequirements = (
  value: unknown,
  fallback: Pick<OfferAnalysis, 'required_skills' | 'responsibilities'> = {
    required_skills: [],
    responsibilities: []
  },
  sourceText?: string
): OfferRequirement[] => {
  const raw = Array.isArray(value) ? value : [];
  const parsed = raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const item = entry as Record<string, unknown>;
    const exactText = stringValue(item.exactText ?? item.exact_text ?? item.text);
    if (!exactText) return [];

    return [
      {
        id: safeRequirementId(item.id),
        exactText,
        sourceQuote: stringValue(item.sourceQuote ?? item.source_quote) || exactText,
        category: categoryOf(item.category),
        priority: priorityOf(item.priority)
      }
    ];
  });

  const candidates =
    parsed.length > 0
      ? parsed
      : [
          ...fallback.required_skills.map((exactText) => ({
            id: '',
            exactText,
            sourceQuote: exactText,
            category: 'skill' as const,
            priority: 'unknown' as const
          })),
          ...fallback.responsibilities.map((exactText) => ({
            id: '',
            exactText,
            sourceQuote: exactText,
            category: 'responsibility' as const,
            priority: 'unknown' as const
          }))
        ];

  const source = sourceText
    ? normalizeOfferText(sourceText).toLocaleLowerCase()
    : '';
  const seen = new Set<string>();
  const seenIds = new Set<string>();
  return candidates.flatMap((item, index) => {
    const key = item.exactText.toLocaleLowerCase();
    if (!key || seen.has(key)) return [];
    const normalizedQuote = normalizeOfferText(item.sourceQuote).toLocaleLowerCase();
    const citedText = source
      ? source.includes(normalizedQuote)
        ? item.sourceQuote
        : source.includes(key)
          ? item.exactText
          : ''
      : item.sourceQuote;
    // A requirement whose alleged quote is absent from the retained posting
    // is not evidence. Do not let a research-model hallucination become a
    // trusted requirement citation in an application snapshot.
    if (!citedText) return [];
    seen.add(key);
    const generatedId = `req-${index}-${hash(`${item.category}:${key}`)}`;
    let id = item.id && !seenIds.has(item.id) ? item.id : generatedId;
    let collision = 1;
    while (seenIds.has(id)) {
      id = `${generatedId}-${collision}`;
      collision += 1;
    }
    seenIds.add(id);
    return [
      {
        ...item,
        sourceQuote: citedText,
        id
      }
    ];
  });
};

/** Adds requirement citations to analysis output from older runtimes/models. */
export const withNormalizedRequirements = <T extends Record<string, unknown>>(
  analysis: T,
  sourceText?: string
): T & Pick<OfferAnalysis, 'requirements'> => {
  const requiredSkills = Array.isArray(analysis.required_skills)
    ? analysis.required_skills.filter(
        (value): value is string => typeof value === 'string'
      )
    : [];
  const responsibilities = Array.isArray(analysis.responsibilities)
    ? analysis.responsibilities.filter(
        (value): value is string => typeof value === 'string'
      )
    : [];

  return {
    ...analysis,
    requirements: normalizeRequirements(analysis.requirements, {
      required_skills: requiredSkills,
      responsibilities
    }, sourceText)
  };
};
