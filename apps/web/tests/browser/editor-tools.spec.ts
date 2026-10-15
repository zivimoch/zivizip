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
  await expect
    .poll(() => alignment(editor.locator('.text-paragraph').first()))
    .toBeLessThan(1);
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
  await expect
    .poll(() => alignment(editor.locator('.text-paragraph').first()))
    .toBeLessThan(1);
});

async function alignment(paragraph: import('@playwright/test').Locator) {
  return paragraph.evaluate((p) => {
    const x = (word: string) => {
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const index = (node.textContent || '').indexOf(word);
        if (index < 0) continue;
        const r = document.createRange();
        r.setStart(node, index);
        r.setEnd(node, index + 1);
        return r.getBoundingClientRect().x;
      }
      throw Error('Missing test text');
    };
    return Math.abs(x('First') - x('Continuation'));
  });
}

test('list continuation aligns with its first letter without inserting spaces', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Note content' });
  for (const marker of ['1.', '10.', 'a.', '-']) {
    await editor.fill('');
    await page.keyboard.type(`${marker} First`);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('Continuation');
    const p = editor.locator('.text-paragraph').first();
    await expect.poll(() => alignment(p)).toBeLessThan(1);
    await expect(p).toHaveJSProperty(
      'innerText',
      `${marker === '-' ? '•' : marker} First\nContinuation`,
    );
    await page.keyboard.press('Tab');
    await expect.poll(() => alignment(p)).toBeLessThan(1);
  }
  await editor.fill('');
  await page.keyboard.type('1. First ' + 'wrapped words '.repeat(12));
  await expect
    .poll(() =>
      editor
        .locator('.text-paragraph')
        .first()
        .evaluate((p) => {
          const r = document.createRange();
          r.selectNodeContents(p);
          r.setStart(p.firstChild!, 3);
          const rows = new Map<number, number>();
          for (const rect of r.getClientRects()) {
            rows.set(rect.y, Math.min(rows.get(rect.y) ?? Infinity, rect.x));
          }
          const starts = [...rows.values()];
          if (starts.length < 2) throw Error('Expected wrapped lines');
          return Math.max(...starts.map((x) => Math.abs(x - starts[0])));
        }),
    )
    .toBeLessThan(1);
});

test('nested markers align with parent continuation text', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Continue as guest', exact: true })
    .click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Note content' });
  await editor.click();
  await page.keyboard.type('1. Parent');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Continuation');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Child');
  await expect
    .poll(() =>
      editor.evaluate((el) => {
        const positions: number[] = [];
        for (const [i, p] of [
          ...el.querySelectorAll('.text-paragraph'),
        ].entries()) {
          const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const text = node.textContent || '';
            const index =
              i === 0 ? text.indexOf('Parent') : text.search(/[a-zA-Z0-9•]/);
            if (index < 0) continue;
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + 1);
            positions.push(range.getBoundingClientRect().x);
            break;
          }
        }
        return positions.length === 2
          ? Math.abs(positions[0] - positions[1])
          : 999;
      }),
    )
    .toBeLessThan(1);
});
