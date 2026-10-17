import type { DesktopHeatmapMetadata, DesktopHeatmapRequest, DesktopHeatmapResult } from '@cs2-analyst/report-contract';

export const HEATMAP_RESPONSE_BYTES = 512 * 1024;
export const HEATMAP_REQUEST_BYTES = 16 * 1024;
export const HEATMAP_CACHE_BYTES = 512 * 1024;
/** Total observed Worker JS heap admission; excludes RSS/native allocations and is not per-source sizing. */
export const HEATMAP_WORKER_HEAP_BYTES = 512 * 1024 * 1024;
export const HEATMAP_MAX_PENDING = 2;
export const HEATMAP_TIMEOUT_MS = 15_000;
export const HEATMAP_MAX_PLAYERS = 64;
export const HEATMAP_MAX_ROUNDS = 1024;
const layers = ['positions', 'kills', 'deaths'];
type Check = (value: unknown) => boolean;
const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const object = (value: unknown, fields: Record<string, Check>): boolean => plain(value)
  && Reflect.ownKeys(value).length === Object.keys(fields).length
  && Object.entries(fields).every(([key, check]) => Object.hasOwn(value, key) && check(value[key]));
const literal = (...values: unknown[]): Check => value => values.includes(value);
const integer: Check = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positive: Check = value => integer(value) && (value as number) > 0;
const bool: Check = value => typeof value === 'boolean';
const string: Check = value => typeof value === 'string' && value.length > 0 && value.length <= 256
  && !/[\u0000-\u001f]/.test(value);
const nullable = (check: Check): Check => value => value === null || check(value);
const ratio: Check = value => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const array = (check: Check, max: number): Check => value => Array.isArray(value) && value.length <= max
  && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index) && check(value[index])).every(Boolean);
const uniqueArray = (check: Check, max: number): Check => value => array(check, max)(value)
  && new Set(value as unknown[]).size === (value as unknown[]).length;

/** Reject objects JSON would silently alter (undefined, accessors, cycles, NaN, custom prototypes). */
export function heatmapJsonBytes(value: unknown): number | null {
  const seen = new Set<object>();
  let nodes = 0;
  const visit = (item: unknown, depth: number): boolean => {
    if (++nodes > 100_000 || depth > 16) return false;
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item !== 'object' || (!Array.isArray(item) && !plain(item)) || seen.has(item)) return false;
    seen.add(item);
    const keys = Reflect.ownKeys(item);
    if (Array.isArray(item) && (keys.length !== item.length + 1
      || Array.from({ length: item.length }, (_, index) => Object.hasOwn(item, index)).some(present => !present))) return false;
    for (const key of keys) {
      if (Array.isArray(item) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor) || !visit(descriptor.value, depth + 1)) return false;
    }
    seen.delete(item);
    return true;
  };
  try { return visit(value, 0) ? new TextEncoder().encode(JSON.stringify(value)).byteLength : null; }
  catch { return null; }
}

export function validateHeatmapRequest(value: unknown, metadata: DesktopHeatmapMetadata): value is DesktopHeatmapRequest {
  try {
    const bytes = heatmapJsonBytes(value);
    if (bytes === null || bytes > HEATMAP_REQUEST_BYTES || !metadata.available) return false;
    return object(value, {
      schemaVersion: literal(1), sessionId: literal(metadata.sessionId), layer: v => layers.includes(v as string)
        && metadata.layers[v as keyof typeof metadata.layers]?.available === true,
      resolution: value => literal(16, 32, 64)(value) && metadata.resolutions.includes(value as 16 | 32 | 64),
      scope: v => object(v, {
        rounds: nullable(v => uniqueArray(x => positive(x) && metadata.rounds.includes(x as number), HEATMAP_MAX_ROUNDS)(v)),
        playerIds: nullable(v => uniqueArray(x => string(x) && metadata.playerIds.includes(x as string), HEATMAP_MAX_PLAYERS)(v)),
        side: literal('all', 'CT', 'T'), floor: nullable(v => string(v) && metadata.floors.includes(v as string)),
        includeFreezeTime: bool, samplingSet: literal('all-valid', 'uniform-8hz'),
      }),
    });
  } catch { return false; }
}

