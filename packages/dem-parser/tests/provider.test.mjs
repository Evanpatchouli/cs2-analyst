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
    for (const event of round.events.filter(e => e.type === "kill")) {
      assert.ok(ids.has(event.victim));
      assert.ok(event.killer === "world" || ids.has(event.killer));
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
    assert.deepEqual(Object.fromEntries(["kill", "damage", "weapon_fire", "utility"].map(type => [type, events.filter(e => e.type === type).length])), {
      kill: 182, damage: 730, weapon_fire: 4399, utility: 421,
    });
    assert.equal(match.players.find(p => p.nickname === "twinkle").team, "CT");
    assert.equal(match.players.find(p => p.nickname === "Makoto Nijima").team, "T");
  }
});
