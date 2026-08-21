"use client";

import { useCallback, useMemo } from 'react';
import { useJobResearch } from '@/features/JobResearch/hooks/useJobResearch';
import type { JobRecord } from '@/features/JobResearch/types';
import { setOffer } from '../store';
import type { Submission } from '../types';
import { toOfferSnapshot } from '../types';

/**
 * Re-runs the offer analysis from here, and folds the result back in.
 *
 * The same two actions the research table has, on the offer being applied to:
 * "Analyse" reads the stored scrape again, "Re-run" goes back to the board.
 * They matter more here than there — an imported row reaches this page with
 * company_type, role_profile, ideal_candidate and responsibilities all empty,
 * and those are most of what makes a tailored CV specific rather than generic.
 *
 * It reuses the research hook rather than re-implementing the call, so the
 * research row is updated by exactly the code that owns it — deduplication,
 * board facts, status and notes preserved — and this only has to refresh its
 * own copy afterwards.
 */

export const useOfferAnalysis = () => {
  const { allRecords, research, isResearching, error, clearError } =
    useJobResearch();

  /** The row a submission came from, if it is still there. */
  const recordFor = useCallback(
    (submission: Submission): JobRecord | undefined =>
      allRecords.find((item) => item.id === submission.recordId),
    [allRecords]
  );

  const run = useCallback(
    async (submission: Submission, useStoredText: boolean) => {
      const record = allRecords.find(
        (item) => item.id === submission.recordId
      );
      if (!record) return false;

      const updated = await research({
        url: record.source_url,
        offerText: useStoredText ? record.offer_text : undefined,
        replaceId: record.id,
        textSource: useStoredText ? 'scraper' : undefined,
        boardFacts: useStoredText ? record.board_facts : undefined
      });

      if (!updated) return false;

      setOffer(submission.id, toOfferSnapshot(updated));
      return true;
    },
    [allRecords, research]
  );

  /** Fills the analysed fields from the stored text, without re-reading the board. */
  const analyse = useCallback(
    (submission: Submission) => run(submission, true),
    [run]
  );

  /** Fetches the posting again, for rows that carry no stored text. */
  const rerun = useCallback(
    (submission: Submission) => run(submission, false),
    [run]
  );

  return useMemo(
    () => ({
      recordFor,
      analyse,
      rerun,
      isAnalysing: isResearching,
      analysisError: error,
      clearAnalysisError: clearError
    }),
    [recordFor, analyse, rerun, isResearching, error, clearError]
  );
};
