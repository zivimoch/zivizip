import { test, expect } from '@playwright/test';
test('finance suggestions, optional description, formatted money and daily totals', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  const add = page.getByRole('button', {
    name: 'Add transaction',
    exact: true,
  });
  const task = page.getByRole('button', { name: 'Add task', exact: true });
  expect((await add.boundingBox())!.width).toBe(
    (await task.boundingBox())!.width,
  );
  await add.click();
  await page
    .getByRole('combobox', { name: 'Category', exact: true })
    .fill('Food');
  await page.getByLabel('Amount (IDR)', { exact: true }).fill('1250000');
  await expect(page.getByLabel('Amount (IDR)', { exact: true })).toHaveValue(
    /Rp.*1\.250\.000/,
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.transaction-name')).toHaveText('Food');
  await expect(page.locator('.daily-totals')).toContainText('1.250.000');
  await add.click();
  await page.getByRole('combobox', { name: 'Category', exact: true }).fill('F');
  const option = page.getByRole('option', { name: 'Food', exact: true });
  await expect(option).toBeVisible();
  const input = await page
    .getByRole('combobox', { name: 'Category', exact: true })
    .boundingBox();
  const menu = await page
    .getByRole('listbox', { name: 'Category options', exact: true })
    .boundingBox();
  expect(Math.abs(input!.width - menu!.width)).toBeLessThan(1);
  expect(Math.abs(input!.x - menu!.x)).toBeLessThan(1);
  await option.click();
  await page.getByLabel('Description', { exact: true }).fill('Lunch');
  await page.getByLabel('Amount (IDR)', { exact: true }).fill('25000');
  await page.getByRole('radio', { name: 'Income', exact: true }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.daily-totals')).toContainText('25.000');
  await add.click();
  await page.getByLabel('Description', { exact: true }).fill('Lu');
  await page.getByRole('option', { name: 'Lunch', exact: true }).click();
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    'Lunch',
  );
  await page
    .getByRole('button', { name: 'Close transaction dialog', exact: true })
    .click();
  await page.locator('.sidebar').hover();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Currency', exact: true })
    .selectOption('USD');
  await page.keyboard.press('Escape');
  await add.click();
  await page.getByLabel('Amount (USD)', { exact: true }).fill('1250');
  await expect(page.getByLabel('Amount (USD)', { exact: true })).toHaveValue(
    '$1,250',
  );
});

test('note and task URLs use safe clickable links without losing text', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Note content' });
  await editor.fill('Visit https://example.com today');
  await expect(editor.getByRole('link')).toHaveAttribute(
    'href',
    'https://example.com/',
  );
  await editor.press('End');
  await editor.pressSequentially(' more');
  await expect(editor).toContainText('today more');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page
    .getByLabel('What would you like to finish?', { exact: true })
    .fill('Read https://example.com');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.task-title a')).toHaveAttribute(
    'target',
    '_blank',
  );
  await expect(page.locator('.task-title a')).toHaveCSS(
    'text-decoration-style',
    'dotted',
  );
});
