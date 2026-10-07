import { test, expect } from '@playwright/test';

test('note cards search, sort and open directly in Main', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  for (const name of ['Alpha', 'Zebra']) {
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('.tab.active')).toContainText(name);
    await page
      .getByRole('textbox', { name: 'Note content' })
      .fill(`${name} description`);
  }
  await page.getByRole('button', { name: 'Detail', exact: true }).click();
  await page
    .locator('.sidebar .detail')
    .getByRole('button', { name: 'Notes', exact: true })
    .click();
  await page.mouse.move(650, 300);
  await expect(page.locator('.note-library .note-card')).toHaveCount(2);
  await expect(page.locator('.notes-pane')).toHaveCount(0);
  await page
    .getByRole('combobox', { name: 'Sort by', exact: true })
    .selectOption('name');
  await expect(page.locator('.note-card').first()).toContainText('Alpha');
  await page
    .getByRole('combobox', { name: 'Sort by', exact: true })
    .selectOption('created');
  await expect(page.locator('.note-card').first()).toContainText('Zebra');
  await page
    .getByRole('searchbox', { name: 'Search notes' })
    .fill('alpha description');
  await expect(page.locator('.note-card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search notes' }).fill('no match');
  await expect(
    page.getByText('No matching notes.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search notes' }).fill('Alpha');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.locator('.note-card').click();
  await expect(page.locator('.workspace')).toHaveClass(/main/);
  await expect(page.locator('.note-library')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveText(
    'Alpha description',
  );
  await expect(
    page
      .locator('.bottom-nav')
      .getByRole('button', { name: 'Notes', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
});
