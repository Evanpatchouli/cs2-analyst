# Agent Handoff

## 2026-10-07 — P5.6.1 玩家名称展示修复 PASS

- 统一规则：nickname 有值且 trim 后非空时原样保留；仅缺失/null/空白显示“未知玩家”。长数字、等于 playerId、首尾空白不改写；DTO 身份 ID 保留。统一覆盖 report.players、Timeline actorName/targetName、Analysis Views、Dropdown；过长文本仅 CSS 省略 + Fluent Tooltip 全文。
- 测试删除数字昵称隐藏断言，新增长数字/同 ID/首尾空白保留和缺失/null/空白回退，验证 DTO 名称与原始 ID；真实 DEM UI smoke 检查 Timeline、Analysis 与 Dropdown 长数字昵称。
- 验证全 PASS：pnpm typecheck（11/11）、pnpm build（6/6）、desktop test（10/10）、test:report（真实/损坏/非 DEM）、pnpm test:smoke（dev/preview）、pack:win、pack:win:test、test:installed。
- 最终生产与测试 seam 安装包均约 107.3 MB。安装版实际安装/启动/卸载通过；ASAR 1.40 MB / 10 条目、原生绑定 unpacked、renderer 无 Node、生产路径注入防护、demo1 golden、Analysis Views 与 Tab 状态保留、长数字昵称、损坏 DEM、中途关闭无残留 worker均通过。
- 仅桌面 presentation、测试与文档改动；Analytics / Findings / Analysis 逻辑与 UI 布局不变。版本 0.1.0、Windows x64 only；安装包在 ignored release/.tmp，不进入 Git。

## 2026-10-07 — P5.5.1 与 P5.6 Analysis Views MVP PASS

- 基线 `7f6c130`；P5.5.1 focused commit `0225332`：统一 displayPlayerName，缺失/空白/等于 ID/15～22 位数字名显示未知玩家，短数字昵称保留；名单、Timeline、Analysis 名称统一，原始 ID 保留。8/8 集成与真实桌面 smoke 通过。
- P5.6：共享比赛头/目标玩家/重新导入按钮下新增 Fluent UI v9 TabList/Tab，默认比赛报告；analysis panel 与 report panel 保持挂载（hidden 切换），不触发导入或 Analytics，不丢 Timeline/Findings 状态。
- DTO additive `analysis`（schemaVersion 1）：players 直接投影冻结 PlayerMetrics，perPlayer 的 sideSplit 直接投影 frozen SideMetrics；roundTrend 只统计既有 Timeline kill/death，复用 side/result。complete 标记缺失正式窗口，UI 不把窗口空缺当成已证实零值。全部 JSON-only，无 raw MatchEvent 传 Renderer。
- 分析页：全场七项指标横向条图（完整名单、降序/null 最后、精确格式、Tooltip、当前玩家品牌色与文字）；离散回合击杀柱图（胜负/存亡标签、键盘 Tooltip）；CT/T 两列 Rounds/KDA/ADR。CSS 图表无新增依赖；null 为 — 且无柱；KAST/Trade/tradeKills incomplete 显示部分证据。Opening 原始 fraction 只在显示时 ×100；Trade 原始 percentage 不再乘 100。
- demo1 golden：twinkle R7 CT/win/3K，R24 T/win/4K/未阵亡，R22 T/loss/1K/阵亡；CT 12 rounds、10/10/3、68.25 ADR，T 12 rounds、15/10/1、114.50 ADR。补枪击杀为 6、死亡后队友补枪为 4；核心数据与 Findings ruleId 顺序不变。
- 验证 PASS：desktop 集成 10/10；全仓 typecheck 11/11、build 6/6；test:report 真实/损坏/非 DEM 三场景（10 玩家/七指标/排序/Tooltip/Tab 往返状态/换玩家/品牌色 computedStyle）；dev/preview test:smoke；analytics 53/53、findings 17/17、dem-parser 28/28；独立审查两次无阻塞问题。
- 截图检查 1280×900、900×760 与趋势/CT/T；发现并修正 Griffel class 冲突（mergeClasses）使当前玩家柱品牌色生效。截图在系统临时目录，不提交。Browser plugin 未提供，沿用仓库 Electron CDP 验证。测试采用独立临时 Chromium profile 避免缓存争用，退出等待有界 30 秒。
- 文档同步 desktop-report/architecture/roadmap/current-task。未修改 P3/P4 算法、公有契约、阈值或 evidence；版本保持 0.1.0，Windows x64 only。
- 剩余范围：本轮未重新打包或验证安装版；全部降级 UI 状态未由真实 DEM 触发，null/incomplete/缺窗口由集成/helper 测试与静态审查覆盖。未实现新算法、热力图、完整播放器、登录、历史、扫描或 AI。


## 2026-10-07 — P5.5 Round Timeline MVP PASS

