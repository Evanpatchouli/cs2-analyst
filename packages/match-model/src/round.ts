import type { MatchEvent } from "./event.js";

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
}
