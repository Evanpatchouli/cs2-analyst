import assert from "node:assert/strict";
import test from "node:test";

import { convertToMatch } from "../dist/providers/converters.js";

const attacker = "76561199642456355";
const victim = "76561198823508147";

function output(events, players = []) {
  return { id: "fixture-content-id", header: { map_name: "de_dust2" }, players, events };
}

function event(event_name, tick, extra = {}) {
  return { event_name, tick, total_rounds_played: 0, is_warmup_period: false, ...extra };
}

function death(tick, extra = {}) {
  return event("player_death", tick, {
    attacker_steamid: attacker, attacker_name: "Killer", attacker_team_num: 3,
    user_steamid: victim, user_name: "Victim", user_team_num: 2,
    weapon: "usp_silencer", headshot: true, ...extra,
  });
}

test("converts metadata, SteamID64, kills and newer round boundaries without mutating input", () => {
  const input = output([
    event("round_start", 65, { round: 1, game_time: 1 }),
    death(100),
    event("round_end", 129, { round: 1, total_rounds_played: 1, winner: "T", game_time: 2 }),
    death(140, { total_rounds_played: 1 }), // Post-round combat stays in round 1.
    event("round_start", 150, { round: 2, total_rounds_played: 1 }),
    event("round_end", 200, { round: 2, total_rounds_played: 2, winner: "CT" }),
  ].reverse(), [
    { steamid: attacker, name: "Killer", team_number: 2 }, // Final-half side.
    { steamid: attacker, name: "Killer", team_number: 2 },
    { steamid: victim, name: "Victim", team_number: 3 },
  ]);
  const original = structuredClone(input);
  const match = convertToMatch(input);
  assert.equal(match.id, input.id);
  assert.equal(match.map, "de_dust2");
  assert.equal(match.tickRate, 64);
  assert.deepEqual(match.players, [
    { steamId: victim, nickname: "Victim", team: "T" },
    { steamId: attacker, nickname: "Killer", team: "CT" },
  ]);
  assert.deepEqual(match.rounds.map(r => [r.number, r.winner, r.events.length]), [[1, "T", 2], [2, "CT", 0]]);
  assert.deepEqual(match.rounds[0].events[0], {
    type: "kill", tick: 100, killer: attacker, victim, weapon: "usp_silencer", headshot: true,
  });
  assert.deepEqual(input, original);
});

test("converts older numeric winners and pre-increment round_end counters", () => {
  const match = convertToMatch(output([
    death(100), // Recording starts during the first round.
    event("round_end", 110, { winner: 2 }),
    event("round_start", 120, { total_rounds_played: 1 }),
    death(130, { total_rounds_played: 1 }),
    event("round_end", 140, { total_rounds_played: 1, winner: 3 }),
  ]));
  assert.deepEqual(match.rounds.map(r => [r.number, r.winner, r.events.length]), [[1, "T", 1], [2, "CT", 1]]);
});

test("excludes warmup and maps the events supported by the current model", () => {
  const utilityNames = ["smokegrenade_detonate", "hegrenade_detonate", "flashbang_detonate", "inferno_startburn", "decoy_started"];
  const match = convertToMatch(output([
    event("round_start", 1, { is_warmup_period: true }),
    death(2, { is_warmup_period: true, user_steamid: "999" }),
    event("round_start", 10),
    event("weapon_fire", 11),
    event("player_hurt", 12),
    ...utilityNames.map((name, i) => event(name, 13 + i)),
    event("round_officially_ended", 20, { total_rounds_played: 1 }),
    event("unsupported_event", 21),
  ]));
  assert.equal(match.rounds.length, 1);
  assert.equal(match.rounds[0].winner, null);
  assert.deepEqual(match.rounds[0].events.map(e => e.type), ["weapon_fire", "damage", ...utilityNames.map(() => "utility")]);
  assert.deepEqual(match.players, []);
  assert.equal("tickRate" in match, false);
});

test("retains the first live side across halftime and backfills missing participants", () => {
  const match = convertToMatch(output([
    death(10),
    death(20, { attacker_team_num: 2, user_team_num: 3 }),
  ]));
  assert.equal(match.players.find(p => p.steamId === attacker).team, "CT");
  assert.equal(match.players.find(p => p.steamId === victim).team, "T");
});

test("handles world kills, omits unidentifiable bot victims and maps unknown sides", () => {
  const match = convertToMatch(output([
    death(10, { attacker_steamid: null }),
    death(11, { user_steamid: "0" }),
    event("round_end", 12, { winner: 0 }),
  ], [{ steamid: "123", name: "Spectator", team_number: 1 }, { steamid: "0", name: "Bot", team_number: 2 }]));
  assert.equal(match.rounds[0].events.length, 1);
  assert.equal(match.rounds[0].events[0].killer, "world");
  assert.equal(match.rounds[0].winner, null);
  assert.equal(match.players.find(p => p.steamId === "123").team, "Unknown");
  assert.ok(match.players.every(p => p.steamId !== "0"));
});

test("replaces restarted round attempts and tolerates duplicate round_start", () => {
  const match = convertToMatch(output([
    event("round_start", 10), death(11),
    event("round_start", 20), death(21), event("round_start", 20),
    event("round_end", 30, { winner: 3 }),
  ]));
  assert.deepEqual(match.rounds.map(r => [r.number, r.winner, r.events.map(e => e.tick)]), [[1, "CT", [21]]]);
});

test("rejects invalid native result shapes and invalid event ticks", () => {
  for (const input of [null, {}, output(null), { ...output([]), players: {} }, { ...output([]), header: {} }, output([event("weapon_fire", -1)])]) {
    assert.throws(() => convertToMatch(input), /DEM/);
  }
  assert.throws(() => convertToMatch(output([{ event_name: "round_start", tick: 1 }])), /回合编号/);
});
