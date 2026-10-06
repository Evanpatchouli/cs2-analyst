import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { convertToMatch } from "../dist/providers/converters.js";

const known = "76561199642456355";
const capturedNative = JSON.parse(readFileSync(new URL("./fixtures/round-state-native.json", import.meta.url), "utf8"));

function output(events, stateRows) {
  return {
    id: "round-state-test", header: { map_name: "de_dust2" }, players: [], events,
    ...(stateRows === undefined ? {} : { stateRows }),
  };
}

function event(event_name, tick, extra = {}) {
  return { event_name, tick, round: 1, total_rounds_played: 0, is_warmup_period: false, ...extra };
}

function state(tick, steamid, team_num, is_alive, extra = {}) {
  return { tick, steamid, name: `p-${steamid}`, team_num, is_alive, ...extra };
}

test("attaches exact-boundary snapshots and distinguishes unavailable rows from absent input", () => {
  const events = [event("round_start", 10), event("round_freeze_end", 20), event("round_end", 30)];
  const absent = convertToMatch(output(events)).rounds[0];
  assert.equal("stateSnapshots" in absent, false);

  const unavailable = convertToMatch(output(events, [])).rounds[0];
  assert.deepEqual(unavailable.stateSnapshots, [
    { boundary: "start", tick: 10, availability: "unavailable", players: [], unidentifiedPlayerCount: 0 },
    { boundary: "freeze_end", tick: 20, availability: "unavailable", players: [], unidentifiedPlayerCount: 0 },
    { boundary: "end", tick: 30, availability: "unavailable", players: [], unidentifiedPlayerCount: 0 },
  ]);

  const observed = convertToMatch(output(events, [
    state(10, known, 3, true), state(20, known, 3, true), state(30, known, 1, false),
  ])).rounds[0].stateSnapshots;
  assert.deepEqual(observed.map(snapshot => snapshot.tick), [10, 20, 30]);
  assert.ok(observed.every(snapshot => snapshot.availability === "observed"));
  assert.deepEqual(observed.map(snapshot => snapshot.players[0].alive), [true, true, false]);
});

test("maps side membership conservatively, counts bots, and only accepts boolean alive values", () => {
  const match = convertToMatch(output([
    event("round_start", 10), event("round_end", 20),
  ], [
    state(10, known, 2, 0, { is_connected: 1 }),
    state(10, "76561199642456356", "CT", "false"),
    state(10, "76561199642456357", 1, true),
    state(10, "0", 2, true),
    { tick: 10, steamid: null, team_num: null, is_alive: null },
  ]));
  const snapshot = match.rounds[0].stateSnapshots[0];
  assert.deepEqual(snapshot.players, [
    { steamId: known, side: "T", alive: null, participant: true },
    { steamId: "76561199642456356", side: "CT", alive: null, participant: true },
    { steamId: "76561199642456357", side: "Unknown", alive: true, participant: false },
  ]);
  assert.equal(snapshot.unidentifiedPlayerCount, 2);
  assert.ok(match.players.some(player => player.steamId === known && player.team === "Unknown"));
  assert.equal("is_connected" in snapshot.players[0], false);
});

test("rejects numeric SteamIDs in state rows and conflicts for duplicate tick/player rows", () => {
  const boundaries = [event("round_start", 10)];
  assert.throws(() => convertToMatch(output(boundaries, [state(10, 76561199642456355, 2, true)])), /SteamID64.*string/);
  assert.throws(() => convertToMatch(output(boundaries, [
    state(10, known, 2, true), state(10, known, 3, true),
  ])), /冲突/);
});

test("snapshot-only identities join match players without affecting combat-derived team", () => {
  const match = convertToMatch(output([
    event("round_start", 10), event("player_death", 12, {
      attacker_steamid: known, attacker_name: "combat", attacker_team_num: 3,
      user_steamid: "76561199642456356", user_name: "victim", user_team_num: 2,
    }),
  ], [state(10, "76561199642456357", 3, true)]));
  assert.deepEqual(match.players.map(player => [player.steamId, player.team]), [
    [known, "CT"], ["76561199642456356", "T"], ["76561199642456357", "Unknown"],
  ]);
});

test("adds a snapshot-only player without a parser name using the SteamID fallback", () => {
  const match = convertToMatch(output([
    event("round_start", 10),
  ], [{ tick: 10, steamid: "76561199642456357", team_num: 2, is_alive: true }]));
  const round = match.rounds[0];
  assert.equal(round.stateSnapshots[0].players[0].steamId, "76561199642456357");
  assert.equal(round.stateSnapshots[0].players[0].side, "T");
  assert.deepEqual(match.players[0], { steamId: "76561199642456357", nickname: "76561199642456357", team: "Unknown" });
});

test("converts lifecycle events without inferring connections or counting them as combat", () => {
  const match = convertToMatch(output([
    event("round_start", 10),
    event("player_spawn", 11, { user_steamid: known, user_team_num: 3, user_is_alive: false }),
    event("player_team", 12, { user_steamid: known, user_team_num: 2, team: 2, oldteam: 3, disconnect: false }),
    event("player_disconnect", 20, { user_steamid: known }),
    event("round_end", 30),
    event("player_disconnect", 31, { user_steamid: null }),
  ]));
  const round = match.rounds[0];
  assert.deepEqual(round.events, []);
  assert.deepEqual(round.playerLifecycle, [
    { type: "spawn", tick: 11, player: known, side: "CT" },
    { type: "side_change", tick: 12, player: known, side: "T", previousSide: "CT", disconnect: false },
    { type: "disconnect", tick: 20, player: known },
    { type: "disconnect", tick: 31, player: null },
  ]);
  assert.ok(match.players.some(player => player.steamId === known && player.team === "Unknown"));
});

