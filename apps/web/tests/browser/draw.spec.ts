import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
const origin = 'http://127.0.0.1:4174';
const headers = { Origin: origin, 'X-Zivizip': '1' };
async function create(page: Page, name = 'Drawing') {
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('radio', { name: 'Draw', exact: true }).check();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(
    page.getByRole('application', { name: 'Drawing canvas' }),
  ).toBeVisible();
}
async function draw(page: Page, tool: string, a = [100, 100], b = [230, 200]) {
  await page.getByRole('button', { name: tool, exact: true }).click();
  const r = (await page.locator('.drawing').boundingBox())!;
  await page.mouse.move(r.x + a[0], r.y + a[1]);
  await page.mouse.down();
  await page.mouse.move(r.x + b[0], r.y + b[1], { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('[data-shape]')).not.toHaveCount(0);
}
async function guest(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
}

test('Draw editing, selection, rotation, erasing, history and transparent export', async ({
  page,
}) => {
  await guest(page);
  await create(page);
  await draw(page, 'Rectangle');
  await draw(page, 'Ellipse', [320, 120], [430, 220]);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const r = (await page.locator('.drawing').boundingBox())!;
  await page.mouse.move(r.x + 70, r.y + 70);
  await page.mouse.down();
  await page.mouse.move(r.x + 470, r.y + 250, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('[data-selection]')).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Delete selected objects', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-shape]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.locator('.drawing').press('Control+a');
  await expect(page.locator('.selection-rotate')).toBeVisible();
  const rot = (await page.locator('.selection-rotate').boundingBox())!;
  await page.mouse.move(rot.x + 18, rot.y + 18);
  await page.mouse.down();
  await page.mouse.move(rot.x + 140, rot.y + 140, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.selection-rotate')).not.toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 0, 0)',
  );
  await expect(page.locator('.selection-delete')).not.toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 0, 0)',
  );
  await expect(page.locator('[data-shape]').first()).not.toHaveAttribute(
    'transform',
    /^rotate\(0 /,
  );
  await page.locator('.drawing').click({ position: { x: 40, y: 35 } });
  await page.locator('.drawing').press('Control+a');
  await expect(page.locator('[data-selection]')).toHaveCount(2);
  await page.locator('.drawing').press('Delete');
  await expect(page.locator('[data-shape]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-shape]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.locator('.drawing').dblclick({ position: { x: 45, y: 390 } });
  await page
    .getByRole('textbox', { name: 'Canvas text' })
    .fill('A clear direction');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('[data-shape]')).toHaveCount(3);
  await expect(page.locator('.drawing')).toContainText('A clear direction');
  await page.screenshot({ path: '/tmp/zivizip-draw-desktop.png' });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG' }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe('Drawing.png');
  const png = fs.readFileSync((await exported.path())!).toString('base64');
  const alpha = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + data;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, 1, 1).data[3];
  }, png);
  expect(alpha).toBe(0);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const req = indexedDB.open('zivizip-guest-v1');
        const db = await new Promise<IDBDatabase>(
          (resolve) => (req.onsuccess = () => resolve(req.result)),
        );
        const tx = db.transaction('notes'),
          get = tx.objectStore('notes').getAll();
        const rows = await new Promise<any[]>(
          (resolve) => (get.onsuccess = () => resolve(get.result)),
        );
        db.close();
        return JSON.parse(rows[0].body).shapes.length;
      }),
    )
    .toBe(3);
  await page.reload();
  await expect(page.locator('[data-shape]')).toHaveCount(3);
});

test('arrow endpoint and shape label remain editable; eraser removes part of a shape', async ({
  page,
}) => {
  await guest(page);
  await create(page);
  await draw(page, 'Arrow');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const endpoint = page.locator('[data-endpoint="1"]'),
    r = (await page.locator('.drawing').boundingBox())!;
  const e = (await endpoint.boundingBox())!;
  await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + 340, r.y + 60, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-shape] path')).toHaveAttribute('d', /340/);
  await draw(page, 'Rectangle', [150, 180], [240, 290]);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.locator('.drawing').dblclick({ position: { x: 190, y: 230 } });
  await page
    .getByRole('textbox', { name: 'Canvas text' })
    .fill('A label wider than its shape');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('mask[id^="label-"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Eraser', exact: true }).click();
  await page.mouse.move(r.x + 150, r.y + 200);
  await page.mouse.down();
  await page.mouse.move(r.x + 150, r.y + 255, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('mask[id^="m"] circle')).not.toHaveCount(0);
  await expect(page.locator('[data-shape]')).toHaveCount(2);
});