- 基线 `642fd0d`（P5.4 视觉优化 PASS）。本轮只在 Desktop presenter 与 Renderer 展示层新增只读 Round Timeline：不改 P3 Analytics 语义 / 契约、P4 Findings 阈值 / 排序 / ruleId / evidence、demo1 数值、Trade / Clutch / tick 逻辑，也不重新解析 DEM 或重跑 Analytics；未引入图表、播放器、登录、apps/api、历史库、自动扫描或 AI。
- DTO（`packages/report-contract`，additive，`schemaVersion` 仍为 1，顶层新增 `timeline`）：`DesktopTimelineEvent { id, type, tick, roundTimeSeconds?, actorId?, actorName?, targetId?, targetName?, weapon?, opponents?, description }`、`DesktopRoundTimeline { round, side, result, scoreAfter, startTick, events }`、`DesktopPlayerTimeline { playerId, rounds }`。`tick` 仅追溯，Renderer 不渲染。
- Presenter（`apps/desktop/electron/report.ts`）：新增 `roundClock`（(tick - round.startTick) / tickRate，缺 tick rate / start / tick 或负值返回 undefined）、`roundScoreLookup`（把每回合胜方用第 1 回合 freeze_end 名单映射回固定队伍的累计比分；一旦无法唯一映射，该回合及以后为 null）、`playerSide`（freeze_end 优先、start 回退，要求 participant===true 且 side 已知）、`buildRoundEvents`、`buildTimeline`。原 `teamScore` 重构为 `roundScoreLookup` 的最后一项，页头比分口径与数值不变。Finding 证据的 `roundTimeSeconds` 复用同一 `roundClock`。
- 事件过滤：目标玩家击杀、目标玩家死亡（死后击杀保留，不因击杀者已死亡而删除）、已证实 clutch start（直接读 Analytics `clutch.list[].tick / opponents`，不重写算法）、炸弹生命周期 `plant_start / planted / defuse_start / defused / exploded`。排除 `pickup / drop`、damage、weapon_fire、utility effect、flash victim、snapshot；只在正式窗口 `[startTick, endTick]` 内取事件，窗口不完整则该回合无事件。同 tick 按 kill → death → clutch → bomb 稳定排序，`id = round:type:tick:actor:target`。
- Renderer（`renderer/src/main.tsx`）：报告底部新增 `RoundTimeline` section（`id="round-timeline"`），每回合一行 `R24 / T / 成功 / 13 : 11 / 查看详情`，点击展开逐行 `+109.81 秒　twinkle → 山姆烤蛋　AK-47`，默认全部收起。新增展示 helper `weaponLabels / weaponLabel`（ak47→AK-47、m4a1_silencer→M4A1-S、inferno→燃烧伤害等）、`sideText / scoreAfterText / roundResult / eventTime`；颜色仍只用于 Badge 与联动高亮（中性 `palette.raised`，无新色值）。
- Findings 联动：带 `relatedRounds` 的 Finding 显示“查看 R24”（单回合）或“查看相关回合”（多回合，如 `team-flash.frequent-effects` 的 7 个回合）；点击 `setExpanded` + `scrollIntoView({ behavior:'smooth', block:'center' })` + 2.4 秒高亮（`data-highlighted="true"`）。无 `relatedRounds` 不显示按钮。切换目标玩家只按 `playerId` 选用 `report.timeline` 中对应数组，不重新导入 / 重跑。
- 实测 demo1（`.demo/match.json` + 真实 Electron 端到端）：R24 = T / 成功 / 13 : 11，事件按 tick 为 `+47.44 kill twinkle→888…`、`+58.72 进入 1v3 残局`、`+109.81 kill twinkle→山姆烤蛋（燃烧伤害）`、`+117.70 开始安放炸弹`、`+120.83 炸弹安放完成`、`+122.20 kill twinkle→tarkz`、`+142.38 kill twinkle→Makoto Nijima`；R7 = CT / 成功，`+62.70 / +64.95 / +86.20` 三次 twinkle 击杀 + `+89.19 开始拆弹` + `+99.19 炸弹拆除成功`；R22 = T / 失败，`+31.56 twinkle→tarkz` 与 `+32.78 tarkz→twinkle`（tarkz 于 tick 121075 死后 121153 的合法 posthumous kill，保留）；比分逐回合累计 `R1 0:1 … R24 13:11`，与页头一致。
- 验证：`pnpm typecheck` 11/11、`pnpm build` 6/6；`pnpm --filter @cs2-coach/desktop test` 7/7（新增：DTO 顶层键 + JSON-only、昵称映射、`(138685-131657)/64` 时间、过滤只允许 8 类事件、R7 3K、R22 posthumous、缺 tickRate 无时间、窗口不完整无事件、全 Unknown 不猜测、同输入 deterministic）；`test:report` 通过（新增 DOM 断言：24 摘要、R24 `T/成功/13 : 11`、默认收起、`查看 R24` 展开 + 高亮、`进入 1v3 残局`、`+xx.xx 秒`、正文无 tick、R7 3K、切换到 tarkz 后 `CT/失败`、损坏 DEM 无时间线）；analytics 53/53、findings 17/17、dem-parser 28/28；`pnpm test:smoke`；重新 `pack:win` + `pack:win:test` 后 `test:installed` 通过。
- demo1 golden 与 Findings 完全不变：twinkle 25/20/4、ADR 91.38、KAST 75%、Trade 22.2%、R24 1v3 胜、5 条 ruleId 顺序 `side-impact.ct-gap / trade.low-rate / team-flash.frequent-effects / clutch.win.r24 / opening.positive`。
- 文档：`docs/roadmap.md` 新增 P5.5 PASS 与 “Future — Account & Match History”（apps/api = Auth / Session + 历史摘要；服务端不上传 / 不解析 DEM；Auto DEM discovery / directory scanning: NOT PLANNED）；`docs/desktop-report.md` 新增“回合时间线（P5.5）”；`docs/architecture.md` 补 timeline 投影与 future boundary；`current-task.md` 同步。本 work unit focused commit 后交接。

## 2026-10-07 — P5.4 报告页视觉优化（彩色实心道具图标 + 深蓝灰体系）PASS

