# P2.1 Combat Event Model — evidence and limits

The adapter uses the lockfile's `@laihoe/demoparser2` **0.42.0**. Its installed `index.d.ts` declares event results as `any`, without field-level contracts. The mappings below were verified with `.demo/demo1.dem`, SHA-256 `f3c3173eae0cd100d15c81c3b734be792f9212256a9c99703b358d3434000852`. Current upstream documentation is only an API reference; installed signatures and this DEM's actual output are the implementation evidence.

[`combat-native.json`](../packages/dem-parser/tests/fixtures/combat-native.json) captures unmodified native rows: the first live row of each requested event kind, then ordinary/flash assist kills, unattributed damage and an incendiary release. This is a set of field examples, not a complete match timeline. Synthetic tests separately cover malformed fields, unknown sides, bots, numeric IDs, restarts, halftime and same-tick starts.

Capture query: `parseEvents(bytes, eventNames, ["team_num"], ["total_rounds_played", "is_warmup_period", "game_time"])`, using the names below plus `round_start`, `round_freeze_end` and `round_end`. No `parseTicks` or `parseGrenades` call is made. Converter internals and native records stay inside dem-parser; match-model imports only its own domain types.

## Verified mappings

Every event keeps `tick`. `*_steamid` values are accepted only as nonzero decimal strings; numeric/bigint IDs reject conversion rather than risk precision loss. Players are deduplicated by string ID. `*_team_num` maps `2/T → T`, `3/CT → CT`, otherwise `Unknown`, with no metadata fallback for event sides.

| Native event | Native fields → domain payload |
| --- | --- |
| `player_death` | `attacker_steamid → killer`, `user_steamid → victim`, `weapon`, `headshot`; `attacker/user/assister_team_num → killer/victim/assisterSide`; `assister_steamid → assister`; `assistedflash → assistedFlash` |
| `player_hurt` | `attacker_steamid → attacker`, `user_steamid → victim`, actor sides; `dmg_health → healthDamage`, `dmg_armor → armorDamage`, `health → healthRemaining`, `armor → armorRemaining`, `weapon`, `hitgroup` |
| `weapon_fire` | `user_steamid → shooter`, `user_team_num → shooterSide`, `weapon`, `silenced` |
| `smokegrenade_detonate` | `utility: smoke`, `action: detonate`; `user_steamid → thrower`, user side, `entityid → entityId`, `x/y/z → position` |
| `hegrenade_detonate` | Same effect fields, `utility: hegrenade`, `action: detonate` |
| `flashbang_detonate` | Same effect fields, `utility: flashbang`, `action: detonate` |
| `inferno_startburn` | Same effect fields, `utility: fire`, `action: start_burn` |
| `decoy_started` | Same effect fields, `utility: decoy`, `action: start_decoy` |
| `player_blind` | `attacker_steamid → attacker`, `user_steamid → victim`, actor sides; `blind_duration → blindDurationSeconds`, `entityid → entityId` |
| `bomb_pickup` / `bomb_dropped` | `action: pickup/drop`; `user_steamid → player`, user side |
| `bomb_beginplant` / `bomb_planted` | `action: plant_start/planted`; event player and side; `site → siteIndex` |
| `bomb_begindefuse` | `action: defuse_start`; event player and side; `haskit → hasKit` |
| `bomb_defused` / `bomb_exploded` | `action: defused/exploded`; event player and side; `site → siteIndex` |
| `round_start` | `round` or `total_rounds_played + 1 → number`; `tick → startTick` |
| `round_freeze_end` | `tick → freezeEndTick` |
| `round_end` | `tick → endTick`, `winner → winner`, `reason → endReason` |

`teamkill` is the only added derived combat flag: identified killer and victim, known equal sides, and distinct IDs yield `true`; opposite sides or a known suicide yield `false`; missing identity/side yields no flag. No ADR, KAST, opening, trade, multi-kill or clutch conclusion is computed here.

Required hurt amounts and remaining health/armor are nonnegative safe integers; missing/invalid values reject conversion instead of becoming zero. Flash duration is finite and nonnegative. The converter preserves `0` and `false`. Missing optional labels/flags are omitted. Without an identifiable victim, kill/hurt/blind rows are omitted; without an identifiable shooter, weapon-fire rows are omitted. Utility/bomb evidence can still carry a null actor. Bots without unique SteamIDs are not represented as separate players.

## Observed details that affect Analytics

