import assert from "node:assert/strict";
import test from "node:test";

import { analyzeMatch, buildCoverage } from "../dist/index.js";

const CT1 = "76561198000000001";
const CT2 = "76561198000000002";
const T1 = "76561198000000003";
const T2 = "76561198000000004";
const T3 = "76561198000000005";
const T4 = "76561198000000006";

function player(steamId, nickname) {
  return { steamId, nickname, team: "CT" };
}

function kill(tick, killer, victim, extra = {}) {
  return { type: "kill", tick, killer, victim, ...extra };
}

function damage(tick, attacker, victim, healthDamage, extra = {}) {
  return {
    type: "damage", tick, attacker, victim, attackerSide: "CT", victimSide: "T",
    healthDamage, armorDamage: 0, healthRemaining: Math.max(0, 100 - healthDamage), armorRemaining: 0,
    ...extra,
  };
}

function state(steamId, side, extra = {}) {
  return {
    steamId, side, alive: true,
    participant: side === "CT" || side === "T" ? true : null,
    ...extra,
  };
}

function snapshot(boundary, tick, states, extra = {}) {
  return { boundary, tick, availability: "observed", players: states, unidentifiedPlayerCount: 0, ...extra };
}

function roster(sides, tick, boundary = "freeze_end") {
  return snapshot(boundary, tick, Object.entries(sides).map(([steamId, side]) => state(steamId, side)));
}

function mkRound(number, events, options = {}) {
  const value = { number, winner: "CT", events };
  if (options.start !== undefined) value.startTick = options.start;
  if (options.freeze !== undefined) value.freezeEndTick = options.freeze;
  if (options.end !== undefined) value.endTick = options.end;
  if (options.snapshots !== undefined) value.stateSnapshots = options.snapshots;
  return value;
}

function mkMatch(players, rounds) {
  return { id: "synthetic-match", map: "de_dust2", tickRate: 64, players, rounds };
}

function byId(result, steamId) {
  return result.players.find(candidate => candidate.steamId === steamId);
}

function zeroIssues(result) {
  return Object.values(result.coverage.issues).every(count => count === 0);
}

test("computes K/D/A, HS%, ADR, side split and opening from fully covered rounds", () => {
  const players = [player(CT1, "ct"), player(T1, "t")];
  const sides = { [CT1]: "CT", [T1]: "T" };
  const rounds = [
    mkRound(1, [
      damage(140, T1, CT1, 30, { attackerSide: "T", victimSide: "CT" }),
      kill(150, CT1, T1, { killerSide: "CT", victimSide: "T", headshot: true, teamkill: false }),
    ], { start: 100, freeze: 110, end: 200, snapshots: [
      roster(sides, 110),
      snapshot("end", 200, [state(CT1, "CT"), state(T1, "T", { alive: false })]),
    ] }),
    mkRound(2, [
      kill(350, T1, CT1, { killerSide: "T", victimSide: "CT", headshot: false, teamkill: false }),
    ], { start: 300, freeze: 310, end: 400, snapshots: [
      roster(sides, 310),
      snapshot("end", 400, [state(CT1, "CT", { alive: false }), state(T1, "T")]),
    ] }),
  ];
  const result = analyzeMatch(mkMatch(players, rounds));
  assert.ok(zeroIssues(result));
  assert.equal(result.coverage.totalRounds, 2);
  assert.equal(result.coverage.eventEligibleRounds, 2);

  const ct = byId(result, CT1);
  assert.deepEqual([ct.kills, ct.deaths, ct.assists, ct.kdRatio], [1, 1, 0, 1]);
  assert.deepEqual([ct.headshotKills, ct.headshotPercentage], [1, 100]);
  assert.deepEqual([ct.roundsPlayed, ct.reportedDamage, ct.reportedAdr], [2, 0, 0]);
  assert.deepEqual([ct.effectiveDamage, ct.adr], [0, 0]);
  // Complete effective-damage coverage keeps the standard ADR numeric.
  assert.equal(ct.coverage.effectiveDamageUnresolved, 0);
  assert.equal(ct.side.CT.effectiveDamageUnresolved, 0);
  assert.equal(ct.side.T.effectiveDamageUnresolved, 0);
  assert.deepEqual([ct.side.CT.kills, ct.side.CT.deaths, ct.side.T.kills], [1, 1, 0]);
  assert.deepEqual([ct.opening.kills, ct.opening.deaths, ct.opening.duels, ct.opening.winRate], [1, 1, 2, 0.5]);

  const t = byId(result, T1);
  assert.deepEqual([t.kills, t.deaths, t.assists], [1, 1, 0]);
  assert.deepEqual([t.headshotKills, t.headshotPercentage], [0, 0]);
  assert.deepEqual([t.roundsPlayed, t.reportedDamage, t.reportedAdr], [2, 30, 15]);
  assert.deepEqual([t.effectiveDamage, t.adr], [30, 15]);
  assert.deepEqual([t.side.T.kills, t.side.T.deaths, t.side.T.reportedDamage, t.side.T.effectiveDamage],
    [1, 1, 30, 30]);
  assert.deepEqual([t.opening.kills, t.opening.deaths], [1, 1]);
});

