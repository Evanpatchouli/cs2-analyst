# P5.7.4 Teamplay / Decision Evidence

2026-10-08，基线 `7b8700ae45aa3196fc1f2b142dbfeb9d3f5d2abd`。本轮实现与职业 Nuke 结构验证完成，P5.7.4 仍是当前任务，产品验收待定。P5.7.0 **PARTIAL PASS**；P5.7.1 / P5.7.2 / P5.7.3 **PASS**；v0.1 Final Acceptance **PAUSED**。

## Contract / boundaries

`analyzeTeamplay(Match, optional EngagementAnalysis, optional KillImpactAnalysis, optional MatchSpatialEvidence, TeamplayOptions)` 返回独立 JSON-only `TeamplayAnalysis`。生产依赖仍仅 match-model；不重算 P3、不调用 parser、Electron 或 Renderer，不修改 Findings V1。本轮只发布观察事实，无评分、AI、coaching、Aim、LOS、nav mesh、map geometry 或角度/枪位判断。

- `PlayerEngagementContext`：每个实际 direct-contact participant 的精确首 contact ref、first/last tick、contact 次数、damage dealt/received 次数与 reported damage、kill/death 次数、双方 confirmed participant IDs/counts、first-contact role、atomic tiers、队友加入时间、空间上下文、四层 coverage。
- `TeammateDeathResponse`：每个正式敌对或 killer 归属不可用的 teammate-death/player pair，包含可靠存活检查、killer state、首个后续 contact、结果引用、delay、reported damage、sameEngagement 和死亡时人数/participation/空间上下文。已死亡玩家仍保留 unavailable 行，不隐藏机会不成立的原因；unknown killer 不被确认为敌人。
- `PlayerDeathTeamResponse`：玩家死亡候选后的队伍响应（排除明确 self/team，归属不明者 unavailable），保留确定存活队友数、同 tick 存活不明 IDs、first responder/ref、结果 player/ref、delay、sameEngagement、coverage。
- `PlayerDeathContext`：死亡 ref、真实 Engagement ID（或 null）、该玩家 participation role/count、onlyConfirmedSideParticipant、队友加入时间、exact death-event `spatialContext.nearestConfirmedAliveTeammate`、teamResponse，以及玩家阵营视角的 `before` / `afterAtomicGroup`。

目标是全场每名已识别玩家，按回合/Engagement/SteamID 确定性输出。队友身份来自回合 observed roster 与 exact contact event sides，不使用 `Match.players` 的全场初始 side 冒充当时阵营。名单冲突、缺状态、missing killer 等保留 unavailable 证据，不能补造机会。

## Direct first contact / participant tiers

只用 Engagement direct damage/kill contacts；受伤/被击杀的一方同样产生 contact。`sideParticipantIds` 仅指该组内产生过 contact 的同 side 玩家，不是附近所有队友、可支援名单或战术组。

该 side 的最早 contact tick 只有一人则 `unique-first`；同 tick 多人则 `shared-first`；玩家首次 contact 更晚则 `later`；证据不完整则 `unknown`。这只证明谁首先产生明确直接交火证据，不推断 entry、主动 peek 或进点顺序。未知武器的可识别敌对 contact 按 P5.7.2 保留；utility、weapon_fire 不构成 contact。

`sideContactTiers` 把同 tick 玩家放在一个 atomic tier，IDs 的字符串排序仅用于稳定序列化，不表示 subtick 顺序。首个 contact 同 tick 多行时选确定性代表 ref，也不宣称其中一行先发生。

unique-first 时，`firstOtherTeammateContactTick` 是其他本方 participant 的最早 contact，`teammateJoinDelaySeconds` 为它相对玩家首 contact 的差；shared-first 为 0；later 的 delay=null，其他队友最早 tick 仍可保留。没有其他 participant 时两个时间字段 null，事实仅为“没有观察到其他队友产生 direct contact”。`onlyConfirmedSideParticipant=true` 不等于“孤立无援”。

