"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { readSseStream } from '@/libs/runtime/sse';
import { errorFromApi, type ErrorDescriptor } from '@/libs/i18n/errors';
import type { BoardFacts, JobRecord, OfferAnalysis } from '../types';
import { MANUAL_LIST_ID } from '../types';
import { createId, findByUrl, normalizeUrl } from '../storage';
import { loadSettings, toRequestOverride } from '@/features/Settings/aiSettings';
import {
  addRecord,
  getResearchState,
  getServerSnapshot,
  getSnapshot,
  replaceRecord,
  subscribe
} from '../store';

export type BatchProgress = {
  total: number;
  /** Rows analysed and already written to storage. */
  done: number;
  failed: number;
};

export type ResearchError = ErrorDescriptor & {
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
  offer_text: string;
};

export const useJobResearch = () => {
  const locale = useLocale();
  const format = useFormatter();
  const common = useTranslations('common');
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

  /** Progress of a running batch, or null when none is. */
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const batchAbort = useRef<AbortController | null>(null);

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
          code: 'research.emptyUrl',
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
            code: 'research.duplicate',
            values: {
              date: format.dateTime(new Date(existing.checked_at), {
                dateStyle: 'medium'
              }),
              company:
                existing.company === 'Unknown'
                  ? common('unknown')
                  : existing.company,
              position:
                existing.position === 'Unknown'
                  ? common('unknown')
                  : existing.position
            },
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
            ...errorFromApi(data, 'research.analysisFailed'),
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
          offer_text: analysis.offer_text || existing?.offer_text,
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
          code: 'research.serviceUnreachable',
          needsManualText: false
        });
        return null;
      } finally {
        setIsResearching(false);
      }
    },
    [locale, manualRecords, allRecords, format, common]
  );

  /**
   * Analyses every row in the current tab that carries stored text.
   *
   * Each row is written to storage the moment its result arrives, which is the
   * whole reason this streams rather than returning a list. A batch of forty
   * against a local model runs for half an hour; if the tab is closed at row
   * twenty-nine, twenty-eight rows are analysed and saved, and running it again
   * picks up only what is left. Nothing is resumed because nothing needs to be.
   *
   * Rows without stored text are skipped rather than fetched. Re-reading forty
   * boards would put the slowest and least reliable part of the pipeline in
   * front of the part being batched, and a board that blocks us halfway through
   * would strand the run for a reason that has nothing to do with the model.
   */
  const researchMany = useCallback(
    async (targets: JobRecord[]) => {
      const analysable = targets.filter((record) => record.offer_text?.trim());

      if (analysable.length === 0) {
        setError({
          code: 'research.noStoredText',
          needsManualText: false
        });
        return null;
      }

      const controller = new AbortController();
      setBatch({ total: analysable.length, done: 0, failed: 0 });
      setError(null);
      batchAbort.current = controller;

      // Which rows were asked for is fixed at the start; what those rows
      // *contain* is not, and must be read again when each result lands. A
      // batch of forty runs for half an hour, and a status or a note changed
      // while it is running would otherwise be reverted the moment that row
      // came back — the model's fields overwriting the person's, silently,
      // half an hour after they typed them.
      const requested = new Set(analysable.map((record) => record.id));

      try {
        const response = await fetch('/api/jobs/research/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offers: analysable.map((record) => ({
              id: record.id,
              offerText: record.offer_text,
              boardFacts: record.board_facts
            })),
            locale,
            ai: toRequestOverride(loadSettings())
          }),
          signal: controller.signal
        });

        if (!response.ok || !response.body) {
          const detail = await response.json().catch(() => null);
          setError({
            ...errorFromApi(detail, 'research.batchStart'),
            needsManualText: false
          });
          return null;
        }

        await readSseStream(response.body, (frame) => {
          if (frame.event === 'error') {
            const payload = JSON.parse(frame.data) as unknown;
            setError({
              ...errorFromApi(payload, 'research.batchFailed'),
              needsManualText: false
            });
            return;
          }

          if (frame.event !== 'row') return;

          const row = JSON.parse(frame.data) as {
            id: string;
            status: 'ok' | 'failed';
            record?: OfferAnalysis & {
              source_note: string;
              checked_at: string;
              locale: string;
            };
          };

          // Read live, not from the snapshot above. A row deleted or moved
          // while the batch ran is respected rather than resurrected.
          if (!requested.has(row.id)) return;

          const existing = getResearchState().records.find(
            (item) => item.id === row.id
          );
          if (!existing) return;

          if (row.status === 'failed' || !row.record) {
            setBatch((state) =>
              state ? { ...state, failed: state.failed + 1 } : state
            );
            return;
          }

          // Written immediately, one row at a time. The user's own columns —
          // status, notes, which tab it lives in — and the stored scrape are
          // carried over rather than replaced: a re-analysis refreshes what the
          // model read, not what the person recorded.
          replaceRecord({
            ...existing,
            ...row.record,
            id: existing.id,
            listId: existing.listId,
            status: existing.status,
            notes: existing.notes,
            source_url: existing.source_url,
            offer_text: existing.offer_text,
            board_facts: existing.board_facts
          });

          setBatch((state) =>
            state ? { ...state, done: state.done + 1 } : state
          );
        });

        return true;
      } catch (cause) {
        // An abort is the user stopping it, not a failure. Everything already
        // written stays written.
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError({
            code: 'research.batchLost',
            needsManualText: false
          });
        }
        return null;
      } finally {
        batchAbort.current = null;
        setBatch(null);
      }
    },
    [locale]
  );

  /** Stops a batch. What has already landed is already saved. */
  const stopBatch = useCallback(() => batchAbort.current?.abort(), []);

  const clearError = useCallback(() => setError(null), []);

  return {
    records,
    allRecords,
    lists,
    activeListId,
    hydrated,
    research,
    isResearching,
    researchMany,
    stopBatch,
    batch,
    error,
    clearError
  };
};