- Tick 2287 reports `dmg_health: 109`, `health: 0`, `armor: 100`, `hitgroup: "head"`. Damage is not capped to 100. The hurt weapon is `hkp2000` while the same-tick death reports `usp_silencer`; these identifiers are preserved independently rather than reconciled by guesswork.
- Weapon-fire identifiers include `weapon_knife`, `weapon_flashbang`, `weapon_molotov` and `weapon_incgrenade`. The sample has 146 flash releases and 146 flash detonations. These are different stages of the same usage and must not be added together as grenade throws. There are 83 molotov/incendiary releases and 80 inferno starts, so effect counts do not equal usage counts.
- A flash detonation can generate several victim events, including friendly/self flashes. The captured entity 330 at tick 1927 includes a self-blind duration `0.5644214153289795`. The reported duration is retained without deriving actual uninterrupted blind time under overlapping flashes. Entity indices may be reused; correlation must also consider the round/tick context.
- The sample reports bomb sites `96/97`. A site index alone does not establish A versus B across maps. `bomb_begindefuse` carries a real boolean `haskit`; planted/defused events do not carry that flag. An explosion's associated user can be the planter, rather than a new action by that user. Native `c4` and dropped `entindex` values are not mapped because their semantics are not needed or established here.
- Round 1 starts at 65, freeze ends at 1441, and the round ends at 3413 with `ct_killed`. Planting and combat can still occur afterward; evidence is retained in round 1 until the next start. Same-tick start events are processed before other events at that tick; other same-tick rows retain native order without a claim about subticks.

## Unavailable or deliberately deferred evidence

- No verified plant/defuse abort row or `grenade_thrown` row occurs in this sample. Those actions are not modeled or inferred from missing completions. Other DEMs need their own actual-row verification before adding mappings.
- The inferno effect does not identify molotov versus incendiary; no guessed connection to a previous weapon-fire row is made.
- No complete per-round participant/side roster, alive-at-start snapshot, disconnect/reconnect or respawn timeline is collected. A player with no combat events still needs a round participation denominator. `Player.team` cannot supply this across halftime/overtime.
- No pre-hurt health snapshot is collected. Reported hurt amounts alone do not establish capped effective damage in partial recordings or when earlier state is missing. P3 must choose a damage policy and identify unsupported coverage.
- No exact subtick timestamp, global grenade ID, normalized weapon catalog, grenade flight, smoke/fire expiry, blind overlap resolution or site A/B mapping is claimed.

## Before P3

| Intended metric | Available evidence | Remaining requirement |
| --- | --- | --- |
| ADR / damage | attacker/victim, sides, damage amounts, remaining HP/armor, round boundaries | Define reported versus effective damage, friendly/environment exclusions and valid round denominator; pre-damage state if effective HP loss is required |
| KAST | kill/assist/flash-assist and trade candidates | Full per-round participation/alive state; define assist and survival/trade rules |
| Opening duel / multi-kill | kill actors, event sides, ticks and round bounds | Define valid combat window, exclusions and equal-tick handling |
| Trade | killer/victim links, sides, ticks, observed tick rate | Define trade time window and simultaneous-kill policy; suppress time-based results when tick rate is unknown |
| Clutch | death timeline, sides and winner | Reliable starting alive roster and lifecycle changes; do not infer 1vX from event participants alone |
| CT/T split | event-side snapshots | Per-round player side roster for denominators and rounds without events |
| Flash / grenade usage | weapon releases, effects, per-victim flash duration, grenade damage | Weapon classification, stage deduplication and overlap policy; additional verified lifecycle evidence if needed |
| Bomb round context | pickup/drop, plant/defuse starts and completions, explosion, round reason/bounds | Aborts and map site lookup only if a metric needs them |

P2.1 supplies combat evidence; accurate roster-dependent Analytics requires a small follow-up domain/parser task. That task can use bounded round snapshots or verified discrete lifecycle events, without collecting an all-tick position stream.

## Validation sample

`de_dust2`, 64 tick, 10 players, 24 rounds: **182 kills, 730 hurts, 4399 weapon fires, 421 utility effects, 282 victim flash effects, 125 bomb events**. Bomb actions: 51 pickups, 41 drops, 13 plant starts, 11 plants, 4 defuse starts, 4 defuses, 1 explosion. These totals include retained post-round events and are parser acceptance evidence, not Analytics results.

`pnpm --filter @cs2-coach/dem-parser test` builds the packages, compiles consumer contract assertions, runs converter/error/API tests and parses the real DEM twice to check determinism. Missing `.demo/demo1.dem` skips only real-file integration; the captured native fixture still runs. Set `DEM_TEST_FILE` to test another file under general model constraints without this sample's fixed totals.
