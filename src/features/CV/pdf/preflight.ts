export type PdfPreflightIssue = {
  code: string;
  message: string;
  severity: 'block' | 'warning';
};

export type PdfPreflightResult = {
  ok: boolean;
  issues: PdfPreflightIssue[];
  text: string;
  pageCount: number;
  recovery: number;
  missingTokens: MeaningfulTokenGap[];
  links: string[];
  fonts: string[];
  sizeBytes: number;
};

export type PdfPreflightOptions = {
  expectedText: string;
  expectedLinks: string[];
  logicalHeadings: string[];
  language?: string;
  /** Text whose correctness is covered by link annotations, not prose recovery. */
  ignoredRecoveryText?: string[];
  compatibilityCeiling?: number;
  outputLabel?: string;
};

const tokens = (value: string): string[] =>
  (
    value
      .normalize('NFC')
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+(?:[.+#/-][\p{L}\p{N}]+)*/gu) ?? []
  ).filter((token) => token.length > 1 || /\d/.test(token));

export type MeaningfulTokenGap = {
  token: string;
  count: number;
};

export type MeaningfulTokenRecoveryDetails = {
  recovery: number;
  expectedCount: number;
  recoveredCount: number;
  missingTokens: MeaningfulTokenGap[];
};

/**
 * Compares meaningful tokens as a multiset and preserves the missing values for
 * an actionable preflight error. A multiset matters here: recovering one of two
 * identical bullet words is only half a recovery, not a complete match.
 */
export const meaningfulTokenRecoveryDetails = (
  expectedText: string,
  extractedText: string
): MeaningfulTokenRecoveryDetails => {
  // Link annotations are verified independently. PDF extractors legitimately
  // disagree on whether a long wrapped URL contains spaces at line breaks, so
  // counting its path fragments as prose tokens creates false corruption
  // failures while saying nothing about whether the URL still works.
  const expected = tokens(expectedText.replace(/https?:\/\/\S+/gi, ' '));
  if (expected.length === 0) {
    return {
      recovery: 1,
      expectedCount: 0,
      recoveredCount: 0,
      missingTokens: []
    };
  }

  const available = new Map<string, number>();
  tokens(extractedText).forEach((token) =>
    available.set(token, (available.get(token) ?? 0) + 1)
  );

  let recoveredCount = 0;
  const missing = new Map<string, number>();
  expected.forEach((token) => {
    const count = available.get(token) ?? 0;
    if (count > 0) {
      recoveredCount += 1;
      available.set(token, count - 1);
      return;
    }
    missing.set(token, (missing.get(token) ?? 0) + 1);
  });

  return {
    recovery: recoveredCount / expected.length,
    expectedCount: expected.length,
    recoveredCount,
    missingTokens: [...missing].map(([token, count]) => ({ token, count }))
  };
};

export const meaningfulTokenRecovery = (
  expectedText: string,
  extractedText: string
): number => meaningfulTokenRecoveryDetails(expectedText, extractedText).recovery;

export const withoutSeparatelyVerifiedLines = (
  expectedText: string,
  independentlyVerified: string[]
): string => {
  const ignored = new Map<string, number>();
  independentlyVerified.forEach((value) => {
    const normalized = value.normalize('NFC').trim().toLocaleLowerCase();
    if (normalized) ignored.set(normalized, (ignored.get(normalized) ?? 0) + 1);
  });
  if (ignored.size === 0) return expectedText;

  // The expected documents are line-oriented. Removing only exact lines avoids
  // accidentally dropping a prose occurrence of a short heading such as
  // "Skills" while still covering wrapped URLs captured one line at a time.
  // Counts are consumed so a job title identical to the target headline remains
  // protected by recovery after the independently checked headline is removed.
  return expectedText
    .split('\n')
    .filter((line) => {
      const normalized = line.normalize('NFC').trim().toLocaleLowerCase();
      const remaining = ignored.get(normalized) ?? 0;
      if (remaining === 0) return true;
      ignored.set(normalized, remaining - 1);
      return false;
    })
    .join('\n');
};

const normalizedLink = (value: string): string => {
  const trimmed = value.trim();
  try {
    // PDF.js returns URI annotations in their percent-encoded form, while the
    // CV may hold a readable Unicode URL. URL canonicalization makes those two
    // equivalent without weakening the requirement that the full target exists.
    return new URL(trimmed).href.replace(/\/$/, '').toLocaleLowerCase();
  } catch {
    return trimmed.replace(/\/$/, '').toLocaleLowerCase();
  }
};

/** Parses the final Blob—the bytes being downloaded, not the source document. */
export async function preflightPdf(
  blob: Blob,
  options: PdfPreflightOptions
): Promise<PdfPreflightResult> {
  const issues: PdfPreflightIssue[] = [];
  const block = (code: string, message: string) =>
    issues.push({ code, message, severity: 'block' });
  const warn = (code: string, message: string) =>
    issues.push({ code, message, severity: 'warning' });
  const ceiling = options.compatibilityCeiling ?? 2_500_000;

  if (blob.size === 0) block('empty-file', 'The generated PDF is empty.');
  if (blob.size > ceiling) {
    block(
      'file-too-large',
      `The PDF is ${(blob.size / 1_000_000).toFixed(2)} MB; the compatibility ceiling is ${(ceiling / 1_000_000).toFixed(1)} MB.`
    );
  } else if (blob.size > 1_000_000) {
    warn('file-size', 'The PDF is above the practical 1 MB target.');
  }

  let text = '';
  let pageCount = 0;
  const links = new Set<string>();
  const fonts = new Set<string>();
  let binaryText = '';

  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/api/assets/pdfjs-worker';
    const data = new Uint8Array(await blob.arrayBuffer());
    binaryText = new TextDecoder('windows-1252').decode(data);
    const pdf = await pdfjs.getDocument({
      data,
      isEvalSupported: false,
      useWorkerFetch: false
    }).promise;
    pageCount = pdf.numPages;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      if (
        Math.abs(viewport.width - 595.28) > 2 ||
        Math.abs(viewport.height - 841.89) > 2
      ) {
        block('page-size', `Page ${pageNumber} is not A4 portrait.`);
      }

      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      text += `${pageText}\n`;
      Object.values(content.styles).forEach((style) => {
        if (style.fontFamily) fonts.add(style.fontFamily);
      });

      const annotations = await page.getAnnotations({ intent: 'display' });
      annotations.forEach((annotation) => {
        if ('url' in annotation && typeof annotation.url === 'string') {
          links.add(annotation.url);
        }
      });
    }

    await pdf.destroy();
  } catch (error) {
    block(
      'corrupt',
      `PDF.js could not parse the generated file: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  const recoverySource = withoutSeparatelyVerifiedLines(
    options.expectedText,
    [
      ...(options.ignoredRecoveryText ?? []),
      // These are checked below using compact Unicode text and forward-only
      // positions. Counting them again as ordinary tokens makes CSS tracking
      // artifacts ("EDU CATION") look like lost content on short CVs.
      ...options.logicalHeadings
    ]
  );
  const recoveryDetails = meaningfulTokenRecoveryDetails(recoverySource, text);
  const recovery = recoveryDetails.recovery;
  const extractedTokens = tokens(text);
  const expectedTokens = tokens(options.expectedText);
  if (extractedTokens.length < Math.min(20, expectedTokens.length)) {
    block('image-only', 'The PDF does not contain enough searchable text.');
  }
  if (recovery < 0.995) {
    const preview = recoveryDetails.missingTokens
      .slice(0, 8)
      .map(({ token, count }) => `“${token}”${count > 1 ? ` ×${count}` : ''}`)
      .join(', ');
    block(
      'text-recovery',
      `Only ${(recovery * 100).toFixed(1)}% of meaningful tokens were recovered.${
        preview ? ` Unrecovered: ${preview}.` : ''
      }`
    );
  }
  if (text.includes('\uFFFD')) {
    block('unicode', 'The extracted text contains Unicode replacement characters.');
  }
  if (/\b(?:your name|you@example\.com|company name|lorem ipsum)\b/i.test(text)) {
    block('placeholder', 'The PDF contains placeholder text.');
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) {
    block('controls', 'The extracted text contains hidden control characters.');
  }
  if (expectedTokens.length > 20 && extractedTokens.length > expectedTokens.length * 1.12) {
    block('duplicate-text', 'The PDF appears to contain duplicate hidden text.');
  }
  if (fonts.size === 0) block('font', 'No text font was detected in the PDF.');
  if (!/\/FontFile\d?\b/.test(binaryText) || !/\/ToUnicode\b/.test(binaryText)) {
    block('embedded-font', 'The PDF does not expose an embedded Unicode font map.');
  }
  if (
    options.language &&
    !binaryText.includes(`/Lang (${options.language})`)
  ) {
    block('language-metadata', `The PDF language metadata is not ${options.language}.`);
  }

  // Text layers may split a heading into several positioned runs ("EDU CATION")
  // even though all glyphs are present. Compare its letters and numbers while
  // retaining forward-only positions, so fragmentation does not become a false
  // missing-heading result and reading order is still enforced.
  const logicalText = text
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
  let previous = -1;
  options.logicalHeadings.forEach((heading) => {
    if (!heading) return;
    // A section heading can also be content (e.g. the skills group "Languages").
    // Search forward from the prior section instead of treating the first
    // occurrence in the whole document as the section marker.
    const position = logicalText.indexOf(
      heading
        .normalize('NFC')
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ''),
      previous + 1
    );
    if (position < 0) {
      block('heading', `The heading "${heading}" is missing from extracted text.`);
    }
    previous = Math.max(previous, position);
  });

  const foundLinks = [...links];
  const normalizedFound = new Set(foundLinks.map(normalizedLink));
  options.expectedLinks.filter(Boolean).forEach((link) => {
    if (!normalizedFound.has(normalizedLink(link))) {
      block('link', `The PDF is missing the link annotation for ${link}.`);
    }
  });

  if (pageCount > 2) {
    warn(
      'page-count',
      `The ${options.outputLabel ?? 'ATS PDF'} is ${pageCount} pages; review density and relevance.`
    );
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'block'),
    issues,
    text,
    pageCount,
    recovery,
    missingTokens: recoveryDetails.missingTokens,
    links: foundLinks,
    fonts: [...fonts],
    sizeBytes: blob.size
  };
}
