import { test, expect } from '@playwright/test';
for (const width of [1440, 390]) {
  test(`task overview groups completions and keeps analysis in sync at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Continue as guest', exact: true })
      .click();
    if (width < 800)
      await page
        .getByRole('button', { name: 'Open menu', exact: true })
        .click();
    await page.getByRole('button', { name: 'Detail', exact: true }).click();
    await page
      .locator('.sidebar .detail')
      .getByRole('button', { name: 'To do', exact: true })
      .click();
    await page.mouse.move(width - 10, 300);
    const pending = page.locator('[data-task-card="pending"]');
    const completed = page.locator('[data-task-card="completed"]');
    await expect(page.locator('[data-stat="total"]')).toHaveText('0');
    await pending
      .getByRole('button', { name: 'Add task', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('What would you like to finish?', { exact: true })
      .fill('Review monthly plan');
    await dialog
      .getByLabel('Due date (optional)', { exact: true })
      .fill('2020-01-01');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(pending.locator('[data-task]')).toHaveCount(1);
    await expect(page.locator('[data-stat="pending"]')).toHaveText('1');
    await expect(page.locator('[data-bucket="overdue"] strong')).toHaveText(
      '1',
    );
    await pending
      .getByRole('button', {
        name: 'Complete Review monthly plan',
        exact: true,
      })
      .click();
    await expect(pending.locator('[data-task]')).toHaveCount(0);
    await expect(completed.locator('[data-task]')).toHaveCount(1);
    await expect(page.locator('[data-stat="completed"]')).toHaveText('1');
    await expect(page.locator('[data-bucket="overdue"] strong')).toHaveText(
      '0',
    );
    await completed
      .getByRole('button', { name: 'Archive completed', exact: true })
      .click();
    await expect(
      completed.getByRole('button', {
        name: 'Restore Review monthly plan',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('[data-stat="completed"]')).toHaveText('1');
    await page.locator('.tasks-detail').evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({
      path: `/tmp/tasks-detail-${width}.png`,
      fullPage: true,
    });
    expect(
      await page
        .locator('.tasks-detail')
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await completed
      .getByRole('button', { name: 'Restore Review monthly plan', exact: true })
      .click();
    await expect(pending.locator('[data-task]')).toHaveCount(1);
    await expect(completed.locator('[data-task]')).toHaveCount(0);
    await expect(page.locator('[data-stat="pending"]')).toHaveText('1');
  });
}
