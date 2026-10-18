import {test,expect} from '@playwright/test';
const state=page=>page.evaluate(async()=>{const{scene:s}=await import('/src/app.js');const p=s.camera.position,d=s.camera.getWorldDirection(s.pointerTarget.clone());return {position:{x:p.x,y:p.y,z:p.z},radius:p.length(),centerDot:d.dot(p.clone().normalize().negate()),orbit:{...s.orbit.current},target:{...s.orbit.target},time:s.time,frame:s.frame,material:s.material,paused:s.paused,focus:s.focusIndex,focusAmount:s.uniforms.uFocusAmount.value,hover:s.uniforms.uHover.value,pulse:s.uniforms.uPulse.value,points:s.field.geometry.attributes.position.count,calls:s.renderer.info.render.calls};});
const ready=async page=>{await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-renderer','webgl');};
const detail=page=>page.evaluate(async()=>{const{scene:s}=await import('/src/app.js');return {reveal:s.uniforms.uReveal.value,signature:s.uniforms.uSignature.value,pointer:s.uniforms.uPointer.value.toArray()};});

test('hold reveals the photo without orbiting; stars and signature respond to direct input',async({page})=>{
  await ready(page);await page.mouse.click(100,180);expect((await state(page)).pulse).toBeGreaterThan(0);
  const start=await state(page);await page.mouse.move(720,420);await page.mouse.down();
  await expect.poll(async()=>(await detail(page)).reveal).toBeGreaterThan(.95);
  const before=await detail(page);await page.mouse.move(1000,500,{steps:8});
  expect((await state(page)).orbit).toEqual(start.orbit);expect((await detail(page)).pointer).not.toEqual(before.pointer);
  await page.screenshot({path:'test-results/desktop-reveal.png'});
  await page.mouse.up();await expect.poll(async()=>(await detail(page)).reveal).toBe(0);
  await page.locator('#signature').click();await expect(page.locator('#signature')).toHaveAttribute('aria-pressed','false');await expect.poll(async()=>(await detail(page)).signature).toBe(0);
  await page.locator('#signature-toggle').click();await expect.poll(async()=>(await detail(page)).signature).toBe(1);
  await page.mouse.move(30,100);await page.screenshot({path:'test-results/desktop-signature.png'});
  await page.locator('#reset').click();await expect.poll(async()=>(await detail(page)).signature).toBe(1);
  await page.locator('#universe').focus();await page.keyboard.press('b');await expect(page.locator('#signature')).toHaveAttribute('aria-pressed','false');
  await page.keyboard.down('v');await expect.poll(async()=>(await detail(page)).reveal).toBeGreaterThan(.95);
  const keyPointer=(await detail(page)).pointer;await page.keyboard.press('ArrowRight');await expect.poll(async()=>(await detail(page)).pointer[0]).toBeGreaterThan(keyPointer[0]+.5);expect((await state(page)).orbit).toEqual(start.orbit);
  await page.keyboard.up('v');await expect.poll(async()=>(await detail(page)).reveal).toBe(0);
});

test('touch hold cancels cleanly, second finger resumes zoom, and constellation remains accessible',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const page=await context.newPage();await ready(page);
  const cdp=await context.newCDPSession(page),start=await state(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:420,id:1}]});await expect.poll(async()=>(await detail(page)).reveal).toBeGreaterThan(.95);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:280,y:445,id:1}]});expect((await state(page)).orbit).toEqual(start.orbit);
  await page.screenshot({path:'test-results/mobile-reveal.png'});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect.poll(async()=>(await detail(page)).reveal).toBe(0);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:420,id:1}]});await expect.poll(async()=>(await detail(page)).reveal).toBeGreaterThan(.95);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:420,id:1},{x:280,y:420,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:140,y:420,id:1},{x:310,y:420,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(async()=>(await detail(page)).reveal).toBe(0);await expect.poll(async()=>(await state(page)).orbit.zoom).toBeLessThan(.7);
  await page.locator('#reset').tap();await expect.poll(async()=>(await state(page)).orbit.zoom).toBe(1);
  await page.locator('#signature-toggle').tap();await expect.poll(async()=>(await detail(page)).signature).toBe(0);
  await page.locator('#signature').tap();await expect.poll(async()=>(await detail(page)).signature).toBe(1);await page.screenshot({path:'test-results/mobile-signature.png'});
  await context.close();
});

