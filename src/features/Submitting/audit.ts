import {
  applyMethodOf,
  isSendable,
  stageOf,
  type Submission
} from './types';

/**
 * What the submitting queue can be checked for.
 *
 * The question this page cannot answer on its own is the one about silence.
 * An application that was sent and answered leaves a trace — a reply, a
 * rejection, a date in a calendar — but one that was sent and ignored leaves
 * nothing at all, so it sinks to the bottom of the queue and is never thought
 * about again. Ageing the send date is the whole trick: after two weeks with
 * nothing recorded against it, an application is worth a follow-up, and after a
 * month it is worth writing off.
 *
 * "Nothing recorded against it" currently means "sent, and not since updated",
 * because an outcome is not yet something the queue stores. When per-status
 * tracking lands, `awaitingReply` is the one function that has to learn about
 * it — everything else here reads a stage that is already derived.
 */

/** After this long with no answer, chase it. */
export const FOLLOW_UP_AFTER_DAYS = 14;

/** After this long, it is not silence any more, it is a no. */
export const COLD_AFTER_DAYS = 30;

export type SubmittingFinding = {
  code: string;
  messageKey: string;
  values?: Record<string, string | number>;
  severity: 'block' | 'warning' | 'info';
};

export type SubmittingAuditCategory =
  | 'awaiting-reply'
  | 'ready-to-send'
  | 'blocked'
  | 'queue-health';

export type SubmittingAuditReport = Record<
  SubmittingAuditCategory,
  SubmittingFinding[]
> & {
  /** Sent-and-silent applications, oldest first, for naming them individually. */
  chase: Array<{ submission: Submission; days: number }>;
};

const finding = (
  code: string,
  messageKey: string,
  severity: SubmittingFinding['severity'] = 'info',
  values?: Record<string, string | number>
): SubmittingFinding => ({ code, messageKey, values, severity });

export const daysSince = (iso: string, now: number): number => {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? 0 : Math.floor((now - at) / 86_400_000);
};

/** How many named applications are worth listing before it becomes a wall. */
const MAX_NAMED = 4;

export const runSubmittingAudit = ({
  submissions,
  now = Date.now()
}: {
  submissions: Submission[];
  now?: number;
}): SubmittingAuditReport => {
  const report: SubmittingAuditReport = {
    'awaiting-reply': [],
    'ready-to-send': [],
    blocked: [],
    'queue-health': [],
    chase: []
  };

  if (submissions.length === 0) {
    report['awaiting-reply'].push(finding('empty', 'empty'));
    report['ready-to-send'].push(finding('empty', 'empty'));
    report.blocked.push(finding('empty', 'empty'));
    report['queue-health'].push(finding('empty', 'empty'));
    return report;
  }

  /* ----------------------------------------------------------- awaiting reply */

  const sent = submissions.filter(
    (submission): submission is Submission & { sentAt: string } =>
      Boolean(submission.sentAt)
  );

  const aged = sent
    .map((submission) => ({
      submission,
      days: daysSince(submission.sentAt, now)
    }))
    .sort((a, b) => b.days - a.days);

  const chase = aged.filter((entry) => entry.days >= FOLLOW_UP_AFTER_DAYS);
  const cold = chase.filter((entry) => entry.days >= COLD_AFTER_DAYS);
  report.chase = chase;

  if (chase.length === 0) {
    report['awaiting-reply'].push(
      sent.length === 0
        ? finding('nothing-sent', 'nothing-sent')
        : finding('all-recent', 'all-recent', 'info', {
            count: sent.length,
            days: FOLLOW_UP_AFTER_DAYS
          })
    );
  } else {
    report['awaiting-reply'].push(
      finding('follow-up', 'follow-up', 'warning', {
        count: chase.length,
        days: FOLLOW_UP_AFTER_DAYS
      })
    );

    chase.slice(0, MAX_NAMED).forEach((entry) => {
      report['awaiting-reply'].push(
        finding(
          `chase-${entry.submission.id}`,
          entry.days >= COLD_AFTER_DAYS ? 'cold-one' : 'chase-one',
          entry.days >= COLD_AFTER_DAYS ? 'info' : 'warning',
          {
            company: entry.submission.offer.company,
            position: entry.submission.offer.position,
            days: entry.days
          }
        )
      );
    });

    if (chase.length > MAX_NAMED) {
      report['awaiting-reply'].push(
        finding('chase-more', 'chase-more', 'info', {
          count: chase.length - MAX_NAMED
        })
      );
    }

    if (cold.length > 0) {
      report['awaiting-reply'].push(
        finding('cold', 'cold', 'info', {
          count: cold.length,
          days: COLD_AFTER_DAYS
        })
      );
    }
  }

  /* ------------------------------------------------------------ ready to send */

  const ready = submissions.filter((submission) => stageOf(submission) === 'ready');
  if (ready.length > 0) {
    report['ready-to-send'].push(
      finding('ready', 'ready', 'warning', { count: ready.length })
    );
    ready.slice(0, MAX_NAMED).forEach((submission) => {
      report['ready-to-send'].push(
        finding(`ready-${submission.id}`, 'ready-one', 'info', {
          company: submission.offer.company,
          position: submission.offer.position
        })
      );
    });
  } else {
    report['ready-to-send'].push(finding('none-ready', 'none-ready'));
  }

  /* ------------------------------------------------------------------ blocked */

  const unsent = submissions.filter((submission) => !submission.sentAt);

  const noCv = unsent.filter((submission) => !submission.cv).length;
  if (noCv > 0) {
    report.blocked.push(finding('no-cv', 'no-cv', 'warning', { count: noCv }));
  }

  const unapproved = unsent.filter(
    (submission) => submission.cv && submission.cv.reviewState !== 'approved'
  ).length;
  if (unapproved > 0) {
    report.blocked.push(
      finding('unapproved', 'unapproved', 'warning', { count: unapproved })
    );
  }

  const noBody = unsent.filter(
    (submission) =>
      submission.cv?.reviewState === 'approved' &&
      applyMethodOf(submission) === 'email' &&
      !submission.apply.body.trim()
  ).length;
  if (noBody > 0) {
    report.blocked.push(finding('no-body', 'no-body', 'warning', { count: noBody }));
  }

  const noRoute = unsent.filter(
    (submission) =>
      !submission.apply.email.trim() && !submission.offer.source_url.trim()
  ).length;
  if (noRoute > 0) {
    report.blocked.push(finding('no-route', 'no-route', 'block', { count: noRoute }));
  }

  /* ------------------------------------------------------------- queue health */

  report['queue-health'].push(
    finding('totals', 'totals', 'info', {
      total: submissions.length,
      sent: sent.length,
      open: submissions.length - sent.length
    })
  );

  const stalled = unsent.filter(
    (submission) => daysSince(submission.queuedAt, now) >= COLD_AFTER_DAYS
  ).length;
  if (stalled > 0) {
    report['queue-health'].push(
      finding('stalled', 'stalled', 'warning', {
        count: stalled,
        days: COLD_AFTER_DAYS
      })
    );
  }

  const unsendable = unsent.filter((submission) => !isSendable(submission)).length;
  if (unsendable > 0 && unsendable !== noCv) {
    report['queue-health'].push(
      finding('unsendable', 'unsendable', 'info', { count: unsendable })
    );
  }

  (
    ['awaiting-reply', 'ready-to-send', 'blocked', 'queue-health'] as const
  ).forEach((category) => {
    if (report[category].length === 0) {
      report[category].push(finding('none', 'none'));
    }
  });

  return report;
};
