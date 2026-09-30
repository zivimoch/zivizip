import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
async function create(page: Page, name = 'Image note') {
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Note content' }),
  ).toBeVisible();
}
async function paste(page: Page) {
  await page.locator('.text-content').evaluate(async (editor) => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 120;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#17c5d5';
    ctx.fillRect(10, 10, 220, 100);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!)));
    const data = new DataTransfer();
    data.items.add(new File([blob], 'fixture.png', { type: 'image/png' }));
    editor.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.locator('.text-image img')).toBeVisible();
}
async function guest(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
}
async function position(page: Page) {
  return (await page.locator('.text-image').boundingBox())!;
}

test('images follow the caret and preceding paragraphs without drifting during later edits', async ({
  page,
}) => {
  await guest(page);
  await create(page);
  const text = page.getByRole('textbox', { name: 'Note content' });
  await text.click();
  await page.keyboard.type('Above');
  await page.keyboard.press('Enter');
  await paste(page);
  const initial = await position(page);
  await page.keyboard.type('Below');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Last');
  expect((await position(page)).y).toBeCloseTo(initial.y, 0);
  expect((await position(page)).x).toBeCloseTo(initial.x, 0);
  await page.locator('.text-paragraph').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  const lower = await position(page);
  expect(lower.y - initial.y).toBeGreaterThan(25);
  await page.locator('.text-paragraph').last().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.text-image img')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.text-image img')).toBeVisible();
  await page.screenshot({ path: '/tmp/zivizip-text-images.png' });
});

