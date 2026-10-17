import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { classifyHeatmapObservation, heatmapUniformStep, projectMapHeatmap } from '../shared/heatmap.ts';
import { fixture, sample, point, kill, map } from './heatmap-fixture.mjs';
const project = (f = fixture(), options = {}, definition = map) => projectMapHeatmap(f.match, f.replay, f.spatial, options, definition);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sum = values => values.reduce((a, b) => a + b, 0);
function jsonOnly(value) {
  assert.notEqual(value, undefined);
  if (typeof value === 'number') return assert.ok(Number.isFinite(value));
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  assert.equal(typeof value, 'object');
  assert.ok(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype);
  for (const child of Object.values(value)) jsonOnly(child);
}
function invariants(dto) {
  jsonOnly(dto); assert.deepEqual(JSON.parse(JSON.stringify(dto)), dto);
  const o = dto.positions?.observations;
  if (o) {
    assert.equal(o.expectedOpportunities, o.positionObserved + o.missingPositionObservations);
    assert.equal(o.positionObserved, o.validPositionSamples + o.confirmedDeadObservations + o.observedButUnusable);
    for (const key of ['expectedOpportunities', 'positionObserved', 'missingPositionObservations', 'validPositionSamples', 'confirmedDeadObservations', 'observedButUnusable']) assert.ok(Number.isSafeInteger(o[key]) && o[key] >= 0);
    for (const key of ['positionCoverage', 'positionCompleteness']) assert.ok(o[key] === null || o[key] >= 0 && o[key] <= 1);
  }
  for (const layer of [dto.positions, dto.kills, dto.deaths].filter(Boolean)) {
    const g = layer.grid;
    assert.equal(sum(g.cells.map(c => c.cellSampleCount)), g.aggregatedSamples);
    assert.equal(g.validPositionSamples, g.aggregatedSamples + g.outOfBounds + g.invalidMapping);
    for (const c of g.cells) {
      assert.ok(Number.isSafeInteger(c.cellSampleCount) && c.cellSampleCount >= 0);
      assert.equal(c.cellSampleShare, g.validPositionSamples ? c.cellSampleCount / g.validPositionSamples : null);
      assert.ok(c.intensity === null || c.intensity >= 0 && c.intensity <= 1);
    }
    if ('scopeEvents' in layer) {
      assert.equal(layer.scopeEvents, layer.locatableEvents + sum(Object.values(layer.unlocatableReasons)));
      assert.equal(layer.eventPositionCoverage, layer.scopeEvents ? layer.locatableEvents / layer.scopeEvents : null);
    }
  }
}

test('four observation categories are exclusive: unknown alive is unusable, never dead', () => {
  const cases = [
    [{}, 'validPositionSamples'], [{ alive: false, segment: null }, 'confirmedDeadObservations'],
    [{ alive: false, side: 'Unknown' }, 'confirmedDeadObservations'],
    [{ alive: null }, 'observedButUnusable'], [{ stateAmbiguous: true }, 'observedButUnusable'],
    [{ alive: false, stateAmbiguous: true }, 'observedButUnusable'], [{ side: 'Unknown' }, 'observedButUnusable'],
    [{ segment: null }, 'observedButUnusable'], [{ actualTick: null }, 'missingPositionObservations'],
    [{ actualTick: 9 }, 'missingPositionObservations'], [{ position: null }, 'missingPositionObservations'],
    ...[NaN, Infinity, -Infinity, undefined].map(z => [{ position: point(1, 2, z) }, 'missingPositionObservations']),
  ];
  // undefined must actually remove Z (point's default argument otherwise makes it zero).
  cases.at(-1)[0].position = [1, 2];
  for (const [overrides, category] of cases) assert.equal(classifyHeatmapObservation(sample('1', overrides), 8), category);
  assert.equal(classifyHeatmapObservation(undefined, 8), 'missingPositionObservations');
  const f = fixture(cases.map(([overrides], i) => sample(String(i + 1), overrides)), []);
  f.replay.rounds[0].frames[0].players.pop(); // roster member with no row
  const dto = project(f); invariants(dto);
  assert.equal(dto.positions.observations.expectedOpportunities, cases.length);
  assert.equal(dto.positions.observations.confirmedDeadObservations, 2);
  assert.equal(dto.positions.observations.observedButUnusable, 5);
});

