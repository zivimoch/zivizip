import { test, expect, type Page } from '@playwright/test';
const card = (page: Page, group: string) =>
  page.locator(`[data-plan-group="${group}"]`);
const row = (page: Page, name: string) =>
  page
    .locator('[data-plan-row]')
    .filter({ has: page.getByRole('button', { name, exact: true }) });
const dialog = (page: Page) => page.getByRole('dialog');
async function detail(page: Page) {
  await page.getByRole('button', { name: 'Detail', exact: true }).click();
  await page
    .locator('.sidebar .detail')
    .getByRole('button', { name: 'Finance', exact: true })
    .click();
  await expect(page.locator('.financial-plan')).toBeVisible();
  await page.mouse.move(700, 300);
}
async function visit(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await detail(page);
}
async function createMonth(page: Page, destination: string, source = '') {
  await page.getByRole('button', { name: 'Analysis', exact: true }).click();
  await page
    .getByRole('button', { name: 'Create month from a plan', exact: true })
    .click();
  await dialog(page)
    .getByRole('combobox', { name: 'Copy plan from', exact: true })
    .selectOption(source);
  await dialog(page).getByLabel('New month', { exact: true }).fill(destination);
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
}
test('unplanned income appears with automatic budget and survives category controls', async ({
  page,
}) => {
  await visit(page);
  await createMonth(page, '2026-10');
  await page
    .getByRole('button', { name: 'Add transaction', exact: true })
    .click();
  await dialog(page)
    .getByRole('radio', { name: 'Income', exact: true })
    .check();
  await dialog(page)
    .getByLabel('Category', { exact: true })
    .fill('Unexpected bonus');
  await dialog(page)
    .getByLabel('Amount (IDR)', { exact: true })
    .fill('1200000');
  await dialog(page).getByLabel('Date', { exact: true }).fill('2026-10-02');
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
  const income = card(page, 'income');
  const bonus = income
    .locator('[data-plan-row]')
    .filter({ hasText: 'Unexpected bonus' });
  await expect(bonus).toBeVisible();
  await expect(bonus.locator('strong')).toContainText('1.200.000');
  await bonus.locator('.plan-state').click();
  await expect(bonus).toHaveClass(/excluded/);
  await bonus.locator('.plan-state').click();
  await expect(bonus).not.toHaveClass(/excluded/);
  await page
    .getByRole('button', { name: 'Add transaction', exact: true })
    .click();
  await dialog(page)
    .getByRole('radio', { name: 'Income', exact: true })
    .check();
  await expect(
    dialog(page).getByLabel('Category', { exact: true }),
  ).toHaveValue('Unexpected bonus');
  await page
    .getByRole('button', { name: 'Close transaction dialog', exact: true })
    .click();
});
