import type {
  DamageEvent,
  KillEvent,
  Match,
  MatchEvent,
  Round,
  RoundPlayerLifecycleEvent,
  RoundStateBoundary,
  RoundStateSnapshot,
  TeamSide,
} from "@cs2-coach/match-model";

/**
 * Central coverage issues. Every consumer reports eligibility with these codes
 * instead of inventing per-metric "is this usable" checks.
 */
export type CoverageIssue =
  | "round-start-missing"
  | "round-end-missing"
  | "freeze-end-missing"
  | "roster-snapshot-unavailable"
  | "roster-snapshot-fallback-start"
  | "roster-unidentified-players"
  | "player-not-in-roster"
  | "player-side-unknown"
  | "player-participation-unknown"
  | "player-alive-unknown"
  | "post-round-events-excluded"
  | "kill-teamkill-status-unknown"
  | "kill-headshot-status-unknown"
  | "damage-side-unknown"
  | "damage-effective-chain-broken"
  | "damage-effective-same-tick-ambiguous"
  | "assist-side-mismatch"
  | "opening-duel-contested"
  | "opening-duel-unattributed"
  | "opening-duel-absent"
  | "survival-context-unavailable"
  | "survival-context-degraded"
  | "survival-end-state-unavailable"
  | "survival-end-state-conflict"
  | "survival-timeline-anomaly"
  | "trade-tick-rate-unknown"
  | "trade-same-tick-ambiguous"
  | "trade-candidate-ambiguous"
  | "clutch-round-ineligible"
  | "clutch-winner-unknown";

export const coverageIssueTypes: readonly CoverageIssue[] = [
  "round-start-missing",
  "round-end-missing",
  "freeze-end-missing",
  "roster-snapshot-unavailable",
  "roster-snapshot-fallback-start",
  "roster-unidentified-players",
  "player-not-in-roster",
  "player-side-unknown",
  "player-participation-unknown",
  "player-alive-unknown",
  "post-round-events-excluded",
  "kill-teamkill-status-unknown",
  "kill-headshot-status-unknown",
  "damage-side-unknown",
  "damage-effective-chain-broken",
  "damage-effective-same-tick-ambiguous",
  "assist-side-mismatch",
  "opening-duel-contested",
  "opening-duel-unattributed",
  "opening-duel-absent",
  "survival-context-unavailable",
  "survival-context-degraded",
  "survival-end-state-unavailable",
  "survival-end-state-conflict",
  "survival-timeline-anomaly",
  "trade-tick-rate-unknown",
  "trade-same-tick-ambiguous",
  "trade-candidate-ambiguous",
  "clutch-round-ineligible",
  "clutch-winner-unknown",
];

/**
 * Severity classes the coverage contract distinguishes.
 *
 * - `unavailable`: the evidence a metric needs is missing, so the value must not be produced.
 * - `ambiguous`: the evidence exists but cannot prove one outcome, so the value must not be guessed.
 * - `degraded`: a value can be produced from a documented weaker signal, but it is not complete coverage.
 * - `informational`: an accounted-for exclusion that is not a coverage deficiency.
 */
export type IssueSeverity = "unavailable" | "ambiguous" | "degraded" | "informational";

/** Severity class of every issue, so partial coverage is never presented as complete. */
export const coverageIssueSeverity: Readonly<Record<CoverageIssue, IssueSeverity>> = {
  "round-start-missing": "unavailable",
  "round-end-missing": "unavailable",
  "freeze-end-missing": "degraded",
  "roster-snapshot-unavailable": "unavailable",
  "roster-snapshot-fallback-start": "degraded",
  "roster-unidentified-players": "degraded",
  "player-not-in-roster": "degraded",
  "player-side-unknown": "degraded",
  "player-participation-unknown": "degraded",
  "player-alive-unknown": "degraded",
  "post-round-events-excluded": "informational",
  "kill-teamkill-status-unknown": "degraded",
  "kill-headshot-status-unknown": "degraded",
  "damage-side-unknown": "degraded",
  "damage-effective-chain-broken": "degraded",
  "damage-effective-same-tick-ambiguous": "ambiguous",
  "assist-side-mismatch": "degraded",
  "opening-duel-contested": "ambiguous",
  "opening-duel-unattributed": "degraded",
  "opening-duel-absent": "informational",
  "survival-context-unavailable": "unavailable",
  "survival-context-degraded": "degraded",
  "survival-end-state-unavailable": "unavailable",
  "survival-end-state-conflict": "ambiguous",
  "survival-timeline-anomaly": "unavailable",
  "trade-tick-rate-unknown": "unavailable",
  "trade-same-tick-ambiguous": "ambiguous",
  "trade-candidate-ambiguous": "ambiguous",
  "clutch-round-ineligible": "unavailable",
  "clutch-winner-unknown": "degraded",
};

