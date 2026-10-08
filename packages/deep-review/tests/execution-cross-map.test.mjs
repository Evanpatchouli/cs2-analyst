import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Demoparser2Provider } from "../../dem-parser/dist/index.js";
import { analyzeEngagements, analyzeKillImpact, analyzeTeamplay, analyzeUtilityContext, analyzeCombatExecution, classifyContactWeapon } from "../dist/index.js";

const hash = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const key = r => JSON.stringify([r.round, r.type, r.tick, r.eventIndex]);
const fixtures = [
  ["Nuke", "spirit-vs-faze-m1-nuke.dem", "de_nuke", "dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c"],
  ["Inferno", "falcons-vs-vitality-m2-inferno.dem", "de_inferno", "b61c040074f84f1f2c1b683642923243dbe123c2a0c70ed3c0670b0e4cd7a265"],
  ["Dust2", "spirit-vs-faze-m3-dust2.dem", "de_dust2", "db90fe85aab023a1d2c8a5996182e6120d98ef494f02a070b17982b235e4958c"],
];
const distributions = (rows, field) => Object.fromEntries([...new Set(rows.map(r => r[field]))].sort().map(value => [value, rows.filter(r => r[field] === value).length]));
const stats = values => { const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return { count: n, median: n ? n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : null,
    p95: n ? sorted[Math.ceil(n * .95) - 1] : null, max: n ? sorted.at(-1) : null }; };
function jsonOnly(v) {
  if (typeof v === "number") assert.ok(Number.isFinite(v));
  if (v && typeof v === "object") for (const item of Object.values(v)) jsonOnly(item);
  assert.notEqual(typeof v, "undefined");
}
function raw(match, ref) {
  const round = match.rounds.find(r => r.number === ref.round), event = round?.events[ref.eventIndex];
  assert.ok(event); assert.equal(event.type, ref.type); assert.equal(event.tick, ref.tick); return event;
}
function refsDeep(match, value) {
  if (!value || typeof value !== "object") return;
  if (Number.isInteger(value.eventIndex) && Number.isInteger(value.round) && value.type) raw(match, value);
  for (const v of Object.values(value)) refsDeep(match, v);
}
const report = { schemaVersion: 1, purpose: "Cross-map professional GOTV structural verification; observations are not golden counts or player comparisons",
  viewAlignment: "UNVERIFIED — no trusted coordinate convention established; no angle productionized", personalDemCompatibility: "UNVERIFIED",
  peakMemory: "UNKNOWN", maps: [] };

