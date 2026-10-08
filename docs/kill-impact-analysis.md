# P5.7.3 Kill / Multi-kill Impact

2026-10-08，基线 `c0b559c23c98a8652dca2d401b70208521f73089`。P5.7.0 **PARTIAL PASS**、P5.7.1 **PASS**、P5.7.2 **PASS**；P5.7.3 为当前任务，实现与本地 Nuke 结构验证完成，产品验收待定。v0.1 Final Acceptance 继续 **PAUSED**。

Impact 仅表示已证实死亡导致的存活人数状态变化。生产代码只在 `packages/deep-review`，唯一生产依赖仍为 match-model。不修改 P3 Analytics public contracts、Findings V1、Renderer；不生成评分、胜率、战术价值、coaching conclusion 或 AI 内容。

## 入口与 JSON contract

```ts
resolveRoundAliveState(round: Round): RoundAliveState
analyzeKillImpact(match: Match, engagements?: EngagementAnalysis): KillImpactAnalysis
```

SpatialEvidence 不是输入；没有位置、距离、LOS、yaw 或 active weapon 依赖。Engagement 可不提供，单杀和多杀仍保留，linkage 单独 unavailable。

`RoundAliveState` 返回 baseline boundary/tick、按 SteamID 排序的 participant states、atomic death groups、round coverage。group 包含所有正式窗口 death refs、实际可靠推进的 unique victim IDs、CT/T before/after、双方 group-level transition tags。不可用时所有 before/after=null、appliedVictimIds=[]，仍保留 death refs。players 的 baseline/deathTick 是原始候选时间线，不在 unavailable round 中承诺可靠存活状态。

`KillImpact` 返回 round/type='kill'/tick/eventIndex、killer/victim SteamID string 与 event sides、原 weapon/headshot、nullable posthumous、killer 视角 before/afterAtomicGroup、deathCount/attributedKillCount/ordered、tags、nullable engagementId 和三层 coverage。无原事件/native 引用；多杀的 kills 和边界 counts 按值复制，修改多杀输出不会修改单杀输出或输入。

`PlayerRoundMultiKillImpact` 仅输出 killCount>=2 的 player/round：按 tick/eventIndex 排列的 credited kills、first/last tick、去重排序 engagementIds、snapshot roundSide、roundWinner、roundResult、beforeFirstKill、afterLastKillAtomicGroup、结构 tags 和三层 coverage。不同回合绝不合并。kill refs 唯一；重复 victim 的冲突行不会组成伪 2K。旧 Analytics multiKills 完全不变。

## Alive-state policy

1. 正式窗口必须是有效非负 safe integer `[startTick,endTick]`。缺窗口不推进任何状态，也不输出窗口外 credited kill。无效 event tick 使 round state unavailable。
2. 选择唯一 observed、精确 freezeEndTick 的 freeze_end snapshot，且位于正式窗口内；不可用才选择唯一 observed、精确 startTick 的 start snapshot。start fallback 保留可观察人数但 coverage=partial（baseline-fallback-start）。不选择近邻快照或混合不同 baseline。
3. participant=true、非零数字 SteamID string、CT/T side、boolean alive 才进入基线；participant=false 不参与。unidentifiedPlayerCount 非零/无效、重复身份、unknown participant/alive/side、空名单均拒绝完整人数。不会从 Player.team、战斗事件或事件缺失补齐名单。
4. 只用正式窗口内 **victim death** 推进，world/unidentified killer、suicide、teamkill、utility 均可减少可靠 victim 的存活人数。缺 killerSide 本身不阻止 victim death。已识别 numeric killer 不在 participant baseline 是名单覆盖缺口，整回合人数不可用；这与无法归属的 world/unknown killer 不同。
5. victim 必须在基线、alive=true、event side 与 roster side 一致；death 必须严格晚于 baseline。baseline tick 同 tick death 无法证明快照与死亡的先后，拒绝人数结论。一个 victim 多次死亡（同 tick 或异 tick）拒绝 round state，并将所有重复 victim 行记录为 unattributed，不选一行作为真实击杀。
6. baseline 后且正式窗口内的 spawn/disconnect/side_change 拒绝整回合人数；setup tick <= baseline 与 post-round lifecycle 不影响正式状态。无效 lifecycle tick 保守拒绝。
7. 唯一 observed 精确 end snapshot 与 projected death timeline 核验。可靠 row 的 side/alive 明确冲突，或出现基线外 participant，拒绝整回合人数；缺 end/row/可靠 participant/alive 或 unidentified end 只降级为 partial，不宣称完整 end corroboration。基线已 dead 且 end dead 本身不构成冲突。

