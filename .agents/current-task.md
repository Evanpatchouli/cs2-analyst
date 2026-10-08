# Personal Compatibility Gate — 2026-10-09

- Baseline `80437834a43960196bc65d85cbd35095d9a469f8`; P5.7.8 formally **PASS**. Older provenance/visual-pending entries below are historical and superseded.
- All `.demo/demo1.dem`, `.demo/demo2.dem`, `.demo/demo3.dem` are Product Owner-confirmed actual personal matches. Header `SourceTV Demo` is recording metadata, not evidence against personal provenance.
- Gate **FAIL**: demo2 has 270 required actor/target spatial samples missing XYZ/view/state for one event participant; native direct probes reproduce the gap. All 18 KillImpact alive-state rounds unavailable, with Teamplay/Utility spatial unavailable; no rule changes or fabricated conclusions.
- demo1 / demo3 spatial required rows pass. Target demo1 twinkle; demo2 same account recorded as 元屠; demo3 Product Owner explicitly confirmed 土豆 (actual nickname preserves emoji).
- All three real Desktop imports, schema2, repeated deterministic report, JSON/refs/structural checks complete. See `docs/deep-review-personal-acceptance.md` and JSON for coverage, screenshots and regression evidence.
- P5.7.0 remains **PARTIAL PASS**; P5.7 Deep Review FINAL **HOLD**; v0.1 Final Acceptance remains **PAUSED**, not READY TO RESUME. Compatibility root cause (DEM data vs native parser decode) UNKNOWN.
- No production algorithm/threshold/semantics/player/filename branches changed. Product Owner explicitly authorized a focused diagnostic acceptance commit despite gate FAIL; committing does not grant acceptance PASS. No amend/squash/push. Next: independently scoped demo2 compatibility diagnosis, with evidence before any implementation change.

# Current Task

## 2026-10-09 — P5.7.8 Deep Review Desktop UX

- Baseline `a11f6af1f6f7b3efa2ee31acb223ac2299ae5ec0`; implementation complete / visual product acceptance pending. P5.7.0 PARTIAL PASS; P5.7.1–7 PASS. Final Acceptance PAUSED; Personal matchmaking / Perfect World DEM UNVERIFIED; Train REMOVED / NOT REQUIRED.
- Utility Process: one shared-input parseWithSpatial → unchanged P3/V1/Timeline/Analysis + shared Engagement/Impact/Teamplay/Utility/Execution → per-valid-player Findings V2. No algorithms/rules/thresholds changed; no repeated parse or player/tab reanalysis.
- report-contract schema2: field-whitelisted JSON-only per-player Deep Review arrays/coverage; no raw refs/facts/diagnostics/spatial/native objects. Renderer only consumes DTO; new workspace dependency bundled into worker.
- Four mounted tabs; 深度复盘 default; V1 titled 基础规则提示. Reviews amber, highlights success, contexts neutral; partial badge, collapsed native evidence caveats, legitimate empty states. Occurrence buttons reuse showRounds (all occurrences expanded, first scrolled/highlighted); Timeline filter and nickname policy unchanged.
- PASS: typecheck13/13, build7/7; model contracts; parser39, analytics53, V1 findings17, deep-review210, desktop22, zero FAIL/SKIP. demo1 all historical goldens retained; actual Nuke Desktop runs deterministic/10 players/JSON-only/V1+P3 present. SSR6 tests + real Electron synthetic A–D and V1/V2 linkage + player switch passed. dev/preview/report smoke PASS.
- Observational Desktop: demo1 parse3016.54ms/deep1102.81ms/other-report55.82ms/total4175.17ms; Nuke2917.39/730.84/15.60/3663.83ms. Peak memory UNKNOWN; no SLA/parser optimization.
- Actual real default/partial-caveat/Timeline and synthetic QA screenshots in ignored `.tmp/p578-qa/`; tall1280×1400 plus900/800/650 viewports inspected. Product Owner visual acceptance pending; no Product FINAL PASS. Full details: docs/deep-review-desktop.md.
- Independent final reviewer PASS (code/docs/three real screenshots; no actionable findings). pack:win / pack:win:test / test:installed PASS; both109.9MiB, ASAR3.43MiB/82entries, new deep-review dependency bundled; production injection guard, installed real/synthetic Deep Review UX, assets, damaged DEM, mid-analysis close/no worker and both uninstalls PASS. Focused commit `feat(desktop): integrate deep review experience`. No amend/squash/push.


