import type { SpatialCoverage, SpatialSample } from "@cs2-analyst/match-model";

export type ContactSourceKind = "firearm" | "melee" | "taser" | "unknown";
export interface ContactEventRef {
  round: number;
  type: "damage" | "kill";
  tick: number;
  /** Original round.events index; never a subtick timestamp or causal order. */
  eventIndex: number;
}

/** Coverage-only projection; carries no position-based gameplay inference. */
export interface ContactSpatialSample {
  requestedTick: number;
  actualTick: number | null;
  coverage: SpatialCoverage;
  fields: SpatialSample["fields"];
}
export interface ContactSpatialCoverage {
  evidencePresent: boolean;
  joinStatus: "exact" | "not-provided" | "missing" | "match-mismatch" | "duplicate-ref" | "participant-mismatch";
  evidenceCoverage: SpatialCoverage | null;
  actorAtEvent: ContactSpatialSample | null;
  targetAtEvent: ContactSpatialSample | null;
  actorBeforeEvent: ContactSpatialSample | null;
  targetBeforeEvent: ContactSpatialSample | null;
}

export interface EngagementContact {
  eventRef: ContactEventRef;
  attackerId: string;
  victimId: string;
  weapon?: string;
  sourceKind: ContactSourceKind;
  /** Reported hurt damage, including overkill; not an effective damage ledger. */
  reportedHealthDamage?: number;
  healthRemaining?: number;
  fatal: boolean;
  headshot?: boolean;
  assistedFlash?: boolean;
  coverage: { reasons: ("weapon-kind-unknown")[] };
  spatialCoverage: ContactSpatialCoverage;
}

export interface SpatialEnrichmentCoverage {
  /** Evaluates actor/target at-event AND before-event coverage independently of grouping. */
  status: "complete" | "partial" | "unavailable";
  contacts: number;
  exactJoinedContacts: number;
  completeAtEventContacts: number;
  completeBeforeEventContacts: number;
}
export type SegmentationReason = "tick-rate-unreliable" | "round-window-unavailable"
  | "participant-unidentified" | "side-unknown" | "invalid-event-tick" | "weapon-kind-unknown";
export interface EventSegmentationCoverage {
  status: "complete" | "partial" | "unavailable";
  reasons: SegmentationReason[];
}

/** Product heuristic connected component, not an official CS2 duel/peek or tactical phase. */
export interface Engagement {
  id: string;
  round: number;
  startTick: number;
  endTick: number;
  durationSeconds: number | null;
  participantIds: string[];
  contacts: EngagementContact[];
  killCount: number;
  damageContactCount: number;
  coverage: {
    eventSegmentation: EventSegmentationCoverage;
    spatialEnrichment: SpatialEnrichmentCoverage;
  };
}

export interface EngagementOptions {
  /** Positive finite seconds. Default 3: product grouping heuristic, not a CS2 rule. */
  contactGapSeconds?: number;
}
export interface EngagementDiagnostics {
  /** All damage/kill rows, before exclusions. Exclusion counters are disjoint. */
  candidateContacts: number;
  includedContacts: number;
  excludedRoundWindow: number;
  excludedInvalidTick: number;
  excludedPreRound: number;
  excludedPostRound: number;
  excludedUnidentified: number;
  excludedSelf: number;
  excludedTeam: number;
  excludedUnknownSide: number;
  excludedUtility: number;
  unknownWeaponKind: number;
  roundsWithUnavailableWindow: number;
  /** Same-type/tick/actor/victim rows retained at distinct eventIndex; not deduplicated. */
  repeatedEventRows: number;
  /** Count of included rows sharing a tick in the same round; does not infer order. */
  sameTickContacts: number;
}
export interface EngagementAnalysis {
  matchId: string;
  /** Time grouping available; partial event/spatial coverage is reported separately. */
  available: boolean;
  config: { contactGapSeconds: number; contactGapTicks: number | null };
  /** Retained even when tickRate cannot support time grouping. */
  directContacts: EngagementContact[];
  engagements: Engagement[];
  diagnostics: EngagementDiagnostics;
  coverage: {
    eventSegmentation: EventSegmentationCoverage;
    spatialEnrichment: SpatialEnrichmentCoverage;
  };
}
