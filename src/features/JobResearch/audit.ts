import type { CvDocument } from '@/features/CV/document';
import { isStated } from './filtering';
import { NOT_STATED, type JobRecord } from './types';

/**
 * What the research tab can be checked for without asking a model.
 *
 * The obvious thing to want here is a fit score, and `types.ts` records why
 * there isn't one: scoring fit needed the CV in every prompt, was the slowest
 * and least reliable step in the flow, and produced a number nobody trusted.
 * That reasoning has not changed, so this does something narrower and honest —
 * it counts which of an offer's own cited requirements appear anywhere in the
 * CV, and reports the count. A fraction of requirements evidenced is a claim
 * the user can check in a second by reading the two documents; a 78 is not.
 *
 * Everything here is lexical and local. It runs on every keystroke's worth of
 * store change, over a whole tab, with no network and no cost.
 */

/** How long a row can sit un-rechecked before its posting is worth doubting. */
const STALE_AFTER_DAYS = 30;

/** Below this, calling an offer the best fit in the tab would be misleading. */
const WEAK_COVERAGE = 0.34;

/** How many of the top matches are worth naming. More is a leaderboard. */
const TOP_MATCHES = 3;

/**
 * Added to the denominator when ordering, and to nothing that is displayed.
 *
 * Ranking on the bare ratio put an offer stating one requirement, which the CV
 * happened to mention, above an offer stating three of which it evidenced two —
 * measured on screen: "Old Co — 1 of 1" sat above "Mid Co — 2 of 3". A perfect
 * score over a tiny denominator is not a better match, it is a thinner reading
 * of the posting, and the two are indistinguishable in the ratio alone.
 *
 * Two is the number of requirements an offer has to state before its ratio is
 * taken close to face value: 3/3 ranks 0.60, 2/3 ranks 0.40, 1/1 ranks 0.33.
 * The panel still shows the honest fraction — this only decides the order.
 */
const RANK_SMOOTHING = 2;

const STOPWORDS = new Set([
  // English
  'and', 'or', 'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
  'as', 'by', 'from', 'is', 'are', 'be', 'you', 'your', 'we', 'our', 'us',
  'have', 'has', 'had', 'will', 'would', 'can', 'good', 'strong', 'very',
  'experience', 'knowledge', 'ability', 'skills', 'work', 'working', 'years',
  'year', 'least', 'plus', 'must', 'should', 'about', 'using', 'use', 'well',
  'other', 'such', 'their', 'this', 'that', 'they', 'them', 'it', 'its',
  // Polish
  'i', 'oraz', 'lub', 'w', 'we', 'na', 'z', 'ze', 'do', 'od', 'dla', 'po',
  'przy', 'jest', 'są', 'być', 'znajomość', 'doświadczenie', 'umiejętność',
  'umiejętności', 'lat', 'lata', 'roku', 'mile', 'widziane', 'bardzo', 'dobra',
  'dobre', 'praca', 'pracy', 'nasz', 'nasze', 'twoje', 'oraz'
]);

/**
 * Lowercases and strips punctuation, keeping the characters that carry meaning
 * in a technology name — `c++`, `c#`, `node.js` are three different things from
 * `c`, `c` and `node js`.
 */
const normalize = (value: string): string =>
  value
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}+#.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value: string): string[] =>
  normalize(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOPWORDS.has(token) && !/^[\d.]+$/.test(token));

/**
 * Every string in the CV a requirement could reasonably be evidenced by.
 *
 * Bullets and job titles are in it, not only the skills strip: an offer asking
 * for "mentoring" is answered by a bullet that says so, and no skills row will
 * ever list it.
 */
export const cvHaystack = (cv: CvDocument): { text: string; tokens: Set<string> } => {
  const parts = [
    cv.skills.role,
    cv.role_description,
    ...cv.skills.groups.flatMap((group) => [group.label, ...group.items]),
    ...cv.experience.flatMap((job) => [
      job.title,
      job.company,
      ...job.highlights,
      ...job.skills
    ]),
    ...cv.education.flatMap((entry) => [entry.university, entry.degree ?? '']),
    ...cv.certificates.map((entry) => entry.name),
    ...cv.languages.map((entry) => entry.name)
  ];

  const text = normalize(parts.join(' \n '));
  return { text, tokens: new Set(tokenize(parts.join(' \n '))) };
};

