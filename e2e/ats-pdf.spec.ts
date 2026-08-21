import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CvDocument } from '../src/features/CV/document';
import {
  approveVariant,
  createEvidenceVariant,
  requiredChangeIds
} from '../src/features/Submitting/evidence';
import {
  cvFixture,
  offerFixture,
  proposalFixture
} from '../src/test/fixtures/evidence';

const inspectPdf = async (filename: string) => {
  const bytes = new Uint8Array(await readFile(filename));
  const raw = Buffer.from(bytes).toString('latin1');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  let text = '';
  const links: string[] = [];
  const fonts = new Set<string>();
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const viewport = page.getViewport({ scale: 1 });
    expect(viewport.width).toBeCloseTo(595.28, 0);
    expect(viewport.height).toBeCloseTo(841.89, 0);
    const content = await page.getTextContent();
    text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    Object.values(content.styles).forEach((style) => fonts.add(style.fontFamily));
    const annotations = await page.getAnnotations();
    annotations.forEach((annotation) => {
      if ('url' in annotation && typeof annotation.url === 'string') links.push(annotation.url);
    });
  }
  const metadata = await pdf.getMetadata();
  const pageCount = pdf.numPages;
  await pdf.destroy();
  return {
    text,
    normalizedText: text.replace(/\s+/g, ' ').trim(),
    links,
    fonts: [...fonts],
    metadata,
    pageCount,
    size: bytes.byteLength,
    hasEmbeddedDejaVu:
      /\/FontFile\d?\b/.test(raw) && /DejaVuSans/.test(raw) && /\/ToUnicode\b/.test(raw),
    language: raw.match(/\/Lang\s*\(([^)]+)\)/)?.[1]
  };
};

const renderFirstPdfPage = async (page: Page, filename: string) => {
  const bytes = [...new Uint8Array(await readFile(filename))];
  await page.evaluate(async (pdfBytes) => {
    const moduleUrl = '/api/assets/pdfjs';
    const pdfjs = await import(moduleUrl);
    pdfjs.GlobalWorkerOptions.workerSrc = '/api/assets/pdfjs-worker';
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(pdfBytes),
      isEvalSupported: false
    }).promise;
    const pdfPage = await pdf.getPage(1);
    const viewport = pdfPage.getViewport({ scale: 1.35 });
    const canvas = document.createElement('canvas');
    canvas.dataset.pdfVisual = 'native-ats-page-1';
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    document.body.replaceChildren(canvas);
    document.body.style.margin = '0';
    document.body.style.background = '#ffffff';
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');
    await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
    await pdf.destroy();
  }, bytes);
};

const installMasterCv = async (
  page: Page,
  document: CvDocument,
  locale: 'en' | 'pl' = 'en'
) => {
  await page.evaluate(
    async ({ cvDocument, cvLocale }) => {
      const request = indexedDB.open('cvitae', 1);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('state')) {
            request.result.createObjectStore('state');
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction('state', 'readwrite');
      transaction
        .objectStore('state')
        .put({ version: 1, documents: { [cvLocale]: cvDocument } }, 'cvitae.cv.v1');
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      db.close();
    },
    { cvDocument: document, cvLocale: locale }
  );
};

for (const locale of ['en', 'pl'] as const) {
  test(`downloads and independently parses the ${locale.toUpperCase()} native ATS PDF`, async ({
    page
  }, testInfo) => {
    await page.goto('/');
    if (locale === 'pl') {
      await page.getByRole('button', {
        name: 'Switch the CV document to PL'
      }).click();
    }
    const button = page.getByRole('button', { name: 'Download ATS PDF' });
    await expect(button).toBeEnabled();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      button.click()
    ]);
    const filename = path.join(testInfo.outputDir, `cv-${locale}.pdf`);
    await download.saveAs(filename);
    expect(download.suggestedFilename()).toMatch(/_ATS\.pdf$/);

    const result = await inspectPdf(filename);
    expect(result.pageCount).toBeLessThanOrEqual(2);
    expect(result.size).toBeLessThan(2_500_000);
    expect(result.text).toContain('Dominik Beń');
    expect(result.text).not.toContain('\uFFFD');
    expect(result.fonts.length).toBeGreaterThan(0);
    expect(result.hasEmbeddedDejaVu).toBe(true);
    expect(result.links).toContain('mailto:bendominik@gmail.com');
    expect(result.links).toContain('tel:+48518304803');
    expect(result.links.some((link) => link.includes('github.com/fijisoo'))).toBe(true);

    if (locale === 'pl') {
      expect(result.text).toMatch(/Podsumowanie Zawodowe/i);
      expect(result.text).toMatch(/Doświadczenie Zawodowe/i);
      expect(result.text).toMatch(/[ąćęłńóśźż]/i);
      expect(result.language).toBe('pl-PL');
    } else {
      expect(result.text).toMatch(/Professional Summary/i);
      expect(result.text).toMatch(/Work Experience/i);
      expect(result.language).toBe('en-GB');
    }

    const info = result.metadata.info as Record<string, unknown>;
    expect(String(info.Title)).toContain('Dominik Beń');
    expect(String(info.Author)).toBe('Dominik Beń');

    if (locale === 'en') {
      await renderFirstPdfPage(page, filename);
      await expect(page.locator('[data-pdf-visual="native-ats-page-1"]')).toHaveScreenshot(
        'native-ats-page-1.png',
        { animations: 'disabled', maxDiffPixelRatio: 0.02 }
      );
    }
  });
}

