"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from 'next-intl';
import { LocalizedError } from '@/components/LocalizedError';
import {
  errorFromApi,
  type ErrorDescriptor
} from '@/libs/i18n/errors';
import { loadSettings, toRequestOverride } from "@/features/Settings/aiSettings";
import { useCvDocument } from "../hooks/useCvDocument";
import { parseDocument, type CvDocument } from "../document";
import { isEmptyReport, mergeDocument, type MergeReport } from "../merge";
import { replaceDocument } from "../store";

/**
 * Importing a CV: pick files, read them, then decide what to do with the result.
 *
 * The decision is the point. An extraction is a *claim* made by a small model,
 * and this project has measured that model dropping a bullet, inventing a
 * certificate out of a line in the skills list, and reading "Vue" as a language
 * the user speaks. Landing that on the document unseen is how a CV acquires a
 * fact nobody wrote, so nothing is applied until the counts have been shown
 * beside the ones already here.
 *
 * Two ways to apply it, because neither alone is enough. `Replace` is what an
 * import usually means — this file is my CV. `Fill gaps` is the runtime's
 * never-overwrite merge, which is the safe one but reports "nothing to add"
 * against a document that is already complete, and after seeding it always is.
 */

type Stage =
  | { name: "idle" }
  | { name: "reading" }
  | { name: "failed"; error: ErrorDescriptor }
  | { name: "preview"; result: ImportResult };

type ImportResult = {
  document: CvDocument;
  /**
   * Which artefacts this run actually asked for.
   *
   * Load-bearing, not bookkeeping. A narrowed run returns a document that is
   * empty everywhere it did not look, and without this the preview reads
   * "Jobs: 0 found" for a section nobody asked about — and "Replace" would
   * apply that emptiness over seven real jobs. Everything below distinguishes
   * "read, and there was nothing" from "never read" using this.
   */
  read: SectionKey[];
  /** Non-critical steps that failed. An empty section means something else. */
  degraded: string[];
  skipped: { reference: string; reason: string }[];
  sources: { reference: string; characters: number }[];
  elapsedMs: number;
};

/** Which sections feed each row of the found-against-current table. */
const ROW_SECTION = {
  jobs: "experience",
  bullets: "experience",
  education: "education",
  certificates: "certificates",
  languages: "languages",
  skills: "skills",
};

/**
 * The CV is read one artefact at a time, not in a single request.
 *
 * All seven extractions are independent passes over the same text, but a local
 * model runs them in turn — so one request costs their sum, and that sum was
 * exceeding four minutes on a 12B model and failing the whole import for want of
 * the last step. Measured on the real CV, split up: the longest single request
 * is 17.6s against a 38s total, so a budget now has to cover one step instead of
 * seven.
 *
 * The order is the order a CV is read in, because that is the order a
 * half-filled preview should arrive in. `skills` comes early for a second
 * reason: certificates and languages are cross-checked against it, and the
 * runtime cannot apply those guards to a request that did not extract skills —
 * so what it finds is carried forward as `known_skills`.
 */
