import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';
import { Demoparser2Provider } from '@cs2-analyst/dem-parser';
import { HeatmapSession } from '../electron/heatmap-session.ts';
import { ReplaySession } from '../electron/replay-session.ts';
import { buildDesktopReport } from '../electron/report.ts';
import { projectMapHeatmap } from '../shared/heatmap.ts';
import { dust2File, dust2Sha, jsonHash, realHeatmapRequests, verifyDust2 } from './heatmap-real-fixture.mjs';

test('P7.2 exact Dust2: real session projections, default cache, independent sources and retained memory', {
  skip: !existsSync(dust2File) ? 'BLOCKED: local .demo/dust2.dem unavailable; no download/substitute' : false,
}, async () => {
  await verifyDust2();
  const memory = [];
  const snapshot = label => {
    if (global.gc) { global.gc(); global.gc(); }
    memory.push({ label, explicitGc: Boolean(global.gc), ...process.memoryUsage() });
  };
  snapshot('before-parse');
  const parseStart = performance.now();
  let parsed = await new Demoparser2Provider().parseWithReplay(dust2File);
  const parseMs = performance.now() - parseStart;
  assert.ok(parsed.replay); assert.ok(parsed.spatial);
  snapshot('after-parse');
  let report = buildDesktopReport(parsed.match, dust2File, parsed.spatial);
  const initStart = performance.now();
  const session = new HeatmapSession(parsed.match, parsed.replay, parsed.spatial, '00000000-0000-0000-0000-000000000072');
  const initializationMs = performance.now() - initStart;
  report.heatmap = session.metadata;
  assert.equal(report.heatmap.available, true);
  assert.deepEqual(JSON.parse(JSON.stringify(report.heatmap)), report.heatmap);
  assert.ok(session.bytes > 0 && session.bytes <= 512 * 1024);
  const defaultCacheBytes = session.bytes;
  const pureDefault = projectMapHeatmap(parsed.match, parsed.replay, parsed.spatial);
  assert.equal(jsonHash(pureDefault), '71369ea49c0ae2fa8c4f84c67698614c7b0f091f711894211ffa7f66697888cd');
  assert.equal(pureDefault.positions.observations.validPositionSamples, 178514);
  assert.equal(pureDefault.kills.locatableEvents, 161); assert.equal(pureDefault.kills.scopeEvents, 162);
  assert.equal(pureDefault.deaths.locatableEvents, 162); assert.equal(pureDefault.deaths.scopeEvents, 162);
  assert.equal(pureDefault.kills.unlocatableReasons.worldActor, 1);
  assert.equal(pureDefault.kills.outsideWindowEvents, 4); assert.equal(pureDefault.deaths.outsideWindowEvents, 4);
  snapshot('after-default-heatmap-cache');
  const cases = realHeatmapRequests(session.metadata), measurements = [];
  const batchStart = performance.now();
  for (const { label, request } of cases) {
    const directStart = performance.now();
    const direct = projectMapHeatmap(parsed.match, parsed.replay, parsed.spatial,
      { ...request.scope, resolution: request.resolution, layers: [request.layer] });
    const pureProjectionMs = performance.now() - directStart;
    const start = performance.now(), result = session.get(request), sessionMs = performance.now() - start;
    assert.equal(result.kind, 'success', `${label}: ${result.message}`);
    assert.deepEqual(result.projection, direct, label);
    assert.deepEqual(session.get(request), result, `${label}: repeated deterministic result`);
    for (const layer of ['positions', 'kills', 'deaths']) assert.equal(result.projection[layer] === null, layer !== request.layer);
    const responseBytes = Buffer.byteLength(JSON.stringify(result));
    assert.ok(responseBytes <= 512 * 1024, label);
    measurements.push({ label, request, pureProjectionMs, sessionMs, responseBytes, projectionHash: jsonHash(direct) });
  }
  const differentFiltersTotalMs = performance.now() - batchStart;
  assert.equal(session.bytes, defaultCacheBytes, 'Filtered requests never grow the default-only cache');
  const eventsOnly = new HeatmapSession(parsed.match, null, parsed.spatial, '00000000-0000-0000-0000-000000000073');
  assert.equal(eventsOnly.metadata.layers.positions.available, false);
  for (const layer of ['kills', 'deaths']) {
    const request = { ...cases[0].request, sessionId: eventsOnly.metadata.sessionId, layer };
    assert.equal(eventsOnly.get(request).kind, 'success');
  }
  eventsOnly.clear();
  const replaySession = new ReplaySession(parsed.match, parsed.replay, session.metadata.sessionId);
  const replayCacheBytes = replaySession.bytes;
  snapshot('both-caches-external-domain-references-still-held');
  // Remove the caller's domain references: the HeatmapSession is now the source owner.
  parsed = null; report = null;
  await nextTurn();
  snapshot('heatmap-owns-domain-references-with-replay-cache');
  const retained = memory.at(-1);
  session.clear(); assert.equal(session.bytes, 0);
  assert.equal(session.get(cases[0].request).kind, 'error');
  await nextTurn();
  snapshot('heatmap-released-replay-cache-still-live');
  const released = memory.at(-1);
  replaySession.clear();
  await nextTurn();
  snapshot('all-session-caches-released');
  const record = { stage: 'P7.2', fixture: '.demo/dust2.dem', fixtureSha256: dust2Sha, fixtureBytes: 557650967,
    environment: { node: process.version, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
    method: 'One isolated Node test process, one parse, one timed request per case plus one deterministic repeat. Memory snapshots request two full GCs only with --expose-gc. RSS includes native allocator retention; heap delta estimates source references and is not serialized DTO size. This is an isolated worker-equivalent session harness, not Electron Utility RSS.',
    parseMs, initializationMs, defaultCacheBytes, replayCacheBytes, defaultProjectionHash: jsonHash(pureDefault),
    differentFiltersTotalMs, requestCount: cases.length, measurements, memory,
    releaseObservedDelta: { rssBytes: retained.rss - released.rss, heapUsedBytes: retained.heapUsed - released.heapUsed },
    peakProcessRssKiB: process.resourceUsage().maxRSS };
  console.log(JSON.stringify(record));
  if (process.env.HEATMAP_SESSION_REPORT_FILE) writeFileSync(process.env.HEATMAP_SESSION_REPORT_FILE, JSON.stringify(record, null, 2) + '\n');
});
