import type { Match, MatchEvent } from "@cs2-analyst/match-model";
import type { EngagementAnalysis, ContactEventRef, EngagementContact } from "./contracts.js";
import type { KillImpactAnalysis, KillRef } from "./impact-contracts.js";
import type { TeamplayAnalysis } from "./teamplay-contracts.js";
import type { UtilityContextAnalysis } from "./utility-contracts.js";
import type { CombatExecutionAnalysis } from "./execution-contracts.js";
import { classifyContactWeapon } from "./weapons.js";

export interface FindingsInputs {
  engagements: EngagementAnalysis; impact: KillImpactAnalysis; teamplay: TeamplayAnalysis;
  utility: UtilityContextAnalysis; execution: CombatExecutionAnalysis;
}
export const refKey = (r: { round: number; type: string; tick: number; eventIndex: number }): string =>
  JSON.stringify([r.round, r.type, r.tick, r.eventIndex]);
export const canonical = (v: unknown): string => JSON.stringify(v, (_k, x) => x && typeof x === "object" && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
export function jsonSafe(v: unknown): boolean {
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v !== "object" || !v || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(v))) return false;
  return Object.values(v).every(jsonSafe);
}
const unique = (values: string[]) => new Set(values).size === values.length;
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const validId = (id: unknown): id is string => typeof id === "string" && /^[1-9]\d*$/.test(id);
const side = (v: unknown) => v === "CT" || v === "T";
const complete = (c: { status: string; reasons: string[] }) => c.status === "complete" && c.reasons.length === 0;
export function findingSourceIndex(match: Match, inputs: FindingsInputs) {
  const issues: string[] = [];
  const raw = (ref: { round: number; type: string; tick: number; eventIndex: number }): MatchEvent | undefined => {
    const r = match.rounds.find(r => r.number === ref.round), event = r?.events[ref.eventIndex];
    return r && Number.isSafeInteger(ref.eventIndex) && ref.eventIndex >= 0 && Number.isSafeInteger(ref.tick) && ref.tick >= 0
      && event?.type === ref.type && event.tick === ref.tick ? event : undefined;
  };
  const window = (ref: { round: number; tick: number }) => {
    const r = match.rounds.find(r => r.number === ref.round);
    return !!r && Number.isSafeInteger(r.startTick) && Number.isSafeInteger(r.endTick) && r.startTick! <= ref.tick && ref.tick <= r.endTick!;
  };
  const feedComplete=(round:number,execution:boolean)=>match.rounds.find(r=>r.number===round)?.events.every(z=>{
    if(z.type!=="kill"&&z.type!=="damage" || classifyContactWeapon(z.weapon)==="utility") return true;
    if(!Number.isSafeInteger(z.tick)||z.tick<0) return false;
    if(!window({round,tick:z.tick})) return true;
    const actor=z.type==="kill"?z.killer:z.attacker, actorSide=z.type==="kill"?z.killerSide:z.attackerSide;
    return validId(actor)&&validId(z.victim)&&side(actorSide)&&side(z.victimSide)&&(!execution || classifyContactWeapon(z.weapon)!=="unknown");
  })===true;
  const ready = (name: keyof FindingsInputs) => {
    const a = inputs[name];
    const valid = !!a && a.matchId === match.id && jsonSafe(a);
    if (!valid) issues.push(`${name}:match-mismatch-or-non-json`);
    return valid;
  };
  const matchValid = jsonSafe(match) && unique(match.rounds.map(r => String(r.number)))
    && match.rounds.every(r => Number.isSafeInteger(r.number) && r.number > 0)
    && unique(match.players.map(p => p.steamId));
  if (!matchValid) issues.push("match:invalid-identity-or-json");
  let engagementValid = ready("engagements") && matchValid;
  const e = inputs.engagements;
  const projection = (c: EngagementContact) => ({ ref: c.eventRef, a: c.attackerId, v: c.victimId, weapon: c.weapon ?? null,
    fatal: c.fatal, source: c.sourceKind, damage: c.reportedHealthDamage ?? null });
  if (engagementValid) {
    const direct = new Map(e.directContacts.map(c => [refKey(c.eventRef), c]));
    const members = e.engagements.flatMap(g => g.contacts.map(c => refKey(c.eventRef)));
    engagementValid = unique(e.directContacts.map(c => refKey(c.eventRef))) && unique(e.engagements.map(g => g.id)) && unique(members);
    if(e.available && (!(typeof match.tickRate==="number" && Number.isFinite(match.tickRate) && match.tickRate>0)
      || e.config.contactGapTicks!==Math.round(e.config.contactGapSeconds*match.tickRate))) engagementValid=false;
    for (const c of e.directContacts) {
      const r = raw(c.eventRef);
      if (!r || (r.type !== "damage" && r.type !== "kill") || !window(c.eventRef)) { engagementValid = false; continue; }
      const actor = r.type === "kill" ? r.killer : r.attacker, actorSide = r.type === "kill" ? r.killerSide : r.attackerSide;
      if (!validId(actor) || !validId(r.victim) || !side(actorSide) || !side(r.victimSide) || actorSide === r.victimSide
        || actor === r.victim || r.type === "kill" && r.teamkill === true || c.attackerId !== actor || c.victimId !== r.victim
        || c.weapon !== r.weapon || c.sourceKind !== classifyContactWeapon(r.weapon) || c.fatal !== (r.type === "kill")
        || r.type === "damage" && c.reportedHealthDamage !== r.healthDamage) engagementValid = false;
    }
    for (const g of e.engagements) {
      const ids = [...new Set(g.contacts.flatMap(c => [c.attackerId, c.victimId]))].sort();
      if (!g.id || !g.contacts.length || !same([...g.participantIds].sort(), ids)
        || g.startTick !== Math.min(...g.contacts.map(c => c.eventRef.tick)) || g.endTick !== Math.max(...g.contacts.map(c => c.eventRef.tick))
        || g.durationSeconds!== (g.endTick-g.startTick)/match.tickRate!
        || g.contacts.some(c => c.eventRef.round !== g.round || !same(projection(c), direct.get(refKey(c.eventRef)) ? projection(direct.get(refKey(c.eventRef))!) : null))) engagementValid = false;
    }
    // Validate completeness against supplied domain rows; never regroup or recalculate evidence.
    for (const r of match.rounds) for (const [eventIndex, event] of r.events.entries()) {
      if (event.type !== "kill" && event.type !== "damage") continue;
      const ref = { round: r.number, type: event.type, tick: event.tick, eventIndex };
      const actor = event.type === "kill" ? event.killer : event.attacker, actorSide = event.type === "kill" ? event.killerSide : event.attackerSide;
      if (window(ref) && validId(actor) && validId(event.victim) && side(actorSide) && side(event.victimSide) && actorSide !== event.victimSide
        && actor !== event.victim && !(event.type === "kill" && event.teamkill === true) && classifyContactWeapon(event.weapon) !== "utility"
        && (!direct.has(refKey(ref)) || e.available && !members.includes(refKey(ref)))) engagementValid = false;
    }
    if (!engagementValid) issues.push("engagements:stale-or-conflicting-source");
  }
  let impactValid = ready("impact") && matchValid;
  const k = inputs.impact;
  if (impactValid) {
    impactValid = unique(k.rounds.map(s => String(s.round))) && unique(k.kills.map(c => refKey(c.eventRef)))
      && unique(k.multiKills.map(m => `${m.playerId}:${m.round}`));
    const deathKeys=match.rounds.flatMap(r=>r.events.flatMap((z,eventIndex)=>z.type==="kill" && window({round:r.number,tick:z.tick})
      ? [refKey({round:r.number,type:z.type,tick:z.tick,eventIndex})]:[])).sort();
    if(!same([...k.kills.map(c=>refKey(c.eventRef)),...k.unattributedKills.map(c=>refKey(c.eventRef))].sort(),deathKeys)
      || !same(k.rounds.map(s=>s.round).sort((a,b)=>a-b),match.rounds.map(r=>r.number).sort((a,b)=>a-b))) impactValid=false;
    const multiKeys=[...new Set(k.kills.map(c=>`${c.killerId}:${c.eventRef.round}`))].filter(key=>k.kills.filter(c=>`${c.killerId}:${c.eventRef.round}`===key).length>=2).sort();
    if(!same(k.multiKills.map(m=>`${m.playerId}:${m.round}`).sort(),multiKeys)) impactValid=false;
    for (const state of k.rounds) {
      const round = match.rounds.find(r => r.number === state.round);
      if (!round) { impactValid = false; continue; }
      if (state.coverage.status === "unavailable") continue;
      const snap = round.stateSnapshots?.find(s => s.boundary === state.baseline?.boundary && s.tick === state.baseline?.tick && s.availability === "observed");
      if (!snap || !unique(state.players.map(p => p.playerId))) { impactValid = false; continue; }
      if(complete(state.coverage) && !same(state.players.map(p=>p.playerId).sort(),snap.players.filter(p=>p.participant===true).map(p=>p.steamId).sort())) impactValid=false;
      if(complete(state.coverage)) {
        const baselineTick=state.baseline?.tick;
        const ends=round.stateSnapshots?.filter(s=>s.boundary==="end"&&s.availability==="observed"&&s.tick===round.endTick)??[];
        if(state.baseline?.boundary!=="freeze_end" || baselineTick!==round.freezeEndTick || snap.unidentifiedPlayerCount!==0
          || !unique(snap.players.map(p=>p.steamId)) || round.stateSnapshots?.filter(s=>s.boundary===state.baseline?.boundary&&s.availability==="observed"&&s.tick===baselineTick).length!==1
          || snap.players.some(p=>!validId(p.steamId)||p.participant!==false&&(p.participant!==true||!side(p.side)||typeof p.alive!=="boolean"))
          || (round.playerLifecycle??[]).some(z=>!Number.isSafeInteger(z.tick)||z.tick<0||z.tick>baselineTick!&&z.tick<=round.endTick!)
          || ends.length!==1 || ends[0].unidentifiedPlayerCount!==0) impactValid=false;
        const end=ends[0];
        if(end && (state.players.some(p=>{
          const rows=end.players.filter(z=>z.steamId===p.playerId);
          return rows.length!==1||rows[0].participant!==true||rows[0].side!==p.side||rows[0].alive!==(p.aliveAtBaseline&&p.deathTick===null);
        }) || end.players.some(p=>p.participant===true&&!state.players.some(z=>z.playerId===p.steamId)))) impactValid=false;
      }
      for (const p of state.players) {
        const original = snap.players.find(s => s.steamId === p.playerId && s.participant === true);
        const deaths = round.events.filter(event => event.type === "kill" && event.victim === p.playerId && window({ round: round.number, tick: event.tick }));
        if (!original || original.side !== p.side || original.alive !== p.aliveAtBaseline
          || p.deathTick !== null && (deaths.length!==1 || deaths[0].tick !== p.deathTick)
          || p.aliveAtBaseline && p.deathTick === null && deaths.length && complete(state.coverage)) impactValid = false;
      }
      const rawDeaths=round.events.flatMap((z,eventIndex)=>z.type==="kill"&&window({round:round.number,tick:z.tick})
        ? [refKey({round:round.number,type:z.type,tick:z.tick,eventIndex})]:[]);
      if(!same(state.groups.flatMap(g=>g.deathRefs.map(refKey)).sort(),rawDeaths.sort()) || !unique(state.groups.map(g=>String(g.tick)))) impactValid=false;
      for (const g of state.groups) {
        if (g.round !== state.round || g.deathRefs.some(ref => !raw(ref) || ref.tick !== g.tick)) impactValid = false;
        // Check the published projections against the provided roster/death ledger;
        // do not rebuild RoundAliveState or generate any replacement evidence.
        const count=(after:boolean)=>({CT:state.players.filter(p=>p.side==="CT" && p.aliveAtBaseline && (p.deathTick===null || (after?p.deathTick>g.tick:p.deathTick>=g.tick))).length,
          T:state.players.filter(p=>p.side==="T" && p.aliveAtBaseline && (p.deathTick===null || (after?p.deathTick>g.tick:p.deathTick>=g.tick))).length});
        if(g.before && !same(g.before,count(false)) || g.after && !same(g.after,count(true))) impactValid=false;
      }
    }
    for (const c of k.kills) {
      const r = raw(c.eventRef), state = k.rounds.find(s => s.round === c.eventRef.round), group = state?.groups.find(g => g.tick === c.eventRef.tick);
      if (!r || r.type !== "kill" || !window(c.eventRef) || r.killer !== c.killerId || r.victim !== c.victimId
        || r.killerSide !== c.killerSide || r.victimSide !== c.victimSide || c.killerSide === c.victimSide || r.teamkill === true
        || !group?.deathRefs.some(ref => refKey(ref) === refKey(c.eventRef))) { impactValid = false; continue; }
      const counts = (v: { CT: number; T: number } | null | undefined) => v ? { teamAlive: v[c.killerSide], enemyAlive: v[c.victimSide] } : null;
      if(c.atomicGroup.ordered!==(group.deathRefs.length===1) || c.atomicGroup.deathCount!==group.deathRefs.length
        || c.atomicGroup.attributedKillCount!==k.kills.filter(z=>z.eventRef.round===c.eventRef.round&&z.eventRef.tick===c.eventRef.tick).length
        || !same(c.coverage.roundState,state?.coverage) || !c.atomicGroup.ordered && complete(c.coverage.attribution)) impactValid=false;
      if (c.before && !same(c.before, counts(group.before)) || c.afterAtomicGroup && !same(c.afterAtomicGroup, counts(group.after))) impactValid = false;
      const b = c.before, a = c.afterAtomicGroup;
      for (const tag of c.tags) {
        if (["equalizer", "advantage-gain", "deficit-reduction", "enemy-eliminated"].includes(tag) && (!b || !a || !c.atomicGroup.ordered)) impactValid = false;
        if (b && a && (tag === "equalizer" && !(b.teamAlive < b.enemyAlive && a.teamAlive === a.enemyAlive)
          || tag === "advantage-gain" && !(b.teamAlive <= b.enemyAlive && a.teamAlive > a.enemyAlive)
          || tag === "deficit-reduction" && !(b.teamAlive < b.enemyAlive && a.teamAlive < a.enemyAlive && a.enemyAlive - a.teamAlive < b.enemyAlive - b.teamAlive)
          || tag === "enemy-eliminated" && !(b.enemyAlive > 0 && a.enemyAlive === 0)
          || tag === "sole-survivor-kill" && b.teamAlive !== 1)) impactValid = false;
      }
      if (c.engagementId !== null && (!engagementValid || !e.engagements.some(g => g.id === c.engagementId && g.contacts.some(x => refKey(x.eventRef) === refKey(c.eventRef))))) impactValid = false;
    }
    for (const m of k.multiKills) {
      const kills = k.kills.filter(c => c.killerId === m.playerId && c.eventRef.round === m.round);
      const round = match.rounds.find(r => r.number === m.round);
      const result = m.roundSide && round?.winner ? m.roundSide === round.winner ? "win" : "loss" : "unknown";
      for(const layer of ["roundState","attribution","engagementLinkage"] as const) if(complete(m.coverage[layer]) && kills.some(c=>!complete(c.coverage[layer]))) impactValid=false;
      if (!validId(m.playerId) || !same(m.kills, kills) || m.killCount !== kills.length || kills.length < 2 || m.roundResult !== result
        || m.roundWinner !== round?.winner || m.roundSide !== null && kills.some(c => c.killerSide !== m.roundSide)
        || m.firstKillTick !== Math.min(...kills.map(c => c.eventRef.tick)) || m.lastKillTick !== Math.max(...kills.map(c => c.eventRef.tick))) impactValid = false;
      const mappings = { "contains-equalizer": "equalizer", "contains-advantage-gain": "advantage-gain", "contains-deficit-reduction": "deficit-reduction",
        "contains-enemy-elimination": "enemy-eliminated", "contains-sole-survivor-kill": "sole-survivor-kill" } as const;
      for (const [tag, source] of Object.entries(mappings)) if (m.tags.includes(tag as keyof typeof mappings) !== kills.some(c => c.tags.includes(source))) impactValid = false;
    }
    if (!impactValid) issues.push("impact:stale-or-conflicting-source");
  }
  let executionValid = ready("execution") && engagementValid;
  const x = inputs.execution;
  if (executionValid) {
    const contexts = x.playerEngagementExecutions;
    executionValid = unique(contexts.map(c => `${c.playerId}:${c.engagementId}`));
    for (const c of contexts) {
      const g = e.engagements.find(g => g.id === c.engagementId);
      if (!g || g.round !== c.round || !g.participantIds.includes(c.playerId) || !unique(c.opponentExchanges.map(p => p.opponentId))) { executionValid = false; continue; }
      const own = g.contacts.filter(z => z.sourceKind === "firearm" && (z.attackerId === c.playerId || z.victimId === c.playerId));
      if (!same([...new Set(own.map(z => z.attackerId === c.playerId ? z.victimId : z.attackerId))].sort(), c.opponentExchanges.map(p => p.opponentId).sort())) executionValid = false;
      for (const p of c.opponentExchanges) {
        const pair = own.filter(z => z.attackerId === p.opponentId || z.victimId === p.opponentId);
        const dealt = pair.filter(z => z.attackerId === p.playerId).sort((a,b) => a.eventRef.tick-b.eventRef.tick || a.eventRef.eventIndex-b.eventRef.eventIndex);
        const received = pair.filter(z => z.victimId === p.playerId).sort((a,b) => a.eventRef.tick-b.eventRef.tick || a.eventRef.eventIndex-b.eventRef.eventIndex);
        if (p.playerId !== c.playerId || p.engagementId !== g.id || p.round !== g.round
          || !same(p.contactRefs.map(refKey).sort(), pair.map(z => refKey(z.eventRef)).sort())
          || !same(p.firstDealtRef, dealt[0]?.eventRef ?? null) || !same(p.firstReceivedRef, received[0]?.eventRef ?? null)) executionValid = false;
        const expectedRole = !dealt.length || !received.length ? "unknown" : dealt[0].eventRef.tick < received[0].eventRef.tick ? "dealt-first"
          : dealt[0].eventRef.tick === received[0].eventRef.tick ? "same-tick" : "received-first";
        if (p.firstContactRole !== "unknown" && p.firstContactRole !== expectedRole) executionValid = false;
        if(complete(p.coverage.contactEvidence) && !feedComplete(p.round,true) || complete(p.coverage.returnContact) && !feedComplete(p.round,true)) executionValid=false;
        if (!["kill", "damage", "none-observed"].includes(p.returnOutcome) || !complete(p.coverage.returnContact)) continue;
        const origin = p.firstReceivedRef;
        if (!origin) { executionValid = false; continue; }
        const round = match.rounds.find(r => r.number === p.round)!;
        const deaths = round.events.filter(z => z.type === "kill" && z.victim === p.playerId && window({round:p.round,tick:z.tick}));
        const boundary = deaths.length ? Math.min(...deaths.map(z => z.tick)) : Infinity;
        const later = dealt.filter(z => z.eventRef.tick > origin.tick && z.eventRef.tick < boundary);
        if (deaths.length > 1 || boundary <= origin.tick || dealt.some(z => z.eventRef.tick === origin.tick || z.eventRef.tick === boundary)) executionValid = false;
        if (p.returnOutcome === "none-observed") {
          if (later.length || p.returnContactRef !== null || p.returnOutcomeRef !== null) executionValid = false;
        } else {
          const decisive = later.find(z => z.fatal) ?? later[0];
          if (!decisive || p.returnOutcome !== (decisive.fatal ? "kill" : "damage")
            || !same(p.returnContactRef, later[0]?.eventRef) || !same(p.returnOutcomeRef, decisive.eventRef)) executionValid = false;
        }
      }
    }
    for (const g of e.engagements) for (const id of new Set(g.contacts.filter(c => c.sourceKind === "firearm").flatMap(c => [c.attackerId,c.victimId])))
      if (!contexts.some(c => c.engagementId === g.id && c.playerId === id)) executionValid = false;
    if (!executionValid) issues.push("execution:stale-or-conflicting-source");
  }
  let teamplayValid = ready("teamplay") && engagementValid && impactValid;
  const t = inputs.teamplay;
  const alive = (round: number, id: string, tick: number) => {
    const state = k.rounds.find(s => s.round === round), p = state?.players.find(p => p.playerId === id);
    return !!state?.baseline && complete(state.coverage) && tick >= state.baseline.tick && !!p && p.aliveAtBaseline && (p.deathTick === null || p.deathTick > tick);
  };
  const responseValid = (ref: KillRef, killerId: string | null, ids: string[], outcome: string, first: ContactEventRef | null, decisive: ContactEventRef | null) => {
    const candidates = e.directContacts.filter(c => c.eventRef.round === ref.round && ids.includes(c.attackerId) && c.victimId === killerId
      && c.eventRef.tick > ref.tick && (c.eventRef.tick-ref.tick)/match.tickRate! <= t.config.followUpWindowSeconds)
      .sort((a,b) => a.eventRef.tick-b.eventRef.tick || (a.attackerId < b.attackerId ? -1 : a.attackerId > b.attackerId ? 1 : a.eventRef.eventIndex-b.eventRef.eventIndex));
    if (outcome === "none-observed") return !candidates.length && first === null && decisive === null
      && !e.directContacts.some(c => c.eventRef.round === ref.round && ids.includes(c.attackerId) && c.victimId === killerId && c.eventRef.tick === ref.tick);
    const result = candidates.find(c => c.fatal) ?? candidates[0];
    return !!result && outcome === (result.fatal ? "kill" : "damage") && same(first,candidates[0].eventRef) && same(decisive,result.eventRef);
  };
  if (teamplayValid) {
    teamplayValid = Number.isFinite(t.config.followUpWindowSeconds) && t.config.followUpWindowSeconds > 0
      && unique(t.playerDeathContexts.map(c => `${c.playerId}:${refKey(c.deathRef)}`))
      && unique(t.teammateDeathResponses.map(c => `${c.playerId}:${c.teammateId}:${refKey(c.deathRef)}`));
    const expectedDeaths: string[]=[], expectedResponses: string[]=[];
    for(const round of match.rounds) {
      const roster=new Map<string,Set<string>>();
      const add=(id:string,s:unknown)=>{if(validId(id)&&side(s)){const sides=roster.get(id)??new Set<string>();sides.add(s as string);roster.set(id,sides);}};
      for(const snapshot of round.stateSnapshots??[]) if(snapshot.availability==="observed") for(const p of snapshot.players) if(p.participant===true) add(p.steamId,p.side);
      for(const c of e.directContacts.filter(c=>c.eventRef.round===round.number)) {
        const z=raw(c.eventRef); if(z && (z.type==="kill"||z.type==="damage")) {add(c.attackerId,z.type==="kill"?z.killerSide:z.attackerSide);add(c.victimId,z.victimSide);}
      }
      for(const [eventIndex,z] of round.events.entries()) {
        if(z.type!=="kill" || !window({round:round.number,tick:z.tick}) || !validId(z.victim) || !side(z.victimSide)
          || z.killer===z.victim || z.teamkill===true || z.killerSide===z.victimSide) continue;
        const key=refKey({round:round.number,type:z.type,tick:z.tick,eventIndex});
        expectedDeaths.push(`${z.victim}:${key}`);
        for(const [id,sides] of roster) if(id!==z.victim && sides.size===1 && sides.has(z.victimSide)) expectedResponses.push(`${id}:${z.victim}:${key}`);
      }
    }
    if(!same(t.playerDeathContexts.map(c=>`${c.playerId}:${refKey(c.deathRef)}`).sort(),expectedDeaths.sort())
      || !same(t.playerDeathTeamResponses.map(c=>`${c.playerId}:${refKey(c.deathRef)}`).sort(),expectedDeaths.sort())
      || !same(t.teammateDeathResponses.map(c=>`${c.playerId}:${c.teammateId}:${refKey(c.deathRef)}`).sort(),expectedResponses.sort())) teamplayValid=false;
    for (const c of t.playerDeathContexts) {
      const r = raw(c.deathRef), response = c.teamResponse;
      if (!r || r.type !== "kill" || r.victim !== c.playerId || (validId(r.killer) ? r.killer : null) !== c.killerId
        || !same(response,t.playerDeathTeamResponses.find(z => z.playerId === c.playerId && refKey(z.deathRef) === refKey(c.deathRef)))) { teamplayValid = false; continue; }
      if (complete(c.coverage.engagementParticipation)) {
        const g = e.engagements.find(g => g.id === c.engagementId && g.contacts.some(z => refKey(z.eventRef) === refKey(c.deathRef)));
        const peers = g ? g.participantIds.filter(id => g.contacts.some(z => {
          const event=raw(z.eventRef); if(!event || (event.type!=="kill"&&event.type!=="damage")) return false;
          return (z.attackerId===id && (event.type==="kill"?event.killerSide:event.attackerSide)===r.victimSide) || z.victimId===id && event.victimSide===r.victimSide;
        })) : [];
        if (!g || !feedComplete(c.deathRef.round,false) || c.sideParticipantCount !== peers.length || c.onlyConfirmedSideParticipant !== (peers.length===1 && peers[0]===c.playerId)) teamplayValid=false;
      }
      if (complete(c.coverage.aliveState) && complete(c.coverage.followUpTiming) && ["kill","damage","none-observed"].includes(response.outcome)) {
        const peers=k.rounds.find(s=>s.round===c.deathRef.round)?.players.filter(p=>p.side===r.victimSide && p.playerId!==c.playerId && alive(c.deathRef.round,p.playerId,c.deathRef.tick)).map(p=>p.playerId) ?? [];
        const ambiguous=k.rounds.find(s=>s.round===c.deathRef.round)?.players.filter(p=>p.side===r.victimSide && p.playerId!==c.playerId && p.deathTick===c.deathRef.tick).map(p=>p.playerId) ?? [];
        if (!c.killerId || !alive(c.deathRef.round,c.killerId,c.deathRef.tick) || response.killerState!=="alive-after-death"
          || ambiguous.length>0 || !feedComplete(c.deathRef.round,false) || response.sameTickContactRefs.length>0
          || e.directContacts.some(z=>z.eventRef.round===c.deathRef.round && z.eventRef.tick===c.deathRef.tick && peers.includes(z.attackerId) && z.victimId===c.killerId)
          || !responseValid(c.deathRef,c.killerId,peers,response.outcome,response.firstResponseRef,response.outcomeRef)) teamplayValid=false;
      }
    }
    for (const c of t.teammateDeathResponses) {
      const r=raw(c.deathRef);
      if (!r || r.type!=="kill" || r.victim!==c.teammateId || (validId(r.killer)?r.killer:null)!==c.killerId) {teamplayValid=false; continue;}
      if (complete(c.coverage.aliveState) && complete(c.coverage.followUpTiming) && ["kill","damage","none-observed"].includes(c.outcome)) {
        const player=k.rounds.find(s=>s.round===c.deathRef.round)?.players.find(p=>p.playerId===c.playerId);
        if (c.playerAliveAtDeath!==true || c.killerState!=="alive-after-death" || !player || player.side!==r.victimSide
          || !feedComplete(c.deathRef.round,false) || c.sameTickContactRefs.length>0
          || e.directContacts.some(z=>z.eventRef.round===c.deathRef.round && z.eventRef.tick===c.deathRef.tick && z.attackerId===c.playerId && z.victimId===c.killerId)
          || !alive(c.deathRef.round,c.playerId,c.deathRef.tick) || !c.killerId || !alive(c.deathRef.round,c.killerId,c.deathRef.tick)
          || !responseValid(c.deathRef,c.killerId,[c.playerId],c.outcome,c.firstFollowUpRef,c.outcomeRef)) teamplayValid=false;
      }
    }
    if (!teamplayValid) issues.push("teamplay:stale-or-conflicting-source");
  }
  let utilityValid = ready("utility") && matchValid;
  const u = inputs.utility;
  if (utilityValid) {
    utilityValid=unique(u.effects.map(c=>refKey(c.effectRef)));
    const expectedEffects=match.rounds.flatMap(r=>r.events.flatMap((z,eventIndex)=>z.type==="utility"?[refKey({round:r.number,type:z.type,tick:z.tick,eventIndex})]:[]));
    if(!same(u.effects.map(c=>refKey(c.effectRef)).sort(),expectedEffects.sort())) utilityValid=false;
    const claimed: string[]=[];
    for(const c of u.effects) {
      const r=raw(c.effectRef);
      if(!r || r.type!=="utility" || r.utility!==c.effectRef.utility || r.action!==c.effectRef.action
        || (validId(r.thrower)?r.thrower:null)!==c.throwerId || r.throwerSide!==c.throwerSide) {utilityValid=false; continue;}
      const d=c.directOutcome;
      if(d.kind!=="flash" || d.linkage!=="exact") continue;
      if(r.utility!=="flashbang" || r.entityId!==c.entityId || c.entityId===null
        || u.effects.filter(z=>z.effectRef.round===c.effectRef.round && z.effectRef.utility==="flashbang" && z.entityId===c.entityId).length!==1) utilityValid=false;
      const facts=[...d.enemyEffects,...d.teammateEffects,...d.selfEffects,...d.unknownEffects];
      const round=match.rounds.find(z=>z.number===c.effectRef.round)!;
      const expected=round.events.flatMap((z,eventIndex)=>z.type==="flash" && z.entityId===c.entityId && z.attacker===c.throwerId
        ? [refKey({round:round.number,type:z.type,tick:z.tick,eventIndex})]:[]);
      if(!same(facts.map(f=>refKey(f.eventRef)).sort(),expected.sort())) utilityValid=false;
      for(const f of facts) {
        const z=raw(f.eventRef); claimed.push(refKey(f.eventRef));
        if(!z || z.type!=="flash" || z.victim!==f.victimId || z.tick!==f.tick || z.blindDurationSeconds!==f.rawBlindDurationSeconds) {utilityValid=false; continue;}
        if(d.teammateEffects.includes(f) && (z.victim===c.throwerId || !side(z.attackerSide) || z.attackerSide!==z.victimSide)) utilityValid=false;
      }
    }
    if(!unique(claimed)) utilityValid=false;
    if(!utilityValid) issues.push("utility:stale-or-conflicting-source");
  }
  return { engagementValid, impactValid, executionValid, teamplayValid, utilityValid, issues: [...new Set(issues)].sort() };
}
