import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HeatmapScheduler, defaultHeatmapScope } from '../renderer/src/heatmap-state.ts';
import { paintHeatmap, mountHeatmapCanvas } from '../renderer/src/heatmap-canvas.ts';
import { fixture, map } from './heatmap-fixture.mjs';
import { projectMapHeatmap } from '../shared/heatmap.ts';
const metadata = { schemaVersion: 1, sessionId: 'session', matchId: 'test', available: true, unavailableReason: null,
  layers: Object.fromEntries(['positions', 'kills', 'deaths'].map(layer => [layer, { available: true, unavailableReason: null }])),
  map: { id: 'synthetic', resourceId: 'test', alignment: 'unconfirmed', precision: 'schematic-position-distribution' },
  samplingVersion: 'test', resolutions: [16, 32, 64], playerIds: ['1', '2'], rounds: [1], floors: ['default'] };
const f = fixture();
const response = request => ({ kind: 'success', sessionId: request.sessionId,
  projection: projectMapHeatmap(f.match, f.replay, f.spatial, { ...request.scope, layers: [request.layer], resolution: request.resolution }, map) });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('renderer-wide queue caps real in-flight calls at two, merges filters and ignores stale/session-late results', async () => {
  const queue = new HeatmapScheduler(), jobs = [], output = [];
  const get = request => new Promise(resolve => jobs.push({ request, resolve }));
  const publish = (layer, state) => output.push({ layer, state });
  const initial = queue.update(metadata, 32, defaultHeatmapScope, ['positions', 'kills', 'deaths'], get, publish);
  await flush(); assert.equal(jobs.length, 2);
  initial();
  for (const side of ['CT', 'T', 'CT', 'T']) queue.update(metadata, 64, { ...defaultHeatmapScope, side }, ['positions', 'kills', 'deaths'], get, publish);
  assert.equal(jobs.length, 2);
  jobs[0].resolve(response(jobs[0].request)); await flush(); assert.equal(jobs.length, 3);
  assert.equal(jobs[2].request.scope.side, 'T'); assert.equal(jobs[2].request.resolution, 64);
  assert.equal(output.filter(item => item.state.status === 'ready').length, 0);
  const next = { ...metadata, sessionId: 'replacement' };
  const cancel = queue.update(next, 16, defaultHeatmapScope, ['deaths'], get, publish);
  jobs[1].resolve(response(jobs[1].request)); await flush();
  assert.equal(jobs.length, 4); assert.equal(jobs[3].request.sessionId, 'replacement');
  jobs[2].resolve(response(jobs[2].request)); jobs[3].resolve(response(jobs[3].request)); await flush();
  assert.deepEqual(output.filter(item => item.state.status === 'ready').map(item => item.layer), ['deaths']);
  cancel();
});
test('disabled layers do not request; errors, bridge exceptions and invalid results terminate loading', async () => {
  for (const get of [() => { throw new Error('bridge'); }, async () => ({ kind: 'error', message: 'timeout' }), async () => ({ kind: 'success' })]) {
    const queue = new HeatmapScheduler(), states = [];
    queue.update(metadata, 32, defaultHeatmapScope, [], get, (_, state) => states.push(state));
    await flush(); assert.deepEqual(states, []);
    queue.update(metadata, 32, defaultHeatmapScope, ['kills'], get, (_, state) => states.push(state));
    await flush(); assert.deepEqual(states.map(s => s.status), ['loading', 'error']);
  }
});
test('renderer preserves complete null scopes, isolated source availability and invalidation on dispose', async () => {
  assert.deepEqual(defaultHeatmapScope, { rounds: null, playerIds: null, side: 'all', floor: null, includeFreezeTime: false, samplingSet: 'all-valid' });
  const queue = new HeatmapScheduler(), states = []; let settle, sent;
  const dispose = queue.update(metadata, 32, defaultHeatmapScope, ['positions'], request => { sent = request; return new Promise(r => { settle = r; }); }, (_, s) => states.push(s));
  await flush(); assert.deepEqual(sent.scope, defaultHeatmapScope); dispose(); settle(response(sent)); await flush();
  assert.deepEqual(states.map(s => s.status), ['loading']);
  const partial = { ...metadata, layers: { ...metadata.layers, positions: { available: false, unavailableReason: 'replay-unavailable' } } };
  queue.update(partial, 32, defaultHeatmapScope, ['positions', 'kills'], async request => response(request), (layer, s) => states.push({ layer, ...s }));
  await flush(); assert.ok(states.some(s => s.layer === 'positions' && s.status === 'error')); assert.ok(states.some(s => s.layer === 'kills' && s.status === 'ready'));
});
test('Canvas paints normalized half-open row-major cells, skips empty/invalid values and uses fixed color composition', () => {
  for (const n of [16, 32, 64]) {
    const calls = [], ctx = { globalAlpha: 1, setTransform() {}, clearRect() {}, drawImage() { calls.push('base'); }, fillRect(...args) { calls.push({ args, color: this.fillStyle, alpha: this.globalAlpha }); } };
    const projection = response({ scope: defaultHeatmapScope, layer: 'positions', resolution: n }).projection;
    projection.positions.grid.cells = [
      { index: n + 2, cellSampleCount: 4, intensity: .5 }, { index: 0, cellSampleCount: 1, intensity: null },
      { index: n * n, cellSampleCount: 1, intensity: 1 }, { index: -1, cellSampleCount: 1, intensity: 1 },
      { index: 2, cellSampleCount: 0, intensity: 1 }, { index: 3, cellSampleCount: 1, intensity: NaN },
    ];
    const kills = { ...projection, kills: { grid: { cells: [{ index: n * n - 1, cellSampleCount: 1, intensity: 1 }] } } };
    paintHeatmap(ctx, {}, 1024, 1024, [{ layer: 'kills', projection: kills, color: 'gold' }, { layer: 'positions', projection, color: 'blue' }]);
    assert.equal(calls[0], 'base'); assert.deepEqual(calls[1], { args: [2 * 1024 / n, 1024 / n, 1024 / n, 1024 / n], color: 'blue', alpha: .4 });
    assert.equal(calls.length, 3); assert.equal(calls[2].color, 'gold'); assert.equal(ctx.globalAlpha, 1);
  }
});
test('Canvas observer coalesces redraw, tracks DPR without CSS resize, handles hidden and image failure, cleans all resources', () => {
  let frame, callback, mediaCallback, currentImage, observer, timer, pixels = 0, size = 100, dpr = 1;
  const listeners = new Set(), states = [], ctx = { clearRect() {}, setTransform() {}, drawImage() { pixels++; } };
  const platform = {
    window: { get devicePixelRatio() { return dpr; }, matchMedia() { return { addEventListener(_, fn) { mediaCallback = fn; }, removeEventListener(_, fn) { if (fn === mediaCallback) mediaCallback = null; } }; }, addEventListener(_, fn) { listeners.add(fn); }, removeEventListener(_, fn) { listeners.delete(fn); } },
    ResizeObserver: class { constructor(fn) { callback = fn; observer = this; } observe() {} disconnect() { this.disconnected = true; } },
    Image: class { constructor() { currentImage = this; } }, requestAnimationFrame(fn) { frame = fn; return 1; }, cancelAnimationFrame() { frame = null; },
    setInterval(fn) { timer = fn; return 1; }, clearInterval() { timer = null; },
  };
  const canvas = { width: 1, height: 1, style: {}, getContext() { return ctx; } };
  const mounted = mountHeatmapCanvas({ getBoundingClientRect: () => ({ width: size, height: size + 20 }) }, canvas, 'radar.png', () => [], s => states.push(s), platform);
  currentImage.onload(); callback(); mounted.schedule(); frame(); assert.equal(pixels, 1); assert.equal(canvas.width, 100);
  dpr = 2; mediaCallback(); frame(); assert.equal(canvas.width, 200); assert.equal(canvas.height, 200);
  dpr = 1; timer(); frame(); assert.equal(canvas.width, 100, 'DPR-only transitions without browser events still repaint');
  size = 0; callback(); frame(); assert.equal(canvas.width, 1);
  size = 100; callback(); currentImage.onerror(); frame(); assert.equal(states.at(-1), 'error'); assert.equal(pixels, 3);
  mounted.schedule(); mounted.dispose(); assert.equal(observer.disconnected, true); assert.equal(mediaCallback, null); assert.equal(frame, null);
  assert.equal(currentImage.onload, null); assert.equal(currentImage.onerror, null); assert.equal(currentImage.src, ''); assert.equal(listeners.size, 0); assert.equal(canvas.width, 1);
  assert.equal(timer, null);
});
