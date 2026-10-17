export const point = (x = 100, y = 100, z = 0) => [x, y, z];
export const map = { id: 'synthetic', width: 1024, height: 1024, posX: 0, posY: 1024, scale: 1,
  resourceId: 'test', versionMatch: 'unconfirmed', layers: [{ id: 'default', minZ: null, maxZ: null }] };
export const sample = (playerId = '1', overrides = {}) => ({ playerId, actualTick: 8, position: point(),
  alive: true, side: 'CT', segment: 1, stateAmbiguous: false, yaw: null, health: 100, ...overrides });
export const kill = (tick = 8, killer = '1', victim = '2') => ({ type: 'kill', tick, killer, victim, killerSide: 'CT', victimSide: 'T' });
export function fixture(samples = [sample('1'), sample('2', { side: 'T' })], events = [kill()]) {
  const roster = [...new Set(samples.map(s => s.playerId))];
  const match = { id: 'test', map: 'synthetic', tickRate: 64, players: roster.map(steamId => ({ steamId })),
    rounds: [{ number: 1, winner: null, startTick: 0, freezeEndTick: 8, endTick: 24, events,
      stateSnapshots: [{ boundary: 'freeze_end', tick: 8, availability: 'observed', players: roster.map(steamId => ({ steamId, side: 'CT', participant: true, alive: true })) }] }] };
  const replay = { schemaVersion: 1, matchId: 'test', samplingVersion: 'test', source: 'native-final-tick-observation',
    tickRate: 64, hz: 8, maxInterpolationTicks: 8, players: roster, excludedRounds: [], rounds: [{ round: 1, startTick: 0, freezeEndTick: 8, endTick: 24,
      frames: [{ requestedTick: 8, players: samples }], events: events.map((event, eventIndex) => ({ event, eventIndex })), lifecycle: [], coverage: { status: 'complete' } }] };
  const spatial = { matchId: 'test', events: events.map((e, eventIndex) => ({ eventRef: { round: 1, type: e.type, tick: e.tick, eventIndex },
    participants: [{ role: 'actor', playerId: e.killer === 'world' ? null : e.killer }, { role: 'target', playerId: e.victim }],
    samples: ['actor', 'target'].filter(role => role !== 'actor' || e.killer !== 'world').map(role => ({ role,
      sample: { playerId: role === 'actor' ? e.killer : e.victim, relation: 'at-event', actualTick: e.tick, requestedTick: e.tick,
        position: role === 'actor' ? { x: 10, y: 1014, z: 0 } : { x: 900, y: 124, z: 0 }, side: role === 'actor' ? 'CT' : 'T' } })) })) };
  return { match, replay, spatial };
}