test('desktop: recognizable initial image, bounded orbit, perspective and zoom',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await ready(page);await page.screenshot({path:'test-results/desktop-start.png'});const start=await state(page);
  expect(start.material).toBe(1.35);await expect(page.locator('#matter')).toHaveValue('135');expect(start.calls).toBeLessThan(10);expect(start.centerDot).toBeCloseTo(1,5);
  expect((await detail(page)).signature).toBe(1);await expect(page.locator('#signature-toggle')).toHaveAttribute('aria-pressed','true');
  await page.mouse.move(700,400);await page.mouse.down();await page.mouse.move(510,460,{steps:12});await page.mouse.up();
  await expect.poll(async()=>(await state(page)).orbit.yaw).toBeCloseTo(.89,2);
  const rotated=await state(page);expect(rotated.position.x).not.toBe(start.position.x);expect(rotated.radius).toBeCloseTo(start.radius,5);expect(rotated.centerDot).toBeCloseTo(1,5);
  await page.mouse.move(40,100);await page.screenshot({path:'test-results/desktop-orbit.png'});
  await page.mouse.move(700,420);await page.mouse.wheel(0,-180);await expect.poll(async()=>(await state(page)).radius).toBeLessThan(start.radius*.8);
  await page.locator('#reset').click();await expect.poll(async()=>(await state(page)).orbit).toEqual(start.orbit);
  await page.locator('#universe').focus();await page.keyboard.press('ArrowLeft');await expect.poll(async()=>(await state(page)).orbit.yaw).toBeLessThan(start.orbit.yaw);
  expect(errors).toEqual([]);
});

test('continuous materials and source-anchored local interactions',async({page})=>{
  await ready(page);await page.locator('#matter').fill('100');await expect.poll(async()=>(await state(page)).material).toBe(1);await page.screenshot({path:'test-results/desktop-particles.png'});
  await page.locator('#matter').fill('200');await expect.poll(async()=>(await state(page)).material).toBe(2);await page.screenshot({path:'test-results/desktop-ascii.png'});
  await page.locator('#matter').fill('0');await expect.poll(async()=>(await state(page)).material).toBe(0);
  await page.screenshot({path:'test-results/desktop-photo.png'});
  await page.locator('#reset').click();await expect.poll(async()=>(await state(page)).material).toBe(1.35);
  await page.locator('[data-focus="1"]').click();await expect.poll(async()=>(await state(page)).focusAmount).toBeGreaterThan(.95);expect((await state(page)).focus).toBe(1);await page.screenshot({path:'test-results/local-ascii.png'});
  await page.locator('[data-focus="1"]').click();await expect.poll(async()=>(await state(page)).focusAmount).toBe(0);
  await page.mouse.move(720,420);await expect.poll(async()=>(await state(page)).hover).toBeGreaterThan(.9);await page.mouse.click(720,420);expect((await state(page)).pulse).toBeGreaterThan(0);
});

test('pause and reduced motion stop idle frames but retain direct controls',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await ready(page);await expect(page.locator('#pause')).toHaveAttribute('aria-pressed','true');await expect.poll(async()=>(await state(page)).frame).toBe(0);
  const before=await state(page);expect(before.material).toBe(1.35);await page.waitForTimeout(100);expect((await state(page)).time).toBe(before.time);
  await expect(page.locator('#wave')).toBeDisabled();
  await page.locator('#signature').click();await expect.poll(async()=>(await detail(page)).signature).toBe(0);await expect.poll(async()=>(await state(page)).frame).toBe(0);
  await page.locator('#reveal').click();await expect.poll(async()=>(await detail(page)).reveal).toBe(1);await expect.poll(async()=>(await state(page)).frame).toBe(0);
  await page.locator('#reveal').click();await expect.poll(async()=>(await detail(page)).reveal).toBe(0);
  await page.locator('#universe').focus();await page.keyboard.down('v');await expect.poll(async()=>(await detail(page)).reveal).toBe(1);await page.keyboard.up('v');await expect.poll(async()=>(await detail(page)).reveal).toBe(0);
  await page.locator('#forward').click();await expect.poll(async()=>(await state(page)).orbit.zoom).toBe(.85);
  await page.locator('[data-focus="0"]').click();await expect.poll(async()=>(await state(page)).focusAmount).toBe(1);await expect.poll(async()=>(await state(page)).frame).toBe(0);
  await page.locator('#help-open').click();await expect(page.locator('#help')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#help-open')).toBeFocused();
  await page.locator('#pause').click();await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(before.time);await page.locator('#pause').click();await expect.poll(async()=>(await state(page)).frame).toBe(0);
});

