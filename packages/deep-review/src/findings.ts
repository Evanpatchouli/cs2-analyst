import type { Match } from "@cs2-analyst/match-model";
import type { PlayerRoundMultiKillImpact } from "./impact-contracts.js";
import type { DeepReviewFinding, DeepReviewFindingsAnalysis, DeepReviewRuleId, DeepReviewSuppressionReason } from "./findings-contracts.js";
import { FINDINGS_POLICY, FINDINGS_RULES } from "./findings-policy.js";
import type { FindingsPolicy } from "./findings-policy.js";
import { findingSourceIndex, refKey, canonical } from "./findings-validation.js";
import type { FindingsInputs } from "./findings-validation.js";

type Layer = { status: string; reasons: string[] };
const complete = (l: Layer) => l.status === "complete" && l.reasons.length === 0;
const sortedUnique = (n: number[]) => [...new Set(n)].sort((a,b) => a-b);
const partialCaveats = <T extends { [K in keyof T]: Layer }>(coverage: T, required: string[]) => (Object.entries(coverage) as [string, Layer][])
  .filter(([key, layer]) => !required.includes(key) && !complete(layer))
  .map(([key, layer]) => `未用于此规则的 ${key} 证据为 ${layer.status}${layer.reasons.length ? `（${[...layer.reasons].sort().join("、")}）` : ""}；不影响本规则使用的确认事实。`);
const quality = (caveats: string[]): "complete" | "partial" => caveats.some(c => c.startsWith("未用于此规则")) ? "partial" : "complete";
const executionCaveat = "该 evidence 不等于人类反应时间或枪法评分。";
const teamCaveat = "这不证明空间孤立、错误站位或队友具备支援条件。";
const followCaveat = "这不是 P3 Trade 定义，不证明存在 LOS 或正式补枪机会；确认参与者属于整个 Engagement，不证明阵亡前已参与。";

/** Public production entry: fixed policy, pure JS aggregation of validated inputs. */
export function analyzeDeepReviewFindings(match: Match, playerId: string, inputs: FindingsInputs): DeepReviewFindingsAnalysis {
  return evaluateDeepReviewFindings(match, playerId, inputs, FINDINGS_POLICY);
}

