import { test, expect } from '@playwright/test';

test('brand icons share the slim mark and remain available offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const paths = await page.evaluate(async () => {
    const manifest = await (await fetch('/manifest.webmanifest')).json();
    return [
      ...manifest.icons.map((icon: { src: string }) => icon.src),
      document
        .querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')!
        .getAttribute('href')!,
      document
        .querySelector<HTMLLinkElement>('link[rel="icon"]')!
        .getAttribute('href')!,
      '/logo.svg',
    ];
  });
  await context.setOffline(true);
  const assets = await page.evaluate(
    async (paths) =>
      Promise.all(
        paths.map(async (src: string) => {
          const response = await fetch(src);
          const blob = await response.blob();
          const image = new Image();
          image.src = URL.createObjectURL(blob);
          await image.decode();
          URL.revokeObjectURL(image.src);
          return {
            src,
            ok: response.ok,
            width: image.naturalWidth,
            height: image.naturalHeight,
          };
        }),
      ),
    paths,
  );
  expect(
    assets.every(
      (asset) => asset.ok && asset.width > 0 && asset.width === asset.height,
    ),
  ).toBe(true);
  expect(assets.slice(0, 3).map((asset) => asset.width)).toEqual([
    192, 512, 180,
  ]);
  await context.setOffline(false);
});
