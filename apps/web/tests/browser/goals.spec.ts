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
async function create(page: Page, title: string, theme?: string) {
  await page.getByRole('button', { name: 'New goal', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page
    .getByLabel('Description', { exact: true })
    .fill('Make time to explore');
  if (theme)
    await page.getByRole('radio', { name: theme, exact: true }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
const task = {
  id: 'done-task',
  title:
    'Book the journey and prepare everything for a long adventure with the whole family',
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
test('goals support drag assignment, shared links, persistence and return items on deletion', async ({
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
  await expect(page.locator('.pool-strip .goal-item')).toHaveCount(2);
  expect(
    await page
      .locator('.pool-strip .goal-item strong')
      .first()
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(true);
  const card = page.getByRole('region', { name: 'Explore more', exact: true });
  await page
    .getByRole('button', { name: task.title, exact: true })
    .dragTo(card.locator('.drop-label'));
  await expect(page.locator('.pool-strip .goal-item')).toHaveCount(1);
  await expect(card.locator('.totals strong').first()).toHaveText('1');
  await page.screenshot({
    path: '/tmp/zivizip-goals-desktop.png',
    fullPage: true,
  });
  const other = page.getByRole('region', {
    name: 'A new chapter',
    exact: true,
  });
  await card
    .getByRole('button', { name: task.title, exact: true })
    .dragTo(other.locator('.drop-label'));
  await expect(other.locator('.totals strong').first()).toHaveText('1');
  await card
    .getByRole('button', { name: task.title, exact: true })
    .dragTo(other.locator('.drop-label'));
  await expect(other.locator('.totals strong').first()).toHaveText('1');
  await card
    .getByRole('button', { name: task.title, exact: true })
    .dragTo(page.locator('.unassigned > header'));
  await expect(card.locator('.totals strong').first()).toHaveText('0');
  await expect(page.locator('.pool-strip .goal-item')).toHaveCount(1);
  await other
    .getByRole('button', { name: task.title, exact: true })
    .dragTo(page.locator('.unassigned > header'));
  await expect(page.locator('.pool-strip .goal-item')).toHaveCount(2);
  await page
    .locator('.pool-strip')
    .getByRole('button', { name: task.title, exact: true })
    .dragTo(card.locator('.drop-label'));
  await page
    .getByRole('button', { name: expense.title, exact: true })
    .dragTo(card.locator('.drop-label'));
  await expect(page.locator('.pool-strip .goal-item')).toHaveCount(0);
  await expect(card.locator('.goal-item').first()).toContainText(expense.title);
  await expect(card.locator('[data-growth]')).toHaveAttribute(
    'data-growth',
    '2',
  );
  await expect(
    page.getByRole('button', { name: 'Move to goal', exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await goals(page);
  await expect(card.locator('.totals strong').first()).toHaveText('1');
  await expect(card.locator('.totals strong').last()).toContainText('250');
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
  await page
    .getByRole('button', { name: 'Edit goal: Explore the world', exact: true })
    .click();
  page.once('dialog', async (d) => {
    expect(d.message()).toContain(
      'Tasks and financial transactions will be kept',
    );
    await d.dismiss();
  });
  await page.getByRole('button', { name: 'Delete goal', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete goal', exact: true }).click();
  await expect(page.locator('.pool-strip .goal-item')).toHaveCount(2);
  const preserved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('zivizip-guest-v1');
      request.onsuccess = () => resolve(request.result);
    });
    const read = (key: string) =>
      new Promise<any>((resolve) => {
        const request = db.transaction('meta').objectStore('meta').get(key);
        request.onsuccess = () => resolve(request.result.value);
      });
    const result = await Promise.all([read('tasks'), read('finance')]);
    db.close();
    return result;
  });
  expect(preserved).toEqual([
    {
      revision: 1,
      items: [
        task,
        { ...task, id: 'pending', title: 'Not finished', done: false },
      ],
    },
    {
      revision: 1,
      items: [
        expense,
        { ...expense, id: 'salary', type: 'income', title: 'Salary' },
      ],
    },
  ]);
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
  const hiddenKey = 'task:sync-' + Date.now();
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
    await page
      .getByRole('region', { name: label, exact: true })
      .getByRole('checkbox', { name: 'Completed', exact: true })
      .click();
    await expect(
      second
        .getByRole('region', { name: label, exact: true })
        .getByRole('checkbox', { name: 'Completed', exact: true }),
    ).toBeChecked();
    const current = await (await context.request.get('/api/goals')).json();
    expect(
      (
        await context.request.put('/api/goals', {
          headers,
          data: {
            ...current,
            setAside: [...(current.setAside || []), hiddenKey],
          },
        })
      ).ok(),
    ).toBeTruthy();
    await expect
      .poll(() =>
        second.evaluate(async (key) => {
          return new Promise<boolean>((resolve) => {
            const databases = indexedDB.databases();
            databases.then((all) => {
              const req = indexedDB.open(
                all.find((db) => db.name?.startsWith('zivizip-account-'))!
                  .name!,
              );
              req.onsuccess = () => {
                const db = req.result,
                  get = db.transaction('meta').objectStore('meta').get('goals');
                get.onsuccess = () => {
                  resolve(get.result?.value.setAside?.includes(key) || false);
                  db.close();
                };
              };
            });
          });
        }, hiddenKey),
      )
      .toBe(true);
    await second.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await other.setOffline(true);
    await expect(
      second.getByRole('button', { name: 'New goal', exact: true }),
    ).toBeDisabled();
    await expect(
      second.getByRole('button', { name: 'Edit goal: ' + label, exact: true }),
    ).toBeDisabled();
    await expect(
      second
        .getByRole('region', { name: label, exact: true })
        .getByRole('checkbox', { name: 'Completed', exact: true }),
    ).toBeDisabled();
    await other.setOffline(false);
  } finally {
    const state = await (await context.request.get('/api/goals')).json();
    await context.request.put('/api/goals', {
      headers,
      data: {
        ...state,
        items: state.items.filter((g: any) => g.title !== label),
        setAside: (state.setAside || []).filter(
          (key: string) => key !== hiddenKey,
        ),
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
for (const height of [667, 844])
  test(`mobile hold drag assigns, cancels and returns contributions at ${height}px`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      await page.goto('http://127.0.0.1:4174/');
      await page
        .getByRole('button', { name: 'Continue as guest', exact: true })
        .click();
      await page.evaluate(async (task) => {
        await new Promise<void>((resolve) => {
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
                  { ...task, id: 'second', title: 'Second task' },
                  { ...task, id: 'third', title: 'Third task' },
                ],
              },
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
          };
        });
      }, task);
      await goals(page);
      await create(page, 'Touch garden');
      const card = page.getByRole('region', {
        name: 'Touch garden',
        exact: true,
      });
      const client = await context.newCDPSession(page);
      const poolStrip = page.locator('.pool-strip');
      await poolStrip.scrollIntoViewIfNeeded();
      const body = (await poolStrip
        .locator('.goal-item')
        .first()
        .boundingBox())!;
      const swipeY = body.y + body.height / 2;
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: body.x + 130, y: swipeY }],
      });
      for (let step = 1; step <= 10; step++)
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: body.x + 130 - step * 10, y: swipeY }],
        });
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await expect
        .poll(() => poolStrip.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
      await expect(page.locator('.drag-ghost')).toHaveCount(0);
      await poolStrip.evaluate((el) => {
        el.scrollLeft = 0;
      });
      await card.scrollIntoViewIfNeeded();
      expect((await card.boundingBox())!.height).toBeLessThanOrEqual(400);
      const cardBounds = (await card.boundingBox())!;
      expect(cardBounds.y + cardBounds.height).toBeLessThan(height - 50);
      await page
        .getByRole('button', { name: 'Edit goal: Touch garden', exact: true })
        .click();
      const deleteButton = page.getByRole('button', {
        name: 'Delete goal',
        exact: true,
      });
      await deleteButton.scrollIntoViewIfNeeded();
      const deleteBounds = (await deleteButton.boundingBox())!;
      expect(deleteBounds.y + deleteBounds.height).toBeLessThanOrEqual(height);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      async function touchDrag(source: any, target: any, cancel = false) {
        await source.scrollIntoViewIfNeeded();
        const from = await source.boundingBox();
        const dropSurface = (await target.getAttribute('class'))?.includes(
          'goal-card',
        )
          ? target.locator('.drop-label')
          : target.locator('header');
        const to = await dropSurface.boundingBox();
        const point = {
          x: from.x + from.width / 2,
          y: from.y + from.height / 2,
        };
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [point],
        });
        await expect(page.locator('.drag-ghost')).toBeVisible();
        for (let step = 1; step <= 12; step++) {
          await client.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
              {
                x: point.x + ((to.x + 80 - point.x) * step) / 12,
                y:
                  point.y +
                  ((to.y + Math.min(to.height / 2, 25) - point.y) * step) / 12,
              },
            ],
          });
        }
        await client.send('Input.dispatchTouchEvent', {
          type: cancel ? 'touchCancel' : 'touchEnd',
          touchPoints: [],
        });
      }
      await touchDrag(
        page.locator('.pool-strip .goal-item').first(),
        card,
        true,
      );
      await expect(page.locator('.drag-ghost')).toHaveCount(0);
      await expect(page.locator('.pool-strip .goal-item')).toHaveCount(3);
      await touchDrag(page.locator('.pool-strip .goal-item').first(), card);
      await expect(card.locator('.linked-items .goal-item')).toHaveCount(1);
      await touchDrag(card.locator('.goal-item'), page.locator('.unassigned'));
      await expect(page.locator('.pool-strip .goal-item')).toHaveCount(3);
      await expect(card.locator('.totals strong').first()).toHaveText('0');
      await page.screenshot({ path: `/tmp/zivizip-goals-touch-${height}.png` });
    } finally {
      await context.close();
    }
  });