test('designed PDF keeps its searchable layer and ignores a decoy preview root', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/en');
  await expect(page.locator('[data-cv-preview-root="master"] [data-page]')).not.toHaveCount(0);
  await expect(page.locator('[data-cv-preview-root="master"]')).toHaveScreenshot(
    'designed-cv-preview.png',
    { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.02 }
  );
  await page.evaluate(() => {
    const decoy = document.createElement('div');
    decoy.dataset.cvPreviewRoot = 'decoy';
    decoy.innerHTML = '<div data-page="1">DECOY SHOULD NEVER BE EXPORTED</div>';
    document.body.appendChild(decoy);
  });

  const button = page.getByRole('button', { name: 'Download designed PDF' });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 100_000 }),
    button.click()
  ]);
  const filename = path.join(testInfo.outputDir, 'cv-designed.pdf');
  await download.saveAs(filename);
  const result = await inspectPdf(filename);
  expect(result.text).toContain('Dominik Beń');
  expect(result.text).toContain('Work Experience');
  expect(result.text).not.toContain('DECOY SHOULD NEVER BE EXPORTED');
  expect(result.text).not.toMatch(/\+\s*Add\b|\bRemove\b/);
  expect(result.links.some((link) => link.includes('github.com/fijisoo'))).toBe(true);
  expect(result.size).toBeLessThan(2_500_000);
});

test('designed preflight handles a short CV with tracked labels and a wrapped URL', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  const short = cvFixture();
  const longUrl = `https://example.com/${'portfolio-segment-'.repeat(10)}`;
  short.role_description = '';
  short.personal.links = { website: longUrl };
  short.skills.groups = [{ label: 'Other Technologies', items: ['React'] }];
  short.experience = [
    {
      ...short.experience[0],
      highlights: ['Built accessible React interfaces.'],
      skills: ['React']
    }
  ];
  short.education = [];
  short.certificates = [];
  short.languages = [];

  await page.goto('/en');
  await installMasterCv(page, short);
  await page.reload();

  const location = page.getByRole('textbox', { name: 'Location' });
  await expect(location).toHaveText('Warsaw, Poland');
  await location.fill('Kraków, Poland');
  await location.press('Enter');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 100_000 }),
    page.getByRole('button', { name: 'Download designed PDF' }).click()
  ]);
  const filename = path.join(testInfo.outputDir, 'cv-designed-short.pdf');
  await download.saveAs(filename);
  const result = await inspectPdf(filename);
  expect(result.text).toContain('Other Technologies');
  expect(result.text).toContain('Built accessible React interfaces.');
  expect(result.text).toContain('Kraków, Poland');
  expect(result.links).toContain(longUrl);
  expect(result.text).not.toContain('\uFFFD');
});

test('blocks native export when a required font face is missing', async ({ page }) => {
  await page.route('**/api/assets/dejavu/bold', (route) =>
    route.fulfill({ status: 503, body: 'missing' })
  );
  await page.goto('/en');
  await page.getByRole('button', { name: 'Download ATS PDF' }).click();
  await expect(page.getByText('Could not generate the ATS PDF.')).toBeVisible();
  await page
    .locator('#pdf-download-info')
    .getByText('Technical details')
    .click();
  await expect(page.getByText(/DejaVu bold font is unavailable/i)).toBeVisible();
});

