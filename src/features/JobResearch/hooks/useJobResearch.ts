"use client";

import { useCallback, useState, useSyncExternalStore } from 'react';
import { useLocale } from 'next-intl';
import type { JobRecord, OfferAnalysis } from '../types';
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
  const records = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const [isResearching, setIsResearching] = useState(false);
  const [error, setError] = useState<ResearchError | null>(null);

  const research = useCallback(
    async ({ url, offerText, replaceId }: ResearchInput) => {
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
      // history across two rows; point at the existing one instead.
      if (!replaceId && trimmedUrl) {
        const existing = findByUrl(records, trimmedUrl);
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
          ? records.find((item) => item.id === replaceId)
          : undefined;

        const record: JobRecord = {
          ...analysis,
          source_url: normalizeUrl(analysis.source_url || trimmedUrl),
          id: existing?.id ?? createId(),
          // Re-running the analysis must not wipe the user's own tracking.
          status: existing?.status ?? 'new',
          notes: existing?.notes ?? ''
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
    [locale, records]
  );

  const clearError = useCallback(() => setError(null), []);

  return { records, research, isResearching, error, clearError };
};
