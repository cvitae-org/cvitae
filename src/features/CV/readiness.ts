import type { CvDocument } from './document';
import type { PdfPreflightResult } from './pdf/preflight';
import type { EvidenceCvVariant } from '@/features/Submitting/types';

export type ReadinessCategory =
  | 'pdf-integrity'
  | 'parsed-field-coverage'
  | 'role-evidence'
  | 'human-scan-quality'
  | 'application-knockouts';

export type ReadinessFinding = {
  code: string;
  message: string;
  messageKey: string;
  values?: Record<string, string | number>;
  source?: 'pdf';
  severity: 'block' | 'warning' | 'info';
};

export type ReadinessReport = Record<ReadinessCategory, ReadinessFinding[]>;

const finding = (
  code: string,
  message: string,
  severity: ReadinessFinding['severity'] = 'warning',
  values?: Record<string, string | number>,
  messageKey = code
): ReadinessFinding => ({ code, message, messageKey, values, severity });

const invalidLink = (value: string): boolean => {
  try {
    const withScheme = /^[a-z][a-z\d+.-]*:/i.test(value)
      ? value
      : `https://${value}`;
    const url = new URL(withScheme);
    return url.protocol !== 'http:' && url.protocol !== 'https:';
  } catch {
    return true;
  }
};

const normalizeSkill = (value: string) =>
  value.normalize('NFC').trim().toLocaleLowerCase();

const CLICHES =
  /\b(?:team player|hard worker|passionate about|detail[- ]oriented|results[- ]driven|dynamic professional|gracz zespołowy|pasjonuję się)\b/i;

