import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
async function goals(page: Page) {
  if (
    await page
      .getByRole('button', { name: 'Open menu', exact: true })
      .isVisible()
  )
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Goals', exact: true })
    .click();
  await expect(page.locator('.goals-page')).toBeVisible();
  await page.mouse.move(700, 300);
}
async function create(page: Page, title: string) {
  await page.getByRole('button', { name: 'New goal', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page
    .getByLabel('Description', { exact: true })
    .fill('Make time to explore');
  await page.getByRole('button', { name: 'lake', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
const task = {
  id: 'done-task',
  title: 'Book the journey',
  done: true,
  archived: true,
  date: '',
  amount: 0,
  createdAt: 1,
};
const expense = {
  id: 'train',
  title: 'Train tickets',
  category: 'Travel',
  type: 'expense',
  date: '2026-10-01',
  amount: 250000,
  createdAt: 1,
};
test('goals support drag assignment, mobile selection, persistence and return items on deletion', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page.evaluate(
    async ({ task, expense }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('zivizip-guest-v1');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('meta', 'readwrite');
          tx.objectStore('meta').put({
            key: 'tasks',
            value: {
              revision: 1,
              items: [
                task,
                { ...task, id: 'pending', title: 'Not finished', done: false },
              ],
            },
          });
          tx.objectStore('meta').put({
            key: 'finance',
            value: {
              revision: 1,
              items: [
                expense,
                { ...expense, id: 'salary', type: 'income', title: 'Salary' },
              ],
            },
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { task, expense },
  );
  await goals(page);
  await create(page, 'Explore more');
  await create(page, 'A new chapter');
  await expect(page.locator('.source-card')).toHaveCount(2);
  const card = page.getByRole('region', { name: 'Explore more', exact: true });
  await page.getByRole('group', { name: task.title, exact: true }).dragTo(card);
  await expect(page.locator('.source-card')).toHaveCount(1);
  await expect(card.locator('.totals strong').first()).toHaveText('1');
  await page.screenshot({
    path: '/tmp/zivizip-goals-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Move to goal', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Choose goal', exact: true })
    .selectOption({ label: 'Explore more' });
  await expect(page.locator('.source-card')).toHaveCount(0);
  await expect(card.locator('.totals strong').last()).toContainText('250');
  await page.reload();
  await goals(page);
  await expect(card.locator('.totals strong').first()).toHaveText('1');
  await expect(page.locator('.cover img').first()).toHaveJSProperty(
    'naturalWidth',
    640,
  );
  await page.screenshot({
    path: '/tmp/zivizip-goals-mobile.png',
    fullPage: true,
  });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page
    .getByRole('button', { name: 'Edit goal: Explore more', exact: true })
    .click();
  await page.getByLabel('Title', { exact: true }).fill('Explore the world');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Explore the world', exact: true }),
  ).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Edit goal: Explore the world', exact: true })
    .click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.source-card')).toHaveCount(2);
});
test('account goals use authenticated revision checks and reject anonymous access', async ({
  request,
}) => {
  const anonymous = await request.get('/api/goals');
  expect(anonymous.status()).toBe(401);
  const owner = JSON.parse(
    fs.readFileSync(
      new URL('../../../../.local/owner.json', import.meta.url),
      'utf8',
    ),
  );
  const headers = { Origin: 'http://127.0.0.1:4174', 'X-Zivizip': '1' };
  expect(
    (await request.post('/api/session', { headers, data: owner })).ok(),
  ).toBeTruthy();
  const initial = await (await request.get('/api/goals')).json();
  const id = crypto.randomUUID();
  let saved: any;
  try {
    const response = await request.put('/api/goals', {
      headers,
      data: {
        ...initial,
        items: [
          ...initial.items,
          {
            id,
            title: 'Test goal',
            description: '',
            cover: 'forest',
            tasks: [],
            expenses: [],
          },
        ],
      },
    });
    expect(response.ok()).toBeTruthy();
    saved = await response.json();
    expect(saved.revision).toBe(initial.revision + 1);
    expect(
      (await request.put('/api/goals', { headers, data: initial })).status(),
    ).toBe(409);
  } finally {
    if (saved)
      expect(
        (
          await request.put('/api/goals', {
            headers,
            data: {
              ...saved,
              items: saved.items.filter((g: any) => g.id !== id),
            },
          })
        ).ok(),
      ).toBeTruthy();
  }
});
test('account goals synchronize between sessions and become read-only offline', async ({
  page,
  context,
  browser,
}) => {
  const owner = JSON.parse(
    fs.readFileSync(
      new URL('../../../../.local/owner.json', import.meta.url),
      'utf8',
    ),
  );
  const headers = { Origin: 'http://127.0.0.1:4174', 'X-Zivizip': '1' };
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4174' });
  const label = 'Goal sync ' + Date.now();
  try {
    for (const ctx of [context, other])
      expect(
        (await ctx.request.post('/api/session', { headers, data: owner })).ok(),
      ).toBeTruthy();
    await page.goto('/');
    await goals(page);
    const second = await other.newPage();
    await second.goto('/');
    await goals(second);
    await create(page, label);
    await expect(
      second.getByRole('heading', { name: label, exact: true }),
    ).toBeVisible();
    await second.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await other.setOffline(true);
    await expect(
      second.getByRole('button', { name: 'New goal', exact: true }),
    ).toBeDisabled();
    await expect(
      second.getByRole('button', { name: 'Edit goal: ' + label, exact: true }),
    ).toBeDisabled();
    await other.setOffline(false);
  } finally {
    const state = await (await context.request.get('/api/goals')).json();
    await context.request.put('/api/goals', {
      headers,
      data: {
        ...state,
        items: state.items.filter((g: any) => g.title !== label),
      },
    });
    await other.close();
  }
});
test('guest-only goals require explicit copying into the account', async ({
  page,
  context,
}) => {
  const owner = JSON.parse(
    fs.readFileSync(
      new URL('../../../../.local/owner.json', import.meta.url),
      'utf8',
    ),
  );
  const label = 'Local goal ' + Date.now();
  const headers = { Origin: 'http://127.0.0.1:4174', 'X-Zivizip': '1' };
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await goals(page);
  await create(page, label);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(owner.username);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  try {
    await expect(
      page.getByRole('button', {
        name: 'Copy local workspace to account',
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (await (await context.request.get('/api/goals')).json()).items.some(
        (g: any) => g.title === label,
      ),
    ).toBe(false);
    await page
      .getByRole('button', {
        name: 'Copy local workspace to account',
        exact: true,
      })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: label, exact: true }),
    ).toBeVisible();
    expect(
      (await (await context.request.get('/api/goals')).json()).items.some(
        (g: any) => g.title === label,
      ),
    ).toBe(true);
  } finally {
    const state = await (await context.request.get('/api/goals')).json();
    await context.request.put('/api/goals', {
      headers,
      data: {
        ...state,
        items: state.items.filter((g: any) => g.title !== label),
      },
    });
  }
});