test("keeps same-tick boundaries, omits missing partial boundaries, and excludes warmup", () => {
  const sameTick = convertToMatch(output([
    event("round_start", 10), event("round_freeze_end", 10), event("round_end", 10),
    event("round_start", 5, { is_warmup_period: true }),
  ], [state(10, known, 2, true), state(5, "76561199642456356", 3, true)])).rounds[0];
  assert.deepEqual(sameTick.stateSnapshots.map(snapshot => [snapshot.boundary, snapshot.tick]), [
    ["start", 10], ["freeze_end", 10], ["end", 10],
  ]);
  assert.ok(sameTick.stateSnapshots.every(snapshot => snapshot.players.length === 1));

  const partial = convertToMatch(output([
    event("player_spawn", 12, { user_steamid: known, user_team_num: 2 }),
  ], [state(12, known, 2, true)])).rounds[0];
  assert.equal("stateSnapshots" in partial, false);
  assert.deepEqual(partial.playerLifecycle, [{ type: "spawn", tick: 12, player: known, side: "T" }]);
});

test("restart clears abandoned lifecycle and boundary state, while post-end disconnect stays in round", () => {
  const match = convertToMatch(output([
    event("round_start", 10), event("round_freeze_end", 11),
    event("player_spawn", 12, { user_steamid: known, user_team_num: 2 }),
    event("round_end", 13),
    event("round_start", 20), event("round_freeze_end", 21), event("round_end", 22),
    event("player_disconnect", 23, { user_steamid: known }),
  ], [
    state(10, known, 2, true), state(11, known, 2, true), state(13, known, 2, false),
    state(20, known, 3, true), state(21, known, 3, true), state(22, known, 3, true),
  ]));
  assert.deepEqual(match.rounds.map(round => [round.startTick, round.freezeEndTick, round.endTick]), [[20, 21, 22]]);
  assert.deepEqual(match.rounds[0].playerLifecycle, [{ type: "disconnect", tick: 23, player: known }]);
  assert.deepEqual(match.rounds[0].stateSnapshots.map(snapshot => snapshot.tick), [20, 21, 22]);
});

test("does not attach snapshots when input has no recorded boundary", () => {
  const round = convertToMatch(output([event("player_spawn", 11, { user_steamid: known })], [state(11, known, 2, true)])).rounds[0];
  assert.equal("stateSnapshots" in round, false);
});

test("converts captured native boundary rows and lifecycle events for bounded round examples", () => {
  assert.equal(capturedNative.parserVersion, "0.42.0");
  const boundaryRounds = [1, 13, 24];
  const selected = capturedNative.selectedBoundaries.filter(entry => boundaryRounds.includes(entry.round));
  assert.deepEqual(selected.map(entry => entry.round), boundaryRounds);

  const events = selected.flatMap(entry => Object.values(entry.rawEvents));
  const life = capturedNative.lifecycleEvidence;
  events.push(life.player_team, life.player_disconnect);
  const stateRows = selected.flatMap(entry => Object.values(entry.snapshots).flatMap(snapshot => snapshot.players));
  const match = convertToMatch(output(events, stateRows));

  assert.deepEqual(match.rounds.map(round => round.number), boundaryRounds);
  const aliveByRound = { 1: [10, 10, 3], 13: [10, 10, 1], 24: [10, 10, 1] };
  for (const round of match.rounds) {
    assert.equal(round.stateSnapshots.length, 3);
    assert.deepEqual(round.stateSnapshots.map(snapshot => snapshot.boundary), ["start", "freeze_end", "end"]);
    assert.deepEqual(round.stateSnapshots.map(snapshot => snapshot.players.filter(player => player.alive === true).length), aliveByRound[round.number]);
    for (const snapshot of round.stateSnapshots) {
      assert.equal(snapshot.availability, "observed");
      assert.equal(snapshot.players.length, 10);
      assert.deepEqual(
        [snapshot.players.filter(player => player.side === "T").length, snapshot.players.filter(player => player.side === "CT").length],
        [5, 5],
      );
    }
  }

  // The captured live spawn belongs to round 2, whose boundaries are not in
  // the selected examples. Test it separately rather than attaching it to 1.
  const spawnMatch = convertToMatch(output([life.player_spawn.warmup, life.player_spawn.live]));
  assert.deepEqual(spawnMatch.rounds.map(round => round.number), [2]);
  const spawnRound = spawnMatch.rounds[0];
  const spawn = spawnRound.playerLifecycle[0];
  assert.deepEqual(spawn, {
    type: "spawn", tick: 3861, player: life.player_spawn.live.user_steamid, side: "CT",
  });
  assert.equal(spawnRound.playerLifecycle.length, 1);
  assert.equal("stateSnapshots" in spawnRound, false);
  assert.equal("alive" in spawn, false);

  const thirteenth = match.rounds[1];
  const sideChange = thirteenth.playerLifecycle.find(event => event.type === "side_change");
  assert.deepEqual(sideChange, {
    type: "side_change", tick: 67110, player: life.player_team.user_steamid,
    side: "T", previousSide: "CT", disconnect: false,
  });
  assert.equal(life.player_team.user_team_num, life.player_team.oldteam);

  const lastRound = match.rounds[2];
  const disconnect = lastRound.playerLifecycle.find(event => event.type === "disconnect");
  assert.deepEqual(disconnect, {
    type: "disconnect", tick: life.player_disconnect.tick, player: life.player_disconnect.user_steamid,
  });
  assert.ok(disconnect.tick > lastRound.endTick);
});
