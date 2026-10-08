# P5.7 Personal DEM Compatibility Acceptance

## Current acceptance — P5.7.0.2 (2026-10-09)

Baseline `7b016278a8209b917df688b54be6763d04f53663`，固定 v0.42.0 + upstream #363 的生产 MSVC parser：**Personal Gate PASS — demo1 PASS / demo2 PASS / demo3 PASS**。demo2 必需 partial samples 270→0，Desktop 10/10，KillImpact R1–R17 complete；R18 lifecycle-anomaly 仍 unavailable，optional invalid active-weapon interval 75805–76213（409 ticks）保持 unavailable。元屠恢复 1 Review + 1 Highlight + 1 context；未改阈值、goldens 或覆盖率规则。真实 analyzeDemoFile 重复导入、完整 evidence invariants、Desktop 和干净检出两安装包 installed smoke 通过。详情见 [handle fix](./demoparser-handle-fix.md) 和 [当前 JSON（含 historicalGate）](./deep-review-personal-acceptance.json)。

**P5.7.0 PASS；P5.7 FINAL PASS；v0.1 Final Acceptance READY TO RESUME**。下一轮单独执行 Final Acceptance Resume；本轮没有宣布 v0.1 FINAL PASS。Native absolute completeness、其他未测试录制模式、绝对 entity freshness、peak memory 仍 UNKNOWN。

## Historical acceptance — original official 0.42.0 Gate FAIL

以下保留当时结论和数值，已由上方新生产 binding 验收取代；不是删除或改写失败记录。原始 native diagnostic Markdown/JSON 未修改。

2026-10-09. Baseline `80437834a43960196bc65d85cbd35095d9a469f8`. **Gate FAIL: demo1 PASS, demo2 FAIL, demo3 PASS.** No production code, algorithm, threshold or semantic changes. The Product Owner subsequently authorized committing the diagnostic acceptance result despite the failed gate. This records evidence without upgrading acceptance status; no push.

**P5.7.0 remains PARTIAL PASS; P5.7.1–P5.7.8 PASS; P5.7 Deep Review FINAL HOLD; v0.1 Final Acceptance PAUSED, not READY TO RESUME.** P5.7.8 visual acceptance is formally PASS per the Product Owner baseline.

## Provenance and identity

The Product Owner explicitly confirmed all three files as their own actual matches. This resolves provenance uncertainty, including demo1, which also retains all historical goldens. Personal fixtures validate target-user compatibility; professional GOTV fixtures validate cross-map/complex scenarios. These purposes differ.

All headers report `client_name: SourceTV Demo`, `demo_file_stamp: PBDEMS2`, `demo_version_name: valve_demo_2`. demo2/demo3 server_name reads 完美世界竞技平台天梯服务器; demo1 identifies a Valve server. This is raw header metadata, not parser certification of a matchmaking service, POV mode, capture/retrieval mechanism or recording completeness. Exact additional recording mechanism remains UNKNOWN.

| Fixture | SHA-256 | Bytes | Header map | tick/s | Rounds | Domain / Desktop players | Target |
|---|---|---:|---|---:|---:|---|---|
| `.demo/demo1.dem` | `f3c3173eae0cd100d15c81c3b734be792f9212256a9c99703b358d3434000852` | 267275583 | de_dust2 | 64 | 24 | 10 / 10 | twinkle |
| `.demo/demo2.dem` | `253e5b719ac418b092ff3cdd1b5928bb0dfc8ccbf06cb9398963ea1e9fa44a25` | 75699561 | de_dust2 | 64 | 18 | 10 / 9 |  元屠 |
| `.demo/demo3.dem` | `6c9dae6e5676f7e9498297c527393264d52a8944fdb03b972b8ed075a996e5ea` | 254040069 | de_dust2 | 64 | 21 | 10 / 10 | 🥔土豆🥔 |

demo2’s 元屠 is the same SteamID as demo1’s twinkle. The Product Owner corrected demo3’s requested target to 土豆; the exact DEM nickname is 🥔土豆🥔. Original nicknames are preserved in UI; there is no production name override. Acceptance-only identity/target selection lives in [manifest](./deep-review-personal-fixtures.json).

## Spatial compatibility

| Fixture | Requested / returned ticks | Rows | Core / optional missing | Required actor/target samples / partial | XYZ/view/state complete unique samples | Alive weapon available / alive samples | Gate |
|---|---|---:|---|---|---|---|---|
| demo1 | 11940 / 11940 | 119400 | 0 / 0 | 6221 / 0 | 119400 / 119400 | 90167 / 90167 | PASS |
| demo2 | 7498 / 7498 | 74980 | 0 / 0 | 3930 / 270 | 67482 / 74980 | 36444 / 49950 | FAIL |
| demo3 | 9164 / 9164 | 91640 | 0 / 0 | 4859 / 0 | 91640 / 91640 | 69329 / 69329 | PASS |

