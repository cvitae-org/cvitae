import { expect, test, type Page } from '@playwright/test';
import enSeed from '../src/features/CV/seed/en.json';
import plSeed from '../src/features/CV/seed/pl.json';
import {
  parseDocument,
  type CvDocument
} from '../src/features/CV/document';

const installDocuments = async (
  page: Page,
  documents: { en: CvDocument; pl: CvDocument }
) => {
  await page.evaluate(async (cvDocuments) => {
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
      .put({ version: 1, documents: cvDocuments }, 'cvitae.cv.v1');
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, documents);
};

const readDocuments = async (page: Page) =>
  page.evaluate(async () => {
    const request = indexedDB.open('cvitae', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction('state', 'readonly');
    const get = transaction.objectStore('state').get('cvitae.cv.v1');
    const state = await new Promise<{ documents: { en: CvDocument; pl: CvDocument } }>(
      (resolve, reject) => {
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      }
    );
    db.close();
    return state.documents;
  });

test('fills selected Polish gaps from the stored English CV without overwriting Polish wording', async ({
  page
}) => {
  const english = parseDocument(enSeed, 'en');
  const completePolish = parseDocument(plSeed, 'pl');
  const targetPolish = parseDocument(completePolish, 'pl');
  const expectedSummary = completePolish.role_description;
  const expectedMissingBullet = completePolish.experience[0]?.highlights.at(-1);
  const handEditedBullet = 'Ręcznie poprawiona treść pozostaje bez zmian.';

  targetPolish.role_description = '';
  targetPolish.experience[0]!.highlights[0] = handEditedBullet;
  targetPolish.experience[0]!.highlights.pop();

  const requestedSections: string[] = [];
  const requestDocuments: unknown[] = [];
  await page.route('**/api/cv/translate', async (route) => {
    const request = route.request().postDataJSON() as {
      document: unknown;
      source_language: string;
      target_language: string;
      sections: string[];
    };
    requestedSections.push(...request.sections);
    requestDocuments.push(request.document);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        document: completePolish,
        translated: request.sections,
        source_language: request.source_language,
        target_language: request.target_language,
        degraded: [],
        elapsedMs: 12
      })
    });
  });

  await page.goto('/');
  await page.getByRole('button', {
    name: 'Switch the CV document to PL'
  }).click();
  await installDocuments(page, { en: english, pl: targetPolish });
  await page.reload();

  const translateButton = page.getByRole('button', {
    name: 'Translate gaps from the other CV language'
  });
  await expect(translateButton).toBeVisible();
  const [previewBox, buttonBox] = await Promise.all([
    page.locator('[data-cv-preview-root="master"]').boundingBox(),
    translateButton.boundingBox()
  ]);
  expect(previewBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox!.x).toBeGreaterThan(previewBox!.x + previewBox!.width);

  await translateButton.click();
  await expect(
    page.getByRole('heading', { name: 'Fill PL from EN' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Only some sections' }).click();
  await expect(page.getByRole('checkbox', { name: 'Work experience' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Summary' }).check();
  await page
    .getByRole('button', { name: 'Translate gaps', exact: true })
    .click();

  const apply = page.getByRole('button', { name: /Fill translated gaps/ });
  await expect(apply).toBeEnabled();
  expect(requestedSections).toEqual(['role_description', 'experience']);
  expect(requestDocuments).toEqual([english, english]);
  await apply.click();

  await expect(
    page.getByRole('heading', { name: 'Fill PL from EN' })
  ).not.toBeVisible();
  await expect
    .poll(async () => (await readDocuments(page)).pl.role_description)
    .toBe(expectedSummary);
  const stored = await readDocuments(page);
  expect(stored.en).toEqual(english);
  expect(stored.pl.experience[0]?.highlights[0]).toBe(handEditedBullet);
  expect(stored.pl.experience[0]?.highlights.at(-1)).toBe(
    expectedMissingBullet
  );
  expect(stored.pl.experience[0]?.highlights).toHaveLength(
    completePolish.experience[0]!.highlights.length
  );
});
