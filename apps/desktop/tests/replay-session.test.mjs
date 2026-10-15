import assert from 'node:assert/strict';
import test from 'node:test';
import { ReplaySession } from '../electron/replay-session.ts';
const make=()=>{
  const match={id:'match',map:'de_dust2',players:[{steamId:'1',nickname:'p'}],rounds:[]};
  const frames=Array.from({length:401},(_,tick)=>({requestedTick:tick,players:[{playerId:'1',actualTick:tick,position:[tick,0,0],yaw:0,health:100,alive:true,side:'T',segment:1,stateAmbiguous:false}]}));
  const replay={schemaVersion:1,matchId:'match',samplingVersion:'test',source:'native-final-tick-observation',tickRate:8,hz:8,maxInterpolationTicks:1,players:['1'],excludedRounds:[],rounds:[{
    round:1,startTick:0,endTick:400,freezeEndTick:8,frames,coverage:{requestedFrames:401,missingPlayerSamples:0,status:'complete'},lifecycle:[],events:[
      {eventIndex:0,event:{type:'bomb',tick:100,action:'planted',player:'1',playerSide:'T'}},
      {eventIndex:1,event:{type:'bomb',tick:350,action:'exploded',player:'1',playerSide:'T'}}]}]};
  return {match,replay};
};
test('random block access contains independent bomb/player baseline and guard frames, without whole-match IPC',()=>{
  const {match,replay}=make(),s=new ReplaySession(match,replay,'session');
  const info=s.metadata.rounds[0];assert.equal(info.blocks.length,3);
  const second=s.get({sessionId:'session',round:1,block:1});assert.equal(second.frames[0].bomb.action,'planted');assert.deepEqual(second.frames[0].bomb.position,[100,0,0]);
  const third=s.get({sessionId:'session',round:1,block:2});assert.equal(third.frames.at(-1).bomb.action,'exploded');
  const first=s.get({sessionId:'session',round:1,block:0});assert.deepEqual(first.frames.at(-1),second.frames[0]);
  assert.equal(s.get({sessionId:'old',round:1,block:0}),null);assert.equal(s.get({sessionId:'session',round:2,block:0}),null);
  const hash=JSON.stringify(s.get({sessionId:'session',round:1,block:1}));assert.equal(JSON.stringify(second),hash);
  assert.ok(!JSON.stringify(second).includes('filePath'));s.clear();assert.equal(s.bytes,0);assert.equal(s.chunks.size,0);
});
test('oversized chunks split further; cache/single-tick overflow fails explicitly',()=>{
  const {match,replay}=make(),s=new ReplaySession(match,replay,'session',{chunkBytes:6000,cacheBytes:1000000});
  assert.ok(s.metadata.rounds[0].blocks.length>3);for(const json of s.chunks.values())assert.ok(Buffer.byteLength(json)<=6000);
  assert.throws(()=>new ReplaySession(match,replay,'session',{chunkBytes:1000000,cacheBytes:1}),/cache budget/);
  assert.throws(()=>new ReplaySession(match,replay,'session',{chunkBytes:1,cacheBytes:1000000}),/single-tick/);
});
test('same-tick bomb transitions preserve ambiguity; no order or trajectory is invented',()=>{
  const {match,replay}=make();replay.rounds[0].events.push({eventIndex:2,event:{type:'bomb',tick:100,action:'drop',player:'1',playerSide:'T'}});
  const s=new ReplaySession(match,replay,'session'),c=s.get({sessionId:'session',round:1,block:1});
  assert.equal(c.frames[0].bomb.ambiguous,true);assert.equal(c.frames[0].bomb.position,null);
});
