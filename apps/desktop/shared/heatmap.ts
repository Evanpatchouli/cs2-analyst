import type { Match, MatchReplay, MatchSpatialEvidence, ReplayPlayerSample, Round, SpatialEvidence } from '@cs2-analyst/match-model';
import type { HeatmapEvents, HeatmapGrid, HeatmapPositionObservations, HeatmapResolution, HeatmapScope, MapHeatmapProjection } from '@cs2-analyst/report-contract';
import { replayMapDefinitions, resolveMapLayer, worldToRadar } from './replay-map-geometry.ts';
import type { ReplayMapDefinition } from './replay-map-geometry.ts';

const tick = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const xyz = (p: readonly number[] | null | undefined): p is [number, number, number] =>
  p?.length === 3 && p.every(Number.isFinite);
const ratio = (n: number, d: number) => d > 0 ? n / d : null;
const status = (n: number, d: number) => d === 0 ? 'unavailable' as const : n === d ? 'complete' as const : 'partial' as const;
const defaults: HeatmapScope = { rounds: null, playerIds: null, side: 'all', floor: null,
  includeFreezeTime: false, samplingSet: 'all-valid', layers: ['positions', 'kills', 'deaths'] };

/** First failure wins. A mismatched actual tick is not an exact observation. */
export function classifyHeatmapObservation(sample: ReplayPlayerSample | undefined, requestedTick: number):
  'validPositionSamples' | 'confirmedDeadObservations' | 'observedButUnusable' | 'missingPositionObservations' {
  if (!sample || sample.actualTick !== requestedTick || !tick(sample.actualTick) || !xyz(sample.position)) return 'missingPositionObservations';
  if (sample.alive === false && sample.stateAmbiguous === false) return 'confirmedDeadObservations';
  if (sample.alive === true && sample.stateAmbiguous === false && (sample.side === 'CT' || sample.side === 'T') && sample.segment !== null) return 'validPositionSamples';
  return 'observedButUnusable';
}

/** Mirrors planReplay: grid is anchored at ROUND START, never freeze end or event ticks. */
export function heatmapUniformStep(replay: MatchReplay): number | null {
  const rate = replay.tickRate;
  return rate !== null && tick(rate) && rate >= 8 && rate % 8 === 0 && replay.hz === 8
    && replay.maxInterpolationTicks === rate / 8 ? rate / 8 : null;
}

