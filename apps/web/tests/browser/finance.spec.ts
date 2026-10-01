import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
const origin = 'http://127.0.0.1:4174';
const headers = { Origin: origin, 'X-Zivizip': '1' };
const credentials = new URL('../../../../.local/owner.json', import.meta.url);
async function visit(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
}
async function add(
  page: Page,
  title: string,
  amount: string,
  type = 'expense',
  category = 'Food',
  date = '2026-10-01',
) {
  await page
    .getByRole('button', { name: 'Add transaction', exact: true })
    .click();
  await expect(page.getByLabel('Description', { exact: true })).toBeFocused();
  await page.getByLabel('Description', { exact: true }).fill(title);
  await page
    .getByRole('combobox', { name: 'Type', exact: true })
    .selectOption(type);
  await page.getByLabel('Amount (IDR)', { exact: true }).fill(amount);
  await page
    .getByRole('dialog')
    .getByLabel('Category', { exact: true })
    .fill(category);
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(row(page, title)).toBeVisible();
}
const row = (page: Page, title: string) =>
  page.getByRole('button', { name: `Edit transaction ${title}`, exact: true });
test('guest transactions filter, group, edit, delete, survive offline and round-trip through backup', async ({
  page,
  context,
  browser,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await visit(page);
  await expect(page.locator('.finance-empty')).toContainText('No transactions');
  await add(
    page,
    'Monthly income',
    '1000000',
    'income',
    'Salary',
    '2026-10-05',
  );
  await add(page, 'Lunch', '35000');
  await expect(page.locator('.transaction-name')).toHaveText([
    'Monthly income',
    'Lunch',
  ]);
  await expect(
    page.locator('[data-total="balance"]').locator('..'),
  ).toHaveAttribute('title', /965\.000/);
  await page.getByRole('button', { name: 'By category', exact: true }).click();
  await expect(page.locator('.transaction-heading')).toHaveText([
    'Salary',
    'Food',
  ]);
  await row(page, 'Lunch').click();
  await expect(page.locator('#transaction-categories option')).toHaveCount(2);
  await page.getByLabel('Amount (IDR)', { exact: true }).fill('40000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(row(page, 'Lunch')).toContainText('40.000');
  await page.getByLabel('Transaction month', { exact: true }).fill('2026-09');
  await expect(page.locator('.finance-transaction')).toHaveCount(0);
  await page.getByLabel('Transaction month', { exact: true }).fill('2026-10');
  await row(page, 'Lunch').click();
  await page
    .getByRole('button', { name: 'Delete transaction', exact: true })
    .click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    'Lunch',
  );
  await page
    .getByRole('button', { name: 'Delete transaction', exact: true })
    .click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row(page, 'Lunch')).toHaveCount(0);
  await expect(page.locator('[data-total="expense"]')).toContainText('0');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.reload();
  await add(
    page,
    'Offline groceries',
    '150000',
    'expense',
    'Groceries',
    '2026-10-03',
  );
  await page.reload();
  await expect(row(page, 'Offline groceries')).toBeVisible();
  await expect(
    page.locator('[data-total="balance"]').locator('..'),
  ).toHaveAttribute('title', /850\.000/);
  await context.setOffline(false);
  await page.screenshot({ path: '/tmp/zivizip-finance-desktop.png' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download backup', exact: true })
    .click();
  const file = (await (await download).path())!;
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(backup.version).toBe(5);
  expect(backup.transactions).toHaveLength(2);
  const targetContext = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  const target = await targetContext.newPage();
  await visit(target);
  await target.getByRole('button', { name: 'Settings', exact: true }).click();
  await target
    .locator('input[type="file"][accept=".json,application/json"]')
    .setInputFiles(file);
  await target
    .getByRole('button', { name: 'Import copies', exact: true })
    .click();
  await target
    .getByRole('button', { name: 'Close settings', exact: true })
    .click();
  await target.getByLabel('Transaction month', { exact: true }).fill('2026-10');
  await expect(row(target, 'Offline groceries')).toBeVisible();
  await targetContext.close();
});

test('mobile finance supports transaction forms and language switching without overflow', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await visit(page);
  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: 'Finance', exact: true })
    .tap();
  await add(page, 'Train ticket', '20000', 'expense', 'Transport');
  await row(page, 'Train ticket').tap();
  await page.getByLabel('Amount (IDR)', { exact: true }).fill('25000');
  await page.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(row(page, 'Train ticket')).toContainText('25.000');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: '/tmp/zivizip-finance-mobile.png' });
  await page.getByRole('button', { name: 'Open menu', exact: true }).tap();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Language / Bahasa')
    .selectOption('id');
  await page
    .getByRole('button', { name: 'Close settings', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close menu', exact: true }).tap();
  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: 'Finance', exact: true })
    .tap();
  await page
    .getByRole('button', { name: 'Tambah transaksi', exact: true })
    .tap();
  await expect(page.getByLabel('Keterangan', { exact: true })).toBeVisible();
  await context.close();
});

