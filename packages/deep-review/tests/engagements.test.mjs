import assert from "node:assert/strict";
import test from "node:test";
import { analyzeEngagements, classifyContactWeapon } from "../dist/index.js";

const A = "76561198000000001", B = "76561198000000002", C = "76561198000000003", D = "76561198000000004", E = "76561198000000005";
const damage = (tick = 10, attacker = A, victim = B, extra = {}) => ({
  type: "damage", tick, attacker, victim, attackerSide: "CT", victimSide: "T", weapon: "ak47",
  healthDamage: 120, healthRemaining: 0, armorDamage: 0, armorRemaining: 0, ...extra,
});
const kill = (tick = 10, killer = A, victim = B, extra = {}) => ({
  type: "kill", tick, killer, victim, killerSide: "CT", victimSide: "T", weapon: "ak47",
  headshot: false, assistedFlash: false, ...extra,
});
const round = (events, number = 1, extra = {}) => ({ number, winner: null, startTick: 0, endTick: 1000, events, ...extra });
const match = (events = [], extra = {}) => ({ id: "fixture", map: "synthetic", tickRate: 10, players: [], rounds: [round(events)], ...extra });
const refs = analysis => analysis.engagements.map(group => group.contacts.map(contact => contact.eventRef.eventIndex));
const analyze = events => analyzeEngagements(match(events));

