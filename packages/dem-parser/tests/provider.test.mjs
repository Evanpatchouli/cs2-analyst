import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as api from "../dist/index.js";

test("public parser API does not export native functions or converter", () => {
  assert.deepEqual(Object.keys(api), ["Demoparser2Provider"]);
});

test("reports missing, invalid and empty DEM files with their original cause", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cs2-coach-parser-"));
  try {
    const parser = new api.Demoparser2Provider();
    const missing = join(directory, "missing.dem");
    await assert.rejects(parser.parse(missing), error => error.message.includes(missing) && error.cause.code === "ENOENT");
    const invalidMagic = Buffer.from("PBDEMS2\0xxxxxxxx");
    invalidMagic[0] |= 0x80;
    for (const [name, data] of [["empty.dem", ""], ["invalid.dem", "not a valid CS2 demo"], ["truncated.dem", "PBDEMS2\0"], ["invalid-magic.dem", invalidMagic]]) {
      const path = join(directory, name);
      await writeFile(path, data);
      await assert.rejects(parser.parse(path), error => error.message.includes(path) && /PBDEMS2/.test(error.cause.message));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const defaultDemo = fileURLToPath(new URL("../../../.demo/demo1.dem", import.meta.url));
const demoPath = process.env.DEM_TEST_FILE ? resolve(process.env.DEM_TEST_FILE) : defaultDemo;

test("reads a real DEM through the public provider with deterministic results", {
  skip: !process.env.DEM_TEST_FILE && !existsSync(defaultDemo) ? "Provide .demo/demo1.dem or DEM_TEST_FILE" : false,
}, async () => {
  const parser = new api.Demoparser2Provider();
  const match = await parser.parse(demoPath);
  assert.deepEqual(await parser.parse(demoPath), match);
  assert.match(match.id, /^[a-f0-9]{64}$/);
  assert.ok(match.map.length > 0);
  assert.ok(match.players.length > 0);
  assert.ok(match.rounds.length > 0);
  const ids = new Set(match.players.map(p => p.steamId));
  for (const round of match.rounds) {
    assert.ok(round.number > 0);
    assert.ok(["CT", "T", null].includes(round.winner));
    assert.deepEqual(round.events.map(e => e.tick), round.events.map(e => e.tick).sort((a, b) => a - b));
    for (const field of ["startTick", "freezeEndTick", "endTick"]) {
      if (round[field] !== undefined) assert.ok(Number.isSafeInteger(round[field]) && round[field] >= 0);
    }
    for (const event of round.events) {
      assert.ok(["kill", "damage", "weapon_fire", "utility", "flash", "bomb"].includes(event.type));
      for (const key of Object.keys(event)) assert.ok(!key.includes("_steamid") && !key.includes("_team_num"));
      for (const field of ["victim", "attacker", "assister", "shooter", "thrower", "player", "killer"]) {
        if (event[field] != null && event[field] !== "world") {
          assert.equal(typeof event[field], "string");
          assert.ok(ids.has(event[field]));
        }
      }
      for (const key of Object.keys(event).filter(key => key.endsWith("Side"))) {
        assert.ok(["CT", "T", "Unknown"].includes(event[key]));
      }
      if (event.type === "damage") {
        for (const field of ["healthDamage", "armorDamage", "healthRemaining", "armorRemaining"]) {
          assert.ok(Number.isSafeInteger(event[field]) && event[field] >= 0);
        }
      }
      if (event.type === "weapon_fire") assert.ok(typeof event.weapon === "string" && event.weapon.length > 0);
      if (event.type === "flash") assert.ok(Number.isFinite(event.blindDurationSeconds) && event.blindDurationSeconds >= 0);
      if (event.type === "utility") {
        assert.ok(["smoke", "hegrenade", "flashbang", "fire", "decoy"].includes(event.utility));
        assert.ok(["detonate", "start_burn", "start_decoy"].includes(event.action));
      }
      if (event.type === "bomb") assert.ok(["pickup", "drop", "plant_start", "planted", "defuse_start", "defused", "exploded"].includes(event.action));
    }
  }
  if (!process.env.DEM_TEST_FILE) {
    // Golden assertions for the local demo1.dem used for P1.5 acceptance.
    assert.equal(match.map, "de_dust2");
    assert.equal(match.tickRate, 64);
    assert.equal(match.players.length, 10);
    assert.deepEqual(match.rounds.map(r => r.number), Array.from({ length: 24 }, (_, i) => i + 1));
    assert.deepEqual(match.rounds.map(r => r.winner), ["T", "CT", "CT", "CT", "CT", "T", "CT", "CT", "CT", "T", "CT", "T", "T", "CT", "CT", "CT", "CT", "CT", "CT", "T", "T", "CT", "T", "T"]);
    const events = match.rounds.flatMap(r => r.events);
    assert.deepEqual(Object.fromEntries(["kill", "damage", "weapon_fire", "utility", "flash", "bomb"].map(type => [type, events.filter(e => e.type === type).length])), {
      kill: 182, damage: 730, weapon_fire: 4399, utility: 421, flash: 282, bomb: 125,
    });
    assert.equal(match.id, "f3c3173eae0cd100d15c81c3b734be792f9212256a9c99703b358d3434000852");
    assert.deepEqual([match.rounds[0].startTick, match.rounds[0].freezeEndTick, match.rounds[0].endTick, match.rounds[0].endReason], [65, 1441, 3413, "ct_killed"]);
    assert.ok(match.rounds.every(r => r.startTick < r.freezeEndTick && r.freezeEndTick < r.endTick));
    const hurt = events.find(e => e.type === "damage" && e.tick === 2287);
    assert.deepEqual([hurt.healthDamage, hurt.armorDamage, hurt.healthRemaining, hurt.armorRemaining, hurt.hitgroup], [109, 0, 0, 100, "head"]);
    assert.ok(events.some(e => e.type === "kill" && e.assister && e.assistedFlash));
    assert.ok(events.some(e => e.type === "damage" && e.attacker === null));
    assert.deepEqual(Object.fromEntries(["pickup", "drop", "plant_start", "planted", "defuse_start", "defused", "exploded"].map(action => [action, events.filter(e => e.type === "bomb" && e.action === action).length])), {
      pickup: 51, drop: 41, plant_start: 13, planted: 11, defuse_start: 4, defused: 4, exploded: 1,
    });
    assert.deepEqual(events.filter(e => e.type === "bomb" && e.action === "defuse_start").map(e => e.hasKit), [false, false, true, false]);
    assert.ok(events.filter(e => e.type === "bomb" && e.action === "planted").every(e => [96, 97].includes(e.siteIndex) && !("hasKit" in e)));
    assert.equal(match.players.find(p => p.nickname === "twinkle").team, "CT");
    assert.equal(match.players.find(p => p.nickname === "Makoto Nijima").team, "T");
  }
});
