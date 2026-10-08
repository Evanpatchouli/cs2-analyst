// Read-only native reproduction. No adapter, domain model, or production fallback.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const nativePath = option('--native', null);
const output = resolve(root, option('--out', '.tmp/demo2-diagnostic/native-installed.json'));
const require = createRequire(resolve(root, 'packages/dem-parser/package.json'));
const native = nativePath ? require(resolve(nativePath)) : require('@laihoe/demoparser2');
const bytes = readFileSync(resolve(root, '.demo/demo2.dem'));
const sha256 = createHash('sha256').update(bytes).digest('hex');
assert.equal(sha256, '253e5b719ac418b092ff3cdd1b5928bb0dfc8ccbf06cb9398963ea1e9fa44a25');
const affected = '76561199273439650';
const pawn = ['X', 'Y', 'Z', 'yaw', 'pitch', 'health', 'team_num', 'life_state', 'armor_value', 'active_weapon_name'];
const controller = ['pending_team_num', 'is_connected', 'player_name', 'player_steamid',
  'CCSPlayerController.m_iTeamNum', 'CCSPlayerController.m_bPawnIsAlive',
  'CCSPlayerController.m_hPlayerPawn', 'CCSPlayerController.m_hPawn'];
const fields = [...pawn, ...controller, 'is_alive', 'entity_id', 'active_weapon'];
const present = value => value !== null && value !== undefined;
const header = native.parseHeader(bytes);
const players = native.parsePlayerInfo(bytes);
const eventNames = ['weapon_fire', 'player_hurt', 'player_death', 'player_spawn', 'round_start', 'round_freeze_end', 'round_end'];
console.log('Full native tick query (all players, struct of arrays)...');
const columns = native.parseTicks(bytes, fields, undefined, undefined, true);
assert(Array.isArray(columns.tick), 'Expected native struct-of-arrays result');
const summaries = new Map();
const identities = new Set();
for (let i = 0; i < columns.tick.length; i++) {
  const id = columns.steamid[i];
  identities.add(id);
  if (!summaries.has(id)) summaries.set(id, { steamid: id, name: columns.name[i], rows: 0, firstTick: columns.tick[i], lastTick: columns.tick[i],
    fields: Object.fromEntries(fields.map(f => [f, { present: 0, missing: 0, firstPresentTick: null, lastPresentTick: null }])),
    entityIds: new Set(), handles: new Set(), indexMismatchRows: 0, completePawnRows: 0, corePawnCompleteRows: 0, controllerAliveTruePawnMissingRows: 0, aliveTrueRows: 0, aliveWeaponPresentRows: 0,
    aliveWeaponMissingRanges: [], aliveWeaponMissingSamples: [], aliveWeaponMissingHandleCounts: {} });
  const s = summaries.get(id);
  s.rows++;
  s.firstTick = Math.min(s.firstTick, columns.tick[i]); s.lastTick = Math.max(s.lastTick, columns.tick[i]);
  for (const f of fields) {
    const counter = s.fields[f];
    if (present(columns[f]?.[i])) {
      counter.present++;
      counter.firstPresentTick = counter.firstPresentTick === null ? columns.tick[i] : Math.min(counter.firstPresentTick, columns.tick[i]);
      counter.lastPresentTick = counter.lastPresentTick === null ? columns.tick[i] : Math.max(counter.lastPresentTick, columns.tick[i]);
    } else counter.missing++;
  }
  if (pawn.every(f => present(columns[f]?.[i]))) s.completePawnRows++;
  if (pawn.filter(f=>f!=='active_weapon_name').every(f => present(columns[f]?.[i]))) s.corePawnCompleteRows++;
  if (columns.is_alive[i] === true) s.aliveTrueRows++;
  if (columns.is_alive[i] === true && present(columns.active_weapon_name[i])) s.aliveWeaponPresentRows++;
  if (columns.is_alive[i] === true && !present(columns.active_weapon_name[i])) {
    const handleKey=String(columns.active_weapon?.[i]??null);
    s.aliveWeaponMissingHandleCounts[handleKey]=(s.aliveWeaponMissingHandleCounts[handleKey]??0)+1;
    const tick=columns.tick[i], last=s.aliveWeaponMissingRanges.at(-1);
    if(last && last.endTick+1===tick) last.endTick=tick;
    else s.aliveWeaponMissingRanges.push({startTick:tick,endTick:tick});
    if(s.aliveWeaponMissingSamples.length<6) s.aliveWeaponMissingSamples.push({tick,active_weapon:columns.active_weapon?.[i]??null,health:columns.health[i],life_state:columns.life_state[i]});
  }
  if (columns['CCSPlayerController.m_bPawnIsAlive'][i] === true && !present(columns.health[i])) s.controllerAliveTruePawnMissingRows++;
  s.entityIds.add(columns.entity_id[i]);
  const handle = columns['CCSPlayerController.m_hPlayerPawn'][i];
  s.handles.add(handle);
  if (present(handle) && handle !== 0xFFFFFF && handle !== 0xFFFFFFFF && columns.entity_id[i] !== (handle & 0x3FFF)) s.indexMismatchRows++;
}
const fullMatch = { mode: 'all ticks, no wantedTicks or wantedPlayers filter', rows: columns.tick.length, identities: [...identities].sort(),
  players: [...summaries.values()].sort((a, b) => a.steamid.localeCompare(b.steamid)).map(s => ({ ...s, entityIds: [...s.entityIds].sort((a,b)=>a-b),
    handles: [...s.handles].sort((a,b)=>a-b), handleDecodings: [...s.handles].filter(present).sort((a,b)=>a-b).map(h=>({ handle:h, index11:h&0x7FF,index14:h&0x3FFF,serial14:h>>>14 })) })) };
