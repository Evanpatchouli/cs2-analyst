import type { TeamSide } from "./player.js";

export interface EventBase {
  /** Demo tick; array order within the same tick is not a subtick timestamp. */
  tick: number;
}

export interface KillEvent extends EventBase {
  type: "kill";
  /** SteamID64 string, or the legacy "world" sentinel for an unidentified killer. */
  killer: string;
  victim: string;
  weapon?: string;
  headshot?: boolean;
  killerSide?: TeamSide;
  victimSide?: TeamSide;
  assister?: string;
  assisterSide?: TeamSide;
  assistedFlash?: boolean;
  /** Derived from known event sides; excludes suicide. Omitted if unknown. */
  teamkill?: boolean;
}

export interface DamageEvent extends EventBase {
  type: "damage";
  /** Null means no identifiable player attacker; do not credit a player. */
  attacker: string | null;
  victim: string;
  attackerSide: TeamSide;
  victimSide: TeamSide;
  /** Reported damage, including overkill; not capped effective HP loss. */
  healthDamage: number;
  armorDamage: number;
  /** Victim's remaining health/armor reported by the hurt event. */
  healthRemaining: number;
  armorRemaining: number;
  weapon?: string;
  /** Parser-reported body region label, or numeric code in older output. */
  hitgroup?: string | number;
}

export interface WeaponFireEvent extends EventBase {
  type: "weapon_fire";
  shooter: string;
  shooterSide: TeamSide;
  /** Includes knives and grenade releases. Preserve the reported identifier. */
  weapon: string;
  silenced?: boolean;
}

export type UtilityKind = "smoke" | "hegrenade" | "flashbang" | "fire" | "decoy";
export type UtilityAction = "detonate" | "start_burn" | "start_decoy";

/** A discrete effect origin in map units, never a player position stream. */
export interface EventPosition {
  x: number;
  y: number;
  z: number;
}

export interface UtilityEvent extends EventBase {
  type: "utility";
  utility: UtilityKind;
  action: UtilityAction;
  thrower: string | null;
  throwerSide: TeamSide;
  /** Demo-local entity index; may be reused, so it is not a global ID. */
  entityId?: number;
  position?: EventPosition;
}

/** One flash effect on one victim, separate from the grenade detonation. */
export interface FlashEvent extends EventBase {
  type: "flash";
  attacker: string | null;
  victim: string;
  attackerSide: TeamSide;
  victimSide: TeamSide;
  blindDurationSeconds: number;
  entityId?: number;
}

export type BombAction =
  | "pickup"
  | "drop"
  | "plant_start"
  | "planted"
  | "defuse_start"
  | "defused"
  | "exploded";

export interface BombEvent extends EventBase {
  type: "bomb";
  action: BombAction;
  /** Event-associated player (on explosion this can be the planter). */
  player: string | null;
  playerSide: TeamSide;
  /** Map-local site entity index, not an A/B label. */
  siteIndex?: number;
  /** Present only when the event reports kit possession. */
  hasKit?: boolean;
}

export type MatchEvent = KillEvent | DamageEvent | WeaponFireEvent | UtilityEvent | FlashEvent | BombEvent;
export type MatchEventType = MatchEvent["type"];