test('16/32/64 normalized radar cells: half-open edges, four corners, no clamp, canvas independent', () => {
  for (const resolution of [16, 32, 64]) {
    const positions = [[0, 1024, 0], [1023.99, 1024, 0], [0, 0.01, 0], [1023.99, 0.01, 0],
      [1024 / resolution, 1024 - 1024 / resolution, 0], [-1, 10, 0], [1024, 10, 0], [10, 0, 0], [10, 1025, 0]];
    const f = fixture(positions.map((position, i) => sample(String(i), { position })), []);
    const dto = project(f, { resolution }); invariants(dto);
    const g = dto.positions.grid;
    for (const i of [0, resolution - 1, (resolution - 1) * resolution, resolution * resolution - 1, resolution + 1]) assert.equal(g.cells[i].cellSampleCount, 1);
    assert.equal(g.outOfBounds, 4);
    assert.deepEqual(g, project(f, { resolution }, { ...map, width: 2048, height: 512 }).positions.grid);
  }
});

test('invalid XYZ and invalid mapping have separate accounting; no fake heat or zero ratios', () => {
  const invalid = project(fixture([sample('1', { position: point(1, 2, NaN) })], []));
  invariants(invalid); assert.equal(invalid.positions.observations.missingPositionObservations, 1);
  assert.equal(invalid.positions.grid.validPositionSamples, 0);
  for (const cell of invalid.positions.grid.cells) { assert.equal(cell.cellSampleShare, null); assert.equal(cell.intensity, null); }
  const badMap = project(fixture(), {}, { ...map, scale: 0 }); invariants(badMap);
  assert.equal(badMap.positions.grid.invalidMapping, 2); assert.equal(badMap.positions.grid.status, 'empty');
  const missing = project(fixture(), {}, null); invariants(missing); assert.equal(missing.map.alignment, 'unavailable');
  const overflow = project(fixture([sample('1', { position: point(Number.MAX_VALUE) })], []), {}, { ...map, scale: Number.MIN_VALUE });
  invariants(overflow); assert.equal(overflow.positions.grid.invalidMapping, 1);
  for (const options of [{ rounds: [] }, { playerIds: [] }]) {
    const dto = project(fixture(), options); invariants(dto);
    assert.equal(dto.positions.observations.positionCoverage, null);
    assert.equal(dto.positions.observations.positionCompleteness, null);
  }
});

test('roster snapshot is preferred, genuinely absent snapshot falls back; missing row preserves opportunity', () => {
  const f = fixture(); f.replay.rounds[0].frames[0].players.pop();
  let dto = project(f); invariants(dto); assert.equal(dto.positions.observations.missingPositionObservations, 1);
  assert.equal(project(f, { playerIds: ['absent'] }).positions.observations.expectedOpportunities, 0);
  f.match.rounds[0].stateSnapshots[0].availability = 'unavailable';
  f.match.rounds[0].stateSnapshots.push({ boundary: 'start', availability: 'observed', players: [{ steamId: '1', participant: true }] });
  assert.equal(project(f).positions.observations.expectedOpportunities, 1);
  f.match.rounds[0].stateSnapshots = [];
  dto = project(f); invariants(dto); assert.deepEqual(dto.rosterApproximateRounds, [1]);
  assert.equal(dto.positions.observations.expectedOpportunities, 2);
  f.match.rounds[0].stateSnapshots = [{ boundary: 'start', availability: 'observed', players: [] }];
  assert.equal(project(f).positions.observations.expectedOpportunities, 0, 'Observed empty roster is not fallback');
});

