import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCombatExecution, analyzeEngagements, analyzeKillImpact } from "../dist/index.js";
import { damage, kill, match, spatial } from "./teamplay-fixture.mjs";

const fire = (tick = 90, shooter = "1", weapon = "ak47") => ({ type: "weapon_fire", tick, shooter, shooterSide: "CT", weapon });
const inputs = (m, s) => { const e = analyzeEngagements(m, s); return { e, k: analyzeKillImpact(m, e) }; };
const run = (m, s, options) => { const { e, k } = inputs(m, s); return analyzeCombatExecution(m, e, k, s, options); };
const context = (r, id = "1") => r.playerEngagementExecutions.find(c => c.playerId === id);
const pair = (r, id = "1", opponent = "6") => context(r, id).opponentExchanges.find(p => p.opponentId === opponent);

test("single firearm duel retains stable original refs and reported overkill", () => {
  const m = match([damage(110, "6", "1", 120), damage(100)]), r = run(m);
  assert.equal(context(r).firstContactRole, "dealt-first"); assert.equal(pair(r).reportedDamageReceived, 120);
  assert.equal(pair(r).firstDealtRef.eventIndex, 1); assert.equal(pair(r).firstReceivedRef.eventIndex, 0);
  assert.equal(pair(r).returnOutcome, "unavailable");
});
test("received first return damage is a confirmed same-opponent event interval", () => {
  const p = pair(run(match([damage(100, "6", "1"), fire(110), damage(130)])));
  assert.equal(p.firstContactRole, "received-first"); assert.equal(p.returnOutcome, "damage");
  assert.equal(p.returnContactDelaySeconds, 30 / 64); assert.equal(p.returnContactRef.tick, 130);
});
test("return damage then kill keeps first return and separate outcome ref", () => {
  const p = pair(run(match([damage(100, "6", "1"), damage(120), kill(140, "1", "6")])));
  assert.equal(p.returnOutcome, "kill"); assert.equal(p.returnContactRef.tick, 120); assert.equal(p.returnOutcomeRef.tick, 140);
});
test("kill without damage row is offensive contact", () => {
  const c = context(run(match([fire(90), kill(100, "1", "6")])));
  assert.equal(c.firearmKills, 1); assert.equal(c.firstConfirmedOffensiveContactRef.type, "kill");
  assert.equal(c.fireToContactEvidence.confirmedOffensiveContacts, 1); assert.equal(c.firstContactRole, "unknown");
});
test("received first no return before later firearm death is none observed", () => {
  const p = pair(run(match([damage(100, "6", "1"), kill(150, "6", "1")])));
  assert.equal(p.returnOutcome, "none-observed"); assert.equal(p.deathRef.tick, 150);
  assert.equal(p.returnContactRef, null); assert.equal(p.returnContactDelaySeconds, null);
});
test("same tick origin death is ambiguous even if return appears later", () => {
  const p = pair(run(match([kill(100, "6", "1"), damage(120)])));
  assert.equal(p.returnOutcome, "same-tick-ambiguous"); assert.equal(p.returnContactDelaySeconds, null);
});
test("same tick first contacts do not use array index to order", () => {
  for (const events of [[damage(100), damage(100, "6", "1")], [damage(100, "6", "1"), damage(100)]]) {
    const p = pair(run(match(events))); assert.equal(p.firstContactRole, "same-tick");
    assert.equal(p.returnOutcome, "same-tick-ambiguous"); assert.equal(p.returnContactDelaySeconds, null);
  }
});
test("strict later observed response survives same-tick original contact but flags ambiguity", () => {
  const p = pair(run(match([damage(100, "6", "1"), damage(100), damage(120)])));
  assert.equal(p.returnOutcome, "damage"); assert.equal(p.returnContactRef.tick, 120);
  assert.ok(p.coverage.returnContact.reasons.includes("same-tick-contact-ambiguous"));
});
test("return in own death tick is ambiguous", () => {
  const p = pair(run(match([damage(100, "6", "1"), damage(140), kill(140, "7", "1")])));
  assert.equal(p.returnOutcome, "same-tick-ambiguous"); assert.equal(p.returnContactRef, null);
});
test("other-opponent death also bounds returns", () => {
  const p = pair(run(match([damage(100, "6", "1"), kill(120, "7", "1"), damage(140)])));
  assert.equal(p.returnOutcome, "none-observed"); assert.equal(p.returnContactRef, null);
});
test("multi-opponent exchanges isolate all damage and return identities", () => {
  const r = run(match([damage(100, "6", "1"), damage(110, "7", "1"), damage(120, "1", "7", 40), damage(140)]));
  assert.equal(context(r).opponentExchanges.length, 2); assert.equal(pair(r).returnContactRef.tick, 140);
  assert.equal(pair(r, "1", "7").returnContactRef.tick, 120); assert.equal(pair(r, "1", "7").reportedDamageDealt, 40);
});
test("two unrelated engagements overlapping time do not capture another shooter", () => {
  const r = run(match([damage(100), damage(200), damage(110, "2", "7"), damage(210, "2", "7"), fire(150)]));
  assert.equal(r.weaponFireEvidence[0].linkage, "inside-engagement"); assert.equal(r.weaponFireEvidence[0].candidateEngagementIds.length, 1);
});
test("inside unique engagement", () => {
  const c = context(run(match([damage(100), fire(110), damage(130)])));
  assert.equal(c.insideEngagementFireCount, 1); assert.equal(c.leadInFireCount, 0);
});
test("unique lead in within inclusive one-second window", () => {
  for (const tick of [36, 90]) {
    const r = run(match([fire(tick), damage(100)])); assert.equal(r.weaponFireEvidence[0].linkage, "unique-lead-in");
    assert.equal(context(r).leadInFireCount, 1);
  }
});
test("outside lead in window remains unlinked", () => {
  const r = run(match([fire(35), damage(100)])); assert.equal(r.weaponFireEvidence[0].linkage, "unlinked");
  assert.equal(context(r).weaponFireRefs.length, 0);
});
test("fire linkage never prefers inside over competing lead in", () => {
  const m = match([damage(100), damage(150), damage(170, "1", "7"), fire(140)]), { e, k } = inputs(m);
  const original = e.engagements[0];
  // Hand-supplied two independently valid groups sharing a participant exercise conservative linkage.
  e.engagements = [{ ...original, id: "a", contacts: original.contacts.slice(0, 2), participantIds: ["1", "6"], startTick: 100, endTick: 150 },
    { ...original, id: "b", contacts: original.contacts.slice(2), participantIds: ["1", "7"], startTick: 170, endTick: 170 }];
  const r = analyzeCombatExecution(m, e, k);
  assert.equal(r.weaponFireEvidence[0].linkage, "ambiguous"); assert.equal(r.weaponFireEvidence[0].engagementId, null);
  assert.ok(r.playerEngagementExecutions.filter(c => c.playerId === "1").every(c => c.weaponFireRefs.length === 0 && c.ambiguousFireCount === 1));
});
for (const [name, tick, starts] of [["inside", 130, [100, 110]], ["lead-in", 80, [100, 110]]])
  test(`ambiguous ${name} candidates are not assigned`, () => {
    const m = match([damage(starts[0]), damage(180), damage(starts[1], "1", "7"), damage(190, "1", "7"), fire(tick)]), { e, k } = inputs(m);
    const base = e.engagements[0];
    e.engagements = [["a", [0, 2], ["1", "6"], starts[0], 180], ["b", [1, 3], ["1", "7"], starts[1], 190]].map(([id, indices, participantIds, startTick, endTick]) =>
      ({ ...base, id, contacts: indices.map(i => base.contacts[i]), participantIds, startTick, endTick }));
    const r = analyzeCombatExecution(m, e, k); assert.equal(r.weaponFireEvidence[0].linkage, "ambiguous");
    assert.equal(r.weaponFireEvidence[0].engagementId, null); assert.equal(r.weaponFireEvidence[0].candidateEngagementIds.length, 2);
  });
