import { test, expect } from '@playwright/test';

test('install action follows browser availability and installation events', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        window.dispatchEvent(new Event('appinstalled'));
      },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(event);
  });
  const install = page.getByRole('button', {
    name: 'Install Zivizip',
    exact: true,
  });
  await expect(install).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await install.boundingBox();
  expect(box!.y).toBeLessThan(48);
  expect(box!.x).toBeGreaterThan(195);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await install.click();
  await expect(install).toHaveCount(0);
});

test('iOS offers manual instructions and remembers installed acknowledgement', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
  });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Install Zivizip', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Install Zivizip' }),
  ).toContainText('Add to Home Screen');
  await page
    .getByRole('button', { name: 'Already installed', exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Install Zivizip', exact: true }),
  ).toHaveCount(0);
});

test('standalone launches do not show installation controls', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'standalone', { get: () => true }),
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new Event('beforeinstallprompt', { cancelable: true }),
    ),
  );
  await expect(
    page.getByRole('button', { name: 'Install Zivizip', exact: true }),
  ).toHaveCount(0);
});