test('image selection supports all resize corners, rotation, deletion and undo', async ({
  page,
}) => {
  await guest(page);
  await create(page);
  await page.getByRole('textbox', { name: 'Note content' }).click();
  await paste(page);
  let im = await position(page);
  await page.mouse.click(im.x + im.width / 2, im.y + im.height / 2);
  for (const corner of [1, 3]) {
    const h = (await page.locator('.corner-' + corner).boundingBox())!;
    const before = await position(page);
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 40, h.y + h.height / 2, {
      steps: 5,
    });
    await page.mouse.up();
    expect((await position(page)).width).toBeGreaterThan(before.width + 30);
  }
  const rot = (await page.locator('.image-rotate').boundingBox())!;
  await page.mouse.move(rot.x + 18, rot.y + 18);
  await page.mouse.down();
  await page.mouse.move(rot.x + 100, rot.y + 65, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.text-image')).not.toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 0, 0)',
  );
  await page.getByRole('button', { name: 'Delete image', exact: true }).click();
  await expect(page.locator('.text-image')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Note content' }).press('Control+z');
  await expect(page.locator('.text-image img')).toBeVisible();
  await page.getByRole('textbox', { name: 'Note content' }).press('Control+a');
  await expect(page.locator('.image-selection')).toHaveCount(1);
  await page.keyboard.press('Backspace');
  await expect(page.locator('.text-image')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Note content' }).press('Control+z');
  await expect(page.locator('.text-image img')).toBeVisible();
});

test('moving an image upward keeps it stationary when typing below it, and backup carries its bytes', async ({
  page,
  context,
}) => {
  await guest(page);
  await create(
    page,
    'A long note title that should be truncated instead of stretching the tab',
  );
  const text = page.getByRole('textbox', { name: 'Note content' });
  await text.click();
  for (const line of ['First', 'Second', 'Third', 'Fourth']) {
    await page.keyboard.type(line);
    await page.keyboard.press('Enter');
  }
  await paste(page);
  await page.keyboard.type('Below image');
  let im = await position(page);
  await page.mouse.move(im.x + im.width / 2, im.y + im.height / 2);
  await page.mouse.down();
  await page.mouse.move(im.x + im.width / 2, im.y + im.height / 2 - 100, {
    steps: 6,
  });
  await page.mouse.up();
  im = await position(page);
  await page.locator('.text-paragraph').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('More text below');
  expect((await position(page)).y).toBeCloseTo(im.y, 0);
  await expect(page.locator('.tab-select > span')).toHaveCSS(
    'text-overflow',
    'ellipsis',
  );
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download backup', exact: true })
    .click();
  const data = JSON.parse(
    fs.readFileSync((await (await downloaded).path())!, 'utf8'),
  );
  expect(data.version).toBe(3);
  expect(data.media).toHaveLength(1);
  expect(data.notes[0].rich.images).toHaveLength(1);
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.text-image img')).toBeVisible();
});

test('account images upload once, synchronize privately and remain cached offline', async ({
  page,
  context,
  browser,
}) => {
  const path = new URL('../../../../.local/owner.json', import.meta.url);
  test.skip(!fs.existsSync(path), 'Local owner account required');
  const credentials = JSON.parse(fs.readFileSync(path, 'utf8')),
    headers = { Origin: 'http://127.0.0.1:4174', 'X-Zivizip': '1' };
  await context.request.post('/api/session', { headers, data: credentials });
  let id = '',
    uploads = 0;
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().includes('/api/media/')) uploads++;
  });
  const other = await browser.newContext();
  try {
    await page.goto('/');
    await create(page, `Image Sync ${Date.now()}`);
    await page.getByRole('textbox', { name: 'Note content' }).click();
    await paste(page);
    await page.keyboard.type('Caption');
    const rows = async () =>
      await (await context.request.get('/api/notes')).json();
    await expect
      .poll(async () => {
        const n = (await rows()).find((n: any) =>
          n.name.startsWith('Image Sync '),
        );
        id = n?.id || '';
        return n?.rich?.images.length || 0;
      })
      .toBe(1);
    const n = (await rows()).find((n: any) => n.id === id),
      asset = n.rich.images[0].asset;
    expect(uploads).toBe(1);
    expect(
      (
        await other.request.get('http://127.0.0.1:4174/api/media/' + asset)
      ).status(),
    ).toBe(401);
    await other.addCookies(await context.cookies());
    const second = await other.newPage();
    await second.goto('http://127.0.0.1:4174');
    await second.getByRole('button', { name: 'Detail', exact: true }).click();
    await second
      .locator('.sidebar')
      .getByRole('button', { name: 'Notes', exact: true })
      .click();
    await second.mouse.move(700, 300);
    await second
      .locator('.note-library')
      .getByRole('button', { name: new RegExp(n.name) })
      .click();
    await expect(second.locator('.text-image img')).toBeVisible();
    await page.keyboard.type(' More');
    expect(uploads).toBe(1);
    await context.setOffline(true);
    await expect(
      page.getByRole('textbox', { name: 'Note content' }),
    ).toHaveAttribute('aria-readonly', 'true');
    await expect(page.locator('.text-image img')).toBeVisible();
  } finally {
    await context.setOffline(false);
    await other.close();
    if (id) {
      const n = (await (await context.request.get('/api/notes')).json()).find(
        (n: any) => n.id === id,
      );
      if (n)
        await context.request.delete('/api/notes/' + id, { headers, data: n });
    }
    await context.request.delete('/api/session', { headers });
  }
});

test('mobile image controls support touch resize, movement and deletion', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await guest(page);
    await create(page);
    await page.getByRole('textbox', { name: 'Note content' }).click();
    await paste(page);
    let im = await position(page);
    await page.touchscreen.tap(im.x + im.width / 2, im.y + im.height / 2);
    await expect(page.locator('.image-selection')).toHaveCount(1);
    const cdp = await context.newCDPSession(page),
      handle = (await page.locator('.corner-3').boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: handle.x + 7, y: handle.y + 7 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: handle.x + 27, y: handle.y + 7 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    expect((await position(page)).width).toBeGreaterThan(im.width + 10);
    const move = (await page
      .getByRole('button', { name: 'Move image', exact: true })
      .boundingBox())!;
    const before = await position(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: move.x + 18, y: move.y + 18 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: move.x + 28, y: move.y + 78 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    expect((await position(page)).y).toBeGreaterThan(before.y + 40);
    await page.screenshot({ path: '/tmp/zivizip-text-images-mobile.png' });
    await page.getByRole('button', { name: 'Delete image', exact: true }).tap();
    await expect(page.locator('.text-image')).toHaveCount(0);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  } finally {
    await context.close();
  }
});
