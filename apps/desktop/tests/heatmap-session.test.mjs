import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HeatmapSession, createHeatmapSession } from '../electron/heatmap-session.ts';
import { projectMapHeatmap } from '../shared/heatmap.ts';
import { HEATMAP_CACHE_BYTES, HEATMAP_WORKER_HEAP_BYTES } from '../shared/heatmap-ipc.ts';
import { fixture, map } from './heatmap-fixture.mjs';

const scope = { rounds: null, playerIds: null, side: 'all', floor: null, includeFreezeTime: false, samplingSet: 'all-valid' };
const request = (options = {}) => ({ schemaVersion: 1, sessionId: 'session', layer: 'positions', resolution: 32, scope: { ...scope }, ...options });
const setup = (f = fixture(), options = {}) => new HeatmapSession(f.match, f.replay, f.spatial, 'session', { map, ...options });

test('default projection builds once; serialized cache cannot be mutated by single-layer responses', () => {
  const f = fixture(); let calls = 0;
  const session = setup(f, { project: (...args) => { calls++; return projectMapHeatmap(...args); } });
  assert.equal(calls, 1); assert.ok(session.bytes > 0 && session.bytes <= HEATMAP_CACHE_BYTES);
  const bytes = session.bytes;
  for (const layer of ['positions', 'kills', 'deaths']) {
    const req = request({ layer }); const result = session.get(req);
    assert.equal(result.kind, 'success');
    assert.deepEqual(result.projection, projectMapHeatmap(f.match, f.replay, f.spatial, { resolution: 32, ...scope, layers: [layer] }, map));
    for (const other of ['positions', 'kills', 'deaths'].filter(x => x !== layer)) assert.equal(result.projection[other], null);
    result.projection.scope.layers.push('other'); result.projection[layer].grid.cells[0].cellSampleCount = 100;
    assert.equal(session.get(req).projection[layer].grid.cells[0].cellSampleCount, layer === 'kills' ? 1 : 0);
  }
  assert.equal(calls, 1); assert.equal(session.bytes, bytes);
});

test('16/32/64 filters match P7.1 direct projections and repeated requests are deterministic', () => {
  const f = fixture(), session = setup(f), bytes = session.bytes;
  for (const resolution of [16, 32, 64]) for (const layer of ['positions', 'kills', 'deaths']) {
    const selectedScope = { ...scope, rounds: [1], playerIds: ['1'], side: 'CT', floor: 'default', includeFreezeTime: true, samplingSet: 'uniform-8hz' };
    const req = request({ resolution, layer, scope: selectedScope });
    const result = session.get(req); assert.equal(result.kind, 'success');
    assert.deepEqual(result, session.get(req));
    assert.deepEqual(result.projection, projectMapHeatmap(f.match, f.replay, f.spatial, { resolution, ...selectedScope, layers: [layer] }, map));
  }
  assert.equal(session.bytes, bytes, 'Filtered responses do not add cache entries');
});

test('cache upper bound discards oversized default while preserving on-demand filtering', () => {
  const f = fixture(); let calls = 0;
  const session = setup(f, { cacheBytes: 1, project: (...args) => { calls++; return projectMapHeatmap(...args); } });
  assert.equal(session.bytes, 0); assert.equal(session.defaultJson, null); assert.equal(calls, 1);
  assert.equal(session.get(request()).kind, 'success'); assert.equal(calls, 2);
  assert.equal(session.bytes, 0);
  assert.ok(setup(f, { cacheBytes: Infinity }).bytes <= HEATMAP_CACHE_BYTES);
});

test('event-only cached request preserves P7.1 excludedRounds when Replay lacks a match round', () => {
  const f = fixture();
  f.match.rounds.push({ ...structuredClone(f.match.rounds[0]), number: 2 });
  const session = setup(f);
  assert.deepEqual(session.get(request()).projection.excludedRounds, [2]);
  for (const layer of ['kills', 'deaths']) {
    const actual = session.get(request({ layer })); assert.equal(actual.kind, 'success');
    assert.deepEqual(actual.projection, projectMapHeatmap(f.match, f.replay, f.spatial, { ...scope, layers: [layer], resolution: 32 }, map));
    assert.deepEqual(actual.projection.excludedRounds, []);
  }
});

test('Replay and Spatial source availability is independent, including zero-event spatial data', () => {
  const f = fixture();
  const events = setup({ ...f, replay: null });
  assert.equal(events.metadata.available, true); assert.equal(events.metadata.layers.positions.unavailableReason, 'replay-unavailable');
  assert.equal(events.get(request()).kind, 'error');
  assert.equal(events.get(request({ layer: 'kills' })).projection.kills.locatableEvents, 1);
  assert.equal(events.get(request({ layer: 'deaths' })).projection.samplingVersion, null);
  const positions = setup({ ...f, spatial: null });
  assert.equal(positions.get(request()).projection.positions.observations.validPositionSamples, 2);
  assert.equal(positions.metadata.layers.kills.unavailableReason, 'spatial-unavailable');
  assert.equal(positions.get(request({ layer: 'kills' })).kind, 'error');
  const empty = setup(fixture(undefined, []));
  assert.equal(empty.metadata.layers.kills.available, true);
  assert.equal(empty.get(request({ layer: 'kills' })).projection.kills.scopeEvents, 0);
});

