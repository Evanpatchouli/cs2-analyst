# Current Task

Status: complete — P5.3 报告页可读性与说明优化 PASS

基线：`2556907`（P5.2.1 中文产品化 PASS）；本轮只做报告页展示层，不改 P3 Analytics 语义与 P4 Findings 阈值 / 排序 / ranking。

- tick → 回合内时间：`packages/report-contract` 新增展示层 `DesktopFinding` / `DesktopFindingEvidence.roundTimeSeconds`；`apps/desktop/electron/report.ts` 用真实数据 `(eventTick - roundStartTick) / tickRate` 计算，缺少回合起点 / 事件 tick / 可靠 tickRate 时字段缺省，不猜时间。Renderer 显示“R4 · 回合开始后 26.63 秒”，原始 `tick` 只保留在 `title` 次级提示。
- 数字格式（仅展示层）：秒数与 ADR 两位小数、百分比一位小数（KAST 保持整数）、整数计数零位；evidence 的 hp / hp-round / ratio / percent / seconds / count 走同一套格式化，底层数值不截断。
- Trade 文案：指标卡改为“Trade rate（死亡后队友补枪率）”+“4 / 18 次死亡后队友完成补枪”，Tooltip 补充“死亡时仍有队友存活：18 / 其中 5 秒内队友击杀该敌人：4”；不再出现“可交易死亡 / 被交易 / 及时回收”。算法、5 秒窗口、thresholds、ranking 均未动。
- 道具面板：标题“道具”，先“投掷数量”6 项逐行（图标 + 中文名 + 右对齐计数），分隔线后“道具效果”5 项逐行；图标来自新增 `renderer/src/icons.tsx` 本地统一图标集（20px 网格、单色 `currentColor` 描边，不混用其他图标源）。
- 残局面板：改为“回合 / 局面 / 结果”三列对齐列表（`R24` / `1v3`），结果用 `Badge` 标签展示（成功 / 失败 / 结果未知），不新增结果推断。
- Tooltip：8 张核心指标卡 + 道具面板共 9 个 Fluent UI v9 `?` 入口（`Tooltip relationship="description"` + 可聚焦 `Button` + 中文 `aria-label`），文案只解释既有口径。
- 验证：`pnpm typecheck`、`pnpm build`、desktop Node 集成 3/3（新增 round-time 断言）、desktop `test:report`（新增 9 个 Tooltip 入口 DOM 断言与“无 `tick <n>`”断言）、`pnpm test:smoke`、analytics 53/53、findings 17/17、dem-parser 28/28 全 PASS；twinkle demo1 数值与 Findings ruleId 顺序不变。
- 非目标保持：不改 Analytics 算法、Findings 阈值 / ranking、不加“惜败”、不加 timeline / 图表 / 历史 / 自动扫描 / AI、无 installer 架构调整、无大范围 UI 重构。
- focused commit 后交接；展示层细节与验收见 [桌面比赛报告](../docs/desktop-report.md)。
