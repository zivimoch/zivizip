import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
async function create(page: Page, name: string) {
  if ((page.viewportSize()?.width || 1280) > 700) {
    await page.mouse.move(650, 300);
    await expect(page.locator('.sidebar')).toHaveCSS('width', '72px');
  }
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('radio', { name: 'Draw', exact: true }).check();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.breadcrumb-path')).toContainText(name);
  await expect(page.locator('.drawing')).toBeVisible();
}
async function pasteImage(page: Page, count = 1, color = '#ff0000') {
  await page.locator('.drawing').evaluate(async (canvas, color) => {
    const source = document.createElement('canvas');
    source.width = 160;
    source.height = 100;
    const ctx = source.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 160, 100);
    const blob = await new Promise<Blob>((resolve) =>
      source.toBlob((b) => resolve(b!)),
    );
    const data = new DataTransfer();
    data.items.add(new File([blob], 'image.png', { type: 'image/png' }));
    canvas.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, color);
  await expect(page.locator('.drawing image')).toHaveCount(count);
}
async function pasteText(page: Page, text: string) {
  await page.locator('.drawing').evaluate((canvas, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    canvas.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}
test('Draw clipboard preserves editable objects, image bytes, undo, export and offline reload', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await create(page, 'Clipboard source');
  await pasteImage(page);
  await pasteText(page, 'Editable caption');
  await expect(page.locator('[data-shape]')).toHaveCount(2);
  await page.locator('.drawing').focus();
  await page.keyboard.press('Control+a');
  const copied = await page.locator('.drawing').evaluate((canvas) => {
    const data = new DataTransfer();
    canvas.dispatchEvent(
      new ClipboardEvent('copy', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
    return data.getData('text/plain');
  });
  expect(copied).toContain('zivizip-draw-v1:');
  await create(page, 'Clipboard destination');
  await pasteText(page, copied);
  await expect(page.locator('[data-shape]')).toHaveCount(2);
  await expect(page.locator('.drawing image')).toHaveAttribute(
    'href',
    /^data:image\/webp;base64,/,
  );
  await page.locator('.drawing').focus();
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-shape]')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('[data-shape]')).toHaveCount(2);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const png = fs.readFileSync((await (await download).path())!);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  const pixels = await page.evaluate(
    async (bytes) => {
      const img = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;
      let red = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) red++;
      img.close();
      return red;
    },
    [...png],
  );
  expect(pixels).toBeGreaterThan(1000);
  await page.locator('.sidebar').hover();
  await expect(page.locator('.sidebar')).toHaveCSS('width', '240px');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const backupDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download backup', exact: true })
    .click();
  const backup = JSON.parse(
    fs.readFileSync((await (await backupDownload).path())!, 'utf8'),
  );
  expect(backup.media).toHaveLength(1);
  expect(backup.notes.filter((n: any) => n.kind === 'draw')).toHaveLength(2);
  await page
    .getByRole('button', { name: 'Close settings', exact: true })
    .click();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.drawing image')).toHaveAttribute(
    'href',
    /^data:image\/webp;base64,/,
  );
  await expect(page.locator('[data-shape]')).toHaveCount(2);
});

test('Draw image attachments sync and respect shared-note media permissions', async ({
  page,
  context,
  browser,
}) => {
  const path = new URL('../../../../.local/owner.json', import.meta.url);
  test.skip(!fs.existsSync(path), 'Local owner account required');
  const headers = { Origin: 'http://127.0.0.1:4174', 'X-Zivizip': '1' };
  expect(
    (
      await context.request.post('/api/session', {
        headers,
        data: JSON.parse(fs.readFileSync(path, 'utf8')),
      })
    ).ok(),
  ).toBe(true);
  const name = `Clipboard account ${Date.now()}`;
  let id = '';
  const guest = await browser.newContext();
  try {
    await page.goto('/');
    await create(page, name);
    await pasteImage(page);
    let note: any;
    await expect
      .poll(async () => {
        note = (await (await context.request.get('/api/notes')).json()).find(
          (n: any) => n.name === name,
        );
        id = note?.id || '';
        return note ? JSON.parse(note.body).shapes.length : 0;
      })
      .toBe(1);
    const asset = JSON.parse(note.body).shapes[0].asset;
    expect(
      (
        await guest.request.get('http://127.0.0.1:4174/api/media/' + asset)
      ).status(),
    ).toBe(401);
    const share = await context.request.put('/api/notes/' + id + '/share', {
      headers,
      data: { editable: true },
    });
    expect(share.ok()).toBe(true);
    const { token } = await share.json();
    const shared = await guest.newPage();
    await shared.goto('http://127.0.0.1:4174/shared/#' + token);
    await expect(shared.locator('.drawing image')).toHaveAttribute(
      'href',
      /^data:image\/webp;base64,/,
    );
    expect(
      (
        await guest.request.get(
          `http://127.0.0.1:4174/api/shared/${token}/media/${'f'.repeat(64)}`,
        )
      ).status(),
    ).toBe(404);
    await pasteText(shared, 'Shared caption');
    await expect(shared.locator('header').getByRole('status')).toHaveText(
      'Saved',
    );
    await pasteImage(shared, 2, '#0000ff');
    await expect(shared.locator('header').getByRole('status')).toHaveText(
      'Saved',
    );
    await shared.reload();
    await expect(shared.locator('[data-shape]')).toHaveCount(3);
    await context.request.put('/api/notes/' + id + '/share', {
      headers,
      data: { editable: false },
    });
    await shared.reload();
    await expect(
      shared.getByRole('button', { name: 'Add image', exact: true }),
    ).toBeDisabled();
    await pasteText(shared, 'Not allowed');
    await expect(shared.locator('[data-shape]')).toHaveCount(3);
  } finally {
    await guest.close();
    if (id) await context.request.delete('/api/notes/' + id, { headers });
  }
});

test('mobile Draw accepts image files without clipboard permission', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await create(page, 'Mobile image');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 80;
    canvas.getContext('2d')!.fillRect(0, 0, 100, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add image', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'mobile.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.locator('.drawing image')).toHaveCount(1);
  await expect(page.locator('.selection-rotate')).toBeVisible();
  await page
    .getByRole('button', { name: 'Delete selected objects', exact: true })
    .click();
  await expect(page.locator('.drawing image')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.drawing image')).toHaveCount(1);
});
