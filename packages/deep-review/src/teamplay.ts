import type { Match, MatchSpatialEvidence } from "@cs2-analyst/match-model";
import type { EngagementAnalysis, EngagementContact } from "./contracts.js";
import type { ImpactSide, KillImpactAnalysis, KillRef, RoundAliveState } from "./impact-contracts.js";
import type { DeathParticipationContext, FollowUpKillerState, PlayerDeathContext, PlayerDeathTeamResponse,
  PlayerEngagementContext, TeamplayAnalysis, TeamplayCoverage, TeamplayLayerCoverage, TeamplayOptions,
  TeamplayReason, TeammateDeathResponse } from "./teamplay-contracts.js";
import { deathsInWindow, isImpactId, isImpactSide, perspective } from "./alive-state.js";
import { contactRefKey } from "./spatial.js";
import { aliveAt, compareContacts, compareIds, layer, stateCoverage, summarizeLayers, teamplayContactIndex, teamplaySpatialJoin } from "./teamplay-evidence.js";

/** Independent event evidence; never imports P3, Findings, Electron or Renderer. */
export function analyzeTeamplay(match: Match, engagements?: EngagementAnalysis, impact?: KillImpactAnalysis,
  spatial?: MatchSpatialEvidence, options: TeamplayOptions = {}): TeamplayAnalysis {
  const seconds = options.followUpWindowSeconds === undefined ? 5 : options.followUpWindowSeconds;
  if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError("followUpWindowSeconds must be positive and finite");
  const numbers = new Set<number>();
  for (const r of match.rounds) {
    if (!Number.isSafeInteger(r.number) || numbers.has(r.number)) throw new RangeError("round numbers must be unique safe integers");
    numbers.add(r.number);
  }
  const rate = match.tickRate;
  const reliableRate = typeof rate === "number" && Number.isFinite(rate) && rate > 0
    && match.rounds.every(r => r.startTick === undefined || r.endTick === undefined || Number.isFinite((r.endTick - r.startTick) / rate));
  const timing = reliableRate ? layer() : layer(["tick-rate-unreliable"], true);
  const index = teamplayContactIndex(match, engagements), spatialJoin = teamplaySpatialJoin(match.id, spatial);
  const states = new Map<number, RoundAliveState>();
  if (impact?.matchId === match.id) for (const s of impact.rounds) {
    if (impact.rounds.filter(r => r.round === s.round).length === 1) states.set(s.round, s);
  }
  const spatialContexts = new Map<string, ReturnType<typeof spatialJoin>>();
  const spatialFor = (ref: KillRef | EngagementContact["eventRef"], id: string, state: RoundAliveState | undefined) => {
    const key = JSON.stringify([id, contactRefKey(ref)]), cached = spatialContexts.get(key);
    if (cached) return structuredClone(cached);
    const event = match.rounds.find(r => r.number === ref.round)!.events[ref.eventIndex];
    const actor = event.type === "kill" ? isImpactId(event.killer) ? event.killer : null : event.type === "damage" ? event.attacker : null;
    const target = event.type === "kill" || event.type === "damage" ? event.victim : "";
    const result = spatialJoin(ref, id, state, actor, target);
    spatialContexts.set(key, result); return structuredClone(result);
  };
  const contexts: PlayerEngagementContext[] = [];
  for (const g of index.groups) {
    const contacts = [...g.contacts].sort(compareContacts), state = states.get(g.round);
    const sideById = new Map<string, ImpactSide>(), first = new Map<string, number>();
    for (const c of contacts) for (const [id, side] of [[c.attackerId, index.sides.get(contactRefKey(c.eventRef))!.attacker],
      [c.victimId, index.sides.get(contactRefKey(c.eventRef))!.victim]] as const) {
      sideById.set(id, side); first.set(id, Math.min(first.get(id) ?? Infinity, c.eventRef.tick));
    }
    const incomplete = (index.roundReasons.get(g.round)?.length ?? 0) > 0;
    for (const playerId of [...first.keys()].sort(compareIds)) {
      const side = sideById.get(playerId)!, own = contacts.filter(c => c.attackerId === playerId || c.victimId === playerId);
      const sideIds = [...first.keys()].filter(id => sideById.get(id) === side).sort(compareIds);
      const enemyIds = [...first.keys()].filter(id => sideById.get(id) !== side).sort(compareIds);
      const ticks = [...new Set(sideIds.map(id => first.get(id)!))].sort((a, b) => a - b);
      const tiers = ticks.map(tick => ({ tick, playerIds: sideIds.filter(id => first.get(id) === tick) }));
      const role = incomplete || index.coverage.reasons.length ? "unknown" : first.get(playerId)! > ticks[0] ? "later"
        : tiers[0].playerIds.length === 1 ? "unique-first" : "shared-first";
      const others = sideIds.filter(id => id !== playerId), otherTick = others.length ? Math.min(...others.map(id => first.get(id)!)) : null;
      const joinDelay = reliableRate && role === "shared-first" ? 0 : reliableRate && role === "unique-first" && otherTick !== null
        ? (otherTick - first.get(playerId)!) / rate! : null;
      const geometry = spatialFor(own[0].eventRef, playerId, state);
      const participation = layer([...index.coverage.reasons, ...(incomplete ? ["engagement-evidence-incomplete" as const] : [])]);
      contexts.push({ playerId, engagementId: g.id, round: g.round, side, firstContactRef: { ...own[0].eventRef },
        firstContactTick: first.get(playerId)!, lastContactTick: Math.max(...own.map(c => c.eventRef.tick)), contactCount: own.length,
        damageContactsDealt: own.filter(c => !c.fatal && c.attackerId === playerId).length,
        damageContactsReceived: own.filter(c => !c.fatal && c.victimId === playerId).length,
        reportedDamageDealt: own.filter(c => !c.fatal && c.attackerId === playerId).reduce((s, c) => s + (c.reportedHealthDamage ?? 0), 0),
        reportedDamageReceived: own.filter(c => !c.fatal && c.victimId === playerId).reduce((s, c) => s + (c.reportedHealthDamage ?? 0), 0),
        kills: own.filter(c => c.fatal && c.attackerId === playerId).length, deaths: own.filter(c => c.fatal && c.victimId === playerId).length,
        sideParticipantIds: sideIds, enemyParticipantIds: enemyIds, sideParticipantCount: sideIds.length, enemyParticipantCount: enemyIds.length,
        onlyConfirmedSideParticipant: sideIds.length === 1, firstSideContactRole: role, otherSideContactObserved: others.length > 0,
        firstOtherTeammateContactTick: otherTick, teammateJoinDelaySeconds: joinDelay, sideContactTiers: tiers, spatialContext: geometry,
        coverage: { engagementParticipation: participation, aliveState: stateCoverage(state), followUpTiming: { ...timing, reasons: [...timing.reasons] }, spatialContext: geometry.coverage } });
    }
  }
  const participationFor = (ref: KillRef, id: string, side: ImpactSide, state: RoundAliveState | undefined): DeathParticipationContext => {
    const engagementId = index.linked.get(contactRefKey(ref)) ?? null;
    const c = contexts.find(c => c.engagementId === engagementId && c.playerId === id);
    const group = state?.coverage.status !== "unavailable" ? state?.groups.find(g => g.tick === ref.tick && g.deathRefs.some(r => contactRefKey(r) === contactRefKey(ref))) : undefined;
    return { engagementId, firstSideContactRole: c?.firstSideContactRole ?? "unknown", sideParticipantCount: c?.sideParticipantCount ?? null,
      otherSideContactObserved: c?.otherSideContactObserved ?? null, onlyConfirmedSideParticipant: c?.onlyConfirmedSideParticipant ?? null,
      teammateJoinDelaySeconds: c?.teammateJoinDelaySeconds ?? null,
      before: group?.before ? perspective(group.before, side) : null, afterAtomicGroup: group?.after ? perspective(group.after, side) : null,
      spatialContext: spatialFor(ref, id, state) };
  };
  const linkedCoverage = (ref: KillRef, id: string): TeamplayLayerCoverage => {
    const group = index.linked.get(contactRefKey(ref)), context = contexts.find(c => c.engagementId === group && c.playerId === id);
    return context ? context.coverage.engagementParticipation : layer([...index.coverage.reasons, "engagement-not-linked"], true);
  };
  const killerState = (state: RoundAliveState | undefined, id: string | null, tick: number): FollowUpKillerState => {
    if (!id || !state || state.coverage.status === "unavailable" || !state.baseline || tick < state.baseline.tick) return "unknown";
    const p = state.players.find(p => p.playerId === id);
    if (!p) return "unknown";
    if (p.deathTick === tick) return "dies-same-tick";
    if (p.deathTick !== null && p.deathTick < tick) return "dead-before";
    return p.aliveAtBaseline ? "alive-after-death" : "unknown";
  };
  const response = (ref: KillRef, killerId: string | null, kState: FollowUpKillerState, ids: string[], eligible: boolean, extra: TeamplayReason[]) => {
    const evidenceReasons = [...index.coverage.reasons, ...(index.roundReasons.get(ref.round) ?? [])];
    const reasons: TeamplayReason[] = [...timing.reasons, ...extra];
    if (!killerId) reasons.push("killer-unidentified");
    if (kState !== "alive-after-death") reasons.push(kState === "dead-before" ? "killer-dead-before"
      : kState === "dies-same-tick" ? "killer-death-same-tick" : "killer-state-unknown");
    const candidates = index.contacts.filter(c => c.eventRef.round === ref.round && ids.includes(c.attackerId) && c.victimId === killerId);
    const sameTick = candidates.filter(c => c.eventRef.tick === ref.tick);
    const later = reliableRate ? candidates.filter(c => c.eventRef.tick > ref.tick && (c.eventRef.tick - ref.tick) / rate! <= seconds) : [];
    // Eligibility is established at the origin death. A later contact on the
    // responder's own death tick still proves contact, without ordering that duel.
    const valid = later;
    if (sameTick.length) reasons.push("same-tick-response-ambiguous");
    const unavailable = !eligible || !reliableRate || !killerId || kState !== "alive-after-death" || index.coverage.status === "unavailable";
    if (index.coverage.status === "unavailable") reasons.push("engagement-unavailable");
    const first = !unavailable ? valid[0] ?? null : null;
    const decisive = !unavailable ? valid.find(c => c.fatal) ?? first : null;
    const ambiguity = sameTick.length > 0;
    const outcome = unavailable ? "unavailable" : decisive ? decisive.fatal ? "kill" : "damage"
      : ambiguity ? "same-tick-ambiguous" : evidenceReasons.length ? "unavailable" : "none-observed";
    const originId = index.linked.get(contactRefKey(ref)), followId = first ? index.linked.get(contactRefKey(first.eventRef)) : null;
    return { first, decisive, outcome: outcome as TeammateDeathResponse["outcome"],
      delaySeconds: first ? (first.eventRef.tick - ref.tick) / rate! : null,
      sameEngagement: originId && followId ? originId === followId : null,
      reportedDamage: outcome === "unavailable" || outcome === "same-tick-ambiguous" ? null : valid.filter(c => !c.fatal).reduce((s, c) => s + (c.reportedHealthDamage ?? 0), 0),
      sameTickContactRefs: sameTick.map(c => ({ ...c.eventRef })),
      coverage: layer([...reasons, ...evidenceReasons], outcome === "unavailable") };
  };
  const teammateDeathResponses: TeammateDeathResponse[] = [], playerDeathTeamResponses: PlayerDeathTeamResponse[] = [], playerDeathContexts: PlayerDeathContext[] = [];
  for (const round of [...match.rounds].sort((a, b) => a.number - b.number)) {
    const state = states.get(round.number);
    // Round-local observed identity/side only; Match.players initial side is not round truth.
    const roster = new Map<string, Set<ImpactSide>>();
    const add = (id: string, side: unknown) => {
      if (!isImpactId(id) || !isImpactSide(side)) return;
      const sides = roster.get(id) ?? new Set<ImpactSide>(); sides.add(side); roster.set(id, sides);
    };
    for (const snapshot of round.stateSnapshots ?? []) if (snapshot.availability === "observed") for (const p of snapshot.players) if (p.participant === true) add(p.steamId, p.side);
    for (const c of index.contacts.filter(c => c.eventRef.round === round.number)) {
      const s = index.sides.get(contactRefKey(c.eventRef))!; add(c.attackerId, s.attacker); add(c.victimId, s.victim);
    }
    for (const { event, eventIndex } of deathsInWindow(round)) {
      if (!isImpactId(event.victim) || !isImpactSide(event.victimSide) || event.killer === event.victim || event.teamkill === true || event.killerSide === event.victimSide) continue;
      const ref: KillRef = { round: round.number, type: "kill", tick: event.tick, eventIndex };
      const victimSide = event.victimSide, kId = isImpactId(event.killer) ? event.killer : null;
      const kState = killerState(state, kId, ref.tick);
      const duplicate = deathsInWindow(round).filter(d => d.event.victim === event.victim).length > 1;
      const victim = state?.players.find(p => p.playerId === event.victim);
      const attributionReliable = !duplicate && isImpactSide(event.killerSide) && event.killerSide !== victimSide
        && (!victim || victim.side === victimSide) && (!kId || !state?.players.some(p => p.playerId === kId && p.side !== event.killerSide));
      const peers = [...roster.entries()].filter(([id, sides]) => id !== event.victim && sides.size === 1 && sides.has(victimSide)).map(([id]) => id).sort(compareIds);
      const confirmed = peers.filter(id => aliveAt(state, id, ref.tick) === true);
      const ambiguous = peers.filter(id => state?.coverage.status !== "unavailable" && state?.players.some(p => p.playerId === id && p.deathTick === ref.tick));
      const aliveCoverage = stateCoverage(state);
      const baseReasons: TeamplayReason[] = attributionReliable ? [] : ["death-attribution-unavailable"];
      const team = response(ref, kId, kState, confirmed, attributionReliable && aliveCoverage.status !== "unavailable",
        [...baseReasons, ...(aliveCoverage.status === "unavailable" ? ["round-state-unavailable" as const] : []),
          ...(ambiguous.length ? ["same-tick-alive-ambiguous" as const] : [])]);
      // Uncertain teammates cannot establish a negative absence claim.
      if (ambiguous.length && team.outcome === "none-observed") { team.outcome = "same-tick-ambiguous"; team.coverage = layer([...team.coverage.reasons, "same-tick-alive-ambiguous"]); }
      const geometry = spatialFor(ref, event.victim, state);
      const teamCoverage: TeamplayCoverage = { engagementParticipation: linkedCoverage(ref, event.victim),
        aliveState: layer([...aliveCoverage.reasons, ...(ambiguous.length ? ["same-tick-alive-ambiguous" as const] : [])], aliveCoverage.status === "unavailable"),
        followUpTiming: team.coverage, spatialContext: geometry.coverage };
      const teamResponse: PlayerDeathTeamResponse = { playerId: event.victim, deathRef: { ...ref }, killerId: kId, killerState: kState,
        confirmedAliveTeammates: aliveCoverage.status === "unavailable" ? null : confirmed.length, sameTickAliveAmbiguousTeammateIds: ambiguous,
        firstResponderId: team.first?.attackerId ?? null, firstResponseRef: team.first ? { ...team.first.eventRef } : null,
        outcomeRef: team.decisive ? { ...team.decisive.eventRef } : null, outcomePlayerId: team.decisive?.attackerId ?? null,
        sameTickContactRefs: team.sameTickContactRefs, delaySeconds: team.delaySeconds, outcome: team.outcome, sameEngagement: team.sameEngagement, coverage: teamCoverage };
      playerDeathTeamResponses.push(teamResponse);
      playerDeathContexts.push({ playerId: event.victim, deathRef: { ...ref }, killerId: kId,
        ...participationFor(ref, event.victim, victimSide, state), teamResponse: structuredClone(teamResponse), coverage: structuredClone(teamCoverage) });
      for (const playerId of peers) {
        const alive = aliveAt(state, playerId, ref.tick), isAmbiguous = ambiguous.includes(playerId);
        const playerReasons: TeamplayReason[] = alive === false ? ["player-dead-before"] : alive === null ? [isAmbiguous ? "same-tick-alive-ambiguous" : "player-state-ambiguous"] : [];
        const follow = response(ref, kId, kState, [playerId], attributionReliable && alive === true, [...baseReasons, ...playerReasons]);
        if (isAmbiguous && reliableRate && kState === "alive-after-death" && attributionReliable && index.coverage.status !== "unavailable") {
          follow.outcome = "same-tick-ambiguous"; follow.coverage = layer([...follow.coverage.reasons, ...playerReasons]);
        }
        const context = participationFor(ref, playerId, victimSide, state);
        teammateDeathResponses.push({ playerId, teammateId: event.victim, deathRef: { ...ref }, killerId: kId, playerAliveAtDeath: alive, killerState: kState,
          ...context, firstFollowUpRef: follow.first ? { ...follow.first.eventRef } : null, outcomeRef: follow.decisive ? { ...follow.decisive.eventRef } : null,
          sameTickContactRefs: follow.sameTickContactRefs, delaySeconds: follow.delaySeconds, outcome: follow.outcome, sameEngagement: follow.sameEngagement,
          reportedDamage: follow.reportedDamage, coverage: { engagementParticipation: linkedCoverage(ref, playerId),
            aliveState: layer([...aliveCoverage.reasons, ...playerReasons], aliveCoverage.status === "unavailable" || (alive === null && !isAmbiguous)),
            followUpTiming: follow.coverage, spatialContext: context.spatialContext.coverage } });
      }
    }
  }
  const count = (rows: { outcome: string }[], outcome: string) => rows.filter(r => r.outcome === outcome).length;
  const geometry = [...spatialContexts.values()];
  const diagnostics: TeamplayAnalysis["diagnostics"] = { playerEngagementContexts: contexts.length,
    uniqueFirst: contexts.filter(c => c.firstSideContactRole === "unique-first").length, sharedFirst: contexts.filter(c => c.firstSideContactRole === "shared-first").length,
    later: contexts.filter(c => c.firstSideContactRole === "later").length, unknownFirst: contexts.filter(c => c.firstSideContactRole === "unknown").length,
    onlyConfirmedSideParticipant: contexts.filter(c => c.onlyConfirmedSideParticipant).length, teammateDeathsObserved: teammateDeathResponses.length,
    teammateDeathResponsesKill: count(teammateDeathResponses, "kill"), teammateDeathResponsesDamage: count(teammateDeathResponses, "damage"),
    teammateDeathResponsesNone: count(teammateDeathResponses, "none-observed"), teammateDeathResponsesAmbiguous: count(teammateDeathResponses, "same-tick-ambiguous"),
    teammateDeathResponsesUnavailable: count(teammateDeathResponses, "unavailable"), playerDeathsObserved: playerDeathContexts.length,
    teamResponsesKill: count(playerDeathTeamResponses, "kill"), teamResponsesDamage: count(playerDeathTeamResponses, "damage"),
    teamResponsesNone: count(playerDeathTeamResponses, "none-observed"), teamResponsesAmbiguous: count(playerDeathTeamResponses, "same-tick-ambiguous"), teamResponsesUnavailable: count(playerDeathTeamResponses, "unavailable"),
    spatialContextsComplete: geometry.filter(c => c.coverage.status === "complete").length, spatialContextsPartial: geometry.filter(c => c.coverage.status === "partial").length,
    spatialContextsUnavailable: geometry.filter(c => c.coverage.status === "unavailable").length,
    sameTickAliveAmbiguities: geometry.reduce((s, c) => s + c.sameTickAliveAmbiguousIds.length, 0), spatialAliveConflicts: geometry.reduce((s, c) => s + c.aliveConsistencyConflictIds.length, 0) };
  const coverages = [...contexts, ...teammateDeathResponses, ...playerDeathContexts].map(c => c.coverage);
  const summary = (key: keyof TeamplayCoverage) => summarizeLayers(coverages.map(c => c[key]));
  return { matchId: match.id, config: { followUpWindowSeconds: seconds }, playerEngagementContexts: contexts, teammateDeathResponses,
    playerDeathContexts, playerDeathTeamResponses, diagnostics, coverage: { engagementParticipation: coverages.length ? summary("engagementParticipation") : index.coverage,
      aliveState: coverages.length ? summary("aliveState") : layer(["round-state-unavailable"], true),
      followUpTiming: coverages.length ? summary("followUpTiming") : timing, spatialContext: coverages.length ? summary("spatialContext") : layer([spatial ? "spatial-event-missing" : "spatial-not-provided"], true) } };
}
