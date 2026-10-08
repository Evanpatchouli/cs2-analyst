import type { ContactEventRef, ContactSourceKind } from "./contracts.js";

export interface WeaponFireRef { round: number; type: "weapon_fire"; tick: number; eventIndex: number }
export type ExecutionReason = "engagement-unavailable" | "engagement-link-conflict" | "round-window-unavailable"
  | "fire-event-unidentified" | "fire-weapon-unknown" | "fire-link-ambiguous" | "precontact-link-ambiguous"
  | "tick-rate-unreliable" | "contact-feed-incomplete" | "contact-weapon-unknown" | "opponent-identity-unknown"
  | "same-tick-contact-ambiguous" | "same-tick-fire-contact-ambiguous" | "same-tick-death-ambiguous"
  | "contact-before-observed-fire" | "return-contact-unavailable" | "spatial-not-provided"
  | "spatial-event-missing" | "spatial-link-conflict" | "position-missing" | "distance-unavailable"
  | "reported-damage-unavailable" | "death-boundary-conflict";
export interface ExecutionLayerCoverage { status: "complete" | "partial" | "unavailable"; reasons: ExecutionReason[] }
export interface ExecutionCoverage {
  engagementLinkage: ExecutionLayerCoverage;
  fireEvidence: ExecutionLayerCoverage;
  contactEvidence: ExecutionLayerCoverage;
  returnContact: ExecutionLayerCoverage;
  spatialContext: ExecutionLayerCoverage;
}
/** Shooter-only evidence. Candidate IDs are association candidates, never targets. */
export interface WeaponFireEvidence {
  eventRef: WeaponFireRef;
  shooterId: string;
  weapon: string;
  sourceKind: ContactSourceKind;
  linkage: "inside-engagement" | "unique-lead-in" | "ambiguous" | "unlinked";
  engagementId: string | null;
  candidateEngagementIds: string[];
  coverage: ExecutionLayerCoverage;
}
export type FirstContactRole = "dealt-first" | "received-first" | "same-tick" | "unknown";
export type ReturnContactOutcome = "kill" | "damage" | "none-observed" | "same-tick-ambiguous" | "unavailable";
export interface ContactDistance { horizontalDistance: number; verticalDelta: number; directDistance: number }
export interface ExecutionContactEvidence {
  eventRef: ContactEventRef;
  attackerId: string;
  victimId: string;
  weapon: string | null;
  sourceKind: "firearm" | "unknown";
  reportedHealthDamage: number | null;
}
export interface OpponentExchangeEvidence {
  playerId: string; opponentId: string; engagementId: string; round: number;
  contactRefs: ContactEventRef[];
  firstDealtRef: ContactEventRef | null; firstReceivedRef: ContactEventRef | null;
  firstContactRole: FirstContactRole;
  damageContactsDealt: number; damageContactsReceived: number;
  reportedDamageDealt: number | null; reportedDamageReceived: number | null;
  killRef: ContactEventRef | null; deathRef: ContactEventRef | null;
  returnContactRef: ContactEventRef | null;
  /** Earliest later kill if present; may differ from the first return contact. */
  returnOutcomeRef: ContactEventRef | null;
  sameTickReturnRefs: ContactEventRef[];
  /** Event interval, never human reaction time. */
  returnContactDelaySeconds: number | null;
  returnOutcome: ReturnContactOutcome;
  firstContactRef: ContactEventRef;
  firstContactDistance: ContactDistance | null;
  coverage: ExecutionCoverage;
}
export interface PlayerEngagementExecution {
  playerId: string; engagementId: string; round: number;
  weaponFireRefs: WeaponFireRef[];
  /** Not assigned to this context; also appears in other candidate contexts. */
  ambiguousWeaponFireRefs: WeaponFireRef[];
  insideEngagementFireCount: number; leadInFireCount: number; ambiguousFireCount: number;
  firstObservedFireRef: WeaponFireRef | null;
  firstConfirmedOffensiveContactRef: ContactEventRef | null;
  firstConfirmedDefensiveContactRef: ContactEventRef | null;
  firstContactRole: FirstContactRole;
  damageContactsDealt: number; damageContactsReceived: number;
  reportedDamageDealt: number | null; reportedDamageReceived: number | null;
  firearmKills: number; firearmDeaths: number;
  /** Counts firearm events before offensive contact; never missed shots. */
  weaponFireEventsBeforeFirstConfirmedContact: number | null;
  firstFireToFirstConfirmedContactSeconds: number | null;
  fireToContactEvidence: { observedFireEvents: number; confirmedOffensiveContacts: number };
  opponentExchanges: OpponentExchangeEvidence[];
  coverage: ExecutionCoverage;
}
export interface PlayerCombatExecutionSummary {
  playerId: string; eligibleEngagements: number;
  dealtFirst: number; receivedFirst: number; sameTickFirst: number; unknownFirst: number;
  firearmKills: number; firearmDeaths: number;
  confirmedReturnKill: number; confirmedReturnDamage: number; noConfirmedReturn: number;
  ambiguousReturn: number; unavailableReturn: number;
  engagementsWithLeadInFire: number; totalObservedFireEvents: number; totalConfirmedOffensiveContacts: number;
  /** Return counters use directional opponent exchanges, not engagements. */
  opponentExchanges: number;
  coverage: ExecutionCoverage;
}
export interface CombatExecutionOptions { preContactFireWindowSeconds?: number }
export interface CombatExecutionDiagnostics {
  playerEngagementContexts: number; opponentExchanges: number;
  firearmFireEventsObserved: number; insideEngagementFireLinked: number; leadInFireLinked: number;
  ambiguousFire: number; unlinkedFire: number;
  dealtFirst: number; receivedFirst: number; sameTickFirst: number; unknownFirst: number;
  returnKill: number; returnDamage: number; returnNone: number; returnAmbiguous: number; returnUnavailable: number;
  contextsWithDistance: number; contextsWithoutDistance: number;
  unknownWeaponContacts: number; unknownWeaponFireEvents: number;
  excludedMelee: number; excludedTaser: number; excludedUtility: number;
}
export interface CombatExecutionAnalysis {
  matchId: string;
  config: { preContactFireWindowSeconds: number; preContactFireWindowTicks: number | null };
  contacts: ExecutionContactEvidence[];
  weaponFireEvidence: WeaponFireEvidence[];
  playerEngagementExecutions: PlayerEngagementExecution[];
  playerSummaries: PlayerCombatExecutionSummary[];
  diagnostics: CombatExecutionDiagnostics;
  coverage: ExecutionCoverage;
}
