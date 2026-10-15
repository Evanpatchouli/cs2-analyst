import type { MatchEvent } from './event.js';
import type { TeamSide } from './player.js';
import type { RoundPlayerLifecycleEvent } from './round.js';

/** Native observations, never display interpolation and never an Analytics input. */
export interface ReplayPlayerSample {
  playerId: string;
  actualTick: number | null;
  position: [number, number, number] | null;
  yaw: number | null;
  health: number | null;
  alive: boolean | null;
  side: TeamSide;
  /** Per-player match-wide run identity; always changes at round boundaries. Null means not interpolable. */
  segment: number | null;
  stateAmbiguous: boolean;
}
export interface ReplayFrame { requestedTick: number; players: ReplayPlayerSample[] }
export interface ReplayRound {
  round: number; startTick: number; endTick: number; freezeEndTick: number | null;
  frames: ReplayFrame[];
  /** Original ordinals identify same-tick events; they never establish subtick order. */
  events: { eventIndex: number; event: MatchEvent }[];
  lifecycle: RoundPlayerLifecycleEvent[];
  coverage: { requestedFrames: number; missingPlayerSamples: number; status: 'complete' | 'partial' };
}
export interface MatchReplay {
  schemaVersion: 1; matchId: string; samplingVersion: string;
  source: 'native-final-tick-observation'; tickRate: number | null; hz: 8;
  maxInterpolationTicks: number | null;
  players: string[]; rounds: ReplayRound[];
  excludedRounds: number[];
}
