/**
 * The mailbox, reached through cvitae-agent-runtime.
 *
 * cvitae runs in a browser and cvitae-mail binds to loopback, so the app cannot
 * talk to it directly and deliberately does not know its port. The runtime
 * proxies the two operations that matter, and this file is the client for those
 * — same absent-by-default shape as `runtime/client.ts`, same rule about
 * deciding on the body rather than the HTTP code.
 *
 * There is no send function here, and there is none in the runtime either. The
 * mailbox path ends at a draft in the user's Drafts folder; the Send button in
 * Gmail is the review step, and the body being reviewed was written by a model
 * reading text a stranger posted to a job board.
 */

const DEFAULT_URL = 'http://127.0.0.1:8788';

/**
 * Longer than the runtime's own connect budget, because this call crosses two
 * processes — Next → runtime → cvitae-mail → Google — and the last hop is the
 * only one not on loopback. A draft carrying a CV is a few hundred kilobytes
 * going to Gmail, which is not instant.
 */
const TIMEOUT_MS = 30_000;

const baseUrl = (): string => {
  const configured = process.env.RUNTIME_URL;
  // Unset means "use the default port"; explicitly empty means "off".
  if (configured === undefined) return DEFAULT_URL;
  return configured.trim();
};

export type MailStatus = {
  /** Whether cvitae-mail is listening at all. */
  running: boolean;
  /** Whether a mailbox has been connected to it. */
  connected: boolean;
  /** The connected address, for showing the user which mailbox this is. */
  email?: string | null;
  /** Where a person grants consent. Opened by the user, never fetched by us. */
  connect_url?: string;
  detail?: string;
};

export type MailAttachment = {
  filename: string;
  content_type: string;
  /** Base64. A `data:` prefix is accepted, since that is what FileReader gives. */
  content_base64: string;
};

export type MailDraft = {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  from_name?: string;
  reply_to?: string;
  attachments?: MailAttachment[];
};

export type MailOutcome<T> =
  | { status: 'ok'; data: T }
  /** The runtime or cvitae-mail is not running. Says nothing about the request. */
  | { status: 'unavailable'; detail: string }
  /** A decision was reached and it was no. Retrying identically fails identically. */
  | { status: 'failed'; reason: string; detail: string };

const call = async <T>(
  path: string,
  init?: { method: 'POST'; body: unknown }
): Promise<MailOutcome<T>> => {
  const base = baseUrl();

  if (!base) {
    return { status: 'unavailable', detail: 'RUNTIME_URL is empty.' };
  }

  let response: Response;

  try {
    response = await fetch(`${base}${path}`, {
      method: init?.method ?? 'GET',
      headers: init ? { 'Content-Type': 'application/json' } : undefined,
      body: init ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (error) {
    const detail =
      error instanceof Error && error.name === 'TimeoutError'
        ? `cvitae-agent-runtime did not answer within ${TIMEOUT_MS / 1000}s.`
        : 'cvitae-agent-runtime is not running.';
    return { status: 'unavailable', detail };
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return {
      status: 'unavailable',
      detail: 'cvitae-agent-runtime returned no JSON.'
    };
  }

  const body = payload as {
    status?: string;
    data?: T;
    error?: string;
    reason?: string;
    detail?: string;
  };

  if (response.ok && body.status === 'ok') {
    // `/mail/status` answers with its fields at the top level rather than under
    // `data`, because "is it connected" is the whole payload.
    return { status: 'ok', data: (body.data ?? payload) as T };
  }

  // `mail_unavailable` is the runtime saying cvitae-mail is not up. That is the
  // same situation as the runtime itself being down as far as the UI is
  // concerned — one prompt, "start the mail service" — so it is folded in here
  // rather than surfaced as a refusal the user cannot act on differently.
  if (body.reason === 'mail_unavailable' || body.status === 'unavailable') {
    return {
      status: 'unavailable',
      detail: body.error ?? body.detail ?? 'cvitae-mail is not running.'
    };
  }

  return {
    status: 'failed',
    reason: body.reason ?? body.status ?? 'unknown',
    detail: body.error ?? body.detail ?? 'The mailbox refused the request.'
  };
};

/** Whether a mailbox is connected, and which one. Cheap; safe to poll on mount. */
export const mailStatus = async (): Promise<MailOutcome<MailStatus>> =>
  call<MailStatus>('/mail/status');

/**
 * Puts the application in the user's Drafts folder, attachment and all.
 *
 * Nothing is delivered. The user opens Gmail, reads what a model wrote, and
 * presses Send — which is the same review they were doing anyway, minus the
 * download and the drag.
 */
export const createMailDraft = async (
  draft: MailDraft
): Promise<MailOutcome<{ id: string }>> =>
  call<{ id: string }>('/mail/draft', { method: 'POST', body: draft });
