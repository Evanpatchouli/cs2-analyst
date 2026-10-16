// Maintenance-only, offline audit of explicitly extracted files. Never downloads or scans games.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const replayMaps = ['de_dust2', 'de_inferno', 'de_mirage', 'de_ancient', 'de_overpass', 'de_vertigo', 'de_nuke', 'de_anubis', 'de_train', 'de_cache'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function parseOverview(text, map) {
  const tokens = text.replace(/\/\/[^\r\n]*/g, '').match(/"[^"\r\n]*"|[{}]/g) ?? [];
  let offset = 0;
  const take = () => { assert.ok(offset < tokens.length, 'Truncated overview'); return tokens[offset++]; };
  const string = () => { const token = take(); assert.ok(token.startsWith('"'), 'Expected quoted KV1 key/value'); return token.slice(1, -1); };
  function object() {
    assert.equal(take(), '{'); const result = Object.create(null);
    while (tokens[offset] !== '}') {
      const key = string(); assert.ok(!Object.hasOwn(result, key), 'Duplicate overview key');
      result[key] = tokens[offset] === '{' ? object() : string();
    }
    take(); return result;
  }
  assert.equal(string(), map, 'Overview map mismatch'); const raw = object(); assert.equal(offset, tokens.length);
  function number(key, obj = raw) {
    assert.ok(typeof obj[key] === 'string' && obj[key].trim().length, `Missing overview ${key}`);
    const value = Number(obj[key]); assert.ok(Number.isFinite(value), `Invalid overview ${key}`); return value;
  }
  const posX = number('pos_x'), posY = number('pos_y'), scale = number('scale'); assert.ok(scale > 0);
  const layers = Object.entries(raw.verticalsections ?? {}).map(([id, band]) => {
    const minZ = number('AltitudeMin', band), maxZ = number('AltitudeMax', band); assert.ok(minZ < maxZ);
    return { id, minZ, maxZ };
  });
  return { raw, transform: { posX, posY, scale }, layers };
}
export function pngDimensions(bytes) {
  assert.ok(bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Not PNG');
  assert.equal(bytes.subarray(12, 16).toString(), 'IHDR');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.ok(width > 0 && height > 0 && width <= 8192 && height <= 8192, 'Invalid radar dimensions');
  return { width, height };
}
export async function auditResourceDirectory(directory) {
  const records = [];
  for (const map of replayMaps) {
    const overviewPath = `resource/overviews/${map}.txt`, overview = await readFile(resolve(directory, overviewPath));
    const parsed = parseOverview(overview.toString('utf8'), map);
    const layers = parsed.layers.length ? parsed.layers : [{ id: 'default', minZ: null, maxZ: null }];
    const images = [];
    for (const layer of layers) {
      assert.ok(['default', 'lower'].includes(layer.id), 'Unknown layer needs explicit review');
      const imagePath = `panorama/images/overheadmaps/${map}${layer.id === 'default' ? '' : '_' + layer.id}_radar_psd.png`;
      const bytes = await readFile(resolve(directory, imagePath));
      images.push({ ...layer, path: imagePath, bytes: bytes.length, sha256: sha256(bytes), ...pngDimensions(bytes) });
    }
    assert.ok(images.every(image => image.width === images[0].width && image.height === images[0].height), 'Layer dimensions differ');
    records.push({ map, overview: { path: overviewPath, bytes: overview.length, sha256: sha256(overview), ...parsed }, images });
  }
  return records;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , directory, output] = process.argv; assert.ok(directory && output, 'audit <explicit extracted directory> <output.json>');
  const records = await auditResourceDirectory(directory);
  await writeFile(output, JSON.stringify(records, null, 2) + '\n');
  console.log(JSON.stringify(records.map(({ map, images }) => ({ map, images }))));
}
