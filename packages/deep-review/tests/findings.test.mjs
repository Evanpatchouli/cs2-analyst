import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeDeepReviewFindings } from '../dist/index.js';
import { evaluateDeepReviewFindings } from '../dist/findings.js';
import { FINDINGS_POLICY } from '../dist/findings-policy.js';
import { findingSourceIndex, jsonSafe } from '../dist/findings-validation.js';
import {match,inputs,run,all,rule,suppression,damage,kill,swing,noReturn,returns,lone,noFollow,flashes,flash} from './findings-fixture.mjs';
const repeat=(n,f)=>Array.from({length:n},()=>f());
const evaluate=(m,a)=>analyzeDeepReviewFindings(m,'1',a);

const receivedOnly=()=>[damage(100,'6','1')];
const confirmedFollow=()=>[damage(90,'1','6'),...noFollow()];
const successfulFollow=()=>[...confirmedFollow(),damage(200,'1','6')];
const exchangeFor=(ref,a)=>a.execution.playerEngagementExecutions.flatMap(c=>c.opponentExchanges).find(p=>p.playerId===ref.playerId&&p.opponentId===ref.opponentId&&p.engagementId===ref.engagementId);
const roundsFromRefs=(f,a)=>[...new Set(f.evidenceRefs.map(ref=>ref.deathRef?.round??ref.effectRef?.round??exchangeFor(ref,a)?.round))].sort((a,b)=>a-b);

test('received-only unknown role is a legitimate negative occurrence; denominator-only rounds are absent',()=>{
  const m=match([...repeat(3,receivedOnly),...repeat(2,returns)]),a=inputs(m),r=evaluate(m,a),f=rule(r,'no-confirmed-return-pattern');
  assert.ok(f);assert.equal(f.eligibleOccurrences,5);assert.equal(f.occurrences,3);
  for(const ref of f.evidenceRefs) {const p=exchangeFor(ref,a);assert.ok(p.firstReceivedRef);assert.equal(p.firstDealtRef,null);assert.equal(p.firstContactRole,'unknown');assert.equal(p.returnOutcome,'none-observed');}
  assert.deepEqual(f.relatedRounds,[1,2,3]);assert.deepEqual(f.relatedRounds,roundsFromRefs(f,a));
  const only=run(match(repeat(5,receivedOnly)));assert.equal(rule(only,'no-confirmed-return-pattern').occurrences,5);
});

test('positive refs include only later damage/kill successes; received-only and same tick are excluded from refs',()=>{
  const m=match([...repeat(2,returns),...repeat(2,()=>[damage(100,'6','1'),kill(110,'1','6')]),receivedOnly(),[damage(100,'6','1'),damage(100,'1','6')]]),a=inputs(m),f=rule(evaluate(m,a),'return-contact-consistent');
  assert.ok(f);assert.equal(f.eligibleOccurrences,5);assert.equal(f.occurrences,4);
  assert.deepEqual(f.relatedRounds,[1,2,3,4]);assert.deepEqual(f.relatedRounds,roundsFromRefs(f,a));
  f.evidenceRefs.forEach(ref=>assert.ok(['kill','damage'].includes(exchangeFor(ref,a).returnOutcome)));
});

test('lone context refs include only lone occurrences, never denominator-only deaths',()=>{
  const m=match([...repeat(3,lone),...repeat(2,()=>[damage(90,'2','6'),...lone(),damage(160,'2','6')])]),a=inputs(m),f=rule(evaluate(m,a),'lone-contact-death-pattern');
  assert.ok(f);assert.equal(f.kind,'context');assert.equal(f.eligibleOccurrences,5);assert.equal(f.evidenceRefs.length,3);
  assert.deepEqual(f.relatedRounds,[1,2,3]);assert.deepEqual(f.relatedRounds,roundsFromRefs(f,a));
  f.evidenceRefs.forEach(ref=>{const c=a.teamplay.playerDeathContexts.find(c=>c.playerId===ref.playerId&&c.deathRef.round===ref.deathRef.round);assert.equal(c.onlyConfirmedSideParticipant,true);assert.equal(c.teamResponse.outcome,'none-observed');});
});

