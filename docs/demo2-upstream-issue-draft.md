# Owner-review draft — demo2 validation / npm release follow-up for #362 / #363

**DRAFT ONLY. Not submitted.** Existing [#362](https://github.com/LaihoE/demoparser/issues/362) is closed by [#363](https://github.com/LaihoE/demoparser/pull/363); use this as a validation/release follow-up on the existing report rather than opening a duplicate bug. Product Owner should review the content and any fixture-sharing decision first.

Suggested title: `Validated #363 on another Perfect World demo; npm 0.42.0 still truncates Pawn 2927 to entity 879`

Environment: Node v26.3.0, Windows 11 Pro x64. Installed `@laihoe/demoparser2` and win32-x64-msvc native package both0.42.0; npm latest was0.42.0 on2026-10-09. Main45ca85ae was built temporarily for Windows GNU; parser source unchanged. The obsolete Node manifest voice feature was removed for build compatibility, and protobuf.rs was regenerated using GameTracking ac1278db/protoc21.12. This is not a shipped Electron/MSVC build.

Fixture: 75,699,561-byte de_dust2 demo, patch14181,18 rounds/10 players/64tick. Header client SourceTV Demo, demo_version_name valve_demo_2, server 完美世界竞技平台天梯服务器. SHA253e5b719ac418b092ff3cdd1b5928bb0dfc8ccbf06cb9398963ea1e9fa44a25. Local reference is demo2.dem; filename is not the reproduction criterion.

Public actor label **P-affected**: Controller13/serial1008; m_hPlayerPawn4574063 → index14=2927, serial279. npm output entity_id879=index11; independent raw entity879 is CWeaponGlock, while2927 is CCSPlayerPawn with reverse Controller13 handle. Full npm match query has107,577 P-affected rows, all XYZ/view/health/team/life_state missing. All nine normal players have core Pawn state. Main restores107,577/107,577 core Pawn rows. Independent demoinfocs14db58ba reads the same Pawn/state; XYZ/health/team/life_state agree exactly with main at3743/4292/4511.

Minimal native reproduction, without adapter or product domain model:

```js
const dp = require('@laihoe/demoparser2');
const ticks = [3743, 4292, 4511];
const props = ['entity_id', 'CCSPlayerController.m_hPlayerPawn',
  'CCSPlayerController.m_bPawnIsAlive', 'X', 'Y', 'Z', 'health', 'team_num', 'life_state', 'is_alive'];
for (const r of dp.parseTicks('demo2.dem', props, ticks)) {
  const h = r['CCSPlayerController.m_hPlayerPawn'];
  if (h === 4574063) {
    console.log({tick:r.tick, handle:h, index11:h & 0x7FF, index14:h & 0x3FFF,
      projected:r.entity_id, controllerAlive:r['CCSPlayerController.m_bPawnIsAlive'],
      X:r.X, Y:r.Y, Z:r.Z, health:r.health, team:r.team_num, life:r.life_state, alive:r.is_alive});
  }
}
// Likewise dp.parseEvent('demo2.dem', 'weapon_fire', props): P-affected
// base identity exists, but core Pawn extras are null on npm 0.42.0.
```

Expected: Pawn2927 core values, health100/team2/life_state0/true alive at these three firing ticks. Actual npm: entity879; Pawn fields null and is_alive=false. Main core values recover, including fire/hurt extras. Optional weapons remain absent when the source active-weapon handle is invalid; this is not a claim of every-field completeness.

X-only, health-only, team-only, combined columns, all ticks and sparse wantedTicks give the same core availability verdict. There are151 affected weapon_fire,94 player_hurt,31 player_death,17 player_spawn identity references. Spawn samples at6299/54039/95975/100396 never establish a correct npm Pawn link; main/oracle retain real2927 throughout.

Request: publish a npm release including the merged14-bit network-handle fix when ready, or confirm the supported release path. No further duplicate bug report is needed based on current evidence.

Anonymization plan: share numeric handle/index/state rows only; remove all10 SteamIDs, nicknames, user account names and local absolute paths from public logs. A DEM itself still contains player identities and cannot be anonymized merely by renaming it. **Private DEM sharing authorization UNKNOWN**; local diagnostic permission does not authorize upload. Confirm permission with the Product Owner before transmitting the file. No upload, issue or comment has been sent.