/** A side that can be used as a metric dimension; "Unknown" is coverage, not a side. */
export type KnownSide = Exclude<TeamSide, "Unknown">;

/**
 * Per-round event window.
 *
 * The parser keeps post-round combat attached to the round until the next
 * start, so every event-derived metric must filter through this window.
 * A round is only event eligible when both a start and an end boundary are
 * recorded; otherwise an event cannot be proven to belong to the round.
 */
export interface RoundWindow {
  readonly startTick: number | null;
  readonly endTick: number | null;
  readonly freezeEndTick: number | null;
  readonly eventEligible: boolean;
  /** Attached events dropped because they fall outside [startTick, endTick]. */
  readonly excludedEventCount: number;
  includes(tick: number): boolean;
}

export interface PlayerRoundState {
  readonly inRoster: boolean;
  readonly side: KnownSide | null;
  readonly participant: boolean | null;
  readonly alive: boolean | null;
}

const absentState: PlayerRoundState = Object.freeze({
  inRoster: false,
  side: null,
  participant: null,
  alive: null,
});

/** One observed roster row, keyed by the exact SteamID the snapshot recorded. */
export interface RoundRosterEntry {
  readonly steamId: string;
  readonly side: KnownSide | null;
  readonly participant: boolean | null;
  readonly alive: boolean | null;
}

/**
 * Resolved per-round roster. The preferred boundary is the observed freeze end
 * (first active state); the start boundary is a documented degraded fallback.
 */
export interface RoundRoster {
  readonly boundary: RoundStateBoundary | null;
  readonly tick: number | null;
  readonly available: boolean;
  readonly degraded: boolean;
  readonly unidentifiedPlayerCount: number;
  /** Every observed row at the selected boundary; empty when the roster is unavailable. */
  readonly entries: readonly RoundRosterEntry[];
  state(steamId: string): PlayerRoundState;
}

/**
 * Observed end-boundary state for a round.
 *
 * A death event proves a player died; it does not prove that everyone else
 * survived. Survival is only accepted when the recorded end state confirms it.
 */
export interface RoundEndState {
  readonly observed: boolean;
  readonly tick: number | null;
  readonly unidentifiedPlayerCount: number;
  hasRow(steamId: string): boolean;
  /** Observed alive value at the end boundary; null when unobserved or no row. */
  alive(steamId: string): boolean | null;
}

export interface RoundCoverage {
  readonly number: number;
  readonly window: RoundWindow;
  readonly roster: RoundRoster;
  readonly endState: RoundEndState;
  /** Reported round winner, or null when round_end did not attribute one. */
  readonly winner: KnownSide | null;
  readonly issues: readonly CoverageIssue[];
  /** Attached events inside the valid formal round window; empty when not eligible. */
  eventsInWindow(): readonly MatchEvent[];
  /** Lifecycle evidence inside the valid formal round window; empty when not eligible. */
  readonly lifecycleEvents: readonly RoundPlayerLifecycleEvent[];
  playerState(steamId: string): PlayerRoundState;
  /** Participation confirmed: event-eligible round and participant === true. */
  playsIn(steamId: string): boolean;
}

export interface RoundCoverageSummary {
  readonly number: number;
  readonly eventEligible: boolean;
  readonly startTick: number | null;
  readonly endTick: number | null;
  readonly rosterBoundary: RoundStateBoundary | null;
  readonly rosterDegraded: boolean;
  readonly unidentifiedPlayerCount: number;
  readonly excludedEventCount: number;
  readonly issues: readonly CoverageIssue[];
}

export interface CoverageSummary {
  readonly totalRounds: number;
  readonly eventEligibleRounds: number;
  readonly rosterResolvedRounds: number;
  readonly issues: Readonly<Record<CoverageIssue, number>>;
  /** Issue totals grouped by severity class. */
  readonly severity: Readonly<Record<IssueSeverity, number>>;
  readonly rounds: readonly RoundCoverageSummary[];
}

export interface MatchCoverage {
  readonly rounds: readonly RoundCoverage[];
  readonly eventEligibleRounds: readonly RoundCoverage[];
  /** Round- and player-level coverage issues, before metric-specific additions. */
  readonly baseIssues: Readonly<Record<CoverageIssue, number>>;
  round(number: number): RoundCoverage | undefined;
  summary(extra?: Partial<Record<CoverageIssue, number>>): CoverageSummary;
}

