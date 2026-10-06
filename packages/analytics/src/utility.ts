import type { DamageEvent, FlashEvent, KillEvent, UtilityEvent, WeaponFireEvent } from "@cs2-coach/match-model";

import { isEligibleAssist, isEligibleDamage, type MatchCoverage } from "./coverage.js";
import type { DamageLedger } from "./damage.js";

export type GrenadeKind = "hegrenade" | "smoke" | "flashbang" | "fire" | "decoy";
export type UtilityIssue = "window-unavailable" | "participation-unconfirmed" | "release-same-tick-ambiguous"
  | "damage-weapon-missing" | "damage-side-unknown" | "damage-loss-unresolved"
  | "flash-side-unknown" | "flash-assist-flag-missing" | "actor-unidentified"
  | "flash-assist-side-unknown" | "roster-unidentified-players" | "flash-assist-actor-unidentified"
  | "flash-duration-unverified" | "flash-overlap-possible" | "flash-clock-unavailable";
export interface UtilityEvidence<T> { round: number; event: T }
export interface UtilityDamageMetrics {
  reportedEnemyDamage: number;
  /** Confirmed subset; inspect complete before treating it as a total. */
  resolvedEnemyDamage: number;
  enemyDamage: number | null;
  complete: boolean;
  evidence: (UtilityEvidence<DamageEvent> & { effectiveLoss: number | null })[];
}
export interface FlashMetrics {
  /** Victim effects, including zero-duration rows; never grenade throws. */
  count: number;
  complete: boolean;
  /** Raw event-duration sum, NOT actual continuous blind time. */
  reportedDurationSeconds: number;
  /** P2.1 lacks verified reset/expiry semantics; no invented duration. */
  blindDurationSeconds: number | null;
  durationComplete: boolean;
  effectiveCount: number | null;
  evidence: UtilityEvidence<FlashEvent>[];
}
export interface UtilityMetrics {
  throws: {
    /** Release rows only; effect lifecycle stages never contribute. */
    observed: Record<GrenadeKind, number>;
    counts: Record<GrenadeKind, number | null>;
    molotov: number | null;
    incendiary: number | null;
    complete: boolean;
    evidence: (UtilityEvidence<WeaponFireEvent> & { kind: GrenadeKind })[];
  };
  he: UtilityDamageMetrics;
  fire: UtilityDamageMetrics;
  flash: {
    enemy: FlashMetrics;
    teammate: FlashMetrics;
    self: FlashMetrics;
    assists: number | null;
    observedAssists: number;
    assistsComplete: boolean;
    assistEvidence: UtilityEvidence<KillEvent>[];
    effectiveThresholdSeconds: number | null;
  };
  /** Effect evidence is preserved independently, including unattributed fire type. */
  effects: UtilityEvidence<UtilityEvent>[];
  coverage: { complete: boolean; issues: Partial<Record<UtilityIssue, number>> };
}

/** Explicit catalog of verified domain weapon identifiers, not fuzzy substring matching. */
export function classifyUtilityWeapon(weapon: string | undefined): GrenadeKind | null {
  switch (weapon?.replace(/^weapon_/, "")) {
    case "hegrenade": return "hegrenade";
    case "smokegrenade": return "smoke";
    case "flashbang": return "flashbang";
    case "molotov": case "incgrenade": case "inferno": return "fire";
    case "decoy": return "decoy";
    default: return null;
  }
}

const damageMetrics = (): UtilityDamageMetrics => ({
  reportedEnemyDamage: 0, resolvedEnemyDamage: 0, enemyDamage: null, complete: true, evidence: [],
});
const flashMetrics = (): FlashMetrics => ({
  count: 0, complete: true, reportedDurationSeconds: 0, blindDurationSeconds: null,
  durationComplete: false, effectiveCount: null, evidence: [],
});