test('missing map mapping does not relabel available sources; missing all sources creates no session', () => {
  const f = fixture(), session = setup(f, { map: null });
  assert.equal(session.metadata.available, true); assert.equal(session.metadata.map.alignment, 'unavailable');
  assert.equal(session.metadata.layers.positions.available, true);
  assert.equal(session.get(request()).projection.positions.grid.invalidMapping, 2);
  assert.equal(session.get(request({ scope: { ...scope, floor: 'default' } })).kind, 'error');
  const missing = createHeatmapSession(f.match, null, null, 'session');
  assert.equal(missing.session, null); assert.equal(missing.metadata.unavailableReason, 'sources-unavailable');
});

test('initialization and request projection exceptions downgrade only heatmap', () => {
  const f = fixture(); const before = JSON.stringify(f);
  const failed = createHeatmapSession(f.match, f.replay, f.spatial, 'session', { map, project() { throw new Error('private file path'); } });
  assert.equal(failed.session, null); assert.equal(failed.metadata.unavailableReason, 'initialization-failed');
  assert.equal(JSON.stringify(failed).includes('private file path'), false);
  const session = setup(f, { project: (...args) => args[3].resolution === 16 ? (() => { throw new Error('private'); })() : projectMapHeatmap(...args) });
  assert.equal(session.get(request({ resolution: 16 })).kind, 'error');
  assert.equal(session.get(request()).kind, 'success'); assert.equal(JSON.stringify(f), before);
  assert.equal(createHeatmapSession(f.match, { ...f.replay, matchId: 'wrong' }, f.spatial, 'session').metadata.available, false);
});

test('clear removes cache and original domain references; released requests fail safely and clear is idempotent', () => {
  const f = fixture(), session = setup(f);
  assert.equal(session.match, f.match); assert.equal(session.replay, f.replay); assert.equal(session.spatial, f.spatial);
  session.clear(); session.clear();
  assert.equal(session.bytes, 0); assert.equal(session.defaultJson, null);
  for (const key of ['match', 'replay', 'spatial', 'map']) assert.equal(session[key], null);
  assert.equal(session.get(request()).kind, 'error');
});

test('Worker total JS heap admission disables only heatmap before projection when over budget', () => {
  const f = fixture(), before = JSON.stringify(f); let calls = 0;
  assert.equal(HEATMAP_WORKER_HEAP_BYTES, 512 * 1024 * 1024);
  const result = createHeatmapSession(f.match, f.replay, f.spatial, 'session', { map,
    getHeapUsed: () => HEATMAP_WORKER_HEAP_BYTES + 1,
    project: (...args) => { calls++; return projectMapHeatmap(...args); } });
  assert.equal(result.session, null); assert.equal(calls, 0);
  assert.equal(result.metadata.available, false); assert.equal(result.metadata.unavailableReason, 'memory-budget-exceeded');
  for (const layer of Object.values(result.metadata.layers)) assert.deepEqual(layer, { available: false, unavailableReason: 'memory-budget-exceeded' });
  assert.equal(JSON.stringify(f), before);
});

test('Worker heap admission after initial cache clears references/cache before independent downgrade', () => {
  const f = fixture(); let reads = 0, calls = 0, cleared = 0;
  const originalClear = HeatmapSession.prototype.clear;
  HeatmapSession.prototype.clear = function () {
    assert.ok(this.bytes > 0); assert.notEqual(this.defaultJson, null);
    originalClear.call(this);
    for (const field of ['match', 'replay', 'spatial', 'map', 'defaultJson']) assert.equal(this[field], null);
    assert.equal(this.bytes, 0); cleared++;
  };
  try {
    const result = createHeatmapSession(f.match, f.replay, f.spatial, 'session', { map,
      getHeapUsed: () => ++reads === 1 ? HEATMAP_WORKER_HEAP_BYTES : HEATMAP_WORKER_HEAP_BYTES + 1,
      project: (...args) => { calls++; return projectMapHeatmap(...args); } });
    assert.equal(reads, 2); assert.equal(calls, 1); assert.equal(cleared, 1);
    assert.equal(result.session, null); assert.equal(result.metadata.unavailableReason, 'memory-budget-exceeded');
  } finally { HeatmapSession.prototype.clear = originalClear; }
  const admitted = setup(f, { getHeapUsed: () => HEATMAP_WORKER_HEAP_BYTES });
  assert.equal(admitted.get(request()).kind, 'success'); admitted.clear();
});
