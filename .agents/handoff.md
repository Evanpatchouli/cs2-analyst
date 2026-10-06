# Agent Handoff

## 2026-10-06 — P3 Analytics Final Acceptance PASS（contracts frozen for P4）

- 基线 `1d6666b`。本轮只做 `packages/analytics` 的最终一致性验收与真实 bug 修复：未进入 P4 Findings，未加新 Analytics 功能、CT/T 拆分、地图/位置分析、parser/domain 变更、UI/AI 或大重构。
- **真实 bug 1 — trade 1:1 只在参与状态一致时成立**：`resolveRoundTrades()` 的 trade 只依赖 roster 存活基线，而 `summarizeTrade()` 按玩家 `playsIn()` 过滤；当某回合 trader 与 `tradedVictim` 的 `participant` 不一致时，trade kill 与 traded death 会单向计数。修复：trade 要求双方都确认参与，`tradeableDeaths` 同样只登记确认参与的死亡，`Σ tradeKills === Σ tradedDeaths` 由结构保证。新增 regression（参与不一致 + 正常对照）。
- **真实 bug 2 — 降级名单仍发布 complete trade rate**：`timeline.degraded`（freeze_end 不可用回退 start）时，Trade 仍 `complete = true`、`tradeRate` 为数值，与 KAST `complete = false`、文档“KAST/Trade 以 degraded 计数”矛盾，违反“coverage 不完整不得伪装完整结论”。修复：`RoundTradeResolution` 增加 `degraded`，`TradeMetrics` 增加 `degradedRounds` 并计入 `complete`；trade 计数仍可观测，但 rate 归 null。新增 regression。
- **真实 bug 3 — 非法 `tradeWindowSeconds` 静默取消时间上界**：`NaN` / `Infinity` 产生不可比较的 `windowTicks` 且 `available = true`，交易不再受窗口约束；`0` / 负值被静默钳到 1 tick。修复：非有限或非正即抛 `RangeError`，与既有 `effectiveFlashThresholdSeconds` 校验一致。新增 regression。
- **Final Acceptance tests**（`tests/acceptance.test.mjs`，6 个）：trade 1:1 参与不一致、降级 trade completeness、非法窗口、`PlayerCoverage` 回合闭合与 `kast.playedRounds === roundsPlayed`、utility 有效伤害 ⊆ 玩家 `effectiveDamage` 且逐发 evidence 可解释、真实 demo1.dem 全场跨指标 invariant（含 side 分区、CT/T 击杀-死亡交叉恒等、无 unexpected unavailable/ambiguous、deterministic）。
- **API**：仅 additive —— `RoundTradeResolution.degraded`、`TradeMetrics.degradedRounds`；外加更严格 option 校验。`MatchAnalytics` / `PlayerMetrics` / `SideMetrics` / KAST / Clutch / Utility 既有字段语义未变。P3 Analytics public contracts 现已冻结，供 P4 Findings 使用。
- **Golden 保持**：demo1 twinkle 25/20/4、reported ADR 110.17、ADR 91.38、KAST 18/24=75%、trade 6/4/18=22.2%、R24 1v3 win、utility Flash23/Smoke14/HE10/Incendiary9/Molotov2/Decoy1、HE effective 96、fire 54、enemy19/team10/self15、flash assist 1 全部不变，无硬编码。
- **验证**：analytics **53/53 PASS**、dem-parser **28/28 PASS**（真实 DEM 全部执行、0 skipped）、`pnpm typecheck`、`pnpm build` 全 PASS。
- 文档：`docs/analytics-metrics.md`（trade 口径 + FINAL PASS banner）、`docs/utility-analytics.md`、`docs/roadmap.md`、`.agents/current-task.md` 已同步。可以正式进入 P4 Findings。

## 2026-10-06 — P3.3 Utility Analytics PASS

