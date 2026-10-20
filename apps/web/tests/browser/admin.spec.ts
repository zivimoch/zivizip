import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const headers = { Origin: 'http://127.0.0.1:4174', 'X-Zivizip': '1' };
test('admin protects records, retains visitor preferences and revokes other sessions', async ({
  page,
  context,
  browser,
}) => {
  const path = new URL('../../../../.local/owner.json', import.meta.url);
  test.skip(!fs.existsSync(path), 'Local owner required');
  expect((await context.request.get('/api/admin')).status()).toBe(401);
  expect(
    (await context.request.delete('/api/admin/sessions', { headers })).status(),
  ).toBe(401);
  await page.goto('/admin/');
  await expect(
    page.getByRole('heading', { name: 'Owner access' }),
  ).toBeVisible();
  await page.goto('/');
  await page
    .getByRole('dialog')
    .getByLabel('Name (optional)', { exact: true })
    .fill('Browser test visitor');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Continue as guest', exact: true }),
  ).toHaveCount(0);
  const owner = await browser.newContext();
  const other = await browser.newContext();
  const credentials = JSON.parse(fs.readFileSync(path, 'utf8'));
  let record = '';
  try {
    for (const c of [owner, other])
      expect(
        (
          await c.request.post('/api/session', { headers, data: credentials })
        ).ok(),
      ).toBe(true);
    const admin = await owner.newPage();
    await admin.goto('/admin/');
    await expect(
      admin.getByRole('heading', { name: 'Account', exact: true }),
    ).toBeVisible();
    await expect(
      admin.getByRole('cell', { name: /Browser test visitor/ }),
    ).toBeVisible();
    const overview = await (await owner.request.get('/api/admin')).json();
    record = overview.visitors.find(
      (v: any) => v.name === 'Browser test visitor',
    ).id;
    expect(overview.visitors.find((v: any) => v.id === record).visits).toBe(1);
    expect(JSON.stringify(overview)).not.toContain('token');
    expect((await owner.request.delete('/api/admin/sessions')).status()).toBe(
      403,
    );
    await admin
      .getByRole('button', { name: 'Sign out other sessions' })
      .click();
    await admin.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect
      .poll(async () => (await other.request.get('/api/admin')).status())
      .toBe(401);
    expect((await owner.request.get('/api/admin')).ok()).toBe(true);
    await admin.setViewportSize({ width: 390, height: 844 });
    await expect(admin.locator('header')).toBeInViewport();
    await admin.screenshot({
      path: '/tmp/zivizip-admin-mobile.png',
      fullPage: true,
    });
    await page.locator('.sidebar').hover();
    await expect(page.locator('.sidebar')).toHaveCSS('width', '240px');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
      page.getByRole('dialog').getByLabel('Name (optional)', { exact: true }),
    ).toHaveValue('Browser test visitor');
    await page
      .getByRole('dialog')
      .getByLabel('Share basic visit statistics', { exact: true })
      .uncheck();
    await page
      .getByRole('button', { name: 'Save visitor preferences' })
      .click();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Visitor preferences saved.' }),
    ).toBeVisible();
    const after = await (await owner.request.get('/api/admin')).json();
    expect(after.visitors.find((v: any) => v.id === record)).toBeUndefined();
  } finally {
    if (record)
      await owner.request.delete(`/api/admin/visitors/${record}`, { headers });
    await owner.request.delete('/api/session', { headers });
    await other.close();
    await owner.close();
  }
});

test('detail headers stay compact and note filters share a row', async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const welcome = page.getByRole('button', {
      name: 'Continue as guest',
      exact: true,
    });
    if (width === 1440) {
      await expect(welcome).toBeVisible();
      await page
        .getByRole('dialog')
        .getByLabel('Share basic visit statistics')
        .uncheck();
      await welcome.click();
    }
    if (width < 800)
      await page
        .getByRole('button', { name: 'Open menu', exact: true })
        .click();
    const detail = page.getByRole('button', { name: 'Detail', exact: true });
    if ((await detail.getAttribute('aria-expanded')) !== 'true')
      await detail.click();
    await page
      .locator('.sidebar .detail')
      .getByRole('button', { name: 'Notes', exact: true })
      .click();
    await expect(page.locator('.note-library h1')).toHaveText('Note.');
    if (width > 800) {
      await page.mouse.move(width - 10, 400);
      await expect(page.locator('.sidebar')).toHaveCSS('width', '72px');
    }
    const search = await page
      .getByRole('searchbox', { name: 'Search notes' })
      .boundingBox();
    const sort = await page
      .getByRole('combobox', { name: 'Sort by', exact: true })
      .boundingBox();
    expect(Math.abs(search!.y - sort!.y)).toBeLessThan(3);
    await page.screenshot({
      path: `/tmp/zivizip-note-header-${width}.png`,
      fullPage: true,
    });
  }
});
