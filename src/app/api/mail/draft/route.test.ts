import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMailDraft: vi.fn()
}));

vi.mock('@/libs/runtime/mail', () => ({ createMailDraft: mocks.createMailDraft }));

import { POST } from './route';

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/mail/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );

const valid = {
  to: 'recruiter@example.com',
  subject: 'Application — Frontend Developer',
  body: 'Hello.',
  fromName: 'Ada Żółć',
  attachments: [
    { filename: 'CV.pdf', contentType: 'application/pdf', base64: 'JVBERg==' }
  ]
};

describe('POST /api/mail/draft', () => {
  beforeEach(() => {
    mocks.createMailDraft.mockReset();
    mocks.createMailDraft.mockResolvedValue({ status: 'ok', data: { id: 'r-1' } });
  });

  it('passes the recipient, message and attachment through to the runtime', async () => {
    const response = await post(valid);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: 'r-1' });

    const sent = mocks.createMailDraft.mock.calls[0]?.[0];
    expect(sent.to).toEqual(['recruiter@example.com']);
    expect(sent.text).toBe('Hello.');
    expect(sent.from_name).toBe('Ada Żółć');
    expect(sent.attachments).toEqual([
      {
        filename: 'CV.pdf',
        content_type: 'application/pdf',
        content_base64: 'JVBERg=='
      }
    ]);
  });

  it('rejects a request with no recipient before reaching the mailbox', async () => {
    const response = await post({ ...valid, to: '' });

    expect(response.status).toBe(400);
    expect(mocks.createMailDraft).not.toHaveBeenCalled();
  });

  it('rejects an empty body before reaching the mailbox', async () => {
    const response = await post({ ...valid, body: '   ' });

    expect(response.status).toBe(400);
    expect(mocks.createMailDraft).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const response = await POST(
      new Request('http://localhost/api/mail/draft', {
        method: 'POST',
        body: 'not json'
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.createMailDraft).not.toHaveBeenCalled();
  });

  it('reports a mail service that is not running as 503, not a failure', async () => {
    // Nothing is broken and nothing about the request was wrong — a process is
    // not running, and the remedy is to start it.
    mocks.createMailDraft.mockResolvedValue({
      status: 'unavailable',
      detail: 'cvitae-mail is not running.'
    });

    const response = await post(valid);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'submitting.mailUnavailable' }
    });
  });

  it('separates "no mailbox connected" from other refusals', async () => {
    // The fix for this one is a consent link, not a retry, so the UI has to be
    // able to tell it apart.
    mocks.createMailDraft.mockResolvedValue({
      status: 'failed',
      reason: 'not_connected',
      detail: 'No mailbox is connected.'
    });

    const response = await post(valid);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      reason: 'not_connected',
      error: { code: 'submitting.mailNotConnected' }
    });
  });

  it('reports any other refusal as a bad gateway', async () => {
    mocks.createMailDraft.mockResolvedValue({
      status: 'failed',
      reason: 'too_large',
      detail: 'The message is 6144KB; the limit is 5MB.'
    });

    const response = await post(valid);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      reason: 'too_large',
      error: { code: 'submitting.mailDraftFailed' }
    });
  });
});