test('account transactions synchronize with conflict protection, offline reading and explicit guest copy', async ({
  page,
  context,
  browser,
}) => {
  test.skip(!fs.existsSync(credentials), 'Local owner is required');
  test.setTimeout(60000);
  const credential = JSON.parse(fs.readFileSync(credentials, 'utf8'));
  const stamp = Date.now(),
    label = `Finance acceptance ${stamp}`,
    guestLabel = `Guest transaction ${stamp}`;
  const secondContext = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  async function login() {
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page
      .getByLabel('Username', { exact: true })
      .fill(credential.username);
    await page
      .getByLabel('Password', { exact: true })
      .fill(credential.password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
  }
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await visit(page);
    await add(page, guestLabel, '11000');
    expect((await context.request.get('/api/finance')).status()).toBe(401);
    await login();
    await page
      .getByRole('button', { name: 'Open account workspace', exact: true })
      .click();
    expect(
      JSON.stringify(await (await context.request.get('/api/finance')).json()),
    ).not.toContain(guestLabel);
    await secondContext.addCookies(await context.cookies());
    const second = await secondContext.newPage();
    await second.goto('/');
    await expect(
      second.getByRole('button', { name: 'Add transaction', exact: true }),
    ).toBeEnabled();
    await second
      .getByLabel('Transaction month', { exact: true })
      .fill('2026-10');
    const before = await (await context.request.get('/api/finance')).json();
    expect(
      (await context.request.put('/api/finance', { data: before })).status(),
    ).toBe(403);
    await add(page, label, '25000');
    await expect(row(second, label)).toBeVisible({ timeout: 15000 });
    expect(
      (
        await context.request.put('/api/finance', { headers, data: before })
      ).status(),
    ).toBe(409);
    // A stale edit keeps its form data until the user reloads and retries.
    await row(second, label).click();
    await second.getByLabel('Amount (IDR)', { exact: true }).fill('40000');
    await row(page, label).click();
    await page.getByLabel('Amount (IDR)', { exact: true }).fill('30000');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await second.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(second.getByRole('dialog')).toContainText(
      'changed on another device',
    );
    await expect(
      second.getByLabel('Amount (IDR)', { exact: true }),
    ).toHaveValue('40000');
    await second
      .getByRole('button', { name: 'Reload list', exact: true })
      .click();
    await expect(second.getByRole('alert')).toHaveCount(0);
    await second.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(row(page, label)).toContainText('40.000');
    await second.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await secondContext.setOffline(true);
    await second.reload();
    await expect(row(second, label)).toContainText('40.000');
    await expect(
      second.getByRole('button', { name: 'Add transaction', exact: true }),
    ).toBeDisabled();
    await secondContext.setOffline(false);
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(row(page, guestLabel)).toBeVisible();
    await expect(row(page, label)).toHaveCount(0);
    await login();
    await page
      .getByRole('button', {
        name: 'Copy local workspace to account',
        exact: true,
      })
      .click();
    await expect(row(page, guestLabel)).toBeVisible();
    const copied = await (await context.request.get('/api/finance')).json();
    expect(
      copied.items.filter((item: any) => item.title === guestLabel),
    ).toHaveLength(1);
  } finally {
    const loginResponse = await context.request.post('/api/session', {
      headers,
      data: credential,
    });
    expect(loginResponse.ok()).toBeTruthy();
    const current = await (await context.request.get('/api/finance')).json();
    const cleanup = await context.request.put('/api/finance', {
      headers,
      data: {
        ...current,
        items: current.items.filter(
          (item: any) => item.title !== label && item.title !== guestLabel,
        ),
      },
    });
    expect(cleanup.ok()).toBeTruthy();
    await secondContext.close();
  }
});
