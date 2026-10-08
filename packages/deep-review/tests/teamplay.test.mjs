import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTeamplay } from "../dist/index.js";
import { analyze, context, damage, inputs, kill, match, peer, spatial, team } from "./teamplay-fixture.mjs";

test("unique first is direct contact, including receiving damage", () => {
  const r = analyze(match([damage(100, "6", "1"), damage(130, "2", "6")]));
  const c = context(r); assert.equal(c.firstSideContactRole, "unique-first");
  assert.equal(c.damageContactsReceived, 1); assert.equal(c.reportedDamageReceived, 20);
  assert.equal(c.firstOtherTeammateContactTick, 130); assert.equal(c.teammateJoinDelaySeconds, 30 / 64);
});
test("shared same-tick first forms an atomic tier with zero join delay", () => {
  const r = analyze(match([damage(100), damage(100, "2", "6"), damage(130, "3", "6")]));
  for (const id of ["1", "2"]) { const c = context(r, id); assert.equal(c.firstSideContactRole, "shared-first"); assert.equal(c.teammateJoinDelaySeconds, 0); }
  assert.deepEqual(context(r).sideContactTiers, [{ tick: 100, playerIds: ["1", "2"] }, { tick: 130, playerIds: ["3"] }]);
});
test("later participant and exact first reference", () => {
  const c = context(analyze(match([damage(130, "2", "6"), damage(100)])), "2");
  assert.equal(c.firstSideContactRole, "later"); assert.equal(c.teammateJoinDelaySeconds, null);
  assert.deepEqual(c.firstContactRef, { round: 1, type: "damage", tick: 130, eventIndex: 0 });
});
test("only confirmed side participant does not claim nearby roster membership", () => {
  const c = context(analyze(match())); assert.equal(c.onlyConfirmedSideParticipant, true);
  assert.deepEqual(c.sideParticipantIds, ["1"]); assert.deepEqual(c.enemyParticipantIds, ["6"]);
  assert.equal(c.otherSideContactObserved, false); assert.equal(c.firstOtherTeammateContactTick, null); assert.equal(c.teammateJoinDelaySeconds, null);
});
test("contact aggregates keep reported damage and kill rows distinct", () => {
  const c = context(analyze(match([damage(100, "1", "6", 120), damage(120, "6", "1", 30), kill(140, "1", "6")])));
  assert.equal(c.contactCount, 3); assert.equal(c.reportedDamageDealt, 120); assert.equal(c.reportedDamageReceived, 30);
  assert.equal(c.damageContactsDealt, 1); assert.equal(c.kills, 1); assert.equal(c.deaths, 0);
});
test("teammate death then player kill follows strictly later, with first damage and decisive kill refs", () => {
  const m = match([kill(), damage(120), kill(140, "1", "6")]), r = analyze(m), p = peer(r);
  assert.equal(p.playerAliveAtDeath, true); assert.equal(p.killerState, "alive-after-death"); assert.equal(p.outcome, "kill");
  assert.equal(p.firstFollowUpRef.tick, 120); assert.equal(p.outcomeRef.tick, 140); assert.equal(p.delaySeconds, 20 / 64);
  assert.equal(p.reportedDamage, 20); assert.equal(p.sameEngagement, true);
  assert.deepEqual(p.before, { teamAlive: 5, enemyAlive: 5 }); assert.deepEqual(p.afterAtomicGroup, { teamAlive: 4, enemyAlive: 5 });
});
test("teammate death then damage-only response", () => {
  const p = peer(analyze(match([kill(), damage(140)]))); assert.equal(p.outcome, "damage"); assert.equal(p.delaySeconds, 40 / 64);
});
test("none observed is only an absence of direct contacts to the same killer", () => {
  const p = peer(analyze(match([kill(), damage(130, "1", "7"), damage(140, "6", "1")])));
  assert.equal(p.outcome, "none-observed"); assert.equal(p.firstFollowUpRef, null); assert.equal(p.reportedDamage, 0);
});
test("outside 5s excluded, inclusive endpoint allowed, options configurable", () => {
  assert.equal(peer(analyze(match([kill(), damage(421)]))).outcome, "none-observed");
  assert.equal(peer(analyze(match([kill(), damage(420)]))).outcome, "damage");
  assert.equal(peer(analyze(match([kill(), damage(421)]), undefined, { followUpWindowSeconds: 6 })).outcome, "damage");
  for (const value of [0, -1, NaN, Infinity, null, "5"]) assert.throws(() => analyze(match(), undefined, { followUpWindowSeconds: value }), RangeError);
});
test("same-tick contact never becomes a causal zero-second response", () => {
  const r = analyze(match([kill(), damage(100)]));
  for (const x of [peer(r), team(r)]) { assert.equal(x.outcome, "same-tick-ambiguous"); assert.equal(x.delaySeconds, null); assert.equal(x.sameTickContactRefs.length, 1); }
  assert.equal(peer(r).firstFollowUpRef, null); assert.equal(team(r).firstResponseRef, null);
});
test("same tick plus a later response preserves both refs without ordering the same-tick contact", () => {
  const p = peer(analyze(match([kill(), damage(100), damage(130)])));
  assert.equal(p.outcome, "damage"); assert.equal(p.firstFollowUpRef.tick, 130);
  assert.ok(p.coverage.followUpTiming.reasons.includes("same-tick-response-ambiguous"));
});
test("player dead before teammate death is unavailable", () => {
  const p = peer(analyze(match([kill(90, "7", "1"), kill()])));
  assert.equal(p.playerAliveAtDeath, false); assert.equal(p.outcome, "unavailable");
});
test("posthumous killer dead-before never creates negative response evidence in either direction", () => {
  const r = analyze(match([kill(90, "3", "6"), kill(100, "6", "2", { weapon: "hegrenade" })]));
  for (const x of [peer(r), team(r)]) { assert.equal(x.killerState, "dead-before"); assert.equal(x.outcome, "unavailable"); assert.ok(x.coverage.followUpTiming.reasons.includes("killer-dead-before")); }
});
test("killer death in origin tick is atomic and unavailable in either direction", () => {
  const r = analyze(match([kill(), kill(100, "3", "6")]));
  for (const x of [peer(r), team(r)]) { assert.equal(x.killerState, "dies-same-tick"); assert.equal(x.outcome, "unavailable"); }
});
for (const [name, contacts, outcome] of [["kill", [kill(140, "1", "6")], "kill"], ["damage", [damage(140)], "damage"], ["none", [], "none-observed"]])
  test(`player death team ${name} response and death context`, () => {
    const r = analyze(match([kill(), ...contacts])), t = team(r), c = r.playerDeathContexts.find(c => c.playerId === "2");
    assert.equal(t.outcome, outcome); assert.equal(t.confirmedAliveTeammates, 4); assert.deepEqual(c.teamResponse, t);
    assert.equal(t.firstResponderId, contacts.length ? "1" : null); assert.equal(c.sideParticipantCount, contacts.length ? 2 : 1);
  });
