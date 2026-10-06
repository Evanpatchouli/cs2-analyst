# Current Task

Status: complete — P5.5 Round Timeline MVP（回合时间线 + Findings → Timeline 联动）PASS

基线：`642fd0d`（P5.4 报告页视觉优化 PASS）；本轮只做 Desktop presenter 只读展示 DTO 与 Renderer 展示，不改 P3 Analytics 语义、P4 Findings 阈值 / 排序 / evidence、demo1 数值与 ruleId 顺序，也不重新解析 DEM 或重跑 Analytics。

- DTO：`packages/report-contract` 新增 `DesktopTimelineEvent / DesktopRoundTimeline / DesktopPlayerTimeline`，`DesktopMatchReport` 增加 `timeline`（additive，`schemaVersion` 仍为 1）。全部 JSON-only，含 `tick` 供追溯但不渲染。
- Presenter：`apps/desktop/electron/report.ts` 新增 `roundClock` / `roundScoreLookup` / `playerSide` / `buildRoundEvents` / `buildTimeline`；`teamScore` 重构为 `roundScoreLookup` 的最后一项（页头比分口径与数值不变）。`side` 取 freeze_end（回退 start）+ participant，`result` 取 `round.winner` 对比 side，`scoreAfter` 只在胜方能唯一映射回固定队伍时累计，时间 `(tick - startTick) / tickRate`；全部缺证据即 Unknown / unknown / null / 字段缺省。
- 事件过滤：目标玩家 kill / death（死后击杀保留）、已证实 clutch start（复用 Analytics clutch tick）、炸弹生命周期（plant_start / planted / defuse_start / defused / exploded）。排除 pickup / drop、damage、weapon_fire、utility、flash、snapshot；只在正式回合窗口内取事件。
- Renderer：`renderer/src/main.tsx` 新增 `RoundTimeline` section + `weaponLabels` / `sideText` / `scoreAfterText` / `roundResult` / `eventTime` 展示 helper；每回合一行摘要 + 点击展开，默认全部收起。Findings 带 `relatedRounds` 时显示“查看 R24 / 查看相关回合”，点击展开 + `scrollIntoView` + 2.4 秒中性高亮。切换玩家只换 DTO 数组，不重跑。
- 验证：`pnpm typecheck` 11/11、`pnpm build` 6/6；desktop Node 集成 7/7（新增 timeline 过滤 / 昵称 / 时间 / 缺 tickRate / 窗口不完整 / 未知值 / deterministic 断言）；`test:report`（真实 / 损坏 / 非 .dem）新增时间线 DOM 断言通过；analytics 53/53、findings 17/17、dem-parser 28/28；`pnpm test:smoke` 通过；重新打包后 `test:installed` 通过。
- demo1 golden 不变：twinkle 25/20/4、ADR 91.38、KAST 75%、Trade 22.2%、R24 1v3 胜、5 条 Findings 顺序 `side-impact.ct-gap / trade.low-rate / team-flash.frequent-effects / clutch.win.r24 / opening.positive`。R24 timeline：T / 成功 / 13 : 11，含 1v3 残局、炸弹安放、twinkle 4 杀；R7：CT / 成功，twinkle 3K + 成功拆弹；R22：T / 失败，保留 tarkz 死后击杀 twinkle（tick 121153）。
- Roadmap：新增 P5.5 PASS 与 “Future — Account & Match History”（apps/api = Auth / Session + 历史摘要，不上传 DEM、不做服务端分析；Auto DEM discovery / directory scanning: NOT PLANNED）。登录 / API / 历史本轮不实现。
- 非目标保持：不自动找 DEM、不扫描 Steam / CS2 路径、不做登录 / apps/api / 历史库 / AI / 地图俯视 / 3D Replay / 位置路径 / economy / 每 tick timeline / 完整播放器 / 新 Analytics 算法；不改 P3 冻结契约与 P4 规则。
- focused commit 后交接；细节见 [桌面比赛报告](../docs/desktop-report.md)。
