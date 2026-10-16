// Local acceptance driver. It never replaces the production file chooser or report.
// Native chooser input is performed separately with Computer Use.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { install, uninstall, launchSession, closeGracefully, clickSelectDemo, checkInstalledLayout, appProcesses, variants, waitFor } from './installed-app-smoke.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const qa=join(root,'.tmp/v01-final');mkdirSync(qa,{recursive:true});
const development=process.argv.includes('--baseline-dev');
const variant=variants.production;
variant.installDir=join(qa,'app-production');
if(!development) { await install(variant);checkInstalledLayout(variant,false); }
const executable=development?createRequire(new URL('../apps/desktop/package.json',import.meta.url))('electron'):join(variant.installDir,'CS2 Analyst.exe');
const session=await launchSession(executable,{},'final native chooser walkthrough',development?[join(root,'apps/desktop')]:[]);
const observations=[];
const actions=[];
const server=createServer(async(req,res)=>{
 try {
  const chunks=[];for await(const c of req)chunks.push(c);
  const command=JSON.parse(Buffer.concat(chunks).toString()||'{}');
  let value;
  if(command.action==='select') {await clickSelectDemo(session);value='chooser opened';}
  else if(command.action==='evaluate') value=await session.evaluate(command.expression);
  else if(command.action==='capture') {
   assert.match(command.name,/^[a-z0-9-]+$/);
   const shot=await session.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   const path=join(qa,command.name+'.png');writeFileSync(path,Buffer.from(shot.data,'base64'));value=path;
  } else if(command.action==='report') {
   await waitFor(()=>session.evaluate(`document.querySelector('[data-status]')?.dataset.status==='success'`),120000,'real import');
   const report=await session.evaluate(`(()=>{let f=document.getElementById('deep-review-panel');let v=f[Object.keys(f).find(k=>k.startsWith('__reactFiber$'))];while(v&&!v.memoizedProps?.report)v=v.return;return v?.memoizedProps.report;})()`);
   assert.equal(report.schemaVersion,2);
   assert.deepEqual(session.errors,[]);
   const hash=createHash('sha256').update(JSON.stringify(report)).digest('hex');
   const state=await session.evaluate(`({player:document.querySelector('[data-deep-player]')?.dataset.deepPlayer,metric:document.querySelector('[aria-label="对比指标"]')?.textContent,tabs:[...document.querySelectorAll('[role="tab"]')].map(t=>({id:t.id,selected:t.getAttribute('aria-selected')})),expanded:[...document.querySelectorAll('[data-round-summary][aria-expanded="true"]')].map(x=>Number(x.dataset.roundSummary)),trendRows:document.querySelectorAll('[data-trend-round]').length})`);
   if(!development) {
    const fixture=JSON.parse(readFileSync(join(qa,'pipeline.json'),'utf8')).fixtures.find(f=>f.identity.filename==='.demo/'+command.label.split('-')[0]+'.dem');
    assert.ok(fixture,'known mandatory personal import label');assert.equal(hash,fixture.desktop.deterministicHash);
    assert.equal(state.player,report.selectedPlayer);assert.deepEqual(state.expanded,[]);
    assert.equal(state.tabs.find(t=>t.selected==='true')?.id,'report-tab');
    assert.equal(state.trendRows,report.match.rounds);
    assert.equal(state.metric,'ADR');
   }
   value={label:command.label,hash,report,state};observations.push(value);
   writeFileSync(join(qa,'walkthrough.json'),JSON.stringify(observations,null,2)+'\n');
  } else if(command.action==='viewport') { await session.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await session.send('Emulation.setFocusEmulationEnabled',{enabled:true});value=true; }
  else if(command.action==='finish') {
   assert.deepEqual(session.errors,[]);assert.equal(await closeGracefully(session),0);
   await waitFor(()=>appProcesses().length===0,20000,'no workers');
   if(!development)await uninstall(variant);
   value={exit:0,workers:0,uninstalled:!development};
   setTimeout(()=>server.close(),100);
  } else throw Error('unknown acceptance action');
  actions.push({command,value:command.action==='report'?{label:value.label,hash:value.hash,state:value.state}:value});
  writeFileSync(join(qa,development?'baseline-ui-actions.json':'installed-ui-actions.json'),JSON.stringify(actions,null,2)+'\n');
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({value}));
 }catch(error){res.writeHead(500);res.end(JSON.stringify({error:error.stack}));}
});
server.listen(0,'127.0.0.1',()=>{writeFileSync(join(qa,'driver-port.txt'),String(server.address().port));console.log('acceptance driver http://127.0.0.1:'+server.address().port);});
