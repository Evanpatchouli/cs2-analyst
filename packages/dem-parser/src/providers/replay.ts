import type { Match, MatchReplay, ReplayPlayerSample, ReplayRound } from '@cs2-analyst/match-model';

export const replayFields = ['X', 'Y', 'Z', 'yaw', 'health', 'is_alive', 'team_num'];
export const replaySamplingVersion = 'native-0.42.0-backport363-replay8-v1';
const validTick = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
export function planReplay(match: Match, maxTicks = 60_000) {
  if (!Number.isSafeInteger(maxTicks) || maxTicks < 0 || maxTicks > 60_000) throw new Error('Invalid replay tick budget');
  const playerCount=new Set(match.players.map(p=>p.steamId)).size;
  if(playerCount===0||playerCount>64)throw new Error('Replay player budget exceeded');
  const rate = match.tickRate;
  const step = rate !== undefined && Number.isSafeInteger(rate) && rate >= 8 && rate % 8 === 0 ? rate / 8 : null;
  const ticks = new Set<number>(), excludedRounds: number[] = [];
  const add = (tick: number) => {
    ticks.add(tick);
    if(ticks.size>maxTicks)throw new Error('Replay tick budget exceeded');
    if(ticks.size*playerCount>600_000)throw new Error('Replay player sample budget exceeded');
  };
  const rounds: { round: Match['rounds'][number]; ticks: number[] }[] = [];
  let previousEnd = -1;
  for (const round of match.rounds) {
    const start = round.startTick, end = round.endTick;
    if (!validTick(start) || !validTick(end) || end < start || start <= previousEnd) { excludedRounds.push(round.number); continue; }
    previousEnd = end;
    const wanted = new Set<number>([start, end]);
    if (validTick(round.freezeEndTick) && round.freezeEndTick >= start && round.freezeEndTick <= end) wanted.add(round.freezeEndTick);
    for (const e of [...round.events, ...(round.playerLifecycle ?? [])]) if (validTick(e.tick) && e.tick >= start && e.tick <= end) wanted.add(e.tick);
    if (step !== null) for (let tick = start; tick <= end; tick += step) { wanted.add(tick); add(tick); }
    for (const tick of wanted) add(tick);
    rounds.push({ round, ticks: [...wanted].sort((a, b) => a - b) });
  }
  return { step, ticks: [...ticks].sort((a, b) => a - b), rounds, excludedRounds };
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function buildReplay(match: Match, plan: ReturnType<typeof planReplay>, rawRows: unknown): MatchReplay {
  if (!Array.isArray(rawRows)) throw new Error('Replay rows are not an array');
  const ids = [...new Set(match.players.map(p => p.steamId))].sort();
  if (ids.length > 64) throw new Error('Replay player budget exceeded');
  const wanted = new Set(plan.ticks), rows = new Map<number, Map<string, Record<string, unknown>>>();
  for (const value of rawRows) {
    if (!value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>;
    if (!validTick(row.tick) || !wanted.has(row.tick) || typeof row.steamid !== 'string' || !ids.includes(row.steamid)) continue;
    let frame = rows.get(row.tick); if (!frame) { frame = new Map(); rows.set(row.tick, frame); }
    if (frame.has(row.steamid)) throw new Error('Duplicate replay player row');
    frame.set(row.steamid, row);
  }
  const rounds: ReplayRound[] = [];
  const disconnectedPlayers = new Set<string>(), counters = new Map<string, number>();
  // Connection evidence survives round boundaries, including the unsampled post-round gap.
  const allLife = match.rounds.flatMap(r => r.playerLifecycle ?? []).filter(e => validTick(e.tick)).sort((a,b) => a.tick-b.tick);
  let lifeCursor = 0;
  for (const entry of plan.rounds) {
    const { round, ticks } = entry, start = round.startTick!, end = round.endTick!;
    const events = round.events.map((event, eventIndex) => ({ eventIndex, event })).filter(({ event }) => event.tick >= start && event.tick <= end);
    const lifecycle = (round.playerLifecycle ?? []).filter(e => e.tick >= start && e.tick <= end);
    const killsAt = new Map<number, Set<string>>();
    for (const { event } of events) if (event.type === 'kill') { const group = killsAt.get(event.tick) ?? new Set<string>(); group.add(event.victim); killsAt.set(event.tick, group); }
    const previous = new Map<string, { tick: number; sample: ReplayPlayerSample }>();
    const deadPlayers = new Set<string>(); let missingPlayerSamples = 0;
    const frames = ticks.map(requestedTick => {
      const consumedLife: typeof lifecycle = [];
      while (lifeCursor < allLife.length && allLife[lifeCursor].tick <= requestedTick) consumedLife.push(allLife[lifeCursor++]);
      // Resolve different ticks chronologically, same-tick transitions atomically.
      for (const tick of [...new Set(consumedLife.map(e => e.tick))]) for (const id of ids) {
        const group = consumedLife.filter(e => e.tick === tick && (e.player === id || e.player === null));
        const disconnected = group.some(e => e.type === 'disconnect' || (e.type === 'side_change' && e.disconnect));
        const spawned = group.some(e => e.type === 'spawn' && e.player === id);
        if (disconnected) disconnectedPlayers.add(id);
        else if (spawned) { disconnectedPlayers.delete(id); deadPlayers.delete(id); }
      }
      return { requestedTick, players: ids.map(playerId => {
      const row = rows.get(requestedTick)?.get(playerId);
      let position: [number, number, number] | null = row && finite(row.X) && finite(row.Y) && finite(row.Z) ? [row.X, row.Y, row.Z] : null;
      const yaw = row && finite(row.yaw) && Math.abs(row.yaw) <= 360 ? row.yaw : null;
      const health = row && finite(row.health) && Number.isSafeInteger(row.health) && row.health >= 0 ? row.health : null;
      const side = row?.team_num === 2 ? 'T' : row?.team_num === 3 ? 'CT' : 'Unknown';
      const atLife = consumedLife.filter(e => e.player === playerId || e.player === null);
      const atTickLife = atLife.filter(e => e.tick === requestedTick);
      const killed = killsAt.get(requestedTick)?.has(playerId) ?? false;
      const disconnectEvent = atTickLife.some(e => e.type === 'disconnect' || (e.type === 'side_change' && e.disconnect));
      const spawnEvent = atTickLife.some(e => e.type === 'spawn' && e.player === playerId);
      if (killed) deadPlayers.add(playerId);
      const disconnected = disconnectedPlayers.has(playerId);
      const stateAmbiguous = (killed && spawnEvent) || (deadPlayers.has(playerId) && row?.is_alive === true) || (spawnEvent && disconnectEvent);
      if (disconnected) position = null; // Native stale Pawn rows cannot reconnect a player.
      const alive = !disconnected && !stateAmbiguous && typeof row?.is_alive === 'boolean' ? row.is_alive : null;
      const prior = previous.get(playerId);
      // Every lifecycle/death tick is in the plan, including unavailable frames; never skip a barrier.
      const barrier = atLife.length > 0 || killed;
      const interpolable = !!row && !!position && alive === true && side !== 'Unknown' && !stateAmbiguous;
      let segment: number | null = null;
      if (interpolable) {
        if (!prior || prior.sample.segment === null || prior.sample.side !== side || barrier || plan.step === null || requestedTick - prior.tick > plan.step) counters.set(playerId, (counters.get(playerId) ?? 0) + 1);
        segment = counters.get(playerId) ?? 1;
      }
      const sample: ReplayPlayerSample = { playerId, actualTick: row ? requestedTick : null, position, yaw,
        health: stateAmbiguous || disconnected ? null : health, alive, side, segment, stateAmbiguous };
      if (!row || !position || yaw === null || alive === null || health === null || side === 'Unknown') missingPlayerSamples++;
      previous.set(playerId, { tick: requestedTick, sample }); return sample;
      }) };
    });
    rounds.push({ round: round.number, startTick: start, endTick: end, freezeEndTick: round.freezeEndTick ?? null,
      frames, events, lifecycle, coverage: { requestedFrames: frames.length, missingPlayerSamples, status: missingPlayerSamples ? 'partial' : 'complete' } });
  }
  return { schemaVersion: 1, matchId: match.id, source: 'native-final-tick-observation', samplingVersion: replaySamplingVersion,
    tickRate: plan.step === null ? null : match.tickRate!, hz: 8, maxInterpolationTicks: plan.step, players: ids, rounds, excludedRounds: plan.excludedRounds };
}
