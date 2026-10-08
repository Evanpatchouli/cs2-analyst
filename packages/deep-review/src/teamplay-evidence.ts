import type { Match, MatchSpatialEvidence, SpatialEvidence, SpatialSample } from "@cs2-analyst/match-model";
import type { ContactEventRef, Engagement, EngagementAnalysis, EngagementContact } from "./contracts.js";
import type { ImpactSide, RoundAliveState } from "./impact-contracts.js";
import type { TeamplayLayerCoverage, TeamplayReason, TeamplaySpatialContext } from "./teamplay-contracts.js";
import { isImpactId, isImpactSide, isImpactTick, hasRoundWindow } from "./alive-state.js";
import { contactRefKey } from "./spatial.js";
import { classifyContactWeapon } from "./weapons.js";

export const compareIds = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export const compareContacts = (a: EngagementContact, b: EngagementContact): number => a.eventRef.tick - b.eventRef.tick
  || compareIds(a.attackerId, b.attackerId) || a.eventRef.eventIndex - b.eventRef.eventIndex;
export function layer(reasons: Iterable<TeamplayReason> = [], unavailable = false): TeamplayLayerCoverage {
  const rows = [...new Set(reasons)].sort();
  return { status: unavailable ? "unavailable" : rows.length ? "partial" : "complete", reasons: rows };
}
export function summarizeLayers(rows: TeamplayLayerCoverage[]): TeamplayLayerCoverage {
  return { status: rows.length && rows.every(c => c.status === "complete") ? "complete"
    : !rows.length || rows.every(c => c.status === "unavailable") ? "unavailable" : "partial",
  reasons: [...new Set(rows.flatMap(c => c.reasons))].sort() };
}
export function aliveAt(state: RoundAliveState | undefined, id: string, tick: number): boolean | null {
  if (!state?.baseline || state.coverage.status === "unavailable" || tick < state.baseline.tick) return null;
  const p = state.players.find(p => p.playerId === id);
  if (!p || p.deathTick === tick) return null;
  return p.aliveAtBaseline && (p.deathTick === null || p.deathTick > tick);
}
export function stateCoverage(state: RoundAliveState | undefined): TeamplayLayerCoverage {
  return !state || state.coverage.status === "unavailable" ? layer(["round-state-unavailable", ...(state?.coverage.reasons ?? [])], true)
    : layer(state.coverage.reasons);
}