const SECTIONS = [
  { key: "personal" },
  { key: "role_description" },
  { key: "skills" },
  { key: "experience" },
  { key: "education" },
  { key: "certificates" },
  { key: "languages" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];
type SectionState = "waiting" | "reading" | "done" | "failed";

/**
 * What `/api/cv/import` answers with.
 *
 * Written out rather than inferred because the request body reads `corpus`,
 * which is assigned from the response — TypeScript sees that as circular and
 * gives up on both. Stating the shape once breaks the cycle, and it has to be
 * `unknown`-ish anyway: this arrives from a model by way of two processes.
 */
type ImportPayload = {
  document?: unknown;
  text?: unknown;
  degraded?: unknown;
  skipped?: unknown;
  sources?: unknown;
  error?: string | ErrorDescriptor;
};

/** Copies one artefact across, leaving everything else as it was. */
const applySection = (
  into: CvDocument,
  section: SectionKey,
  from: CvDocument
): CvDocument => {
  switch (section) {
    case "personal":
      return { ...into, personal: from.personal };
    case "role_description":
      return { ...into, role_description: from.role_description };
    case "skills":
      // `role` rides along with skills; it is the one field the skills step
      // extracts that is not a list.
      return { ...into, skills: from.skills };
    default:
      return { ...into, [section]: from[section] };
  }
};

type CVImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

/** What one section holds, for the found-against-current table. */
const counts = (cv: CvDocument) => ({
  jobs: cv.experience.length,
  bullets: cv.experience.reduce((total, job) => total + job.highlights.length, 0),
  education: cv.education.length,
  certificates: cv.certificates.length,
  languages: cv.languages.length,
  skills: allSkills(cv).length,
});
type CountKey = keyof ReturnType<typeof counts>;

/** Every skill on the strip, whatever row it is filed under. */
const allSkills = (cv: CvDocument): string[] =>
  cv.skills.groups.flatMap((group) => group.items);

/** Reads a file as the `data:…;base64,…` form the runtime accepts. */
const toDataUrl = (file: File, unreadable: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(unreadable));
    reader.readAsDataURL(file);
  });

