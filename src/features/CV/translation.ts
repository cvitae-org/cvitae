import type {
  CvCertificate,
  CvDocument,
  CvEducation,
  CvExperience,
  CvLanguage,
  CvSkillGroup
} from './document';

export const CV_TRANSLATION_SECTIONS = [
  { key: 'personal' },
  { key: 'role_description' },
  { key: 'skills' },
  { key: 'experience' },
  { key: 'education' },
  { key: 'certificates' },
  { key: 'languages' }
] as const;

export type CvTranslationSection =
  (typeof CV_TRANSLATION_SECTIONS)[number]['key'];

export type TranslationMergeReport = {
  filled: string[];
  added: {
    experience: number;
    education: number;
    certificates: number;
    languages: number;
    highlights: number;
    skills: number;
    skill_groups: number;
  };
};

const emptyReport = (): TranslationMergeReport => ({
  filled: [],
  added: {
    experience: 0,
    education: 0,
    certificates: 0,
    languages: 0,
    highlights: 0,
    skills: 0,
    skill_groups: 0
  }
});

export const isEmptyTranslationReport = (
  report: TranslationMergeReport
): boolean =>
  report.filled.length === 0 &&
  Object.values(report.added).every((count) => count === 0);

const blank = (value: unknown): boolean =>
  typeof value !== 'string' || value.trim().length === 0;

const key = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ');

const dateKey = (entry: { started: string; finished: string | null }): string => {
  const started = entry.started.match(/\d+/g)?.join('-') ?? '';
  const finished =
    entry.finished === null
      ? 'present'
      : entry.finished.match(/\d+/g)?.join('-') ?? '';

  return started || (finished && finished !== 'present')
    ? started + '|' + finished
    : '';
};

const copyDocument = (document: CvDocument): CvDocument => ({
  ...document,
  personal: {
    ...document.personal,
    links: { ...document.personal.links }
  },
  skills: {
    ...document.skills,
    groups: document.skills.groups.map((group) => ({
      ...group,
      items: [...group.items]
    }))
  },
  experience: document.experience.map((entry) => ({
    ...entry,
    highlights: [...entry.highlights],
    skills: [...entry.skills]
  })),
  education: document.education.map((entry) => ({ ...entry })),
  certificates: document.certificates.map((entry) => ({ ...entry })),
  languages: document.languages.map((entry) => ({ ...entry })),
  sources: document.sources.map((source) => ({ ...source }))
});

const translatedValue = (
  existing: string,
  incoming: string,
  path: string,
  report: TranslationMergeReport
): string => {
  if (!blank(existing) || blank(incoming)) return existing;
  report.filled.push(path);
  return incoming.trim();
};

const translatedEndDate = (
  existing: string | null,
  incoming: string | null,
  path: string,
  report: TranslationMergeReport
): string | null => {
  // Null means ongoing, not missing. Only a legacy explicit blank is fillable.
  if (existing === null || !blank(existing) || incoming === null || blank(incoming)) {
    return existing;
  }

  report.filled.push(path);
  return incoming.trim();
};

const unionTechnicalItems = (
  existing: string[],
  incoming: string[],
  onAdd: () => void
): string[] => {
  const seen = new Set(existing.map(key));
  const next = [...existing];

  for (const item of incoming) {
    if (blank(item) || seen.has(key(item))) continue;
    seen.add(key(item));
    next.push(item.trim());
    onAdd();
  }

  return next;
};

/**
 * Aligns source-language entries with target-language entries before filling
 * anything. Dates and untranslated proper names are stable across locales;
 * translated names are a second strong signal. Index is only a fallback when
 * both lists still have the same shape.
 */
const alignEntries = <Source, Translated, Target>(
  source: Source[],
  translated: Translated[],
  target: Target[],
  score: (source: Source, translated: Translated | undefined, target: Target) => number
): Map<number, number> => {
  const result = new Map<number, number>();
  const used = new Set<number>();

  source.forEach((entry, sourceIndex) => {
    let bestIndex = -1;
    let bestScore = 0;

    target.forEach((candidate, targetIndex) => {
      if (used.has(targetIndex)) return;
      const candidateScore = score(entry, translated[sourceIndex], candidate);
      if (candidateScore > bestScore) {
        bestIndex = targetIndex;
        bestScore = candidateScore;
      }
    });

    if (bestIndex >= 0) {
      result.set(sourceIndex, bestIndex);
      used.add(bestIndex);
    }
  });

  if (source.length === target.length) {
    source.forEach((_entry, index) => {
      if (result.has(index) || used.has(index)) return;
      result.set(index, index);
      used.add(index);
    });
  }

  return result;
};

