import { test, expect } from '@playwright/test';
test('word and range selection in lists does not start dragging or move text', async ({
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
  await page.keyboard.type('- Review monthly priorities');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1. Plan weekly activities');
  const before = await editor.innerText();
  let drags = 0;
  await page.exposeFunction('recordListDrag', () => drags++);
  await editor.evaluate((el) =>
    el.addEventListener('dragstart', () => (window as any).recordListDrag()),
  );
  for (const word of ['Review', 'Plan']) {
    const line = page.locator('.text-paragraph').filter({ hasText: word });
    const points = await line.evaluate((el) => {
      const node = el.firstChild!;
      const text = node.textContent!;
      const start = text.indexOf(' ') + 1;
      const word = document.createRange();
      word.setStart(node, start);
      word.setEnd(node, text.indexOf(' ', start));
      const a = word.getBoundingClientRect();
      word.setStart(node, text.length - 4);
      word.setEnd(node, text.length);
      const b = word.getBoundingClientRect();
      return {
        x: a.left + a.width / 2,
        y: a.top + a.height / 2,
        end: b.left + b.width / 2,
      };
    });
    await page.mouse.dblclick(points.x, points.y);
    await expect
      .poll(() => page.evaluate(() => getSelection()?.toString().trim()))
      .toBe(word);
    // A second-click hold followed by movement extends selection by words, as on a touchpad.
    await page.mouse.move(points.x, points.y);
    await page.mouse.down({ clickCount: 2 });
    await page.mouse.move(points.end, points.y, { steps: 6 });
    await page.mouse.up();
    expect(
      await page.evaluate(
        () => getSelection()!.toString().trim().split(/\s+/).length,
      ),
    ).toBeGreaterThan(1);
    expect(drags).toBe(0);
    expect(await editor.innerText()).toBe(before);
  }
});
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
