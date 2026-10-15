import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOverview, pngDimensions } from './replay-resource-audit.mjs';
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
