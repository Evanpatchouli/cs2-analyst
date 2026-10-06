import assert from "node:assert/strict";
import test from "node:test";
import { analyzeMatch, classifyUtilityWeapon } from "../dist/index.js";

const players = ["a", "b", "c", "d"].map((steamId, i) => ({ steamId, nickname: steamId, team: i < 2 ? "CT" : "T" }));
const release = (tick, weapon, shooter = "a") => ({ type: "weapon_fire", tick, weapon, shooter, shooterSide: "CT" });
const blind = (tick, victim, duration, extra = {}) => ({ type: "flash", tick, attacker: "a", victim,
  attackerSide: "CT", victimSide: victim === "a" || victim === "b" ? "CT" : "T",
  blindDurationSeconds: duration, entityId: 10, ...extra });
const hurt = (tick, weapon, victim, damage, remaining, extra = {}) => ({ type: "damage", tick, weapon,
  attacker: "a", victim, attackerSide: "CT", victimSide: victim === "a" || victim === "b" ? "CT" : "T",
  healthDamage: damage, healthRemaining: remaining, armorDamage: 0, armorRemaining: 0, ...extra });
const kill = (tick, extra = {}) => ({ type: "kill", tick, killer: "b", victim: "c", killerSide: "CT",
  victimSide: "T", assister: "a", assisterSide: "CT", assistedFlash: true, teamkill: false, headshot: false, ...extra });
function match(events, extra = {}) {
  const states = players.map(p => ({ steamId: p.steamId, side: p.team, participant: true, alive: true }));
  return { id: "utility", map: "de_dust2", tickRate: 64, players, rounds: [{ number: 1,
    startTick: 100, freezeEndTick: 110, endTick: 1000, events,
    stateSnapshots: ["freeze_end", "end"].map(boundary => ({ boundary, tick: boundary === "end" ? 1000 : 110,
      availability: "observed", players: states, unidentifiedPlayerCount: 0 })), ...extra }] };
}
const utility = (m, options) => analyzeMatch(m, options).players[0].utility;

test("release-only throw policy normalizes fire and preserves original evidence", () => {
  const events = [release(99, "weapon_flashbang"), release(100, "weapon_flashbang"),
    release(200, "weapon_smokegrenade"), release(300, "weapon_hegrenade"), release(400, "weapon_molotov"),
    release(500, "weapon_incgrenade"), release(600, "weapon_decoy"), release(700, "weapon_ak47"),
    release(1001, "weapon_flashbang"), release(800, "inferno"),
    { type: "utility", tick: 410, utility: "fire", action: "start_burn", thrower: "a", throwerSide: "CT", entityId: 10 },
    { type: "utility", tick: 220, utility: "smoke", action: "detonate", thrower: "a", throwerSide: "CT", entityId: 10 }];
  const u = utility(match(events));
  assert.deepEqual(u.throws.counts, { hegrenade: 1, smoke: 1, flashbang: 1, fire: 2, decoy: 1 });
  assert.equal(u.throws.molotov, 1); assert.equal(u.throws.incendiary, 1);
  assert.equal(u.effects.length, 2); assert.equal(u.throws.evidence[3].event.weapon, "weapon_molotov");
  assert.equal(classifyUtilityWeapon("weapon_molotov"), "fire");
  assert.equal(classifyUtilityWeapon("incgrenade"), "fire");
  assert.equal(classifyUtilityWeapon("inferno"), "fire");
  assert.equal(classifyUtilityWeapon("my_hegrenade"), null);
  assert.deepEqual(utility(match(events)), u);
});

test("same-tick releases are ambiguous without a unique ID; distinct ticks and reused entities are safe", () => {
  const u = utility(match([release(200, "weapon_flashbang"), release(200, "flashbang"),
    release(201, "weapon_flashbang"), release(300, "weapon_hegrenade")]));
  assert.equal(u.throws.observed.flashbang, 3); assert.equal(u.throws.counts.flashbang, null);
  assert.equal(u.throws.counts.hegrenade, 1); assert.equal(u.throws.complete, false);
  assert.equal(u.coverage.issues["release-same-tick-ambiguous"], 1);
});

test("HE/fire reuse complete victim HP chains including friendly/world damage and capped overkill", () => {
  const u = utility(match([hurt(200, "ak47", "c", 80, 20, { attacker: "b" }),
    hurt(210, "hegrenade", "c", 50, 0), hurt(220, "hegrenade", "b", 10, 90),
    hurt(230, "inferno", "a", 10, 90), hurt(240, "inferno", "d", 10, 90, { attacker: null }),
    hurt(250, "inferno", "d", 20, 70)]));
  // Unknown actor makes attribution incomplete; resolved evidence still exposes capped damage.
  assert.equal(u.he.resolvedEnemyDamage, 20); assert.equal(u.he.reportedEnemyDamage, 50);
  assert.equal(u.fire.resolvedEnemyDamage, 20); assert.equal(u.fire.reportedEnemyDamage, 20);
  assert.equal(u.he.enemyDamage, null); assert.equal(u.coverage.issues["actor-unidentified"], 1);
  const known = utility(match([hurt(200, "ak47", "c", 80, 20, { attacker: "b" }), hurt(210, "hegrenade", "c", 50, 0)]));
  assert.equal(known.he.enemyDamage, 20);
});