test("weapon fire has no target or miss inference in any contract", () => {
  const r = run(match([fire(80), fire(90), damage(100, "1", "6"), damage(110, "1", "7")]));
  assert.equal(context(r).weaponFireEventsBeforeFirstConfirmedContact, 2);
  for (const f of r.weaponFireEvidence) { assert.ok(!("targetId" in f)); assert.ok(!("opponentId" in f)); }
  assert.doesNotMatch(JSON.stringify(r), /missedShots|accuracy|reactionTime|aimScore/);
});
test("fire to contact delay and counts retain earliest fire", () => {
  const c = context(run(match([fire(80), fire(90), damage(100)])));
  assert.equal(c.firstFireToFirstConfirmedContactSeconds, 20 / 64); assert.equal(c.weaponFireEventsBeforeFirstConfirmedContact, 2);
  assert.deepEqual(c.fireToContactEvidence, { observedFireEvents: 2, confirmedOffensiveContacts: 1 });
});
test("same tick fire/contact returns null interval", () => {
  const c = context(run(match([fire(100), damage(100)]))); assert.equal(c.firstFireToFirstConfirmedContactSeconds, null);
  assert.ok(c.coverage.fireEvidence.reasons.includes("same-tick-fire-contact-ambiguous"));
});
test("contact before fire is coverage fact", () => {
  const c = context(run(match([damage(100), fire(110), damage(120)]))); assert.equal(c.firstFireToFirstConfirmedContactSeconds, null);
  assert.ok(c.coverage.fireEvidence.reasons.includes("contact-before-observed-fire"));
});
test("unknown weapons retained without entering firearm counts or negative evidence", () => {
  const r = run(match([fire(80, "1", "unknown"), damage(100, "6", "1"), damage(120, "1", "6", 20, { weapon: "unknown" })]));
  assert.equal(r.contacts.length, 2); assert.equal(r.diagnostics.unknownWeaponContacts, 1); assert.equal(r.diagnostics.unknownWeaponFireEvents, 1);
  assert.equal(pair(r).returnOutcome, "unavailable"); assert.equal(context(r).fireToContactEvidence.observedFireEvents, 0);
});
for (const weapon of ["knife", "taser", "hegrenade"])
  test(`${weapon} excluded from firearm execution`, () => {
    const r = run(match([damage(100, "6", "1"), damage(120, "1", "6", 20, { weapon }), fire(90, "1", weapon)]));
    assert.equal(context(r).fireToContactEvidence.observedFireEvents, 0); assert.equal(context(r).damageContactsDealt, 0);
    assert.equal(r.contacts.length, 1);
  });