## 2026-10-09 — P5.7.7.1 Calibration / Semantic Repair PASS

- Baseline `bae40582e1156fe5187248719a42d536aec543d1`; **P5.7.7 PASS**. Original implementation technically valid, product calibration exposed overbroad/misaligned rules; history below retained. P5.7.8 **NOT STARTED / HOLD**. Final Acceptance PAUSED; P5.7.0 PARTIAL PASS; P5.7.1–6 PASS.
- Findings exact received-first refs admit received-only unknown-role rows; P5.7.6 unchanged. Core eligible 101/112/109/110, negative 7/9/9/10, positive 1/0/0/0. Fixed thresholds/contradiction guard unchanged; high negative rate recorded as sanity observation, no skill diagnosis.
- No-follow old eligible/none 235/200,323/286,285/239,283/238 → same-Engagement 52/20,55/23,79/37,56/18; triggers 10each→1/4/5/1. Whole-Engagement membership is not death-before opportunity/LOS/P3Trade; **context**, exact membership/count source gate. Lone **context** existing gate; teamflash **context**, no raw severity heuristic. No distance inference/threshold tuning.
- Occurrence-only evidenceRefs/relatedRounds; negative none, positive success, lone/noFollow actual occurrences. Every relatedRound has emitted evidence. Old teamplay window overlap merge removed; context priority impact/lone/flash/follow, caps3/2/1.
- Seven maps exact refs/no contradictions/deterministic/immutable PASS; core mandatory, extended ancient/anubis/overpass one-time observations with identity records; no permanent extended gate. Train REMOVED / NOT REQUIRED, never run. docs/deep-review-findings-calibration.json plus regenerated core/Nuke reports.
- Independent final review PASS after fixing forged membership vulnerability. 33 synthetic PASS; typecheck12/12, build7/7, model contracts PASS; parser39, analytics53, V1 findings17, deep-review210, desktop17 PASS, zero FAIL/SKIP; demo1 historical goldens run. No installer/Renderer E2E.
- Personal matchmaking / Perfect World DEM UNVERIFIED; native feed completeness/entity freshness/other modes/peak memory UNKNOWN. Still needs confirmed personal DEM before Final Acceptance. Focused commit `fix(analysis): calibrate deep review findings`; no amend/squash/push.


## 2026-10-09 — P5.7.7 Findings V2

- Current: **P5.7.7 implementation complete / product acceptance pending**。P5.7.0 **PARTIAL PASS**，P5.7.1–P5.7.6 **PASS**；P5.7.8 **next**，本轮不实施；Final Acceptance **PAUSED**。
- Fixture migration focused commit `c8b0100`：全仓旧fixture filename 0；Nuke/Inferno/Dust2 SHA一致；三个含filename报告由generator重新生成并核对全部既有非环境/非耗时测量数据一致。无DEM rename/copy/download/add。Train **REMOVED / NOT REQUIRED**，不运行，不属于gate/debt/blocker；extended地图optional未跑。
- 仅deep-review生产新增JSON-only contracts、固定policy、source validation与analyzeDeepReviewFindings；8rules：3impact、2execution、2teamplay、1exact teamflash。负向pattern5/3/0.5；positive5/4/0.6；flash3effects/5rows；caps3/2/1；exact refs、priority、dedup、contradiction；P3/P4/parser/model/desktop/renderer/report-contract冻结。
- 四图各一次parseWithSpatial后完整同生产管线，所有40名可识别玩家结构/ref/count/JSON/immutability/determinism通过；Mirage SHA `62cb3af35c3893a91c7dd8c9007fdb1105950ec8963a46eca6006dac96655acb`，de_mirage，296074918bytes，64tick，17round/10players；仅filename/SHA/map锁身份。
- Nuke/Inferno/Dust2/Mirage lone6/6/2/7、no-followup10/10/10/10、teamflash3/0/10/0、execution positive候选2/4/2/2；negative0。lone21/40=52.5%、no-followup40/40=100%标记overbreadth；真实source抽查确认literal facts但不证明支援机会/战术问题，产品验收pending，阈值未为了职业样本调参。literal received-first排除上游received-only unknown，为明确coverage限制。
- 9组合sensitivity minimumEligible4/5/6、rate0.4/0.5/0.6、minimumOccurrences3；lone总触发30/21/11，no-followup40、executionnegative0；不暴露production配置。Nuke详细自动结构抽样，missing negative/zero-player为null；报告/规则/性能详见docs/deep-review-findings-v2.md及两个JSON。
- 独立复审修复缺正向行缩分母、伪造人数、stale clock、same-tick覆盖伪完整、模糊存活absence、unknown-side追加、end/lifecycle/baseline矛盾；27新Findings synthetic全PASS，最终独立review无actionable遗留。
- 全回归：typecheck12/12、build7/7、model contracts PASS；parser39/0SKIP、analytics53/0、Findings V1 17/0、deep-review199/0、desktop17/0，0FAIL/0SKIP。demo1本地恢复，历史golden实际执行；不据文件名推断personal录制模式。无installer/Renderer E2E。
- **Personal matchmaking / Perfect World DEM compatibility = UNVERIFIED**，Final Acceptance前仍需一份确认来源的真实个人DEM。native feed绝对完整性、其他录制模式、entity freshness、peak memory UNKNOWN。职业四图通过仅证明professional GOTV兼容。没有push。