test('no-follow context refs contain only actual none occurrences in confirmed Engagements',()=>{
  const m=match([...repeat(3,confirmedFollow),...repeat(2,successfulFollow),noFollow()]),a=inputs(m),f=rule(evaluate(m,a),'no-followup-pattern');
  assert.ok(f);assert.equal(f.kind,'context');assert.equal(f.eligibleOccurrences,5);assert.equal(f.evidenceRefs.length,3);
  assert.deepEqual(f.relatedRounds,[1,2,3]);assert.deepEqual(f.relatedRounds,roundsFromRefs(f,a));
  f.evidenceRefs.forEach(ref=>{const c=a.teamplay.teammateDeathResponses.find(c=>c.playerId===ref.playerId&&c.deathRef.round===ref.deathRef.round);assert.equal(c.outcome,'none-observed');assert.notEqual(c.sideParticipantCount,null);});
});

test('context competition uses fixed priority without combining distinct occurrences',()=>{
  const m=match([...repeat(5,lone),...repeat(5,confirmedFollow),flashes()]),a=run(m);
  assert.equal(a.contexts.length,1);assert.equal(a.contexts[0].ruleId,'deep.teamplay.lone-contact-death-pattern');
  assert.ok(a.contexts[0].evidenceRefs.every(r=>r.kind==='player-death-response'));
  assert.equal(suppression(a,'no-followup-pattern'),'max-count-reached');assert.equal(suppression(a,'teamflash-repeated'),'max-count-reached');
});

