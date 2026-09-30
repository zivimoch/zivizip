import {
  test,
  expect,
  chromium,
  type Page,
  type BrowserContext,
} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const credentialPath = new URL(
  '../../../../.local/owner.json',
  import.meta.url,
);
const configured = fs.existsSync(credentialPath);
const credential = configured
  ? JSON.parse(fs.readFileSync(credentialPath, 'utf8'))
  : null;
const origin = 'http://127.0.0.1:4174';
const headers = { Origin: origin, 'X-Zivizip': '1' };
async function visit(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
}
async function login(page: Page) {
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(credential.username);
  await page.getByLabel('Password', { exact: true }).fill(credential.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('.account-status')).toContainText(
    credential.username,
  );
}
async function newNote(page: Page, name: string, body: string) {
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note content' }).fill(body);
}
async function serverNotes(context: BrowserContext) {
  const r = await context.request.get(`${origin}/api/notes`);
  expect(r.ok()).toBeTruthy();
  return r.json();
}

test('first visit explains local storage and registration is interest only', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('dialog')).toContainText(
    'not uploaded to our server',
  );
  await page
    .getByRole('dialog')
    .getByLabel('Language / Bahasa')
    .selectOption('id');
  await expect(page.getByRole('dialog')).toContainText('tidak diunggah');
  await page
    .getByRole('dialog')
    .getByLabel('Language / Bahasa')
    .selectOption('en');
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'New note', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'does not create an account',
  );
  await page
    .getByLabel('Email', { exact: true })
    .fill('local-check@example.invalid');
  await page
    .getByLabel('What would you like from Zivizip?')
    .fill('Local acceptance test: portable notes.');
  await page.getByRole('button', { name: 'Send interest' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Your interest has been recorded',
  );
  const result = await page.request.post('/api/register', {
    headers,
    data: {},
  });
  expect(result.status()).toBe(404);
});

