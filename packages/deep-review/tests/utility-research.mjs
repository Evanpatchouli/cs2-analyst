// Research only: all same-actor/round pair deltas are candidates, never attribution.
export function researchUtility(match) {
  const rows = match.rounds.flatMap(r => r.events.map((event, eventIndex) => ({ event, round: r.number, eventIndex })));
  const effects = kind => rows.filter(x => x.event.type === "utility" && x.event.utility === kind);
  const weapon = e => e.weapon?.toLowerCase().replace(/^weapon_/, "");
  const damages = kind => rows.filter(x => x.event.type === "damage" && (kind === "hegrenade" ? weapon(x.event) === kind : ["inferno", "molotov", "incgrenade"].includes(weapon(x.event))));
  const damageResearch = kind => {
    const es = effects(kind), ds = damages(kind), deltas = {}, uniqueEffectDeltas = {}, multiplicity = {};
    for (const d of ds) {
      const candidates = es.filter(x => x.round === d.round && x.event.thrower !== null && x.event.thrower === d.event.attacker);
      for (const e of candidates) { const delta = d.event.tick - e.event.tick; deltas[delta] = (deltas[delta] ?? 0) + 1; }
      if (candidates.length === 1) { const delta = d.event.tick - candidates[0].event.tick; uniqueEffectDeltas[delta] = (uniqueEffectDeltas[delta] ?? 0) + 1; }
    }
    for (const e of es) { const n = es.filter(x => x.round === e.round && x.event.thrower === e.event.thrower).length; multiplicity[n] = (multiplicity[n] ?? 0) + 1; }
    const exactCounts = ds.map(d => es.filter(e => e.round === d.round && e.event.thrower !== null && e.event.thrower === d.event.attacker && e.event.tick === d.event.tick).length);
    return { effectCount: es.length, damageCount: ds.length, exactSameThrowerTickDamageRows: exactCounts.filter(n => n === 1).length,
      ambiguousSameThrowerTickDamageRows: exactCounts.filter(n => n > 1).length, unlinkedDamageRows: exactCounts.filter(n => n === 0).length,
      sameThrowerRoundEffectMultiplicity: multiplicity, allSameThrowerRoundCandidateTickDeltas: deltas, singleEffectSameThrowerRoundTickDeltas: uniqueEffectDeltas,
      stableDamageEntityLinkAvailable: false };
  };
  const fs = effects("flashbang"), blinds = rows.filter(x => x.event.type === "flash");
  const candidates = f => fs.filter(e => e.round === f.round && e.event.entityId !== undefined && e.event.entityId === f.event.entityId);
  const reused = fs.filter(e => fs.filter(x => x.round === e.round && x.event.entityId === e.event.entityId).length > 1);
  const exactTickDeltas = {};
  for (const f of blinds) {
    const es = candidates(f);
    if (es.length === 1 && es[0].event.thrower !== null && es[0].event.thrower === f.event.attacker) {
      const delta = f.event.tick - es[0].event.tick; exactTickDeltas[delta] = (exactTickDeltas[delta] ?? 0) + 1;
    }
  }
  return { he: damageResearch("hegrenade"), fire: damageResearch("fire"), flash: {
    detonationCount: fs.length, detonationEntityIdPresent: fs.filter(x => x.event.entityId !== undefined).length,
    victimEffectCount: blinds.length, victimEffectEntityIdPresent: blinds.filter(x => x.event.entityId !== undefined).length,
    exactUniqueRoundEntityActorVictimRows: blinds.filter(f => candidates(f).length === 1 && candidates(f)[0].event.thrower !== null && candidates(f)[0].event.thrower === f.event.attacker).length,
    reusedRoundEntityEffectRows: reused.length, ambiguousVictimRows: blinds.filter(f => candidates(f).length > 1).length,
    actorMismatchVictimRows: blinds.filter(f => candidates(f).length === 1 && candidates(f)[0].event.thrower !== f.event.attacker).length,
    unmatchedVictimRows: blinds.filter(f => candidates(f).length === 0).length,
    exactEntityActorTickDeltas: exactTickDeltas,
  } };
}
