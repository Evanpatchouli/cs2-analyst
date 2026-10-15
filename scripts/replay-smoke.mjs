// Real built/installed Electron validation, using only the explicitly selected local Dust2 DEM.
import assert from 'node:assert/strict';
import { spawn,spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname,join,resolve,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const root=fileURLToPath(new URL('../',import.meta.url)),desktop=join(root,'apps/desktop');
const require=createRequire(new URL('../apps/desktop/package.json',import.meta.url));
const demo=join(root,'.demo/spirit-vs-faze-m3-dust2.dem');assert.ok(existsSync(demo),'Selected local DEM required; no downloads');
const installed=process.argv[2]?resolve(process.argv[2]):null;
const executable=installed??require('electron');assert.ok(existsSync(executable));
const qa=join(root,'.tmp/p6-qa');mkdirSync(qa,{recursive:true});
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const profile=mkdtempSync(join(root,'.tmp/replay-profile-'));
const env={...process.env,CS2_ANALYST_DEM_PATH:demo,CS2_ANALYST_TEST_DEM_PATH:demo};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL;
const child=spawn(executable,[...(installed?[]:['.']),`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--disable-features=CalculateNativeWinOcclusion','--disable-backgrounding-occluded-windows'],{cwd:installed?dirname(installed):desktop,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let logs='',page,browser,metrics={};child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
async function waitFor(fn,label,timeout=30_000){const end=Date.now()+timeout;while(Date.now()<end){const result=await fn();if(result)return result;if(child.exitCode!==null)throw new Error(`Electron exited: ${logs}`);await delay(50);}throw new Error(`Timed out: ${label}`);}
async function connect(url){const socket=new WebSocket(url);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});let sequence=0;
  return {socket,send:(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{socket.removeEventListener('message',receive);reject(new Error(`${method} timeout`));},120_000);
    function receive(event){const m=JSON.parse(event.data);if(m.id!==id)return;clearTimeout(timer);socket.removeEventListener('message',receive);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}
    socket.addEventListener('message',receive);socket.send(JSON.stringify({id,method,params}));})};}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function processTree(){
  // CDP SystemInfo omits Electron's forked Node utility service. Inspect only this app's OS children.
  const result=spawnSync('pwsh',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter "ParentProcessId = ${child.pid}" | ForEach-Object { $taskProcess=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; [pscustomobject]@{ Id=$_.ProcessId; Role=if($_.CommandLine -match 'node.mojom.NodeService'){'analysis-utility'}elseif($_.CommandLine -match '--type=renderer'){'renderer'}elseif($_.CommandLine -match '--type=gpu-process'){'gpu'}else{'other'}; PeakWorkingSet64=$taskProcess.PeakWorkingSet64; WorkingSet64=$taskProcess.WorkingSet64 } } | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw new Error(result.stderr);const value=JSON.parse(result.stdout||'[]');return Array.isArray(value)?value:[value];
}
const quantiles=values=>{const s=values.toSorted((a,b)=>a-b);return {count:s.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)};};
let reportFingerprint;
try{
  const target=await waitFor(async()=>{try{return (await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.type==='page');}catch{return null;}},'CDP page');
  page=await connect(target.webSocketDebuggerUrl);const version=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();browser=await connect(version.webSocketDebuggerUrl);
  const exceptions=[];page.socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params);});
  const evaluate=async expression=>{const r=await page.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
  await page.send('Runtime.enable');await page.send('Page.enable');await page.send('Network.enable');await page.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await waitFor(()=>evaluate('Boolean(window.cs2Analyst&&document.querySelector("main"))'),'preload/React');
  assert.equal(await evaluate('typeof window.require'),'undefined');
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
  const finding=report.findings.find(f=>f.evidence.some(e=>e.round!==undefined&&meta.rounds.some(r=>r.round===e.round)));
  if(finding){const index=meta.players.findIndex(p=>p.id===finding.playerId);await evaluate(`document.querySelector('[aria-label="回放玩家状态"] button:nth-child(${index+1})').click();document.getElementById('report-tab').click();document.querySelector('#report-panel details summary').click()`);
    const linked=await evaluate('(()=>{const b=document.querySelector("#report-panel [data-finding-replay-round]");if(!b)return null;const value={round:Number(b.dataset.findingReplayRound),tick:b.dataset.findingReplayTick?Number(b.dataset.findingReplayTick):null};b.click();return value;})()');assert.ok(linked);
    const r=meta.rounds.find(r=>r.round===linked.round),expected=linked.tick===null||linked.tick<r.startTick||linked.tick>r.endTick?r.startTick:linked.tick;
    await waitFor(()=>evaluate(`Number(document.querySelector('[data-replay-session]')?.dataset.replayRound)===${linked.round}&&Math.abs(Number(document.querySelector('#replay-panel canvas[role=img]')?.dataset.tick)-${expected})<.01`),'Finding evidence link');metrics.findingLink='PASS';
  }else metrics.findingLink='not eligible';
  metrics.screenshotSizing='CDP viewport simulation; native window remains the application default';
  for(const [width,height] of [[1280,900],[900,760],[800,600]]){
    await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(300);
    await evaluate('document.getElementById("replay-panel").scrollIntoView({block:"start"})');await delay(150);
    assert.equal(await evaluate('document.documentElement.scrollWidth>window.innerWidth'),false,`horizontal overflow ${width}`);
    const screenshot=await page.send('Page.captureScreenshot',{format:'png'});writeFileSync(join(qa,`${metrics.mode}-${width}x${height}.png`),Buffer.from(screenshot.data,'base64'));
  }
  // A current session can be explicitly released; it must reject further requests and terminate its worker.
  const current=await evaluate('document.querySelector("[data-replay-session]").dataset.replaySession');
  const currentWorkerIds=processTree().filter(p=>p.Role==='analysis-utility').map(p=>p.Id);assert.ok(currentWorkerIds.length>0);
  await evaluate(`window.cs2Analyst.replay.release(${JSON.stringify(current)})`);
  assert.equal((await evaluate(`window.cs2Analyst.replay.getChunk({sessionId:${JSON.stringify(current)},round:1,block:0})`)).kind,'error');
  await waitFor(async()=>!processTree().some(p=>currentWorkerIds.includes(p.Id)),'current worker cleanup');
  assert.deepEqual(exceptions,[]);
  writeFileSync(join(qa,`${metrics.mode}.json`),JSON.stringify(metrics,null,2)+'\n');
  void evaluate('window.cs2Analyst.window.close()').catch(()=>{});await waitFor(async()=>child.exitCode!==null,'window close');
}catch(error){
  if(page)try{const state=await page.send('Runtime.evaluate',{expression:'({text:document.body.innerText,root:document.querySelector("[data-replay-session]")?.outerHTML.slice(0,1000),canvas:[...document.querySelectorAll("#replay-panel canvas")].map(c=>({width:c.width,height:c.height,data:{...c.dataset}}))})',returnByValue:true});writeFileSync(join(qa,'failure-state.json'),JSON.stringify(state,null,2));const shot=await page.send('Page.captureScreenshot',{format:'png'});writeFileSync(join(qa,'failure.png'),Buffer.from(shot.data,'base64'));}catch{}
  throw new Error(`Replay Electron check failed\n${logs}`,{cause:error});
}
finally{
  page?.socket.close();browser?.socket.close();
  if(child.exitCode===null&&child.pid)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  assert.ok(resolve(profile).startsWith(resolve(root,'.tmp')+sep),'Profile cleanup stays within task .tmp');rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250});
}
// The unchanged public report path must equal the worker's report, excluding additive replay metadata.
const { analyzeDemoFile }=await import('../apps/desktop/electron/report.ts');
const baseline=await analyzeDemoFile(demo);assert.equal(baseline.kind,'success');assert.equal(hash(baseline.report),reportFingerprint);
console.log(JSON.stringify({stage:'PASS',mode:metrics.mode,firstFrameMs:metrics.firstFrameMs,drawP95Ms:metrics.drawP95Ms,reportUnchanged:true}));
