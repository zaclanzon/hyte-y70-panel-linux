// Run against an isolated panel server; the Save response is mocked so no configuration is written.
const { chromium } = require(process.env.HYTE_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true,...(process.env.HYTE_CHROMIUM ? {executablePath:process.env.HYTE_CHROMIUM} : {}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1100,height:850}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='warning' && m.text().includes('ambient:')) errors.push(m.text())});
 await page.addInitScript(()=>{
   window.metrics={contexts:0,draws:0,copies:0,compiles:0};
   const original=HTMLCanvasElement.prototype.getContext;
   const seen=new WeakSet();
   HTMLCanvasElement.prototype.getContext=function(type,...args){const ctx=original.call(this,type,...args); if(type==='webgl' && ctx && !seen.has(ctx)){seen.add(ctx);metrics.contexts++; const compile=ctx.compileShader.bind(ctx);ctx.compileShader=(...args)=>{metrics.compiles++;return compile(...args)}; const draw=ctx.drawArrays.bind(ctx);ctx.drawArrays=(...args)=>{metrics.draws++;return draw(...args)}} return ctx;};
   const copy=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(...args){metrics.copies++;return copy.apply(this,args)};
 });
 await page.route('**/api/settings', async route => {
   if(route.request().method()==='PUT') return route.fulfill({json:{config:route.request().postDataJSON()}});
   return route.continue();
 });
 await page.goto((process.env.HYTE_TEST_URL || 'http://127.0.0.1:8137') + '/settings');
 await page.waitForSelector('.bg');
 const count = await page.locator('.bg').count();
 console.log('tiles',count);
 await page.locator('.bg').first().scrollIntoViewIfNeeded(); await page.waitForTimeout(1300);
 console.log('initial',await page.evaluate(()=>metrics));
 // Scroll every design through view: compile and draw every shader, including coral.
 for(let i=0;i<count;i+=4){await page.locator('.bg').nth(i).scrollIntoViewIfNeeded();await page.waitForTimeout(350);}
 await page.locator('.bg').last().scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
 assert.equal(errors.length,0,errors.join('\n'));
 if(process.env.HYTE_SCREENSHOT) await page.screenshot({path:process.env.HYTE_SCREENSHOT});
 const before=await page.evaluate(()=>({...metrics}));await page.waitForTimeout(1000);const after=await page.evaluate(()=>({...metrics}));
 console.log('one second',Object.fromEntries(Object.keys(before).map(k=>[k,after[k]-before[k]])), 'total',after);
 assert.ok(after.copies>before.copies,'visible previews must animate without hover');
 assert.equal(after.contexts,1,'the entire settings gallery must share one WebGL context');
 assert.equal(after.compiles,before.compiles,'steady animation must reuse compiled shaders');
 const visible = await page.locator('.bg').evaluateAll(buttons => buttons.filter(b => {const r=b.getBoundingClientRect();return r.bottom>0 && r.top<innerHeight}).length);
 assert.ok(after.copies-before.copies <= visible*16, 'previews must stay below 16 frames per second');
 const pixels = await page.locator('.bg').evaluateAll(buttons => buttons.filter(b => {const r=b.getBoundingClientRect();return r.bottom>0 && r.top<innerHeight}).reduce((sum,b)=>{const c=b.querySelector('canvas');return sum+c.width*c.height},0));
 assert.ok(pixels <= 96000, 'visible previews must fit their combined pixel budget');
 const frames=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.bg')].slice(-3).map(b=>[b.dataset.id,b.querySelector('canvas').toDataURL()])));
 await page.waitForTimeout(250);
 const changed=await page.evaluate(prev=>Object.fromEntries([...document.querySelectorAll('.bg')].slice(-3).map(b=>[b.dataset.id,prev[b.dataset.id]!==b.querySelector('canvas').toDataURL()])),frames);
 console.log('new themes change frames',changed);assert.ok(Object.values(changed).every(Boolean));
 // Saving must preserve the actual canvases, their pixels and compiled programs.
 await page.evaluate(()=>{window.savedCanvases=[...document.querySelectorAll('.bg canvas')];window.savedMetrics={...metrics}});
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Saved.'));
 await page.waitForTimeout(200);
 assert.ok(await page.evaluate(()=>savedCanvases.every((c,i)=>c===document.querySelectorAll('.bg canvas')[i])), 'Save must reuse preview canvases');
 assert.equal(await page.evaluate(()=>metrics.contexts-savedMetrics.contexts),0,'Save must not create new contexts');
 assert.equal(await page.evaluate(()=>metrics.compiles-savedMetrics.compiles),0,'Save must not recompile shaders');
 console.log('PASS Save preserves canvases and compiled shaders');
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);const still=await page.evaluate(()=>metrics.copies);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>metrics.copies),still,'reduced motion must stay still');
 await page.emulateMedia({reducedMotion:'no-preference'});
 // Simulate the Page Visibility transition without relying on headless tab focus.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
 await page.waitForTimeout(200);const hidden=await page.evaluate(()=>metrics.copies);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>metrics.copies),hidden,'hidden tabs must stop');
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});
 await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>metrics.copies)>hidden,'visible tabs must resume');
 await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(500);const off=await page.evaluate(()=>metrics.copies);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>metrics.copies),off,'offscreen tiles must stop');
 console.log('PASS shader compilation, automatic animation, reduced motion, offscreen pause');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
