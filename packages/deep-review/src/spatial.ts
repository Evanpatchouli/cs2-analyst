import type { MatchSpatialEvidence, SpatialEvidence, SpatialSample } from "@cs2-analyst/match-model";
import type { ContactEventRef, ContactSpatialCoverage, ContactSpatialSample, EngagementContact, SpatialEnrichmentCoverage } from "./contracts.js";

export const contactRefKey = (ref: ContactEventRef): string => JSON.stringify([ref.round, ref.type, ref.tick, ref.eventIndex]);

export function createSpatialJoin(matchId: string, spatial?: MatchSpatialEvidence) {
  const byRef = new Map<string, SpatialEvidence[]>();
  if (spatial?.matchId === matchId) for (const evidence of spatial.events) {
    if (evidence.eventRef.type === "round_boundary") continue;
    const key = JSON.stringify([evidence.eventRef.round, evidence.eventRef.type, evidence.eventRef.tick, evidence.eventRef.eventIndex]);
    const entries = byRef.get(key) ?? [];
    entries.push(evidence);
    byRef.set(key, entries);
  }
  return (ref: ContactEventRef, actorId: string, targetId: string): ContactSpatialCoverage => {
    const entries = byRef.get(contactRefKey(ref));
    const empty: ContactSpatialCoverage = {
      evidencePresent: !!entries?.length,
      joinStatus: !spatial ? "not-provided" : spatial.matchId !== matchId ? "match-mismatch"
        : !entries?.length ? "missing" : entries.length > 1 ? "duplicate-ref" : "exact",
      evidenceCoverage: null, actorAtEvent: null, targetAtEvent: null,
      actorBeforeEvent: null, targetBeforeEvent: null,
    };
    if (empty.joinStatus !== "exact") return empty;
    const evidence = entries![0];
    if ([ ["actor", actorId], ["target", targetId] ].some(([role, id]) => {
      const participants = evidence.participants.filter(participant => participant.role === role);
      return participants.length !== 1 || participants[0].playerId !== id;
    })) return { ...empty, joinStatus: "participant-mismatch" };
    const sampleFor = (role: "actor" | "target", id: string, relation: "at-event" | "before-event"): ContactSpatialSample | null => {
      const samples = evidence.samples.filter(binding => binding.role === role && binding.sample.playerId === id && binding.sample.relation === relation);
      if (samples.length !== 1) return null;
      const sample: SpatialSample = samples[0].sample;
      if (relation === "at-event" ? sample.requestedTick !== ref.tick : sample.requestedTick >= ref.tick) return null;
      if (sample.actualTick !== null && sample.actualTick !== sample.requestedTick) return null;
      return { requestedTick: sample.requestedTick, actualTick: sample.actualTick,
        coverage: { status: sample.coverage.status, reasons: [...sample.coverage.reasons] }, fields: { ...sample.fields } };
    };
    return { ...empty, evidenceCoverage: { status: evidence.coverage.status, reasons: [...evidence.coverage.reasons] },
      actorAtEvent: sampleFor("actor", actorId, "at-event"), targetAtEvent: sampleFor("target", targetId, "at-event"),
      actorBeforeEvent: sampleFor("actor", actorId, "before-event"), targetBeforeEvent: sampleFor("target", targetId, "before-event") };
  };
}

export function summarizeSpatial(contacts: EngagementContact[]): SpatialEnrichmentCoverage {
  const complete = (sample: ContactSpatialSample | null) => sample !== null && sample.actualTick !== null && sample.coverage.status === "complete";
  const exactJoinedContacts = contacts.filter(contact => contact.spatialCoverage.joinStatus === "exact").length;
  const completeAtEventContacts = contacts.filter(({ spatialCoverage: s }) => complete(s.actorAtEvent) && complete(s.targetAtEvent)).length;
  const completeBeforeEventContacts = contacts.filter(({ spatialCoverage: s }) => complete(s.actorBeforeEvent) && complete(s.targetBeforeEvent)).length;
  const observed = contacts.some(({ spatialCoverage: s }) => [s.actorAtEvent, s.targetAtEvent, s.actorBeforeEvent, s.targetBeforeEvent].some(sample => sample?.actualTick != null));
  return { status: contacts.length > 0 && completeAtEventContacts === contacts.length && completeBeforeEventContacts === contacts.length
    ? "complete" : observed ? "partial" : "unavailable", contacts: contacts.length, exactJoinedContacts, completeAtEventContacts, completeBeforeEventContacts };
}
