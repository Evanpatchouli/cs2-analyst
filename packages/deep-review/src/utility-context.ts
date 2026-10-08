import type { Match, MatchSpatialEvidence, Round, SpatialEvidence } from "@cs2-analyst/match-model";
import type { KillImpactAnalysis, RoundAliveState, SideAliveCounts } from "./impact-contracts.js";
import type { UtilityBombState, UtilityContextAnalysis, UtilityCoverage, UtilityEffectContext, UtilityLayerCoverage, UtilityReason } from "./utility-contracts.js";
import { hasRoundWindow, isImpactId, isImpactSide, isImpactTick, perspective, resolveRoundAliveState } from "./alive-state.js";
import { utilityLayer, utilityOutcome } from "./utility-outcomes.js";

const key = (ref: { round: number; type: string; tick: number; eventIndex: number }) => JSON.stringify([ref.round, ref.type, ref.tick, ref.eventIndex]);
const transitions: Record<string, UtilityBombState> = { plant_start: "planting", planted: "planted", defuse_start: "defusing", defused: "resolved", exploded: "resolved" };
const isJsonValue = (value: unknown): boolean => value === null || typeof value === "string" || typeof value === "boolean"
  || typeof value === "number" && Number.isFinite(value)
  || typeof value === "object" && value !== null && Object.values(value).every(isJsonValue);
