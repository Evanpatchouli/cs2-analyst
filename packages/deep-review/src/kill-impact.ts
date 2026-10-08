import type { KillEvent, Match } from "@cs2-analyst/match-model";
import type { EngagementAnalysis } from "./contracts.js";
import type { ImpactCoverage, ImpactReason, KillImpact, KillImpactAnalysis, KillRef, MultiKillImpactTag, PlayerRoundMultiKillImpact } from "./impact-contracts.js";
import { deathsInWindow, impactCoverage, isImpactId, isImpactSide, perspective, resolveRoundAliveState, transitionTags } from "./alive-state.js";

const refKey = (r: KillRef | { round: number; type: string; tick: number; eventIndex: number }) => JSON.stringify([r.round, r.type, r.tick, r.eventIndex]);
function summarize(items: ImpactCoverage[]): ImpactCoverage {
  if (!items.length) return impactCoverage([], true);
  const reasons = items.flatMap(c => c.reasons);
  const status = items.every(c => c.status === "complete") ? "complete" : items.every(c => c.status === "unavailable") ? "unavailable" : "partial";
  return { status, reasons: [...new Set(reasons)].sort() };
}
function summarizeKillCoverage(kills: KillImpact[]): KillImpact["coverage"] {
  return { roundState: summarize(kills.map(k => k.coverage.roundState)), attribution: summarize(kills.map(k => k.coverage.attribution)),
    engagementLinkage: summarize(kills.map(k => k.coverage.engagementLinkage)) };
}

/** Four-key exact join through directContacts and unique Engagement membership. */
function engagementJoin(matchId: string, analysis?: EngagementAnalysis) {
  const contacts = new Map<string, EngagementAnalysis["directContacts"]>();
  const memberships = new Map<string, { id: string; contact: EngagementAnalysis["directContacts"][number]; round: number }[]>();
  if (analysis?.matchId === matchId) {
    for (const contact of analysis.directContacts) {
      const key = refKey(contact.eventRef), rows = contacts.get(key) ?? [];
      rows.push(contact); contacts.set(key, rows);
    }
    for (const engagement of analysis.engagements) for (const contact of engagement.contacts) {
      const key = refKey(contact.eventRef), rows = memberships.get(key) ?? [];
      rows.push({ id: engagement.id, contact, round: engagement.round }); memberships.set(key, rows);
    }
  }
  return (ref: KillRef, kill: KillEvent): { id: string | null; coverage: ImpactCoverage } => {
    const direct = contacts.get(refKey(ref)) ?? [], groups = memberships.get(refKey(ref)) ?? [];
    const matches = (c: EngagementAnalysis["directContacts"][number]) => c.attackerId === kill.killer && c.victimId === kill.victim && c.fatal;
    const conflict = analysis && analysis.matchId !== matchId || direct.length > 1 || groups.length > 1
      || direct.some(c => !matches(c)) || groups.some(g => !matches(g.contact) || g.round !== ref.round)
      || (groups.length > 0 && direct.length !== 1);
    if (conflict) return { id: null, coverage: impactCoverage(["engagement-link-conflict"], true) };
    if (direct.length === 1 && groups.length === 1) return { id: groups[0].id, coverage: impactCoverage([]) };
    return { id: null, coverage: impactCoverage(["engagement-not-linked"], true) };
  };
}