/** Boundary preference for per-round side/participation. Freeze end is the active-round default. */
export const rosterBoundaryPreference: readonly RoundStateBoundary[] = ["freeze_end", "start"];

export function createIssueCounts(): Record<CoverageIssue, number> {
  const counts = {} as Record<CoverageIssue, number>;
  for (const issue of coverageIssueTypes) counts[issue] = 0;
  return counts;
}

/** Accumulate a metric-specific issue count into a partial counter map. */
export function addIssueCount(
  counts: Partial<Record<CoverageIssue, number>>,
  issue: CoverageIssue,
  amount = 1,
): void {
  counts[issue] = (counts[issue] ?? 0) + amount;
}

function createWindow(round: Round): RoundWindow {
  const startTick = typeof round.startTick === "number" ? round.startTick : null;
  const endTick = typeof round.endTick === "number" ? round.endTick : null;
  const freezeEndTick = typeof round.freezeEndTick === "number" ? round.freezeEndTick : null;
  const eventEligible = startTick !== null && endTick !== null;
  const includes = (tick: number): boolean =>
    eventEligible && tick >= (startTick as number) && tick <= (endTick as number);
  const excludedEventCount = eventEligible
    ? round.events.reduce((count, event) => count + (includes(event.tick) ? 0 : 1), 0)
    : 0;
  return { startTick, endTick, freezeEndTick, eventEligible, excludedEventCount, includes };
}

function selectSnapshot(round: Round): { snapshot: RoundStateSnapshot; degraded: boolean } | null {
  for (let index = 0; index < rosterBoundaryPreference.length; index++) {
    const boundary = rosterBoundaryPreference[index];
    const snapshot = round.stateSnapshots?.find(candidate => candidate.boundary === boundary);
    if (snapshot?.availability === "observed") return { snapshot, degraded: index > 0 };
  }
  return null;
}

const emptyRoster: RoundRoster = Object.freeze({
  boundary: null,
  tick: null,
  available: false,
  degraded: false,
  unidentifiedPlayerCount: 0,
  entries: Object.freeze([]) as readonly RoundRosterEntry[],
  state: () => absentState,
});

function createRoster(round: Round): RoundRoster {
  const selection = selectSnapshot(round);
  if (!selection) return emptyRoster;
  const { snapshot, degraded } = selection;
  const players = new Map(snapshot.players.map(state => [state.steamId, state]));
  const entries: RoundRosterEntry[] = snapshot.players.map(state => ({
    steamId: state.steamId,
    side: state.side === "Unknown" ? null : state.side,
    participant: state.participant,
    alive: state.alive,
  }));
  return {
    boundary: snapshot.boundary,
    tick: snapshot.tick,
    available: true,
    degraded,
    unidentifiedPlayerCount: snapshot.unidentifiedPlayerCount,
    entries,
    state: (steamId: string): PlayerRoundState => {
      const state = players.get(steamId);
      if (!state) return absentState;
      return {
        inRoster: true,
        side: state.side === "Unknown" ? null : state.side,
        participant: state.participant,
        alive: state.alive,
      };
    },
  };
}

const unobservedEndState: RoundEndState = Object.freeze({
  observed: false,
  tick: null,
  unidentifiedPlayerCount: 0,
  hasRow: () => false,
  alive: () => null,
});

function createEndState(round: Round): RoundEndState {
  const snapshot = round.stateSnapshots?.find(
    candidate => candidate.boundary === "end" && candidate.availability === "observed",
  );
  if (!snapshot) {
    const tick = typeof round.endTick === "number" ? round.endTick : null;
    return { ...unobservedEndState, tick };
  }
  const players = new Map(snapshot.players.map(state => [state.steamId, state.alive]));
  return {
    observed: true,
    tick: snapshot.tick,
    unidentifiedPlayerCount: snapshot.unidentifiedPlayerCount,
    hasRow: (steamId: string) => players.has(steamId),
    alive: (steamId: string) => players.get(steamId) ?? null,
  };
}

