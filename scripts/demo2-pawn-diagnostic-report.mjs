// Assemble bounded observations from completed read-only experiments.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { version as osVersion } from 'node:os';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const local=resolve(root,'.tmp/demo2-diagnostic');
const read=name=>JSON.parse(readFileSync(resolve(local,name),'utf8'));
const installed=read('native-installed.json'), main=read('native-main.json'), oracle=read('oracle.json'), alive=read('alive-state.json');
const require=createRequire(resolve(root,'packages/dem-parser/package.json'));
const packageInfo=require('@laihoe/demoparser2/package.json');
const nativeRequire=createRequire(require.resolve('@laihoe/demoparser2/package.json'));
const platformInfo=nativeRequire('@laihoe/demoparser2-win32-x64-msvc/package.json');
const git=(path,...args)=>execFileSync('git',['-C',resolve(local,path),...args],{encoding:'utf8'}).trim();
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const npmLatest=JSON.parse(execFileSync('cmd.exe',['/d','/s','/c','npm view @laihoe/demoparser2 version --json'],{encoding:'utf8'}));
const id=installed.affected, affected=x=>x.fullMatch.players.find(p=>p.steamid===id);
assert.equal(affected(installed).rows,107577);
assert.equal(affected(installed).corePawnCompleteRows,0);
assert.equal(affected(main).corePawnCompleteRows,107577);
assert.equal(affected(main).indexMismatchRows,0);
assert.deepEqual(affected(main).aliveWeaponMissingHandleCounts,{'16777215':409});
assert.equal(oracle.parseError,null);
assert.equal(alive.length,18);
assert(alive.every(r=>r.state.coverage.status==='unavailable'));
assert.equal(git('demoparser','diff','--','src/parser'),'');
const compareTicks=[3743,4292,4511];
const oracleComparisons=compareTicks.map(tick=>{
 const n=main.allVsSubset.find(r=>r.tick===tick).full;
 const o=oracle.samples.find(r=>r.tick===tick&&r.steamid===id);
 assert(o);
 assert.deepEqual([n.X,n.Y,n.Z],[o.position.X,o.position.Y,o.position.Z]);
 assert.equal(n.health,o.pawn_m_iHealth);assert.equal(n.team_num,o.pawn_m_iTeamNum);assert.equal(n.life_state,o.pawn_m_lifeState);
 return {tick,nativeMain:n,oracle:o,exactPositionHealthTeamLifeStateAgreement:true};
});
const summary=x=>({fullMatch:x.fullMatch,players:x.players,controlIds:x.controlIds,spawnCount:x.spawnCount,
 spawnEvents:x.spawnEvents.map(e=>({tick:e.tick,round:e.total_rounds_played+1,steamid:e.user_steamid})),
 lifecycle:x.lifecycle,eventExtra:x.eventExtra,queryShapes:x.queryShapes,allVsSubset:x.allVsSubset,
 boundaries:x.boundaries,boundaryRows:x.boundaryRows.filter(r=>r.steamid===id)});
const rawSourceLimits={publicEntityId:'parseTicks entity_id is projected pawn index; public API does not expose controller_entid or arbitrary entity table.',
 playerInfo:'parsePlayerInfo is final metadata, not per-round side truth.',
 isAlive:'Custom property reads pawn m_lifeState; failure/nonzero returns false. Missing Pawn must not be interpreted as proven dead.',
 nativeIdentities:'Exactly 10 SteamIDs in native projected tick rows. This does not inventory arbitrary raw entities; oracle raw pawn enumeration supplies that check.',
 timing:'Native covers every tick 0..107576. Oracle counts FrameDone callbacks including repeated ticks/sign-on frames; not a one-to-one row-count comparison.'};
