# Current Task

Status: complete — P3.1 damage / ADR semantics correction PASS

- Scope: `packages/analytics` 伤害口径修正。保留 `reportedDamage` 原始证据，原 `adr` 更名 `reportedAdr`；新增标准 `effectiveDamage` 与基于它的 `adr`（含 CT/T split）。未进入 P3.2。
- Derivation: 每个 victim 每回合从出生满血 100 建 HP 轨迹，`loss = preHurtHP - healthRemaining`；只归属敌方伤害，自伤/友伤仅参与轨迹不归属；单发上报 `dmg_health` 只做校验（允许 1 点整数舍入），轨迹断裂记 `damage-effective-chain-broken`，同 tick 顺序不可证记 `damage-effective-same-tick-ambiguous`，不猜。
- Golden: demo1.dem twinkle reported 2644 / reportedAdr 110.17；effective 2193 / adr 91.38（人工复盘 ~2195 / ~91.5，差 2 点来自整数舍入）；CT reported 1106→effective 819，T reported 1538→effective 1374。全局 reported 24600 / effective 19351，新增 coverage issue 均为 0。
- Verification: analytics test 20/20 PASS（含真实 DEM golden）；dem-parser test 28/28 PASS 无回归；pnpm typecheck PASS；pnpm build PASS。

未实现：KAST、Trade、Clutch、utility advanced metrics、Findings、AI、UI。
Details: docs/analytics-metrics.md. Handoff: .agents/handoff.md.
