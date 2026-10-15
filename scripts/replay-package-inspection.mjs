import assert from 'node:assert/strict';
import { readFileSync,existsSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from './replay-resource-audit.mjs';
export function inspectReplayPackage(directory,variant){
  const archive=join(directory,'resources/app.asar'),bytes=readFileSync(archive),headerSize=bytes.readUInt32LE(4);
  const jsonLength=bytes.readUInt32LE(12),header=JSON.parse(bytes.subarray(16,16+jsonLength).toString()),files=new Map(),dataOffset=8+headerSize;
  function walk(node,prefix=''){for(const [name,info] of Object.entries(node.files??{})){const path=prefix?prefix+'/'+name:name;if(info.files)walk(info,path);else files.set(path,info);}}walk(header);
  const read=path=>{const info=files.get(path);assert.ok(info,`Missing packaged file ${path}`);return info.unpacked?readFileSync(join(directory,'resources/app.asar.unpacked',path)):bytes.subarray(dataOffset+Number(info.offset),dataOffset+Number(info.offset)+info.size);};
  const manifest=JSON.parse(readFileSync(new URL('../docs/replay-resources.json',import.meta.url),'utf8')),images=[];
  for(const map of manifest.maps)for(const image of map.images){
    const prefix=`dist/renderer/assets/${map.map}${image.id==='default'?'':'_'+image.id}-`;
    const matches=[...files.keys()].filter(path=>path.startsWith(prefix)&&path.endsWith('.png'));assert.equal(matches.length,1);
    assert.equal(sha256(read(matches[0])),image.sha256);images.push(matches[0].replace('dist/renderer/',''));
  }
  const main=read('dist/electron/main.js').toString(),worker=read('dist/electron/report-worker.js').toString();
  assert.equal(main.includes('CS2_ANALYST_TEST_DEM_PATH'),variant==='test-seam','Production/test seam separation');
  assert.ok(main.includes('sandbox: true')&&main.includes('contextIsolation: true')&&main.includes('nodeIntegration: false'));
  for(const name of ['dem-parser','match-model','analytics','deep-review','findings','report-contract'])assert.ok(!worker.includes(`"@cs2-analyst/${name}"`),'No workspace package runtime resolution');
  assert.ok(![...files.keys()].some(p=>p.startsWith('src/')||p.startsWith('.demo/')||p.startsWith('docs/')));
  const relative='dist/electron/node_modules/@cs2-analyst/demoparser-native/native/demoparser2.win32-x64-msvc.node';assert.equal([...files.keys()].filter(p=>p.endsWith('.node')).length,1);assert.equal(files.get(relative)?.unpacked,true);
  const provenance=JSON.parse(readFileSync(new URL('../packages/demoparser-native/native/provenance.json',import.meta.url),'utf8'));
  assert.equal(sha256(read(relative)),provenance.binary.sha256);
  assert.ok(existsSync(join(directory,'CS2 Analyst.exe')));
  return {variant,asarBytes:bytes.length,imagePaths:images,nativeSha256:provenance.binary.sha256,sourceIndependentBundle:true};
}
