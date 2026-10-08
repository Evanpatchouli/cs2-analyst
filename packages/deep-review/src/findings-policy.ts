import type { DeepReviewRuleId } from "./findings-contracts.js";

// Product heuristics, not official/professional standards or statistical significance.
// Internal module only: sensitivity analysis does not become a public option.
export const FINDINGS_POLICY = {
  pattern: { minimumEligible: 5, minimumOccurrences: 3, minimumRate: 0.5 },
  positive: { minimumEligible: 5, minimumOccurrences: 4, minimumRate: 0.6 },
  impact: { minimumKills: 2, unconvertedMinimumKills: 3 },
  teamflash: { minimumEffects: 3, minimumTeammateEffects: 5 },
  caps: { review: 3, highlight: 2, context: 1 },
  overbreadthRate: 0.5,
  priority: {
    "deep.execution.no-confirmed-return-pattern": 0,
    "deep.teamplay.lone-contact-death-pattern": 1,
    "deep.teamplay.no-followup-pattern": 3,
    "deep.utility.teamflash-repeated": 2,
    "deep.impact.sole-survivor-sequence": 0,
    "deep.impact.multikill-swing": 1,
    "deep.execution.return-contact-consistent": 2,
    "deep.impact.multikill-unconverted": 0,
  } satisfies Record<DeepReviewRuleId, number>,
} as const;
export const FINDINGS_RULES = Object.keys(FINDINGS_POLICY.priority) as DeepReviewRuleId[];
export type FindingsPolicy = {
  pattern: { minimumEligible: number; minimumOccurrences: number; minimumRate: number };
  positive: { minimumEligible: number; minimumOccurrences: number; minimumRate: number };
  impact: { minimumKills: number; unconvertedMinimumKills: number };
  teamflash: { minimumEffects: number; minimumTeammateEffects: number };
  caps: { review: number; highlight: number; context: number };
  overbreadthRate: number;
  priority: Record<DeepReviewRuleId, number>;
};
