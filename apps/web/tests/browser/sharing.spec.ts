import { test, expect } from '@playwright/test';
import fs from 'node:fs';

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
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      page.getByRole('button', { name: 'Save changes' }),
    ).toBeDisabled();
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
    await request.delete(`/api/notes/${note.id}`, { headers, data: note });
    await request.delete('/api/session', { headers });
  }
});
