import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Reuse the browser tooling already installed for the web application.
const require = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { chromium } = require('@playwright/test');
const assets = new URL('../apps/web/static/', import.meta.url);
const logo = await readFile(new URL('logo.svg', assets), 'utf8');
const shapes = logo
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '');
// A 288px square fits inside the 512px maskable icon's central 80% circle.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#101719"/><g transform="translate(112 112) scale(2.88)">${shapes}</g></svg>\n`;
await writeFile(new URL('icon.svg', assets), icon);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
try {
  const page = await browser.newPage();
  for (const [name, size] of [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['apple-touch-icon.png', 180],
  ]) {
    const png = await page.evaluate(
      async ({ svg, size }) => {
        const image = new Image();
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(image, 0, 0, size, size);
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { svg: icon, size },
    );
    await writeFile(new URL(name, assets), Buffer.from(png, 'base64'));
  }
} finally {
  await browser.close();
}
