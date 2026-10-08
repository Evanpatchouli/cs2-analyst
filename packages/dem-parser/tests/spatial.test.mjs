import assert from "node:assert/strict";
import test from "node:test";
import { buildSpatialEvidence, planSpatialSampling, spatialFields } from "../dist/providers/spatial-evidence.js";

const A = "76561198000000001", B = "76561198000000002";
const match = {
  id: "fixture", map: "unknown", tickRate: 64,
  players: [A, B].map(steamId => ({ steamId, nickname: "", team: "Unknown" })),
  rounds: [{ number: 1, winner: null, startTick: 10, freezeEndTick: 20, endTick: 90, events: [
    { type: "kill", tick: 40, killer: A, victim: B },
    { type: "kill", tick: 40, killer: B, victim: A },
    { type: "damage", tick: 41, attacker: A, victim: B },
    { type: "weapon_fire", tick: 42, shooter: A, weapon: "ak47" },
    { type: "utility", tick: 43, thrower: A, utility: "smoke", action: "detonate" },
    { type: "flash", tick: 44, attacker: A, victim: B, blindDurationSeconds: 1 },
    { type: "bomb", tick: 45, player: A, action: "planted" },
  ] }],
};
const row = (tick, steamid = A, override = {}) => ({ tick, steamid, X: 0, Y: 1, Z: 2, yaw: 0, pitch: 0,
  health: 100, is_alive: true, team_num: 2, active_weapon_name: "AK-47", ...override });
const allRows = plan => [...plan.coreTicks, ...plan.optionalTicks].flatMap(tick => [row(tick), row(tick, B)]);
const kill = result => result.events.find(event => event.eventRef.type === "kill");
const actorAt = result => kill(result).samples.find(binding => binding.role === "actor" && binding.sample.relation === "at-event").sample;

test("core ticks include every event category and all boundaries even at budget zero", () => {
  const plan = planSpatialSampling(match, { tickBudget: 0 });
  assert.deepEqual(plan.coreTicks, [10, 20, 40, 41, 42, 43, 44, 45, 90]);
  assert.deepEqual(plan.optionalTicks, []);
  assert.ok(plan.omittedOptionalTicks.length > 0);
  const result = buildSpatialEvidence(match, plan, allRows(plan));
  assert.ok(result.events.every(event => event.samples.filter(({ sample }) => ["at-event", "boundary"].includes(sample.relation))
    .every(({ sample }) => sample.coverage.status === "complete")));
  assert.equal(result.coverage.status, "partial");
  assert.ok(result.coverage.reasons.includes("sample-budget-truncated"));
  assert.ok(kill(result).samples.filter(({ sample }) => sample.relation !== "at-event")
    .every(({ sample }) => sample.actualTick === null && sample.coverage.reasons.includes("sample-budget-truncated")));
});

test("only optional unique ticks consume residual budget; overlap reuses a core tick", () => {
  const full = planSpatialSampling(match);
  const limited = planSpatialSampling(match, { tickBudget: full.coreTicks.length + 2 });
  assert.deepEqual(limited.coreTicks, full.coreTicks);
  assert.deepEqual(limited.optionalTicks, full.optionalTicks.slice(0, 2));
  assert.deepEqual(limited.omittedOptionalTicks, full.optionalTicks.slice(2));
  const adjacent = structuredClone(match);
  adjacent.rounds[0].events.push({ type: "bomb", tick: 32, player: A, action: "drop" });
  const plan = planSpatialSampling(adjacent, { tickBudget: 0 });
  assert.ok(!plan.optionalTicks.includes(32) && !plan.omittedOptionalTicks.includes(32));
  const result = buildSpatialEvidence(adjacent, plan, allRows(plan));
  const before = kill(result).samples.find(({ role, sample }) => role === "actor" && sample.relation === "before-event").sample;
  assert.equal(before.actualTick, 32);
  assert.equal(before.coverage.status, "complete");
});

test("requested != returned tick stays unavailable and records actual returned ticks without substitution", () => {
  const plan = planSpatialSampling(match, { contextSeconds: 0 });
  const result = buildSpatialEvidence(match, plan, [row(39), row(41)]);
  const sample = actorAt(result);
  assert.equal(sample.requestedTick, 40);
  assert.equal(sample.actualTick, null);
  assert.equal(sample.position, null);
  assert.ok(sample.coverage.reasons.includes("requested-tick-missing"));
  assert.deepEqual(result.sampling.returnedTicks, [39, 41]);
});

test("exact tick with missing player is distinct from a missing tick; numeric SteamIDs are not coerced", () => {
  const plan = planSpatialSampling(match, { contextSeconds: 0 });
  for (const rows of [[row(40, B)], [row(40, Number(A))]]) {
    const sample = actorAt(buildSpatialEvidence(match, plan, rows));
    assert.equal(sample.actualTick, null);
    assert.ok(sample.coverage.reasons.includes("player-row-missing"));
    assert.ok(!sample.coverage.reasons.includes("requested-tick-missing"));
  }
});

