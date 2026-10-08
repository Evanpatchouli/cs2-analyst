import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Demoparser2Provider } from "../../dem-parser/dist/index.js";
import { analyzeEngagements, analyzeKillImpact, analyzeTeamplay } from "../dist/index.js";

const demo = fileURLToPath(new URL("../../../.demo/spirit-vs-faze-m1-nuke.dem", import.meta.url));
const hash = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const key = r => JSON.stringify([r.round, r.type, r.tick, r.eventIndex]);
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
test("Nuke Teamplay structural invariants, spatial oracle and automatic samples", {
  skip: !existsSync(demo) ? "Local Nuke fixture missing; no downloads" : false,
}, async t => {
  const { match, spatial } = await new Demoparser2Provider().parseWithSpatial(demo);
  assert.equal(match.id, "dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c");
  const e = analyzeEngagements(match, spatial), k = analyzeKillImpact(match, e), original = hash({ match, spatial, e, k });
  const result = analyzeTeamplay(match, e, k, spatial), noSpatial = analyzeTeamplay(match, e, k);
  assert.deepEqual(result, analyzeTeamplay(match, e, k, spatial)); assert.deepEqual(result, JSON.parse(JSON.stringify(result)));
  assert.equal(hash({ match, spatial, e, k }), original);
  const groups = new Map(e.engagements.map(g => [g.id, g])), direct = new Map(e.directContacts.map(c => [key(c.eventRef), c]));
  const link = new Map(e.engagements.flatMap(g => g.contacts.map(c => [key(c.eventRef), g.id])));
  const raw = ref => match.rounds.find(r => r.number === ref.round).events[ref.eventIndex];
  const stateFor = round => k.rounds.find(s => s.round === round);
  const sideFor = (c, id) => { const event = raw(c.eventRef); return id === c.attackerId ? event.killerSide ?? event.attackerSide : event.victimSide; };
  let tierChecks = 0, responseChecks = 0, spatialChecks = 0;
  for (const c of result.playerEngagementContexts) {
    const g = groups.get(c.engagementId); assert.ok(g); assert.equal(g.round, c.round); assert.ok(g.participantIds.includes(c.playerId));
    const own = g.contacts.filter(x => x.attackerId === c.playerId || x.victimId === c.playerId);
    assert.equal(c.firstContactTick, Math.min(...own.map(x => x.eventRef.tick))); assert.equal(c.lastContactTick, Math.max(...own.map(x => x.eventRef.tick)));
    assert.ok(own.some(x => key(x.eventRef) === key(c.firstContactRef))); assert.equal(c.contactCount, own.length);
    const same = g.participantIds.filter(id => sideFor(g.contacts.find(x => x.attackerId === id || x.victimId === id), id) === c.side).sort(cmp);
    assert.deepEqual(c.sideParticipantIds, same); assert.equal(c.onlyConfirmedSideParticipant, same.length === 1);
    const firsts = same.map(id => [id, Math.min(...g.contacts.filter(x => x.attackerId === id || x.victimId === id).map(x => x.eventRef.tick))]);
    const ticks = [...new Set(firsts.map(([, tick]) => tick))].sort((a, b) => a - b);
    const tiers = ticks.map(tick => ({ tick, playerIds: firsts.filter(([, first]) => first === tick).map(([id]) => id).sort(cmp) }));
    assert.deepEqual(c.sideContactTiers, tiers); tierChecks++;
    assert.equal(c.firstSideContactRole, c.coverage.engagementParticipation.reasons.includes("engagement-evidence-incomplete") ? "unknown"
      : c.firstContactTick > ticks[0] ? "later" : tiers[0].playerIds.length === 1 ? "unique-first" : "shared-first");
    if (c.firstSideContactRole === "shared-first") assert.equal(c.teammateJoinDelaySeconds, 0);
    if (c.firstSideContactRole === "unique-first" && same.length > 1) assert.equal(c.teammateJoinDelaySeconds, (ticks[1] - ticks[0]) / match.tickRate);
  }
  const geometries = [...result.playerEngagementContexts.map(c => ({ id: c.playerId, s: c.spatialContext })),
    ...result.teammateDeathResponses.map(c => ({ id: c.playerId, s: c.spatialContext })), ...result.playerDeathContexts.map(c => ({ id: c.playerId, s: c.spatialContext }))];
  for (const { id, s } of geometries) {
    const ref = s.eventRef, evidence = spatial.events.filter(x => x.eventRef.type !== "round_boundary" && key(x.eventRef) === key(ref));
    assert.equal(evidence.length, 1); const state = stateFor(ref.round), player = state.players.find(p => p.playerId === id);
    const sample = id => evidence[0].samples.find(b => b.sample.playerId === id && b.sample.relation === "at-event"
      && b.sample.actualTick === ref.tick && b.sample.requestedTick === ref.tick)?.sample;
    const origin = sample(id).position;
    const candidates = state.players.filter(p => p.side === player.side && p.playerId !== id && p.aliveAtBaseline && (p.deathTick === null || p.deathTick > ref.tick))
      .flatMap(p => { const point = sample(p.playerId)?.position; if (!origin || !point) return [];
        const horizontalDistance = Math.hypot(origin.x - point.x, origin.y - point.y), verticalDelta = Math.abs(origin.z - point.z);
        return [{ teammateId: p.playerId, horizontalDistance, verticalDelta, directDistance: Math.hypot(horizontalDistance, verticalDelta) }]; })
      .sort((a, b) => a.directDistance - b.directDistance || cmp(a.teammateId, b.teammateId));
    assert.deepEqual(s.nearestConfirmedAliveTeammate, candidates[0] ?? null);
    assert.deepEqual(s.sameTickAliveAmbiguousIds, state.players.filter(p => p.side === player.side && p.playerId !== id && p.deathTick === ref.tick).map(p => p.playerId).sort(cmp));
    if (s.nearestConfirmedAliveTeammate) assert.notEqual(state.players.find(p => p.playerId === s.nearestConfirmedAliveTeammate.teammateId).deathTick, ref.tick);
    spatialChecks++;
  }
  const check = (row, team) => {
    const ref = row.deathRef, event = raw(ref); assert.equal(event.type, "kill"); assert.equal(event.tick, ref.tick); assert.equal(event.killer, row.killerId);
    const state = stateFor(ref.round), victim = state.players.find(p => p.playerId === event.victim), killer = state.players.find(p => p.playerId === row.killerId);
    if (killer.deathTick !== null && killer.deathTick < ref.tick) { assert.equal(row.killerState, "dead-before"); assert.equal(row.outcome, "unavailable"); }
    if (killer.deathTick === ref.tick) { assert.equal(row.killerState, "dies-same-tick"); assert.equal(row.outcome, "unavailable"); }
    const ids = team ? state.players.filter(p => p.playerId !== victim.playerId && p.side === victim.side && p.aliveAtBaseline && (p.deathTick === null || p.deathTick > ref.tick)).map(p => p.playerId)
      : row.playerAliveAtDeath === true ? [row.playerId] : [];
    if (team) assert.equal(row.confirmedAliveTeammates, ids.length);
    else { const player = state.players.find(p => p.playerId === row.playerId);
      assert.equal(row.playerAliveAtDeath, player.deathTick === ref.tick ? null : player.aliveAtBaseline && (player.deathTick === null || player.deathTick > ref.tick)); }
    const candidates = e.directContacts.filter(c => c.eventRef.round === ref.round && ids.includes(c.attackerId) && c.victimId === row.killerId
      && c.eventRef.tick > ref.tick && (c.eventRef.tick - ref.tick) / match.tickRate <= result.config.followUpWindowSeconds)
      .sort((a, b) => a.eventRef.tick - b.eventRef.tick || cmp(a.attackerId, b.attackerId) || a.eventRef.eventIndex - b.eventRef.eventIndex);
    const followRef = team ? row.firstResponseRef : row.firstFollowUpRef;
    if (followRef) {
      assert.ok(followRef.tick > ref.tick); assert.deepEqual(followRef, candidates[0].eventRef);
      const contact = direct.get(key(followRef)); assert.ok(contact); assert.equal(contact.victimId, row.killerId);
      assert.equal(row.delaySeconds, (followRef.tick - ref.tick) / match.tickRate);
      assert.equal(row.sameEngagement, link.has(key(ref)) && link.has(key(followRef)) ? link.get(key(ref)) === link.get(key(followRef)) : null);
      assert.equal(row.outcome, candidates.some(c => c.fatal) ? "kill" : "damage");
      assert.deepEqual(row.outcomeRef, (candidates.find(c => c.fatal) ?? candidates[0]).eventRef);
    } else if (row.outcome === "none-observed") assert.equal(candidates.length, 0);
    if (row.outcome === "same-tick-ambiguous") assert.equal(row.delaySeconds, null);
    for (const same of row.sameTickContactRefs) { assert.equal(same.tick, ref.tick); assert.ok(direct.has(key(same))); }
    responseChecks++;
  };
  for (const r of result.teammateDeathResponses) check(r, false);
  for (const r of result.playerDeathTeamResponses) check(r, true);
  // Spatial absence must not alter any event-derived participation/response field.
  const stripSpatial = rows => rows.map(({ coverage, spatialContext, ...rest }) => ({ ...rest,
    ...(rest.teamResponse ? { teamResponse: { ...rest.teamResponse, coverage: { ...rest.teamResponse.coverage, spatialContext: null } } } : {}),
    coverage: { ...coverage, spatialContext: null } }));
  for (const field of ["playerEngagementContexts", "teammateDeathResponses", "playerDeathContexts", "playerDeathTeamResponses"])
    assert.deepEqual(stripSpatial(result[field]), stripSpatial(noSpatial[field]));
  const firstContext = role => result.playerEngagementContexts.find(c => c.firstSideContactRole === role) ?? null;
  const firstPeer = outcome => result.teammateDeathResponses.find(r => r.outcome === outcome) ?? null;
  const firstTeam = outcome => result.playerDeathContexts.find(r => r.teamResponse.outcome === outcome) ?? null;
  const samples = { uniqueFirst: firstContext("unique-first"), sharedFirst: firstContext("shared-first"), later: firstContext("later"),
    onlyConfirmedSideParticipant: result.playerEngagementContexts.find(c => c.onlyConfirmedSideParticipant) ?? null,
    teammateDeathKill: firstPeer("kill"), teammateDeathDamage: firstPeer("damage"), teammateDeathNone: firstPeer("none-observed"),
    playerDeathTeamKill: firstTeam("kill"), playerDeathTeamDamage: firstTeam("damage"), playerDeathTeamNone: firstTeam("none-observed"),
    sameTickAmbiguous: firstPeer("same-tick-ambiguous") ?? firstTeam("same-tick-ambiguous"),
    deadBeforePosthumous: result.teammateDeathResponses.find(r => r.killerState === "dead-before") ?? null };
  const report = { fixtureSha256: match.id, analysisHash: hash(result), config: result.config, diagnostics: result.diagnostics, coverage: result.coverage,
    inputCoverage: { eventSegmentation: e.coverage.eventSegmentation, roundState: k.coverage.roundState },
    unknownRoleRounds: [...new Set(result.playerEngagementContexts.filter(c => c.firstSideContactRole === "unknown").map(c => c.round))].sort((a, b) => a - b),
    structuralValidation: { exactEngagementMapping: true, atomicTiers: true, firstRoleDefinitions: true, strictLaterResponses: true,
      sameTickNotCausal: true, deadKillerNoNoneObserved: true, exactResponseRefs: true, actualEngagementIdComparison: true,
      exactSpatialOracle: true, sameTickAliveExcluded: true, noSpatialEventStability: true, deterministic: true, inputImmutable: true,
      tierChecks, responseChecks, spatialChecks },
    observedCases: { sameTickAmbiguousResponses: result.diagnostics.teammateDeathResponsesAmbiguous + result.diagnostics.teamResponsesAmbiguous,
      deadBeforeResponses: result.teammateDeathResponses.filter(r => r.killerState === "dead-before").length,
      killerDiesSameTickResponses: result.teammateDeathResponses.filter(r => r.killerState === "dies-same-tick").length },
    sampleSelection: { policy: "First in deterministic round/contact/playerId order by structural predicate; no name/team/round constants", available: Object.fromEntries(Object.entries(samples).map(([key, value]) => [key, value !== null])) },
    limitations: { personalDemCompatibility: "UNVERIFIED", geometry: "Distances are raw map units. Nuke players may be on different floors; even small XYZ distance does not prove supportability.",
      absentCases: "Absent real cases are verified by synthetic tests only; no replay or causal coaching claims." }, samples };
  if (process.env.CS2_ANALYST_WRITE_TEAMPLAY_REPORT === "1") await writeFile(new URL("../../../docs/deep-review-teamplay-nuke.json", import.meta.url), JSON.stringify(report, null, 2) + "\n", "utf8");
  t.diagnostic(JSON.stringify({ diagnostics: report.diagnostics, coverage: report.coverage, observed: report.observedCases, samples: report.sampleSelection, checks: report.structuralValidation }));
});
