import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cvFixture } from '@/test/fixtures/evidence';

const mocks = vi.hoisted(() => ({
  runCapability: vi.fn(),
  toRuntimeModel: vi.fn(() => ({
    providerId: 'local',
    modelId: 'gemma-test'
  }))
}));

vi.mock('@/libs/runtime/client', () => ({
  runCapability: mocks.runCapability,
  toRuntimeModel: mocks.toRuntimeModel
}));

import { POST } from './route';

const call = (body: unknown) =>
  POST(
    new Request('http://localhost/api/cv/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );

const requestBody = () => ({
  document: cvFixture('en'),
  source_language: 'en',
  target_language: 'pl',
  sections: ['experience'],
  ai: { providerId: 'local', modelId: 'gemma-test' }
});

const successfulOutcome = () => ({
  status: 'ok' as const,
  result: {
    capability: 'translate_cv',
    data: {
      document: cvFixture('pl'),
      translated: ['experience'],
      source_language: 'en',
      target_language: 'pl'
    },
    degraded: [],
    elapsedMs: 42
  }
});

describe('POST /api/cv/translate', () => {
  beforeEach(() => {
    mocks.runCapability.mockReset();
    mocks.toRuntimeModel.mockClear();
    mocks.runCapability.mockResolvedValue(successfulOutcome());
  });

  it('forwards the opposite-language document and selected section to translate_cv', async () => {
    const body = requestBody();
    const response = await call(body);

    expect(response.status).toBe(200);
    expect(mocks.runCapability).toHaveBeenCalledWith(
      'translate_cv',
      {
        document: body.document,
        source_language: 'en',
        target_language: 'pl',
        sections: ['experience']
      },
      {
        model: { providerId: 'local', modelId: 'gemma-test' },
        timeoutMs: 240_000
      }
    );
    expect(mocks.toRuntimeModel.mock.calls[0]?.slice(0, 2)).toEqual([
      body.ai,
      'extraction'
    ]);
    await expect(response.json()).resolves.toMatchObject({
      translated: ['experience'],
      source_language: 'en',
      target_language: 'pl',
      elapsedMs: 42
    });
  });

  it('rejects same-language, unknown and duplicate section requests locally', async () => {
    const sameLanguage = await call({
      ...requestBody(),
      target_language: 'en'
    });
    const unknownSection = await call({
      ...requestBody(),
      sections: ['work_history']
    });
    const duplicateSection = await call({
      ...requestBody(),
      sections: ['experience', 'experience']
    });

    expect(sameLanguage.status).toBe(400);
    expect(unknownSection.status).toBe(400);
    expect(duplicateSection.status).toBe(400);
    expect(mocks.runCapability).not.toHaveBeenCalled();
  });

  it('refuses a runtime response for another direction or section', async () => {
    const mismatch = successfulOutcome();
    mismatch.result.data.target_language = 'en';
    mismatch.result.data.translated = ['skills'];
    mocks.runCapability.mockResolvedValue(mismatch);

    const response = await call(requestBody());
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      reason: 'runtime_contract_mismatch'
    });
  });

  it('reports clearly when the local runtime is not running', async () => {
    mocks.runCapability.mockResolvedValue({
      status: 'unavailable',
      detail: 'cvitae-agent-runtime is not running.'
    });

    const response = await call(requestBody());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      reason: 'runtime_unavailable'
    });
  });
});
