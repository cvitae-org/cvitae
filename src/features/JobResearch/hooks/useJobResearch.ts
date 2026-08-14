"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { useLocale } from 'next-intl';
import type { BoardFacts, JobRecord, OfferAnalysis } from '../types';
import { MANUAL_LIST_ID } from '../types';
import { createId, findByUrl, normalizeUrl } from '../storage';
import { loadSettings, toRequestOverride } from '@/features/Settings/aiSettings';
import {
  addRecord,
  getServerSnapshot,
  getSnapshot,
  replaceRecord,
  subscribe
} from '../store';

export type ResearchError = {
  message: string;
  /** The board blocked us or served no text — a manual paste is the way out. */
  needsManualText: boolean;
};

type ResearchInput = {
  url: string;
  offerText?: string;
  /** Re-runs the analysis for an existing row instead of adding a new one. */
  replaceId?: string;
  /**
   * Marks `offerText` as a stored scrape rather than a human paste, so the
   * record stays `source_mode: 'url'` and the board's own figures are replayed
   * over the analysis instead of being lost to it.
   */
  textSource?: 'scraper';
  boardFacts?: BoardFacts;
};

type ApiResponse = OfferAnalysis & {
  source_url: string;
  source_mode: JobRecord['source_mode'];
  source_note: string;
  checked_at: string;
  locale: string;
};

export const useJobResearch = () => {
  const locale = useLocale();
  const {
    data: { records: allRecords, lists, activeListId },
    // False until the stored offers have been read back out of IndexedDB.
    // Passed through so the table can hold its empty state: "no offers
    // researched yet" is a different thing from "not loaded yet", and under a
    // synchronous store the difference never had to be drawn.
    hydrated
  } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // What the table shows: one tab's worth. `allRecords` stays available for
  // the things that are genuinely global — the tab counts, and finding a row
  // by id.
  const records = useMemo(
    () => allRecords.filter((record) => record.listId === activeListId),
    [allRecords, activeListId]
  );

  // Where URL research lands, whichever tab happens to be open. Imported tabs
  // stay a faithful copy of the file behind them.
  const manualRecords = useMemo(
    () => allRecords.filter((record) => record.listId === MANUAL_LIST_ID),
    [allRecords]
  );

  const [isResearching, setIsResearching] = useState(false);
  const [error, setError] = useState<ResearchError | null>(null);

  const research = useCallback(
    async ({
      url,
      offerText,
      replaceId,
      textSource,
      boardFacts
    }: ResearchInput) => {
      const trimmedUrl = url.trim();
      const trimmedText = offerText?.trim() ?? '';

      if (!trimmedUrl && !trimmedText) {
        setError({
          message: 'Paste a job offer URL to research.',
          needsManualText: false
        });
        return null;
      }

      // Researching the same posting twice wastes a call and splits its
      // history across two rows; point at the existing one instead. Scoped to
      // Manual, because that is where the new row would land — an imported tab
      // holding the same URL is that file's copy, and is left alone for the
      // same reason an import does not skip offers already present elsewhere.
      if (!replaceId && trimmedUrl) {
        const existing = findByUrl(manualRecords, trimmedUrl);
        if (existing) {
          setError({
            message: `Already researched on ${new Date(existing.checked_at).toLocaleDateString()} — ${existing.company}, ${existing.position}. Use "Re-run" on that row to refresh it.`,
            needsManualText: false
          });
          return null;
        }
      }

      setIsResearching(true);
      setError(null);

      try {
        const response = await fetch('/api/jobs/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: trimmedUrl,
            offerText: trimmedText || undefined,
            textSource,
            boardFacts,
            locale,
            ai: toRequestOverride(loadSettings())
          })
        });

        const data = await response.json();

        if (!response.ok) {
          setError({
            message: data.error ?? 'Failed to analyse the job offer.',
            // A rate limit is not something a manual paste can work around.
            needsManualText:
              Boolean(data.needsManualText) && data.reason !== 'rate_limited'
          });
          return null;
        }

        const analysis = data as ApiResponse;
        const existing = replaceId
          ? allRecords.find((item) => item.id === replaceId)
          : undefined;

        const record: JobRecord = {
          ...analysis,
          source_url: normalizeUrl(analysis.source_url || trimmedUrl),
          id: existing?.id ?? createId(),
          // A re-run stays in its own tab — re-analysing an imported row must
          // not pull it out of the file it belongs to. Anything new goes to
          // Manual, and `addRecord` opens Manual so the row is in view.
          listId: existing?.listId ?? MANUAL_LIST_ID,
          // Re-running the analysis must not wipe the user's own tracking.
          status: existing?.status ?? 'new',
          notes: existing?.notes ?? '',
          // Nor the stored scrape: the route does not echo these back, and
          // dropping them would leave the row unable to be analysed again.
          offer_text: existing?.offer_text,
          board_facts: existing?.board_facts
        };

        if (existing) {
          replaceRecord(record);
        } else {
          addRecord(record);
        }

        return record;
      } catch {
        setError({
          message: 'Could not reach the analysis service.',
          needsManualText: false
        });
        return null;
      } finally {
        setIsResearching(false);
      }
    },
    [locale, manualRecords, allRecords]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    records,
    allRecords,
    lists,
    activeListId,
    hydrated,
    research,
    isResearching,
    error,
    clearError
  };
};