test("three-map shared parseWithSpatial pipeline and structural invariants", async t => {
  for (const [name, filename, map, sha] of fixtures) await t.test(name, { skip: !existsSync(fileURLToPath(new URL(`../../../.demo/${filename}`, import.meta.url))) ? `Missing exact fixture ${filename}; no replacement/download` : false }, async () => {
    const path = fileURLToPath(new URL(`../../../.demo/${filename}`, import.meta.url));
    const begin = performance.now(), { match, spatial } = await new Demoparser2Provider().parseWithSpatial(path), parsed = performance.now();
    assert.equal(match.map, map); if (sha) assert.equal(match.id, sha);
    const before = hash({ match, spatial });
    const e = analyzeEngagements(match, spatial), k = analyzeKillImpact(match, e), team = analyzeTeamplay(match, e, k, spatial), utility = analyzeUtilityContext(match, spatial, k);
    const executionStart = performance.now(), a = analyzeCombatExecution(match, e, k, spatial), end = performance.now();
    for (const tick of spatial.sampling.coreTicks) {
      assert.ok(!spatial.sampling.omittedOptionalTicks.includes(tick));
      assert.ok(spatial.sampling.returnedTicks.includes(tick), `core tick missing ${tick}`);
    }
    const contactRefs = e.engagements.flatMap(g => g.contacts.map(c => { assert.equal(c.eventRef.round, g.round); return key(c.eventRef); }));
    assert.equal(new Set(contactRefs).size, e.directContacts.length); assert.equal(contactRefs.length, e.directContacts.length);
    for (const state of k.rounds) for (const group of state.groups) for (const counts of [group.before, group.after]) if (counts) { assert.ok(counts.CT >= 0); assert.ok(counts.T >= 0); }
    for (const output of [e, k, team, utility, a]) { jsonOnly(output); refsDeep(match, output); assert.deepEqual(output, JSON.parse(JSON.stringify(output))); }
    const fireAssignments = a.playerEngagementExecutions.flatMap(c => c.weaponFireRefs.map(r => key(r)));
    assert.equal(fireAssignments.length, new Set(fireAssignments).size);
    let fireChecks = 0, pairChecks = 0, distanceChecks = 0;
    for (const f of a.weaponFireEvidence) {
      const source = raw(match, f.eventRef); assert.equal(source.shooter, f.shooterId); assert.equal(source.weapon, f.weapon);
      const window = a.config.preContactFireWindowTicks;
      const candidates = e.engagements.filter(g => g.round === f.eventRef.round && g.participantIds.includes(f.shooterId)
        && (f.eventRef.tick >= g.startTick && f.eventRef.tick <= g.endTick || f.eventRef.tick < g.startTick && g.startTick - f.eventRef.tick <= window));
      assert.deepEqual(f.candidateEngagementIds, candidates.map(g => g.id).sort());
      if (candidates.length > 1) { assert.equal(f.linkage, "ambiguous"); assert.equal(f.engagementId, null); assert.ok(!fireAssignments.includes(key(f.eventRef))); }
      else if (candidates.length === 1) assert.equal(f.engagementId, candidates[0].id);
      else assert.equal(f.linkage, "unlinked");
      assert.ok(!("opponentId" in f)); fireChecks++;
    }
    for (const c of a.playerEngagementExecutions) {
      const g = e.engagements.find(g => g.id === c.engagementId); assert.equal(c.round, g.round); assert.ok(g.participantIds.includes(c.playerId));
      const own = g.contacts.filter(x => x.sourceKind === "firearm" && (x.attackerId === c.playerId || x.victimId === c.playerId));
      assert.equal(c.damageContactsDealt, own.filter(x => !x.fatal && x.attackerId === c.playerId).length);
      assert.equal(c.reportedDamageDealt, own.filter(x => !x.fatal && x.attackerId === c.playerId).reduce((n, x) => n + x.reportedHealthDamage, 0));
      assert.equal(c.firearmKills, own.filter(x => x.fatal && x.attackerId === c.playerId).length);
      if (c.firstObservedFireRef && c.firstConfirmedOffensiveContactRef && c.firstObservedFireRef.tick === c.firstConfirmedOffensiveContactRef.tick) assert.equal(c.firstFireToFirstConfirmedContactSeconds, null);
      for (const p of c.opponentExchanges) {
        const rows = own.filter(x => (x.attackerId === p.playerId && x.victimId === p.opponentId) || (x.attackerId === p.opponentId && x.victimId === p.playerId));
        assert.deepEqual(p.contactRefs.map(key), rows.map(x => key(x.eventRef)));
        const dealt = rows.filter(x => x.attackerId === p.playerId), received = rows.filter(x => x.victimId === p.playerId);
        if (dealt.length && received.length && dealt[0].eventRef.tick === received[0].eventRef.tick && p.firstContactRole !== "unknown") assert.equal(p.firstContactRole, "same-tick");
        if (p.returnContactRef) {
          const source = raw(match, p.returnContactRef); assert.equal(source.attacker ?? source.killer, p.playerId); assert.equal(source.victim, p.opponentId);
          assert.ok(p.returnContactRef.tick > p.firstReceivedRef.tick); assert.equal(p.returnContactDelaySeconds, (p.returnContactRef.tick - p.firstReceivedRef.tick) / match.tickRate);
          assert.equal(classifyContactWeapon(source.weapon), "firearm");
        }
        if (p.returnOutcome === "none-observed") {
          assert.equal(p.coverage.returnContact.status, "complete"); assert.equal(p.returnContactRef, null);
          const r = match.rounds.find(r => r.number === p.round), deaths = r.events.filter(e => e.type === "kill" && e.victim === p.playerId && e.tick >= r.startTick && e.tick <= r.endTick);
          assert.ok(!deaths.some(d => d.tick === p.firstReceivedRef.tick));
          const limit = deaths.length ? Math.min(...deaths.map(d => d.tick)) : Infinity;
          assert.equal(dealt.filter(x => x.eventRef.tick > p.firstReceivedRef.tick && x.eventRef.tick < limit).length, 0);
        }
        if (p.firstContactDistance) {
          const evidence = spatial.events.find(s => s.eventRef.type !== "round_boundary" && key(s.eventRef) === key(p.firstContactRef));
          const source = raw(match, p.firstContactRef), actor = source.attacker ?? source.killer;
          const position = (role, id) => evidence.samples.find(s => s.role === role && s.sample.playerId === id && s.sample.relation === "at-event").sample;
          const x = position("actor", actor), y = position("target", source.victim);
          for (const s of [x, y]) { assert.equal(s.actualTick, p.firstContactRef.tick); assert.equal(s.requestedTick, p.firstContactRef.tick); }
          const horizontalDistance = Math.hypot(x.position.x - y.position.x, x.position.y - y.position.y), verticalDelta = Math.abs(x.position.z - y.position.z);
          assert.deepEqual(p.firstContactDistance, { horizontalDistance, verticalDelta, directDistance: Math.hypot(horizontalDistance, verticalDelta) }); distanceChecks++;
        }
        pairChecks++;
      }
    }
    const repeated = { e: analyzeEngagements(match, spatial) }; repeated.k = analyzeKillImpact(match, repeated.e);
    repeated.team = analyzeTeamplay(match, repeated.e, repeated.k, spatial); repeated.utility = analyzeUtilityContext(match, spatial, repeated.k);
    repeated.a = analyzeCombatExecution(match, repeated.e, repeated.k, spatial);
    assert.equal(hash({ e, k, team, utility, a }), hash(repeated)); assert.equal(hash({ match, spatial }), before);
    const pairs = a.playerEngagementExecutions.flatMap(c => c.opponentExchanges);
    const entry = { fixture: filename, sha256: match.id, map: match.map, tickRate: match.tickRate, rounds: match.rounds.length, players: match.players.length,
      fileSize: (await stat(path)).size, engagements: e.engagements.length, eligiblePlayerEngagementExecutions: a.playerEngagementExecutions.length,
      opponentExchanges: pairs.length, diagnostics: a.diagnostics, firstContactRoles: distributions(a.playerEngagementExecutions, "firstContactRole"),
      returnOutcomes: distributions(pairs, "returnOutcome"), spatialDistance: { direct: stats(pairs.flatMap(p => p.firstContactDistance ? [p.firstContactDistance.directDistance] : [])),
        vertical: stats(pairs.flatMap(p => p.firstContactDistance ? [p.firstContactDistance.verticalDelta] : [])) },
      coverage: a.coverage, determinismHash: hash({ e, k, team, utility, a }), executionHash: hash(a),
      timingsMilliseconds: { parseWithSpatial: parsed - begin, deepReviewPipeline: end - parsed, combatExecution: end - executionStart },
      verification: { coreTicks: spatial.sampling.coreTicks.length, eligibleUniqueContacts: contactRefs.length, fireChecks, pairChecks, distanceChecks,
        deterministic: true, immutable: true, jsonOnly: true, allPipelineRefsTraceable: true, sameTickUnordered: true, ambiguousFireUnassigned: true } };
    report.maps.push(entry); t.diagnostic(JSON.stringify(entry));
    if (name === "Nuke" && process.env.EXECUTION_NUKE_REPORT_FILE) {
      const find = predicate => a.playerEngagementExecutions.find(predicate) ?? null;
      const byDistance = [...pairs].filter(p => p.firstContactDistance).sort((a, b) => b.firstContactDistance.directDistance - a.firstContactDistance.directDistance);
      const byZ = [...pairs].filter(p => p.firstContactDistance).sort((a, b) => b.firstContactDistance.verticalDelta - a.firstContactDistance.verticalDelta);
      const samples = { dealtFirstKill: find(c => c.firstContactRole === "dealt-first" && c.firearmKills > 0),
        dealtFirstNoKill: find(c => c.firstContactRole === "dealt-first" && c.firearmKills === 0),
        receivedFirstReturnKill: find(c => c.firstContactRole === "received-first" && c.opponentExchanges.some(p => p.returnOutcome === "kill")),
        receivedFirstReturnDamage: find(c => c.firstContactRole === "received-first" && c.opponentExchanges.some(p => p.returnOutcome === "damage")),
        receivedFirstNoneObserved: find(c => c.firstContactRole === "received-first" && c.opponentExchanges.some(p => p.returnOutcome === "none-observed")),
        sameTickFirst: find(c => c.firstContactRole === "same-tick"), leadInFire: find(c => c.leadInFireCount > 0 && c.weaponFireEventsBeforeFirstConfirmedContact > 0),
        multiOpponent: find(c => c.opponentExchanges.length > 1), maximumDirectDistance: byDistance[0] ?? null, maximumVerticalDelta: byZ[0] ?? null,
        incompleteOrAmbiguous: find(c => Object.values(c.coverage).some(l => l.status !== "complete")) };
      await writeFile(process.env.EXECUTION_NUKE_REPORT_FILE, JSON.stringify({ ...entry, semantics: "Combat Execution Evidence; weapon_fire is shooter-only; counts are not misses or accuracy; delay is not reaction time",
        selection: "First matching structural predicate; maxima selected by geometry only; missing categories null, never hardcoded players/rounds",
        samples, weaponFireEvidence: a.weaponFireEvidence, viewAlignment: report.viewAlignment, personalDemCompatibility: "UNVERIFIED", peakMemory: "UNKNOWN" }, null, 2) + "\n", "utf8");
    }
  });
  if (process.env.EXECUTION_CROSS_MAP_REPORT_FILE) await writeFile(process.env.EXECUTION_CROSS_MAP_REPORT_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");
});