任意硬异常采用整回合拒绝策略，不保留冲突前的完整人数结论，避免后续证据证明基线有误后仍发布早期标签。baseline+observed deaths 输出的是观察证据上的状态；parser 当前没有 feed completeness manifest，complete 不保证 DEM 从未漏记任何事件。没有 death 不等于新推断的 survivor；本模块也不输出 survived metric。

## Atomic same-tick semantics

每个 tick 先记录统一 group-before，然后一次应用所有可靠 victim deaths，得到 group-after。eventIndex 只表示引用身份和确定性展示排序，绝不当 subtick timestamp。

deathCount=1 才标 ordered=true（指人数 transition 可唯一归因，不代表获取了 subtick 时间戳）。deathCount>1 时 ordered=false，单条 kill attribution coverage=partial / same-tick-transition-ambiguous；每条共享 group counts，但不给 equalizer、advantage-gain、deficit-reduction、advantage-extension、enemy-eliminated。即使同组另一条是 world/team/self death，也不能单条归因整组的变化。双方 group-level tags 正常计算。

same-tick cross kill 的两名 killer 在 group-before 都 alive 时 posthumous=false；不依据数组顺序让其中一人变成死后击杀。sole-survivor-kill 可以依据共同 group-before 独立确认，但不等于赢下 clutch。

## KillImpact tags

| Tag | 确定性定义 |
| --- | --- |
| opening | 第一组可靠正式死亡中的 credited enemy kill，且组仅一条 death |
| opening-group | 第一组可靠正式死亡中的 credited enemy kill，组有多条 death；不选择唯一 first killer |
| equalizer | before 本方落后1，after 双方相等，transition 可唯一归因 |
| advantage-gain | before 相等，after 本方领先，transition 可唯一归因 |
| deficit-reduction | before 本方落后>=2，after 仍落后但差距缩小，transition 可唯一归因 |
| advantage-extension | before 本方已领先，after 优势扩大，transition 可唯一归因 |
| enemy-eliminated | before 敌方>0、after 敌方=0，transition 可唯一归因 |
| sole-survivor-kill | before 本方仅1名存活，killer 是该已证实存活 participant |
| posthumous | 可靠 timeline 中 killer deathTick 严格小于 kill tick |

tags 可共存，例如 1v1 → 1v0 可以同时 advantage-gain、enemy-eliminated、sole-survivor-kill。组级 transition 使用相同公式；4v5 → 4v3 并不满足精确定义的 equalizer 或 advantage-gain，不拆出不存在的中间4v4。

第一死亡组即便只有 world/team/self death 也占据 first death-state group，不能把后来的敌对 kill 标 opening。Deep Review opening 是死亡状态证据；P3 Opening 保持原用途、原语义与 golden，不被替代。sole-survivor-kill 也不重实现或替代唯一正式 P3 Clutch metric，不输出 clutch opportunity/win/quality。

## Attribution 与 posthumous

credited kill 只接受双方可识别、不同 ID、明确相反 CT/T event sides、非 confirmed teamkill、无 duplicate victim 的正式窗口行。可观测 roster side 与 event side 冲突时不 credit；world/self/team/side-unknown 行进入 unattributedKills，保留 ref 和 reasons。

缺 baseline/participant proof 时，明确敌对 event 的 attribution 可以保留为 event-only partial，但 before/after/posthumous=null。已识别 killer 的未知 side 只影响 attribution，可靠 victim death 仍推进。可靠 roster/death-state 不等同于攻击者已被识别。

死后已投出 HE 的 kill 继续减少敌方人数；killer 从不复活，posthumous=true，不生成 sole-survivor-kill。仅 baseline observed dead 而没有更早可靠 death event 时 posthumous=null，不补造死亡时刻。任意 round-state unavailable 时 posthumous=null。真实 demo1 R22 本轮未运行，以 synthetic death→HE kill 覆盖。

