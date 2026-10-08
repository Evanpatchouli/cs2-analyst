import type { Match, MatchSpatialEvidence, TeamSide } from "@cs2-analyst/match-model";
import type { Engagement, EngagementAnalysis, EngagementContact, EngagementDiagnostics, EngagementOptions, SegmentationReason } from "./contracts.js";
import { createSpatialJoin, summarizeSpatial } from "./spatial.js";
import { classifyContactWeapon } from "./weapons.js";

const isId = (id: string | null): id is string => typeof id === "string" && /^[1-9]\d*$/.test(id);
const knownSide = (side?: TeamSide) => side === "CT" || side === "T";
const isTick = (tick: number | undefined): tick is number => Number.isSafeInteger(tick) && tick! >= 0;
const compareContacts = (a: EngagementContact, b: EngagementContact) => a.eventRef.tick - b.eventRef.tick
  || a.eventRef.eventIndex - b.eventRef.eventIndex || (a.eventRef.type < b.eventRef.type ? -1 : a.eventRef.type > b.eventRef.type ? 1 : 0);

/** Each edge connects contacts in one round, within gapTicks, sharing a player. */
function components(contacts: EngagementContact[], gapTicks: number): EngagementContact[][] {
  const parent = contacts.map((_, index) => index);
  const root = (index: number): number => {
    while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; }
    return index;
  };
  const latest = new Map<string, number>();
  contacts.forEach((contact, index) => {
    for (const id of [contact.attackerId, contact.victimId]) {
      const previous = latest.get(id);
      // Only the latest contact for this participant is needed: earlier in-window
      // contacts are already connected through this participant's consecutive rows.
      if (previous !== undefined && contact.eventRef.tick - contacts[previous].eventRef.tick <= gapTicks) {
        const a = root(previous), b = root(index);
        parent[Math.max(a, b)] = Math.min(a, b);
      }
      latest.set(id, index);
    }
  });
  const groups = new Map<number, EngagementContact[]>();
  contacts.forEach((contact, index) => {
    const key = root(index), group = groups.get(key) ?? [];
    group.push(contact); groups.set(key, group);
  });
  return [...groups.values()].sort((a, b) => compareContacts(a[0], b[0]));
}

