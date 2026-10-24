import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import fs from 'node:fs';
import type { Note } from '../../src/lib/storage';
const headers = { Origin: 'http://127.0.0.1:4174', 'X-Zivizip': '1' };
let auth: Awaited<ReturnType<APIRequestContext['storageState']>> | undefined;
const test = base.extend({
  request: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({
      baseURL,
      storageState: auth,
    });
    if (!auth) {
      const credentials = JSON.parse(
        fs.readFileSync(
          new URL('../../../../.local/owner.json', import.meta.url),
          'utf8',
        ),
      );
      expect(
        (
          await context.post('/api/session', { headers, data: credentials })
        ).ok(),
      ).toBeTruthy();
      auth = await context.storageState();
    }
    await use(context);
    await context.dispose();
  },
});
test.afterAll(async ({ playwright, baseURL }) => {
  if (!auth) return;
  const context = await playwright.request.newContext({
    baseURL,
    storageState: auth,
  });
  await context.delete('/api/session', { headers });
  await context.dispose();
  auth = undefined;
});
async function fixture(
  request: APIRequestContext,
  body = 'Hello world',
  rich?: Note['rich'],
  kind = 'text',
) {
  const response = await request.post('/api/notes', {
    headers,
    data: {
      id: crypto.randomUUID(),
      name: 'Collaboration verification',
      category: 'General',
      icon: 'note',
      kind,
      body,
      rich,
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });
  expect(response.ok()).toBeTruthy();
  const note = await response.json();
  const shared = await request.put(`/api/notes/${note.id}/share`, {
    headers,
    data: { editable: true },
  });
  const { token } = await shared.json();
  return {
    note,
    token,
    async latest() {
      return (await (await request.get('/api/notes')).json()).find(
        (n: Note) => n.id === note.id,
      ) as Note;
    },
    async close() {
      const current = await this.latest();
      if (current)
        await request.delete(`/api/notes/${note.id}`, {
          headers,
          data: current,
        });
    },
  };
}
async function open(page: Page, token: string) {
  await page.goto(`/shared/#${token}`);
  const editor = page.getByRole('textbox', { name: 'Note content' });
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  return editor;
}

test('concurrent shared editors converge, keep the caret and undo only local typing', async ({
  page,
  browser,
  request,
}) => {
  const f = await fixture(request);
  const other = await browser.newContext();
  const second = await other.newPage();
  try {
    const a = await open(page, f.token),
      b = await open(second, f.token);
    await a.click();
    await page.keyboard.press('Home');
    await b.click();
    await second.keyboard.press('End');
    // Both edits occur before the debounce; neither is based on the other's snapshot.
    await Promise.all([
      page.keyboard.type('First '),
      second.keyboard.type(' Last'),
    ]);
    await expect(a).toHaveText('First Hello world Last');
    await expect(b).toHaveText('First Hello world Last');
    await page.keyboard.type('next ');
    await expect(a).toHaveText('First next Hello world Last');
    await expect(b).toHaveText('First next Hello world Last');
    await page.keyboard.press('Control+z');
    await expect(a).toHaveText('First Hello world Last');
    await expect(b).toHaveText('First Hello world Last');
    await page.keyboard.press('Control+s');
    await expect(page.locator('header [role="status"]')).toHaveText('Saved');
    expect((await f.latest()).body).toBe('First Hello world Last');
    const rows: Note[] = await (await request.get('/api/notes')).json();
    expect(
      rows.filter((n) => n.name.startsWith('Collaboration verification')),
    ).toHaveLength(1);
  } finally {
    await other.close();
    await f.close();
  }
});

test('deleting shared text keeps the caret across paragraph merges and acknowledgements', async ({
  page,
  request,
}) => {
  const f = await fixture(request, 'First line\n1. Second line\nLast words');
  try {
    await open(page, f.token);
    await page.locator('.text-paragraph').last().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('XY');
    await expect(page.locator('.text-paragraph').last()).toHaveText(
      'Last worXY',
    );
    await expect(page.locator('header [role="status"]')).toHaveText('Saved');
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(' joined ');
    await expect(page.locator('.text-paragraph').last()).toHaveText(
      '1. Second line joined Last worXY',
    );
    await expect(page.locator('header [role="status"]')).toHaveText('Saved');
    await page.keyboard.press('Delete');
    await expect(page.locator('.text-paragraph').last()).toHaveText(
      '1. Second line joined ast worXY',
    );
    await expect(page.locator('.text-paragraph').first()).toHaveText(
      'First line',
    );
  } finally {
    await f.close();
  }
});

test('formatted shared text preserves its cursor and local undo history', async ({
  page,
  request,
}) => {
  const f = await fixture(request, 'Alpha beta', {
    version: 1,
    blocks: [
      {
        type: 'paragraph',
        text: 'Alpha beta',
        runs: [{ text: 'Alpha beta', bold: true }],
      },
    ],
    images: [],
  });
  try {
    const editor = await open(page, f.token);
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await expect(page.locator('header [role="status"]')).toHaveText('Saved');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(' again');
    await expect(editor).toHaveText('Alpha beta again');
    await expect(page.locator('header [role="status"]')).toHaveText('Saved');
    await page.keyboard.press('Control+z');
    await expect(editor).toHaveText('Alpha beta!');
  } finally {
    await f.close();
  }
});

test('a lost save response retries idempotently and offline notes are read only', async ({
  page,
  context,
  request,
}) => {
  const f = await fixture(request);
  try {
    const editor = await open(page, f.token);
    let dropped = false;
    await page.route(`**/api/shared/${f.token}/sync`, async (route) => {
      if (!dropped && route.request().postDataJSON().update) {
        dropped = true;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await expect.poll(() => dropped).toBe(true);
    await expect(page.locator('header [role="status"]')).toHaveText('Saved', {
      timeout: 15000,
    });
    expect((await f.latest()).body).toBe('Hello world!');
    await context.setOffline(true);
    await expect(editor).toHaveAttribute('contenteditable', 'false');
    await expect(page.locator('header [role="status"]')).toHaveText(
      'Offline · Read only',
    );
    await context.setOffline(false);
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await page.reload();
    await expect(editor).toHaveText('Hello world!');
  } finally {
    await context.setOffline(false);
    await f.close();
  }
});

test('Ctrl+S flushes autosave immediately, preserving edits typed while a save is pending', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  try {
    const editor = await open(page, f.token);
    let writes = 0;
    await page.route(`**/api/shared/${f.token}/sync`, async (route) => {
      if (route.request().postDataJSON().update && ++writes === 1) await gate;
      await route.continue();
    });
    await editor.fill('First');
    await page.keyboard.press('Control+s');
    await expect.poll(() => writes).toBe(1);
    await expect(page.locator('header [role="status"]')).toHaveText('Saving…');
    await page.keyboard.press('End');
    await page.keyboard.type(' second');
    release();
    await expect(page.locator('header [role="status"]')).toHaveText('Saved');
    expect((await f.latest()).body).toBe('First second');
  } finally {
    release();
    await f.close();
  }
});

test('owner permissions and revocation are enforced during a live shared session', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  try {
    const editor = await open(page, f.token);
    await request.put(`/api/notes/${f.note.id}/share`, {
      headers,
      data: { editable: false },
    });
    await expect(editor).toHaveAttribute('contenteditable', 'false');
    await request.put(`/api/notes/${f.note.id}/share`, {
      headers,
      data: { editable: true },
    });
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await request.delete(`/api/notes/${f.note.id}/share`, { headers });
    await expect(editor).toHaveAttribute('contenteditable', 'false');
    await expect(page.getByRole('alert')).toContainText(
      'Shared note not found',
    );
  } finally {
    await f.close();
  }
});

test('shared Draw autosaves on a mobile viewport and survives reload', async ({
  page,
  request,
}) => {
  const f = await fixture(
    request,
    JSON.stringify({ version: 1, shapes: [] }),
    undefined,
    'draw',
  );
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/shared/#${f.token}`);
    await expect(page.locator('header [role="status"]')).toHaveText('Saved');
    await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
    const box = (await page.locator('.drawing').boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(box.x + 180, box.y + 180, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('[data-shape]')).toHaveCount(1);
    await expect(page.locator('header [role="status"]')).toHaveText('Saved');
    await page.reload();
    await expect(page.locator('[data-shape]')).toHaveCount(1);
  } finally {
    await f.close();
  }
});

test('Main owner and anonymous shared editor synchronize, including metadata and images', async ({
  page,
  context,
  browser,
  request,
}) => {
  const f = await fixture(request);
  const guest = await browser.newContext();
  const other = await guest.newPage();
  try {
    await context.addCookies((await request.storageState()).cookies);
    await page.goto('/');
    await page.getByRole('button', { name: 'Detail', exact: true }).click();
    await page
      .locator('.sidebar')
      .getByRole('button', { name: 'Notes', exact: true })
      .click();
    await page.mouse.move(600, 300);
    await page
      .getByRole('button', { name: /Collaboration verification/ })
      .click();
    const owner = page.getByRole('textbox', { name: 'Note content' });
    await expect(owner).toHaveAttribute('contenteditable', 'true');
    const editor = await open(other, f.token);
    await owner.click();
    await page.keyboard.press('Home');
    await page.keyboard.type('Owner ');
    await expect(editor).toHaveText('Owner Hello world');
    await editor.click();
    await other.keyboard.press('End');
    await other.keyboard.type(' Guest');
    await expect(owner).toHaveText('Owner Hello world Guest');
    await page
      .locator('.tab-select')
      .filter({ hasText: 'Collaboration verification' })
      .dblclick();
    await page.getByLabel('Name', { exact: true }).fill('Collaborative title');
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(other.locator('.breadcrumb')).toContainText(
      'Collaborative title',
    );
    await expect(editor).toHaveText('Owner Hello world Guest');
    await editor.evaluate(async (el) => {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 40;
      canvas.getContext('2d')!.fillRect(0, 0, 80, 40);
      const blob = await new Promise<Blob>((r) => canvas.toBlob((v) => r(v!)));
      const data = new DataTransfer();
      data.items.add(new File([blob], 'shared.png', { type: 'image/png' }));
      el.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await expect(other.locator('.text-image img')).toBeVisible();
    await expect(page.locator('.text-image img')).toBeVisible();
    await expect(other.locator('header [role="status"]')).toHaveText('Saved');
    expect((await f.latest()).rich?.images).toHaveLength(1);
  } finally {
    await guest.close();
    await f.close();
  }
});
