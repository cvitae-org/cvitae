"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  failed: { label: string; error: string }[];
  elapsedMs: number;
};

type Stage =
  | { name: 'idle' }
  | { name: 'translating' }
  | { name: 'failed'; error: string }
  | { name: 'preview'; result: TranslationResult };

type TranslationPayload = {
  document?: unknown;
  translated?: unknown;
  source_language?: unknown;
  target_language?: unknown;
  error?: string;
};

type CVTranslateModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const ROW_SECTION: Record<string, CvTranslationSection> = {
  Contact: 'personal',
  Summary: 'role_description',
  Skills: 'skills',
  Jobs: 'experience',
  Bullets: 'experience',
  Education: 'education',
  Certificates: 'certificates',
  Languages: 'languages'
};

const allSkills = (document: CvDocument): string[] =>
  document.skills.groups.flatMap((group) => group.items);

const counts = (document: CvDocument) => ({
  Contact:
    [document.personal.name, document.personal.email, document.personal.phone, document.personal.location]
      .filter((value) => value.trim()).length +
    Object.values(document.personal.links).filter((value) => value.trim()).length,
  Summary: document.role_description.trim() ? 1 : 0,
  Skills: allSkills(document).length,
  Jobs: document.experience.length,
  Bullets: document.experience.reduce(
    (total, entry) => total + entry.highlights.length,
    0
  ),
  Education: document.education.length,
  Certificates: document.certificates.length,
  Languages: document.languages.length
});

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

