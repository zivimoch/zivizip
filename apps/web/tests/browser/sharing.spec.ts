import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { emptyScene } from '../../src/lib/draw/scene';

test('deleting unformatted shared text preserves the caret across paragraph merges', async ({
  page,
}) => {
  const token = 'e'.repeat(64);
  let note = {
    id: crypto.randomUUID(),
    name: 'Deletion regression',
    category: 'General',
    icon: 'note',
    kind: 'text',
    body: 'First line\n1. Second line\nLast words',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    // Shared GET returns object keys in serde_json::Value order.
    rich: {
      blocks: [
        { text: 'First line', type: 'paragraph' },
        { text: '1. Second line', type: 'paragraph' },
        { text: 'Last words', type: 'paragraph' },
      ],
      images: [],
      version: 1,
    },
  };
  await page.route(`**/api/shared/${token}`, async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { note, editable: true } });
    note = { ...route.request().postDataJSON(), revision: note.revision + 1 };
    await route.fulfill({ json: note });
  });
  await page.goto(`/shared/#${token}`);
  await page.locator('.text-paragraph').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('XY');
  await expect(page.locator('.text-paragraph').last()).toHaveText('Last worXY');
  await expect(page.locator('header').getByRole('status')).toHaveText('Saved');
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(' joined ');
  await expect(page.locator('.text-paragraph').last()).toHaveText(
    '1. Second line joined Last worXY',
  );
  await page.keyboard.press('Delete');
  await expect(page.locator('.text-paragraph').last()).toHaveText(
    '1. Second line joined ast worXY',
  );
  await expect(page.locator('.text-paragraph').first()).toHaveText(
    'First line',
  );
});

test('shared save acknowledgements preserve the caret and undo history in formatted text', async ({
  page,
}) => {
  const token = 'd'.repeat(64);
  let note = {
    id: crypto.randomUUID(),
    name: 'Caret regression',
    category: 'General',
    icon: 'note',
    kind: 'text',
    body: 'Alpha beta\n1. List item',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    rich: {
      version: 1,
      blocks: [
        {
          type: 'paragraph',
          text: 'Alpha beta',
          runs: [{ text: 'Alpha beta', bold: true }],
        },
        { type: 'paragraph', text: '1. List item' },
      ],
      images: [],
    },
  };
  await page.route(`**/api/shared/${token}`, async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { note, editable: true } });
    const sent = route.request().postDataJSON();
    // The Rust API serializes run text before optional formatting fields.
    for (const block of sent.rich.blocks)
      if (block.runs)
        block.runs = block.runs.map((run: any) => ({
          text: run.text,
          bold: run.bold,
        }));
    note = { ...sent, revision: note.revision + 1 };
    await route.fulfill({ json: note });
  });
  await page.goto(`/shared/#${token}`);
  const first = page.locator('.text-paragraph').first();
  await first.click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.type('one ');
  await expect(page.locator('header').getByRole('status')).toHaveText('Saved');
  await page.keyboard.type('two ');
  await expect(page.locator('header').getByRole('status')).toHaveText('Saved');
  await expect(first).toHaveText('Alpha one two beta');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
  await expect(page.locator('header').getByRole('status')).toHaveText('Saved');
  await expect(first).toHaveText('Alpha one beta');
  await page.keyboard.press('Control+z');
  await expect(first).toHaveText('Alpha one tbeta');
  await expect(page.locator('.text-paragraph').nth(1)).toHaveText(
    '1. List item',
  );
});

