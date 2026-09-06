// Isolated fixtures: no live config writes or hardware actions.
const {chromium} = require(process.env.HYTE_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../hyte_panel/static');
const fixture = {
 config: {
  version:'test', refresh_seconds:1, display:{dim_after_seconds:0},
  layout:{widgets:['clock','weather','cpu','gpu','memory','network','agents','automata']},
  background:'liquid', weather:{enabled:true}, agents:{enabled:true}, apps:[],
  automata:{enabled:true,rule:'life',cell:2,attract_idle_seconds:45,attract_rotate_seconds:120,reactive:true},
 },
 snapshot: {
  hostname:'panel-test',uptime_seconds:3600,
  cpu:{model:'Test CPU',percent:25,per_core:[25,25,25,25],freq_mhz:4000,temp_c:50,load:[1,1,1]},
  memory:{used:8e9,total:16e9,percent:50},disks:[{mount:'/',used:1e11,total:1e12,percent:10}],
  network:{interface:'all',down_bps:0,up_bps:0},fans:[{name:'CPU',rpm:800}],gpus:[],agents:[],
  weather:{ok:true,units:'metric',icon:'sun',temp:22,feels_like:21,humidity:45,wind:10,description:'Clear',label:'Test',daily:[{date:'2026-09-06',icon:'sun',max:24,min:16}]},
 },
};
(async () => {
 const browser = await chromium.launch({headless:true, executablePath:process.env.HYTE_CHROMIUM, args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
 const page = await browser.newPage({viewport:{width:720,height:2560}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://panel.test/**',route=>{
  const url = new URL(route.request().url());
  const name = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/static\//,'');
  if (name==='ca/ca.js') return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,name),'utf8')+'\nconst mountOriginal=CA.mount; CA.mount=(...args)=>(window.testCA=mountOriginal(...args));'});
  return route.fulfill({path:path.join(root,name)});
 });
 await page.addInitScript(f=>{
  window.sendSnapshot=()=>window.socket.onmessage({data:JSON.stringify({type:'snapshot',data:f.snapshot})});
  window.WebSocket=class {
   static OPEN=1;
   constructor(){window.socket=this;this.readyState=1;setTimeout(()=>{this.onopen();this.onmessage({data:JSON.stringify({type:'config',data:f.config})});sendSnapshot();},0);}
   send(){} close(){}
  };
 },fixture);
 await page.goto('http://panel.test/');
 await page.waitForFunction(()=>window.testCA && testCA.gen>0);
 await page.evaluate(()=>{
  testCA.pause();
  window.nodes=['weather-days','disk-rows','fans','agent-list','cpu-model'].map(id=>document.getElementById(id).firstChild);
  window.counts={read:0,readAsync:0,render:0,step:0};
  for(const k of Object.keys(counts)){const fn=testCA.engine[k].bind(testCA.engine);testCA.engine[k]=(...args)=>{counts[k]++;return fn(...args);};}
 });
 await page.waitForFunction(()=>!testCA.engine.readFence && !testCA.state.dirty);
 await page.evaluate(()=>{counts.read=counts.readAsync=counts.render=counts.step=0;for(let i=0;i<10;i++)sendSnapshot();});
 assert.ok(await page.evaluate(()=>['weather-days','disk-rows','fans','agent-list','cpu-model'].every((id,i)=>document.getElementById(id).firstChild===nodes[i])), 'unchanged widgets retain nodes');
 await page.waitForTimeout(1300);
 assert.deepEqual(await page.evaluate(()=>counts),{read:0,readAsync:0,render:0,step:0},'paused world does no engine work');
 await page.evaluate(()=>testCA.step());await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>counts.step),1);
 assert.ok(await page.evaluate(()=>counts.render)>0,'paused edits render');
 await page.evaluate(()=>{testCA.play();testCA.setPaused(true);testCA.setPaused(true);counts.read=counts.readAsync=counts.render=counts.step=0;sendSnapshot();});
 await page.waitForTimeout(1200);
 assert.deepEqual(await page.evaluate(()=>counts),{read:0,readAsync:0,render:0,step:0},'suspended world does no engine work');
 await page.evaluate(()=>testCA.setPaused(false));await page.waitForTimeout(250);
 assert.ok(await page.evaluate(()=>counts.step)>0,'repeated suspension resumes');
 await page.evaluate(()=>{testCA.pause();testCA.setPaused(true);testCA.setPaused(false);});await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>testCA.state.playing),false,'suspension preserves manual pause');
 await page.evaluate(()=>{testCA.play();Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));counts.read=counts.readAsync=counts.render=counts.step=0;});
 await page.waitForTimeout(1200);
 assert.deepEqual(await page.evaluate(()=>counts),{read:0,readAsync:0,render:0,step:0},'hidden tab does no engine work');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(250);
 assert.ok(await page.evaluate(()=>counts.step)>0,'visible tab resumes');
 await page.screenshot({path:process.env.HYTE_SCREENSHOT || '/tmp/hyte-panel-optimized.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS unchanged DOM, paused edits, suspension, manual pause, hidden-tab resume');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