const summarise = (report: TranslationMergeReport): string => {
  const parts: string[] = [];
  const { added } = report;

  if (added.experience) {
    parts.push(
      added.experience + ' job' + (added.experience === 1 ? '' : 's')
    );
  }
  if (added.highlights) {
    parts.push(
      added.highlights + ' bullet' + (added.highlights === 1 ? '' : 's')
    );
  }
  if (added.education) parts.push(added.education + ' education');
  if (added.certificates) {
    parts.push(
      added.certificates +
        ' certificate' +
        (added.certificates === 1 ? '' : 's')
    );
  }
  if (added.languages) {
    parts.push(
      added.languages + ' language' + (added.languages === 1 ? '' : 's')
    );
  }
  if (added.skill_groups) {
    parts.push(
      added.skill_groups +
        ' skill group' +
        (added.skill_groups === 1 ? '' : 's')
    );
  }
  if (added.skills) {
    parts.push(added.skills + ' skill' + (added.skills === 1 ? '' : 's'));
  }
  if (report.filled.length) {
    parts.push(
      report.filled.length +
        ' empty field' +
        (report.filled.length === 1 ? '' : 's')
    );
  }

  return parts.join(', ');
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
  const { document: targetDocument, locale } = useCvDocument();
  const sourceLocale: Locale = locale === 'pl' ? 'en' : 'pl';
  const {
    document: sourceDocument,
    hydrated: sourceHydrated,
    blank: sourceBlank
  } = useCvDocument(sourceLocale);
  const [stage, setStage] = useState<Stage>({ name: 'idle' });
  const [sectionState, setSectionState] = useState<
    Record<string, { state: ProgressState; detail?: string }>
  >({});
  const [chosen, setChosen] = useState<Set<CvTranslationSection>>(
    () =>
      new Set(
        CV_TRANSLATION_SECTIONS.map((section) => section.key)
      )
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
        error:
          error instanceof Error
            ? error.message
            : 'The AI settings could not be read.'
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
          [section.key]: { state: 'done', detail: 'Already complete' }
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
          const detail = payload.error ?? 'Translation failed.';
          failed.push({ label: section.label, error: detail });
          setSectionState((previous) => ({
            ...previous,
            [section.key]: { state: 'failed', detail }
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
            'The runtime returned a translation for a different language or section.'
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
        const detail =
          error instanceof Error ? error.message : 'Translation failed.';
        failed.push({ label: section.label, error: detail });
        setSectionState((previous) => ({
          ...previous,
          [section.key]: { state: 'failed', detail }
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
    targetDocument
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
              Fill {locale.toUpperCase()} from {sourceLocale.toUpperCase()}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Missing content is translated from the other CV. Existing{' '}
              {locale.toUpperCase()} wording is never overwritten.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={stage.name === 'translating'}
            aria-label="Close"
            className="rounded px-2 py-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {(stage.name === 'idle' || stage.name === 'failed') && (
          <div className="space-y-4">
            {!sourceHydrated ? (
              <p className="rounded bg-gray-50 p-3 text-xs text-gray-600">
                Loading the {sourceLocale.toUpperCase()} CV…
              </p>
            ) : sourceBlank ? (
              <p className="rounded bg-amber-50 p-3 text-xs text-amber-800">
                The {sourceLocale.toUpperCase()} CV is empty. Add or import it
                before translating it into {locale.toUpperCase()}.
              </p>
            ) : (
              <p className="rounded bg-blue-50 p-3 text-xs text-blue-800">
                The {sourceLocale.toUpperCase()} CV stays unchanged. Only gaps
                found in the {locale.toUpperCase()} sections selected below
                will be offered for filling.
              </p>
            )}

            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700">
                  Translate
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
                    The whole CV
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
                    Only some sections
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
                      {section.label}
                    </label>
                  ))}
                </div>
              )}

              <p className="mt-1 text-[11px] text-gray-400">
                One translation pass per section. Sections with no gaps are
                checked locally and skipped without calling the model.
              </p>
            </div>

            {stage.name === 'failed' && (
              <p className="rounded bg-red-50 p-3 text-xs text-red-700">
                {stage.error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={translate}
                disabled={
                  !sourceHydrated || sourceBlank || chosen.size === 0
                }
                className="rounded bg-[#65B7FF] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#529ED5] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                Translate gaps
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
                      {section.label}
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
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-gray-400">
              Work experience usually takes longest. Existing translated
              entries are kept as they are.
            </p>
          </div>
        )}

        {stage.name === 'preview' && merged && (
          <div className="space-y-4">
            {stage.result.failed.length > 0 && (
              <div className="rounded bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-semibold">
                  Some sections could not be translated.
                </p>
                {stage.result.failed.map((entry) => (
                  <p key={entry.label} className="mt-1">
                    {entry.label} — {entry.error}
                  </p>
                ))}
                <p className="mt-1.5">
                  Successful sections can still be applied below.
                </p>
                <p className="mt-1.5">
                  A changed-number section is deliberately blocked. Apply the
                  successful sections, choose a faster extraction model in
                  Settings, then retry only the failed sections.
                </p>
              </div>
            )}

            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-400">
                  <th className="pb-1 font-medium">Section</th>
                  <th className="pb-1 text-right font-medium">
                    {locale.toUpperCase()} now
                  </th>
                  <th className="pb-1 text-right font-medium">
                    {sourceLocale.toUpperCase()} source
                  </th>
                  <th className="pb-1 text-right font-medium">After fill</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {Object.entries(sourceCounts).map(([label, sourceCount]) => {
                  const section = ROW_SECTION[label];
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
                        {label}
                      </td>
                      <td className="py-1 text-right">{current}</td>
                      <td
                        className={
                          'py-1 text-right ' +
                          (asked ? '' : 'text-gray-300')
                        }
                      >
                        {asked ? sourceCount : 'not asked'}
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
                ? 'No model call was needed; the selected sections have no fillable gaps.'
                : 'Translated from ' +
                  sourceLocale.toUpperCase() +
                  ' in ' +
                  (stage.result.elapsedMs / 1000).toFixed(0) +
                  's.'}
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={reset}
                className="mr-auto rounded px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
              >
                Start over
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={isEmptyTranslationReport(merged.report)}
                title={
                  isEmptyTranslationReport(merged.report)
                    ? 'The other CV has no missing content to add.'
                    : 'Adds ' + summarise(merged.report) + '.'
                }
                className="rounded bg-[#65B7FF] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#529ED5] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {isEmptyTranslationReport(merged.report)
                  ? 'Nothing to fill'
                  : 'Fill translated gaps — adds ' +
                    summarise(merged.report)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
