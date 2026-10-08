import type { ContactEventRef } from "./contracts.js";
import type { AliveCounts, ImpactReason, ImpactSide, KillRef } from "./impact-contracts.js";

export type TeamplayReason = ImpactReason | "engagement-unavailable" | "engagement-evidence-incomplete"
  | "round-state-unavailable" | "player-state-ambiguous" | "same-tick-alive-ambiguous"
  | "tick-rate-unreliable" | "killer-dead-before" | "killer-death-same-tick" | "killer-state-unknown"
  | "death-attribution-unavailable" | "player-dead-before" | "same-tick-response-ambiguous"
  | "spatial-not-provided" | "spatial-event-missing" | "spatial-link-conflict" | "position-missing"
  | "teammate-position-incomplete" | "spatial-alive-conflict";
export interface TeamplayLayerCoverage {
  status: "complete" | "partial" | "unavailable";
  reasons: TeamplayReason[];
}
export interface TeamplayCoverage {
  engagementParticipation: TeamplayLayerCoverage;
  aliveState: TeamplayLayerCoverage;
  followUpTiming: TeamplayLayerCoverage;
  spatialContext: TeamplayLayerCoverage;
}
export type FirstSideContactRole = "unique-first" | "shared-first" | "later" | "unknown";
/** Geometric map units only. No visibility, route, cover or supportability claim. */
export interface NearestTeammateSpatialFact {
  teammateId: string;
  horizontalDistance: number;
  verticalDelta: number;
  directDistance: number;
}
export interface TeamplaySpatialContext {
  eventRef: ContactEventRef;
  nearestConfirmedAliveTeammate: NearestTeammateSpatialFact | null;
  sameTickAliveAmbiguousIds: string[];
  incompletePositionTeammateIds: string[];
  aliveConsistencyConflictIds: string[];
  coverage: TeamplayLayerCoverage;
}
export interface PlayerEngagementContext {
  playerId: string;
  engagementId: string;
  round: number;
  side: ImpactSide;
  firstContactRef: ContactEventRef;
  firstContactTick: number;
  lastContactTick: number;
  contactCount: number;
  damageContactsDealt: number;
  damageContactsReceived: number;
  reportedDamageDealt: number;
  reportedDamageReceived: number;
  kills: number;
  deaths: number;
  /** Only players with direct contacts in this Engagement; never a nearby roster. */
  sideParticipantIds: string[];
  enemyParticipantIds: string[];
  sideParticipantCount: number;
  enemyParticipantCount: number;
  /** Does not mean spatial isolation or lack of support. */
  onlyConfirmedSideParticipant: boolean;
  firstSideContactRole: FirstSideContactRole;
  otherSideContactObserved: boolean;
  firstOtherTeammateContactTick: number | null;
  /** Relative to first side contact; shared-first=0, later=null. */
  teammateJoinDelaySeconds: number | null;
  /** Equal-tick IDs form an atomic tier, with no within-tier order. */
  sideContactTiers: { tick: number; playerIds: string[] }[];
  spatialContext: TeamplaySpatialContext;
  coverage: TeamplayCoverage;
}
export type FollowUpOutcome = "kill" | "damage" | "none-observed" | "same-tick-ambiguous" | "unavailable";
export type FollowUpKillerState = "alive-after-death" | "dead-before" | "dies-same-tick" | "unknown";
export interface DeathParticipationContext {
  engagementId: string | null;
  firstSideContactRole: FirstSideContactRole;
  sideParticipantCount: number | null;
  otherSideContactObserved: boolean | null;
  onlyConfirmedSideParticipant: boolean | null;
  teammateJoinDelaySeconds: number | null;
  before: AliveCounts | null;
  afterAtomicGroup: AliveCounts | null;
  /** Exact death-event geometry for this player, when applicable. */
  spatialContext: TeamplaySpatialContext;
}
export interface TeammateDeathResponse extends DeathParticipationContext {
  playerId: string;
  teammateId: string;
  deathRef: KillRef;
  killerId: string | null;
  playerAliveAtDeath: boolean | null;
  killerState: FollowUpKillerState;
  firstFollowUpRef: ContactEventRef | null;
  /** Kill in the window, otherwise first damage; may follow firstFollowUpRef. */
  outcomeRef: ContactEventRef | null;
  sameTickContactRefs: ContactEventRef[];
  delaySeconds: number | null;
  outcome: FollowUpOutcome;
  sameEngagement: boolean | null;
  /** Sum of reported damage to this killer within the eligible later window; kill rows add no damage. */
  reportedDamage: number | null;
  coverage: TeamplayCoverage;
}
export interface PlayerDeathTeamResponse {
  playerId: string;
  deathRef: KillRef;
  killerId: string | null;
  killerState: FollowUpKillerState;
  confirmedAliveTeammates: number | null;
  sameTickAliveAmbiguousTeammateIds: string[];
  firstResponderId: string | null;
  firstResponseRef: ContactEventRef | null;
  outcomeRef: ContactEventRef | null;
  outcomePlayerId: string | null;
  sameTickContactRefs: ContactEventRef[];
  delaySeconds: number | null;
  outcome: FollowUpOutcome;
  sameEngagement: boolean | null;
  coverage: TeamplayCoverage;
}
export interface PlayerDeathContext extends DeathParticipationContext {
  playerId: string;
  deathRef: KillRef;
  killerId: string | null;
  teamResponse: PlayerDeathTeamResponse;
  coverage: TeamplayCoverage;
}
export interface TeamplayOptions {
  /** Default 5: a product evidence window, never a required response deadline. */
  followUpWindowSeconds?: number;
}
export interface TeamplayDiagnostics {
  playerEngagementContexts: number; uniqueFirst: number; sharedFirst: number; later: number; unknownFirst: number;
  onlyConfirmedSideParticipant: number;
  /** Death-candidate/player pairs, excluding explicit self/team; includes unavailable killer attribution. */
  teammateDeathsObserved: number;
  teammateDeathResponsesKill: number; teammateDeathResponsesDamage: number; teammateDeathResponsesNone: number;
  teammateDeathResponsesAmbiguous: number; teammateDeathResponsesUnavailable: number;
  /** Death candidates, excluding explicit self/team; unknown killers remain unavailable, never confirmed hostile. */
  playerDeathsObserved: number;
  teamResponsesKill: number; teamResponsesDamage: number; teamResponsesNone: number;
  teamResponsesAmbiguous: number; teamResponsesUnavailable: number;
  /** Unique player/exact-event contexts (first contact and death-event contexts). */
  spatialContextsComplete: number; spatialContextsPartial: number; spatialContextsUnavailable: number;
  sameTickAliveAmbiguities: number; spatialAliveConflicts: number;
}
/** JSON-only observed evidence. No gameplay scores or coaching interpretation. */
export interface TeamplayAnalysis {
  matchId: string;
  config: { followUpWindowSeconds: number };
  playerEngagementContexts: PlayerEngagementContext[];
  teammateDeathResponses: TeammateDeathResponse[];
  playerDeathContexts: PlayerDeathContext[];
  playerDeathTeamResponses: PlayerDeathTeamResponse[];
  diagnostics: TeamplayDiagnostics;
  coverage: TeamplayCoverage;
}
