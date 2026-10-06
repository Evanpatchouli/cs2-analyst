import { isIdentifiedEnemyKill, type MatchCoverage, type RoundCoverage } from "./coverage.js";
import type { RoundTimeline } from "./timeline.js";

/** Default trade window: five seconds, converted to ticks through match.tickRate. */
export const defaultTradeWindowSeconds = 5;

/**
 * A credited trade kill and the relationships it establishes.
 *
 * `trader` kills `tradedKiller` to avenge the teammate `tradedVictim`, whose
 * death happened `tradedDeathTick` at least one tick earlier inside the window.
 */
export interface TradeKill {
  readonly round: number;
  readonly tick: number;
  readonly trader: string;
  readonly tradedVictim: string;
  readonly tradedKiller: string;
  readonly tradedDeathTick: number;
}

export type TradeAmbiguityReason = "same-tick" | "tied-candidates";

/**
 * A trade candidate that cannot be proven.
 *
 * Same-tick kills carry no subtick order, so the demo array order is not used
 * to claim that the victim died before the avenger fired. Equally recent
 * candidates by the same killer are equally unprovable.
 */
export interface TradeAmbiguity {
  readonly round: number;
  readonly tick: number;
  readonly trader: string;
  readonly reason: TradeAmbiguityReason;
  readonly candidates: readonly string[];
}

export interface RoundTradeResolution {
  /** False when the round's timeline is unusable for trade evidence. */
  readonly resolved: boolean;
  readonly trades: readonly TradeKill[];
  /** Tradeable deaths this round keyed by victim: an identified enemy kill with a living teammate. */
  readonly tradeableDeaths: ReadonlyMap<string, number>;
  readonly ambiguities: readonly TradeAmbiguity[];
}

const unresolved: RoundTradeResolution = Object.freeze({
  resolved: false,
  trades: Object.freeze([]) as readonly TradeKill[],
  tradeableDeaths: new Map<string, number>(),
  ambiguities: Object.freeze([]) as readonly TradeAmbiguity[],
});

/**
 * Resolve trade kills and tradeable deaths for one round.
 *
 * Both the death and the revenge kill must be identified enemy kills, so
 * teamkills, world deaths and unknown sides are excluded by construction. The
 * trader must have been alive at the trade kill, which also proves they were
 * alive when the avenged teammate died. `windowTicks === null` suppresses
 * every time-based trade conclusion while still counting tradeable deaths.
 * A conflicting end state makes the entire round unresolved, including
 * tradeable deaths, because the inferred living teammates are unreliable.
 */
export function resolveRoundTrades(
  round: RoundCoverage,
  timeline: RoundTimeline,
  windowTicks: number | null,
): RoundTradeResolution {
  if (!timeline.available || timeline.endStateSuspect || timeline.anomalies.length > 0
    || round.roster.unidentifiedPlayerCount > 0) return unresolved;

  const kills = timeline.deaths;
  const tradeableDeaths = new Map<string, number>();
  for (const death of kills) {
    if (!isIdentifiedEnemyKill(death)) continue;
    const victimState = timeline.state(death.victim);
    if (victimState.side === null) continue;
    for (const mate of timeline.states) {
      if (mate.steamId === death.victim || mate.side !== victimState.side) continue;
      if (mate.aliveAtBaseline !== true) continue;
      if (mate.deathTick === null || mate.deathTick > death.tick) {
        tradeableDeaths.set(death.victim, (tradeableDeaths.get(death.victim) ?? 0) + 1);
        break;
      }
    }
  }

  if (windowTicks === null) {
    return { resolved: true, trades: [], tradeableDeaths, ambiguities: [] };
  }

  const trades: TradeKill[] = [];
  const ambiguities: TradeAmbiguity[] = [];
  for (const avenger of kills) {
    if (!isIdentifiedEnemyKill(avenger)) continue;
    const trader = avenger.killer;
    const traderState = timeline.state(trader);
    if (traderState.side === null || traderState.aliveAtBaseline !== true) continue;
    // A trader who is already dead cannot fire the revenge kill.
    if (traderState.deathTick !== null && traderState.deathTick <= avenger.tick) continue;
    const candidates = kills.filter(death => {
      if (!isIdentifiedEnemyKill(death)) return false;
      if (death.killer !== avenger.victim) return false;   // the avenged killer is this kill's victim
      if (death.victim === trader) return false;           // cannot avenge your own death
      if (death.tick > avenger.tick) return false;
      if (avenger.tick - death.tick > windowTicks) return false;
      const victimState = timeline.state(death.victim);
      if (victimState.side !== traderState.side) return false;
      if (victimState.aliveAtBaseline !== true) return false;
      return victimState.deathTick === null || victimState.deathTick >= death.tick;
    });
    if (candidates.length === 0) continue;
    const latest = candidates.reduce((max, death) => Math.max(max, death.tick), candidates[0].tick);
    const best = candidates.filter(death => death.tick === latest);
    if (best.length > 1 || latest === avenger.tick) {
      ambiguities.push({
        round: round.number,
        tick: avenger.tick,
        trader,
        reason: best.length > 1 ? "tied-candidates" : "same-tick",
        candidates: best.map(death => death.victim).sort((a, b) => a.localeCompare(b)),
      });
      continue;
    }
    const traded = best[0];
    trades.push({
      round: round.number,
      tick: avenger.tick,
      trader,
      tradedVictim: traded.victim,
      tradedKiller: traded.killer,
      tradedDeathTick: traded.tick,
    });
  }

  return { resolved: true, trades, tradeableDeaths, ambiguities };
}

