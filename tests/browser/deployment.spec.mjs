import { test, expect } from '@playwright/test';

test('prepared package serves the scene and Unicode image with deployment headers', async ({ page, request }) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  const response=await page.goto('/');
  expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(response.headers()['cache-control']).toBe('public, max-age=0, must-revalidate');
  await expect(page.locator('body')).toHaveAttribute('data-renderer','webgl');
  await page.locator('#signature').click();
  await expect(page.locator('#signature')).toHaveAttribute('aria-pressed','true');
  const photo=await request.get(`/${encodeURIComponent('Bajo la mirada cinemática.png')}`);
  expect(photo.status()).toBe(200);expect(photo.headers()['content-type']).toContain('image/png');
  expect((await request.get('/vendor/three.module.js')).status()).toBe(200);
  expect((await request.get('/src/flight.js')).status()).toBe(404);
  expect((await request.get('/.env')).status()).toBe(404);
  expect((await request.get('/.git/config')).status()).toBe(404);
  expect(errors).toEqual([]);
});
