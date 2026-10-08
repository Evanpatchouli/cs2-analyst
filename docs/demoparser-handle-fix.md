# P5.7.0.2 — demoparser 14-bit Entity Handle Fix Integration

2026-10-09. Product baseline `7b016278a8209b917df688b54be6763d04f53663`. **P5.7.0 PASS; P5.7 FINAL PASS; v0.1 Final Acceptance READY TO RESUME.** The next task is a separate Final Acceptance Resume, not v0.1 FINAL PASS. No Analytics, Findings policy, domain semantics, preload or IPC permissions changed.

## Fixed source and scope

Official npm `@laihoe/demoparser2` latest still returns **0.42.0** (`npm view ... version --json`, 2026-10-09). [Issue #362](https://github.com/LaihoE/demoparser/issues/362) and [merged PR #363](https://github.com/LaihoE/demoparser/pull/363) establish the network entity handle bug. Old code kept 11 index bits; CS2 demo/network handles have 14 index bits and a 10-bit serial. Native CEntityHandle's 15-bit representation must not be confused with that format. Both `0xFFFFFF` and signed `-1` are invalid network handles, never entity 16383.

| Source | Pin |
|---|---|
| Repository | https://github.com/LaihoE/demoparser.git |
| Base tag | v0.42.0 |
| Base commit | d3767705dc5846d73ed29db50eaeda58778dc934 |
| #363 merged fix | 451321a517ec9c0c6be7f0103dd07e7a805c3345 |
| PR head | cc214aed17d23fa996929305df5413505a7dd40b |
| Original merged patch SHA-256 | f1b4e750a0fbb38136e4e5bf29c02d974b84c7eeee2aaf45353ceb8253bec8f9 |
| Backport patch SHA-256 | 47a9b2bfcb5fd9ee0358f1362e7a5ccc61bdd0a69e526ba1717cd70b13fc2c68 |
| Production target | x86_64-pc-windows-msvc |
| Internal package | @cs2-analyst/demoparser-native@0.42.0-backport.363.1 |

`vendor/demoparser/entity-handle-363.patch` is the exact merge diff. `backport-363.patch` is its three-way application onto the base tag: all additions/deletions in six parser files match upstream; only contextual lines differ. It includes the central decoder, sentinels, Pawn, weapon, inventory, grenade, C4, event-user and usercmd handle consumers and all three upstream tests. Independent review compared all six files against the merge. There is no floating main dependency or copied upstream repository in source control.

`build-support.patch` is separate, mechanical build support for the old tag: remove its nonexistent `voice` feature and prune only that obsolete dependency chain from Cargo.lock; disable both source generators. Original parser/build.rs calls nested Cargo to regenerate message_type/maps; csgoproto/build.rs clones floating GameTracking-CS2 and regenerates protobuf. The tag already contains all generated files. They are retained unchanged, SHA-checked before and after compilation. Thus no GameTracking checkout or protoc is a build input. [source.json](../packages/demoparser-native/source.json) records every patch, generated-source and actual compiled lockfile SHA. `.gitattributes` preserves patch bytes on Windows.

## Build and loading

Prerequisites: Node/pnpm, Git, Windows tar, Rust **1.90.0**, Cargo **1.90.0**, MSVC **14.44.35207**, Windows SDK **10.0.26100.0**, Windows x64. `@napi-rs/cli` **2.16.1** is pinned in pnpm-lock; Node used for acceptance is **v26.3.0**, host Node-API **10**, binding API **napi6**. MSVC supplies the linker/SDK; no GNU diagnostic binary is part of the product.

```powershell
# Optional repository-local toolchain provisioning; supply an actual Python executable.
pwsh -File vendor/demoparser/setup-tools.ps1 -Python <python.exe>
# Or run in a configured MSVC developer shell. CS2_ANALYST_MSVC_SETUP may point to vcvars64.bat.
pnpm install --frozen-lockfile
pnpm parser:build-fixed
pnpm parser:verify
pnpm typecheck
pnpm build
pnpm --filter @cs2-analyst/desktop pack:win
pnpm --filter @cs2-analyst/desktop pack:win:test
pnpm --filter @cs2-analyst/desktop test:installed
# Full Cargo cache reset for a cold native compilation:
pnpm --filter @cs2-analyst/demoparser-native build:native --clean
```

The optional provisioning script pins rustup 1.29.1 and the downloader by SHA; it downloads MSVC/SDK payloads from Microsoft's manifests, verifies their hashes and records actual tool versions in each build. It does not change the global PATH. Rust/compiler acquisition is a prerequisite, not a runtime dependency.

The build exports the pinned tag with git archive, canonicalizes text line endings, applies only the two fixed patches, runs the three Rust tests under MSVC, and invokes NAPI with `--cargo-flags=--locked`. Generated source/lock hashes are checked again. Release linker `/Brepro` avoids a wall-clock timestamp; the project source path is remapped. `native/provenance.json` records source, toolchain and produced binary SHA. `native/`, upstream .git, Cargo target/cache and raw diagnostic outputs are ignored. No `.node` is committed.

Production path: UI/worker → **dem-parser adapter** → internal native package → exact sibling `.node`. Only dem-parser declares the production native dependency. The internal loader checks Windows x64, source metadata and binary SHA before loading; it has no official-package fallback. `pnpm parser:verify` prints actual path/source/SHA. Native verification tasks bypass Turbo cache. No node_modules mutation supplies the fix.

Packaging keeps the internal native package external and bundles the other workspace packages. prepare-pack copies only its loader, source metadata and native output, then verifies the staged SHA again. ASAR registers exactly one `.node`, unpacked at:

`resources/app.asar.unpacked/dist/electron/node_modules/@cs2-analyst/demoparser-native/native/demoparser2.win32-x64-msvc.node`

Installed smoke compares that binary with its build output and compares ASAR provenance/source metadata. Production test-seam exclusion and path-injection protection are unchanged.

## Parser and fixture evidence

Affected demo2 account `76561199273439650`: Controller **13** (independent entity oracle), raw Pawn handle **4574063**, Pawn **2927**, incorrect old projection **879/CWeaponGlock**. Production diagnostic checks each of X/Y/Z/yaw/pitch/health/team_num/life_state/armor: **107577/107577**, mapped entity only 2927, zero index mismatches. There are **78986 alive ticks** and **78577 available active-weapon ticks**. The **409 ticks 75805–76213** retain raw invalid handle `0xFFFFFF` and unavailable weapon.

Nine control players retain **107577/107577** core rows and unchanged alive counts. Their alive-weapon availability changes as follows; no core regression:

| SteamID | Old available | Fixed available / alive |
|---|---:|---:|
| 76561198336129296 | 44871 | 70859 |
| 76561198391008442 | 47124 | 69029 |
| 76561198397206664 | 59553 | 84183 |
| 76561198867753114 | 55282 | 72156 |
| 76561198995898561 | 51993 | 79376 |
| 76561199029458175 | 42130 | 58854 |
| 76561199521001812 | 56738 | 74478 |
| 76561199522647342 | 55311 | 68917 |
| 76561199760994801 | 51367 | 72619 |

Weapon improvements are independently checked at all changed event-enrichment ticks, not accepted merely because counts increase. The demoinfocs oracle is pinned to `14db58bad6e6ac2cb794b441c7b3d0d2a6dd1752`, Go **1.27.2**. It reads actual controller/Pawn/weapon entities, item definitions, inventory and owner handles; no product fallback is installed. [Handle oracle report](./demoparser-handle-oracle.json) records samples and counts.

| Fixture | Selected ticks / rows | Native-vs-oracle differences | Utility/flash/kill/bomb events matched |
|---|---:|---:|---:|
| demo1 | 42 / 420 | 0 | 1011 |
| demo2 | 1032 / 10320 | 0 | 609 |
| Nuke | 40 / 400 | 0 | 846 |

Active raw handles resolve to the same real weapon entity and item identifier; inventory item IDs agree. Invalid handles have no weapon/item. Kill weapon identifiers, native event weapon extras and raw grenade/C4-owner→Pawn identities are checked. HE/flash/smoke/fire/decoy throwers and effect entity IDs, flash victims, bomb pickup/drop/plant/defuse/explosion actors all match independently. Existing utility linkage and Desktop Timeline invariants pass. This is sampled native entity freshness evidence, not an absolute freshness guarantee.

Event enrichment is evaluated at event processing time, whereas parseTicks and the oracle snapshots represent the final state of that tick. Every sampled extra is accounted for: demo1 86 = 69 same-frame-handle + 14 frame-timing differences + 3 null actors; demo2 1909 = 1695 + 166 + 48; Nuke 87 = 60 + 19 + 8. All frame-timing differences are independently traced to the Pawn's same-tick transitions or last pre-tick handle, and to a real weapon entity with matching 14-bit index, 10-bit serial, creation/destruction interval and item definition. Labels are checked against the unchanged, hash-verified tag map. All 108 changed demo2 enrichments in that group pass. No record is silently skipped, no missing oracle/player row remains, and no sub-tick order is invented. Independent review reconstructed these differences by event ordinal and confirmed exact coverage.

The old baseline was captured before replacing the adapter dependency. A separate exact-0.42.0 reference install and test-only Node resolve hook reproduce all ten original hashes after integration. This hook is only in the regression harness. [Regression comparison](./demoparser-handle-regression.json) compares complete Match, Spatial, five evidence layers, Findings V2 and native extras:

- **UNCHANGED**: demo1, demo3, Nuke, Inferno, Dust2, Mirage, Ancient, Anubis, Overpass.
- **EXPECTED FIX IMPROVEMENT**: demo2, supported by the independent handle evidence.
- No suspicious native event payload change; no altered demo1 golden. Train remains REMOVED / NOT REQUIRED and was never run.

All fixtures have exact references, same-round contacts, unique contact/fire assignments, nonnegative alive counts, no invented same-tick ordering, no posthumous resurrection or Finding contradictions, finite JSON-only output, deterministic evidence and immutable inputs. Core professional tests retain the established same-tick/ambiguous/lifecycle guards.

## Personal and Desktop acceptance

demo1 **PASS**, demo2 **PASS**, demo3 **PASS** through actual analyzeDemoFile(), exactly one parseWithSpatial per import, schemaVersion 2, independently repeated deterministic reports. [Personal acceptance JSON](./deep-review-personal-acceptance.json) retains original 0.42.0 Gate FAIL as historicalGate; original native diagnostic markdown/JSON are unchanged.

demo2 required partial samples **270→0**, all 10 players now appear in Desktop. KillImpact has **17 complete rounds**; **R18 remains unavailable solely for lifecycle-anomaly**, not handle loss. Teamplay/Utility retain truthful partial coverage for that anomaly and same-tick limitations. 元屠 emits **1 Review + 1 Highlight + 1 context**: received-first reverse-contact review (3/6, R13/R15), R3 3K advantage/win highlight, teamflash observation (4/10 effects, five teammate effects). No threshold or Findings rule was changed. The former zero Findings was never a golden.

Real Electron personal UI smoke passed all three targets, report default, Deep Review/Timeline/Analysis, player switching and Finding→Timeline linkage. 元屠 screenshot was visually inspected: restored findings and natural text; remaining partial-record copy reflects real R18/same-tick coverage. It was not removed by changing analyzer coverage.

demo1 historical tests retain K/D/A 25/20/4, ADR 91.38, KAST 75%, Trade 22.2%, CT/T, Opening, Utility, Clutch, MultiKill, R24 1v3, R22 posthumous HE, Findings V1, Timeline, Analysis and Desktop DTO. Complete old/fixed outputs also hash identically.

## Final acceptance record

Native clean-build, packaging/installed proof and final gates are summarized in [demoparser-handle-fix.json](./demoparser-handle-fix.json). Initial installed runs failed an exact content-top assertion during a preceding Finding→Timeline smooth scroll (37/33 versus 40); the smoke harness now settles and cancels that test scroll before the same exact assertion. No product layout or assertion threshold was altered. History is not rewritten as a first-attempt pass.

Both source builds use the same fixed patch/generated source/Cargo graph and MSVC toolchain. The primary native output is `132d664125b60542dc80dc8bc270e2c8e181a0a55433fdac5be285ef4d9b0de1`; a second full cargo-clean compilation in that path produces the identical SHA. An isolated checkout with empty node_modules/native/dist/Turbo/Cargo-target outputs successfully performs frozen install → native Rust tests/build → typecheck → build → both installers → complete installed smoke. Its native SHA is `f6e27ef389d68c47e7f7cfdc8006d4cbaaf8834d2521572c5ba996e54ada4575`; its production and seam installed files match that SHA and provenance. Different checkout/Cargo paths did not produce identical bytes; the precise cause is not established by a controlled experiment. Cross-path bit reproducibility is not claimed. Only toolchain and downloaded registry source caches are shared; no compiled native binary or pnpm/Turbo output supplies the clean build.

The installed harness also encountered a Windows maximize/restore transition race. It now enables CDP focus emulation and waits for the native maximize animation before testing restore. Layout checks retain their exact 40px assertion; the harness resets both content and outer-window scroll after viewport changes. All final installed scenarios pass in the clean checkout. Initial failed runs remain local evidence.

The primary working-directory production and seam installers also completed the full final installed smoke; both unpacked binaries and ASAR provenance match the primary `132d6641…` build. Thus the primary release artifacts and isolated clean artifacts each have their own verified installed result, rather than sharing a claim across different SHAs. Typecheck 15/15 and build 8/8 pass; match-model contracts pass; parser40, Analytics53, Findings V1 17, Deep Review210 and Desktop29 tests pass with zero failures or skips. Independent final review passes.

Remaining UNKNOWNs: native feed absolute completeness, other untested recording modes, absolute entity freshness guarantees, peak memory. The handle fix does not resolve them.

## Official-release migration

This is temporary dependency maintenance. Once an official npm release is verified to include #363, create a separately scoped **backport → official release** task. Compare native loading/provenance, rerun parser/weapon/grenade/C4 regression, all Personal and four professional fixtures, Desktop and both Windows package/installed checks before removing the internal backport. No floating latest/main switch and no permanent unnoticed fork.
