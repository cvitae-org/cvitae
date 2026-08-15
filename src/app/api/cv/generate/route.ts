import { z } from 'zod';
import { AiConfigError, resolveModel } from '@/libs/ai/providers';

type AiModule = typeof import('ai');

let aiModulePromise: Promise<AiModule> | null = null;
const loadAiModule = async (): Promise<AiModule> => {
  if (!aiModulePromise) {
    aiModulePromise = import('ai');
  }
  return aiModulePromise;
};

// Free-tier models answer in ~6s warm, but a queued cold start was measured at
// 32s — over the previous 30s cap. 60s is the Vercel Hobby ceiling.
export const maxDuration = 60;

const responseSchema = z.object({
  title: z.string().describe('A professional job title that matches the position (e.g., "SENIOR FRONTEND DEVELOPER", "REACT SPECIALIST"). Should be concise and in uppercase.'),
  summary: z.string().describe('A professional summary (2-3 sentences) highlighting relevant experience and skills for the specific job offer. Should be written in first person.'),
});

export async function POST(req: Request) {
  try {
    const { jobOffer, locale = 'en', ai, cv } = await req.json();

    if (!jobOffer || typeof jobOffer !== 'string') {
      return Response.json(
        { error: 'Job offer text is required' },
        { status: 400 }
      );
    }

    /**
     * The CV comes from the caller, not from `messages/*.json`.
     *
     * It used to be read out of the translations file, which stopped being true
     * the moment the CV moved into the document store: `messages` now holds
     * section headings and a footer, so tailoring against it was writing a
     * summary for a candidate whose entire history was the word "Education".
     * The document lives in the browser's IndexedDB and this is a server route,
     * so the browser sends it — the same direction `POST /document` will send it
     * to the runtime.
     */
    const cvData = cv;

    if (!cvData || typeof cvData !== 'object') {
      return Response.json(
        {
          error:
            'No CV was sent with the request. Tailoring reads the CV document held in the browser; it is no longer in the translation files.'
        },
        { status: 400 }
      );
    }

    const [aiModule, { model }] = await Promise.all([
      loadAiModule(),
      resolveModel(ai ?? {})
    ]);
    const { generateObject } = aiModule;

    // Determine output language based on locale
    const languageInstruction = locale === 'pl' 
      ? 'IMPORTANT: Generate ALL content in Polish language.'
      : locale === 'en' 
        ? 'IMPORTANT: Generate ALL content in English language.'
        : `IMPORTANT: Generate ALL content in the language matching locale "${locale}".`;

    const { object } = await generateObject({
      model,
      schema: responseSchema,
      system: `You are an expert CV writer specializing in creating compelling, high-impact professional summaries that win interviews.

${languageInstruction}
      
You have access to the candidate's CV data:
${JSON.stringify(cvData, null, 2)}

Your task is to generate:
1. A job TITLE that precisely matches the target position. Keep it sharp, professional, and in UPPERCASE (e.g., "SENIOR FRONTEND DEVELOPER", "REACT SPECIALIST", "FULL STACK ENGINEER").
2. A powerful SUMMARY (2-3 sentences) that immediately demonstrates the candidate's value for this specific role.

CRITICAL GUIDELINES FOR THE SUMMARY:
- Lead with IMPACT: Start with the most compelling achievement or strength
- Use POWER WORDS: Employ strong action verbs (architected, spearheaded, transformed, optimized, delivered, drove, engineered)
- Be SPECIFIC: Reference concrete technologies, methodologies, and achievements from the CV data
- Show VALUE: Emphasize outcomes, results, and what makes this candidate exceptional
- Match KEYWORDS: Naturally integrate key terms from the job offer
- Avoid CLICHÉS: Never use generic phrases like "team player", "hard worker", "passionate about", or "detail-oriented"
- Stay CONCISE: Every word must earn its place - be punchy and direct
- Write in FIRST PERSON with confidence and authority
- CREATE URGENCY: Make the reader want to interview this candidate immediately

⚠️ ABSOLUTE REQUIREMENTS - NON-NEGOTIABLE:
- ONLY mention technologies, skills, and tools that are EXPLICITLY present in the CV data provided above
- NEVER claim expertise or experience in technologies not listed in the CV
- NEVER fabricate achievements, metrics, or capabilities
- If the job requires skills not in the CV, focus on transferable skills and relevant experience instead
- Present the candidate as the best fit using ONLY their actual, verified skills and experience
- Be truthful and authentic - confidence comes from real expertise, not made-up claims

The title should reflect the target position, not necessarily the candidate's current title.

Example of a WEAK summary:
"I am a passionate developer with experience in React and JavaScript. I have worked on various projects and am a team player who loves to learn new technologies."

Example of a STRONG summary (using ONLY skills from CV):
"Full-stack engineer with 5+ years architecting scalable React applications serving 2M+ users. Delivered 40% performance improvements through advanced optimization techniques and led migration of legacy systems to modern TypeScript architecture. Expert in building robust, maintainable solutions with React, Node.js, and cloud infrastructure."

Generate output in the specified language with the same level of impact and precision.`,
      prompt: `Analyze this job offer and generate a customized, high-impact title and summary that positions the candidate as the ideal fit:

JOB OFFER:
${jobOffer}

IMPORTANT REMINDERS:
- Only reference skills, technologies, and experiences that are EXPLICITLY in the provided CV data
- Never claim expertise in technologies not listed in the CV
- Find the strongest overlap between the job requirements and the candidate's ACTUAL skills
- If there's limited overlap, emphasize transferable skills and relevant achievements
- Make it punchy, professional, and immediately compelling using ONLY verified skills and experience`,
    });

    return Response.json(object);
  } catch (error) {
    if (error instanceof AiConfigError) {
      // Env var names stay in the server log rather than the response body.
      console.error('AI provider is misconfigured:', error.message);
      return Response.json(
        { error: 'AI provider is not configured' },
        { status: 500 }
      );
    }

    console.error('CV generation failed:', error);
    return Response.json(
      { error: 'Failed to generate CV content' },
      { status: 500 }
    );
  }
}

