import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pngDimensions,sha256 } from './replay-resource-audit.mjs';

export async function checkReplayAssets(directory=new URL('../apps/desktop/renderer/src/assets/replay-maps/',import.meta.url)) {
  const manifest=JSON.parse(await readFile(new URL('../docs/replay-resources.json',import.meta.url),'utf8'));
  const expected=new Map(manifest.maps.flatMap(m=>m.images.map(i=>[`${m.map}${i.id==='default'?'':'_'+i.id}.png`,i])));
  let files;try{files=await readdir(directory);}catch(error){if(error.code==='ENOENT')return {prepared:0,expected:expected.size,mode:'event-only'};throw error;}
  let prepared=0;
  for(const file of files){
    const record=expected.get(file);assert.ok(record,`Unexpected local radar asset: ${file}`);
    const base=directory instanceof URL?directory:pathToFileURL(resolve(directory)+'/');
    const bytes=await readFile(new URL(file,base));assert.equal(sha256(bytes),record.sha256,`Radar digest mismatch: ${file}`);
    assert.deepEqual(pngDimensions(bytes),{width:record.width,height:record.height});prepared++;
  }
  return {prepared,expected:expected.size,mode:prepared?'local-personal-assets':'event-only'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await checkReplayAssets(process.argv[2])));