export interface TradeMetrics {
  /** Time-based trade evidence is available and the round context resolved. */
  readonly available: boolean;
  /** Kills that avenged a teammate's death inside the window. */
  readonly tradeKills: number;
  /** This player's deaths avenged by a living teammate inside the window. */
  readonly tradedDeaths: number;
  /** Deaths a living teammate could have traded (identified enemy kill). */
  readonly tradeableDeaths: number;
  /**
   * tradedDeaths / tradeableDeaths * 100. Null when there is no tradeable death
   * or when any required evidence is missing/ambiguous, so a partial total is
   * never published as a complete rate.
   */
  readonly tradeRate: number | null;
  /** Configured window in seconds. */
  readonly windowSeconds: number;
  /** Window in ticks derived from match.tickRate; null when the tick rate is unreliable. */
  readonly windowTicks: number | null;
  /** This player's deaths whose trade outcome was ambiguous. */
  readonly ambiguousDeaths: number;
  /** This player's kills that were unprovable trade candidates. */
  readonly ambiguousTradeKills: number;
  /** Participating rounds skipped because the round context was unusable. */
  readonly unavailableRounds: number;
  /** Every denominator and window needed for the rate was available. */
  readonly complete: boolean;
}

/**
 * Aggregate one player's trade evidence across formal rounds.
 *
 * `tradeKills` and `tradedDeaths` are granted only from credited trades, so
 * they map one-to-one across the match. The rate additionally requires the
 * tick rate, a resolved round context, and no ambiguous candidate for this
 * player; otherwise it is null instead of a partial ratio.
 */
export function summarizeTrade(
  steamId: string,
  coverage: MatchCoverage,
  resolutions: ReadonlyMap<number, RoundTradeResolution>,
  options: { windowSeconds: number; windowTicks: number | null },
): TradeMetrics {
  let tradeKills = 0;
  let tradedDeaths = 0;
  let tradeableDeaths = 0;
  let ambiguousDeaths = 0;
  let ambiguousTradeKills = 0;
  let unavailableRounds = 0;
  for (const round of coverage.rounds) {
    if (!round.playsIn(steamId)) continue;
    const resolution = resolutions.get(round.number);
    if (!resolution || !resolution.resolved) {
      unavailableRounds++;
      continue;
    }
    tradeableDeaths += resolution.tradeableDeaths.get(steamId) ?? 0;
    for (const trade of resolution.trades) {
      if (trade.trader === steamId) tradeKills++;
      if (trade.tradedVictim === steamId) tradedDeaths++;
    }
    for (const ambiguity of resolution.ambiguities) {
      if (ambiguity.trader === steamId) ambiguousTradeKills++;
      if (ambiguity.candidates.includes(steamId)) ambiguousDeaths++;
    }
  }
  const available = options.windowTicks !== null;
  const complete = available && unavailableRounds === 0
    && ambiguousDeaths === 0 && ambiguousTradeKills === 0;
  return {
    available,
    tradeKills,
    tradedDeaths,
    tradeableDeaths,
    tradeRate: complete && tradeableDeaths > 0 ? (tradedDeaths / tradeableDeaths) * 100 : null,
    windowSeconds: options.windowSeconds,
    windowTicks: options.windowTicks,
    ambiguousDeaths,
    ambiguousTradeKills,
    unavailableRounds,
    complete,
  };
}