test('owner shares a note, guests edit only when allowed, and revocation blocks access', async ({
  page,
  request,
}) => {
  const headers = { Origin: 'http://127.0.0.1:4174', 'X-Zivizip': '1' };
  const credentials = JSON.parse(
    fs.readFileSync(
      new URL('../../../../.local/owner.json', import.meta.url),
      'utf8',
    ),
  );
  expect(
    (await request.post('/api/session', { headers, data: credentials })).ok(),
  ).toBeTruthy();
  const response = await request.post('/api/notes', {
    headers,
    data: {
      id: crypto.randomUUID(),
      name: 'Sharing verification',
      category: 'General',
      icon: 'note',
      kind: 'text',
      body: 'Shared original',
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });
  expect(response.ok()).toBeTruthy();
  let note = await response.json();
  try {
    const share = await request.put(`/api/notes/${note.id}/share`, {
      headers,
      data: { editable: false },
    });
    expect(share.ok()).toBeTruthy();
    const { token } = await share.json();
    await page.goto(`/shared/#${token}`);
    const editor = page.getByRole('textbox', { name: 'Note content' });
    await expect(editor).toHaveAttribute('contenteditable', 'false');
    await expect(editor).toContainText('Shared original');
    await request.put(`/api/notes/${note.id}/share`, {
      headers,
      data: { editable: true },
    });
    await page.reload();
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await editor.fill('Guest contribution');
    await editor.evaluate(async (el) => {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 40;
      canvas.getContext('2d')!.fillRect(0, 0, 80, 40);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((value) => resolve(value!)),
      );
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
    await expect(page.locator('.text-image img')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Language' })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: 'Save changes' }),
    ).toHaveCount(0);
    await expect(page.locator('header').getByRole('status')).toHaveText(
      'Saved',
    );
    const notes = await (await request.get('/api/notes')).json();
    note = notes.find((n: { id: string }) => n.id === note.id);
    expect(note.body.trim()).toBe('Guest contribution');
    expect(note.rich.images).toHaveLength(1);
    await request.delete(`/api/notes/${note.id}/share`, { headers });
    await page.reload();
    await expect(page.getByRole('alert')).toContainText(
      'Shared note not found',
    );
  } finally {
    const latest = await (await request.get('/api/notes')).json();
    note = latest.find((n: { id: string }) => n.id === note.id) || note;
    await request.delete(`/api/notes/${note.id}`, { headers, data: note });
    await request.delete('/api/session', { headers });
  }
});

test('shared autosave retains typing during a pending save and uses the acknowledged revision', async ({
  page,
}) => {
  const token = 'a'.repeat(64);
  let note = {
    id: crypto.randomUUID(),
    name: 'Shared',
    category: 'General',
    icon: 'note',
    kind: 'text',
    body: 'Original',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  const writes: any[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/shared/${token}`, async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { note, editable: true } });
    const sent = route.request().postDataJSON();
    writes.push(sent);
    if (writes.length === 1) await gate;
    expect(sent.revision).toBe(note.revision);
    note = { ...sent, revision: note.revision + 1 };
    await route.fulfill({ json: note });
  });
  await page.goto(`/shared/#${token}`);
  const editor = page.getByRole('textbox', { name: 'Note content' });
  await editor.fill('First edit');
  await expect.poll(() => writes.length).toBe(1);
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.fill('Newer edit while saving');
  release();
  await expect(page.locator('header').getByRole('status')).toHaveText('Saved');
  expect(writes).toHaveLength(2);
  expect(note.body).toBe('Newer edit while saving');
  await expect(editor).toHaveText(note.body);
});

test('shared autosave retries a temporary failure but preserves the draft on conflict', async ({
  page,
}) => {
  const token = 'b'.repeat(64);
  const note = {
    id: crypto.randomUUID(),
    name: 'Shared',
    category: 'General',
    icon: 'note',
    kind: 'text',
    body: 'Original',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  let attempts = 0;
  await page.route(`**/api/shared/${token}`, async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { note, editable: true } });
    attempts++;
    await route.fulfill({
      status: attempts === 1 ? 503 : 409,
      json: {
        error:
          attempts === 1 ? 'Temporarily unavailable' : 'Note changed elsewhere',
      },
    });
  });
  await page.goto(`/shared/#${token}`);
  const editor = page.getByRole('textbox', { name: 'Note content' });
  await editor.fill('Keep this draft');
  await expect(page.getByRole('alert')).toHaveText('Temporarily unavailable');
  await expect(page.getByRole('alert')).toContainText('Note changed elsewhere');
  await expect(editor).toHaveText('Keep this draft');
  await editor.fill('Still keep this draft');
  await page.waitForTimeout(3300);
  expect(attempts).toBe(2);
  await expect(page.locator('header').getByRole('status')).toHaveText(
    'Not saved',
  );
});

test('shared Draw edits autosave and survive reload on a mobile viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const token = 'c'.repeat(64);
  let note = {
    id: crypto.randomUUID(),
    name: 'Drawing',
    category: 'General',
    icon: 'draw',
    kind: 'draw',
    body: JSON.stringify(emptyScene()),
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  await page.route(`**/api/shared/${token}`, async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { note, editable: true } });
    note = { ...route.request().postDataJSON(), revision: note.revision + 1 };
    await route.fulfill({ json: note });
  });
  await page.goto(`/shared/#${token}`);
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  const box = (await page.locator('.drawing').boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 180, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-shape]')).toHaveCount(1);
  await expect.poll(() => note.revision).toBe(2);
  await expect(page.locator('header').getByRole('status')).toHaveText('Saved');
  await page.reload();
  await expect(page.locator('[data-shape]')).toHaveCount(1);
});
