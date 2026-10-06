import type { KnownSide, RoundCoverage } from "./coverage.js";
import type { RoundTimeline } from "./timeline.js";

/**
 * A recorded clutch opportunity.
 *
 * The opportunity forms the moment the player becomes their team's only living
 * member while at least one opponent is still alive. `opponents` is the enemy
 * count at that moment, so a 1v3 stays a 1v3 even if the enemies later die.
 */
export interface ClutchOpportunity {
  readonly round: number;
  readonly side: KnownSide;
  readonly player: string;
  readonly opponents: number;
  /** Tick at which the player became the sole survivor. */
  readonly tick: number;
  /** Round won by the player's side; null when the round winner is unknown. */
  readonly won: boolean | null;
  /** The player's own death tick, or null when they were still alive at round end. */
  readonly deathTick: number | null;
}

export interface RoundClutchResolution {
  readonly round: number;
  readonly opportunities: readonly ClutchOpportunity[];
  /** The round had to be omitted because the survival context is not reliable. */
  readonly ineligible: boolean;
}

/**
 * Advance the alive count from the freeze-end roster and record clutch moments.
 *
 * The round is omitted entirely when the starting roster is degraded, contains
 * unidentified players, has an unknown alive/side value, or shows an
 * unexplained lifecycle change (disconnect / respawn / side change) or an
 * inconsistent death timeline. Guessing a 1vX state there is forbidden.
 */
export function resolveRoundClutch(
  round: RoundCoverage,
  timeline: RoundTimeline,
): RoundClutchResolution {
  if (!timeline.available || timeline.degraded || timeline.anomalies.length > 0
    || round.roster.unidentifiedPlayerCount > 0) {
    return { round: round.number, opportunities: [], ineligible: true };
  }
  if (timeline.states.some(state => state.aliveAtBaseline === null || state.side === null)) {
    return { round: round.number, opportunities: [], ineligible: true };
  }

  const sideBySteamId = new Map(timeline.states.map(state => [state.steamId, state.side]));
  const alive = new Set(
    timeline.states.filter(state => state.aliveAtBaseline === true).map(state => state.steamId));
  const opportunities: ClutchOpportunity[] = [];
  const recorded = new Set<KnownSide>();
  const baselineTick = timeline.baselineTick ?? round.window.startTick ?? 0;

  const evaluate = (tick: number): void => {
    for (const side of ["CT", "T"] as KnownSide[]) {
      if (recorded.has(side)) continue;
      let aliveOnSide = 0;
      let soleSurvivor: string | null = null;
      let enemiesAlive = 0;
      for (const player of alive) {
        if (sideBySteamId.get(player) === side) {
          aliveOnSide++;
          soleSurvivor = player;
        } else {
          enemiesAlive++;
        }
      }
      if (aliveOnSide !== 1 || enemiesAlive < 1 || soleSurvivor === null) continue;
      recorded.add(side);
      const state = timeline.state(soleSurvivor);
      opportunities.push({
        round: round.number,
        side,
        player: soleSurvivor,
        opponents: enemiesAlive,
        tick,
        won: round.winner === side ? true : round.winner === null ? null : false,
        deathTick: state.deathTick,
      });
    }
  };

  evaluate(baselineTick);
  const ticks = [...new Set(timeline.deaths.map(death => death.tick))].sort((a, b) => a - b);
  for (const tick of ticks) {
    for (const death of timeline.deaths) {
      if (death.tick === tick) alive.delete(death.victim);
    }
    evaluate(tick);
  }

  return { round: round.number, opportunities, ineligible: false };
}

export type OpponentBuckets = { 1: number; 2: number; 3: number; 4: number; 5: number };

const emptyBuckets = (): OpponentBuckets => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });

export interface ClutchMetrics {
  readonly opportunities: number;
  /** Opportunities where the player's side won the round. */
  readonly wins: number;
  /** Opportunities keyed by enemies faced; key 5 means five or more. */
  readonly byOpponents: OpponentBuckets;
  /** Wins keyed by enemies faced; key 5 means five or more. */
  readonly winsByOpponents: OpponentBuckets;
  /** Every opportunity this player had, in round order. */
  readonly list: readonly ClutchOpportunity[];
}

const bucket = (opponents: number): 1 | 2 | 3 | 4 | 5 =>
  Math.min(Math.max(opponents, 1), 5) as 1 | 2 | 3 | 4 | 5;

/** Collect one player's clutch opportunities and round wins. */
export function summarizeClutch(
  steamId: string,
  resolutions: ReadonlyMap<number, RoundClutchResolution>,
): ClutchMetrics {
  const list: ClutchOpportunity[] = [];
  const byOpponents = emptyBuckets();
  const winsByOpponents = emptyBuckets();
  for (const resolution of resolutions.values()) {
    for (const opportunity of resolution.opportunities) {
      if (opportunity.player !== steamId) continue;
      list.push(opportunity);
      byOpponents[bucket(opportunity.opponents)]++;
      if (opportunity.won === true) winsByOpponents[bucket(opportunity.opponents)]++;
    }
  }
  const wins = list.reduce((total, opportunity) => total + (opportunity.won === true ? 1 : 0), 0);
  return { opportunities: list.length, wins, byOpponents, winsByOpponents, list };
}