/** Validate original refs, identities and unique membership before using external analysis. */
export function teamplayContactIndex(match: Match, input?: EngagementAnalysis) {
  const contacts: EngagementContact[] = [], groups: Engagement[] = [];
  const sides = new Map<string, { attacker: ImpactSide; victim: ImpactSide }>();
  const byRef = new Map<string, EngagementContact[]>(), members = new Map<string, Engagement[]>();
  const reasons: TeamplayReason[] = [];
  const roundReasons = new Map<number, TeamplayReason[]>();
  for (const round of match.rounds) {
    const incomplete = round.events.some(e => {
      if ((e.type !== "damage" && e.type !== "kill") || classifyContactWeapon(e.weapon) === "utility") return false;
      if (!Number.isSafeInteger(e.tick) || e.tick < 0) return true;
      if (!hasRoundWindow(round) || e.tick < round.startTick! || e.tick > round.endTick!) return false;
      const actor = e.type === "kill" ? e.killer : e.attacker, side = e.type === "kill" ? e.killerSide : e.attackerSide;
      return !actor || !/^[1-9]\d*$/.test(actor) || !/^[1-9]\d*$/.test(e.victim) || !isImpactSide(side) || !isImpactSide(e.victimSide);
    });
    roundReasons.set(round.number, incomplete ? ["engagement-evidence-incomplete"] : []);
  }
  if (!input || input.matchId !== match.id) reasons.push(input ? "engagement-link-conflict" : "engagement-unavailable");
  else {
    for (const c of input.directContacts) {
      const key = contactRefKey(c.eventRef), rows = byRef.get(key) ?? [];
      rows.push(c); byRef.set(key, rows);
    }
    for (const g of input.engagements) for (const c of g.contacts) {
      const key = contactRefKey(c.eventRef), rows = members.get(key) ?? [];
      rows.push(g); members.set(key, rows);
    }
    for (const rows of byRef.values()) {
      const c = rows[0], r = c.eventRef;
      const round = match.rounds.find(round => round.number === r.round), e = round?.events[r.eventIndex];
      const attacker = e?.type === "kill" ? e.killer : e?.type === "damage" ? e.attacker : null;
      const side = e?.type === "kill" ? e.killerSide : e?.type === "damage" ? e.attackerSide : null;
      if (rows.length !== 1 || !round || !hasRoundWindow(round) || !Number.isSafeInteger(r.eventIndex) || r.eventIndex < 0
        || !isImpactTick(r.tick) || !isImpactId(c.attackerId) || !isImpactId(c.victimId)
        || !e || (e.type !== "kill" && e.type !== "damage") || e.type !== r.type || e.tick !== r.tick
        || r.tick < round.startTick! || r.tick > round.endTick! || attacker !== c.attackerId || e.victim !== c.victimId
        || !isImpactSide(side) || !isImpactSide(e.victimSide) || side === e.victimSide || c.attackerId === c.victimId
        || classifyContactWeapon(e.weapon) === "utility"
        || (e.type === "kill" && e.teamkill === true) || c.fatal !== (e.type === "kill")
        || (e.type === "damage" && c.reportedHealthDamage !== e.healthDamage)) {
        reasons.push("engagement-link-conflict"); continue;
      }
      contacts.push(c); sides.set(contactRefKey(r), { attacker: side, victim: e.victimSide });
    }
    for (const g of input.engagements) {
      const uniqueIds = input.engagements.filter(other => other.id === g.id).length === 1;
      const valid = uniqueIds && g.contacts.length > 0 && g.contacts.every(c => {
        const key = contactRefKey(c.eventRef), original = byRef.get(key);
        return sides.has(key) && members.get(key)?.length === 1 && original?.length === 1
          && JSON.stringify(original[0]) === JSON.stringify(c) && c.eventRef.round === g.round;
      });
      const ids = [...new Set(g.contacts.flatMap(c => [c.attackerId, c.victimId]))].sort(compareIds);
      if (!valid || JSON.stringify(ids) !== JSON.stringify([...g.participantIds].sort(compareIds))) { reasons.push("engagement-link-conflict"); continue; }
      const sideById = new Map<string, Set<ImpactSide>>();
      for (const c of g.contacts) for (const [id, side] of [[c.attackerId, sides.get(contactRefKey(c.eventRef))!.attacker],
        [c.victimId, sides.get(contactRefKey(c.eventRef))!.victim]] as const) {
        const set = sideById.get(id) ?? new Set<ImpactSide>(); set.add(side); sideById.set(id, set);
      }
      if ([...sideById.values()].some(s => s.size !== 1)) { reasons.push("engagement-link-conflict"); continue; }
      groups.push(g);
    }
  }
  contacts.sort((a, b) => a.eventRef.round - b.eventRef.round || compareContacts(a, b));
  groups.sort((a, b) => a.round - b.round || a.startTick - b.startTick || compareIds(a.id, b.id));
  const linked = new Map<string, string>();
  // An omitted eligible row must never manufacture negative response evidence.
  for (const round of match.rounds) if (hasRoundWindow(round)) for (const [eventIndex, e] of round.events.entries()) {
    if ((e.type !== "kill" && e.type !== "damage") || e.tick < round.startTick! || e.tick > round.endTick!
      || classifyContactWeapon(e.weapon) === "utility") continue;
    const attacker = e.type === "kill" ? e.killer : e.attacker, side = e.type === "kill" ? e.killerSide : e.attackerSide;
    if (!attacker || !/^[1-9]\d*$/.test(attacker) || !/^[1-9]\d*$/.test(e.victim) || attacker === e.victim
      || !isImpactSide(side) || !isImpactSide(e.victimSide) || side === e.victimSide || (e.type === "kill" && e.teamkill === true)) continue;
    if (!sides.has(contactRefKey({ round: round.number, type: e.type, tick: e.tick, eventIndex }))) reasons.push("engagement-evidence-incomplete");
  }
  for (const g of groups) for (const c of g.contacts) linked.set(contactRefKey(c.eventRef), g.id);
  if (input?.available) for (const c of contacts) if (!linked.has(contactRefKey(c.eventRef))) reasons.push("engagement-link-conflict");
  return { contacts, groups, sides, linked, roundReasons, coverage: layer(reasons, !input || input.matchId !== match.id || !input.available) };
}

