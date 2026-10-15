import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Demoparser2Provider } from '../dist/index.js';
const file=process.env.REPLAY_TEST_FILE??fileURLToPath(new URL('../../../.demo/spirit-vs-faze-m3-dust2.dem',import.meta.url));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('explicit Dust2 replay shares unchanged Match/Spatial and produces exact bounded independent observations', {skip:!existsSync(file)?'Selected local replay DEM absent; no download':false},async()=>{
  const parser=new Demoparser2Provider();
  let base=await parser.parseWithSpatial(file);const baseline={match:hash(base.match),spatial:hash(base.spatial)};
  assert.deepEqual(Object.keys(base).sort(),['match','performance','spatial']);base=null;
  const result=await parser.parseWithReplay(file);assert.equal(hash(result.match),baseline.match);assert.equal(hash(result.spatial),baseline.spatial);
  assert.ok(result.replay,result.replayUnavailableReason??'Replay missing');const replay=result.replay;
  assert.equal(replay.matchId,result.match.id);assert.equal(replay.hz,8);assert.equal(replay.tickRate,64);
  assert.ok(replay.rounds.length>0);let requested=0,missing=0;
  for(const r of replay.rounds){
    const source=result.match.rounds.find(x=>x.number===r.round);assert.equal(r.startTick,source.startTick);assert.equal(r.endTick,source.endTick);
    const ticks=new Set(r.frames.map(f=>f.requestedTick));requested+=ticks.size;
    for(const e of [...source.events,...(source.playerLifecycle??[])])if(e.tick>=r.startTick&&e.tick<=r.endTick)assert.ok(ticks.has(e.tick));
    for(const f of r.frames){assert.ok(f.requestedTick>=r.startTick&&f.requestedTick<=r.endTick);assert.equal(f.players.length,replay.players.length);
      for(const p of f.players){if(p.actualTick===null)missing++;else assert.equal(p.actualTick,f.requestedTick);if(p.segment!==null)assert.ok(p.alive===true&&p.position!==null&&!p.stateAmbiguous);}}
  }
  assert.ok(requested<=60000);assert.equal(missing,0);assert.ok(result.replayMs>0);
  console.log(JSON.stringify({fixture:result.match.id,requested,missing,replayMs:result.replayMs,peakProcessRssKiB:process.resourceUsage().maxRSS}));
});
