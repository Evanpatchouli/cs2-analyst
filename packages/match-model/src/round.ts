import type { MatchEvent } from "./event.js";
import type { TeamSide } from "./player.js";

export type RoundWinner = "CT" | "T" | null;

export interface Round {
  number: number;
  winner: RoundWinner;
  events: MatchEvent[];
  /** Lifecycle evidence; absent when the recording omits the boundary. */
  startTick?: number;
  freezeEndTick?: number;
  endTick?: number;
  /** Reported reason label, or numeric code in older output. */
  endReason?: string | number;
  /** Exact-tick roster observations, separate from combat event evidence. */
  stateSnapshots?: RoundStateSnapshot[];
  /** Player lifecycle evidence, separate from combat event counts. */
  playerLifecycle?: RoundPlayerLifecycleEvent[];
}

export type RoundStateBoundary = "start" | "freeze_end" | "end";

export interface RoundPlayerState {
  steamId: string;
  side: TeamSide;
  alive: boolean | null;
  /** Team membership at this instant; does not imply network connectivity. */
  participant: boolean | null;
}

export interface RoundStateSnapshot {
  boundary: RoundStateBoundary;
  tick: number;
  /** Observed means rows were returned for this tick, not that the roster is complete. */
  availability: "observed" | "unavailable";
  players: RoundPlayerState[];
  unidentifiedPlayerCount: number;
}

export type RoundPlayerLifecycleEvent =
  | { type: "spawn"; tick: number; player: string | null; side: TeamSide }
  | { type: "disconnect"; tick: number; player: string | null }
  | { type: "side_change"; tick: number; player: string | null; side: TeamSide; previousSide: TeamSide; disconnect?: boolean };
