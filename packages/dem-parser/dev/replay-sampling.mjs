// P6.0 experiment only. No runtime consumer or public parser/model contract.
import assert from 'node:assert/strict';

const validTick = value => Number.isSafeInteger(value) && value >= 0;
export const replayFields = ['X', 'Y', 'Z', 'yaw', 'pitch', 'health', 'is_alive', 'team_num'];

export function planReplayProbe(match, hz, limit = 200_000) {
  assert.ok([8, 16, 32].includes(hz), 'Only the measured candidate rates are supported');
  assert.ok(Number.isSafeInteger(limit) && limit >= 0);
  const reliable = Number.isSafeInteger(match.tickRate) && match.tickRate > 0 && match.tickRate % hz === 0;
  const step = reliable ? match.tickRate / hz : null;
  const ticks = new Set(), rounds = [], excludedRounds = [];
  const add = tick => { ticks.add(tick); assert.ok(ticks.size <= limit, 'Replay probe tick budget exceeded; never silently trim'); };
  for (const round of match.rounds) {
    const start = round.startTick, end = round.endTick;
    if (!validTick(start) || !validTick(end) || end < start) { excludedRounds.push(round.number); continue; }
    const required = new Set([start, end]);
    if (validTick(round.freezeEndTick) && round.freezeEndTick >= start && round.freezeEndTick <= end) required.add(round.freezeEndTick);
    for (const event of [...round.events, ...(round.playerLifecycle ?? [])]) {
      if (validTick(event.tick) && event.tick >= start && event.tick <= end) required.add(event.tick);
    }
    const wanted = new Set(required);
    if (step !== null) for (let tick = start; tick <= end; tick += step) { wanted.add(tick); add(tick); }
    for (const tick of required) add(tick);
    rounds.push({ number: round.number, startTick: start, endTick: end, requiredTicks: [...required].sort((a, b) => a - b), ticks: [...wanted].sort((a, b) => a - b) });
  }
  return { requestedHz: hz, stepTicks: step, rounds, excludedRounds, ticks: [...ticks].sort((a, b) => a - b) };
}

export function displayEstimate(left, right, tick, discontinuities = []) {
  if (!left || !right || left.steamid !== right.steamid || left.tick >= right.tick || tick < left.tick || tick > right.tick
    || left.is_alive !== true || right.is_alive !== true || left.team_num !== right.team_num
    || ![left.X, left.Y, left.Z, right.X, right.Y, right.Z, left.yaw, right.yaw].every(Number.isFinite)
    || discontinuities.some(t => t > left.tick && t <= right.tick)) return null;
  const fraction = (tick - left.tick) / (right.tick - left.tick);
  const angle = ((right.yaw - left.yaw + 540) % 360 + 360) % 360 - 180;
  return { x: left.X + (right.X - left.X) * fraction, y: left.Y + (right.Y - left.Y) * fraction,
    z: left.Z + (right.Z - left.Z) * fraction, yaw: left.yaw + angle * fraction };
}
