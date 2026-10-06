# CS2 Coach Roadmap

## P0 Foundation

- Electron desktop foundation
- Monorepo structure
- AI collaboration workflow

## P1 DEM Import

- Import CS2 demo files
- Parser adapter
- Match metadata extraction

## P2 Domain Model

- Match
- Player
- Round
- Event

P2.1 Combat Event Model 已完成：具体伤害、开火、投掷物生效、闪光受害者、炸弹事件，击杀助攻/阵营及回合起止证据。详见 [字段映射与 P3 前置缺口](./combat-event-evidence.md)。

P2.2 Round Participation & Player State 已完成：精确 start / freeze end / end 有界快照提供名单、阵营与存活状态，离散 spawn / disconnect / side_change 提供已验证的生命周期证据。详见 [P2.2 证据、覆盖限制与 P3 开工边界](./round-state-evidence.md)。P3 可按覆盖条件开工；重连和回合内重生仍需其他真实样本验证。

## P3 Analytics Engine

P3.1 Core Player Metrics & Coverage 已完成：K/D/A、K/D、HS%、rounds played、reported damage / effective damage、reported ADR / 标准 ADR、CT/T split、multi-kill、opening kill/death，配套统一 coverage/eligibility 与伤害 HP 轨迹确认机制。

P3.2 Combat Metrics（KAST / Trade / Clutch）已完成：基于 freeze_end 名单快照 + 正式回合窗口 + 死亡事件 + end 快照核验的统一存活时间线；KAST（K/A/S/T，缺证据退分母而不是猜 miss）；trade kill / traded death / tradeable death 与 5 秒 tick 窗口（tick rate 不可靠时抑制时间型结论，同 tick 记 ambiguous）；clutch opportunity / clutch win 与 lifecycle 异常整回合不输出。coverage issue 按 unavailable / ambiguous / degraded / informational 分类。

- Basic player statistics（P3.1 已完成第一批）
- Combat metrics（P3.2 KAST / Trade / Clutch 已完成）
- Utility metrics（P3.3 已完成）：release-only 投掷计数、HE/fire 敌方 HP loss、enemy/team/self flash 事件及原始 duration、death flag flash assist；重叠实际时间未获证实而返回 null。见 [Utility Analytics](./utility-analytics.md)。

## P4 Findings Engine

- Evidence-based issue detection
- Player improvement patterns

## P5 Desktop Report UI

- Match overview
- Round timeline
- Analysis views

## P6 AI Coach

- Optional AI explanation layer
- Training recommendations
