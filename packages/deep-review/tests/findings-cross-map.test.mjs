import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { stat,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Demoparser2Provider } from '../../dem-parser/dist/index.js';
import { analyzeEngagements,analyzeKillImpact,analyzeTeamplay,analyzeUtilityContext,analyzeCombatExecution,analyzeDeepReviewFindings } from '../dist/index.js';
import { evaluateDeepReviewFindings } from '../dist/findings.js';
import { FINDINGS_POLICY,FINDINGS_RULES } from '../dist/findings-policy.js';
import { jsonSafe,refKey } from '../dist/findings-validation.js';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fixtures=[
  ['nuke.dem','de_nuke','dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c'],
  ['inferno.dem','de_inferno','b61c040074f84f1f2c1b683642923243dbe123c2a0c70ed3c0670b0e4cd7a265'],
  ['dust2.dem','de_dust2','db90fe85aab023a1d2c8a5996182e6120d98ef494f02a070b17982b235e4958c'],
  ['mirage.dem','de_mirage','62cb3af35c3893a91c7dd8c9007fdb1105950ec8963a46eca6006dac96655acb'],
];
const findings=a=>[...a.reviews,...a.highlights,...a.contexts];
const distributions=(rows,key)=>Object.fromEntries([...new Set(rows.map(r=>r[key]))].sort().map(v=>[v,rows.filter(r=>r[key]===v).length]));
function sourceFor(ref,a) {
  switch(ref.kind) {
    case 'engagement':return a.engagements.engagements.filter(g=>g.id===ref.engagementId);
    case 'kill':return a.impact.kills.filter(k=>refKey(k.eventRef)===refKey(ref.eventRef));
    case 'multi-kill':return a.impact.multiKills.filter(k=>k.playerId===ref.playerId&&k.round===ref.round);
    case 'teammate-death-response':return a.teamplay.teammateDeathResponses.filter(c=>c.playerId===ref.playerId&&c.teammateId===ref.teammateId&&refKey(c.deathRef)===refKey(ref.deathRef));
    case 'player-death-response':return a.teamplay.playerDeathContexts.filter(c=>c.playerId===ref.playerId&&refKey(c.deathRef)===refKey(ref.deathRef));
    case 'utility-effect':return a.utility.effects.filter(c=>refKey(c.effectRef)===refKey(ref.effectRef));
    case 'execution-engagement':return a.execution.playerEngagementExecutions.filter(c=>c.playerId===ref.playerId&&c.engagementId===ref.engagementId);
    case 'opponent-exchange':return a.execution.playerEngagementExecutions.flatMap(c=>c.opponentExchanges).filter(c=>c.playerId===ref.playerId&&c.opponentId===ref.opponentId&&c.engagementId===ref.engagementId);
    default:throw new Error('unknown ref');
  }
}
function summary(ref,a) {
  const s=sourceFor(ref,a)[0];
  if(ref.kind==='multi-kill') return {ref,killCount:s.killCount,tags:s.tags,roundResult:s.roundResult,kills:s.kills.map(k=>({eventRef:k.eventRef,before:k.before,afterAtomicGroup:k.afterAtomicGroup,tags:k.tags})),coverage:s.coverage};
  if(ref.kind==='kill') return {ref,before:s.before,afterAtomicGroup:s.afterAtomicGroup,tags:s.tags,coverage:s.coverage};
  if(ref.kind==='opponent-exchange') return {ref,round:s.round,firstContactRole:s.firstContactRole,firstReceivedRef:s.firstReceivedRef,firstDealtRef:s.firstDealtRef,returnOutcome:s.returnOutcome,returnContactRef:s.returnContactRef,returnOutcomeRef:s.returnOutcomeRef,coverage:s.coverage};
  if(ref.kind==='player-death-response') return {ref,killerId:s.killerId,engagementId:s.engagementId,onlyConfirmedSideParticipant:s.onlyConfirmedSideParticipant,teamResponse:s.teamResponse,coverage:s.coverage};
  if(ref.kind==='teammate-death-response') return {ref,killerId:s.killerId,playerAliveAtDeath:s.playerAliveAtDeath,killerState:s.killerState,outcome:s.outcome,firstFollowUpRef:s.firstFollowUpRef,outcomeRef:s.outcomeRef,coverage:s.coverage};
  if(ref.kind==='utility-effect') return {ref,throwerId:s.throwerId,entityId:s.entityId,directOutcome:s.directOutcome,coverage:s.coverage};
  return {ref,coverage:s.coverage};
}
const patternRules=['deep.execution.no-confirmed-return-pattern','deep.teamplay.lone-contact-death-pattern','deep.teamplay.no-followup-pattern'];
function ruleReport(outputs,policy=FINDINGS_POLICY) {
  return FINDINGS_RULES.map(ruleId=>{
    const eligible=outputs.filter(a=>{
      const d=a.diagnostics.rules.find(d=>d.ruleId===ruleId);
      const blocked=a.suppressedRules.find(r=>r.ruleId===ruleId)?.reason==='coverage-insufficient';
      const minimum=patternRules.includes(ruleId)?policy.pattern.minimumEligible:ruleId.endsWith('return-contact-consistent')?policy.positive.minimumEligible:ruleId.endsWith('teamflash-repeated')?policy.teamflash.minimumEffects:1;
      return !blocked && d.eligibleOccurrences>=minimum;
    });
    const triggered=outputs.filter(a=>a.diagnostics.rules.find(d=>d.ruleId===ruleId).triggered);
    const emitted=outputs.filter(a=>findings(a).some(f=>f.ruleId===ruleId));
    const triggerRate=eligible.length?triggered.length/eligible.length:null;
    const finalKind=ruleId==='deep.execution.no-confirmed-return-pattern'?'review'
      : ruleId.startsWith('deep.teamplay.') || ruleId.endsWith('teamflash-repeated') || ruleId.endsWith('multikill-unconverted')?'context':'highlight';
    return {ruleId,finalKind,playersEligible:eligible.length,playersTriggered:triggered.length,playersEmitted:emitted.length,triggerRate,
      warning:patternRules.includes(ruleId)||ruleId.endsWith('teamflash-repeated')?triggerRate!==null && triggerRate>policy.overbreadthRate
        ?finalKind==='review'?'overbreadth-review-required':'high-trigger-rate-context-observation':null:null};
  });
}
const report={schemaVersion:1,purpose:'Development diagnostics, not production golden or skill comparisons',personalDemCompatibility:'UNVERIFIED',train:'REMOVED / NOT REQUIRED',policy:FINDINGS_POLICY,maps:[],aggregateRules:[],thresholdSensitivity:[],manualEvidenceInspection:[]};
test('four professional fixtures: one parse each, same production rules, exact refs, deterministic JSON',async t=>{
  const combined=[],sensitivity=new Map();
  for(const [filename,map,sha] of fixtures) await t.test(filename,{skip:!existsSync(fileURLToPath(new URL(`../../../.demo/${filename}`,import.meta.url)))?`Missing mandatory exact fixture ${filename}; no substitute or download`:false},async()=>{
    const path=fileURLToPath(new URL(`../../../.demo/${filename}`,import.meta.url)),start=performance.now();
    const {match,spatial}=await new Demoparser2Provider().parseWithSpatial(path),parsed=performance.now();
    assert.equal(match.map,map);if(sha) assert.equal(match.id,sha);
    const baseline=hash({match,spatial}),pipelineStart=performance.now();
    const engagements=analyzeEngagements(match,spatial),impact=analyzeKillImpact(match,engagements);
    const teamplay=analyzeTeamplay(match,engagements,impact,spatial),utility=analyzeUtilityContext(match,spatial,impact),execution=analyzeCombatExecution(match,engagements,impact,spatial);
    const a={engagements,impact,teamplay,utility,execution},evidenceDone=performance.now(),evidenceHash=hash(a);
    const ids=match.players.map(p=>p.steamId).filter(id=>/^[1-9]\d*$/.test(id)).sort();
    const findingsStart=performance.now(),output=ids.map(id=>analyzeDeepReviewFindings(match,id,a)),end=performance.now();
    assert.equal(hash(output),hash(ids.map(id=>analyzeDeepReviewFindings(match,id,a))));assert.equal(hash(a),evidenceHash);assert.equal(hash({match,spatial}),baseline);
    for(const player of output) {
      assert.deepEqual(player.diagnostics.inputIssues,[],`${filename}: validator must accept current production inputs`);
      assert.deepEqual(player.diagnostics.contradictions,[]);assert.ok(jsonSafe(player));assert.deepEqual(player,JSON.parse(JSON.stringify(player)));
      assert.ok(player.reviews.length<=3 && player.highlights.length<=2 && player.contexts.length<=1);
      const rows=findings(player);assert.equal(new Set(rows.map(f=>f.ruleId)).size,rows.length);
      for(const f of rows) for(const ref of f.evidenceRefs) assert.equal(sourceFor(ref,a).length,1);
      for(const f of rows) {
        const occurrenceRounds=f.evidenceRefs.flatMap(ref=>sourceFor(ref,a).map(s=>s.round??s.eventRef?.round??s.deathRef?.round??s.effectRef?.round));
        assert.deepEqual(f.relatedRounds,[...new Set(occurrenceRounds)].sort((a,b)=>a-b));
        if(f.ruleId==='deep.execution.no-confirmed-return-pattern' || f.ruleId==='deep.execution.return-contact-consistent') {
          const sources=f.evidenceRefs.map(ref=>sourceFor(ref,a)[0]);assert.equal(sources.length,f.occurrences);
          assert.equal(sources.filter(p=>f.kind==='review'?p.returnOutcome==='none-observed':['kill','damage'].includes(p.returnOutcome)).length,f.occurrences);
        }
        if(f.ruleId==='deep.teamplay.lone-contact-death-pattern') {
          const sources=f.evidenceRefs.filter(ref=>ref.kind==='player-death-response').map(ref=>sourceFor(ref,a)[0]);assert.equal(sources.length,f.occurrences);
          assert.equal(sources.filter(c=>c.onlyConfirmedSideParticipant===true&&c.teamResponse.outcome==='none-observed').length,f.occurrences);
        }
        if(f.ruleId==='deep.teamplay.no-followup-pattern') {
          const sources=f.evidenceRefs.map(ref=>sourceFor(ref,a)[0]);assert.equal(sources.length,f.occurrences);
          assert.equal(sources.filter(c=>c.outcome==='none-observed').length,f.occurrences);
        }
        if(f.ruleId==='deep.utility.teamflash-repeated') {
          const sources=f.evidenceRefs.map(ref=>sourceFor(ref,a)[0]);assert.equal(sources.length,f.occurrences);
          assert.equal(sources.reduce((n,c)=>n+c.directOutcome.teammateEffects.length,0),f.facts.teammateEffects);
        }
      }
    }
    const rules=ruleReport(output),entry={fixture:{filename,sha256:match.id,map:match.map,fileSize:(await stat(path)).size,tickRate:match.tickRate,rounds:match.rounds.length,players:match.players.length},
      identifiablePlayers:ids.length,noFindingPlayers:output.filter(o=>findings(o).length===0).length,rules,
      players:output.map(o=>({playerId:o.playerId,emittedRuleIds:findings(o).map(f=>f.ruleId),suppressedReasons:o.suppressedRules,evidenceQuality:distributions(findings(o),'evidenceQuality'),coverage:o.coverage,ruleDiagnostics:o.diagnostics.rules})),
      suppressedReasons:distributions(output.flatMap(o=>o.suppressedRules),'reason'),evidenceQuality:distributions(output.flatMap(findings),'evidenceQuality'),deterministicHash:hash(output),
      overbreadthWarnings:rules.filter(r=>r.warning).map(r=>r.ruleId),timingsMilliseconds:{parseWithSpatial:parsed-start,fullDeepReviewPipeline:evidenceDone-pipelineStart+end-findingsStart,findingsV2Only:end-findingsStart},
      verification:{nativeParses:1,deterministic:true,immutable:true,jsonOnly:true,exactRefs:true,contradictions:0}};
    combined.push(...output);report.maps.push(entry);t.diagnostic(JSON.stringify({fixture:entry.fixture,noFindingPlayers:entry.noFindingPlayers,rules,timingsMilliseconds:entry.timingsMilliseconds}));
    for(const minimumEligible of [4,5,6]) for(const minimumRate of [.4,.5,.6]) {
      const policy={...FINDINGS_POLICY,pattern:{minimumEligible,minimumOccurrences:3,minimumRate}};
      const values=ids.map(id=>evaluateDeepReviewFindings(match,id,a,policy)),key=`${minimumEligible}:${minimumRate}`;
      const rows=sensitivity.get(key)??[];rows.push({fixture:filename,rules:ruleReport(values,policy)});sensitivity.set(key,rows);
    }
    // Automatic sampling of first triggered review per rule; inspect the exact
    // denominator and observed occurrences rather than interpreting professional status.
    for(const ruleId of rules.filter(r=>r.warning).map(r=>r.ruleId)) {
      const owner=output.find(o=>findings(o).some(f=>f.ruleId===ruleId)),f=owner&&findings(owner).find(f=>f.ruleId===ruleId);
      if(f) {
        const sources=f.evidenceRefs.map(ref=>summary(ref,a));
        const occurrences=sources.filter(s=>ruleId.endsWith('lone-contact-death-pattern')?s.onlyConfirmedSideParticipant===true&&s.teamResponse?.outcome==='none-observed'
          :ruleId.endsWith('no-followup-pattern')?s.outcome==='none-observed':s.directOutcome?.teammateEffects?.length>0);
        report.manualEvidenceInspection.push({fixture:filename,ruleId,playerId:owner.playerId,finding:f,sourceEvidence:sources,
          occurrenceExamples:occurrences.slice(0,3),inspection:'Exact refs and required coverage/outcomes verified; data-only inspection, no LOS/supportability/tactical-value claim; thresholds retained'});
      }
    }
    if(filename==='nuke.dem' && process.env.FINDINGS_NUKE_REPORT_FILE) {
      const catalog={multikillSwing:'deep.impact.multikill-swing',soleSurvivor:'deep.impact.sole-survivor-sequence',lost3K:'deep.impact.multikill-unconverted',executionNoReturn:'deep.execution.no-confirmed-return-pattern',executionPositive:'deep.execution.return-contact-consistent',loneContactDeath:'deep.teamplay.lone-contact-death-pattern',noFollowup:'deep.teamplay.no-followup-pattern',teamflash:'deep.utility.teamflash-repeated'};
      const samples=Object.fromEntries(Object.entries(catalog).map(([name,ruleId])=>{
        const owner=output.find(o=>findings(o).some(f=>f.ruleId===ruleId || name==='lost3K'&&f.facts.unconverted));
        const f=owner&&findings(owner).find(f=>f.ruleId===ruleId || name==='lost3K'&&f.facts.unconverted);
        return [name,f?{finding:f,facts:f.facts,refs:f.evidenceRefs,sourceEvidenceSummary:f.evidenceRefs.map(ref=>summary(ref,a)),coverage:owner.coverage,caveats:f.caveats,suppression:owner.suppressedRules}:null];
      }));
      const zero=output.find(o=>findings(o).length===0);samples.zeroFindingPlayer=zero??null;
      await writeFile(process.env.FINDINGS_NUKE_REPORT_FILE,JSON.stringify({fixture:entry.fixture,selection:'First matching structural predicate; absent cases null; no hardcoded player/name/round',samples,players:output,limitations:'Data/evidence inspection only, no visual demo replay; personal DEM UNVERIFIED'},null,2)+'\n');
    }
  });
  report.aggregateRules=ruleReport(combined);
  report.thresholdSensitivity=[...sensitivity].map(([key,maps])=>({minimumEligible:Number(key.split(':')[0]),minimumOccurrences:3,minimumRate:Number(key.split(':')[1]),maps}));
  report.mandatoryFixturesMissing=fixtures.map(([name])=>name).filter(name=>!report.maps.some(m=>m.fixture.filename===name));
  if(process.env.FINDINGS_CROSS_MAP_REPORT_FILE) await writeFile(process.env.FINDINGS_CROSS_MAP_REPORT_FILE,JSON.stringify(report,null,2)+'\n');
});
