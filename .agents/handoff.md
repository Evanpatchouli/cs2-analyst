# Agent Handoff

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
