# Current Task

Status: complete — P3.2 KAST / Trade / Clutch PASS

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