test("excludes post-round kills, deaths and damage through the centralized window", () => {
  const players = [player(CT1, "ct"), player(T1, "t")];
  const rounds = [mkRound(1, [
    kill(150, CT1, T1, { killerSide: "CT", victimSide: "T", teamkill: false }),
    kill(250, CT1, T1, { killerSide: "CT", victimSide: "T", teamkill: false }),
    kill(250, T1, CT1, { killerSide: "T", victimSide: "CT", teamkill: false }),
    damage(250, CT1, T1, 100),
  ], { start: 100, freeze: 110, end: 200, snapshots: [roster({ [CT1]: "CT", [T1]: "T" }, 110)] })];
  const result = analyzeMatch(mkMatch(players, rounds));
  const ct = byId(result, CT1);
  const t = byId(result, T1);
  assert.deepEqual([ct.kills, ct.deaths], [1, 0]);
  assert.deepEqual([t.kills, t.deaths], [0, 1]);
  assert.equal(ct.reportedDamage, 0);
  assert.equal(ct.effectiveDamage, 0);
  assert.equal(result.coverage.issues["post-round-events-excluded"], 3);
  assert.equal(result.coverage.rounds[0].excludedEventCount, 3);
});

test("treats an incomplete round window as ineligible instead of guessing", () => {
  const players = [player(CT1, "ct"), player(T1, "t")];
  const sides = { [CT1]: "CT", [T1]: "T" };
  const rounds = [
    mkRound(1, [kill(150, CT1, T1, { killerSide: "CT", victimSide: "T", teamkill: false })],
      { start: 100, freeze: 110, snapshots: [roster(sides, 110)] }),
    mkRound(2, [kill(350, CT1, T1, { killerSide: "CT", victimSide: "T", teamkill: false })],
      { freeze: 310, end: 400, snapshots: [roster(sides, 310)] }),
  ];
  const result = analyzeMatch(mkMatch(players, rounds));
  assert.equal(result.coverage.eventEligibleRounds, 0);
  assert.equal(result.coverage.issues["round-end-missing"], 1);
  assert.equal(result.coverage.issues["round-start-missing"], 1);
  const ct = byId(result, CT1);
  assert.equal(ct.kills, 0);
  assert.equal(ct.roundsPlayed, 0);
  assert.equal(ct.adr, null);
  assert.equal(ct.coverage.skippedMissingWindow, 2);
});

test("distinguishes an unavailable roster from a degraded start-boundary fallback", () => {
  const players = [player(CT1, "ct"), player(T1, "t")];
  const sides = { [CT1]: "CT", [T1]: "T" };
  const rounds = [
    mkRound(1, [damage(150, CT1, T1, 40)], { start: 100, freeze: 110, end: 200, snapshots: [roster(sides, 110)] }),
    mkRound(2, [damage(350, CT1, T1, 1000)], { start: 300, freeze: 310, end: 400, snapshots: [] }),
    mkRound(3, [damage(550, CT1, T1, 60)], {
      start: 500, freeze: 510, end: 600,
      snapshots: [
        snapshot("freeze_end", 510, [], { availability: "unavailable" }),
        roster(sides, 500, "start"),
      ],
    }),
  ];
  const result = analyzeMatch(mkMatch(players, rounds));
  assert.equal(result.coverage.issues["roster-snapshot-unavailable"], 1);
  assert.equal(result.coverage.issues["roster-snapshot-fallback-start"], 1);
  assert.equal(result.coverage.rosterResolvedRounds, 2);
  assert.ok(result.coverage.rounds[2].rosterDegraded);
  const ct = byId(result, CT1);
  assert.equal(ct.roundsPlayed, 2);
  assert.equal(ct.reportedDamage, 100);
  assert.equal(ct.reportedAdr, 50);
  assert.equal(ct.effectiveDamage, 100);
  assert.equal(ct.adr, 50);
  assert.equal(ct.coverage.skippedUnconfirmedParticipation, 1);
});

