import type { Match, MatchSpatialEvidence } from "@cs2-analyst/match-model";
import type { EngagementAnalysis, EngagementContact } from "./contracts.js";
import type { KillImpactAnalysis } from "./impact-contracts.js";
import type { CombatExecutionAnalysis, CombatExecutionDiagnostics, CombatExecutionOptions, ContactDistance,
  ExecutionContactEvidence, ExecutionCoverage, ExecutionLayerCoverage, ExecutionReason, FirstContactRole,
  OpponentExchangeEvidence, PlayerCombatExecutionSummary, PlayerEngagementExecution, WeaponFireEvidence } from "./execution-contracts.js";
import { hasRoundWindow, isImpactId, isImpactSide, isImpactTick } from "./alive-state.js";
import { contactRefKey } from "./spatial.js";
import { executionContactIndex } from "./execution-index.js";
import { classifyContactWeapon } from "./weapons.js";

const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
// Stable representative only; equal ticks never acquire temporal order.
const compareContacts = (a: EngagementContact, b: EngagementContact) => a.eventRef.tick - b.eventRef.tick || a.eventRef.eventIndex - b.eventRef.eventIndex;

const layer = (reasons: Iterable<ExecutionReason> = [], unavailable = false): ExecutionLayerCoverage => {
  const rows = [...new Set(reasons)].sort();
  return { status: unavailable ? "unavailable" : rows.length ? "partial" : "complete", reasons: rows };
};
const summarize = (rows: ExecutionLayerCoverage[]): ExecutionLayerCoverage => ({
  status: !rows.length || rows.every(r => r.status === "unavailable") ? "unavailable"
    : rows.every(r => r.status === "complete") ? "complete" : "partial",
  reasons: [...new Set(rows.flatMap(r => r.reasons))].sort(),
});
const coverageSummary = (rows: ExecutionCoverage[]): ExecutionCoverage => Object.fromEntries(
  (["engagementLinkage", "fireEvidence", "contactEvidence", "returnContact", "spatialContext"] as const)
    .map(key => [key, summarize(rows.map(r => r[key]))])) as unknown as ExecutionCoverage;
const ref = (c: EngagementContact | undefined) => c ? { ...c.eventRef } : null;
const role = (a: EngagementContact | undefined, b: EngagementContact | undefined, reliable: boolean): FirstContactRole =>
  !reliable || !a || !b ? "unknown" : a.eventRef.tick === b.eventRef.tick ? "same-tick"
    : a.eventRef.tick < b.eventRef.tick ? "dealt-first" : "received-first";
const damage = (rows: EngagementContact[]): number | null => {
  const hurt = rows.filter(c => !c.fatal);
  if (hurt.some(c => !Number.isFinite(c.reportedHealthDamage) || c.reportedHealthDamage! < 0)) return null;
  const total = hurt.reduce((n, c) => n + c.reportedHealthDamage!, 0);
  return Number.isFinite(total) ? total : null;
};

function distanceJoin(match: Match, spatial?: MatchSpatialEvidence) {
  const index = new Map<string, MatchSpatialEvidence["events"]>();
  if (spatial?.matchId === match.id) for (const e of spatial.events) {
    if (e.eventRef.type !== "damage" && e.eventRef.type !== "kill") continue;
    const key = contactRefKey({ ...e.eventRef, type: e.eventRef.type }), rows = index.get(key) ?? [];
    rows.push(e); index.set(key, rows);
  }
  return (c: EngagementContact): { distance: ContactDistance | null; coverage: ExecutionLayerCoverage } => {
    const empty = (reason: ExecutionReason) => ({ distance: null, coverage: layer([reason], true) });
    if (!spatial) return empty("spatial-not-provided");
    if (spatial.matchId !== match.id) return empty("spatial-link-conflict");
    const rows = index.get(contactRefKey(c.eventRef));
    if (!rows?.length) return empty("spatial-event-missing");
    if (rows.length !== 1) return empty("spatial-link-conflict");
    const e = rows[0], points = [];
    for (const [r, id] of [["actor", c.attackerId], ["target", c.victimId]] as const) {
      const p = e.participants.filter(p => p.role === r);
      if (p.length !== 1 || p[0].playerId !== id) return empty("spatial-link-conflict");
      const samples = e.samples.filter(b => b.role === r && b.sample.playerId === id && b.sample.relation === "at-event");
      if (samples.length !== 1) return empty("position-missing");
      const s = samples[0].sample;
      if (s.requestedTick !== c.eventRef.tick || s.actualTick !== c.eventRef.tick || s.fields.position !== "complete"
        || !s.position || ![s.position.x, s.position.y, s.position.z].every(Number.isFinite)) return empty("position-missing");
      points.push(s.position);
    }
    const horizontalDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    const verticalDelta = Math.abs(points[0].z - points[1].z), directDistance = Math.hypot(horizontalDistance, verticalDelta);
    return [horizontalDistance, verticalDelta, directDistance].every(Number.isFinite)
      ? { distance: { horizontalDistance, verticalDelta, directDistance }, coverage: layer() } : empty("distance-unavailable");
  };
}