export function analyzeKillImpact(match: Match, engagements?: EngagementAnalysis): KillImpactAnalysis {
  const numbers = new Set<number>();
  for (const round of match.rounds) {
    if (!Number.isSafeInteger(round.number) || numbers.has(round.number)) throw new RangeError("round numbers must be unique safe integers");
    numbers.add(round.number);
  }
  const rounds = [], kills: KillImpact[] = [], multiKills: PlayerRoundMultiKillImpact[] = [], unattributedKills: KillImpactAnalysis["unattributedKills"] = [];
  const diagnostics: KillImpactAnalysis["diagnostics"] = { rounds: match.rounds.length, eligibleRounds: 0, ineligibleRounds: 0,
    deathEvents: 0, atomicDeathGroups: 0, creditedEnemyKills: 0, unattributedKills: 0, teamKills: 0, selfKills: 0, worldKills: 0,
    sameTickDeathGroups: 0, posthumousKills: 0, multiKillRounds: 0, doubleKills: 0, tripleKills: 0, quadKills: 0, fivePlusKills: 0,
    engagementLinkedKills: 0, unlinkedKills: 0 };
  const join = engagementJoin(match.id, engagements);
  for (const round of [...match.rounds].sort((a, b) => a.number - b.number)) {
    const state = resolveRoundAliveState(round); rounds.push(state);
    if (state.coverage.status === "unavailable") diagnostics.ineligibleRounds++; else diagnostics.eligibleRounds++;
    const deaths = deathsInWindow(round), roundKills: KillImpact[] = [];
    diagnostics.deathEvents += deaths.length;
    diagnostics.atomicDeathGroups += state.groups.length;
    diagnostics.sameTickDeathGroups += state.groups.filter(g => g.deathRefs.length > 1).length;
    const victimCounts = new Map<string, number>();
    for (const { event } of deaths) victimCounts.set(event.victim, (victimCounts.get(event.victim) ?? 0) + 1);
    for (const { event, eventIndex } of deaths) {
      const ref: KillRef = { round: round.number, type: "kill", tick: event.tick, eventIndex };
      const reasons: ImpactReason[] = [];
      if (!isImpactId(event.killer)) reasons.push("killer-unidentified");
      if (event.killer === "world") diagnostics.worldKills++;
      if (!isImpactId(event.victim)) reasons.push("victim-unidentified");
      if (event.killer === event.victim) { reasons.push("self-kill"); diagnostics.selfKills++; }
      else if (event.teamkill === true || (isImpactSide(event.killerSide) && event.killerSide === event.victimSide)) { reasons.push("teamkill"); diagnostics.teamKills++; }
      if (!isImpactSide(event.killerSide) || !isImpactSide(event.victimSide)) reasons.push("side-unknown");
      const observedKiller = state.players.find(p => p.playerId === event.killer);
      const observedVictim = state.players.find(p => p.playerId === event.victim);
      if ((observedKiller && observedKiller.side !== event.killerSide) || (observedVictim && observedVictim.side !== event.victimSide)) reasons.push("side-unknown");
      if ((victimCounts.get(event.victim) ?? 0) > 1) reasons.push("duplicate-death");
      // No unique gameplay kill can be credited from conflicting duplicate victim rows.
      if (reasons.length || !isImpactSide(event.killerSide) || !isImpactSide(event.victimSide)) {
        unattributedKills.push({ eventRef: ref, reasons: [...new Set(reasons)].sort() }); continue;
      }
      const group = state.groups.find(g => g.tick === event.tick)!;
      const killer = observedKiller;
      const rosterConfirmed = !!killer && !!observedVictim;
      const before = group.before && rosterConfirmed ? perspective(group.before, event.killerSide) : null;
      const after = group.after && rosterConfirmed ? perspective(group.after, event.killerSide) : null;
      const posthumous = state.coverage.status === "unavailable" || !killer || !killer.aliveAtBaseline ? null
        : killer.deathTick !== null && killer.deathTick < event.tick;
      const tags: KillImpact["tags"] = [];
      const ordered = group.deathRefs.length === 1;
      if (before && after) {
        if (state.groups[0] === group) tags.push(ordered ? "opening" : "opening-group");
        if (ordered) tags.push(...transitionTags(before, after));
        if (before.teamAlive === 1 && killer?.aliveAtBaseline && (killer.deathTick === null || killer.deathTick >= event.tick)) tags.push("sole-survivor-kill");
      }
      if (posthumous) tags.push("posthumous");
      const linked = join(ref, event);
      const attributionReasons: ImpactReason[] = [];
      if (!killer || killer.side !== event.killerSide || !state.players.some(p => p.playerId === event.victim && p.side === event.victimSide)) attributionReasons.push("participant-state-unknown");
      const impact: KillImpact = { eventRef: ref, killerId: event.killer, victimId: event.victim,
        killerSide: event.killerSide, victimSide: event.victimSide,
        ...(event.weapon !== undefined ? { weapon: event.weapon } : {}), ...(event.headshot !== undefined ? { headshot: event.headshot } : {}),
        posthumous, before, afterAtomicGroup: after, atomicGroup: { deathCount: group.deathRefs.length, attributedKillCount: 0, ordered }, tags,
        engagementId: linked.id, coverage: { roundState: structuredClone(state.coverage),
          attribution: impactCoverage([...attributionReasons, ...(!ordered ? ["same-tick-transition-ambiguous" as const] : [])]), engagementLinkage: linked.coverage } };
      roundKills.push(impact);
    }
    for (const kill of roundKills) kill.atomicGroup.attributedKillCount = roundKills.filter(k => k.eventRef.tick === kill.eventRef.tick).length;
    kills.push(...roundKills);
    const playerIds = [...new Set(roundKills.map(k => k.killerId))].sort();
    for (const playerId of playerIds) {
      const playerKills = roundKills.filter(k => k.killerId === playerId);
      if (playerKills.length < 2) continue;
      const ids = [...new Set(playerKills.flatMap(k => k.engagementId === null ? [] : [k.engagementId]))].sort();
      const player = state.players.find(p => p.playerId === playerId);
      const roundSide = player && playerKills.every(k => k.killerSide === player.side) && !state.coverage.reasons.includes("lifecycle-anomaly") ? player.side : null;
      const roundWinner = isImpactSide(round.winner) ? round.winner : null;
      const roundResult = roundSide && roundWinner ? roundSide === roundWinner ? "win" : "loss" : "unknown";
      const tags: MultiKillImpactTag[] = [];
      const mappings = { opening: "contains-opening", "opening-group": "contains-opening", equalizer: "contains-equalizer",
        "advantage-gain": "contains-advantage-gain", "deficit-reduction": "contains-deficit-reduction", "advantage-extension": "contains-advantage-extension",
        "enemy-eliminated": "contains-enemy-elimination", "sole-survivor-kill": "contains-sole-survivor-kill", posthumous: "contains-posthumous" } as const;
      for (const kill of playerKills) for (const tag of kill.tags) if (!tags.includes(mappings[tag])) tags.push(mappings[tag]);
      if (ids.length === 1 && playerKills.every(k => k.engagementId !== null)) tags.push("single-engagement");
      if (ids.length >= 2) tags.push("multi-engagement");
      if (roundResult !== "unknown") tags.push(roundResult === "win" ? "round-won" : "round-lost");
      if (playerKills.some(k => !k.atomicGroup.ordered)) tags.push("atomic-impact-partial");
      multiKills.push({ playerId, round: round.number, kills: structuredClone(playerKills), killCount: playerKills.length,
        firstKillTick: playerKills[0].eventRef.tick, lastKillTick: playerKills.at(-1)!.eventRef.tick,
        engagementIds: ids, roundSide, roundWinner, roundResult, beforeFirstKill: structuredClone(playerKills[0].before),
        afterLastKillAtomicGroup: structuredClone(playerKills.at(-1)!.afterAtomicGroup), tags, coverage: summarizeKillCoverage(playerKills) });
    }
  }
  diagnostics.creditedEnemyKills = kills.length; diagnostics.unattributedKills = unattributedKills.length;
  diagnostics.posthumousKills = kills.filter(k => k.posthumous === true).length;
  diagnostics.multiKillRounds = multiKills.length;
  diagnostics.doubleKills = multiKills.filter(k => k.killCount === 2).length;
  diagnostics.tripleKills = multiKills.filter(k => k.killCount === 3).length;
  diagnostics.quadKills = multiKills.filter(k => k.killCount === 4).length;
  diagnostics.fivePlusKills = multiKills.filter(k => k.killCount >= 5).length;
  diagnostics.engagementLinkedKills = kills.filter(k => k.engagementId !== null).length;
  diagnostics.unlinkedKills = kills.length - diagnostics.engagementLinkedKills;
  const coverage = summarizeKillCoverage(kills);
  coverage.roundState = summarize(rounds.map(r => r.coverage));
  if (unattributedKills.length) coverage.attribution = impactCoverage([...coverage.attribution.reasons, ...unattributedKills.flatMap(k => k.reasons)], kills.length === 0);
  return { matchId: match.id, rounds, kills, multiKills, unattributedKills, diagnostics, coverage };
}
