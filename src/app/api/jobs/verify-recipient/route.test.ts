import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runCapability: vi.fn(),
  toRuntimeModel: vi.fn(() => ({ providerId: 'local' })),
  clientKeyBlocksDelegation: vi.fn(() => false)
}));

vi.mock('@/libs/runtime/client', () => ({
  runCapability: mocks.runCapability,
  toRuntimeModel: mocks.toRuntimeModel,
  clientKeyBlocksDelegation: mocks.clientKeyBlocksDelegation
}));

import { POST } from './route';

const call = (body: unknown) =>
  POST(
    new Request('http://localhost/api/jobs/verify-recipient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );

const requestBody = (overrides: Record<string, unknown> = {}) => ({
  company: 'Upvanta',
  position: 'Lead Developer',
  current: 'jobs@boardsite.example',
  ai: { providerId: 'local', baseURL: 'http://localhost:11434/v1' },
  ...overrides
});

const successfulOutcome = () => ({
  status: 'ok' as const,
  result: {
    capability: 'verify_recipient',
    data: { candidates: [], suggestion_only: true },
    degraded: [],
    elapsedMs: 12
  }
});

describe('POST /api/jobs/verify-recipient', () => {
  const originalProvider = process.env.AI_PROVIDER;

  beforeEach(() => {
    mocks.runCapability.mockReset();
    mocks.toRuntimeModel.mockClear();
    mocks.clientKeyBlocksDelegation.mockClear();
    mocks.clientKeyBlocksDelegation.mockReturnValue(false);
    mocks.runCapability.mockResolvedValue(successfulOutcome());
  });

  afterEach(() => {
    if (originalProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = originalProvider;
  });

  /**
   * The bug this route shipped with. It was the one delegating route that sent
   * no model settings, so the runtime fell back to its own `.env` — and a
   * cvitae configured for `local`, which needs no credential at all, had its
   * address check refused by a runtime configured for `openrouter` over a
   * missing OpenRouter key.
   */
  it('states the provider even for a check that reaches no model', async () => {
    process.env.AI_PROVIDER = 'local';

    const body = requestBody();
    const response = await call(body);

    expect(response.status).toBe(200);
    expect(mocks.toRuntimeModel).toHaveBeenCalledWith(body.ai, 'main', 'local');
    expect(mocks.runCapability.mock.calls[0]?.[2]).toMatchObject({
      model: { providerId: 'local' }
    });
  });

  /**
   * A tab opened before this shipped sends no settings at all. The provider
   * still has to be stated, or that tab silently gets whichever provider the
   * runtime's own `.env` happens to name — which is the whole bug.
   */
  it('states the provider even when the client sends no settings', async () => {
    process.env.AI_PROVIDER = 'local';

    const withoutSettings = requestBody();
    delete (withoutSettings as { ai?: unknown }).ai;

    const response = await call(withoutSettings);

    expect(response.status).toBe(200);
    expect(mocks.toRuntimeModel).toHaveBeenCalledWith(undefined, 'main', 'local');
  });

  it('sends the browser settings through unchanged', async () => {
    const body = requestBody({
      ai: { providerId: 'openai', modelId: 'gpt-4o', apiKey: 'user-key' }
    });

    await call(body);

    const [settings] = mocks.toRuntimeModel.mock.calls[0] as unknown as unknown[];

    expect(settings).toEqual(body.ai);
  });

  /**
   * A key with nowhere safe to go is refused only when this run would spend
   * one. The default check is fetches and comparisons end to end, so dropping
   * the key costs nothing and turning the feature off would be the worse answer.
   */
  it('refuses an undeliverable key only when the web tier is asked for', async () => {
    mocks.clientKeyBlocksDelegation.mockReturnValue(true);

    const plain = await call(requestBody());
    expect(plain.status).toBe(200);
    expect(mocks.runCapability).toHaveBeenCalledTimes(1);

    const escalated = await call(requestBody({ searchWeb: true }));
    expect(escalated.status).toBe(400);
    await expect(escalated.json()).resolves.toMatchObject({ reason: 'client_key' });
    expect(mocks.runCapability).toHaveBeenCalledTimes(1);
  });
});
