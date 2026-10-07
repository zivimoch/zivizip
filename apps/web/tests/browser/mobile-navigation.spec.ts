import { test, expect } from '@playwright/test';

test('mobile bottom navigation selects Main panels rather than Detail pages', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  const nav = page.locator('.bottom-nav');
  await expect(
    nav.getByRole('button', { name: 'Notes', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Note content' })
    .fill('Keep this note open');
  await nav.getByRole('button', { name: 'Finance', exact: true }).click();
  await expect(page.locator('.workspace')).toHaveClass(/main/);
  await expect(page.locator('.right-pane .finance-panel')).toBeVisible();
  await expect(page.locator('.financial-plan')).toHaveCount(0);
  await expect(page.locator('.notes-pane')).toBeHidden();
  await expect(
    nav.getByRole('button', { name: 'Finance', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('button', { name: 'To do', exact: true }).click();
  await expect(page.locator('.right-pane .tasks-slot')).toBeVisible();
  await expect(page.locator('.right-pane .finance-panel')).toBeHidden();
  await expect(page.locator('.tasks-page')).toHaveCount(0);
  await nav.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveText(
    'Keep this note open',
  );
  await expect(page.locator('.note-library')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('button', { name: 'Detail', exact: true }).click();
  await page
    .locator('.sidebar .detail')
    .getByRole('button', { name: 'Finance', exact: true })
    .click();
  await expect(page.locator('.financial-plan')).toBeVisible();
  await nav.getByRole('button', { name: 'Finance', exact: true }).click();
  await expect(page.locator('.financial-plan')).toHaveCount(0);
  await expect(page.locator('.right-pane .finance-panel')).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.notes-pane')).toBeVisible();
  await expect(page.locator('.right-pane .tasks-slot')).toBeVisible();
  await expect(page.locator('.right-pane .finance-panel')).toBeVisible();
});