test('freeze windows, unknown freeze, uniform 8Hz anchored at round start excluding extra event ticks', () => {
  const f = fixture(); const r = f.replay.rounds[0];
  r.frames = [0, 7, 8, 9, 16, 24, 25].map(requestedTick => ({ requestedTick, players: [sample('1', { actualTick: requestedTick })] }));
  f.match.rounds[0].freezeEndTick = 9; // not grid aligned
  assert.equal(project(f).windows[0].requestedFrames, 3);
  const uniform = project(f, { samplingSet: 'uniform-8hz' }); invariants(uniform);
  assert.equal(uniform.windows[0].requestedFrames, 2);
  assert.equal(project(f, { includeFreezeTime: true }).windows[0].requestedFrames, 6);
  assert.equal(project(f, { includeFreezeTime: true, samplingSet: 'uniform-8hz' }).windows[0].requestedFrames, 4);
  delete f.match.rounds[0].freezeEndTick;
  assert.deepEqual(project(f).freezeBoundaryUnknownRounds, [1]);
  for (const rate of [null, 63, 0, Infinity]) {
    f.replay.tickRate = rate; assert.equal(heatmapUniformStep(f.replay), null);
    const dto = project(f, { samplingSet: 'uniform-8hz' }); invariants(dto);
    assert.equal(dto.positions.unavailableReason, 'uniform-grid-unavailable');
    assert.equal(dto.positions.observations.positionCoverage, null);
  }
  f.replay.tickRate = 64; f.replay.maxInterpolationTicks = 16;
  assert.equal(heatmapUniformStep(f.replay), null);
});

test('player/round/side filtering follows sampled side changes; four source categories remain intact', () => {
  const f = fixture();
  f.match.rounds.push({ ...structuredClone(f.match.rounds[0]), number: 2 });
  f.replay.rounds.push({ ...structuredClone(f.replay.rounds[0]), round: 2 });
  f.replay.rounds[1].frames[0].players[0].side = 'T';
  const dto = project(f, { playerIds: ['1'], side: 'CT' }); invariants(dto);
  assert.equal(dto.positions.observations.expectedOpportunities, 2);
  assert.equal(dto.positions.observations.validPositionSamples, 2);
  assert.equal(dto.positions.grid.validPositionSamples, 1);
  assert.equal(dto.positions.otherSideValidSamples, 1);
  assert.equal(dto.positions.selectedPositionCoverage, .5);
  assert.equal(project(f, { rounds: [2], playerIds: ['1'], side: 'CT' }).positions.grid.validPositionSamples, 0);
  assert.equal(project(f, { rounds: [2], playerIds: ['1'], side: 'T' }).positions.grid.validPositionSamples, 1);
});

test('multi-floor ambiguity and bounds stay unknown; floor filters do not alter source coverage', () => {
  const definition = { ...map, layers: [{ id: 'lower', minZ: -10, maxZ: 0 }, { id: 'upper', minZ: 0, maxZ: 10 }] };
  const f = fixture([-1, 0, 1, 11].map((z, i) => sample(String(i), { position: point(100, 100, z) })), []);
  const all = project(f, {}, definition); invariants(all); assert.equal(all.positions.grid.unknownLayer, 2);
  const dto = project(f, { floor: 'upper' }, definition); invariants(dto);
  assert.equal(dto.positions.observations.validPositionSamples, 4);
  assert.equal(dto.positions.grid.validPositionSamples, 1);
  assert.equal(dto.positions.grid.unknownLayer, 2); assert.equal(dto.positions.grid.otherFloor, 1);
  assert.equal(dto.positions.selectedPositionCoverage, .25);
});

