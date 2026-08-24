/**
 * How an application leaves the browser.
 *
 * It hands off to the user's own mail client rather than posting through a
 * server. A job application has to come from the candidate's real address, be
 * visible in their sent folder, and be the thread a reply lands in — none of
 * which is true of mail sent by an app from a shared mailbox. It also means no
 * SMTP credentials have to exist for the feature to work at all.
 *
 * The cost is the attachment: `mailto:` cannot carry a file, so the CV is
 * downloaded and attached by hand. That is one drag, and it is what buys the
 * send coming from a real mailbox.
 *
 * The URL built here is handed to an ordinary link rather than opened with
 * `window.open` or a `location` assignment. A link in the markup is the one
 * form of navigation a browser never blocks and never mis-reports: the
 * alternatives return a value that says nothing about whether a mail client
 * actually opened, and get caught by popup blocking on the way out.
 *
 * If this ever needs to send server-side instead, this file is the seam:
 * `buildMailto` becomes a POST, and the step above it changes shape once.
 *
 * That seam is now taken, and only halfway on purpose. `createGmailDraft` posts
 * the same three fields plus the attachment `mailto:` could never carry, and
 * what comes back is a *draft* in the user's own Gmail — so every reason the
 * hand-off existed still holds. The application still leaves from the
 * candidate's real address, still lands in their sent folder, still owns the
 * thread a reply arrives in. What is gone is the download and the drag.
 *
 * There is deliberately no `sendGmail` beside it. The body is written by a model
 * reading a job posting, and the Send button in Gmail is the review step that
 * catches it being wrong. Both routes this crosses — cvitae's and the runtime's
 * — refuse to send, and cvitae-mail refuses again unless a separate flag is set.
 */

import { loadSettings, toRequestOverride } from '@/features/Settings/aiSettings';

/**
 * Where mail clients start dropping the body.
 *
 * There is no specification for this — the ceiling belongs to the OS URL
 * handler, and Windows is the tight one at around 2000 characters for the
 * whole URL. Percent-encoding roughly doubles the length of ordinary prose, so
 * the warning fires well before a body that would actually survive.
 */
export const MAILTO_SAFE_BODY = 900;

export type Draft = {
  to: string;
  subject: string;
  body: string;
};

/**
 * The address is not percent-encoded, only stripped of what would break the
 * URL. Encoding it turns the `@` into `%40`, which is legal and which some
 * mail clients still hand to the compose window verbatim — an address nobody
 * can send to. The subject and body are query parameters and are encoded
 * normally.
 */
export const buildMailto = ({ to, subject, body }: Draft): string => {
  const address = to.trim().replace(/[\s<>?&#"']/g, '');

  return `mailto:${address}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
};

/**
 * A file, as the draft route wants it.
 *
 * Base64 rather than multipart, because this payload crosses two processes and
 * one JSON envelope shape at every hop is worth more than the third it adds to
 * the bytes. The `data:` prefix a `FileReader` produces is stripped here rather
 * than downstream, so the field is what its name says it is.
 */
export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The CV could not be read.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.replace(/^data:[^;]*;base64,/, ''));
    };
    reader.readAsDataURL(blob);
  });

export type GmailDraft = Draft & {
  fromName?: string;
  attachments?: { filename: string; contentType: string; base64: string }[];
};

export type GmailDraftOutcome =
  | { status: 'ok'; id: string }
  /** Carries the server's own descriptor, which `LocalizedError` can render. */
  | { status: 'failed'; error: unknown; reason?: string };

/**
 * Puts the application in the user's Gmail drafts, CV attached.
 *
 * Returns rather than throws, because every failure here is one the panel has
 * something useful to say about — a mailbox that was never connected, a service
 * that is not running — and none of them should take the page down.
 */
export const createGmailDraft = async ({
  to,
  subject,
  body,
  fromName,
  attachments = []
}: GmailDraft): Promise<GmailDraftOutcome> => {
  let response: Response;

  try {
    response = await fetch('/api/mail/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: to.trim(), subject, body, fromName, attachments })
    });
  } catch {
    return {
      status: 'failed',
      error: { code: 'submitting.mailUnavailable' },
      reason: 'unreachable'
    };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: unknown;
    reason?: string;
  };

  if (response.ok && payload.id) return { status: 'ok', id: payload.id };

  return {
    status: 'failed',
    error: payload.error ?? { code: 'submitting.mailDraftFailed' },
    reason: payload.reason
  };
};

export type MailboxStatus = {
  running: boolean;
  connected: boolean;
  email: string | null;
  connectUrl: string | null;
};

/** Whether drafting into Gmail is available, and to which mailbox. */
export const readMailboxStatus = async (): Promise<MailboxStatus> => {
  try {
    const response = await fetch('/api/mail/status', { cache: 'no-store' });
    const payload = (await response.json()) as Partial<MailboxStatus>;

    return {
      running: Boolean(payload.running),
      connected: Boolean(payload.connected),
      email: payload.email ?? null,
      connectUrl: payload.connectUrl ?? null
    };
  } catch {
    // The optional path being unavailable is not worth an error state; the
    // mailto link is still there and still works.
    return { running: false, connected: false, email: null, connectUrl: null };
  }
};

/** One address the check found, with the evidence for it. */
export type RecipientCandidate = {
  address: string;
  evidence: { source: 'company_site' | 'offer' | 'other_board'; url: string; page?: string }[];
  domain_match: boolean;
  role_address: boolean;
  free_mail: boolean;
  corroborated: boolean;
  confidence: 'high' | 'medium' | 'low';
  why: string[];
};

export type RecipientVerification = {
  candidates: RecipientCandidate[];
  current: { address: string; found: boolean; domain_match: boolean; warnings: string[] };
  company_domains: string[];
  sources_read: { source: string; url: string; page?: string }[];
  /** The employer's site was read and printed no address — they use a form. */
  company_publishes_no_address?: boolean;
  /** A form or ATS link the board stated. The answer when there is no email. */
  apply_url?: string;
  /**
   * How the employer's domain was arrived at. `guessed` means it matched the
   * company's name and nothing else, so it may be a different firm entirely.
   */
  anchor_trust?: 'board' | 'discovered' | 'guessed';
  degraded?: string[];
};

export type VerificationOutcome =
  | { status: 'ok'; verification: RecipientVerification }
  | { status: 'failed'; error: unknown };

/**
 * Asks where this application should actually be going.
 *
 * Suggestions only, and the runtime says so in its own payload. Nothing here
 * writes to the recipient field — see the panel that renders this.
 */
export const verifyRecipient = async (input: {
  offerText?: string;
  url?: string;
  company: string;
  companyUrl?: string;
  position: string;
  location?: string;
  current: string;
  checkOtherBoards?: boolean;
  searchWeb?: boolean;
}): Promise<VerificationOutcome> => {
  let response: Response;

  try {
    response = await fetch('/api/jobs/verify-recipient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Sent like every other AI-backed call. The default check reaches no
      // model, but the provider still has to be stated: without it the runtime
      // uses whatever its own `.env` says, which is not what the user chose.
      body: JSON.stringify({ ...input, ai: toRequestOverride(loadSettings()) })
    });
  } catch {
    return { status: 'failed', error: { code: 'submitting.verifyUnavailable' } };
  }

  const payload = (await response.json().catch(() => ({}))) as
    | RecipientVerification
    | { error?: unknown };

  if (response.ok && 'candidates' in payload) {
    return { status: 'ok', verification: payload };
  }

  return {
    status: 'failed',
    error: (payload as { error?: unknown }).error ?? { code: 'submitting.verifyFailed' }
  };
};
