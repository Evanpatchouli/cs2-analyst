// Development-only P5.7.0 probe. Never imported or exported by the package.
import assert from 'node:assert/strict';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem } from 'node:os';
import * as native from '@cs2-analyst/demoparser-native';
import { Demoparser2Provider } from '../dist/index.js';

export const required = ['X', 'Y', 'Z', 'yaw', 'pitch', 'velocity_X', 'velocity_Y', 'velocity_Z', 'active_weapon_name', 'health', 'is_alive', 'team_num'];
export const optional = ['shots_fired', 'is_scoped', 'is_walking', 'is_airborne', 'aim_punch_angle', 'flash_duration', 'buttons', 'FIRE',
  'usercmd_viewangle_x', 'usercmd_viewangle_y', 'usercmd_viewangle_z', 'usercmd_buttonstate_1', 'usercmd_buttonstate_2', 'usercmd_buttonstate_3',
  'usercmd_consumed_server_angle_changes', 'usercmd_forward_move', 'usercmd_left_move', 'usercmd_impulse', 'usercmd_mouse_dx', 'usercmd_mouse_dy',
  'usercmd_left_hand_desired', 'usercmd_weapon_select', 'usercmd_input_history', 'usercmd_subtick_moves'];
const eventNames = ['round_start', 'round_end', 'round_freeze_end', 'player_death', 'player_hurt', 'weapon_fire',
  'smokegrenade_detonate', 'hegrenade_detonate', 'flashbang_detonate', 'inferno_startburn', 'decoy_started', 'player_blind',
  'bomb_pickup', 'bomb_dropped', 'bomb_beginplant', 'bomb_planted', 'bomb_begindefuse', 'bomb_defused', 'bomb_exploded',
  'player_spawn', 'player_disconnect', 'player_team'];
const numericTick = tick => Number.isSafeInteger(tick) && tick >= 0;
export function checkId(id) {
  if (typeof id === 'number') throw new TypeError('Numeric SteamID is forbidden');
  return typeof id === 'string' && /^\d+$/.test(id) && id !== '0';
}
const evenly = (values, count) => count >= values.length ? values : Array.from({ length: count }, (_, i) => values[Math.floor(i * values.length / count)]);

export function samplingPlan(match, history = false) {
  const groups = { boundary: [], kill: [], damage: [], weapon_fire: [], utility: [], flash: [], bomb: [] };
  for (const r of match.rounds) {
    groups.boundary.push(...[r.startTick, r.freezeEndTick, r.endTick].filter(numericTick));
    for (const e of r.events) groups[e.type]?.push(e.tick);
  }
  for (const key of Object.keys(groups)) groups[key] = [...new Set(groups[key])].sort((a, b) => a - b);
  const all = [...new Set(Object.values(groups).flat())].sort((a, b) => a - b);
  if (!all.length) return { ticks: [], warnings: ['No eligible event ticks; no parseTicks call'], groups };
  const maxTick = all.at(-1), span = maxTick - all[0] + 1;
  const cap = Math.min(24000, Math.floor(span * 0.20));
  const warnings = [];
  // Overflow is explicit and never silently becomes a full-tick dump.
  const base = all.length <= cap ? all : evenly(all, cap);
  if (base.length !== all.length) warnings.push(`Base tick budget exceeded: ${all.length - base.length} ticks omitted`);
  const wanted = new Set(base);
  const rate = match.tickRate;
  const offsets = Number.isFinite(rate) && rate > 0 ? [...new Set([Math.max(1, Math.round(rate * 0.125))])] : [];
  if (!offsets.length) warnings.push('Unknown tickRate: time offsets disabled; no 64-tick default');
  const combat = [...new Set([...groups.kill, ...groups.damage, ...groups.weapon_fire])].sort((a, b) => a - b);
  const extras = [...new Set(combat.flatMap(t => offsets.flatMap(o => [t - o, t + o])).filter(t => numericTick(t) && t <= maxTick && !wanted.has(t)))].sort((a, b) => a - b);
  for (const tick of evenly(extras, Math.max(0, cap - wanted.size))) wanted.add(tick);
  const beforeHistory = wanted.size;
  // Native velocity needs preceding consecutive samples. Integer adjacency is structural,
  // not an assumption about elapsed time or tickRate.
  const warmup = history ? [...new Set([...wanted].flatMap(t => [t - 2, t - 1]).filter(numericTick))].filter(t => !wanted.has(t)).sort((a, b) => a - b) : [];
  for (const tick of evenly(warmup, Math.max(0, cap - wanted.size))) wanted.add(tick);
  if (history && wanted.size - beforeHistory < warmup.length) warnings.push(`Velocity history cap omitted ${warmup.length - (wanted.size - beforeHistory)} ticks`);
  const ticks = [...wanted].sort((a, b) => a - b);
  return { ticks, groups, cap, span, maxTick, baseTicks: base.length, originalBaseTicks: all.length,
    neighborTicks: beforeHistory - base.length, historyTicks: wanted.size - beforeHistory,
    offsetSeconds: offsets.length ? [-0.125, 0.125] : [], offsetTicks: offsets.flatMap(o => [-o, o]),
    density: ticks.length / span, warnings };
}