为避免缺数据制造先后结论，非 utility damage/kill 候选无法识别 actor/target/side、或 tick 非法时，该回合 first role 保守 unknown（仍保留已经观察到的 tiers 和 participation）。完整 Match 中的合法 direct row 缺失于输入 analysis、orphan membership、重复/冲突 ref/group 均降级。不会用缺失记录制造 unique-first 或完整 none-observed。

## Death follow-up / team response

默认 `followUpWindowSeconds=5`，可配置，仅接受 finite > 0，否则 `RangeError`（包括显式 null）。它是产品 evidence window，不是应当响应的规则。可靠 tickRate 才能计算；没有时钟仍保留已经给出的 Engagement participation，所有 follow-up timing unavailable，不猜 64 tick。如果 Engagement 上游因未知 tickRate 根本没有分组，本层不制造不存在的 Engagement/context。

合法后续 contact 必须为同一正式回合、strictly later tick、存活玩家对**同一 killer**的 direct damage/kill，且 delay <= window。player 是否可靠存活在原点 death tick 检查；后续直接接触即使位于响应者自己的死亡 tick 也可观察，但不排序那次死亡与 contact。

窗口内有 kill 则 outcome=kill，否则有 damage 则 damage。`firstFollowUpRef` / `firstResponseRef` 始终是最早合法 contact；`outcomeRef` 是窗口内最早 kill，否则首个 damage，可能比首接触更晚。队伍的 kill 也可能来自另一个 responder，另存 `outcomePlayerId`；first responder 按 tick、SteamID string、eventIndex 选确定性代表，并不声称同 tick 内顺序。

`reportedDamage` 累计该玩家窗口内对 killer 的原始 hurt damage；kill row 不再计伤害。unavailable / same-tick-ambiguous 时 null；完整 none-observed 为 0；positive partial 仅累计已经观察到的伤害，不宣称总量完整。

没有合法 contact 且 feed 足够完整时 `none-observed` 仅表示“没有观察到对同一击杀者的后续直接接触”，**不等于 failed trade、犹豫或没有支援**。本层不命名 Trade、不发布 Trade Rate、不声明与 P3 一致。raw contact evidence 不完整时保留正向已观察响应并降级 partial；无法证明缺失时返回 unavailable，而不是 none-observed。

`sameEngagement` 只由原点死亡 ref 与首个响应 ref 的真实唯一 Engagement IDs 比较；缺一方 link 时 null。没有最近组、tick 相近、空间距离猜测。utility origin death 可以没有 link，但其事件响应仍可分析。

## Same-tick / posthumous semantics

同 tick contact 不满足 follow-up，单独保留 `sameTickContactRefs`，不计算零秒因果响应。仅有同 tick 候选时 outcome=same-tick-ambiguous；如果另有严格更晚的合法响应，则保留真实响应，coverage 记录 same-tick-response-ambiguous，同 tick refs 仍不充当 response。这个语义与 shared-first 的同 tick atomic participation 不同。

如果玩家 deathTick 等于 teammate death tick，则 `playerAliveAtDeath=null`，不纳入确定存活队友；不能使用 Spatial is_alive 决定顺序。存在这种未知队友但没有可靠队友响应时，team absence 也降级 same-tick-ambiguous。

使用 P5.7.3 `RoundAliveState` 的 deterministic victim-death timeline，含 world/self/team/utility 死亡，按原子组推进。killer deathTick 严格小于原点 tick 则 dead-before（例如死后 HE/fire），等于则 dies-same-tick；两者均不产生 none-observed。baseline 已 dead 但没有可靠更早死亡 tick 时 killerState=unknown，不补造 posthumous 时刻。

## Spatial facts / Nuke vertical boundary

首 contact 空间上下文只读取该 contact 的 exact MatchSpatialEvidence eventRef；死亡上下文只读 exact deathRef。matchId + round/type/tick/eventIndex、actor/target identity 必须唯一一致；sample 必须为同 tick at-event、requestedTick=actualTick=event tick。不使用 nearby tick、before sample 或 cached player location。

