import assert from "node:assert/strict";
import test from "node:test";
import { generateFindings } from "../dist/index.js";

// Neutral MatchAnalytics contract fixture. Every test changes only the evidence it exercises.
function fixture() {
  const flash = () => ({ count: 0, complete: true, reportedDurationSeconds: 0,
    blindDurationSeconds: null, durationComplete: false, effectiveCount: null, evidence: [] });
  const damage = () => ({ reportedEnemyDamage: 0, resolvedEnemyDamage: 0, enemyDamage: 0, complete: true, evidence: [] });
  const side = () => ({ roundsPlayed: 12, kills: 10, deaths: 10, assists: 0,
    reportedDamage: 960, reportedAdr: 80, effectiveDamage: 960, effectiveDamageUnresolved: 0, adr: 80 });
  return { matchId: "synthetic", tradeWindow: { seconds: 5, ticks: 320 },
    coverage: { totalRounds: 24, eventEligibleRounds: 24, rosterResolvedRounds: 24,
      issues: {}, severity: { unavailable: 0, ambiguous: 0, degraded: 0, informational: 0 },
      rounds: Array.from({ length: 24 }, (_, i) => ({ number: i + 1, eventEligible: true,
        rosterDegraded: false, unidentifiedPlayerCount: 0, issues: [] })) },
    players: [{ steamId: "p", nickname: "Player", kills: 20, deaths: 20, assists: 0,
      kdRatio: 1, headshotKills: 0, headshotPercentage: 0, roundsPlayed: 24,
      reportedDamage: 1920, reportedAdr: 80, effectiveDamage: 1920, adr: 80,
      side: { CT: side(), T: side() }, multiKills: { counts: { 2: 0, 3: 0, 4: 0, 5: 0 }, multiKillRounds: 0, maxKillsInRound: 1 },
      opening: { kills: 2, deaths: 2, duels: 4, winRate: 0.5 },
      kast: { rounds: 0, eligibleRounds: 24, playedRounds: 24, percentage: 0, complete: true },
      trade: { complete: true, available: true, tradeableDeaths: 10, tradedDeaths: 5, tradeKills: 0, tradeRate: 50 },
      clutch: { opportunities: 0, wins: 0, byOpponents: {}, winsByOpponents: {}, list: [] },
      utility: { throws: { observed: {}, counts: { hegrenade: 0, fire: 0, flashbang: 0, smoke: 0, decoy: 0 },
        molotov: 0, incendiary: 0, complete: true, evidence: [] }, he: damage(), fire: damage(),
        flash: { enemy: flash(), teammate: flash(), self: flash(), assists: 0, observedAssists: 0,
          assistsComplete: true, assistEvidence: [], effectiveThresholdSeconds: null }, effects: [],
        coverage: { complete: false, issues: { "flash-duration-unverified": 1 } } },
      coverage: { eligibleRounds: 24, countedRounds: 24, skippedMissingWindow: 0,
        skippedUnconfirmedParticipation: 0, assistsExcludedBySide: 0, killsWithoutTeamkillStatus: 0,
        killsWithoutHeadshotStatus: 0, damageWithoutKnownSides: 0, effectiveDamageUnresolved: 0 } }] };
}
const ids = a => generateFindings(a).map(f => f.ruleId);
const has = (a, id) => ids(a).includes(id);
const player = a => a.players[0];
const setTeam = (a, count = 5, throws = 10, duration = 1) => {
  const u = player(a).utility;
  u.throws.counts.flashbang = throws;
  u.flash.teammate.count = count;
  u.flash.teammate.evidence = Array.from({ length: count }, (_, i) => ({ round: i + 1,
    event: { type: "flash", tick: 100 + i, victim: `ally${i}`, attacker: "p", blindDurationSeconds: duration } }));
};
const win = (round, opponents = 3, won = true) => ({ round, opponents, won, side: "CT", player: "p", tick: 100, deathTick: null });