test("unreliable clocks preserve supplied confirmed contacts without timing or absence", () => {
  for (const tickRate of [undefined, 0, -1, NaN, Infinity, Number.MIN_VALUE]) {
    const m = match([damage(100, "6", "1"), fire(110), damage(130)]), { e, k } = inputs(m); m.tickRate = tickRate;
    const r = analyzeCombatExecution(m, e, k); assert.equal(context(r).firstFireToFirstConfirmedContactSeconds, null);
    assert.equal(pair(r).returnContactDelaySeconds, null); assert.ok(r.coverage.fireEvidence.reasons.includes("tick-rate-unreliable"));
    assert.ok(!JSON.stringify(r).includes("Infinity"));
  }
});
for (const extra of [{ attacker: null }, { victimSide: "Unknown" }, { weapon: undefined }])
  test(`incomplete direct feed gates absence ${JSON.stringify(extra)}`, () => {
    const p = pair(run(match([damage(100, "6", "1"), damage(110, "2", "7", 20, extra)])));
    assert.equal(p.returnOutcome, "unavailable"); assert.equal(p.firstContactRole, "unknown");
  });
test("omitted eligible contacts and missing membership gate absence", () => {
  const m = match([damage(100, "6", "1"), damage(130)]), { e, k } = inputs(m);
  e.directContacts.pop(); e.engagements[0].contacts.pop(); e.engagements[0].endTick = 100;
  const r = analyzeCombatExecution(m, e, k); assert.equal(pair(r).returnOutcome, "unavailable");
});
test("missing Engagement and match mismatch preserve fire refs but no fabricated contexts", () => {
  const m = match([fire(), damage()]), { e, k } = inputs(m);
  for (const input of [undefined, { ...e, matchId: "wrong" }]) {
    const r = analyzeCombatExecution(m, input, k); assert.equal(r.playerEngagementExecutions.length, 0);
    assert.equal(r.weaponFireEvidence.length, 1); assert.equal(r.weaponFireEvidence[0].linkage, "unlinked");
  }
});
test("missing spatial never changes event results", () => {
  const m = match([damage(100, "6", "1"), damage(120)]), r = run(m);
  assert.equal(pair(r).firstContactDistance, null); assert.equal(pair(r).coverage.spatialContext.status, "unavailable");
  assert.equal(pair(r).returnOutcome, "damage");
});
test("first contact distance exact event join retains horizontal and high Z", () => {
  const m = match([damage(100, "6", "1"), damage(120)]), s = spatial(m, { "1": { x: 0, y: 0, z: 0 }, "6": { x: 3, y: 4, z: 12 } });
  assert.deepEqual(pair(run(m, s)).firstContactDistance, { horizontalDistance: 5, verticalDelta: 12, directDistance: 13 });
  s.events[0].eventRef.eventIndex = 10; assert.equal(pair(run(m, s)).firstContactDistance, null);
});
test("spatial duplicate ref, wrong match, wrong sample tick, role conflict are unavailable", () => {
  const m = match([damage(100, "6", "1"), damage(120)]);
  for (const modify of [s => s.events.push(structuredClone(s.events[0])), s => s.matchId = "wrong",
    s => s.events[0].samples[0].sample.actualTick--, s => s.events[0].participants[0].playerId = "7"]) {
    const s = spatial(m); modify(s); assert.equal(pair(run(m, s)).firstContactDistance, null);
  }
});
test("non-finite damage degrades reported totals but not confirmed contact", () => {
  const r = run(match([damage(100, "6", "1"), damage(120, "1", "6", NaN)]));
  assert.equal(context(r).reportedDamageDealt, null); assert.equal(pair(r).returnOutcome, "damage");
  assert.equal(r.contacts[1].reportedHealthDamage, null);
});
test("invalid option values and duplicate round identities rejected", () => {
  for (const value of [0, -1, NaN, Infinity, null, "1"]) assert.throws(() => run(match(), undefined, { preContactFireWindowSeconds: value }), RangeError);
  const m = match(); m.rounds.push(structuredClone(m.rounds[0])); assert.throws(() => run(m), RangeError);
});
test("deterministic, JSON-only, detached output and immutable inputs", () => {
  const m = match([fire(), damage(100, "6", "1"), damage(120)]), s = spatial(m), { e, k } = inputs(m, s);
  const before = structuredClone({ m, s, e, k }), a = analyzeCombatExecution(m, e, k, s);
  assert.deepEqual(a, analyzeCombatExecution(m, e, k, s)); assert.deepEqual(a, JSON.parse(JSON.stringify(a)));
  assert.deepEqual({ m, s, e, k }, before); a.contacts[0].eventRef.tick = 777; assert.deepEqual({ m, s, e, k }, before);
});
test("invalid fire ticks cannot construct unsafe or non-JSON source refs", () => {
  for (const tick of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => run(match([fire(tick), damage()])), RangeError);
});
test("unknown unlinked fires degrade player and global fire coverage", () => {
  const r = run(match([fire(500, "1", "unknown"), damage(100, "6", "1")]));
  assert.equal(r.weaponFireEvidence[0].linkage, "unlinked"); assert.equal(r.coverage.fireEvidence.status, "partial");
  assert.equal(r.playerSummaries.find(p => p.playerId === "1").coverage.fireEvidence.status, "partial");
  assert.ok(context(r).coverage.fireEvidence.reasons.includes("fire-weapon-unknown"));
});
test("unidentified fire degrades overall and round contexts even when unlinked", () => {
  const r = run(match([fire(90, "world"), damage()])); assert.equal(r.coverage.fireEvidence.status, "partial");
  assert.ok(context(r).coverage.fireEvidence.reasons.includes("fire-event-unidentified"));
});
test("source unknown contact preserved with absent or stale Engagement analysis", () => {
  const m = match([damage(100, "6", "1", 20, { weapon: "unknown" })]), { e } = inputs(m);
  for (const input of [undefined, { ...e, matchId: "wrong" }, { ...e, directContacts: [], engagements: [] }]) {
    const r = analyzeCombatExecution(m, input); assert.equal(r.contacts.length, 1); assert.equal(r.contacts[0].sourceKind, "unknown");
    assert.equal(r.diagnostics.unknownWeaponContacts, 1); assert.ok(r.coverage.contactEvidence.reasons.includes("contact-weapon-unknown"));
  }
});
test("semantic source validation ignores object key order", () => {
  const m = match([damage(100, "6", "1"), damage(130)]), { e, k } = inputs(m);
  e.engagements[0].contacts = e.engagements[0].contacts.map(c => Object.fromEntries(Object.entries(c).reverse()));
  assert.equal(pair(analyzeCombatExecution(m, e, k)).returnOutcome, "damage");
});
test("participant with only non-firearm contact and linked firearm fire gets shooter-only context", () => {
  const r = run(match([damage(100), damage(110, "2", "6", 20, { weapon: "knife" }), fire(105, "2")]));
  const c = context(r, "2"); assert.equal(c.insideEngagementFireCount, 1); assert.equal(c.opponentExchanges.length, 0);
  assert.equal(c.firstConfirmedOffensiveContactRef, null); assert.equal(c.firstConfirmedDefensiveContactRef, null);
  assert.equal(c.fireToContactEvidence.confirmedOffensiveContacts, 0); assert.equal(c.firstContactRole, "unknown");
});
