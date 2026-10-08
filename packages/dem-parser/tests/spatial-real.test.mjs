import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Demoparser2Provider } from "../dist/index.js";

const demo = fileURLToPath(new URL("../../../.demo/nuke.dem", import.meta.url));
const fingerprint = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("real Nuke: exact event references, actor/target relations, alive weapons, core preservation and determinism", {
  skip: !existsSync(demo) ? "Local Nuke fixture missing; no downloads" : false,
}, async t => {
  const provider = new Demoparser2Provider();
  const started = performance.now();
  const baseline = await provider.parse(demo);
  const standaloneParserMs = performance.now() - started;
  // Only the hash locks fixture identity. No teams, names, scores or match results.
  assert.equal(baseline.id, "dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c");
  const first = await provider.parseWithSpatial(demo);
  assert.deepEqual(first.match, baseline);
  const { match, spatial } = first;
  const expectedCore = [...new Set(match.rounds.flatMap(round => [round.startTick, round.freezeEndTick, round.endTick,
    ...round.events.map(event => event.tick)]).filter(tick => tick !== undefined))].sort((a, b) => a - b);
  assert.deepEqual(spatial.sampling.coreTicks, expectedCore);
  assert.ok(expectedCore.every(tick => spatial.sampling.returnedTicks.includes(tick)));
  assert.equal(spatial.events.length, match.rounds.reduce((sum, round) => sum + round.events.length
    + [round.startTick, round.freezeEndTick, round.endTick].filter(tick => tick !== undefined).length, 0));
  let kills = 0, boundaries = 0;
  let identifiedKillActors = 0, unidentifiedKillActors = 0;
  const uniqueSamples = new Map();
  const killCoverage = { atActor: 0, atTarget: 0, beforeActor: 0, beforeTarget: 0, afterActor: 0, afterTarget: 0 };
  for (const evidence of spatial.events) {
    const ref = evidence.eventRef;
    const round = match.rounds.find(round => round.number === ref.round);
    assert.ok(round);
    if (ref.type === "round_boundary") {
      boundaries++;
      const field = { start: "startTick", freeze_end: "freezeEndTick", end: "endTick" }[ref.boundary];
      assert.equal(round[field], ref.tick);
    } else {
      const event = round.events[ref.eventIndex];
      assert.equal(event.type, ref.type);
      assert.equal(event.tick, ref.tick);
      if (ref.type === "kill") {
        kills++;
        for (const [role, player] of [["actor", event.killer], ["target", event.victim]]) {
          const id = /^[1-9]\d*$/.test(player) ? player : null;
          assert.deepEqual(evidence.participants.find(participant => participant.role === role), { role, playerId: id });
          if (role === "actor") { if (id) identifiedKillActors++; else unidentifiedKillActors++; }
          if (!id) {
            assert.ok(evidence.coverage.reasons.includes("participant-unidentified"));
            continue;
          }
          assert.ok(evidence.samples.some(binding => binding.role === role && binding.sample.playerId === player));
          for (const [relation, key] of [["at-event", "at"], ["before-event", "before"], ["after-event", "after"]]) {
            const sample = evidence.samples.find(binding => binding.role === role && binding.sample.relation === relation)?.sample;
            assert.ok(sample);
            if (sample.coverage.status === "complete") killCoverage[`${key}${role === "actor" ? "Actor" : "Target"}`]++;
          }
        }
      }
    }
    for (const { sample } of evidence.samples) {
      assert.equal(typeof sample.playerId, "string");
      if (["at-event", "boundary"].includes(sample.relation)) {
        assert.equal(sample.requestedTick, ref.tick);
        assert.equal(sample.actualTick, ref.tick);
        assert.equal(sample.coverage.status, "complete");
      }
      if (sample.relation === "before-event") assert.ok(sample.requestedTick < ref.tick);
      if (sample.relation === "after-event") assert.ok(sample.requestedTick > ref.tick);
      if (sample.actualTick !== null) {
        assert.equal(sample.actualTick, sample.requestedTick);
        if (sample.relation === "before-event") assert.ok(sample.actualTick < ref.tick);
        if (sample.relation === "after-event") assert.ok(sample.actualTick > ref.tick);
        if (sample.alive === true) assert.equal(sample.fields.weapon, "complete");
      }
      if (!sample.coverage.reasons.includes("context-outside-round")) uniqueSamples.set(`${sample.requestedTick}:${sample.playerId}`, sample);
    }
  }
  assert.ok(kills > 0 && boundaries > 0);
  assert.equal(killCoverage.atActor, identifiedKillActors);
  assert.equal(killCoverage.atTarget, kills);
  assert.ok(killCoverage.beforeActor > 0 && killCoverage.beforeTarget > 0);
  const evidenceHash = fingerprint(spatial);
  const repeat = await provider.parseWithSpatial(demo);
  assert.equal(fingerprint(repeat.spatial), evidenceHash);
  assert.deepEqual(repeat.match, baseline);
  const coreOnly = await provider.parseWithSpatial(demo, { tickBudget: 0 });
  assert.deepEqual(coreOnly.spatial.sampling.coreTicks, expectedCore);
  assert.deepEqual(coreOnly.spatial.sampling.optionalTicks, []);
  assert.ok(coreOnly.spatial.sampling.omittedOptionalTicks.length > 0);
  for (const evidence of coreOnly.spatial.events) for (const { sample } of evidence.samples) {
    if (["at-event", "boundary"].includes(sample.relation)) assert.equal(sample.coverage.status, "complete");
  }
  const samples = [...uniqueSamples.values()];
  const alive = samples.filter(sample => sample.alive === true);
  const missingTicks = [...new Set(samples.filter(sample => sample.coverage.reasons.includes("requested-tick-missing")).map(sample => sample.requestedTick))].sort((a, b) => a - b);
  const summary = {
    schema: "P5.7.1-spatial-validation-v1", fixtureSha256: match.id,
    map: match.map, rounds: match.rounds.length, players: match.players.length,
    evidenceHash, deterministic: true, matchUnchanged: true, coreBudgetZeroPreserved: true,
    eventReferences: spatial.events.length, killReferences: kills, boundaryReferences: boundaries,
    identifiedKillActors, unidentifiedKillActors, killCoverage,
    coreTickCount: spatial.sampling.coreTicks.length, optionalTickCount: spatial.sampling.optionalTicks.length,
    requestedTickCount: spatial.sampling.coreTicks.length + spatial.sampling.optionalTicks.length,
    returnedTickCount: spatial.sampling.returnedTicks.length, rowCount: spatial.sampling.rowCount,
    omittedOptionalTickCount: spatial.sampling.omittedOptionalTicks.length, missingTicks,
    requiredCompleteSamples: samples.filter(sample => sample.coverage.status === "complete").length,
    expectedPlayerSamples: samples.length,
    aliveWeapon: { available: alive.filter(sample => sample.activeWeapon !== null).length, aliveRows: alive.length },
    coverage: spatial.coverage,
    performance: { standaloneParserMs, sharedInputRuns: [first.performance, repeat.performance], coreOnly: coreOnly.performance,
      inputReadsPerSpatialParse: 1, spatialNativeQueriesPerParse: 1, peakMemory: "UNKNOWN" },
    personalDemoCompatibility: "UNVERIFIED",
  };
  t.diagnostic(JSON.stringify(summary));
  if (process.env.SPATIAL_REPORT_FILE) await writeFile(process.env.SPATIAL_REPORT_FILE, JSON.stringify(summary, null, 2) + "\n", "utf8");
});
