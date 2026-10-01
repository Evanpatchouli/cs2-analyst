import type { MatchEvent } from "./event";

export type RoundWinner = "CT" | "T" | null;

export interface Round {
  number: number;
  winner: RoundWinner;
  events: MatchEvent[];
}
