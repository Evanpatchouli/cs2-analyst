import type { KillEvent, Round } from "@cs2-analyst/match-model";
import type { AliveCounts, ImpactCoverage, ImpactReason, ImpactSide, KillImpactTag, RoundAliveState, SideAliveCounts } from "./impact-contracts.js";

export const isImpactId = (id: string | null): id is string => typeof id === "string" && /^[1-9]\d*$/.test(id);
export const isImpactSide = (side: unknown): side is ImpactSide => side === "CT" || side === "T";
export const isImpactTick = (tick: number | undefined): tick is number => Number.isSafeInteger(tick) && tick! >= 0;
export const hasRoundWindow = (round: Round): boolean => isImpactTick(round.startTick) && isImpactTick(round.endTick) && round.startTick <= round.endTick;
export const perspective = (counts: SideAliveCounts, side: ImpactSide): AliveCounts => ({ teamAlive: counts[side], enemyAlive: counts[side === "CT" ? "T" : "CT"] });
export function transitionTags(before: AliveCounts, after: AliveCounts): KillImpactTag[] {
  const tags: KillImpactTag[] = [], oldGap = before.teamAlive - before.enemyAlive, newGap = after.teamAlive - after.enemyAlive;
  if (oldGap === -1 && newGap === 0) tags.push("equalizer");
  if (oldGap === 0 && newGap > 0) tags.push("advantage-gain");
  if (oldGap <= -2 && newGap < 0 && newGap > oldGap) tags.push("deficit-reduction");
  if (oldGap > 0 && newGap > oldGap) tags.push("advantage-extension");
  if (before.enemyAlive > 0 && after.enemyAlive === 0) tags.push("enemy-eliminated");
  return tags;
}
export function impactCoverage(reasons: Iterable<ImpactReason>, unavailable = false): ImpactCoverage {
  const sorted = [...new Set(reasons)].sort();
  return { status: unavailable ? "unavailable" : sorted.length ? "partial" : "complete", reasons: sorted };
}
export function deathsInWindow(round: Round): { event: KillEvent; eventIndex: number }[] {
  if (!hasRoundWindow(round)) return [];
  return round.events.flatMap((event, eventIndex) => event.type === "kill" && isImpactTick(event.tick)
    && event.tick >= round.startTick! && event.tick <= round.endTick! ? [{ event, eventIndex }] : [])
    .sort((a, b) => a.event.tick - b.event.tick || a.eventIndex - b.eventIndex);
}