- 基于 `d73e05b` 完成 analytics utility work unit，`utility.ts` + metrics/index 集成；不改 parser、领域契约和生产包依赖，仅 analytics 依赖 match-model。
- 唯一投掷口径：formal-window + confirmed participation 的 weapon_fire grenade release；detonate/start_burn/start_decoy 为独立效果证据，绝不叠加或反推 usage。同 actor/tick/归一 kind release 多行保留 observed、该类型 total=null；entityId 可复用、不做全局 ID。
- Fire 归一 molotov/incgrenade/inferno；throws 仍区分 Molotov/Incendiary，inferno 仅 damage/effect。原始 event.weapon、round/tick 和 effectiveLoss 保留。
- HE/fire 有效敌伤复用 damage ledger，overkill 截断、友伤/自伤不归属，ledger 缺口使 total=null。Flash count 为 victim effects；reported duration sum 为原始证据，actual blind duration 未经证实而 null。candidate overlap 考虑其他 thrower；effective threshold 默认不启用，显式 finite >=0 输入并回显。
- Flash assist 依赖 kill.assistedFlash=true 和 isEligibleAssist；没有“闪后被杀”的猜测路径。unknown flag/side/assister actor 显式 coverage。
- Utility 本地 coverage 输出 per-metric complete、reason counts 与 nullable totals。unidentified roster 和 null actor 保守门控。当前 parser 无 feed-completeness manifest，完整性仅针对领域事件证据；实际 blind reset/expiry/死亡终止仍待验证。
- Golden twinkle：Flash23/Smoke14/HE10/Incendiary9/Molotov2/Decoy1（fire11）；HE112 reported→96 effective、fire49→54；enemy19/50.853604s raw、team10/24.592389s raw、self15/20.235922s raw；flash assist1（R6 tick28201）。HE 与人工≈98差2：已逐发核对，R17 reported19仅剩3 HP，不能修改既有 ledger 迎合近似参考。44 positive duration rows / 6 overlap candidate rows，actual duration=null。
- 验证：analytics **47/47**（新增9 synthetic +1 real-demo golden）、dem-parser **28/28**，0 skipped；`pnpm typecheck`、`pnpm build` PASS（未变包使用 Turbo cache）。独立审查提出的 roster/assister coverage 缺口已修复并加入 regression。
- 全定义、口径/coverage/差异：[Utility Analytics](../docs/utility-analytics.md)。本 work unit focused commit 后交接；未进入 Findings/UI/AI。

## 2026-10-06 — P3.2 Final Acceptance end-state coverage fix

- 基线：已 fetch 并确认 `main` / `origin/main` 同为 `cbff78d`，从当前代码、测试和 docs 复核实现。根因是 Trade / Clutch 入口检查 available / anomaly 等条件，却漏掉 timeline 已识别的 `endStateSuspect`。
- `src/trade.ts`：冲突时复用 unresolved 返回值，整个回合不贡献 trade kill / traded death / tradeable death；既有 `summarizeTrade()` 将确认参与者计入 `unavailableRounds`、`complete=false`、`tradeRate=null`。`available` 的既有时钟语义不变。
- `src/clutch.ts`：冲突时整个回合 `ineligible=true`，无任何 1vN opportunity。统一 coverage 保留冲突原因 `survival-end-state-conflict`，并沿用 `clutch-round-ineligible`；无新增 issue。
- KAST 现有 `timeline.endStateSuspect` 降级已保证 incomplete；未修改 `kast.ts`。timeline 架构、5s trade window、正常指标语义及 package boundaries 均未改动。
- `tests/combat.test.mjs` 新增 Case A（有 death、end alive=true）与 Case B（无 death、end alive=false）。正常对照证明该回合本可产生 trade/clutch；冲突下验证 timeline、直接 resolver、全体玩家汇总/coverage/KAST，以及未知 trade 时钟组合。两个 regression 在修复前均失败。
- 验证：analytics **37/37 PASS**（含 3 个真实 DEM golden）、dem-parser **28/28 PASS**（含真实 DEM）、`pnpm typecheck`、`pnpm build` 全 PASS，0 skipped。demo1 twinkle KAST **18/24=75.0%**、trade **6/4/18/22.2%**、R24 **1v3 won=true** 保持；P3.1 damage/ADR、全局 trade **34:34**、parser golden 均无回归。
- 文档：同步 `docs/analytics-metrics.md` 与 `.agents/current-task.md`。本 work unit 创建 focused commit 后交接；未进入 P3.3，无无关改动。

## 2026-10-06 — P3.2 KAST / Trade / Clutch

