import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Demoparser2Provider } from "@cs2-analyst/dem-parser";

import { analyzeMatch } from "../dist/index.js";

// ---------------------------------------------------------------------------
// Synthetic cross-module invariants
// ---------------------------------------------------------------------------

const CT1 = "76561198000000001";
const CT2 = "76561198000000002";
const T1 = "76561198000000011";
const T2 = "76561198000000012";

const player = steamId => ({ steamId, nickname: steamId, team: "CT" });
const kill = (tick, killer, victim, extra = {}) => ({ type: "kill", tick, killer, victim, ...extra });
const damage = (tick, weapon, attacker, victim, healthDamage, healthRemaining, sides) => ({
  type: "damage", tick, weapon, attacker, victim,
  attackerSide: sides[attacker] ?? "CT", victimSide: sides[victim] ?? "T",
  healthDamage, armorDamage: 0, healthRemaining, armorRemaining: 0,
});
const snapshot = (boundary, tick, players, extra = {}) => ({
  boundary, tick, availability: "observed", players, unidentifiedPlayerCount: 0, ...extra,
});
const state = (steamId, side, alive = true, participant = true) =>
  ({ steamId, side, alive, participant });
const mkMatch = (players, rounds, tickRate = 64) => ({ id: "acceptance", map: "de_dust2", tickRate, players, rounds });
const byId = (result, steamId) => result.players.find(candidate => candidate.steamId === steamId);
const sum = (players, select) => players.reduce((total, entry) => total + select(entry), 0);

const sides4 = { [CT1]: "CT", [CT2]: "CT", [T1]: "T", [T2]: "T" };
const ids4 = [CT1, CT2, T1, T2];

// A trade kill and its traded death must map one-to-one globally. Participation
// is a per-player property, so the relationship is only credited when both
// parties are confirmed participants of the round.
test("trade kill and traded death stay one-to-one when participation is not uniform", () => {
  const events = [
    kill(1050, T1, CT1, { killerSide: "T", victimSide: "CT", teamkill: false }),
    kill(1090, CT2, T1, { killerSide: "CT", victimSide: "T", teamkill: false }),
  ];
  const endStates = [state(CT1, "CT", false), state(CT2, "CT", true), state(T1, "T", false), state(T2, "T", true)];
  const round = stateOverrides => ({
    number: 1, winner: "CT", events, startTick: 1000, freezeEndTick: 1010, endTick: 1500,
    stateSnapshots: [
      snapshot("freeze_end", 1010, ids4.map((id, index) =>
        state(id, sides4[id], true, stateOverrides[id] ?? true))),
      snapshot("end", 1500, endStates),
    ],
  });

  const control = analyzeMatch(mkMatch(ids4.map(player), [round({})]));
  assert.equal(sum(control.players, entry => entry.trade.tradeKills), 1);
  assert.equal(sum(control.players, entry => entry.trade.tradedDeaths), 1);

  for (const nonParticipant of [CT1, CT2]) {
    const result = analyzeMatch(mkMatch(ids4.map(player), [round({ [nonParticipant]: false })]));
    const tradeKills = sum(result.players, entry => entry.trade.tradeKills);
    const tradedDeaths = sum(result.players, entry => entry.trade.tradedDeaths);
    assert.equal(tradeKills, tradedDeaths, nonParticipant + " asymmetry");
    assert.equal(tradeKills, 0);
  }
});

// A start-boundary roster fallback is degraded coverage. Trade counts remain
// observable, but no complete rate may be published from them.
test("degraded survival context never publishes a complete trade rate", () => {
  const events = [
    kill(1050, T1, CT1, { killerSide: "T", victimSide: "CT", teamkill: false }),
    kill(1090, CT2, T1, { killerSide: "CT", victimSide: "T", teamkill: false }),
  ];
  const round = {
    number: 1, winner: "CT", events, startTick: 1000, freezeEndTick: 1010, endTick: 1500,
    stateSnapshots: [
      snapshot("start", 1000, ids4.map(id => state(id, sides4[id]))),
      snapshot("freeze_end", 1010, [], { availability: "unavailable" }),
      snapshot("end", 1500, [state(CT1, "CT", false), state(CT2, "CT", true),
        state(T1, "T", false), state(T2, "T", true)]),
    ],
  };
  const result = analyzeMatch(mkMatch(ids4.map(player), [round]));
  assert.equal(result.coverage.issues["survival-context-degraded"], 1);

  const trader = byId(result, CT2);
  const victim = byId(result, CT1);
  assert.equal(trader.trade.tradeKills, 1);
  assert.equal(victim.trade.tradedDeaths, 1);
  for (const entry of result.players) {
    assert.equal(entry.trade.degradedRounds, 1, entry.steamId);
    assert.equal(entry.trade.complete, false, entry.steamId);
    assert.equal(entry.trade.tradeRate, null, entry.steamId);
    assert.equal(entry.kast.complete, false, entry.steamId);
  }
});