/** Compute observed utility evidence on the shared formal windows and participation policy. */
export function summarizeUtility(
  player: string, coverage: MatchCoverage, ledgers: ReadonlyMap<number, DamageLedger>,
  tickRate: number | undefined, effectiveThresholdSeconds?: number,
): UtilityMetrics {
  if (effectiveThresholdSeconds !== undefined
    && (!Number.isFinite(effectiveThresholdSeconds) || effectiveThresholdSeconds < 0)) {
    throw new RangeError("effectiveFlashThresholdSeconds must be finite and nonnegative");
  }
  const observed = { hegrenade: 0, smoke: 0, flashbang: 0, fire: 0, decoy: 0 };
  const result: UtilityMetrics = {
    throws: { observed, counts: { ...observed }, molotov: 0, incendiary: 0, complete: true, evidence: [] },
    he: damageMetrics(), fire: damageMetrics(),
    flash: { enemy: flashMetrics(), teammate: flashMetrics(), self: flashMetrics(),
      assists: null, observedAssists: 0, assistsComplete: true, assistEvidence: [],
      effectiveThresholdSeconds: effectiveThresholdSeconds ?? null },
    effects: [], coverage: { complete: true, issues: {} },
  };
  const groups = [result.flash.enemy, result.flash.teammate, result.flash.self];
  const issue = (key: UtilityIssue): void => {
    result.coverage.issues[key] = (result.coverage.issues[key] ?? 0) + 1;
  };
  const unavailable = (): void => {
    result.throws.complete = result.he.complete = result.fire.complete = result.flash.assistsComplete = false;
    for (const group of groups) group.complete = false;
  };
  const ambiguousKinds = new Set<GrenadeKind>();
  let molotov = 0, incendiary = 0;
  const reliableClock = typeof tickRate === "number" && Number.isFinite(tickRate) && tickRate > 0;
  for (const round of coverage.rounds) {
    if (!round.window.eventEligible) { issue("window-unavailable"); unavailable(); continue; }
    if (!round.playsIn(player)) { issue("participation-unconfirmed"); unavailable(); continue; }
    if (round.roster.unidentifiedPlayerCount > 0) {
      issue("roster-unidentified-players"); unavailable();
    }
    const releases = new Set<string>();
    const flashes = round.eventsInWindow().filter((e): e is FlashEvent => e.type === "flash");
    for (const event of round.eventsInWindow()) {
      if (event.type === "kill" && event.assistedFlash === true && !event.assister
        && event.killer !== player && event.killer !== event.victim && event.teamkill !== true) {
        issue("flash-assist-actor-unidentified"); result.flash.assistsComplete = false;
      }
      if ((event.type === "flash" && event.attacker === null)
        || (event.type === "utility" && event.thrower === null)
        || (event.type === "damage" && event.attacker === null && classifyUtilityWeapon(event.weapon))) {
        issue("actor-unidentified"); unavailable();
      }
      if (event.type === "weapon_fire" && event.shooter === player) {
        // inferno is an effect/damage identifier, never a release identifier.
        const kind = event.weapon.replace(/^weapon_/, "") === "inferno" ? null : classifyUtilityWeapon(event.weapon);
        if (!kind) continue;
        const key = `${event.tick}:${kind}`;
        if (releases.has(key)) { ambiguousKinds.add(kind); issue("release-same-tick-ambiguous"); }
        releases.add(key);
        observed[kind]++;
        if (event.weapon.replace(/^weapon_/, "") === "molotov") molotov++;
        if (event.weapon.replace(/^weapon_/, "") === "incgrenade") incendiary++;
        result.throws.evidence.push({ round: round.number, event, kind });
      } else if (event.type === "utility" && event.thrower === player) {
        result.effects.push({ round: round.number, event });
      } else if (event.type === "damage" && event.attacker === player) {
        if (!event.weapon) { issue("damage-weapon-missing"); result.he.complete = result.fire.complete = false; continue; }
        const kind = classifyUtilityWeapon(event.weapon);
        if (kind !== "fire" && kind !== "hegrenade") continue;
        const metric = kind === "fire" ? result.fire : result.he;
        if (event.attackerSide === "Unknown" || event.victimSide === "Unknown") {
          issue("damage-side-unknown"); metric.complete = false; continue;
        }
        if (event.victim === player || !isEligibleDamage(event, player)) continue;
        const effectiveLoss = ledgers.get(round.number)?.loss(event) ?? null;
        metric.evidence.push({ round: round.number, event, effectiveLoss });
        metric.reportedEnemyDamage += event.healthDamage;
        if (effectiveLoss === null) { issue("damage-loss-unresolved"); metric.complete = false; }
        else metric.resolvedEnemyDamage += effectiveLoss;
      } else if (event.type === "flash" && event.attacker === player) {
        let metric: FlashMetrics;
        if (event.victim === player) metric = result.flash.self;
        else if (event.attackerSide === "Unknown" || event.victimSide === "Unknown") {
          issue("flash-side-unknown"); result.flash.enemy.complete = result.flash.teammate.complete = false; continue;
        } else metric = event.attackerSide === event.victimSide ? result.flash.teammate : result.flash.enemy;
        metric.count++;
        metric.reportedDurationSeconds += event.blindDurationSeconds;
        metric.evidence.push({ round: round.number, event });
        if (event.blindDurationSeconds > 0) {
          issue("flash-duration-unverified");
          if (!reliableClock) issue("flash-clock-unavailable");
          else if (flashes.some(other => other !== event && other.victim === event.victim
            && other.blindDurationSeconds > 0
            && other.tick <= event.tick
            && (other.tick === event.tick || other.tick + other.blindDurationSeconds * tickRate! > event.tick))) {
            // Diagnostic candidate interval only; also considers other throwers.
            issue("flash-overlap-possible");
          }
        }
      } else if (event.type === "kill" && event.assister === player) {
        if (event.assistedFlash === undefined) {
          issue("flash-assist-flag-missing"); result.flash.assistsComplete = false;
        } else if (event.assistedFlash && (event.killerSide === undefined || event.killerSide === "Unknown"
          || event.victimSide === undefined || event.victimSide === "Unknown"
          || event.assisterSide === undefined || event.assisterSide === "Unknown")) {
          issue("flash-assist-side-unknown"); result.flash.assistsComplete = false;
        } else if (event.assistedFlash && isEligibleAssist(event, player)) {
          result.flash.observedAssists++;
          result.flash.assistEvidence.push({ round: round.number, event });
        }
      }
    }
  }
  for (const kind of Object.keys(observed) as GrenadeKind[]) {
    result.throws.counts[kind] = result.throws.complete && !ambiguousKinds.has(kind) ? observed[kind] : null;
  }
  result.throws.molotov = result.throws.complete && !ambiguousKinds.has("fire") ? molotov : null;
  result.throws.incendiary = result.throws.complete && !ambiguousKinds.has("fire") ? incendiary : null;
  result.throws.complete &&= ambiguousKinds.size === 0;
  for (const metric of [result.he, result.fire]) metric.enemyDamage = metric.complete ? metric.resolvedEnemyDamage : null;
  for (const metric of groups) {
    metric.durationComplete = metric.complete && metric.reportedDurationSeconds === 0;
    metric.blindDurationSeconds = metric.durationComplete ? 0 : null;
    metric.effectiveCount = effectiveThresholdSeconds !== undefined && metric.complete
      ? metric.evidence.filter(({ event }) => event.blindDurationSeconds >= effectiveThresholdSeconds).length : null;
  }
  result.flash.assists = result.flash.assistsComplete ? result.flash.observedAssists : null;
  result.coverage.complete = result.throws.complete && result.he.complete && result.fire.complete
    && result.flash.assistsComplete && groups.every(group => group.complete && group.durationComplete);
  return result;
}
