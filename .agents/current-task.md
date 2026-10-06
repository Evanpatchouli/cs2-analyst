# Current Task

Status: complete — P3 Analytics Final Acceptance PASS（contracts frozen for P4）

- 基线 `1d6666b`。本轮只做 P3 Analytics 最终一致性验收与真实 bug 修复，未进入 P4 Findings，未加新 Analytics 功能、CT/T KAST/Trade/Clutch、地图/位置、parser/domain、UI/AI，无大重构。
- **修复 1（trade 1:1 结构保证）**：`resolveRoundTrades()` 现在要求 trader 与 `tradedVictim` 都在该回合 `playsIn()`（确认参与），`tradeableDeaths` 同样只登记确认参与的死亡。此前 `summarizeTrade()` 的逐玩家 `playsIn` 过滤在参与状态不一致时会单向计数，破坏全场 `Σ tradeKills === Σ tradedDeaths`；修复后该恒等式由结构保证。
- **修复 2（降级名单不得发布 complete trade rate）**：`RoundTradeResolution` 新增 `degraded`，`TradeMetrics` 新增 `degradedRounds`；start 回退（`timeline.degraded`）时 trade 计数仍输出，但 `complete = false`、`tradeRate = null`，与 KAST `degradedRounds` 语义一致。此前降级回合 `complete = true` 且 `tradeRate` 为数值，违反 coverage contract。
- **修复 3（tradeWindowSeconds 校验）**：`AnalyzeOptions.tradeWindowSeconds` 必须有限正数，否则 `RangeError`。此前 `NaN` / `Infinity` 会得到不可比较的 `windowTicks` 并静默取消时间上界，`0` / 负值被静默钳到 1 tick。
- **Final Acceptance tests**：新增 `tests/acceptance.test.mjs`，只加跨模块 invariant、不重复既有单元测试：trade 1:1（参与不一致 + 正常对照）、降级 trade completeness、非法窗口、`PlayerCoverage` 回合闭合 + `kast.playedRounds === roundsPlayed`、utility 有效伤害 ⊆ 玩家 `effectiveDamage` 且逐发 evidence 可解释、真实 demo1.dem 全场跨指标 invariant。
- **API 变更（additive）**：`RoundTradeResolution.degraded: boolean`、`TradeMetrics.degradedRounds: number`；另有更严格的 option 校验。`MatchAnalytics` / `PlayerMetrics` / `SideMetrics` / KAST / Clutch / Utility 的既有字段与语义未变。完成后 P3 Analytics public contracts 冻结。
- **Golden 保持**：demo1.dem twinkle 25/20/4、reported 2644 / reportedAdr 110.17、effective 2193 / ADR 91.38、KAST 18/24 = 75%、trade 6/4/18 = 22.2%、R24 1v3 win、utility Flash23/Smoke14/HE10/Incendiary9/Molotov2/Decoy1、HE effective 96、fire 54、enemy19/team10/self15、flash assist 1 全部不变；未硬编码。
- **验证**：analytics **53/53 PASS**、dem-parser **28/28 PASS**（真实 DEM 均执行、0 skipped）、`pnpm typecheck`、`pnpm build` 全 PASS。
- 文档：`docs/analytics-metrics.md` 增加 trade 参与/降级/校验口径与 `P3 Analytics Engine — FINAL PASS`；`docs/utility-analytics.md`、`docs/roadmap.md`、current-task/handoff 已同步。

以下为 P3.3 Utility Analytics 历史记录：

- 基线：`d73e05b`；实现 `packages/analytics/src/utility.ts`，`analyzeMatch().players[].utility` 对外输出；未改 parser/domain、Findings/UI/AI、依赖和无关代码。
- throws 唯一口径为正式窗口内 grenade weapon_fire release；effect 生命周期独立保留，不补推、不相加。同玩家/tick/归一类型多 release 无唯一身份则该类型 null；Molotov/Incendiary 合并 fire，同时保留分项与原始 weapon evidence。
- HE/fire 复用既有 damage eligibility 与 effective HP-loss ledger，剔除 overkill/友伤/自伤；不完整 enemyDamage=null，reported/resolved 作为显式观测子集。
- Flash enemy/team/self 分别统计 victim-effect count 与原始 duration sum；实际连续致盲时间因 reset/expiry/overlap 语义未获证实而 null。possible overlap 检查所有 thrower；有效闪阈值无默认值，显式配置并回显。
- Flash assist 仅使用 death.assistedFlash=true + eligible assister；不从 proximity 猜测。缺 flag/side/assister 身份时降级。
- Utility 自有逐指标 coverage：窗口/参与不可用、unidentified roster/actor、同 tick release、unknown damage weapon/side/HP-chain、flash side/assist 缺证据等均明确门控；不改变 P3.1/P3.2 全局 coverage。
- demo1 twinkle：throws Flash23/Smoke14/HE10/Incendiary9/Molotov2/Decoy1；HE effective96（reported112，人工≈98差2，逐发 ledger 对账不迎合参考）；fire54（reported49）；enemy19/raw50.8536s、team10/raw24.5924s、self15/raw20.2359s；flash assist1。正 duration44行、possible overlap6行，actual duration=null。
- 验证：analytics **47/47**、dem-parser **28/28**，真实 DEM 均执行、0 skipped；`pnpm typecheck`、`pnpm build` 全 PASS。独立 review 的 unidentified roster 与缺 assister 两项门控已修复并补 regression。
- 文档：`docs/utility-analytics.md` 定义、coverage、golden 与差异；analytics-metrics/roadmap/handoff 已同步。下一阶段仍须用户确定；本轮未进入 P4。

