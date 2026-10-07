# CS2 Analyst Roadmap

**Supported platform: Windows x64 only.** CS2 Analyst 只面向 Windows x64 构建、验证与分发；macOS / Linux 不在路线图内，packaging 流程也不包含跨平台分支。

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

P5.1 End-to-End Desktop Report MVP — **PASS**。首次打通 `选择 .dem → Main 文件选择 → Utility Process 解析/分析 → Findings → Renderer 报告页`。Renderer 只在 sandbox + contextIsolation 下消费 JSON-only `@cs2-analyst/report-contract` DTO，不接触 Node/fs/demoparser2；原生解析与全部确定性计算在 Utility Process 中执行。report-contract `schemaVersion: 1` 为后续演进预留。实现、进程边界、IPC 契约、状态机、UI 结构与剩余缺口见 [桌面比赛报告](./desktop-report.md)。

P5.2 Windows Packaging & Installable MVP — **PASS**。使用 electron-builder + NSIS 产出 Windows x64 安装包（`CS2 Analyst`，版本沿用项目版本）。Utility Process 的 workspace 依赖全部打进 `report-worker.js`，原生 parser 以 asar-unpacked 形式随安装目录分发，安装版不再依赖 pnpm workspace symlink；仍不包含签名、自动更新或发布流程。安装版 E2E 覆盖安装/启动、Renderer 无 Node 暴露、真实 demo1.dem 报告、损坏 DEM 错误、分析中途关闭无残留 worker 与卸载。见 [Windows 打包与安装](./windows-packaging.md)。

P5.3 报告页可读性与说明优化 — **PASS**。纯展示层：Findings 证据不再默认显示原始 tick，改为按 `(eventTick - roundStartTick) / tickRate` 计算的“回合开始后 N 秒”；统一数字格式（秒/ADR 两位小数、百分比一位、整数计数零位）；Trade 文案改为“4 / 18 次死亡后队友完成补枪”；道具面板重做为逐行图标列表（投掷数量 + 道具效果）；8 张核心指标卡与道具面板统一增加 Fluent UI v9 `?` Tooltip。Analytics / Findings 语义、阈值、排序、evidence 数值与 ruleId 顺序全部不变。

P5.5 Round Timeline MVP — **PASS**。报告页底部新增独立“回合时间线” section：每回合一行摘要（`R24 / T / 成功 / 13 : 11`）可点击展开关键事件，展示目标玩家的击杀、死亡（含死后击杀）、已证实的残局形成点与炸弹安放 / 拆除 / 爆炸生命周期；时间统一为 `(eventTick - round.startTick) / tickRate` 的回合内秒数，证据不足显示 `—`。Timeline 是 Desktop presenter 层新增的只读 JSON DTO，只依赖现有 `Match / Round / MatchEvent` 与冻结 Analytics 的 clutch 结果，不修改 P3 语义、不重跑 Analytics、不在 Renderer 重新推导比赛事实。Findings 的 `relatedRounds` 提供“查看 R24 / 查看相关回合”联动（展开、滚动、短暂高亮）；切换目标玩家只切换 DTO 中对应玩家的 timeline，不重新解析 DEM。事件过滤只保留目标玩家击杀 / 死亡、clutch start 与炸弹生命周期，不展示 damage / weapon_fire / 道具效果 / 受闪 / snapshot。详见 [桌面比赛报告](./desktop-report.md)。

- P5.1 已完成：Match overview、玩家指标与 Findings 报告页。
- P5.2 已完成：可安装、可卸载、脱离 pnpm workspace 运行的 Windows 版本。
- P5.3 已完成：报告页时间显示、数字格式、Trade 文案、道具面板与指标说明。
- P5.4 已完成：深蓝灰视觉体系、彩色实心道具图标与卡片一致性。
- P5.5 已完成：回合时间线与 Findings → Timeline 联动。
- P5.5.1 已完成：名单与 Timeline 统一隐藏原始长数字玩家标识，保留 DTO 追溯 ID。
- P5.6 已完成：Analysis Views MVP（全场玩家指标对比、回合击杀趋势、CT/T 对比），基于冻结 Analytics 与 Timeline 的只读展示投影。
- 未开始：完整播放器、地图热力图、额外 Analytics 算法。

