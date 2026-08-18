# cvitae

Interactive EN/PL CV, job-offer research, and evidence-backed application tailoring.

## Routes

| Path | Contents |
| --- | --- |
| `/` / `/pl` | Editable master CV |
| `/research` / `/pl/research` | Vacancy research and cited requirements |
| `/submitting` / `/pl/submitting` | Evidence review, approval, export, and sending |
| `/settings` / `/pl/settings` | AI provider/model settings |

## Getting started

```bash
pnpm install
pnpm dev
```

The CV and research stores live in browser IndexedDB. A new browser is seeded from
`src/features/CV/seed/en.json` and `pl.json`; later edits remain authoritative.

Copy `.env.example` to `.env.local` when using the in-process AI routes. API keys stay on the
server; browser settings can select a provider/model but cannot send a credential.

## Importing and translating CVs

CV import and EN↔PL gap translation use the separate local
`cvitae-agent-runtime`; start it with `pnpm dev` in `../cvitae-agent-runtime` (the default URL is
`http://127.0.0.1:8788`). The runtime owns provider credentials, prompts, schemas, and model calls.
There is deliberately no in-process fallback for these two operations.

The translation button on the right of the master CV reads the other language stored in this
browser. It can translate the whole CV or selected sections, one section per bounded runtime call.
The browser then performs a source-aware gap merge: missing records, bullets, skills, and blank
fields may be filled, while existing target-language wording is never overwritten. The source CV
is not changed.

Translation uses the faster extraction model selected in Settings, falling back to the main model
when that field is blank. Number changes and other protected-fact changes are rejected per section;
successful sections remain available to apply and failed sections can be retried.

## PDF exports

- **ATS PDF (default):** native Unicode text generated lazily with pinned
  `@react-pdf/renderer@4.5.1`. It is one-column A4, has embedded DejaVu regular/bold/italic faces,
  visible and annotated links, localized metadata, and no portrait/tables/text boxes.
- **Designed PDF (secondary):** raster visual pages plus a mandatory invisible Unicode text layer.
  It is intended for direct sharing. Export is scoped to an explicit preview root and fails rather
  than silently falling back to an image-only file.

Both outputs are parsed from their final Blob with PDF.js before download. Corrupt files, missing
text/fonts/links, bad Unicode, hidden controls, duplicate text, and files over 2.5 MB are blocked.
Page count and the practical 1 MB target are warnings, not invented ATS scores.
The format follows documented text-first parser constraints from
[Greenhouse](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse)
and [Workday](https://developer.workday.com/documentation/GUID-f07adb7f-630e-42a2-9de9-a39652e34ec5-enHYPHENus/ResumeRESTAPI),
while treating keyword and semantic matching as separate evidence checks rather than a universal score.

## Tailoring model

Role-specific work exists only in the submitting flow. `POST /api/cv/generate` accepts the strict
`evidence-v2` request: snapshot-local CV fact ids plus cited vacancy requirements. Personal contact
data, CV source metadata, and vacancy URLs/raw acquisition metadata do not go to the model.

The model can propose only a target headline, 2–3 cited summary sentences, a subset/order of
existing skills, and selected/reworded existing bullets. The browser materializes the proposal from
the frozen source CV. Company names, historical titles, dates, education, contact data, and language
facts are protected. Local checks reject invalid/cross-job evidence, duplicate or unsupported skills,
new technologies, unsupported numeric claims, seniority inflation, and incomplete requirement
matching. Every change must be reviewed and accepted before approval.

Approved variants retain their CV/offer snapshots and fingerprints. Master-CV, offer, or language
changes make an unsent variant stale and block download/sending. Sent variants remain frozen history.
Legacy title/summary customizations are retained as unverified history and cannot be sent without
regeneration.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Vitest covers migrations, fingerprints, evidence invariants, fabricated claims, approval,
staleness, translation merging, and the runtime translation contract. Playwright exercises the
opposite-language section picker and downloads actual EN/PL/native/designed/long PDFs for independent
PDF.js parsing. CI also validates generated artifacts with Poppler and qpdf.

## Stack

Next.js 16 · React 19 · next-intl · Tailwind CSS 3 · Vercel AI SDK · React-PDF · PDF.js · Vitest ·
Playwright