## 2026-10-08 — Demo Fixture Rename Migration

Baseline `065f0f316f9b2366864b0b5a66be796bbad659fa`. Migration completed in `c8b0100` before P5.7.7; working tree was clean between units. Map-only fixture filenames; Nuke / Inferno / Dust2 SHA identities unchanged. Fixture roles and Train **REMOVED / NOT REQUIRED** status: [matrix](../docs/demo-fixtures.md). Core gate: Nuke + Inferno + Dust2 + Mirage; extended maps optional. Personal DEM compatibility **UNVERIFIED**.

Status: v0.1 Final Acceptance **PAUSED — Deep Review product gap discovered**。

Current: **P5.7 Deep Review / P5.7.7 implementation complete / product acceptance pending**。

## 2026-10-08 — P5.7.6

- 基线 `1632e5e835e9bd75f1678d08a96b0854a73a45a4`；P5.7.0 **PARTIAL PASS**、P5.7.1–P5.7.5 **PASS**；P5.7.6 当前任务，Final Acceptance继续 **PAUSED**。
- 生产仅deep-review新增独立Execution contracts与analyzeCombatExecution；weapon_fire只有shooter、原round.events索引，inside与默认1s lead-in全部候选共同做唯一性检查，ambiguous不归属。firearm主计数，unknown保留降级，不混utility/melee/taser。
- firstContactRole严格tick比较，单侧unknown；同opponent confirmed damage/kill return、全round本人死亡边界、严格none-observed门控、reported damage、fire/contact原始counts与exact event XY/absZ/XYZ facts。五层coverage；无target/miss/accuracy/reaction/score/AI/velocity/usercmd/shots_fired。
- 三地图一次parseWithSpatial后同生产管线Engagement→KillImpact→Teamplay→Utility→CombatExecution；SHA/header map/tickRate/rounds/players/file size锁身份，只验structural invariants，不锁比赛计数。Nuke详细11类自动抽样与cross-map当前run报告已保存。
- View Alignment **UNVERIFIED**，可选angle probe未执行、无angle production contract；Personal matchmaking DEM **UNVERIFIED**，三图仅证明cross-map professional GOTV。源feed绝对完整性/entity freshness/其他录制模式/Peak memory UNKNOWN；Final Acceptance前仍补个人DEM+demo1。
- 独立review发现非法fire tick JSON、unlinked unknown fire摘要coverage、missing Engagement丢unknown raw contacts问题，已修复并补回归；唯一linked firearm shooter即使仅有melee contact也有shooter-only context，不推断opponent。
- 最终验证与统计见docs/combat-execution-evidence.md；本轮focused commit `feat(analysis): add combat execution evidence`，不push，不进入P5.7.7/桌面UX，不运行installer/Renderer E2E。
- 最终Nuke/Inferno/Dust2分别107/126/112 Engagement、284/310/317contexts、356/372/424pairs；core3757/4605/4702、distance356/372/424均完整。typecheck12/12、build7/7、model contracts PASS；parser38/1SKIP、analytics48/5、findings16/1、deep-review167/0（44新synthetic+三图）、desktop16/1，0FAIL；8SKIP均demo1缺失。独立最终复审PASS，无遗留阻断。
- 后续 **P5.7.7 Findings V2 → P5.7.8 Deep Review Desktop UX**。