// An invalid window must fail loudly rather than silently disabling the bound.
test("rejects a non-positive or non-finite trade window", () => {
  const round = {
    number: 1, winner: "CT", events: [], startTick: 1000, freezeEndTick: 1010, endTick: 1500,
    stateSnapshots: [snapshot("freeze_end", 1010, ids4.map(id => state(id, sides4[id])))],
  };
  const match = mkMatch(ids4.map(player), [round]);
  for (const seconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => analyzeMatch(match, { tradeWindowSeconds: seconds }), RangeError, String(seconds));
  }
  assert.deepEqual(analyzeMatch(match, { tradeWindowSeconds: 5 }).tradeWindow, { seconds: 5, ticks: 320 });
});

// PlayerCoverage is a closed accounting of every match round, and KAST shares
// the same participation scope as roundsPlayed.
test("player coverage accounting closes over match rounds and KAST shares roundsPlayed", () => {
  const eligible = {
    number: 1, winner: "CT", events: [],
    startTick: 1000, freezeEndTick: 1010, endTick: 1500,
    stateSnapshots: [snapshot("freeze_end", 1010, [state(CT1, "CT"), state(T1, "T")]),
      snapshot("end", 1500, [state(CT1, "CT"), state(T1, "T")])],
  };
  const unconfirmed = {
    number: 2, winner: "CT", events: [],
    startTick: 2000, freezeEndTick: 2010, endTick: 2500,
    stateSnapshots: [snapshot("freeze_end", 2010, [state(CT1, "CT", true, null), state(T1, "T")]),
      snapshot("end", 2500, [state(CT1, "CT"), state(T1, "T")])],
  };
  const missingWindow = {
    number: 3, winner: "CT", events: [],
    startTick: 3000, freezeEndTick: 3010,
    stateSnapshots: [snapshot("freeze_end", 3010, [state(CT1, "CT"), state(T1, "T")])],
  };
  const result = analyzeMatch(mkMatch([player(CT1), player(T1)], [eligible, unconfirmed, missingWindow]));
  assert.equal(result.coverage.totalRounds, 3);

  const ct = byId(result, CT1);
  assert.equal(ct.coverage.eligibleRounds, 2);
  assert.equal(ct.coverage.countedRounds, 1);
  assert.equal(ct.coverage.skippedUnconfirmedParticipation, 1);
  assert.equal(ct.coverage.skippedMissingWindow, 1);
  assert.equal(ct.coverage.eligibleRounds, ct.coverage.countedRounds + ct.coverage.skippedUnconfirmedParticipation);
  assert.equal(ct.coverage.eligibleRounds + ct.coverage.skippedMissingWindow, result.coverage.totalRounds);
  assert.equal(ct.kast.playedRounds, ct.roundsPlayed);
  assert.equal(ct.kast.playedRounds, ct.coverage.countedRounds);
});

