import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
// Test-only provider; production deep-review imports only match-model types.
import { Demoparser2Provider } from "../../dem-parser/dist/index.js";
import { analyzeEngagements } from "../dist/index.js";

const demo = fileURLToPath(new URL("../../../.demo/spirit-vs-faze-m1-nuke.dem", import.meta.url));
const fingerprint = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const refKey = ref => JSON.stringify([ref.round, ref.type, ref.tick, ref.eventIndex]);
const utility = new Set(["hegrenade", "inferno", "molotov", "incgrenade", "flashbang", "smokegrenade", "decoy", "planted_c4", "c4", "bomb", "bomb_explosion"]);
const isId = id => typeof id === "string" && /^[1-9]\d*$/.test(id);

function expectedContacts(match) {
  const refs = [], exclusions = { roundWindow: 0, invalidTick: 0, preRound: 0, postRound: 0, unidentified: 0, self: 0, team: 0, unknownSide: 0, utility: 0 };
  for (const round of match.rounds) round.events.forEach((event, eventIndex) => {
    if (event.type !== "damage" && event.type !== "kill") return;
    if (!Number.isSafeInteger(round.startTick) || !Number.isSafeInteger(round.endTick) || round.startTick < 0 || round.endTick < round.startTick) { exclusions.roundWindow++; return; }
    if (!Number.isSafeInteger(event.tick) || event.tick < 0) { exclusions.invalidTick++; return; }
    if (event.tick < round.startTick) { exclusions.preRound++; return; }
    if (event.tick > round.endTick) { exclusions.postRound++; return; }
    const attacker = event.type === "kill" ? event.killer : event.attacker;
    const side = event.type === "kill" ? event.killerSide : event.attackerSide;
    if (!isId(attacker) || !isId(event.victim)) { exclusions.unidentified++; return; }
    if (attacker === event.victim) { exclusions.self++; return; }
    if (event.teamkill === true) { exclusions.team++; return; }
    if (!["CT", "T"].includes(side) || !["CT", "T"].includes(event.victimSide)) { exclusions.unknownSide++; return; }
    if (side === event.victimSide) { exclusions.team++; return; }
    if (utility.has(event.weapon?.toLowerCase().replace(/^weapon_/, ""))) { exclusions.utility++; return; }
    refs.push(refKey({ round: round.number, type: event.type, tick: event.tick, eventIndex }));
  });
  return { refs: refs.sort(), exclusions };
}

// Full graph oracle independent of the latest-participant union algorithm.
function graphPartition(contacts, gapTicks) {
  const seen = new Set(), groups = [];
  for (let i = 0; i < contacts.length; i++) {
    if (seen.has(i)) continue;
    const queue = [i], group = []; seen.add(i);
    while (queue.length) {
      const current = queue.shift(), a = contacts[current]; group.push(refKey(a.eventRef));
      for (let j = 0; j < contacts.length; j++) {
        const b = contacts[j];
        if (!seen.has(j) && a.eventRef.round === b.eventRef.round && Math.abs(a.eventRef.tick - b.eventRef.tick) <= gapTicks
          && [a.attackerId, a.victimId].some(id => id === b.attackerId || id === b.victimId)) { seen.add(j); queue.push(j); }
      }
    }
    groups.push(group.sort());
  }
  return groups.map(group => JSON.stringify(group)).sort();
}

function sensitivity(analysis) {
  const groups = analysis.engagements, durations = groups.map(group => group.durationSeconds).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  return { contactGapSeconds: analysis.config.contactGapSeconds, engagements: groups.length,
    singletons: groups.filter(group => group.contacts.length === 1).length,
    multiContact: groups.filter(group => group.contacts.length > 1).length,
    medianDurationSeconds: durations.length ? durations.length % 2 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2 : null,
    p95DurationSeconds: durations.length ? durations[Math.ceil(durations.length * 0.95) - 1] : null,
    maxDurationSeconds: durations.length ? durations.at(-1) : null,
    maxParticipants: Math.max(0, ...groups.map(group => group.participantIds.length)),
    maxContacts: Math.max(0, ...groups.map(group => group.contacts.length)) };
}

