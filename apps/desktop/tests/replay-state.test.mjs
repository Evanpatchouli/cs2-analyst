import assert from 'node:assert/strict';
import test from 'node:test';
import { ReplayClock,ReplayChunkCache,replayBlockAt,replayDisplayFrame } from '../renderer/src/replay-state.ts';
const player=(tick,x,yaw,segment=1,extra=[])=>[0,tick,x,0,0,yaw,100,true,'T',segment,false,...extra];
const bomb={action:'planted',carrierId:null,position:[1,2,3],positionSource:'actor-at-event',ambiguous:false};
const chunk=(a=player(0,0,179),b=player(8,8,-179))=>({schemaVersion:1,sessionId:'s',matchId:'m',round:1,block:0,startTick:0,endTick:8,events:[],frames:[{tick:0,players:[a],bomb},{tick:8,players:[b],bomb}]});
test('clock anchors elapsed time, pause/seek/speed and delayed frames without accumulating drift',()=>{
  const c=new ReplayClock(64);c.play(1000);assert.equal(c.read(6000,64),384);c.pause(6000,64);assert.equal(c.read(9000,64),384);
  c.seek(100,9000);c.play(9000);c.setSpeed(2,10000,64);assert.equal(c.read(11000,64),292);
  c.pause(11000,64);c.seek(10,12000);assert.equal(c.read(18000,null),10);
});
test('short-arc display changes only continuous position/yaw; direct seek matches sequential discrete facts',()=>{
  const c=chunk(),middle=replayDisplayFrame(c,4,8);assert.equal(middle.players[0][2],4);assert.equal(middle.players[0][5],180);assert.equal(middle.players[0][6],100);
  assert.deepEqual(replayDisplayFrame(c,8,8),c.frames[1]);assert.deepEqual(replayDisplayFrame(c,4,8),middle);
  assert.equal(replayDisplayFrame(c,9,8),null);assert.deepEqual(middle.bomb,bomb);
});
test('missing/ambiguous/dead/spawn/segment/gap boundaries never gain interpolated coordinates',()=>{
  for(const edit of [b=>b[1]=null,b=>b[2]=null,b=>b[7]=false,b=>b[9]=2,b=>b[10]=true]){const c=chunk();edit(c.frames[1].players[0]);assert.equal(replayDisplayFrame(c,4,8).players[0][2],null);}
  assert.equal(replayDisplayFrame(chunk(),4,null).players[0][7],null);
  assert.equal(replayDisplayFrame(chunk(),4,2).players[0][2],null);
  const c=chunk();c.frames[1].players[0][5]=null;assert.equal(replayDisplayFrame(c,4,8).players[0][5],null);
});
test('renderer LRU retains at most three chunks and never retains another session after clear',()=>{
  const cache=new ReplayChunkCache();for(let block=0;block<5;block++)cache.put({...chunk(),block});assert.equal(cache.size,3);assert.equal(cache.get(1,0),undefined);assert.ok(cache.get(1,4));cache.clear();assert.equal(cache.size,0);
});
test('fractional boundary tick belongs to the prior integer block and uses its guard without a blank frame',()=>{
  const round={blocks:[{index:0,startTick:0,endTick:7},{index:1,startTick:8,endTick:15}]};
  const c={...chunk(),endTick:7};assert.equal(replayBlockAt(round,7.5).index,0);assert.equal(replayDisplayFrame(c,7.5,8).players[0][2],7.5);
  assert.equal(replayBlockAt(round,8).index,1);assert.equal(replayDisplayFrame(chunk(),8.5,8),null);
});
test('carrier marker follows only a valid interpolated carrier; missing/lifecycle gaps remove its location',()=>{
  const c=chunk();for(const f of c.frames)f.bomb={...bomb,action:'pickup',carrierId:'player',positionSource:'carrier-sample'};
  assert.deepEqual(replayDisplayFrame(c,4,8,['player']).bomb.position,[4,0,0]);
  c.frames[1].players[0][9]=2;assert.equal(replayDisplayFrame(c,4,8,['player']).bomb.position,null);
});