/** Pure firearm event evidence. No shot targets, inferred misses, ratios or scores. */
export function analyzeCombatExecution(match: Match, engagements?: EngagementAnalysis, _impact?: KillImpactAnalysis,
  spatial?: MatchSpatialEvidence, options: CombatExecutionOptions = {}): CombatExecutionAnalysis {
  // KillImpact is accepted for pipeline compatibility; raw death refs define the temporal boundary.
  // Its state counts/tags are neither reimplemented nor required for contact evidence.
  const seconds = options.preContactFireWindowSeconds === undefined ? 1 : options.preContactFireWindowSeconds;
  if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError("preContactFireWindowSeconds must be positive and finite");
  const numbers = new Set<number>();
  for (const r of match.rounds) {
    if (!Number.isSafeInteger(r.number) || numbers.has(r.number)) throw new RangeError("round numbers must be unique safe integers");
    numbers.add(r.number);
  }
  const rate = match.tickRate;
  const clock = typeof rate === "number" && Number.isFinite(rate) && rate > 0
    && match.rounds.every(r => !hasRoundWindow(r) || Number.isFinite((r.endTick! - r.startTick!) / rate));
  const window = clock ? seconds * rate! : null;
  if (window !== null && (!Number.isFinite(window) || window > Number.MAX_SAFE_INTEGER)) throw new RangeError("fire window cannot be represented safely");
  const index = executionContactIndex(match, engagements), join = distanceJoin(match, spatial);
  const linkageReasons: ExecutionReason[] = index.coverage.reasons.length
    ? [index.coverage.status === "unavailable" ? "engagement-unavailable" : "engagement-link-conflict"] : [];
  const groups = index.groups.filter(g => {
    const ticks = g.contacts.map(c => c.eventRef.tick);
    const valid = g.startTick === Math.min(...ticks) && g.endTick === Math.max(...ticks) && isImpactTick(g.startTick) && isImpactTick(g.endTick);
    if (!valid) linkageReasons.push("engagement-link-conflict");
    return valid;
  });
  const contactKind = (c: EngagementContact) => {
    const e = match.rounds.find(r => r.number === c.eventRef.round)!.events[c.eventRef.eventIndex];
    return classifyContactWeapon("weapon" in e ? e.weapon : undefined);
  };
  const diagnostics: CombatExecutionDiagnostics = { playerEngagementContexts: 0, opponentExchanges: 0,
    firearmFireEventsObserved: 0, insideEngagementFireLinked: 0, leadInFireLinked: 0, ambiguousFire: 0, unlinkedFire: 0,
    dealtFirst: 0, receivedFirst: 0, sameTickFirst: 0, unknownFirst: 0, returnKill: 0, returnDamage: 0, returnNone: 0,
    returnAmbiguous: 0, returnUnavailable: 0, contextsWithDistance: 0, contextsWithoutDistance: 0,
    unknownWeaponContacts: 0, unknownWeaponFireEvents: 0, excludedMelee: 0, excludedTaser: 0, excludedUtility: 0 };
  const contacts: ExecutionContactEvidence[] = index.contacts.filter(c => ["firearm", "unknown"].includes(contactKind(c))).map(c => ({
    eventRef: { ...c.eventRef }, attackerId: c.attackerId, victimId: c.victimId, weapon: c.weapon ?? null,
    sourceKind: contactKind(c) as "firearm" | "unknown",
    reportedHealthDamage: c.fatal || !Number.isFinite(c.reportedHealthDamage) || c.reportedHealthDamage! < 0 ? null : c.reportedHealthDamage!,
  }));
  diagnostics.unknownWeaponContacts = contacts.filter(c => c.sourceKind === "unknown").length;
  const roundReasons = new Map<number, ExecutionReason[]>();
  const weaponFireEvidence: WeaponFireEvidence[] = [];
  for (const r of [...match.rounds].sort((a, b) => a.number - b.number)) {
    const reasons: ExecutionReason[] = [];
    if (!hasRoundWindow(r)) reasons.push("round-window-unavailable");
    if ((index.roundReasons.get(r.number)?.length ?? 0) > 0) reasons.push("contact-feed-incomplete");
    const sideById = new Map<string, Set<string>>();
    for (const [eventIndex, e] of r.events.entries()) {
      const kind = "weapon" in e ? classifyContactWeapon(e.weapon) : null;
      if (e.type === "damage" || e.type === "kill") {
        if (!isImpactTick(e.tick)) { if (kind !== "utility") reasons.push("contact-feed-incomplete"); continue; }
        if (!hasRoundWindow(r) || e.tick < r.startTick! || e.tick > r.endTick!) continue;
        if (kind === "melee") diagnostics.excludedMelee++;
        if (kind === "taser") diagnostics.excludedTaser++;
        if (kind === "utility") { diagnostics.excludedUtility++; continue; }
        const actor = e.type === "kill" ? e.killer : e.attacker, side = e.type === "kill" ? e.killerSide : e.attackerSide;
        if (kind === "unknown") reasons.push("contact-weapon-unknown");
        if (!isImpactId(actor) || !isImpactId(e.victim) || !isImpactSide(side) || !isImpactSide(e.victimSide)) continue;
        for (const [id, s] of [[actor, side], [e.victim, e.victimSide]]) {
          const set = sideById.get(id) ?? new Set(); set.add(s); sideById.set(id, set);
        }
        if (actor === e.victim || side === e.victimSide || (e.type === "kill" && e.teamkill)) continue;
        const key = contactRefKey({ round: r.number, type: e.type, tick: e.tick, eventIndex });
        if (!index.linked.has(key)) reasons.push("contact-feed-incomplete");
      }
      if (e.type !== "weapon_fire" || kind === "utility" || kind === "melee" || kind === "taser") continue;
      if (!isImpactTick(e.tick)) throw new RangeError("weapon_fire tick must be a nonnegative safe integer for a stable ref");
      const fireReasons: ExecutionReason[] = [];
      if (!isImpactId(e.shooter) || !isImpactTick(e.tick)) fireReasons.push("fire-event-unidentified");
      if (kind === "unknown") fireReasons.push("fire-weapon-unknown");
      if (!clock) fireReasons.push("tick-rate-unreliable");
      const inRound = hasRoundWindow(r) && isImpactTick(e.tick) && e.tick >= r.startTick! && e.tick <= r.endTick!;
      if (!inRound) fireReasons.push("round-window-unavailable");
      const candidates = inRound && isImpactId(e.shooter) ? groups.filter(g => g.round === r.number && g.participantIds.includes(e.shooter)
        && (e.tick >= g.startTick && e.tick <= g.endTick || window !== null && e.tick < g.startTick && g.startTick - e.tick <= window)) : [];
      // All eligible inside AND lead-in candidates participate in uniqueness. Never prefer a nearer/inside group.
      const linked = candidates.length === 1 ? candidates[0] : null;
      const linkage = candidates.length > 1 ? "ambiguous" : linked ? e.tick < linked.startTick ? "unique-lead-in" : "inside-engagement" : "unlinked";
      if (linkage === "ambiguous") fireReasons.push(candidates.some(g => e.tick < g.startTick) ? "precontact-link-ambiguous" : "fire-link-ambiguous");
      weaponFireEvidence.push({ eventRef: { round: r.number, type: "weapon_fire", tick: e.tick, eventIndex }, shooterId: e.shooter,
        weapon: e.weapon, sourceKind: kind as "firearm" | "unknown", linkage, engagementId: linked?.id ?? null,
        candidateEngagementIds: candidates.map(g => g.id).sort(compareIds), coverage: layer(fireReasons) });
      if (kind === "firearm") {
        diagnostics.firearmFireEventsObserved++;
        if (linkage === "inside-engagement") diagnostics.insideEngagementFireLinked++;
        else if (linkage === "unique-lead-in") diagnostics.leadInFireLinked++;
        else if (linkage === "ambiguous") diagnostics.ambiguousFire++;
        else diagnostics.unlinkedFire++;
      } else diagnostics.unknownWeaponFireEvents++;
    }
    if ([...sideById.values()].some(s => s.size > 1)) reasons.push("opponent-identity-unknown");
    roundReasons.set(r.number, [...new Set(reasons)]);
  }
  weaponFireEvidence.sort((a, b) => a.eventRef.round - b.eventRef.round || a.eventRef.tick - b.eventRef.tick || a.eventRef.eventIndex - b.eventRef.eventIndex);
  const contexts: PlayerEngagementExecution[] = [];
  for (const g of groups) {
    const firearm = g.contacts.filter(c => contactKind(c) === "firearm").sort(compareContacts);
    const evidenceReasons = roundReasons.get(g.round)!;
    const reliable = !evidenceReasons.length && !linkageReasons.length;
    const linkageCoverage = layer(linkageReasons, index.coverage.status === "unavailable");
    const round = match.rounds.find(r => r.number === g.round)!;
    const contextIds = new Set(g.contacts.filter(c => ["firearm", "unknown"].includes(contactKind(c))).flatMap(c => [c.attackerId, c.victimId]));
    for (const f of weaponFireEvidence) if (f.engagementId === g.id) contextIds.add(f.shooterId);
    for (const playerId of [...contextIds].sort(compareIds)) {
      const own = firearm.filter(c => c.attackerId === playerId || c.victimId === playerId);
      const dealt = own.filter(c => c.attackerId === playerId), received = own.filter(c => c.victimId === playerId);
      const contactReasons = [...evidenceReasons];
      if (damage(dealt) === null || damage(received) === null) contactReasons.push("reported-damage-unavailable");
      const contactCoverage = layer(contactReasons);
      const rawDeaths = round.events.flatMap((e, eventIndex) => e.type === "kill" && e.victim === playerId && isImpactTick(e.tick)
        && e.tick >= round.startTick! && e.tick <= round.endTick! ? [{ round: g.round, type: "kill" as const, tick: e.tick, eventIndex }] : []).sort((a, b) => a.tick - b.tick || a.eventIndex - b.eventIndex);
      const death = rawDeaths[0];
      const exchanges: OpponentExchangeEvidence[] = [];
      for (const opponentId of [...new Set(own.map(c => c.attackerId === playerId ? c.victimId : c.attackerId))].sort(compareIds)) {
        const pair = own.filter(c => [c.attackerId, c.victimId].includes(opponentId));
        const pd = pair.filter(c => c.attackerId === playerId), pr = pair.filter(c => c.victimId === playerId);
        const firstRole = role(pd[0], pr[0], reliable), first = pair[0], geometry = join(first);
        const returnReasons: ExecutionReason[] = [...evidenceReasons, ...linkageReasons];
        if (!clock) returnReasons.push("tick-rate-unreliable");
        const origin = pr[0], same = origin ? pd.filter(c => c.eventRef.tick === origin.eventRef.tick) : [];
        const later = origin ? pd.filter(c => c.eventRef.tick > origin.eventRef.tick && (!death || c.eventRef.tick < death.tick)) : [];
        const atDeath = origin && death ? pd.filter(c => c.eventRef.tick > origin.eventRef.tick && c.eventRef.tick === death.tick) : [];
        let outcome: OpponentExchangeEvidence["returnOutcome"] = "unavailable";
        let returned: EngagementContact | undefined, decisive: EngagementContact | undefined;
        if (origin && (!pd[0] || pd[0].eventRef.tick >= origin.eventRef.tick)) {
          if (death && (death.tick < origin.eventRef.tick || rawDeaths.length > 1)) returnReasons.push("death-boundary-conflict");
          else if (death?.tick === origin.eventRef.tick) { outcome = "same-tick-ambiguous"; returnReasons.push("same-tick-death-ambiguous"); }
          else if (later.length) {
            returned = later[0]; decisive = later.find(c => c.fatal) ?? returned; outcome = decisive.fatal ? "kill" : "damage";
          } else if (same.length || atDeath.length) { outcome = "same-tick-ambiguous"; returnReasons.push(same.length ? "same-tick-contact-ambiguous" : "same-tick-death-ambiguous"); }
          else if (reliable && clock) outcome = "none-observed";
        }
        if (same.length) returnReasons.push("same-tick-contact-ambiguous");
        if (atDeath.length) returnReasons.push("same-tick-death-ambiguous");
        if (outcome === "unavailable") returnReasons.push("return-contact-unavailable");
        exchanges.push({ playerId, opponentId, engagementId: g.id, round: g.round, contactRefs: pair.map(c => ({ ...c.eventRef })),
          firstDealtRef: ref(pd[0]), firstReceivedRef: ref(pr[0]), firstContactRole: firstRole,
          damageContactsDealt: pd.filter(c => !c.fatal).length, damageContactsReceived: pr.filter(c => !c.fatal).length,
          reportedDamageDealt: damage(pd), reportedDamageReceived: damage(pr), killRef: ref(pd.find(c => c.fatal)), deathRef: ref(pr.find(c => c.fatal)),
          returnContactRef: ref(returned), returnOutcomeRef: ref(decisive), sameTickReturnRefs: [...same, ...atDeath].map(c => ({ ...c.eventRef })),
          returnContactDelaySeconds: clock && returned && origin ? (returned.eventRef.tick - origin.eventRef.tick) / rate! : null,
          returnOutcome: outcome, firstContactRef: { ...first.eventRef }, firstContactDistance: geometry.distance,
          coverage: { engagementLinkage: linkageCoverage, fireEvidence: layer([], true), contactEvidence: contactCoverage,
            returnContact: layer(returnReasons, outcome === "unavailable"), spatialContext: geometry.coverage } });
      }
      const assigned = weaponFireEvidence.filter(f => f.shooterId === playerId && f.engagementId === g.id);
      const fire = assigned.filter(f => f.sourceKind === "firearm");
      const ambiguous = weaponFireEvidence.filter(f => f.shooterId === playerId && f.linkage === "ambiguous" && f.candidateEngagementIds.includes(g.id));
      const fireReasons: ExecutionReason[] = [...assigned, ...ambiguous].flatMap(f => f.coverage.reasons);
      const unresolvedRoundFire = weaponFireEvidence.filter(f => f.eventRef.round === g.round
        && (f.shooterId === playerId || f.coverage.reasons.includes("fire-event-unidentified")));
      fireReasons.push(...unresolvedRoundFire.flatMap(f => f.coverage.reasons.filter(r => r === "fire-event-unidentified" || r === "fire-weapon-unknown")));
      const firstFire = fire[0], firstContact = dealt[0];
      let delay: number | null = null;
      if (!clock) fireReasons.push("tick-rate-unreliable");
      if (firstFire && firstContact) {
        if (firstFire.eventRef.tick === firstContact.eventRef.tick) fireReasons.push("same-tick-fire-contact-ambiguous");
        else if (firstFire.eventRef.tick > firstContact.eventRef.tick) fireReasons.push("contact-before-observed-fire");
        else if (clock) delay = (firstContact.eventRef.tick - firstFire.eventRef.tick) / rate!;
      }
      const fireCoverage = layer(fireReasons);
      for (const x of exchanges) x.coverage.fireEvidence = structuredClone(fireCoverage);
      contexts.push({ playerId, engagementId: g.id, round: g.round, weaponFireRefs: fire.map(f => ({ ...f.eventRef })),
        ambiguousWeaponFireRefs: ambiguous.map(f => ({ ...f.eventRef })), insideEngagementFireCount: fire.filter(f => f.linkage === "inside-engagement").length,
        leadInFireCount: fire.filter(f => f.linkage === "unique-lead-in").length, ambiguousFireCount: ambiguous.length,
        firstObservedFireRef: firstFire ? { ...firstFire.eventRef } : null, firstConfirmedOffensiveContactRef: ref(firstContact),
        firstConfirmedDefensiveContactRef: ref(received[0]), firstContactRole: role(firstContact, received[0], reliable),
        damageContactsDealt: dealt.filter(c => !c.fatal).length, damageContactsReceived: received.filter(c => !c.fatal).length,
        reportedDamageDealt: damage(dealt), reportedDamageReceived: damage(received), firearmKills: dealt.filter(c => c.fatal).length,
        firearmDeaths: received.filter(c => c.fatal).length,
        weaponFireEventsBeforeFirstConfirmedContact: firstContact ? fire.filter(f => f.eventRef.tick < firstContact.eventRef.tick).length : null,
        firstFireToFirstConfirmedContactSeconds: delay, fireToContactEvidence: { observedFireEvents: fire.length, confirmedOffensiveContacts: dealt.length },
        opponentExchanges: exchanges, coverage: { engagementLinkage: structuredClone(linkageCoverage), fireEvidence: fireCoverage,
          contactEvidence: contactCoverage, returnContact: summarize(exchanges.map(x => x.coverage.returnContact)),
          spatialContext: summarize(exchanges.map(x => x.coverage.spatialContext)) } });
    }
  }
  const summaries: PlayerCombatExecutionSummary[] = [];
  const roleCount = (rows: PlayerEngagementExecution[], value: FirstContactRole) => rows.filter(c => c.firstContactRole === value).length;
  const allExchanges = contexts.flatMap(c => c.opponentExchanges);
  for (const playerId of [...new Set([...match.players.map(p => p.steamId).filter(isImpactId), ...contexts.map(c => c.playerId)])].sort(compareIds)) {
    const own = contexts.filter(c => c.playerId === playerId), pairs = own.flatMap(c => c.opponentExchanges);
    const count = (outcome: OpponentExchangeEvidence["returnOutcome"]) => pairs.filter(p => p.returnOutcome === outcome).length;
    const playerCoverage = coverageSummary(own.map(c => c.coverage));
    playerCoverage.fireEvidence = summarize([...own.map(c => c.coverage.fireEvidence),
      ...weaponFireEvidence.filter(f => f.shooterId === playerId).map(f => f.coverage)]);
    summaries.push({ playerId, eligibleEngagements: own.length, dealtFirst: roleCount(own, "dealt-first"), receivedFirst: roleCount(own, "received-first"),
      sameTickFirst: roleCount(own, "same-tick"), unknownFirst: roleCount(own, "unknown"), firearmKills: own.reduce((n, c) => n + c.firearmKills, 0),
      firearmDeaths: own.reduce((n, c) => n + c.firearmDeaths, 0), confirmedReturnKill: count("kill"), confirmedReturnDamage: count("damage"),
      noConfirmedReturn: count("none-observed"), ambiguousReturn: count("same-tick-ambiguous"), unavailableReturn: count("unavailable"),
      engagementsWithLeadInFire: own.filter(c => c.leadInFireCount > 0).length,
      totalObservedFireEvents: weaponFireEvidence.filter(f => f.shooterId === playerId && f.sourceKind === "firearm").length,
      totalConfirmedOffensiveContacts: own.reduce((n, c) => n + c.fireToContactEvidence.confirmedOffensiveContacts, 0),
      opponentExchanges: pairs.length, coverage: playerCoverage });
  }
  diagnostics.playerEngagementContexts = contexts.length; diagnostics.opponentExchanges = allExchanges.length;
  diagnostics.dealtFirst = roleCount(contexts, "dealt-first"); diagnostics.receivedFirst = roleCount(contexts, "received-first");
  diagnostics.sameTickFirst = roleCount(contexts, "same-tick"); diagnostics.unknownFirst = roleCount(contexts, "unknown");
  for (const [outcome, key] of [["kill", "returnKill"], ["damage", "returnDamage"], ["none-observed", "returnNone"],
    ["same-tick-ambiguous", "returnAmbiguous"], ["unavailable", "returnUnavailable"]] as const) diagnostics[key] = allExchanges.filter(p => p.returnOutcome === outcome).length;
  diagnostics.contextsWithDistance = contexts.filter(c => c.opponentExchanges.some(p => p.firstContactDistance)).length;
  diagnostics.contextsWithoutDistance = contexts.length - diagnostics.contextsWithDistance;
  const coverage = coverageSummary(contexts.map(c => c.coverage));
  coverage.fireEvidence = summarize([...contexts.map(c => c.coverage.fireEvidence), ...weaponFireEvidence.map(f => f.coverage)]);
  const sourceContactReasons: ExecutionReason[] = [...roundReasons.values()].flat();
  coverage.contactEvidence = summarize([...contexts.map(c => c.coverage.contactEvidence), layer(sourceContactReasons, contacts.length === 0)]);
  if (!contexts.length) coverage.engagementLinkage = layer(linkageReasons.length ? linkageReasons : ["engagement-unavailable"], true);
  return { matchId: match.id, config: { preContactFireWindowSeconds: seconds, preContactFireWindowTicks: window }, contacts,
    weaponFireEvidence, playerEngagementExecutions: contexts, playerSummaries: summaries, diagnostics, coverage };
}