const result={schemaVersion:1,date:'2026-10-09',task:'P5.7.0.1 demo2 Native Pawn Mapping Diagnostic Spike',baseline:'4c7bc888920f8194ed89a6893fe98f67d2a8c91d',
 fixture:installed.fixture,affectedPlayer:{steamid:id,nativeName:installed.players.find(p=>p.steamid===id).name,productOwnerTarget:false},
 parserVersions:{declared:'^0.42.0',lockfile:'0.42.0',installed:packageInfo.version,platformPackage:platformInfo.name,platformVersion:platformInfo.version,
   npmLatest,
   publishedVersionObservation:'no newer published npm version available',environment:{...installed.environment,os:osVersion()}},
 fieldSources:{pawn:installed.pawnFields,controller:installed.controllerFields,custom:['is_alive','entity_id','active_weapon_name'],
   rawActiveWeapon:'active_weapon -> CCSPlayerPawn.CCSPlayer_WeaponServices.m_hActiveWeapon',limits:rawSourceLimits},
 installed:summary(installed),upstreamMain:{revision:git('demoparser','rev-parse','HEAD'),handleFixRevision:'451321a517ec9c0c6be7f0103dd07e7a805c3345',
   binarySha256:hash(resolve(local,'demoparser-main.node')),target:'x86_64-pc-windows-gnu',status:'PASS for core Pawn gap reproduction; not product acceptance',
   gameTrackingRevision:git('demoparser/src/csgoproto/GameTracking-CS2','rev-parse','HEAD'),
   buildNotes:['Removed obsolete features=[voice] from temporary Node Cargo manifest; parser source unchanged.',
     'Cargo regenerated temporary binding lockfile and protobuf.rs from current GameTracking-CS2.',
     'Rust 1.99.0 minimal portable toolchain; w64devkit 2.10.0 GNU linker; libgcc.a alias libgcc_eh.a for link compatibility.',
     'protoc 36.2 failed on Valve descriptor options; protoc 21.12 succeeded. All tools/build artifacts remain ignored under .tmp.',
     '25 binding compile warnings; successful release build; no debug instrumentation or parser semantic patch.'],observations:summary(main)},
 independentOracle:{revision:git('demoinfocs','rev-parse','HEAD'),goVersion:'go1.27.2 windows/amd64',parseError:oracle.parseError,warnings:oracle.warnings,
   frames:oracle.frames,firstTick:oracle.firstTick,lastTick:oracle.lastTick,counts:oracle.counts,requestedTicks:oracle.requestedTicks,
   returnedRequestedTicks:[...new Set(oracle.samples.map(s=>s.tick))].sort((a,b)=>a-b),entityLifecycle:oracle.entityLifecycle,
   identityChanges:oracle.identityChanges.map(s=>({tick:s.tick,steamid:s.steamid,controllerEntityId:s.controllerEntityId,controllerSerial:s.controllerSerial,
     pawnEntityId:s.pawnEntityId,pawnSerial:s.pawnSerial,m_hPawn:s.m_hPawn,m_hPlayerPawn:s.m_hPlayerPawn,team:s.pawn_m_iTeamNum,health:s.pawn_m_iHealth,life_state:s.pawn_m_lifeState})),
   samples:oracle.samples.filter(s=>s.steamid===id||compareTicks.includes(s.tick)),rawPawnsAtFailingTicks:oracle.rawPawnsAtFailingTicks,oracleComparisons},
 patchComparison:installed.patchComparison.map(p=>({file:p.file,patch:p.header?.patch_version,map:p.header?.map_name,status:p.status??'header read'})),
 aliveState:{currentContract:'Conservative whole-round manpower proof, intentional; no resolver change.',
   rounds:alive.map(r=>({round:r.round,baseline:r.state.baseline,affectedBaseline:r.baseline?.flatMap(s=>s.players.filter(p=>p.steamId===id)),coverage:r.state.coverage,
     candidatePlayers:r.state.players.length,deathGroups:r.state.groups.length,allGroupCountsNull:r.state.groups.every(g=>g.before===null&&g.after===null&&g.appliedVictimIds.length===0)})),
   extraBlocker:'R18 also has lifecycle-anomaly. Fixing Pawn decoding alone is not proof of complete alive-state coverage.',
   recoverableSubset:'Confirmed raw contact/death refs, reliable per-actor pair positions, attributable kills and multi-kill counts can survive independently; current manpower tags require complete state.',
   extraProof:'Partial roster state needs explicit per-player coverage/lifecycle/time boundaries, per-tick side proof including halftime, and consumer contracts that reject exact counts/negative absence when unresolved participants could matter.'},
 classification:{recommendation:'A. Upstream dependency issue, fixed on main',rootCause:'0.42.0 masks network entity handles with 0x7FF (11 bits), truncating real pawn 2927 to CWeaponGlock entity 879. Shared PlayerMetaData pawn mapping feeds tick and event extra projection.',
   sourceMissingPawnRejected:true,adapterQueryBugRejected:true,serialIssue:'Serial279 is decoded separately; observed failure is index truncation, not missing lifecycle handle updates.',
   nextAction:'Separate production task: prefer published release containing #363; otherwise evaluate pinned audited dependency build/backport, then full Personal Gate and historical regressions. No inferred state fallback.',
   upstreamIssue:'Existing #362 closed by #363; no duplicate issue. Owner-review-only release/validation follow-up draft prepared; no issue/comment/DEM upload sent.',
   remainingUnknowns:['Not all upstream-main consumers, Electron/MSVC packaging or production gates were tested.',
     'Source m_hActiveWeapon invalid interval remains an optional weapon gap; no synthetic weapon truth.',
     'R18 lifecycle-anomaly persists in installed production input; source lifecycle coverage requires separate acceptance.']},
 status:{personalGate:{demo1:'PASS',demo2:'FAIL',demo3:'PASS'},p570:'PARTIAL PASS',p571Through578:'PASS',p57Final:'HOLD',v01Final:'PAUSED',productionSourceChanged:false,dependenciesChanged:false},
 validation:{typecheck:'13/13 successful (Turbo cached)',demParserTests:'39 PASS, 0 FAIL, 0 SKIP',nativeInstalled:'full-match + event extras + spawn samples + shape comparisons PASS',
   nativeMain:'same probes PASS',oracle:'independent full stream + exact sample comparisons PASS',
   syntaxAndVet:'both MJS node --check PASS; independent oracle go vet PASS',independentReview:'PASS; no actionable findings',installer:'not run; no production diff'},
 evidenceHashes:Object.fromEntries(['native-installed.json','native-main.json','oracle.json','alive-state.json'].map(name=>[name,hash(resolve(local,name))]))};
assert.equal(result.parserVersions.npmLatest,'0.42.0');
assert.deepEqual(result.independentOracle.returnedRequestedTicks,result.independentOracle.requestedTicks);
writeFileSync(resolve(root,'docs/demo2-native-diagnostic.json'),JSON.stringify(result,null,2)+'\n');
console.log('Bounded diagnostic report generated; core root cause and oracle assertions PASS.');