test('mobile: one-finger orbit, pinch zoom, large hit targets and landscape',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const page=await context.newPage();await ready(page);await page.screenshot({path:'test-results/mobile-start.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  const start=await state(page),cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:350,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:250,y:385,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(async()=>(await state(page)).orbit.yaw).toBeLessThan(0);expect((await state(page)).radius).toBeCloseTo(start.radius,4);
  await page.locator('#reset').tap();await expect.poll(async()=>(await state(page)).orbit).toEqual(start.orbit);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:350,id:1},{x:270,y:350,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:80,y:350,id:1},{x:310,y:350,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(async()=>(await state(page)).orbit.zoom).toBeLessThan(.7);expect((await state(page)).centerDot).toBeCloseTo(1,5);
  await page.locator('#reset').tap();await expect.poll(async()=>(await state(page)).orbit.zoom).toBe(1);
  await page.locator('#forward').tap();await expect.poll(async()=>(await state(page)).orbit.zoom).toBe(.85);
  await page.locator('#reset').tap();await expect.poll(async()=>(await state(page)).orbit.zoom).toBe(1);
  const hit=await page.locator('[data-focus="1"]').boundingBox();expect(hit.width).toBeGreaterThanOrEqual(44);await page.locator('[data-focus="1"]').tap();await expect.poll(async()=>(await state(page)).focusAmount).toBeGreaterThan(.95);await page.screenshot({path:'test-results/mobile-local-ascii.png'});
  await page.locator('#reset').tap();await page.setViewportSize({width:844,height:390});await expect.poll(async()=>(await state(page)).focusAmount).toBe(0);await page.screenshot({path:'test-results/mobile-landscape.png'});await expect(page.locator('#reset')).toBeInViewport();await context.close();
});

test('brows remain in the sampled image and the nebula surrounds it in depth',async({page})=>{
  await ready(page);
  const composition=await page.evaluate(async()=>{
    const {scene:s}=await import('/src/app.js'),p=s.field.geometry.attributes.position,d=s.field.geometry.attributes.aDust;
    const brows=[0,0];
    for(let i=0;i<p.count;i++)if(d.getX(i)===0&&p.getY(i)>s.aspect*16*.62&&Math.abs(p.getX(i))>7&&Math.abs(p.getX(i))<12)brows[p.getX(i)<0?0:1]++;
    const centers=s.nebula.geometry.attributes.aCenter,z=Array.from({length:centers.count},(_,i)=>centers.getZ(i));
    return {brows,near:Math.max(...z),far:Math.min(...z),drawCalls:s.renderer.info.render.calls};
  });
  expect(composition.brows[0]).toBeGreaterThan(100);expect(composition.brows[1]).toBeGreaterThan(100);
  expect(composition.near).toBeGreaterThan(3);expect(composition.far).toBeLessThan(-40);expect(composition.drawCalls).toBeLessThan(10);
});

test('missing WebGL and context loss provide the local photographic fallback',async({page})=>{
  await ready(page);await page.evaluate(async()=>{const{scene}=await import('/src/app.js');scene.renderer.forceContextLoss();});await expect(page.locator('body')).toHaveAttribute('data-renderer','fallback');await expect(page.locator('.tools')).not.toBeVisible();
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl')?null:original.call(this,type,...args);};});
  await page.reload();await expect(page.locator('body')).toHaveAttribute('data-renderer','fallback');expect(await page.locator('#fallback img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);await page.screenshot({path:'test-results/fallback.png'});
});

test('visible UI controls reveal, waves and Berenice on desktop and narrow touch screens',async({browser})=>{
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:320,height:740}:{width:1440,height:900},hasTouch:mobile,isMobile:mobile});
    const page=await context.newPage();await ready(page);
    const press=selector=>page.locator(selector)[mobile?'tap':'click']();
    for(const id of ['reveal','wave','signature-toggle']){const button=page.locator(`#${id}`);await expect(button).toBeInViewport();const box=await button.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);}
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(mobile?320:1440);
    expect((await detail(page)).signature).toBe(1);
    await press('#reveal');await expect(page.locator('#reveal')).toHaveAttribute('aria-pressed','true');await expect.poll(async()=>(await detail(page)).reveal).toBe(1);
    const before=await state(page);
    if(mobile){await page.touchscreen.tap(190,365);}else{await page.mouse.move(700,420);await page.mouse.down();await page.mouse.move(800,430,{steps:5});await page.mouse.up();}
    expect((await state(page)).orbit).toEqual(before.orbit);expect((await detail(page)).reveal).toBe(1);
    await press('#reveal');await expect.poll(async()=>(await detail(page)).reveal).toBe(0);
    const pulse=(await state(page)).pulse;await press('#wave');expect((await state(page)).pulse).toBeGreaterThan(pulse);
    await press('#signature-toggle');await expect.poll(async()=>(await detail(page)).signature).toBe(0);await expect(page.locator('#signature')).toHaveAttribute('aria-pressed','false');
    await press('#reset');await expect.poll(async()=>(await detail(page)).signature).toBe(1);await expect(page.locator('#reveal')).toHaveAttribute('aria-pressed','false');
    await page.screenshot({path:`test-results/${mobile?'narrow-mobile':'desktop'}-ui.png`});
    await context.close();
  }
});