## Engagement exact linkage

先验证 matchId，再按 round/type='kill'/tick/eventIndex exact match directContacts，并要求唯一 Engagement membership 和相同 killer/victim、fatal contact、round。重复 direct ref/membership、participant 或 match 冲突标 engagement-link-conflict，不选一个。不按 tick+玩家 approximate、最近 Engagement 或时窗猜归属。

utility、world/unidentified、被 Engagement 排除的 kill 可以不关联。eligible utility enemy kill 仍可进入 KillImpact，但 engagementId=null、engagement-not-linked。缺 reliable tickRate 导致 Engagement 不分组也不阻止 Kill Impact。

## Multi-kill tags / round conversion

contains-opening（含 opening-group）、contains-equalizer、contains-advantage-gain、contains-deficit-reduction、contains-advantage-extension、contains-enemy-elimination、contains-sole-survivor-kill、contains-posthumous 来自各 kill 已证实 tags，不从 ambiguous group-level tags 偷渡归因。

single-engagement 要求每条 kill 均 linked 且同一 ID；multi-engagement 要求至少2个不同已证实 ID，存在 unlinked kill 时 linkage 仍降级。任一 kill 在多 death atomic group 中，输出 atomic-impact-partial。

roundSide 来自该回合选定 participant baseline，与所有 credited kill sides 一致，且无 lifecycle anomaly；不使用玩家全场初始 team。保留 round.winner；side/winner 不可靠则 result=unknown，可靠则 win/loss，加 round-won/round-lost。最终结果只表示“多杀发生在最终获胜/失利回合”，没有“该多杀导致获胜”的因果结论。

## Coverage / diagnostics

三层分别为 roundState、attribution、engagementLinkage，status=complete/partial/unavailable。同 tick ambiguity 不使可靠组级人数失效；缺 Engagement 不使 round state 失效；无法归属的 killer 不阻止可靠 victim death。round summary 包含无 credited kill 回合；全场 attribution 汇总也包含所有 unattributed reasons。

原因包括 round-window-unavailable、baseline-unavailable、baseline-fallback-start、roster-unidentified、participant-state-unknown、side-unknown、lifecycle-anomaly、duplicate-death、end-state-conflict、end-state-unavailable、same-tick-transition-ambiguous、killer-unidentified、victim-unidentified、teamkill、self-kill、engagement-not-linked、engagement-link-conflict、invalid-event-tick、death-baseline-conflict。

diagnostics 只作 Deep Review 自检：rounds/eligible/ineligible、正式窗口 deathEvents/atomicDeathGroups、credited/unattributed、team/self/world rows、sameTickDeathGroups/posthumous、player-round multiKillRounds/2K/3K/4K/5K+、linked/unlinked。deathEvents=creditedEnemyKills+unattributedKills。worldKills 仅计 legacy `world` sentinel，模型不证明该行真是环境原因；team/self/world counter 可与其他 coverage reasons 重叠，不把它们当互斥完整归因分区。eligibleRounds 含 start fallback/partial，只有 unavailable 为 ineligible。不是重复发布旧 Analytics 产品指标。

## Nuke structural validation

固定本地 fixture `.demo/nuke.dem`，SHA-256 `dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c`。测试只断言 SHA 与结构，绝不锁定队伍、选手、比分、赢家或回合故事。报告：[deep-review-impact-nuke.json](./deep-review-impact-nuke.json)。

| 结果 | 本轮实测 |
| --- | --- |
| round / eligible / ineligible | 21 / 21 / 0 |
| formal deaths / atomic groups / applied deaths | 142 / 142 / 142 |
| credited / unattributed | 142 / 0 |
| linked / unlinked | 142 / 0 |
| player-round multi-kills | 29：19×2K、9×3K、1×4K、0×5K+ |
| multi-kill win / loss / unknown | 23 / 6 / 0 |
| single / multi Engagement | 10 / 19 |
| sole-survivor kill | 12（其中4个多杀记录包含该 tag） |
| state / attribution / linkage coverage | 全部 complete |
| same-tick death groups / posthumous / utility enemy kill | 0 / 0 / 0 |

