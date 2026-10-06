# Current Task

Status: complete — P3.1 Core Player Metrics & Coverage PASS

- Scope: `packages/analytics` 第一批确定性玩家指标（K/D/A、K/D、HS%、rounds played、reported damage、ADR、CT/T split、multi-kill、opening kill/death）。
- Design: 统一 coverage / eligibility（回合窗口、freeze_end/start 快照、participant/side/alive、unidentified、post-round 排除），指标只消费共享判定，不各自重复实现。
- Policy: ADR 固定 reported damage 并保留 overkill；CT/T split 使用逐回合快照 side；opening / multi-kill 限定有效正式回合窗口并有明确同 tick 策略。
- Golden: demo1.dem twinkle 25/20/4、HS kills 9、CT 10/10/3/1106、T 15/10/1/1538、ADR 2644/24=110.17、opening 4/0、multi-kill 8 回合（2 杀×6、3 杀×1、4 杀×1），与人工复盘一致。
- Verification: pnpm typecheck PASS；pnpm build PASS；analytics test 15/15 PASS（含真实 DEM golden）；dem-parser test 28/28 PASS 无回归。

未实现：KAST、Trade、Clutch、utility advanced metrics、Findings、AI、UI。
Details: docs/analytics-metrics.md. Handoff: .agents/handoff.md.