test('exact event identity includes eventIndex and roles; same-tick kills remain independent', () => {
  const f = fixture(undefined, [kill(), kill(8, '2', '1')]);
  f.spatial.events[1].samples[0].sample.position = { x: 500, y: 524, z: 0 };
  const dto = project(f); invariants(dto);
  assert.equal(dto.kills.scopeEvents, 2); assert.equal(dto.kills.locatableEvents, 2);
  assert.equal(dto.kills.grid.cells[0].cellSampleCount, 1);
  assert.equal(dto.kills.grid.cells[15 * 32 + 15].cellSampleCount, 1);
  assert.equal(dto.deaths.grid.cells[28 * 32 + 28].cellSampleCount, 2);
  assert.equal(project(f, { playerIds: ['1'] }).kills.scopeEvents, 1);
  assert.equal(project(f, { playerIds: ['1'] }).deaths.scopeEvents, 1);
  f.spatial.events[1].eventRef.eventIndex = 99;
  const missing = project(f); invariants(missing); assert.equal(missing.kills.unlocatableReasons.missingEvidence, 1);
});

test('unlocatable events retain exclusive reasons; never fallback to replay', () => {
  const mutations = [
    [f => { f.spatial.events = []; }, 'missingEvidence'],
    [f => { f.spatial.events.push(structuredClone(f.spatial.events[0])); }, 'ambiguousEvidence'],
    [f => { f.spatial.events[0].participants[0].playerId = '2'; }, 'participantMismatch'],
    [f => { f.spatial.events[0].samples[0].sample.playerId = '2'; }, 'participantMismatch'],
    [f => { f.spatial.events[0].samples[0].sample.relation = 'before-event'; }, 'missingAtEvent'],
    [f => { f.spatial.events[0].samples[0].sample.actualTick = null; }, 'missingExactSample'],
    [f => { f.spatial.events[0].samples[0].sample.actualTick = 9; }, 'tickMismatch'],
    [f => { f.spatial.events[0].samples[0].sample.requestedTick = 9; }, 'tickMismatch'],
    [f => { f.spatial.events[0].samples[0].sample.position = null; }, 'invalidPosition'],
    [f => { f.spatial.events[0].samples[0].sample.position.z = Infinity; }, 'invalidPosition'],
    [f => { f.spatial.events[0].eventRef.tick = 9; }, 'missingEvidence'],
    [f => { f.spatial.events[0].eventRef.round = 2; }, 'missingEvidence'],
    [f => { f.spatial.events[0].eventRef.type = 'damage'; }, 'missingEvidence'],
  ];
  for (const [mutate, reason] of mutations) {
    const f = fixture(); mutate(f); const dto = project(f); invariants(dto);
    assert.equal(dto.kills.scopeEvents, 1); assert.equal(dto.kills.locatableEvents, 0);
    assert.equal(dto.kills.unlocatableReasons[reason], 1);
    assert.equal(dto.deaths.scopeEvents, 1);
  }
  for (const [subject, reason] of [['world', 'worldActor'], ['unknown', 'unknownPlayer']]) {
    const dto = project(fixture(undefined, [kill(8, subject)])); invariants(dto);
    assert.equal(dto.kills.unlocatableReasons[reason], 1); assert.equal(dto.deaths.locatableEvents, 1);
  }
});

test('events exclude window first; actual event side and subject filter independently for each layer', () => {
  const f = fixture(undefined, [kill(7), kill(8), kill(25), kill(16, 'world')]);
  f.spatial.events[1].samples[0].sample.side = 'T'; // actual side overrides reported CT
  let dto = project(f, { side: 'T' }); invariants(dto);
  assert.equal(dto.kills.outsideWindowEvents, 2); assert.equal(dto.kills.scopeEvents, 1); assert.equal(dto.kills.locatableEvents, 1);
  dto = project(f, { playerIds: ['1'] }); invariants(dto);
  assert.equal(dto.kills.scopeEvents, 1); assert.equal(dto.deaths.scopeEvents, 0);
  assert.equal(dto.kills.unknownSubjectExcludedByPlayerFilter, 1);
  delete f.match.rounds[0].events[1].killerSide; f.spatial.events[1].samples[0].sample.side = 'Unknown';
  dto = project(f, { side: 'T' }); invariants(dto);
  assert.equal(dto.kills.scopeEvents, 1); assert.equal(dto.kills.unlocatableReasons.unknownSide, 1);
  assert.equal(dto.kills.unknownSideEvents, 1);
  assert.equal(project(f, { includeFreezeTime: true }).kills.scopeEvents, 3);
});