function windowFor(round: Round, includeFreeze: boolean) {
  if (!tick(round.startTick) || !tick(round.endTick) || round.endTick < round.startTick) return null;
  const freezeKnown = tick(round.freezeEndTick) && round.freezeEndTick >= round.startTick && round.freezeEndTick <= round.endTick;
  return { start: !includeFreeze && freezeKnown ? round.freezeEndTick! : round.startTick, end: round.endTick, freezeKnown };
}
function rosterFor(round: Round, replay: MatchReplay) {
  const snapshots = round.stateSnapshots ?? [];
  const snapshot = snapshots.find(s => s.boundary === 'freeze_end' && s.availability === 'observed')
    ?? snapshots.find(s => s.boundary === 'start' && s.availability === 'observed');
  return { ids: [...new Set(snapshot ? snapshot.players.filter(p => p.participant === true).map(p => p.steamId) : replay.players)].sort(), approximate: !snapshot };
}
function makeGrid(n: HeatmapResolution): HeatmapGrid {
  return { status: 'empty', validPositionSamples: 0, aggregatedSamples: 0, outOfBounds: 0, invalidMapping: 0,
    unknownLayer: 0, otherFloor: 0, maxCellSampleCount: 0, maxCellSampleShare: null,
    cells: Array.from({ length: n * n }, (_, index) => ({ index, cellSampleCount: 0, cellSampleShare: null, intensity: null })) };
}
/** Floor filter only selects grid population; the observation/event coverage remains auditable. */
function addPoint(grid: HeatmapGrid, p: [number, number, number], map: ReplayMapDefinition | null, scope: HeatmapScope, n: HeatmapResolution) {
  const floor = map ? resolveMapLayer(map, p[2]) : null;
  if (floor === null) grid.unknownLayer++;
  if (scope.floor !== null && floor !== scope.floor) {
    if (floor !== null) grid.otherFloor++;
    return;
  }
  grid.validPositionSamples++;
  const radar = map ? worldToRadar(map, { x: p[0], y: p[1] }) : null;
  if (!radar || !Number.isFinite(radar.x) || !Number.isFinite(radar.y)) { grid.invalidMapping++; return; }
  const x = radar.x / map!.width, y = radar.y / map!.height;
  if (x < 0 || y < 0 || x >= 1 || y >= 1) { grid.outOfBounds++; return; }
  grid.cells[Math.floor(y * n) * n + Math.floor(x * n)].cellSampleCount++;
  grid.aggregatedSamples++;
}
function finishGrid(grid: HeatmapGrid) {
  grid.maxCellSampleCount = Math.max(...grid.cells.map(c => c.cellSampleCount));
  grid.maxCellSampleShare = ratio(grid.maxCellSampleCount, grid.validPositionSamples);
  grid.status = grid.aggregatedSamples > 0 ? 'data' : 'empty';
  for (const cell of grid.cells) {
    cell.cellSampleShare = ratio(cell.cellSampleCount, grid.validPositionSamples);
    cell.intensity = ratio(cell.cellSampleCount, grid.maxCellSampleCount);
  }
}
const evidenceKey = (round: number, tick: number, index: number) => `${round}:kill:${tick}:${index}`;
function makeEvents(n: HeatmapResolution): HeatmapEvents {
  return { scopeEvents: 0, locatableEvents: 0, eventPositionCoverage: null, status: 'unavailable',
    unlocatableReasons: { worldActor: 0, unknownPlayer: 0, missingEvidence: 0, ambiguousEvidence: 0, participantMismatch: 0,
      missingAtEvent: 0, missingExactSample: 0, tickMismatch: 0, invalidPosition: 0, unknownSide: 0 },
    outsideWindowEvents: 0, unknownSubjectExcludedByPlayerFilter: 0, unknownSideEvents: 0, otherSideEvents: 0, grid: makeGrid(n) };
}