test('owner login isolates guests, persists, syncs and reads offline, logout revokes', async ({
  page,
  context,
  browser,
}) => {
  test.skip(!configured, 'Run python3 scripts/setup-local-account.py first');
  await visit(page);
  await newNote(page, 'Guest private', 'Guest-only content');
  await page.waitForTimeout(400);
  await login(page);
  expect(
    (await context.request.get(`${origin}/api/registration-interest`)).status(),
  ).toBe(200);
  await page
    .getByRole('button', { name: 'Open account workspace', exact: true })
    .click();
  await expect
    .poll(async () => JSON.stringify(await serverNotes(context)))
    .not.toContain('Guest-only content');
  const label = `Account ${Date.now()}`;
  await newNote(page, label, 'Owner version one');
  await expect
    .poll(
      async () =>
        (await serverNotes(context)).find((n: any) => n.name === label)?.body,
    )
    .toBe('Owner version one');
  const id = (await serverNotes(context)).find((n: any) => n.name === label).id;
  const cookie = (await context.cookies()).find(
    (c) => c.name === 'zivizip_session',
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe('Strict');
  expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 300 * 86400);
  const restored = await browser.newContext({
    storageState: await context.storageState(),
  });
  const second = await restored.newPage();
  await second.goto('/');
  await expect(second.locator('.account-status')).toContainText(
    credential.username,
  );
  await second.getByRole('button', { name: 'Detail', exact: true }).click();
  await second
    .locator('.sidebar')
    .getByRole('button', { name: 'Notes', exact: true })
    .click();
  await second.mouse.move(650, 300);
  await second
    .locator('.note-library')
    .getByRole('button', { name: new RegExp(label) })
    .click();
  await expect(
    second.getByRole('textbox', { name: 'Note content' }),
  ).toHaveValue('Owner version one');
  await page
    .getByRole('textbox', { name: 'Note content' })
    .fill('Realtime version two');
  await expect(
    second.getByRole('textbox', { name: 'Note content' }),
  ).toHaveValue('Realtime version two', { timeout: 10000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveValue(
    'Realtime version two',
  );
  await expect(
    page.getByRole('textbox', { name: 'Note content' }),
  ).toHaveAttribute('readonly', '');
  await context.setOffline(false);
  await expect(
    page.getByRole('textbox', { name: 'Note content' }),
  ).not.toHaveAttribute('readonly', '', { timeout: 15000 });
  const n = (await serverNotes(context)).find((n: any) => n.id === id);
  expect(
    (
      await context.request.delete(`${origin}/api/notes/${id}`, {
        headers,
        data: n,
      })
    ).status(),
  ).toBe(204);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.locator('.account-status')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveValue(
    'Guest-only content',
  );
  expect((await restored.request.get(`${origin}/api/notes`)).status()).toBe(
    401,
  );
  await expect(second.locator('.account-status')).toHaveCount(0, {
    timeout: 10000,
  });
  await restored.close();
  const dbNames = await page.evaluate(async () =>
    (await indexedDB.databases()).map((d) => d.name),
  );
  expect(dbNames).not.toContain('zivizip-account-owner-v1');
});

test('guest notes upload only after explicit copy and retain local originals', async ({
  page,
  context,
}) => {
  test.skip(!configured, 'Local owner account required');
  await visit(page);
  const label = `Transfer ${Date.now()}`;
  await newNote(page, label, 'Bring this explicitly');
  await page.waitForTimeout(400);
  await login(page);
  await page
    .getByRole('button', { name: 'Copy local notes to account', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const n = (await serverNotes(context)).find((n: any) => n.name === label);
  expect(n.body).toBe('Bring this explicitly');
  await context.request.delete(`${origin}/api/notes/${n.id}`, {
    headers,
    data: n,
  });
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveValue(
    'Bring this explicitly',
  );
});

test('API rejects anonymous access, bad login and foreign-origin writes', async ({
  request,
}) => {
  expect((await request.get('/api/notes')).status()).toBe(401);
  expect((await request.get('/api/registration-interest')).status()).toBe(401);
  expect(
    (
      await request.post('/api/session', {
        headers: { ...headers, Origin: 'https://other.example' },
        data: { username: 'wrong', password: 'wrong' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post('/api/session', {
        headers,
        data: { username: 'wrong', password: 'wrong' },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post('/api/registration-interest', {
        headers,
        data: { email: 'invalid', message: '' },
      })
    ).status(),
  ).toBe(400);
});

test('mobile account menu and registration modal stay usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByLabel('Username', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(
    page.getByLabel('What would you like from Zivizip?'),
  ).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.getByRole('button', { name: 'Close account dialog' }).click();
  await expect(
    page.getByRole('button', { name: 'New note', exact: true }),
  ).toBeVisible();
});

test('a failed account load cannot turn guest notes into server writes', async ({
  page,
  context,
}) => {
  test.skip(!configured, 'Local owner account required');
  await visit(page);
  await newNote(page, 'Guest during outage', 'Never upload this');
  await page.waitForTimeout(300);
  let writes = 0;
  await page.route('**/api/notes', async (route) => {
    if (route.request().method() === 'GET')
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"Test outage"}',
      });
    else {
      writes++;
      await route.continue();
    }
  });
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(credential.username);
  await page.getByLabel('Password', { exact: true }).fill(credential.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to sign in');
  await page.getByRole('button', { name: 'Close account dialog' }).click();
  await expect(page.locator('.account-status')).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Note content' })
    .fill('Still private guest content');
  await page.waitForTimeout(300);
  expect(writes).toBe(0);
  await context.request.delete(`${origin}/api/session`, { headers });
});

test('persistent cookie survives an actual browser process restart', async () => {
  test.skip(!configured, 'Local owner account required');
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'zivizip-session-test-'),
  );
  const options = { headless: true, executablePath: process.env.CHROMIUM_PATH };
  let persistent = await chromium.launchPersistentContext(directory, options);
  try {
    expect(
      (
        await persistent.request.post(`${origin}/api/session`, {
          headers,
          data: credential,
        })
      ).ok(),
    ).toBeTruthy();
    await persistent.close();
    persistent = await chromium.launchPersistentContext(directory, options);
    const page = await persistent.newPage();
    await page.goto(origin);
    await expect(page.locator('.account-status')).toContainText(
      credential.username,
    );
    expect(
      (
        await persistent.request.delete(`${origin}/api/session`, { headers })
      ).status(),
    ).toBe(204);
  } finally {
    await persistent.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
