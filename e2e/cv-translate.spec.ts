import { expect, test } from '@playwright/test';

test('opens the other-language gap translation flow from the CV controls', async ({
  page
}) => {
  await page.goto('/');
  await page.getByRole('button', {
    name: 'Switch the CV document to PL'
  }).click();

  const translateButton = page.getByRole('button', {
    name: 'Translate gaps from the other CV language'
  });

  await expect(translateButton).toBeVisible();
  await expect(translateButton).toHaveAttribute(
    'title',
    'Fill PL gaps from the EN CV'
  );
  await translateButton.click();

  await expect(
    page.getByRole('heading', { name: 'Fill PL from EN' })
  ).toBeVisible();
  await expect(
    page.getByText('Existing PL wording is never overwritten.')
  ).toBeVisible();

  await page.getByRole('button', { name: 'Only some sections' }).click();

  for (const label of [
    'Name and contact',
    'Summary',
    'Skills',
    'Work experience',
    'Education',
    'Certificates',
    'Languages'
  ]) {
    await expect(page.getByRole('checkbox', { name: label })).toBeVisible();
  }

  await expect(
    page.getByRole('button', { name: 'Translate gaps', exact: true })
  ).toBeEnabled();
});