test("broken damage chain and unknown weapon/sides return null instead of partial totals", () => {
  const u = utility(match([hurt(200, "hegrenade", "c", 20, 50), hurt(210, "inferno", "c", 10, 40)]));
  assert.equal(u.he.enemyDamage, null); assert.equal(u.fire.enemyDamage, null);
  assert.equal(u.coverage.issues["damage-loss-unresolved"], 2);
  const unknown = utility(match([hurt(200, undefined, "c", 20, 80)]));
  assert.equal(unknown.he.enemyDamage, null); assert.equal(unknown.fire.enemyDamage, null);
  assert.equal(utility(match([hurt(200, "hegrenade", "c", 20, 80, { victimSide: "Unknown" })])).he.enemyDamage, null);
});

test("flash separates victims, preserves reported durations, never claims overlap-adjusted time", () => {
  const u = utility(match([blind(200, "c", 4), blind(250, "c", 3, { attacker: "b" }),
    blind(300, "c", 2), blind(400, "b", 1), blind(450, "a", 0), blind(500, "a", 2)]),
    { effectiveFlashThresholdSeconds: 2 });
  assert.deepEqual([u.flash.enemy.count, u.flash.teammate.count, u.flash.self.count], [2, 1, 2]);
  assert.equal(u.flash.enemy.reportedDurationSeconds, 6); assert.equal(u.flash.enemy.blindDurationSeconds, null);
  assert.equal(u.flash.enemy.effectiveCount, 2); assert.equal(u.flash.self.effectiveCount, 1);
  assert.equal(u.coverage.issues["flash-overlap-possible"], 1);
  assert.equal(u.flash.enemy.complete, true); assert.equal(u.flash.enemy.durationComplete, false);
  assert.equal(u.coverage.complete, false);
});

test("flash unknown side, null actor, unknown clock and explicit threshold policy degrade", () => {
  const m = match([blind(200, "c", 1), blind(300, "b", 1, { victimSide: "Unknown" }),
    blind(400, "a", 0, { attackerSide: "Unknown", victimSide: "Unknown" })]);
  m.tickRate = undefined;
  const u = utility(m);
  assert.equal(u.flash.enemy.complete, false); assert.equal(u.flash.teammate.complete, false);
  assert.equal(u.flash.self.count, 1); assert.equal(u.flash.self.blindDurationSeconds, 0);
  assert.equal(u.coverage.issues["flash-clock-unavailable"], 1);
  assert.equal(u.flash.enemy.effectiveCount, null);
  assert.equal(utility(match([blind(200, "c", 1, { attacker: null })])).flash.enemy.complete, false);
  for (const threshold of [-1, NaN, Infinity]) assert.throws(() => utility(match([]), { effectiveFlashThresholdSeconds: threshold }), RangeError);
});

test("flash assists use death flag plus eligible assister evidence, never temporal proximity", () => {
  const u = utility(match([blind(200, "c", 4), kill(250, { assistedFlash: false }), kill(300),
    kill(400, { killerSide: "T", victimSide: "CT", assisterSide: "CT" }),
    kill(500, { killer: "a" }), kill(600, { killer: "world" })]));
  assert.equal(u.flash.assists, 1); assert.equal(u.flash.assistEvidence.length, 1);
  assert.equal(u.flash.assistEvidence[0].event.tick, 300);
  assert.equal(utility(match([kill(200, { assistedFlash: undefined })])).flash.assists, null);
  assert.equal(utility(match([kill(200, { assisterSide: "Unknown" })])).flash.assists, null);
});

test("missing formal boundaries and participation gate every utility total", () => {
  for (const extra of [{ endTick: undefined }, { stateSnapshots: undefined }]) {
    const u = utility(match([release(200, "weapon_flashbang"), blind(300, "c", 4), kill(400)], extra));
    assert.equal(u.throws.counts.flashbang, null); assert.equal(u.he.enemyDamage, null);
    assert.equal(u.flash.enemy.complete, false); assert.equal(u.flash.assists, null);
    assert.equal(u.throws.evidence.length, 0);
  }
  const u = utility(match([]));
  assert.equal(u.he.enemyDamage, 0); assert.equal(u.flash.assists, 0);
  assert.equal(u.flash.enemy.blindDurationSeconds, 0); assert.equal(u.coverage.complete, true);
});

test("unidentified roster and unidentifiable flash assister never become complete zero totals", () => {
  const m = match([release(200, "weapon_flashbang")]);
  m.rounds[0].stateSnapshots[0].unidentifiedPlayerCount = 1;
  const u = utility(m);
  assert.equal(u.throws.observed.flashbang, 1); assert.equal(u.throws.counts.flashbang, null);
  assert.equal(u.he.enemyDamage, null); assert.equal(u.fire.enemyDamage, null);
  assert.equal(u.flash.enemy.complete, false); assert.equal(u.flash.assists, null);
  assert.equal(u.coverage.issues["roster-unidentified-players"], 1);
  const unknown = utility(match([kill(200, { assister: undefined })]));
  assert.equal(unknown.flash.observedAssists, 0); assert.equal(unknown.flash.assists, null);
  assert.equal(unknown.coverage.issues["flash-assist-actor-unidentified"], 1);
});