test('growth reflects contributions and keeps long contribution lists bounded', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('zivizip-guest-v1');
      req.onsuccess = () => {
        const db = req.result,
          tx = db.transaction('meta', 'readwrite');
        const tasks = Array.from({ length: 240 }, (_, i) => ({
          id: 'milestone-' + i,
          title: 'Milestone ' + (i + 1),
          done: true,
          archived: false,
          date: '',
          amount: 0,
          createdAt: 1,
        }));
        const goal = (id: string, title: string, n: number) => ({
          id,
          title,
          description: 'Small steps, lasting progress.',
          cover: '',
          tasks: tasks.slice(0, n).map((t) => t.id),
          expenses: [],
        });
        tx.objectStore('meta').put({
          key: 'tasks',
          value: { revision: 1, items: tasks },
        });
        tx.objectStore('meta').put({
          key: 'goals',
          value: {
            revision: 1,
            items: [
              goal('seed', 'A fresh start', 0),
              goal('growing', 'Explore more', 5),
              goal('blooming', 'A healthy routine', 240),
            ],
          },
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await goals(page);
  await expect(page.locator('[data-growth]')).toHaveCount(3);
  await expect(page.locator('[data-growth]').nth(0)).toHaveAttribute(
    'data-growth',
    '0',
  );
  await expect(page.locator('[data-growth]').nth(1)).toHaveAttribute(
    'data-growth',
    '5',
  );
  await expect(page.locator('[data-growth]').nth(2)).toHaveAttribute(
    'data-growth',
    '240',
  );
  expect(
    await page
      .locator('.linked-items')
      .last()
      .evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  await expect(page.locator('.construction').last()).toHaveCSS('opacity', '1');
  const card = page.locator('.goal-card').last();
  const before = await card.locator('svg[role=img]').innerHTML();
  await card.getByRole('checkbox', { name: 'Completed', exact: true }).click();
  await expect(
    card.getByRole('checkbox', { name: 'Completed', exact: true }),
  ).toBeChecked();
  await expect(card.locator('[data-completed]')).toHaveAttribute(
    'data-completed',
    'true',
  );
  await expect(card.locator('.landmark')).toHaveCount(1);
  await card.getByRole('button', { name: 'Explore', exact: true }).click();
  await page
    .getByRole('button', { name: 'Previous region', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Goal world' })).toContainText(
    'Region 1',
  );
  await page.getByRole('button', { name: 'Next region', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Goal world' })).toContainText(
    'Region 2',
  );
  await page
    .getByRole('button', { name: 'Active island', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Overview', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'Goal world' }),
  ).not.toBeVisible();
  await page.reload();
  await goals(page);
  await expect(card.locator('[data-completed]')).toHaveAttribute(
    'data-completed',
    'true',
  );
  await card.getByRole('checkbox', { name: 'Completed', exact: true }).click();
  await expect(
    card.getByRole('checkbox', { name: 'Completed', exact: true }),
  ).not.toBeChecked();
  await expect(card.locator('.landmark')).toHaveCount(0);
  expect(await card.locator('svg[role=img]').innerHTML()).toBe(before);
  await page.screenshot({
    path: '/tmp/zivizip-goal-garden.png',
    fullPage: true,
  });
});

test('world themes persist, limit detail and stop rendering offscreen cards', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await goals(page);
  for (const theme of ['Island', 'Garden', 'Space'])
    await create(page, theme + ' world', theme);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('zivizip-guest-v1');
      req.onsuccess = () => {
        const db = req.result,
          tx = db.transaction('meta', 'readwrite'),
          meta = tx.objectStore('meta');
        const tasks = Array.from({ length: 256 }, (_, i) => ({
          id: 'world-task-' + i,
          title: 'Contribution ' + i,
          done: true,
          archived: false,
          date: '',
          amount: 0,
          createdAt: 1,
        }));
        meta.put({ key: 'tasks', value: { revision: 1, items: tasks } });
        const get = meta.get('goals');
        get.onsuccess = () => {
          const state = get.result.value;
          for (const goal of state.items) {
            goal.tasks = tasks.map((t) => t.id);
            goal.description =
              'A meaningful goal with a long description that must fit on a single line instead of pushing contributions down the page.';
          }
          meta.put({ key: 'goals', value: state });
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  await goals(page);
  for (const theme of ['island', 'garden', 'space']) {
    const card = page.locator('.goal-card').filter({
      has: page.getByRole('heading', {
        name: theme[0].toUpperCase() + theme.slice(1) + ' world',
        exact: true,
      }),
    });
    await expect(card.locator('[data-theme=' + theme + ']')).toBeVisible();
    expect(await card.locator('.object').count()).toBeLessThanOrEqual(24);
    expect(
      await card.locator('.linked-items').evaluate((el) => el.clientHeight),
    ).toBeGreaterThanOrEqual(60);
    const bounds = await card.boundingBox();
    const listBounds = await card.locator('.linked-items').boundingBox();
    expect(listBounds!.y + listBounds!.height).toBeLessThanOrEqual(
      bounds!.y + bounds!.height,
    );
    await expect(card.locator('.description')).toHaveCSS(
      'text-overflow',
      'ellipsis',
    );
    await card.getByRole('button', { name: 'Explore', exact: true }).click();
    const world = page.getByRole('dialog', { name: 'Goal world', exact: true });
    await expect(world.locator('[data-detail=detail]')).toBeVisible();
    expect(await world.locator('.object').count()).toBeGreaterThan(24);
    expect(await world.locator('.object').count()).toBeLessThanOrEqual(128);
    await page.keyboard.press('Escape');
    await card
      .getByRole('button', {
        name:
          'Edit goal: ' + theme[0].toUpperCase() + theme.slice(1) + ' world',
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole('dialog')
        .getByRole('checkbox', { name: 'Completed', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await card
      .getByRole('checkbox', { name: 'Completed', exact: true })
      .click();
    await expect(card.locator('.landmark')).toHaveCount(1);
  }
  await page.screenshot({
    path: '/tmp/zivizip-dna-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.goal-strip').evaluate((el) => (el.scrollLeft = 0));
  await expect(
    page.locator('.goal-card').first().locator('.scene'),
  ).toBeVisible();
  await expect(page.locator('.goal-card').last().locator('.scene')).toHaveCount(
    0,
  );
  await page.locator('.goal-card').last().scrollIntoViewIfNeeded();
  await expect(
    page.locator('.goal-card').last().locator('[data-theme=space]'),
  ).toBeVisible();
  await expect(
    page.locator('.goal-card').first().locator('.scene'),
  ).toHaveCount(0);
  await page.screenshot({
    path: '/tmp/zivizip-dna-mobile.png',
    fullPage: true,
  });
});

test('Unassigned uses archived tasks, shared two-row scrolling and a reversible tray', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page.evaluate(
    async ({ task, expense }) => {
      await new Promise<void>((resolve) => {
        const req = indexedDB.open('zivizip-guest-v1');
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction('meta', 'readwrite');
          tx.objectStore('meta').put({
            key: 'tasks',
            value: {
              revision: 1,
              items: [
                ...Array.from({ length: 6 }, (_, i) => ({
                  ...task,
                  id: 'archived-' + i,
                  title: 'Archived ' + i,
                })),
                {
                  ...task,
                  id: 'active-done',
                  title: 'Completed but active',
                  archived: false,
                },
              ],
            },
          });
          tx.objectStore('meta').put({
            key: 'finance',
            value: { revision: 1, items: [expense] },
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      });
    },
    { task, expense },
  );
  await goals(page);
  await create(page, 'Focus');
  const pool = page.locator('.pool-strip');
  await expect(pool.locator('.goal-item')).toHaveCount(7);
  await expect(pool).not.toContainText('Completed but active');
  await expect(page.locator('.drag-handle')).toHaveCount(0);
  await expect(page.getByText('A growing world', { exact: true })).toHaveCount(
    0,
  );
  const boxes = await pool.locator('.goal-item').evaluateAll((items) =>
    items.slice(0, 3).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y };
    }),
  );
  expect(boxes[0].x).toBe(boxes[1].x);
  expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
  expect(boxes[2].x).toBeGreaterThan(boxes[0].x);
  await pool.evaluate((el) => {
    el.scrollLeft = 100;
  });
  await expect
    .poll(() => pool.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  const moved = await pool
    .locator('.goal-item')
    .evaluateAll((items) =>
      items.slice(0, 2).map((el) => el.getBoundingClientRect().x),
    );
  expect(moved[0]).toBe(moved[1]);
  const card = page.getByRole('region', { name: 'Focus', exact: true });
  await card.getByRole('checkbox', { name: 'Completed', exact: true }).click();
  await expect(
    card.getByRole('checkbox', { name: 'Completed', exact: true }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(pool.locator('.goal-item')).toHaveCount(0);
  await page.reload();
  await goals(page);
  await expect(pool.locator('.goal-item')).toHaveCount(0);
  await expect(
    card.getByRole('checkbox', { name: 'Completed', exact: true }),
  ).toBeChecked();
  await page.getByRole('button', { name: /^Set aside/ }).click();
  const tray = page.getByRole('dialog', { name: 'Set aside', exact: true });
  await expect(tray.locator('.aside-item')).toHaveCount(7);
  await tray
    .getByRole('button', { name: 'Restore', exact: true })
    .first()
    .click();
  await expect(tray.locator('.aside-item')).toHaveCount(6);
  await tray.getByRole('button', { name: 'Restore all', exact: true }).click();
  await expect(tray.locator('.aside-item')).toHaveCount(0);
  await tray.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(pool.locator('.goal-item')).toHaveCount(7);
  await pool.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await page.screenshot({ path: '/tmp/zivizip-goals-tray-mobile.png' });
});