test("reports unidentified, missing, unknown-side, unknown-participation and unknown-alive state", () => {
  const players = [player(CT1, "ct"), player(T1, "t"), player(T2, "absent")];
  const rounds = [mkRound(1, [], {
    start: 100, freeze: 110, end: 200,
    snapshots: [
      snapshot("freeze_end", 110, [
        state(CT1, "Unknown", { participant: null, alive: null }),
        state(T1, "T"),
      ], { unidentifiedPlayerCount: 2 }),
    ],
  })];
  const result = analyzeMatch(mkMatch(players, rounds));
  const issues = result.coverage.issues;
  assert.equal(issues["roster-unidentified-players"], 1);
  assert.equal(issues["player-side-unknown"], 1);
  assert.equal(issues["player-participation-unknown"], 1);
  assert.equal(issues["player-alive-unknown"], 1);
  assert.equal(issues["player-not-in-roster"], 1);
  assert.equal(byId(result, CT1).roundsPlayed, 0);
  assert.equal(byId(result, T1).roundsPlayed, 1);
});

test("attributes CT/T split from per-round snapshot side and never from Player.team", () => {
  const players = [player(CT1, "team-says-CT"), player(T1, "t")];
  const rounds = [mkRound(1, [kill(150, CT1, T1, { killerSide: "T", victimSide: "CT", teamkill: false })],
    { start: 100, freeze: 110, end: 200, snapshots: [roster({ [CT1]: "T", [T1]: "CT" }, 110)] })];
  const result = analyzeMatch(mkMatch(players, rounds));
  const ct = byId(result, CT1);
  assert.equal(ct.kills, 1);
  assert.deepEqual([ct.side.CT.kills, ct.side.CT.roundsPlayed, ct.side.T.kills, ct.side.T.roundsPlayed], [0, 0, 1, 1]);
});

test("removes confirmed teamkills from kills while still counting the death", () => {
  const players = [player(CT1, "ct"), player(T1, "t")];
  const rounds = [mkRound(1, [kill(150, CT1, T1, { killerSide: "T", victimSide: "T", teamkill: true })],
    { start: 100, freeze: 110, end: 200, snapshots: [roster({ [CT1]: "T", [T1]: "T" }, 110)] })];
  const result = analyzeMatch(mkMatch(players, rounds));
  assert.equal(byId(result, CT1).kills, 0);
  assert.equal(byId(result, T1).deaths, 1);
  assert.equal(result.coverage.issues["opening-duel-unattributed"], 1);
});

test("counts only killer-side assists and surfaces the suppressed friendly-fire assists", () => {
  const players = [player(CT1, "ct"), player(CT2, "ct2"), player(T1, "t")];
  const sides = { [CT1]: "CT", [CT2]: "CT", [T1]: "T" };
  const rounds = [mkRound(1, [
    kill(150, T1, CT2, { killerSide: "T", victimSide: "CT", assister: CT1, assisterSide: "T", teamkill: false }),
    kill(160, T1, CT2, { killerSide: "T", victimSide: "CT", assister: CT1, assisterSide: "CT", teamkill: false }),
  ], { start: 100, freeze: 110, end: 200, snapshots: [roster(sides, 110)] })];
  const result = analyzeMatch(mkMatch(players, rounds));
  const ct = byId(result, CT1);
  assert.equal(ct.assists, 1);
  assert.equal(ct.coverage.assistsExcludedBySide, 1);
  assert.equal(result.coverage.issues["assist-side-mismatch"], 1);
});

test("keeps reported overkill, drops friendly fire, and flags unknown damage sides", () => {
  const players = [player(CT1, "ct"), player(CT2, "ct2"), player(T1, "t")];
  const sides = { [CT1]: "CT", [CT2]: "CT", [T1]: "T" };
  const rounds = [mkRound(1, [
    damage(140, CT1, CT2, 50, { attackerSide: "CT", victimSide: "CT" }),
    damage(150, CT1, T1, 20, { attackerSide: "Unknown", victimSide: "T" }),
    damage(160, CT1, T1, 109, { attackerSide: "CT", victimSide: "T" }),
  ], { start: 100, freeze: 110, end: 200, snapshots: [roster(sides, 110)] })];
  const result = analyzeMatch(mkMatch(players, rounds));
  const ct = byId(result, CT1);
  // Reported damage keeps the raw 109 overkill; effective damage removes only
  // the 80 HP the victim still had when the hit landed.
  assert.equal(ct.reportedDamage, 109);
  assert.equal(ct.reportedAdr, 109);
  assert.equal(ct.effectiveDamage, 80);
  assert.equal(ct.adr, 80);
  assert.equal(ct.coverage.damageWithoutKnownSides, 1);
  assert.equal(result.coverage.issues["damage-side-unknown"], 1);
  assert.equal(result.coverage.issues["damage-effective-chain-broken"], 0);
});

