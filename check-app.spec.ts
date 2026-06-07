import { test } from '@playwright/test';

test('hono client loads canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/hono-client-check.png', fullPage: true });
  const imgs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img')).map((e) => ({
      src: (e as HTMLImageElement).src,
      loaded: (e as HTMLImageElement).naturalWidth > 0,
    })),
  );
  console.log('ERRORS:', JSON.stringify(errors));
  console.log('IMAGES:', JSON.stringify(imgs));
  console.log('CARDS:', await page.locator('.absolute.rounded-2xl').count());
});