const datedScore = (
  source: { started: string; finished: string | null },
  translated: { started: string; finished: string | null } | undefined,
  target: { started: string; finished: string | null },
  sourceName: string,
  translatedName: string,
  targetName: string
): number => {
  let score = 0;
  const sourceDate = dateKey(source);
  if (sourceDate && sourceDate === dateKey(target)) score += 100;
  if (key(sourceName) && key(sourceName) === key(targetName)) score += 80;
  if (translated && key(translatedName) && key(translatedName) === key(targetName)) {
    score += 100;
  }
  return score;
};

const insertAtSourcePositions = <Entry>(
  target: Entry[],
  additions: { sourceIndex: number; entry: Entry }[]
) => {
  additions
    .sort((left, right) => left.sourceIndex - right.sourceIndex)
    .forEach(({ sourceIndex, entry }) => {
      target.splice(Math.min(sourceIndex, target.length), 0, entry);
    });
};

const copyExperience = (entry: CvExperience): CvExperience => ({
  ...entry,
  highlights: [...entry.highlights],
  skills: [...entry.skills]
});

const mergeExperience = (
  target: CvExperience[],
  source: CvExperience[],
  translated: CvExperience[],
  report: TranslationMergeReport
) => {
  const matches = alignEntries(
    source,
    translated,
    target,
    (sourceEntry, translatedEntry, targetEntry) =>
      datedScore(
        sourceEntry,
        translatedEntry,
        targetEntry,
        sourceEntry.company,
        translatedEntry?.company ?? '',
        targetEntry.company
      )
  );
  const additions: { sourceIndex: number; entry: CvExperience }[] = [];

  source.forEach((_sourceEntry, sourceIndex) => {
    const incoming = translated[sourceIndex];
    if (!incoming) return;

    const targetIndex = matches.get(sourceIndex);
    if (targetIndex === undefined) {
      additions.push({ sourceIndex, entry: copyExperience(incoming) });
      report.added.experience += 1;
      report.added.highlights += incoming.highlights.length;
      return;
    }

    const current = target[targetIndex];
    if (!current) return;

    current.company = translatedValue(
      current.company,
      incoming.company,
      'experience.' + targetIndex + '.company',
      report
    );
    current.title = translatedValue(
      current.title,
      incoming.title,
      'experience.' + targetIndex + '.title',
      report
    );
    current.started = translatedValue(
      current.started,
      incoming.started,
      'experience.' + targetIndex + '.started',
      report
    );
    current.finished = translatedEndDate(
      current.finished,
      incoming.finished,
      'experience.' + targetIndex + '.finished',
      report
    );

    incoming.highlights.forEach((highlight, highlightIndex) => {
      const path =
        'experience.' + targetIndex + '.highlights.' + highlightIndex;
      const held = current.highlights[highlightIndex];

      if (held === undefined) {
        if (!blank(highlight)) {
          current.highlights.push(highlight.trim());
          report.added.highlights += 1;
        }
        return;
      }

      current.highlights[highlightIndex] = translatedValue(
        held,
        highlight,
        path,
        report
      );
    });

    current.skills = unionTechnicalItems(
      current.skills,
      incoming.skills,
      () => {
        report.added.skills += 1;
      }
    );
  });

  insertAtSourcePositions(target, additions);
};

const skillGroupMatches = (
  source: CvSkillGroup[],
  translated: CvSkillGroup[],
  target: CvSkillGroup[]
): Map<number, number> =>
  alignEntries(source, translated, target, (sourceGroup, translatedGroup, targetGroup) => {
    const held = new Set(targetGroup.items.map(key));
    const overlap = sourceGroup.items.filter((item) => held.has(key(item))).length;
    let score = overlap * 100;
    if (key(sourceGroup.label) && key(sourceGroup.label) === key(targetGroup.label)) {
      score += 40;
    }
    if (
      translatedGroup &&
      key(translatedGroup.label) &&
      key(translatedGroup.label) === key(targetGroup.label)
    ) {
      score += 60;
    }
    return score;
  });

