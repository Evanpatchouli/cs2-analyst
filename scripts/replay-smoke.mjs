// Real built/installed Electron validation, using only the explicitly selected local Dust2 DEM.
import assert from 'node:assert/strict';
import { spawn,spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { inspectReplayPackage } from './replay-package-inspection.mjs';
import { assertNoPageScroll, assertLocalScroll, waitForUi } from './window-shell-checks.mjs';
/** Map Replay must behave like a tool surface: no page scroll, square radar, locally scrolling rail. */
async function checkReplayLayout(evaluate, label) {
  await waitForUi(evaluate, `(() => {
    const c = document.querySelector('#replay-panel canvas[role=img]');
    return c && Math.abs(c.width - c.getBoundingClientRect().width * devicePixelRatio) <= 1 && [...c.parentElement.querySelectorAll('canvas')].every(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0));
  })()`, label + ' Canvas resize');
  await assertNoPageScroll(evaluate, label);
  const layout = await evaluate(`(() => {
    const panel = document.getElementById('replay-panel');
    const canvas = panel.querySelector('canvas[role=img]'), map = canvas.parentElement, host = map.parentElement;
    const r = map.getBoundingClientRect(), h = host.getBoundingClientRect(), s = getComputedStyle(host);
    const left = h.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
    const top = h.top + parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop);
    const right = h.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight);
    const bottom = h.bottom - parseFloat(s.borderBottomWidth) - parseFloat(s.paddingBottom);
    const contained = e => { const r = e.getBoundingClientRect(), p = panel.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= p.left - 1 && r.right <= p.right + 1 && r.top >= p.top - 1 && r.bottom <= p.bottom + 1; };
    const bitmapNonempty = c => { const ctx = c.getContext('2d'), data = ctx.getImageData(0, 0, c.width, c.height).data; return data.some((v, i) => i % 4 === 3 && v > 0); };
    return { panelOverflow: panel.scrollHeight - panel.clientHeight,
      square: Math.abs(r.width - r.height) <= 1, size: r.width, available: Math.min(right - left, bottom - top),
      contained: r.left >= left - .1 && r.right <= right + .1 && r.top >= top - .1 && r.bottom <= bottom + .1,
      canvases: [...map.querySelectorAll('canvas')].map(c => ({ pixels: c.width, height: c.height, css: c.getBoundingClientRect().width, dpr: devicePixelRatio, drawn: bitmapNonempty(c) })),
      controls: contained(document.querySelector('[aria-label="播放回放"], [aria-label="暂停回放"]')),
      timeline: contained(document.querySelector('[aria-label="回放进度"]')),
      players: !!panel.querySelector('[aria-label="回放玩家状态"] button'), events: !!panel.querySelector('[aria-label="回放事件浏览"]') };
  })()`);
  assert.ok(layout.panelOverflow <= 1, `${label}: panel must not clip overflow`);
  assert.equal(layout.square, true, `${label}: radar must be square`);
  assert.equal(layout.contained, true, `${label}: radar exceeds padding/border content bounds ${JSON.stringify(layout)}`);
  assert.ok(layout.size > 0 && layout.size >= Math.floor(layout.available) - 1, `${label}: radar uses the available square`);
  for (const c of layout.canvases) {
    assert.equal(c.pixels, c.height);
    assert.ok(Math.abs(c.pixels - c.css * c.dpr) <= 1, `${label}: DPR bitmap mismatch`);
    assert.equal(c.drawn, true, `${label}: Canvas must be redrawn after resize`);
  }
  assert.equal(layout.controls, true, `${label}: playback control clipped`);
  assert.equal(layout.timeline, true, `${label}: bottom timeline clipped`);
  assert.equal(layout.players, true); assert.equal(layout.events, true);
  const narrow=await evaluate('innerWidth <= 860');
  // Narrow mode deliberately delegates the visible-overflow rail to the body scroller.
  await assertLocalScroll(evaluate, '[data-replay-body], ' + (narrow ? '' : '[data-replay-rail], ') + '[aria-label="回放玩家状态"], [aria-label="回放事件浏览"]', label);
  await assertReplayContentAccessible(evaluate,label);
}

async function assertReplayContentAccessible(evaluate,label) {
  const accessible=await evaluate(`(() => {
    const panel=document.getElementById('replay-panel');
    const saved=[panel,...panel.querySelectorAll('*')].filter(e=>typeof e.scrollTo==='function').map(e=>[e,e.scrollTop,e.scrollLeft]);
    const selectors=['[aria-label="回放玩家状态"] button:first-child','[aria-label="回放玩家状态"] button:last-child','[aria-label="回放事件浏览"] > :first-child','[aria-label="回放事件浏览"] > :last-child','[aria-label="回放进度"]','[aria-label="回放回合"]'];
    try{return selectors.map(selector=>{
      const element=panel.querySelector(selector);if(!element)return {selector,ok:false};
      element.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
      const r=element.getBoundingClientRect();
      let ok=r.width>0&&r.height>0&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1;
      for(let ancestor=element.parentElement;ancestor;ancestor=ancestor.parentElement){
        const style=getComputedStyle(ancestor),a=ancestor.getBoundingClientRect();
        // scrollIntoView can programmatically scroll hidden containers; users cannot.
        if(['hidden','clip'].includes(style.overflowY)&&ancestor.scrollHeight-ancestor.clientHeight>1)ok=false;
        if(['auto','scroll','hidden','clip'].includes(style.overflowY))ok=ok&&r.top>=a.top+ancestor.clientTop-1&&r.bottom<=a.top+ancestor.clientTop+ancestor.clientHeight+1;
      }
      return {selector,ok};
    });}finally{for(const [e,top,left] of saved)e.scrollTo({top,left,behavior:'instant'});}
  })()`);
  for(const item of accessible)assert.equal(item.ok,true,`${label}: unreachable ${item.selector}`);
}
const root=fileURLToPath(new URL('../',import.meta.url)),desktop=join(root,'apps/desktop');
const require=createRequire(new URL('../apps/desktop/package.json',import.meta.url));
const production=process.argv.includes('--production'),broken=process.argv.includes('--broken'),noMaps=process.argv.includes('--no-map');
const qa=join(root,'.tmp/p6-qa');mkdirSync(qa,{recursive:true});
const resourceManifest=JSON.parse(readFileSync(join(root,'docs/replay-resources.json'),'utf8'));
const expectedImages=resourceManifest.maps.flatMap(map=>map.images.map(image=>({prefix:`${map.map}${image.id==='default'?'':'_'+image.id}-`,...image})));
if(broken)writeFileSync(join(qa,'broken.dem'),'synthetic corrupt input, not a real DEM fixture');
const demo=broken?join(qa,'broken.dem'):join(root,'.demo/spirit-vs-faze-m3-dust2.dem');assert.ok(existsSync(demo),'Selected local DEM required; no downloads');
const executableArgument=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
const installed=executableArgument?resolve(executableArgument):null;
const executable=installed??require('electron');assert.ok(existsSync(executable));
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const profilePrefix=join(tmpdir(),'cs2-analyst-replay-profile-');
const profile=mkdtempSync(profilePrefix);
const env={...process.env,NODE_PATH:'',CS2_ANALYST_DEM_PATH:demo,CS2_ANALYST_TEST_DEM_PATH:demo};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL;
const child=spawn(executable,[...(installed?[]:['.']),`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--disable-features=CalculateNativeWinOcclusion','--disable-backgrounding-occluded-windows'],{cwd:installed?dirname(installed):desktop,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let logs='',page,browser,metrics={};child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
async function waitFor(fn,label,timeout=30_000){const end=Date.now()+timeout;while(Date.now()<end){const result=await fn();if(result)return result;if(child.exitCode!==null)throw new Error(`Electron exited: ${logs}`);await delay(50);}throw new Error(`Timed out: ${label}`);}
async function connect(url){
  const socket=new WebSocket(url);
  await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  let sequence=0;const pending=new Map();
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data),request=pending.get(m.id);if(!request)return;pending.delete(m.id);clearTimeout(request.timer);m.error?request.reject(new Error(JSON.stringify(m.error))):request.resolve(m.result);});
  socket.addEventListener('close',()=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('CDP connection closed'));}pending.clear();});
  return {socket,send:(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`${method} timeout`));},120_000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  })};
}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function processTree(){
  // OS children identify the Node utility service and provide lifetime peak working set.
  const result=spawnSync('pwsh',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter "ParentProcessId = ${child.pid}" | ForEach-Object { $taskProcess=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; [pscustomobject]@{ Id=$_.ProcessId; Role=if($_.CommandLine -match 'node.mojom.NodeService'){'analysis-utility'}elseif($_.CommandLine -match '--type=renderer'){'renderer'}elseif($_.CommandLine -match '--type=gpu-process'){'gpu'}else{'other'}; PeakWorkingSet64=$taskProcess.PeakWorkingSet64; WorkingSet64=$taskProcess.WorkingSet64 } } | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw new Error(result.stderr);const value=JSON.parse(result.stdout||'[]');return Array.isArray(value)?value:[value];
}
const quantiles=values=>{const s=values.toSorted((a,b)=>a-b);return {count:s.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)};};
let reportFingerprint,runFailure;
try{
  const target=await waitFor(async()=>{try{return (await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.type==='page');}catch{return null;}},'CDP page');
  page=await connect(target.webSocketDebuggerUrl);const version=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();browser=await connect(version.webSocketDebuggerUrl);
  const exceptions=[];page.socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params);});
  const evaluate=async expression=>{const r=await page.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
  await page.send('Runtime.enable');await page.send('Page.enable');await page.send('Network.enable');await page.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await waitFor(()=>evaluate('Boolean(window.cs2Analyst&&document.querySelector("main"))'),'preload/React');
  assert.equal(await evaluate('typeof window.require'),'undefined');
  const packageInfo=installed?inspectReplayPackage(dirname(installed),production?'production':'test-seam'):null;
  const imagePaths=packageInfo?.imagePaths??readdirSync(join(desktop,'dist/renderer/assets')).filter(f=>expectedImages.some(image=>f.startsWith(image.prefix)&&f.endsWith('.png'))).map(f=>'assets/'+f);
  const decoded=await evaluate(`Promise.all(${JSON.stringify(imagePaths)}.map(path=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve({url:image.src,width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>reject(new Error('Offline radar failed: '+path));image.src=new URL(path,location.href).href;})))`);
  assert.equal(decoded.length,noMaps?0:expectedImages.length);
  for(const image of noMaps?[]:expectedImages){const matches=decoded.filter(i=>i.url.split('/').at(-1).startsWith(image.prefix));assert.equal(matches.length,1);assert.equal(matches[0].width,image.width);assert.equal(matches[0].height,image.height);}
  if(installed)assert.ok(decoded.every(i=>i.url.includes('/resources/app.asar/dist/renderer/assets/')));
  if(production||broken||noMaps){
    metrics={mode:noMaps?'built-event-only':production?'installed-production-startup':installed?'installed-broken':'built-broken',packageInfo,offlineDecodedImages:decoded};
    if(noMaps){await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("选择 DEM")).click()');await waitFor(()=>evaluate('document.querySelector("main")?.dataset.status==="success"'),'event-only report',120000);await evaluate('document.getElementById("replay-tab").click()');await waitFor(()=>evaluate('Number(document.querySelector("[data-replay-session]")?.dataset.replayRevision)>0'),'event-only data');assert.ok((await evaluate('document.getElementById("replay-panel").innerText')).includes('本机没有配套雷达资源'));assert.equal(await evaluate('document.querySelectorAll("#replay-panel canvas").length'),0);assert.ok(await evaluate('document.querySelectorAll("[aria-label=回放玩家状态] button").length>0'));metrics.eventOnlyFallback='PASS';}
    else if(broken){await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("选择 DEM")).click()');await waitFor(()=>evaluate('document.querySelector("main")?.dataset.status==="error"'),'corrupt DEM error');assert.ok((await evaluate('document.body.innerText')).includes('无法分析此 DEM'));await waitFor(async()=>!processTree().some(p=>p.Role==='analysis-utility'),'failed import worker cleanup');metrics.corruptError='PASS';}
    else assert.equal(await evaluate('document.querySelector("main").dataset.status'),'idle');
    void evaluate('window.cs2Analyst.window.close()').catch(()=>{});await waitFor(async()=>child.exitCode!==null,'startup/error window close');
  }else{
  const before=processTree().map(p=>p.Id);
  const imported=await evaluate('(async()=>{const start=performance.now();window.__p6=await window.cs2Analyst.importDemo();return {result:window.__p6,totalMs:performance.now()-start};})()');
  assert.equal(imported.result.kind,'success');const report=imported.result.report,meta=report.replay;
  assert.equal(meta.available,true,meta.unavailableReason??'Replay unavailable');assert.equal(report.schemaVersion,2);assert.equal(meta.perspective,'global');
  const {replay,...baseReport}=report;reportFingerprint=hash(baseReport);
  const processes=(await browser.send('SystemInfo.getProcessInfo')).processInfo;
  const osProcesses=processTree();
  const workerIds=osProcesses.filter(p=>!before.includes(p.Id)&&p.Role==='analysis-utility').map(p=>p.Id);
  assert.ok(workerIds.length>0,'A real persistent Utility Process must exist');
  metrics={mode:installed?'installed-test-seam':'built-electron',fixtureSha256:meta.matchId,totalImportMs:imported.totalMs,metadataBytes:Buffer.byteLength(JSON.stringify(meta)),processes,workerIds,processMemory:osProcesses};
  metrics.packageInfo=packageInfo;metrics.offlineDecodedImages=decoded;
  assert.ok(osProcesses.filter(p=>workerIds.includes(p.Id)).every(p=>p.PeakWorkingSet64<=2.5*1024**3),'Analysis utility peak stays within 2.5 GiB');
  const requests=meta.rounds.flatMap(r=>[r.blocks[0],r.blocks.at(-1)].map(b=>({sessionId:meta.sessionId,round:r.round,block:b.index}))).slice(0,12);
  const timings=[],sizes=[];
  for(const request of requests){const checked=await evaluate(`(async()=>{const start=performance.now(),r=await window.cs2Analyst.replay.getChunk(${JSON.stringify(request)});return {result:r,ms:performance.now()-start};})()`);assert.equal(checked.result.kind,'success');sizes.push(Buffer.byteLength(JSON.stringify(checked.result.chunk)));timings.push(checked.ms);}
  metrics.ipcMs=quantiles(timings);metrics.chunkBytes=quantiles(sizes);assert.ok(metrics.chunkBytes.max<=1024*1024);assert.ok(metrics.ipcMs.p95<=250);assert.ok(metrics.totalImportMs<=15_000);
  console.log(JSON.stringify({stage:'real-ipc',...metrics.ipcMs,totalImportMs:metrics.totalImportMs}));
  // Enter through the actual import UI. This also verifies replacement of the earlier API session.
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("选择 DEM")).click()');
  await waitFor(()=>evaluate('document.querySelector("main")?.dataset.status==="success"&&Boolean(document.getElementById("replay-tab"))'),'UI report',120_000);
  const rejected=await evaluate(`window.cs2Analyst.replay.getChunk(${JSON.stringify(requests[0])})`);assert.equal(rejected.kind,'error');
  const opened=await evaluate('(()=>{const start=performance.now();document.getElementById("replay-tab").click();return start;})()');
  await waitFor(()=>evaluate('document.querySelector("[data-replay-session]")?.dataset.replayMapReady==="true"&&Number(document.querySelector("[data-replay-session]")?.dataset.replayRevision)>0&&Boolean(document.querySelector("#replay-panel canvas[role=img]")?.dataset.tick)'),'first Canvas frame');
  metrics.firstFrameMs=await evaluate(`performance.now()-${opened}`);assert.ok(metrics.firstFrameMs<=1500);
  assert.ok((await evaluate('document.getElementById("replay-panel").innerText')).includes('全局比赛观察视角'));
  await checkReplayLayout(evaluate, '地图回放默认窗口');
  const uiStart=await evaluate('Number(document.querySelector("[data-replay-session]").dataset.replayTick)');
  await evaluate('document.querySelector("[aria-label=播放回放]").click()');await delay(600);
  await evaluate('document.querySelector("[aria-label=暂停回放]").click()');await delay(100);
  const paused=await evaluate('Number(document.querySelector("#replay-panel canvas[role=img]").dataset.tick)');assert.ok(paused>uiStart);await delay(250);assert.equal(await evaluate('Number(document.querySelector("#replay-panel canvas[role=img]").dataset.tick)'),paused);
  await evaluate('document.querySelector("[aria-label=回放倍速]").click()');
  await evaluate('[...document.querySelectorAll("[role=option]")].find(o=>o.textContent.trim()==="2×").click()');
  const speedStart=await evaluate('Number(document.querySelector("#replay-panel canvas[role=img]").dataset.tick)');
  await evaluate('document.querySelector("[aria-label=播放回放]").click()');await delay(450);await evaluate('document.querySelector("[aria-label=暂停回放]").click()');await delay(100);
  const speedEnd=await evaluate('Number(document.querySelector("#replay-panel canvas[role=img]").dataset.tick)');assert.ok(speedEnd-speedStart>40,'2x playback advances the unified clock');
  const boundary=meta.rounds[0].blocks[0].endTick;
  await evaluate(`(()=>{const slider=document.querySelector('[aria-label="回放进度"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(slider,${boundary-4});slider.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor(()=>evaluate(`Math.abs(Number(document.querySelector('#replay-panel canvas[role=img]').dataset.tick)-${boundary-4})<.01`),'slider seek');
  await evaluate('document.querySelector("[aria-label=播放回放]").click()');await delay(400);await evaluate('document.querySelector("[aria-label=暂停回放]").click()');await delay(150);
  assert.ok(await evaluate('Number(document.querySelector("[data-replay-session]").dataset.replayBlock)>=1'),'Continuous playback crosses a real chunk boundary');
  await evaluate('document.querySelector("[aria-label=回放回合]").click()');await evaluate('[...document.querySelectorAll("[role=option]")].find(o=>o.textContent.trim()==="R2").click()');
  await waitFor(()=>evaluate('document.querySelector("[data-replay-session]").dataset.replayRound==="2"'),'round selection');
  await evaluate('document.querySelector("#replay-panel canvas[role=img]").focus()');await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await delay(150);
  assert.ok(await evaluate(`Number(document.querySelector("#replay-panel canvas[role=img]").dataset.tick)>=${meta.rounds[1].startTick+63}`));
  await evaluate('document.getElementById("timeline-tab").click();document.querySelector("[data-round-summary]").click()');
  const linkedTick=await evaluate('(()=>{const b=document.querySelector("[data-timeline-replay-tick]");const tick=Number(b.dataset.timelineReplayTick);b.click();return tick;})()');
  await waitFor(()=>evaluate(`Math.abs(Number(document.querySelector("#replay-panel canvas[role=img]")?.dataset.tick)-${linkedTick})<.01&&Number(document.querySelector('#replay-panel canvas[role=img]')?.dataset.playerCount)>0`),'Timeline exact tick link and rendered living players');
  await evaluate('document.querySelector("[aria-label=回放玩家状态] button:nth-child(2)").click()');assert.equal(await evaluate('document.querySelector("[aria-label=回放玩家状态] button:nth-child(2)").getAttribute("aria-pressed")'),'true');
  metrics.drawP95Ms=await evaluate('Number(document.querySelector("#replay-panel canvas[role=img]").dataset.drawP95)');assert.ok(metrics.drawP95Ms<=16.7);assert.ok(await evaluate('Number(document.querySelector("[data-replay-session]").dataset.replayCache)<=3'));
  metrics.sliderRail=await evaluate('(()=>{const e=document.querySelector("#replay-panel .fui-Slider__rail"),r=e.getBoundingClientRect(),t=document.querySelector("#replay-panel .fui-Slider__thumb").getBoundingClientRect(),c=getComputedStyle(e);return {width:r.width,height:r.height,background:c.background,display:c.display,opacity:c.opacity,centerGap:Math.abs(r.y+r.height/2-t.y-t.height/2)};})()');
  assert.ok(metrics.sliderRail.width>100&&metrics.sliderRail.height>=2&&metrics.sliderRail.centerGap<=1,'The visible progress rail aligns with its thumb');
  const finding=report.findings.find(f=>f.evidence.some(e=>e.round!==undefined&&meta.rounds.some(r=>r.round===e.round)));
  if(finding){const index=meta.players.findIndex(p=>p.id===finding.playerId);await evaluate(`document.querySelector('[aria-label="回放玩家状态"] button:nth-child(${index+1})').click();document.getElementById('report-tab').click();document.querySelector('#report-panel details summary').click()`);
    const linked=await evaluate('(()=>{const b=document.querySelector("#report-panel [data-finding-replay-round]");if(!b)return null;const value={round:Number(b.dataset.findingReplayRound),tick:b.dataset.findingReplayTick?Number(b.dataset.findingReplayTick):null};b.click();return value;})()');assert.ok(linked);
    const r=meta.rounds.find(r=>r.round===linked.round),expected=linked.tick===null||linked.tick<r.startTick||linked.tick>r.endTick?r.startTick:linked.tick;
    await waitFor(()=>evaluate(`Number(document.querySelector('[data-replay-session]')?.dataset.replayRound)===${linked.round}&&Math.abs(Number(document.querySelector('#replay-panel canvas[role=img]')?.dataset.tick)-${expected})<.01`),'Finding evidence link');metrics.findingLink='PASS';
  }else metrics.findingLink='not eligible';
  metrics.screenshotSizing='CDP viewport/DPR simulation; native maximize/restore checked separately';
  for(const [width,height,dpr] of [[1280,800,1],[1024,640,1],[1280,800,2],[800,600,1],[1280,800,1]]){
    await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:false});
    await waitForUi(evaluate, `innerWidth === ${width} && innerHeight === ${height}`, 'viewport resize');
    assert.equal(await evaluate('document.documentElement.scrollWidth>window.innerWidth'),false,`horizontal overflow ${width}`);
    await checkReplayLayout(evaluate, `地图回放 ${width}×${height}`);
    if(width===800){
      await evaluate(`(() => { const rail=document.querySelector('[data-replay-rail]'); window.__railStyle=rail.getAttribute('style'); rail.style.maxHeight='100px'; rail.style.overflowY='hidden'; })()`);
      try{await assert.rejects(()=>assertReplayContentAccessible(evaluate,'intentional hidden rail probe'),/unreachable/);}
      finally{await evaluate(`(() => { const rail=document.querySelector('[data-replay-rail]'); if(window.__railStyle===null)rail.removeAttribute('style');else rail.setAttribute('style',window.__railStyle); delete window.__railStyle; })()`);}
      await checkReplayLayout(evaluate,'窄布局反向裁切检查后恢复');
    }
    const screenshot=await page.send('Page.captureScreenshot',{format:'png'});writeFileSync(join(qa,`${metrics.mode}-${width}x${height}.png`),Buffer.from(screenshot.data,'base64'));
  }
  await evaluate('document.querySelector("[data-sidebar-toggle]").click()');
  await waitForUi(evaluate, `document.querySelector('[data-app-sidebar]').dataset.collapsed === 'true' && document.getAnimations().every(a => a.playState !== 'running')`, 'replay collapsed sidebar');
  await checkReplayLayout(evaluate, '地图回放折叠导航');
  await evaluate('document.querySelector("[data-sidebar-toggle]").click()');
  await waitForUi(evaluate, `document.querySelector('[data-app-sidebar]').dataset.collapsed === 'false' && document.getAnimations().every(a => a.playState !== 'running')`, 'replay expanded sidebar');
  await checkReplayLayout(evaluate, '地图回放展开导航');
  await page.send('Emulation.clearDeviceMetricsOverride');
  // Real OS minimize: the page must pause, then restore through the existing native window controls.
  await evaluate('document.querySelector("[aria-label=播放回放]").click();window.cs2Analyst.window.minimize()');
  await waitFor(()=>evaluate('document.hidden'),'native minimize visibility');await delay(150);
  const backgroundTick=await evaluate('Number(document.querySelector("[data-replay-session]").dataset.replayTick)');await delay(250);
  assert.equal(await evaluate('Number(document.querySelector("[data-replay-session]").dataset.replayTick)'),backgroundTick);
  await evaluate('window.cs2Analyst.window.toggleMaximize()');await waitFor(()=>evaluate('!document.hidden'),'native restore');await evaluate('window.cs2Analyst.window.toggleMaximize()');
  await waitFor(()=>evaluate('Boolean(document.querySelector("[aria-label=播放回放]"))'),'restored playback stays paused');await delay(200);
  const restoredTick=await evaluate('Number(document.querySelector("#replay-panel canvas[role=img]").dataset.tick)');
  assert.ok(restoredTick>=backgroundTick&&restoredTick-backgroundTick<=meta.tickRate*.25,'Restore must not advance by background elapsed time');await delay(300);
  assert.equal(await evaluate('Number(document.querySelector("#replay-panel canvas[role=img]").dataset.tick)'),restoredTick,'Paused clock stays stable after restore');metrics.nativeBackgroundPause='PASS';
  const beforeCancel=await evaluate('document.querySelector("[data-replay-session]").dataset.replaySession');
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("重新选择 DEM")).click()');
  await waitFor(()=>evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent==="取消导入")'),'cancel button');
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent==="取消导入").click()');
  await waitFor(()=>evaluate('document.querySelector("main").dataset.status==="success"'),'cancel retains previous report');
  assert.equal((await evaluate(`window.cs2Analyst.replay.getChunk({sessionId:${JSON.stringify(beforeCancel)},round:1,block:0})`)).kind,'error');
  await waitFor(async()=>!processTree().some(p=>p.Role==='analysis-utility'),'cancelled worker cleanup');
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("重新选择 DEM")).click()');
  await waitFor(()=>evaluate('document.querySelector("main").dataset.status==="success"&&Boolean(document.querySelector("[data-replay-session]"))'),'successful reimport after cancellation',120_000);metrics.cancelAndReimport='PASS';
  // A current session can be explicitly released; it must reject requests and terminate its worker.
  const current=await evaluate('document.querySelector("[data-replay-session]").dataset.replaySession');
  const currentWorkerIds=processTree().filter(p=>p.Role==='analysis-utility').map(p=>p.Id);assert.ok(currentWorkerIds.length>0);
  await evaluate(`window.cs2Analyst.replay.release(${JSON.stringify(current)})`);
  assert.equal((await evaluate(`window.cs2Analyst.replay.getChunk({sessionId:${JSON.stringify(current)},round:1,block:0})`)).kind,'error');
  await waitFor(async()=>!processTree().some(p=>currentWorkerIds.includes(p.Id)),'current worker cleanup');
  assert.deepEqual(exceptions,[]);
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("重新选择 DEM")).click()');
  await waitFor(async()=>processTree().some(p=>p.Role==='analysis-utility'),'worker exists before close');
  assert.ok(['parsing','analyzing'].includes(await evaluate('document.querySelector("main").dataset.status')),'Close-during-parse check must observe an in-flight import');
  void evaluate('window.cs2Analyst.window.close()').catch(()=>{});await waitFor(async()=>child.exitCode!==null,'window close during native parse');
  await waitFor(async()=>!processTree().some(p=>p.Role==='analysis-utility'),'no orphan worker');metrics.closeDuringParse='PASS';
  }
}catch(error){
  runFailure=error;
  if(page)try{const state=await page.send('Runtime.evaluate',{expression:'({text:document.body.innerText,root:document.querySelector("[data-replay-session]")?.outerHTML.slice(0,1000),canvas:[...document.querySelectorAll("#replay-panel canvas")].map(c=>({width:c.width,height:c.height,data:{...c.dataset}}))})',returnByValue:true});writeFileSync(join(qa,'failure-state.json'),JSON.stringify(state,null,2));const shot=await page.send('Page.captureScreenshot',{format:'png'});writeFileSync(join(qa,'failure.png'),Buffer.from(shot.data,'base64'));}catch{}
  throw new Error(`Replay Electron check failed\n${logs}`,{cause:error});
}
finally{
  page?.socket.close();browser?.socket.close();
  if(child.exitCode===null&&child.pid)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  assert.ok(resolve(profile).startsWith(resolve(profilePrefix)),'Profile cleanup stays within this task temporary profile');
  try{await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250});}
  catch(error){if(runFailure)console.warn('Profile cleanup also failed:',error.message);else throw error;}
}
// The unchanged public report path must equal the worker's report, excluding additive replay metadata.
if(!production&&!broken&&!noMaps){const { analyzeDemoFile }=await import('../apps/desktop/electron/report.ts');const baseline=await analyzeDemoFile(demo);assert.equal(baseline.kind,'success');assert.equal(hash(baseline.report),reportFingerprint);metrics.reportUnchanged=true;metrics.reportFingerprint=reportFingerprint;}
metrics.status='PASS';writeFileSync(join(qa,`${metrics.mode}.json`),JSON.stringify(metrics,null,2)+'\n');
console.log(JSON.stringify({stage:'PASS',mode:metrics.mode,firstFrameMs:metrics.firstFrameMs,drawP95Ms:metrics.drawP95Ms,reportUnchanged:metrics.reportUnchanged??'not-run-in-this-mode'}));