export function valid(field, value) {
  if (value == null) return false;
  if (['is_alive', 'is_scoped', 'is_walking', 'is_airborne', 'FIRE', 'usercmd_left_hand_desired'].includes(field)) return typeof value === 'boolean';
  if (field === 'active_weapon_name') return typeof value === 'string' && value.length > 0;
  if (field === 'buttons' || field.startsWith('usercmd_buttonstate')) return (typeof value === 'string' && /^\d+$/.test(value)) || (Number.isSafeInteger(value) && value >= 0);
  if (field === 'aim_punch_angle') return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  if (['usercmd_input_history', 'usercmd_subtick_moves'].includes(field)) return Array.isArray(value);
  if (!Number.isFinite(value)) return false;
  if (field === 'team_num') return Number.isInteger(value) && value >= 0 && value <= 3;
  if (field === 'health' || field === 'shots_fired') return Number.isInteger(value) && value >= 0;
  if (field === 'flash_duration') return value >= 0;
  if (field === 'pitch') return Math.abs(value) <= 90;
  if (field === 'yaw') return Math.abs(value) <= 360;
  return true;
}

function coverage(rows, fields, ticks, ids, targetTicks = ticks) {
  const targets = new Set(targetTicks), selected = rows.filter(r => targets.has(r.tick));
  return Object.fromEntries(fields.map(f => {
    const count = subset => ({ rowCount: subset.length, nonNullCount: subset.filter(r => r[f] != null).length,
      validCount: subset.filter(r => valid(f, r[f])).length });
    return [f, { ...count(selected), expectedRows: targetTicks.length * ids.length,
      perPlayer: Object.fromEntries(ids.map(id => [id, { ...count(selected.filter(r => r.steamid === id)), expectedRows: targetTicks.length }])) }];
  }));
}

function samples(match) {
  const enemy = e => e.type === 'kill' && e.killer !== e.victim && e.killer !== 'world' && e.teamkill === false;
  const result = { singleKills: [], multiKillRounds: [], utility: [], tradeLike: [] };
  for (const r of match.rounds) {
    const kills = r.events.filter(e => enemy(e) && e.tick >= r.startTick && e.tick <= r.endTick);
    const counts = new Map();
    for (const e of kills) counts.set(e.killer, (counts.get(e.killer) ?? 0) + 1);
    for (const e of kills) if (result.singleKills.length < 3 && counts.get(e.killer) === 1 && !['hegrenade', 'inferno', 'molotov'].includes(e.weapon) && kills.filter(k => k.tick === e.tick).length === 1) result.singleKills.push({ round: r.number, event: e });
    if (result.multiKillRounds.length < 2 && [...counts.values()].some(n => n >= 2)) {
      const player = [...counts].find(([, n]) => n >= 2)[0];
      result.multiKillRounds.push({ round: r.number, player, events: kills.filter(k => k.killer === player) });
    }
    if (!result.utility.length) {
      const e = r.events.find(e => e.type === 'damage' && ['hegrenade', 'inferno', 'molotov'].includes(e.weapon) && e.attacker && e.tick >= r.startTick && e.tick <= r.endTick);
      if (e) result.utility.push({ round: r.number, event: e });
    }
    if (!result.tradeLike.length && match.tickRate) {
      for (const b of kills) {
        const a = kills.find(a => b.victim === a.killer && b.killer !== a.victim && b.killerSide === a.victimSide && b.tick > a.tick && b.tick - a.tick <= 5 * match.tickRate);
        if (a) { result.tradeLike.push({ round: r.number, deltaSeconds: (b.tick - a.tick) / match.tickRate, events: [a, b] }); break; }
      }
    }
  }
  return result;
}

