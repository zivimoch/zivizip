import { test, expect } from '@playwright/test';

test('text tools preserve formatting and Shift+Enter stays inside a list item', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Note content' });
  await editor.click();
  await page.keyboard.type('- First');
  await expect(editor).toContainText('• First');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Continuation');
  await expect(editor.locator('.text-paragraph').first()).toHaveJSProperty(
    'innerText',
    '• First\nContinuation',
  );
  await expect(editor.locator('.text-paragraph')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second');
  await expect(editor.locator('.text-paragraph').last()).toHaveText('• Second');
  await expect(editor.locator('.text-paragraph').first()).toHaveCSS(
    'padding-left',
    '24px',
  );
  await page.getByRole('button', { name: /Tools/ }).click();
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await page.waitForTimeout(600);
  await page.reload();
  await expect(editor).toContainText('Continuation');
  await expect(editor.locator('span').first()).toHaveCSS('font-weight', '700');
  await expect(page.getByRole('toolbar', { name: 'Text tools' })).toBeHidden();
  await page.getByRole('button', { name: /Tools/ }).click();
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: 'Italic', exact: true }).click();
  await page.getByRole('button', { name: 'Underline', exact: true }).click();
  await page.getByLabel('Font size', { exact: true }).selectOption('24');
  await page.getByLabel('Font color', { exact: true }).fill('#ff6600');
  await page.waitForTimeout(400);
  await page.reload();
  const styled = editor.locator('span').first();
  await expect(styled).toHaveCSS('font-style', 'italic');
  await expect(styled).toHaveCSS('font-size', '24px');
  await expect(styled).toHaveCSS('color', 'rgb(255, 102, 0)');
  await expect(styled).toHaveCSS('text-decoration-line', 'underline');
});
