import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { parseOverview, pngDimensions, sha256, replayMaps } from './replay-resource-audit.mjs';
const text = '"map" { "pos_x" "0" "pos_y" "-2" "scale" "4.4" "verticalsections" { "default" { "AltitudeMin" "-495" "AltitudeMax" "10000" } "lower" { "AltitudeMin" "-10000" "AltitudeMax" "-495" } } }';
test('raw overview preserves HUD fields and version-owned altitude ranges without applying them to PNG', () => {
  const parsed = parseOverview('// comment\n' + text, 'map');
  assert.deepEqual(parsed.transform, { posX: 0, posY: -2, scale: 4.4 });
  assert.deepEqual(parsed.layers, [{ id: 'default', minZ: -495, maxZ: 10000 }, { id: 'lower', minZ: -10000, maxZ: -495 }]);
  for (const invalid of [text.replace('"4.4"', '"0"'), text.replace('"4.4"', '"NaN"'), text.slice(0, -2), text.replace('"pos_x" "0"', '"pos_x" "0" "pos_x" "1"')]) assert.throws(() => parseOverview(invalid, 'map'));
  assert.throws(() => parseOverview(text, 'other'));
});
test('radar audit rejects non-PNG and impossible dimensions', () => {
  const header = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(header); header.write('IHDR',12); header.writeUInt32BE(1024,16); header.writeUInt32BE(1024,20);
  assert.deepEqual(pngDimensions(header), { width: 1024, height: 1024 });
  assert.throws(() => pngDimensions(Buffer.from('not an image')));
  header.writeUInt32BE(0,16); assert.throws(() => pngDimensions(header));
});
test('all requested repository radars and original overviews match the pinned manifest and each other', async () => {
  const manifest = JSON.parse(await readFile(new URL('../docs/replay-resources.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.maps.map(map => map.map).sort(), [...replayMaps].sort());
  assert.equal(replayMaps.length, 10);
  const imagesRoot = new URL('../apps/desktop/renderer/src/assets/replay-maps/', import.meta.url);
  const overviewsRoot = new URL('../apps/desktop/renderer/src/assets/replay-overviews/', import.meta.url);
  const expectedImages = [];
  for (const map of manifest.maps) {
    const bytes = await readFile(new URL(`${map.map}.txt`, overviewsRoot));
    assert.equal(bytes.length, map.overview.bytes);
    assert.equal(sha256(bytes), map.overview.sha256);
    const parsed = parseOverview(bytes.toString('utf8'), map.map);
    assert.deepEqual(parsed.transform, map.overview.transform);
    assert.deepEqual(parsed.layers, map.overview.layers);
    const layers = parsed.layers.length ? parsed.layers : [{ id: 'default', minZ: null, maxZ: null }];
    assert.deepEqual(map.images.map(({ id, minZ, maxZ }) => ({ id, minZ, maxZ })), layers);
    for (const image of map.images) {
      const name = `${map.map}${image.id === 'default' ? '' : '_' + image.id}.png`;
      expectedImages.push(name);
      const png = await readFile(new URL(name, imagesRoot));
      assert.equal(png.length, image.bytes); assert.equal(sha256(png), image.sha256);
      assert.deepEqual(pngDimensions(png), { width: image.width, height: image.height });
    }
  }
  assert.equal(expectedImages.length, 13);
  assert.deepEqual((await readdir(imagesRoot)).sort(), expectedImages.sort());
  assert.deepEqual((await readdir(overviewsRoot)).filter(name => name.endsWith('.txt')).sort(), replayMaps.map(map => `${map}.txt`).sort());
});
