import { mailStatus } from '@/libs/runtime/mail';

/**
 * Is a mailbox connected, and which one.
 *
 * Read by the submitting page so it can offer "create a Gmail draft" only when
 * that will work, and a "connect your mailbox" link when it will not. Every
 * outcome is a 200 with a shape the UI can render — a mail service that is not
 * running is an ordinary state of this app, not an error worth a red banner.
 */
export async function GET() {
  const outcome = await mailStatus();

  if (outcome.status === 'ok') {
    return Response.json({
      running: true,
      connected: outcome.data.connected,
      email: outcome.data.email ?? null,
      connectUrl: outcome.data.connect_url ?? null
    });
  }

  return Response.json({
    running: outcome.status !== 'unavailable',
    connected: false,
    email: null,
    connectUrl: null,
    detail: outcome.detail
  });
}