- 基线 `360c84f`（P5.3 PASS）。本轮是纯 presentation polish：只改 Renderer 主题 / 图标 / 排版与主进程窗口底色，不改 P3 Analytics 语义、P4 Findings 阈值 / 排序 / ruleId / evidence、Trade / Clutch / tick / time 逻辑、report DTO 数据字段；未引入 Emoji、玻璃拟态、强阴影、RGB 灯效或大面积彩色卡片，installer 架构未动。
- 主题：新增 `apps/desktop/renderer/src/theme.ts`。`coachTheme` 在 `webDarkTheme` 之上覆盖中性色 token —— 卡片 `colorNeutralBackground1 = #1d242e`、页底 `Background2 = #111821`、抬升面 `Background3/4 = #232c38`、`Stroke1/2/3 = rgba(148,163,184,0.22/0.12/0.08)`、`Foreground1/2/3/4 = #e8eef6 / #c5cfdc / #8f9db0 / #7b8a9d`；品牌与状态 ramp 不动，保证 MessageBar 与徽章对比度。页面主背景 `linear-gradient(180deg, #161d26 0%, #111821 100%)`。组件只读 `tokens.*` 或 `palette.*`，固定色值只登记在 theme.ts。
- 主进程：`electron/main.ts` 窗口 `backgroundColor` 由 `#202020` 改为 `#111821`，启动不再闪出黑灰底色。
- 道具图标：新增 `apps/desktop/renderer/src/utility-icons.tsx`，6 个彩色实心内联 SVG React 组件（24px 网格、22px 显示、`aria-hidden`、不新增 accessible name）：闪光弹 `#4DB6FF`、烟雾弹 `#B9C7D9`、高爆手雷 `#FF5A36`、燃烧弹 `#FF8A1F`、燃烧瓶 `#FFB13B`、诱饵弹 `#57D68D`，颜色登记在 `palette.utility`。`icons.tsx` 删除 6 个单色线性道具图标、只保留界面自身的 `?` 帮助图标；两套风格分文件存放，道具面板不再混用。未新增依赖，未新增 .svg 资源文件（图形内联为组件，避免几何数据双份维护）。
- 一致性：`cardSurface` 固定所有卡片 `backgroundColor` / `1px` 弱边框 / `tokens.borderRadiusLarge`(6px) / `boxShadow: none`；道具投掷 / 道具效果 / 残局共用 `row` 基类（34px 行高、`palette.rowDivider` 分隔、`:last-child` 去掉末行分隔）；标题层级 Title1（地图）→ Title2（区块）→ Subtitle1（面板）→ Caption1（说明）；数值列右对齐 + `tabular-nums` 保持白色，名称列改用 `colorNeutralForeground2`，evidence 指标名走 muted。
- 颜色只做锚点：道具图标、Findings severity 徽章、残局结果徽章、主按钮与少量 hover/focus 态。`clutchResult()` 的“失败”由 `informative` 改为 `danger`（仅展示颜色；标签文案、Clutch 数据与判定未动）。
- 实测（真实 demo1.dem，Electron 端到端 + CDP 计算样式）：页面背景 `rgb(17,24,33)` + 渐变（旧 `rgb(31,31,31)`）；卡片 `rgb(29,36,46)` + `1px solid rgba(148,163,184,0.12)` + 6px 圆角 + `box-shadow: none`（旧 `rgb(41,41,41)` / 4px / 双层阴影）；6 个道具图标渲染为 22×22，fill 依次为 `#4DB6FF / #B9C7D9 / #FF5A36 / #FF8A1F / #FFB13B / #57D68D`，每项独占一行、图标左 / 名称中 / 数值右仍对齐。
- 验证：`pnpm typecheck` 11/11、`pnpm build` 6/6；`pnpm --filter @cs2-coach/desktop test` 3/3；`test:report`（真实 / 损坏 / 非 .dem）通过；`pnpm test:smoke`（dev + preview）通过；重新执行 `pack:win` + `pack:win:test` 后 `test:installed` 全通过（生产安装版不含 seam、测试 seam 安装版 demo1 报告与开发环境一致、无残留 worker、损坏 DEM 不白屏、卸载成功）。安装包仍为 `release/0.1.0/CS2-Coach-Setup-0.1.0.exe`（107.3 MB）。
- demo1 golden 与 Findings 完全不变：twinkle 25/20/4、ADR 91.38、KAST 75%、Trade 22.2%、R24 1v3 胜、5 条 Findings ruleId 顺序 `side-impact.ct-gap / trade.low-rate / team-flash.frequent-effects / clutch.win.r24 / opening.positive`；本轮未改任何数据来源、断言或 Tooltip 文案。
- 文档：`docs/desktop-report.md` 新增“视觉体系（P5.4）”一节并同步图标 / 主题描述；`current-task.md` 同步。本 work unit focused commit 后交接。

## 2026-10-07 — P5.3 报告页可读性与说明优化 PASS

- 基线 `2556907`（P5.2.1 PASS）。本轮只改 Renderer / presenter 展示层与 report DTO 的展示字段：不改 P3 Analytics 算法、P4 Findings 阈值 / 排序 / evidence 结构、Trade 5 秒窗口，未引入“惜败”、timeline、图表、历史库、自动扫描、AI 或 installer 变更。
- tick → 回合内时间：`packages/report-contract` 新增 `DesktopFinding` 与 `DesktopFindingEvidence.roundTimeSeconds`（additive，`schemaVersion` 仍为 1，顶层 DTO 键不变）；`packages/report-contract` 只依赖 `findings` 类型不变。`apps/desktop/electron/report.ts` 的 `roundTimeLookup()` 用真实 `match.tickRate` 与 `round.startTick` 计算 `(eventTick - roundStartTick) / tickRate`，`withRoundTime()` 只复制 finding 并附加该字段；缺回合起点 / 事件 tick / 可靠 tickRate 或得到负值时字段缺省，UI 不猜测。Renderer 不再显示原始 tick，改为 `R4 · 回合开始后 26.63 秒`，原始 tick 仅保留在证据行的 `title` 次级提示。
- 数字格式：`decimal / count / percent / seconds / points` 一套展示层 helper —— 秒数与 ADR 两位小数、百分比一位小数（KAST 保持整数）、整数计数零位，`—` 表示证据不足；evidence 的 `hp / hp/round / ratio / percent / seconds / count` 全部走同一套规则，底层 evidence 数值不截断（4.866097927093506 秒 → 4.87 秒）。
- Trade 文案：指标卡显示“Trade rate（死亡后队友补枪率）”+“4 / 18 次死亡后队友完成补枪”，Tooltip 追加上下文“死亡时仍有队友存活：18 / 其中 5 秒内队友击杀该敌人：4”；旧术语“可交易死亡 / 被交易 / 及时回收”不再出现。Findings 的 `trade.low-rate` title/summary、ruleId、evidence 数值与顺序未改。
- 道具面板：标题“道具”，分“投掷数量”（闪光弹 / 烟雾弹 / 高爆手雷 / 燃烧弹 / 燃烧瓶 / 诱饵弹，逐行 图标 + 中文名 + 右对齐计数）与“道具效果”（高爆手雷对敌伤害 / 燃烧伤害 / 敌人受闪效果 / 队友受闪效果 / 闪光助攻）两组，行高 / 间距一致，底部保留受闪口径说明；不再出现 Utility / HE / Flash / duration 等实现术语。
- 残局面板：与道具面板同一套列表样式，`回合 / 局面 / 结果` 三列对齐（`R1` / `1v3`），结果用 `Badge` 标签（成功 / 失败 / 结果未知），数据与判定未改。
- 图标：新增 `apps/desktop/renderer/src/icons.tsx`，单一风格本地图标集（20px 网格、单色 `currentColor` 描边、统一线宽）；项目未新增 icon 依赖，避免混用不同图标源。
- Tooltip：`InfoTip` 用 Fluent UI v9 `Tooltip`（`relationship="description"`、`withArrow`）包裹真实 `Button`，hover / 点击聚焦 / Tab 均可访问，每个入口带中文 `aria-label`（如“ADR说明”“道具面板说明”）；覆盖 K/D/A、ADR、HS%、KAST、Trade rate、Trade kills、Opening、Clutch 八张卡片与道具面板，共 9 个入口。
- 验证：`pnpm typecheck` 11/11、`pnpm build`、analytics 53/53、findings 17/17、dem-parser 28/28、desktop Node 集成 3/3（新增 round-time 断言：所有带 round+tick 的证据都有有限非负秒数且小于 `tick / 64`，R4 tick 17120 等于 `(17120 - 15416) / 64`）、desktop `test:report`（真实 / 损坏 / 非 .dem，新增 9 个 Tooltip 入口 DOM 断言与“正文不含 `tick <n>`”断言）、`pnpm test:smoke`（dev + preview）全 PASS。
- demo1 golden 不变：twinkle 25/20/4、ADR 91.38、KAST 75%、Trade 22.2%、R24 1v3 胜、5 条 Findings ruleId 顺序 `side-impact.ct-gap / trade.low-rate / team-flash.frequent-effects / clutch.win.r24 / opening.positive`；R4 受闪证据显示“回合开始后 26.63 秒”（真实 R4 `startTick` 15416、tickRate 64；任务描述中的 18.42 秒只是示意值，未采用）。
- 本 work unit focused commit 后交接；下一工作按用户新需求确定。

