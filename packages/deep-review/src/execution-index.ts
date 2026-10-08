import type { Match } from "@cs2-analyst/match-model";
import type { Engagement, EngagementAnalysis, EngagementContact } from "./contracts.js";
import { hasRoundWindow, isImpactId, isImpactSide, isImpactTick } from "./alive-state.js";
import { contactRefKey } from "./spatial.js";
import { classifyContactWeapon } from "./weapons.js";

/** Validate semantic source fields, not object key order or imported spatial projections. */
export function executionContactIndex(match: Match, input?: EngagementAnalysis) {
  const contacts: EngagementContact[] = [], groups: Engagement[] = [], linked = new Map<string, string>();
  const roundReasons = new Map<number, string[]>();
  const expected = new Map<string, EngagementContact>(), sideByRef = new Map<string, [string, string]>();
  for (const r of match.rounds) {
    const reasons: string[] = [];
    for (const [eventIndex, e] of r.events.entries()) {
      if (e.type !== "damage" && e.type !== "kill" || classifyContactWeapon(e.weapon) === "utility") continue;
      if (!isImpactTick(e.tick)) { reasons.push("incomplete"); continue; }
      if (!hasRoundWindow(r) || e.tick < r.startTick! || e.tick > r.endTick!) continue;
      const actor = e.type === "kill" ? e.killer : e.attacker, side = e.type === "kill" ? e.killerSide : e.attackerSide;
      if (!isImpactId(actor) || !isImpactId(e.victim) || !isImpactSide(side) || !isImpactSide(e.victimSide)) { reasons.push("incomplete"); continue; }
      if (actor === e.victim || side === e.victimSide || (e.type === "kill" && e.teamkill === true)) continue;
      const eventRef = { round: r.number, type: e.type, tick: e.tick, eventIndex }, sourceKind = classifyContactWeapon(e.weapon);
      const key = contactRefKey(eventRef);
      expected.set(key, { eventRef, attackerId: actor, victimId: e.victim, weapon: e.weapon,
        sourceKind: sourceKind as EngagementContact["sourceKind"], fatal: e.type === "kill",
        ...(e.type === "damage" ? { reportedHealthDamage: e.healthDamage } : {}),
        coverage: { reasons: [] }, spatialCoverage: { evidencePresent: false, joinStatus: "not-provided", evidenceCoverage: null,
          actorAtEvent: null, targetAtEvent: null, actorBeforeEvent: null, targetBeforeEvent: null } });
      sideByRef.set(key, [side, e.victimSide]);
    }
    roundReasons.set(r.number, reasons);
  }
  contacts.push(...expected.values());
  contacts.sort((a, b) => a.eventRef.round - b.eventRef.round || a.eventRef.tick - b.eventRef.tick || a.eventRef.eventIndex - b.eventRef.eventIndex);
  const unavailable = !input || input.matchId !== match.id || !input.available;
  const reasons: string[] = unavailable ? ["unavailable"] : [];
  if (!input || input.matchId !== match.id) return { contacts, groups, linked, roundReasons, coverage: { status: "unavailable" as const, reasons } };
  const equivalent = (c: EngagementContact, e: EngagementContact | undefined) => !!e && c.attackerId === e.attackerId
    && c.victimId === e.victimId && c.fatal === e.fatal && c.weapon === e.weapon && c.sourceKind === e.sourceKind
    && (c.fatal || Object.is(c.reportedHealthDamage, e.reportedHealthDamage));
  const byRef = new Map<string, EngagementContact[]>(), membership = new Map<string, number>();
  for (const c of input.directContacts) { const key = contactRefKey(c.eventRef), rows = byRef.get(key) ?? []; rows.push(c); byRef.set(key, rows); }
  for (const g of input.engagements) for (const c of g.contacts) {
    const key = contactRefKey(c.eventRef); membership.set(key, (membership.get(key) ?? 0) + 1);
  }
  const validRefs = new Set<string>();
  for (const [key, rows] of byRef) {
    if (rows.length !== 1 || !equivalent(rows[0], expected.get(key))) { reasons.push("conflict"); continue; }
    validRefs.add(key);
  }
  for (const g of input.engagements) {
    const ids = [...new Set(g.contacts.flatMap(c => [c.attackerId, c.victimId]))].sort();
    const sides = new Map<string, Set<string>>();
    let valid = input.engagements.filter(other => other.id === g.id).length === 1 && !!g.id && g.contacts.length > 0;
    for (const c of g.contacts) {
      const key = contactRefKey(c.eventRef), original = expected.get(key);
      if (!validRefs.has(key) || membership.get(key) !== 1 || !equivalent(c, original) || c.eventRef.round !== g.round) { valid = false; continue; }
      const [a, b] = sideByRef.get(key)!;
      for (const [id, side] of [[c.attackerId, a], [c.victimId, b]]) {
        const set = sides.get(id) ?? new Set(); set.add(side); sides.set(id, set);
      }
    }
    if (JSON.stringify(ids) !== JSON.stringify([...g.participantIds].sort()) || [...sides.values()].some(s => s.size !== 1)) valid = false;
    if (!valid) { reasons.push("conflict"); continue; }
    groups.push({ ...g, participantIds: [...g.participantIds], contacts: g.contacts.map(c => expected.get(contactRefKey(c.eventRef))!) });
    for (const c of g.contacts) linked.set(contactRefKey(c.eventRef), g.id);
  }
  for (const [key, c] of expected) if (!validRefs.has(key) || input.available && !linked.has(key)) roundReasons.get(c.eventRef.round)!.push("incomplete");
  groups.sort((a, b) => a.round - b.round || a.startTick - b.startTick || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  contacts.sort((a, b) => a.eventRef.round - b.eventRef.round || a.eventRef.tick - b.eventRef.tick || a.eventRef.eventIndex - b.eventRef.eventIndex);
  return { contacts, groups, linked, roundReasons, coverage: { status: unavailable ? "unavailable" as const : reasons.length ? "partial" as const : "complete" as const, reasons } };
}
