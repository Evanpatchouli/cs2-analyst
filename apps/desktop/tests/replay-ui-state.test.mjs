import assert from 'node:assert/strict';
import test from 'node:test';
import { appendReplayEvents, nextReplayRound, REPLAY_VISIBLE_EVENT_LIMIT, resolveReplayPlayerId } from '../renderer/src/replay-state.ts';

const round = (round, blocks = [{ index: 0, startTick: round * 1000, endTick: round * 1000 + 999 }]) => ({ round, startTick: round * 1000, endTick: round * 1000 + 999, freezeEndTick: null, coverage: 'complete', blocks });
const event = (id, tick, type = 'kill') => ({ id, tick, type, description: id, actorId: null, targetId: null, position: null });

test('continuous playback selects the next metadata round, skips excluded/unplayable windows and stops at the last', () => {
  const metadata = { rounds: [round(1), round(2), round(4), round(6), round(7, [])], excludedRounds: [4] };
  assert.equal(nextReplayRound(metadata, 1).round, 2);
  assert.equal(nextReplayRound(metadata, 2).round, 6, 'missing and excluded rounds are skipped, not invented');
  assert.equal(nextReplayRound(metadata, 6), null, 'no looping back to R1');
  assert.equal(nextReplayRound(metadata, 7), null, 'round without blocks is not playable');
  assert.equal(nextReplayRound({ rounds: metadata.rounds, excludedRounds: [2, 4, 6] }, 1), null);
  const unordered = { rounds: [round(3), round(1), round(2)], excludedRounds: [] };
  assert.equal(nextReplayRound(unordered, 1).round, 2, 'selection follows round number, not array order');
});

test('replay player selection accepts a valid roster id and falls back without nickname guessing', () => {
  const players = [{ id: 'a', nickname: 'Alpha' }, { id: 'b', nickname: 'Beta' }];
  assert.equal(resolveReplayPlayerId(players, 'b'), 'b');
  assert.equal(resolveReplayPlayerId(players, 'stale'), 'a');
  assert.equal(resolveReplayPlayerId(players, ''), 'a');
  assert.equal(resolveReplayPlayerId([], 'stale'), '');
});

test('only reached visible events append, across chunks, without duplicates and with a bounded list', () => {
  const first = [event('e1', 10), event('e2', 20, 'utility'), event('e3', 30, 'flash'), event('e4', 40, 'damage'), event('e5', 50)];
  const seen = new Set();
  let list = [];
  let result = appendReplayEvents(list, seen, first, 25);
  assert.deepEqual(result.events.map(item => item.id), ['e1', 'e2']);
  assert.equal(result.appended, 2);
  list = result.events;
  assert.equal(appendReplayEvents(list, seen, first, 25).appended, 0, 'the same reached events never append twice');
  const second = [event('e2', 20, 'utility'), event('e6', 60)];
  result = appendReplayEvents(list, seen, second, 60);
  assert.deepEqual(result.events.map(item => item.id), ['e1', 'e2', 'e6'], 'the prior chunk events survive a chunk switch');
  assert.equal(result.appended, 1);
  assert.equal(appendReplayEvents(result.events, seen, second, 60).appended, 0);
  const bound = Array.from({ length: REPLAY_VISIBLE_EVENT_LIMIT + 5 }, (_, index) => event('b' + index, 1));
  const bounded = appendReplayEvents([], new Set(), bound, 1);
  assert.equal(bounded.events.length, REPLAY_VISIBLE_EVENT_LIMIT);
  assert.equal(bounded.events[0].id, 'b5');
  assert.equal(bounded.events.at(-1).id, 'b' + (REPLAY_VISIBLE_EVENT_LIMIT + 4));
});

test('same-tick events keep the contract order, original rows and future events are never exposed', () => {
  const sameTick = [event('first', 12), event('second', 12), event('future', 13)];
  const result = appendReplayEvents([], new Set(), sameTick, 12);
  assert.deepEqual(result.events.map(item => item.id), ['first', 'second']);
  assert.deepEqual(result.events, sameTick.slice(0, 2), 'same-tick rows keep their original tick/description and gain no label');
  assert.equal(result.appended, 2);
  assert.equal(appendReplayEvents(result.events, new Set(result.events.map(item => item.id)), sameTick, 11).appended, 0);
});
