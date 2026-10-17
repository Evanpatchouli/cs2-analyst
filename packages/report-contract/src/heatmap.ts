/** Independent JSON-only protocol; no IPC/session or report schema change in P7.1. */
export type HeatmapLayer = 'positions' | 'kills' | 'deaths';
export type HeatmapResolution = 16 | 32 | 64;
export interface HeatmapScope {
  rounds: number[] | null;
  playerIds: string[] | null;
  side: 'all' | 'CT' | 'T';
  floor: string | null;
  includeFreezeTime: boolean;
  samplingSet: 'all-valid' | 'uniform-8hz';
  layers: HeatmapLayer[];
}
export interface HeatmapCell {
  index: number;
  cellSampleCount: number;
  cellSampleShare: number | null;
  intensity: number | null;
}
export interface HeatmapGrid {
  status: 'data' | 'empty';
  /** Selected valid positions (or exact event positions), BEFORE mapping rejection. */
  validPositionSamples: number;
  aggregatedSamples: number;
  outOfBounds: number;
  invalidMapping: number;
  unknownLayer: number;
  otherFloor: number;
  maxCellSampleCount: number;
  maxCellSampleShare: number | null;
  cells: HeatmapCell[];
}
export interface HeatmapPositionObservations {
  /** Roster/request opportunities: side and floor filters do not change this denominator. */
  expectedOpportunities: number;
  validPositionSamples: number;
  confirmedDeadObservations: number;
  observedButUnusable: number;
  missingPositionObservations: number;
  positionObserved: number;
  positionCoverage: number | null;
  positionCompleteness: number | null;
  status: 'complete' | 'partial' | 'unavailable';
}
export interface HeatmapPositions {
  available: boolean;
  unavailableReason: 'replay-unavailable' | 'uniform-grid-unavailable' | null;
  /** Four-way classification BEFORE side/floor selection; never relabel other sides as missing. */
  observations: HeatmapPositionObservations;
  sideUnknownObservations: number;
  otherSideValidSamples: number;
  selectedPositionCoverage: number | null;
  grid: HeatmapGrid;
}
export interface HeatmapEvents {
  scopeEvents: number;
  locatableEvents: number;
  eventPositionCoverage: number | null;
  status: 'complete' | 'partial' | 'unavailable';
  /** Mutually exclusive first failure; their sum is scopeEvents - locatableEvents. */
  unlocatableReasons: {
    worldActor: number;
    unknownPlayer: number;
    missingEvidence: number;
    ambiguousEvidence: number;
    participantMismatch: number;
    missingAtEvent: number;
    missingExactSample: number;
    tickMismatch: number;
    invalidPosition: number;
    unknownSide: number;
  };
  outsideWindowEvents: number;
  unknownSubjectExcludedByPlayerFilter: number;
  unknownSideEvents: number;
  otherSideEvents: number;
  grid: HeatmapGrid;
}
export interface MapHeatmapProjection {
  schemaVersion: 1;
  projectionVersion: 'p7.1-v1';
  matchId: string;
  samplingVersion: string | null;
  scope: HeatmapScope;
  map: {
    id: string;
    resourceId: string | null;
    alignment: 'unconfirmed' | 'unavailable';
    precision: 'schematic-position-distribution';
  };
  grid: { resolution: HeatmapResolution; coordinates: 'normalized-radar'; origin: 'top-left'; boundary: 'half-open'; normalization: 'scope-relative-linear' };
  windows: { round: number; startTick: number; endTick: number; requestedFrames: number; rosterSize: number }[];
  excludedRounds: number[];
  rosterApproximateRounds: number[];
  freezeBoundaryUnknownRounds: number[];
  positions: HeatmapPositions | null;
  kills: HeatmapEvents | null;
  deaths: HeatmapEvents | null;
}
