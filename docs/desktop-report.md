# P5.1 桌面比赛报告 MVP

P5.1 打通了第一条可实际使用的桌面链路：

```text
选择 .dem
→ Electron Main（文件选择）
→ Utility Process（native parser → analytics → findings）
→ 可序列化 report DTO（IPC）
→ Renderer（Fluent UI v9 报告页）
```

不修改 P3 Analytics 语义与 P4 Findings 阈值，不在 Renderer 重算任何指标，不引入 AI/云端/历史库。

## 进程与数据边界

```text
Renderer (sandbox, contextIsolation, nodeIntegration=false)
  ↓ window.cs2Coach.importDemo()          preload / contextBridge
  ↓ ipcRenderer.invoke('report:import')
Main (Electron)
  ↓ dialog.showOpenDialog（仅 .dem）
  ↓ utilityProcess.fork(dist/electron/report-worker.js)
Utility Process
  ↓ @cs2-coach/dem-parser（native demoparser2）
  ↓ @cs2-coach/analytics
  ↓ @cs2-coach/findings
  ↓ { kind: 'success', report } | { kind: 'cancelled' } | { kind: 'error', message }
Main
  ↓ IPC resolve
Renderer（仅渲染 DTO，不访问 Node/fs/demoparser2）
```

- 原生解析与全部确定性计算都在 Utility Process（独立 OS 进程）中执行，200MB+ DEM 不会阻塞 Main 或 Renderer 线程。
- Main 只负责文件选择、任务互斥、进度转发与超时（10 分钟）。
- Renderer 通过 preload 暴露的最小 API 访问能力；无 `require`、无 `fs`、无 parser 依赖。
- preload 暴露面：`version`、`importDemo()`、`onProgress(listener)`；`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。

## IPC 契约（`@cs2-coach/report-contract`）

`report-contract` 是 Electron 与 Renderer 共享的 JSON-only 展示契约，只依赖 `findings` 的类型。

```ts
interface DesktopMatchReport {
  schemaVersion: 1;
  match: { id: string; fileName: string; map: string; rounds: number;
           score: { initialCT: number; initialT: number } | null };
  selectedPlayer: string;                       // 默认 twinkle，否则第一名有效玩家
  players: { id: string; nickname: string }[];
  analytics: DesktopPlayerAnalytics[];
  findings: Finding[];
  timeline: DesktopPlayerTimeline[];            // 每名有效玩家一份回合时间线（只读投影）
}

type ImportPhase = 'selecting' | 'parsing' | 'analyzing';
type ImportResult =
  | { kind: 'success'; report: DesktopMatchReport }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };
```

`DesktopPlayerAnalytics` 覆盖报告页展示的所有确定性结果：K/D/A、roundsPlayed、ADR、HS%、KAST、Trade、Opening、Utility（投掷计数、HE/fire 敌伤、flash 效果与助攻）与 Clutch list，另附 `coverage`。

`findings` 为 `DesktopFinding[]`：只在冻结的 Finding 证据上附加展示层字段 `evidence[].roundTimeSeconds`（回合内秒数），`metric/value/unit/round/tick` 与 Findings 语义完全不变。`roundTimeSeconds` 由 presenter 用真实数据计算 —— `(eventTick - roundStartTick) / tickRate` —— 缺少回合起点、事件 tick 或可靠 tick rate 时该字段缺省，UI 不猜测时间；原始 `tick` 仍保留在契约中供调试。

- `schemaVersion` 支持未来 DTO 演进。
- 不传匹配事件、`stateSnapshots`、`playerLifecycle` 或任何 native 对象；整份 DTO 可 `JSON.stringify`。
- 比分按“开局 CT 队 / 开局 T 队”归属：只有每个回合的胜方都能唯一映射回固定队伍时才输出，否则为 null（半场换边不改变队伍归属）。
- `findings` 携带全部玩家的 Findings；Renderer 按 `playerId` 过滤。每名玩家的 3 问题 + 2 亮点限额由 Findings Engine 决定，UI 不重新排序。

## 状态与错误处理

```text
idle → selecting → parsing → analyzing → success
                                     ↘ error