export function analyzeEngagements(match: Match, spatial?: MatchSpatialEvidence, options: EngagementOptions = {}): EngagementAnalysis {
  const seconds = options.contactGapSeconds ?? 3;
  if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError("contactGapSeconds must be positive and finite");
  const tickRate = match.tickRate;
  const reliableRate = typeof tickRate === "number" && Number.isFinite(tickRate) && tickRate > 0
    // A component can span the entire formal window through transitive edges.
    // Reject clocks that cannot represent that duration as finite JSON seconds.
    && match.rounds.every(round => !isTick(round.startTick) || !isTick(round.endTick) || round.startTick > round.endTick
      || Number.isFinite((round.endTick - round.startTick) / tickRate));
  const gapTicks = reliableRate ? Math.round(seconds * match.tickRate!) : null;
  if (gapTicks !== null && !Number.isSafeInteger(gapTicks)) throw new RangeError("contact gap cannot be represented as safe integer ticks");
  // Round number is part of every event's identity. Ambiguous input cannot be joined safely.
  const roundNumbers = new Set<number>();
  for (const round of match.rounds) {
    if (!Number.isSafeInteger(round.number) || roundNumbers.has(round.number)) throw new RangeError("round numbers must be unique safe integers");
    roundNumbers.add(round.number);
  }
  const diagnostics: EngagementDiagnostics = {
    candidateContacts: 0, includedContacts: 0, excludedRoundWindow: 0, excludedInvalidTick: 0,
    excludedPreRound: 0, excludedPostRound: 0, excludedUnidentified: 0, excludedSelf: 0,
    excludedTeam: 0, excludedUnknownSide: 0, excludedUtility: 0, unknownWeaponKind: 0,
    roundsWithUnavailableWindow: 0, repeatedEventRows: 0, sameTickContacts: 0,
  };
  const join = createSpatialJoin(match.id, spatial);
  const directContacts: EngagementContact[] = [], engagements: Engagement[] = [];
  const reasons = new Set<SegmentationReason>();
  if (!reliableRate) reasons.add("tick-rate-unreliable");
  for (const round of [...match.rounds].sort((a, b) => a.number - b.number)) {
    const windowAvailable = isTick(round.startTick) && isTick(round.endTick) && round.startTick <= round.endTick;
    if (!windowAvailable) { diagnostics.roundsWithUnavailableWindow++; reasons.add("round-window-unavailable"); }
    const contacts: EngagementContact[] = [];
    const seen = new Set<string>();
    round.events.forEach((event, eventIndex) => {
      if (event.type !== "damage" && event.type !== "kill") return;
      diagnostics.candidateContacts++;
      if (!windowAvailable) { diagnostics.excludedRoundWindow++; return; }
      if (!isTick(event.tick)) { diagnostics.excludedInvalidTick++; reasons.add("invalid-event-tick"); return; }
      if (event.tick < round.startTick!) { diagnostics.excludedPreRound++; return; }
      if (event.tick > round.endTick!) { diagnostics.excludedPostRound++; return; }
      const attacker = event.type === "kill" ? event.killer : event.attacker;
      const attackerSide = event.type === "kill" ? event.killerSide : event.attackerSide;
      if (!isId(attacker) || !isId(event.victim)) { diagnostics.excludedUnidentified++; reasons.add("participant-unidentified"); return; }
      if (attacker === event.victim) { diagnostics.excludedSelf++; return; }
      if (event.type === "kill" && event.teamkill === true) { diagnostics.excludedTeam++; return; }
      if (!knownSide(attackerSide) || !knownSide(event.victimSide)) { diagnostics.excludedUnknownSide++; reasons.add("side-unknown"); return; }
      if (attackerSide === event.victimSide) { diagnostics.excludedTeam++; return; }
      const sourceKind = classifyContactWeapon(event.weapon);
      if (sourceKind === "utility") { diagnostics.excludedUtility++; return; }
      if (sourceKind === "unknown") { diagnostics.unknownWeaponKind++; reasons.add("weapon-kind-unknown"); }
      const eventRef = { round: round.number, type: event.type, tick: event.tick, eventIndex };
      const contact: EngagementContact = { eventRef, attackerId: attacker, victimId: event.victim,
        ...(event.weapon !== undefined ? { weapon: event.weapon } : {}), sourceKind,
        fatal: event.type === "kill", coverage: { reasons: sourceKind === "unknown" ? ["weapon-kind-unknown"] : [] },
        spatialCoverage: join(eventRef, attacker, event.victim),
        ...(event.type === "damage" ? { reportedHealthDamage: event.healthDamage, healthRemaining: event.healthRemaining }
          : { ...(event.headshot !== undefined ? { headshot: event.headshot } : {}),
            ...(event.assistedFlash !== undefined ? { assistedFlash: event.assistedFlash } : {}) }),
      };
      const rowKey = JSON.stringify([event.type, event.tick, attacker, event.victim]);
      if (seen.has(rowKey)) diagnostics.repeatedEventRows++;
      seen.add(rowKey);
      contacts.push(contact);
    });
    contacts.sort(compareContacts);
    const tickCounts = new Map<number, number>();
    for (const contact of contacts) tickCounts.set(contact.eventRef.tick, (tickCounts.get(contact.eventRef.tick) ?? 0) + 1);
    diagnostics.sameTickContacts += [...tickCounts.values()].filter(count => count > 1).reduce((sum, count) => sum + count, 0);
    directContacts.push(...contacts);
    if (gapTicks === null) continue;
    components(contacts, gapTicks).forEach((group, ordinal) => {
      const first = group[0].eventRef, endTick = group[group.length - 1].eventRef.tick;
      const unknown = group.some(contact => contact.sourceKind === "unknown");
      engagements.push({ id: `engagement:${encodeURIComponent(match.id)}:${round.number}:${first.tick}:${first.eventIndex}:${first.type}:${ordinal}`,
        round: round.number, startTick: first.tick, endTick, durationSeconds: (endTick - first.tick) / match.tickRate!,
        participantIds: [...new Set(group.flatMap(contact => [contact.attackerId, contact.victimId]))].sort(),
        contacts: group, killCount: group.filter(contact => contact.fatal).length,
        damageContactCount: group.filter(contact => !contact.fatal).length,
        coverage: { eventSegmentation: { status: unknown ? "partial" : "complete", reasons: unknown ? ["weapon-kind-unknown"] : [] },
          spatialEnrichment: summarizeSpatial(group) } });
    });
  }
  diagnostics.includedContacts = directContacts.length;
  const available = gapTicks !== null && diagnostics.roundsWithUnavailableWindow < match.rounds.length;
  return { matchId: match.id, available, config: { contactGapSeconds: seconds, contactGapTicks: gapTicks }, directContacts, engagements, diagnostics,
    coverage: { eventSegmentation: { status: !available ? "unavailable" : reasons.size > 0 ? "partial" : "complete", reasons: [...reasons].sort() },
      spatialEnrichment: summarizeSpatial(directContacts) } };
}
