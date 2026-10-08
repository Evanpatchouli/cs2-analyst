import type { Round, UtilityEvent, TeamSide } from "@cs2-analyst/match-model";
import type { UtilityDirectOutcome, UtilityLayerCoverage, UtilityReason } from "./utility-contracts.js";
import { isImpactId, isImpactSide, isImpactTick } from "./alive-state.js";

export function utilityLayer(reasons: Iterable<UtilityReason> = [], unavailable = false): UtilityLayerCoverage {
  const rows = [...new Set(reasons)].sort();
  return { status: unavailable ? "unavailable" : rows.length ? "partial" : "complete", reasons: rows };
}
const weapon = (value?: string) => value?.toLowerCase().replace(/^weapon_/, "");
const entity = (value?: number) => Number.isSafeInteger(value) && value! >= 0;
const relation = (actor: UtilityEvent, victim: string, attackerSide: TeamSide, victimSide: TeamSide) => {
  if (victim === actor.thrower) return "self" as const;
  if (!isImpactSide(actor.throwerSide) || attackerSide !== actor.throwerSide || !isImpactSide(victimSide)) return "unknown" as const;
  return victimSide === actor.throwerSide ? "teammate" as const : "enemy" as const;
};
/** No release matching, nearest tick, time window or fire attribution. */
export function utilityOutcome(round: Round, effect: UtilityEvent, eligible: boolean, sideConflict = false): { outcome: UtilityDirectOutcome; coverage: UtilityLayerCoverage } {
  const reasons = new Set<UtilityReason>();
  const actorKnown = isImpactId(effect.thrower);
  if (!eligible) reasons.add("event-outside-round");
  if (!actorKnown) reasons.add("thrower-unidentified");
  const unavailable = !eligible || !actorKnown;
  if (!isImpactSide(effect.throwerSide)) reasons.add("thrower-side-unknown");
  if (sideConflict) reasons.add("thrower-side-conflict");
  const ref = (type: "damage" | "flash", tick: number, eventIndex: number) => ({ round: round.number, type, tick, eventIndex });
  const allEffects = round.events.filter((e): e is UtilityEvent => e.type === "utility");
  if (effect.utility === "fire") return { outcome: { kind: "fire", reportedEnemyDamage: null, linkage: "unavailable" }, coverage: utilityLayer(["effect-outcome-link-unavailable"], true) };
  if (effect.utility === "smoke" || effect.utility === "decoy") return { outcome: { kind: effect.utility, linkage: "not-applicable" }, coverage: utilityLayer() };
  if (effect.utility === "hegrenade") {
    const damageEvents: Extract<UtilityDirectOutcome, { kind: "he" }>["damageEvents"] = [];
    const candidates = (tick: number) => allEffects.filter(e => e.utility === "hegrenade" && (e.thrower === effect.thrower || !isImpactId(e.thrower)) && e.tick === tick);
    const ambiguous = candidates(effect.tick).length !== 1;
    if (ambiguous) reasons.add("damage-link-ambiguous");
    for (const [eventIndex, d] of round.events.entries()) {
      if (d.type !== "damage" || (d.attacker !== effect.thrower && d.attacker !== null)) continue;
      // Missing weapon/actor can conceal an effect outcome. Never manufacture complete zero.
      if (!d.weapon || (weapon(d.weapon) === "hegrenade" && (!isImpactTick(d.tick) || d.attacker === null || candidates(d.tick).length !== 1))) reasons.add("damage-link-ambiguous");
      if (unavailable || ambiguous
        || weapon(d.weapon) !== "hegrenade" || d.attacker !== effect.thrower || d.tick !== effect.tick) continue;
      if (!isImpactId(d.victim) || !Number.isFinite(d.healthDamage) || d.healthDamage < 0) { reasons.add("outcome-value-invalid"); continue; }
      const sideRelation = sideConflict && d.victim !== effect.thrower ? "unknown" : relation(effect, d.victim, d.attackerSide, d.victimSide);
      if (sideRelation === "unknown") reasons.add("outcome-side-unknown");
      damageEvents.push({ eventRef: ref("damage", d.tick, eventIndex), victimId: d.victim, reportedHealthDamage: d.healthDamage, sideRelation });
    }
    const enemy = damageEvents.filter(d => d.sideRelation === "enemy");
    const reportedEnemyDamage = enemy.reduce((n, d) => n + d.reportedHealthDamage, 0);
    if (!Number.isFinite(reportedEnemyDamage)) reasons.add("outcome-value-invalid");
    const coverage = utilityLayer(reasons, unavailable || ambiguous);
    return { outcome: { kind: "he", damageEvents, reportedEnemyDamage: coverage.status === "unavailable" || !Number.isFinite(reportedEnemyDamage) ? null : reportedEnemyDamage,
      damagedEnemyIds: [...new Set(enemy.filter(d => d.reportedHealthDamage > 0).map(d => d.victimId))].sort(),
      linkage: coverage.status === "complete" ? "exact" : coverage.status }, coverage };
  }
  const outcome: Extract<UtilityDirectOutcome, { kind: "flash" }> = { kind: "flash", enemyEffects: [], teammateEffects: [], selfEffects: [], unknownEffects: [],
    linkage: "unavailable", confirmedFlashAssists: null, assistLinkage: "unavailable" };
  if (!entity(effect.entityId)) reasons.add("entity-id-missing");
  const unique = entity(effect.entityId) && allEffects.filter(e => e.utility === "flashbang" && e.entityId === effect.entityId).length === 1;
  if (entity(effect.entityId) && !unique) { reasons.add("entity-id-ambiguous"); reasons.add("flash-link-ambiguous"); }
  for (const [eventIndex, f] of round.events.entries()) {
    if (f.type !== "flash") continue;
    if (!entity(f.entityId) && (f.attacker === effect.thrower || f.attacker === null)) reasons.add("flash-link-ambiguous");
    if (!unique || unavailable || f.entityId !== effect.entityId) continue;
    if (f.attacker !== effect.thrower || !isImpactTick(f.tick)) { reasons.add("flash-link-ambiguous"); continue; }
    if (!isImpactId(f.victim) || !Number.isFinite(f.blindDurationSeconds) || f.blindDurationSeconds < 0) { reasons.add("outcome-value-invalid"); continue; }
    const sideRelation = sideConflict && f.victim !== effect.thrower ? "unknown" : relation(effect, f.victim, f.attackerSide, f.victimSide);
    if (sideRelation === "unknown") reasons.add("outcome-side-unknown");
    const key = sideRelation === "enemy" ? "enemyEffects" : sideRelation === "teammate" ? "teammateEffects" : sideRelation === "self" ? "selfEffects" : "unknownEffects";
    outcome[key].push({ eventRef: ref("flash", f.tick, eventIndex), victimId: f.victim, tick: f.tick, rawBlindDurationSeconds: f.blindDurationSeconds });
  }
  const coverage = utilityLayer(reasons, unavailable || !unique);
  outcome.linkage = coverage.status === "complete" ? "exact" : coverage.status;
  return { outcome, coverage };
}