const mergeSkills = (
  target: CvDocument['skills'],
  source: CvDocument['skills'],
  translated: CvDocument['skills'],
  report: TranslationMergeReport
) => {
  target.role = translatedValue(
    target.role,
    translated.role,
    'skills.role',
    report
  );

  const matches = skillGroupMatches(source.groups, translated.groups, target.groups);
  const additions: { sourceIndex: number; entry: CvSkillGroup }[] = [];

  source.groups.forEach((_sourceGroup, sourceIndex) => {
    const incoming = translated.groups[sourceIndex];
    if (!incoming) return;

    const targetIndex = matches.get(sourceIndex);
    if (targetIndex === undefined) {
      additions.push({
        sourceIndex,
        entry: { ...incoming, items: [...incoming.items] }
      });
      report.added.skill_groups += 1;
      report.added.skills += incoming.items.filter((item) => !blank(item)).length;
      return;
    }

    const current = target.groups[targetIndex];
    if (!current) return;
    current.label = translatedValue(
      current.label,
      incoming.label,
      'skills.groups.' + targetIndex + '.label',
      report
    );
    current.items = unionTechnicalItems(current.items, incoming.items, () => {
      report.added.skills += 1;
    });
  });

  insertAtSourcePositions(target.groups, additions);
};

type DatedNamed = {
  started: string;
  finished: string | null;
};

const mergeDatedList = <Entry extends DatedNamed>(
  target: Entry[],
  source: Entry[],
  translated: Entry[],
  name: (entry: Entry) => string,
  fill: (
    current: Entry,
    incoming: Entry,
    targetIndex: number,
    report: TranslationMergeReport
  ) => void,
  added: 'education' | 'certificates',
  report: TranslationMergeReport
) => {
  const matches = alignEntries(
    source,
    translated,
    target,
    (sourceEntry, translatedEntry, targetEntry) =>
      datedScore(
        sourceEntry,
        translatedEntry,
        targetEntry,
        name(sourceEntry),
        translatedEntry ? name(translatedEntry) : '',
        name(targetEntry)
      )
  );
  const additions: { sourceIndex: number; entry: Entry }[] = [];

  source.forEach((_sourceEntry, sourceIndex) => {
    const incoming = translated[sourceIndex];
    if (!incoming) return;
    const targetIndex = matches.get(sourceIndex);

    if (targetIndex === undefined) {
      additions.push({ sourceIndex, entry: { ...incoming } });
      report.added[added] += 1;
      return;
    }

    const current = target[targetIndex];
    if (current) fill(current, incoming, targetIndex, report);
  });

  insertAtSourcePositions(target, additions);
};

const mergeEducation = (
  target: CvEducation[],
  source: CvEducation[],
  translated: CvEducation[],
  report: TranslationMergeReport
) =>
  mergeDatedList(
    target,
    source,
    translated,
    (entry) => entry.university,
    (current, incoming, index, nextReport) => {
      current.university = translatedValue(
        current.university,
        incoming.university,
        'education.' + index + '.university',
        nextReport
      );
      current.degree = translatedValue(
        current.degree,
        incoming.degree,
        'education.' + index + '.degree',
        nextReport
      );
      current.started = translatedValue(
        current.started,
        incoming.started,
        'education.' + index + '.started',
        nextReport
      );
      current.finished = translatedEndDate(
        current.finished,
        incoming.finished,
        'education.' + index + '.finished',
        nextReport
      );
      current.thesis = translatedValue(
        current.thesis,
        incoming.thesis,
        'education.' + index + '.thesis',
        nextReport
      );
      current.mark = translatedValue(
        current.mark,
        incoming.mark,
        'education.' + index + '.mark',
        nextReport
      );
    },
    'education',
    report
  );

const mergeCertificates = (
  target: CvCertificate[],
  source: CvCertificate[],
  translated: CvCertificate[],
  report: TranslationMergeReport
) =>
  mergeDatedList(
    target,
    source,
    translated,
    (entry) => entry.name,
    (current, incoming, index, nextReport) => {
      current.name = translatedValue(
        current.name,
        incoming.name,
        'certificates.' + index + '.name',
        nextReport
      );
      current.issuer = translatedValue(
        current.issuer,
        incoming.issuer,
        'certificates.' + index + '.issuer',
        nextReport
      );
      current.started = translatedValue(
        current.started,
        incoming.started,
        'certificates.' + index + '.started',
        nextReport
      );
      current.finished = translatedEndDate(
        current.finished,
        incoming.finished,
        'certificates.' + index + '.finished',
        nextReport
      );
    },
    'certificates',
    report
  );