test('blocks designed export when its searchable-layer asset is unavailable', async ({ page }) => {
  await page.route('**/fonts/DejaVuSans.ttf', (route) =>
    route.fulfill({ status: 503, body: 'missing' })
  );
  await page.goto('/en');
  await page.getByRole('button', { name: 'Download designed PDF' }).click();
  await expect(page.getByText(/searchable text-layer font could not be loaded/i)).toBeVisible();
});

test('exports cleanly when optional sections and links are empty', async ({ page }, testInfo) => {
  const sparse = cvFixture();
  sparse.role_description = '';
  sparse.personal.links = {};
  sparse.education = [];
  sparse.certificates = [];
  sparse.languages = [];

  await page.goto('/en');
  await installMasterCv(page, sparse);
  await page.reload();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download ATS PDF' }).click()
  ]);
  const filename = path.join(testInfo.outputDir, 'cv-empty-optional.pdf');
  await download.saveAs(filename);
  const result = await inspectPdf(filename);
  expect(result.normalizedText).toMatch(/work experience/i);
  expect(result.normalizedText).not.toMatch(/professional summary/i);
  expect(result.normalizedText).not.toMatch(/certifications/i);
  expect(result.links).toContain('mailto:ada@example.com');
  expect(result.pageCount).toBeGreaterThan(0);
});

test('warns but preserves native text and links when content exceeds two pages', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/en');
  const longUrl = `https://example.com/${'very-long-portfolio-segment-'.repeat(8)}`;
  const summary = Array.from(
    { length: 150 },
    (_, index) => `Evidence-backed sentence ${index + 1} about accessible React delivery.`
  ).join(' ');
  await page.getByRole('textbox', { name: 'website link' }).fill(longUrl);
  await page.getByRole('textbox', { name: 'Professional summary' }).fill(summary);
  await page.getByRole('heading', { name: 'Work Experience' }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 100_000 }),
    page.getByRole('button', { name: 'Download ATS PDF' }).click()
  ]);
  const filename = path.join(testInfo.outputDir, 'cv-long.pdf');
  await download.saveAs(filename);
  const result = await inspectPdf(filename);
  expect(result.pageCount).toBeGreaterThan(2);
  expect(result.normalizedText).toContain('Evidence-backed sentence 150');
  expect(result.links).toContain(longUrl);
  await expect(page.getByText(/ATS PDF is \d+ pages/i)).toBeVisible();
});

test('downloads the frozen approved evidence variant rather than the live page CV', async ({
  page
}, testInfo) => {
  const sourceCv = cvFixture();
  const offer = offerFixture();
  const draft = createEvidenceVariant({
    sourceCv,
    sourceOffer: offer,
    language: 'en',
    response: {
      version: 'evidence-v2',
      proposal: proposalFixture(),
      provider: 'fixture',
      model: 'fixture-model',
      promptVersion: 'fixture-v1',
      generatedAt: '2026-02-03T04:05:06.000Z'
    }
  });
  const approved = approveVariant({
    ...draft,
    acceptedChangeIds: requiredChangeIds(draft)
  });
  const submission = {
    id: 'submission-fixture',
    recordId: 'deleted-research-row',
    offer,
    language: 'en',
    queuedAt: '2026-02-03T00:00:00.000Z',
    cv: approved,
    apply: { email: '', subject: '', body: '' }
  };

  await page.goto('/en');
  await page.evaluate(
    async ({ cvPayload, submissionPayload }) => {
      const request = indexedDB.open('cvitae', 1);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('state')) {
            request.result.createObjectStore('state');
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction('state', 'readwrite');
      transaction.objectStore('state').put(cvPayload, 'cvitae.cv.v1');
      transaction
        .objectStore('state')
        .put(submissionPayload, 'cvitae.submitting.v1');
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      db.close();
    },
    {
      cvPayload: { version: 1, documents: { en: sourceCv } },
      submissionPayload: {
        version: 2,
        submissions: [submission],
        activeId: submission.id
      }
    }
  );
  await page.goto('/en/submitting');
  await expect(page.getByText('Frontend Developer', { exact: true }).first()).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download ATS PDF' }).click()
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^Ada_Zolc_Frontend_Developer_Hiring_Co_CV_EN_ATS\.pdf$/
  );
  const filename = path.join(testInfo.outputDir, 'cv-tailored.pdf');
  await download.saveAs(filename);
  const result = await inspectPdf(filename);
  expect(result.text).toContain('Ada Żółć');
  expect(result.text).toContain('I build accessible React interfaces for internal teams.');
  expect(result.text).not.toContain('Dominik Beń');
});
