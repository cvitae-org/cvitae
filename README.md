# cvitae

Interactive, paginated A4 CV for Dominik Beń, served publicly at the home path. Split out of the
[fijisoo](https://github.com/fijisoo/fijisoo) portfolio, where it lived behind a token gate at `/cv`.

## Routes

| Path  | Contents                    |
| ----- | --------------------------- |
| `/`   | CV, English (default locale) |
| `/pl` | CV, Polish                   |

No access token, no login — the CV is public. Locale prefixing is `as-needed`, so the default
locale stays on the bare home path.

## Getting started

```bash
pnpm install
pnpm dev
```

Then open http://localhost:3000.

## Environment

Only needed for the "Customize for job offer" button, which calls `POST /api/cv/generate`:

```
OPENAI_API_KEY=sk-...
```

Copy `.env.example` to `.env.local` and fill it in. Without the key the CV renders and downloads
fine; only the AI customization request fails.

## Features

- **Paginated A4 layout** — content is measured in a hidden pass, then split across A4 pages at
  safe break points (`src/features/CV/`).
- **PDF download** — client-side via `html2canvas` + `jsPDF`, one canvas per page.
- **EN/PL switcher** — swaps locale in place, keeping you on the same page.
- **AI job-offer tailoring** — paste a job description; `gpt-4o` rewrites the title and summary
  using only skills present in the CV data, and you can apply or discard the result.
- **Job research** — paste an offer URL and it is fetched, analysed into a structured record, and
  tracked in a table (`src/features/JobResearch/`). Boards that render on the server work out of
  the box. Run [cvitae-scrapper](../cvitae-scrapper) alongside and JavaScript-only boards work
  too, with company, salary and skills taken from the board's own listing data rather than
  inferred — set `SCRAPER_URL`, or leave it at the default `http://127.0.0.1:8787`. Research
  falls back to the built-in fetch whenever the scraper is not running.

## Content

The CV itself is data, not markup: everything lives under the `cv` key in `messages/en.json` and
`messages/pl.json`. Edit those to change experience, education, certificates, or contact details.

## Stack

Next.js 16 (App Router) · React 19 · next-intl · Tailwind CSS 3 · Vercel AI SDK
