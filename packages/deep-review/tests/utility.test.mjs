import assert from "node:assert/strict";
import test from "node:test";
import { analyzeUtilityContext, analyzeKillImpact } from "../dist/index.js";
import { match, spatial, damage, kill } from "./teamplay-fixture.mjs";
const effect = (utility = "smoke", extra = {}) => ({ type: "utility", tick: 100, utility, action: utility === "fire" ? "start_burn" : utility === "decoy" ? "start_decoy" : "detonate", thrower: "1", throwerSide: "CT", entityId: 42, position: { x: 0, y: 0, z: 0 }, ...extra });
const blind = (victim = "6", extra = {}) => ({ type: "flash", tick: 100, attacker: "1", attackerSide: "CT", victim, victimSide: victim === "6" ? "T" : "CT", entityId: 42, blindDurationSeconds: 2.5, ...extra });
const setup = events => { const m = match(events), s = spatial(m); for (const x of s.events) x.participants = [{ role: "actor", playerId: m.rounds[0].events[x.eventRef.eventIndex].thrower ?? null }]; return { m, s, k: analyzeKillImpact(m) }; };
const run = ({ m, s, k }) => analyzeUtilityContext(m, s, k);
const first = fixture => run(fixture).effects[0];
test("smoke effect origin, all alive spatial facts, vertical distance and deterministic tie", () => {
  const f = setup([effect()]);
  for (const b of f.s.events[0].samples) if (["6", "7"].includes(b.sample.playerId)) b.sample.position = { x: 3, y: 4, z: 12 };
  const c = first(f); assert.deepEqual(c.position, { x: 0, y: 0, z: 0 }); assert.equal(c.enemiesWithPosition.length, 5);
  assert.deepEqual(c.nearestEnemy, { playerId: "6", sideRelation: "enemy", horizontalDistance: 5, verticalDelta: 12, directDistance: 13 });
  assert.equal(c.teammatesWithPosition.length, 4); assert.equal(c.roundContext.teamAlive, 5); assert.equal(c.coverage.spatialContext.status, "complete");
});
test("HE exact same-tick reported damage, self/team classification and no HP ledger", () => {
  const c = first(setup([effect("hegrenade"), damage(100, "1", "6", 150, { weapon: "weapon_hegrenade" }), damage(100, "1", "2", 3, { weapon: "hegrenade" }), damage(100, "1", "1", 4, { weapon: "hegrenade" })]));
  assert.equal(c.directOutcome.linkage, "exact"); assert.equal(c.directOutcome.reportedEnemyDamage, 150); assert.deepEqual(c.directOutcome.damagedEnemyIds, ["6"]); assert.equal(c.directOutcome.damageEvents.length, 3);
});
test("HE different attacker does not link", () => { assert.equal(first(setup([effect("hegrenade"), damage(100, "2", "6", 20, { weapon: "hegrenade" })])).directOutcome.reportedEnemyDamage, 0); });
test("HE ambiguous same-tick effects suppress attribution", () => {
  const r = run(setup([effect("hegrenade"), effect("hegrenade", { entityId: 43 }), damage(100, "1", "6", 20, { weapon: "hegrenade" })]));
  for (const c of r.effects) { assert.equal(c.directOutcome.linkage, "unavailable"); assert.equal(c.directOutcome.reportedEnemyDamage, null); assert.deepEqual(c.directOutcome.damageEvents, []); }
});
test("HE no observed damage is exact observed zero", () => { assert.equal(first(setup([effect("hegrenade")])).directOutcome.reportedEnemyDamage, 0); });
test("HE unmatched different tick/unknown attacker/missing weapon prevent complete zero", () => {
  for (const d of [damage(101, "1", "6", 20, { weapon: "hegrenade" }), damage(100, null, "6", 20, { weapon: "hegrenade" }), damage(100, "1", "6", 20, { weapon: undefined })]) {
    const c = first(setup([effect("hegrenade"), d])); assert.equal(c.directOutcome.linkage, "partial"); assert.equal(c.directOutcome.damageEvents.length, 0);
  }
});
test("fire attribution unavailable despite subsequent same actor damage; spatial independent", () => {
  const c = first(setup([effect("fire"), damage(110, "1", "6", 20, { weapon: "inferno" })]));
  assert.equal(c.directOutcome.reportedEnemyDamage, null); assert.equal(c.coverage.directOutcome.status, "unavailable"); assert.equal(c.coverage.spatialContext.status, "complete");
});
test("flash exact round/entity/actor joins enemy, teammate and self; duration remains raw", () => {
  const c = first(setup([effect("flashbang"), blind(), blind("2"), blind("1", { blindDurationSeconds: 0 }), blind("6", { blindDurationSeconds: 9 })]));
  assert.equal(c.directOutcome.linkage, "exact"); assert.equal(c.directOutcome.enemyEffects.length, 2); assert.equal(c.directOutcome.teammateEffects.length, 1);
  assert.equal(c.directOutcome.selfEffects[0].rawBlindDurationSeconds, 0); assert.equal(c.directOutcome.enemyEffects[1].rawBlindDurationSeconds, 9); assert.equal(c.directOutcome.confirmedFlashAssists, null);
});
test("flash missing entity is unavailable, missing victim entity is partial", () => {
  assert.equal(first(setup([effect("flashbang", { entityId: undefined }), blind()])).directOutcome.linkage, "unavailable");
  assert.equal(first(setup([effect("flashbang"), blind("6", { entityId: undefined })])).directOutcome.linkage, "partial");
});
test("flash reused entity (even different actor/tick) is ambiguous", () => {
  const r = run(setup([effect("flashbang"), effect("flashbang", { tick: 200, thrower: "2" }), blind()]));
  for (const c of r.effects) { assert.equal(c.directOutcome.linkage, "unavailable"); assert.equal(c.directOutcome.enemyEffects.length, 0); }
});
test("flash thrower mismatch and unknown sides remain partial", () => {
  for (const extra of [{ attacker: "2" }, { victimSide: "Unknown" }]) { const c = first(setup([effect("flashbang"), blind("6", extra)])); assert.equal(c.directOutcome.linkage, "partial"); assert.equal(c.directOutcome.enemyEffects.length, 0); }
});
test("flash invalid raw duration cannot become continuous duration or complete absence", () => {
  for (const duration of [-1, NaN, Infinity]) assert.equal(first(setup([effect("flashbang"), blind("6", { blindDurationSeconds: duration })])).directOutcome.linkage, "partial");
});
test("flash entity scope is round local", () => {
  const f = setup([effect("flashbang"), blind()]); const r2 = structuredClone(f.m.rounds[0]); r2.number = 2; f.m.rounds.push(r2); f.k = analyzeKillImpact(f.m);
  assert.ok(run(f).effects.every(c => c.directOutcome.linkage === "exact"));
});
test("missing thrower, unknown side do not use Player.team or spatial side", () => {
  assert.equal(first(setup([effect("hegrenade", { thrower: null })])).directOutcome.linkage, "unavailable");
  const c = first(setup([effect("hegrenade", { throwerSide: "Unknown" })])); assert.equal(c.roundContext.teamAlive, null); assert.equal(c.nearestEnemy, null); assert.equal(c.directOutcome.linkage, "partial");
});
test("missing effect position never substitutes thrower position", () => {
  const c = first(setup([effect("smoke", { position: undefined })])); assert.equal(c.position, null); assert.equal(c.nearestEnemy, null); assert.equal(c.coverage.spatialContext.status, "unavailable");
});
test("missing spatial event, wrong match, duplicate ref and wrong actor do not nearest join", () => {
  for (const change of [s => s.events[0].eventRef.eventIndex++, s => s.matchId = "wrong", s => s.events.push(structuredClone(s.events[0])), s => s.events[0].participants[0].playerId = "2"]) {
    const f = setup([effect()]); change(f.s); assert.equal(first(f).coverage.spatialContext.status, "unavailable");
  }
  const f = setup([effect()]); f.s = undefined; assert.equal(first(f).coverage.spatialContext.reasons[0], "spatial-not-provided");
});
test("missing enemy position and nonexact sample ticks retain partial observed subset", () => {
  for (const change of [s => s.position = null, s => s.actualTick++, s => s.requestedTick++, s => s.fields.position = "partial"]) {
    const f = setup([effect()]); change(f.s.events[0].samples.find(b => b.sample.playerId === "6").sample);
    const c = first(f); assert.equal(c.coverage.spatialContext.status, "partial"); assert.deepEqual(c.missingPositionPlayerIds, ["6"]); assert.equal(c.enemiesWithPosition.length, 4);
  }
});
test("same-tick death is alive ambiguity regardless of is_alive/array order", () => {
  const f = setup([effect(), kill(100, "1", "6")]); const c = first(f);
  assert.equal(c.roundContext.teamAlive, null); assert.deepEqual(c.roundContext.beforeAtomicGroup, { teamAlive: 5, enemyAlive: 5 }); assert.deepEqual(c.roundContext.afterAtomicGroup, { teamAlive: 5, enemyAlive: 4 });
  assert.deepEqual(c.sameTickAliveAmbiguousIds, ["6"]); assert.equal(c.enemiesWithPosition.length, 4);
});
test("reliable alive truth overrides contradictory spatial is_alive", () => {
  const f = setup([effect(), kill(90, "1", "6")]); for (const b of f.s.events[0].samples) b.sample.alive = true;
  const c = first(f); assert.equal(c.roundContext.enemyAlive, 4); assert.equal(c.enemiesWithPosition.length, 4);
});
for (const [action, expected] of [[null, "pre-plant"], ["plant_start", "planting"], ["planted", "planted"], ["defuse_start", "defusing"], ["defused", "resolved"], ["exploded", "resolved"]]) {
  test(`bomb observed lifecycle context: ${expected}/${action}`, () => {
    const events = [effect()]; if (action) events.push({ type: "bomb", action, tick: 90, player: "6", playerSide: "T", siteIndex: 123 });
    assert.equal(first(setup(events)).roundContext.bombState, expected);
  });
}
test("same-tick bomb lifecycle ambiguity and earlier conflicting group", () => {
  const b = action => ({ type: "bomb", action, tick: 100, player: "6", playerSide: "T" });
  const c = first(setup([effect(), b("planted")])); assert.equal(c.roundContext.bombState, "unknown"); assert.equal(c.roundContext.bombBeforeSameTick, "pre-plant"); assert.equal(c.coverage.bombContext.status, "partial");
  const f = setup([effect(), { ...b("planted"), tick: 90 }, { ...b("exploded"), tick: 90 }]); assert.equal(first(f).roundContext.bombState, "unknown");
});
test("unknown clock and pre-freeze/outside boundaries do not guess timing", () => {
  for (const tickRate of [undefined, NaN, Infinity, 0, Number.MIN_VALUE]) { const f = setup([effect()]); f.m.tickRate = tickRate; const c = first(f); assert.equal(c.roundContext.secondsFromRoundStart, null); assert.ok(c.coverage.roundState.reasons.includes("tick-rate-unreliable")); }
  const f = setup([effect("smoke", { tick: 4 })]); const c = first(f); assert.equal(c.roundContext.secondsFromFreezeEnd, null); assert.equal(c.roundContext.teamAlive, null);
  const out = first(setup([effect("hegrenade", { tick: 1001 })])); assert.equal(out.roundContext.bombState, "unknown"); assert.equal(out.directOutcome.linkage, "unavailable");
});
test("missing/stale alive analysis cannot supply counts or candidates", () => {
  for (const modify of [f => f.k = undefined, f => f.k.matchId = "wrong", f => f.k.rounds[0].players[0].deathTick = 20]) { const f = setup([effect()]); modify(f); assert.equal(first(f).roundContext.teamAlive, null); assert.equal(first(f).nearestEnemy, null); }
});
test("no release inference, official assistedFlash alone does not identify effect", () => {
  const c = first(setup([effect("flashbang"), blind(), kill(200, "2", "6", { assister: "1", assisterSide: "CT", assistedFlash: true }), { type: "weapon_fire", tick: 99, shooter: "1", shooterSide: "CT", weapon: "flashbang" }]));
  assert.equal(c.directOutcome.confirmedFlashAssists, null); assert.ok(!("releaseRef" in c));
});
test("input immutability and JSON determinism", () => {
  const f = setup([effect("hegrenade"), effect("decoy", { tick: 110 }), damage(100, "1", "6", 20, { weapon: "hegrenade" })]); const before = JSON.stringify(f), a = run(f);
  assert.equal(JSON.stringify(f), before); assert.deepEqual(a, run(f)); assert.deepEqual(a, JSON.parse(JSON.stringify(a))); assert.equal(a.effects[1].directOutcome.kind, "decoy");
});
test("unknown thrower same-tick HE candidate prevents fabricated unique attribution", () => {
  const c = first(setup([effect("hegrenade"), effect("hegrenade", { thrower: null }), damage(100, "1", "6", 20, { weapon: "hegrenade" })]));
  assert.equal(c.directOutcome.linkage, "unavailable"); assert.equal(c.directOutcome.reportedEnemyDamage, null);
});
test("effect/roster side conflict suppresses counts, spatial relations and enemy damage", () => {
  const c = first(setup([effect("hegrenade", { throwerSide: "T" }), damage(100, "1", "6", 20, { weapon: "hegrenade", attackerSide: "T" })]));
  assert.equal(c.roundContext.teamAlive, null); assert.equal(c.coverage.spatialContext.status, "unavailable"); assert.equal(c.coverage.actorAttribution.status, "partial"); assert.equal(c.directOutcome.damageEvents[0].sideRelation, "unknown");
});
test("alive state property ordering is immaterial", () => {
  const f = setup([effect()]), expected = run(f); const c = f.k.rounds[0].coverage; f.k.rounds[0].coverage = { reasons: c.reasons, status: c.status }; assert.deepEqual(run(f), expected);
});
test("invalid effect identity rejects before publishing lossy JSON refs", () => {
  for (const tick of [Infinity, NaN, -1, 1.5]) assert.throws(() => run(setup([effect("smoke", { tick })])), RangeError);
  const f = setup([effect()]); f.m.rounds[0].number = Infinity; assert.throws(() => run(f), RangeError);
});
test("non JSON numeric alive input cannot masquerade as null deathTick", () => {
  for (const value of [NaN, Infinity, undefined]) { const f = setup([effect()]); f.k.rounds[0].players[0].deathTick = value;
    const c = first(f); assert.equal(c.roundContext.teamAlive, null); assert.equal(c.coverage.roundState.status, "unavailable"); assert.equal(c.nearestEnemy, null); }
});
