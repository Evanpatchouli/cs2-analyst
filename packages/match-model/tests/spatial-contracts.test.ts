import type { Match, MatchSpatialEvidence, SpatialEvidence, SpatialSample } from "../src/index.js";

const sample: SpatialSample = {
  requestedTick: 100, actualTick: null, relation: "before-event", playerId: "76561198000000001",
  position: null, view: null, health: null, alive: null, side: "Unknown", activeWeapon: null,
  coverage: { status: "unavailable", reasons: ["requested-tick-missing"] },
  fields: { position: "unavailable", view: "unavailable", state: "unavailable", weapon: "unavailable" },
};
const evidence: SpatialEvidence = {
  eventRef: { round: 12, type: "kill", tick: 108, eventIndex: 3 },
  participants: [{ role: "actor", playerId: sample.playerId }],
  samples: [{ role: "actor", sample }], coverage: sample.coverage,
};
const spatial: MatchSpatialEvidence = {
  matchId: "hash", provenance: { source: "demo-entity-state", parser: "demoparser2", tickPolicy: "exact-only" },
  sampling: { tickBudget: 1, contextOffsetTicks: 8, coreTicks: [108], optionalTicks: [], omittedOptionalTicks: [100], returnedTicks: [], rowCount: 0 },
  events: [evidence], coverage: evidence.coverage,
};
// @ts-expect-error SteamID never becomes a JS number.
const numericId: SpatialSample["playerId"] = 76561198000000001;
// @ts-expect-error An event relation must be explicit.
const guessedRelation: SpatialSample["relation"] = "pre-death-aim";
// @ts-expect-error Native velocity is not part of the spatial foundation.
const velocity: SpatialSample["velocity"] = { x: 0, y: 0, z: 0 };
// @ts-expect-error Match remains source compatible and spatial is a separate domain result.
const injected: Match["spatial"] = spatial;
// @ts-expect-error Round event references require the stable local index.
const missingOrdinal: SpatialEvidence["eventRef"] = { round: 1, type: "kill", tick: 1 };
void [spatial, numericId, guessedRelation, velocity, injected, missingOrdinal];
