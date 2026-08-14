import { z } from 'zod';
import { AiConfigError, resolveModel } from '@/libs/ai/providers';

/**
 * Drafts the email an application is actually sent in.
 *
 * The CV says what the candidate has done; this says why they are writing, to
 * this company, about this posting. It runs on the main model rather than the
 * extraction one — unlike research, nothing here is copied out of the offer,
 * it is written.
 */

type AiModule = typeof import('ai');

let aiModulePromise: Promise<AiModule> | null = null;
const loadAiModule = async (): Promise<AiModule> => {
  if (!aiModulePromise) {
    aiModulePromise = import('ai');
  }
  return aiModulePromise;
};

export const maxDuration = 60;

const loadMessagesForLocale = async (locale: string) => {
  try {
    const localeModule = await import(`@/../messages/${locale}.json`);
    return localeModule.default ?? localeModule;
  } catch (error) {
    console.warn(
      `Falling back to English messages for unsupported locale "${locale}".`,
      error
    );
    return (await import(`@/../messages/en.json`)).default;
  }
};

const responseSchema = z.object({
  subject: z.string().describe(
    'The email subject line. Names the position, and the candidate. Plain text, no quotes, under 80 characters.'
  ),
  body: z.string().describe(
    'The full email body, ready to send: greeting, three to four short paragraphs, and a sign-off with the candidate\'s name. Plain text with blank lines between paragraphs — no markdown, no placeholders in brackets.'
  )
});

export async function POST(req: Request) {
  try {
    const {
      offer,
      company,
      position,
      cvTitle,
      cvSummary,
      locale = 'en',
      ai
    } = await req.json();

    if (!offer || typeof offer !== 'string') {
      return Response.json(
        { error: 'The offer is required to draft an email.' },
        { status: 400 }
      );
    }

    const [aiModule, { model }] = await Promise.all([
      loadAiModule(),
      resolveModel(ai ?? {})
    ]);
    const { generateObject } = aiModule;

    const translations = await loadMessagesForLocale(locale);
    const cvData = (translations as Record<string, unknown>).cv;

    const languageInstruction =
      locale === 'pl'
        ? 'IMPORTANT: Write the entire email in Polish.'
        : locale === 'en'
          ? 'IMPORTANT: Write the entire email in English.'
          : `IMPORTANT: Write the entire email in the language matching locale "${locale}".`;

    const { object } = await generateObject({
      model,
      schema: responseSchema,
      system: `You are writing the email a candidate sends with their CV when applying for a job.

${languageInstruction}

You have the candidate's full CV data:
${JSON.stringify(cvData, null, 2)}

The CV is attached to this email, so the email does not repeat it. Its job is to say who is writing, which role they are applying for, and the two or three things about them that matter most for this specific posting.

WHAT TO WRITE:
- Open by naming the role and where it was seen, in one line.
- Two short paragraphs on the overlap between the posting's requirements and the candidate's actual experience. Name concrete technologies and concrete work.
- One closing line offering to talk, and a sign-off with the candidate's real name from the CV data.
- Six to twelve sentences in total. A hiring manager reads this in under a minute.

HOW TO WRITE IT:
- Plain, direct, professional. Write as the candidate, in the first person.
- Separate paragraphs with a blank line. No markdown, no bullet points, no headings.
- Never leave a placeholder such as [Your Name], [Company] or [role] — every value you need is in the CV data or the offer above. If a detail genuinely is not available, write the sentence without it.
- Do not open with "I am writing to express my interest" or any other stock phrase.
- Do not restate the whole CV, and do not list every technology the candidate knows.

⚠️ ABSOLUTE REQUIREMENTS — NON-NEGOTIABLE:
- Only mention technologies, skills, employers and achievements that are EXPLICITLY in the CV data above.
- Never claim experience the CV does not show, never invent metrics, and never state years of experience that the CV does not support.
- Where the posting asks for something the candidate does not have, either say nothing about it or address it honestly through related experience.
- Do not promise availability, salary expectations, or notice periods unless the CV data states them.`,
      prompt: `Write the application email for this offer.

COMPANY: ${typeof company === 'string' ? company : 'Not stated'}
POSITION: ${typeof position === 'string' ? position : 'Not stated'}

THE OFFER:
${offer}

${
  typeof cvSummary === 'string' && cvSummary.trim()
    ? `THE SUMMARY ON THE ATTACHED CV (already tailored to this offer — the email should be consistent with it, not a copy of it):
${typeof cvTitle === 'string' && cvTitle.trim() ? `${cvTitle}\n` : ''}${cvSummary}`
    : ''
}`
    });

    return Response.json(object);
  } catch (error) {
    if (error instanceof AiConfigError) {
      console.error('AI provider is misconfigured:', error.message);
      return Response.json(
        { error: 'AI provider is not configured' },
        { status: 500 }
      );
    }

    console.error('Application email generation failed:', error);
    return Response.json(
      { error: 'Failed to draft the application email' },
      { status: 500 }
    );
  }
}
