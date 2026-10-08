import { analyzeEngagements, analyzeKillImpact, analyzeTeamplay } from "../dist/index.js";
export const CT = ["1", "2", "3", "4", "5"], T = ["6", "7", "8", "9", "10"];
const side = id => CT.includes(id) ? "CT" : T.includes(id) ? "T" : "Unknown";
export const kill = (tick = 100, killer = "6", victim = "2", extra = {}) => ({ type: "kill", tick, killer, victim,
  killerSide: side(killer), victimSide: side(victim), weapon: "ak47", ...extra });
export const damage = (tick = 100, attacker = "1", victim = "6", healthDamage = 20, extra = {}) => ({ type: "damage", tick,
  attacker, victim, attackerSide: side(attacker), victimSide: side(victim), weapon: "ak47", healthDamage,
  armorDamage: 0, healthRemaining: 80, armorRemaining: 0, ...extra });
export function match(events = [damage()]) {
  const players = [...CT, ...T].map(steamId => ({ steamId, side: side(steamId), participant: true, alive: true }));
  const snap = (boundary, tick) => ({ boundary, tick, availability: "observed", unidentifiedPlayerCount: 0, players: structuredClone(players) });
  const end = snap("end", 1000);
  for (const p of end.players) if (events.some(e => e.type === "kill" && e.victim === p.steamId && e.tick >= 0 && e.tick <= 1000)) p.alive = false;
  return { id: "teamplay-fixture", map: "synthetic", tickRate: 64,
    players: players.map(p => ({ steamId: p.steamId, name: "unused", team: p.side })),
    rounds: [{ number: 1, startTick: 0, freezeEndTick: 5, endTick: 1000, winner: "CT", events,
      stateSnapshots: [snap("start", 0), snap("freeze_end", 5), end], playerLifecycle: [] }] };
}
export const inputs = (m, s) => { const e = analyzeEngagements(m, s), k = analyzeKillImpact(m, e); return { e, k }; };
export const analyze = (m, s, options) => { const { e, k } = inputs(m, s); return analyzeTeamplay(m, e, k, s, options); };
export const peer = (r, id = "1", teammate = "2") => r.teammateDeathResponses.find(x => x.playerId === id && x.teammateId === teammate);
export const team = (r, id = "2") => r.playerDeathTeamResponses.find(x => x.playerId === id);
export const context = (r, id = "1") => r.playerEngagementContexts.find(x => x.playerId === id);
export function spatial(m, positions = {}) {
  return { matchId: m.id, provenance: { source: "demo-entity-state", parser: "demoparser2", tickPolicy: "exact-only" }, sampling: {},
    coverage: { status: "complete", reasons: [] }, events: m.rounds[0].events.map((e, eventIndex) => ({
      eventRef: { round: 1, type: e.type, tick: e.tick, eventIndex },
      participants: [{ role: "actor", playerId: e.type === "kill" ? e.killer : e.attacker }, { role: "target", playerId: e.victim }],
      coverage: { status: "complete", reasons: [] },
      samples: [...CT, ...T].map(id => ({ role: id === (e.killer ?? e.attacker) ? "actor" : id === e.victim ? "target" : "relevant",
        sample: { requestedTick: e.tick, actualTick: e.tick, relation: "at-event", playerId: id,
          position: positions[id] === undefined ? { x: Number(id) * 100, y: 0, z: 0 } : positions[id],
          view: { yaw: 0, pitch: 0 }, health: 100, alive: !m.rounds[0].events.some(k => k.type === "kill" && k.victim === id && k.tick <= e.tick),
          side: side(id), activeWeapon: "AK-47", coverage: { status: "complete", reasons: [] },
          fields: { position: positions[id] === null ? "unavailable" : "complete", state: "complete", view: "complete", weapon: "complete" } } })) })) };
}
