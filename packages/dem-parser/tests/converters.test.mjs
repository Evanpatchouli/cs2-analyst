import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

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
    killerSide: "CT", victimSide: "T", teamkill: false,
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
    event("weapon_fire", 11, { user_steamid: attacker, weapon: "weapon_ak47" }),
    event("player_hurt", 12, { user_steamid: victim, dmg_health: 25, dmg_armor: 0, health: 75, armor: 0 }),
    ...utilityNames.map((name, i) => event(name, 13 + i)),
    event("round_officially_ended", 20, { total_rounds_played: 1 }),
    event("unsupported_event", 21),
  ]));
  assert.equal(match.rounds.length, 1);
  assert.equal(match.rounds[0].winner, null);
  assert.deepEqual(match.rounds[0].events.map(e => e.type), ["weapon_fire", "damage", ...utilityNames.map(() => "utility")]);
  assert.equal(match.players.length, 2);
  assert.ok(match.players.every(p => p.steamId !== "999"));
  assert.equal("tickRate" in match, false);
});

test("retains the first live side across halftime and backfills missing participants", () => {
  const match = convertToMatch(output([
    death(10),
    death(20, { attacker_team_num: 2, user_team_num: 3 }),
  ]));
  assert.equal(match.players.find(p => p.steamId === attacker).team, "CT");
  assert.equal(match.players.find(p => p.steamId === victim).team, "T");
  const [first, second] = match.rounds[0].events;
  assert.deepEqual([first.killerSide, first.victimSide], ["CT", "T"]);
  assert.deepEqual([second.killerSide, second.victimSide], ["T", "CT"]);
});

const nativeFixture = JSON.parse(readFileSync(new URL("./fixtures/combat-native.json", import.meta.url), "utf8"));

function converted(entry) {
  return convertToMatch(output([entry])).rounds[0].events[0];
}

test("maps captured 0.42.0 hurt output without capping overkill or losing environmental damage", () => {
  assert.equal(nativeFixture.parserVersion, "0.42.0");
  const [hurt, environmental] = nativeFixture.events.filter(e => e.event_name === "player_hurt");
  assert.deepEqual(converted(hurt), {
    type: "damage", tick: 2287, attacker, victim, attackerSide: "CT", victimSide: "T",
    healthDamage: 109, armorDamage: 0, healthRemaining: 0, armorRemaining: 100,
    weapon: "hkp2000", hitgroup: "head",
  });
  assert.equal(converted(environmental).attacker, null);
  assert.equal(converted(environmental).attackerSide, "Unknown");
  assert.equal(converted(environmental).healthDamage, 4);
  assert.equal(converted(environmental).weapon, "");
  assert.equal(converted({ ...hurt, hitgroup: 1 }).hitgroup, 1);
});

test("keeps raw weapon identifiers, silenced false, and grenade release evidence", () => {
  const [knife, incendiary] = nativeFixture.events.filter(e => e.event_name === "weapon_fire");
  assert.deepEqual(converted(knife), {
    type: "weapon_fire", tick: 1672, shooter: "76561199238050274", shooterSide: "CT",
    weapon: "weapon_knife", silenced: false,
  });
  assert.equal(converted(incendiary).weapon, "weapon_incgrenade");
  assert.equal(converted({ ...incendiary, silenced: true }).silenced, true);
});

test("maps effect types and origins without inferring a fire grenade subtype", () => {
  const effects = [
    ["smokegrenade_detonate", "smoke", "detonate"], ["hegrenade_detonate", "hegrenade", "detonate"],
    ["flashbang_detonate", "flashbang", "detonate"], ["inferno_startburn", "fire", "start_burn"],
    ["decoy_started", "decoy", "start_decoy"],
  ];
  for (const [name, utility, action] of effects) {
    const entry = nativeFixture.events.find(e => e.event_name === name);
    const actual = converted(entry);
    assert.deepEqual(actual, {
      type: "utility", tick: entry.tick, utility, action, thrower: entry.user_steamid,
      throwerSide: entry.user_team_num === 2 ? "T" : "CT", entityId: entry.entityid,
      position: { x: entry.x, y: entry.y, z: entry.z },
    });
    const incomplete = converted({ ...entry, user_steamid: null, user_team_num: null, x: NaN, entityid: -1 });
    assert.equal(incomplete.thrower, null);
    assert.equal(incomplete.throwerSide, "Unknown");
    assert.equal("position" in incomplete, false);
    assert.equal("entityId" in incomplete, false);
  }
});

test("keeps per-victim flash duration and entity correlation, including self flashes", () => {
  const blind = nativeFixture.events.find(e => e.event_name === "player_blind");
  const flash = converted(blind);
  assert.deepEqual(flash, {
    type: "flash", tick: 1927, attacker: "76561199567278982", victim: "76561199567278982",
    attackerSide: "T", victimSide: "T", blindDurationSeconds: 0.5644214153289795, entityId: 330,
  });
  const detonation = converted(nativeFixture.events.find(e => e.event_name === "flashbang_detonate"));
  assert.equal(flash.entityId, detonation.entityId);
  assert.equal(flash.tick, detonation.tick);
  assert.equal(converted({ ...blind, blind_duration: 0 }).blindDurationSeconds, 0);
  assert.equal(converted({ ...blind, attacker_steamid: null }).attacker, null);
});