const COMMON_LANGUAGE_ERRORS: Array<[RegExp, string, string]> = [
  [/\bJavascript\b/, 'javascript', 'Use “JavaScript”.'],
  [/\bTypescript\b/, 'typescript', 'Use “TypeScript”.'],
  [/\barchitekture\b/i, 'polish-architecture', 'Polish spelling: use “architekturę”.'],
  [/\bi\s+i\b/i, 'polish-conjunction', 'Possible duplicated Polish conjunction “i”.'],
  [/\bReact['’]a\b/i, 'react-apostrophe', 'Prefer an inflected phrase that does not add an apostrophe to “React”.']
];

const KNOWN_CASING: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  jfrog: 'JFrog',
  jotai: 'Jotai',
  'ethersjs': 'ethers.js',
  'nextjs': 'Next.js',
  'nodejs': 'Node.js'
};

export const runReadinessChecks = ({
  document,
  variant,
  pdf
}: {
  document: CvDocument;
  variant?: EvidenceCvVariant;
  pdf?: PdfPreflightResult;
}): ReadinessReport => {
  const report: ReadinessReport = {
    'pdf-integrity': [],
    'parsed-field-coverage': [],
    'role-evidence': [],
    'human-scan-quality': [],
    'application-knockouts': []
  };

  if (!pdf) {
    report['pdf-integrity'].push(
      finding(
        'not-run',
        'PDF integrity is checked against the generated Blob before every download.',
        'info'
      )
    );
  } else {
    pdf.issues.forEach((issue) =>
      report['pdf-integrity'].push({
        ...finding(
          issue.code,
          issue.message,
          issue.severity === 'block' ? 'block' : 'warning',
          issue.values
        ),
        source: 'pdf'
      })
    );
    if (pdf.ok && pdf.issues.length === 0) {
      report['pdf-integrity'].push(
        finding('passed', 'Native text, A4 pages, links and Unicode passed preflight.', 'info', undefined, 'pdf-passed')
      );
    }
  }

  if (!document.personal.name.trim()) {
    report['parsed-field-coverage'].push(finding('name', 'Name is missing.', 'block'));
  }
  if (!document.personal.email.trim()) {
    report['parsed-field-coverage'].push(finding('email', 'Email is missing.', 'block'));
  }
  if (!document.personal.phone.trim()) {
    report['parsed-field-coverage'].push(finding('phone', 'Phone number is missing.'));
  }
  if (!document.personal.location.trim()) {
    report['parsed-field-coverage'].push(
      finding('location', 'Location is missing; some applications use it as a filter.')
    );
  }
  Object.entries(document.personal.links).forEach(([label, url]) => {
    if (invalidLink(url)) {
      report['parsed-field-coverage'].push(
        finding('link', `${label} has an invalid URL: ${url}`, 'block', { label, url })
      );
    }
  });
  if (!document.role_description.trim()) {
    report['parsed-field-coverage'].push(finding('summary', 'Summary is empty.'));
  }
  if (document.experience.length === 0) {
    report['parsed-field-coverage'].push(finding('experience', 'Experience is empty.', 'block'));
  }
  document.experience.forEach((job, index) => {
    if (!job.company.trim() || !job.title.trim() || !job.started.trim()) {
      report['parsed-field-coverage'].push(
        finding('chronology', `Experience entry ${index + 1} has ambiguous employer/title/date fields.`, 'warning', { number: index + 1 })
      );
    }
  });

  if (variant) {
    const gaps = variant.proposal.requirementMatches.filter(
      (match) => match.status === 'missing' || match.status === 'needs-confirmation'
    );
    gaps.forEach((match) => {
      const requirement = variant.source.offer.requirements.find(
        (item) => item.id === match.requirementId
      );
      report['role-evidence'].push(
        finding(
          match.status,
          `${requirement?.exactText ?? match.requirementId}: ${match.status.replace('-', ' ')}.`,
          'warning',
          {
            requirement: requirement?.exactText ?? match.requirementId,
            status: match.status
          },
          'requirement-gap'
        )
      );
    });
    if (gaps.length === 0) {
      report['role-evidence'].push(
        finding('covered', 'Every catalogued vacancy requirement has direct or transferable evidence.', 'info')
      );
    }

    variant.proposal.requirementMatches.forEach((match) => {
      const requirement = variant.source.offer.requirements.find(
        (item) => item.id === match.requirementId
      );
      if (
        requirement &&
        ['location', 'work-authorization', 'language', 'certification'].includes(
          requirement.category
        ) &&
        (match.status === 'missing' || match.status === 'needs-confirmation')
      ) {
        report['application-knockouts'].push(
          finding(
            requirement.category,
            `${requirement.exactText} — answer this application question truthfully; CV wording cannot resolve it.`,
            match.status === 'missing' ? 'block' : 'warning',
            { requirement: requirement.exactText },
            'knockout'
          )
        );
      }
    });
  } else {
    report['role-evidence'].push(
      finding('master', 'Role evidence is evaluated against a vacancy in the submission flow.', 'info')
    );
    report['application-knockouts'].push(
      finding('not-applicable', 'Knockout checks require a vacancy.', 'info')
    );
  }

  const skills = document.skills.groups.flatMap((group) => group.items);
  const seen = new Set<string>();
  skills.forEach((skill) => {
    const key = normalizeSkill(skill);
    if (seen.has(key)) {
      report['human-scan-quality'].push(
        finding('duplicate-skill', `Duplicate skill: ${skill}.`, 'warning', { skill })
      );
    }
    seen.add(key);
    const preferred = KNOWN_CASING[key.replace(/\./g, '')] ?? KNOWN_CASING[key];
    if (preferred && preferred !== skill) {
      report['human-scan-quality'].push(
        finding('technology-casing', `Use consistent casing: "${preferred}" instead of "${skill}".`, 'warning', {
          preferred,
          actual: skill
        })
      );
    }
  });
  if (skills.length > 45) {
    report['human-scan-quality'].push(
      finding('skill-density', `${skills.length} skills may be hard to scan; keep the relevant subset.`, 'warning', {
        count: skills.length
      })
    );
  }
  if (CLICHES.test(document.role_description)) {
    report['human-scan-quality'].push(finding('cliche', 'Summary contains a generic cliché.'));
  }
  const prose = [
    document.role_description,
    ...document.experience.flatMap((job) => job.highlights)
  ].join('\n');
  COMMON_LANGUAGE_ERRORS.forEach(([pattern, messageKey, message]) => {
    if (pattern.test(prose)) {
      report['human-scan-quality'].push(
        finding('language', message, 'warning', undefined, messageKey)
      );
    }
  });
  document.experience.forEach((job) => {
    job.highlights.forEach((bullet) => {
      if (bullet.trim().length < 35) {
        report['human-scan-quality'].push(
          finding('weak-bullet', `Short/vague bullet at ${job.company}: "${bullet}".`, 'warning', {
            company: job.company,
            bullet
          })
        );
      }
    });
  });
  if (report['human-scan-quality'].length === 0) {
    report['human-scan-quality'].push(
      finding('passed', 'No duplicate skills, common clichés, casing issues or unusually weak bullets detected.', 'info', undefined, 'quality-passed')
    );
  }

  (Object.keys(report) as ReadinessCategory[]).forEach((category) => {
    if (report[category].length === 0) {
      report[category].push(finding('none', 'No issues detected.', 'info'));
    }
  });
  return report;
};
