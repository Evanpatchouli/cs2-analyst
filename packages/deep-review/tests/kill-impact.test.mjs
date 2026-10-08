import assert from "node:assert/strict";
import test from "node:test";
import { analyzeEngagements, analyzeKillImpact, resolveRoundAliveState } from "../dist/index.js";

const CT = ["1", "2", "3", "4", "5"], T = ["6", "7", "8", "9", "10"];
const kill = (tick = 10, killer = "1", victim = "6", extra = {}) => ({ type: "kill", tick, killer, victim,
  killerSide: CT.includes(killer) ? "CT" : T.includes(killer) ? "T" : "Unknown",
  victimSide: CT.includes(victim) ? "CT" : T.includes(victim) ? "T" : "Unknown", weapon: "ak47", ...extra });
function match(events = [kill()], ct = 5, t = 5, winner = "CT") {
  const players = [...CT, ...T].map(steamId => ({ steamId, side: CT.includes(steamId) ? "CT" : "T", participant: true,
    alive: CT.includes(steamId) ? CT.indexOf(steamId) < ct : T.indexOf(steamId) < t }));
  const snapshot = (boundary, tick) => ({ boundary, tick, availability: "observed", unidentifiedPlayerCount: 0, players: structuredClone(players) });
  const end = snapshot("end", 1000);
  for (const row of end.players) if (events.some(e => e.type === "kill" && e.victim === row.steamId && e.tick >= 0 && e.tick <= 1000)) row.alive = false;
  return { id: "impact-fixture", map: "synthetic", tickRate: 64, players: [], rounds: [{ number: 1, startTick: 0, freezeEndTick: 5, endTick: 1000,
    winner, events, stateSnapshots: [snapshot("start", 0), snapshot("freeze_end", 5), end], playerLifecycle: [] }] };
}
const analyze = m => analyzeKillImpact(m, analyzeEngagements(m));
const counts = (teamAlive, enemyAlive) => ({ teamAlive, enemyAlive });

for (const [name, ct, t, tags] of [
  ["5v5 opening", 5, 5, ["opening", "advantage-gain"]],
  ["4v5 equalizer", 4, 5, ["opening", "equalizer"]],
  ["4v4 advantage gain", 4, 4, ["opening", "advantage-gain"]],
  ["3v5 deficit reduction", 3, 5, ["opening", "deficit-reduction"]],
  ["5v3 advantage extension", 5, 3, ["opening", "advantage-extension"]],
  ["last enemy elimination", 5, 1, ["opening", "advantage-extension", "enemy-eliminated"]],
  ["sole survivor last enemy", 1, 1, ["opening", "advantage-gain", "enemy-eliminated", "sole-survivor-kill"]],
]) test(name, () => {
  const result = analyze(match([kill()], ct, t)), row = result.kills[0];
  assert.deepEqual(row.before, counts(ct, t)); assert.deepEqual(row.afterAtomicGroup, counts(ct, t - 1));
  assert.deepEqual(row.tags, tags); assert.equal(row.posthumous, false);
  assert.equal(row.coverage.roundState.status, "complete");
  assert.equal(result.diagnostics.eligibleRounds, 1);
});