/**
 * Whether the CV says anything that answers this requirement.
 *
 * Two ways in: the requirement's exact wording appears verbatim, or enough of
 * its content words do. The ratio is deliberately high — under-claiming a match
 * costs the user a glance at an offer they might have skipped, while
 * over-claiming tells them they are covered when they are not.
 */
const EVIDENCE_RATIO = 0.6;

const isEvidenced = (
  requirementText: string,
  haystack: { text: string; tokens: Set<string> }
): boolean => {
  const phrase = normalize(requirementText);
  if (phrase.length > 2 && haystack.text.includes(phrase)) return true;

  const tokens = tokenize(requirementText);
  if (tokens.length === 0) return false;

  const hits = tokens.filter((token) => haystack.tokens.has(token)).length;
  return hits / tokens.length >= EVIDENCE_RATIO;
};

export type OfferCoverage = {
  record: JobRecord;
  /** Requirements the CV answers, out of those the offer states. */
  evidenced: number;
  total: number;
  /** `evidenced / total`, or 0 when the offer states no requirements. This is
   * the number shown; it is not the number sorted on. */
  ratio: number;
  /** Ordering only: the ratio, discounted for how little the offer states. */
  rank: number;
  /** The strongest unanswered requirements, for saying what is missing. */
  gaps: string[];
};

/**
 * Requirement coverage for one offer, cited requirements first.
 *
 * `required_skills` is the fallback rather than the input: it is a flat list
 * the model produced, while `requirements` are cited against the posting text
 * and carry a priority, so a row that has them deserves to be read from them.
 */
export const offerCoverage = (
  record: JobRecord,
  haystack: { text: string; tokens: Set<string> }
): OfferCoverage => {
  const stated = record.requirements.length > 0
    ? record.requirements.map((requirement) => ({
        text: requirement.exactText,
        required: requirement.priority !== 'preferred'
      }))
    : record.required_skills.map((text) => ({ text, required: true }));

  const results = stated.map((item) => ({
    ...item,
    evidenced: isEvidenced(item.text, haystack)
  }));

  const evidenced = results.filter((item) => item.evidenced).length;

  return {
    record,
    evidenced,
    total: results.length,
    ratio: results.length === 0 ? 0 : evidenced / results.length,
    rank: results.length === 0 ? 0 : evidenced / (results.length + RANK_SMOOTHING),
    gaps: results
      .filter((item) => !item.evidenced && item.required)
      .map((item) => item.text)
  };
};

export type ResearchFinding = {
  code: string;
  messageKey: string;
  values?: Record<string, string | number>;
  severity: 'block' | 'warning' | 'info';
};

export type ResearchAuditCategory =
  | 'best-fit'
  | 'offer-coverage'
  | 'posting-quality'
  | 'pipeline';

export type ResearchAuditReport = Record<ResearchAuditCategory, ResearchFinding[]> & {
  /** The ranked matches, so the panel can render them as more than a sentence. */
  ranking: OfferCoverage[];
};

const finding = (
  code: string,
  messageKey: string,
  severity: ResearchFinding['severity'] = 'info',
  values?: Record<string, string | number>
): ResearchFinding => ({ code, messageKey, values, severity });

const daysSince = (iso: string, now: number): number => {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? 0 : Math.floor((now - at) / 86_400_000);
};

