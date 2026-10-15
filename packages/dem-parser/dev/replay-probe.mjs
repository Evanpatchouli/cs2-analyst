// Development-only adapter. Native queries stay in dem-parser; never imported by Desktop.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { convertToMatch } from '../dist/providers/converters.js';
import { displayEstimate, planReplayProbe, replayFields } from './replay-sampling.mjs';

const eventNames = ['round_start', 'round_end', 'round_freeze_end', 'player_death', 'player_hurt', 'weapon_fire',
  'smokegrenade_detonate', 'hegrenade_detonate', 'flashbang_detonate', 'inferno_startburn', 'decoy_started', 'player_blind',
  'bomb_pickup', 'bomb_dropped', 'bomb_beginplant', 'bomb_planted', 'bomb_begindefuse', 'bomb_defused', 'bomb_exploded',
  'player_spawn', 'player_disconnect', 'player_team'];
const quantiles = values => {
  const sorted = values.toSorted((a, b) => a - b);
  return { count: sorted.length, p50: sorted[Math.floor(sorted.length * .5)] ?? null,
    p95: sorted[Math.floor(sorted.length * .95)] ?? null, max: sorted.at(-1) ?? null };
};
const xyz = row => [row?.X, row?.Y, row?.Z].every(value => typeof value === 'number' && Number.isFinite(value));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export async function probe(file, hz) {
  const native = await import('@cs2-analyst/demoparser-native');
  const start = performance.now(), bytes = await readFile(file);
  const id = sha(bytes), header = native.parseHeader(bytes);
  assert.equal(bytes.subarray(0, 8).toString(), 'PBDEMS2\0');
  const events = native.parseEvents(bytes, eventNames, ['team_num', 'is_alive'], ['total_rounds_played', 'is_warmup_period', 'game_time']);
  const boundaries = [...new Set(events.filter(e => e.is_warmup_period !== true && ['round_start', 'round_end', 'round_freeze_end'].includes(e.event_name)).map(e => e.tick))];
  const match = convertToMatch({ id, header, players: native.parsePlayerInfo(bytes), events,
    stateRows: boundaries.length ? native.parseTicks(bytes, ['team_num', 'is_alive'], boundaries) : [] });
  const baseMs = performance.now() - start, plan = planReplayProbe(match, hz);
  let rows, queryMs = [];
  for (let i = 0; i < 3; i++) {
    rows = null; global.gc?.();
    const begin = performance.now();
    rows = plan.ticks.length ? native.parseTicks(bytes, replayFields, plan.ticks) : [];
    queryMs.push(performance.now() - begin);
  }
  const pairs = new Map(), returned = new Set(), requested = new Set(plan.ticks);
  for (const row of rows) {
    assert.ok(requested.has(row.tick));
    assert.equal(typeof row.steamid, 'string');
    const key = `${row.tick}:${row.steamid}`;
    assert.ok(!pairs.has(key), 'Duplicate native player row'); pairs.set(key, row); returned.add(row.tick);
  }
  const ids = match.players.map(p => p.steamId), chunkBytes = [], seekMs = [];
  for (const r of plan.rounds) {
    // Measure a candidate 20-second transport window; not the future production DTO/cache.
    const step = match.tickRate ? 20 * match.tickRate : r.endTick - r.startTick + 1;
    for (let tick = r.startTick; tick <= r.endTick; tick += step) {
      const begin = performance.now();
      const ticks = r.ticks.filter(t => t >= tick && t < tick + step);
      const payload = ticks.flatMap(t => ids.map(id => pairs.get(`${t}:${id}`) ?? { tick: t, steamid: id, missing: true }));
      chunkBytes.push(Buffer.byteLength(JSON.stringify(payload)));
      seekMs.push(performance.now() - begin);
    }
  }
  const referenceTicks = new Set(), landmarks = [], referenceWindows = [];
  // Include movement, combat and bomb activity; native per-tick observations are the reference.
  for (const index of plan.stepTicks === null ? [] : [...new Set([0, Math.floor(plan.rounds.length / 3), Math.floor(plan.rounds.length * 2 / 3), plan.rounds.length - 1])]) {
    const r = plan.rounds[index]; if (!r) continue;
    const source = match.rounds.find(round => round.number === r.number);
    const anchor = source.events.find(e => e.type === 'kill')?.tick ?? source.freezeEndTick ?? source.startTick;
    const start = Math.max(r.startTick, anchor - 2 * match.tickRate), end = Math.min(r.endTick, anchor + 2 * match.tickRate);
    referenceWindows.push({ round: r.number, start, end, anchor, kind: 'first-kill-or-freeze-end' });
    for (let tick = start; tick <= end; tick++) referenceTicks.add(tick);
  }
  const references = referenceTicks.size ? native.parseTicks(bytes, replayFields, [...referenceTicks].sort((a, b) => a - b)) : [];
  const errors = [], angleErrors = []; let excluded = 0;
  for (const row of references) {
    const r = plan.rounds.find(round => row.tick >= round.startTick && row.tick <= round.endTick);
    if (!r || r.ticks.includes(row.tick)) continue;
    const source = match.rounds.find(round => round.number === r.number);
    const rightIndex = r.ticks.findIndex(t => t > row.tick), leftTick = r.ticks[rightIndex - 1], rightTick = r.ticks[rightIndex];
    const barriers = [...(source.playerLifecycle ?? []).filter(e => e.player === row.steamid), ...source.events.filter(e => e.type === 'kill' && e.victim === row.steamid)].map(e => e.tick);
    const estimate = displayEstimate(pairs.get(`${leftTick}:${row.steamid}`), pairs.get(`${rightTick}:${row.steamid}`), row.tick, barriers);
    if (!estimate || !xyz(row)) { excluded++; continue; }
    errors.push(Math.hypot(estimate.x - row.X, estimate.y - row.Y, estimate.z - row.Z));
    if (Number.isFinite(row.yaw)) angleErrors.push(Math.abs(((estimate.yaw - row.yaw + 540) % 360 + 360) % 360 - 180));
  }
  for (const r of match.rounds) {
    const freeze = r.freezeEndTick, wanted = [freeze, ...r.events.filter(e => e.type === 'bomb' && e.action === 'planted').map(e => e.tick)].filter(t => t !== undefined);
    for (const tick of wanted) for (const player of ids) {
      const row = pairs.get(`${tick}:${player}`);
      if (row && xyz(row) && row.is_alive === true) landmarks.push({ round: r.number, tick, playerId: player,
        side: row.team_num, x: row.X, y: row.Y, z: row.Z, yaw: row.yaw,
        kind: tick === freeze ? 'freeze_end' : 'plant_tick',
        planter: r.events.some(e => e.type === 'bomb' && e.action === 'planted' && e.tick === tick && e.player === player) });
    }
  }
  const fullBytes = Buffer.byteLength(JSON.stringify(rows));
  const result = { schemaVersion: 1, experiment: 'P6.0; not a production replay implementation', fileName: file.split(/[\\/]/).at(-1),
    sha256: id, matchFingerprint: sha(JSON.stringify(match)), fileBytes: bytes.length, map: match.map, tickRate: match.tickRate ?? null, header,
    environment: { node: process.version, cpu: cpus()[0]?.model, totalMemoryBytes: totalmem(), nativeSha256: native.getBindingProvenance().verifiedSha256 },
    hz, baseMs, queryMs, rounds: plan.rounds.length, excludedRounds: plan.excludedRounds, requestedTicks: plan.ticks.length,
    returnedTicks: returned.size, rows: rows.length, missingTicks: plan.ticks.filter(t => !returned.has(t)).length,
    missingPlayerRows: plan.ticks.length * ids.length - rows.filter(r => ids.includes(r.steamid)).length,
    validPositionRows: rows.filter(xyz).length, aliveRows: rows.filter(r => r.is_alive === true).length,
    fullRawJsonBytes: fullBytes, candidate20sRawChunkBytes: quantiles(chunkBytes), candidate20sLookupAndSerializeMs: quantiles(seekMs),
    reference: { hz: match.tickRate ?? null, unavailableReason: plan.stepTicks === null ? 'reliable-tick-rate-unavailable' : null, windows: referenceWindows, rows: references.length, positionErrorWorldUnits: quantiles(errors), yawErrorDegrees: quantiles(angleErrors), excluded,
      scope: 'four distributed rounds around first kill; native final-tick observations, no absolute freshness claim' },
    peakProcessRssKiB: process.resourceUsage().maxRSS || null, peakScope: 'OS process lifetime: input/native/base/query repetitions/reference/serialization, not Electron application peak',
    landmarks };
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , file, rate, output] = process.argv;
  assert.ok(file && output, 'node --expose-gc replay-probe.mjs <DEM> <8|16|32> <output.json>');
  const result = await probe(resolve(file), Number(rate));
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ hz: result.hz, queryMs: result.queryMs, rows: result.rows, peakProcessRssKiB: result.peakProcessRssKiB }));
}
