import type {
  Match, MatchEvent, MatchSpatialEvidence, SpatialCoverage, SpatialCoverageReason,
  SpatialEvidence, SpatialEventRef, SpatialRelation, SpatialSample,
} from "@cs2-analyst/match-model";
import type { SpatialSamplingOptions } from "../spatial.js";

export const spatialFields = ["X", "Y", "Z", "yaw", "pitch", "health", "is_alive", "team_num", "active_weapon_name"];

type Request = { tick: number; relation: SpatialRelation; omitted?: SpatialCoverageReason };
type Entry = {
  ref: SpatialEventRef;
  participants: { role: "actor" | "target"; id: string | null }[];
  requests: Request[];
};
export interface SpatialPlan {
  tickBudget: number;
  contextOffsetTicks: number | null;
  coreTicks: number[];
  optionalTicks: number[];
  omittedOptionalTicks: number[];
  entries: Entry[];
  contextUnknown: boolean;
}

function identity(id: string | null | undefined): string | null {
  return typeof id === "string" && /^[1-9]\d*$/.test(id) ? id : null;
}

function participants(event: MatchEvent): Entry["participants"] {
  switch (event.type) {
    case "kill": return [{ role: "actor", id: identity(event.killer) }, { role: "target", id: identity(event.victim) }];
    case "damage": case "flash": return [{ role: "actor", id: identity(event.attacker) }, { role: "target", id: identity(event.victim) }];
    case "weapon_fire": return [{ role: "actor", id: identity(event.shooter) }];
    case "utility": return [{ role: "actor", id: identity(event.thrower) }];
    case "bomb": return [{ role: "actor", id: identity(event.player) }];
  }
}

