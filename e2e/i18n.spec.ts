import { expect, test } from '@playwright/test';

test('switches the interface language without changing the chosen master CV language', async ({
  page
}) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await page.locator('#interface-language').selectOption('pl');
  await expect(page).toHaveURL(/\/pl\/settings$/);
  await expect(page.getByRole('heading', { name: 'Ustawienia' })).toBeVisible();

  await page.goto('/pl/research');
  await expect(
    page.getByRole('heading', { name: 'Analiza ofert pracy' })
  ).toBeVisible();
  await expect(page.getByText('Nie przeanalizowano jeszcze żadnych ofert')).toBeVisible();

  await page.goto('/pl/submitting');
  await expect(page.getByRole('heading', { name: 'Aplikowanie' })).toBeVisible();
  await expect(page.getByText('Kolejka jest pusta')).toBeVisible();

  await page.goto('/pl');
  await expect(
    page.getByRole('heading', { name: 'Doświadczenie Zawodowe' }).first()
  ).toBeVisible();

  await page.getByRole('button', { name: /Przełącz dokument CV na język EN/ }).click();
  await page.reload();
  await expect(page).toHaveURL(/\/pl$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(
    page.getByRole('heading', { name: 'Work Experience' }).first()
  ).toBeVisible();
  await expect(page.getByTitle('Ustawienia')).toBeVisible();

  await page.goto('/pl/settings');
  await page.locator('#interface-language').selectOption('en');
  await expect(page).toHaveURL(/\/settings$/);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Work Experience' }).first()
  ).toBeVisible();
});

test('uses the browser language on a first visit', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    locale: 'pl-PL'
  });
  const page = await context.newPage();

  await page.goto('/');
  await expect(page).toHaveURL(/\/pl$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page.getByTitle('Ustawienia')).toBeVisible();

  await context.close();
});