test('forged same-Engagement membership/count/identity cannot manufacture no-follow context',()=>{
  for(const [events,mutate] of [
    [noFollow,c=>{c.sideParticipantCount=1;c.coverage.engagementParticipation={status:'complete',reasons:[]};}],
    [confirmedFollow,c=>{c.sideParticipantCount++;}],
    [confirmedFollow,c=>{c.engagementId='unlinked';}],
  ]) {
    const m=match(repeat(5,events)),a=inputs(m);
    a.teamplay.teammateDeathResponses.filter(c=>c.playerId==='1').forEach(mutate);
    const r=evaluate(m,a);assert.equal(rule(r,'no-followup-pattern'),undefined);assert.ok(r.diagnostics.inputIssues.includes('teamplay:stale-or-conflicting-source'));
  }
});
test('Scenario A: winning 3K with equalizer and advantage gain yields highlight without clutch',()=>{
  const m=match([swing()]),a=run(m),f=rule(a,'multikill-swing');
  assert.ok(f,JSON.stringify(a));assert.equal(f.facts.equalizer,true);assert.equal(f.facts.advantageGain,true);
  assert.equal(f.facts.roundResult,'win');assert.equal(a.reviews.length,0);assert.equal(f.facts.killCount,3);
});
test('sole-survivor sequence merges the same swing sequence, never calls it clutch',()=>{
  const m=match([[kill(10,'6','2'),kill(20,'7','3'),kill(30,'8','4'),kill(40,'9','5'),kill(100,'1','6'),kill(120,'1','7')]]);
  const a=run(m);assert.ok(rule(a,'sole-survivor-sequence'),JSON.stringify(a));assert.equal(suppression(a,'multikill-swing'),'deduplicated');
  assert.ok(!JSON.stringify(all(a)).includes('clutch'));assert.equal(a.highlights.length,1);
});
test('lost 3K context is factual and deduplicates a highlighted sequence',()=>{
  const m=match([swing()],'T'),a=run(m);assert.ok(all(a).some(f=>f.facts.unconverted));assert.equal(suppression(a,'multikill-unconverted'),'deduplicated');
  // Three advantage extensions leave one enemy alive, with no qualifying swing.
  const b=run(match([[kill(10,'2','6'),kill(200,'1','7'),kill(220,'1','8'),kill(240,'1','9')]],'T'));
  assert.ok(rule(b,'multikill-unconverted'));assert.equal(b.contexts.length,1);assert.equal(b.highlights.length,0);
});
test('Scenario B: complete received-first no-return pattern produces execution review',()=>{
  const a=run(match(repeat(5,noReturn)));assert.ok(rule(a,'no-confirmed-return-pattern'),JSON.stringify(a));
  assert.equal(rule(a,'no-confirmed-return-pattern').occurrences,5);
  assert.equal(rule(a,'lone-contact-death-pattern'),undefined);
  assert.ok(!all(a).some(f=>/枪法差|反应慢/.test(f.summary)));
});
test('execution denominator <5, occurrences <3, rate below 50% stay suppressed',()=>{
  assert.equal(suppression(run(match(repeat(4,noReturn))),'no-confirmed-return-pattern'),'insufficient-denominator');
  assert.equal(suppression(run(match([...repeat(2,noReturn),...repeat(3,returns)])),'no-confirmed-return-pattern'),'insufficient-occurrences');
  assert.equal(suppression(run(match([...repeat(3,noReturn),...repeat(4,returns)])),'no-confirmed-return-pattern'),'rate-below-threshold');
});
test('positive return contact uses the same denominator, never reaction language',()=>{
  const a=run(match(repeat(5,returns))),f=rule(a,'return-contact-consistent');assert.ok(f,JSON.stringify(a));
  assert.equal(f.occurrences,5);assert.equal(f.eligibleOccurrences,5);assert.equal(rule(a,'no-confirmed-return-pattern'),undefined);
  assert.ok(f.caveats.some(c=>c.includes('不等于人类反应时间')));
});
test('contradiction guard suppresses both patterns and records diagnostic',()=>{
  const m=match([...repeat(3,noReturn),...repeat(3,returns)]),a=inputs(m),policy=structuredClone(FINDINGS_POLICY);
  policy.positive={minimumEligible:5,minimumOccurrences:3,minimumRate:.5};
  const r=evaluateDeepReviewFindings(m,'1',a,policy);
  assert.equal(suppression(r,'no-confirmed-return-pattern'),'contradiction');assert.equal(suppression(r,'return-contact-consistent'),'contradiction');
  assert.equal(r.diagnostics.contradictions.length,1);assert.equal(r.reviews.length,0);
});
test('same-tick and unavailable exchanges are excluded; received-only role stays unknown but is eligible',()=>{
  const m=match([...repeat(4,returns),[damage(100,'6','1'),damage(100,'1','6')],[damage(100,'6','1')]]),a=inputs(m),r=evaluate(m,a);
  assert.equal(r.diagnostics.rules.find(d=>d.ruleId.endsWith('return-contact-consistent')).eligibleOccurrences,5);
  assert.ok(rule(r,'return-contact-consistent'));
  const row=a.execution.playerEngagementExecutions.find(c=>c.playerId==='1').opponentExchanges[0];row.returnOutcome='unavailable';row.coverage.returnContact={status:'unavailable',reasons:['return-contact-unavailable']};
  assert.equal(evaluate(m,a).diagnostics.rules.find(d=>d.ruleId.endsWith('return-contact-consistent')).eligibleOccurrences,4);
});
test('Scenario C: lone-contact death pattern with normal return evidence stays teamplay',()=>{
  const a=run(match(repeat(5,lone)));assert.ok(rule(a,'lone-contact-death-pattern'),JSON.stringify(a));
  assert.ok(rule(a,'return-contact-consistent'));assert.equal(rule(a,'no-confirmed-return-pattern'),undefined);
  assert.ok(rule(a,'lone-contact-death-pattern').caveats.some(c=>c.includes('不证明空间孤立')));
});
test('no-followup requires confirmed same-Engagement membership and remains context',()=>{
  assert.equal(rule(run(match(repeat(5,noFollow))),'no-followup-pattern'),undefined);
  const a=run(match(repeat(5,()=>[damage(90,'1','6'),...noFollow()]))),f=rule(a,'no-followup-pattern');assert.ok(f,JSON.stringify(a));
  assert.equal(f.kind,'context');
  assert.equal(f.facts.followUpWindowSeconds,5);assert.ok(f.caveats.some(c=>c.includes('不是 P3 Trade')));
});
test('distinct teamplay occurrences do not merge through overlapping windows or rounds',()=>{
  const rows=()=>[kill(100,'6','2'),kill(350,'6','1')];
  const m=match(repeat(5,rows)),a=inputs(m);
  const r=evaluate(m,a);assert.ok(rule(r,'lone-contact-death-pattern'),JSON.stringify(r));assert.equal(rule(r,'no-followup-pattern'),undefined);
  assert.equal(suppression(r,'no-followup-pattern'),'coverage-insufficient');
  assert.equal(rule(r,'lone-contact-death-pattern').kind,'context');
  assert.equal(rule(r,'lone-contact-death-pattern').facts.noFollowupOccurrences,undefined);
  const separate=run(match(repeat(5,()=>[kill(100,'6','2'),kill(350,'7','1')])));
  assert.ok(rule(separate,'lone-contact-death-pattern'));assert.equal(rule(separate,'no-followup-pattern'),undefined);
});
test('exact repeated teamflash: three effects and six teammate rows; ambiguous excluded',()=>{
  const m=match([flashes()]),a=run(m),f=rule(a,'teamflash-repeated');assert.ok(f,JSON.stringify(a));
  assert.equal(f.kind,'context');assert.equal(a.reviews.length,0);
  assert.equal(f.occurrences,3);assert.equal(f.facts.teammateEffects,6);assert.ok(f.caveats.some(c=>c.includes('continuous blind duration')));
  const ambiguous=run(match([[...flashes(),...flash(1,400)]]));assert.equal(rule(ambiguous,'teamflash-repeated'),undefined);
  assert.equal(rule(run(match([[...flash(1,100,['2']),...flash(2,200,['2']),...flash(3,300,['2'])]])),'teamflash-repeated'),undefined);
});
test('Scenario D: low HE / unavailable fire / smoke without damage produce no utility finding',()=>{
  const m=match([[{type:'utility',tick:100,utility:'hegrenade',action:'detonate',thrower:'1',throwerSide:'CT'},
    damage(100,'1','6',1,{weapon:'hegrenade'}),{type:'utility',tick:200,utility:'fire',action:'start_burn',thrower:'1',throwerSide:'CT'},
    {type:'utility',tick:300,utility:'smoke',action:'detonate',thrower:'1',throwerSide:'CT'}]]);
  const a=inputs(m);assert.equal(a.utility.effects.find(c=>c.directOutcome.kind==='fire').directOutcome.reportedEnemyDamage,null);
  assert.equal(a.utility.effects.find(c=>c.directOutcome.kind==='fire').directOutcome.linkage,'unavailable');
  assert.equal(all(evaluate(m,a)).length,0);
});
test('irrelevant missing spatial/fire evidence is accepted with caveat; relevant partial excluded',()=>{
  const m=match(repeat(5,returns)),a=inputs(m),r=evaluate(m,a);const f=rule(r,'return-contact-consistent');
  assert.equal(f.evidenceQuality,'partial');assert.ok(f.caveats.some(c=>c.includes('spatialContext')));
  for(const c of a.execution.playerEngagementExecutions.filter(c=>c.playerId==='1')) for(const p of c.opponentExchanges) p.coverage.contactEvidence={status:'partial',reasons:['contact-feed-incomplete']};
  assert.equal(rule(evaluate(m,a),'return-contact-consistent'),undefined);
});
test('input match mismatches only suppress dependent rules',()=>{
  const m=match([swing(),...repeat(5,returns)]),a=inputs(m);a.execution.matchId='stale';const r=evaluate(m,a);
  assert.ok(rule(r,'multikill-swing'));assert.equal(rule(r,'return-contact-consistent'),undefined);assert.equal(suppression(r,'return-contact-consistent'),'coverage-insufficient');
});
test('stale refs, duplicate identities, forged tags/outcomes cannot produce findings',()=>{
  for(const mutate of [a=>a.impact.multiKills[0].killCount++,a=>a.engagements.directContacts[0].eventRef.tick++,
    a=>a.impact.multiKills.push(structuredClone(a.impact.multiKills[0])),a=>a.impact.multiKills[0].tags.push('contains-sole-survivor-kill')]) {
    const m=match([swing()]),a=inputs(m);mutate(a);assert.equal(all(evaluate(m,a)).length,0);
  }
  const m=match(repeat(5,returns)),a=inputs(m);for(const c of a.execution.playerEngagementExecutions.filter(c=>c.playerId==='1')) c.opponentExchanges[0].returnOutcome='none-observed';
  assert.equal(rule(evaluate(m,a),'no-confirmed-return-pattern'),undefined);
});
test('valid no findings; unknown player unavailable, SteamID never numeric',()=>{
  const m=match(),a=run(m);assert.deepEqual(all(a),[]);assert.equal(a.consideredRules.length,8);
  assert.equal(analyzeDeepReviewFindings(m,'0',inputs(m)).coverage.status,'unavailable');
  assert.throws(()=>analyzeDeepReviewFindings(m,1,inputs(m)),TypeError);
});
test('caps, stable priority, deterministic IDs/JSON, exact refs, input immutable and JSON-only',()=>{
  const m=match([swing(),...repeat(5,noReturn),...repeat(5,lone),...repeat(5,noFollow),flashes()]),a=inputs(m),before=JSON.stringify({m,a});
  const r=evaluate(m,a);assert.ok(r.reviews.length<=3);assert.ok(r.highlights.length<=2);assert.ok(r.contexts.length<=1);
  assert.equal(new Set(all(r).map(f=>f.ruleId)).size,all(r).length);assert.equal(JSON.stringify(evaluate(m,a)),JSON.stringify(r));
  assert.equal(JSON.stringify({m,a}),before);assert.ok(jsonSafe(r));assert.deepEqual(r,JSON.parse(JSON.stringify(r)));
  for(const f of all(r)) for(const ref of f.evidenceRefs) {
    if(ref.kind==='multi-kill') assert.ok(a.impact.multiKills.some(c=>c.playerId===ref.playerId && c.round===ref.round));
    if(ref.kind==='opponent-exchange') assert.equal(a.execution.playerEngagementExecutions.flatMap(c=>c.opponentExchanges).filter(c=>c.playerId===ref.playerId && c.opponentId===ref.opponentId && c.engagementId===ref.engagementId).length,1);
  }
  assert.equal(r.reviews[0]?.ruleId,'deep.execution.no-confirmed-return-pattern');
  assert.equal(suppression(r,'teamflash-repeated'),'max-count-reached');
});
test('JSON validator rejects non plain data and nonfinite numbers',()=>{
  for(const v of [new Map(),new Set(),new Date(),1n,NaN,Infinity,new (class X{})()]) assert.equal(jsonSafe(v),false);
});
test('deleted positive teammate response rows cannot manufacture negative denominator',()=>{
  const m=match([...repeat(3,noFollow),...repeat(7,()=>[...noFollow(),damage(200,'1','6')])]),a=inputs(m);
  assert.equal(rule(evaluate(m,a),'no-followup-pattern'),undefined);
  let removed=0;a.teamplay.teammateDeathResponses=a.teamplay.teammateDeathResponses.filter(c=>!(c.playerId==='1'&&c.outcome==='damage'&&removed++<5));
  const r=evaluate(m,a);assert.equal(rule(r,'no-followup-pattern'),undefined);assert.ok(r.diagnostics.inputIssues.some(x=>x.startsWith('teamplay:')));
});
test('deleted death/impact/utility source rows suppress their rules',()=>{
  for(const mutate of [a=>a.teamplay.playerDeathContexts.pop(),a=>a.teamplay.playerDeathTeamResponses.pop()]) {
    const m=match(repeat(5,lone)),a=inputs(m);mutate(a);assert.equal(rule(evaluate(m,a),'lone-contact-death-pattern'),undefined);
  }
  const m=match([swing()]),a=inputs(m);a.impact.multiKills=[];assert.equal(suppression(evaluate(m,a),'multikill-swing'),'coverage-insufficient');
  const f=match([flashes()]),b=inputs(f);b.utility.effects.pop();assert.equal(suppression(evaluate(f,b),'teamflash-repeated'),'coverage-insufficient');
});
test('forged self-consistent atomic counts cannot manufacture sole-survivor highlight',()=>{
  const m=match([[kill(100,'1','6'),kill(110,'1','7'),kill(120,'1','8')]]),a=inputs(m);
  for(const g of a.impact.rounds[0].groups) {g.before.CT=1;g.after.CT=1;}
  for(const c of a.impact.kills) {c.before.teamAlive=1;c.afterAtomicGroup.teamAlive=1;c.tags=['sole-survivor-kill'];}
  const sequence=a.impact.multiKills[0];sequence.kills=structuredClone(a.impact.kills);sequence.tags=['contains-sole-survivor-kill'];
  const r=evaluate(m,a);assert.equal(rule(r,'sole-survivor-sequence'),undefined);assert.ok(r.diagnostics.inputIssues.includes('impact:stale-or-conflicting-source'));
});
test('stale clock cannot support a five-second absence finding',()=>{
  for(const rate of [undefined,0,128]) {
    const m=match(repeat(5,noFollow)),a=inputs(m);if(rate===undefined) delete m.tickRate;else m.tickRate=rate;
    const r=evaluate(m,a);assert.equal(rule(r,'no-followup-pattern'),undefined);assert.ok(r.diagnostics.inputIssues.length>0);
  }
});
test('same-tick atomic metadata cannot be forged into ordered impact',()=>{
  const m=match([[kill(100,'1','6'),kill(100,'1','7')]]),a=inputs(m);
  for(const c of a.impact.kills){c.atomicGroup.ordered=true;c.tags=['advantage-gain'];c.coverage.attribution={status:'complete',reasons:[]};}
  a.impact.multiKills[0].kills=structuredClone(a.impact.kills);a.impact.multiKills[0].tags=['contains-advantage-gain'];a.impact.multiKills[0].coverage.attribution={status:'complete',reasons:[]};
  assert.equal(rule(evaluate(m,a),'multikill-swing'),undefined);
});
test('same-tick alive uncertainty cannot be relabeled complete absence',()=>{
  const m=match(repeat(5,()=>[kill(100,'6','1'),kill(100,'7','2')])),a=inputs(m);
  for(const c of a.teamplay.playerDeathContexts.filter(c=>c.playerId==='1')){
    for(const key of ['engagementParticipation','aliveState','followUpTiming']){c.coverage[key]={status:'complete',reasons:[]};c.teamResponse.coverage[key]={status:'complete',reasons:[]};}
    c.teamResponse.outcome='none-observed';const index=a.teamplay.playerDeathTeamResponses.findIndex(z=>z.playerId==='1'&&z.deathRef.round===c.deathRef.round);a.teamplay.playerDeathTeamResponses[index]=structuredClone(c.teamResponse);
  }
  assert.equal(rule(evaluate(m,a),'lone-contact-death-pattern'),undefined);
});
test('new unknown-side raw contact invalidates stale complete absence',()=>{
  const m=match(repeat(5,noReturn)),a=inputs(m);for(const r of m.rounds)r.events.push(damage(105,'1','6',20,{attackerSide:'Unknown'}));
  assert.equal(rule(evaluate(m,a),'no-confirmed-return-pattern'),undefined);
});
test('stale end snapshot and lifecycle cannot preserve complete alive absence',()=>{
  for(const mutate of [r=>{r.stateSnapshots.find(s=>s.boundary==='end').players.find(p=>p.steamId==='1').alive=false;},
    r=>r.playerLifecycle.push({type:'spawn',tick:200,playerId:'1'}),r=>r.stateSnapshots.push(structuredClone(r.stateSnapshots.find(s=>s.boundary==='freeze_end')))]) {
    const m=match(repeat(5,noFollow)),a=inputs(m);for(const r of m.rounds) mutate(r);
    const result=evaluate(m,a);assert.equal(rule(result,'no-followup-pattern'),undefined);assert.ok(result.diagnostics.inputIssues.includes('impact:stale-or-conflicting-source'));
  }
});
