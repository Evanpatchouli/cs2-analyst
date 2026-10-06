import { isEligibleAssist, isEligibleKill, type MatchCoverage } from "./coverage.js";
import type { RoundTradeResolution } from "./trade.js";
import type { RoundTimeline } from "./timeline.js";

/**
 * KAST breakdown for one player.
 *
 * Every round is classified from the shared survival timeline and trade
 * resolution, never from per-metric state guesses:
 *
 * - K: an eligible kill in the round window.
 * - A: an eligible assist in the round window.
 * - S: survival proven by the freeze-end baseline plus the observed end state.
 * - T: the player's death was traded by a living teammate inside the window.
 */
export interface KastMetrics {
  /** Rounds counted as KAST (at least one of K/A/S/T). */
  readonly rounds: number;
  /** Rounds the player participated in where every needed component was evaluable. */
  readonly eligibleRounds: number;
  /** Rounds the player participated in; the largest possible denominator. */
  readonly playedRounds: number;
  /** rounds / eligibleRounds * 100; null when no round was evaluable. */
  readonly percentage: number | null;
  /** Rounds with an eligible kill. */
  readonly killRounds: number;
  /** Rounds with an eligible assist. */
  readonly assistRounds: number;
  /** Rounds where survival to round end was proven. */
  readonly survivalRounds: number;
  /** Rounds where the player's death was traded. */
  readonly tradedRounds: number;
  /** Participating rounds skipped because required evidence was unavailable. */
  readonly unavailableRounds: number;
  /** Participating rounds skipped because the trade evidence was ambiguous. */
  readonly ambiguousRounds: number;
  /** Evaluated rounds that relied on a degraded or unproven component. */
  readonly degradedRounds: number;
  /** percentage covers every participating round with no degraded or ambiguous evidence. */
  readonly complete: boolean;
}

/**
 * Compute one player's KAST.
 *
 * A round is decided as soon as K, A or a proven trade is present. When none is
 * present the round is only decided if survival is proven false; an unproven
 * survival or an ambiguous trade removes the round from the denominator and
 * raises coverage instead of guessing a miss.
 */
export function computeKast(
  steamId: string,
  coverage: MatchCoverage,
  timelines: ReadonlyMap<number, RoundTimeline>,
  resolutions: ReadonlyMap<number, RoundTradeResolution>,
  windowTicks: number | null,
): KastMetrics {
  let rounds = 0;
  let eligibleRounds = 0;
  let playedRounds = 0;
  let killRounds = 0;
  let assistRounds = 0;
  let survivalRounds = 0;
  let tradedRounds = 0;
  let unavailableRounds = 0;
  let ambiguousRounds = 0;
  let degradedRounds = 0;

  for (const round of coverage.rounds) {
    if (!round.playsIn(steamId)) continue;
    playedRounds++;
    const timeline = timelines.get(round.number);
    if (!timeline || !timeline.available || timeline.anomalies.length > 0) {
      unavailableRounds++;
      continue;
    }
    const unreliable = timeline.degraded || timeline.endStateSuspect;
    const state = timeline.state(steamId);
    const events = round.eventsInWindow();
    const killed = events.some(event => event.type === "kill" && isEligibleKill(event, steamId));
    const assisted = events.some(event => event.type === "kill" && isEligibleAssist(event, steamId));
    const survived = state.survived;

    let traded: boolean | null = false;
    let tradeAmbiguous = false;
    if (state.deathTick !== null) {
      if (windowTicks === null) {
        traded = null;
      } else {
        const resolution = resolutions.get(round.number);
        const credited = resolution?.trades.some(
          trade => trade.tradedVictim === steamId && trade.tradedDeathTick === state.deathTick) ?? false;
        const ambiguous = resolution?.ambiguities.some(
          ambiguity => ambiguity.candidates.includes(steamId)) ?? false;
        if (credited) traded = true;
        else if (ambiguous) {
          traded = null;
          tradeAmbiguous = true;
        }
      }
    }

    const certain = killed || assisted || traded === true;
    const decidedMiss = !certain && survived === false && traded === false;
    if (certain || survived === true) {
      rounds++;
      eligibleRounds++;
      if (killed) killRounds++;
      if (assisted) assistRounds++;
      if (survived === true) survivalRounds++;
      if (traded === true) tradedRounds++;
      if (unreliable || survived === null || traded === null) degradedRounds++;
    } else if (decidedMiss) {
      eligibleRounds++;
      if (unreliable) degradedRounds++;
    } else if (tradeAmbiguous) {
      ambiguousRounds++;
    } else {
      unavailableRounds++;
    }
  }

  const complete = eligibleRounds === playedRounds
    && unavailableRounds === 0 && ambiguousRounds === 0 && degradedRounds === 0;
  return {
    rounds,
    eligibleRounds,
    playedRounds,
    percentage: eligibleRounds > 0 ? (rounds / eligibleRounds) * 100 : null,
    killRounds,
    assistRounds,
    survivalRounds,
    tradedRounds,
    unavailableRounds,
    ambiguousRounds,
    degradedRounds,
    complete,
  };
}
