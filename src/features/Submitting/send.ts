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
 */

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