/** Independent Deep Review resolver. No P3 imports, subtick order or inferred respawns. */
export function resolveRoundAliveState(round: Round): RoundAliveState {
  const reasons = new Set<ImpactReason>();
  let rejected = false;
  const reject = (reason: ImpactReason) => { reasons.add(reason); rejected = true; };
  if (!hasRoundWindow(round)) reject("round-window-unavailable");
  const select = (boundary: "freeze_end" | "start", tick: number | undefined) => {
    const snapshots = (round.stateSnapshots ?? []).filter(s => s.boundary === boundary && s.availability === "observed"
      && isImpactTick(tick) && s.tick === tick && hasRoundWindow(round) && s.tick >= round.startTick! && s.tick <= round.endTick!);
    return snapshots.length === 1 ? snapshots[0] : null;
  };
  const freeze = select("freeze_end", round.freezeEndTick);
  const baseline = freeze ?? select("start", round.startTick);
  if (!baseline) reject("baseline-unavailable");
  else if (!freeze) reasons.add("baseline-fallback-start");
  const players: RoundAliveState["players"] = [];
  const seen = new Set<string>();
  if (baseline) {
    if (!Number.isSafeInteger(baseline.unidentifiedPlayerCount) || baseline.unidentifiedPlayerCount !== 0) reject("roster-unidentified");
    for (const row of baseline.players) {
      if (!isImpactId(row.steamId)) { reject("roster-unidentified"); continue; }
      if (seen.has(row.steamId)) { reject("participant-state-unknown"); continue; }
      seen.add(row.steamId);
      if (row.participant === false) continue;
      if (row.participant !== true || typeof row.alive !== "boolean") { reject("participant-state-unknown"); continue; }
      if (!isImpactSide(row.side)) { reject("side-unknown"); continue; }
      players.push({ playerId: row.steamId, side: row.side, aliveAtBaseline: row.alive, deathTick: null });
    }
    if (!players.length) reject("participant-state-unknown");
    for (const event of round.playerLifecycle ?? []) {
      if (!isImpactTick(event.tick)) { reject("lifecycle-anomaly"); continue; }
      if (event.tick > baseline.tick && event.tick <= round.endTick!) reject("lifecycle-anomaly");
    }
  }
  players.sort((a, b) => a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);
  const states = new Map(players.map(p => [p.playerId, p]));
  const deaths = deathsInWindow(round);
  if (round.events.some(e => e.type === "kill" && !isImpactTick(e.tick))) reject("invalid-event-tick");
  const counts = new Map<string, number>();
  for (const { event } of deaths) {
    counts.set(event.victim, (counts.get(event.victim) ?? 0) + 1);
    const victim = states.get(event.victim);
    if (!isImpactId(event.victim)) reject("victim-unidentified");
    if (!victim) reject("participant-state-unknown");
    if (victim && (victim.aliveAtBaseline !== true || (baseline && event.tick <= baseline.tick))) reject("death-baseline-conflict");
    if (!isImpactSide(event.victimSide)) reject("side-unknown");
    else if (victim && victim.side !== event.victimSide) reject("side-unknown");
    // A known player outside the participant roster reveals a roster gap. Unlike
    // missing killer attribution/side, this makes the total alive count unknown.
    if (baseline && isImpactId(event.killer) && !states.has(event.killer)) reject("participant-state-unknown");
    if (victim && victim.deathTick === null) victim.deathTick = event.tick;
  }
  if ([...counts.values()].some(n => n > 1)) reject("duplicate-death");
  const endSnapshots = (round.stateSnapshots ?? []).filter(s => s.boundary === "end" && s.availability === "observed" && s.tick === round.endTick);
  const end = endSnapshots.length === 1 ? endSnapshots[0] : null;
  if (!end) reasons.add("end-state-unavailable");
  else {
    if (end.unidentifiedPlayerCount !== 0) reasons.add("end-state-unavailable");
    for (const player of players) {
      const rows = end.players.filter(p => p.steamId === player.playerId);
      if (rows.length !== 1 || typeof rows[0].alive !== "boolean" || rows[0].participant !== true) { reasons.add("end-state-unavailable"); continue; }
      if (rows[0].side !== player.side || rows[0].alive !== (player.aliveAtBaseline && player.deathTick === null)) reject("end-state-conflict");
    }
    if (end.players.some(p => p.participant === true && !states.has(p.steamId))) reject("end-state-conflict");
  }
  const alive = new Set(players.filter(p => p.aliveAtBaseline).map(p => p.playerId));
  const currentCounts = (): SideAliveCounts => ({ CT: players.filter(p => p.side === "CT" && alive.has(p.playerId)).length,
    T: players.filter(p => p.side === "T" && alive.has(p.playerId)).length });
  const groups: RoundAliveState["groups"] = [];
  for (let i = 0; i < deaths.length;) {
    const tick = deaths[i].event.tick, rows = [];
    while (i < deaths.length && deaths[i].event.tick === tick) rows.push(deaths[i++]);
    const before = rejected ? null : currentCounts();
    const victims = rejected ? [] : [...new Set(rows.map(r => r.event.victim))].sort();
    for (const id of victims) alive.delete(id);
    const after = rejected ? null : currentCounts();
    groups.push({ round: round.number, tick, deathRefs: rows.map(r => ({ round: round.number, type: "kill", tick, eventIndex: r.eventIndex })),
      appliedVictimIds: victims, before, after, tags: { CT: before && after ? transitionTags(perspective(before, "CT"), perspective(after, "CT")) : [],
        T: before && after ? transitionTags(perspective(before, "T"), perspective(after, "T")) : [] } });
  }
  return { round: round.number, baseline: baseline ? { boundary: freeze ? "freeze_end" : "start", tick: baseline.tick } : null,
    players, groups, coverage: impactCoverage(reasons, rejected) };
}