// JSON object property order is not domain evidence. Array order remains contractual.
const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) => v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
function bombAt(round: Round, tick: number, eligible: boolean) {
  if (!eligible) return { state: "unknown" as UtilityBombState, before: null, actions: [], coverage: utilityLayer(["bomb-state-unavailable"], true) };
  if (round.events.some(e => e.type === "bomb" && transitions[e.action] && !isImpactTick(e.tick)))
    return { state: "unknown" as UtilityBombState, before: null, actions: [], coverage: utilityLayer(["bomb-state-unavailable"], true) };
  const events = round.events.filter(e => e.type === "bomb" && transitions[e.action] && isImpactTick(e.tick) && e.tick >= round.startTick! && e.tick <= tick)
    .sort((a, b) => a.tick - b.tick);
  let state: UtilityBombState = "pre-plant";
  for (let i = 0; i < events.length;) {
    const groupTick = events[i].tick, actions: string[] = [];
    while (i < events.length && events[i].tick === groupTick) { const e = events[i++]; if (e.type === "bomb") actions.push(e.action); }
    actions.sort();
    if (groupTick === tick) return { state: "unknown" as UtilityBombState, before: state, actions, coverage: utilityLayer(["bomb-state-ambiguous"]) };
    // Different lifecycle actions at one tick lack order. A later unambiguous observation can restore state.
    state = new Set(actions).size === 1 ? transitions[actions[0]] : "unknown";
  }
  return { state, before: null, actions: [], coverage: state === "unknown" ? utilityLayer(["bomb-state-unavailable"], true) : utilityLayer() };
}
function summarize(rows: UtilityLayerCoverage[]): UtilityLayerCoverage {
  return { status: rows.length && rows.every(c => c.status === "complete") ? "complete" : !rows.length || rows.every(c => c.status === "unavailable") ? "unavailable" : "partial",
    reasons: [...new Set(rows.flatMap(c => c.reasons))].sort() };
}
/** Effect context only. Inputs remain untouched; no throw trajectory or causal interpretation. */
export function analyzeUtilityContext(match: Match, spatial?: MatchSpatialEvidence, killImpact?: KillImpactAnalysis): UtilityContextAnalysis {
  const spatialIndex = new Map<string, SpatialEvidence[]>();
  if (spatial?.matchId === match.id) for (const e of spatial.events) if (e.eventRef.type === "utility") {
    const k = key(e.eventRef), rows = spatialIndex.get(k) ?? []; rows.push(e); spatialIndex.set(k, rows);
  }
  const effects: UtilityEffectContext[] = [];
  for (const round of match.rounds) {
    const states = killImpact?.matchId === match.id ? killImpact.rounds.filter(s => s.round === round.number) : [];
    // Reject stale/mismatched timelines rather than treating them as current truth.
    const expected = states.length === 1 ? resolveRoundAliveState(round) : null;
    const state: RoundAliveState | undefined = states.length === 1 && isJsonValue(states[0]) && canonical(states[0]) === canonical(expected) ? states[0] : undefined;
    for (const [eventIndex, e] of round.events.entries()) {
      if (e.type !== "utility") continue;
      // An invalid identity cannot be serialized faithfully; never replace its tick with null/a nearby event.
      if (!isImpactTick(e.tick) || !Number.isSafeInteger(round.number) || round.number < 1)
        throw new RangeError("Utility effect requires a nonnegative safe-integer tick and positive safe-integer round");
      const eligible = hasRoundWindow(round) && isImpactTick(e.tick) && e.tick >= round.startTick! && e.tick <= round.endTick!;
      const actorReasons: UtilityReason[] = [];
      const throwerId = isImpactId(e.thrower) ? e.thrower : null;
      if (!throwerId) actorReasons.push("thrower-unidentified");
      if (!isImpactSide(e.throwerSide)) actorReasons.push("thrower-side-unknown");
      const sideConflict = !!state?.players.some(p => p.playerId === throwerId && isImpactSide(e.throwerSide) && p.side !== e.throwerSide);
      if (sideConflict) actorReasons.push("thrower-side-conflict");
      const position = e.position && [e.position.x, e.position.y, e.position.z].every(Number.isFinite) ? { ...e.position } : null;
      const bomb = bombAt(round, e.tick, eligible), direct = utilityOutcome(round, e, eligible, sideConflict);
      const roundReasons = new Set<UtilityReason>();
      const reliableState = eligible && state?.coverage.status !== "unavailable" && !!state?.baseline && e.tick >= state.baseline.tick;
      if (!reliableState || !isImpactSide(e.throwerSide) || sideConflict) roundReasons.add("round-state-unavailable");
      if (sideConflict) roundReasons.add("thrower-side-conflict");
      if (reliableState && state!.coverage.status === "partial") roundReasons.add("round-state-partial");
      if (!eligible) roundReasons.add("event-outside-round");
      const group = reliableState ? state!.groups.find(g => g.tick === e.tick) : undefined;
      if (group) roundReasons.add("same-tick-alive-ambiguous");
      const duration = hasRoundWindow(round) ? (round.endTick! - round.startTick!) / match.tickRate! : NaN;
      const clock = Number.isFinite(match.tickRate) && match.tickRate! > 0 && Number.isFinite(duration);
      if (!clock) roundReasons.add("tick-rate-unreliable");
      const freezeValid = isImpactTick(round.freezeEndTick) && hasRoundWindow(round) && round.freezeEndTick >= round.startTick! && round.freezeEndTick <= round.endTick! && e.tick >= round.freezeEndTick;
      if (!freezeValid) roundReasons.add("timing-boundary-anomaly");
      const counts = reliableState && isImpactSide(e.throwerSide) && !sideConflict && !group ? perspective({ CT: state!.players.filter(p => p.side === "CT" && p.aliveAtBaseline && (p.deathTick === null || p.deathTick > e.tick)).length,
        T: state!.players.filter(p => p.side === "T" && p.aliveAtBaseline && (p.deathTick === null || p.deathTick > e.tick)).length }, e.throwerSide) : null;
      const atomic = (value: SideAliveCounts | null | undefined) => value && isImpactSide(e.throwerSide) && !sideConflict ? perspective(value, e.throwerSide) : null;
      const coverage: UtilityCoverage = { actorAttribution: utilityLayer(actorReasons, !throwerId), position: utilityLayer(position ? [] : ["effect-position-missing"], !position),
        roundState: utilityLayer(roundReasons, !reliableState || !isImpactSide(e.throwerSide) || sideConflict), bombContext: bomb.coverage, spatialContext: utilityLayer(), directOutcome: direct.coverage };
      const result: UtilityEffectContext = { effectRef: { round: round.number, type: "utility", tick: e.tick, eventIndex, utility: e.utility, action: e.action },
        throwerId, throwerSide: e.throwerSide, entityId: Number.isSafeInteger(e.entityId) && e.entityId! >= 0 ? e.entityId! : null, position,
        roundContext: { teamAlive: counts?.teamAlive ?? null, enemyAlive: counts?.enemyAlive ?? null, beforeAtomicGroup: atomic(group?.before), afterAtomicGroup: atomic(group?.after),
          bombState: bomb.state, bombBeforeSameTick: bomb.before, bombSameTickActions: bomb.actions,
          secondsFromRoundStart: clock && eligible ? (e.tick - round.startTick!) / match.tickRate! : null,
          secondsFromFreezeEnd: clock && eligible && freezeValid ? (e.tick - round.freezeEndTick!) / match.tickRate! : null },
        nearestEnemy: null, nearestTeammate: null, enemiesWithPosition: [], teammatesWithPosition: [], sameTickAliveAmbiguousIds: [], missingPositionPlayerIds: [], directOutcome: direct.outcome, coverage };
      const reasons = new Set<UtilityReason>();
      const evidence = spatialIndex.get(key(result.effectRef));
      let unavailable = false;
      if (!spatial) { reasons.add("spatial-not-provided"); unavailable = true; }
      else if (spatial.matchId !== match.id || (evidence?.length ?? 0) > 1) { reasons.add("spatial-link-conflict"); unavailable = true; }
      else if (!evidence?.length) { reasons.add("spatial-event-missing"); unavailable = true; }
      if (!position) { reasons.add("effect-position-missing"); unavailable = true; }
      if (!reliableState) { reasons.add("round-state-unavailable"); unavailable = true; }
      if (!throwerId) { reasons.add("thrower-unidentified"); unavailable = true; }
      if (!isImpactSide(e.throwerSide)) { reasons.add("thrower-side-unknown"); unavailable = true; }
      if (sideConflict) { reasons.add("thrower-side-conflict"); unavailable = true; }
      if (group) reasons.add("same-tick-alive-ambiguous");
      if (!unavailable && evidence?.length === 1) {
        const actors = evidence[0].participants.filter(p => p.role === "actor");
        if (actors.length !== 1 || actors[0].playerId !== throwerId) { reasons.add("spatial-link-conflict"); unavailable = true; }
        else for (const p of state!.players) {
          if (p.playerId === throwerId) continue;
          if (p.deathTick === e.tick) { result.sameTickAliveAmbiguousIds.push(p.playerId); reasons.add("same-tick-alive-ambiguous"); continue; }
          if (!p.aliveAtBaseline || (p.deathTick !== null && p.deathTick < e.tick)) continue;
          const rows = evidence[0].samples.filter(b => b.sample.playerId === p.playerId && b.sample.relation === "at-event" && b.sample.actualTick === e.tick && b.sample.requestedTick === e.tick);
          const sample = rows.length === 1 ? rows[0].sample : null, point = sample?.fields.position === "complete" ? sample.position : null;
          const horizontalDistance = point ? Math.hypot(point.x - position!.x, point.y - position!.y) : NaN;
          const verticalDelta = point ? Math.abs(point.z - position!.z) : NaN, directDistance = Math.hypot(horizontalDistance, verticalDelta);
          if (!point || ![horizontalDistance, verticalDelta, directDistance].every(Number.isFinite)) { result.missingPositionPlayerIds.push(p.playerId); reasons.add("player-position-missing"); continue; }
          const sideRelation = p.side === e.throwerSide ? "teammate" : "enemy";
          (sideRelation === "enemy" ? result.enemiesWithPosition : result.teammatesWithPosition).push({ playerId: p.playerId, sideRelation, horizontalDistance, verticalDelta, directDistance });
        }
        if (state!.coverage.status === "partial") reasons.add("round-state-partial");
      }
      for (const facts of [result.enemiesWithPosition, result.teammatesWithPosition]) facts.sort((a, b) => a.directDistance - b.directDistance || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
      result.sameTickAliveAmbiguousIds.sort(); result.missingPositionPlayerIds.sort();
      result.nearestEnemy = result.enemiesWithPosition[0] ?? null; result.nearestTeammate = result.teammatesWithPosition[0] ?? null;
      result.coverage.spatialContext = utilityLayer(reasons, unavailable);
      effects.push(result);
    }
  }
  effects.sort((a, b) => a.effectRef.round - b.effectRef.round || a.effectRef.tick - b.effectRef.tick || a.effectRef.eventIndex - b.effectRef.eventIndex);
  const n = (predicate: (e: UtilityEffectContext) => boolean) => effects.filter(predicate).length;
  const coverage = Object.fromEntries((["actorAttribution", "position", "roundState", "bombContext", "spatialContext", "directOutcome"] as const).map(k => [k, summarize(effects.map(e => e.coverage[k]))])) as UtilityCoverage;
  return { matchId: match.id, effects, coverage, diagnostics: { effectsTotal: effects.length,
    smokeEffects: n(e => e.effectRef.utility === "smoke"), heEffects: n(e => e.effectRef.utility === "hegrenade"), flashEffects: n(e => e.effectRef.utility === "flashbang"),
    fireEffects: n(e => e.effectRef.utility === "fire"), decoyEffects: n(e => e.effectRef.utility === "decoy"), effectsWithPosition: n(e => e.position !== null), effectsWithThrower: n(e => e.throwerId !== null),
    effectsWithCompleteSpatial: n(e => e.coverage.spatialContext.status === "complete"),
    heExactDamageLinked: n(e => e.directOutcome.kind === "he" && e.directOutcome.linkage === "exact" && e.directOutcome.damageEvents.length > 0),
    heUnlinked: n(e => e.directOutcome.kind === "he" && e.directOutcome.linkage !== "exact"),
    flashExactLinked: n(e => e.directOutcome.kind === "flash" && e.directOutcome.linkage === "exact"), flashAmbiguous: n(e => e.coverage.directOutcome.reasons.includes("flash-link-ambiguous")),
    fireDamageAttributionUnavailable: n(e => e.directOutcome.kind === "fire"), sameTickAliveAmbiguities: n(e => e.coverage.roundState.reasons.includes("same-tick-alive-ambiguous")),
    bombStateAmbiguities: n(e => e.coverage.bombContext.reasons.includes("bomb-state-ambiguous")) } };
}
