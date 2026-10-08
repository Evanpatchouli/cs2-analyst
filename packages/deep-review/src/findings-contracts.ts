import type { KillRef } from "./impact-contracts.js";
import type { UtilityEffectRef } from "./utility-contracts.js";

export type DeepReviewEvidenceRef =
  | { kind: "engagement"; engagementId: string }
  | { kind: "kill"; eventRef: KillRef }
  | { kind: "multi-kill"; playerId: string; round: number }
  | { kind: "teammate-death-response"; playerId: string; teammateId: string; deathRef: KillRef }
  | { kind: "player-death-response"; playerId: string; deathRef: KillRef }
  | { kind: "utility-effect"; effectRef: UtilityEffectRef }
  | { kind: "execution-engagement"; playerId: string; engagementId: string }
  | { kind: "opponent-exchange"; playerId: string; opponentId: string; engagementId: string };
export type DeepReviewRuleId = "deep.impact.multikill-swing" | "deep.impact.sole-survivor-sequence"
  | "deep.impact.multikill-unconverted" | "deep.execution.no-confirmed-return-pattern"
  | "deep.execution.return-contact-consistent" | "deep.teamplay.lone-contact-death-pattern"
  | "deep.teamplay.no-followup-pattern" | "deep.utility.teamflash-repeated";
export interface DeepReviewFinding {
  id: string; ruleId: DeepReviewRuleId; playerId: string;
  category: "impact" | "execution" | "teamplay" | "utility";
  kind: "highlight" | "review" | "context";
  title: string; summary: string;
  occurrences: number; eligibleOccurrences: number | null;
  relatedRounds: number[]; evidenceRefs: DeepReviewEvidenceRef[];
  facts: Record<string, string | number | boolean | null>;
  evidenceQuality: "complete" | "partial"; caveats: string[];
}
export type DeepReviewSuppressionReason = "insufficient-denominator" | "insufficient-occurrences"
  | "rate-below-threshold" | "coverage-insufficient" | "deduplicated" | "contradiction"
  | "not-applicable" | "max-count-reached";
export interface DeepReviewFindingsAnalysis {
  matchId: string; playerId: string;
  reviews: DeepReviewFinding[]; highlights: DeepReviewFinding[]; contexts: DeepReviewFinding[];
  consideredRules: DeepReviewRuleId[];
  suppressedRules: { ruleId: DeepReviewRuleId; reason: DeepReviewSuppressionReason }[];
  diagnostics: {
    inputIssues: string[]; contradictions: string[];
    rules: { ruleId: DeepReviewRuleId; eligibleOccurrences: number; occurrences: number; triggered: boolean; emitted: boolean }[];
  };
  coverage: { status: "complete" | "partial" | "unavailable"; excludedOccurrences: number; caveats: string[] };
}
