import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(new URL('../package.json', import.meta.url));
test('production native is the pinned backport MSVC binary and exposes ESM APIs', async () => {
  const native = await import('@cs2-analyst/demoparser-native');
  for(const name of ['parseHeader','parseEvents','parseTicks','parsePlayerInfo']) assert.equal(typeof native[name], 'function');
  const p = native.getBindingProvenance();
  assert.equal(p.source.baseCommit,'d3767705dc5846d73ed29db50eaeda58778dc934');
  assert.equal(p.source.fixCommit,'451321a517ec9c0c6be7f0103dd07e7a805c3345');
  assert.equal(p.target,'x86_64-pc-windows-msvc');
  assert.equal(createHash('sha256').update(readFileSync(p.bindingPath)).digest('hex'),p.verifiedSha256);
  assert.equal(require('@cs2-analyst/demoparser-native'),native.default);
});
