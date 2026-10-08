import type { RoundWinner } from "@cs2-analyst/match-model";

export type ImpactSide = "CT" | "T";
export type ImpactReason = "round-window-unavailable" | "baseline-unavailable" | "baseline-fallback-start"
  | "roster-unidentified" | "participant-state-unknown" | "side-unknown" | "lifecycle-anomaly"
  | "duplicate-death" | "end-state-conflict" | "end-state-unavailable" | "same-tick-transition-ambiguous"
  | "killer-unidentified" | "victim-unidentified" | "teamkill" | "self-kill" | "engagement-not-linked"
  | "engagement-link-conflict" | "invalid-event-tick" | "death-baseline-conflict";
export interface ImpactCoverage {
  status: "complete" | "partial" | "unavailable";
  reasons: ImpactReason[];
}
export interface KillRef { round: number; type: "kill"; tick: number; eventIndex: number }
export interface AliveCounts { teamAlive: number; enemyAlive: number }
export interface SideAliveCounts { CT: number; T: number }
export type KillImpactTag = "opening" | "opening-group" | "equalizer" | "advantage-gain"
  | "deficit-reduction" | "advantage-extension" | "enemy-eliminated" | "sole-survivor-kill" | "posthumous";
export interface AtomicDeathGroup {
  round: number;
  tick: number;
  deathRefs: KillRef[];
  /** Only reliable, unique deaths actually applied to the published state. */
  appliedVictimIds: string[];
  before: SideAliveCounts | null;
  after: SideAliveCounts | null;
  /** Collective transitions, never assigned to one kill in an ambiguous group. */
  tags: { CT: KillImpactTag[]; T: KillImpactTag[] };
}
export interface RoundAliveState {
  round: number;
  baseline: { boundary: "freeze_end" | "start"; tick: number } | null;
  players: { playerId: string; side: ImpactSide; aliveAtBaseline: boolean; deathTick: number | null }[];
  groups: AtomicDeathGroup[];
  coverage: ImpactCoverage;
}
export interface KillImpact {
  eventRef: KillRef;
  killerId: string;
  victimId: string;
  killerSide: ImpactSide;
  victimSide: ImpactSide;
  weapon?: string;
  headshot?: boolean;
  posthumous: boolean | null;
  before: AliveCounts | null;
  afterAtomicGroup: AliveCounts | null;
  atomicGroup: { deathCount: number; attributedKillCount: number; ordered: boolean };
  tags: KillImpactTag[];
  engagementId: string | null;
  coverage: { roundState: ImpactCoverage; attribution: ImpactCoverage; engagementLinkage: ImpactCoverage };
}
export type MultiKillImpactTag = "contains-opening" | "contains-equalizer" | "contains-advantage-gain"
  | "contains-deficit-reduction" | "contains-advantage-extension" | "contains-enemy-elimination"
  | "contains-sole-survivor-kill" | "contains-posthumous" | "single-engagement" | "multi-engagement"
  | "round-won" | "round-lost" | "atomic-impact-partial";
export interface PlayerRoundMultiKillImpact {
  playerId: string;
  round: number;
  kills: KillImpact[];
  killCount: number;
  firstKillTick: number;
  lastKillTick: number;
  engagementIds: string[];
  roundSide: ImpactSide | null;
  roundWinner: RoundWinner;
  roundResult: "win" | "loss" | "unknown";
  beforeFirstKill: AliveCounts | null;
  afterLastKillAtomicGroup: AliveCounts | null;
  tags: MultiKillImpactTag[];
  coverage: KillImpact["coverage"];
}
export interface UnattributedKill { eventRef: KillRef; reasons: ImpactReason[] }
export interface KillImpactDiagnostics {
  rounds: number; eligibleRounds: number; ineligibleRounds: number;
  deathEvents: number; atomicDeathGroups: number; creditedEnemyKills: number; unattributedKills: number;
  teamKills: number; selfKills: number; worldKills: number; sameTickDeathGroups: number; posthumousKills: number;
  multiKillRounds: number; doubleKills: number; tripleKills: number; quadKills: number; fivePlusKills: number;
  engagementLinkedKills: number; unlinkedKills: number;
}
export interface KillImpactAnalysis {
  matchId: string;
  rounds: RoundAliveState[];
  kills: KillImpact[];
  multiKills: PlayerRoundMultiKillImpact[];
  unattributedKills: UnattributedKill[];
  diagnostics: KillImpactDiagnostics;
  coverage: KillImpact["coverage"];
}
