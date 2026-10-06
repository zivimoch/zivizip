import { test, expect } from '@playwright/test';

test('sidebar follows the prototype rail, hover navigation and single profile row', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  const side = page.locator('.sidebar');
  await page.mouse.move(700, 300);
  await expect(side).toHaveCSS('width', '72px');
  await expect(
    page.getByRole('button', { name: 'Detail', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  const center = async (selector: string) => {
    const box = (await page.locator(selector).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const logo = await center('.brand-mark'),
    home = await center('.sidebar nav > button:first-child svg'),
    goal = await center('.sidebar nav > button:nth-child(2) svg');
  expect(Math.abs(home.y - logo.y - (goal.y - home.y))).toBeLessThan(2);
  await side.hover();
  await expect(side).toHaveCSS('width', '240px');
  await expect(
    page.getByText('PERSONAL WORKSPACE', { exact: true }),
  ).toBeVisible();
  const avatar = await center('.avatar'),
    settings = await center('.settings-button');
  expect(Math.abs(avatar.y - settings.y)).toBeLessThan(2);
  await page.screenshot({ path: '/tmp/zivizip-sidebar-expanded.png' });
  await page.getByRole('button', { name: 'Detail', exact: true }).click();
  await page.mouse.move(700, 300);
  await expect(side).toHaveCSS('width', '72px');
  const note = await center('.sidebar .detail button:first-child svg');
  expect(Math.abs(note.x - home.x)).toBeLessThan(1);
  await page.screenshot({ path: '/tmp/zivizip-sidebar-collapsed.png' });
  await side.hover();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Language / Bahasa');
  await page
    .getByRole('button', { name: 'Close settings', exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await expect(side).toHaveCSS('width', '390px');
  await page.screenshot({ path: '/tmp/zivizip-sidebar-mobile.png' });
  await page.getByRole('button', { name: 'Close menu', exact: true }).click();
  await expect(side).toBeHidden();
});