export const runResearchAudit = ({
  records,
  cv,
  queuedIds,
  now = Date.now()
}: {
  /** The open tab's offers. Tabs partition the table, so this is the scope. */
  records: JobRecord[];
  cv: CvDocument;
  queuedIds: Set<string>;
  now?: number;
}): ResearchAuditReport => {
  const report: ResearchAuditReport = {
    'best-fit': [],
    'offer-coverage': [],
    'posting-quality': [],
    pipeline: [],
    ranking: []
  };

  if (records.length === 0) {
    report['best-fit'].push(finding('empty', 'empty'));
    report['offer-coverage'].push(finding('empty', 'empty'));
    report['posting-quality'].push(finding('empty', 'empty'));
    report.pipeline.push(finding('empty', 'empty'));
    return report;
  }

  const haystack = cvHaystack(cv);
  const cvIsEmpty = haystack.tokens.size === 0;

  /* ---------------------------------------------------------------- best fit */

  if (cvIsEmpty) {
    report['best-fit'].push(finding('no-cv', 'no-cv', 'warning'));
  } else {
    const scored = records
      .map((record) => offerCoverage(record, haystack))
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.rank - a.rank || b.total - a.total);

    report.ranking = scored.slice(0, TOP_MATCHES);

    if (scored.length === 0) {
      report['best-fit'].push(finding('no-requirements', 'no-requirements', 'warning'));
    } else {
      const best = scored[0];
      report['best-fit'].push(
        finding(
          'best',
          best.ratio < WEAK_COVERAGE ? 'best-weak' : 'best',
          best.ratio < WEAK_COVERAGE ? 'warning' : 'info',
          {
            company: best.record.company,
            position: best.record.position,
            evidenced: best.evidenced,
            total: best.total,
            percent: Math.round(best.ratio * 100)
          }
        )
      );

      report.ranking.slice(1).forEach((entry) => {
        report['best-fit'].push(
          finding(`runner-${entry.record.id}`, 'runner-up', 'info', {
            company: entry.record.company,
            position: entry.record.position,
            evidenced: entry.evidenced,
            total: entry.total
          })
        );
      });

      if (best.gaps.length > 0) {
        report['best-fit'].push(
          finding('best-gaps', 'best-gaps', 'info', {
            count: best.gaps.length,
            requirements: best.gaps.slice(0, 3).join('; ')
          })
        );
      }
    }
  }

  /* --------------------------------------------------------- offer coverage */

  const unanalysed = records.filter(
    (record) => record.role_profile === NOT_STATED && Boolean(record.offer_text?.trim())
  );
  if (unanalysed.length > 0) {
    report['offer-coverage'].push(
      finding('unanalysed', 'unanalysed', 'warning', { count: unanalysed.length })
    );
  }

  const textless = records.filter(
    (record) => !record.offer_text?.trim() && record.requirements.length === 0
  );
  if (textless.length > 0) {
    report['offer-coverage'].push(
      finding('no-text', 'no-text', 'warning', { count: textless.length })
    );
  }

  const uncited = records.filter(
    (record) => record.requirements.length === 0 && Boolean(record.offer_text?.trim())
  );
  if (uncited.length > 0) {
    report['offer-coverage'].push(
      finding('uncited', 'uncited', 'info', { count: uncited.length })
    );
  }

  /* -------------------------------------------------------- posting quality */

  const seen = new Map<string, number>();
  records.forEach((record) => {
    const key = record.source_url.trim()
      ? normalize(record.source_url)
      : normalize(`${record.company} ${record.position}`);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  });
  const duplicates = [...seen.values()].filter((count) => count > 1).length;
  if (duplicates > 0) {
    report['posting-quality'].push(
      finding('duplicates', 'duplicates', 'warning', { count: duplicates })
    );
  }

  const stale = records.filter(
    (record) => daysSince(record.checked_at, now) >= STALE_AFTER_DAYS
  );
  if (stale.length > 0) {
    report['posting-quality'].push(
      finding('stale', 'stale', 'info', { count: stale.length, days: STALE_AFTER_DAYS })
    );
  }

  const noSalary = records.filter((record) => !isStated(record.salary)).length;
  if (noSalary > 0) {
    report['posting-quality'].push(
      finding('no-salary', 'no-salary', 'info', { count: noSalary })
    );
  }

  const degraded = records.filter((record) => record.source_note.trim()).length;
  if (degraded > 0) {
    report['posting-quality'].push(
      finding('degraded', 'degraded', 'info', { count: degraded })
    );
  }

  /* ----------------------------------------------------------------- pipeline */

  const queued = records.filter((record) => queuedIds.has(record.id)).length;
  const untouched = records.filter(
    (record) => record.status === 'new' && !queuedIds.has(record.id)
  ).length;

  if (queued > 0) {
    report.pipeline.push(finding('queued', 'queued', 'info', { count: queued }));
  }
  if (untouched > 0) {
    report.pipeline.push(
      finding('untouched', 'untouched', 'info', { count: untouched })
    );
  }

  const appliedNotQueued = records.filter(
    (record) => record.status === 'applied' && !queuedIds.has(record.id)
  ).length;
  if (appliedNotQueued > 0) {
    report.pipeline.push(
      finding('applied-elsewhere', 'applied-elsewhere', 'info', {
        count: appliedNotQueued
      })
    );
  }

  (['best-fit', 'offer-coverage', 'posting-quality', 'pipeline'] as const).forEach(
    (category) => {
      if (report[category].length === 0) {
        report[category].push(finding('none', 'none'));
      }
    }
  );

  return report;
};