- `packages/analytics` 新增统一存活/时序上下文 `src/timeline.ts`：以 coverage 选出的名单快照（freeze_end 优先）为起点，用正式窗口 `[startTick, endTick]` 内的死亡事件推进，并用 `end` 边界快照核验。`survived` 只有在“起点 alive + 无死亡 + end alive=true”同时成立时才为 true；无死亡不等于存活。生命周期异常（baseline 之后 disconnect/spawn/side_change）与不一致死亡使该回合时间线退出 KAST/Trade/Clutch。
- KAST（`src/kast.ts`）：K = 窗口内合规击杀，A = 合规助攻，S = 可证存活到 round end，T = 死亡在窗口内被存活队友有效 trade。K/A/T 任一成立即 KAST，S 不影响；否则只有 S 与 T 都被证明为 false 才判 miss，无法证明则该回合退出分母。输出 rounds / eligibleRounds / playedRounds / percentage 与 K/A/S/T 分量回合数、`complete` 标记。
- Trade（`src/trade.ts`）：trader 在窗口内击杀 tradedKiller，为队友 tradedVictim 复仇；trade kill 与 traded death 严格 1:1。默认 `tradeWindowSeconds = 5`，`windowTicks = round(5 × tickRate)`；`match.tickRate` 不可靠时 `available=false`、`windowTicks=null`、tradeRate=null 并记 `trade-tick-rate-unknown`（tradeableDeaths 仍输出）。同 tick 记 `trade-same-tick-ambiguous`，并列候选记 `trade-candidate-ambiguous`，都不归属。双方都必须是可识别敌方击杀，排除 teamkill/world/side unknown。tradeRate 仅在 tick rate 可用、上下文完整、无 ambiguous 时为数值。
- Clutch（`src/clutch.ts`）：从可靠 freeze_end 名单推进存活人数，当某队恰剩 1 人且敌方 ≥1 时形成 opportunity，按 1v1–1v5 分桶；只有 `round.winner === 该阵营` 才算 clutch win（winner 未知记 `clutch-winner-unknown`）。lifecycle 异常 / unidentified / 名单回退时整回合不输出（`clutch-round-ineligible`），禁止猜测。
- Coverage（`src/coverage.ts`）：新增 10 个 issue code，并给出 `coverageIssueSeverity`（unavailable / ambiguous / degraded / informational）与 `CoverageSummary.severity` 合计；`RoundRoster` 增加 `entries`/`tick`，`RoundCoverage` 增加 `endState`、`winner`、`lifecycleEvents`。
- demo1.dem golden（twinkle）：KAST **18/24 = 75.0%**（K14/A3/S4/T4，全部可证、complete=true）；trade kills **6**、traded deaths **4**、tradeable deaths **18**、trade rate **22.2%**；clutch 3 次（R1 1v3、R17 1v2、R24 1v3）1 win（R24）。全局 tradeKills = tradedDeaths = 34，tradeable 158，clutch 31/7，P3.2 新 issue 全 0。
- 与人工复盘一致；差异仅来自口径精确化。对账中发现 R22 死后手雷击杀（tarkz 于 121075 死亡后 121153 击杀 twinkle）为合法 posthumous kill，不复活、不作 trade；R13/R23 的复仇击杀分别 395/359 ticks，超出 320 窗口故不算 trade（放宽到 ~6.2s 会得到 6，与人工复盘 4 不符）。
- 验证：`pnpm --filter @cs2-coach/analytics test` **35/35**（P3.1 19 + P3.2 combat 13 + 真实 DEM 3）、`pnpm --filter @cs2-coach/dem-parser test` **28/28** 无回归、`pnpm typecheck`、`pnpm build` 全 PASS。上一轮 handoff/current-task 记录的 “20/20” 实际为 **21/21**（19 合成 + 2 真实 DEM），已更正。
- 未实现：utility advanced metrics、Findings、AI、UI。完整定义、issue 码表与 golden：docs/analytics-metrics.md。

## 2026-10-06 — P3.1 damage / ADR semantics correction

