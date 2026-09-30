import { test, expect } from '@playwright/test';
test('automatic lists continue, alternate nested markers, exit and survive reload', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Lists');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Note content' });
  await editor.click();
  await page.keyboard.type('- First');
  await expect(editor).toContainText('• First');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1. Parent');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Child');
  await expect(page.locator('.text-paragraph').last()).toHaveText('  a. Child');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Grandchild');
  await expect(page.locator('.text-paragraph').last()).toHaveText(
    '    1. Grandchild',
  );
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.text-paragraph').last()).toHaveText('  b. ');
  await page.keyboard.press('Enter');
  await page.keyboard.type('a. Letters');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Numbers');
  await expect(page.locator('.text-paragraph').last()).toHaveText(
    '  1. Numbers',
  );
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Plain text');
  await expect(page.locator('.text-paragraph').last()).toHaveText('Plain text');
  await page.keyboard.press('Enter');
  await page.keyboard.type('* Touch entry');
  await editor.evaluate((el) =>
    el.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertParagraph',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(page.locator('.text-paragraph').last()).toHaveText('• ');
  await editor.evaluate((el) =>
    el.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertParagraph',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(page.locator('.text-paragraph').last()).toBeEmpty();

  const add = (await page
    .getByRole('button', { name: 'Add image', exact: true })
    .boundingBox())!;
  const breadcrumb = (await page.locator('.breadcrumb').boundingBox())!;
  expect(add.y).toBeGreaterThanOrEqual(breadcrumb.y);
  expect(add.y + add.height).toBeLessThanOrEqual(
    breadcrumb.y + breadcrumb.height,
  );
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.reload();
  await expect(editor).toContainText('Grandchild');
  await expect(editor).toContainText('Numbers');
});