export function CVImportModal({ isOpen, onClose }: CVImportModalProps) {
  const t = useTranslations('cv.import');
  const commonT = useTranslations('common');
  const { document: cvDocument, locale } = useCvDocument();
  const [files, setFiles] = useState<File[]>([]);
  const [pasted, setPasted] = useState("");
  const [stage, setStage] = useState<Stage>({ name: "idle" });

  const sectionLabel = useCallback(
    (key: SectionKey) => t(`sections.${key}`),
    [t]
  );

  const summarise = useCallback(
    (report: MergeReport): string => {
      const parts: string[] = [];
      const { added } = report;
      if (added.experience) parts.push(t('summary.jobs', { count: added.experience }));
      if (added.highlights) parts.push(t('summary.bullets', { count: added.highlights }));
      if (added.education) parts.push(t('summary.education', { count: added.education }));
      if (added.certificates) parts.push(t('summary.certificates', { count: added.certificates }));
      if (added.languages) parts.push(t('summary.languages', { count: added.languages }));
      if (added.skills) parts.push(t('summary.skills', { count: added.skills }));
      if (report.filled.length) parts.push(t('summary.fields', { count: report.filled.length }));
      return parts.join(', ');
    },
    [t]
  );

  /**
   * Which artefacts to ask for. All of them unless narrowed.
   *
   * Separate from *how* they are run: the requests are one-per-section either
   * way, because that is what stops a slow model failing the whole import. This
   * only decides which ones are asked for at all — worth having because a
   * re-import is usually after one thing. Re-reading a CV to correct the
   * certificates should not spend ninety seconds re-extracting the jobs.
   */
  const [chosen, setChosen] = useState<Set<SectionKey>>(
    () => new Set(SECTIONS.map((section) => section.key))
  );

  const everything = chosen.size === SECTIONS.length;

  const toggleSection = useCallback((key: SectionKey) => {
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const onEscape = (event: KeyboardEvent) => {
      // Not while reading: the run is 30 seconds of somebody's GPU and closing
      // the panel would abandon it without stopping it.
      if (event.key === "Escape" && stage.name !== "reading") onClose();
    };

    window.document.addEventListener("keydown", onEscape);
    return () => window.document.removeEventListener("keydown", onEscape);
  }, [isOpen, onClose, stage.name]);

  const reset = useCallback(() => {
    setFiles([]);
    setPasted("");
    setStage({ name: "idle" });
  }, []);

  const [sectionState, setSectionState] = useState<
    Record<string, { state: SectionState; error?: ErrorDescriptor }>
  >({});

  const read = useCallback(async () => {
    const queue = SECTIONS.filter((section) => chosen.has(section.key));

    setStage({ name: "reading" });
    setSectionState(
      Object.fromEntries(queue.map((s) => [s.key, { state: "waiting" as const }]))
    );

    const ai = toRequestOverride(loadSettings());
    const started = Date.now();

    // The locale rides along so that the runtime's three unnamed skill lists
    // are headed in the language of the CV being imported into.
    let accumulated = parseDocument({}, locale);
    let corpus: string | null = null;

    /**
     * Seeded from the CV already here when skills are not being re-read.
     *
     * Certificates and spoken languages are cross-checked against extracted
     * skills, and narrowing the run to "just certificates" leaves that guard
     * with nothing to compare against — measured, it let `ICP Blockchain SDK`
     * back in as a certificate. The skills on the existing document answer the
     * same question and cost nothing, so a narrowed run is guarded exactly as
     * well as a whole one.
     */
    let knownSkills: string[] = chosen.has("skills")
      ? []
      : allSkills(cvDocument);
    const failures: SectionKey[] = [];
    const degraded: string[] = [];
    let skipped: ImportResult["skipped"] = [];
    let sources: ImportResult["sources"] = [];

    try {
      // Read from the files on the first request only. Every later one is
      // handed the text that came back, so the PDF is parsed once — and a
      // screenshot is put through the vision model once rather than seven times.
      const fileSources = [
        ...(await Promise.all(
          files.map(async (file) => ({
            kind: "upload" as const,
            filename: file.name,
            content: await toDataUrl(
              file,
              t('fileUnreadable', { filename: file.name })
            ),
          }))
        )),
        ...(pasted.trim()
          ? [{ kind: "text" as const, label: t('pastedSource'), content: pasted.trim() }]
          : []),
      ];

      for (const section of queue) {
        setSectionState((prev) => ({ ...prev, [section.key]: { state: "reading" } }));

        const response = await fetch("/api/cv/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sources:
              corpus === null
                ? fileSources
                : [{ kind: "text", label: "cv", content: corpus }],
            sections: [section.key],
            known_skills: knownSkills,
            ai,
          }),
        });

        const payload = (await response.json()) as ImportPayload;

        if (!response.ok) {
          const error = errorFromApi(payload, 'cv.importFailed');
          // One section failing must not lose the others. The run continues and
          // the preview says which artefact is missing and why — the whole
          // reason for splitting the request up.
          failures.push(section.key);
          setSectionState((prev) => ({
            ...prev,
            [section.key]: { state: "failed", error },
          }));

          // Nothing was read at all, so there is no corpus and no point going on.
          if (corpus === null) {
            setStage({ name: "failed", error });
            return;
          }
          continue;
        }

        const document = parseDocument(payload.document, locale);
        accumulated = applySection(accumulated, section.key, document);

        if (typeof payload.text === "string" && payload.text) corpus = payload.text;
        if (Array.isArray(payload.degraded)) degraded.push(...payload.degraded);
        if (Array.isArray(payload.skipped) && payload.skipped.length) skipped = payload.skipped;
        if (Array.isArray(payload.sources) && payload.sources.length) sources = payload.sources;

        if (section.key === "skills") knownSkills = allSkills(document);

        setSectionState((prev) => ({ ...prev, [section.key]: { state: "done" } }));
      }

      setStage({
        name: "preview",
        result: {
          document: accumulated,
          read: queue.map((section) => section.key),
          // A section whose request failed is reported alongside the runtime's
          // own degraded steps: both mean "this is empty for a reason".
          degraded: [...new Set([...degraded, ...failures])],
          skipped,
          sources,
          elapsedMs: Date.now() - started,
        },
      });
    } catch (error) {
      setStage({
        name: "failed",
        error: {
          code: 'cv.importFailed',
          detail: error instanceof Error ? error.message : undefined
        },
      });
    }
  }, [files, pasted, chosen, cvDocument, locale, t]);

  const merged = useMemo(
    () =>
      stage.name === "preview"
        ? mergeDocument(cvDocument, stage.result.document)
        : null,
    [stage, cvDocument]
  );

  /**
   * What "Replace" writes.
   *
   * Only the artefacts that were read. Applying the extracted document whole
   * would be right after a full import and destructive after a narrowed one —
   * re-reading just the certificates would blank seven jobs, silently, from a
   * button whose label said nothing about them. So replacing means "overwrite
   * what I asked for", and everything else is carried across untouched.
   */
  const replacement = useMemo(() => {
    if (stage.name !== "preview") return null;
    return stage.result.read.reduce(
      (document, section) => applySection(document, section, stage.result.document),
      cvDocument
    );
  }, [stage, cvDocument]);

  const apply = useCallback(
    (next: CvDocument) => {
      replaceDocument(locale, next);
      reset();
      onClose();
    },
    [locale, onClose, reset]
  );

  if (!isOpen) return null;

  const hasSources = files.length > 0 || pasted.trim().length > 0;
  const current = counts(cvDocument);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {t('title', { language: locale.toUpperCase() })}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {t('description')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={stage.name === "reading"}
            aria-label={commonT('close')}
            className="rounded px-2 py-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {(stage.name === "idle" || stage.name === "failed") && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t('files')}
              </label>
              <input
                type="file"
                multiple
                accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp"
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                className="block w-full text-xs text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-[#65B7FF] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-[#529ED5]"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                {t('exportWarning')}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t('pasteLabel')}
              </label>
              <textarea
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                rows={4}
                className="w-full rounded border border-gray-200 p-2 text-xs focus:border-[#65B7FF] focus:outline-none focus:ring-1 focus:ring-[#65B7FF]"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700">{t('read')}</span>
                <div className="inline-flex overflow-hidden rounded border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setChosen(new Set(SECTIONS.map((s) => s.key)))}
                    className={`px-2.5 py-1 text-[11px] transition-colors ${
                      everything
                        ? "bg-[#65B7FF] text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {t('wholeCv')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setChosen(new Set(["experience"]))}
                    className={`border-l border-gray-200 px-2.5 py-1 text-[11px] transition-colors ${
                      everything
                        ? "bg-white text-gray-600 hover:bg-gray-50"
                        : "bg-[#65B7FF] text-white"
                    }`}
                  >
                    {t('someSections')}
                  </button>
                </div>
              </div>

              {!everything && (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded bg-gray-50 p-2.5">
                  {SECTIONS.map((section) => (
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
                      {sectionLabel(section.key)}
                    </label>
                  ))}
                </div>
              )}

              <p className="mt-1 text-[11px] text-gray-400">
                {everything
                  ? t('allPassesHint')
                  : t('somePassesHint')}
              </p>
            </div>

            {stage.name === "failed" && (
              <LocalizedError
                error={stage.error}
                className="rounded bg-red-50 p-3 text-xs text-red-700"
              />
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={read}
                disabled={!hasSources || chosen.size === 0}
                className="rounded bg-[#65B7FF] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#529ED5] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {t('readCv')}
              </button>
            </div>
          </div>
        )}

        {stage.name === "reading" && (
          <div className="space-y-3 py-2">
            {/*
              A list rather than a spinner, because the run is now seven requests
              and they land one at a time. A spinner would say nothing about
              which of them is slow — and `experience` is reliably the slow one,
              at 17.6s against 2–6s for the rest.
            */}
            <ul className="space-y-1.5">
              {/*
                Only the sections this run asked for. Listing the rest as
                "waiting" would promise work that is never going to happen.
              */}
              {SECTIONS.filter((section) => section.key in sectionState).map((section) => {
                const entry = sectionState[section.key];
                return (
                  <li key={section.key} className="flex items-center gap-2 text-xs">
                    <span className="w-4 text-center">
                      {entry.state === "done" && <span className="text-green-600">✓</span>}
                      {entry.state === "failed" && <span className="text-red-500">✕</span>}
                      {entry.state === "reading" && (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-200 border-t-[#65B7FF]" />
                      )}
                      {entry.state === "waiting" && <span className="text-gray-300">·</span>}
                    </span>
                    <span
                      className={
                        entry.state === "waiting"
                          ? "text-gray-400"
                          : entry.state === "failed"
                            ? "text-red-600"
                            : "text-gray-700"
                      }
                    >
                      {sectionLabel(section.key)}
                    </span>
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

        {stage.name === "preview" && merged && (
          <div className="space-y-4">
            {stage.result.degraded.length > 0 && (
              /*
                Worth its own box rather than a footnote. A failed step returns
                nothing and the import still succeeds, so on the table below it
                looks exactly like a section the CV genuinely does not have —
                and only one of those two is worth running again.

                "Reading again often fixes it" is what this used to say, and it
                was wrong in the case that actually happens. Measured: the skills
                step failed on `gemma4:12b` on every attempt for one real CV,
                spending its whole token budget and returning nothing, while
                `gemma3:4b` read the same file in 3.5s. Advising a retry there
                costs another two minutes to reach the same place.
              */
              <div className="rounded bg-amber-50 p-3 text-xs text-amber-800">
                <p>
                  <strong>
                    {t('degradedTitle', {
                      sections: stage.result.degraded
                        .map((value) =>
                          SECTIONS.some((section) => section.key === value)
                            ? sectionLabel(value as SectionKey)
                            : value
                        )
                        .join(', ')
                    })}
                  </strong>{' '}
                  {t('degradedExplanation')}
                </p>
                <p className="mt-1.5">
                  {t('degradedAdvice')}
                </p>
              </div>
            )}

            {stage.result.skipped.length > 0 && (
              <div className="rounded bg-amber-50 p-3 text-xs text-amber-800">
                {stage.result.skipped.map((entry) => (
                  <p key={entry.reference}>
                    <strong>{entry.reference}</strong> — {entry.reason}
                  </p>
                ))}
              </div>
            )}

            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-400">
                  <th className="pb-1 font-medium">{t('tableSection')}</th>
                  <th className="pb-1 text-right font-medium">{t('tableCurrent')}</th>
                  <th className="pb-1 text-right font-medium">{t('tableFound')}</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {/*
                  A row for a section that was never asked for says so, rather
                  than reporting zero. Zero is an answer — "I looked and there
                  are none" — and a narrowed run has not earned it.
                */}
                <tr className="border-b border-gray-100">
                  <td className="py-1">{t('name')}</td>
                  <td className="py-1 text-right">{cvDocument.personal.name || "—"}</td>
                  <td className="py-1 text-right">
                    {stage.result.read.includes("personal") ? (
                      stage.result.document.personal.name || "—"
                    ) : (
                      <span className="text-gray-300">{t('notAsked')}</span>
                    )}
                  </td>
                </tr>
                {(Object.entries(counts(stage.result.document)) as [CountKey, number][]).map(([label, found]) => {
                  const asked = stage.result.read.includes(ROW_SECTION[label] as SectionKey);
                  return (
                    <tr key={label} className="border-b border-gray-100">
                      <td className={`py-1 ${asked ? "" : "text-gray-300"}`}>
                        {t(`rows.${label}`)}
                      </td>
                      <td className="py-1 text-right">
                        {current[label as keyof typeof current]}
                      </td>
                      <td
                        className={`py-1 text-right ${
                          !asked ? "text-gray-300" : found === 0 ? "text-amber-600" : ""
                        }`}
                      >
                        {asked ? found : t('notAsked')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="text-[11px] text-gray-400">
              {t('readSummary', {
                sources: stage.result.sources.map((s) => s.reference).join(', '),
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
                onClick={() => apply(merged.document)}
                disabled={isEmptyReport(merged.report)}
                title={
                  isEmptyReport(merged.report)
                    ? t('everythingPresent')
                    : t('adds', { items: summarise(merged.report) })
                }
                className="rounded border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
              >
                {isEmptyReport(merged.report)
                  ? t('nothingToFill')
                  : t('fillGaps', { items: summarise(merged.report) })}
              </button>
              <button
                type="button"
                onClick={() => replacement && apply(replacement)}
                title={
                  stage.result.read.length === SECTIONS.length
                    ? t('overwriteWhole')
                    : t('overwriteSome', {
                        sections: stage.result.read.map(sectionLabel).join(', ')
                      })
                }
                className="rounded bg-[#65B7FF] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#529ED5]"
              >
                {stage.result.read.length === SECTIONS.length
                  ? t('replaceCv')
                  : t('replaceSections', { count: stage.result.read.length })}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
