import { test, expect } from '@playwright/test';
const state=page=>page.evaluate(async()=>{const{scene:s}=await import('/src/app.js');return {position:{...s.flight.position},yaw:s.flight.yaw,pitch:s.flight.pitch,time:s.time,frame:s.frame,material:s.material,paused:s.paused,points:s.field.geometry.attributes.position.count,calls:s.renderer.info.render.calls,zone:s.zone};});
const ready=async page=>{await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-renderer','webgl');};

test('desktop: GPU scene, true camera translation, looking, materials and reset',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await ready(page);await page.screenshot({path:'test-results/desktop-start.png'});
  const start=await state(page);expect(start.points).toBeGreaterThan(30000);expect(start.calls).toBeLessThan(22);
  await page.locator('#universe').focus();await page.keyboard.down('w');await page.waitForTimeout(450);await page.keyboard.up('w');
  expect((await state(page)).position.z).toBeLessThan(start.position.z-1);
  const beforeLook=await state(page);await page.mouse.move(700,400);await page.mouse.down();await page.mouse.move(830,440,{steps:8});await page.mouse.up();
  const afterLook=await state(page);expect(afterLook.yaw).not.toBe(beforeLook.yaw);expect(afterLook.position).toEqual(beforeLook.position);
  await page.keyboard.down('d');await page.waitForTimeout(300);await page.keyboard.up('d');expect((await state(page)).position.x).not.toBe(start.position.x);
  const beforeWheel=await state(page);await page.mouse.wheel(0,-160);await page.waitForTimeout(100);expect((await state(page)).position.z).not.toBe(beforeWheel.position.z);
  await page.locator('#reset').click();await expect.poll(async()=>(await state(page)).position).toEqual(start.position);
  await page.locator('#matter').fill('100');await expect.poll(async()=>(await state(page)).material).toBeCloseTo(1,1);await page.screenshot({path:'test-results/desktop-ascii.png'});
  await page.locator('#matter').fill('200');await expect.poll(async()=>(await state(page)).material).toBe(2);await page.screenshot({path:'test-results/desktop-photo.png'});
  await page.locator('#visit').click();await expect.poll(async()=>(await state(page)).position.z).toBeLessThan(9.1);await page.screenshot({path:'test-results/desktop-near-eye.png'});
  expect(errors).toEqual([]);
});

test('pause, reduced motion, help focus and idle rendering',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await ready(page);
  await expect(page.locator('#pause')).toHaveAttribute('aria-pressed','true');
  await expect.poll(async()=>(await state(page)).frame).toBe(0);
  const before=await state(page);await page.waitForTimeout(150);expect((await state(page)).time).toBe(before.time);
  await page.locator('#forward').click();expect((await state(page)).position.z).toBe(before.position.z-2);
  await page.locator('#visit').click();expect((await state(page)).position.z).toBeCloseTo(9);
  await page.locator('#help-open').click();await expect(page.locator('#help')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#help')).not.toBeVisible();await expect(page.locator('#help-open')).toBeFocused();
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#pause').click();await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(0);
  await page.locator('#pause').click();await expect.poll(async()=>(await state(page)).frame).toBe(0);
});

test('mobile: touch rotation, two-finger travel, directional control and layout',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const page=await context.newPage();await ready(page);
  await page.screenshot({path:'test-results/mobile-start.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  const initial=await state(page);expect(initial.points).toBeLessThan(30000);
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:350,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:250,y:375,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect((await state(page)).yaw).not.toBe(initial.yaw);
  await page.locator('#reset').tap();const before=await state(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:340,id:1},{x:250,y:340,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:95,y:370,id:1},{x:285,y:370,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=await state(page);expect(after.position.z).toBeLessThan(before.position.z);expect(after.position.y).not.toBe(before.position.y);
  const button=await page.locator('[data-move=forward]').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:button.x+button.width/2,y:button.y+button.height/2,id:3}]});
  await page.waitForTimeout(300);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expect((await state(page)).position.z).toBeLessThan(after.position.z);
  await page.locator('#visit').tap();await expect.poll(async()=>(await state(page)).position.z).toBeLessThan(13.1);await page.screenshot({path:'test-results/mobile-near-eye.png'});
  await page.setViewportSize({width:844,height:390});await page.screenshot({path:'test-results/mobile-landscape.png'});expect(await page.locator('#reset').isVisible()).toBe(true);
  await context.close();
});

test('without WebGL, photograph remains available and 3D controls are hidden',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.includes('webgl'))return null;return original.call(this,type,...args);};});
  await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-renderer','fallback');await expect(page.locator('#fallback')).toBeVisible();await expect(page.locator('.tools')).not.toBeVisible();
  expect(await page.locator('#fallback img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);await page.screenshot({path:'test-results/fallback.png'});
});
