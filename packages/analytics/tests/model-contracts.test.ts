import type {
  CoverageIssue,
  MatchAnalytics,
  PlayerMetrics,
  SideMetrics,
} from "@cs2-coach/analytics";
import { analyzeMatch } from "@cs2-coach/analytics";
import type { Match } from "@cs2-coach/match-model";

function summarize(analytics: MatchAnalytics): number {
  return analytics.players.reduce((total: number, player: PlayerMetrics) => total + player.kills, 0);
}

function ctRounds(side: SideMetrics): number {
  return side.roundsPlayed;
}

function damageFields(side: SideMetrics): [number, number | null, number, number | null] {
  return [side.reportedDamage, side.reportedAdr, side.effectiveDamage, side.adr];
}

const issue: CoverageIssue = "assist-side-mismatch";
const effectiveIssue: CoverageIssue = "damage-effective-chain-broken";
const nullableAdr: number | null = null;
const run: (match: Match) => MatchAnalytics = analyzeMatch;

// @ts-expect-error A player metric record always exposes a string steamId.
const numericId: PlayerMetrics = { steamId: 76561199642456355 };
// @ts-expect-error "Unknown" is coverage, not a side split key.
const unknownSide = (analytics: MatchAnalytics) => analytics.players[0].side.Unknown;

void [summarize, ctRounds, damageFields, issue, effectiveIssue, nullableAdr, run, numericId, unknownSide];