const counterFields = (names: string[]): Record<string, Check> => Object.fromEntries(names.map(name => [name, integer]));
const status = literal('complete', 'partial', 'unavailable');
const grid = (resolution: number): Check => value => object(value, {
  status: literal('data', 'empty'), ...counterFields(['validPositionSamples', 'aggregatedSamples', 'outOfBounds',
    'invalidMapping', 'unknownLayer', 'otherFloor', 'maxCellSampleCount']), maxCellSampleShare: ratio,
  cells: value => Array.isArray(value) && value.length === resolution * resolution
    && array((cell: unknown) => object(cell, { index: integer, cellSampleCount: integer, cellSampleShare: ratio, intensity: ratio }), resolution * resolution)(value)
    && value.every((cell, index) => cell.index === index),
});
const observations: Check = value => object(value, {
  ...counterFields(['expectedOpportunities', 'validPositionSamples', 'confirmedDeadObservations', 'observedButUnusable',
    'missingPositionObservations', 'positionObserved']), positionCoverage: ratio, positionCompleteness: ratio, status,
});
const events = (resolution: number): Check => value => object(value, {
  ...counterFields(['scopeEvents', 'locatableEvents', 'outsideWindowEvents', 'unknownSubjectExcludedByPlayerFilter', 'unknownSideEvents', 'otherSideEvents']),
  eventPositionCoverage: ratio, status,
  unlocatableReasons: value => object(value, counterFields(['worldActor', 'unknownPlayer', 'missingEvidence', 'ambiguousEvidence',
    'participantMismatch', 'missingAtEvent', 'missingExactSample', 'tickMismatch', 'invalidPosition', 'unknownSide'])),
  grid: grid(resolution),
});
const positions = (resolution: number): Check => value => object(value, {
  available: bool, unavailableReason: literal(null, 'replay-unavailable', 'uniform-grid-unavailable'), observations,
  sideUnknownObservations: integer, otherSideValidSamples: integer, selectedPositionCoverage: ratio, grid: grid(resolution),
});

/** Main applies this to untrusted Worker output before allowing a response across IPC. */
export function validateHeatmapResult(value: unknown, request: DesktopHeatmapRequest, metadata: DesktopHeatmapMetadata): value is DesktopHeatmapResult {
  try {
    const bytes = heatmapJsonBytes(value);
    if (bytes === null || bytes > HEATMAP_RESPONSE_BYTES) return false;
    if (object(value, { kind: literal('error'), message: string })) return true;
    const canonical = { ...request.scope,
      rounds: request.scope.rounds === null ? null : [...request.scope.rounds].sort((a, b) => a - b),
      playerIds: request.scope.playerIds === null ? null : [...request.scope.playerIds].sort(), layers: [request.layer] };
    const same = (left: unknown, right: unknown): boolean => {
      if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return left === right;
      if (Array.isArray(left) !== Array.isArray(right)) return false;
      return Reflect.ownKeys(left).length === Reflect.ownKeys(right).length
        && Object.keys(left).every(key => Object.hasOwn(right, key) && same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
    };
    return object(value, { kind: literal('success'), sessionId: literal(request.sessionId), projection: v => object(v, {
      schemaVersion: literal(1), projectionVersion: literal('p7.1-v1'), matchId: literal(metadata.matchId),
      samplingVersion: literal(metadata.samplingVersion), scope: v => same(v, canonical), map: v => same(v, metadata.map),
      grid: v => object(v, { resolution: literal(request.resolution), coordinates: literal('normalized-radar'),
        origin: literal('top-left'), boundary: literal('half-open'), normalization: literal('scope-relative-linear') }),
      windows: array(v => object(v, { round: v => metadata.rounds.includes(v as number), startTick: integer,
        endTick: integer, requestedFrames: integer, rosterSize: integer }), HEATMAP_MAX_ROUNDS),
      excludedRounds: array(v => metadata.rounds.includes(v as number), HEATMAP_MAX_ROUNDS),
      rosterApproximateRounds: uniqueArray(v => metadata.rounds.includes(v as number), HEATMAP_MAX_ROUNDS),
      freezeBoundaryUnknownRounds: uniqueArray(v => metadata.rounds.includes(v as number), HEATMAP_MAX_ROUNDS),
      ...Object.fromEntries(layers.map(layer => [layer, layer !== request.layer ? literal(null)
        : layer === 'positions' ? positions(request.resolution) : events(request.resolution)])),
    }) });
  } catch { return false; }
}