test("distributes multi-kills by round and keeps every same-tick kill", () => {
  const players = [player(CT1, "ct"), player(T1, "t1"), player(T2, "t2"), player(T3, "t3"), player(T4, "t4")];
  const sides = { [CT1]: "CT", [T1]: "T", [T2]: "T", [T3]: "T", [T4]: "T" };
  const kills = (number, start, victims) => mkRound(number, victims.map((victim, index) =>
    kill(start + index, CT1, victim, { killerSide: "CT", victimSide: "T", teamkill: false })),
  { start, freeze: start + 10, end: start + 100, snapshots: [roster(sides, start + 10)] });
  const rounds = [kills(1, 100, [T1, T2, T3, T4]), kills(2, 300, [T1, T2]), kills(3, 500, [T1]),
    mkRound(4, [], { start: 700, freeze: 710, end: 800, snapshots: [roster(sides, 710)] })];
  const result = analyzeMatch(mkMatch(players, rounds));
  const ct = byId(result, CT1);
  assert.equal(ct.kills, 7);
  assert.deepEqual(ct.multiKills.counts, { 2: 1, 3: 0, 4: 1, 5: 0 });
  assert.equal(ct.multiKills.multiKillRounds, 2);
  assert.equal(ct.multiKills.maxKillsInRound, 4);
  assert.equal(result.coverage.issues["opening-duel-absent"], 1);
});

test("marks equal-earliest-tick opening duels contested and unattributed first kills", () => {
  const players = [player(CT1, "ct1"), player(CT2, "ct2"), player(T1, "t1"), player(T2, "t2")];
  const sides = { [CT1]: "CT", [CT2]: "CT", [T1]: "T", [T2]: "T" };
  const contested = mkRound(1, [
    kill(150, CT1, T1, { killerSide: "CT", victimSide: "T", teamkill: false }),
    kill(150, CT2, T2, { killerSide: "CT", victimSide: "T", teamkill: false }),
  ], { start: 100, freeze: 110, end: 200, snapshots: [roster(sides, 110)] });
  const world = mkRound(2, [
    kill(350, "world", T1, { killerSide: "Unknown", victimSide: "T" }),
    kill(360, CT1, T2, { killerSide: "CT", victimSide: "T", teamkill: false }),
  ], { start: 300, freeze: 310, end: 400, snapshots: [roster(sides, 310)] });
  const result = analyzeMatch(mkMatch(players, [contested, world]));
  assert.equal(result.coverage.issues["opening-duel-contested"], 1);
  assert.equal(result.coverage.issues["opening-duel-unattributed"], 1);
  assert.equal(byId(result, CT1).opening.kills, 0);
  assert.equal(byId(result, T1).opening.deaths, 0);
});

test("exposes the window as inclusive of both formal boundaries", () => {
  const players = [player(CT1, "ct"), player(T1, "t")];
  const round = mkRound(1, [
    kill(100, CT1, T1, { killerSide: "CT", victimSide: "T", teamkill: false }),
    kill(200, CT1, T1, { killerSide: "CT", victimSide: "T", teamkill: false }),
    kill(201, CT1, T1, { killerSide: "CT", victimSide: "T", teamkill: false }),
  ], { start: 100, freeze: 110, end: 200, snapshots: [roster({ [CT1]: "CT", [T1]: "T" }, 110)] });
  const coverage = buildCoverage(mkMatch(players, [round]));
  const window = coverage.rounds[0].window;
  assert.deepEqual([window.includes(100), window.includes(150), window.includes(200), window.includes(201)], [true, true, true, false]);
  assert.equal(window.excludedEventCount, 1);
  assert.equal(analyzeMatch(mkMatch(players, [round])).players[0].kills, 2);
});

