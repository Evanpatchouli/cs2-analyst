import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { Demoparser2Provider } from '@cs2-analyst/dem-parser';
import { ReplaySession,REPLAY_CACHE_BYTES,REPLAY_CHUNK_BYTES } from '../electron/replay-session.ts';
const file=fileURLToPath(new URL('../../../.demo/spirit-vs-faze-m3-dust2.dem',import.meta.url));
test('selected Dust2: bounded cache, all chunks JSON-only, random seek and adjacent guard state match',{skip:!existsSync(file)?'Selected local DEM missing; no download':false},async()=>{
  const parsed=await new Demoparser2Provider().parseWithReplay(file);assert.ok(parsed.replay,parsed.replayUnavailableReason??'Missing replay');
  const start=performance.now(),session=new ReplaySession(parsed.match,parsed.replay,'00000000-0000-0000-0000-000000000001');
  assert.ok(session.bytes<=REPLAY_CACHE_BYTES);let largest=0,blocks=0;
  for(const round of session.metadata.rounds){
    let prior;
    for(const block of round.blocks){
      const request={sessionId:session.metadata.sessionId,round:round.round,block:block.index};
      const current=session.get(request);assert.ok(current);assert.equal(current.matchId,parsed.match.id);assert.ok(current.frames.length>0);
      const bytes=Buffer.byteLength(JSON.stringify(current));largest=Math.max(largest,bytes);assert.ok(bytes<=REPLAY_CHUNK_BYTES);blocks++;
      assert.equal(current.frames[0].players.length,parsed.replay.players.length);
      assert.ok(current.frames[0].tick<=current.startTick&&current.frames.at(-1).tick>=current.endTick);
      if(prior)for(const frame of prior.frames.filter(f=>current.frames.some(n=>n.tick===f.tick)))assert.deepEqual(current.frames.find(f=>f.tick===frame.tick),frame);
      assert.deepEqual(session.get(request),current,'Direct seek rebuilds the same complete baseline, independent of prior requests');prior=current;
    }
  }
  console.log(JSON.stringify({cacheBytes:session.bytes,largestChunkBytes:largest,blocks,projectionAndChecksMs:performance.now()-start,peakProcessRssKiB:process.resourceUsage().maxRSS}));
  session.clear();assert.equal(session.bytes,0);
});
