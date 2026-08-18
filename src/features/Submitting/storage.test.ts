import { describe, expect, it } from 'vitest';
import { parseState, serializeState, STORAGE_VERSION } from './storage';
import {
  cvFixture,
  offerFixture,
  proposalFixture
} from '@/test/fixtures/evidence';
import { createEvidenceVariant } from './evidence';

describe('submitting storage v2 migration', () => {
  it('preserves a legacy tailored CV as unverified history and blocks it as active', () => {
    const state = parseState({
      version: 1,
      submissions: [
        {
          id: 'submission-1',
          recordId: 'record-1',
          offer: offerFixture(),
          language: 'en',
          queuedAt: '2026-01-01T00:00:00.000Z',
          cv: {
            title: 'SENIOR FRONTEND DEVELOPER',
            summary: 'Legacy uncited summary.',
            language: 'en',
            generatedAt: '2026-01-02T00:00:00.000Z'
          },
          apply: { email: '', subject: '', body: '' }
        }
      ]
    });
    expect(state.submissions[0].cv).toBeUndefined();
    expect(state.submissions[0].legacyVariants?.[0]).toMatchObject({
      version: 'legacy-v1-unverified',
      summary: 'Legacy uncited summary.'
    });
    expect(serializeState(state).version).toBe(STORAGE_VERSION);
  });

  it('marks a sent legacy variant as historical', () => {
    const state = parseState({
      version: 1,
      submissions: [
        {
          id: 'submission-1',
          recordId: 'record-1',
          offer: offerFixture(),
          language: 'en',
          queuedAt: '2026-01-01T00:00:00.000Z',
          sentAt: '2026-01-03T00:00:00.000Z',
          cv: { title: 'Frontend', summary: 'Legacy.', generatedAt: '2026-01-02T00:00:00.000Z' },
          apply: { email: '', subject: '', body: '' }
        }
      ]
    });
    expect(state.submissions[0].legacyVariants?.[0].historicalSentAt).toBe(
      '2026-01-03T00:00:00.000Z'
    );
  });

  it('demotes a stored approval when required changes were not accepted', () => {
    const cv = createEvidenceVariant({
      sourceCv: cvFixture(),
      sourceOffer: offerFixture(),
      language: 'en',
      response: {
        version: 'evidence-v2',
        proposal: proposalFixture(),
        provider: 'mock',
        model: 'mock',
        promptVersion: 'test',
        generatedAt: '2026-01-02T00:00:00.000Z'
      }
    });
    const state = parseState({
      version: 2,
      submissions: [
        {
          id: 'submission-1',
          recordId: 'record-1',
          offer: offerFixture(),
          language: 'en',
          queuedAt: '2026-01-01T00:00:00.000Z',
          cv: { ...cv, reviewState: 'approved', acceptedChangeIds: [] },
          apply: { email: '', subject: '', body: '' }
        }
      ],
      activeId: 'submission-1'
    });

    expect(state.submissions[0].cv?.reviewState).toBe('draft');
  });
});
