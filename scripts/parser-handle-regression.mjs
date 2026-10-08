import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import native from '../packages/demoparser-native/index.cjs';
const dir=new URL('../vendor/demoparser/.build/regression/',import.meta.url);
const prepared=process.argv.includes('--prepare');
const result={native:native.getBindingProvenance(),fixtures:[]};
// Display labels are a static, hash-verified tag artifact, not an identity oracle.
const labels=new Map([...readFileSync(new URL('../vendor/demoparser/.build/work/src/csgoproto/src/maps.rs',import.meta.url),'utf8').matchAll(/(\d+)_u32 => "([^"]+)"/g)].map(m=>[Number(m[1]),m[2]]));
for(const fixture of ['demo1','demo2','nuke']){
 const fixed=JSON.parse(readFileSync(new URL(`${fixture}-fixed.json`,dir)));
 const old=JSON.parse(readFileSync(new URL(`${fixture}-old.json`,dir)));
 if(prepared){
  const ticks=new Set();
  for(const name of new Set(fixed.nativeEvents.map(e=>e.event_name))) for(const e of fixed.nativeEvents.filter(e=>e.event_name===name).slice(0,3))ticks.add(e.tick);
  const high=new Map();
  for(let i=0;i<fixed.nativeEvents.length;i++){
   const e=fixed.nativeEvents[i];
   if(JSON.stringify(e)!==JSON.stringify(old.nativeEvents[i]))ticks.add(e.tick);
   for(const key of Object.keys(e).filter(k=>k.endsWith('_active_weapon'))){const h=e[key];if(Number.isInteger(h)&&(h&0x3fff)>2047&&h!==0xffffff){const n=high.get(e.event_name)??0;if(n<3)ticks.add(e.tick);high.set(e.event_name,n+1)}}
  }
  if(fixture==='demo2')for(const t of [3743,4292,4511,75805,76000,76213])ticks.add(t);
  // All changed enrichment ticks are inspected, rather than sampling improvements away.
  writeFileSync(new URL(`${fixture}-oracle-ticks.json`,dir),JSON.stringify([...ticks].sort((a,b)=>a-b)));
  continue;
 }
 const oracle=JSON.parse(readFileSync(new URL(`${fixture}-oracle.json`,dir)));
 const ticks=JSON.parse(readFileSync(new URL(`${fixture}-oracle-ticks.json`,dir)));
 const rows=native.parseTicks(readFileSync(new URL(`../.demo/${fixture}.dem`,import.meta.url)),['active_weapon','active_weapon_name','item_def_idx','inventory','inventory_as_ids','entity_id','CCSPlayerController.m_hPlayerPawn','health','life_state','team_num'],ticks);
 const samples=[],differences=[];let missingOracleRows=0;
 for(const r of rows){
  const o=oracle.snapshots.find(s=>s.tick===r.tick&&s.steamid===r.steamid);if(!o){missingOracleRows++;continue;}
  for(const [key,value] of [['entity_id',o.pawn],['CCSPlayerController.m_hPlayerPawn',o.handle],['health',o.health],['life_state',o.lifeState],['team_num',o.team],['active_weapon',o.activeHandle]]) if(r[key]!==value)differences.push({tick:r.tick,steamid:r.steamid,field:key,native:r[key],oracle:value});
  const handle=r.active_weapon;
  if(handle===0xffffff||handle===0xffffffff){assert.equal(r.active_weapon_name??null,null);assert.equal(r.item_def_idx??null,null)}
  else if(o.weaponEntity!==null){assert.equal(handle&0x3fff,o.weaponEntity);if(r.item_def_idx!==o.weaponIndex)differences.push({tick:r.tick,steamid:r.steamid,field:'item_def_idx',native:r.item_def_idx,oracle:o.weaponIndex});}
  const sorted=values=>[...new Set(values)].sort((a,b)=>a-b);
  const nativeInventory=sorted(r.inventory_as_ids??[]),oracleInventory=sorted(o.inventory.map(w=>w.itemIndex));
  if(JSON.stringify(nativeInventory)!==JSON.stringify(oracleInventory))differences.push({tick:r.tick,steamid:r.steamid,field:'inventory_as_ids',native:nativeInventory,oracle:oracleInventory});
  if(samples.length<12&&handle!==0xffffff&&handle!==0xffffffff&&((handle&0x3fff)>2047||fixture!=='demo2'))samples.push({native:r,oracle:o});
 }
 const byType={};
 for(const name of ['hegrenade_detonate','flashbang_detonate','smokegrenade_detonate','inferno_startburn','decoy_started','player_blind','player_death','bomb_pickup','bomb_dropped','bomb_beginplant','bomb_planted','bomb_begindefuse','bomb_defused','bomb_exploded']){
  let matched=0,mismatches=[],unmatched=0;
  for(const e of fixed.nativeEvents.filter(e=>e.event_name===name)){
   const peers=oracle.events.filter(o=>o.event===name&&o.tick===e.tick);
   const actor=name==='player_blind'||name==='player_death'?e.attacker_steamid:e.user_steamid;
   const victim=e.user_steamid;
   if(!peers.length){unmatched++;continue;}
   if(peers.some(o=>(actor??null)===(o.actor??null)&&(name!=='player_death'&&name!=='player_blind'||(victim??null)===(o.target??null))&&(!Number.isInteger(e.entityid)||o.entity===null||o.entity===e.entityid)))matched++;
   else mismatches.push({native:e,oracle:peers});
   if(name==='player_death'){const o=peers.find(o=>(actor??null)===(o.actor??null)&&(victim??null)===(o.target??null));if(o?.weapon)assert.equal(e.weapon,o.weapon);}
  }
  byType[name]={matched,unmatched,mismatches};
 }
 assert.equal(missingOracleRows,0);assert.equal(rows.length,oracle.snapshots.length);assert.equal(differences.length,0);
 let eventWeaponExtraChecks=0,eventWeaponExtrasAtSampledTicks=0,missingEventPlayerRows=0,nullActorExtras=0;
 const frameTimingDifferences=[];
 for(const e of fixed.nativeEvents)for(const key of Object.keys(e).filter(k=>k.endsWith('_active_weapon'))){
  const prefix=key.slice(0,-'active_weapon'.length),r=rows.find(r=>r.tick===e.tick&&r.steamid===e[prefix+'steamid']);
  if(!ticks.includes(e.tick))continue;
  eventWeaponExtrasAtSampledTicks++;
  if(e[prefix+'steamid']==null){nullActorExtras++;assert.equal(e[key],null);assert.equal(e[prefix+'active_weapon_name'],null);continue;}
  if(!r){missingEventPlayerRows++;continue;}
  if(r.active_weapon===e[key]){eventWeaponExtraChecks++;assert.equal(e[prefix+'active_weapon_name']??null,r.active_weapon_name??null)}
  else{
   const handle=e[key],o=oracle.snapshots.find(s=>s.tick===e.tick&&s.steamid===r.steamid);
   const life=oracle.weaponLifetimes.find(w=>w.entity===(handle&0x3fff)&&w.serial===((handle>>>14)&0x3ff)&&w.created<=e.tick&&(w.destroyed===null||w.destroyed>=e.tick));
   const changes=oracle.activeChanges.filter(c=>c.pawn===o.pawn&&c.tick<=e.tick);
   const atTick=changes.filter(c=>c.tick===e.tick),before=changes.findLast(c=>c.tick<e.tick);
   assert.ok(atTick.some(c=>c.handle===handle)||before?.handle===handle,`event active handle absent from independent pawn transition: ${fixture}/${e.tick}/${handle}`);
   if(handle===0xffffff||handle===0xffffffff)assert.equal(e[prefix+'active_weapon_name']??null,null);
   else{assert.ok(life,`event weapon entity/serial/lifetime absent: ${fixture}/${e.tick}/${handle}`);assert.equal(e[prefix+'active_weapon_name']??null,labels.get(life.itemIndex)??null);}
   const oldEvent=old.nativeEvents.find(x=>x.event_name===e.event_name&&x.tick===e.tick&&x[prefix+'steamid']===e[prefix+'steamid']);
   frameTimingDifferences.push({tick:e.tick,event:e.event_name,steamid:r.steamid,eventHandle:handle,frameEndHandle:r.active_weapon,changedEnrichment:oldEvent?.[prefix+'active_weapon_name']!==e[prefix+'active_weapon_name']||oldEvent?.[prefix+'entity_id']!==e[prefix+'entity_id'],entity:life??null,beforeTick:before??null,sameTickTransitions:atTick});
  }
 }
 assert.equal(missingEventPlayerRows,0);assert.equal(eventWeaponExtraChecks+frameTimingDifferences.length+nullActorExtras,eventWeaponExtrasAtSampledTicks);
 const ownerSamples=oracle.rawOwners.filter(e=>e.ownerSteamid!==null&&(e.class==='CC4'||e.field==='m_hThrower'));
 for(const sample of ownerSamples){assert.equal(sample.handle&0x3fff,sample.ownerEntity);const r=rows.find(r=>r.tick===sample.tick&&r.steamid===sample.ownerSteamid);assert.ok(r);assert.equal(r.entity_id,sample.ownerEntity)}
 for(const value of Object.values(byType)){assert.equal(value.unmatched,0);assert.equal(value.mismatches.length,0)}
 const entry={fixture,ticks:ticks.length,rows:rows.length,oracleRows:oracle.snapshots.length,missingOracleRows,coreDifferences:differences,events:byType,eventWeaponExtraChecks,eventWeaponExtrasAtSampledTicks,nullActorExtras,missingEventPlayerRows,frameTimingDifferences,weaponSamples:samples,rawOwnerChecks:ownerSamples.length,rawOwnerSamples:ownerSamples.slice(0,20),oracleWarnings:oracle.warnings};
 result.fixtures.push(entry);console.log(fixture,JSON.stringify({ticks:entry.ticks,rows:entry.rows,differences:differences.length,events:Object.fromEntries(Object.entries(byType).map(([k,v])=>[k,{matched:v.matched,unmatched:v.unmatched,mismatches:v.mismatches.length}]))}));
}
if(!prepared)writeFileSync(new URL('../docs/demoparser-handle-oracle.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
