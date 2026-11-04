import { test, expect, type Page } from '@playwright/test';
async function visit(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Add task', exact: true }),
  ).toBeEnabled();
}
async function add(page: Page, title: string, date = '') {
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByLabel('What would you like to finish?')).toBeFocused();
  await page.getByLabel('What would you like to finish?').fill(title);
  if (date) await page.getByLabel('Due date (optional)').fill(date);
  await expect(page.getByLabel('Related amount (IDR, optional)')).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.task-title', { hasText: title })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add task', exact: true }),
  ).toBeEnabled();
}
const row = (page: Page, title: string) =>
  page.locator('.task-row').filter({
    has: page.locator('.task-title', { hasText: new RegExp(`^${title}$`) }),
  });
test('task drag preview preserves order until drop and Escape cancels it', async ({
  page,
}) => {
  await visit(page);
  await add(page, 'One');
  await add(page, 'Two');
  const a = (await row(page, 'One').boundingBox())!,
    b = (await row(page, 'Two').boundingBox())!;
  await page.mouse.move(a.x + 80, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 80, b.y + b.height - 3, { steps: 8 });
  await expect(page.locator('.drag-preview')).toContainText('One');
  await expect(row(page, 'Two')).toHaveClass(/drop-after/);
  await expect(page.locator('.task-title')).toHaveText(['One', 'Two']);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.drag-preview')).toHaveCount(0);
  await expect(page.locator('.task-title')).toHaveText(['One', 'Two']);
});