确定存活的本方其他玩家必须由可靠 RoundAliveState roster/death timeline 证明；Spatial is_alive 仅检查一致性，冲突在 `aliveConsistencyConflictIds` 和 coverage 中记录。deathTick==event tick 的队友在 `sameTickAliveAmbiguousIds` 中保留，从距离候选排除。

位置完整者计算 map units：`horizontalDistance=hypot(dx,dy)`、`verticalDelta=abs(dz)`、`directDistance=hypot(dx,dy,dz)`；按 XYZ 距离选最小，tie 按 SteamID string。若其他确定存活队友缺位置，则输出的 fact 只是在完整位置候选中的最近者，coverage partial、IDs 在 incompletePositionTeammateIds；它不能证明全名单最近。没有存活队友时 complete + null 可以是完整事实。

**距离不等于支援能力。Nuke 有上下层，不能因为 directDistance 小就认为两人能支援，可能处于不同楼层。** 不创建 supportDistance/tradeDistance/closeEnough/tooFar/isolatedByDistance 或阈值推断。未来 Findings V2 没有 LOS / nav mesh / map geometry 前也只能谨慎解释。

## Coverage / diagnostics

四层分别为 `engagementParticipation`、`aliveState`、`followUpTiming`、`spatialContext`，均 complete / partial / unavailable，与各自 reasons 一起输出。缺 spatial 不使事件响应消失；缺 KillImpact state 不使 direct participation 消失；缺 Engagement 不抹掉原始死亡人数证据。所有聚合也包含 unavailable 行，不把 unavailable 当 0。

原因包括 engagement-unavailable/not-linked/link-conflict/evidence-incomplete、round-state-unavailable、player-state-ambiguous/dead-before、same-tick-alive-ambiguous、tick-rate-unreliable、killer-unidentified/dead-before/death-same-tick/state-unknown、death-attribution-unavailable、same-tick-response-ambiguous、spatial-not-provided/event-missing/link-conflict、position-missing、teammate-position-incomplete、spatial-alive-conflict，及既有 alive-state coverage 原因。

diagnostics 只用于 Deep Review 自检。teammateDeathsObserved 是 teammate-death/player **pair** 数，不是独立 death 数；playerDeathsObserved 是敌对死亡候选数（排除明确 self/team，包括 killer 归属不可用的 unavailable 行，不能把它们全部宣称为已确认敌对击杀）。spatialContexts 是去重 player/exact-event context，含首 contact 和 death-event context；sameTickAliveAmbiguities 是这些 context 中排除的 teammate ID occurrences，不是同 tick 多人死亡组数。全场层的 partial 也可能表示已知死者不具备响应资格，而非整场解析失败。

## Nuke structural validation / automatic review

fixture `.demo/nuke.dem`，SHA-256 `dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c`。测试不硬编码队伍、选手、比分、比赛故事或回合号。报告：[deep-review-teamplay-nuke.json](./deep-review-teamplay-nuke.json)。

| 本轮实测 | 结果 |
| --- | --- |
| player Engagement contexts | 284，映射 107 个真实 Engagement |
| unique-first / shared-first / later / unknown | 162 / 0 / 51 / 71 |
| only confirmed side participant | 160 |
| teammate-death/player pairs | 568 |
| teammate response kill / damage / none / ambiguous / unavailable | 31 / 17 / 200 / 0 / 320 |
| player hostile deaths | 142 |
| team response kill / damage / none / ambiguous / unavailable | 31 / 15 / 70 / 0 / 26 |
| unique spatial contexts complete / partial / unavailable | 423 / 571 / 0 |
| same-tick alive exclusion occurrences / alive conflicts | 571 / 0 |
| tier / response / spatial independent checks | 284 / 710 / 994 |
| real same-tick response / dead-before killer / killer dies same tick | 0 / 0 / 0 |

