import { test, expect } from '@playwright/test';

test('note search opens notes, remembers recency and supports keyboard and mobile', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  for (const name of ['Travel plans', 'Reading list']) {
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('.breadcrumb-path')).toContainText(name);
  }
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search notes' });
  const search = dialog.getByRole('combobox');
  await expect(search).toBeFocused();
  await expect(dialog.getByRole('option').first()).toContainText(
    'Reading list',
  );
  await search.fill('travel');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await search.press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.breadcrumb-path')).toContainText('Travel plans');
  await page
    .getByRole('button', { name: 'Close Travel plans', exact: true })
    .click();
  await page.reload();
  await page.getByRole('button', { name: 'Search notes', exact: true }).click();
  await expect(dialog.getByRole('option').first()).toContainText(
    'Travel plans',
  );
  await search.fill('no matching note');
  await expect(dialog.getByText('No notes found.')).toBeVisible();
  await search.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Search notes', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(390);
  await dialog.getByRole('option').first().click();
  await expect(page.locator('.breadcrumb-path')).toContainText('Travel plans');
});
