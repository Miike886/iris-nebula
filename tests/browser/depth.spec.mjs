import {test,expect} from '@playwright/test';
test('tour reaches the rear of the formation and the character cloud',async({page})=>{
  await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-renderer','webgl');
  const inspect=()=>page.evaluate(async()=>{const {scene:s}=await import('/src/app.js');return {position:s.flight.position,goal:s.flight.goal,yaw:s.flight.yaw,time:s.time,pulse:s.uniforms.uPulse.value};});
  await page.locator('#visit').click();await page.locator('#visit').click();await page.locator('#visit').click();
  await expect.poll(async()=>(await inspect()).goal).toBeNull();expect((await inspect()).position.z).toBeLessThan(-6);
  await page.screenshot({path:'test-results/deep-character-cloud.png'});
  await page.locator('#visit').click();await expect.poll(async()=>(await inspect()).goal).toBeNull();
  const behind=await inspect();expect(behind.position.z).toBeLessThan(-13);expect(Math.abs(behind.yaw)).toBeGreaterThan(1.5);
  await page.screenshot({path:'test-results/reverse-view.png'});
  await page.locator('#universe').click({position:{x:700,y:450}});const pulsed=await inspect();expect(pulsed.pulse).toBeGreaterThan(0);
  await page.locator('#pause').click();await page.waitForTimeout(100);const stopped=await inspect();await page.waitForTimeout(120);expect((await inspect()).time).toBe(stopped.time);
});
test('context loss switches to local photograph without leaving active controls',async({page})=>{
  await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-renderer','webgl');
  await page.evaluate(async()=>{const {scene}=await import('/src/app.js');scene.renderer.forceContextLoss();});
  await expect(page.locator('body')).toHaveAttribute('data-renderer','fallback');await expect(page.locator('#fallback')).toBeVisible();await expect(page.locator('.tools')).not.toBeVisible();
});