XYZ and yaw/pitch are recorded separately from health/alive/team and activeWeapon in JSON fieldCoverage. Every requested core tick returned; no optional ticks were budget-omitted. Every actualTick equals requestedTick, including missing-field rows. There is no nearest-tick join. Required actor/target samples are kill/damage/firearm-event relations; relevant player rows and out-of-round optional contexts retain conservative partial coverage. demo1/demo3 alive weapon coverage is complete. Dead-player weapon absence is legitimate optional degradation. Global Spatial partial does not mean required-event failure. Same-tick semantics remain atomic; velocity/usercmd do not enter production judgement.

### Compatibility blocker: demo2

**Classification: compatibility bug / source-native feed gap; exact root cause UNKNOWN.** 270 required actor/target samples belong to SteamID `76561199273439650` (native player name 鵺輓) and lack XYZ, yaw/pitch, health, team and active weapon. Native parseTicks reproduces nulls before adapter conversion at ticks 3743, 4292, 4511. Other nine players have entity fields at these ticks. parsePlayerInfo retains this identity and team_number=3, but event user_team_num is null and user_is_alive=false while 151 weapon_fire, 94 player_hurt, 31 player_death and 17 player_spawn records reference the player. First freeze boundaries also lack team_num.

The production adapter faithfully preserves missing values. Whether the DEM omits these entity properties or native parser decoding loses them is unresolved. No algorithm workaround, inferred team/alive substitution, threshold tuning or fixture/player production branch was added.

Downstream: all 18 KillImpact round states unavailable; Teamplay aliveState/spatialContext unavailable; Utility roundState/spatialContext unavailable. Desktop includes 9 valid players despite 10 identified domain players. Target 元屠 emits no Findings V2. This is substantial evidence loss and cannot pass the personal compatibility gate. No empty-state finding is manufactured.

Read-only evidence and reproduction: [native probe JSON](./deep-review-personal-native-probe.json), `node scripts/personal-native-probe.mjs`.

## Production pipeline and invariants

Each import calls actual `analyzeDemoFile()` with exactly one `parseWithSpatial()`, sharing Match + Spatial across P3 and the full Engagement → KillImpact → Teamplay → UtilityContext → CombatExecution → per-identifiable-player Findings V2 chain. The acceptance harness captures these same inputs for independent oracles; it does not native-parse per analyzer. A separate repeat import verifies native Match/Spatial and Desktop report determinism. Timings use the repeat import without the first-import input-hash instrumentation.

All three technical pipelines terminate successfully and preserve schemaVersion=2, V1, V2, Timeline and Analysis. Every Desktop-valid player has a Deep Review entry. available=true means some usable coverage exists; it does not certify compatibility completeness. All ten identifiable domain players receive Findings analysis, including the demo2 player omitted by P3 participation coverage.

PASS on all three: no cross-round Engagement; eligible contacts assigned once; independent candidate-window oracle keeps ambiguous fire unassigned; atomic alive-set replay never produces negative counts or resurrects posthumous killers; same-tick fire/contact delay remains null; Teamplay/Utility/Execution raw refs exact-trace; every Findings ref resolves to exactly one source; relatedRounds equals occurrence source rounds; no contradictions, NaN or Infinity; JSON serializable; repeat output deterministic; production/report and analyzer inputs immutable. Unavailable alive rounds publish null counts and no invented applied deaths.

demo3 has legitimate partial roundState/lifecycle-anomaly coverage. Its PASS is not a claim that all rounds or all downstream evidence layers are complete. Optional evidence gaps are preserved; overall coverage and diagnostics are in [JSON](./deep-review-personal-acceptance.json).

## Target product review

| Fixture | Reviews | Highlights | Supplementary observations | Manual result |
|---|---|---|---|---|
| demo1 / twinkle | Received-first no confirmed return: 10/18 | R24 sole-survivor sequence, 4K, won | Lone recorded contact death: 8/16 | Emitted copy/semantics PASS |
| demo2 / 元屠 | 0 | 0 | 0 | Empty output accurately preserved; coverage blocker, not evidence of no gameplay problems |
| demo3 / 🥔土豆🥔 | Received-first no confirmed return: 3/5 (R15/R19/R20) | R4 sole-survivor 3K; R18 5K, both won | Lone recorded contact death: 8/15 | Emitted copy/semantics PASS |

Rule IDs: demo1 `deep.execution.no-confirmed-return-pattern`, `deep.impact.sole-survivor-sequence`, `deep.teamplay.lone-contact-death-pattern`; demo3 also `deep.impact.multikill-swing`; demo2 none. Counts are observations, not new golden assertions.

