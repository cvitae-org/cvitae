"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LocalizedError } from '@/components/LocalizedError';
import {
  errorFromApi,
  type ErrorDescriptor
} from '@/libs/i18n/errors';
import type { Locale } from '@/libs/i18n/config';
import { loadSettings, toRequestOverride } from '@/features/Settings/aiSettings';
import { parseDocument, type CvDocument } from '../document';
import { useCvDocument } from '../hooks/useCvDocument';
import { replaceDocument } from '../store';
import {
  CV_TRANSLATION_SECTIONS,
  isEmptyTranslationReport,
  mergeTranslatedGaps,
  sectionHasTranslationGaps,
  type CvTranslationSection,
  type TranslationMergeReport
} from '../translation';

type ProgressState = 'waiting' | 'translating' | 'done' | 'failed';

type TranslationResult = {
  document: CvDocument;
  sourceDocument: CvDocument;
  sourceLocale: Locale;
  targetLocale: Locale;
  requested: CvTranslationSection[];
  translated: CvTranslationSection[];
  failed: { section: CvTranslationSection; error: ErrorDescriptor }[];
  elapsedMs: number;
};

type Stage =
  | { name: 'idle' }
  | { name: 'translating' }
  | { name: 'failed'; error: ErrorDescriptor }
  | { name: 'preview'; result: TranslationResult };

type TranslationPayload = {
  document?: unknown;
  translated?: unknown;
  source_language?: unknown;
  target_language?: unknown;
  error?: string | ErrorDescriptor;
};

type CVTranslateModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const ROW_SECTION = {
  contact: 'personal',
  summary: 'role_description',
  skills: 'skills',
  jobs: 'experience',
  bullets: 'experience',
  education: 'education',
  certificates: 'certificates',
  languages: 'languages'
};

const allSkills = (document: CvDocument): string[] =>
  document.skills.groups.flatMap((group) => group.items);

const counts = (document: CvDocument) => ({
  contact:
    [document.personal.name, document.personal.email, document.personal.phone, document.personal.location]
      .filter((value) => value.trim()).length +
    Object.values(document.personal.links).filter((value) => value.trim()).length,
  summary: document.role_description.trim() ? 1 : 0,
  skills: allSkills(document).length,
  jobs: document.experience.length,
  bullets: document.experience.reduce(
    (total, entry) => total + entry.highlights.length,
    0
  ),
  education: document.education.length,
  certificates: document.certificates.length,
  languages: document.languages.length
});
type CountKey = keyof ReturnType<typeof counts>;

const applySection = (
  into: CvDocument,
  section: CvTranslationSection,
  from: CvDocument
): CvDocument => {
  switch (section) {
    case 'personal':
      return { ...into, personal: from.personal };
    case 'role_description':
      return { ...into, role_description: from.role_description };
    case 'skills':
      return { ...into, skills: from.skills };
    default:
      return { ...into, [section]: from[section] };
  }
};

const modeButtonClass = (active: boolean): string =>
  [
    'px-2.5 py-1 text-[11px] transition-colors',
    active
      ? 'bg-[#65B7FF] text-white'
      : 'bg-white text-gray-600 hover:bg-gray-50'
  ].join(' ');

