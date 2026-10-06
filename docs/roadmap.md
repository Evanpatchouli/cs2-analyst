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

P3.1 Core Player Metrics & Coverage 已完成：K/D/A、K/D、HS%、rounds played、reported damage、ADR、CT/T split、multi-kill、opening kill/death，配套统一 coverage/eligibility 机制。详见 [指标口径、覆盖机制与 demo1.dem golden](./analytics-metrics.md)。

- Basic player statistics（P3.1 已完成第一批）
- Combat metrics（KAST / Trade / Clutch 待 P3.2）
- Utility metrics

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
