import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cvFixture } from '@/test/fixtures/evidence';

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  resolveModel: vi.fn(async () => ({ model: { specificationVersion: 'v1' } }))
}));

vi.mock('ai', () => ({ generateObject: mocks.generateObject }));
vi.mock('@/libs/ai/providers', () => ({
  AiConfigError: class AiConfigError extends Error {},
  resolveModel: mocks.resolveModel
}));

import { POST } from './route';

describe('POST /api/jobs/apply-email privacy boundary', () => {
  beforeEach(() => {
    mocks.generateObject.mockReset();
    mocks.generateObject.mockResolvedValue({
      object: { subject: 'Application', body: 'Hello.' }
    });
  });

  it('removes contact and source metadata before invoking the external model', async () => {
    const cv = cvFixture();
    cv.role_description += ' Reach me at private@example.com.';
    const response = await POST(
      new Request('http://localhost/api/jobs/apply-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offer: 'Apply through recruiter@example.com',
          company: 'Hiring Co',
          position: 'Frontend Developer',
          locale: 'en',
          cv
        })
      })
    );

    expect(response.status).toBe(200);
    const invocation = JSON.stringify(mocks.generateObject.mock.calls[0]?.[0]);
    expect(invocation).not.toContain('ada@example.com');
    expect(invocation).not.toContain('private@example.com');
    expect(invocation).not.toContain('recruiter@example.com');
    expect(invocation).not.toContain('"sources"');
    expect(invocation).toContain('Ada Żółć');
  });
});
