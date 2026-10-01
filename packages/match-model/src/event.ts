export type MatchEventType =
  | "kill"
  | "damage"
  | "weapon_fire"
  | "utility"
  | "position";

export interface MatchEvent {
  type: MatchEventType;
  tick: number;
}

export interface KillEvent extends MatchEvent {
  type: "kill";
  killer: string;
  victim: string;
  weapon?: string;
  headshot?: boolean;
}
