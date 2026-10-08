# P5.7.0.1 — demo2 Native Pawn Mapping Diagnostic

2026-10-09. Baseline `4c7bc888920f8194ed89a6893fe98f67d2a8c91d`. Diagnostic complete; **recommendation A: upstream dependency issue, fixed on main**. Installed production 0.42.0 remains unchanged. This is diagnosis, not repair or acceptance.

The affected player's actual network pawn handle is `4574063`: the low 14 bits select Pawn `2927`, serial `279`. Installed 0.42.0 keeps only 11 bits and selects entity `879`, which the independent parser identifies as **CWeaponGlock**, not a player Pawn. The same incorrect PlayerMetaData mapping feeds tick collection and event enrichment. Independent demoinfocs reads the real Pawn; current demoparser main recovers the core fields with exact agreement at all three failing ticks. The source DEM contains the required Pawn data. This is an index truncation bug, not a nickname/SteamID ambiguity or a missing spawn handle update.

Structured counters, native samples, lifecycle observations and provenance are in [demo2-native-diagnostic.json](./demo2-native-diagnostic.json). No million-row raw trace, binary, DEM, production dependency or debug patch is committed.

## 1. Fixture identity

| Item | Observation |
|---|---|
| File | `.demo/demo2.dem` |
| SHA-256 | `253e5b719ac418b092ff3cdd1b5928bb0dfc8ccbf06cb9398963ea1e9fa44a25` |
| Bytes | 75,699,561 |
| Header map / patch | de_dust2 / 14181 |
| Established production tick rate / rounds / players | 64 / 18 / 10 |
| Server | 完美世界竞技平台天梯服务器 |
| Client / demo version | SourceTV Demo / valve_demo_2 |

The diagnostic checks the SHA before parsing. Header metadata does not establish absolute recording completeness. The 18-round/64-tick domain facts retain the previous acceptance evidence; these are not inferred from the native tick-row count.

## 2. Installed parser and runtime

Declared `@laihoe/demoparser2 ^0.42.0`; lockfile and installed package **0.42.0**. Actual Windows native package `@laihoe/demoparser2-win32-x64-msvc` **0.42.0**. Node **v26.3.0**, Windows 11 Pro, win32/x64. `npm view @laihoe/demoparser2 version --json` returned **0.42.0** on this diagnostic date: **no newer published npm version available**. No package.json or product lockfile change.

## 3. Affected player

SteamID64 `76561199273439650`; exact native nickname ` 鵺輓` (leading space retained). parsePlayerInfo final metadata has team_number=3. This is not the Product Owner target player. Metadata's final team is not round-side truth: the independent live Pawn is team 2 before halftime, team 3 afterwards.

## 4. Full-match field availability

Direct native parseTicks queried **all ticks, all players**, without wantedTicks or wantedPlayers filters, using struct-of-arrays output. It returned **1,075,770 rows = 10 × 107,577 ticks**; each player covers tick **0 through 107576**. The nine core Pawn properties below include armor; active weapon is counted separately because its absence can be legitimate.

| Affected field group | Installed 0.42.0 present | Main present |
|---|---:|---:|
| X / Y / Z / yaw / pitch / health / team_num / life_state / armor_value, each | 0 / 107,577 | 107,577 / 107,577 |
| Eight requested Controller fields, each | 107,577 / 107,577 | 107,577 / 107,577 |
| Custom is_alive=true | 0 | 78,986 |
| active_weapon_name | 0 | See alive coverage below |
| Correct projected Pawn index | 0 / 107,577 | 107,577 / 107,577 |

**Pawn fields never appear in installed output**, not merely after a mid-match gap. Installed is_alive returns false at every tick, including **79,026 ticks where Controller m_bPawnIsAlive=true**. The false values are a native error/default path and cannot prove death.