test("single duel projects raw reported damage/kill flags; no MatchEvent references", () => {
  const source = match([damage(), kill(11, A, B, { headshot: true, assistedFlash: true })]);
  const result = analyzeEngagements(source);
  assert.equal(result.available, true);
  assert.deepEqual(refs(result), [[0, 1]]);
  assert.equal(result.engagements[0].killCount, 1);
  assert.equal(result.engagements[0].damageContactCount, 1);
  assert.equal(result.engagements[0].durationSeconds, 0.1);
  assert.equal(result.directContacts[0].reportedHealthDamage, 120); // Do not cap overkill.
  assert.equal(result.directContacts[0].healthRemaining, 0);
  assert.equal(result.directContacts[1].headshot, true);
  assert.equal(result.directContacts[1].assistedFlash, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  source.rounds[0].events[0].healthDamage = 1;
  assert.equal(result.directContacts[0].reportedHealthDamage, 120);
});

test("repeated damage -> kill retains every eventIndex in one component", () => {
  const result = analyze([damage(10), damage(20), kill(30)]);
  assert.deepEqual(refs(result), [[0, 1, 2]]);
  assert.equal(result.engagements[0].killCount, 1);
  assert.equal(result.engagements[0].damageContactCount, 2);
});

test("two simultaneous unrelated duels stay separate; same tick is stable without causality", () => {
  const result = analyze([kill(10), kill(10, D, E), damage(10)]);
  assert.deepEqual(refs(result), [[0, 2], [1]]);
  assert.equal(result.diagnostics.sameTickContacts, 3);
});

test("participant chain is transitive and duration can exceed contactGap", () => {
  const result = analyze([damage(10), damage(30, B, C), damage(50, C, D), kill(70, D, E)]);
  assert.deepEqual(refs(result), [[0, 1, 2, 3]]);
  assert.equal(result.engagements[0].durationSeconds, 6);
  assert.equal(result.engagements[0].participantIds.length, 5);
});

test("inclusive threshold and just outside threshold; rounds never connect", () => {
  assert.deepEqual(refs(analyze([damage(10), kill(39)])), [[0, 1]]);
  assert.deepEqual(refs(analyze([damage(10), kill(40)])), [[0, 1]]);
  assert.deepEqual(refs(analyze([damage(10), kill(41)])), [[0], [1]]);
  const result = analyzeEngagements(match([], { rounds: [round([kill(10)], 2), round([kill(10)], 1)] }));
  assert.deepEqual(result.engagements.map(group => group.round), [1, 2]);
  assert.equal(new Set(result.engagements.map(group => group.id)).size, 2);
});

test("late contact bridges two existing groups using shared participants", () => {
  assert.deepEqual(refs(analyze([damage(10), damage(10, C, D), damage(20, B, C)])), [[0, 1, 2]]);
});

test("self/team/world/unidentified/unknown-side/pre/post-round exclusions are accounted once", () => {
  const result = analyze([kill(10, A, A), kill(10, A, B, { victimSide: "CT" }),
    kill(10, A, B, { teamkill: true }), kill(10, "world"), damage(10, null),
    kill(10, A, "0"), damage(10, A, B, { attackerSide: "Unknown" }),
    kill(1001), kill(0), kill(-1), kill(NaN)]);
  const d = result.diagnostics;
  assert.equal(d.excludedSelf, 1);
  assert.equal(d.excludedTeam, 2);
  assert.equal(d.excludedUnidentified, 3);
  assert.equal(d.excludedUnknownSide, 1);
  assert.equal(d.excludedPostRound, 1);
  assert.equal(d.excludedInvalidTick, 2);
  assert.equal(d.includedContacts, 1);
  assert.equal(d.candidateContacts, 11);
  const pre = analyzeEngagements(match([kill(9), kill(10), kill(20), kill(21)], { rounds: [round([kill(9), kill(10), kill(20), kill(21)], 1, { startTick: 10, endTick: 20 })] }));
  assert.equal(pre.diagnostics.excludedPreRound, 1);
  assert.equal(pre.diagnostics.excludedPostRound, 1);
  assert.deepEqual(pre.directContacts.map(contact => contact.eventRef.tick), [10, 20]);
});

test("utility damage/kill counted without anchors; weapon_fire cannot invent opponents", () => {
  const utilities = ["hegrenade", "inferno", "molotov", "incgrenade", "flashbang", "smokegrenade", "decoy", "planted_c4", "c4", "bomb", "bomb_explosion"];
  const events = utilities.flatMap(weapon => [damage(10, A, B, { weapon }), kill(10, A, B, { weapon })]);
  events.push({ type: "weapon_fire", tick: 10, shooter: A, shooterSide: "CT", weapon: "ak47" });
  const result = analyze(events);
  assert.equal(result.diagnostics.candidateContacts, utilities.length * 2);
  assert.equal(result.diagnostics.excludedUtility, utilities.length * 2);
  assert.deepEqual(result.engagements, []);
  const around = analyze([damage(10), damage(30, B, C, { weapon: "inferno" }), kill(50, C, D)]);
  assert.deepEqual(refs(around), [[0], [2]]); // Utility cannot serve as a bridge either.
});

test("minimal weapon catalog recognizes firearms/melee/taser; unknown is retained and flagged", () => {
  for (const weapon of ["ak47", "m4a1_silencer", "usp_silencer", "mp5sd", "weapon_AWP"]) assert.equal(classifyContactWeapon(weapon), "firearm");
  for (const weapon of ["knife", "knife_karambit", "bayonet", "weapon_knife_t"]) assert.equal(classifyContactWeapon(weapon), "melee");
  assert.equal(classifyContactWeapon("taser"), "taser");
  assert.equal(classifyContactWeapon("future_weapon"), "unknown");
  const result = analyze([damage(10, A, B, { weapon: "future_weapon" }), kill(11, A, B, { weapon: undefined })]);
  assert.equal(result.diagnostics.unknownWeaponKind, 2);
  assert.equal(result.directContacts.length, 2);
  assert.equal(result.engagements[0].coverage.eventSegmentation.status, "partial");
  assert.deepEqual(result.directContacts[0].coverage.reasons, ["weapon-kind-unknown"]);
});

test("missing/invalid tickRate retains contacts with unavailable time grouping", () => {
  for (const tickRate of [undefined, 0, -1, NaN, Infinity]) {
    const result = analyzeEngagements(match([kill()], { tickRate }));
    assert.equal(result.available, false);
    assert.equal(result.config.contactGapTicks, null);
    assert.equal(result.directContacts.length, 1);
    assert.deepEqual(result.engagements, []);
    assert.equal(result.coverage.eventSegmentation.status, "unavailable");
  }
});

test("finite positive but unrepresentable clock disables grouping and preserves JSON contacts", () => {
  const input = match([], { tickRate: 1e-308, rounds: [round([damage(0), damage(1), kill(2)], 1, { endTick: 2 })] });
  const result = analyzeEngagements(input, undefined, { contactGapSeconds: 1e308 });
  assert.equal(result.available, false);
  assert.equal(result.config.contactGapTicks, null);
  assert.equal(result.directContacts.length, 3);
  assert.deepEqual(result.engagements, []);
  assert.ok(result.coverage.eventSegmentation.reasons.includes("tick-rate-unreliable"));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("gap validation, rounding and sub-tick-sized positive option", () => {
  for (const value of [0, -1, NaN, Infinity, -Infinity]) assert.throws(() => analyzeEngagements(match(), undefined, { contactGapSeconds: value }), RangeError);
  assert.throws(() => analyzeEngagements(match(), undefined, { contactGapSeconds: Number.MAX_VALUE }), RangeError);
  assert.equal(analyzeEngagements(match(), undefined, { contactGapSeconds: 0.16 }).config.contactGapTicks, 2);
  assert.deepEqual(refs(analyzeEngagements(match([damage(10), kill(11)]), undefined, { contactGapSeconds: 0.01 })), [[0], [1]]);
});

test("missing/invalid formal windows exclude contacts without guessing bounds", () => {
  for (const window of [{ startTick: undefined }, { endTick: undefined }, { endTick: NaN }, { startTick: 100, endTick: 50 }]) {
    const result = analyzeEngagements(match([], { rounds: [round([kill()], 1, window)] }));
    assert.equal(result.available, false);
    assert.equal(result.diagnostics.excludedRoundWindow, 1);
    assert.equal(result.diagnostics.roundsWithUnavailableWindow, 1);
  }
  const partial = analyzeEngagements(match([], { rounds: [round([kill()], 1), round([kill()], 2, { endTick: undefined })] }));
  assert.equal(partial.available, true);
  assert.equal(partial.coverage.eventSegmentation.status, "partial");
  assert.equal(partial.engagements.length, 1);
});

test("duplicate rows preserve distinct original indices; duplicate round identity is rejected", () => {
  const event = kill();
  const result = analyze([event, event, { ...event }]);
  assert.deepEqual(refs(result), [[0, 1, 2]]);
  assert.equal(result.diagnostics.repeatedEventRows, 2);
  assert.equal(new Set(result.directContacts.map(contact => JSON.stringify(contact.eventRef))).size, 3);
  assert.throws(() => analyzeEngagements(match([], { rounds: [round([]), round([])] })), RangeError);
});

const coverage = { status: "complete", reasons: [] };
const spatialSample = (playerId, relation, requestedTick) => ({ requestedTick, actualTick: requestedTick, playerId, relation,
  position: null, view: null, health: null, alive: null, side: "Unknown", activeWeapon: null,
  coverage: structuredClone(coverage), fields: { position: "complete", view: "complete", state: "complete", weapon: "unavailable" } });
const evidence = (eventIndex = 0) => ({ eventRef: { round: 1, type: "kill", tick: 10, eventIndex },
  participants: [{ role: "actor", playerId: A }, { role: "target", playerId: B }],
  samples: [ ["actor", A], ["target", B] ].flatMap(([role, id]) => [
    { role, sample: spatialSample(id, "at-event", 10) }, { role, sample: spatialSample(id, "before-event", 9) } ]), coverage: structuredClone(coverage) });
const spatial = (events = [evidence()], extra = {}) => ({ matchId: "fixture", events, ...extra });

test("spatial exact four-key join; before/at coverage copied with no input references", () => {
  const input = spatial([evidence(1), evidence(0)]);
  const result = analyzeEngagements(match([kill(), kill()]), input);
  assert.equal(result.coverage.spatialEnrichment.status, "complete");
  assert.equal(result.coverage.spatialEnrichment.exactJoinedContacts, 2);
  assert.equal(result.directContacts[0].spatialCoverage.actorAtEvent.actualTick, 10);
  assert.equal(result.directContacts[0].spatialCoverage.targetBeforeEvent.actualTick, 9);
  input.events[0].samples[0].sample.fields.position = "unavailable";
  assert.equal(result.directContacts[1].spatialCoverage.actorAtEvent.fields.position, "complete");
  for (const key of ["round", "type", "tick", "eventIndex"]) {
    const item = evidence();
    item.eventRef[key] = key === "type" ? "damage" : item.eventRef[key] + 1;
    const miss = analyzeEngagements(match([kill()]), spatial([item]));
    assert.equal(miss.directContacts[0].spatialCoverage.joinStatus, "missing");
    assert.equal(miss.directContacts[0].spatialCoverage.actorAtEvent, null);
  }
});

test("spatial absent/failed/partial does not suppress valid event segmentation", () => {
  const unavailable = evidence();
  for (const binding of unavailable.samples) { binding.sample.actualTick = null; binding.sample.coverage = { status: "unavailable", reasons: ["sampling-failed"] }; }
  for (const input of [undefined, spatial([]), spatial([unavailable])]) {
    const result = analyzeEngagements(match([kill()]), input);
    assert.equal(result.engagements.length, 1);
    assert.equal(result.coverage.eventSegmentation.status, "complete");
    assert.equal(result.coverage.spatialEnrichment.status, "unavailable");
  }
  const item = evidence();
  item.samples = item.samples.filter(binding => binding.sample.relation === "at-event");
  const result = analyzeEngagements(match([kill()]), spatial([item]));
  assert.equal(result.coverage.spatialEnrichment.status, "partial");
  assert.equal(result.directContacts[0].spatialCoverage.actorBeforeEvent, null);
});

test("spatial identity conflicts/duplicate refs/wrong sample ticks cannot silently attach", () => {
  assert.equal(analyzeEngagements(match([kill()]), spatial([evidence()], { matchId: "other" })).directContacts[0].spatialCoverage.joinStatus, "match-mismatch");
  assert.equal(analyzeEngagements(match([kill()]), spatial([evidence(), evidence()])).directContacts[0].spatialCoverage.joinStatus, "duplicate-ref");
  const wrong = evidence(); wrong.participants[0].playerId = C;
  assert.equal(analyzeEngagements(match([kill()]), spatial([wrong])).directContacts[0].spatialCoverage.joinStatus, "participant-mismatch");
  const nearest = evidence(); nearest.samples[0].sample.actualTick = 11;
  assert.equal(analyzeEngagements(match([kill()]), spatial([nearest])).directContacts[0].spatialCoverage.actorAtEvent, null);
});

test("deterministic output, stable IDs, original eventIndex after sorting and no input mutation", () => {
  const input = match([kill(90), damage(10), kill(11)]);
  const before = structuredClone(input);
  const first = analyzeEngagements(input), second = analyzeEngagements(input);
  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.deepEqual(refs(first), [[1, 2], [0]]);
  assert.deepEqual(first.directContacts.map(contact => contact.eventRef.eventIndex), [1, 2, 0]);
  assert.deepEqual(first, analyzeEngagements({ ...input, players: [{ steamId: A, name: "changed nickname" }] }));
});

test("optimized component algorithm matches full pairwise graph oracle across deterministic generated cases", () => {
  let seed = 123456;
  const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  const ids = [A, B, C, D, E];
  for (let trial = 0; trial < 100; trial++) {
    const events = Array.from({ length: 30 }, () => { const a = random(ids.length); return damage(random(150), ids[a], ids[(a + 1 + random(ids.length - 1)) % ids.length]); });
    const result = analyze(events), contacts = result.directContacts;
    const seen = new Set(), expected = [];
    for (let i = 0; i < contacts.length; i++) {
      if (seen.has(i)) continue;
      const queue = [i], members = []; seen.add(i);
      while (queue.length) {
        const current = queue.shift(), a = contacts[current]; members.push(a.eventRef.eventIndex);
        for (let j = 0; j < contacts.length; j++) {
          const b = contacts[j];
          if (!seen.has(j) && Math.abs(a.eventRef.tick - b.eventRef.tick) <= 30 && [a.attackerId, a.victimId].some(id => id === b.attackerId || id === b.victimId)) { seen.add(j); queue.push(j); }
        }
      }
      expected.push(members.sort((a, b) => a - b));
    }
    const normalize = groups => groups.map(group => [...group].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
    assert.deepEqual(normalize(refs(result)), normalize(expected));
  }
});
