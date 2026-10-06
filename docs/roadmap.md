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

进入 roster 相关 P3 指标前，仍需每回合完整参与玩家、阵营与初始存活状态，以及必要的离线/重连/重生证据。可以采用有界回合快照或已验证离散事件，避免全量 tick/position stream。

## P3 Analytics Engine

- Basic player statistics
- Combat metrics
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