Main alive active-weapon coverage is **78,577 / 78,986**. The remaining **409 ticks, 75805–76213**, expose raw active_weapon handle `0xFFFFFF`, the invalid network handle. Independent raw Pawn samples at 75805/76000/76213 agree. Do not fabricate a weapon for that interval. The original full-Pawn gap is fixed; this statement does not certify every optional field or every downstream gate.

## 5. Controller versus Pawn

Sources follow the actual property map and collection paths, not friendly field names:

| Public field | Source |
|---|---|
| steamid / name | PlayerMetaData identity derived from Controller |
| player_steamid / player_name | CCSPlayerController.m_steamID / m_iszPlayerName |
| pending_team_num / is_connected | CCSPlayerController.m_iPendingTeamNum / m_iConnected |
| CCSPlayerController.m_iTeamNum / m_bPawnIsAlive | Direct Controller properties |
| CCSPlayerController.m_hPlayerPawn / m_hPawn | Direct Controller network handles |
| team_num | **CCSPlayerPawn.m_iTeamNum**, not Controller team |
| health / life_state / armor_value | Pawn m_iHealth / m_lifeState / m_ArmorValue |
| X/Y/Z | Pawn scene cell + offset calculation |
| yaw/pitch | Pawn eye-angle properties |
| active_weapon | Pawn weapon-services handle |
| active_weapon_name | Custom Pawn → weapon entity → item definition lookup |
| is_alive | Custom lookup of **Pawn m_lifeState**; only U32(0) gives true, failures/nonzero give false |
| entity_id | Projected PlayerMetaData pawn index, not controller_entid |

is_connected's observed enum 0 is recorded without inventing enum semantics. parsePlayerInfo is final metadata, not an arbitrary entity-table API. Public parseTicks supports raw Controller handles and projected Pawn index, but does not expose controller_entid or arbitrary entity state. The independent oracle supplies Controller ID 13/serial1008 and Pawn ID2927/serial279. At failing ticks the Pawn's reverse m_hController handle is **16515085**, whose low 14 bits resolve to Controller13 and serial1008; identity is established by entity handles, not position or nickname guessing.

