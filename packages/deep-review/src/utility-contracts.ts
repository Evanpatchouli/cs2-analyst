import type { EventPosition, TeamSide, UtilityAction, UtilityKind } from "@cs2-analyst/match-model";
import type { AliveCounts } from "./impact-contracts.js";

export interface UtilityEffectRef { round: number; type: "utility"; tick: number; eventIndex: number; utility: UtilityKind; action: UtilityAction }
export interface UtilityOutcomeRef { round: number; type: "damage" | "flash"; tick: number; eventIndex: number }
export type UtilityReason = "thrower-unidentified" | "thrower-side-unknown" | "thrower-side-conflict" | "effect-position-missing"
  | "spatial-not-provided" | "spatial-event-missing" | "spatial-link-conflict" | "player-position-missing"
  | "same-tick-alive-ambiguous" | "round-state-unavailable" | "round-state-partial" | "tick-rate-unreliable"
  | "timing-boundary-anomaly" | "event-outside-round" | "bomb-state-ambiguous" | "bomb-state-unavailable"
  | "entity-id-missing" | "entity-id-ambiguous" | "effect-outcome-link-unavailable" | "damage-link-ambiguous"
  | "flash-link-ambiguous" | "outcome-side-unknown" | "outcome-value-invalid";
export interface UtilityLayerCoverage { status: "complete" | "partial" | "unavailable"; reasons: UtilityReason[] }
export type UtilityCoverage = Record<"actorAttribution" | "position" | "roundState" | "bombContext" | "spatialContext" | "directOutcome", UtilityLayerCoverage>;
export interface UtilitySpatialFact {
  playerId: string; sideRelation: "enemy" | "teammate";
  horizontalDistance: number; /** Absolute Z difference, map units. */ verticalDelta: number; directDistance: number;
}
export type UtilityBombState = "pre-plant" | "planting" | "planted" | "defusing" | "resolved" | "unknown";
export type UtilityDirectOutcome = {
  kind: "he"; damageEvents: { eventRef: UtilityOutcomeRef; victimId: string; reportedHealthDamage: number; sideRelation: "enemy" | "teammate" | "self" | "unknown" }[];
  /** Confirmed observed subset; null when effect linkage is unavailable. Never effective HP loss. */
  reportedEnemyDamage: number | null; damagedEnemyIds: string[]; linkage: "exact" | "partial" | "unavailable";
} | {
  kind: "flash";
  enemyEffects: UtilityFlashFact[]; teammateEffects: UtilityFlashFact[]; selfEffects: UtilityFlashFact[]; unknownEffects: UtilityFlashFact[];
  linkage: "exact" | "partial" | "unavailable";
  /** KillEvent has no grenade identity; official assister alone cannot prove effect attribution. */
  confirmedFlashAssists: null; assistLinkage: "unavailable";
} | { kind: "fire"; reportedEnemyDamage: null; linkage: "unavailable" }
  | { kind: "smoke" | "decoy"; linkage: "not-applicable" };
export interface UtilityFlashFact { eventRef: UtilityOutcomeRef; victimId: string; tick: number; rawBlindDurationSeconds: number }
export interface UtilityEffectContext {
  effectRef: UtilityEffectRef; throwerId: string | null; throwerSide: TeamSide; entityId: number | null; position: EventPosition | null;
  roundContext: { teamAlive: number | null; enemyAlive: number | null; beforeAtomicGroup: AliveCounts | null; afterAtomicGroup: AliveCounts | null;
    bombState: UtilityBombState; bombBeforeSameTick: UtilityBombState | null; bombSameTickActions: string[];
    secondsFromRoundStart: number | null; secondsFromFreezeEnd: number | null };
  nearestEnemy: UtilitySpatialFact | null; nearestTeammate: UtilitySpatialFact | null;
  enemiesWithPosition: UtilitySpatialFact[]; teammatesWithPosition: UtilitySpatialFact[];
  sameTickAliveAmbiguousIds: string[]; missingPositionPlayerIds: string[];
  directOutcome: UtilityDirectOutcome; coverage: UtilityCoverage;
}
export interface UtilityDiagnostics {
  effectsTotal: number; smokeEffects: number; heEffects: number; flashEffects: number; fireEffects: number; decoyEffects: number;
  effectsWithPosition: number; effectsWithThrower: number; effectsWithCompleteSpatial: number;
  heExactDamageLinked: number; heUnlinked: number; flashExactLinked: number; flashAmbiguous: number;
  fireDamageAttributionUnavailable: number; sameTickAliveAmbiguities: number; bombStateAmbiguities: number;
}
export interface UtilityContextAnalysis { matchId: string; effects: UtilityEffectContext[]; diagnostics: UtilityDiagnostics; coverage: UtilityCoverage }