```

- `selecting / parsing / analyzing` 期间按钮禁用并显示 Spinner 与阶段文案。
- 取消选择回到 `idle`（已有报告时回到 `success`，保留上一次报告）。
- 损坏 DEM、缺失文件、解析异常：Utility Process 捕获后返回结构化错误，Main 透传给 Renderer，页面显示 `MessageBar` 错误并保留“重新选择 DEM”入口，不白屏。
- 同一时间只允许一个导入任务；重复请求返回“已有分析任务正在运行”。
- 导入期间关闭窗口会终止 Utility Process。
- Renderer 侧有 React Error Boundary；渲染异常时降级为错误提示与重新选择入口。

## UI 页面结构

统一使用 Fluent UI v9：主题在 `webDarkTheme` 之上覆盖中性色 token（`apps/desktop/renderer/src/theme.ts`），形成深蓝灰体系；组件只读取 token 或 `palette`，不散落固定色值。

1. **页头**：产品名 + “选择 DEM / 重新选择 DEM”主按钮。
2. **进行中**：Spinner + 阶段文案（提示大型录像可能需要数十秒）。
3. **错误**：`MessageBar`（intent=error）。
4. **空状态**：引导选择 DEM；文件只在本机处理。
5. **报告页**
   - 比赛头：地图、比分（开局 CT 队 / 开局 T 队）、回合数、文件名，以及目标玩家 `Dropdown`。
   - 玩家指标网格：K / D / A、ADR（每回合平均有效伤害）、HS%（爆头率）、KAST（回合贡献率）、Trade rate（死亡后队友补枪率）、Trade kills（补枪击杀）、Opening（首杀对决）、Clutch（残局）。Trade 卡片显示“4 / 18 次死亡后队友完成补枪”，KAST 与 Trade 附证据完整性提示。
   - 指标帮助：8 张核心卡片与道具面板标题统一提供低调的 `?` 入口（Fluent UI v9 `Tooltip`，`relationship="description"`）。触发元素是真实的 `Button`，因此 hover、点击聚焦与键盘 Tab 都能打开说明；每张卡的入口都有中文 `aria-label`（如“ADR说明”）。文案只解释既有指标含义，不改变任何口径。
   - 数字格式（仅展示层）：秒数与 ADR 两位小数、百分比一位小数（KAST 保持整数）、整数计数零位；`—` 表示证据不足。底层 evidence 数值不截断。
   - 证据告警：仅当展示的数值受不完整证据影响时显示（参与、伤害归属、回合贡献率 / 补枪 / 残局、道具计数/伤害/助攻）。
   - Findings（视觉重点，左侧宽栏）：最多 3 个问题 + 2 个亮点，显示中文严重度徽章、标题、summary 与可展开的逐条证据。证据行只做展示层中文化（中文指标名与中文单位），数据仍然是契约里的 metric / value / unit；带 `round` 的证据显示 `R4 · 回合开始后 26.63 秒`（由 `roundTimeSeconds` 计算），原始 `tick` 只在 `title` 次级提示中保留，默认不展示。
   - 回合时间线（报告底部独立 section）：每回合一行摘要（回合号 / 目标玩家阵营 / 胜负 Badge / 回合结束比分 / 查看详情），点击展开该回合关键事件，默认全部收起；Findings 的 `relatedRounds` 提供“查看 R24 / 查看相关回合”联动（展开 + 滚动 + 短暂高亮）。详见下节。
   - 道具与残局（右侧）：道具面板标题为“道具”，先按“投掷数量”逐行显示闪光弹 / 烟雾弹 / 高爆手雷 / 燃烧弹 / 燃烧瓶 / 诱饵弹（每行统一风格图标 + 中文名称 + 右对齐计数），分隔线后按“道具效果”逐行显示高爆手雷对敌伤害、燃烧伤害、敌人受闪效果、队友受闪效果、闪光助攻。道具图标来自渲染层本地彩色实心图标集 `renderer/src/utility-icons.tsx`（24px 网格、统一 22px 显示尺寸，颜色登记在 `theme.ts` 的 `palette.utility`），与界面自身的单色线性图标 `renderer/src/icons.tsx` 分开存放，道具列表不混用两套风格；图标 `aria-hidden`，含义由同一行的中文名称承担，不依赖颜色表达数据含义。面板底部保留受闪口径说明。残局面板与道具面板同样逐行对齐：`回合 / 局面 / 结果` 三列（`R24`、`1v3`），结果用 `Badge` 标签展示（成功 / 失败 / 结果未知，成功为绿色、失败为红色、未知为琥珀色，颜色只强化标签文本），不新增任何结果推断。

## 视觉体系（P5.4）

纯展示层：只改 Renderer 的主题、颜色、图标与排版，不改 Analytics / Findings / report DTO 语义。

- 主题集中在 `apps/desktop/renderer/src/theme.ts`：在 `webDarkTheme` 之上覆盖 Fluent UI 中性色 token，页面与所有 Fluent 组件（Card / Divider / Badge / Dropdown / Tooltip / MessageBar）共用同一套深蓝灰；组件只读取 token 或 `palette`，不散落固定色值。
- 背景层级：页面 `linear-gradient(180deg, #161d26 0%, #111821 100%)`，卡片 `#1d242e`，弱边框 `rgba(148, 163, 184, 0.12)`，行分隔 `rgba(148, 163, 184, 0.08)`，文字 `#e8eef6` / `#c5cfdc` / `#8f9db0`。主进程窗口底色同步为 `#111821`，启动时不再闪出黑灰底色。
- 卡片：统一 6px 圆角（`tokens.borderRadiusLarge`）、1px 弱边框、无阴影（关闭 Fluent Card 默认投影）。
- 列表节奏：道具投掷 / 道具效果 / 残局共用同一行高（34px）与分隔线；标题层级固定为 Title1（地图）→ Title2（区块）→ Subtitle1（面板）→ Caption1（说明）；正文以中性灰为主，数值右对齐并使用等宽数字。
- 颜色只做视觉锚点：6 个道具图标（闪光弹 `#4DB6FF`、烟雾弹 `#B9C7D9`、高爆手雷 `#FF5A36`、燃烧弹 `#FF8A1F`、燃烧瓶 `#FFB13B`、诱饵弹 `#57D68D`）、Findings severity 徽章、残局成功 / 失败徽章，以及主按钮等少量交互态。核心数值、卡片标题与正文保持白色 / 中性灰。
- 状态语义色（MessageBar、状态徽章）继续使用 Fluent 的状态 ramp，保证错误与告警的对比度，不参与中性色重映射。

## 回合时间线（P5.5）

报告页底部新增独立“回合时间线” section（`renderer/src/main.tsx` 的 `RoundTimeline`）：

- 每回合一行摘要：`R24 · T · 成功 · 13 : 11 · 查看详情`。点击该行展开 / 收起该回合关键事件，默认全部收起，不会一次展开 24 回合。
- 展开后逐行显示 `+109.81 秒　twinkle → 山姆烤蛋　AK-47`：时间为回合开始后的秒数，武器按展示名映射，昵称来自玩家映射；不显示 SteamID，也不显示原始 tick。
- 颜色只用于成功 / 失败 / 结果未知 Badge 与联动时的短暂高亮，正文保持中性色。

### DTO

`report-contract` 新增只读展示类型（additive，`schemaVersion` 仍为 1）：

```ts
interface DesktopTimelineEvent {
  id: string;
  type: 'kill' | 'death' | 'bomb-plant-start' | 'bomb-planted'
      | 'bomb-defuse-start' | 'bomb-defused' | 'bomb-exploded' | 'clutch-start';
  tick: number;                 // 原始 tick 仅用于追溯，UI 不展示
  roundTimeSeconds?: number;    // (tick - round.startTick) / tickRate，证据不足时缺省
  actorId?: string; actorName?: string;
  targetId?: string; targetName?: string;
  weapon?: string;
  opponents?: number;
  description: string;
}
interface DesktopRoundTimeline {
  round: number;
  side: 'CT' | 'T' | 'Unknown';
  result: 'win' | 'loss' | 'unknown';
  scoreAfter: { initialCT: number; initialT: number } | null;
  startTick: number | null;
  events: DesktopTimelineEvent[];
}
interface DesktopPlayerTimeline { playerId: string; rounds: DesktopRoundTimeline[]; }
```

`DesktopMatchReport` 增加 `timeline: DesktopPlayerTimeline[]`：每个有效玩家一份 24 回合时间线，JSON-only。切换目标玩家时 Renderer 只按 `playerId` 选用对应数组，不重新解析 DEM、不重跑 Analytics。

### 计算方式（全部为展示层投影）

- `side`：目标玩家在该回合 `freeze_end`（缺失时回退 `start`）快照中的 side，要求 `participant === true` 且已知；否则 `Unknown`。
- `result`：`round.winner` 与目标玩家 side 都已知时为 `win` / `loss`，否则 `unknown`。
- `scoreAfter`：用第 1 回合 `freeze_end` 名单把每回合胜方唯一映射回固定队伍后的累计比分；一旦某回合无法唯一映射，该回合及以后都为 `null`（与页头比分同一口径，半场换边不改变队伍归属）。
- `roundTimeSeconds`：`(eventTick - round.startTick) / tickRate`；缺 tick rate、回合起点、事件 tick 或得到负值时不输出该字段，UI 显示 `—`。
- 事件只在正式回合窗口 `[startTick, endTick]` 内取用；窗口不完整时该回合不输出事件，避免把回合结束后的事件算进来。

### 事件过滤

只展示高价值事件：目标玩家击杀、目标玩家死亡（死后击杀同样保留，不因击杀者已死亡而删除）、已证实的 clutch 形成点（直接复用 Analytics 已解析的 clutch tick 与对手数，不重写算法）与炸弹生命周期（`plant_start / planted / defuse_start / defused / exploded`）。`pickup / drop`、damage、weapon_fire、utility effect、flash victim、snapshot 一律不进入 Timeline。

### Findings → Timeline 联动

带 `relatedRounds` 的 Finding 显示“查看 R24”（单回合）或“查看相关回合”（多回合）。点击后展开对应回合、平滑滚动到第一个相关回合并短暂高亮（约 2.4 秒）。没有 `relatedRounds` 的 Finding 不显示按钮；`relatedRounds` 与 Findings 排序仍由 Findings Engine 决定，UI 不重算。

## 验证

- 真实 `demo1.dem`（267MB）经完整 Electron 链路：twinkle 25/20/4、ADR 91.375、KAST 75%、Trade 22.2%、R24 1v3 残局获胜。
- Findings 默认输出（ruleId 顺序不变）：`side-impact.ct-gap` 中文化标题“CT 方 ADR 明显低于 T 方”、`trade.low-rate`“死亡后队友补枪偏少”、`team-flash.frequent-effects`“本场多次闪到队友”、`clutch.win.r24`“R24 1v3 残局获胜”、`opening.positive`“本场首杀对决贡献突出”。
- P5.3 展示层验收：demo1 的 R4 受闪队友证据（`tick 17120`，R4 `startTick 15416`，tickRate 64）显示为“回合开始后 26.63 秒”；同一证据的原始受闪时长 4.866097927093506 秒显示为“4.87 秒”；证据行不再出现 `tick <n>`；Renderer 未新增任何 Analytics 重算。
- P5.5 展示层验收：桌面端到端 smoke 断言 24 个回合摘要、R24 摘要为 `T / 成功 / 13 : 11` 且默认收起、Finding `查看 R24` 联动展开 R24 并高亮、R24 展开包含 `进入 1v3 残局` 与炸弹安放事件且时间形如 `+109.81 秒`、展开内容不含原始 tick；手动展开 R7 为 twinkle 3K + 成功拆弹；切换到 tarkz 后 R24 变为 `CT / 失败` 且比分仍为 `13 : 11`；损坏 DEM 不渲染时间线。Node 集成测试另覆盖 DTO JSON 可序列化、昵称映射、`(tick - startTick) / tickRate`、缺 tick rate 不显示时间、窗口不完整不输出事件、未知 side/result/score 不猜测与同输入确定性。
- Tooltip 覆盖：核心 8 张指标卡 + 道具面板共 9 个 `?` 入口，桌面端到端 smoke 通过 DOM 断言其数量。
- 损坏 DEM：错误提示 + 可重新选择，不白屏。
- 测试：桌面 Node 集成测试 7/7；桌面 Electron 端到端 smoke（真实 DEM + 损坏 DEM + 非 .dem）通过；analytics、findings、dem-parser 全量通过；`pnpm typecheck`、`pnpm build`、现有 UI `test:smoke` 通过。
- 命令：`pnpm --filter @cs2-coach/desktop test`（Node 集成）、`pnpm --filter @cs2-coach/desktop test:report`（Electron 端到端）、`pnpm test:smoke`（UI/preload/构建）。
- 安装版：`pnpm --filter @cs2-coach/desktop pack:win` 产出安装包，`pnpm --filter @cs2-coach/desktop test:installed` 对安装后的应用重跑真实 demo1 与损坏 DEM 场景。

## 测试专用路径注入

Electron 端到端测试需要绕过原生文件对话框。Main 在**非打包构建**下读取 `CS2_COACH_DEM_PATH` 作为导入路径；打包应用始终使用原生对话框。Renderer 与 preload 不感知该变量。

## 打包与安装

P5.2 已把该链路做成可安装的 Windows 版本（electron-builder + NSIS，Utility Process 依赖全部打进 bundle，原生 parser 以 asar-unpacked 分发）。方案、安装包内容、路径兼容、测试 seam 与安装版 E2E 见 [Windows 打包与安装](./windows-packaging.md)。

## 剩余缺口（v0.1 日常使用之前）

- GUI 文件选择之外的便利性：无最近文件、历史比赛库、CS2 demo 目录自动扫描。
- 报告深度：无完整播放器 / 图表 / 地图热力图 / 多玩家对比；比分只按开局阵营展示，未关联队伍名。
- 大规模 DEM 的进度反馈仍是阶段级（selecting/parsing/analyzing），无百分比。
- Utility 实际致盲时长、战术价值与低影响回合仍未在 Analytics 中证实，报告如实标注而不猜测。
- Analytics/Findings 语义保持冻结；未来扩展需独立需求与迭代。

## 玩家名称展示（P5.5.1）

统一由桌面 presenter 的 `displayPlayerName` 处理名单与 Timeline 名称：去除首尾空白，缺失、空白、等于 playerId 或 15～22 位纯数字昵称显示“未知玩家”；短数字昵称（如 12345）保留。原始玩家、actor、target ID 继续保留供追溯，正文不回退到 ID。