test('mobile touch draw, double-tap text, resize and offline editing', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await guest(page);
    await create(page, 'Mobile drawing');
    await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
    const r = (await page.locator('.drawing').boundingBox())!;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: r.x + 70, y: r.y + 80 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: r.x + 210, y: r.y + 180 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect(page.locator('[data-shape]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: r.x + 210, y: r.y + 180 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: r.x + 250, y: r.y + 210 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect(page.locator('[data-shape] rect')).toHaveAttribute(
      'width',
      '180',
    );
    await page.touchscreen.tap(r.x + 100, r.y + 270);
    await page.touchscreen.tap(r.x + 100, r.y + 270);
    await page
      .getByRole('textbox', { name: 'Canvas text' })
      .fill('Mobile ideas');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.locator('[data-shape]')).toHaveCount(2);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: r.x + 70, y: r.y + 350, id: 0 },
        { x: r.x + 170, y: r.y + 350, id: 1 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: r.x + 40, y: r.y + 350, id: 0 },
        { x: r.x + 200, y: r.y + 350, id: 1 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect(page.locator('[data-action="reset"]')).toHaveText('160%');
    await page.locator('[data-action="reset"]').click();
    await page.screenshot({ path: '/tmp/zivizip-draw-mobile.png' });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.waitForTimeout(300);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('[data-shape]')).toHaveCount(2);
    await draw(page, 'Ellipse', [40, 40], [90, 90]);
    await expect(page.locator('[data-shape]')).toHaveCount(3);
  } finally {
    await context.close();
  }
});

test('owner Draw sync, offline read-only and API validation', async ({
  page,
  context,
  browser,
}) => {
  const file = new URL('../../../../.local/owner.json', import.meta.url);
  test.skip(!fs.existsSync(file), 'Local owner account required');
  const credentials = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(
    (
      await context.request.post(origin + '/api/session', {
        headers,
        data: credentials,
      })
    ).ok(),
  ).toBeTruthy();
  const other = await browser.newContext();
  let id = '';
  try {
    await page.goto('/');
    await expect(page.locator('.account-status')).toBeVisible();
    const name = `Draw Sync ${Date.now()}`;
    await create(page, name);
    await draw(page, 'Rectangle');
    const rows = async () =>
      await (await context.request.get(origin + '/api/notes')).json();
    await expect
      .poll(async () => {
        const n = (await rows()).find((n: any) => n.name === name);
        id = n?.id || '';
        return n?.kind === 'draw' ? JSON.parse(n.body).shapes.length : 0;
      })
      .toBe(1);
    await other.addCookies(await context.cookies());
    const second = await other.newPage();
    await second.goto(origin);
    await second.getByRole('button', { name: 'Detail', exact: true }).click();
    await second
      .locator('.sidebar')
      .getByRole('button', { name: 'Notes', exact: true })
      .click();
    await second.mouse.move(700, 300);
    await second
      .locator('.note-library')
      .getByRole('button', { name: new RegExp(name) })
      .click();
    await expect(second.locator('[data-shape]')).toHaveCount(1);
    await draw(page, 'Ellipse', [310, 100], [410, 180]);
    await expect(second.locator('[data-shape]')).toHaveCount(2);
    const note = (await rows()).find((n: any) => n.id === id);
    expect(
      (
        await context.request.put(origin + '/api/notes/' + id, {
          headers,
          data: { ...note, body: '{"version":1,"shapes":[{"id":"bad"}]}' },
        })
      ).status(),
    ).toBe(400);
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: 'Rectangle', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Pan', exact: true }),
    ).toBeEnabled();
  } finally {
    await context.setOffline(false);
    await other.close();
    if (id) {
      const n = (
        await (await context.request.get(origin + '/api/notes')).json()
      ).find((n: any) => n.id === id);
      if (n)
        await context.request.delete(origin + '/api/notes/' + id, {
          headers,
          data: n,
        });
    }
    await context.request.delete(origin + '/api/session', { headers });
  }
});
