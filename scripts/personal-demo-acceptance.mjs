import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Demoparser2Provider } from '../packages/dem-parser/dist/index.js';
import { analyzeMatch } from '../packages/analytics/dist/index.js';
import { analyzeEngagements, analyzeKillImpact, analyzeTeamplay, analyzeUtilityContext, analyzeCombatExecution, analyzeDeepReviewFindings, classifyContactWeapon } from '../packages/deep-review/dist/index.js';
import { jsonSafe, refKey } from '../packages/deep-review/dist/findings-validation.js';
import { analyzeDemoFile } from '../apps/desktop/electron/report.ts';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const key=r=>JSON.stringify([r.round,r.type,r.tick,r.eventIndex]);
const findings=a=>[...a.reviews,...a.highlights,...a.contexts];
function jsonOnly(v) { if(typeof v==='number') assert.ok(Number.isFinite(v)); if(v&&typeof v==='object') for(const i of Object.values(v)) jsonOnly(i); }
function raw(match,ref) {const r=match.rounds.find(r=>r.number===ref.round),e=r?.events[ref.eventIndex];assert.ok(e);assert.equal(e.type,ref.type);assert.equal(e.tick,ref.tick);return e;}
function refsDeep(match,v) {if(!v||typeof v!=='object')return;if(Number.isInteger(v.eventIndex)&&Number.isInteger(v.round)&&v.type)raw(match,v);for(const i of Object.values(v))refsDeep(match,i);}
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

