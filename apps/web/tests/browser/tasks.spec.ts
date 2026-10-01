import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
const credentials = new URL('../../../../.local/owner.json', import.meta.url);
const origin = 'http://127.0.0.1:4174';
const headers = { Origin: origin, 'X-Zivizip': '1' };
async function dragSelectedList(page: Page) {
  const start = await page.evaluate(() => {
    const rect = getSelection()!.getRangeAt(0).getClientRects()[0];
    return {
      x: rect.left + Math.min(30, rect.width / 2),
      y: rect.top + rect.height / 2,
    };
  });
  const panel = page.locator('.tasks-panel');
  const box = (await panel.boundingBox())!;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, start.y + 10, { steps: 4 });
  await expect(panel).toHaveClass(/list-drop-ready/);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 8,
  });
  await expect(panel).toHaveClass(/list-drop-over/);
  await expect(panel).toHaveCSS('outline-style', 'dashed');
  await page.mouse.up();
  await expect(panel).not.toHaveClass(/list-drop-(ready|over)/);
}
async function visit(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Add task', exact: true }),
  ).toBeEnabled();
}
async function add(page: Page, title: string, date = '', amount = '') {
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByLabel('What would you like to finish?')).toBeFocused();
  await page.getByLabel('What would you like to finish?').fill(title);
  if (date) await page.getByLabel('Due date (optional)').fill(date);
  if (amount)
    await page.getByLabel('Related amount (IDR, optional)').fill(amount);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.task-title', { hasText: title })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add task', exact: true }),
  ).toBeEnabled();
}
const row = (page: Page, title: string) =>
  page.locator('.task-row').filter({
    has: page.locator('.task-title', { hasText: new RegExp(`^${title}$`) }),
  });