test("neutral metrics and unknown player generate no findings", () => {
  const a = fixture(); assert.deepEqual(generateFindings(a), []); assert.deepEqual(generateFindings(a, "missing"), []);
});
test("side gap checks both boundaries, both directions and minimum sample", () => {
  const a = fixture(), p = player(a); p.side.T.adr = 100; p.side.CT.adr = 70;
  assert.ok(has(a, "side-impact.ct-gap"));
  p.side.CT.adr = 70.01; assert.deepEqual(ids(a), []);
  p.side.CT.adr = 50; p.side.T.adr = 75; assert.ok(has(a, "side-impact.ct-gap"));
  p.side.T.adr = 74.99; assert.deepEqual(ids(a), []);
  p.side.CT.adr = 100; p.side.T.adr = 60; assert.ok(has(a, "side-impact.t-gap"));
  p.side.T.roundsPlayed = 7; p.roundsPlayed = 19; assert.deepEqual(ids(a), []);
  p.side.T.roundsPlayed = 8; p.roundsPlayed = 20; assert.ok(has(a, "side-impact.t-gap"));
});
test("side gap refuses null, unresolved HP, dropped unknown-side damage and incomplete partition", () => {
  for (const mutate of [p => p.side.CT.adr = null, p => p.coverage.effectiveDamageUnresolved = 1,
    p => p.coverage.damageWithoutKnownSides = 1, p => p.roundsPlayed = 25]) {
    const a = fixture(), p = player(a); p.side.CT.adr = 40; mutate(p); assert.deepEqual(ids(a), []);
  }
});
test("trade strict threshold, minimum sample, null and complete/available gates", () => {
  const a = fixture(), t = player(a).trade;
  t.tradeRate = 29.99; t.tradeableDeaths = 8; assert.ok(has(a, "trade.low-rate"));
  t.tradeRate = 30; assert.deepEqual(ids(a), []);
  t.tradeRate = 0; t.tradeableDeaths = 7; assert.deepEqual(ids(a), []);
  t.tradeableDeaths = 8;
  for (const [field, value] of [["tradeRate", null], ["complete", false], ["available", false]]) {
    const b = structuredClone(a); player(b).trade[field] = value; assert.deepEqual(ids(b), []);
  }
});
test("opening ratio thresholds, positive/negative and duel sample", () => {
  const a = fixture(), o = player(a).opening;
  o.kills = 3; o.deaths = 1; o.winRate = 0.75; assert.ok(has(a, "opening.positive"));
  o.winRate = 0.7499; assert.deepEqual(ids(a), []);
  o.kills = 1; o.deaths = 3; o.winRate = 0.25; assert.ok(has(a, "opening.negative"));
  o.winRate = 0.2501; assert.deepEqual(ids(a), []);
  o.winRate = 0; o.duels = 3; assert.deepEqual(ids(a), []);
  o.duels = 4; o.winRate = null; assert.deepEqual(ids(a), []);
});
test("opening refuses contested/unattributed coverage", () => {
  for (const issue of ["opening-duel-contested", "opening-duel-unattributed"]) {
    const a = fixture(); player(a).opening.winRate = 1; a.coverage.issues[issue] = 1; assert.deepEqual(ids(a), []);
  }
});
test("side/trade/opening refuse missing windows, participation and degraded/unidentified roster", () => {
  for (const mutate of [a => player(a).coverage.skippedMissingWindow = 1,
    a => player(a).coverage.skippedUnconfirmedParticipation = 1,
    a => a.coverage.rounds[0].rosterDegraded = true, a => a.coverage.rounds[0].unidentifiedPlayerCount = 1]) {
    const a = fixture(), p = player(a); p.side.CT.adr = 40; p.trade.tradeRate = 0; p.opening.winRate = 1;
    mutate(a); assert.deepEqual(ids(a), []);
  }
});
test("utility damage low/high thresholds and eight-throw sample", () => {
  const a = fixture(), u = player(a).utility; u.throws.counts.hegrenade = 8;
  u.he.enemyDamage = 79; assert.ok(has(a, "utility.damage-low"));
  u.he.enemyDamage = 80; assert.deepEqual(ids(a), []);
  u.he.enemyDamage = 239.99; assert.deepEqual(ids(a), []);
  u.he.enemyDamage = 240; assert.ok(has(a, "utility.damage-high"));
  u.throws.counts.hegrenade = 7; assert.deepEqual(ids(a), []);
});
test("utility checks metric coverage/nulls, does not gate on unavailable actual duration", () => {
  const a = fixture(), u = player(a).utility; u.throws.counts.hegrenade = 8;
  assert.ok(has(a, "utility.damage-low"));
  for (const mutate of [u => u.he.complete = false, u => u.fire.complete = false,
    u => u.he.enemyDamage = null, u => u.fire.enemyDamage = null,
    u => u.throws.counts.hegrenade = null, u => u.throws.counts.fire = null]) {
    const b = structuredClone(a); mutate(player(b).utility); assert.deepEqual(ids(b), []);
  }
});
test("flash support needs sufficient throws, effects, ratio, proven assists and complete metrics", () => {
  const a = fixture(), u = player(a).utility;
  u.throws.counts.flashbang = 8; u.flash.enemy.count = 12; u.flash.assists = 3;
  assert.ok(has(a, "utility.flash-high"));
  for (const mutate of [u => u.throws.counts.flashbang = 7, u => u.flash.enemy.count = 11,
    u => u.throws.counts.flashbang = 9, u => u.flash.assists = 2, u => u.flash.assists = null,
    u => u.flash.enemy.complete = false, u => u.flash.assistsComplete = false,
    u => u.throws.counts.flashbang = null]) {
    const b = structuredClone(a); mutate(player(b).utility); assert.deepEqual(ids(b), []);
  }
});
test("team flash checks positive effects, minimum sample, ratio boundary and metric coverage", () => {
  const a = fixture(); setTeam(a, 5, 8); assert.ok(has(a, "team-flash.frequent-effects"));
  setTeam(a, 5, 7); assert.deepEqual(ids(a), []);
  setTeam(a, 4, 8); assert.deepEqual(ids(a), []);
  setTeam(a, 6, 20); assert.ok(has(a, "team-flash.frequent-effects"));
  setTeam(a, 6, 21); assert.deepEqual(ids(a), []);
  setTeam(a, 5, 8, 0); assert.deepEqual(ids(a), []);
  setTeam(a); player(a).utility.flash.teammate.complete = false; assert.deepEqual(ids(a), []);
  player(a).utility.flash.teammate.complete = true; player(a).utility.throws.counts.flashbang = null; assert.deepEqual(ids(a), []);
});
test("clutch requires explicit win for this player, no opportunity count inference", () => {
  const a = fixture(), p = player(a); p.clutch.wins = 100;
  p.clutch.list = [win(1, 3, null), win(2, 3, false), { ...win(3), player: "other" }];
  assert.deepEqual(ids(a), []);
  p.clutch.list.push(win(24)); p.coverage.skippedMissingWindow = 1;
  const f = generateFindings(a)[0]; assert.equal(f.ruleId, "clutch.win.r24");
  assert.equal(f.confidence, "high"); assert.deepEqual(f.relatedRounds, [24]);
});
test("same tick/victim duplicate flash evidence has stable raw-duration tie-break", () => {
  const a = fixture(); setTeam(a);
  const rows = player(a).utility.flash.teammate.evidence;
  rows[1] = { ...structuredClone(rows[0]), event: { ...rows[0].event, blindDurationSeconds: 2 } };
  const expected = generateFindings(a); rows.reverse(); assert.deepEqual(generateFindings(a), expected);
});
test("ranking caps main issues at three; highlights prioritize largest clutch then round", () => {
  const a = fixture(), p = player(a); p.side.CT.adr = 40; p.trade.tradeRate = 0;
  p.opening = { kills: 0, deaths: 4, duels: 4, winRate: 0 }; p.utility.throws.counts.hegrenade = 8; setTeam(a);
  p.clutch.list = [win(9, 1), win(4, 3), win(2, 3)];
  assert.deepEqual(ids(a), ["side-impact.ct-gap", "trade.low-rate", "team-flash.frequent-effects", "clutch.win.r2", "clutch.win.r4"]);
  assert.equal(generateFindings(a).filter(f => f.severity !== "positive").length, 3);
});
test("positive ranking: clutch, opening then damage utility; maximum two", () => {
  const a = fixture(), p = player(a); p.opening.winRate = 1;
  p.utility.throws.counts.hegrenade = 8; p.utility.he.enemyDamage = 240; p.clutch.list = [win(24)];
  assert.deepEqual(ids(a), ["clutch.win.r24", "opening.positive"]);
});
test("deterministic, input immutable, player ordering and caps apply per player", () => {
  const a = fixture(); setTeam(a); player(a).clutch.list = [win(24), win(1)];
  a.players.push({ ...structuredClone(player(a)), steamId: "a" });
  const before = structuredClone(a), first = generateFindings(a);
  assert.deepEqual(first, generateFindings(a)); assert.deepEqual(a, before);
  a.players.reverse(); player(a).utility.flash.teammate.evidence.reverse(); player(a).clutch.list.reverse();
  assert.deepEqual(first, generateFindings(a));
  assert.equal(first[0].playerId, "a"); assert.equal(new Set(first.map(f => f.id)).size, first.length);
});
