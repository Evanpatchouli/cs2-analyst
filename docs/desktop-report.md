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
}

type ImportPhase = 'selecting' | 'parsing' | 'analyzing';
type ImportResult =
  | { kind: 'success'; report: DesktopMatchReport }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };
```

`DesktopPlayerAnalytics` 覆盖报告页展示的所有确定性结果：K/D/A、roundsPlayed、ADR、HS%、KAST、Trade、Opening、Utility（投掷计数、HE/fire 敌伤、flash 效果与助攻）与 Clutch list，另附 `coverage`。

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

统一使用 Fluent UI v9 + `webDarkTheme`。

1. **页头**：产品名 + “选择 DEM / 重新选择 DEM”主按钮。
2. **进行中**：Spinner + 阶段文案（提示大型录像可能需要数十秒）。
3. **错误**：`MessageBar`（intent=error）。
4. **空状态**：引导选择 DEM；文件只在本机处理。
5. **报告页**
   - 比赛头：地图、比分（开局 CT 队 / 开局 T 队）、回合数、文件名，以及目标玩家 `Dropdown`。
   - 玩家指标网格：K / D / A、ADR、HS%、KAST、Trade rate、Trade kills、Opening、Clutch（KAST/Trade 附证据完整性提示）。
   - 证据告警：仅当展示的数值受不完整证据影响时显示（参与、伤害归属、KAST/Trade/Clutch、道具计数/伤害/助攻）。
   - Findings（视觉重点，左侧宽栏）：最多 3 个问题 + 2 个亮点，显示 severity 徽章、标题、summary 与可展开的逐条 evidence（metric / value / unit，event 证据附 round/tick）。
   - 道具与残局（右侧）：投掷计数、HE/燃烧敌伤、敌我受闪效果、闪光助攻，以及已证明的 Clutch 回合列表；明确标注受闪效果不等于实际致盲时长。

## 验证

- 真实 `demo1.dem`（267MB）经完整 Electron 链路：twinkle 25/20/4、ADR 91.375、KAST 75%、Trade 22.2%、R24 1v3 win。
- Findings 默认输出：CT/T 落差、trade.low-rate、team flash、R24 clutch、opening positive。
- 损坏 DEM：错误提示 + 可重新选择，不白屏。
- 测试：桌面 Node 集成测试 3/3；桌面 Electron 端到端 smoke（真实 DEM + 损坏 DEM）通过；analytics 53/53、findings 17/17、dem-parser 28/28；`pnpm typecheck`、`pnpm build`、现有 UI `test:smoke` 通过。
- 命令：`pnpm --filter @cs2-coach/desktop test`（Node 集成）、`pnpm --filter @cs2-coach/desktop test:report`（Electron 端到端）、`pnpm test:smoke`（UI/preload/构建）。

## 测试专用路径注入

Electron 端到端测试需要绕过原生文件对话框。Main 在**非打包构建**下读取 `CS2_COACH_DEM_PATH` 作为导入路径；打包应用始终使用原生对话框。Renderer 与 preload 不感知该变量。

## 剩余缺口（v0.1 日常使用之前）

- 打包与安装：目前只有 `pnpm start / electron-vite` 本地运行，尚无 Windows installer。
- GUI 文件选择之外的便利性：无最近文件、历史比赛库、CS2 demo 目录自动扫描。
- 报告深度：无 round timeline / 图表 / 地图热力图 / 多玩家对比；比分只按开局阵营展示，未关联队伍名。
- 大规模 DEM 的进度反馈仍是阶段级（selecting/parsing/analyzing），无百分比。
- Utility 实际致盲时长、战术价值与低影响回合仍未在 Analytics 中证实，报告如实标注而不猜测。
- Analytics/Findings 语义保持冻结；未来扩展需独立需求与迭代。
