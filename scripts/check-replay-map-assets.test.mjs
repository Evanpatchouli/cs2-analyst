import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { resolve,sep } from 'node:path';
import test from 'node:test';
import { checkReplayAssets } from './check-replay-map-assets.mjs';
test('build preflight accepts an asset-free checkout and rejects tampered/unregistered local images',async()=>{
  const parent=resolve('.tmp');await mkdir(parent,{recursive:true});const dir=await mkdtemp(resolve(parent,'replay-preflight-'));
  try{
    assert.equal((await checkReplayAssets(resolve(dir,'missing'))).mode,'event-only');
    assert.equal((await checkReplayAssets(dir)).prepared,0);
    await writeFile(resolve(dir,'de_dust2.png'),'not-the-pinned-resource');await assert.rejects(checkReplayAssets(dir),/digest mismatch/);
    await rm(resolve(dir,'de_dust2.png'));await writeFile(resolve(dir,'unregistered.png'),'private');await assert.rejects(checkReplayAssets(dir),/Unexpected local radar/);
  }finally{assert.ok(resolve(dir).startsWith(parent+sep));await rm(dir,{recursive:true,force:true});}
});