## 2026-10-08 — P5.7.5

- 基线 `caa08865ae23ef4f2563aff8e4ed4cc0faefc86f`；正式状态 P5.7.0 **PARTIAL PASS**、P5.7.1 / P5.7.2 / P5.7.3 / P5.7.4 **PASS**；P5.7.5 当前任务；Final Acceptance 继续 **PAUSED**。
- 新analyzeUtilityContext与JSON-only UtilityEffectRef/Context/Analysis；生产仅deep-review，依赖match-model。effect而非throw，不猜release/FIFO/nearest；eventIndex保留，same-tick非subtick顺序。P3/Findings V1/parser/model/Renderer/Electron/packaging未改。
- effect XYZ→exact utility at-event XY/absZ/XYZ敌友facts；KillImpact RoundAliveState语义核验驱动alive、same-tick排除/null人数+atomic前后。actor side conflict抑制人数/关系，entity is_alive不决定资格。observed bomb lifecycle与same-tick ambiguity独立；只输出可靠时钟秒数，无范围/LOS/战术/意图/评分/AI。
- Nuke404effects=136smoke/74HE/88flash/105fire/1decoy，position/thrower404，spatial403complete+1post-round unavailable。HE15damage全部严格same-actor/tick关联，9exact有伤effects；41exact/33partial contexts，17缺weapon伤害行导致保守回合级完整性降级。Fire114damage无stable entity linkage，全部105effects damage unavailable；candidate deltas -13..437不配对。Flash88/158 entity完整，80exact effects/144victim refs，8reuse effects/14ambiguous victim rows，0mismatch/unmatched。same-tick alive/bomb实样本均0，synthetic覆盖。
- docs/utility-context.md与docs/deep-review-utility-nuke.json含研究histograms、10类自动结构抽样、完整refs/XYZ/人数/bomb/敌友距离/outcome/coverage。404空间oracle、15HE、144flash源行/唯一消费、determinism/immutability/no-Spatial invariant通过；数据人工复核不冒充画面回放。
- Personal DEM compatibility **UNVERIFIED**；feed completeness/entity freshness/其他录制模式/peak memory UNKNOWN，effect-level flash assist unavailable；Final Acceptance前补个人DEM+demo1。无当前实现blocker。本轮不做可选Engagement proximity。
- 后续顺序：**P5.7.6 Combat Execution Evidence → P5.7.7 Findings V2 → P5.7.8 Deep Review Desktop UX**；不直接进入Findings V2。
- typecheck12/12、build7/7 PASS（未变任务Turbo缓存复用）；model contracts PASS，dem-parser38/1SKIP、analytics48/5、findings16/1、deep-review119/0、desktop16/1，0FAIL。8SKIP全因缺demo1；35新synthetic+Nuke独立复核。独立review修复未知HE候选/side conflict/key顺序/非法effect identity/NaN-null混同，最终复审PASS无遗留finding；UTF-8无BOM/whitespace/生产边界通过。focused commit `feat(analysis): add utility context evidence`，不push，无installer E2E。

## 2026-10-08 — P5.7.4