/** Internal developer entry for threshold sensitivity; deliberately absent from package exports. */
export function evaluateDeepReviewFindings(match: Match, playerId: string, inputs: FindingsInputs, policy: FindingsPolicy): DeepReviewFindingsAnalysis {
  if (typeof match.id !== "string" || typeof playerId !== "string") throw new TypeError("Match and player identities must be strings");
  const source = findingSourceIndex(match, inputs);
  const result: DeepReviewFindingsAnalysis = { matchId: match.id, playerId, reviews: [], highlights: [], contexts: [],
    consideredRules: [...FINDINGS_RULES], suppressedRules: [],
    diagnostics: { inputIssues: source.issues, contradictions: [], rules: [] },
    coverage: { status: "complete", excludedOccurrences: 0, caveats: [] } };
  const candidates: DeepReviewFinding[] = [];
  const suppress = (ruleId: DeepReviewRuleId, reason: DeepReviewSuppressionReason) => {
    if (!result.suppressedRules.some(r => r.ruleId === ruleId)) result.suppressedRules.push({ruleId,reason});
  };
  const record = (ruleId: DeepReviewRuleId, eligible: number, occurrences: number, triggered: boolean) => {
    result.diagnostics.rules.push({ruleId,eligibleOccurrences:eligible,occurrences,triggered,emitted:false});
  };
  const add = (ruleId: DeepReviewRuleId, fields: Omit<DeepReviewFinding,"id"|"ruleId"|"playerId"|"evidenceQuality">) => {
    const caveats = [...new Set(fields.caveats)].sort();
    const evidenceRefs = [...new Map(fields.evidenceRefs.map(r => [canonical(r), r])).values()].sort((a,b) => canonical(a)<canonical(b)?-1:canonical(a)>canonical(b)?1:0);
    candidates.push({ ...fields, id: `deep-finding:${encodeURIComponent(match.id)}:${encodeURIComponent(playerId)}:${ruleId}`,
      ruleId, playerId, relatedRounds:sortedUnique(fields.relatedRounds), evidenceRefs:structuredClone(evidenceRefs),
      facts:{...fields.facts}, caveats, evidenceQuality:quality(caveats) });
  };
  const pattern = (ruleId: DeepReviewRuleId, valid: boolean, eligible: number, occurrences: number,
    threshold: FindingsPolicy["pattern"], excluded: number) => {
    const reason: DeepReviewSuppressionReason | null = !valid ? "coverage-insufficient"
      : eligible < threshold.minimumEligible ? (eligible===0 && excluded>0 ? "coverage-insufficient" : "insufficient-denominator")
      : occurrences < threshold.minimumOccurrences ? "insufficient-occurrences"
      : occurrences/eligible < threshold.minimumRate ? "rate-below-threshold" : null;
    record(ruleId,eligible,occurrences,!reason); if(reason) suppress(ruleId,reason); return !reason;
  };
  if (!match.players.some(p => p.steamId===playerId && /^[1-9]\d*$/.test(p.steamId))) {
    for(const ruleId of FINDINGS_RULES) { record(ruleId,0,0,false); suppress(ruleId,"not-applicable"); }
    result.coverage.status="unavailable"; result.coverage.caveats=["Player is not an identifiable member of Match.players."]; return result;
  }
  const multi = source.impactValid ? inputs.impact.multiKills.filter(m=>m.playerId===playerId) : [];
  const impactComplete = (m: PlayerRoundMultiKillImpact) => complete(m.coverage.roundState) && complete(m.coverage.attribution);
  const swingTags = ["contains-equalizer","contains-advantage-gain","contains-deficit-reduction","contains-enemy-elimination"] as const;
  const swingCount = (m: PlayerRoundMultiKillImpact) => swingTags.filter(tag=>m.tags.includes(tag)).length;
  const compareMulti = (a: PlayerRoundMultiKillImpact,b: PlayerRoundMultiKillImpact) => b.killCount-a.killCount || swingCount(b)-swingCount(a)
    || Number(b.roundResult==="win")-Number(a.roundResult==="win") || a.round-b.round || a.firstKillTick-b.firstKillTick;
  const swing = multi.filter(m=>m.killCount>=policy.impact.minimumKills && impactComplete(m) && swingCount(m)>0).sort(compareMulti);
  const sole = multi.filter(m=>m.killCount>=policy.impact.minimumKills && impactComplete(m) && m.tags.includes("contains-sole-survivor-kill")).sort(compareMulti);
  const lost = multi.filter(m=>m.killCount>=policy.impact.unconvertedMinimumKills && impactComplete(m) && m.roundResult==="loss").sort(compareMulti);
  const impactFinding = (ruleId: DeepReviewRuleId, rows: PlayerRoundMultiKillImpact[], kind: "highlight"|"context") => {
    record(ruleId,rows.length,rows.length,source.impactValid && rows.length>0);
    if(!source.impactValid || !rows.length) {suppress(ruleId,!source.impactValid || multi.some(m=>!impactComplete(m)) ? "coverage-insufficient":"not-applicable"); return;}
    const m=rows[0];
    const soleRule=ruleId==="deep.impact.sole-survivor-sequence", lostRule=kind==="context";
    const transitions = swingTags.filter(tag=>m.tags.includes(tag)).map(tag=>({"contains-equalizer":"完成人数扳平","contains-advantage-gain":"建立人数优势",
      "contains-deficit-reduction":"缩小人数劣势","contains-enemy-elimination":"完成敌方存活人数归零"})[tag]);
    const summary = lostRule ? `R${m.round} 完成 ${m.killCount}K，但该回合最终失利。`
      : soleRule ? `R${m.round} 完成 ${m.killCount}K，其中本方仅剩该玩家存活时继续完成确认击杀。`
      : `R${m.round} 的 ${m.killCount}K 序列包含${transitions.join("、")}的确认人数变化${m.roundResult==="win"?"，该回合最终获胜":m.roundResult==="loss"?"，该回合最终失利":""}。`;
    add(ruleId,{ category:"impact",kind,title:lostRule?"多杀回合结果回看":soleRule?"仅剩本人存活时的击杀序列":"多杀人数变化亮点",summary,
      occurrences:1,eligibleOccurrences:rows.length,relatedRounds:[m.round],
      evidenceRefs:[{kind:"multi-kill",playerId,round:m.round},...m.kills.map(k=>({kind:"kill" as const,eventRef:{...k.eventRef}}))],
      facts:{killCount:m.killCount,roundResult:m.roundResult,sequenceRound:m.round,qualifiedSequences:rows.length,
        equalizer:m.tags.includes("contains-equalizer"),advantageGain:m.tags.includes("contains-advantage-gain"),deficitReduction:m.tags.includes("contains-deficit-reduction"),
        enemyEliminated:m.tags.includes("contains-enemy-elimination"),soleSurvivor:m.tags.includes("contains-sole-survivor-kill")},
      caveats:["人数变化与回合结果是观察事实，不证明某次击杀导致回合获胜。",...partialCaveats(m.coverage,["roundState","attribution"])] });
  };
  impactFinding("deep.impact.multikill-swing",swing,"highlight");
  impactFinding("deep.impact.sole-survivor-sequence",sole,"highlight");
  impactFinding("deep.impact.multikill-unconverted",lost,"context");
  const swingCandidate=candidates.find(f=>f.ruleId==="deep.impact.multikill-swing"), soleCandidate=candidates.find(f=>f.ruleId==="deep.impact.sole-survivor-sequence");
  if(swingCandidate && soleCandidate && swingCandidate.facts.sequenceRound===soleCandidate.facts.sequenceRound) {
    soleCandidate.summary=`${swingCandidate.summary} 本方仅剩该玩家存活时仍有确认击杀。`;
    soleCandidate.facts={...swingCandidate.facts,...soleCandidate.facts};
    candidates.splice(candidates.indexOf(swingCandidate),1); suppress(swingCandidate.ruleId,"deduplicated");
  }
  // The same lost sequence adds context to its highlight rather than a second card.
  const lostCandidate=candidates.find(f=>f.ruleId==="deep.impact.multikill-unconverted");
  const duplicateImpact=lostCandidate && candidates.find(f=>f.kind==="highlight" && f.category==="impact" && f.facts.sequenceRound===lostCandidate.facts.sequenceRound);
  if(lostCandidate && duplicateImpact) {
    duplicateImpact.facts.unconverted=true;
    if(!duplicateImpact.summary.includes("失利")) duplicateImpact.summary+=" 该回合最终失利。";
    candidates.splice(candidates.indexOf(lostCandidate),1); suppress(lostCandidate.ruleId,"deduplicated");
  }

  const pairs=source.executionValid ? inputs.execution.playerEngagementExecutions.filter(c=>c.playerId===playerId).flatMap(c=>c.opponentExchanges) : [];
  const executionRequired=["engagementLinkage","contactEvidence","returnContact"];
  // Findings eligibility uses exact refs; frozen Execution role remains unknown for one-sided contact.
  const eligiblePairs=pairs.filter(p=>p.firstReceivedRef!==null && (p.firstDealtRef===null || p.firstReceivedRef.tick<p.firstDealtRef.tick) && ["kill","damage","none-observed"].includes(p.returnOutcome)
    && executionRequired.every(key=>complete(p.coverage[key as keyof typeof p.coverage])));
  const none=eligiblePairs.filter(p=>p.returnOutcome==="none-observed").length, success=eligiblePairs.length-none;
  const executionExcluded=pairs.length-eligiblePairs.length; result.coverage.excludedOccurrences+=executionExcluded;
  const executionCaveats=eligiblePairs.flatMap(p=>partialCaveats(p.coverage,executionRequired));
  const negative=pattern("deep.execution.no-confirmed-return-pattern",source.executionValid,eligiblePairs.length,none,policy.pattern,executionExcluded);
  const positive=pattern("deep.execution.return-contact-consistent",source.executionValid,eligiblePairs.length,success,policy.positive,executionExcluded);
  if(negative && positive) {
    for(const rule of ["deep.execution.no-confirmed-return-pattern","deep.execution.return-contact-consistent"] as const) suppress(rule,"contradiction");
    result.diagnostics.contradictions.push("execution:opposing-patterns-on-same-denominator");
  } else if(negative || positive) {
    const occurrences=eligiblePairs.filter(p=>negative?p.returnOutcome==="none-observed":["kill","damage"].includes(p.returnOutcome));
    add(negative?"deep.execution.no-confirmed-return-pattern":"deep.execution.return-contact-consistent",{
      category:"execution",kind:negative?"review":"highlight",title:negative?"先受接触后的反向接触回看":"确认反向接触记录",
      summary:negative?`在 ${eligiblePairs.length} 次有完整所需证据、你先受到确认接触的交火中，${none} 次未观察到你对同一对手形成确认反向接触。`
        :`在 ${eligiblePairs.length} 次先受到确认接触的可判定交火中，${success} 次随后对同一对手形成确认伤害或击杀。`,
      occurrences:negative?none:success,eligibleOccurrences:eligiblePairs.length,relatedRounds:occurrences.map(p=>p.round),
      evidenceRefs:occurrences.map(p=>({kind:"opponent-exchange",playerId,opponentId:p.opponentId,engagementId:p.engagementId})),
      facts:{noneObserved:none,confirmedReturns:success,receivedOnly:eligiblePairs.filter(p=>p.firstDealtRef===null).length,denominator:"exact-received-first-opponent-exchanges"},caveats:[executionCaveat,...executionCaveats] });
  }
  const deaths=source.teamplayValid ? inputs.teamplay.playerDeathContexts.filter(c=>c.playerId===playerId) : [];
  const loneRequired=["engagementParticipation","aliveState","followUpTiming"];
  const eligibleDeaths=deaths.filter(c=>loneRequired.every(key=>complete(c.coverage[key as keyof typeof c.coverage]))
    && loneRequired.every(key=>complete(c.teamResponse.coverage[key as keyof typeof c.coverage]))
    && ["kill","damage","none-observed"].includes(c.teamResponse.outcome));
  const lone=eligibleDeaths.filter(c=>c.onlyConfirmedSideParticipant===true && c.teamResponse.outcome==="none-observed");
  const loneExcluded=deaths.length-eligibleDeaths.length; result.coverage.excludedOccurrences+=loneExcluded;
  if(pattern("deep.teamplay.lone-contact-death-pattern",source.teamplayValid,eligibleDeaths.length,lone.length,policy.pattern,loneExcluded)) {
    add("deep.teamplay.lone-contact-death-pattern",{category:"teamplay",kind:"context",title:"仅本人确认接触的死亡记录",
      summary:`在 ${eligibleDeaths.length} 次所需证据完整的死亡场景中，${lone.length} 次该 Engagement 中本方只有你产生确认 direct contact，随后也没有观察到队友对同一击杀者形成确认接触。`,
      occurrences:lone.length,eligibleOccurrences:eligibleDeaths.length,relatedRounds:lone.map(c=>c.deathRef.round),
      evidenceRefs:lone.map(c=>({kind:"player-death-response",playerId,deathRef:{...c.deathRef}})),
      facts:{loneContactDeaths:lone.length,followUpWindowSeconds:inputs.teamplay.config.followUpWindowSeconds},
      caveats:[teamCaveat,...eligibleDeaths.flatMap(c=>partialCaveats(c.coverage,loneRequired))] });
  }
  const responses=source.teamplayValid ? inputs.teamplay.teammateDeathResponses.filter(c=>c.playerId===playerId) : [];
  const followRequired=["engagementParticipation","aliveState","followUpTiming"];
  const eligibleResponses=responses.filter(c=>c.playerAliveAtDeath===true && c.killerState==="alive-after-death" && ["kill","damage","none-observed"].includes(c.outcome)
    && c.sideParticipantCount!==null
    && followRequired.every(key=>complete(c.coverage[key as keyof typeof c.coverage])));
  const noFollow=eligibleResponses.filter(c=>c.outcome==="none-observed");
  const followExcluded=responses.length-eligibleResponses.length; result.coverage.excludedOccurrences+=followExcluded;
  if(pattern("deep.teamplay.no-followup-pattern",source.teamplayValid,eligibleResponses.length,noFollow.length,policy.pattern,followExcluded)) {
    const window=inputs.teamplay.config.followUpWindowSeconds;
    add("deep.teamplay.no-followup-pattern",{category:"teamplay",kind:"context",title:"同 Engagement 队友阵亡后的接触记录",
      summary:`在对应 Engagement 中有你的确认参与记录、且你与击杀者仍存活的 ${eligibleResponses.length} 次队友阵亡场景中，${noFollow.length} 次在 ${window} 秒 evidence window 内没有观察到你对同一击杀者产生确认 direct contact。确认参与仅指整个 Engagement 内存在 direct contact，不证明阵亡前已参与。`,
      occurrences:noFollow.length,eligibleOccurrences:eligibleResponses.length,relatedRounds:noFollow.map(c=>c.deathRef.round),
      evidenceRefs:noFollow.map(c=>({kind:"teammate-death-response",playerId,teammateId:c.teammateId,deathRef:{...c.deathRef}})),
      facts:{noneObserved:noFollow.length,followUpWindowSeconds:window,denominator:"same-engagement-confirmed-participants"},caveats:[followCaveat,...eligibleResponses.flatMap(c=>partialCaveats(c.coverage,followRequired))] });
  }
  // Lone deaths and teammate deaths have distinct occurrence identities. No
  // window/round overlap merge: the context cap uses deterministic priority.
  const effects=source.utilityValid ? inputs.utility.effects.filter(c=>c.throwerId===playerId && c.directOutcome.kind==="flash") : [];
  const utilityRequired=["actorAttribution","directOutcome"];
  const exact=effects.filter(c=>c.directOutcome.kind==="flash" && c.directOutcome.linkage==="exact"
    && utilityRequired.every(key=>complete(c.coverage[key as keyof typeof c.coverage])));
  const teamFlashes=exact.filter(c=>c.directOutcome.kind==="flash" && c.directOutcome.teammateEffects.length>0);
  const teammateEffects=teamFlashes.reduce((n,c)=>n+(c.directOutcome.kind==="flash"?c.directOutcome.teammateEffects.length:0),0);
  const flashRule: DeepReviewRuleId="deep.utility.teamflash-repeated";
  const flashTriggered=source.utilityValid && teamFlashes.length>=policy.teamflash.minimumEffects && teammateEffects>=policy.teamflash.minimumTeammateEffects;
  record(flashRule,exact.length,teamFlashes.length,flashTriggered);
  result.coverage.excludedOccurrences+=effects.length-exact.length;
  if(!flashTriggered) suppress(flashRule,!source.utilityValid || !exact.length && effects.length>0 ? "coverage-insufficient":"insufficient-occurrences");
  else add(flashRule,{category:"utility",kind:"context",title:"重复队友受闪记录",summary:`有 ${teamFlashes.length} 颗可精确关联的闪光影响了队友，共记录 ${teammateEffects} 条队友受闪效果；这些事实不判断闪光质量。`,
    occurrences:teamFlashes.length,eligibleOccurrences:exact.length,relatedRounds:teamFlashes.map(c=>c.effectRef.round),
    evidenceRefs:teamFlashes.map(c=>({kind:"utility-effect",effectRef:{...c.effectRef}})),facts:{exactFlashEffects:exact.length,teamFlashEffects:teamFlashes.length,teammateEffects},
    caveats:["rawBlindDuration 不等于 continuous blind duration；受闪效果次数不代表闪光质量评分。",...teamFlashes.flatMap(c=>partialCaveats(c.coverage,utilityRequired))] });

  const compare=(a:DeepReviewFinding,b:DeepReviewFinding) => policy.priority[a.ruleId]-policy.priority[b.ruleId] || b.occurrences-a.occurrences
    || (b.eligibleOccurrences??0)-(a.eligibleOccurrences??0) || (a.relatedRounds[0]??Infinity)-(b.relatedRounds[0]??Infinity)
    || (a.ruleId<b.ruleId?-1:a.ruleId>b.ruleId?1:0);
  for(const [kind,field] of [["review","reviews"],["highlight","highlights"],["context","contexts"]] as const) {
    const rows=candidates.filter(f=>f.kind===kind).sort(compare);
    result[field]=rows.slice(0,policy.caps[kind]);
    for(const f of rows.slice(policy.caps[kind])) suppress(f.ruleId,"max-count-reached");
  }
  const emitted=[...result.reviews,...result.highlights,...result.contexts];
  for(const rule of result.diagnostics.rules) rule.emitted=emitted.some(f=>f.ruleId===rule.ruleId);
  result.diagnostics.rules.sort((a,b)=>FINDINGS_RULES.indexOf(a.ruleId)-FINDINGS_RULES.indexOf(b.ruleId));
  result.suppressedRules.sort((a,b)=>FINDINGS_RULES.indexOf(a.ruleId)-FINDINGS_RULES.indexOf(b.ruleId));
  result.coverage.caveats=[...new Set(emitted.flatMap(f=>f.caveats.filter(c=>c.startsWith("未用于此规则"))))].sort();
  result.coverage.status=source.issues.length===0 && result.coverage.excludedOccurrences===0 && result.coverage.caveats.length===0 ? "complete"
    : !source.impactValid && !source.executionValid && !source.teamplayValid && !source.utilityValid ? "unavailable":"partial";
  return result;
}