## 2026-10-07 — P5.2.1 Product Polish PASS

- 基线 `58a7abd`（P5.2 PASS）。本轮只做发布目录规范 + 中文产品化文案：不改 Analytics、不改 Findings 阈值/排序/契约、不改 UI 结构与功能，未引入新规则、timeline、历史、自动扫描或 AI。
- 发布目录：`build-installer.mjs` 把生产安装包复制到项目根 `release/<version>/`（版本取自 `apps/desktop/package.json`，当前 `release/0.1.0/CS2-Coach-Setup-0.1.0.exe`），测试 seam 产物改投 `.tmp/test-output/<version>/`，两者不再共用 `apps/desktop/release`。`installed-app-smoke.mjs` 的产物路径、`.gitignore` 注释与文档同步。
- Windows-only：roadmap / architecture / windows-packaging 三处明确 **Supported platform: Windows x64 only**；`prepare-pack.mjs` 删除 TRIPLES 映射，固定 `win32-x64-msvc`，非 win32-x64 抛错。不再把 macOS/Linux 当未来默认目标。
- UI 术语：展示层加中文解释（HS%（爆头率）、KAST（回合贡献率）、Trade rate（死亡后队友补枪率）、Trade kills（补枪击杀）、Opening（首杀对决）、Clutch（残局）），ADR hint 改为“每回合平均有效伤害”，严重度徽章改为 高/中/低/亮点。底层字段名与 API 未变。
- 道具区：`Utility → 道具`、`Flash/Smoke/HE/Incendiary/Molotov/Decoy → 闪光弹/烟雾弹/高爆手雷/燃烧弹/燃烧瓶/诱饵弹`、`HE 敌伤/燃烧敌伤 → 高爆手雷对敌伤害/燃烧伤害`（单位改“点”）、受闪说明改为不含 `duration` 的自然中文；残局面板标题改“残局”，`win/loss → 成功/失败`，未加“惜败”。
- Trade 文案：指标卡不再显示“可交易死亡”，改为“死亡时仍有队友存活：18 / 队友成功补枪：4”；`trade.low-rate` 标题改为“死亡后队友补枪偏少”，summary 采用“N 次死亡时仍有存活队友、其中 M 次在 5 秒内完成补枪、补枪率 X%……存活并不代表具备补枪位置，该指标用于发现值得复盘的回合”。
- Findings 文案：只改 title/summary —— `side-impact.*` → “X 方 ADR 明显低于 Y 方”，utility 伤害/闪光与 team-flash 去掉 HE/燃烧直译、`duration`、`非零` 等；`ruleId`、`findingThresholds`、排序、evidence 结构与数值全部不变（findings 测试与 demo1 golden 未改一行断言）。
- Findings 证据展示层：新增 metric 路径 → 中文指标名、unit → 中文单位（flag→是/否、ratio/percent→%）的映射，仅影响渲染，contract 未变。
- 覆盖告警：`report.ts` coverage notes 去掉 `ADR` / `KAST / Trade / Clutch` 直译。
- 验证：`pnpm typecheck`、`pnpm build`、analytics 53/53、findings 17/17、dem-parser 28/28、desktop Node 集成 3/3、desktop `test:report`（真实/损坏/非 .dem）、`pnpm test:smoke`（dev+preview）、installed-app smoke（安装 → demo1 报告 → 无残留 worker → 损坏 DEM → 卸载）全 PASS。
- 实测：安装包 `release/0.1.0/CS2-Coach-Setup-0.1.0.exe`（107.3 MB）、测试 seam `.tmp/test-output/0.1.0/CS2-Coach-TestSeam-Setup-0.1.0.exe`；安装版 twinkle 25/20/4、ADR 91.38、KAST 75%、Trade 22.2%、R24 1v3 win、5 条 Findings 与开发环境一致。
- 本 work unit focused commit 后交接；下一工作按用户新需求确定。

## 2026-10-07 — P5.2 Windows Packaging & Installable MVP PASS