console.log('Event enrichment and spawn lifecycle...');
const events = Object.fromEntries(eventNames.map(name => [name, native.parseEvent(bytes, name, fields, ['total_rounds_played', 'is_warmup_period'])]));
const own = event => Object.keys(event).some(k => k.endsWith('steamid') && event[k] === affected);
const spawns = events.player_spawn.filter(e => e.user_steamid === affected);
assert(spawns.length >= 3);
const selectedSpawns = [spawns[0], spawns[Math.floor(spawns.length / 2)], spawns.at(-2), spawns.at(-1)];
const controlIds = [players.find(p => p.steamid !== affected && p.team_number === players.find(p=>p.steamid===affected).team_number).steamid,
  players.find(p => p.team_number !== players.find(p=>p.steamid===affected).team_number).steamid];
const lifecycle = selectedSpawns.map(event => {
  const ticks = [-8, -1, 0, 1, 8, 64].map(delta => event.tick + delta).filter(t=>t>=0);
  return { event, ticks, rows: native.parseTicks(bytes, fields, ticks, [affected, ...controlIds]) };
});
const ticks = [3743, 4292, 4511];
const shapes = [['X'], ['health'], ['team_num'], ['X','Y','Z','yaw','pitch','health','is_alive','team_num','active_weapon_name']];
const queryShapes = shapes.map(props => ({ props, rows: native.parseTicks(bytes, props, ticks, [affected, ...controlIds]) }));
for (const shape of queryShapes) {
  shape.equalToFullMatch = shape.rows.every(row => {
    const index=columns.tick.findIndex((tick,i)=>tick===row.tick && columns.steamid[i]===row.steamid);
    return index>=0 && shape.props.every(f=>(row[f]??null)===(columns[f]?.[index]??null));
  });
  assert(shape.equalToFullMatch);
}
const allVsSubset = ticks.map(tick => ({ tick, full: Object.fromEntries(['steamid', 'name', 'tick', ...fields].map(f => [f, columns[f]?.[columns.tick.findIndex((t,i)=>t===tick && columns.steamid[i]===affected)] ?? null])),
  subset: native.parseTicks(bytes, fields, [tick], [affected])[0] }));
for (const pair of allVsSubset) {
  // Native AoS can omit all-null columns for a filtered player; preserve raw output.
  pair.equalAfterNullNormalization = fields.every(f => (pair.full[f] ?? null) === (pair.subset?.[f] ?? null));
  assert(pair.equalAfterNullNormalization);
}
const eventExtra = Object.fromEntries(['weapon_fire','player_hurt','player_death','player_spawn'].map(name => {
  const rows = events[name];
  const actors = Object.fromEntries([affected,...controlIds].map(id => {
    const referenced = rows.filter(e=>Object.keys(e).some(k=>k.endsWith('steamid')&&e[k]===id));
    const fieldCounts = Object.fromEntries(fields.map(f=>[f,{present:0,missing:0}]));
    let roles=0;
    for(const e of referenced) for(const key of Object.keys(e).filter(k=>k.endsWith('_steamid')&&!k.endsWith('_player_steamid')&&e[k]===id)) {
      const prefix=key.slice(0,-7); roles++;
      for(const f of fields) fieldCounts[f][present(e[`${prefix}${f}`])?'present':'missing']++;
    }
    return [id,{referencedEvents:referenced.length,actorRoles:roles,fieldCounts,samples:referenced.slice(0,3)}];
  }));
  return [name,{totalEvents:rows.length,affectedReferencedEvents:rows.filter(own).length,actors}];
}));
const boundaries = ['round_start','round_freeze_end','round_end'].flatMap(name=>events[name].filter(e=>e.is_warmup_period!==true));
const boundaryRows = native.parseTicks(bytes, fields, [...new Set(boundaries.map(e=>e.tick))], [affected,...controlIds]);
const patchComparison = [];
for(const file of ['demo1.dem','demo2.dem','demo3.dem','nuke.dem','inferno.dem','dust2.dem','mirage.dem','ancient.dem','anubis.dem','overpass.dem']) {
  const path=resolve(root,'.demo',file);
  try { const h=native.parseHeader(path); patchComparison.push({file,header:h}); }
  catch(error) { patchComparison.push({file,status:'UNVERIFIED',error:error.message}); }
}
const result={schemaVersion:1,fixture:{filename:'.demo/demo2.dem',sha256,bytes:bytes.length,header},environment:{node:process.version,platform:process.platform,arch:process.arch},
  nativeSource:nativePath?'external diagnostic build':'installed @laihoe/demoparser2',players,affected,controlIds,fields,pawnFields:pawn,controllerFields:controller,
  fullMatch,spawnCount:spawns.length,spawnEvents:spawns,lifecycle,eventExtra,queryShapes,allVsSubset,boundaries,boundaryRows,patchComparison};
mkdirSync(dirname(output),{recursive:true}); writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output,rows:fullMatch.rows,affected:fullMatch.players.find(p=>p.steamid===affected),controlIds},null,2));