export function planSpatialSampling(match: Match, options: SpatialSamplingOptions = {}): SpatialPlan {
  const tickBudget = options.tickBudget ?? 24000;
  const seconds = options.contextSeconds ?? 0.125;
  if (!Number.isSafeInteger(tickBudget) || tickBudget < 0) throw new Error("tickBudget must be a non-negative safe integer");
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error("contextSeconds must be finite and non-negative");
  const rate = match.tickRate;
  const contextOffsetTicks = seconds === 0 ? 0 : typeof rate === "number" && Number.isFinite(rate) && rate > 0
    ? Math.max(1, Math.round(seconds * rate)) : null;
  if (contextOffsetTicks !== null && !Number.isSafeInteger(contextOffsetTicks)) throw new Error("context offset is too large");
  const core = new Set<number>();
  const optional = new Set<number>();
  const entries: Entry[] = [];
  for (const round of match.rounds) {
    for (const [boundary, tick] of [["start", round.startTick], ["freeze_end", round.freezeEndTick], ["end", round.endTick]] as const) {
      if (tick === undefined) continue;
      core.add(tick);
      entries.push({ ref: { round: round.number, type: "round_boundary", tick, boundary }, participants: [], requests: [{ tick, relation: "boundary" }] });
    }
    round.events.forEach((event, eventIndex) => {
      core.add(event.tick);
      const entry: Entry = {
        ref: { round: round.number, type: event.type, tick: event.tick, eventIndex },
        participants: participants(event), requests: [{ tick: event.tick, relation: "at-event" }],
      };
      if (["kill", "damage", "weapon_fire"].includes(event.type) && contextOffsetTicks !== null && contextOffsetTicks > 0) {
        for (const [direction, relation] of [[-1, "before-event"], [1, "after-event"]] as const) {
          const tick = event.tick + direction * contextOffsetTicks;
          const outside = !Number.isSafeInteger(tick) || tick < 0 || round.startTick === undefined || round.endTick === undefined
            || tick < round.startTick || tick > round.endTick;
          entry.requests.push({ tick, relation, ...(outside ? { omitted: "context-outside-round" as const } : {}) });
          if (!outside) optional.add(tick);
        }
      }
      entries.push(entry);
    });
  }
  const coreTicks = [...core].sort((a, b) => a - b);
  const optionalCandidates = [...optional].filter(tick => !core.has(tick)).sort((a, b) => a - b);
  // Budget applies only to optional unique ticks. A small budget never removes core.
  const capacity = Math.max(0, tickBudget - coreTicks.length);
  const optionalTicks = optionalCandidates.slice(0, capacity);
  const omittedOptionalTicks = optionalCandidates.slice(capacity);
  const omitted = new Set(omittedOptionalTicks);
  for (const entry of entries) for (const request of entry.requests) {
    if (!request.omitted && omitted.has(request.tick)) request.omitted = "sample-budget-truncated";
  }
  return { tickBudget, contextOffsetTicks, coreTicks, optionalTicks, omittedOptionalTicks, entries, contextUnknown: contextOffsetTicks === null };
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function coverage(samples: SpatialSample[], extra: SpatialCoverageReason[] = []): SpatialCoverage {
  const reasons = [...new Set([...extra, ...samples.flatMap(sample => sample.coverage.reasons)])];
  const usable = samples.some(sample => sample.coverage.status !== "unavailable");
  const complete = samples.length > 0 && samples.every(sample => sample.coverage.status === "complete")
    && extra.length === 0;
  return { status: complete ? "complete" : usable ? "partial" : "unavailable", reasons };
}

export function buildSpatialEvidence(match: Match, plan: SpatialPlan, rawRows: unknown, failed = false): MatchSpatialEvidence {
  if (!Array.isArray(rawRows)) throw new Error("Spatial rows must be an array");
  const rows = new Map<number, Map<string, Record<string, unknown>>>();
  const returnedTicks = new Set<number>();
  for (const value of rawRows) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    if (typeof row.tick !== "number" || !Number.isSafeInteger(row.tick) || row.tick < 0) continue;
    returnedTicks.add(row.tick);
    const id = identity(typeof row.steamid === "string" ? row.steamid : null);
    if (!id) continue;
    let players = rows.get(row.tick);
    if (!players) { players = new Map(); rows.set(row.tick, players); }
    if (players.has(id)) throw new Error("Duplicate spatial player row at the same tick");
    players.set(id, row);
  }
  const playerIds = [...new Set(match.players.map(player => player.steamId))].sort();
  // Share immutable observations across events; relation remains explicit at every use.
  const cache = new Map<string, SpatialSample>();
  function sample(request: Request, playerId: string): SpatialSample {
    const key = `${request.tick}:${request.relation}:${request.omitted ?? ""}:${playerId}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const row = request.omitted || failed ? undefined : rows.get(request.tick)?.get(playerId);
    const reasons: SpatialCoverageReason[] = [];
    if (request.omitted) reasons.push(request.omitted);
    else if (failed) reasons.push("sampling-failed");
    else if (!returnedTicks.has(request.tick)) reasons.push("requested-tick-missing");
    else if (!row) reasons.push("player-row-missing");
    const x = finite(row?.X), y = finite(row?.Y), z = finite(row?.Z);
    const yaw = finite(row?.yaw), pitch = finite(row?.pitch);
    const position = x !== null && y !== null && z !== null ? { x, y, z } : null;
    const view = yaw !== null && yaw >= -180 && yaw <= 180 && pitch !== null && pitch >= -90 && pitch <= 90 ? { yaw, pitch } : null;
    const hp = finite(row?.health);
    const health = hp !== null && Number.isSafeInteger(hp) && hp >= 0 ? hp : null;
    const alive = typeof row?.is_alive === "boolean" ? row.is_alive : null;
    const team = row?.team_num;
    const teamKnown = typeof team === "number" && Number.isInteger(team) && team >= 0 && team <= 3;
    const side = team === 2 ? "T" : team === 3 ? "CT" : "Unknown";
    const activeWeapon = typeof row?.active_weapon_name === "string" && row.active_weapon_name.trim() ? row.active_weapon_name : null;
    if (!position) reasons.push("position-missing");
    if (!view) reasons.push("view-missing");
    if (health === null || alive === null || !teamKnown) reasons.push("state-missing");
    if (activeWeapon === null) reasons.push("weapon-unavailable");
    const stateCount = Number(health !== null) + Number(alive !== null) + Number(teamKnown);
    const status = position && view && stateCount === 3 ? "complete"
      : position || view || stateCount > 0 ? "partial" : "unavailable";
    const result: SpatialSample = {
      requestedTick: request.tick, actualTick: row ? request.tick : null, relation: request.relation,
      playerId, position, view, health, alive, side, activeWeapon,
      coverage: { status, reasons },
      fields: { position: position ? "complete" : "unavailable", view: view ? "complete" : "unavailable",
        state: stateCount === 3 ? "complete" : stateCount > 0 ? "partial" : "unavailable", weapon: activeWeapon ? "complete" : "unavailable" },
    };
    cache.set(key, result);
    return result;
  }
  const events: SpatialEvidence[] = plan.entries.map(entry => {
    const roles: { role: "actor" | "target" | "relevant"; id: string }[] = entry.participants
      .filter((player): player is { role: "actor" | "target"; id: string } => player.id !== null);
    const primaryIds = new Set(roles.map(player => player.id));
    for (const id of playerIds) if (!primaryIds.has(id)) roles.push({ role: "relevant", id });
    const samples = entry.requests.flatMap(request => roles.map(player => ({ role: player.role, sample: sample(request, player.id) })));
    const extra: SpatialCoverageReason[] = [];
    if (entry.participants.some(player => player.id === null)) extra.push("participant-unidentified");
    if (plan.contextUnknown && ["kill", "damage", "weapon_fire"].includes(entry.ref.type)) extra.push("tick-rate-unknown");
    return { eventRef: entry.ref, participants: entry.participants.map(player => ({ role: player.role, playerId: player.id })),
      samples, coverage: coverage(samples.map(binding => binding.sample), extra) };
  });
  const extra: SpatialCoverageReason[] = [];
  if (plan.omittedOptionalTicks.length) extra.push("sample-budget-truncated");
  if (plan.contextUnknown) extra.push("tick-rate-unknown");
  if (failed) extra.push("sampling-failed");
  return {
    matchId: match.id, provenance: { source: "demo-entity-state", parser: "demoparser2", tickPolicy: "exact-only" },
    sampling: { tickBudget: plan.tickBudget, contextOffsetTicks: plan.contextOffsetTicks, coreTicks: plan.coreTicks,
      optionalTicks: plan.optionalTicks, omittedOptionalTicks: plan.omittedOptionalTicks,
      returnedTicks: [...returnedTicks].sort((a, b) => a - b), rowCount: rawRows.length },
    events, coverage: coverage(events.flatMap(event => event.samples.map(binding => binding.sample)), extra.concat(
      events.some(event => event.coverage.reasons.includes("participant-unidentified")) ? ["participant-unidentified"] : [],
    )),
  };
}