- 基线 `58b0dc0`（P5.1 PASS）。本轮不改 P3 Analytics 语义、P4 Findings 阈值与 P5.1 报告 UI/DTO；未引入签名、自动更新、GitHub Release、CI 发布、macOS/Linux。
- 打包方案：electron-builder 26 + NSIS（`apps/desktop/electron-builder.config.cjs`）。Windows x64、per-user、`oneClick:false` 可选安装目录、桌面 + 开始菜单快捷方式、独立卸载器；`productName: CS2 Coach`、版本沿用 `0.1.0`、appId `com.evanpatchouli.cs2coach`；复用工作区 Electron 运行时（`electronDist`）。
- 产物：`apps/desktop/release/CS2-Coach-Setup-0.1.0.exe`（107.3 MB）与 `apps/desktop/release/test-seam/CS2-Coach-TestSeam-Setup-0.1.0.exe`。打包在系统临时目录完成再复制安装包：工作区文件 watcher 会占用新建的 `app.asar`，导致 electron-builder 无法重置输出目录（`EBUSY: unlink app.asar`）。
- worker 依赖：`electron.vite.config.ts` 以 `CS2_COACH_PACK` 区分构建形态。打包构建 `externalizeDeps = { exclude: 5 个 workspace 包, include: [@laihoe/demoparser2, @laihoe/demoparser2-win32-x64-msvc] }`，把 workspace 包 inline 成 75 kB 的 `report-worker.js`；非打包构建仍 external，保证 `pnpm dev` / `start` / `test:report` 从 workspace symlink 解析（原生包并未链接到 `apps/desktop`，全量 inline 会让 dev 解析失败）。`scripts/prepare-pack.mjs` 把 loader 包与平台原生包复制到 `dist/electron/node_modules`（与 worker 同级，Node 向上解析命中同一 fallback 路径），electron-builder `asarUnpack: ["**/*.node"]` 把 3.9 MB `.node` 落到 `resources/app.asar.unpacked`。
- 路径：`main.js` 中 report-worker / preload / renderer 全部用 `import.meta.url` 相对解析，worker 的原生依赖用 Node 模块解析；无开发目录硬编码，兼容 `app.isPackaged === true`。构建期校验（`build-installer.mjs`）：worker 不得再 external 引用 workspace 包、必须引用原生 parser、生产 `main.js` 不得含 seam 变量。
- 注入防护：`CS2_COACH_DEM_PATH` 仅非打包构建生效；打包 seam `CS2_COACH_TEST_DEM_PATH` 只在 `CS2_COACH_TEST_SEAM=1` 的测试构建中编译，生产构建里 `__CS2_COACH_TEST_SEAM__` 被 define 成 false 并由 Rollup 消除。安装版实测：带两个环境变量启动并点击“选择 DEM”后 15 秒内不自动出报告。
- 安装版 E2E `scripts/installed-app-smoke.mjs`（`pnpm --filter @cs2-coach/desktop test:installed`）：asar 只含 `dist/**` 与 `package.json`（1.26 MB / 10 条目）；renderer bundle 不含 Node/原生 parser；原生绑定 unpacked 3.9 MB；启动 → preload → 无 `window.require`/`window.process` → 关闭退出码 0；demo1 报告与开发环境一致（twinkle 25/20/4、ADR 91.38、KAST 75%、Trade 22.2%、R24 1v3 win、5 条 Findings、13 : 11）；分析中途关闭窗口无残留 `CS2 Coach.exe`（含 Utility Process）；损坏 DEM 报错且保留“重新选择 DEM”，不白屏；生产版与测试 seam 版均可静默卸载。
- 验证：`pnpm typecheck`、`pnpm build`、analytics 53/53、findings 17/17、dem-parser 28/28、desktop Node 集成 3/3、desktop `test:report`（真实/损坏/非 .dem）、`pnpm test:smoke`（dev + preview）、installed-app smoke 全 PASS。
- 已知限制：安装包未签名，可能触发 SmartScreen；只构建并验证 Windows x64；`disableAsarIntegrity: true`（ASAR integrity 重写会在 exe 刚复制完成时重写约 234 MB，与杀毒扫描竞争而间歇失败；Electron 仅在启用对应 fuse 时校验）；打包中间产物留在系统临时目录。
- 文档：新增 `docs/windows-packaging.md`；同步 roadmap、architecture、development、desktop-report、current-task、handoff。本 work unit focused commit 后交接；下一工作按用户新需求确定。

## 2026-10-07 — P5.1 End-to-End Desktop Report MVP PASS

- 基线 `f9f9c58e`（P4.1 Findings PASS）。本轮不改 P3 Analytics 语义、不改 P4 Findings 阈值、不在 Renderer 重算指标、不猜 coaching 结论；未引入 AI/云端/登录/历史库/图表/热力图/installer。
- 新包 `packages/report-contract`：Electron 与 Renderer 共享的 JSON-only 展示契约，只依赖 `@cs2-coach/findings` 类型。`DesktopMatchReport { schemaVersion, match, selectedPlayer, players, analytics, findings }`；`ImportResult` 为 success/cancelled/error 判别联合；`DesktopApi` 只含 `version/importDemo/onProgress`。
- 进程边界：Main 用 `dialog.showOpenDialog` 只选 `.dem`，`utilityProcess.fork(dist/electron/report-worker.js)` 运行 native demoparser2 → analytics → findings → DTO；10 分钟超时、单任务互斥、窗口关闭终止 worker。Renderer 在 `contextIsolation:true / nodeIntegration:false / sandbox:true` 下只经 preload/contextBridge 调用 IPC，不接触 Node/fs/demoparser2。
- DTO 构造 `apps/desktop/electron/report.ts`：`analyzeDemoFile(filePath, onParsed?)` = parse + `buildDesktopReport`，错误返回结构化 message 而非抛出；`teamScore` 只在每个回合胜方能唯一映射回固定队伍时输出“开局 CT 队 / 开局 T 队”比分，否则 null。Utility coverage 告警只针对影响展示数值的不完整证据（计数/伤害/助攻），未证实的 flash 时长由 Utility 卡片 caption 承担。
- Renderer：Fluent UI v9 `webDarkTheme` 单页报告。页头（选择/重新选择 DEM）→ 进行中 Spinner → 错误 MessageBar → 空状态 → 报告（地图/比分/回合/文件名 + 目标玩家 Dropdown；K/D/A、ADR、HS%、KAST、Trade rate、Trade kills、Opening、Clutch；Findings 左栏最多 3 问题 + 2 亮点、severity 徽章、可展开证据；右栏 Utility 与 Clutch list）。状态机 idle/selecting/parsing/analyzing/success/error，React Error Boundary 兜底，取消/错误均保留上一次成功报告且不白屏。
- 测试seam：非打包构建下 Main 读取 `CS2_COACH_DEM_PATH` 绕过原生对话框（打包应用始终用对话框），仅用于 Electron 端到端 smoke；Renderer/preload 不感知。
- 实测 demo1.dem（267MB，de_dust2，24 回合，13:11）：twinkle 25/20/4、ADR 91.375、KAST 18/24=75%、Trade 4/18=22.222%、Opening 4/0、R24 1v3 win；默认 Findings 顺序 side-impact.ct-gap / trade.low-rate / team-flash.frequent-effects / clutch.win.r24 / opening.positive。损坏 DEM 返回“无法分析此 DEM…”，页面显示错误且保留“重新选择 DEM”。
- 验证：desktop Node 集成 `test` 3/3；`test:report` Electron 端到端 smoke（真实 + 损坏 DEM）通过；analytics 53/53、findings 17/17、dem-parser 28/28；`pnpm typecheck` 11/11、`pnpm build --force` 6/6、现有 UI `pnpm test:smoke` 通过。
- 文档：新增 docs/desktop-report.md；同步 roadmap（P5.1 PASS）、architecture（report-contract + 进程模型）、development（桌面测试命令）、current-task、handoff。
- v0.1 日常使用仍缺：Windows installer/打包、最近文件与历史库、百分比进度、round timeline/图表/热力图/多玩家对比、队伍名归属，以及 Analytics 未证实的 flash 实际时长与战术价值。本 work unit focused commit 后交接；下一工作按用户新需求确定。

## 2026-10-07 — P4.1 Findings MVP PASS

