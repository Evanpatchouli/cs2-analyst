import type { KillEvent, Match, Player } from "@cs2-coach/match-model";

import {
  addIssueCount,
  buildCoverage,
  isEligibleAssist,
  isEligibleDamage,
  isEligibleKill,
  isIdentifiedEnemyKill,
  type CoverageIssue,
  type CoverageSummary,
  type KnownSide,
  type MatchCoverage,
  type RoundCoverage,
} from "./coverage.js";
import { buildDamageLedger, damageLossIssueTypes, type DamageLedger } from "./damage.js";
import { resolveRoundClutch, summarizeClutch, type ClutchMetrics, type RoundClutchResolution }
  from "./clutch.js";
import { computeKast, type KastMetrics } from "./kast.js";
import {
  defaultTradeWindowSeconds,
  resolveRoundTrades,
  summarizeTrade,
  type RoundTradeResolution,
  type TradeMetrics,
} from "./trade.js";
import { buildRoundTimeline, type RoundTimeline } from "./timeline.js";
import { summarizeUtility, type UtilityMetrics } from "./utility.js";

export interface SideMetrics {
  /** Rounds counted for this side (participation confirmed and side known). */
  roundsPlayed: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Reported damage dealt to enemies while on this side. Raw evidence, overkill preserved. */
  reportedDamage: number;
  /**
   * reportedDamage / roundsPlayed; null when roundsPlayed is zero. This is
   * raw-evidence ADR and is never gated by effective-damage coverage.
   */
  reportedAdr: number | null;
  /**
   * Confirmed enemy HP removed while on this side; overkill capped at pre-hit
   * health. When effectiveDamageUnresolved > 0 this is only the resolved part.
   */
  effectiveDamage: number;
  /** Credited enemy damage rows on this side whose actual HP loss could not be resolved. */
  effectiveDamageUnresolved: number;
  /**
   * Standard ADR for this side: effectiveDamage / roundsPlayed. Null when
   * roundsPlayed is zero, or when effectiveDamageUnresolved > 0 because the
   * numerator would then cover only the resolved part of the side's damage.
   */
  adr: number | null;
}

export interface MultiKillMetrics {
  /** Rounds keyed by eligible kills in that round; key 5 means five or more. */
  counts: { 2: number; 3: number; 4: number; 5: number };
  multiKillRounds: number;
  maxKillsInRound: number;
}

export interface OpeningMetrics {
  kills: number;
  deaths: number;
  duels: number;
  winRate: number | null;
}

export interface PlayerCoverage {
  /** Rounds with a complete start/end window available to this player. */
  eligibleRounds: number;
  /** Rounds counted for roundsPlayed / ADR / side split. */
  countedRounds: number;
  /** Rounds skipped because the formal round window was incomplete. */
  skippedMissingWindow: number;
  /** Event-eligible rounds skipped because participation was not confirmed. */
  skippedUnconfirmedParticipation: number;
  /** Assists suppressed because the reported assister was not on the killer's side. */
  assistsExcludedBySide: number;
  /** Credited kills whose teamkill status was unknown. */
  killsWithoutTeamkillStatus: number;
  /** Credited kills whose headshot status was unknown. */
  killsWithoutHeadshotStatus: number;
  /** Damage rows dropped because a side was unknown. */
  damageWithoutKnownSides: number;
  /** Credited enemy damage rows whose actual HP loss could not be resolved. */
  effectiveDamageUnresolved: number;
}

export interface PlayerMetrics {
  steamId: string;
  nickname: string;
  kills: number;
  deaths: number;
  assists: number;
  /** kills / deaths; null when the player has no recorded death. */
  kdRatio: number | null;
  headshotKills: number;
  /** headshotKills / credited kills with a known headshot flag, as a percentage. */
  headshotPercentage: number | null;
  /** ADR denominator: confirmed participation in event-eligible rounds. */
  roundsPlayed: number;
  /** Sum of reported health damage to enemies. Overkill is preserved, not capped. */
  reportedDamage: number;
  /** reportedDamage / roundsPlayed; null when roundsPlayed is zero. Raw-evidence ADR. */
  reportedAdr: number | null;
  /**
   * Confirmed actual enemy HP removed; overkill is capped at the victim's
   * pre-hit health. This is the resolved part of the player's damage: when
   * coverage.effectiveDamageUnresolved > 0 some credited rows are missing.
   */
  effectiveDamage: number;
  /**
   * Standard ADR: effectiveDamage / roundsPlayed. Null when roundsPlayed is
   * zero, or when coverage.effectiveDamageUnresolved > 0 because the numerator
   * would then mix a partial effective total with the full round denominator.
   */
  adr: number | null;
  side: { CT: SideMetrics; T: SideMetrics };
  multiKills: MultiKillMetrics;
  opening: OpeningMetrics;
  /** KAST breakdown built on the shared survival timeline. */
  kast: KastMetrics;
  /** Trade kills / traded deaths / tradeable deaths for this player. */
  trade: TradeMetrics;
  /** Clutch opportunities and clutch wins for this player. */
  clutch: ClutchMetrics;
  utility: UtilityMetrics;
  coverage: PlayerCoverage;
}