Primary and independent reviewer inspected actual target Desktop copy and source-linked domain findings. Titles/summaries are natural first-read Chinese, evidence does not become skill diagnosis, categories remain Review/Highlight/context. Caveats preserve inability to infer aim/reaction, isolated positioning/support opportunity or causal victory impact. No low utility damage judgement or no-follow=failed trade inference. Raw implementation terms are absent from rendered cards. This was data/evidence inspection, not gameplay video replay or a fresh Product Owner visual sign-off.

Sample-specific product observation (existing empty-state copy): demo2's section still says “本场没有需要优先复盘的问题” / “本场没有值得单独标注的亮点”. Under the current coverage blocker this could be misread as proof that no problems/highlights exist, despite the top-level incomplete-data notice. This is a separate product-copy issue, not a skill verdict or threshold issue. It is recorded for separately scoped product follow-up; no Desktop UX/copy change was made in this gate. demo2 manual product review is not a blanket PASS.

## Real Desktop smoke and screenshots

Built Electron imported all three real files. Default 比赛报告, explicit 深度复盘, target selection and switching players PASS. demo1/demo3 caveats expand and Finding → Timeline expands all actual occurrence rounds; relevant kill/death/bomb context remains visible. demo2 has no finding/caveat/round button, so these interactions are not applicable for its target; the legitimate empty state is shown. No synthetic report injection or substitute-player screenshots were used.

- [demo1 Deep Review](../.tmp/personal-qa/demo1-deep-review.png)
- [demo2 Deep Review](../.tmp/personal-qa/demo2-deep-review.png)
- [demo3 Deep Review](../.tmp/personal-qa/demo3-deep-review.png)
- [demo1 Finding → Timeline](../.tmp/personal-qa/demo1-timeline.png)
- [demo3 Finding → Timeline](../.tmp/personal-qa/demo3-timeline.png)

Screenshots are local ignored QA artifacts, 1280×1800. Full reading sequences and actual limitations were inspected; files contain original target nicknames.

## Observational performance

| Fixture | parseWithSpatial ms | Deep Review ms | Non-Deep report ms | Total ms |
|---|---:|---:|---:|---:|
| demo1 | 2813.69 | 844.72 | 17.52 | 3675.92 |
| demo2 | 1709.57 | 358.55 | 28.32 | 2096.45 |
| demo3 | 2642.36 | 674.63 | 10.43 | 3327.41 |

No tens-of-seconds or order-of-magnitude anomaly in these measured production imports. No SLA or parser optimization. Repeated runs vary with host contention; timings are observations. Peak memory UNKNOWN.

## Regressions and independent review

- `pnpm typecheck`: 13/13 PASS; `pnpm build`: 7/7 PASS.
- match-model contract checks PASS (typecheck and test contract compiler). dem-parser 39/39; analytics 53/53; Findings V1 17/17; deep-review synthetic 192/192; desktop 29/29; zero failures/skips.
- demo1 historical parser/KDA/ADR/KAST/Trade/Opening/Utility/Clutch/Timeline/Findings V1/Analysis/Desktop DTO goldens PASS unchanged. No golden updates.
- The earlier selected deep-review regression command also included its existing calibration test: 197/197 PASS, incidentally covering professional/extended fixtures. Those reruns were unnecessary for this gate and did not rewrite professional reports.
- Personal compatibility command writes diagnostics and exits 1 for the expected demo2 blocker. Structural assertions pass. Actual three-fixture Electron smoke exits 0.
- Independent reviewer reproduced native missing fields, audited actual target copy and confirmed no production algorithm/threshold/heuristic/semantics or fixture/player-specific branch changes; limitations and UNKNOWNs retained. No production files changed, package boundaries unchanged.

Reproduce: `node scripts/personal-demo-acceptance.mjs` then `node scripts/personal-desktop-smoke.mjs`. The first regenerates machine diagnostics; manual/product/UI annotations in this acceptance report are an inspected snapshot and must be renewed after a new run. Mandatory files missing or identity mismatch fail; no download/substitution.

## Remaining UNKNOWNs and handoff

Native absolute feed completeness, entity freshness guarantees, other untested recording modes and peak memory remain UNKNOWN. demo2 root cause additionally UNKNOWN and currently blocking. Personal provenance is resolved; personal compatibility is tested but not fully validated.

Next work must isolate demo2 native entity decoding versus source data before choosing any implementation repair. P5.7.0 cannot upgrade to PASS, P5.7 cannot FINAL PASS, and v0.1 cannot READY TO RESUME until this target-sample blocker is resolved and the three-fixture gate passes. Independent final review: evidence/status/diff audit PASS, while Personal compatibility gate remains FAIL; no actionable undisclosed production change. The acceptance scripts, evidence and status documentation are recorded in a focused commit at the Product Owner’s explicit request. Production code remains unchanged; no amend/squash/push.
