import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HeatmapSession } from '../electron/heatmap-session.ts';
import { HEATMAP_CACHE_BYTES, HEATMAP_MAX_PENDING, HEATMAP_TIMEOUT_MS, HEATMAP_REQUEST_BYTES, HEATMAP_RESPONSE_BYTES,
  heatmapJsonBytes, validateHeatmapRequest, validateHeatmapResult } from '../shared/heatmap-ipc.ts';
import { fixture, map } from './heatmap-fixture.mjs';
import * as geometry from '../shared/replay-map-geometry.ts';
import * as rendererGeometry from '../renderer/src/replay-map.ts';
const f = fixture();
const session = new HeatmapSession(f.match, f.replay, f.spatial, 'session', { map });
const metadata = session.metadata;
const request = () => ({ schemaVersion: 1, sessionId: 'session', layer: 'positions', resolution: 32,
  scope: { rounds: null, playerIds: null, side: 'all', floor: null, includeFreezeTime: false, samplingSet: 'all-valid' } });

test('Renderer geometry compatibility exports use identical shared definitions and functions', () => {
  for (const name of ['replayMapDefinitions', 'worldToRadar', 'resolveMapLayer', 'replayResourceId']) assert.equal(rendererGeometry[name], geometry[name]);
  for (const definition of geometry.replayMapDefinitions) {
    for (const z of [null, -10000, -495, -50, 0, 11700, 20000]) assert.equal(rendererGeometry.resolveMapLayer(definition, z), geometry.resolveMapLayer(definition, z));
    for (const point of [{ x: definition.posX, y: definition.posY }, { x: 0, y: 0 }, { x: Infinity, y: 0 }]) assert.deepEqual(rendererGeometry.worldToRadar(definition, point), geometry.worldToRadar(definition, point));
  }
});

test('heatmap IPC limits are explicit, independent and measurable UTF-8 byte budgets', () => {
  assert.equal(HEATMAP_MAX_PENDING, 2); assert.equal(HEATMAP_TIMEOUT_MS, 15000);
  assert.equal(HEATMAP_RESPONSE_BYTES, 512 * 1024); assert.equal(HEATMAP_CACHE_BYTES, 512 * 1024);
  assert.equal(HEATMAP_REQUEST_BYTES, 16 * 1024);
  assert.equal(heatmapJsonBytes({ text: '地图' }), Buffer.byteLength(JSON.stringify({ text: '地图' })));
});

test('request rejects unknown fields, wrong shapes, stale identity, illegal enums and invalid filters at runtime', () => {
  assert.equal(validateHeatmapRequest(request(), metadata), true);
  const changes = [v => { v.extra = true; }, v => { v.schemaVersion = 2; }, v => { v.sessionId = 'old'; },
    v => { v.layer = 'other'; }, v => { v.resolution = 128; }, v => { v.resolution = '32'; },
    v => { v.scope.map = map; }, v => { v.scope.layers = ['positions']; }, v => { delete v.scope.side; },
    v => { v.scope.rounds = [0]; }, v => { v.scope.rounds = [-1]; }, v => { v.scope.rounds = [1.5]; },
    v => { v.scope.rounds = [2]; }, v => { v.scope.rounds = [1, 1]; }, v => { v.scope.rounds = [NaN]; },
    v => { v.scope.playerIds = ['unknown']; }, v => { v.scope.playerIds = ['1', '1']; },
    v => { v.scope.playerIds = ['x'.repeat(257)]; }, v => { v.scope.playerIds = Array(65).fill('1'); },
    v => { v.scope.rounds = Array(1025).fill(1); }, v => { v.scope.floor = 'lower'; },
    v => { v.scope.side = 'Unknown'; }, v => { v.scope.includeFreezeTime = 1; }, v => { v.scope.samplingSet = '8hz'; },
    v => { v.scope = null; }, v => { v.scope = []; }, v => { v.scope.playerIds = [undefined]; },
  ];
  for (const change of changes) { const req = request(); change(req); assert.equal(validateHeatmapRequest(req, metadata), false, change.toString()); }
  for (const invalid of [null, [], new Date(), 42, 'request']) assert.equal(validateHeatmapRequest(invalid, metadata), false);
  for (const scope of [{ rounds: [] }, { playerIds: [] }, { rounds: [1], playerIds: ['2', '1'], floor: 'default', side: 'T', includeFreezeTime: true, samplingSet: 'uniform-8hz' }]) {
    const req = request(); Object.assign(req.scope, scope); assert.equal(validateHeatmapRequest(req, metadata), true);
  }
});

