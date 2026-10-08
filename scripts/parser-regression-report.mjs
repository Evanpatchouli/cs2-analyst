import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import native from '../packages/demoparser-native/index.cjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)??'undefined').digest('hex');
const dir=new URL('../vendor/demoparser/.build/regression/',import.meta.url);
const fixtures=['demo1','demo2','demo3','nuke','inferno','dust2','mirage','ancient','anubis','overpass'];
function diff(a,b,path='',out=[]){
 if(hash(a)===hash(b)) return out;
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
  for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],path+'.'+k,out);
 }else out.push({path,old:a??null,fixed:b??null});
 return out;
}
function refs(match,v){if(!v||typeof v!=='object')return;
 if(Number.isInteger(v.eventIndex)&&Number.isInteger(v.round)&&v.type){const e=match.rounds.find(r=>r.number===v.round)?.events[v.eventIndex];assert.ok(e);assert.equal(e.tick,v.tick);assert.equal(e.type,v.type);}
 for(const x of Object.values(v))refs(match,x);
}
function finite(v){if(typeof v==='number')assert.ok(Number.isFinite(v));if(v&&typeof v==='object')for(const x of Object.values(v))finite(x);}
const report={schemaVersion:1,native:native.getBindingProvenance(),train:'REMOVED / NOT REQUIRED',fixtures:[]};
const handleEvidence=JSON.parse(readFileSync(new URL('../docs/demoparser-handle-oracle.json',import.meta.url)));
assert.equal(handleEvidence.native.verifiedSha256,report.native.verifiedSha256);
for(const fixture of fixtures){
 const old=JSON.parse(readFileSync(new URL(`${fixture}-old.json`,dir)));
 const fixed=JSON.parse(readFileSync(new URL(`${fixture}-fixed.json`,dir)));
 assert.equal(old.sha,fixed.sha);finite(fixed);refs(fixed.match,fixed.evidence);refs(fixed.match,fixed.findings);
 const contacts=fixed.evidence.engagements.engagements.flatMap(g=>g.contacts.map(c=>{assert.equal(c.eventRef.round,g.round);return JSON.stringify(c.eventRef)}));assert.equal(contacts.length,new Set(contacts).size);
 for(const r of fixed.evidence.impact.rounds)for(const g of r.groups){if(g.deathCount>1)assert.equal(g.ordered,false);for(const c of [g.before,g.after])if(c){assert.ok(c.CT>=0&&c.T>=0)}}
 const changes={};
 for(const key of ['match','spatial','evidence','findings','nativeEvents']){
  const deltas=diff(old[key],fixed[key]);
  changes[key]={unchanged:deltas.length===0,changedValues:deltas.length,fieldCounts:Object.fromEntries([...new Set(deltas.map(d=>d.path.replace(/\.\d+/g,'.*')))].map(p=>[p,deltas.filter(d=>d.path.replace(/\.\d+/g,'.*')===p).length])),examples:deltas.slice(0,20)};
 }
 // Compare native events by ordinal: parser emits all raw game events even when
 // old handle enrichment loses actor identity and the domain converter drops it.
 assert.equal(old.nativeEvents.length,fixed.nativeEvents.length);
 let unapprovedNativeChanges=[];
 for(let i=0;i<old.nativeEvents.length;i++){
  const a=old.nativeEvents[i],b=fixed.nativeEvents[i];assert.equal(a.event_name,b.event_name);assert.equal(a.tick,b.tick);
  for(const d of diff(a,b))if(!/^\.(user|attacker|assister|victim)_/.test(d.path))unapprovedNativeChanges.push({tick:b.tick,event:b.event_name,...d});
 }
 const entry={fixture,sha:fixed.sha,oldHash:hash(old),fixedHash:hash(fixed),players:{old:old.match.players.length,fixed:fixed.match.players.length},events:{old:old.match.rounds.reduce((n,r)=>n+r.events.length,0),fixed:fixed.match.rounds.reduce((n,r)=>n+r.events.length,0)},spatialCoverage:{old:old.spatial.coverage,fixed:fixed.spatial.coverage},impactCoverage:{old:old.evidence.impact.coverage,fixed:fixed.evidence.impact.coverage},changes,unapprovedNativeChanges,invariants:'PASS'};
 entry.classification=Object.values(changes).every(c=>c.unchanged)?'UNCHANGED':unapprovedNativeChanges.length?'SUSPICIOUS':'REQUIRES HANDLE EVIDENCE';
 if(entry.classification==='REQUIRES HANDLE EVIDENCE'&&fixture==='demo2'){
  const h=handleEvidence.fixtures.find(f=>f.fixture===fixture);
  assert.equal(h.coreDifferences.length,0);assert.ok(h.eventWeaponExtraChecks>0&&h.rawOwnerChecks>0);
  assert.ok(Object.values(h.events).every(e=>e.mismatches.length===0&&e.unmatched===0));
  entry.classification='EXPECTED FIX IMPROVEMENT';
  assert.equal(h.missingOracleRows,0);assert.equal(h.missingEventPlayerRows,0);
  assert.equal(h.eventWeaponExtraChecks+h.frameTimingDifferences.length+h.nullActorExtras,h.eventWeaponExtrasAtSampledTicks);
  entry.explanation='All changed native enrichment ticks independently queried; Pawn/active handle/item definition/inventory match demoinfocs. Event-vs-FrameDone differences are separately traced to actual pawn transitions and weapon entity/index/serial/lifetimes, including all 108 changed enrichments. Event actors/effect entities match; unchanged analyzer input-to-output rules. R18 independent lifecycle anomaly retained; no inferred sub-tick ordering.';
 }
 report.fixtures.push(entry);console.log(fixture,entry.classification,JSON.stringify({events:entry.events,changes:Object.fromEntries(Object.entries(changes).map(([k,v])=>[k,v.changedValues]))}));
}
writeFileSync(new URL('../docs/demoparser-handle-regression.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
