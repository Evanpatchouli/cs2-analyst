import type { MatchEventType, EventPosition } from "./event.js";
import type { TeamSide } from "./player.js";
import type { RoundStateBoundary } from "./round.js";

export type SpatialRelation = "before-event" | "at-event" | "after-event" | "boundary";
export type SpatialCoverageStatus = "complete" | "partial" | "unavailable";
export type SpatialCoverageReason =
  | "requested-tick-missing" | "player-row-missing" | "position-missing"
  | "view-missing" | "state-missing" | "weapon-unavailable"
  | "sample-budget-truncated" | "tick-rate-unknown" | "participant-unidentified"
  | "sampling-failed" | "context-outside-round";

export interface SpatialCoverage {
  /** Core position/view/state coverage; optional weapon alone does not degrade it. */
  status: SpatialCoverageStatus;
  reasons: SpatialCoverageReason[];
}

export interface SpatialSample {
  requestedTick: number;
  /** Null when no exact player row exists. Never substitute the nearest tick. */
  actualTick: number | null;
  relation: SpatialRelation;
  playerId: string;
  position: EventPosition | null;
  view: { yaw: number; pitch: number } | null;
  health: number | null;
  alive: boolean | null;
  side: TeamSide;
  /** Native display name, not a stable weapon identifier or event.weapon. */
  activeWeapon: string | null;
  coverage: SpatialCoverage;
  fields: {
    position: SpatialCoverageStatus;
    view: SpatialCoverageStatus;
    state: SpatialCoverageStatus;
    weapon: SpatialCoverageStatus;
  };
}

export type SpatialEventRef =
  | { round: number; type: MatchEventType; tick: number; eventIndex: number }
  | { round: number; type: "round_boundary"; tick: number; boundary: RoundStateBoundary };

export interface SpatialEvidence {
  /** eventIndex indexes the unchanged round.events array, including same-tick ties. */
  eventRef: SpatialEventRef;
  /** Null preserves an unidentified actor/target without inventing a SteamID. */
  participants: { role: "actor" | "target"; playerId: string | null }[];
  samples: { role: "actor" | "target" | "relevant"; sample: SpatialSample }[];
  coverage: SpatialCoverage;
}

/** Separate from MatchEvent and frozen Analytics/report contracts. JSON-only. */
export interface MatchSpatialEvidence {
  matchId: string;
  provenance: {
    source: "demo-entity-state";
    parser: "demoparser2";
    tickPolicy: "exact-only";
  };
  sampling: {
    /** Budget for unique requested ticks, not rows. Core may exceed it. */
    tickBudget: number;
    contextOffsetTicks: number | null;
    coreTicks: number[];
    optionalTicks: number[];
    omittedOptionalTicks: number[];
    returnedTicks: number[];
    rowCount: number;
  };
  events: SpatialEvidence[];
  coverage: SpatialCoverage;
}
