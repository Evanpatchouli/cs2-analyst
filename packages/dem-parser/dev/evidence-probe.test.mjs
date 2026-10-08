import assert from 'node:assert/strict';
import test from 'node:test';
import { samplingPlan, valid, checkId } from './evidence-probe.mjs';

test('bounded sparse planning dedupes, includes event families and never guesses tickRate', () => {
  const events = ['kill', 'damage', 'weapon_fire', 'utility', 'flash', 'bomb'].map((type, i) => ({ type, tick: 500 + 50 * i }));
  const match = { rounds: [{ startTick: 100, freezeEndTick: 200, endTick: 2000, events: [...events, events[0]] }] };
  const unknown = samplingPlan(match);
  assert.equal(unknown.ticks.length, 9);
  assert.deepEqual(unknown.offsetTicks, []);
  assert.equal(new Set(unknown.ticks).size, unknown.ticks.length);
  const known = samplingPlan({ ...match, tickRate: 128 }, true);
  assert.deepEqual(known.offsetTicks, [-16, 16]);
  for (const e of events) assert.ok(known.ticks.includes(e.tick));
  for (const e of events.slice(0, 3)) for (const offset of [-16, -2, -1, 16]) assert.ok(known.ticks.includes(e.tick + offset));
  assert.ok(known.density <= 0.2);
  const dense = samplingPlan({ tickRate: 64, rounds: [{ events: Array.from({ length: 10000 }, (_, tick) => ({ type: 'weapon_fire', tick })) }] }, true);
  assert.equal(dense.ticks.length, dense.cap);
  assert.ok(dense.warnings.some(w => w.includes('budget exceeded')));
  assert.deepEqual(samplingPlan({ rounds: [] }).ticks, []);
});

test('identity and coverage validation do not fabricate missing evidence', () => {
  assert.throws(() => checkId(76561198386265483), /Numeric SteamID/);
  assert.equal(checkId('76561198386265483'), true);
  assert.equal(valid('velocity_X', null), false);
  assert.equal(valid('X', Infinity), false);
  assert.equal(valid('is_alive', 1), false);
  assert.equal(valid('active_weapon_name', ''), false);
  assert.equal(valid('aim_punch_angle', [1, NaN, 0]), false);
  assert.equal(valid('buttons', '18446744073709551615'), true);
});
