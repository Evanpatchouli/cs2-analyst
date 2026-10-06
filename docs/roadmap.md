# CS2 Coach Roadmap

**Supported platform: Windows x64 only.** CS2 Coach 只面向 Windows x64 构建、验证与分发；macOS / Linux 不在路线图内，packaging 流程也不包含跨平台分支。

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

> **P3 Analytics Engine — FINAL PASS。** Analytics public contracts frozen for P4 Findings。跨指标一致性、coverage contract、API 稳定性与 demo1 golden 已通过 Final Acceptance；invariant tests 见 `packages/analytics/tests/acceptance.test.mjs`，完整定义见 [P3 核心指标、KAST / Trade / Clutch 与覆盖机制](./analytics-metrics.md)。

P3.1 Core Player Metrics & Coverage 已完成：K/D/A、K/D、HS%、rounds played、reported damage / effective damage、reported ADR / 标准 ADR、CT/T split、multi-kill、opening kill/death，配套统一 coverage/eligibility 与伤害 HP 轨迹确认机制。

P3.2 Combat Metrics（KAST / Trade / Clutch）已完成：基于 freeze_end 名单快照 + 正式回合窗口 + 死亡事件 + end 快照核验的统一存活时间线；KAST（K/A/S/T，缺证据退分母而不是猜 miss）；trade kill / traded death / tradeable death 与 5 秒 tick 窗口（tick rate 不可靠时抑制时间型结论，同 tick 记 ambiguous）；clutch opportunity / clutch win 与 lifecycle 异常整回合不输出。coverage issue 按 unavailable / ambiguous / degraded / informational 分类。

- Basic player statistics（P3.1 已完成第一批）
- Combat metrics（P3.2 KAST / Trade / Clutch 已完成）
- Utility metrics（P3.3 已完成）：release-only 投掷计数、HE/fire 敌方 HP loss、enemy/team/self flash 事件及原始 duration、death flag flash assist；重叠实际时间未获证实而返回 null。见 [Utility Analytics](./utility-analytics.md)。

## P4 Findings Engine

P4.1 Findings MVP — **PASS**。冻结 MatchAnalytics → 确定性规则 → Finding[]；实现 CT/T 伤害落差、补枪率偏低、首杀对决正负影响、伤害道具直接敌伤与明确闪光支援、队友受闪纪律、单次残局亮点六类。每名玩家默认最多 3 个问题 + 2 个亮点，不调用 AI、不修改 P3。

Schema、阈值、coverage 门控、priority、真实 twinkle 输出与 future gaps 见 [Findings Engine](./findings-engine.md)。Low-impact/consistency 因冻结 API 无逐玩家回合 combat evidence 跳过；实际 flash duration/战术位置价值仍需可靠 Analytics 证据。后续扩展需要独立明确需求，不建设大而全规则系统。

## P5 Desktop Report UI

P5.1 End-to-End Desktop Report MVP — **PASS**。首次打通 `选择 .dem → Main 文件选择 → Utility Process 解析/分析 → Findings → Renderer 报告页`。Renderer 只在 sandbox + contextIsolation 下消费 JSON-only `@cs2-coach/report-contract` DTO，不接触 Node/fs/demoparser2；原生解析与全部确定性计算在 Utility Process 中执行。report-contract `schemaVersion: 1` 为后续演进预留。实现、进程边界、IPC 契约、状态机、UI 结构与剩余缺口见 [桌面比赛报告](./desktop-report.md)。

P5.2 Windows Packaging & Installable MVP — **PASS**。使用 electron-builder + NSIS 产出 Windows x64 安装包（`CS2 Coach`，版本沿用项目版本）。Utility Process 的 workspace 依赖全部打进 `report-worker.js`，原生 parser 以 asar-unpacked 形式随安装目录分发，安装版不再依赖 pnpm workspace symlink；仍不包含签名、自动更新或发布流程。安装版 E2E 覆盖安装/启动、Renderer 无 Node 暴露、真实 demo1.dem 报告、损坏 DEM 错误、分析中途关闭无残留 worker 与卸载。见 [Windows 打包与安装](./windows-packaging.md)。

- P5.1 已完成：Match overview、玩家指标与 Findings 报告页。
- P5.2 已完成：可安装、可卸载、脱离 pnpm workspace 运行的 Windows 版本。
- 未开始：Round timeline（完整播放器）、Analysis views（图表/热力图/多玩家对比）。

## P6 AI Coach

- Optional AI explanation layer
- Training recommendations
