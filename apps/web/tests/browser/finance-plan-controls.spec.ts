import { test, expect, type Page } from '@playwright/test';

async function openFinance(page: Page) {
  await page.getByRole('button', { name: 'Detail', exact: true }).click();
  await page
    .locator('.sidebar .detail')
    .getByRole('button', { name: 'Finance', exact: true })
    .click();
  await page.mouse.move(700, 300);
}
async function stored(page: Page, key: string) {
  return page.evaluate(
    (key) =>
      new Promise<any>((resolve, reject) => {
        const request = indexedDB.open('zivizip-guest-v1');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('meta').objectStore('meta').get(key);
          read.onsuccess = () => {
            resolve(read.result?.value);
            db.close();
          };
          read.onerror = () => {
            reject(read.error);
            db.close();
          };
        };
      }),
    key,
  );
}

test('plan tabs keep the ledger month independent and deletion preserves transactions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await openFinance(page);
  const current = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const ledgerMonth = page.getByLabel('Transaction month', { exact: true });
  await expect(ledgerMonth).toHaveValue(current);
  await page
    .getByRole('button', { name: 'Create month from a plan', exact: true })
    .click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('New month', { exact: true }).fill('2099-11');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(ledgerMonth).toHaveValue(current);
  const income = page.locator('[data-plan-group="income"]');
  await income.getByLabel('Category', { exact: true }).fill('Salary');
  await income.getByLabel('Amount (IDR)', { exact: true }).fill('5000000');
  await income.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    income.getByRole('button', { name: 'Salary', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Add transaction', exact: true })
    .click();
  await dialog.getByLabel('Category', { exact: true }).fill('Food');
  await dialog.getByLabel('Amount (IDR)', { exact: true }).fill('25000');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const transactions = await stored(page, 'finance');
  expect(transactions.items).toHaveLength(1);
  await ledgerMonth.fill('2099-10');
  const tab = page
    .locator('.planning-tabs')
    .getByRole('button', { name: 'November 99', exact: true });
  await tab.click();
  await expect(ledgerMonth).toHaveValue('2099-10');
  await tab.dblclick();
  dialog = page.getByRole('dialog', {
    name: 'Delete monthly plan',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input, select, textarea')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  expect((await stored(page, 'planning')).items).toHaveLength(1);
  await page
    .getByRole('button', { name: 'Close November 99', exact: true })
    .click();
  await expect(tab).toHaveCount(0);
  expect((await stored(page, 'planning')).items).toHaveLength(1);
  await page
    .locator('.month-links button')
    .filter({ hasText: 'November 99' })
    .click();
  await expect(tab).toBeVisible();
  await page.reload();
  await openFinance(page);
  await expect(ledgerMonth).toHaveValue(current);
  await tab.dblclick();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(tab).toHaveCount(0);
  const plan = await stored(page, 'planning');
  expect(plan.months).toHaveLength(0);
  expect(plan.items).toHaveLength(0);
  expect(await stored(page, 'finance')).toEqual(transactions);
  await page.reload();
  await openFinance(page);
  await expect(tab).toHaveCount(0);
  expect((await stored(page, 'planning')).items).toHaveLength(0);
});
