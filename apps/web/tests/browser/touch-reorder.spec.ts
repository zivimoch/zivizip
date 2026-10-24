import { test, expect } from '@playwright/test';

test('touch task bodies scroll while six-dot handles reorder without a hold', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4174/');
    await page
      .getByRole('button', { name: 'Continue as guest', exact: true })
      .click();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('zivizip-guest-v1');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('meta', 'readwrite');
          tx.objectStore('meta').put({
            key: 'tasks',
            value: {
              revision: 1,
              items: Array.from({ length: 16 }, (_, i) => ({
                id: `touch-${i}`,
                title: `Task ${i}`,
                amount: 0,
                done: false,
                archived: false,
                date: '',
                createdAt: 1,
              })),
            },
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    });
    await page.reload();
    await page
      .locator('.bottom-nav')
      .getByRole('button', { name: 'To do', exact: true })
      .click();
    const rows = page.locator('.task-row');
    await expect(rows).toHaveCount(16);
    const client = await context.newCDPSession(page);
    async function gesture(x: number, y: number, toX: number, toY: number) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 10; step++)
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { x: x + ((toX - x) * step) / 10, y: y + ((toY - y) * step) / 10 },
          ],
        });
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    }
    let from = (await rows.nth(2).boundingBox())!;
    await gesture(from.x + 180, from.y + 20, from.x + 180, from.y - 65);
    await expect(rows.first()).toHaveAttribute('data-task', 'touch-0');
    await page.locator('.task-list').evaluate((el) => (el.scrollTop = 0));
    from = (await rows.first().locator('[data-touch-grip]').boundingBox())!;
    const to = (await rows.nth(2).boundingBox())!;
    await gesture(from.x + 22, from.y + 22, to.x + 100, to.y + to.height - 3);
    await expect(rows.nth(2)).toHaveAttribute('data-task', 'touch-0');
    await page.reload();
    await expect(rows.nth(2)).toHaveAttribute('data-task', 'touch-0');
  } finally {
    await context.close();
  }
});

test('mobile Notes tabs reorder only through their handles', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4174/');
    await page
      .getByRole('button', { name: 'Continue as guest', exact: true })
      .click();
    for (const name of ['First', 'Second']) {
      await page.getByRole('button', { name: 'New note', exact: true }).click();
      await page.getByLabel('Name', { exact: true }).fill(name);
      await page.getByRole('button', { name: 'Create', exact: true }).click();
    }
    const client = await context.newCDPSession(page);
    async function swipe(source: any, target: any) {
      const a = await source.boundingBox(),
        b = await target.boundingBox();
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }],
      });
      for (let step = 1; step <= 8; step++)
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            {
              x:
                a.x +
                a.width / 2 +
                ((b.x + b.width / 2 - a.x - a.width / 2) * step) / 8,
              y: a.y + a.height / 2,
            },
          ],
        });
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    }
    await swipe(
      page.locator('.tab-select').first(),
      page.locator('.tab-select').nth(1),
    );
    await expect(page.locator('.tab-select').first()).toContainText('First');
    await page.locator('.tabs').evaluate((el) => (el.scrollLeft = 0));
    await swipe(
      page.locator('.tab').first().locator('[data-touch-grip]'),
      page.locator('.tab-select').nth(1),
    );
    await expect(page.locator('.tab-select').first()).toContainText('Second');
    await page.reload();
    await expect(page.locator('.tab-select').first()).toContainText('Second');
  } finally {
    await context.close();
  }
});

test('mobile planning categories reorder through handles and preserve scrolling on the row', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4174/');
    await page
      .getByRole('button', { name: 'Continue as guest', exact: true })
      .click();
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const req = indexedDB.open('zivizip-guest-v1');
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction('meta', 'readwrite');
          tx.objectStore('meta').put({
            key: 'planning',
            value: {
              revision: 1,
              months: [{ month: '2026-10', opening: 0 }],
              items: ['Salary', 'Bonus', 'Gift'].map((category, i) => ({
                id: `budget-${i}`,
                month: '2026-10',
                category,
                group: 'income',
                amount: 100,
                note: '',
                enabled: true,
                automatic: false,
              })),
            },
          });
          tx.objectStore('meta').put({
            key: 'planning-view',
            value: { tabs: ['2026-10'], active: '2026-10' },
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      });
    });
    await page.reload();
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('button', { name: 'Detail', exact: true }).click();
    await page
      .locator('.sidebar .detail')
      .getByRole('button', { name: 'Finance', exact: true })
      .click();
    const rows = page.locator('[data-plan-group="income"] [data-plan-row]');
    await rows.first().scrollIntoViewIfNeeded();
    const source = (await rows
      .first()
      .locator('[data-touch-grip]')
      .boundingBox())!;
    const target = (await rows
      .first()
      .locator('xpath=ancestor::div[contains(@class,"plan-items-scroll")]')
      .boundingBox())!;
    const client = await context.newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: source.x + 22, y: source.y + 22 }],
    });
    for (let step = 1; step <= 24; step++)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: source.x + 22 + (step % 2),
            y:
              source.y +
              22 +
              ((target.y + target.height - 8 - source.y - 22) *
                Math.min(step, 8)) /
                8,
          },
        ],
      });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect(rows.nth(2)).toContainText('Salary');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