- 基线 `6e04f91c`（P3 FINAL PASS）。生产仅 `packages/findings`，依赖冻结 Analytics 公共类型；P3 Analytics/parser/domain 源码与契约未变，无 AI/UI/economy/positioning。
- 新入口 `generateFindings(MatchAnalytics, playerId?)` 返回 Finding[]；schema 含稳定 id/ruleId/playerId/category/severity/title/summary/typed evidence/relatedRounds?/confidence。
- 六类：CT/T ADR gap、trade low rate、opening positive/negative、utility direct damage + proven flash support、team flash positive-duration victim effects、single clutch-win highlight。所有阈值、最小样本与 complete/null 门控见 `docs/findings-engine.md`。
- 排序限额逐玩家：问题按 severity/category/ruleId 最多3；positive clutch（对手数降序、回合升序）→opening→utility 最多2。确定性不受玩家/effect/list 数组顺序影响，保留同 tick/victim 原始 flash 重复行，duration 消歧。
- twinkle 默认：CT ADR68.25 vs T114.50（各12回合）；traded4/tradeable18=22.2%（5秒、complete）；23 throws/10非零队友效果；R24 tick135415 T1v3 win；opening4/0。utility150/21=7.14直接敌伤低收益候选因ranking未突出。
- 跳过 low-impact/consistency：冻结 MatchAnalytics 无逐玩家回合通用 combat evidence。actual flash duration、逐投掷利用率、封路/拖延及补枪位置责任亦无足够证据；不回改 P3。
- 验证：findings17/17、analytics53/53、dem-parser28/28，真实 demo 均执行、0 skipped；pnpm typecheck / build PASS。独立审查修正同 tick/victim duration tie-break 并加回归。
- 文档：Findings/analysis-rules/architecture/roadmap/current-task/handoff 同步；analytics-metrics 已清理过时 Utility advanced 残留。
- 本 work unit 验证后 focused commit；下一工作应按用户新需求确定，不自动进入 UI/AI 或大规则系统。

## 2026-10-06 — P3 Analytics Final Acceptance PASS（contracts frozen for P4）

- 基线 `1d6666b`。本轮只做 `packages/analytics` 的最终一致性验收与真实 bug 修复：未进入 P4 Findings，未加新 Analytics 功能、CT/T 拆分、地图/位置分析、parser/domain 变更、UI/AI 或大重构。
- **真实 bug 1 — trade 1:1 只在参与状态一致时成立**：`resolveRoundTrades()` 的 trade 只依赖 roster 存活基线，而 `summarizeTrade()` 按玩家 `playsIn()` 过滤；当某回合 trader 与 `tradedVictim` 的 `participant` 不一致时，trade kill 与 traded death 会单向计数。修复：trade 要求双方都确认参与，`tradeableDeaths` 同样只登记确认参与的死亡，`Σ tradeKills === Σ tradedDeaths` 由结构保证。新增 regression（参与不一致 + 正常对照）。
- **真实 bug 2 — 降级名单仍发布 complete trade rate**：`timeline.degraded`（freeze_end 不可用回退 start）时，Trade 仍 `complete = true`、`tradeRate` 为数值，与 KAST `complete = false`、文档“KAST/Trade 以 degraded 计数”矛盾，违反“coverage 不完整不得伪装完整结论”。修复：`RoundTradeResolution` 增加 `degraded`，`TradeMetrics` 增加 `degradedRounds` 并计入 `complete`；trade 计数仍可观测，但 rate 归 null。新增 regression。
- **真实 bug 3 — 非法 `tradeWindowSeconds` 静默取消时间上界**：`NaN` / `Infinity` 产生不可比较的 `windowTicks` 且 `available = true`，交易不再受窗口约束；`0` / 负值被静默钳到 1 tick。修复：非有限或非正即抛 `RangeError`，与既有 `effectiveFlashThresholdSeconds` 校验一致。新增 regression。
- **Final Acceptance tests**（`tests/acceptance.test.mjs`，6 个）：trade 1:1 参与不一致、降级 trade completeness、非法窗口、`PlayerCoverage` 回合闭合与 `kast.playedRounds === roundsPlayed`、utility 有效伤害 ⊆ 玩家 `effectiveDamage` 且逐发 evidence 可解释、真实 demo1.dem 全场跨指标 invariant（含 side 分区、CT/T 击杀-死亡交叉恒等、无 unexpected unavailable/ambiguous、deterministic）。
- **API**：仅 additive —— `RoundTradeResolution.degraded`、`TradeMetrics.degradedRounds`；外加更严格 option 校验。`MatchAnalytics` / `PlayerMetrics` / `SideMetrics` / KAST / Clutch / Utility 既有字段语义未变。P3 Analytics public contracts 现已冻结，供 P4 Findings 使用。
- **Golden 保持**：demo1 twinkle 25/20/4、reported ADR 110.17、ADR 91.38、KAST 18/24=75%、trade 6/4/18=22.2%、R24 1v3 win、utility Flash23/Smoke14/HE10/Incendiary9/Molotov2/Decoy1、HE effective 96、fire 54、enemy19/team10/self15、flash assist 1 全部不变，无硬编码。
- **验证**：analytics **53/53 PASS**、dem-parser **28/28 PASS**（真实 DEM 全部执行、0 skipped）、`pnpm typecheck`、`pnpm build` 全 PASS。
- 文档：`docs/analytics-metrics.md`（trade 口径 + FINAL PASS banner）、`docs/utility-analytics.md`、`docs/roadmap.md`、`.agents/current-task.md` 已同步。可以正式进入 P4 Findings。

## 2026-10-06 — P3.3 Utility Analytics PASS