test('layer availability is independent; empty scopes and invalid windows are explicit', () => {
  const f = fixture();
  let dto = project({ ...f, replay: null }); invariants(dto);
  assert.equal(dto.positions.available, false); assert.equal(dto.kills.locatableEvents, 1);
  dto = project({ ...f, spatial: null }); invariants(dto);
  assert.equal(dto.positions.observations.validPositionSamples, 2); assert.equal(dto.kills.unlocatableReasons.missingEvidence, 1);
  dto = project(f, { layers: ['deaths'] }); invariants(dto); assert.equal(dto.positions, null); assert.equal(dto.kills, null);
  delete f.match.rounds[0].endTick;
  dto = project(f); invariants(dto); assert.deepEqual(dto.excludedRounds, [1]); assert.equal(dto.kills.eventPositionCoverage, null);
});

test('scope-relative intensity recomputes; floor selection leaves exact event coverage intact', () => {
  const f = fixture([sample('1', { position: point(10, 1014) }), sample('2', { position: point(10, 1014), side: 'T' }),
    sample('3', { position: point(900, 124), side: 'T' })]);
  const all = project(f), filtered = project(f, { playerIds: ['1', '3'] });
  invariants(all); invariants(filtered);
  assert.equal(all.positions.grid.cells[28 * 32 + 28].intensity, .5);
  assert.equal(filtered.positions.grid.cells[28 * 32 + 28].intensity, 1);
  assert.equal(all.positions.grid.cells[0].cellSampleShare, 2 / 3);
  assert.equal(filtered.positions.grid.cells[0].cellSampleShare, .5);
  const multi = { ...map, layers: [{ id: 'lower', minZ: -10, maxZ: 0 }, { id: 'upper', minZ: 0, maxZ: 10 }] };
  f.spatial.events[0].samples[0].sample.position.z = 0; // shared boundary unknown
  f.spatial.events[0].samples[1].sample.position.z = -1;
  const dto = project(f, { floor: 'upper' }, multi); invariants(dto);
  assert.equal(dto.kills.scopeEvents, 1); assert.equal(dto.kills.locatableEvents, 1);
  assert.equal(dto.kills.eventPositionCoverage, 1); assert.equal(dto.kills.grid.unknownLayer, 1);
  assert.equal(dto.kills.grid.validPositionSamples, 0); assert.equal(dto.kills.grid.cells[0].cellSampleShare, null);
  assert.equal(dto.deaths.grid.otherFloor, 1); assert.equal(dto.deaths.grid.validPositionSamples, 0);
});

test('projection is deterministic, JSON-only, bounded, and leaves domain input untouched', () => {
  const f = fixture(); const before = hash(f);
  const first = project(f), second = project(f); invariants(first);
  assert.equal(hash(first), hash(second)); assert.equal(hash(f), before);
  assert.equal(first.grid.resolution, 32); assert.equal(first.map.alignment, 'unconfirmed');
  assert.equal(first.positions.grid.cells.length, 1024);
  assert.equal(JSON.stringify(first).includes('actualTick'), false);
  const extra = project(f, { custom: new Map(), resolution: 16 }); invariants(extra); assert.equal('custom' in extra.scope, false);
  for (const options of [{ resolution: 128 }, { rounds: [NaN] }, { side: 'Unknown' }]) assert.throws(() => project(f, options));
  assert.throws(() => project({ ...f, replay: { ...f.replay, matchId: 'wrong' } }));
  assert.throws(() => project({ ...f, spatial: { ...f.spatial, matchId: 'wrong' } }));
});
