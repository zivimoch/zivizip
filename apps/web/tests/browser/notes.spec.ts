import { test, expect } from '@playwright/test';
test('guest note persists, closing only hides it, backup downloads', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await page.getByLabel('Name', { exact: true }).fill('daily ideas');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Note content' })
    .fill('Keep my thoughts');
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveText(
    'Keep my thoughts',
  );
  await page
    .getByRole('button', { name: 'Close Daily Ideas', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Detail', exact: true }).click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Notes', exact: true })
    .click();
  await page.mouse.move(650, 300);
  await page
    .locator('.note-library')
    .getByRole('button', { name: /Daily Ideas/ })
    .click();
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveText(
    'Keep my thoughts',
  );
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  expect((await download).suggestedFilename()).toMatch(/zivizip.*json/);
});
test('mobile navigation and offline reload', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Note content' })
    .fill('Offline works');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.waitForTimeout(300);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveText(
    'Offline works',
  );
  await page
    .getByRole('textbox', { name: 'Note content' })
    .fill('Edited offline');
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveText(
    'Edited offline',
  );
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
});