71 unknown first-role contexts 来自保守的回合级 direct-candidate 完整性门控：上游有无法识别攻击者的非 utility/unknown weapon damage，不替它们编造参与者，也不声称本方完整的先后顺序。同样，部分没有响应的记录降级 unavailable。具体回合和上游 coverage 写入报告；这不是职业选手的行为结论。

structural tests 独立计算 participant first ticks/tiers、人数存活资格、窗口内确切 killer contacts 和 geometric nearest oracle。所有 response ref 回指原 contact；sameEngagement 对照真实 IDs；输入 hash 不变、重复 JSON 相同、无 spatial 的事件投影完全相同。特殊行为实样本不存在，只由 synthetic 验证，不能称 Nuke 真实特殊案例已发生。

按 deterministic structural predicate 自动选首个 unique/shared/later、only participant、三类 teammate response、三类 player-death response、same-tick 与 posthumous（存在才选）。shared-first / same-tick response / posthumous 样本为 null。下面是生成报告后读取 refs/counts/geometry 的人工数据复核，不是画面回放，也没有使用这些 ID/tick 做算法选择：

| 自动样本 | exact ref / 结果 | 空间事实（XY / abs Z / XYZ） |
| --- | --- | --- |
| unique-first | R2 damage tick18274 index57；player 76561198068422762 | 190.1813 / 0 / 190.1813 |
| teammate death → kill | R3 kill tick24006 index86；player 76561197989430253，首响应0.5625s；4v5→3v5 | 60.2499 / 50.5625 / 78.6550 |
| teammate death → damage | R1 kill tick5247 index81；player 76561198081484775，首响应0.8125s；4v4→3v4 | 102.5934 / 279.7969 / 298.0129 |
| player death → team damage | R1 kill tick5247 index81；player 76561199063238565，首响应0.8125s | 1107.2344 / 288 / 1144.0770 |

这些非零 Z 样本明确保留垂直差，尤其 298.0129 XYZ 与 279.7969 verticalDelta 不转成可支援结论。其余 later/only participant/none/team kill 样本已读取核对，完整精度、refs、玩家 IDs、Engagement、人数、coverage 在 JSON 中。

复算 `pnpm --filter @cs2-analyst/deep-review test`；写报告时在 PowerShell 设置 `$env:CS2_ANALYST_WRITE_TEAMPLAY_REPORT='1'` 后运行测试，随后删除该 env。默认测试不改报告。

## Validation / debt

35 synthetic tests 覆盖 unique/shared/later/no-other/tiers、两方向 kill/damage/none、5s inclusive/outside/config/非法参数、same-tick与later共存、dead player、posthumous与same-tick killer、multiple responders、unreliable clock、缺 Engagement/KillImpact/Spatial/position、exact join冲突、same-tick alive排除、XY/Z/XYZ、SteamID tie、实体 alive冲突、round boundaries、stale/incomplete feeds、orphan membership、输入不变和JSON determinism。

本轮 `pnpm typecheck` 12/12、`pnpm build` 7/7（未变包允许 Turbo cache）；match-model contract tests PASS；dem-parser 38 PASS / 1 SKIP，analytics 48 / 5，findings 16 / 1，deep-review 83 / 0，desktop 16 / 1，0 FAIL。8 SKIP 全部因 demo1 缺失，历史 golden 本轮没有执行。独立 review 修复 source-feed completeness 假阴性、orphan contact 误标 first-role、unavailable reportedDamage=0 三处边界并补回归，最终复审 PASS，无遗留 actionable finding。

Personal DEM compatibility **UNVERIFIED**。职业 GOTV 与 synthetic 不证明个人匹配同样有效。Deep Review FINAL Acceptance 前仍需真实个人 DEM 和 demo1 golden；事件feed completeness、entity freshness、其他录制模式、峰内存 UNKNOWN。无当前实现 blocker；未改 Renderer/Electron/packaging，无 installer E2E；未进入 P5.7.5 / Findings V2。