- 基线 `7b8700ae45aa3196fc1f2b142dbfeb9d3f5d2abd`；正式状态P5.7.0 **PARTIAL PASS**、P5.7.1 / P5.7.2 / P5.7.3 **PASS**；P5.7.4当前任务；Final Acceptance继续 **PAUSED**。
- 仅deep-review生产新增独立TeamplayAnalysis/contracts；依赖仍仅match-model，复用Engagement direct contacts与KillImpact deterministic alive timeline。first role/atomic tiers/加入delay只表达直接接触；无评分、coaching、AI、Aim、LOS、nav/map geometry，P3/Findings V1/Renderer/Electron/packaging不变。
- 双向同killer后续damage/kill，strict later、同formal round、可配置默认5s，unknown tickRate不猜64；首response与window kill结果分别保留refs。dead-before/dies-same-tick killer无none-observed；同tick存活未知从alive spatial/responder候选排除；raw/stale feed incomplete不制造negative absence。
- 空间exact eventRef+at-event requested/actual tick，alive truth优先RoundAliveState、entity alive仅diagnostic；XY/Z/XYZ facts、SteamID tie。缺Spatial事件分析稳定，distance不等于supportability，Nuke上下楼必须保留Z。
- Nuke284contexts：162unique/0shared/51later/71unknown、160only confirmed；568teammate pairs=31kill/17damage/200none/0ambiguous/320unavailable；142player deaths=31team kill/15damage/70none/0ambiguous/26unavailable。994去重spatial contexts=423complete/571partial，571same-tick teammate alive排除occurrences，0alive conflicts；原点与participant first-contact抽样均exact。没有real shared-first/same-tick response/posthumous，null样本+synthetic-only说明；71unknown由不可识别direct候选回合级保守门控。
- docs/teamplay-evidence.md与docs/deep-review-teamplay-nuke.json含定义、raw refs/IDs/ticks、人数、完整距离、coverage和自动结构抽样；数据人工复核不是画面回放。Personal DEM **UNVERIFIED**、事件完整性/entity freshness/其他录制模式/峰内存UNKNOWN，Deep Review FINAL前补个人样本+demo1。
- typecheck12/12、build7/7、match-model contracts PASS；dem-parser38/1SKIP、analytics48/5、findings16/1、deep-review83/0（35synthetic+Nuke）、desktop16/1，0FAIL；8SKIP均缺demo1。独立review发现并修复source completeness/orphan membership/unavailable damage-null，最终复审PASS无遗留finding。完成后focused commit `feat(analysis): add teamplay evidence`，不push；不进入P5.7.5/Findings V2，无installer E2E。

## 2026-10-08 — P5.7.3

- 基线 `c0b559c23c98a8652dca2d401b70208521f73089`；P5.7.0 **PARTIAL PASS**、P5.7.1 **PASS**、P5.7.2 **PASS**；Final Acceptance仍 **PAUSED**。
- deep-review独立freeze_end/start fallback alive-state resolver；victim death（含world/self/team）与enemy attribution分离，same-tick atomic推进，未知名单/生命周期/重复death/end冲突拒绝人数。事件only attribution与三层coverage分离；无Spatial依赖、评分/AI/coaching/P3/Findings V1/Renderer修改。
- KillImpact事实tags、多标签共存、可靠更早death确定posthumous；round MultiKill只>=2，保留snapshot side/winner/result与single/multi Engagement，四键exact join不猜utility归属；opening/sole survivor不替代P3 Opening/Clutch。
- Nuke21round/142death/142credited/142linked，29multi=19×2K+9×3K+1×4K；23win/6loss，10single/19multi Engagement，12sole survivor kills；三层complete。0same-tick多death/posthumous/utility enemy kill，特殊行为仅synthetic验证，不宣称真实发生。
- 自动3个2K/3个3K+/首lost/sole sequence抽样：docs/deep-review-impact-nuke.json；定义/人工数据复核/compatibility debt：docs/kill-impact-analysis.md。Personal DEM **UNVERIFIED**、峰内存/其他录制模式UNKNOWN。
- typecheck12/12、build7/7；match-model contract PASS；dem-parser38/1SKIP、analytics48/5、findings16/1、deep-review47/0、desktop16/1，0FAIL。8SKIP均缺demo1，历史golden未执行。独立review问题修复并补回归，最终复审PASS无遗留finding；提交使用focused commit `feat(analysis): add kill impact analysis`，不push；无installer/Renderer E2E，不进入P5.7.4。

## 2026-10-08 — P5.7.2