test("Nuke structural invariants, exact spatial join, independent graph partition and 2/3/4/5s sensitivity", {
  skip: !existsSync(demo) ? "Local Nuke fixture missing; no downloads" : false,
}, async t => {
  const { match, spatial } = await new Demoparser2Provider().parseWithSpatial(demo);
  assert.equal(match.id, "dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c");
  const result = analyzeEngagements(match, spatial);
  assert.equal(result.available, true);
  assert.deepEqual(result, analyzeEngagements(match, spatial));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  const expected = expectedContacts(match);
  assert.deepEqual(result.directContacts.map(contact => refKey(contact.eventRef)).sort(), expected.refs);
  for (const [reason, count] of Object.entries(expected.exclusions)) assert.equal(result.diagnostics[`excluded${reason[0].toUpperCase()}${reason.slice(1)}`], count);
  const flattened = result.engagements.flatMap(group => group.contacts);
  assert.deepEqual(flattened.map(contact => refKey(contact.eventRef)).sort(), expected.refs);
  assert.equal(new Set(flattened.map(contact => refKey(contact.eventRef))).size, flattened.length);
  assert.equal(result.diagnostics.candidateContacts, result.directContacts.length + Object.values(expected.exclusions).reduce((sum, count) => sum + count, 0));
  const spatialByRef = new Map(spatial.events.filter(item => item.eventRef.type !== "round_boundary").map(item => [refKey(item.eventRef), item]));
  for (const group of result.engagements) {
    const round = match.rounds.find(round => round.number === group.round);
    assert.ok(group.startTick >= round.startTick && group.endTick <= round.endTick);
    assert.equal(group.killCount, group.contacts.filter(contact => contact.eventRef.type === "kill").length);
    assert.equal(group.damageContactCount, group.contacts.filter(contact => contact.eventRef.type === "damage").length);
    for (const contact of group.contacts) {
      assert.equal(contact.eventRef.round, group.round);
      const event = round.events[contact.eventRef.eventIndex];
      assert.equal(contact.eventRef.type, event.type); assert.equal(contact.eventRef.tick, event.tick);
      assert.equal(contact.attackerId, event.type === "kill" ? event.killer : event.attacker);
      assert.equal(contact.victimId, event.victim); assert.equal(contact.weapon, event.weapon);
      if (event.type === "damage") { assert.equal(contact.reportedHealthDamage, event.healthDamage); assert.equal(contact.healthRemaining, event.healthRemaining); }
      else { assert.equal(contact.headshot, event.headshot); assert.equal(contact.assistedFlash, event.assistedFlash); }
      const evidence = spatialByRef.get(refKey(contact.eventRef));
      assert.ok(evidence); assert.equal(contact.spatialCoverage.joinStatus, "exact");
      assert.deepEqual(contact.spatialCoverage.evidenceCoverage, evidence.coverage);
      for (const [field, role, id, relation] of [
        ["actorAtEvent", "actor", contact.attackerId, "at-event"], ["targetAtEvent", "target", contact.victimId, "at-event"],
        ["actorBeforeEvent", "actor", contact.attackerId, "before-event"], ["targetBeforeEvent", "target", contact.victimId, "before-event"],
      ]) {
        const source = evidence.samples.find(binding => binding.role === role && binding.sample.playerId === id && binding.sample.relation === relation)?.sample;
        assert.ok(source);
        const projection = contact.spatialCoverage[field]; assert.ok(projection);
        assert.equal(projection.requestedTick, source.requestedTick); assert.equal(projection.actualTick, source.actualTick);
        assert.deepEqual(projection.coverage, source.coverage); assert.deepEqual(projection.fields, source.fields);
      }
      if (contact.sourceKind === "unknown") assert.ok(contact.coverage.reasons.includes("weapon-kind-unknown"));
    }
  }
  const runs = [2, 3, 4, 5].map(contactGapSeconds => analyzeEngagements(match, spatial, { contactGapSeconds }));
  for (const run of runs) {
    assert.deepEqual(run.engagements.map(group => JSON.stringify(group.contacts.map(contact => refKey(contact.eventRef)).sort())).sort(), graphPartition(run.directContacts, run.config.contactGapTicks));
    assert.deepEqual(run.directContacts.map(contact => refKey(contact.eventRef)).sort(), expected.refs);
  }
  const withoutSpatial = analyzeEngagements(match);
  assert.deepEqual(withoutSpatial.engagements.map(group => [group.id, group.contacts.map(contact => refKey(contact.eventRef))]), result.engagements.map(group => [group.id, group.contacts.map(contact => refKey(contact.eventRef))]));
  const report = { schema: "P5.7.2-engagement-validation-v1", fixtureSha256: match.id, analysisHash: fingerprint(result),
    rounds: match.rounds.length, tickRate: match.tickRate, config: result.config, diagnostics: result.diagnostics, coverage: result.coverage,
    groupedContacts: flattened.length, killContacts: flattened.filter(contact => contact.fatal).length,
    damageContacts: flattened.filter(contact => !contact.fatal).length,
    invariants: { everyEligibleContactExactlyOnce: true, noCrossRound: true, noDuplicateMembership: true,
      formalWindowOnly: true, utilityNotAnchor: true, unknownWeaponRetained: true, sameTickIndicesPreserved: true,
      exactSpatialJoin: true, deterministic: true, independentGraphOracleAllGaps: true, segmentationIndependentOfSpatial: true },
    sensitivity: runs.map(sensitivity), personalDemoCompatibility: "UNVERIFIED" };
  t.diagnostic(JSON.stringify(report));
  if (process.env.ENGAGEMENT_REPORT_FILE) await writeFile(process.env.ENGAGEMENT_REPORT_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");
});
