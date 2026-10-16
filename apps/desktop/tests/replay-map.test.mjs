import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { replayMapDefinitions, worldToRadar, radarHeading, resolveMapLayer, mapResourceState } from '../renderer/src/replay-map.ts';
const records = JSON.parse(readFileSync(new URL('../../../docs/replay-resources.json', import.meta.url)));
const calibration = JSON.parse(readFileSync(new URL('../../../docs/replay-calibration.json', import.meta.url)));
const dust = replayMapDefinitions.find(map => map.id === 'de_dust2'), nuke = replayMapDefinitions.find(map => map.id === 'de_nuke');
test('map metadata matches pinned source; independent Dust2 landmarks project inside four regions', () => {
  assert.deepEqual(replayMapDefinitions.map(map => map.id).sort(), records.maps.map(map => map.map).sort());
  assert.equal(replayMapDefinitions.length, 10);
  for (const definition of replayMapDefinitions) {
    const source = records.maps.find(m => m.map === definition.id);
    assert.deepEqual({ posX: definition.posX, posY: definition.posY, scale: definition.scale }, source.overview.transform);
    assert.equal(definition.resourceId, records.resourceId);
    assert.equal(definition.versionMatch, 'unconfirmed');
    assert.deepEqual(definition.layers.map(({id,minZ,maxZ})=>({id,minZ,maxZ})),source.images.map(({id,minZ,maxZ})=>({id,minZ,maxZ})));
    for (const image of source.images) assert.deepEqual({width:definition.width,height:definition.height},{width:image.width,height:image.height});
  }
  for (const region of calibration.observations) for (const point of region.points) {
    const pixel = worldToRadar(dust, point);
    assert.ok(pixel.x >= region.bounds[0] && pixel.x <= region.bounds[2] && pixel.y >= region.bounds[1] && pixel.y <= region.bounds[3]);
  }
  const original = worldToRadar(dust, { x: 0, y: 0 });
  assert.deepEqual(worldToRadar({ ...dust, width:2048, height:2048 }, {x:0,y:0}), {x:original.x*2,y:original.y*2});
  assert.equal(worldToRadar(dust, {x:NaN,y:0}), null);
});
test('Train and Vertigo use their paired layer bands, preserving shared boundaries and missing resources', () => {
  for (const [id,boundary,min,max] of [['de_train',-50,-5000,20000],['de_vertigo',11700,-10000,20000]]) {
    const map = replayMapDefinitions.find(map => map.id === id); assert.ok(map);
    assert.equal(resolveMapLayer(map,boundary-1),'lower'); assert.equal(resolveMapLayer(map,boundary+1),'default');
    for (const z of [boundary,null,NaN,min-1,max+1]) assert.equal(resolveMapLayer(map,z),null);
    const assets=Object.fromEntries(map.layers.map(layer=>[layer.image,'local-url']));
    assert.equal(mapResourceState(id,assets).status,'unconfirmed');
    delete assets[map.layers.find(layer=>layer.id==='lower').image];
    assert.equal(mapResourceState(id,assets).status,'unavailable');
  }
});
test('Source yaw projects cardinal axes with canvas Y inversion, not HUD rotation', () => {
  for (const [yaw,x,y] of [[0,1,0],[90,0,-1],[180,-1,0],[-90,0,1],[360,1,0]]) {
    const vector=radarHeading(yaw); assert.ok(Math.abs(vector.x-x)<1e-10&&Math.abs(vector.y-y)<1e-10);
  }
  assert.equal(radarHeading(NaN),null);
});
test('Nuke boundary, missing/out-of-range Z remain unknown; metadata controls both layers', () => {
  assert.equal(resolveMapLayer(nuke,-496),'lower'); assert.equal(resolveMapLayer(nuke,-494),'default');
  for(const z of [null,NaN,-495,-10001,10001]) assert.equal(resolveMapLayer(nuke,z),null);
  assert.equal(resolveMapLayer(dust,null),'default');
});
test('absent/unknown/mismatched version resources never become a confirmed map', () => {
  assert.equal(mapResourceState('de_dust2',{}).status,'unavailable');
  assert.equal(mapResourceState('../../bad',{}).status,'unavailable');
  assert.equal(mapResourceState('de_dust2',{'de_dust2.png':'local-url'}).status,'unconfirmed');
  assert.equal(mapResourceState('de_nuke',{'de_nuke.png':'local-url'}).status,'unavailable');
});
