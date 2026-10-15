/** JSON-only presentation protocol. Tuple fields are versioned; never a native object. */
export type DesktopReplayPlayer = [playerIndex: number, actualTick: number | null,
  x: number | null, y: number | null, z: number | null, yaw: number | null, health: number | null,
  alive: boolean | null, side: 'CT' | 'T' | 'Unknown', segment: number | null, ambiguous: boolean];
export interface DesktopReplayBomb {
  action: string; carrierId: string | null; position: [number, number, number] | null;
  positionSource: 'actor-at-event' | 'carrier-sample' | null; ambiguous: boolean;
}
export interface DesktopReplayFrame { tick: number; players: DesktopReplayPlayer[]; bomb: DesktopReplayBomb }
export interface DesktopReplayEvent {
  id: string; tick: number; type: string; description: string;
  actorId: string | null; targetId: string | null;
  position: [number, number, number] | null;
}
export interface DesktopReplayBlockInfo { index: number; startTick: number; endTick: number }
export interface DesktopReplayRoundInfo {
  round: number; startTick: number; endTick: number; freezeEndTick: number | null;
  coverage: 'complete' | 'partial'; blocks: DesktopReplayBlockInfo[];
}
export interface DesktopReplayMetadata {
  schemaVersion: 1; available: boolean; unavailableReason: string | null;
  sessionId: string | null; matchId: string; map: string; resourceId: string; samplingVersion: string;
  tickRate: number | null; maxInterpolationTicks: number | null;
  perspective: 'global'; players: { id: string; nickname: string }[];
  rounds: DesktopReplayRoundInfo[]; excludedRounds: number[];
}
export interface DesktopReplayChunk {
  schemaVersion: 1; sessionId: string; matchId: string; round: number; block: number;
  startTick: number; endTick: number;
  /** Includes adjacent guard frames; every frame is an independent discrete-state baseline. */
  frames: DesktopReplayFrame[]; events: DesktopReplayEvent[];
}
export interface DesktopReplayRequest { sessionId: string; round: number; block: number }
export type DesktopReplayResult = { kind: 'success'; chunk: DesktopReplayChunk } | { kind: 'error'; message: string };