test("maps verified bomb actions, keeps site indices and does not invent kit state or A/B", () => {
  const actions = [
    ["bomb_pickup", "pickup"], ["bomb_dropped", "drop"], ["bomb_beginplant", "plant_start"],
    ["bomb_planted", "planted"], ["bomb_begindefuse", "defuse_start"],
    ["bomb_defused", "defused"], ["bomb_exploded", "exploded"],
  ];
  for (const [name, action] of actions) {
    const entry = nativeFixture.events.find(e => e.event_name === name);
    const expected = {
      type: "bomb", tick: entry.tick, action, player: entry.user_steamid,
      playerSide: entry.user_team_num === 2 ? "T" : "CT",
    };
    if (entry.site !== undefined) expected.siteIndex = entry.site;
    if (entry.haskit !== undefined) expected.hasKit = entry.haskit;
    assert.deepEqual(converted(entry), expected);
  }
  const planted = nativeFixture.events.find(e => e.event_name === "bomb_planted");
  assert.equal(converted(planted).siteIndex, 96);
  assert.equal("hasKit" in converted(planted), false);
  assert.equal(converted({ ...planted, user_steamid: null }).player, null);
});

test("retains normal/flash assists and only derives teamkill from known event sides", () => {
  const assists = nativeFixture.events.filter(e => e.event_name === "player_death" && e.assister_steamid);
  for (const entry of assists) {
    const kill = converted(entry);
    assert.equal(kill.assister, entry.assister_steamid);
    assert.equal(kill.assisterSide, entry.assister_team_num === 2 ? "T" : "CT");
    assert.equal(kill.assistedFlash, entry.assistedflash);
  }
  assert.ok(assists.some(e => e.assistedflash));
  assert.equal(converted(death(1, { attacker_team_num: 2 })).teamkill, true);
  assert.equal(converted(death(1, { attacker_steamid: victim, attacker_team_num: 2 })).teamkill, false);
  assert.equal("teamkill" in converted(death(1, { attacker_team_num: null })), false);
  assert.equal("teamkill" in converted(death(1, { attacker_steamid: null })), false);
  assert.equal("assister" in converted(death(1, { assister_steamid: "0" })), false);
});

test("records lifecycle boundaries, handles same-tick starts and clears restart context", () => {
  const match = convertToMatch(output([
    event("round_start", 10), event("round_freeze_end", 12), death(13),
    event("round_end", 14, { winner: 3, reason: "t_killed" }),
    event("round_start", 20), death(21), event("round_freeze_end", 22),
    event("round_end", 23, { winner: 2, reason: 9 }), death(24),
    death(30, { total_rounds_played: 1 }), // Input order deliberately puts combat before same-tick start.
    event("round_start", 30, { total_rounds_played: 1 }),
  ]));
  assert.deepEqual(match.rounds[0], {
    number: 1, winner: "T", startTick: 20, freezeEndTick: 22, endTick: 23, endReason: 9,
    events: [converted(death(21)), converted(death(24))],
  });
  assert.deepEqual(match.rounds[1].events.map(e => e.tick), [30]);
  const unfinished = convertToMatch(output([
    event("round_start", 10), event("round_freeze_end", 11), event("round_end", 12, { reason: "t_killed" }),
    event("round_start", 20), death(21),
  ])).rounds[0];
  assert.equal("freezeEndTick" in unfinished, false);
  assert.equal("endTick" in unfinished, false);
  assert.equal("endReason" in unfinished, false);
});

test("rejects numeric SteamID64 and malformed essential combat evidence", () => {
  const hurt = nativeFixture.events.find(e => e.event_name === "player_hurt");
  const blind = nativeFixture.events.find(e => e.event_name === "player_blind");
  for (const field of ["dmg_health", "dmg_armor", "health", "armor"]) {
    for (const value of [undefined, null, -1, NaN, Infinity, "10", 0.5]) {
      assert.throws(() => converted({ ...hurt, [field]: value }), new RegExp(field));
    }
  }
  for (const value of [-1, NaN, Infinity, "1", null]) {
    assert.throws(() => converted({ ...blind, blind_duration: value }), /blind_duration/);
  }
  assert.throws(() => converted(event("weapon_fire", 1, { user_steamid: attacker })), /weapon/);
  assert.throws(() => converted({ ...hurt, attacker_steamid: Number(attacker) }), /SteamID64/);
  assert.throws(() => converted({ ...hurt, user_steamid: Number(victim) }), /SteamID64/);
  assert.throws(() => convertToMatch(output([], [{ steamid: Number(attacker) }])), /SteamID64/);
  const botEvents = [hurt, blind, event("weapon_fire", 2, { weapon: "weapon_ak47" })]
    .map(e => ({ ...e, user_steamid: "0" }));
  assert.equal(convertToMatch(output([event("round_start", 1), ...botEvents])).rounds[0].events.length, 0);
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
