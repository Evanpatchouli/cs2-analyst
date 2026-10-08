import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Demoparser2Provider } from '../../dem-parser/dist/index.js';
import { analyzeEngagements, analyzeKillImpact, analyzeTeamplay, analyzeUtilityContext, analyzeCombatExecution, analyzeDeepReviewFindings } from '../dist/index.js';

const complete = l => l.status === 'complete' && l.reasons.length === 0;
const covered = (r, keys) => keys.every(k => complete(r.coverage[k]));
const accepted = o => ['kill', 'damage', 'none-observed'].includes(o);
const trigger = (n, m, positive = false) => n >= 5 && m >= (positive ? 4 : 3) && m / n >= (positive ? .6 : .5);
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const key = ref => JSON.stringify([ref.round,ref.type,ref.tick,ref.eventIndex]);
function resolve(ref,a) {
  switch(ref.kind) {
    case 'kill':return a.impact.kills.filter(c=>key(c.eventRef)===key(ref.eventRef));
    case 'multi-kill':return a.impact.multiKills.filter(c=>c.playerId===ref.playerId&&c.round===ref.round);
    case 'player-death-response':return a.teamplay.playerDeathContexts.filter(c=>c.playerId===ref.playerId&&key(c.deathRef)===key(ref.deathRef));
    case 'teammate-death-response':return a.teamplay.teammateDeathResponses.filter(c=>c.playerId===ref.playerId&&c.teammateId===ref.teammateId&&key(c.deathRef)===key(ref.deathRef));
    case 'opponent-exchange':return a.execution.playerEngagementExecutions.flatMap(c=>c.opponentExchanges).filter(c=>c.playerId===ref.playerId&&c.opponentId===ref.opponentId&&c.engagementId===ref.engagementId);
    case 'utility-effect':return a.utility.effects.filter(c=>key(c.effectRef)===key(ref.effectRef));
    default:assert.fail(`Unexpected emitted occurrence kind ${ref.kind}`);
  }
}
const summarize = (rows, occurrence) => {
  const none = rows.filter(occurrence).length;
  const players = [...new Set(rows.map(r => r.playerId))];
  return { eligible: rows.length, none, rate: rows.length ? none / rows.length : null,
    playersTriggered: players.filter(id => { const own = rows.filter(r => r.playerId === id); return trigger(own.length, own.filter(occurrence).length); }).length };
};
const distribution = values => {
  const sorted = [...values].sort((a,b) => a-b);
  const q = p => sorted.length ? sorted[Math.floor((sorted.length-1)*p)] : null;
  return { count: sorted.length, min:q(0), p25:q(.25), median:q(.5), p75:q(.75), p90:q(.9), p95:q(.95), max:q(1),
    bins: Object.fromEntries([[0,.1],[.1,.5],[.5,1],[1,2],[2,3],[3,Infinity]].map(([lo,hi]) => [`[${lo},${hi})`,sorted.filter(v=>v>=lo&&v<hi).length])) };
};
test('Findings calibration: core structural gate and optional one-time extended observations', async t => {
  const report = { schemaVersion:1, baseline:'bae40582e1156fe5187248719a42d536aec543d1', purpose:'Denominator/semantic calibration; observations are not count goldens or skill truth', train:'REMOVED / NOT REQUIRED', personalDemCompatibility:'UNVERIFIED', maps:[], extendedMissing:[],
    ruleOverbreadthSummary:{ execution:'Exact received-first refs include received-only; upstream role unchanged. High negative prevalence is a sanity signal, not proof of poor play or causal diagnosis', noFollow:'Confirmed same-Engagement membership does not prove LOS or trade opportunity; context', lone:'Direct-contact membership does not prove spatial isolation or wrong positioning; context', teamflash:'Exact raw effects do not prove negative flash quality; context; no severity heuristic introduced', dedup:'No teamplay window overlap merge; deterministic context priority and cap select distinct facts' } };
  const core = ['nuke','inferno','dust2','mirage'];
  const extended = process.env.FINDINGS_CALIBRATION_EXTENDED === '1' ? ['ancient','anubis','overpass'] : [];
  for (const name of [...core,...extended]) {
    const path = fileURLToPath(new URL(`../../../.demo/${name}.dem`,import.meta.url));
    if (!existsSync(path)) { if (core.includes(name)) assert.fail(`Missing mandatory ${name}`); report.extendedMissing.push(name); continue; }
    await t.test(name, async () => {
      const {match,spatial} = await new Demoparser2Provider().parseWithSpatial(path);
      assert.equal(match.map,`de_${name}`);
      const engagements=analyzeEngagements(match,spatial), impact=analyzeKillImpact(match,engagements);
      const teamplay=analyzeTeamplay(match,engagements,impact,spatial), utility=analyzeUtilityContext(match,spatial,impact), execution=analyzeCombatExecution(match,engagements,impact,spatial);
      const inputs={engagements,impact,teamplay,utility,execution};
      const before=hash(inputs);
      const ids=match.players.map(p=>p.steamId).filter(id=>/^[1-9]\d*$/.test(id));
      const outputs=ids.map(id=>analyzeDeepReviewFindings(match,id,inputs));
      assert.equal(hash(outputs),hash(ids.map(id=>analyzeDeepReviewFindings(match,id,inputs))));assert.equal(hash(inputs),before);
      outputs.forEach(o=>{ assert.deepEqual(o.diagnostics.inputIssues,[]); assert.deepEqual(o.diagnostics.contradictions,[]); });
      for(const o of outputs) for(const f of [...o.reviews,...o.highlights,...o.contexts]) {
        const sources=f.evidenceRefs.map(ref=>{const rows=resolve(ref,inputs);assert.equal(rows.length,1);return rows[0];});
        const rounds=[...new Set(sources.map(s=>s.round??s.eventRef?.round??s.deathRef?.round??s.effectRef?.round))].sort((a,b)=>a-b);
        assert.deepEqual(f.relatedRounds,rounds);
        if(f.category!=='impact') assert.equal(sources.length,f.occurrences);
        if(f.ruleId.endsWith('no-confirmed-return-pattern')) sources.forEach(s=>assert.equal(s.returnOutcome,'none-observed'));
        if(f.ruleId.endsWith('return-contact-consistent')) sources.forEach(s=>assert.ok(['kill','damage'].includes(s.returnOutcome)));
        if(f.ruleId.endsWith('no-followup-pattern')) sources.forEach(s=>{assert.equal(s.outcome,'none-observed');assert.notEqual(s.sideParticipantCount,null);});
        if(f.ruleId.endsWith('lone-contact-death-pattern')) sources.forEach(s=>{assert.equal(s.onlyConfirmedSideParticipant,true);assert.equal(s.teamResponse.outcome,'none-observed');});
      }
      const pairs=execution.playerEngagementExecutions.flatMap(c=>c.opponentExchanges).filter(r=>covered(r,['engagementLinkage','contactEvidence','returnContact'])&&accepted(r.returnOutcome));
      const eligible=pairs.filter(r=>r.firstReceivedRef && (!r.firstDealtRef || r.firstReceivedRef.tick<r.firstDealtRef.tick));
      const old=teamplay.teammateDeathResponses.filter(r=>r.playerAliveAtDeath===true&&r.killerState==='alive-after-death'&&accepted(r.outcome)&&covered(r,['aliveState','followUpTiming']));
      const same=old.filter(r=>r.sideParticipantCount!==null&&covered(r,['engagementParticipation']));
      const deaths=teamplay.playerDeathContexts.filter(r=>covered(r,['engagementParticipation','aliveState','followUpTiming'])&&covered(r.teamResponse,['engagementParticipation','aliveState','followUpTiming'])&&accepted(r.teamResponse.outcome));
      const flashes=utility.effects.filter(r=>r.directOutcome.kind==='flash'&&r.directOutcome.linkage==='exact'&&covered(r,['actorAttribution','directOutcome']));
      const hits=flashes.filter(r=>r.directOutcome.teammateEffects.length);
      const rows=hits.flatMap(r=>r.directOutcome.teammateEffects);
      const observedFlashes=utility.effects.filter(r=>r.directOutcome.kind==='flash');
      const triggered=suffix=>outputs.filter(o=>o.diagnostics.rules.find(r=>r.ruleId.endsWith(suffix)).triggered).length;
      // Assert the probe and production denominator agree; stale dist must not silently publish a report.
      for(const id of ids) {
        const own=eligible.filter(r=>r.playerId===id),o=outputs.find(o=>o.playerId===id);
        assert.equal(o.diagnostics.rules.find(r=>r.ruleId.endsWith('no-confirmed-return-pattern')).eligibleOccurrences,own.length);
        assert.equal(o.diagnostics.rules.find(r=>r.ruleId.endsWith('no-confirmed-return-pattern')).triggered,trigger(own.length,own.filter(r=>r.returnOutcome==='none-observed').length));
        assert.equal(o.diagnostics.rules.find(r=>r.ruleId.endsWith('return-contact-consistent')).triggered,trigger(own.length,own.filter(r=>r.returnOutcome!=='none-observed').length,true));
        assert.equal(o.diagnostics.rules.find(r=>r.ruleId.endsWith('no-followup-pattern')).eligibleOccurrences,same.filter(r=>r.playerId===id).length);
      }
      const entry={ fixture:{filename:`${name}.dem`,sha256:match.id,headerMap:match.map,fileSize:(await stat(path)).size,tickRate:match.tickRate,roundCount:match.rounds.length,playerCount:match.players.length,role:core.includes(name)?'mandatory core':'extended calibration observation'},
        execution:{receivedFirstWithTwoSidedContact:eligible.filter(r=>r.firstDealtRef).length,receivedOnly:eligible.filter(r=>!r.firstDealtRef).length,eligibleAfterFix:eligible.length,returnKill:eligible.filter(r=>r.returnOutcome==='kill').length,returnDamage:eligible.filter(r=>r.returnOutcome==='damage').length,noneObserved:eligible.filter(r=>r.returnOutcome==='none-observed').length,negativeTriggerPlayers:triggered('no-confirmed-return-pattern'),positiveTriggerPlayers:triggered('return-contact-consistent'),players:ids.map(playerId=>{ const p=eligible.filter(r=>r.playerId===playerId);return {playerId,eligible:p.length,none:p.filter(r=>r.returnOutcome==='none-observed').length}; })},
        noFollow:{oldAlivePlayer:summarize(old,r=>r.outcome==='none-observed'),sameEngagementParticipant:summarize(same,r=>r.outcome==='none-observed'),finalKind:'context',semanticLimit:'Membership is over the whole Engagement, not proof of direct contact before death, LOS, supportability or P3 Trade opportunity'},
        loneContact:{...summarize(deaths,r=>r.onlyConfirmedSideParticipant===true&&r.teamResponse.outcome==='none-observed'),occurrences:deaths.filter(r=>r.onlyConfirmedSideParticipant===true&&r.teamResponse.outcome==='none-observed').length,finalKind:'context'},
        teamflash:{observedFlashEffects:observedFlashes.length,linkageCounts:Object.fromEntries(['exact','ambiguous','unavailable'].map(linkage=>[linkage,observedFlashes.filter(r=>r.directOutcome.linkage===linkage).length])),requiredCoverageExcluded:observedFlashes.length-flashes.length,exactEffects:flashes.length,teammateHitEffects:hits.length,teammateEffectRows:rows.length,rawDuration:distribution(rows.map(r=>r.rawBlindDurationSeconds)),perEffectMaxRawDuration:distribution(hits.map(r=>Math.max(...r.directOutcome.teammateEffects.map(r=>r.rawBlindDurationSeconds)))),perEffectTotalRawDuration:distribution(hits.map(r=>r.directOutcome.teammateEffects.reduce((n,r)=>n+r.rawBlindDurationSeconds,0))),players:ids.map(playerId=>{const own=hits.filter(r=>r.throwerId===playerId).flatMap(r=>r.directOutcome.teammateEffects);return {playerId,totalRawTeammateDuration:own.reduce((n,r)=>n+r.rawBlindDurationSeconds,0),uniqueTeammateVictims:new Set(own.map(r=>r.victimId)).size};}),triggerPlayers:triggered('teamflash-repeated'),finalKind:'context',finalRuleSemantics:'Repeated exact teammate-hit effects; raw duration is not continuous blind duration or flash quality score',severitySensitivity:[.1,.5,1,2,3].map(seconds=>({seconds,effects:hits.filter(r=>r.directOutcome.teammateEffects.some(r=>r.rawBlindDurationSeconds>=seconds)).length,rows:rows.filter(r=>r.rawBlindDurationSeconds>=seconds).length}))},
        verification:{contradictions:0,inputIssues:0,exactOccurrenceRefs:true,relatedRoundsOnlyOccurrences:true,deterministic:true,immutable:true},emitted:outputs.map(o=>({playerId:o.playerId,reviews:o.reviews.map(f=>f.ruleId),highlights:o.highlights.map(f=>f.ruleId),contexts:o.contexts.map(f=>f.ruleId)})) };
      report.maps.push(entry); t.diagnostic(JSON.stringify({fixture:entry.fixture,execution:{...entry.execution,players:undefined},noFollow:entry.noFollow,loneContact:entry.loneContact,teamflash:{exactEffects:entry.teamflash.exactEffects,rows:entry.teamflash.teammateEffectRows,triggerPlayers:entry.teamflash.triggerPlayers}}));
    });
  }
  if(process.env.FINDINGS_CALIBRATION_REPORT_FILE) await writeFile(process.env.FINDINGS_CALIBRATION_REPORT_FILE,JSON.stringify(report,null,2)+'\n');
});
