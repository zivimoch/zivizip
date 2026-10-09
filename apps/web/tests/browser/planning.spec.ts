import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
const headers = { Origin: 'http://127.0.0.1:4174', 'X-Zivizip': '1' };
const credentials = new URL('../../../../.local/owner.json', import.meta.url);
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
async function addBudget(
  page: Page,
  group: string,
  category: string,
  amount: string,
) {
  await card(page, group)
    .getByLabel('Category', { exact: true })
    .fill(category);
  await card(page, group)
    .getByLabel('Amount (IDR)', { exact: true })
    .fill(amount);
  await card(page, group)
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(row(page, category)).toBeVisible();
}
async function addTransaction(page: Page, category: string, amount: string) {
  await page
    .getByRole('button', { name: 'Add transaction', exact: true })
    .click();
  await dialog(page)
    .getByLabel('Description', { exact: true })
    .fill(`${category} purchase`);
  await dialog(page).getByLabel('Category', { exact: true }).fill(category);
  await dialog(page).getByLabel('Amount (IDR)', { exact: true }).fill(amount);
  await dialog(page).getByLabel('Date', { exact: true }).fill('2026-10-02');
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
}
test('monthly planning matches transactions, supports row controls and copies only expected budgets', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await visit(page);
  await expect(page.locator('.month-links button')).toHaveCount(0);
  await createMonth(page, '2026-10');
  await addBudget(page, 'income', 'Salary', '8000000');
  await page.getByLabel('Transaction month', { exact: true }).fill('2026-09');
  await page
    .locator('.planning-tabs')
    .getByRole('button', { name: 'October 26', exact: true })
    .click();
  await expect(
    page.getByLabel('Transaction month', { exact: true }),
  ).toHaveValue('2026-10');
  await addBudget(page, 'recurring', 'Food', '1500000');
  await addBudget(page, 'recurring', 'Rent', '1000000');
  await addBudget(page, 'recurring', 'Transport', '300000');
  await addBudget(page, 'monthly', 'Books', '200000');
  const heights = await page
    .locator('.plan-group')
    .evaluateAll((cards) =>
      cards.map((card) => card.getBoundingClientRect().height),
    );
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
  await page.screenshot({
    path: '/tmp/zivizip-finance-compact.png',
    fullPage: true,
  });
  await expect(page.locator('[data-plan-summary="planned"]')).toContainText(
    '5.000.000',
  );
  await addTransaction(page, 'food', '300000');
  await expect(card(page, 'recurring').locator('.budget-meter')).toContainText(
    '89% remaining',
  );
  await addTransaction(page, 'Health', '75000');
  await expect(row(page, 'Health').locator('.plan-actual')).toHaveClass(
    /deficit/,
  );
  await expect(card(page, 'monthly').locator('.plan-realized')).toHaveText(
    '1 of 2 items realized',
  );
  await row(page, 'Food')
    .getByRole('button', { name: 'Note', exact: true })
    .click();
  await dialog(page)
    .getByLabel('Note', { exact: true })
    .fill('Weekly groceries');
  await dialog(page).getByLabel('Note', { exact: true }).press('Enter');
  await expect(row(page, 'Food')).toContainText('Weekly groceries');
  await row(page, 'Food')
    .getByRole('button', { name: 'Exclude Food', exact: true })
    .click();
  await expect(page.locator('[data-plan-summary="planned"]')).toContainText(
    '6.500.000',
  );
  await expect(page.locator('[data-plan-summary="current"]')).toContainText(
    '375.000',
  );
  await row(page, 'Food')
    .getByRole('button', { name: 'Include Food', exact: true })
    .click();
  await row(page, 'Food')
    .getByRole('button', { name: 'Food', exact: true })
    .click();
  await expect(dialog(page)).toContainText('food purchase');
  await dialog(page)
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await row(page, 'Books')
    .locator('td')
    .first()
    .dblclick({ position: { x: 110, y: 20 } });
  await expect(dialog(page).getByRole('heading')).toHaveText('Edit budget');
  await dialog(page).getByLabel('Amount (IDR)', { exact: true }).fill('250000');
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(row(page, 'Books')).toContainText('250.000');
  // Shift-selected rows travel together, preserving order within the card.
  await row(page, 'Food')
    .locator('td')
    .first()
    .click({ position: { x: 110, y: 20 } });
  await row(page, 'Rent')
    .locator('td')
    .first()
    .click({ modifiers: ['Shift'], position: { x: 110, y: 20 } });
  const from = (await row(page, 'Food').boundingBox())!,
    to = (await row(page, 'Transport').boundingBox())!;
  await page.mouse.move(from.x + 110, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(to.x + 110, to.y + to.height - 8, { steps: 12 });
  await page.mouse.up();
  await expect(card(page, 'recurring').locator('.plan-category')).toHaveText([
    'Transport',
    'Food',
    'Rent',
  ]);
  await page.getByRole('heading', { name: 'October 26', exact: true }).click();
  await expect(page.locator('[data-plan-row].selected')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/zivizip-planning-desktop.png' });
  await createMonth(page, '2026-11', '2026-10');
  await expect(row(page, 'Food')).toContainText('1.500.000');
  await expect(
    row(page, 'Books').locator('td').last().locator('strong'),
  ).toHaveText(/Rp\s*0/);
  await expect(row(page, 'Health')).toHaveCount(0);
  await expect(page.locator('[data-plan-summary="current"]')).toHaveText(
    /Rp\s*0/,
  );
  await page
    .getByRole('button', { name: 'Close November 26', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Analysis', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page
    .locator('.month-links')
    .getByRole('button', { name: 'November 26', exact: true })
    .click();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.reload();
  await detail(page);
  // Last open month is restored; the Analysis tab is permanent.
  await expect(row(page, 'Food')).toBeVisible();
  await addBudget(page, 'monthly', 'Offline plan', '15000');
  await context.setOffline(false);
  await page.locator('.sidebar').hover();
  await page.locator('.sidebar').hover();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download backup', exact: true })
    .click();
  const path = (await (await pending).path())!,
    backup = JSON.parse(fs.readFileSync(path, 'utf8'));
  expect(backup.version).toBe(6);
  expect(backup.planning.months).toHaveLength(2);
  const otherContext = await browser.newContext(),
    other = await otherContext.newPage();
  await visit(other);
  await other.locator('.sidebar').hover();
  await other.locator('.sidebar').hover();
  await other.getByRole('button', { name: 'Settings', exact: true }).click();
  await other
    .locator('input[type="file"][accept=".json,application/json"]')
    .setInputFiles(path);
  await other
    .getByRole('button', { name: 'Import copies', exact: true })
    .click();
  await other
    .getByRole('button', { name: 'Close settings', exact: true })
    .click();
  await other.mouse.move(700, 300);
  await other
    .locator('.month-links')
    .getByRole('button', { name: 'November 26', exact: true })
    .click();
  await expect(row(other, 'Offline plan')).toBeVisible();
  await otherContext.close();
});

test('planning cards work on a narrow touch viewport with inline forms and category notes', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .tap();
  await page.getByRole('button', { name: 'Open menu', exact: true }).tap();
  await detail(page);
  await createMonth(page, '2026-10');
  await addBudget(page, 'income', 'Salary', '8000000');
  await addBudget(page, 'recurring', 'Food', '1000000');
  await addBudget(page, 'monthly', 'Books', '200000');
  await row(page, 'Books')
    .getByRole('button', { name: 'Note', exact: true })
    .tap();
  await dialog(page).getByLabel('Note', { exact: true }).fill('Reading list');
  await dialog(page).getByLabel('Note', { exact: true }).press('Enter');
  await expect(row(page, 'Books')).toContainText('Reading list');
  await row(page, 'Books')
    .getByRole('button', { name: 'Exclude Books', exact: true })
    .tap();
  await expect(row(page, 'Books')).toHaveClass(/excluded/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator('.plan-columns')
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: '/tmp/zivizip-planning-mobile.png' });
  await context.close();
});

test('account plans synchronize, retain conflicting form edits and remain read-only offline', async ({
  page,
  context,
  browser,
}) => {
  test.skip(!fs.existsSync(credentials), 'Local owner is required');
  test.setTimeout(60000);
  const credential = JSON.parse(fs.readFileSync(credentials, 'utf8')),
    label = `Plan acceptance ${Date.now()}`,
    month = '2089-12';
  const secondContext = await browser.newContext();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  expect((await context.request.get('/api/finance/plans')).status()).toBe(401);
  await detail(page);
  await createMonth(page, month);
  await addBudget(page, 'recurring', label, '500000');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(credential.username);
  await page.getByLabel('Password', { exact: true }).fill(credential.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  try {
    await expect(
      page.getByRole('button', {
        name: 'Copy local workspace to account',
        exact: true,
      }),
    ).toBeVisible();
    const isolated = await (
      await context.request.get('/api/finance/plans')
    ).json();
    expect(isolated.items.some((item: any) => item.category === label)).toBe(
      false,
    );
    await page
      .getByRole('button', {
        name: 'Copy local workspace to account',
        exact: true,
      })
      .click();
    await page.mouse.move(700, 300);
    await page
      .locator('.month-links')
      .getByRole('button', { name: 'December 89', exact: true })
      .click();
    await expect(row(page, label)).toBeVisible();
    const before = await (
      await context.request.get('/api/finance/plans')
    ).json();
    expect(
      (
        await context.request.put('/api/finance/plans', { data: before })
      ).status(),
    ).toBe(403);
    await secondContext.addCookies(await context.cookies());
    const second = await secondContext.newPage();
    await second.goto('/');
    await detail(second);
    await second
      .locator('.month-links')
      .getByRole('button', { name: 'December 89', exact: true })
      .click();
    await expect(row(second, label)).toBeVisible();
    await row(second, label).focus();
    await row(second, label).press('Enter');
    await dialog(second)
      .getByLabel('Amount (IDR)', { exact: true })
      .fill('700000');
    await row(page, label).focus();
    await row(page, label).press('Enter');
    await dialog(page)
      .getByLabel('Amount (IDR)', { exact: true })
      .fill('600000');
    await dialog(page)
      .getByRole('button', { name: 'Save', exact: true })
      .click();
    await dialog(second)
      .getByRole('button', { name: 'Save', exact: true })
      .click();
    await expect(dialog(second)).toContainText('changed on another device');
    await expect(
      dialog(second).getByLabel('Amount (IDR)', { exact: true }),
    ).toHaveValue(/700\.000/);
    await dialog(second)
      .getByRole('button', { name: 'Reload plans', exact: true })
      .click();
    await expect(dialog(second).getByRole('alert')).toHaveCount(0);
    await dialog(second)
      .getByRole('button', { name: 'Save', exact: true })
      .click();
    await expect(row(page, label)).toContainText('700.000', { timeout: 15000 });
    expect(
      (
        await context.request.put('/api/finance/plans', {
          headers,
          data: before,
        })
      ).status(),
    ).toBe(409);
    await second.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await secondContext.setOffline(true);
    await second.reload();
    await second.getByRole('button', { name: 'Detail', exact: true }).click();
    await second
      .locator('.sidebar .detail')
      .getByRole('button', { name: 'Finance', exact: true })
      .click();
    await expect(row(second, label)).toContainText('700.000');
    await expect(
      row(second, label).getByRole('button', {
        name: `Exclude ${label}`,
        exact: true,
      }),
    ).toBeDisabled();
  } finally {
    const latest = await (
      await context.request.get('/api/finance/plans')
    ).json();
    const items = latest.items.filter((item: any) => item.category !== label);
    const months = latest.months.filter(
      (entry: any) =>
        entry.month !== month ||
        items.some((item: any) => item.month === month),
    );
    expect(
      (
        await context.request.put('/api/finance/plans', {
          headers,
          data: { ...latest, items, months },
        })
      ).ok(),
    ).toBeTruthy();
    await secondContext.close();
  }
});