export interface TradeWindow {
  readonly seconds: number;
  /** Converted window in ticks; null when match.tickRate is unreliable. */
  readonly ticks: number | null;
}

export interface MatchAnalytics {
  matchId: string;
  players: PlayerMetrics[];
  coverage: CoverageSummary;
  /** Window every trade conclusion was computed with. */
  tradeWindow: TradeWindow;
}

export interface AnalyzeOptions {
  /** Trade window in seconds; defaults to 5. Ignored without a reliable tick rate. */
  tradeWindowSeconds?: number;
  /** Optional threshold on reported per-victim duration; no implicit 'effective flash' policy. */
  effectiveFlashThresholdSeconds?: number;
}

type OpeningResolution =
  | { status: "duel"; killer: string; victim: string }
  | { status: "contested" }
  | { status: "unattributed" }
  | { status: "absent" };

interface MutableSide {
  roundsPlayed: number;
  kills: number;
  deaths: number;
  assists: number;
  reportedDamage: number;
  effectiveDamage: number;
  effectiveDamageUnresolved: number;
}

function createSide(): MutableSide {
  return {
    roundsPlayed: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    reportedDamage: 0,
    effectiveDamage: 0,
    effectiveDamageUnresolved: 0,
  };
}

function finalizeSide(side: MutableSide): SideMetrics {
  return {
    roundsPlayed: side.roundsPlayed,
    kills: side.kills,
    deaths: side.deaths,
    assists: side.assists,
    reportedDamage: side.reportedDamage,
    reportedAdr: side.roundsPlayed > 0 ? side.reportedDamage / side.roundsPlayed : null,
    effectiveDamage: side.effectiveDamage,
    effectiveDamageUnresolved: side.effectiveDamageUnresolved,
    adr: side.roundsPlayed > 0 && side.effectiveDamageUnresolved === 0
      ? side.effectiveDamage / side.roundsPlayed
      : null,
  };
}

/**
 * The opening duel is the earliest in-window kill. Equal earliest ticks make the
 * duel contested rather than picking a winner from unordered same-tick rows; a
 * first kill without two known opposing sides is unattributed, and a round with
 * no kill has no duel.
 */
function resolveOpening(round: RoundCoverage): OpeningResolution {
  const kills = round.eventsInWindow().filter((event): event is KillEvent => event.type === "kill");
  if (kills.length === 0) return { status: "absent" };
  let minTick = kills[0].tick;
  for (const kill of kills) if (kill.tick < minTick) minTick = kill.tick;
  const first = kills.filter(kill => kill.tick === minTick);
  if (first.length > 1) return { status: "contested" };
  const kill = first[0];
  if (!isIdentifiedEnemyKill(kill)) return { status: "unattributed" };
  return { status: "duel", killer: kill.killer, victim: kill.victim };
}

const emptyLedger: DamageLedger = { loss: () => null, unresolved: {} };

