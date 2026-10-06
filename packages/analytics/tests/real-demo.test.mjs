import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Demoparser2Provider } from "@cs2-coach/dem-parser";

import { analyzeMatch } from "../dist/index.js";

const defaultDemo = fileURLToPath(new URL("../../../.demo/demo1.dem", import.meta.url));
const demoPath = process.env.DEM_TEST_FILE ? resolve(process.env.DEM_TEST_FILE) : defaultDemo;
const skip = !process.env.DEM_TEST_FILE && !existsSync(defaultDemo)
  ? "Provide .demo/demo1.dem or DEM_TEST_FILE"
  : false;

const sum = (players, select) => players.reduce((total, player) => total + select(player), 0);

test("real demo1.dem produces the reviewed twinkle golden metrics", { skip }, async () => {
  const match = await new Demoparser2Provider().parse(demoPath);
  const analytics = analyzeMatch(match);

  // Coverage: full formal windows and freeze-end rosters for every round.
  assert.equal(analytics.coverage.totalRounds, 24);
  assert.equal(analytics.coverage.eventEligibleRounds, 24);
  assert.equal(analytics.coverage.rosterResolvedRounds, 24);
  assert.equal(analytics.coverage.issues["post-round-events-excluded"], 117);
  assert.equal(analytics.coverage.issues["assist-side-mismatch"], 2);
  for (const issue of Object.keys(analytics.coverage.issues)) {
    if (issue !== "post-round-events-excluded" && issue !== "assist-side-mismatch") {
      assert.equal(analytics.coverage.issues[issue], 0, issue);
    }
  }
  assert.ok(analytics.coverage.rounds.every(round => round.eventEligible && !round.rosterDegraded));

  const twinkle = analytics.players.find(player => player.nickname === "twinkle");
  assert.ok(twinkle, "twinkle must be present");
  assert.deepEqual([twinkle.kills, twinkle.deaths, twinkle.assists], [25, 20, 4]);
  assert.equal(twinkle.kdRatio, 1.25);
  assert.equal(twinkle.headshotKills, 9);
  assert.equal(twinkle.headshotPercentage, 36);
  assert.equal(twinkle.roundsPlayed, 24);
  assert.equal(twinkle.reportedDamage, 2644);
  assert.equal(twinkle.adr, 2644 / 24);

  // CT/T split follows the per-round freeze-end snapshot side, not Player.team.
  assert.equal(twinkle.side.CT.roundsPlayed, 12);
  assert.equal(twinkle.side.T.roundsPlayed, 12);
  assert.deepEqual(
    [twinkle.side.CT.kills, twinkle.side.CT.deaths, twinkle.side.CT.assists, twinkle.side.CT.reportedDamage],
    [10, 10, 3, 1106]);
  assert.deepEqual(
    [twinkle.side.T.kills, twinkle.side.T.deaths, twinkle.side.T.assists, twinkle.side.T.reportedDamage],
    [15, 10, 1, 1538]);
  assert.equal(twinkle.side.CT.adr, 1106 / 12);
  assert.equal(twinkle.side.T.adr, 1538 / 12);

  assert.deepEqual(twinkle.multiKills.counts, { 2: 6, 3: 1, 4: 1, 5: 0 });
  assert.equal(twinkle.multiKills.multiKillRounds, 8);
  assert.equal(twinkle.multiKills.maxKillsInRound, 4);
  assert.deepEqual(
    [twinkle.opening.kills, twinkle.opening.deaths, twinkle.opening.duels, twinkle.opening.winRate],
    [4, 0, 4, 1]);

  // Two reported assists are friendly-fire credits on the victim's side and are
  // deliberately not counted; the raw assists total would be six.
  assert.equal(twinkle.coverage.assistsExcludedBySide, 2);
  assert.equal(twinkle.coverage.countedRounds, 24);
  assert.equal(twinkle.coverage.skippedUnconfirmedParticipation, 0);
  assert.equal(twinkle.coverage.skippedMissingWindow, 0);
});

test("real demo1.dem aggregate analytics stay consistent with the review window", { skip }, async () => {
  const match = await new Demoparser2Provider().parse(demoPath);
  const analytics = analyzeMatch(match);

  // Parser keeps 182 kills including post-round combat; analytics credits the
  // 180 inside formal round windows.
  const parserKills = match.rounds.flatMap(round => round.events).filter(event => event.type === "kill").length;
  assert.equal(parserKills, 182);
  assert.equal(sum(analytics.players, player => player.kills), 180);
  assert.equal(sum(analytics.players, player => player.deaths), 180);
  assert.equal(sum(analytics.players, player => player.assists), 57);
  assert.equal(sum(analytics.players, player => player.reportedDamage), 24600);

  // Every round has exactly one attributable opening duel.
  assert.equal(sum(analytics.players, player => player.opening.kills), 24);
  assert.equal(sum(analytics.players, player => player.opening.deaths), 24);
  assert.equal(analytics.coverage.issues["opening-duel-contested"], 0);
  assert.equal(analytics.coverage.issues["opening-duel-unattributed"], 0);
  assert.equal(analytics.coverage.issues["opening-duel-absent"], 0);

  for (const player of analytics.players) {
    assert.equal(player.side.CT.kills + player.side.T.kills, player.kills);
    assert.equal(player.side.CT.deaths + player.side.T.deaths, player.deaths);
    assert.equal(player.side.CT.assists + player.side.T.assists, player.assists);
    assert.equal(player.side.CT.reportedDamage + player.side.T.reportedDamage, player.reportedDamage);
    assert.equal(player.side.CT.roundsPlayed + player.side.T.roundsPlayed, player.roundsPlayed);
    assert.equal(player.roundsPlayed, 24);
  }

  assert.deepEqual(analyzeMatch(match), analytics);
});