/** Exact event and at-event samples only; entity is_alive never determines temporal order. */
export function teamplaySpatialJoin(matchId: string, spatial?: MatchSpatialEvidence) {
  const index = new Map<string, SpatialEvidence[]>();
  if (spatial?.matchId === matchId) for (const e of spatial.events) {
    if (e.eventRef.type !== "damage" && e.eventRef.type !== "kill") continue;
    const key = contactRefKey({ ...e.eventRef, type: e.eventRef.type }), rows = index.get(key) ?? []; rows.push(e); index.set(key, rows);
  }
  return (ref: ContactEventRef, playerId: string, state: RoundAliveState | undefined, actor: string | null, target: string): TeamplaySpatialContext => {
    const result: TeamplaySpatialContext = { eventRef: { ...ref }, nearestConfirmedAliveTeammate: null,
      sameTickAliveAmbiguousIds: [], incompletePositionTeammateIds: [], aliveConsistencyConflictIds: [], coverage: layer() };
    const reasons = new Set<TeamplayReason>();
    const finish = (unavailable = false) => { result.coverage = layer(reasons, unavailable); return result; };
    if (!spatial) { reasons.add("spatial-not-provided"); return finish(true); }
    if (spatial.matchId !== matchId) { reasons.add("spatial-link-conflict"); return finish(true); }
    const rows = index.get(contactRefKey(ref));
    if (!rows?.length) { reasons.add("spatial-event-missing"); return finish(true); }
    const e = rows[0];
    if (rows.length !== 1 || [["actor", actor], ["target", target]].some(([role, id]) => {
      const ps = e.participants.filter(p => p.role === role); return ps.length !== 1 || ps[0].playerId !== id;
    })) { reasons.add("spatial-link-conflict"); return finish(true); }
    if (!state || state.coverage.status === "unavailable" || !state.baseline || ref.tick < state.baseline.tick) {
      reasons.add("round-state-unavailable"); return finish(true);
    }
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) { reasons.add("player-state-ambiguous"); return finish(true); }
    const sample = (id: string): SpatialSample | null => {
      const samples = e.samples.filter(b => b.sample.playerId === id && b.sample.relation === "at-event");
      if (samples.length !== 1) return null;
      const s = samples[0].sample;
      return s.actualTick === ref.tick && s.requestedTick === ref.tick ? s : null;
    };
    const position = (s: SpatialSample | null) => s?.fields.position === "complete" && s.position
      && [s.position.x, s.position.y, s.position.z].every(Number.isFinite) ? s.position : null;
    const ownSample = sample(playerId), origin = position(ownSample);
    if (!origin) reasons.add("position-missing");
    const candidates = [];
    for (const p of state.players.filter(p => p.side === player.side && p.playerId !== playerId)) {
      if (p.deathTick === ref.tick) { result.sameTickAliveAmbiguousIds.push(p.playerId); reasons.add("same-tick-alive-ambiguous"); continue; }
      const alive = aliveAt(state, p.playerId, ref.tick), s = sample(p.playerId);
      if (s?.alive !== null && s?.alive !== undefined && alive !== null && s.alive !== alive) {
        result.aliveConsistencyConflictIds.push(p.playerId); reasons.add("spatial-alive-conflict");
      }
      if (alive !== true) continue;
      const point = position(s);
      if (!point) { result.incompletePositionTeammateIds.push(p.playerId); reasons.add("teammate-position-incomplete"); continue; }
      if (!origin) continue;
      const horizontalDistance = Math.hypot(origin.x - point.x, origin.y - point.y), verticalDelta = Math.abs(origin.z - point.z);
      const directDistance = Math.hypot(horizontalDistance, verticalDelta);
      if (![horizontalDistance, verticalDelta, directDistance].every(Number.isFinite)) {
        result.incompletePositionTeammateIds.push(p.playerId); reasons.add("teammate-position-incomplete"); continue;
      }
      candidates.push({ teammateId: p.playerId, horizontalDistance, verticalDelta, directDistance });
    }
    candidates.sort((a, b) => a.directDistance - b.directDistance || compareIds(a.teammateId, b.teammateId));
    result.nearestConfirmedAliveTeammate = candidates[0] ?? null;
    for (const ids of [result.sameTickAliveAmbiguousIds, result.incompletePositionTeammateIds, result.aliveConsistencyConflictIds]) ids.sort(compareIds);
    // A partial nearest fact is the nearest among complete observed positions, not a proven global minimum.
    return finish(!origin || (result.incompletePositionTeammateIds.length > 0 && !candidates.length));
  };
}