export function CVTranslateModal({
  isOpen,
  onClose
}: CVTranslateModalProps) {
  const t = useTranslations('cv.translate');
  const importT = useTranslations('cv.import');
  const sectionT = useTranslations('cv.import.sections');
  const rowT = useTranslations('cv.import.rows');
  const commonT = useTranslations('common');
  const { document: targetDocument, locale } = useCvDocument();
  const sourceLocale: Locale = locale === 'pl' ? 'en' : 'pl';
  const {
    document: sourceDocument,
    hydrated: sourceHydrated,
    blank: sourceBlank
  } = useCvDocument(sourceLocale);
  const [stage, setStage] = useState<Stage>({ name: 'idle' });
  const [sectionState, setSectionState] = useState<
    Record<
      string,
      { state: ProgressState; detail?: string; error?: ErrorDescriptor }
    >
  >({});
  const [chosen, setChosen] = useState<Set<CvTranslationSection>>(
    () =>
      new Set(
        CV_TRANSLATION_SECTIONS.map((section) => section.key)
      )
  );

  const summarise = useCallback(
    (report: TranslationMergeReport): string => {
      const parts: string[] = [];
      const { added } = report;
      if (added.experience) parts.push(t('summary.jobs', { count: added.experience }));
      if (added.highlights) parts.push(t('summary.bullets', { count: added.highlights }));
      if (added.education) parts.push(t('summary.education', { count: added.education }));
      if (added.certificates) parts.push(t('summary.certificates', { count: added.certificates }));
      if (added.languages) parts.push(t('summary.languages', { count: added.languages }));
      if (added.skill_groups) parts.push(t('summary.skillGroups', { count: added.skill_groups }));
      if (added.skills) parts.push(t('summary.skills', { count: added.skills }));
      if (report.filled.length) parts.push(t('summary.fields', { count: report.filled.length }));
      return parts.join(', ');
    },
    [t]
  );

  const everything = chosen.size === CV_TRANSLATION_SECTIONS.length;

  const toggleSection = useCallback((key: CvTranslationSection) => {
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setStage({ name: 'idle' });
    setSectionState({});
  }, []);

  const close = useCallback(() => {
    if (stage.name === 'translating') return;
    reset();
    onClose();
  }, [onClose, reset, stage.name]);

  useEffect(() => {
    if (!isOpen) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.document.addEventListener('keydown', onEscape);
    return () => window.document.removeEventListener('keydown', onEscape);
  }, [close, isOpen]);

  const translate = useCallback(async () => {
    const queue = CV_TRANSLATION_SECTIONS.filter((section) =>
      chosen.has(section.key)
    );
    const started = Date.now();
    // Freeze both sides for the duration of the run. Store updates create new
    // snapshots, and aligning a response against a newer source document could
    // attach a translated job or bullet to the wrong record.
    const sourceSnapshot = parseDocument(sourceDocument, sourceLocale);
    const targetSnapshot = parseDocument(targetDocument, locale);

    setStage({ name: 'translating' });
    setSectionState(
      Object.fromEntries(
        queue.map((section) => [
          section.key,
          { state: 'waiting' as const }
        ])
      )
    );

    let ai: Record<string, unknown> | undefined;
    try {
      ai = toRequestOverride(loadSettings());
    } catch (error) {
      setStage({
        name: 'failed',
        error: {
          code: 'cv.settingsUnreadable',
          detail: error instanceof Error ? error.message : undefined
        }
      });
      return;
    }

    let accumulated = parseDocument({}, locale);
    const translated: CvTranslationSection[] = [];
    const failed: TranslationResult['failed'] = [];

    for (const section of queue) {
      if (
        !sectionHasTranslationGaps(
          targetSnapshot,
          sourceSnapshot,
          section.key
        )
      ) {
        setSectionState((previous) => ({
          ...previous,
          [section.key]: { state: 'done', detail: t('alreadyComplete') }
        }));
        continue;
      }

      setSectionState((previous) => ({
        ...previous,
        [section.key]: { state: 'translating' }
      }));

      try {
        const response = await fetch('/api/cv/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document: sourceSnapshot,
            source_language: sourceLocale,
            target_language: locale,
            sections: [section.key],
            ai
          })
        });
        const payload = (await response.json()) as TranslationPayload;

        if (!response.ok) {
          const error = errorFromApi(payload, 'cv.translationFailed');
          failed.push({ section: section.key, error });
          setSectionState((previous) => ({
            ...previous,
            [section.key]: { state: 'failed', error }
          }));
          continue;
        }

        if (
          payload.source_language !== sourceLocale ||
          payload.target_language !== locale ||
          !Array.isArray(payload.translated) ||
          payload.translated.length !== 1 ||
          payload.translated[0] !== section.key ||
          !payload.document ||
          typeof payload.document !== 'object' ||
          Array.isArray(payload.document)
        ) {
          throw new Error(
            t('mismatchedResponse')
          );
        }

        const translatedDocument = parseDocument(payload.document, locale);
        accumulated = applySection(
          accumulated,
          section.key,
          translatedDocument
        );
        translated.push(section.key);
        setSectionState((previous) => ({
          ...previous,
          [section.key]: { state: 'done' }
        }));
      } catch (error) {
        const descriptor: ErrorDescriptor = {
          code: 'cv.translationFailed',
          detail: error instanceof Error ? error.message : undefined
        };
        failed.push({ section: section.key, error: descriptor });
        setSectionState((previous) => ({
          ...previous,
          [section.key]: { state: 'failed', error: descriptor }
        }));
      }
    }

    setStage({
      name: 'preview',
      result: {
        document: accumulated,
        sourceDocument: sourceSnapshot,
        sourceLocale,
        targetLocale: locale,
        requested: queue.map((section) => section.key),
        translated,
        failed,
        elapsedMs: Date.now() - started
      }
    });
  }, [
    chosen,
    locale,
    sourceDocument,
    sourceLocale,
    targetDocument,
    t
  ]);

  const merged = useMemo(() => {
    if (stage.name !== 'preview') return null;
    if (
      stage.result.sourceLocale !== sourceLocale ||
      stage.result.targetLocale !== locale
    ) {
      return null;
    }
    return mergeTranslatedGaps(
      targetDocument,
      stage.result.sourceDocument,
      stage.result.document,
      stage.result.translated
    );
  }, [locale, sourceLocale, stage, targetDocument]);

  const apply = useCallback(() => {
    if (!merged || isEmptyTranslationReport(merged.report)) return;
    replaceDocument(locale, merged.document);
    reset();
    onClose();
  }, [locale, merged, onClose, reset]);

  if (!isOpen) return null;

  const currentCounts = counts(targetDocument);
  const sourceCounts = counts(
    stage.name === 'preview'
      ? stage.result.sourceDocument
      : sourceDocument
  );
  const mergedCounts = merged ? counts(merged.document) : currentCounts;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {t('title', {
                target: locale.toUpperCase(),
                source: sourceLocale.toUpperCase()
              })}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {t('description', { target: locale.toUpperCase() })}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={stage.name === 'translating'}
            aria-label={commonT('close')}
            className="rounded px-2 py-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {(stage.name === 'idle' || stage.name === 'failed') && (
          <div className="space-y-4">
            {!sourceHydrated ? (
              <p className="rounded bg-gray-50 p-3 text-xs text-gray-600">
                {t('loadingSource', { source: sourceLocale.toUpperCase() })}
              </p>
            ) : sourceBlank ? (
              <p className="rounded bg-amber-50 p-3 text-xs text-amber-800">
                {t('sourceEmpty', {
                  source: sourceLocale.toUpperCase(),
                  target: locale.toUpperCase()
                })}
              </p>
            ) : (
              <p className="rounded bg-blue-50 p-3 text-xs text-blue-800">
                {t('sourceSafe', {
                  source: sourceLocale.toUpperCase(),
                  target: locale.toUpperCase()
                })}
              </p>
            )}

            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700">
                  {t('translate')}
                </span>
                <div className="inline-flex overflow-hidden rounded border border-gray-200">
                  <button
                    type="button"
                    onClick={() =>
                      setChosen(
                        new Set(
                          CV_TRANSLATION_SECTIONS.map(
                            (section) => section.key
                          )
                        )
                      )
                    }
                    className={modeButtonClass(everything)}
                  >
                    {t('wholeCv')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setChosen(
                        new Set<CvTranslationSection>(['experience'])
                      )
                    }
                    className={
                      'border-l border-gray-200 ' +
                      modeButtonClass(!everything)
                    }
                  >
                    {t('someSections')}
                  </button>
                </div>
              </div>

              {!everything && (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded bg-gray-50 p-2.5">
                  {CV_TRANSLATION_SECTIONS.map((section) => (
                    <label
                      key={section.key}
                      className="flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-700"
                    >
                      <input
                        type="checkbox"
                        checked={chosen.has(section.key)}
                        onChange={() => toggleSection(section.key)}
                        className="accent-[#65B7FF]"
                      />
                      {sectionT(section.key)}
                    </label>
                  ))}
                </div>
              )}

              <p className="mt-1 text-[11px] text-gray-400">
                {t('selectionHint')}
              </p>
            </div>

            {stage.name === 'failed' && (
              <LocalizedError
                error={stage.error}
                className="rounded bg-red-50 p-3 text-xs text-red-700"
              />
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={translate}
                disabled={
                  !sourceHydrated || sourceBlank || chosen.size === 0
                }
                className="rounded bg-[#65B7FF] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#529ED5] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {t('translateGaps')}
              </button>
            </div>
          </div>
        )}

        {stage.name === 'translating' && (
          <div className="space-y-3 py-2">
            <ul className="space-y-1.5">
              {CV_TRANSLATION_SECTIONS.filter(
                (section) => section.key in sectionState
              ).map((section) => {
                const entry = sectionState[section.key];
                return (
                  <li
                    key={section.key}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="w-4 text-center">
                      {entry.state === 'done' && (
                        <span className="text-green-600">✓</span>
                      )}
                      {entry.state === 'failed' && (
                        <span className="text-red-500">✕</span>
                      )}
                      {entry.state === 'translating' && (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-200 border-t-[#65B7FF]" />
                      )}
                      {entry.state === 'waiting' && (
                        <span className="text-gray-300">·</span>
                      )}
                    </span>
                    <span
                      className={
                        entry.state === 'waiting'
                          ? 'text-gray-400'
                          : entry.state === 'failed'
                            ? 'text-red-600'
                            : 'text-gray-700'
                      }
                    >
                      {sectionT(section.key)}
                    </span>
                    {entry.detail && (
                      <span
                        className={
                          entry.state === 'failed'
                            ? 'truncate text-[11px] text-red-500'
                            : 'text-[11px] text-gray-400'
                        }
                      >
                        {entry.detail}
                      </span>
                    )}
                    {entry.error && (
                      <LocalizedError
                        error={entry.error}
                        className="min-w-0 truncate text-[11px] text-red-500"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-gray-400">
              {t('progressHint')}
            </p>
          </div>
        )}

        {stage.name === 'preview' && merged && (
          <div className="space-y-4">
            {stage.result.failed.length > 0 && (
              <div className="rounded bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-semibold">
                  {t('someFailed')}
                </p>
                {stage.result.failed.map((entry) => (
                  <div key={entry.section} className="mt-1">
                    <span className="font-medium">
                      {sectionT(entry.section)}
                    </span>
                    <LocalizedError error={entry.error} className="mt-0.5" />
                  </div>
                ))}
                <p className="mt-1.5">
                  {t('successfulCanApply')}
                </p>
                <p className="mt-1.5">
                  {t('retryAdvice')}
                </p>
              </div>
            )}

            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-400">
                  <th className="pb-1 font-medium">{importT('tableSection')}</th>
                  <th className="pb-1 text-right font-medium">
                    {t('nowHeader', { language: locale.toUpperCase() })}
                  </th>
                  <th className="pb-1 text-right font-medium">
                    {t('sourceHeader', { language: sourceLocale.toUpperCase() })}
                  </th>
                  <th className="pb-1 text-right font-medium">{t('afterFill')}</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {(Object.entries(sourceCounts) as [CountKey, number][]).map(([label, sourceCount]) => {
                  const section = ROW_SECTION[label] as CvTranslationSection;
                  const asked = stage.result.requested.includes(section);
                  const current =
                    currentCounts[label as keyof typeof currentCounts];
                  const after =
                    mergedCounts[label as keyof typeof mergedCounts];

                  return (
                    <tr key={label} className="border-b border-gray-100">
                      <td
                        className={
                          'py-1 ' + (asked ? '' : 'text-gray-300')
                        }
                      >
                        {rowT(label)}
                      </td>
                      <td className="py-1 text-right">{current}</td>
                      <td
                        className={
                          'py-1 text-right ' +
                          (asked ? '' : 'text-gray-300')
                        }
                      >
                        {asked ? sourceCount : t('notAsked')}
                      </td>
                      <td
                        className={
                          'py-1 text-right ' +
                          (after > current ? 'text-green-700' : '')
                        }
                      >
                        {asked ? after : current}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="text-[11px] text-gray-400">
              {stage.result.translated.length === 0
                ? t('noCallNeeded')
                : t('translatedSummary', {
                    source: sourceLocale.toUpperCase(),
                    seconds: (stage.result.elapsedMs / 1000).toFixed(0)
                  })}
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={reset}
                className="mr-auto rounded px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
              >
                {t('startOver')}
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={isEmptyTranslationReport(merged.report)}
                title={
                  isEmptyTranslationReport(merged.report)
                    ? t('noMissing')
                    : t('adds', { items: summarise(merged.report) })
                }
                className="rounded bg-[#65B7FF] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#529ED5] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {isEmptyTranslationReport(merged.report)
                  ? t('nothingToFill')
                  : t('fillTranslated', { items: summarise(merged.report) })}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
