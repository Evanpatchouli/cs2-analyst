import type { Match, MatchReplay, MatchSpatialEvidence } from '@cs2-analyst/match-model';
import type { DesktopHeatmapMetadata, DesktopHeatmapResult, MapHeatmapProjection } from '@cs2-analyst/report-contract';
import { projectMapHeatmap } from '../shared/heatmap.ts';
import { HEATMAP_CACHE_BYTES, HEATMAP_WORKER_HEAP_BYTES, HEATMAP_MAX_PLAYERS, HEATMAP_MAX_ROUNDS, heatmapJsonBytes, validateHeatmapRequest, validateHeatmapResult } from '../shared/heatmap-ipc.ts';
import { replayMapDefinitions } from '../shared/replay-map-geometry.ts';
import type { ReplayMapDefinition } from '../shared/replay-map-geometry.ts';

interface Options { map?: ReplayMapDefinition | null; cacheBytes?: number; project?: typeof projectMapHeatmap; getHeapUsed?: () => number }
class HeatmapMemoryBudgetError extends Error {}
const error = (message: string): DesktopHeatmapResult => ({ kind: 'error', message });
function metadataFor(match: Match, replay: MatchReplay | null, spatial: MatchSpatialEvidence | null, sessionId: string,
  map: ReplayMapDefinition | null, failure: 'initialization-failed' | 'memory-budget-exceeded' | null = null): DesktopHeatmapMetadata {
  const positions = failure === null && replay !== null, events = failure === null && spatial !== null;
  return { schemaVersion: 1, sessionId, matchId: match.id, available: positions || events,
    unavailableReason: failure ?? (positions || events ? null : 'sources-unavailable'),
    layers: {
      positions: { available: positions, unavailableReason: failure ?? (positions ? null : 'replay-unavailable') },
      kills: { available: events, unavailableReason: failure ?? (events ? null : 'spatial-unavailable') },
      deaths: { available: events, unavailableReason: failure ?? (events ? null : 'spatial-unavailable') },
    }, map: { id: match.map, resourceId: map?.resourceId ?? null, alignment: map ? map.versionMatch : 'unavailable', precision: 'schematic-position-distribution' },
    samplingVersion: replay?.samplingVersion ?? null, resolutions: [16, 32, 64],
    playerIds: [...new Set(match.players.map(player => player.steamId))].sort(),
    rounds: [...new Set(match.rounds.map(round => round.number))].sort((a, b) => a - b), floors: map?.layers.map(layer => layer.id) ?? [] };
}

/** Utility Process owns the references. Only serialized default projection is retained as cache. */
export class HeatmapSession {
  readonly metadata: DesktopHeatmapMetadata;
  private match: Match | null;
  private replay: MatchReplay | null;
  private spatial: MatchSpatialEvidence | null;
  private map: ReplayMapDefinition | null;
  private project: typeof projectMapHeatmap;
  private defaultJson: string | null = null;
  bytes = 0;
  constructor(match: Match, replay: MatchReplay | null, spatial: MatchSpatialEvidence | null, sessionId: string, options: Options = {}) {
    this.match = match; this.replay = replay; this.spatial = spatial;
    this.map = options.map === undefined ? replayMapDefinitions.find(map => map.id === match.map) ?? null : options.map;
    this.project = options.project ?? projectMapHeatmap;
    this.metadata = metadataFor(match, replay, spatial, sessionId, this.map);
    if (!sessionId || sessionId.length > 256 || match.id.length > 256 || this.metadata.playerIds.length > HEATMAP_MAX_PLAYERS
      || this.metadata.playerIds.some(id => !id || id.length > 256) || this.metadata.rounds.length > HEATMAP_MAX_ROUNDS
      || this.metadata.rounds.some(round => !Number.isSafeInteger(round) || round <= 0)) throw new Error('Heatmap metadata contract invalid');
    if (!this.metadata.available) { this.clear(); return; }
    // Admission only: observe existing total JS heap without copying sources or forcing GC.
    const checkHeapBudget = () => {
      const heapUsed = (options.getHeapUsed ?? (() => process.memoryUsage().heapUsed))();
      if (!Number.isFinite(heapUsed) || heapUsed < 0 || heapUsed > HEATMAP_WORKER_HEAP_BYTES) {
        this.clear(); throw new HeatmapMemoryBudgetError('Heatmap Worker heap admission budget exceeded');
      }
    };
    checkHeapBudget();
    const projection = this.project(match, replay, spatial, { resolution: 32 }, this.map);
    const size = heatmapJsonBytes(projection);
    if (size === null) throw new Error('Heatmap projection is not JSON');
    // An oversized cache is discarded; valid filtered projections remain available on demand.
    if (size <= Math.min(options.cacheBytes ?? HEATMAP_CACHE_BYTES, HEATMAP_CACHE_BYTES)) {
      this.defaultJson = JSON.stringify(projection); this.bytes = size;
    }
    checkHeapBudget();
  }
  get(request: unknown): DesktopHeatmapResult {
    if (!this.match || !validateHeatmapRequest(request, this.metadata)) return error('热力图会话或筛选请求无效。');
    try {
      const scope = request.scope;
      const defaultScope = request.resolution === 32 && scope.rounds === null && scope.playerIds === null
        && scope.side === 'all' && scope.floor === null && !scope.includeFreezeTime && scope.samplingSet === 'all-valid'
        // P7.1 records missing Replay rounds only when positions are selected. Event-only
        // calls must recompute that round bookkeeping rather than slice a multi-layer DTO.
        && (request.layer === 'positions' || !this.replay || this.match.rounds.every(round => this.replay!.rounds.some(rr => rr.round === round.number)));
      let projection: MapHeatmapProjection;
      if (defaultScope && this.defaultJson !== null) {
        projection = JSON.parse(this.defaultJson) as MapHeatmapProjection;
        projection = { ...projection, scope: { ...projection.scope, layers: [request.layer] },
          positions: request.layer === 'positions' ? projection.positions : null,
          kills: request.layer === 'kills' ? projection.kills : null, deaths: request.layer === 'deaths' ? projection.deaths : null };
      } else projection = this.project(this.match, this.replay, this.spatial, { ...scope, resolution: request.resolution, layers: [request.layer] }, this.map);
      const result: DesktopHeatmapResult = { kind: 'success', sessionId: this.metadata.sessionId, projection };
      return validateHeatmapResult(result, request, this.metadata) ? result : error('热力图响应超出预算或数据契约无效。');
    } catch { return error('热力图投影失败。'); }
  }
  clear() {
    this.defaultJson = null; this.bytes = 0; this.match = null; this.replay = null; this.spatial = null; this.map = null;
  }
}

/** Initialization failures never escape into report or Replay initialization. */
export function createHeatmapSession(match: Match, replay: MatchReplay | null, spatial: MatchSpatialEvidence | null,
  sessionId: string, options: Options = {}): { session: HeatmapSession | null; metadata: DesktopHeatmapMetadata } {
  try {
    const session = new HeatmapSession(match, replay, spatial, sessionId, options);
    if (!session.metadata.available) { session.clear(); return { session: null, metadata: session.metadata }; }
    return { session, metadata: session.metadata };
  } catch (cause) {
    const map = options.map === undefined ? replayMapDefinitions.find(map => map.id === match.map) ?? null : options.map;
    return { session: null, metadata: metadataFor(match, replay, spatial, sessionId, map,
      cause instanceof HeatmapMemoryBudgetError ? 'memory-budget-exceeded' : 'initialization-failed') };
  }
}