test('JSON guard rejects silent JSON loss, cycles, class instances, accessors and prototype tricks', () => {
  const cycle = {}; cycle.self = cycle;
  for (const value of [{ n: undefined }, { n: NaN }, { n: Infinity }, { n: 1n }, { n() {} }, new Map(), new Date(), cycle,
    { get hidden() { throw new Error('must not execute'); } }, { [Symbol('hidden')]: true }, Object.assign([], { extra: true }), Array(1), Object.assign(Array(1), { extra: true })]) {
    assert.equal(heatmapJsonBytes(value), null);
  }
  const value = request(); Object.defineProperty(value.scope, 'side', { get() { throw new Error('private'); }, enumerable: true });
  assert.equal(validateHeatmapRequest(value, metadata), false);
});

test('response validates JSON-only shape and all identity, scope, grid and layer boundaries', () => {
  const req = request(), result = session.get(req);
  assert.equal(validateHeatmapResult(result, req, metadata), true);
  const changes = [v => { v.extra = 1; }, v => { v.sessionId = 'old'; }, v => { v.projection.matchId = 'other'; },
    v => { v.projection.samplingVersion = 'other'; }, v => { v.projection.map.resourceId = 'other'; },
    v => { v.projection.map.alignment = 'confirmed'; }, v => { v.projection.scope.side = 'T'; },
    v => { v.projection.scope.playerIds = []; }, v => { v.projection.scope.layers = ['kills']; },
    v => { v.projection.grid.resolution = 64; }, v => { v.projection.positions.grid.cells.pop(); },
    v => { v.projection.positions.grid.cells[0].index = 2; }, v => { v.projection.positions.grid.cells[0].cellSampleCount = -1; },
    v => { v.projection.positions.grid.cells[0].intensity = NaN; }, v => { v.projection.positions.grid.cells[0].intensity = 2; },
    v => { v.projection.positions.grid.extra = true; }, v => { v.projection.windows[0].round = 999; },
    v => { v.projection.positions.observations.expectedOpportunities = Infinity; }, v => { v.projection.positions = null; },
    v => { v.projection.deaths = {}; }, v => { v.projection.path = 'private'; },
  ];
  for (const change of changes) { const invalid = structuredClone(result); change(invalid); assert.equal(validateHeatmapResult(invalid, req, metadata), false, change.toString()); }
  assert.equal(validateHeatmapResult({ kind: 'error', message: '安全错误' }, req, metadata), true);
  assert.equal(validateHeatmapResult({ kind: 'error', message: 'x'.repeat(HEATMAP_RESPONSE_BYTES) }, req, metadata), false);
  assert.equal(validateHeatmapResult({ kind: 'error', message: 'safe', stack: 'private' }, req, metadata), false);
});

test('request filter ordering canonicalizes only projection scope, with unavailable layers rejected', () => {
  const req = request(); req.scope.playerIds = ['2', '1'];
  const result = session.get(req); assert.equal(result.kind, 'success');
  assert.deepEqual(result.projection.scope.playerIds, ['1', '2']);
  assert.deepEqual(req.scope.playerIds, ['2', '1']);
  assert.equal(validateHeatmapResult(result, req, metadata), true);
  const unavailable = structuredClone(metadata); unavailable.layers.positions.available = false;
  assert.equal(validateHeatmapRequest(req, unavailable), false);
  unavailable.available = false; assert.equal(validateHeatmapRequest(req, unavailable), false);
  const invalidResolution = structuredClone(metadata); invalidResolution.resolutions = [128];
  assert.equal(validateHeatmapRequest({ ...req, resolution: 128 }, invalidResolution), false, 'fixed protocol resolution whitelist is independent of metadata');
});
