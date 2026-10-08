import type { Match, MatchSpatialEvidence } from "@cs2-analyst/match-model";

export interface SpatialSamplingOptions {
  /** Unique tick budget; all core ticks survive even if they exceed it. Default 24000. */
  tickBudget?: number;
  /** One before/after offset for kill/damage/weapon_fire. Default 0.125 seconds. */
  contextSeconds?: number;
}

export interface SpatialParseResult {
  match: Match;
  spatial: MatchSpatialEvidence;
  /** Observational timings are deliberately outside deterministic evidence. */
  performance: { parserMs: number; spatialMs: number; totalMs: number; peakMemory: "UNKNOWN" };
}