test("multiple responders choose earliest tick, SteamID string tie; outcome may be later other player's kill", () => {
  const t = team(analyze(match([kill(), damage(140, "3", "6"), damage(140), kill(160, "4", "6")])));
  assert.equal(t.firstResponderId, "1"); assert.equal(t.firstResponseRef.eventIndex, 2); assert.equal(t.outcome, "kill"); assert.equal(t.outcomePlayerId, "4");
});
test("unknown clock preserves supplied participation; does not guess 64", () => {
  for (const tickRate of [undefined, NaN, Infinity, 0, -1, Number.MIN_VALUE]) {
    const m = match([kill(), damage(130)]), { e, k } = inputs(m); m.tickRate = tickRate;
    const r = analyzeTeamplay(m, e, k); assert.ok(r.playerEngagementContexts.length > 0);
    assert.equal(peer(r).outcome, "unavailable"); assert.equal(peer(r).delaySeconds, null); assert.equal(context(r).teammateJoinDelaySeconds, null);
    assert.equal(r.coverage.followUpTiming.status, "unavailable");
  }
});
test("missing Engagement preserves death state but timing and participation unavailable", () => {
  const m = match([kill(), damage(130)]), { k } = inputs(m), r = analyzeTeamplay(m, undefined, k);
  assert.equal(r.playerEngagementContexts.length, 0); assert.equal(peer(r).playerAliveAtDeath, true); assert.equal(peer(r).outcome, "unavailable");
  const atomic = match([kill(), kill(100, "7", "1")]), state = inputs(atomic).k;
  assert.equal(peer(analyzeTeamplay(atomic, undefined, state)).outcome, "unavailable");
});
test("missing KillImpact state preserves participation; response does not invent life", () => {
  const m = match([kill(), damage(130)]), { e } = inputs(m), r = analyzeTeamplay(m, e);
  assert.ok(r.playerEngagementContexts.length); assert.equal(peer(r).playerAliveAtDeath, null); assert.equal(peer(r).outcome, "unavailable");
  assert.equal(team(r).confirmedAliveTeammates, null);
});
test("missing spatial leaves event response stable", () => {
  const m = match([kill(), damage(130)]), a = analyze(m), b = analyze(m, spatial(m));
  assert.equal(peer(a).outcome, peer(b).outcome); assert.equal(peer(a).firstFollowUpRef.tick, peer(b).firstFollowUpRef.tick);
  assert.equal(a.coverage.spatialContext.status, "unavailable"); assert.notEqual(b.coverage.spatialContext.status, "unavailable");
});
test("missing own/teammate position has independent coverage", () => {
  const m = match(); const own = context(analyze(m, spatial(m, { "1": null })));
  assert.equal(own.spatialContext.nearestConfirmedAliveTeammate, null); assert.equal(own.coverage.spatialContext.status, "unavailable");
  const c = context(analyze(m, spatial(m, { "2": null })));
  assert.equal(c.coverage.spatialContext.status, "partial"); assert.deepEqual(c.spatialContext.incompletePositionTeammateIds, ["2"]);
  assert.equal(c.spatialContext.nearestConfirmedAliveTeammate.teammateId, "3");
});
test("same-tick teammate death excluded from alive distance and response eligibility", () => {
  const m = match([kill(), damage(100)]), r = analyze(m, spatial(m));
  const c = context(r); assert.deepEqual(c.spatialContext.sameTickAliveAmbiguousIds, ["2"]);
  assert.notEqual(c.spatialContext.nearestConfirmedAliveTeammate.teammateId, "2");
  const misleading = spatial(m); misleading.events[1].samples.find(b => b.sample.playerId === "2").sample.alive = true;
  assert.deepEqual(context(analyze(m, misleading)).spatialContext.sameTickAliveAmbiguousIds, ["2"]);
  const p = peer(r, "2", "6"); // No teammate death for opposite-side victim in this fixture.
  assert.equal(p, undefined);
  const atomic = match([kill(), kill(100, "7", "1")]);
  const response = peer(analyze(atomic)); assert.equal(response.playerAliveAtDeath, null); assert.equal(response.outcome, "same-tick-ambiguous");
});
test("XY distance and absolute Z delta remain separate from XYZ nearest choice", () => {
  const m = match(), c = context(analyze(m, spatial(m, { "1": { x: 0, y: 0, z: 100 }, "2": { x: 3, y: 4, z: 112 } })));
  assert.deepEqual(c.spatialContext.nearestConfirmedAliveTeammate, { teammateId: "2", horizontalDistance: 5, verticalDelta: 12, directDistance: 13 });
});
test("equal spatial distance uses SteamID string deterministic tie", () => {
  const m = match(); const s = spatial(m, { "1": { x: 0, y: 0, z: 0 }, "2": { x: 1, y: 0, z: 0 }, "3": { x: -1, y: 0, z: 0 } });
  s.events[0].samples.reverse(); assert.equal(context(analyze(m, s)).spatialContext.nearestConfirmedAliveTeammate.teammateId, "2");
});
test("spatial is_alive conflicts recorded, never overrides deterministic timeline", () => {
  const m = match(), s = spatial(m); s.events[0].samples.find(b => b.sample.playerId === "2").sample.alive = false;
  const c = context(analyze(m, s)); assert.equal(c.spatialContext.nearestConfirmedAliveTeammate.teammateId, "2");
  assert.deepEqual(c.spatialContext.aliveConsistencyConflictIds, ["2"]); assert.equal(c.coverage.spatialContext.status, "partial");
});
test("exact spatial keys only, missing/duplicate/mismatch and wrong actual tick never approximate", () => {
  const m = match();
  for (const mutate of [s => s.events[0].eventRef.eventIndex++, s => s.events[0].eventRef.tick++, s => s.matchId = "other",
    s => s.events.push(s.events[0]), s => s.events[0].participants[0].playerId = "2",
    s => s.events[0].samples.find(b => b.sample.playerId === "1").sample.actualTick++]) {
    const s = spatial(m); mutate(s); assert.equal(context(analyze(m, s)).spatialContext.nearestConfirmedAliveTeammate, null);
  }
});
test("sameEngagement compares actual IDs, not just response window", () => {
  const p = peer(analyze(match([kill(), damage(400)]))); assert.equal(p.outcome, "damage"); assert.equal(p.sameEngagement, false);
});
test("unidentified killer and baseline-dead killer unavailable", () => {
  const m = match([kill(100, "world", "2", { killerSide: "Unknown" })]);
  assert.equal(peer(analyze(m)).killerId, null); assert.equal(peer(analyze(m)).outcome, "unavailable");
  const dead = match([kill()]);
  for (const s of dead.rounds[0].stateSnapshots) s.players.find(p => p.steamId === "6").alive = false;
  assert.equal(peer(analyze(dead)).killerState, "unknown"); assert.equal(peer(analyze(dead)).outcome, "unavailable");
});
test("response never crosses formal round or accepts post-round contact", () => {
  const m = match([kill(), damage(1001)]); assert.equal(peer(analyze(m)).outcome, "none-observed");
  const other = structuredClone(m.rounds[0]); other.number = 2; other.events = [damage(140)]; m.rounds.push(other);
  assert.equal(peer(analyze(m)).outcome, "none-observed");
});
test("invalid original contact refs and duplicate membership rejected conservatively", () => {
  const m = match([kill(), damage(130)]);
  for (const mutate of [e => e.directContacts[1].eventRef.tick++, e => e.directContacts.push(e.directContacts[0]),
    e => e.engagements.push(e.engagements[0]), e => e.matchId = "other"]) {
    const { e, k } = inputs(m); mutate(e); const r = analyzeTeamplay(m, e, k);
    assert.ok(r.coverage.engagementParticipation.reasons.includes("engagement-link-conflict"));
    assert.notEqual(peer(r).outcome, "none-observed");
  }
});
test("incomplete or stale direct contact feed never manufactures none-observed", () => {
  for (const event of [damage(130, "1", "6", 20, { attackerSide: "Unknown" }), damage(NaN)]) {
    const r = analyze(match([kill(), event])); assert.equal(peer(r).outcome, "unavailable");
    assert.ok(peer(r).coverage.followUpTiming.reasons.includes("engagement-evidence-incomplete"));
    assert.equal(peer(r).reportedDamage, null);
  }
  const m = match([kill(), damage(130)]), { e, k } = inputs(m);
  e.directContacts.pop(); e.engagements[0].contacts.pop(); e.engagements[0].participantIds = ["2", "6"];
  assert.equal(peer(analyzeTeamplay(m, e, k)).outcome, "unavailable");
  const positive = peer(analyze(match([kill(), damage(130), damage(NaN)])));
  assert.equal(positive.outcome, "damage"); assert.equal(positive.coverage.followUpTiming.status, "partial");
});
test("orphan direct contact cannot manufacture unique-first in stale grouping", () => {
  const m = match([damage(100), damage(130, "2", "6")]), { e, k } = inputs(m);
  e.engagements[0].contacts.shift(); e.engagements[0].participantIds = ["2", "6"];
  const c = context(analyzeTeamplay(m, e, k), "2");
  assert.equal(c.firstSideContactRole, "unknown"); assert.ok(c.coverage.engagementParticipation.reasons.includes("engagement-link-conflict"));
});
test("deterministic JSON-only analysis and complete input immutability/output ownership", () => {
  const m = match([kill(), damage(130)]), s = spatial(m), { e, k } = inputs(m, s), before = structuredClone({ m, e, k, s });
  const r = analyzeTeamplay(m, e, k, s); assert.deepEqual(r, analyzeTeamplay(m, e, k, s)); assert.deepEqual({ m, e, k, s }, before);
  assert.deepEqual(r, JSON.parse(JSON.stringify(r)));
  context(r).sideParticipantIds.push("99"); peer(r).coverage.spatialContext.reasons.push("position-missing");
  assert.deepEqual({ m, e, k, s }, before);
  m.rounds.push(structuredClone(m.rounds[0])); assert.throws(() => analyzeTeamplay(m, e, k, s), RangeError);
});
