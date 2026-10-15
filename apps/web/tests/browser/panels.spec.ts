import { test, expect } from '@playwright/test';

test('panel controls cycle collapsed states, drag to edges and restore after reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  const tasks = page.locator('.tasks-slot'),
    finance = page.locator('.finance-slot');
  await page.getByRole('button', { name: 'Hide finance', exact: true }).click();
  await expect(finance).toBeHidden();
  await page
    .getByRole('button', { name: 'Show both panels', exact: true })
    .click();
  await expect(finance).toBeVisible();
  await page.getByRole('button', { name: 'Hide tasks', exact: true }).click();
  await expect(tasks).toBeHidden();
  await page
    .getByRole('button', { name: 'Show both panels', exact: true })
    .click();
  await expect(tasks).toBeVisible();
  const handle = page.getByRole('button', {
    name: 'Resize tasks',
    exact: true,
  });
  const box = (await handle.boundingBox())!,
    pane = (await page.locator('.right-pane').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 3);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, pane.y + pane.height - 1, { steps: 10 });
  await page.mouse.up();
  await expect(finance).toBeHidden();
  await page
    .getByRole('button', { name: 'Show both panels', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Resize notes', exact: true })
    .press('ArrowLeft');
  const beforeHide = (await page.locator('.notes-pane').boundingBox())!.width;
  await page
    .getByRole('button', { name: 'Hide side panels', exact: true })
    .click();
  await expect(page.locator('.right-pane')).toBeHidden();
  await page.reload();
  await expect(page.locator('.right-pane')).toBeHidden();
  await page
    .getByRole('button', { name: 'Show side panels', exact: true })
    .click();
  await expect(page.locator('.right-pane')).toBeVisible();
  expect(
    Math.abs(
      (await page.locator('.notes-pane').boundingBox())!.width - beforeHide,
    ),
  ).toBeLessThan(1);
  const v = (await page
    .getByRole('button', { name: 'Resize notes', exact: true })
    .boundingBox())!;
  await page.mouse.move(v.x + 3, 200);
  await page.mouse.down();
  await page.mouse.move(1599, 200, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.right-pane')).toBeHidden();
  await page
    .getByRole('button', { name: 'Show side panels', exact: true })
    .click();
  await page.screenshot({ path: '/tmp/zivizip-panels.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: 'Finance', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Add transaction', exact: true }),
  ).toBeVisible();
});
