# Current Task

Status: complete — P5.6 Analysis Views MVP PASS。

基线 `7f6c130`，先完成并提交 P5.5.1 名称修复 `0225332`（8/8 集成 + 真实桌面 smoke）。版本仍为 0.1.0，Windows x64 only。

- P5.6：共享比赛 Shell 下新增 Fluent UI v9 比赛报告 / 分析 Tab，默认比赛报告；hidden 保持两个 panel 挂载，玩家、Findings 与 Timeline 状态保留，不重解析或重跑 Analytics。
- report-contract additive `analysis`：完整玩家指标对比、每人 roundTrend、CT/T sideSplit，JSON-only；schemaVersion 仍为 1。对比指标和 CT/T 直接投影 frozen PlayerMetrics；roundTrend 只计数现有 Timeline kill/death 并复用 side/result，complete 标记缺失正式窗口。
- Renderer：全场七项指标横向条图（默认 ADR、降序、null 最后、完整名单、当前玩家品牌色与文字标识）；离散回合击杀柱图 + 胜负/存亡/Tooltip；CT/T 两列回合数/KDA/ADR。
- null 显示 — 且无柱；KAST 与 Trade（含 tradeKills）不完整标部分证据；缺回合窗口不猜零击杀/未阵亡。Opening winRate fraction 仅显示时 ×100，Trade 保留百分比单位。
- demo1：twinkle R7 CT/win/3K、R24 T/win/4K/未阵亡、R22 T/loss/1K/阵亡；CT 12/10/10/3/68.25，T 12/15/10/1/114.50。核心 golden 和 Findings 顺序不变。
- 已验证：desktop 集成 10/10；dev/preview test:smoke 通过；全仓 typecheck 11/11、build 6/6；test:report 三场景通过（七指标、10 玩家、排序、Tooltip、Tab 往返状态、换玩家）；analytics 53/53、findings 17/17、parser 28/28。截图检查 1280×900 / 900×760 与趋势/CT/T；修复 Griffel 样式冲突并加 computedStyle 品牌色断言。
- 验证脚本：独立临时 Chromium profile 避免争用已有应用缓存，退出等待有界 30 秒。Browser plugin 未提供，使用仓库现有 Electron CDP E2E。
- 剩余验证范围：未重新构建安装包或测试安装版；降级 DTO 的 UI 分支以静态审查和集成/helper 测试覆盖，真实 DEM smoke 不触发全部降级路径。
- 边界：未修改 P3/P4 实现/契约、未新增算法、图表库、rating、heatmap、播放器、登录、历史库、扫描或 AI。

详细说明见 [桌面比赛报告](../docs/desktop-report.md)。验证通过后创建 focused commit 交接。