test("caps effective damage at the victim's pre-hit health while keeping reported overkill", () => {
  const players = [player(CT1, "ct"), player(T1, "t")];
  const rounds = [mkRound(1, [
    damage(150, CT1, T1, 109, { attackerSide: "CT", victimSide: "T", healthRemaining: 0 }),
  ], { start: 100, freeze: 110, end: 200, snapshots: [roster({ [CT1]: "CT", [T1]: "T" }, 110)] })];
  const result = analyzeMatch(mkMatch(players, rounds));
  const ct = byId(result, CT1);
  assert.equal(ct.reportedDamage, 109);
  assert.equal(ct.reportedAdr, 109);
  assert.equal(ct.effectiveDamage, 100);
  assert.equal(ct.adr, 100);
  assert.equal(ct.coverage.effectiveDamageUnresolved, 0);
  assert.equal(result.coverage.issues["damage-effective-chain-broken"], 0);
});

test("keeps friendly and self damage in the target health trajectory but credits only enemy loss", () => {
  const players = [player(CT1, "ct"), player(T1, "t"), player(T2, "teammate")];
  const sides = { [CT1]: "CT", [T1]: "T", [T2]: "T" };
  const rounds = [mkRound(1, [
    // World/self and friendly damage lower the victim even though neither is
    // credited, so the enemy hit can only remove the 50 HP that are left.
    damage(140, null, T1, 20, { attackerSide: "Unknown", victimSide: "T" }),
    damage(150, T2, T1, 30, { attackerSide: "T", victimSide: "T", healthRemaining: 50 }),
    damage(160, CT1, T1, 60, { attackerSide: "CT", victimSide: "T", healthRemaining: 0 }),
  ], { start: 100, freeze: 110, end: 200, snapshots: [roster(sides, 110)] })];
  const result = analyzeMatch(mkMatch(players, rounds));
  const ct = byId(result, CT1);
  assert.equal(ct.reportedDamage, 60);
  assert.equal(ct.effectiveDamage, 50);
  const teammate = byId(result, T2);
  assert.equal(teammate.reportedDamage, 0);
  assert.equal(teammate.effectiveDamage, 0);
  assert.equal(result.coverage.issues["damage-effective-chain-broken"], 0);
});

test("reports a broken health trajectory instead of guessing an effective loss", () => {
  const players = [player(CT1, "ct"), player(T1, "t")];
  const sides = { [CT1]: "CT", [T1]: "T" };
  const rounds = [mkRound(1, [
    damage(150, CT1, T1, 20, { attackerSide: "CT", victimSide: "T", healthRemaining: 80 }),
    // Health rises again, so this hit's real loss cannot be separated from the heal.
    damage(160, CT1, T1, 20, { attackerSide: "CT", victimSide: "T", healthRemaining: 90 }),
  ], { start: 100, freeze: 110, end: 200, snapshots: [roster(sides, 110)] })];
  const result = analyzeMatch(mkMatch(players, rounds));
  const ct = byId(result, CT1);
  assert.equal(ct.reportedDamage, 40);
  // Reported ADR is raw evidence and is never gated by effective coverage.
  assert.equal(ct.reportedAdr, 40);
  // The first hit is confirmed, so effectiveDamage keeps that 20 HP as the
  // resolved part, but no standard ADR may be published from a partial total.
  assert.equal(ct.effectiveDamage, 20);
  assert.equal(ct.adr, null);
  assert.equal(ct.coverage.effectiveDamageUnresolved, 1);
  assert.equal(ct.side.CT.effectiveDamage, 20);
  assert.equal(ct.side.CT.effectiveDamageUnresolved, 1);
  assert.equal(ct.side.CT.adr, null);
  assert.equal(ct.side.T.effectiveDamageUnresolved, 0);
  assert.equal(result.coverage.issues["damage-effective-chain-broken"], 1);
});