/** Bounded pure presenter: reads existing domain evidence; does not parse, mutate, or retain it. */
export function projectMapHeatmap(match: Match, replay: MatchReplay | null, spatial: MatchSpatialEvidence | null,
  options: Partial<HeatmapScope> & { resolution?: HeatmapResolution } = {},
  map: ReplayMapDefinition | null = replayMapDefinitions.find(m => m.id === match.map) ?? null): MapHeatmapProjection {
  if ((replay && (replay.matchId !== match.id || replay.schemaVersion !== 1)) || (spatial && spatial.matchId !== match.id)) throw new Error('Heatmap identity/schema mismatch');
  const n = options.resolution ?? 32;
  if (![16, 32, 64].includes(n)) throw new Error('Invalid heatmap resolution');
  const scope: HeatmapScope = {
    side: options.side ?? defaults.side, floor: options.floor ?? defaults.floor,
    includeFreezeTime: options.includeFreezeTime ?? defaults.includeFreezeTime,
    samplingSet: options.samplingSet ?? defaults.samplingSet,
    rounds: options.rounds === null || options.rounds === undefined ? null : [...new Set(options.rounds)].sort((a, b) => a - b),
    playerIds: options.playerIds === null || options.playerIds === undefined ? null : [...new Set(options.playerIds)].sort(),
    layers: [...new Set(options.layers ?? defaults.layers)].sort() };
  if (!['all', 'CT', 'T'].includes(scope.side) || !['all-valid', 'uniform-8hz'].includes(scope.samplingSet)
    || typeof scope.includeFreezeTime !== 'boolean' || (scope.floor !== null && typeof scope.floor !== 'string')
    || scope.layers.some(l => !defaults.layers.includes(l)) || scope.rounds?.some(r => !tick(r))
    || scope.playerIds?.some(id => typeof id !== 'string')) throw new Error('Invalid heatmap scope');
  if (map && map.id !== match.map) throw new Error('Heatmap map mismatch');
  const step = replay ? heatmapUniformStep(replay) : null;
  const usable = replay !== null && (scope.samplingSet !== 'uniform-8hz' || step !== null);
  const observations: HeatmapPositionObservations = { expectedOpportunities: 0, validPositionSamples: 0, confirmedDeadObservations: 0,
    observedButUnusable: 0, missingPositionObservations: 0, positionObserved: 0, positionCoverage: null, positionCompleteness: null, status: 'unavailable' };
  const result: MapHeatmapProjection = { schemaVersion: 1, projectionVersion: 'p7.1-v1', matchId: match.id, samplingVersion: replay?.samplingVersion ?? null,
    scope, map: { id: match.map, resourceId: map?.resourceId ?? null, alignment: map ? map.versionMatch : 'unavailable', precision: 'schematic-position-distribution' },
    grid: { resolution: n, coordinates: 'normalized-radar', origin: 'top-left', boundary: 'half-open', normalization: 'scope-relative-linear' },
    windows: [], excludedRounds: [], rosterApproximateRounds: [], freezeBoundaryUnknownRounds: [],
    positions: scope.layers.includes('positions') ? { available: usable, unavailableReason: !replay ? 'replay-unavailable' : !usable ? 'uniform-grid-unavailable' : null,
      observations, sideUnknownObservations: 0, otherSideValidSamples: 0, selectedPositionCoverage: null, grid: makeGrid(n) } : null,
    kills: scope.layers.includes('kills') ? makeEvents(n) : null, deaths: scope.layers.includes('deaths') ? makeEvents(n) : null };
  const evidence = new Map<string, SpatialEvidence[]>();
  for (const entry of spatial?.events ?? []) if (entry.eventRef.type === 'kill' && 'eventIndex' in entry.eventRef) {
    const ref = entry.eventRef, key = evidenceKey(ref.round, ref.tick, ref.eventIndex);
    const group = evidence.get(key) ?? []; group.push(entry); evidence.set(key, group);
  }
  const playerIds = new Set(match.players.map(p => p.steamId));
  for (const round of [...match.rounds].sort((a, b) => a.number - b.number)) {
    if (scope.rounds !== null && !scope.rounds.includes(round.number)) continue;
    const window = windowFor(round, scope.includeFreezeTime);
    if (!window) { result.excludedRounds.push(round.number); continue; }
    if (!window.freezeKnown) result.freezeBoundaryUnknownRounds.push(round.number);
    const rr = replay?.rounds.find(r => r.round === round.number);
    const roster = replay ? rosterFor(round, replay) : { ids: [], approximate: false };
    const ids = roster.ids.filter(id => scope.playerIds === null || scope.playerIds.includes(id));
    if (replay && roster.approximate) result.rosterApproximateRounds.push(round.number);
    const frames = usable && rr ? rr.frames.filter(f => f.requestedTick >= window.start && f.requestedTick <= window.end
      && (scope.samplingSet !== 'uniform-8hz' || (f.requestedTick - round.startTick!) % step! === 0)) : [];
    if (replay && !rr && result.positions) result.excludedRounds.push(round.number);
    result.windows.push({ round: round.number, startTick: window.start, endTick: window.end, requestedFrames: frames.length, rosterSize: ids.length });
    if (result.positions) for (const frame of frames) {
      const samples = new Map(frame.players.map(s => [s.playerId, s]));
      for (const id of ids) {
        const sample = samples.get(id);
        observations.expectedOpportunities++;
        const category = classifyHeatmapObservation(sample, frame.requestedTick); observations[category]++;
        if (sample?.side === 'Unknown') result.positions.sideUnknownObservations++;
        if (category !== 'validPositionSamples') continue;
        if (scope.side !== 'all' && sample!.side !== scope.side) { result.positions.otherSideValidSamples++; continue; }
        addPoint(result.positions.grid, sample!.position!, map, scope, n);
      }
    }
    round.events.forEach((event, eventIndex) => {
      if (event.type !== 'kill') return;
      for (const [layer, role, subject, eventSide] of [
        [result.kills, 'actor', event.killer, event.killerSide], [result.deaths, 'target', event.victim, event.victimSide],
      ] as const) {
        if (!layer) continue;
        if (!tick(event.tick) || event.tick < window.start || event.tick > window.end) { layer.outsideWindowEvents++; continue; }
        const known = playerIds.has(subject);
        if (scope.playerIds !== null && (!known || !scope.playerIds.includes(subject))) {
          if (!known) layer.unknownSubjectExcludedByPlayerFilter++;
          continue;
        }
        const entries = evidence.get(evidenceKey(round.number, event.tick, eventIndex)) ?? [];
        const entry = entries.length === 1 ? entries[0] : null;
        const samples = entry?.samples.filter(b => b.role === role && b.sample.relation === 'at-event') ?? [];
        const sample = samples.length === 1 ? samples[0].sample : null;
        const exactIdentity = sample?.playerId === subject && sample.actualTick === event.tick && sample.requestedTick === event.tick;
        const side = exactIdentity && (sample.side === 'CT' || sample.side === 'T') ? sample.side : eventSide ?? 'Unknown';
        if (side === 'Unknown') layer.unknownSideEvents++;
        if (scope.side !== 'all' && side !== 'Unknown' && side !== scope.side) { layer.otherSideEvents++; continue; }
        layer.scopeEvents++;
        let reason: keyof HeatmapEvents['unlocatableReasons'] | null = null;
        if (subject === 'world' && role === 'actor') reason = 'worldActor';
        else if (!known) reason = 'unknownPlayer';
        else if (entries.length === 0) reason = 'missingEvidence';
        else if (entries.length > 1 || samples.length > 1) reason = 'ambiguousEvidence';
        else if (entry!.participants.filter(p => p.role === role).length !== 1 || !entry!.participants.some(p => p.role === role && p.playerId === subject)
          || (sample && sample.playerId !== subject)) reason = 'participantMismatch';
        else if (!sample) reason = 'missingAtEvent';
        else if (sample.actualTick === null) reason = 'missingExactSample';
        else if (!exactIdentity) reason = 'tickMismatch';
        else if (!sample.position || !xyz([sample.position.x, sample.position.y, sample.position.z])) reason = 'invalidPosition';
        else if (scope.side !== 'all' && side === 'Unknown') reason = 'unknownSide';
        if (reason) { layer.unlocatableReasons[reason]++; continue; }
        layer.locatableEvents++;
        const p = sample!.position!;
        addPoint(layer.grid, [p.x, p.y, p.z], map, scope, n);
      }
    });
  }
  observations.positionObserved = observations.validPositionSamples + observations.confirmedDeadObservations + observations.observedButUnusable;
  observations.positionCoverage = ratio(observations.validPositionSamples, observations.expectedOpportunities);
  observations.positionCompleteness = ratio(observations.positionObserved, observations.expectedOpportunities);
  observations.status = status(observations.validPositionSamples, observations.expectedOpportunities);
  if (result.positions) {
    finishGrid(result.positions.grid);
    result.positions.selectedPositionCoverage = ratio(result.positions.grid.validPositionSamples, observations.expectedOpportunities);
  }
  for (const layer of [result.kills, result.deaths]) if (layer) {
    layer.eventPositionCoverage = ratio(layer.locatableEvents, layer.scopeEvents);
    layer.status = status(layer.locatableEvents, layer.scopeEvents); finishGrid(layer.grid);
  }
  return result;
}