// Utility HE/fire effective damage is a subset of the player's effective damage
// and is fully explained by the preserved per-hit evidence.
test("utility effective damage is a subset of player effective damage and evidence-explained", () => {
  const sides = { [CT1]: "CT", [CT2]: "CT", [T1]: "T", [T2]: "T" };
  const round = {
    number: 1, winner: "CT", events: [
      damage(1100, "weapon_hegrenade", CT1, T1, 60, 40, sides),
      damage(1110, "weapon_ak47", CT1, T1, 30, 10, sides),
      damage(1120, "weapon_inferno", CT1, T2, 20, 80, sides),
    ],
    startTick: 1000, freezeEndTick: 1010, endTick: 1500,
    stateSnapshots: [snapshot("freeze_end", 1010, ids4.map(id => state(id, sides[id]))),
      snapshot("end", 1500, [state(CT1, "CT"), state(CT2, "CT"), state(T1, "T", false), state(T2, "T", true)])],
  };
  const result = analyzeMatch(mkMatch(ids4.map(player), [round]));
  const ct1 = byId(result, CT1);
  const u = ct1.utility;
  assert.deepEqual([u.he.enemyDamage, u.fire.enemyDamage], [60, 20]);
  assert.equal(u.he.resolvedEnemyDamage + u.fire.resolvedEnemyDamage, 80);
  assert.ok(u.he.enemyDamage + u.fire.enemyDamage <= ct1.effectiveDamage);
  for (const metric of [u.he, u.fire]) {
    const explained = metric.evidence.reduce((total, entry) => total + entry.effectiveLoss, 0);
    assert.equal(explained, metric.resolvedEnemyDamage);
    assert.ok(metric.evidence.every(entry => entry.effectiveLoss !== null));
  }
});

// ---------------------------------------------------------------------------
// Real DEM final acceptance
// ---------------------------------------------------------------------------

const defaultDemo = fileURLToPath(new URL("../../../.demo/demo1.dem", import.meta.url));
const demoPath = process.env.DEM_TEST_FILE ? resolve(process.env.DEM_TEST_FILE) : defaultDemo;
const skip = !process.env.DEM_TEST_FILE && !existsSync(defaultDemo)
  ? "Provide .demo/demo1.dem or DEM_TEST_FILE"
  : false;

test("real demo1.dem satisfies the cross-metric final acceptance invariants", { skip }, async () => {
  const match = await new Demoparser2Provider().parse(demoPath);
  const analytics = analyzeMatch(match);

  assert.equal(sum(analytics.players, entry => entry.trade.tradeKills),
    sum(analytics.players, entry => entry.trade.tradedDeaths));

  for (const entry of analytics.players) {
    // Every participation-scoped denominator agrees.
    assert.equal(entry.kast.playedRounds, entry.roundsPlayed, entry.nickname);
    assert.equal(entry.coverage.countedRounds, entry.roundsPlayed, entry.nickname);
    // The side split partitions the player totals under full coverage.
    assert.equal(entry.side.CT.roundsPlayed + entry.side.T.roundsPlayed, entry.roundsPlayed, entry.nickname);
    assert.equal(entry.side.CT.kills + entry.side.T.kills, entry.kills, entry.nickname);
    assert.equal(entry.side.CT.deaths + entry.side.T.deaths, entry.deaths, entry.nickname);
    assert.equal(entry.side.CT.assists + entry.side.T.assists, entry.assists, entry.nickname);
    // Utility damage is a gated subset of the player's damage, explained per hit.
    const utility = entry.utility;
    assert.ok(utility.he.resolvedEnemyDamage + utility.fire.resolvedEnemyDamage <= entry.effectiveDamage, entry.nickname);
    for (const metric of [utility.he, utility.fire]) {
      assert.equal(metric.evidence.reduce((total, e) => total + e.effectiveLoss, 0), metric.resolvedEnemyDamage, entry.nickname);
    }
    // Flash counts are exactly their preserved evidence.
    assert.equal(utility.flash.enemy.count, utility.flash.enemy.evidence.length, entry.nickname);
    assert.equal(utility.flash.teammate.count, utility.flash.teammate.evidence.length, entry.nickname);
    assert.equal(utility.flash.self.count, utility.flash.self.evidence.length, entry.nickname);
  }

  // Every kill has a death and both sides of the map agree.
  assert.equal(sum(analytics.players, entry => entry.kills), sum(analytics.players, entry => entry.deaths));
  assert.equal(sum(analytics.players, entry => entry.side.CT.kills), sum(analytics.players, entry => entry.side.T.deaths));
  assert.equal(sum(analytics.players, entry => entry.side.T.kills), sum(analytics.players, entry => entry.side.CT.deaths));

  // The full-coverage sample must not hide unavailable or ambiguous evidence.
  assert.equal(analytics.coverage.severity.unavailable, 0);
  assert.equal(analytics.coverage.severity.ambiguous, 0);

  assert.deepEqual(analyzeMatch(match), analytics);
});