test("does not order same-tick hits on one victim without corroborating health", () => {
  const players = [player(CT1, "ct1"), player(CT2, "ct2"), player(T1, "t")];
  const sides = { [CT1]: "CT", [CT2]: "CT", [T1]: "T" };
  const rounds = [mkRound(1, [
    damage(150, CT1, T1, 30, { attackerSide: "CT", victimSide: "T", healthRemaining: 50 }),
    damage(150, CT2, T1, 30, { attackerSide: "CT", victimSide: "T", healthRemaining: 50 }),
  ], { start: 100, freeze: 110, end: 200, snapshots: [roster(sides, 110)] })];
  const result = analyzeMatch(mkMatch(players, rounds));
  // Both hits record the same post-hit health, so the split is unprovable.
  assert.equal(byId(result, CT1).effectiveDamage, 0);
  assert.equal(byId(result, CT2).effectiveDamage, 0);
  // Ambiguous hits are unresolved too, so neither attacker may publish ADR.
  assert.equal(byId(result, CT1).adr, null);
  assert.equal(byId(result, CT2).adr, null);
  assert.equal(byId(result, CT1).reportedAdr, 30);
  assert.equal(byId(result, CT2).reportedAdr, 30);
  assert.equal(byId(result, CT1).side.CT.effectiveDamageUnresolved, 1);
  assert.equal(byId(result, CT2).side.CT.effectiveDamageUnresolved, 1);
  assert.equal(byId(result, CT1).side.CT.adr, null);
  assert.equal(byId(result, CT2).side.CT.adr, null);
  assert.equal(byId(result, CT1).coverage.effectiveDamageUnresolved, 1);
  assert.equal(byId(result, CT2).coverage.effectiveDamageUnresolved, 1);
  assert.equal(result.coverage.issues["damage-effective-same-tick-ambiguous"], 2);
});

test("gates only the affected CT/T side while an unrelated side stays numeric", () => {
  const players = [player(CT1, "ct"), player(T1, "t")];
  const sides = { [CT1]: "CT", [T1]: "T" };
  const rounds = [
    mkRound(1, [
      damage(150, CT1, T1, 20, { attackerSide: "CT", victimSide: "T", healthRemaining: 80 }),
      // HP rises again, so this CT hit on T1 becomes unresolved.
      damage(160, CT1, T1, 20, { attackerSide: "CT", victimSide: "T", healthRemaining: 90 }),
    ], { start: 100, freeze: 110, end: 200, snapshots: [roster(sides, 110)] }),
    mkRound(2, [
      damage(350, T1, CT1, 30, { attackerSide: "T", victimSide: "CT", healthRemaining: 70 }),
    ], { start: 300, freeze: 310, end: 400, snapshots: [roster(sides, 310)] }),
  ];
  const result = analyzeMatch(mkMatch(players, rounds));
  const ct = byId(result, CT1);
  const t = byId(result, T1);

  // CT side of the CT player carries the unresolved hit.
  assert.equal(ct.coverage.effectiveDamageUnresolved, 1);
  assert.equal(ct.effectiveDamage, 20);
  assert.equal(ct.adr, null);
  assert.equal(ct.side.CT.effectiveDamageUnresolved, 1);
  assert.equal(ct.side.CT.effectiveDamage, 20);
  assert.equal(ct.side.CT.adr, null);
  assert.equal(ct.reportedAdr, 20);

  // The T player's damage fully resolves on its own side, so its side ADR
  // stays numeric even though the opposing CT player is unresolved.
  assert.equal(t.coverage.effectiveDamageUnresolved, 0);
  assert.equal(t.side.T.effectiveDamageUnresolved, 0);
  assert.equal(t.side.T.effectiveDamage, 30);
  assert.equal(t.side.T.roundsPlayed, 2);
  assert.equal(t.side.T.adr, 15);
  assert.equal(t.adr, 15);
});

test("accepts same-tick hits when the recorded health proves the hit order", () => {
  const players = [player(CT1, "ct1"), player(CT2, "ct2"), player(T1, "t")];
  const sides = { [CT1]: "CT", [CT2]: "CT", [T1]: "T" };
  const rounds = [mkRound(1, [
    damage(150, CT1, T1, 30, { attackerSide: "CT", victimSide: "T", healthRemaining: 70 }),
    damage(150, CT2, T1, 40, { attackerSide: "CT", victimSide: "T", healthRemaining: 30 }),
  ], { start: 100, freeze: 110, end: 200, snapshots: [roster(sides, 110)] })];
  const result = analyzeMatch(mkMatch(players, rounds));
  assert.equal(byId(result, CT1).effectiveDamage, 30);
  assert.equal(byId(result, CT2).effectiveDamage, 40);
  assert.equal(result.coverage.issues["damage-effective-same-tick-ambiguous"], 0);
});

test("is deterministic for identical input", () => {
  const players = [player(CT1, "ct"), player(T1, "t")];
  const rounds = [mkRound(1, [kill(150, CT1, T1, { killerSide: "CT", victimSide: "T", headshot: true, teamkill: false })],
    { start: 100, freeze: 110, end: 200, snapshots: [roster({ [CT1]: "CT", [T1]: "T" }, 110)] })];
  const match = mkMatch(players, rounds);
  assert.deepEqual(analyzeMatch(match), analyzeMatch(match));
});
