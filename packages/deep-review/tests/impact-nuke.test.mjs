import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Demoparser2Provider } from "../../dem-parser/dist/index.js";
import { analyzeEngagements, analyzeKillImpact } from "../dist/index.js";

const demo = fileURLToPath(new URL("../../../.demo/spirit-vs-faze-m1-nuke.dem", import.meta.url));
const sha = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const key = ref => JSON.stringify([ref.round, ref.type, ref.tick, ref.eventIndex]);
const projection = multi => ({ round: multi.round, playerId: multi.playerId, killCount: multi.killCount,
  kills: multi.kills.map(k => ({ eventRef: k.eventRef, before: k.before, afterAtomicGroup: k.afterAtomicGroup,
    tags: k.tags, posthumous: k.posthumous, atomicGroup: k.atomicGroup, engagementId: k.engagementId, coverage: k.coverage })),
  engagementIds: multi.engagementIds, roundSide: multi.roundSide, roundWinner: multi.roundWinner,
  roundResult: multi.roundResult, tags: multi.tags, coverage: multi.coverage });

test("Nuke kill impact structural invariants and automatic human inspection sample", {
  skip: !existsSync(demo) ? "Local Nuke fixture missing; no downloads" : false,
}, async t => {
  const match = await new Demoparser2Provider().parse(demo);
  assert.equal(match.id, "dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c");
  const engagement = analyzeEngagements(match), original = sha({ match, engagement });
  const result = analyzeKillImpact(match, engagement);
  assert.deepEqual(result, analyzeKillImpact(match, engagement));
  assert.deepEqual(result, JSON.parse(JSON.stringify(result)));
  assert.equal(sha({ match, engagement }), original);
  const refs = new Map(result.kills.map(k => [key(k.eventRef), k]));
  assert.equal(refs.size, result.kills.length);
  const expectedEnemyRefs = [];
  for (const round of match.rounds) round.events.forEach((e, eventIndex) => {
    if (e.type === "kill" && e.tick >= round.startTick && e.tick <= round.endTick
      && /^[1-9]\d*$/.test(e.killer) && /^[1-9]\d*$/.test(e.victim) && e.killer !== e.victim
      && ["CT", "T"].includes(e.killerSide) && ["CT", "T"].includes(e.victimSide) && e.killerSide !== e.victimSide && e.teamkill !== true)
      expectedEnemyRefs.push(key({ round: round.number, type: "kill", tick: e.tick, eventIndex }));
  });
  assert.deepEqual([...refs.keys()].sort(), expectedEnemyRefs.sort());
  let appliedDeaths = 0, completeRounds = 0;
  for (const state of result.rounds) {
    const round = match.rounds.find(r => r.number === state.round);
    const expectedDeaths = round.events.flatMap((e, eventIndex) => e.type === "kill" && e.tick >= round.startTick && e.tick <= round.endTick
      ? [key({ round: round.number, type: "kill", tick: e.tick, eventIndex })] : []);
    assert.deepEqual(state.groups.flatMap(g => g.deathRefs.map(key)).sort(), expectedDeaths.sort());
    if (state.coverage.status === "unavailable") {
      assert.ok(state.groups.every(g => g.before === null && g.after === null && !g.appliedVictimIds.length)); continue;
    }
    completeRounds++;
    const snapshot = round.stateSnapshots.find(s => s.boundary === state.baseline.boundary && s.tick === state.baseline.tick);
    const alive = new Map(snapshot.players.filter(p => p.participant === true && p.alive === true).map(p => [p.steamId, p.side]));
    const observedDeaths = new Set();
    const count = () => ({ CT: [...alive.values()].filter(s => s === "CT").length, T: [...alive.values()].filter(s => s === "T").length });
    for (const group of state.groups) {
      assert.deepEqual(group.before, count());
      // Independent set oracle applies victims together, without attacker eligibility.
      const victims = group.deathRefs.map(ref => round.events[ref.eventIndex].victim).sort();
      assert.deepEqual(group.appliedVictimIds, victims);
      for (const victim of victims) { assert.ok(!observedDeaths.has(victim)); assert.ok(alive.has(victim)); observedDeaths.add(victim); alive.delete(victim); appliedDeaths++; }
      assert.deepEqual(group.after, count());
      assert.ok(group.after.CT >= 0 && group.after.T >= 0);
      for (const ref of group.deathRefs) {
        const k = refs.get(key(ref)); if (!k) continue;
        assert.deepEqual(k.before, { teamAlive: group.before[k.killerSide], enemyAlive: group.before[k.victimSide] });
        assert.deepEqual(k.afterAtomicGroup, { teamAlive: group.after[k.killerSide], enemyAlive: group.after[k.victimSide] });
        if (group.deathRefs.length > 1) assert.ok(k.tags.every(tag => ["opening-group", "sole-survivor-kill", "posthumous"].includes(tag)));
        const earlier = round.events.some(e => e.type === "kill" && e.victim === k.killerId && e.tick > state.baseline.tick && e.tick < ref.tick);
        assert.equal(k.posthumous, earlier);
        if (k.posthumous) { assert.ok(!alive.has(k.killerId)); assert.ok(!k.tags.includes("sole-survivor-kill")); }
      }
    }
  }
  for (const k of result.kills) {
    const round = match.rounds.find(r => r.number === k.eventRef.round), e = round.events[k.eventRef.eventIndex];
    assert.equal(e.type, "kill"); assert.equal(e.tick, k.eventRef.tick); assert.equal(e.killer, k.killerId); assert.equal(e.victim, k.victimId);
    const direct = engagement.directContacts.filter(c => key(c.eventRef) === key(k.eventRef));
    const groups = engagement.engagements.filter(g => g.contacts.some(c => key(c.eventRef) === key(k.eventRef)));
    if (direct.length === 1 && groups.length === 1) assert.equal(k.engagementId, groups[0].id);
    else assert.equal(k.engagementId, null);
    if (e.weapon === "hegrenade" || e.weapon === "inferno") assert.equal(k.engagementId, null);
  }
  for (const multi of result.multiKills) {
    assert.ok(multi.killCount >= 2); assert.equal(multi.killCount, multi.kills.length);
    assert.equal(new Set(multi.kills.map(k => key(k.eventRef))).size, multi.killCount);
    for (const k of multi.kills) assert.deepEqual(k, refs.get(key(k.eventRef)));
    const round = match.rounds.find(r => r.number === multi.round), state = result.rounds.find(r => r.round === multi.round);
    const snapshot = round.stateSnapshots.find(s => s.boundary === state.baseline.boundary && s.tick === state.baseline.tick);
    const side = snapshot.players.find(p => p.steamId === multi.playerId && p.participant === true).side;
    assert.equal(multi.roundSide, side); assert.equal(multi.roundWinner, round.winner);
    assert.equal(multi.roundResult, round.winner === null ? "unknown" : side === round.winner ? "win" : "loss");
  }
  const doubles = result.multiKills.filter(m => m.killCount === 2), triples = result.multiKills.filter(m => m.killCount >= 3);
  const lost = result.multiKills.filter(m => m.roundResult === "loss");
  const sole = result.kills.find(k => k.tags.includes("sole-survivor-kill"));
  const atomic = result.rounds.flatMap(r => r.groups).find(g => g.deathRefs.length > 1);
  const samples = {
    doubleKills: doubles.slice(0, 3).map(projection), triplePlusKills: triples.slice(0, 3).map(projection),
    roundLostMultiKill: lost.length ? projection(lost[0]) : null,
    soleSurvivorSequence: sole ? projection(result.multiKills.find(m => m.round === sole.eventRef.round && m.playerId === sole.killerId)
      ?? { round: sole.eventRef.round, playerId: sole.killerId, killCount: 1, kills: [sole], engagementIds: sole.engagementId ? [sole.engagementId] : [],
        roundSide: sole.killerSide, roundWinner: match.rounds.find(r => r.number === sole.eventRef.round).winner,
        roundResult: match.rounds.find(r => r.number === sole.eventRef.round).winner === null ? "unknown"
          : match.rounds.find(r => r.number === sole.eventRef.round).winner === sole.killerSide ? "win" : "loss", tags: [], coverage: sole.coverage }) : null,
    sameTickAtomicCase: atomic ? { group: atomic, kills: result.kills.filter(k => k.eventRef.round === atomic.round && k.eventRef.tick === atomic.tick) } : null,
  };
  assert.equal(samples.doubleKills.length, Math.min(3, doubles.length)); assert.equal(samples.triplePlusKills.length, Math.min(3, triples.length));
  const report = { fixtureSha256: match.id, analysisHash: sha(result), diagnostics: result.diagnostics, coverage: result.coverage,
    multiKillStructure: { roundWon: result.multiKills.filter(m => m.roundResult === "win").length,
      roundLost: lost.length, roundUnknown: result.multiKills.filter(m => m.roundResult === "unknown").length,
      singleEngagement: result.multiKills.filter(m => m.tags.includes("single-engagement")).length,
      multiEngagement: result.multiKills.filter(m => m.tags.includes("multi-engagement")).length,
      tagCounts: Object.fromEntries([...new Set(result.multiKills.flatMap(m => m.tags))].sort().map(tag => [tag, result.multiKills.filter(m => m.tags.includes(tag)).length])) },
    structuralValidation: { deterministic: true, inputImmutable: true, uniqueDeathAdvancement: true, nonnegativeCounts: true,
      atomicSameTick: true, exactKillRefs: true, exactEngagementLinkage: true, utilityMayBeUnlinked: true,
      noPosthumousResurrection: true, uniqueMultiKillRefs: true, snapshotRoundConversion: true, eligibleRounds: completeRounds, appliedDeaths },
    observedCases: { sameTickDeathGroups: result.diagnostics.sameTickDeathGroups, posthumousKills: result.diagnostics.posthumousKills,
      utilityEnemyKills: result.kills.filter(k => k.weapon === "hegrenade" || k.weapon === "inferno").length,
      absentCasesValidatedBySyntheticOnly: ["same-tick atomic deaths", "posthumous grenade kill", "utility kill without Engagement"] },
    roundCoverage: result.rounds.map(r => ({ round: r.round, baseline: r.baseline, coverage: r.coverage })),
    sampleSelection: { policy: "First by round/playerId; no player name, team, winner or round constants", availableDoubleKills: doubles.length,
      availableTriplePlusKills: triples.length, availableLostMultiKills: lost.length,
      availableSoleSurvivorKills: result.kills.filter(k => k.tags.includes("sole-survivor-kill")).length,
      availableAtomicGroups: result.diagnostics.sameTickDeathGroups }, samples };
  if (process.env.CS2_ANALYST_WRITE_IMPACT_REPORT === "1") await writeFile(new URL("../../../docs/deep-review-impact-nuke.json", import.meta.url), JSON.stringify(report, null, 2) + "\n", "utf8");
  t.diagnostic(JSON.stringify({ diagnostics: report.diagnostics, coverage: report.coverage, samples: report.sampleSelection, structural: report.structuralValidation }));
});
