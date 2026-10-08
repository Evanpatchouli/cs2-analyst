import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Demoparser2Provider } from "../../dem-parser/dist/index.js";
import { analyzeUtilityContext, analyzeKillImpact } from "../dist/index.js";
import { researchUtility } from "./utility-research.mjs";
const demo = fileURLToPath(new URL("../../../.demo/nuke.dem", import.meta.url));
const hash = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const key = r => JSON.stringify([r.round, r.type, r.tick, r.eventIndex]);
test("Nuke utility linkage research, independent spatial/alive oracle and structural samples", { skip: !existsSync(demo) ? "Local Nuke missing; no downloads" : false }, async t => {
  const { match, spatial } = await new Demoparser2Provider().parseWithSpatial(demo);
  assert.equal(match.id, "dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c");
  const k = analyzeKillImpact(match), before = hash({ match, spatial, k });
  const a = analyzeUtilityContext(match, spatial, k), noSpatial = analyzeUtilityContext(match, undefined, k), research = researchUtility(match);
  assert.deepEqual(a, analyzeUtilityContext(match, spatial, k)); assert.deepEqual(a, JSON.parse(JSON.stringify(a))); assert.equal(hash({ match, spatial, k }), before);
  assert.equal(a.effects.length, match.rounds.reduce((n, r) => n + r.events.filter(e => e.type === "utility").length, 0));
  let spatialChecks = 0, damageChecks = 0, flashChecks = 0;
  const claimedDamageRefs = new Set(), claimedFlashRefs = new Set();
  for (const [i, c] of a.effects.entries()) {
    const round = match.rounds.find(r => r.number === c.effectRef.round), state = k.rounds.find(s => s.round === round.number), raw = round.events[c.effectRef.eventIndex];
    assert.equal(raw.type, "utility"); assert.equal(raw.tick, c.effectRef.tick); assert.equal(raw.utility, c.effectRef.utility); assert.deepEqual(c.position, raw.position ?? null);
    assert.deepEqual(c.directOutcome, noSpatial.effects[i].directOutcome); assert.deepEqual(c.roundContext, noSpatial.effects[i].roundContext);
    const evidence = spatial.events.filter(e => e.eventRef.type === "utility" && key(e.eventRef) === key(c.effectRef)); assert.equal(evidence.length, 1);
    const eligible = raw.tick >= round.startTick && raw.tick <= round.endTick && raw.tick >= state.baseline.tick;
    const facts = [];
    if (eligible && c.coverage.spatialContext.status !== "unavailable") for (const p of state.players) {
      if (p.playerId === c.throwerId || !p.aliveAtBaseline || p.deathTick !== null && p.deathTick <= raw.tick) continue;
      const samples = evidence[0].samples.filter(b => b.sample.playerId === p.playerId && b.sample.relation === "at-event" && b.sample.actualTick === raw.tick && b.sample.requestedTick === raw.tick);
      if (samples.length !== 1 || samples[0].sample.fields.position !== "complete" || !samples[0].sample.position) continue;
      const point = samples[0].sample.position, xy = Math.sqrt((raw.position.x - point.x) ** 2 + (raw.position.y - point.y) ** 2), z = Math.abs(raw.position.z - point.z);
      facts.push({ playerId: p.playerId, sideRelation: p.side === raw.throwerSide ? "teammate" : "enemy", horizontalDistance: xy, verticalDelta: z, directDistance: Math.sqrt(xy ** 2 + z ** 2) });
    }
    const order = (x, y) => x.directDistance - y.directDistance || (x.playerId < y.playerId ? -1 : x.playerId > y.playerId ? 1 : 0);
    for (const relation of ["enemy", "teammate"]) {
      const expected = facts.filter(f => f.sideRelation === relation).sort(order), actual = relation === "enemy" ? c.enemiesWithPosition : c.teammatesWithPosition;
      assert.equal(actual.length, expected.length);
      actual.forEach((f, j) => { assert.equal(f.playerId, expected[j].playerId); for (const field of ["horizontalDistance", "verticalDelta", "directDistance"]) assert.ok(Math.abs(f[field] - expected[j][field]) < 1e-8); });
      assert.deepEqual(relation === "enemy" ? c.nearestEnemy : c.nearestTeammate, actual[0] ?? null);
    }
    if (eligible && c.roundContext.teamAlive !== null) {
      assert.equal(c.roundContext.teamAlive, state.players.filter(p => p.side === raw.throwerSide && p.aliveAtBaseline && (p.deathTick === null || p.deathTick > raw.tick)).length);
      assert.equal(c.roundContext.enemyAlive, state.players.filter(p => p.side !== raw.throwerSide && p.aliveAtBaseline && (p.deathTick === null || p.deathTick > raw.tick)).length);
    }
    spatialChecks++;
    if (c.directOutcome.kind === "he") {
      for (const d of c.directOutcome.damageEvents) {
        const rawDamage = round.events[d.eventRef.eventIndex]; assert.equal(rawDamage.type, "damage"); assert.equal(rawDamage.attacker, raw.thrower); assert.equal(rawDamage.tick, raw.tick); assert.equal(rawDamage.healthDamage, d.reportedHealthDamage);
        assert.equal(rawDamage.weapon.replace(/^weapon_/, ""), "hegrenade"); assert.ok(!claimedDamageRefs.has(key(d.eventRef))); claimedDamageRefs.add(key(d.eventRef)); damageChecks++;
      }
      if (c.directOutcome.linkage === "exact") {
        const expected = round.events.filter(d => d.type === "damage" && d.attacker === raw.thrower && d.tick === raw.tick && d.weapon?.replace(/^weapon_/, "") === "hegrenade");
        assert.equal(c.directOutcome.damageEvents.length, expected.length);
        assert.equal(c.directOutcome.reportedEnemyDamage, expected.filter(d => d.attacker !== d.victim && d.attackerSide !== d.victimSide).reduce((n, d) => n + d.healthDamage, 0));
      }
    }
    if (c.directOutcome.kind === "flash") for (const group of ["enemyEffects", "teammateEffects", "selfEffects", "unknownEffects"]) for (const f of c.directOutcome[group]) {
      const rawFlash = round.events[f.eventRef.eventIndex]; assert.equal(rawFlash.type, "flash"); assert.equal(rawFlash.entityId, raw.entityId); assert.equal(rawFlash.attacker, raw.thrower); assert.equal(rawFlash.blindDurationSeconds, f.rawBlindDurationSeconds);
      assert.equal(round.events.filter(e => e.type === "utility" && e.utility === "flashbang" && e.entityId === raw.entityId).length, 1);
      assert.ok(!claimedFlashRefs.has(key(f.eventRef))); claimedFlashRefs.add(key(f.eventRef)); flashChecks++;
    }
    if (c.directOutcome.kind === "fire") { assert.equal(c.directOutcome.reportedEnemyDamage, null); assert.equal(c.directOutcome.linkage, "unavailable"); }
  }
  assert.equal(damageChecks, research.he.exactSameThrowerTickDamageRows); assert.equal(flashChecks, research.flash.exactUniqueRoundEntityActorVictimRows);
  const find = p => a.effects.find(p) ?? null;
  const he = c => c.directOutcome.kind === "he";
  const byDistance = a.effects.filter(c => he(c) && c.nearestEnemy).sort((x, y) => x.nearestEnemy.directDistance - y.nearestEnemy.directDistance);
  const byVertical = a.effects.filter(c => c.enemiesWithPosition.length).sort((x, y) => Math.max(...y.enemiesWithPosition.map(f => f.verticalDelta)) - Math.max(...x.enemiesWithPosition.map(f => f.verticalDelta)));
  const samples = {
    heConfirmedDamage: find(c => he(c) && c.directOutcome.reportedEnemyDamage > 0),
    heZeroConfirmedDamage: find(c => he(c) && c.directOutcome.linkage === "exact" && c.directOutcome.reportedEnemyDamage === 0),
    heMinimumObservedEnemyDistance: byDistance[0] ?? null,
    smokePositionedEnemies: find(c => c.effectRef.utility === "smoke" && c.enemiesWithPosition.length > 0),
    firePositionedEnemies: find(c => c.effectRef.utility === "fire" && c.enemiesWithPosition.length > 0),
    flashEnemyEffects: find(c => c.directOutcome.kind === "flash" && c.directOutcome.enemyEffects.length > 0),
    flashTeammateEffects: find(c => c.directOutcome.kind === "flash" && c.directOutcome.teammateEffects.length > 0),
    plantedBombUtility: find(c => c.roundContext.bombState === "planted"),
    maximumObservedEnemyVerticalDelta: byVertical[0] ?? null,
    incompleteOrAmbiguous: find(c => c.coverage.directOutcome.reasons.includes("entity-id-ambiguous")) ?? find(c => Object.values(c.coverage).some(l => l.status !== "complete")),
  };
  assert.ok(Object.values(samples).every(Boolean));
  const report = { schemaVersion: 1, demoSha256: match.id, semantics: "Utility Effect Context; observed reported damage and raw blind durations; no intent, LOS, radius or causal inference",
    researchScope: "All Match round.events, including post-round rows; candidate delta pairs never attribute fire damage", research, diagnostics: a.diagnostics, coverage: a.coverage,
    linkageCoverage: { heEffectStatuses: Object.fromEntries(["exact", "partial", "unavailable"].map(status => [status, a.effects.filter(c => c.directOutcome.kind === "he" && c.directOutcome.linkage === status).length])),
      heConfirmedDamageRows: damageChecks, flashConfirmedVictimRows: flashChecks,
      heUnknownWeaponRoundDamageRows: match.rounds.reduce((n, r) => n + r.events.filter(d => d.type === "damage" && !d.weapon).length, 0),
      boundaryUnavailableEffects: a.effects.filter(c => c.coverage.roundState.reasons.includes("event-outside-round")).map(c => c.effectRef) },
    verification: { spatialChecks, damageChecks, flashChecks, deterministic: true, immutable: true, noSpatialOutcomeInvariant: true },
    selection: "First structural predicate in round/tick/index order; nearest and highest Z cases use observed geometry only, no effective range threshold",
    samples, personalDemCompatibility: "UNVERIFIED", unknowns: ["source feed completeness", "entity freshness", "map geometry and LOS", "recording modes", "peak memory", "effect-level flash assists"] };
  if (process.env.UTILITY_REPORT_FILE) await writeFile(process.env.UTILITY_REPORT_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");
  t.diagnostic(JSON.stringify({ diagnostics: a.diagnostics, verification: report.verification, sampleRefs: Object.fromEntries(Object.entries(samples).map(([name, c]) => [name, c?.effectRef ?? null])) }));
});