function buildRoundCoverage(round: Round): RoundCoverage {
  const window = createWindow(round);
  const roster = createRoster(round);
  const endState = createEndState(round);
  const issues: CoverageIssue[] = [];
  if (window.startTick === null) issues.push("round-start-missing");
  if (window.endTick === null) issues.push("round-end-missing");
  if (window.freezeEndTick === null) issues.push("freeze-end-missing");
  if (!roster.available) issues.push("roster-snapshot-unavailable");
  else if (roster.degraded) issues.push("roster-snapshot-fallback-start");
  if (roster.available && roster.unidentifiedPlayerCount > 0) issues.push("roster-unidentified-players");
  const events = window.eventEligible ? round.events.filter(event => window.includes(event.tick)) : [];
  const lifecycleEvents = window.eventEligible
    ? (round.playerLifecycle ?? []).filter(event => window.includes(event.tick))
    : [];
  return {
    number: round.number,
    window,
    roster,
    endState,
    winner: round.winner === "CT" || round.winner === "T" ? round.winner : null,
    issues,
    eventsInWindow: () => events,
    lifecycleEvents,
    playerState: (steamId: string) => roster.state(steamId),
    playsIn: (steamId: string) => window.eventEligible && roster.state(steamId).participant === true,
  };
}

/** Build the shared eligibility context every metric must consume. */
export function buildCoverage(match: Match): MatchCoverage {
  const rounds = match.rounds.map(buildRoundCoverage);
  const eventEligibleRounds = rounds.filter(round => round.window.eventEligible);
  const baseIssues = createIssueCounts();
  for (const round of rounds) {
    for (const issue of round.issues) baseIssues[issue]++;
    baseIssues["post-round-events-excluded"] += round.window.excludedEventCount;
  }
  for (const player of match.players) {
    for (const round of rounds) {
      if (!round.roster.available) continue;
      const state = round.playerState(player.steamId);
      if (!state.inRoster) baseIssues["player-not-in-roster"]++;
      else {
        if (state.side === null) baseIssues["player-side-unknown"]++;
        if (state.participant === null) baseIssues["player-participation-unknown"]++;
        if (state.alive === null) baseIssues["player-alive-unknown"]++;
      }
    }
  }
  const byNumber = new Map(rounds.map(round => [round.number, round]));
  return {
    rounds,
    eventEligibleRounds,
    baseIssues,
    round: (number: number) => byNumber.get(number),
    summary: (extra?: Partial<Record<CoverageIssue, number>>): CoverageSummary => {
      const issues = { ...baseIssues };
      if (extra) {
        for (const issue of coverageIssueTypes) issues[issue] += extra[issue] ?? 0;
      }
      const severity: Record<IssueSeverity, number> = {
        unavailable: 0, ambiguous: 0, degraded: 0, informational: 0,
      };
      for (const issue of coverageIssueTypes) severity[coverageIssueSeverity[issue]] += issues[issue];
      return {
        totalRounds: rounds.length,
        eventEligibleRounds: eventEligibleRounds.length,
        rosterResolvedRounds: rounds.reduce((count, round) => count + (round.roster.available ? 1 : 0), 0),
        issues,
        severity,
        rounds: rounds.map(round => ({
          number: round.number,
          eventEligible: round.window.eventEligible,
          startTick: round.window.startTick,
          endTick: round.window.endTick,
          rosterBoundary: round.roster.boundary,
          rosterDegraded: round.roster.degraded,
          unidentifiedPlayerCount: round.roster.unidentifiedPlayerCount,
          excludedEventCount: round.window.excludedEventCount,
          issues: [...round.issues],
        })),
      };
    },
  };
}

/** A kill with an identified killer and two known, opposing sides; excludes confirmed teamkills. */
export function isIdentifiedEnemyKill(kill: KillEvent): boolean {
  return kill.killer !== "world"
    && kill.killerSide !== undefined && kill.killerSide !== "Unknown"
    && kill.victimSide !== undefined && kill.victimSide !== "Unknown"
    && kill.killerSide !== kill.victimSide
    && kill.teamkill !== true;
}

/** Kill credited to a player: attacker match, confirmed teamkills removed. */
export function isEligibleKill(kill: KillEvent, killer: string): boolean {
  return kill.killer === killer && kill.teamkill !== true;
}

/**
 * Assist credited to a player.
 *
 * The demo reports the last teammate who damaged the victim even when that
 * player is on the victim's side (friendly fire), so an assist is only counted
 * when the reported assister shares the killer's known side on an enemy kill.
 */
export function isEligibleAssist(kill: KillEvent, assister: string): boolean {
  if (kill.assister !== assister || assister === kill.killer) return false;
  if (!isIdentifiedEnemyKill(kill)) return false;
  return kill.assisterSide !== undefined && kill.assisterSide !== "Unknown"
    && kill.assisterSide === kill.killerSide;
}

/** Damage credited to a player: attacker match, both sides known and opposing (friendly/self removed). */
export function isEligibleDamage(damage: DamageEvent, attacker: string): boolean {
  return damage.attacker === attacker
    && damage.attackerSide !== "Unknown" && damage.victimSide !== "Unknown"
    && damage.attackerSide !== damage.victimSide;
}
