import { describe, expect, it } from 'vitest';
import { cvFixture, offerFixture, proposalFixture } from '@/test/fixtures/evidence';
import {
  approveVariant,
  createEvidenceVariant,
  requiredChangeIds
} from './evidence';
import {
  COLD_AFTER_DAYS,
  FOLLOW_UP_AFTER_DAYS,
  runSubmittingAudit
} from './audit';
import type { Submission } from './types';

const NOW = Date.parse('2026-06-01T00:00:00.000Z');

const daysAgo = (days: number): string =>
  new Date(NOW - days * 86_400_000).toISOString();

const approvedVariant = () => {
  const variant = createEvidenceVariant({
    sourceCv: cvFixture(),
    sourceOffer: offerFixture(),
    language: 'en',
    response: {
      version: 'evidence-v2',
      proposal: proposalFixture(),
      provider: 'test',
      model: 'test',
      promptVersion: 'test',
      generatedAt: '2026-01-01T00:00:00.000Z'
    }
  });

  // Approval is gated on every proposed change having been looked at, which is
  // the point of the review step — a variant cannot be approved around it.
  return approveVariant({
    ...variant,
    acceptedChangeIds: requiredChangeIds(variant)
  });
};

const submission = (patch: Partial<Submission> = {}): Submission => ({
  id: 'submission-1',
  recordId: 'record-1',
  offer: offerFixture(),
  language: 'en',
  queuedAt: daysAgo(1),
  apply: { email: 'jobs@example.com', subject: 'Application', body: 'Hello.' },
  ...patch
});

describe('submitting audit', () => {
  it('flags an application sent past the follow-up window and names it', () => {
    const report = runSubmittingAudit({
      submissions: [
        submission({ sentAt: daysAgo(FOLLOW_UP_AFTER_DAYS + 1) })
      ],
      now: NOW
    });

    expect(report.chase).toHaveLength(1);
    expect(report['awaiting-reply'][0]).toMatchObject({
      messageKey: 'follow-up',
      severity: 'warning'
    });
    expect(report['awaiting-reply'][1]).toMatchObject({
      messageKey: 'chase-one',
      values: { company: 'Hiring Co', days: FOLLOW_UP_AFTER_DAYS + 1 }
    });
  });

  it('leaves a recent send alone', () => {
    const report = runSubmittingAudit({
      submissions: [submission({ sentAt: daysAgo(FOLLOW_UP_AFTER_DAYS - 1) })],
      now: NOW
    });

    expect(report.chase).toEqual([]);
    expect(report['awaiting-reply'][0]).toMatchObject({
      messageKey: 'all-recent',
      severity: 'info'
    });
  });

  /**
   * Past a month the useful advice changes from "chase it" to "stop waiting",
   * so the finding stops being a warning — there is no action left to take.
   */
  it('downgrades a cold application from a chase to a write-off', () => {
    const report = runSubmittingAudit({
      submissions: [submission({ sentAt: daysAgo(COLD_AFTER_DAYS + 5) })],
      now: NOW
    });

    const named = report['awaiting-reply'].find((item) =>
      item.code.startsWith('chase-submission')
    );
    expect(named).toMatchObject({ messageKey: 'cold-one', severity: 'info' });
    expect(report['awaiting-reply'].some((item) => item.code === 'cold')).toBe(true);
  });

  it('orders the chase list oldest first', () => {
    const report = runSubmittingAudit({
      submissions: [
        submission({ id: 'newer', sentAt: daysAgo(20) }),
        submission({ id: 'older', sentAt: daysAgo(60) })
      ],
      now: NOW
    });

    expect(report.chase.map((entry) => entry.submission.id)).toEqual([
      'older',
      'newer'
    ]);
  });

  it('reports an approved, addressed application as ready to send', () => {
    const report = runSubmittingAudit({
      submissions: [submission({ cv: approvedVariant() })],
      now: NOW
    });

    expect(report['ready-to-send'][0]).toMatchObject({
      messageKey: 'ready',
      severity: 'warning',
      values: { count: 1 }
    });
  });

  it('blocks an application with no address and no link to apply through', () => {
    const report = runSubmittingAudit({
      submissions: [
        submission({
          apply: { email: '', subject: '', body: '' },
          offer: { ...offerFixture(), source_url: '' }
        })
      ],
      now: NOW
    });

    expect(report.blocked.some((item) => item.severity === 'block')).toBe(true);
  });

  it('counts an unsent application that has sat in the queue too long', () => {
    const report = runSubmittingAudit({
      submissions: [submission({ queuedAt: daysAgo(COLD_AFTER_DAYS + 1) })],
      now: NOW
    });

    expect(
      report['queue-health'].some((item) => item.code === 'stalled')
    ).toBe(true);
  });

  it('reports an empty queue without inventing findings', () => {
    const report = runSubmittingAudit({ submissions: [], now: NOW });
    expect(report['awaiting-reply']).toEqual([
      { code: 'empty', messageKey: 'empty', values: undefined, severity: 'info' }
    ]);
    expect(report.chase).toEqual([]);
  });
});