- 基于 `d73e05b` 完成 analytics utility work unit，`utility.ts` + metrics/index 集成；不改 parser、领域契约和生产包依赖，仅 analytics 依赖 match-model。
- 唯一投掷口径：formal-window + confirmed participation 的 weapon_fire grenade release；detonate/start_burn/start_decoy 为独立效果证据，绝不叠加或反推 usage。同 actor/tick/归一 kind release 多行保留 observed、该类型 total=null；entityId 可复用、不做全局 ID。
- Fire 归一 molotov/incgrenade/inferno；throws 仍区分 Molotov/Incendiary，inferno 仅 damage/effect。原始 event.weapon、round/tick 和 effectiveLoss 保留。
- HE/fire 有效敌伤复用 damage ledger，overkill 截断、友伤/自伤不归属，ledger 缺口使 total=null。Flash count 为 victim effects；reported duration sum 为原始证据，actual blind duration 未经证实而 null。candidate overlap 考虑其他 thrower；effective threshold 默认不启用，显式 finite >=0 输入并回显。
- Flash assist 依赖 kill.assistedFlash=true 和 isEligibleAssist；没有“闪后被杀”的猜测路径。unknown flag/side/assister actor 显式 coverage。
- Utility 本地 coverage 输出 per-metric complete、reason counts 与 nullable totals。unidentified roster 和 null actor 保守门控。当前 parser 无 feed-completeness manifest，完整性仅针对领域事件证据；实际 blind reset/expiry/死亡终止仍待验证。
- Golden twinkle：Flash23/Smoke14/HE10/Incendiary9/Molotov2/Decoy1（fire11）；HE112 reported→96 effective、fire49→54；enemy19/50.853604s raw、team10/24.592389s raw、self15/20.235922s raw；flash assist1（R6 tick28201）。HE 与人工≈98差2：已逐发核对，R17 reported19仅剩3 HP，不能修改既有 ledger 迎合近似参考。44 positive duration rows / 6 overlap candidate rows，actual duration=null。
- 验证：analytics **47/47**（新增9 synthetic +1 real-demo golden）、dem-parser **28/28**，0 skipped；`pnpm typecheck`、`pnpm build` PASS（未变包使用 Turbo cache）。独立审查提出的 roster/assister coverage 缺口已修复并加入 regression。
- 全定义、口径/coverage/差异：[Utility Analytics](../docs/utility-analytics.md)。本 work unit focused commit 后交接；未进入 Findings/UI/AI。

## 2026-10-06 — P3.2 Final Acceptance end-state coverage fix

- 基线：已 fetch 并确认 `main` / `origin/main` 同为 `cbff78d`，从当前代码、测试和 docs 复核实现。根因是 Trade / Clutch 入口检查 available / anomaly 等条件，却漏掉 timeline 已识别的 `endStateSuspect`。
- `src/trade.ts`：冲突时复用 unresolved 返回值，整个回合不贡献 trade kill / traded death / tradeable death；既有 `summarizeTrade()` 将确认参与者计入 `unavailableRounds`、`complete=false`、`tradeRate=null`。`available` 的既有时钟语义不变。
- `src/clutch.ts`：冲突时整个回合 `ineligible=true`，无任何 1vN opportunity。统一 coverage 保留冲突原因 `survival-end-state-conflict`，并沿用 `clutch-round-ineligible`；无新增 issue。
- KAST 现有 `timeline.endStateSuspect` 降级已保证 incomplete；未修改 `kast.ts`。timeline 架构、5s trade window、正常指标语义及 package boundaries 均未改动。
- `tests/combat.test.mjs` 新增 Case A（有 death、end alive=true）与 Case B（无 death、end alive=false）。正常对照证明该回合本可产生 trade/clutch；冲突下验证 timeline、直接 resolver、全体玩家汇总/coverage/KAST，以及未知 trade 时钟组合。两个 regression 在修复前均失败。
- 验证：analytics **37/37 PASS**（含 3 个真实 DEM golden）、dem-parser **28/28 PASS**（含真实 DEM）、`pnpm typecheck`、`pnpm build` 全 PASS，0 skipped。demo1 twinkle KAST **18/24=75.0%**、trade **6/4/18/22.2%**、R24 **1v3 won=true** 保持；P3.1 damage/ADR、全局 trade **34:34**、parser golden 均无回归。
- 文档：同步 `docs/analytics-metrics.md` 与 `.agents/current-task.md`。本 work unit 创建 focused commit 后交接；未进入 P3.3，无无关改动。

## 2026-10-06 — P3.2 KAST / Trade / Clutch

- `packages/analytics` 新增统一存活/时序上下文 `src/timeline.ts`：以 coverage 选出的名单快照（freeze_end 优先）为起点，用正式窗口 `[startTick, endTick]` 内的死亡事件推进，并用 `end` 边界快照核验。`survived` 只有在“起点 alive + 无死亡 + end alive=true”同时成立时才为 true；无死亡不等于存活。生命周期异常（baseline 之后 disconnect/spawn/side_change）与不一致死亡使该回合时间线退出 KAST/Trade/Clutch。
- KAST（`src/kast.ts`）：K = 窗口内合规击杀，A = 合规助攻，S = 可证存活到 round end，T = 死亡在窗口内被存活队友有效 trade。K/A/T 任一成立即 KAST，S 不影响；否则只有 S 与 T 都被证明为 false 才判 miss，无法证明则该回合退出分母。输出 rounds / eligibleRounds / playedRounds / percentage 与 K/A/S/T 分量回合数、`complete` 标记。
- Trade（`src/trade.ts`）：trader 在窗口内击杀 tradedKiller，为队友 tradedVictim 复仇；trade kill 与 traded death 严格 1:1。默认 `tradeWindowSeconds = 5`，`windowTicks = round(5 × tickRate)`；`match.tickRate` 不可靠时 `available=false`、`windowTicks=null`、tradeRate=null 并记 `trade-tick-rate-unknown`（tradeableDeaths 仍输出）。同 tick 记 `trade-same-tick-ambiguous`，并列候选记 `trade-candidate-ambiguous`，都不归属。双方都必须是可识别敌方击杀，排除 teamkill/world/side unknown。tradeRate 仅在 tick rate 可用、上下文完整、无 ambiguous 时为数值。
- Clutch（`src/clutch.ts`）：从可靠 freeze_end 名单推进存活人数，当某队恰剩 1 人且敌方 ≥1 时形成 opportunity，按 1v1–1v5 分桶；只有 `round.winner === 该阵营` 才算 clutch win（winner 未知记 `clutch-winner-unknown`）。lifecycle 异常 / unidentified / 名单回退时整回合不输出（`clutch-round-ineligible`），禁止猜测。
- Coverage（`src/coverage.ts`）：新增 10 个 issue code，并给出 `coverageIssueSeverity`（unavailable / ambiguous / degraded / informational）与 `CoverageSummary.severity` 合计；`RoundRoster` 增加 `entries`/`tick`，`RoundCoverage` 增加 `endState`、`winner`、`lifecycleEvents`。
- demo1.dem golden（twinkle）：KAST **18/24 = 75.0%**（K14/A3/S4/T4，全部可证、complete=true）；trade kills **6**、traded deaths **4**、tradeable deaths **18**、trade rate **22.2%**；clutch 3 次（R1 1v3、R17 1v2、R24 1v3）1 win（R24）。全局 tradeKills = tradedDeaths = 34，tradeable 158，clutch 31/7，P3.2 新 issue 全 0。
- 与人工复盘一致；差异仅来自口径精确化。对账中发现 R22 死后手雷击杀（tarkz 于 121075 死亡后 121153 击杀 twinkle）为合法 posthumous kill，不复活、不作 trade；R13/R23 的复仇击杀分别 395/359 ticks，超出 320 窗口故不算 trade（放宽到 ~6.2s 会得到 6，与人工复盘 4 不符）。
- 验证：`pnpm --filter @cs2-coach/analytics test` **35/35**（P3.1 19 + P3.2 combat 13 + 真实 DEM 3）、`pnpm --filter @cs2-coach/dem-parser test` **28/28** 无回归、`pnpm typecheck`、`pnpm build` 全 PASS。上一轮 handoff/current-task 记录的 “20/20” 实际为 **21/21**（19 合成 + 2 真实 DEM），已更正。
- 未实现：utility advanced metrics、Findings、AI、UI。完整定义、issue 码表与 golden：docs/analytics-metrics.md。