function computePlayerMetrics(
  player: Player,
  coverage: MatchCoverage,
  openings: ReadonlyMap<number, OpeningResolution>,
  ledgers: ReadonlyMap<number, DamageLedger>,
  timelines: ReadonlyMap<number, RoundTimeline>,
  trades: ReadonlyMap<number, RoundTradeResolution>,
  clutches: ReadonlyMap<number, RoundClutchResolution>,
  tradeWindow: TradeWindow,
  metricIssues: Partial<Record<CoverageIssue, number>>,
): Omit<PlayerMetrics, "utility"> {
  const steamId = player.steamId;
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let headshotKills = 0;
  let headshotsKnown = 0;
  let reportedDamage = 0;
  let roundsPlayed = 0;
  let eligibleRounds = 0;
  let skippedMissingWindow = 0;
  let skippedUnconfirmedParticipation = 0;
  let assistsExcludedBySide = 0;
  let killsWithoutTeamkillStatus = 0;
  let killsWithoutHeadshotStatus = 0;
  let damageWithoutKnownSides = 0;
  let effectiveDamage = 0;
  let effectiveDamageUnresolved = 0;
  let openingKills = 0;
  let openingDeaths = 0;
  const side: Record<KnownSide, MutableSide> = { CT: createSide(), T: createSide() };
  const multiKillCounts = { 2: 0, 3: 0, 4: 0, 5: 0 };
  let multiKillRounds = 0;
  let maxKillsInRound = 0;

  for (const round of coverage.rounds) {
    const ledger = ledgers.get(round.number) ?? emptyLedger;
    const state = round.playerState(steamId);
    if (round.window.eventEligible) eligibleRounds++;
    const plays = round.window.eventEligible && state.participant === true;
    if (plays) {
      roundsPlayed++;
      if (state.side) side[state.side].roundsPlayed++;
    } else if (round.window.eventEligible) {
      skippedUnconfirmedParticipation++;
    } else {
      skippedMissingWindow++;
    }

    const resolution = openings.get(round.number);
    if (resolution?.status === "duel") {
      if (resolution.killer === steamId) openingKills++;
      if (resolution.victim === steamId) openingDeaths++;
    }

    let roundKills = 0;
    for (const event of round.eventsInWindow()) {
      if (event.type === "kill") {
        if (isEligibleKill(event, steamId)) {
          kills++;
          roundKills++;
          if (event.headshot === undefined) killsWithoutHeadshotStatus++;
          else {
            headshotsKnown++;
            if (event.headshot) headshotKills++;
          }
          if (event.teamkill === undefined) killsWithoutTeamkillStatus++;
          if (plays && state.side) side[state.side].kills++;
        }
        if (event.victim === steamId) {
          deaths++;
          if (plays && state.side) side[state.side].deaths++;
        }
        if (event.assister === steamId) {
          if (isEligibleAssist(event, steamId)) {
            assists++;
            if (plays && state.side) side[state.side].assists++;
          } else {
            assistsExcludedBySide++;
          }
        }
      } else if (event.type === "damage" && plays && event.attacker === steamId) {
        if (isEligibleDamage(event, steamId)) {
          reportedDamage += event.healthDamage;
          if (state.side) side[state.side].reportedDamage += event.healthDamage;
          const loss = ledger.loss(event);
          if (loss === null) {
            effectiveDamageUnresolved++;
            if (state.side) side[state.side].effectiveDamageUnresolved++;
          } else {
            effectiveDamage += loss;
            if (state.side) side[state.side].effectiveDamage += loss;
          }
        } else if (event.attackerSide === "Unknown" || event.victimSide === "Unknown") {
          damageWithoutKnownSides++;
        }
      }
    }

    if (roundKills >= 2) {
      multiKillRounds++;
      multiKillCounts[Math.min(roundKills, 5) as 2 | 3 | 4 | 5]++;
    }
    if (roundKills > maxKillsInRound) maxKillsInRound = roundKills;
  }

  addIssueCount(metricIssues, "assist-side-mismatch", assistsExcludedBySide);
  addIssueCount(metricIssues, "kill-teamkill-status-unknown", killsWithoutTeamkillStatus);
  addIssueCount(metricIssues, "kill-headshot-status-unknown", killsWithoutHeadshotStatus);
  addIssueCount(metricIssues, "damage-side-unknown", damageWithoutKnownSides);

  const openingDuels = openingKills + openingDeaths;
  return {
    steamId,
    nickname: player.nickname,
    kills,
    deaths,
    assists,
    kdRatio: deaths > 0 ? kills / deaths : null,
    headshotKills,
    headshotPercentage: headshotsKnown > 0 ? (headshotKills / headshotsKnown) * 100 : null,
    roundsPlayed,
    reportedDamage,
    reportedAdr: roundsPlayed > 0 ? reportedDamage / roundsPlayed : null,
    effectiveDamage,
    adr: roundsPlayed > 0 && effectiveDamageUnresolved === 0
      ? effectiveDamage / roundsPlayed
      : null,
    side: { CT: finalizeSide(side.CT), T: finalizeSide(side.T) },
    multiKills: { counts: multiKillCounts, multiKillRounds, maxKillsInRound },
    opening: {
      kills: openingKills,
      deaths: openingDeaths,
      duels: openingDuels,
      winRate: openingDuels > 0 ? openingKills / openingDuels : null,
    },
    kast: computeKast(steamId, coverage, timelines, trades, tradeWindow.ticks),
    trade: summarizeTrade(steamId, coverage, trades, {
      windowSeconds: tradeWindow.seconds,
      windowTicks: tradeWindow.ticks,
    }),
    clutch: summarizeClutch(steamId, clutches),
    coverage: {
      eligibleRounds,
      countedRounds: roundsPlayed,
      skippedMissingWindow,
      skippedUnconfirmedParticipation,
      assistsExcludedBySide,
      killsWithoutTeamkillStatus,
      killsWithoutHeadshotStatus,
      damageWithoutKnownSides,
      effectiveDamageUnresolved,
    },
  };
}