- 基线 `f37db2e42bcf9e42d489d03c5e52ae625d7e0d4a`；P5.7.0 **PARTIAL PASS**，P5.7.1 **PASS**；v0.1 Final Acceptance继续 **PAUSED**。
- 新deep-review生产仅依赖match-model：正式round window的敌对damage/kill contacts，3s product heuristic/shared participant连通分组；unknown weapon保留，utility仅计排除诊断，weapon_fire不猜opponent；无评分/coaching或Renderer改动。
- 四键spatial exact join；event segmentation和spatial enrichment独立coverage；缺tickRate保留directContacts、分组unavailable。P3/Findings V1/parser/model/desktop public contracts不变。
- Nuke SHA固定：776候选、620 included（478damage/142kill）→107 Engagement；排除post9/unidentified11/self2/team12/utility122；exact join620/620，at完整620、before完整618；301同tick行保留index。
- 2/3/4/5s：116/107/99/96组；完整图oracle全部一致、每contact唯一归属、不跨round、重复deterministic；无结构算法异常，未调整默认3s。
- 文档和实测：docs/engagement-analysis.md、docs/deep-review-engagement-nuke.json。Personal DEM compatibility **UNVERIFIED**，demo1缺失golden仍SKIP；峰内存/entity freshness/其他录制模式UNKNOWN。
- 最终验证：typecheck12/12、build7/7、match-model contract PASS；dem-parser38 PASS/1 SKIP、analytics48/5、findings16/1、deep-review20/0、desktop16/1，0 FAIL；全部8个SKIP因demo1缺失。独立review发现1项极小tickRate时长溢出，修复/补回归/复审PASS，无未解决发现；修复后重跑typecheck/build/deep-review，Nuke report hash不变。按指定focused commit，不push。未进入P5.7.3或后续模块。

## 2026-10-08 — P5.7.1

- 基线 `1cb5eed78ebbdbc57edb436292125e52cb3d8cc2`。
- P5.7.0：**PARTIAL PASS — GOTV verified, personal DEM compatibility pending**。
- 新match-model独立空间contract；dem-parser显式parseWithSpatial共享一次文件读取，core永不裁掉，optional有界上下文按预算降级。未修改P3/Findings/Renderer/Timeline/report-contract或branding/packaging。
- Nuke：145 kill refs、63 boundaries、3757 core ticks完整；9331请求/9303返回/93030行，28可选tick缺失；存活武器74843/74843。默认输出partial，实际budget=0仍保留全部core，重复输出deterministic。
- 原parser独立1.880秒；共享路径parser1.629/1.611秒、spatial1.692/1.595秒、总3.322/3.205秒。Peak memory UNKNOWN。
- **Personal DEM spatial compatibility = UNVERIFIED**：开发机无个人matchmaking DEM，不寻找/下载/伪造；非本轮blocker，但Deep Review FINAL Acceptance前至少一份真实个人DEM补验。
- 正式契约、性能、coverage与debt：`docs/spatial-evidence.md` / `docs/deep-review-spatial-nuke.json`。未进入P5.7.2 Engagement。
- 验证：typecheck11/11、build6/6、match-model contract tests PASS；dem-parser38 PASS/1 SKIP、analytics48/5、findings16/1、desktop16/1，0 FAIL。全部8个SKIP因demo1缺失。独立review无actionable发现；report E2E/installer本轮未执行。

## 2026-10-08 — v0.1 Final Acceptance

- P5 Desktop MVP 已封板。P5.6.5 Branding & App Icon 由 Product Owner 明确批准 **FINAL PASS**，实现提交为 `dbdd710529a7cb2ed021dd2a4d09325ed196abf9`。
- P5.6.5 的 FINAL PASS 是产品验收结论：此前未重跑的完整 production/test-seam installed regression 与部分任务栏 / Alt+Tab / 真实拖动视觉项不再作为阻塞项；不要把它们改写成“已执行通过”。
- 正式产品身份：CS2 Analyst / `cs2-analyst` / `@cs2-analyst/*` / `com.evanpatchouli.cs2analyst` / Windows x64 / 0.1.0。
- GitHub repository 已正式改名为 `Evanpatchouli/cs2-analyst`，origin一致。
- v0.1 feature development frozen：当前仅允许明确授权的P5.7 evidence foundation；不新增UI polish、P3 Analytics指标或其他产品模块。
- `demo1` 继续作为 deterministic golden；现有数值、Timeline 事件语义、官方 kill-feed assets 与 Findings ruleId 顺序必须保持。
- 原计划的多样本Final Acceptance当前PAUSED；真实个人DEM到来后补空间兼容与历史golden，不以职业GOTV自动替代。
- 每场验收以“数据自洽 + 少量关键事实人工抽查”为主：比分、K/D/A、ADR、KAST、CT/T、Multi-kill、Opening/Trade、Clutch（如有）、随机 3～5 回合 Timeline、Findings 证据合理性。
- 不做自动 DEM discovery / directory scanning；不进入登录、历史、apps/api、AI Coach、热力图或完整播放器。