function evidence(match, rows, selected) {
  const index = new Map();
  for (const row of rows) { if (!index.has(row.tick)) index.set(row.tick, new Map()); index.get(row.tick).set(row.steamid, row); }
  const state = (id, tick) => {
    const row = index.get(tick)?.get(id);
    return { steamId: id, sampleTick: tick, present: !!row, ...Object.fromEntries(required.map(f => [f, row?.[f] ?? null])) };
  };
  const distance = (id, tick) => {
    const row = index.get(tick)?.get(id);
    if (!row || !['X', 'Y', 'Z'].every(f => valid(f, row[f])) || ![2, 3].includes(row.team_num) || row.is_alive !== true) return null;
    const others = [...(index.get(tick)?.values() ?? [])].filter(o => o.steamid !== id && o.team_num === row.team_num && o.is_alive === true && ['X', 'Y', 'Z'].every(f => valid(f, o[f])))
      .map(o => ({ steamId: o.steamid, distanceMapUnits: Math.hypot(o.X - row.X, o.Y - row.Y, o.Z - row.Z) })).sort((a, b) => a.distanceMapUnits - b.distanceMapUnits);
    return others[0] ?? null;
  };
  const snapshotAlive = tick => index.has(tick) ? Object.fromEntries([2, 3].map(team => [team, [...index.get(tick).values()].filter(r => r.team_num === team && r.is_alive === true).length])) : null;
  const describe = (round, e) => {
    const player = e.killer ?? e.attacker, opponent = e.victim;
    const r = match.rounds.find(r => r.number === round);
    const baseline = r.stateSnapshots?.find(s => s.boundary === 'freeze_end' && s.availability === 'observed');
    const alive = new Map(baseline?.players.map(p => [p.steamId, { side: p.side, alive: p.alive }]) ?? []);
    for (const k of r.events.filter(k => k.type === 'kill' && k.tick >= baseline?.tick && k.tick < e.tick)) if (alive.has(k.victim)) alive.get(k.victim).alive = false;
    const count = () => Object.fromEntries(['CT', 'T'].map(side => [side, [...alive.values()].filter(p => p.side === side && p.alive === true).length]));
    const before = baseline ? count() : null;
    for (const k of r.events.filter(k => k.type === 'kill' && k.tick === e.tick)) if (alive.has(k.victim)) alive.get(k.victim).alive = false;
    return { round, event: e, eventTick: e.tick, player: state(player, e.tick), opponent: state(opponent, e.tick),
      adjacent: [-2, -1, 1, ...(match.tickRate ? [Math.round(match.tickRate * 0.125)] : [])].map(o => ({ offsetTicks: o, player: state(player, e.tick + o), opponent: state(opponent, e.tick + o) })),
      nearestAliveTeammateEuclidean: { atTick: e.tick, player: distance(player, e.tick), opponent: distance(opponent, e.tick),
        beforeTick: e.tick - 1, playerBefore: distance(player, e.tick - 1), opponentBefore: distance(opponent, e.tick - 1) },
      aliveCounts: { source: 'freeze_end baseline + all deaths strictly before / at tick; same-tick deaths applied as a group', before, after: baseline ? count() : null,
        entityAtEventTick: snapshotAlive(e.tick), entityBeforeTick: snapshotAlive(e.tick - 1), entityAfterOffset: match.tickRate ? snapshotAlive(e.tick + Math.round(match.tickRate * 0.125)) : null } };
  };
  return Object.fromEntries(Object.entries(selected).map(([key, list]) => [key, list.map(s => ({ ...s, ...(s.event ? { evidence: describe(s.round, s.event) } : { evidence: s.events.map(e => describe(s.round, e)) }) }))]));
}