test("3K walks equalizer, gain, extension and records final win without causality", () => {
  const result = analyze(match([kill(10, "1", "6"), kill(20, "1", "7"), kill(30, "1", "8")], 3, 4));
  const multi = result.multiKills[0];
  assert.equal(multi.killCount, 3); assert.equal(multi.roundResult, "win");
  assert.deepEqual(multi.beforeFirstKill, counts(3, 4)); assert.deepEqual(multi.afterLastKillAtomicGroup, counts(3, 1));
  for (const tag of ["contains-equalizer", "contains-advantage-gain", "contains-advantage-extension", "round-won", "single-engagement"]) assert.ok(multi.tags.includes(tag));
});
test("5v2 closeout 2K and round loss use snapshot side rather than Match.players team", () => {
  const m = match([kill(10), kill(20, "1", "7")], 5, 2, "T");
  m.players = [{ steamId: "1", name: "arbitrary", team: "T" }];
  const multi = analyze(m).multiKills[0];
  assert.equal(multi.roundSide, "CT"); assert.equal(multi.roundWinner, "T"); assert.equal(multi.roundResult, "loss");
  assert.ok(multi.tags.includes("round-lost")); assert.ok(multi.tags.includes("contains-enemy-elimination"));
  m.rounds[0].winner = null; assert.equal(analyze(m).multiKills[0].roundResult, "unknown");
});
test("round side and win conversion across halftime follow per-round snapshot", () => {
  const m = match([kill(10, "6", "1"), kill(20, "6", "2")], 5, 5, "T");
  m.players = [{ steamId: "6", name: "arbitrary", team: "CT" }];
  const multi = analyze(m).multiKills[0];
  assert.equal(multi.roundSide, "T"); assert.equal(multi.roundResult, "win");
});
test("single vs multiple Engagement multi-kills; missing utility link cannot assert single", () => {
  assert.ok(analyze(match([kill(10), kill(20, "1", "7")])).multiKills[0].tags.includes("single-engagement"));
  const multi = analyze(match([kill(10), kill(500, "1", "7")])).multiKills[0];
  assert.equal(multi.engagementIds.length, 2); assert.ok(multi.tags.includes("multi-engagement"));
  const utility = analyze(match([kill(10), kill(20, "1", "7", { weapon: "hegrenade" })]));
  assert.equal(utility.kills[1].engagementId, null); assert.equal(utility.kills[1].coverage.roundState.status, "complete");
  assert.ok(!utility.multiKills[0].tags.includes("single-engagement"));
});
test("posthumous HE victim dies, killer never revives, never sole-survivor", () => {
  const result = analyze(match([kill(10, "6", "1"), kill(20, "1", "7", { weapon: "hegrenade" })], 1, 2, "T"));
  const row = result.kills[1];
  assert.equal(row.posthumous, true); assert.ok(row.tags.includes("posthumous"));
  assert.ok(!row.tags.includes("sole-survivor-kill")); assert.equal(row.engagementId, null);
  assert.deepEqual(row.before, counts(0, 2)); assert.deepEqual(row.afterAtomicGroup, counts(0, 1));
  assert.equal(result.rounds[0].players.find(p => p.playerId === "1").deathTick, 10);
  assert.equal(result.diagnostics.posthumousKills, 1);
});
test("same-tick two enemy deaths atomically gain advantage; no individual transition", () => {
  const result = analyze(match([kill(10), kill(10, "1", "7")], 4, 5));
  for (const row of result.kills) {
    assert.deepEqual(row.before, counts(4, 5)); assert.deepEqual(row.afterAtomicGroup, counts(4, 3));
    assert.deepEqual(row.tags, ["opening-group"]); assert.equal(row.atomicGroup.ordered, false);
    assert.equal(row.atomicGroup.attributedKillCount, 2);
    assert.ok(row.coverage.attribution.reasons.includes("same-tick-transition-ambiguous"));
  }
  assert.deepEqual(result.rounds[0].groups[0].tags.CT, []); // -1 to +1 skips the exact defined equalizer/gain conditions.
  assert.ok(result.multiKills[0].tags.includes("atomic-impact-partial"));
  assert.ok(!result.multiKills[0].tags.includes("contains-equalizer"));
});
test("same-tick cross kill does not order deaths or declare posthumous", () => {
  const events = [kill(10), kill(10, "6", "1")];
  const result = analyze(match(events, 1, 1));
  for (const row of result.kills) {
    assert.deepEqual(row.before, counts(1, 1)); assert.deepEqual(row.afterAtomicGroup, counts(0, 0));
    assert.equal(row.posthumous, false); assert.ok(row.tags.includes("sole-survivor-kill"));
    assert.ok(!row.tags.includes("enemy-eliminated")); assert.ok(!row.tags.includes("advantage-gain"));
  }
  assert.ok(result.rounds[0].groups[0].tags.CT.includes("enemy-eliminated"));
  const reversed = analyze(match([...events].reverse(), 1, 1));
  assert.deepEqual(result.kills.map(k => [k.killerId, k.before, k.afterAtomicGroup, k.tags]).sort(), reversed.kills.map(k => [k.killerId, k.before, k.afterAtomicGroup, k.tags]).sort());
});
test("group-level advantage gain retained when individual same-tick attribution ambiguous", () => {
  const r = analyze(match([kill(10), kill(10, "2", "7")], 5, 5));
  assert.deepEqual(r.rounds[0].groups[0].tags.CT, ["advantage-gain"]);
  assert.ok(r.kills.every(k => !k.tags.includes("advantage-gain")));
});
test("teamkill suicide world deaths change alive state and do not credit enemy kills", () => {
  const r = analyze(match([kill(10, "2", "1"), kill(20, "6", "6"), kill(30, "world", "7"), kill(40, "3", "8")]));
  assert.equal(r.kills.length, 1); assert.equal(r.unattributedKills.length, 3);
  assert.deepEqual(r.kills[0].before, counts(4, 3)); assert.deepEqual(r.kills[0].afterAtomicGroup, counts(4, 2));
  assert.ok(!r.kills[0].tags.includes("opening"));
  assert.equal(r.diagnostics.teamKills, 1); assert.equal(r.diagnostics.selfKills, 1); assert.equal(r.diagnostics.worldKills, 1);
});
test("duplicate deaths reject state and duplicate victim attribution; no synthetic 2K", () => {
  for (const events of [[kill(), kill()], [kill(), kill(20)]]) {
    const r = analyze(match(events));
    assert.equal(r.rounds[0].coverage.status, "unavailable"); assert.ok(r.rounds[0].coverage.reasons.includes("duplicate-death"));
    assert.equal(r.kills.length, 0); assert.equal(r.multiKills.length, 0);
    assert.ok(r.rounds[0].groups.every(g => g.before === null && g.appliedVictimIds.length === 0));
  }
});
test("lifecycle anomalies after baseline reject full round state; setup/post-round do not", () => {
  for (const type of ["spawn", "disconnect", "side_change"]) {
    const m = match(); m.rounds[0].playerLifecycle.push({ type, tick: 7, player: "1", side: "CT", previousSide: "T" });
    const r = analyze(m); assert.equal(r.kills[0].before, null); assert.equal(r.kills[0].posthumous, null);
    assert.ok(r.rounds[0].coverage.reasons.includes("lifecycle-anomaly"));
    m.rounds[0].playerLifecycle[0].tick = 5; assert.ok(analyze(m).kills[0].before);
    m.rounds[0].playerLifecycle[0].tick = 1001; assert.ok(analyze(m).kills[0].before);
  }
});
test("end conflict: death yet alive, no death yet dead, side change, new participant", () => {
  for (const mutate of [s => s.players[5].alive = true, s => s.players[1].alive = false,
    s => s.players[1].side = "T", s => s.players.push({ steamId: "99", side: "T", alive: true, participant: true })]) {
    const m = match(); mutate(m.rounds[0].stateSnapshots[2]); const r = analyze(m);
    assert.ok(r.rounds[0].coverage.reasons.includes("end-state-conflict")); assert.equal(r.kills[0].before, null);
  }
});
test("freeze_end baseline, start fallback, missing baseline/window, end unavailable", () => {
  const m = match(); assert.equal(resolveRoundAliveState(m.rounds[0]).baseline.boundary, "freeze_end");
  m.rounds[0].stateSnapshots[1].availability = "unavailable";
  const fallback = analyze(m); assert.equal(fallback.rounds[0].baseline.boundary, "start");
  assert.equal(fallback.kills[0].coverage.roundState.status, "partial"); assert.ok(fallback.kills[0].before);
  m.rounds[0].stateSnapshots[0].availability = "unavailable";
  assert.equal(analyze(m).kills[0].before, null);
  m.rounds[0].startTick = undefined; assert.equal(analyze(m).kills.length, 0);
  assert.ok(analyze(m).rounds[0].coverage.reasons.includes("round-window-unavailable"));
  const noEnd = match(); noEnd.rounds[0].stateSnapshots.pop();
  assert.equal(analyze(noEnd).kills[0].coverage.roundState.status, "partial"); assert.ok(analyze(noEnd).kills[0].before);
});
test("unidentified roster, participant/alive/side unknown, absent victim/killer suppress counts", () => {
  for (const mutate of [s => s.unidentifiedPlayerCount = 1, s => s.players[0].participant = null, s => s.players[0].alive = null,
    s => s.players[0].side = "Unknown", s => s.players.splice(5, 1), s => s.players.push(s.players[0])]) {
    const m = match(); mutate(m.rounds[0].stateSnapshots[1]); assert.equal(analyze(m).kills[0].before, null);
  }
});
test("unknown victim/side, nonparticipant and dead baseline do not produce invented counts", () => {
  for (const event of [kill(10, "1", "99"), kill(10, "1", "0"), kill(10, "1", "6", { victimSide: "Unknown" })]) {
    const r = analyze(match([event])); assert.equal(r.rounds[0].coverage.status, "unavailable");
  }
  const m = match(); m.rounds[0].stateSnapshots[1].players[5].participant = false; assert.equal(analyze(m).kills[0].before, null);
  assert.equal(analyze(match([kill(10, "1", "7")], 5, 1)).kills[0].before, null);
});
test("killer attribution gaps never stop reliable victim deaths; baseline dead is not proven posthumous", () => {
  for (const killer of ["1", "unknown", "world"]) {
    const r = analyze(match([kill(10, killer, "6", { killerSide: "Unknown" }), kill(20, "2", "7")]));
    assert.equal(r.rounds[0].coverage.status, "complete");
    assert.deepEqual(r.kills[0].before, counts(5, 4));
    assert.equal(r.diagnostics.worldKills, killer === "world" ? 1 : 0);
  }
  const m = match([kill(10, "5", "6")], 4, 5);
  const row = analyze(m).kills[0]; assert.equal(row.posthumous, null); assert.ok(!row.tags.includes("posthumous"));
  const absent = match(); absent.rounds[0].stateSnapshots[1].players.shift(); absent.rounds[0].stateSnapshots[2].players.shift();
  const absentRow = analyze(absent).kills[0]; assert.equal(absentRow.before, null);
  assert.ok(absentRow.coverage.attribution.reasons.includes("participant-state-unknown"));
  assert.equal(analyze(absent).rounds[0].coverage.status, "unavailable");
  assert.ok(analyze(absent).rounds[0].groups.every(g => g.before === null));
  absent.rounds[0].events.push(kill(20, "2", "7")); absent.rounds[0].stateSnapshots[2].players.find(p => p.steamId === "7").alive = false;
  assert.equal(analyze(absent).kills[1].before, null);
  const inconsistent = match([kill(10, "2", "1", { killerSide: "T" })]);
  const inconsistentResult = analyze(inconsistent); assert.equal(inconsistentResult.kills.length, 0);
  assert.deepEqual(inconsistentResult.rounds[0].groups[0].after, { CT: 4, T: 5 });
});
test("pre/post-round excluded; at-baseline death rejected; invalid tick degrades state", () => {
  const r = analyze(match([kill(-1), kill(1001), kill(10)]));
  assert.equal(r.kills.length, 1); assert.equal(r.rounds[0].coverage.status, "unavailable");
  assert.equal(analyze(match([kill(5)])).kills[0].before, null);
  const m = match([kill(1), kill(1001), kill(10)]); m.rounds[0].startTick = 2;
  const valid = analyze(m); assert.equal(valid.kills.length, 1); assert.ok(valid.kills[0].before);
});
test("engagement exact four-key join, match and participant conflicts do not approximate", () => {
  const m = match(), e = analyzeEngagements(m);
  assert.ok(analyzeKillImpact(m, e).kills[0].engagementId);
  for (const field of ["round", "type", "tick", "eventIndex"]) {
    const changed = structuredClone(e);
    for (const c of [changed.directContacts[0], changed.engagements[0].contacts[0]]) c.eventRef[field] = field === "type" ? "damage" : c.eventRef[field] + 1;
    assert.equal(analyzeKillImpact(m, changed).kills[0].engagementId, null);
  }
  for (const mutate of [e => e.matchId = "other", e => e.directContacts.push(e.directContacts[0]),
    e => e.engagements.push(e.engagements[0]), e => e.directContacts[0].attackerId = "2"]) {
    const changed = structuredClone(e); mutate(changed);
    const row = analyzeKillImpact(m, changed).kills[0]; assert.equal(row.engagementId, null);
    assert.ok(row.coverage.engagementLinkage.reasons.includes("engagement-link-conflict"));
  }
});
test("unlinked input/unknown clock preserves kills; deterministic, JSON-only, input immutable", () => {
  const m = match([kill(30, "1", "8"), kill(10), kill(20, "1", "7")]);
  m.tickRate = undefined; const e = analyzeEngagements(m), before = structuredClone({ m, e });
  const r = analyzeKillImpact(m, e); assert.equal(r.kills.length, 3); assert.equal(r.diagnostics.unlinkedKills, 3);
  assert.deepEqual(r, analyzeKillImpact(m, e)); assert.deepEqual({ m, e }, before); assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
  assert.deepEqual(r.kills.map(k => k.eventRef.eventIndex), [1, 2, 0]);
  const again = analyzeKillImpact(m); assert.deepEqual(again.kills.map(k => k.tags), r.kills.map(k => k.tags));
  r.multiKills[0].kills[0].tags.push("posthumous"); assert.ok(!r.kills[0].tags.includes("posthumous"));
  m.rounds.push(structuredClone(m.rounds[0])); assert.throws(() => analyzeKillImpact(m), RangeError);
});