test("missing/invalid required fields become null with partial or unavailable coverage; zero remains zero", () => {
  const plan = planSpatialSampling(match, { contextSeconds: 0 });
  const sample = actorAt(buildSpatialEvidence(match, plan, [row(40, A, { X: null, yaw: NaN, health: undefined })]));
  assert.equal(sample.actualTick, 40);
  assert.equal(sample.position, null);
  assert.equal(sample.view, null);
  assert.equal(sample.health, null);
  assert.equal(sample.coverage.status, "partial");
  assert.equal(sample.fields.state, "partial");
  for (const reason of ["position-missing", "view-missing", "state-missing"]) assert.ok(sample.coverage.reasons.includes(reason));
  const valid = actorAt(buildSpatialEvidence(match, plan, [row(40)]));
  assert.equal(valid.position.x, 0);
  assert.equal(valid.view.yaw, 0);
  const empty = actorAt(buildSpatialEvidence(match, plan, [{ tick: 40, steamid: A }]));
  assert.equal(empty.coverage.status, "unavailable");
  assert.equal(empty.actualTick, 40);
  assert.equal(empty.side, "Unknown");
});

test("nullable weapon never invalidates complete required spatial evidence, including at-death state", () => {
  const plan = planSpatialSampling(match, { contextSeconds: 0 });
  const sample = actorAt(buildSpatialEvidence(match, plan, [row(40, A, { active_weapon_name: null, health: 0, is_alive: false })]));
  assert.equal(sample.coverage.status, "complete");
  assert.equal(sample.activeWeapon, null);
  assert.equal(sample.fields.weapon, "unavailable");
  assert.ok(sample.coverage.reasons.includes("weapon-unavailable"));
  assert.equal(sample.health, 0);
  assert.equal(sample.alive, false);
});

test("before/at/after and boundaries stay explicit; same-tick events have distinct local refs", () => {
  const plan = planSpatialSampling(match);
  const result = buildSpatialEvidence(match, plan, allRows(plan));
  assert.deepEqual(kill(result).samples.filter(binding => binding.role === "actor").map(({ sample }) => [sample.relation, sample.requestedTick, sample.actualTick]),
    [["at-event", 40, 40], ["before-event", 32, 32], ["after-event", 48, 48]]);
  assert.deepEqual(result.events.filter(event => event.eventRef.type === "kill").map(event => event.eventRef.eventIndex), [0, 1]);
  for (const event of result.events.filter(event => event.eventRef.type === "round_boundary")) {
    assert.ok(event.samples.every(binding => binding.sample.relation === "boundary"));
  }
  for (const event of result.events.filter(event => event.eventRef.type !== "round_boundary")) {
    assert.equal(match.rounds[0].events[event.eventRef.eventIndex].tick, event.eventRef.tick);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("unknown tick rate, out-of-round context and unidentified actor explicitly degrade", () => {
  const unknown = { ...match, tickRate: undefined };
  const plan = planSpatialSampling(unknown);
  assert.equal(plan.contextOffsetTicks, null);
  assert.equal(plan.optionalTicks.length, 0);
  assert.ok(kill(buildSpatialEvidence(unknown, plan, allRows(plan))).coverage.reasons.includes("tick-rate-unknown"));
  const edge = structuredClone(match);
  edge.rounds[0].events[0] = { type: "kill", tick: 10, killer: "world", victim: B };
  const edgePlan = planSpatialSampling(edge);
  const evidence = kill(buildSpatialEvidence(edge, edgePlan, allRows(edgePlan)));
  assert.ok(evidence.coverage.reasons.includes("context-outside-round"));
  assert.ok(evidence.coverage.reasons.includes("participant-unidentified"));
  assert.equal(evidence.coverage.status, "partial");
  assert.ok(!evidence.samples.some(binding => binding.sample.playerId === "world"));
});

test("same inputs produce deterministic output including optional truncation; duplicate rows fail explicitly", () => {
  const options = { tickBudget: 12 };
  const plan = planSpatialSampling(match, options);
  const rows = allRows(plan);
  assert.deepEqual(buildSpatialEvidence(match, plan, rows), buildSpatialEvidence(match, planSpatialSampling(match, options), [...rows].reverse()));
  assert.throws(() => buildSpatialEvidence(match, plan, [row(40), row(40)]), /Duplicate/);
  const failed = buildSpatialEvidence(match, plan, [], true);
  assert.equal(failed.coverage.status, "unavailable");
  assert.ok(failed.coverage.reasons.includes("sampling-failed"));
});

test("only supported field candidates are queried; invalid budgets/offsets reject; empty matches request no ticks", () => {
  assert.deepEqual(spatialFields, ["X", "Y", "Z", "yaw", "pitch", "health", "is_alive", "team_num", "active_weapon_name"]);
  for (const tickBudget of [-1, 0.5, NaN, Infinity]) assert.throws(() => planSpatialSampling(match, { tickBudget }));
  for (const contextSeconds of [-1, NaN, Infinity, Number.MAX_VALUE]) assert.throws(() => planSpatialSampling(match, { contextSeconds }));
  const empty = { ...match, rounds: [] };
  const plan = planSpatialSampling(empty);
  assert.deepEqual(plan.coreTicks, []);
  assert.deepEqual(plan.optionalTicks, []);
  assert.equal(buildSpatialEvidence(empty, plan, []).coverage.status, "unavailable");
});