以下为 P3.2 历史记录：

- 本 work unit 基于已同步的最新 `main` / `origin/main`：`cbff78d`。仅修复统一存活时间线的 end-state conflict 门控，未进入 P3.3。
- `resolveRoundTrades()` 遇到 `timeline.endStateSuspect` 返回既有 unresolved，不产生 trade kill / traded death / tradeable death；`summarizeTrade()` 既有路径增加 `unavailableRounds`，`complete=false`、`tradeRate=null`。
- `resolveRoundClutch()` 遇到同一标记返回 `ineligible=true`、空 opportunities。coverage 复用 `survival-end-state-conflict` 与 `clutch-round-ineligible`，无新增 issue / domain contract / package dependency。
- KAST 已有 `timeline.endStateSuspect` 降级逻辑，确认冲突下 `complete=false`，未修改实现。
- 新增 2 个 synthetic regressions：有 death 但 end alive=true；无 death 但 end alive=false。正常对照可生成 trade/clutch，冲突后验证 resolver、汇总 coverage、KAST 不完整和未知 trade 时钟组合。修复前均失败，修复后均 PASS。
- Final acceptance：analytics **37/37**、dem-parser **28/28**（真实 DEM 均执行、无跳过）、`pnpm typecheck`、`pnpm build` 全 PASS。demo1 的 P3.1 damage/ADR、P3.2 golden、全局 trade 34:34 与 parser golden 均保持。

以下为此前 P3.2 主体实现记录（历史验证计数保留）：

- Scope: `packages/analytics` 新增统一存活/时序上下文与三项战斗指标。未进入 utility advanced metrics、Findings、AI、UI。
- Correction: 上一轮记录的 `analytics test 20/20` 实际为 **21/21**（19 合成 + 2 真实 DEM）；本轮新增 combat 测试后为 **35/35**。
- Timeline: `src/timeline.ts` 以 freeze_end（缺失时回退 start）名单快照为起点，用正式窗口 `[startTick, endTick]` 内死亡事件推进，并用 `end` 快照核验存活；无死亡不等于存活。lifecycle 异常（baseline 后 disconnect/spawn/side_change）与不一致死亡使该回合时间线退出 KAST/Trade/Clutch。
- KAST: K/A/S/T。K、A 或已证 T 任一成立即命中；否则需 S=false 且 T=false 才判 miss，证据不足则退出分母并记 coverage。输出 rounds / eligibleRounds / playedRounds / percentage / K-A-S-T 分量回合数 / complete。
- Trade: 默认 `tradeWindowSeconds = 5` → `round(5 × tickRate)` ticks（样本 320）。trader 在窗口内击杀 tradedKiller 为队友 tradedVictim 复仇，trade kill 与 traded death 严格 1:1。`match.tickRate` 不可靠时抑制全部时间型结论（`available=false`、tradeRate=null、记 `trade-tick-rate-unknown`），tradeableDeaths 仍输出。同 tick 记 `trade-same-tick-ambiguous`、并列候选记 `trade-candidate-ambiguous`，都不归属。排除 teamkill/world/side unknown。
- Clutch: 从可靠名单推进存活人数，某队恰剩 1 人且敌方 ≥1 时形成 opportunity，按 1v1–1v5 分桶；只有 `round.winner === 该阵营` 才算 clutch win。lifecycle 异常 / unidentified / 名单回退时整回合不输出。
- Coverage: 新增 10 个 P3.2 issue code，并提供 `coverageIssueSeverity`（unavailable / ambiguous / degraded / informational）与 `CoverageSummary.severity`；`RoundRoster` 增加 entries/tick，`RoundCoverage` 增加 endState/winner/lifecycleEvents。
- Golden demo1.dem twinkle: KAST 18/24 = 75.0%（K14 / A3 / S4 / T4，complete=true）；tradeKills 6 / tradedDeaths 4 / tradeableDeaths 18 / tradeRate 22.2%；clutch R1 1v3、R17 1v2、R24 1v3（win）。全局 tradeKills = tradedDeaths = 34、tradeable 158、clutch 31/7。
- Verification: analytics 35/35 PASS（含真实 DEM golden）、dem-parser 28/28 PASS 无回归、`pnpm typecheck` PASS、`pnpm build` PASS。

未实现：utility advanced metrics、Findings、AI、UI。
Details: docs/analytics-metrics.md. Handoff: .agents/handoff.md.
