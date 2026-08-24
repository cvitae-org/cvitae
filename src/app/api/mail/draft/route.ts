import { z } from 'zod';
import { apiError } from '@/libs/i18n/errors';
import { createMailDraft } from '@/libs/runtime/mail';

/**
 * Creates the application as a Gmail draft.
 *
 * This is the server end of the seam `Submitting/send.ts` describes: the same
 * subject, body and recipient that would have gone into a `mailto:` URL, plus
 * the one thing `mailto:` cannot carry — the CV.
 *
 * It drafts and does not send, and there is no sibling route that does. The
 * body was written by a model from a job posting, and the difference between a
 * bad draft and a bad send is who else sees it.
 */

export const maxDuration = 60;

/** Room for the ATS PDF once base64 has added its third. */
const MAX_ATTACHMENT_CHARS = 6_000_000;

const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255).default('application/pdf'),
  base64: z.string().min(1).max(MAX_ATTACHMENT_CHARS)
});

const bodySchema = z.object({
  to: z.string().trim().min(3),
  subject: z.string().max(500),
  body: z.string().trim().min(1).max(200_000),
  fromName: z.string().max(200).optional(),
  attachments: z.array(attachmentSchema).max(3).default([])
});

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: apiError('invalidRequest') }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        error: apiError(
          'invalidRequest',
          undefined,
          parsed.error.issues
            .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('; ')
        )
      },
      { status: 400 }
    );
  }

  const outcome = await createMailDraft({
    to: [parsed.data.to],
    subject: parsed.data.subject,
    text: parsed.data.body,
    from_name: parsed.data.fromName,
    attachments: parsed.data.attachments.map((attachment) => ({
      filename: attachment.filename,
      content_type: attachment.contentType,
      content_base64: attachment.base64
    }))
  });

  if (outcome.status === 'ok') {
    return Response.json({ id: outcome.data.id });
  }

  if (outcome.status === 'unavailable') {
    // 503 rather than 500: nothing is broken, a process is not running, and the
    // remedy is to start it.
    return Response.json(
      { error: apiError('submitting.mailUnavailable', undefined, outcome.detail) },
      { status: 503 }
    );
  }

  // `not_connected` is the one worth telling apart — it means consent has not
  // been granted, and the fix is a link rather than a retry.
  const notConnected = outcome.reason === 'not_connected';

  return Response.json(
    {
      error: apiError(
        notConnected ? 'submitting.mailNotConnected' : 'submitting.mailDraftFailed',
        undefined,
        outcome.detail
      ),
      reason: outcome.reason
    },
    { status: notConnected ? 409 : 502 }
  );
}