const native=createRequire(new URL('../packages/dem-parser/package.json',import.meta.url))('@cs2-analyst/demoparser-native');
const historicalReport=JSON.parse(await readFile(new URL('../docs/deep-review-personal-acceptance.json',import.meta.url),'utf8'));
const report={schemaVersion:2,baseline:'7b016278a8209b917df688b54be6763d04f53663',historicalGate:historicalReport.historicalGate??{baseline:historicalReport.baseline,status:historicalReport.status,parser:'official 0.42.0',fixtures:historicalReport.fixtures.map(f=>({identity:f.identity,gate:f.gate,requiredPartial:f.spatial.requiredPartial.length}))},nativeBinding:native.getBindingProvenance(),provenance:'Product Owner confirmed all three fixtures are their actual matches; not parser-inferred',fixtures:[]};
const manifest=JSON.parse(await readFile(new URL('../docs/deep-review-personal-fixtures.json',import.meta.url),'utf8'));
assert.deepEqual(manifest.fixtures.map(f=>f.filename),['.demo/demo1.dem','.demo/demo2.dem','.demo/demo3.dem']);
for(const fixture of manifest.fixtures) {
 const filename=fixture.filename.split('/').at(-1);
 const path=fileURLToPath(new URL('../.demo/'+filename,import.meta.url));
 const bytes=await readFile(path),sha=createHash('sha256').update(bytes).digest('hex'),header=native.parseHeader(bytes);
 let captured, preReportHash,calls=0,timings;
 const original=Demoparser2Provider.prototype.parseWithSpatial,old=Demoparser2Provider.prototype.parse;
 Demoparser2Provider.prototype.parse=()=>{throw Error('Repeated standalone parse forbidden');};
 Demoparser2Provider.prototype.parseWithSpatial=async function(...args){calls++;const p=await original.apply(this,args);captured=p;preReportHash=hash({match:p.match,spatial:p.spatial});return p;};
 let result;
 try {result=await analyzeDemoFile(path,undefined,t=>timings=t);} finally {Demoparser2Provider.prototype.parseWithSpatial=original;Demoparser2Provider.prototype.parse=old;}
 assert.equal(calls,1);assert.equal(result.kind,'success');
 const {match,spatial}=captured,baseline=hash({match,spatial});assert.equal(match.id,sha);assert.equal(sha,fixture.sha256);assert.equal(bytes.length,fixture.fileSize);assert.equal(match.map,fixture.map);assert.equal(header.map_name,fixture.map);assert.equal(baseline,preReportHash);
 const e=analyzeEngagements(match,spatial),k=analyzeKillImpact(match,e),team=analyzeTeamplay(match,e,k,spatial),utility=analyzeUtilityContext(match,spatial,k),a=analyzeCombatExecution(match,e,k,spatial);
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

 const evidence={engagements:e,impact:k,teamplay:team,utility,execution:a};
 const ids=match.players.map(p=>p.steamId).filter(id=>/^[1-9]\d*$/.test(id)).sort();
 const output=ids.map(id=>analyzeDeepReviewFindings(match,id,evidence));
    for(const player of output) {
      assert.deepEqual(player.diagnostics.inputIssues,[],`${filename}: validator must accept current production inputs`);
      assert.deepEqual(player.diagnostics.contradictions,[]);assert.ok(jsonSafe(player));assert.deepEqual(player,JSON.parse(JSON.stringify(player)));
      assert.ok(player.reviews.length<=3 && player.highlights.length<=2 && player.contexts.length<=1);
      const rows=findings(player);assert.equal(new Set(rows.map(f=>f.ruleId)).size,rows.length);
      for(const f of rows) for(const ref of f.evidenceRefs) assert.equal(sourceFor(ref,evidence).length,1);
      for(const f of rows) {
        const occurrenceRounds=f.evidenceRefs.flatMap(ref=>sourceFor(ref,evidence).map(s=>s.round??s.eventRef?.round??s.deathRef?.round??s.effectRef?.round));
        assert.deepEqual(f.relatedRounds,[...new Set(occurrenceRounds)].sort((a,b)=>a-b));
        if(f.ruleId==='deep.execution.no-confirmed-return-pattern' || f.ruleId==='deep.execution.return-contact-consistent') {
          const sources=f.evidenceRefs.map(ref=>sourceFor(ref,evidence)[0]);assert.equal(sources.length,f.occurrences);
          assert.equal(sources.filter(p=>f.kind==='review'?p.returnOutcome==='none-observed':['kill','damage'].includes(p.returnOutcome)).length,f.occurrences);
        }
        if(f.ruleId==='deep.teamplay.lone-contact-death-pattern') {
          const sources=f.evidenceRefs.filter(ref=>ref.kind==='player-death-response').map(ref=>sourceFor(ref,evidence)[0]);assert.equal(sources.length,f.occurrences);
          assert.equal(sources.filter(c=>c.onlyConfirmedSideParticipant===true&&c.teamResponse.outcome==='none-observed').length,f.occurrences);
        }
        if(f.ruleId==='deep.teamplay.no-followup-pattern') {
          const sources=f.evidenceRefs.map(ref=>sourceFor(ref,evidence)[0]);assert.equal(sources.length,f.occurrences);
          assert.equal(sources.filter(c=>c.outcome==='none-observed').length,f.occurrences);
        }
        if(f.ruleId==='deep.utility.teamflash-repeated') {
          const sources=f.evidenceRefs.map(ref=>sourceFor(ref,evidence)[0]);assert.equal(sources.length,f.occurrences);
          assert.equal(sources.reduce((n,c)=>n+c.directOutcome.teammateEffects.length,0),f.facts.teammateEffects);
        }
      }
    }

 const repeatE=analyzeEngagements(match,spatial),repeatK=analyzeKillImpact(match,repeatE);
 const repeated={engagements:repeatE,impact:repeatK,teamplay:analyzeTeamplay(match,repeatE,repeatK,spatial),utility:analyzeUtilityContext(match,spatial,repeatK),execution:analyzeCombatExecution(match,repeatE,repeatK,spatial)};
 assert.equal(hash(evidence),hash(repeated));assert.equal(hash(output),hash(ids.map(id=>analyzeDeepReviewFindings(match,id,repeated))));assert.equal(hash({match,spatial}),baseline);
 for(const kill of k.kills){if(kill.atomicGroup.deathCount>1)assert.equal(kill.atomicGroup.ordered,false);if(kill.posthumous){const state=k.rounds.find(r=>r.round===kill.eventRef.round).players.find(p=>p.playerId===kill.killerId);assert.ok(state.deathTick<kill.eventRef.tick);}}
 for(const state of k.rounds){
  if(state.coverage.status==='unavailable'){assert.ok(state.groups.every(g=>g.before===null&&g.after===null&&!g.appliedVictimIds.length));continue;}
  const round=match.rounds.find(r=>r.number===state.round),snapshot=round.stateSnapshots.find(s=>s.boundary===state.baseline.boundary&&s.tick===state.baseline.tick);
  const aliveSet=new Map(snapshot.players.filter(p=>p.participant===true&&p.alive===true).map(p=>[p.steamId,p.side]));
  const count=()=>({CT:[...aliveSet.values()].filter(s=>s==='CT').length,T:[...aliveSet.values()].filter(s=>s==='T').length});
  for(const group of state.groups){assert.deepEqual(group.before,count());for(const id of group.appliedVictimIds){assert.ok(aliveSet.has(id));aliveSet.delete(id);}assert.deepEqual(group.after,count());
   for(const ref of group.deathRefs){const kill=k.kills.find(k=>key(k.eventRef)===key(ref));if(!kill)continue;
    assert.deepEqual(kill.before,{teamAlive:group.before[kill.killerSide],enemyAlive:group.before[kill.victimSide]});assert.deepEqual(kill.afterAtomicGroup,{teamAlive:group.after[kill.killerSide],enemyAlive:group.after[kill.victimSide]});
    if(group.deathRefs.length>1)assert.ok(kill.tags.every(t=>['opening-group','sole-survivor-kill','posthumous'].includes(t)));
    if(kill.posthumous){assert.ok(!aliveSet.has(kill.killerId));assert.ok(!kill.tags.includes('sole-survivor-kill'));}
   }
  }
 }
 const expected=[...new Set(match.rounds.flatMap(r=>[r.startTick,r.freezeEndTick,r.endTick,...r.events.map(e=>e.tick)]).filter(t=>t!==undefined))].sort((a,b)=>a-b);
 assert.deepEqual(spatial.sampling.coreTicks,expected);
 const samples=new Map(),requiredPartial=[];let required=0;
 for(const ev of spatial.events){if(ev.eventRef.type!=='round_boundary')raw(match,ev.eventRef);for(const {sample:s,role} of ev.samples){if(s.actualTick!==null)assert.equal(s.actualTick,s.requestedTick);if(['at-event','boundary'].includes(s.relation)){assert.equal(s.requestedTick,ev.eventRef.tick);assert.equal(s.actualTick,ev.eventRef.tick);if(role!=='relevant'&&['kill','damage','weapon_fire'].includes(ev.eventRef.type)&&s.coverage.status!=='complete')requiredPartial.push({ref:ev.eventRef,role,sample:s});if(['kill','damage','weapon_fire'].includes(ev.eventRef.type)&&role!=='relevant')required++;}if(!s.coverage.reasons.includes('context-outside-round'))samples.set(s.requestedTick+':'+s.playerId,s);}}
 const rows=[...samples.values()],alive=rows.filter(s=>s.alive===true);
 const dto=result.report;jsonOnly(dto);assert.deepEqual(dto,JSON.parse(JSON.stringify(dto)));assert.equal(dto.schemaVersion,2);assert.equal(dto.deepReview.available,true);assert.deepEqual(dto.deepReview.players.map(p=>p.playerId),dto.players.map(p=>p.id));
 const analytics=analyzeMatch(match);assert.deepEqual(dto.players.map(p=>p.id).sort(),analytics.players.filter(p=>p.roundsPlayed>0).map(p=>p.steamId).sort());
 const actualTarget=dto.players.find(p=>p.nickname.trim()===fixture.targetNickname.trim());const target=actualTarget;
 for(const p of dto.players){assert.ok(dto.analytics.some(a=>a.playerId===p.id));assert.ok(dto.timeline.some(a=>a.playerId===p.id));}
 assert.ok(dto.analysis);assert.ok(dto.findings.length);assert.ok(dto.deepReview.players.every(p=>p.coverage.status!=='unavailable'));
 let repeatedParse,repeatCalls=0;Demoparser2Provider.prototype.parseWithSpatial=async function(...args){repeatCalls++;repeatedParse=await original.apply(this,args);return repeatedParse;};
 let repeat;try{repeat=await analyzeDemoFile(path,undefined,t=>timings=t);}finally{Demoparser2Provider.prototype.parseWithSpatial=original;}assert.equal(repeatCalls,1);assert.equal(hash({match:repeatedParse.match,spatial:repeatedParse.spatial}),baseline);assert.equal(repeat.kind,'success');assert.deepEqual(repeat.report,dto);assert.equal(hash({match,spatial}),baseline);
 const mine=dto.deepReview.players.find(p=>p.playerId===actualTarget?.id)??null;
 const entry={roster:dto.players,identity:{filename:'.demo/'+filename,sha256:sha,fileSize:(await stat(path)).size,header,map:match.map,tickRate:match.tickRate,roundCount:match.rounds.length,playerCount:match.players.length},parserProvenance:spatial.provenance,recordingMechanism:'UNKNOWN except raw header metadata; personal provenance confirmed by Product Owner',spatial:{requestedTicks:expected.length+spatial.sampling.optionalTicks.length,returnedTicks:spatial.sampling.returnedTicks.length,rows:spatial.sampling.rowCount,coreMissing:expected.filter(t=>!spatial.sampling.returnedTicks.includes(t)).length,optionalMissing:spatial.sampling.optionalTicks.filter(t=>!spatial.sampling.returnedTicks.includes(t)).length,omittedOptional:spatial.sampling.omittedOptionalTicks.length,requiredEventSamples:required,requiredPartial,coverage:spatial.coverage,uniqueSamples:rows.length,fieldCoverage:Object.fromEntries(['position','view','state','weapon'].map(f=>[f,Object.fromEntries(['complete','partial','unavailable'].map(st=>[st,rows.filter(s=>s.fields[f]===st).length]))])),aliveWeapons:{available:alive.filter(s=>s.activeWeapon!==null).length,total:alive.length}},pipeline:{engagements:e.diagnostics,impact:k.diagnostics,teamplay:team.diagnostics,utility:utility.diagnostics,execution:a.diagnostics,coverage:{engagement:e.coverage,impact:k.coverage,teamplay:team.coverage,utility:utility.coverage,execution:a.coverage},players:output.map(p=>({playerId:p.playerId,coverage:p.coverage,ruleIds:findings(p).map(f=>f.ruleId)}))},target:{requestedNickname:fixture.targetNickname,nicknamePresent:!!target,player:actualTarget??null,desktop:mine,domain:output.find(p=>p.playerId===actualTarget?.id)??null,timeline:dto.timeline.find(p=>p.playerId===actualTarget?.id)??null},desktop:{schemaVersion:dto.schemaVersion,available:dto.deepReview.available,players:dto.players.length,deterministicHash:hash(dto),status:'PASS'},verification:{nativeParsesPerImport:1,independentRepeatImports:1,deterministic:true,immutable:true,jsonOnly:true,allPipelineRefsTraceable:true,findingsExactRefs:true,relatedRoundsExact:true,noContradiction:true,ambiguousFireUnassigned:true,sameTickUnordered:true,posthumousNoResurrection:true},timingsMilliseconds:timings};
 entry.gate={status:requiredPartial.length||!actualTarget||k.coverage.roundState.status==='unavailable'?'FAIL':'PASS',blockers:[...(k.coverage.roundState.status==='unavailable'?['round-alive-state-unavailable']:[]),...(requiredPartial.length?['required-spatial-fields-missing']:[]),...(!actualTarget?['target-account-not-found']:[])]};report.fixtures.push(entry);console.log(filename,JSON.stringify({identity:entry.identity,requiredPartial:requiredPartial.length,gate:entry.gate,target:actualTarget??null,timings}));
}
report.status=report.fixtures.every(f=>f.gate.status==='PASS')?'PASS':'FAIL';
await writeFile(new URL('../docs/deep-review-personal-acceptance.json',import.meta.url),JSON.stringify(report,null,2)+'\n');

// Diagnostics are saved even when a mandatory compatibility check fails.
if(report.status!=='PASS')process.exitCode=1;