- `packages/analytics` 现在区分两套伤害：`reportedDamage`（原始 `dmg_health`，保留 overkill）与 `effectiveDamage`（受害者实际 HP 损失，单发被受击前剩余 HP 截断）。`reportedAdr = reportedDamage / roundsPlayed`，`adr = effectiveDamage / roundsPlayed`（标准 ADR）。CT/T split 同样输出两套。旧的 `adr` 字段语义已改为标准 ADR，原值迁移到 `reportedAdr`。
- 新增 `packages/analytics/src/damage.ts`：`buildDamageLedger(round)` 为每个 victim 回合从满血 100 重建 HP 轨迹，`loss = preHurtHP - healthRemaining`。自伤/友伤/world 伤害参与轨迹但不归属；`dmg_health` 只用于校验（demo 整数上报与截断余量允许 ±1）。轨迹断裂记 `damage-effective-chain-broken`，同 tick 顺序不可证记 `damage-effective-same-tick-ambiguous`，对应伤害行不计入 effective，绝不猜测。逐玩家 `coverage.effectiveDamageUnresolved` 计数。
- demo1.dem golden：twinkle reported 2644 / reportedAdr 110.17 / effective 2193 / adr 91.38；CT 1106→819、T 1538→1374；全局 reported 24600 / effective 19351。与之前人工复盘 ~2195 / ~91.5 对照，差 2 点（0.09%）来自逐发整数舍入，不是口径分歧；scoreboard 风格 `min(dmg, hp)` 会得到 2162，明显偏离，说明人工复盘用的是 HP 损失口径。
- 验证：`pnpm --filter @cs2-coach/analytics test` 20/20（含真实 DEM）、`pnpm --filter @cs2-coach/dem-parser test` 28/28 无回归、`pnpm typecheck`、`pnpm build` 全 PASS。
- P3.2 仍未开始：KAST / Trade / Clutch / utility advanced / Findings / UI / AI 未实现。治疗与回合内重生在本样本未出现，机制上会走 chain-broken 降级，待真实样本验证。
- 完整定义、issue 码表与 golden 对比：docs/analytics-metrics.md。

## 2026-10-06 — P3.1 PASS

- `packages/analytics` 现在实现第一批确定性指标：K/D/A、K/D、HS%、rounds played、reported damage、ADR、CT/T split、multi-kill、opening kill/death。实现只依赖 `match-model` 领域类型。
- 统一 coverage/eligibility 在 `packages/analytics/src/coverage.ts`：回合窗口 `eventEligible`（start+end 齐全，闭区间）、freeze_end→start 快照选择、participant/side/alive 归一、unidentified 与 post-round 排除。指标调用共享 `isEligibleKill/isEligibleAssist/isEligibleDamage/isIdentifiedEnemyKill`，不各自判断。
- ADR 口径为 reported damage（保留 overkill，剔除友伤/自伤/未知 side），分母为有确认参与的完整回合。CT/T split 使用逐回合快照 side，不用 `Player.team`。
- assist 要求 assister 与 killer 同侧；demo 原始 assister 字段会记录友伤助攻（twinkle 2 次），抑制后与人工复盘 25/20/4 一致。
- demo1.dem golden：twinkle 25/20/4、HS 9、CT 10/10/3/1106、T 15/10/1/1538、ADR 110.17、opening 4/0、multi-kill {2:6,3:1,4:1}；全局有效窗口击杀 180（parser 182 含 2 个 post-round）、助攻 57、伤害 24600、24 次 opening duel。
- 验证：`pnpm --filter @cs2-coach/analytics test` 15/15（含真实 DEM）、`pnpm --filter @cs2-coach/dem-parser test` 28/28、`pnpm typecheck`、`pnpm build` 全 PASS。analytics 对 dem-parser 仅有 test-only devDependency。
- P3.2 KAST / Trade / Clutch 前缺口：存活推进（freeze_end alive + 死亡时间线 + end 快照）、trade 时窗与 tickRate 未知抑制、clutch 起始存活名单、回合内断连/重生/重连真实证据、utility 类型归一与 stage 去重。
- 完整定义、issue 码表与 golden 对比：docs/analytics-metrics.md。

## 2026-10-06 — P2.2 PASS

## 2026-10-06 — P2.2 PASS

- Exact round start/freeze_end/end snapshots now provide player identity, side, nullable alive and instantaneous CT/T participation. Missing rows are unavailable, not an empty roster; observed is not a guarantee of completeness.
- Round.playerLifecycle preserves actual spawn/disconnect/side_change separately from combat events. player_team uses team/oldteam, not user_team_num, for the change. Known snapshot/lifecycle identities are included in Match.players.
- demo1.dem: 24 rounds, 72 snapshots / 720 rows, all 240 start and 240 freeze-end states alive; end states 60 alive / 180 dead. 230 live spawns (raw 240 includes 10 warmup), 10 halftime changes, 10 post-final-end disconnects.
- P2.1 golden counts unchanged. pnpm typecheck, pnpm build, parser test 28/28 with real DEM all PASS; independent review complete.
- No Analytics/UI/Findings/AI implemented. P3 can begin with explicit metric policy and coverage gates; connected enum semantics, reconnect, within-round disconnect/respawn and bot coverage need further real evidence. Never infer state from event absence or Player.team.
- Full contract, evidence, fixture and P3 scope: docs/round-state-evidence.md. DEM stays local/ignored; native types remain inside dem-parser.