const mergeLanguages = (
  target: CvLanguage[],
  source: CvLanguage[],
  translated: CvLanguage[],
  report: TranslationMergeReport
) => {
  const matches = alignEntries(
    source,
    translated,
    target,
    (sourceEntry, translatedEntry, targetEntry) => {
      let score = 0;
      if (key(sourceEntry.name) && key(sourceEntry.name) === key(targetEntry.name)) {
        score += 100;
      }
      if (
        translatedEntry &&
        key(translatedEntry.name) &&
        key(translatedEntry.name) === key(targetEntry.name)
      ) {
        score += 120;
      }
      if (key(sourceEntry.level) && key(sourceEntry.level) === key(targetEntry.level)) {
        score += 40;
      }
      return score;
    }
  );
  const additions: { sourceIndex: number; entry: CvLanguage }[] = [];

  source.forEach((_sourceEntry, sourceIndex) => {
    const incoming = translated[sourceIndex];
    if (!incoming) return;
    const targetIndex = matches.get(sourceIndex);

    if (targetIndex === undefined) {
      additions.push({ sourceIndex, entry: { ...incoming } });
      report.added.languages += 1;
      return;
    }

    const current = target[targetIndex];
    if (!current) return;
    current.name = translatedValue(
      current.name,
      incoming.name,
      'languages.' + targetIndex + '.name',
      report
    );
    current.level = translatedValue(
      current.level,
      incoming.level,
      'languages.' + targetIndex + '.level',
      report
    );
  });

  insertAtSourcePositions(target, additions);
};

/**
 * Fills only structural gaps in the target-language document.
 *
 * Source and translated travel together: the source provides stable dates and
 * proper names for alignment, while translated provides the text to write.
 * Existing target prose is never compared with a fresh machine translation,
 * so a different valid wording cannot be appended as a duplicate bullet.
 */
export const mergeTranslatedGaps = (
  existing: CvDocument,
  source: CvDocument,
  translated: CvDocument,
  sections: readonly CvTranslationSection[]
): { document: CvDocument; report: TranslationMergeReport } => {
  const document = copyDocument(existing);
  const report = emptyReport();
  const selected = new Set(sections);

  if (selected.has('personal')) {
    for (const field of ['name', 'email', 'phone', 'location'] as const) {
      document.personal[field] = translatedValue(
        document.personal[field],
        translated.personal[field],
        'personal.' + field,
        report
      );
    }

    for (const [name, url] of Object.entries(translated.personal.links)) {
      if (!document.personal.links[name] && !blank(url)) {
        document.personal.links[name] = url.trim();
        report.filled.push('personal.links.' + name);
      }
    }
  }

  if (selected.has('role_description')) {
    document.role_description = translatedValue(
      document.role_description,
      translated.role_description,
      'role_description',
      report
    );
  }

  if (selected.has('skills')) {
    mergeSkills(document.skills, source.skills, translated.skills, report);
  }

  if (selected.has('experience')) {
    mergeExperience(
      document.experience,
      source.experience,
      translated.experience,
      report
    );
  }

  if (selected.has('education')) {
    mergeEducation(
      document.education,
      source.education,
      translated.education,
      report
    );
  }

  if (selected.has('certificates')) {
    mergeCertificates(
      document.certificates,
      source.certificates,
      translated.certificates,
      report
    );
  }

  if (selected.has('languages')) {
    mergeLanguages(
      document.languages,
      source.languages,
      translated.languages,
      report
    );
  }

  return { document, report };
};

/**
 * Cheap preflight used by the modal. Source text stands in for translated text
 * only to discover whether a structural gap exists; it is never written.
 */
export const sectionHasTranslationGaps = (
  existing: CvDocument,
  source: CvDocument,
  section: CvTranslationSection
): boolean =>
  !isEmptyTranslationReport(
    mergeTranslatedGaps(existing, source, source, [section]).report
  );
