import assert from 'node:assert/strict';
import test from 'node:test';
import { planReplay, buildReplay } from '../dist/providers/replay.js';
const A='1',B='2';
const fixture = () => ({id:'fixture',map:'unknown',tickRate:64,players:[A,B].map(steamId=>({steamId,nickname:'',team:'Unknown'})),
  rounds:[{number:1,winner:null,startTick:0,freezeEndTick:8,endTick:64,events:[],playerLifecycle:[]}]});
const row=(tick,steamid=A,extra={})=>({tick,steamid,X:tick,Y:0,Z:0,yaw:0,health:100,is_alive:true,team_num:2,...extra});
const all = plan => plan.ticks.flatMap(t=>[row(t),row(t,B)]);
test('separate replay plan preserves exact formal events/lifecycle, rejects budget overflow and never guesses clock',()=>{
  const m=fixture();m.rounds[0].events=[{tick:13,type:'bomb',action:'pickup',player:A,playerSide:'T'},{tick:65,type:'bomb'}];m.rounds[0].playerLifecycle=[{tick:15,type:'spawn',player:A,side:'T'}];
  const p=planReplay(m);assert.ok(p.ticks.includes(13)&&p.ticks.includes(15)&&!p.ticks.includes(65));
  assert.throws(()=>planReplay(m,1),/budget/);assert.throws(()=>planReplay(m,60001));
  m.tickRate=undefined;const unknown=planReplay(m);assert.equal(unknown.step,null);assert.deepEqual(unknown.ticks,[0,8,13,15,64]);
  m.rounds[0].endTick=undefined;assert.deepEqual(planReplay(m).excludedRounds,[1]);assert.deepEqual(planReplay(m).ticks,[]);
});
test('missing rows/positions and actual ticks stay explicit and interrupt interpolation segments',()=>{
  const m=fixture(),p=planReplay(m),rows=all(p).filter(r=>!(r.tick===16&&r.steamid===A));
  rows.find(r=>r.tick===32&&r.steamid===A).X=null;
  const out=buildReplay(m,p,rows),samples=out.rounds[0].frames.map(f=>f.players[0]);
  assert.equal(samples[2].actualTick,null);assert.equal(samples[2].segment,null);assert.notEqual(samples[1].segment,samples[3].segment);
  assert.equal(samples[4].position,null);assert.equal(samples[4].segment,null);assert.equal(samples[0].position[0],0);
  assert.ok(out.rounds[0].coverage.missingPlayerSamples>=2);
  assert.throws(()=>buildReplay(m,p,[...rows,rows[0]]),/Duplicate/);
});
test('disconnect stays unknown until explicit spawn; death cannot resurrect from stale Pawn rows',()=>{
  const m=fixture();m.rounds[0].playerLifecycle=[{tick:16,type:'disconnect',player:A},{tick:32,type:'spawn',player:A,side:'T'}];
  m.rounds[0].events=[{type:'kill',tick:40,killer:B,victim:A}];
  const p=planReplay(m),out=buildReplay(m,p,all(p)),sample=t=>out.rounds[0].frames.find(f=>f.requestedTick===t).players[0];
  for(const t of [16,24]) {assert.equal(sample(t).alive,null);assert.equal(sample(t).position,null);assert.equal(sample(t).segment,null);}
  assert.equal(sample(32).alive,true);assert.notEqual(sample(8).segment,sample(32).segment);
  for(const t of [40,48,56]) {assert.equal(sample(t).alive,null);assert.equal(sample(t).stateAmbiguous,true);assert.equal(sample(t).segment,null);}
});
test('same-tick spawn/death/disconnect is ambiguous; round boundaries reset observations without joining segments',()=>{
  const m=fixture();m.rounds[0].playerLifecycle=[{tick:16,type:'spawn',player:A,side:'T'}];m.rounds[0].events=[{type:'kill',tick:16,killer:B,victim:A}];
  const p=planReplay(m),out=buildReplay(m,p,all(p)),s=out.rounds[0].frames.find(f=>f.requestedTick===16).players[0];
  assert.equal(s.stateAmbiguous,true);assert.equal(s.alive,null);assert.equal(s.health,null);assert.equal(s.segment,null);
  assert.equal(out.rounds[0].events[0].eventIndex,0);assert.equal(out.rounds[0].events[0].event.tick,16);
  const before=JSON.stringify(m);buildReplay(m,p,all(p));assert.equal(JSON.stringify(m),before);
});
test('two rounds retain disconnects across unsampled post-round gaps and only known spawn reconnects',()=>{
  const m=fixture();m.rounds[0].endTick=16;
  m.rounds[0].playerLifecycle=[{tick:20,type:'disconnect',player:A}];
  m.rounds.push({number:2,winner:null,startTick:32,endTick:64,events:[],playerLifecycle:[{tick:48,type:'spawn',player:A,side:'T'}]});
  const p=planReplay(m),out=buildReplay(m,p,all(p)),first=out.rounds[0].frames[0].players[0];
  const second=t=>out.rounds[1].frames.find(f=>f.requestedTick===t).players[0];
  assert.ok(!p.ticks.includes(20),'post-round lifecycle is consumed without sampling outside a formal window');
  for(const t of [32,40]){assert.equal(second(t).alive,null);assert.equal(second(t).position,null);assert.equal(second(t).segment,null);}
  assert.equal(second(48).alive,true);assert.notEqual(second(48).segment,first.segment);
  const b1=out.rounds[0].frames[0].players[1],b2=out.rounds[1].frames[0].players[1];assert.notEqual(b1.segment,b2.segment,'round boundary changes per-player segment identity');
  m.rounds[0].playerLifecycle[0].tick=8;const direct=buildReplay(m,planReplay(m),all(planReplay(m)));
  assert.equal(direct.rounds[1].frames[0].players[0].alive,null);
});
test('missing yaw is partial even when positions and discrete state remain valid',()=>{
  const m=fixture(),p=planReplay(m),rows=all(p);delete rows[0].yaw;
  const out=buildReplay(m,p,rows);assert.equal(out.rounds[0].coverage.status,'partial');assert.equal(out.rounds[0].frames[0].players[0].yaw,null);
});