P5.6.2 Report UX Polish — **PASS**。比赛报告 / 回合时间线 / 分析三个 mounted Tab；Findings 原生证据入口 hover/focus 与先切 Tab 的回合联动；当前玩家姓名和条图统一 #62abf5；Frozen multiKills counts 直接投影、零项隐藏；CT/T 独立内缩 divider；Timeline 单色自绘 SVG kill-feed、爆头/闪光助攻原样投影与未知武器 fallback。严格保持 P3/P4 与 Timeline 筛选、round time、nickname 原样规则；无新增算法或产品模块。

P5.6.3 Official Kill-feed Assets — **PASS**。击杀播报改用71张官方SVG（69武器、官方爆头与闪光助攻），72武器identifier与独立刀型映射；删除自绘weapon shapes。HUD正确源目录panorama/images/hud/deathnotice/，仅定向补提缺失素材，修正旧提取路径。全部回归与两安装包/安装版E2E通过，Timeline与Analytics/Findings语义不变。见[官方资源提取](./cs2-killfeed-assets.md)。

P5.6.4 Custom Window Chrome — **PASS**。40px 全宽自绘窗口标题栏、原创 target mark、安全 preload/IPC、原生最大化状态同步与持久错误页壳层已完成；全部指定回归、两安装包和 installed smoke 通过，用户确认真实鼠标拖动正常。

P5.6.5 Branding & App Icon — **FINAL PASS**。正式产品名冻结为 CS2 Analyst；mark/lockup、七尺寸 Windows ICO、20px mark + CS2 Analyst 标题栏、EXE/NSIS/快捷方式/App ID 与全仓 `cs2-analyst` 命名迁移完成。构建、单测、报告、dev/preview smoke、两安装包以及生产图标/快捷方式/卸载注册项验证均已完成。此前未重跑的完整 installed regression 与部分任务栏/Alt+Tab/真实拖动视觉项，由 Product Owner 于 2026-10-08 明确批准不再作为 P5.6.5 的阻塞验收项；FINAL PASS 表示产品验收结论，不代表这些未执行检查被补跑。见 [Windows 打包记录](./windows-packaging.md)。

## v0.1 Final Acceptance

**Status: ACTIVE — waiting for additional real DEM samples.**

- P5 Desktop MVP 已封板；除已确认 bug 外，不再追加 P5.x 功能或 polish。
- `demo1` 继续作为 deterministic golden，现有 K/D/A、ADR、KAST、Trade、CT/T、Multi-kill、R24 clutch、R22 posthumous HE 与 Findings ruleId 顺序不得回归。
- Final Acceptance 的核心目标从“继续开发功能”切换为“验证不同真实比赛上的泛化可靠性”。
- 目标样本约 3～5 场真实玩家 DEM，尽量覆盖不同地图、比分、发挥水平与特殊情况；拿到第 2 份 DEM 即可开始逐场验收，不必等待全部样本收齐。
- 每场重点抽查最终比分、K/D/A、ADR、KAST、CT/T split、最高多杀、Opening/Trade、Clutch（如有）以及随机 3～5 个 Timeline 回合，并核对 Findings 是否有充分证据。
- DEM 仍由用户主动选择；不引入自动目录扫描、登录、历史库、AI Coach、热力图或完整播放器。
- P6 AI Coach 仅在 v0.1 Final Acceptance 完成后再评估。

## P6 AI Coach

- Optional AI explanation layer
- Training recommendations

## Future — Account & Match History（未开始）

明确的产品边界：

- **不做自动扫描 / 自动寻找 DEM。** Auto DEM discovery / directory scanning: **NOT PLANNED**。DEM 始终由用户主动选择。
- 历史记录未来再做，并建立在登录机制之上。
- DEM 解析、Analytics 与 Findings 永远由 Desktop 本地完成；服务端不解析 DEM，也不需要上传 DEM 文件。

```text
apps/api
├── Auth / Session
├── 保存比赛历史摘要
├── 查询比赛历史
└── 不上传 DEM，不做服务端 DEM 分析

Desktop
├── 本地解析 DEM
├── 本地 Analytics
├── 本地 Findings
└── 分析完成后未来可同步摘要
```

登录 / Session、`apps/api`、历史比赛数据库均不在本轮或当前 P5 范围内。