Source references: [0.42.0 property map](https://github.com/LaihoE/demoparser/blob/v0.42.0/src/parser/src/maps.rs), [0.42.0 metadata/collection/is_alive paths](https://github.com/LaihoE/demoparser/blob/v0.42.0/src/parser/src/second_pass/collect_data.rs), [fixed decoder](https://github.com/LaihoE/demoparser/blob/45ca85aeac8fb0de9d385124d2c7fe0e7b8ff0c8/src/parser/src/entity_handle.rs).

## 6. Spawn lifecycle samples

Affected player has **17 native player_spawn events**. The recording begins with R1 start at tick0 and **no affected R1 spawn event**; R1 is examined via initial entities at tick0 and freeze_end1181. Do not relabel the first returned spawn as R1.

| Sample | Native spawn tick | Queried offsets |
|---|---:|---|
| R2, first observed spawn | 6299 | −8, −1, 0, +1, +8, +64 |
| R10, middle | 54039 | same |
| R17 | 95975 | same |
| R18, final | 100396 | same |

Each includes affected, same-team 番薯大王999 (`76561199522647342`, Controller4/Pawn289), and opponent Softweep (`76561199029458175`, Controller5/Pawn591). Control selection initially uses metadata only for diagnostic grouping; live Controller/Pawn team is queried at each sample, including halftime. No metadata-to-side fallback is installed.

Independent entity lifecycle: Controllers4/5/13 and Pawns289/591/2927 are created at tick0. Pawn2927/serial279 remains the player's m_hPlayerPawn throughout. m_hPawn changes to observer handle10455918 after death and returns to4574063 on respawn; the tracked Pawn is not recreated on each spawn. The first observed death/observer transition is4634; first return is6299. Entity879 starts as CWeaponGlock/serial673 and is destroyed at6299. Installed mapping remains879 through all spawns, even after that weapon entity disappears. Main and oracle preserve the real2927 Pawn before/on/after all four sampled spawns. At the spawn tick main has health100/life_state0; optional active weapon may still be invalid.

This is **valid Controller + valid Pawn + wrong truncated index**, not a Controller that never acquired a Pawn handle. Creation ticks mean first creation observed by the parser in this recording, not a claim about pre-recording server lifecycle.

## 7. Event-extra comparison

Direct native **parseEvent**, independently for each of the four event names, requested the same Controller/Pawn fields. Counters include affected identity in any base actor role; event references are not all victim-only or all attacker-only. Additional player_steamid enrichment columns are excluded from actor-role counting.

| Event | Affected referenced events / roles | Installed core XYZ/health/team/life_state | Main core |
|---|---:|---|---|
| weapon_fire | 151 / 151 | all missing | 151 / 151 |
| player_hurt | 94 / 94 | all missing | 94 / 94 |
| player_death | 31 / 31 | all missing | 31 / 31 |
| player_spawn | 17 / 17 | all missing | 17 / 17 |

Base SteamID/name identity and Controller extras are present in installed output. At fire ticks3743/4292/4511, installed user_is_alive=false while Controller m_bPawnIsAlive=true. Main fire/hurt active weapon fields are151/151 and94/94; death27/31 and spawn5/17 retain optional absence. Thus **core extras recover**, not every optional field on every event. Normal controls have core extras throughout both variants; per-role counts and bounded raw samples are in JSON.

## 8. Query shape

At ticks3743,4292,4511 run X-only, health-only, team_num-only, and combined XYZ/view/health/is_alive/team/weapon queries, for affected and both controls. All agree with the full-match query. wantedTicks subset/full all-ticks and wantedPlayers-filtered/unfiltered queries reproduce installed loss; main restores fields in the same shapes. Adapter normalization is not involved.

Native serialization can omit a column when a filtered AoS result is entirely null; unfiltered/SoA can explicitly emit nulls. JSON retains raw rows and records equality **after missing/null normalization**, not byte-identical objects. This representational difference does not change field availability and does not explain the Pawn loss.

## 9. All-player controls and raw entity check

Every player has107,577 rows. Core=the nine Pawn properties listed above; full details include every field counter.

| SteamID64 | Native name (leading spaces preserved in JSON) | Final metadata team | Pawn14 | Installed core rows | Main core rows |
|---|---|---:|---:|---:|---:|
| 76561198336129296 | 清华北大落榜生灰太狼 | 2 | 1724 | 107577 | 107577 |
| 76561198391008442 | 老彩笔123 | 2 | 715 | 107577 | 107577 |
| 76561198397206664 | 元屠 | 3 | 589 | 107577 | 107577 |
| 76561198867753114 | 梅花花花 | 3 | 613 | 107577 | 107577 |
| 76561198995898561 | 东彦丶周公瑾 | 2 | 717 | 107577 | 107577 |
| 76561199029458175 | Softweep | 2 | 591 | 107577 | 107577 |
| 76561199273439650 | 鵺輓 | 3 | **2927** | **0** | **107577** |
| 76561199521001812 | 初泽走野 | 3 | 1610 | 107577 | 107577 |
| 76561199522647342 | 番薯大王999 | 3 | 289 | 107577 | 107577 |
| 76561199760994801 | 图丶图 | 2 | 1842 | 107577 | 107577 |

Only affected has a globally missing core Pawn; all nine other Pawn indices are below2048 and the 11/14-bit masks agree. However **weapon entity handles also use the mask**: main restores alive active-weapon coverage for all nine controls to100%, while installed has gaps. The dependency fix has broader observable behavior than one player's position repair and needs whole-fixture regression next round.

Native projected output has exactly10 SteamIDs, with no unnamed/zero-SteamID extra player rows. That is not a complete raw-entity inventory. Independent raw CCSPlayerPawn enumeration at all three failing ticks finds real Pawn2927 and its reverse Controller link; it is not another SteamID's trajectory. No position-based identity reassignment is proposed.

## 10. Independent parser oracle

demoinfocs-golang source revision **14db58bad6e6ac2cb794b441c7b3d0d2a6dd1752**, v6 module, Go **1.27.2 windows/amd64**, compiled/run only in ignored `.tmp`. Full stream parsed successfully, no warnings. There are107,638 FrameDone callbacks; each selected player has107,607 snapshots with Controller, Pawn, XYZ input components, health, team and life_state present. These include sign-on/repeated ticks; they are **not native unique tick counts**.

The oracle samples all requested round boundaries, spawn windows, three failing ticks and three invalid-weapon interval ticks using exact IngameTick after FrameDone. No nearest-tick join. Position requires six raw cell/offset properties; a library default zero vector is never counted as evidence. Alive comparison uses raw Pawn life_state, not the oracle library's own Controller fallback.

| Failing tick | Oracle / main X | Y | Z | health | team | life_state |
|---|---:|---:|---:|---:|---:|---:|
| 3743 | 1511.8631591796875 | 626.2211303710938 | −51.7987060546875 | 100 | 2 | 0 |
| 4292 | 1435.5926513671875 | 1986.010009765625 | −9.68841552734375 | 100 | 2 | 0 |
| 4511 | 1448.15234375 | 1967.5460205078125 | −10.1806640625 | 100 | 2 | 0 |

Core position/health/team/life_state match main **exactly**, not with a position tolerance. [Independent handle constants](https://github.com/markus-wa/demoinfocs-golang/blob/14db58bad6e6ac2cb794b441c7b3d0d2a6dd1752/pkg/demoinfocs/constants/constants.go) and [Pawn lookup](https://github.com/markus-wa/demoinfocs-golang/blob/14db58bad6e6ac2cb794b441c7b3d0d2a6dd1752/pkg/demoinfocs/common/player.go) are separate implementation evidence.

## 11. Upstream main experiment and history

Main revision **45ca85aeac8fb0de9d385124d2c7fe0e7b8ff0c8**, checked out2026-10-09; handle fix **451321a517ec9c0c6be7f0103dd07e7a805c3345**. Same native probe:

**npm0.42.0 FAIL + current upstream main core Pawn PASS → existing unreleased upstream fix.**

The temporary Node binding was compiled release for **x86_64-pc-windows-gnu**, using portable Rust1.99.0 and w64devkit2.10.0. Stock Node Cargo.toml references obsolete parser feature `voice`; that feature declaration was removed from the temporary binding manifest only. Cargo regenerated its temporary lockfile. Parser source was unchanged; no diagnostic instrumentation was needed. csgoproto's standard build regenerated protobuf.rs using GameTracking-CS2 revision **ac1278dbbff39b7fe5030fba42a010e455c011f6**. protoc36.2 failed on Valve descriptor options; protoc21.12 succeeded. The linker needed a libgcc.a alias named libgcc_eh.a. Release build succeeded with25 binding warnings. Binary SHA and complete build qualifications are recorded in JSON; this is not a production MSVC/Electron qualification.

| Upstream item | Similarity | Difference / weight |
|---|---|---|
| [#362](https://github.com/LaihoE/demoparser/issues/362), [merged #363](https://github.com/LaihoE/demoparser/pull/363) | Same0.42.0, Controller readable, Pawn index>2047, Perfect World recording, all-match Pawn nulls | Other fixture is Mirage with a different handle; demo2 independently reproduces the mechanism and main restoration. Strong corroboration, not similarity-only inference. |
| [#321](https://github.com/LaihoE/demoparser/issues/321) / [#323](https://github.com/LaihoE/demoparser/issues/323) | Patch compatibility and unpublished-fix history | 14152 demos throw EntityNotFound broadly; demo2 parses successfully with one Pawn projection gap. No same-root-cause claim. |
| [#339](https://github.com/LaihoE/demoparser/issues/339) | Entity-stream parsing failure on individual demo | 14165 mid-file desync/throw rather than one stable index truncation. No same-root-cause claim. |
| [#358](https://github.com/LaihoE/demoparser/issues/358) | Identity/extras can be missing | Bots/zero SteamID handling differs; demo2 affected SteamID and Controller are stable and nonzero. |

## 12. Patch comparison

| Fixture | Patch |
|---|---:|
| demo1 | 14174 |
| demo2 | 14181 |
| demo3 | 14169 |
| nuke / dust2 / ancient | 14055 |
| inferno | 14165 |
| mirage | 14188 |
| anubis | 14129 |
| overpass | 14100 |

Headers were read directly. Existing acceptance records show demo1/demo3 required spatial PASS and professional core structural validation; this spike does not rerun full-match availability for every professional fixture. demo2 is the only diagnosed14181 fixture here. **No “14181 bug” conclusion**: handle truncation plus real2927 Pawn/main recovery establishes the mechanism; one patch sample cannot establish patch causality. Train remains removed/not required.

## 13. Why all18 AliveState rounds are unavailable

Read-only re-evaluation of current production Match + resolveRoundAliveState reproduces18 unavailable rounds. Every freeze baseline has affected participant=null, side=Unknown, alive=false. team_num missing makes participation unknown; the custom false is not sufficient to exclude the player. R1 freeze tick1181 and all later baselines independently contain the same gap. This is18 independent round rejects, not one cached global failure.

Current resolver intentionally requires a complete, unambiguous participant baseline for exact CT/T manpower. It rejects unknown participant/alive, unknown sides, missing victims/known killers from the roster, or in-round lifecycle anomalies. One unresolved participant may add a living member to either side, change sole-survivor/advantage/elimination tags, or invalidate negative response/teammate opportunity assertions even when the focal kill is between two other players. Once rejected, before/after=null, appliedVictimIds=[], tags empty; raw death refs and candidate player states remain. Candidate nine-player lists are **not certified partial alive timelines**. This is correct for the current exact-count contract; no unnecessary cross-round global poisoning was found.

**R18 additionally has lifecycle-anomaly**. Restoring Pawn decoding does not prove that every round becomes complete, and a main native-field PASS is not Personal Gate PASS.

Recoverable subsets: confirmed event refs, enemy kill attribution, event-only multi-kill counts, and independently reliable two-actor positions can remain available without exact whole-round counts. Some already do: installed impact has108 credited kills and27 multi-kill rounds despite0 eligible manpower rounds. Unknown actors/side/feed may separately degrade these subsets. A future scoped per-player state contract could retain proof for known participants/windows; the present unavailable players/deathTick candidates must not be reinterpreted as that contract.

Extra proof for partial state: per-player observed baseline alive/team; complete scoped death/lifecycle feed; explicit uncertainty/time boundaries; reliable side changes through halftime; and consumers that distinguish known membership/lower bounds from exact counts and reject unsupported absence or sole-survivor conclusions. To restore exact whole-round counts, all participants and lifecycle consistency must be proven. No parsePlayerInfo-team, spawn/death-only alive, event actorSide-to-all-ticks, initial-team, nickname or nearest-position fallback is added.

## 14. Root-cause classification

Task hypotheses: **A (DEM lacks Pawn) rejected** for this gap; **B (parser Controller→Pawn map) confirmed**; **C (shared SteamID/Pawn projection) describes the downstream manifestation**, not an independent SteamID recognition failure; **D (our query shape) rejected**; E is not needed for the core gap. Precise failure happens in PlayerMetaData construction/handle-index resolution before tick/event property reads. Low11-bit879 aliases a Glock; low14-bit2927 and serial279 locate the correct Pawn. Serial freshness bugs are not required to explain this observed failure.

Repair recommendation category **A: upstream dependency issue, fixed on main**. This classification is backed by fixture-specific full-match native observations, independent raw entity/identity/state decoding, source comparison and actual main execution. Remaining optional weapon/lifecycle and production-packaging questions remain explicitly open.

## 15. Next action, upstream draft and reproduction

Next separately scoped production task: evaluate a published release containing#363 when available; otherwise evaluate an audited pinned dependency build/backport. Include network invalid-handle sentinels, Pawn/weapon/event handle sites, player indices above2047, serial/index distinction, and normal-player weapons. Do not use a main binary as an implicit production replacement. Run full personal/core/historical regressions, deterministic report and Windows packaging before reconsidering acceptance. Keep resolver semantics intact unless a separate evidence-backed scope change is approved.

Existing#362 is already closed by#363, so a duplicate bug issue is not useful. [Owner-review-only follow-up draft](./demo2-upstream-issue-draft.md) supplies demo2 validation/release evidence. No GitHub issue/comment or DEM upload was sent. Private DEM sharing permission is **UNKNOWN**, not inferred from local diagnostic authorization. Draft public text uses P-affected instead of SteamID/name; local diagnostic evidence retains exact identities for reproducibility.

Run installed probe from repo root:

```powershell
node --max-old-space-size=8192 scripts/demo2-pawn-diagnostic.mjs
```

Build only in ignored temporary checkout, pinning main and GameTracking revisions listed above. Portable tools remain under `.tmp/demo2-diagnostic/toolchain`, Rust homes under the same temporary root. Remove `features = ["voice"]` only from temporary `src/node/Cargo.toml`; never the product manifests. Set local process PATH/RUSTUP_HOME/CARGO_HOME and PROTOC to the portable21.12 compiler, then:

```powershell
cargo build --release --manifest-path .tmp/demo2-diagnostic/demoparser/src/node/Cargo.toml
Copy-Item -LiteralPath .tmp/demo2-diagnostic/demoparser/src/node/target/release/laihoe_demoparser2.dll -Destination .tmp/demo2-diagnostic/demoparser-main.node
node --max-old-space-size=8192 scripts/demo2-pawn-diagnostic.mjs --native .tmp/demo2-diagnostic/demoparser-main.node --out .tmp/demo2-diagnostic/native-main.json
```

Run oracle **from the temporary demoinfocs checkout** pinned to its recorded revision, using portable Go and absolute paths:

```powershell
go run E:/cs2-analyst/scripts/demo2-pawn-oracle.go E:/cs2-analyst/.demo/demo2.dem E:/cs2-analyst/.tmp/demo2-diagnostic/native-installed.json E:/cs2-analyst/.tmp/demo2-diagnostic/oracle.json
```

Alive-state evidence was generated by importing existing built Demoparser2Provider + resolveRoundAliveState, parsing demo2 unchanged, and saving each round's freeze snapshots and resolver return into ignored `alive-state.json`. This is explanatory re-evaluation, separate from the minimal native reproduction. With all four experiment inputs present, assemble bounded JSON via:

```powershell
node scripts/demo2-pawn-diagnostic-report.mjs
pnpm typecheck
pnpm --filter @cs2-analyst/dem-parser test
```

Validation: typecheck13/13 successful (Turbo cache); dem-parser39 PASS/0 FAIL/0 SKIP, including real demo1 goldens; installed/main probes, native shape equality and independent exact oracle comparisons PASS. Both MJS syntax checks and oracle Go vet PASS. Independent final review PASS with no actionable finding. No installer run because there is no production diff. Project boundaries are unchanged.

## 16. Personal Gate and handoff

**demo1 PASS / demo2 FAIL / demo3 PASS**; Personal Gate remains failed. **P5.7.0 PARTIAL PASS; P5.7.1–P5.7.8 PASS; P5.7 FINAL HOLD; v0.1 FINAL PAUSED.** This spike resolves the core source-versus-native diagnosis, not acceptance. Production packages/UI/analytics/contracts/adapter semantics and package manifests/lockfile unchanged. Worktree: existing `E:/cs2-analyst`, no new checkout or branch. Focused diagnostic commit only; no amend, squash or push.