export async function probe(file, output) {
  const path = resolve(file), warnings = [];
  const timed = fn => { const start = performance.now(); const value = fn(); return { value, ms: performance.now() - start }; };
  const parser = new Demoparser2Provider(), baselineMs = [];
  let match;
  for (let i = 0; i < 3; i++) { global.gc?.(); const start = performance.now(); match = await parser.parse(path); baselineMs.push(performance.now() - start); }
  const ids = match.players.map(p => p.steamId); ids.forEach(id => assert.ok(checkId(id)));
  const bytes = await readFile(path), header = native.parseHeader(bytes);
  const eventsRun = timed(() => native.parseEvents(bytes, eventNames, ['team_num', 'is_alive'], ['total_rounds_played', 'is_warmup_period', 'game_time']));
  const eventCounts = Object.fromEntries(eventNames.map(name => [name, eventsRun.value.filter(e => e.event_name === name).length]));
  const domainEventCounts = {};
  for (const r of match.rounds) for (const e of r.events) domainEventCounts[e.type] = (domainEventCounts[e.type] ?? 0) + 1;
  const plans = { sparse: samplingPlan(match), history: samplingPlan(match, true) }, queries = {};
  let finalRows = [], sparseVelocity = new Map();
  for (const [name, plan] of Object.entries(plans)) {
    const ms = []; let rows = [];
    for (let i = 0; i < 3; i++) {
      global.gc?.(); const run = timed(() => plan.ticks.length ? native.parseTicks(bytes, required, plan.ticks) : []); ms.push(run.ms); rows = run.value;
    }
    const pairs = new Set(), wantedSet = new Set(plan.ticks);
    for (const row of rows) { assert.ok(numericTick(row.tick) && wantedSet.has(row.tick)); assert.ok(checkId(row.steamid)); const pair = `${row.tick}:${row.steamid}`; assert.ok(!pairs.has(pair), 'Duplicate tick/player row'); pairs.add(pair); }
    const returned = new Set(rows.map(r => r.tick));
    const missingPairs = plan.ticks.reduce((n, t) => n + ids.filter(id => !pairs.has(`${t}:${id}`)).length, 0);
    const base = [...new Set(Object.values(plan.groups).flat())].filter(t => wantedSet.has(t));
    const aliveRows = rows.filter(r => r.is_alive === true);
    queries[name] = { plan, ms, returnedRows: rows.length, returnedTicks: returned.size, missingTicks: plan.ticks.filter(t => !returned.has(t)),
      missingExpectedPlayerPairs: missingPairs, unexpectedPlayerIds: [...new Set(rows.map(r => r.steamid))].filter(id => !ids.includes(id)),
      fields: coverage(rows, required, plan.ticks, ids), baseFields: coverage(rows, required, plan.ticks, ids, base),
      aliveFields: Object.fromEntries(required.map(f => [f, { rowCount: aliveRows.length, nonNullCount: aliveRows.filter(r => r[f] != null).length, validCount: aliveRows.filter(r => valid(f, r[f])).length }])),
      byEventCategory: Object.fromEntries(Object.entries(plan.groups).map(([category, ticks]) => [category, { ticks: ticks.length,
        missingPlayerPairs: ticks.reduce((n, t) => n + ids.filter(id => !pairs.has(`${t}:${id}`)).length, 0) }])) };
    warnings.push(...plan.warnings);
    if (name === 'sparse') sparseVelocity = new Map(rows.map(r => [`${r.tick}:${r.steamid}`, [r.velocity_X, r.velocity_Y, r.velocity_Z]]));
    if (name === 'history') {
      finalRows = rows;
      let comparable = 0, differing = 0, maxAbsDifference = 0;
      const examples = [];
      for (const r of rows) {
        const prior = sparseVelocity.get(`${r.tick}:${r.steamid}`), current = [r.velocity_X, r.velocity_Y, r.velocity_Z];
        if (!prior?.every(Number.isFinite) || !current.every(Number.isFinite)) continue;
        comparable++;
        const delta = Math.max(...current.map((v, i) => Math.abs(v - prior[i])));
        if (delta > 0.001) { differing++; if (examples.length < 5) examples.push({ tick: r.tick, steamId: r.steamid, sparse: prior, history: current }); }
        maxAbsDifference = Math.max(maxAbsDifference, delta);
      }
      queries[name].velocityComparison = { comparable, differing, maxAbsDifference, examples, note: 'Same-tick cross-plan consistency only; not ground-truth speed validation' };
      const rowIndex = new Map(rows.map(r => [`${r.tick}:${r.steamid}`, r]));
      let comparablePositionPairs = 0, inconsistentPairs = 0, maxError = 0;
      let comparablePriorPairs = 0, inconsistentPriorPairs = 0, maxPriorError = 0;
      const baseSet = new Set(base);
      for (const r of rows.filter(r => baseSet.has(r.tick))) {
        const previous = rowIndex.get(`${r.tick - 1}:${r.steamid}`);
        if (!previous || !match.tickRate || !['X', 'Y', 'Z'].every(f => Number.isFinite(r[f]) && Number.isFinite(previous[f])) || ![r.velocity_X, r.velocity_Y, r.velocity_Z].every(Number.isFinite)) continue;
        comparablePositionPairs++;
        const error = Math.max(...['X', 'Y', 'Z'].map(axis => Math.abs(r[`velocity_${axis}`] - (r[axis] - previous[axis]) * match.tickRate)));
        if (error > 0.01) inconsistentPairs++;
        maxError = Math.max(maxError, error);
        const earlier = rowIndex.get(`${r.tick - 2}:${r.steamid}`);
        if (earlier && ['X', 'Y', 'Z'].every(f => Number.isFinite(earlier[f]))) {
          comparablePriorPairs++;
          const priorError = Math.max(...['X', 'Y', 'Z'].map(axis => Math.abs(r[`velocity_${axis}`] - (previous[axis] - earlier[axis]) * match.tickRate)));
          if (priorError > 0.01) inconsistentPriorPairs++;
          maxPriorError = Math.max(maxPriorError, priorError);
        }
      }
      queries[name].velocityPositionCrosscheck = { comparablePositionPairs, inconsistentPairs, maxError, tolerance: 0.01,
        note: 'Checks reported velocity against one-tick coordinate finite difference only; not ground-truth entity velocity' };
      queries[name].velocityPriorPositionCrosscheck = { comparablePriorPairs, inconsistentPriorPairs, maxPriorError, tolerance: 0.01,
        note: 'Hypothesis: velocity at t represents coordinate delta t-2 to t-1, not t-1 to t. Missing adjacent rows excluded; not ground-truth velocity.' };
    }
  }
  const optionalMs = {}, optionalCoverage = {}, unsupported = {};
  // Group queries first; a rejected optional property never breaks core evidence.
  const optionalGroups = [optional.slice(0, 8), optional.slice(8)];
  for (const fields of optionalGroups) {
    try {
      const run = timed(() => plans.history.ticks.length ? native.parseTicks(bytes, fields, plans.history.ticks) : []);
      optionalMs[fields[0]] = run.ms;
      Object.assign(optionalCoverage, coverage(run.value, fields, plans.history.ticks, ids));
      for (const f of fields) optionalCoverage[f].distinctValues = [...new Set(run.value.map(r => JSON.stringify(r[f])).filter(v => v !== undefined))].slice(0, 10);
      for (const f of fields.filter(f => ['usercmd_input_history', 'usercmd_subtick_moves'].includes(f))) {
        optionalCoverage[f].nonEmptyCount = run.value.filter(r => Array.isArray(r[f]) && r[f].length > 0).length;
      }
      if (fields.includes('FIRE')) optionalCoverage.FIRE.trueCount = run.value.filter(r => r.FIRE === true).length;
      if (fields.includes('FIRE')) {
        const byTickPlayer = new Map(run.value.map(r => [`${r.tick}:${r.steamid}`, r]));
        const fires = match.rounds.flatMap(r => r.events.filter(e => e.type === 'weapon_fire'));
        optionalCoverage.FIRE.weaponFireCrosscheck = { eventCount: fires.length, returned: 0, trueAtEvent: 0, falseAtEvent: 0, unknown: 0 };
        for (const e of fires) { const row = byTickPlayer.get(`${e.tick}:${e.shooter}`), c = optionalCoverage.FIRE.weaponFireCrosscheck; if (row) c.returned++; if (row?.FIRE === true) c.trueAtEvent++; else if (row?.FIRE === false) c.falseAtEvent++; else c.unknown++; }
      }
    } catch (error) {
      for (const field of fields) {
        try { const run = timed(() => plans.history.ticks.length ? native.parseTicks(bytes, [field], plans.history.ticks) : []); optionalMs[field] = run.ms; Object.assign(optionalCoverage, coverage(run.value, [field], plans.history.ticks, ids)); }
        catch (error) { unsupported[field] = String(error); }
      }
    }
  }
  const selected = samples(match);
  for (const [key, min] of [['singleKills', 3], ['multiKillRounds', 2], ['utility', 1], ['tradeLike', 1]]) if (selected[key].length < min) warnings.push(`${key}: found ${selected[key].length}/${min}`);
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const timing = Object.fromEntries(Object.entries(queries).map(([name, q]) => [name, { baselineMedianMs: median(baselineMs), sparseMedianMs: median(q.ms),
    projectedParserPlusQueryMs: median(baselineMs) + median(q.ms), addedQueryFraction: median(q.ms) / (median(baselineMs) + median(q.ms)), overheadVsBaseline: median(q.ms) / median(baselineMs) }]));
  const integrated = {};
  for (const [name, plan] of Object.entries(plans)) {
    global.gc?.(); const start = performance.now();
    await parser.parse(path); const parsed = performance.now();
    const queryBytes = await readFile(path); const read = performance.now();
    const rows = plan.ticks.length ? native.parseTicks(queryBytes, required, plan.ticks) : [];
    const done = performance.now();
    integrated[name] = { parserMs: parsed - start, extraReadMs: read - parsed, queryMs: done - read, totalMs: done - start,
      queryFraction: (done - read) / (done - start), returnedRows: rows.length,
      note: 'One measured sequential provider parse + extra file read + sparse query; excludes probe statistics/optional queries; not a production adapter modification' };
  }
  for (const [name, query] of Object.entries(queries)) {
    if (query.missingTicks.length) warnings.push(`${name}: ${query.missingTicks.length} requested neighbor/history ticks absent`);
    if (query.fields.velocity_X.validCount < query.returnedRows) warnings.push(`${name}: native velocity contains missing values; finite values are not accuracy proof`);
  }
  for (const [field, c] of Object.entries(optionalCoverage)) if (!c.nonNullCount) warnings.push(`${field}: optional evidence unavailable`);
  const result = { schema: 'P5.7.0-dev-probe-v1', file: path, bytes: (await stat(path)).size, sha256: match.id, header,
    map: match.map, tickRate: match.tickRate ?? null, rounds: match.rounds.length, players: match.players,
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, logicalCpus: cpus().length, ramBytes: totalmem(), nativeVersion: '0.42.0-backport.363.1', nativeBinding: native.getBindingProvenance() },
    eventCounts, domainEventCounts, baselineMs, parseEventsMs: eventsRun.ms, queries, timing, integrated, optionalMs, optionalCoverage, unsupported,
    peakMemory: null, memoryNote: 'Not measured: synchronous native calls block in-process RSS polling; no external high-water measurement. Endpoint RSS is not peak memory.',
    warnings, combatEvidence: evidence(match, finalRows, selected) };
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ file: path, output: resolve(output), map: result.map, tickRate: result.tickRate, rounds: result.rounds, players: ids.length, timing,
    queries: Object.fromEntries(Object.entries(queries).map(([name, q]) => [name, { ticks: q.plan.ticks.length, rows: q.returnedRows, missingPairs: q.missingExpectedPlayerPairs }])), warnings }, null, 2));
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node --expose-gc packages/dem-parser/dev/evidence-probe.mjs DEM OUTPUT.json');
  await probe(process.argv[2], process.argv[3]);
}
