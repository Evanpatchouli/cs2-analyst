import assert from 'node:assert/strict';
import test from 'node:test';
import { displayEstimate, planReplayProbe } from './replay-sampling.mjs';

const match = { tickRate: 64, rounds: [{ number: 1, startTick: 10, freezeEndTick: 20, endTick: 30,
  events: [{ tick: 23 }, { tick: 23 }, { tick: 31 }], playerLifecycle: [{ tick: 25 }] }] };
test('probe preserves all exact formal event/lifecycle/boundary ticks and deduplicates', () => {
  assert.deepEqual(planReplayProbe(match, 8).ticks, [10, 18, 20, 23, 25, 26, 30]);
  assert.deepEqual(planReplayProbe(match, 8).rounds[0].requiredTicks, [10, 20, 23, 25, 30]);
  const bad = { rounds: [{ number: 2, startTick: 30, endTick: 10, events: [] }, { number: 3, events: [] }] };
  assert.deepEqual(planReplayProbe(bad, 8).excludedRounds, [2, 3]);
  assert.deepEqual(planReplayProbe(bad, 8).ticks, []);
});
test('unknown clock never invents normal-rate sampling; budgets fail rather than trim events', () => {
  assert.equal(planReplayProbe({ ...match, tickRate: undefined }, 8).stepTicks, null);
  assert.deepEqual(planReplayProbe({ ...match, tickRate: 0 }, 8).ticks, [10, 20, 23, 25, 30]);
  assert.throws(() => planReplayProbe(match, 8, 1), /budget/);
  assert.throws(() => planReplayProbe(match, 0));
});
const row = (tick, yaw, extra = {}) => ({ tick, steamid: '1', X: tick, Y: 0, Z: 0, yaw, is_alive: true, team_num: 2, ...extra });
test('error probe short arc and zero values are valid; missing/dead/lifecycle segments are excluded', () => {
  assert.deepEqual(displayEstimate(row(0, 179), row(8, -179), 4), { x: 4, y: 0, z: 0, yaw: 180 });
  for (const changed of [{ X: null }, { is_alive: false }, { team_num: 3 }, { steamid: '2' }]) assert.equal(displayEstimate(row(0, 0), row(8, 1, changed), 4), null);
  assert.equal(displayEstimate(row(0, 0), row(8, 1), 4, [4]), null);
  assert.equal(displayEstimate(row(0, 0), row(8, 1), 9), null);
  assert.equal(displayEstimate(undefined, row(8, 1), 4), null);
});
