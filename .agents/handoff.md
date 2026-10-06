# Agent Handoff

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