独立 set oracle 根据 observed roster 与所有 victim deaths 核对 before/after；可靠 victim 最多一次推进、counts非负、kill refs 回指、exact linkage、multi refs唯一、snapshot result、输入不可变和重复输出 determinism 全通过。same-tick/utility/posthumous assertions 在 Nuke 无实际 occurrence，报告明确 observedCases=0；它们的行为证据来自 synthetic，不能写成 Nuke 真实特殊场景已经通过。

复算：`pnpm --filter @cs2-analyst/deep-review test`；仅写开发报告时在 PowerShell 设置 `$env:CS2_ANALYST_WRITE_IMPACT_REPORT='1'` 后运行 `node --test packages/deep-review/tests/impact-nuke.test.mjs`。默认测试不改报告。

## 自动抽样与数据人工复核

按 round/playerId 确定性顺序选前3个2K、前3个3K+、首个lost multi、首个sole-survivor kill对应的玩家回合sequence、首个same-tick组（存在才选）。没有玩家名/队伍/回合号选择常量。JSON 包含完整 kill refs、每杀 before/after/tags、Engagement IDs 和 roundResult。下表是生成后逐条读取报告的人工数据复核，不是游戏画面复盘；每段箭头之间可能有其他玩家死亡，不能连成“全由该玩家推动”的连续路径。

| 回合 / 玩家ID / K | 每杀 before→after | Result / Engagement |
| --- | --- | --- |
| R1 / 76561198201620490 / 2K | 4v3→4v2；4v2→4v1 | win / 2组；advantage-extension |
| R6 / 76561198045898864 / 2K | 4v4→4v3；2v2→2v1 | loss / 2组；advantage-gain |
| R7 / 76561198045898864 / 2K | 4v5→4v4；4v4→4v3 | loss / 1组；equalizer、advantage-gain |
| R2 / 76561198386265483 / 3K | 5v5→5v4；5v4→5v3；5v1→5v0 | win / 多组；opening、gain、extension、enemy-eliminated |
| R3 / 76561199063238565 / 3K | 5v5→5v4；4v3→4v2；4v2→4v1 | win / 多组；opening、gain、extension |
| R4 / 76561199063238565 / 3K | 5v5→5v4；5v3→5v2；5v1→5v0 | win / 多组；opening、gain、extension、enemy-eliminated |

失利样本为自动选到的 R6 2K；sole-survivor sequence 为 R6 / 76561198201620490 的4K，最后两杀分别1v2→1v1（equalizer + sole-survivor）与1v1→1v0（advantage-gain + enemy-eliminated + sole-survivor），最终win，未称clutch。same-tick sample=null，因为样本不存在多death同tick。上述职业玩家ID/回合仅是实测报告内容，不进入任何算法或测试预期常量。

## Validation / compatibility debt

Synthetic 26 tests 覆盖 opening、equalizer/gain/reduction/extension/elimination、sole survivor、多标签共存、posthumous HE、round win/loss/unknown/换边、单/多 Engagement、utility无link、同tick双杀/cross/ambiguity、team/self/world、重复death、lifecycle、end conflict、freeze/start fallback/missing baseline、unknown roster/participant/side、killer attribution gaps与missing-roster后续状态、exact join/conflicts、JSON-only/determinism/input immutability。

本轮 typecheck 12/12、build 7/7（未变包可命中 Turbo cache）；match-model contract tests PASS；dem-parser 38 PASS/1 SKIP、analytics 48/5、findings 16/1、deep-review 47/0、desktop 16/1，0 FAIL。全部8个SKIP为开发机缺 demo1，历史 golden **本轮没有执行通过**。独立review发现并修复 attribution未知side污染victim timeline、missing known killer roster遗漏导致后续人数完整性误报，新增回归后最终复审PASS，无遗留actionable finding。

Personal DEM compatibility 仍 **UNVERIFIED**：没有真实个人 matchmaking DEM，不扫描/下载/伪造。真实录制模式、事件完整性、entity freshness、峰内存仍 UNKNOWN。Deep Review FINAL Acceptance 前必须补至少一份个人样本及 demo1 historical golden；GOTV与synthetic不能替代。无当前实现 blocker；不执行 installer / Renderer E2E，未修改相关生产模块，也未进入 P5.7.4–P5.7.6。
