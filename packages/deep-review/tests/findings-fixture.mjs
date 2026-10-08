import { match as oneRound, damage, kill } from './teamplay-fixture.mjs';
import { analyzeEngagements, analyzeKillImpact, analyzeTeamplay, analyzeUtilityContext, analyzeCombatExecution, analyzeDeepReviewFindings } from '../dist/index.js';
export { damage, kill };
export function match(roundEvents=[[]], winner='CT') {
  const base=oneRound([]); base.id='findings-synthetic';
  base.rounds=roundEvents.map((events,i)=>({...oneRound(events).rounds[0],number:i+1,winner}));
  return base;
}
export function inputs(m) {
  const engagements=analyzeEngagements(m),impact=analyzeKillImpact(m,engagements);
  return {engagements,impact,teamplay:analyzeTeamplay(m,engagements,impact),utility:analyzeUtilityContext(m,undefined,impact),execution:analyzeCombatExecution(m,engagements,impact)};
}
export const run=(m,id='1')=>analyzeDeepReviewFindings(m,id,inputs(m));
export const all=a=>[...a.reviews,...a.highlights,...a.contexts];
export const rule=(a,suffix)=>all(a).find(f=>f.ruleId.endsWith(suffix));
export const suppression=(a,suffix)=>a.suppressedRules.find(f=>f.ruleId.endsWith(suffix))?.reason;
export const swing=()=>[kill(10,'6','2'),kill(20,'7','3'),kill(200,'1','6'),kill(220,'1','7'),kill(240,'1','8')];
// Contrived posthumous boundary: later raw outgoing contact exists, but is outside
// the player's alive return window. Preserves frozen upstream received-first semantics.
export const noReturn=()=>[damage(100,'6','1'),kill(150,'7','1'),damage(160,'2','7'),kill(200,'1','6')];
export const returns=()=>[damage(100,'6','1'),damage(110,'1','6')];
export const lone=()=>[damage(100,'6','1'),damage(110,'1','6'),kill(150,'6','1')];
export const noFollow=()=>[damage(100,'6','2'),kill(150,'6','2')];
export const flash=(entity=1,tick=100,teammates=['2','3'])=>[
  {type:'utility',utility:'flashbang',action:'detonate',tick,thrower:'1',throwerSide:'CT',entityId:entity},
  ...teammates.map((victim,i)=>({type:'flash',tick:tick+i+1,attacker:'1',victim,attackerSide:'CT',victimSide:'CT',entityId:entity,blindDurationSeconds:1})),
];
export const flashes=()=>[...flash(1,100),...flash(2,200),...flash(3,300)];
