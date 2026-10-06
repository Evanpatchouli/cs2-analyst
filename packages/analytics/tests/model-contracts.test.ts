import type {
  ClutchMetrics,
  CoverageIssue,
  IssueSeverity,
  KastMetrics,
  MatchAnalytics,
  PlayerMetrics,
  SideMetrics,
  TradeMetrics,
} from "@cs2-coach/analytics";
import { analyzeMatch, coverageIssueSeverity } from "@cs2-coach/analytics";
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

function unresolvedCounts(side: SideMetrics, player: PlayerMetrics): [number, number] {
  return [side.effectiveDamageUnresolved, player.coverage.effectiveDamageUnresolved];
}

function kastFields(kast: KastMetrics): [number, number, number | null, boolean] {
  return [kast.rounds, kast.eligibleRounds, kast.percentage, kast.complete];
}

function tradeFields(trade: TradeMetrics): [number, number, number, number | null] {
  return [trade.tradeKills, trade.tradedDeaths, trade.tradeableDeaths, trade.tradeRate];
}

function clutchFields(clutch: ClutchMetrics): [number, number, number] {
  return [clutch.opportunities, clutch.wins, clutch.byOpponents[3]];
}

function tradeWindow(analytics: MatchAnalytics): [number, number | null] {
  return [analytics.tradeWindow.seconds, analytics.tradeWindow.ticks];
}

const issue: CoverageIssue = "assist-side-mismatch";
const effectiveIssue: CoverageIssue = "damage-effective-chain-broken";
const survivalIssue: CoverageIssue = "survival-end-state-unavailable";
const tradeIssue: CoverageIssue = "trade-same-tick-ambiguous";
const clutchIssue: CoverageIssue = "clutch-round-ineligible";
const severity: IssueSeverity = coverageIssueSeverity["trade-candidate-ambiguous"];
const nullableAdr: number | null = null;
const run: (match: Match) => MatchAnalytics = analyzeMatch;

// @ts-expect-error A player metric record always exposes a string steamId.
const numericId: PlayerMetrics = { steamId: 76561199642456355 };
// @ts-expect-error "Unknown" is coverage, not a side split key.
const unknownSide = (analytics: MatchAnalytics) => analytics.players[0].side.Unknown;
// @ts-expect-error Clutch opponent buckets are keyed 1..5 only.
const bucketSix = (player: PlayerMetrics) => player.clutch.byOpponents[6];

void [summarize, ctRounds, damageFields, unresolvedCounts, kastFields, tradeFields, clutchFields,
  tradeWindow, issue, effectiveIssue, survivalIssue, tradeIssue, clutchIssue, severity, nullableAdr,
  run, numericId, unknownSide, bucketSix];