async function drag(page: Page, title: string, target: string, after = true) {
  const a = (await row(page, title).boundingBox())!,
    b = (await row(page, target).boundingBox())!;
  await page.mouse.move(a.x + 65, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 65, b.y + (after ? b.height - 4 : 4), {
    steps: 8,
  });
  await page.mouse.up();
  await expect(
    page.getByRole('button', { name: 'Add task', exact: true }),
  ).toBeEnabled();
}
test('task modal, date bands, group dragging, completion, archive and deletion follow the prototype', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await visit(page);
  await add(page, 'Alpha');
  await add(page, 'Beta');
  await add(page, 'Gamma');
  await add(page, 'Deadline', '2026-10-10', '350000');
  await expect(page.locator('.task-title')).toHaveText([
    'Deadline',
    'Alpha',
    'Beta',
    'Gamma',
  ]);
  await expect(row(page, 'Deadline')).toContainText('10 Oct 2026');
  await expect(row(page, 'Deadline')).toContainText('350.000');
  await row(page, 'Alpha').click();
  await row(page, 'Beta').click({ modifiers: ['Shift'] });
  await expect(page.locator('.task-row.selected')).toHaveCount(2);
  await drag(page, 'Alpha', 'Gamma');
  await expect(page.locator('.task-title')).toHaveText([
    'Deadline',
    'Gamma',
    'Alpha',
    'Beta',
  ]);
  await drag(page, 'Alpha', 'Deadline', false);
  await expect(page.locator('.task-title').first()).toHaveText('Deadline');
  await drag(page, 'Alpha', 'Gamma');
  await page.locator('.tasks-panel h2').click();
  await expect(page.locator('.task-row.selected')).toHaveCount(0);
  const color = await row(page, 'Alpha')
    .locator('.task-title')
    .evaluate((el) => getComputedStyle(el).color);
  await page
    .getByRole('button', { name: 'Complete Alpha', exact: true })
    .click();
  await expect(page.locator('.task-progress')).toContainText(
    '1 of 4 completed',
  );
  await expect(row(page, 'Alpha').locator('.task-title')).toHaveCSS(
    'color',
    color,
  );
  await expect(row(page, 'Alpha').locator('.task-title')).toHaveCSS(
    'text-decoration-line',
    'none',
  );
  await page.getByRole('button', { name: 'Archive completed' }).click();
  await expect(page.locator('.task-progress')).toContainText(
    '0 of 3 completed',
  );
  await page.getByRole('button', { name: 'View archive (1)' }).click();
  await page.getByRole('button', { name: 'Restore Alpha' }).click();
  await page.getByRole('button', { name: 'Back to active tasks' }).click();
  await row(page, 'Beta').dblclick();
  await page.getByLabel('What would you like to finish?').fill('Beta updated');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(row(page, 'Beta updated')).toBeVisible();
  await row(page, 'Beta updated').focus();
  await page.keyboard.press('F2');
  await page.getByRole('button', { name: 'Delete task', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('permanently');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row(page, 'Beta updated')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.task-title')).toHaveText([
    'Deadline',
    'Gamma',
    'Alpha',
  ]);
});
test('dates sort chronologically and Delete removes the whole selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await visit(page);
  await add(page, 'Late', '2026-10-30');
  await add(page, 'No date A');
  await add(page, 'Early', '2026-10-02');
  await add(page, 'Middle', '2026-10-10');
  await add(page, 'No date B');
  await expect(page.locator('.task-title')).toHaveText([
    'Early',
    'Middle',
    'Late',
    'No date A',
    'No date B',
  ]);
  await drag(page, 'Late', 'Early', false);
  await expect(page.locator('.task-title')).toHaveText([
    'Early',
    'Middle',
    'Late',
    'No date A',
    'No date B',
  ]);
  await row(page, 'Late').click();
  await row(page, 'No date A').click({ modifiers: ['Shift'] });
  await page.keyboard.press('Delete');
  await expect(page.getByRole('dialog')).toContainText('Delete 2 tasks?');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.task-row')).toHaveCount(5);
  await row(page, 'Late').click();
  await row(page, 'No date A').click({ modifiers: ['Shift'] });
  await page
    .getByRole('button', { name: 'Delete selected tasks (2)', exact: true })
    .click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.task-title')).toHaveText([
    'Early',
    'Middle',
    'No date B',
  ]);
  await page.reload();
  await expect(page.locator('.task-title')).toHaveText([
    'Early',
    'Middle',
    'No date B',
  ]);
});
test('list text drags into tasks and tasks are backed up and editable offline', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await visit(page);
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Note content' });
  await editor.click();
  await page.keyboard.type('- Review priorities');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Plan the week');
  await page
    .locator('.text-paragraph')
    .first()
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
  await dragSelectedList(page);
  await expect(row(page, 'Review priorities')).toBeVisible();
  await expect(editor).toContainText('Review priorities');
  // Selected list text carries one task per line, without modifying its source.
  await editor.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await dragSelectedList(page);
  await expect(page.locator('.task-row')).toHaveCount(3);
  // Cancelling a native drag clears the prototype's drop feedback.
  await editor.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  const selected = await editor.evaluate(() => {
    const b = getSelection()!.getRangeAt(0).getClientRects()[0];
    return { x: b.left + 30, y: b.top + b.height / 2 };
  });
  await page.mouse.move(selected.x, selected.y);
  await page.mouse.down();
  await page.mouse.move(selected.x + 30, selected.y + 10, { steps: 4 });
  await expect(page.locator('.tasks-panel')).toHaveClass(/list-drop-ready/);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.tasks-panel')).not.toHaveClass(
    /list-drop-(ready|over)/,
  );
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download backup', exact: true })
    .click();
  const data = JSON.parse(
    fs.readFileSync((await (await download).path())!, 'utf8'),
  );
  expect(data.version).toBe(4);
  expect(data.tasks).toHaveLength(3);
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.reload();
  await add(page, 'Offline task');
  await page.reload();
  await expect(row(page, 'Offline task')).toBeVisible();
  await context.setOffline(false);
});
test('mobile tasks open from navigation, edit with double tap and reorder with touch', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: 'To do', exact: true })
    .click();
  await add(page, 'First');
  await add(page, 'Second');
  await row(page, 'First').tap();
  await row(page, 'First').tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const box = (await row(page, 'First').boundingBox())!,
    target = (await row(page, 'Second').boundingBox())!;
  await row(page, 'First').tap();
  const client = await context.newCDPSession(page);
  const point = { x: box.x + 65, y: box.y + box.height / 2 };
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: point.x, y: target.y + target.height - 5 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect(page.locator('.task-title')).toHaveText(['Second', 'First']);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
test('account tasks sync, reject stale revisions, remain after logout, and stay separate from guests', async ({
  page,
  context,
  browser,
}) => {
  test.skip(!fs.existsSync(credentials), 'Local owner is required');
  test.setTimeout(60000);
  const credential = JSON.parse(fs.readFileSync(credentials, 'utf8'));
  const guestLabel = `Guest task ${Date.now()}`;
  await page.setViewportSize({ width: 1600, height: 1000 });
  await visit(page);
  await add(page, guestLabel);
  expect((await page.request.get('/api/tasks')).status()).toBe(401);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(credential.username);
  await page.getByLabel('Password', { exact: true }).fill(credential.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page
    .getByRole('button', { name: 'Open account workspace', exact: true })
    .click();
  const label = `Task acceptance ${Date.now()}`;
  const secondContext = await browser.newContext({
    storageState: await context.storageState(),
    viewport: { width: 1600, height: 1000 },
  });
  let noteId: string | undefined;
  try {
    const second = await secondContext.newPage();
    await second.goto('/');
    await expect(
      second.getByRole('button', { name: 'Add task', exact: true }),
    ).toBeEnabled();
    const before = await (await context.request.get('/api/tasks')).json();
    await add(page, label);
    await expect(row(second, label)).toBeVisible({ timeout: 15000 });
    // Note saves still trigger account refresh, but Tasks must remain interactive and visually stable.
    let taskReads = 0;
    await page.route('**/api/tasks', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      taskReads++;
      await new Promise((resolve) => setTimeout(resolve, 180));
      await route.fulfill({ response });
    });
    const audit = await page.locator('.tasks-panel').evaluateHandle((panel) => {
      const state = {
        disabledChanges: 0,
        row: panel.querySelector('[data-task]'),
        observer: null as MutationObserver | null,
      };
      state.observer = new MutationObserver(
        (records) => (state.disabledChanges += records.length),
      );
      state.observer.observe(panel, {
        attributes: true,
        subtree: true,
        attributeFilter: ['disabled'],
      });
      return state;
    });
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill(label);
    const noteName = await page
      .getByLabel('Name', { exact: true })
      .inputValue();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    noteId = (await (await context.request.get('/api/notes')).json()).find(
      (n: any) => n.name === noteName,
    )?.id;
    expect(noteId).toBeTruthy();
    await page.getByRole('textbox', { name: 'Note content' }).click();
    await page.keyboard.type('Keep the task list steady while writing.', {
      delay: 35,
    });
    await expect.poll(() => taskReads).toBeGreaterThan(0);
    expect(
      await audit.evaluate((state) => ({
        disabled: state.disabledChanges,
        connected: state.row?.isConnected,
      })),
    ).toEqual({ disabled: 0, connected: true });
    await audit.evaluate((state) => state.observer!.disconnect());
    await page.unrouteAll({ behavior: 'wait' });
    expect(
      (
        await context.request.put('/api/tasks', { headers, data: before })
      ).status(),
    ).toBe(409);
    expect(
      JSON.stringify(await (await context.request.get('/api/tasks')).json()),
    ).not.toContain(guestLabel);
    await second.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await secondContext.setOffline(true);
    await second.reload();
    await expect(row(second, label)).toBeVisible();
    await expect(
      second.getByRole('button', { name: 'Add task', exact: true }),
    ).toBeDisabled();
    await secondContext.setOffline(false);
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(row(page, guestLabel)).toBeVisible();
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page
      .getByLabel('Username', { exact: true })
      .fill(credential.username);
    await page
      .getByLabel('Password', { exact: true })
      .fill(credential.password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page
      .getByRole('button', {
        name: 'Copy local workspace to account',
        exact: true,
      })
      .click();
    await expect(row(page, guestLabel)).toBeVisible();
    expect(
      (await (await context.request.get('/api/tasks')).json()).items.some(
        (t: any) => t.title === label,
      ),
    ).toBe(true);
  } finally {
    await context.request.post('/api/session', { headers, data: credential });
    if (noteId) {
      const note = (
        await (await context.request.get('/api/notes')).json()
      ).find((n: any) => n.id === noteId);
      if (note)
        await context.request.delete(`/api/notes/${noteId}`, {
          headers,
          data: note,
        });
    }
    const current = await (await context.request.get('/api/tasks')).json();
    const removed = await context.request.put('/api/tasks', {
      headers,
      data: {
        ...current,
        items: current.items.filter(
          (t: any) => t.title !== label && t.title !== guestLabel,
        ),
      },
    });
    expect(removed.ok()).toBeTruthy();
    await secondContext.close();
  }
});