/**
 * Compute the deterministic player metric set.
 *
 * Totals (K/D/A, HS%, multi-kill, opening) require only a complete formal round
 * window. Participation-scoped values (rounds played, damage, ADR, CT/T split)
 * additionally require confirmed freeze-end/start participation so numerator
 * and denominator cover the same rounds. KAST / Trade / Clutch read the shared
 * survival timeline and suppress time-based trade evidence when match.tickRate
 * is unreliable.
 */
export function analyzeMatch(match: Match, options: AnalyzeOptions = {}): MatchAnalytics {
  const threshold = options.effectiveFlashThresholdSeconds;
  if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0)) {
    throw new RangeError("effectiveFlashThresholdSeconds must be finite and nonnegative");
  }
  const coverage = buildCoverage(match);
  const metricIssues: Partial<Record<CoverageIssue, number>> = {};
  const ledgers = new Map<number, DamageLedger>();
  for (const round of coverage.rounds) {
    const ledger = buildDamageLedger(round);
    ledgers.set(round.number, ledger);
    for (const issue of damageLossIssueTypes) {
      const count = ledger.unresolved[issue] ?? 0;
      if (count > 0) addIssueCount(metricIssues, issue, count);
    }
  }
  const openings = new Map<number, OpeningResolution>();
  for (const round of coverage.eventEligibleRounds) {
    const resolution = resolveOpening(round);
    openings.set(round.number, resolution);
    if (resolution.status === "contested") addIssueCount(metricIssues, "opening-duel-contested");
    else if (resolution.status === "unattributed") addIssueCount(metricIssues, "opening-duel-unattributed");
    else if (resolution.status === "absent") addIssueCount(metricIssues, "opening-duel-absent");
  }

  const tradeWindowSeconds = options.tradeWindowSeconds ?? defaultTradeWindowSeconds;
  const tickRate = match.tickRate;
  const reliableTickRate = typeof tickRate === "number" && Number.isFinite(tickRate) && tickRate > 0;
  const tradeWindow: TradeWindow = {
    seconds: tradeWindowSeconds,
    ticks: reliableTickRate ? Math.max(1, Math.round(tradeWindowSeconds * tickRate)) : null,
  };
  if (tradeWindow.ticks === null) addIssueCount(metricIssues, "trade-tick-rate-unknown");

  const timelines = new Map<number, RoundTimeline>();
  const trades = new Map<number, RoundTradeResolution>();
  const clutches = new Map<number, RoundClutchResolution>();
  for (const round of coverage.rounds) {
    const timeline = buildRoundTimeline(round);
    timelines.set(round.number, timeline);
    if (!timeline.available) addIssueCount(metricIssues, "survival-context-unavailable");
    else if (timeline.degraded) addIssueCount(metricIssues, "survival-context-degraded");
    for (const anomaly of timeline.anomalies) addIssueCount(metricIssues, "survival-timeline-anomaly");
    for (const state of timeline.states) {
      if (state.endConflict) addIssueCount(metricIssues, "survival-end-state-conflict");
      else if (state.aliveAtBaseline === true && state.survived === null) {
        addIssueCount(metricIssues, "survival-end-state-unavailable");
      }
    }
    const tradeResolution = resolveRoundTrades(round, timeline, tradeWindow.ticks);
    trades.set(round.number, tradeResolution);
    for (const ambiguity of tradeResolution.ambiguities) {
      addIssueCount(metricIssues,
        ambiguity.reason === "same-tick" ? "trade-same-tick-ambiguous" : "trade-candidate-ambiguous");
    }
    const clutch = resolveRoundClutch(round, timeline);
    clutches.set(round.number, clutch);
    if (clutch.ineligible) addIssueCount(metricIssues, "clutch-round-ineligible");
    else if (clutch.opportunities.some(opportunity => opportunity.won === null)) {
      addIssueCount(metricIssues, "clutch-winner-unknown");
    }
  }

  const players = match.players.map(player =>
    ({ ...computePlayerMetrics(player, coverage, openings, ledgers, timelines, trades, clutches, tradeWindow, metricIssues),
      utility: summarizeUtility(player.steamId, coverage, ledgers, match.tickRate, threshold) }));
  return { matchId: match.id, players, coverage: coverage.summary(metricIssues), tradeWindow };
}
