// Explicit local preparation; no network, game discovery or tool execution.
import assert from 'node:assert/strict';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditResourceDirectory } from './replay-resource-audit.mjs';
const input = process.argv[2]; assert.ok(input, 'prepare-replay-maps <explicit extracted directory>');
const manifest = JSON.parse(await readFile(new URL('../docs/replay-resources.json', import.meta.url), 'utf8'));
const actual = await auditResourceDirectory(resolve(input));
const output = new URL('../apps/desktop/renderer/src/assets/replay-maps/', import.meta.url);
// Verify the whole set before copying any file. Never overwrite from an unverified package.
for (const map of actual) {
  const expected = manifest.maps.find(m => m.map === map.map); assert.ok(expected);
  assert.equal(map.overview.sha256, expected.overview.sha256);
  assert.deepEqual(map.overview.transform, expected.overview.transform);
  assert.deepEqual(map.images, expected.images);
}
await mkdir(output, { recursive: true });
for (const map of actual) for (const image of map.images) await copyFile(resolve(input, image.path), new URL(`${map.map}${image.id === 'default' ? '' : '_' + image.id}.png`, output));
console.log('Prepared 5 verified local radar images. Files are ignored by Git; public redistribution remains unconfirmed.');
