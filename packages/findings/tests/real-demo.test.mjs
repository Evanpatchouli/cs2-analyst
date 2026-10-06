import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Demoparser2Provider } from "@cs2-coach/dem-parser";
import { analyzeMatch } from "@cs2-coach/analytics";
import { generateFindings } from "../dist/index.js";

// Golden is specific to this reviewed file; other demos must not masquerade as demo1.
const demo = fileURLToPath(new URL("../../../.demo/demo1.dem", import.meta.url));
test("demo1 twinkle stable finding IDs and evidence, without locking prose", {
  skip: existsSync(demo) ? false : "Provide .demo/demo1.dem",
}, async () => {
  const a = analyzeMatch(await new Demoparser2Provider().parse(demo));
  assert.equal(a.matchId, "f3c3173eae0cd100d15c81c3b734be792f9212256a9c99703b358d3434000852");
  const p = a.players.find(p => p.nickname === "twinkle"); assert.ok(p);
  const findings = generateFindings(a, p.steamId);
  const expected = ["side-impact.ct-gap", "trade.low-rate", "team-flash.frequent-effects", "clutch.win.r24", "opening.positive"];
  assert.deepEqual(findings.map(f => f.ruleId), expected);
  assert.deepEqual(findings.map(f => f.id), expected.map(id => JSON.stringify([a.matchId, p.steamId, id])));
  const values = f => Object.fromEntries(f.evidence.map(e => [e.metric, e.value]));
  assert.deepEqual(values(findings[0]), { "side.CT.adr": 68.25, "side.CT.roundsPlayed": 12,
    "side.CT.kills": 10, "side.CT.deaths": 10, "side.T.adr": 114.5, "side.T.roundsPlayed": 12,
    "side.T.kills": 15, "side.T.deaths": 10 });
  assert.deepEqual(values(findings[1]), { "trade.tradeableDeaths": 18, "trade.tradedDeaths": 4,
    "trade.tradeRate": 4 / 18 * 100, "trade.complete": true, "tradeWindow.seconds": 5 });
  assert.equal(findings[2].evidence[0].value, 23); assert.equal(findings[2].evidence[1].value, 10);
  assert.deepEqual(findings[2].relatedRounds, [4, 5, 6, 8, 12, 16, 24]);
  assert.deepEqual(findings[2].evidence.filter(e => e.unit === "player-id").map(e => [e.round, e.tick]),
    [[4,17120],[4,17194],[5,23634],[5,23723],[6,28169],[8,41302],[12,64496],[12,64496],[16,82674],[24,133134]]);
  assert.deepEqual(findings[3].evidence, [
    { metric: "clutch.list.opponents", value: 3, unit: "count", round: 24, tick: 135415 },
    { metric: "clutch.list.won", value: true, unit: "flag", round: 24, tick: 135415 },
    { metric: "clutch.list.side", value: "T", unit: "side", round: 24, tick: 135415 },
  ]);
  assert.deepEqual(values(findings[4]), { "opening.kills": 4, "opening.deaths": 0, "opening.duels": 4, "opening.winRate": 1 });
  assert.deepEqual(findings, generateFindings(a, p.steamId));
  for (const player of a.players) {
    const rows = generateFindings(a, player.steamId);
    assert.ok(rows.filter(f => f.severity !== "positive").length <= 3);
    assert.ok(rows.filter(f => f.severity === "positive").length <= 2);
  }
});
