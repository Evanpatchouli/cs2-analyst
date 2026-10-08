import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Demoparser2Provider } from '../packages/dem-parser/dist/index.js';
import * as review from '../packages/deep-review/dist/index.js';

const mode = process.argv[2];
assert.ok(['old', 'fixed'].includes(mode));
// Reference-only install: npm install --prefix vendor/demoparser/.build/reference
// @laihoe/demoparser2@0.42.0 --ignore-scripts. Never loaded by production.
const require = createRequire(new URL('../packages/dem-parser/package.json', import.meta.url));
let native;
if(mode === 'old') {
  const refRequire = createRequire(new URL('../vendor/demoparser/.build/reference/package.json',import.meta.url));
  assert.equal(refRequire('@laihoe/demoparser2/package.json').version,'0.42.0');
  const url = new URL('file:///'+refRequire.resolve('@laihoe/demoparser2').replaceAll('\\','/')).href;
  registerHooks({resolve(specifier,context,next){return specifier==='@cs2-analyst/demoparser-native'?{url,shortCircuit:true}:next(specifier,context);}});
  native = refRequire('@laihoe/demoparser2');
} else native = require('@cs2-analyst/demoparser-native');
const dir = new URL('../vendor/demoparser/.build/regression/', import.meta.url);
mkdirSync(dir, { recursive: true });
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fixtures = ['demo1', 'demo2', 'demo3', 'nuke', 'inferno', 'dust2', 'mirage', 'ancient', 'anubis', 'overpass'];
for (const fixture of fixtures) {
  const path = new URL(`../.demo/${fixture}.dem`, import.meta.url);
  const { match, spatial } = await new Demoparser2Provider().parseWithSpatial(fileURLToPath(path));
  const inputHash = hash({match, spatial});
  const engagements = review.analyzeEngagements(match, spatial);
  const impact = review.analyzeKillImpact(match, engagements);
  const teamplay = review.analyzeTeamplay(match, engagements, impact, spatial);
  const utility = review.analyzeUtilityContext(match, spatial, impact);
  const execution = review.analyzeCombatExecution(match, engagements, impact, spatial);
  const evidence = {engagements, impact, teamplay, utility, execution};
  const findings = match.players.map(p => review.analyzeDeepReviewFindings(match, p.steamId, evidence));
  assert.equal(hash({match, spatial}), inputHash);
  const events = native.parseEvents(readFileSync(path), ['player_death','weapon_fire','player_hurt','hegrenade_detonate','flashbang_detonate','smokegrenade_detonate','inferno_startburn','decoy_started','player_blind','bomb_pickup','bomb_dropped','bomb_beginplant','bomb_planted','bomb_begindefuse','bomb_defused','bomb_exploded'], ['active_weapon','active_weapon_name','inventory','entity_id'], ['is_warmup_period']);
  const result = { fixture, sha: match.id, match, spatial, evidence, findings, nativeEvents: events };
  writeFileSync(new URL(`${fixture}-${mode}.json`, dir), JSON.stringify(result));
  console.log(JSON.stringify({fixture,mode,players:match.players.length,events:match.rounds.reduce((n,r)=>n+r.events.length,0),hash:hash(result)}));
}