## 2026-10-06 — P3.1 damage / ADR semantics correction

- `packages/analytics` 现在区分两套伤害：`reportedDamage`（原始 `dmg_health`，保留 overkill）与 `effectiveDamage`（受害者实际 HP 损失，单发被受击前剩余 HP 截断）。`reportedAdr = reportedDamage / roundsPlayed`，`adr = effectiveDamage / roundsPlayed`（标准 ADR）。CT/T split 同样输出两套。旧的 `adr` 字段语义已改为标准 ADR，原值迁移到 `reportedAdr`。
- 新增 `packages/analytics/src/damage.ts`：`buildDamageLedger(round)` 为每个 victim 回合从满血 100 重建 HP 轨迹，`loss = preHurtHP - healthRemaining`。自伤/友伤/world 伤害参与轨迹但不归属；`dmg_health` 只用于校验（demo 整数上报与截断余量允许 ±1）。轨迹断裂记 `damage-effective-chain-broken`，同 tick 顺序不可证记 `damage-effective-same-tick-ambiguous`，对应伤害行不计入 effective，绝不猜测。逐玩家 `coverage.effectiveDamageUnresolved` 计数。
- demo1.dem golden：twinkle reported 2644 / reportedAdr 110.17 / effective 2193 / adr 91.38；CT 1106→819、T 1538→1374；全局 reported 24600 / effective 19351。与之前人工复盘 ~2195 / ~91.5 对照，差 2 点（0.09%）来自逐发整数舍入，不是口径分歧；scoreboard 风格 `min(dmg, hp)` 会得到 2162，明显偏离，说明人工复盘用的是 HP 损失口径。
- 验证：`pnpm --filter @cs2-coach/analytics test` 20/20（含真实 DEM）、`pnpm --filter @cs2-coach/dem-parser test` 28/28 无回归、`pnpm typecheck`、`pnpm build` 全 PASS。
- P3.2 仍未开始：KAST / Trade / Clutch / utility advanced / Findings / UI / AI 未实现。治疗与回合内重生在本样本未出现，机制上会走 chain-broken 降级，待真实样本验证。
- 完整定义、issue 码表与 golden 对比：docs/analytics-metrics.md。

## 2026-10-06 — P3.1 PASS

- `packages/analytics` 现在实现第一批确定性指标：K/D/A、K/D、HS%、rounds played、reported damage、ADR、CT/T split、multi-kill、opening kill/death。实现只依赖 `match-model` 领域类型。
- 统一 coverage/eligibility 在 `packages/analytics/src/coverage.ts`：回合窗口 `eventEligible`（start+end 齐全，闭区间）、freeze_end→start 快照选择、participant/side/alive 归一、unidentified 与 post-round 排除。指标调用共享 `isEligibleKill/isEligibleAssist/isEligibleDamage/isIdentifiedEnemyKill`，不各自判断。
- ADR 口径为 reported damage（保留 overkill，剔除友伤/自伤/未知 side），分母为有确认参与的完整回合。CT/T split 使用逐回合快照 side，不用 `Player.team`。
- assist 要求 assister 与 killer 同侧；demo 原始 assister 字段会记录友伤助攻（twinkle 2 次），抑制后与人工复盘 25/20/4 一致。
- demo1.dem golden：twinkle 25/20/4、HS 9、CT 10/10/3/1106、T 15/10/1/1538、ADR 110.17、opening 4/0、multi-kill {2:6,3:1,4:1}；全局有效窗口击杀 180（parser 182 含 2 个 post-round）、助攻 57、伤害 24600、24 次 opening duel。
- 验证：`pnpm --filter @cs2-coach/analytics test` 15/15（含真实 DEM）、`pnpm --filter @cs2-coach/dem-parser test` 28/28、`pnpm typecheck`、`pnpm build` 全 PASS。analytics 对 dem-parser 仅有 test-only devDependency。
- P3.2 KAST / Trade / Clutch 前缺口：存活推进（freeze_end alive + 死亡时间线 + end 快照）、trade 时窗与 tickRate 未知抑制、clutch 起始存活名单、回合内断连/重生/重连真实证据、utility 类型归一与 stage 去重。
- 完整定义、issue 码表与 golden 对比：docs/analytics-metrics.md。

## 2026-10-06 — P2.2 PASS

## 2026-10-06 — P2.2 PASS

- Exact round start/freeze_end/end snapshots now provide player identity, side, nullable alive and instantaneous CT/T participation. Missing rows are unavailable, not an empty roster; observed is not a guarantee of completeness.
- Round.playerLifecycle preserves actual spawn/disconnect/side_change separately from combat events. player_team uses team/oldteam, not user_team_num, for the change. Known snapshot/lifecycle identities are included in Match.players.
- demo1.dem: 24 rounds, 72 snapshots / 720 rows, all 240 start and 240 freeze-end states alive; end states 60 alive / 180 dead. 230 live spawns (raw 240 includes 10 warmup), 10 halftime changes, 10 post-final-end disconnects.
- P2.1 golden counts unchanged. pnpm typecheck, pnpm build, parser test 28/28 with real DEM all PASS; independent review complete.
- No Analytics/UI/Findings/AI implemented. P3 can begin with explicit metric policy and coverage gates; connected enum semantics, reconnect, within-round disconnect/respawn and bot coverage need further real evidence. Never infer state from event absence or Player.team.
- Full contract, evidence, fixture and P3 scope: docs/round-state-evidence.md. DEM stays local/ignored; native types remain inside dem-parser.
