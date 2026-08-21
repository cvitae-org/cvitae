import { describe, expect, it } from 'vitest';
import { cvFixture } from '@/test/fixtures/evidence';
import { cvHaystack, offerCoverage, runResearchAudit } from './audit';
import { emptyDocument } from '@/features/CV/document';
import type { JobRecord, OfferRequirement } from './types';
import { NOT_STATED } from './types';

const requirement = (
  id: string,
  exactText: string,
  priority: OfferRequirement['priority'] = 'required'
): OfferRequirement => ({
  id,
  exactText,
  sourceQuote: exactText,
  category: 'skill',
  priority
});

const record = (patch: Partial<JobRecord> = {}): JobRecord => ({
  id: 'record-1',
  listId: 'manual',
  company: 'Hiring Co',
  company_type: 'Product company',
  company_size: '100',
  position: 'Frontend Developer',
  role_profile: 'Frontend Developer (React, TypeScript)',
  seniority: 'Mid',
  location: 'Warsaw',
  work_mode: 'remote',
  salary: '20 000 PLN',
  contract_type: 'B2B',
  engagement_length: 'Permanent',
  start_date: NOT_STATED,
  ideal_candidate: 'A frontend developer.',
  responsibilities: ['Build interfaces'],
  team: 'Product',
  how_to_apply: 'Form',
  required_skills: ['React'],
  requirements: [requirement('req-react', 'React')],
  source_url: 'https://example.com/1',
  source_mode: 'url',
  offer_text: 'We are looking for a React developer.',
  source_note: '',
  checked_at: new Date().toISOString(),
  locale: 'en',
  status: 'new',
  notes: '',
  ...patch
});

const NOW = Date.parse('2026-06-01T00:00:00.000Z');

describe('research audit', () => {
  it('evidences a requirement the CV states, and reports one it does not', () => {
    const coverage = offerCoverage(
      record({
        requirements: [
          requirement('req-react', 'React'),
          requirement('req-k8s', 'Kubernetes')
        ]
      }),
      cvHaystack(cvFixture())
    );

    expect(coverage).toMatchObject({ evidenced: 1, total: 2 });
    expect(coverage.gaps).toEqual(['Kubernetes']);
  });

  it('matches a requirement written as a sentence around the skill', () => {
    const haystack = cvHaystack(cvFixture());
    expect(
      offerCoverage(
        record({ requirements: [requirement('req', 'Strong TypeScript skills')] }),
        haystack
      ).evidenced
    ).toBe(1);
  });

  /**
   * The check is lexical, so the only defence against a false match is refusing
   * to claim one. Rust appears nowhere in the fixture CV.
   */
  it('does not claim evidence the CV has no words for', () => {
    expect(
      offerCoverage(
        record({ requirements: [requirement('req', 'Rust and WebAssembly')] }),
        cvHaystack(cvFixture())
      ).evidenced
    ).toBe(0);
  });

  it('ranks the offer with the most evidenced requirements first', () => {
    const report = runResearchAudit({
      records: [
        record({
          id: 'weak',
          company: 'Weak Co',
          requirements: [requirement('a', 'Kubernetes'), requirement('b', 'Rust')]
        }),
        record({
          id: 'strong',
          company: 'Strong Co',
          requirements: [requirement('a', 'React'), requirement('b', 'TypeScript')]
        })
      ],
      cv: cvFixture(),
      queuedIds: new Set(),
      now: NOW
    });

    expect(report.ranking[0]?.record.company).toBe('Strong Co');
    expect(report['best-fit'][0]).toMatchObject({
      messageKey: 'best',
      values: { company: 'Strong Co', evidenced: 2, total: 2, percent: 100 }
    });
  });

  /**
   * Regression: ranking on the bare ratio put a 1-of-1 offer above a 2-of-3
   * one, because a posting that states almost nothing is trivially "fully"
   * covered.
   */
  it('ranks a well-covered detailed offer above a thinly-stated perfect one', () => {
    const report = runResearchAudit({
      records: [
        record({
          id: 'thin',
          company: 'Thin Co',
          requirements: [requirement('a', 'React')]
        }),
        record({
          id: 'detailed',
          company: 'Detailed Co',
          requirements: [
            requirement('a', 'React'),
            requirement('b', 'TypeScript'),
            requirement('c', 'Kubernetes')
          ]
        })
      ],
      cv: cvFixture(),
      queuedIds: new Set(),
      now: NOW
    });

    expect(report.ranking.map((entry) => entry.record.company)).toEqual([
      'Detailed Co',
      'Thin Co'
    ]);
    // The displayed fraction stays honest; only the ordering is discounted.
    expect(report.ranking[0]).toMatchObject({ evidenced: 2, total: 3 });
  });

  it('calls a thin field weak rather than naming a best match outright', () => {
    const report = runResearchAudit({
      records: [
        record({
          requirements: [
            requirement('a', 'Kubernetes'),
            requirement('b', 'Rust'),
            requirement('c', 'Go')
          ]
        })
      ],
      cv: cvFixture(),
      queuedIds: new Set(),
      now: NOW
    });

    expect(report['best-fit'][0]).toMatchObject({
      messageKey: 'best-weak',
      severity: 'warning'
    });
  });

  it('says so when there is no CV to match against', () => {
    const report = runResearchAudit({
      records: [record()],
      cv: emptyDocument(),
      queuedIds: new Set(),
      now: NOW
    });

    expect(report['best-fit'][0]).toMatchObject({
      messageKey: 'no-cv',
      severity: 'warning'
    });
    expect(report.ranking).toEqual([]);
  });

  it('counts unanalysed rows, duplicates and stale checks', () => {
    const report = runResearchAudit({
      records: [
        record({ id: 'a' }),
        record({ id: 'b' }),
        record({
          id: 'c',
          source_url: 'https://example.com/2',
          role_profile: NOT_STATED,
          checked_at: '2026-01-01T00:00:00.000Z'
        })
      ],
      cv: cvFixture(),
      queuedIds: new Set(),
      now: NOW
    });

    const codes = (category: 'offer-coverage' | 'posting-quality') =>
      report[category].map((item) => item.code);

    expect(codes('offer-coverage')).toContain('unanalysed');
    expect(codes('posting-quality')).toContain('duplicates');
    expect(codes('posting-quality')).toContain('stale');
  });

  it('reports an empty tab without inventing findings', () => {
    const report = runResearchAudit({
      records: [],
      cv: cvFixture(),
      queuedIds: new Set(),
      now: NOW
    });

    expect(report['best-fit']).toEqual([
      { code: 'empty', messageKey: 'empty', values: undefined, severity: 'info' }
    ]);
  });
});
