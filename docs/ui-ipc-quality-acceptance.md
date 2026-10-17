# UI / IPC 质量验收（2026-10-17）

起点：`5825f9650ad05691080deeb18076939e4ef8b1b0`，分支 `main`，初始工作区干净，`git fetch origin` 后 `origin/main` 相同。根规范引用的 feature-development.md 不存在，按实际 `.agents/workflows.md` 与 `.agents/routing/model-routing.md` 执行。

## 修复及证据

| 已证实问题 | 实现 | 验证 |
| --- | --- | --- |
| 安装 smoke 按映像名终止所有用户实例 | `ProcessScope` 在 spawn 前记录时间，跟踪 PID + CreationDate 与后代，清理时持有句柄核对 StartTime；保留已退出父进程关系 | 同名无关进程/PID 重用/短命父进程模型；真实 Windows CIM 孤儿子进程清理且无关 Node 存活 |
| 安装器同步启动无超时，NSIS 启动器退出 0 被误当完成 | 异步启动、120s 退出期限、输出/退出码/耗时/目标目录诊断；卸载另外验证文件、注册和本次进程全部消失 | 真实 Node 子进程超时、缺文件/无效启动器/退出 7 分类；实际 NSIS 安装卸载 |
| 固定历史目录被无条件删除 | 每次分配 workspace 内独立带 token 标记的 run；拒绝越界、不同盘、junction/symlink、错误标记、已有目录覆盖；保留历史目录与运行证据 | 真实临时目录/junction 与 Windows 大小写、跨盘回归；安装前注册只读检查 |
| 清理错误可能覆盖主错误，CDP 断开/表达式异常诊断不足 | `withCleanup` 尝试全部清理，附加次要错误；共享有期限的 CDP 握手/请求，断开立即拒绝；明确检查 exceptionDetails | 主断言 + 清理同时失败、单独清理失败、drop + 断线清理反向回归 |
| 固定睡眠代替可判断状态；暂停按钮已更新但 Canvas 最后一帧尚未重绘 | UI/字体/几何/滚动稳定采样，状态与实际绘制条件等待；暂停等待 Canvas tick 等于统一时钟 tick 后仍严格检查 250ms 内完全不变 | 真实构建报告/回放 smoke；保留既有隐藏面板、hidden 裁切 rail、滚动不可达反向断言 |
| 损坏重导入失败后，再成功导入同一场比赛仍停在 Replay | store 两个成功分支 functional 更新 `reportRevision`；App 用 revision 重置默认 Tab 与 Report key；失败/取消/解析不增 | 安装版修复前实际 `status=success`、`selected=replay-tab` 导致严格断言超时；VM 两入口回归与修复后实际安装版恢复测试 |

未重写已正确的 preload File 边界、Main trusted sender/frame/path/互斥、Canvas 内容盒/DPR、侧栏 Tooltip 或滚动规则。Renderer 没有恢复任意路径 API。产品代码只改 Renderer 的成功导入界面身份；无新增依赖，无版本/tag/release 修改，无 parser/analytics/findings/deep-review/报告契约语义修改。

独立 reviewer 初审另确认并关闭：spawn 返回之后才记时可能漏认根进程；drop 清理断线可能覆盖主错。回归均保留。安装 walkthrough 同步适配安全目录分配及 async 进程查询。

## 安装阻断的实际诊断

历史两次失败依据保留于 [前轮记录](./ui-ipc-acceptance.md)：第一次为删除旧 `.tmp/installed-smoke` 的 EPERM；第二次安装器未返回、目标文件未出现。未重新执行旧脚本的危险删除来“复现”故障，也不能仅凭旧注册断言第二次挂起的唯一根因。

本轮只读确认：HKCU `Software\Microsoft\Windows\CurrentVersion\Uninstall\95de1473-8103-5c85-9110-14ab27c1055a` 的 `UninstallString` 为 `"E:\cs2-analyst\.tmp\v01-final\app-production\Uninstall CS2 Analyst.exe" /currentuser`，无 InstallLocation；旧目录中 EXE/卸载器及资源仍在，没有 CS2 Analyst 进程。新脚本准确报告冲突后退出，没有启动安装器或清理旧目录。Registry32/64 两视图重复观测不代表两套安装。

用户确认是旧测试安装，并明确要求代为卸载。仅运行注册指向的卸载器 `/S /currentuser`，有超时和本次进程追踪；未手工删除文件/注册表。第一次辅助尝试在启动器返回后过早进入清理，暴露 NSIS 子进程仍在继续；诊断保留。修正等待文件、注册及临时后代全部退出后再清理，第二次正常完成。新安装流程沿用该完成条件；这比只核对启动器退出码更可靠。

安装目录、独立 profile 与诊断统一保留在 `.tmp/installed-smoke-runs/run-*`；旧 `.tmp/installed-smoke` 不动，旧安装只由用户授权的卸载器处理。不会自动收拾未知安装或用户目录。

## 执行命令及结果

本轮 Windows x64 / Node 26.3.0 / Electron 44.5.1。日志在 `.tmp/ui-ipc-quality/`，真实回放指标/截图在 `.tmp/p6-qa/`；这些机器本地材料不作为发布产物提交。

| 命令 | 实际结果 |
| --- | --- |
| `git status --short; git rev-parse HEAD; git branch -vv; git remote -v; git log -8 --oneline; git fetch origin` | 开始 HEAD 与远端等于基线，工作区干净 |
| `pnpm typecheck` | PASS，Turbo 15/15（12 cached） |
| `pnpm -r --workspace-concurrency=1 test` | PASS；deep-review 210、dem-parser 48、analytics 53、findings 17、desktop 73，共 401 passed / 0 failed / 0 skipped；match-model 编译契约通过 |
| `node --test scripts/*.test.mjs packages/dem-parser/dev/*.test.mjs` | PASS，9/9，0 failed / 0 skipped |
| `node --test apps/desktop/tests/installed-smoke-lifecycle.test.mjs apps/desktop/tests/import-ipc.test.mjs` | PASS，18/18；独立 reviewer 也执行 18/18 |
| `pnpm --filter @cs2-analyst/desktop build` | PASS，13/13 地图资源校验，Main/preload/Renderer 构建成功 |
| `node scripts/desktop-report-smoke.mjs` | PASS，真实/损坏/非 DEM 三场景；五 Tab、AX 名称/键盘焦点/Tooltip、多视口滚动及反向 probes |
| `node scripts/replay-smoke.mjs` | PASS，built Dust2，实际 IPC/播放/暂停/seek/取消重导入/session 释放/worker 清理/尺寸与 DPR/反向裁切，reportUnchanged=true |
| `node scripts/replay-smoke.mjs --nuke` | PASS，完整回放与主层/下层/自动楼层，真实解码资源/绘制参数及楼层玩家过滤，reportUnchanged=true |
| `pnpm --filter @cs2-analyst/desktop pack:win` | PASS，本地生产安装包 111.7 MB |
| `pnpm --filter @cs2-analyst/desktop pack:win:test` | PASS，本地 test-seam 安装包 111.7 MB |
| `pnpm --filter @cs2-analyst/desktop test:installed` | PASS，生产 → 完全卸载 → test-seam → 完全卸载；完整最终运行 run-wdO51G。修复前恢复断言真实失败，未改为跳过或放宽 |
| `pnpm --filter @cs2-analyst/desktop test:smoke` | PASS，dev / preview 的页面、preload、资源和关闭 |

真实报告 golden：twinkle 25/20/4、ADR 91.38、KAST 75%、Trade 22.2%、R24 1v3、5 条 Findings、13:11。所有上述断言保留。不同命令覆盖重叠，不累加为独立交互用例总数。

最终安装 smoke：生产安装/卸载启动器退出均为 0，耗时 8068ms / 831ms；test-seam 为 7760ms / 851ms。完成时再次只读确认：两个目标 EXE 不存在、该 run 没有存活进程、卸载注册为空。ASAR 5.29 MB / 96 条目，71 个去重官方 SVG 字节一致，原生绑定 4.1 MB 且 provenance/SHA 匹配。环境变量注入观察窗、正式包真实磁盘 File 拒绝/恢复、报告/AX/滚动反向检查、损坏重导入保留报告/玩家、旧 replay 退役、同 DEM 恢复默认报告、解析中关闭和 worker 清理全部通过。

最终安装包 SHA-256（本地验证件，不提交二进制）：生产 `c2495827202c5e86e70a880614c0dd6cd067b83c61bf9819ad04c8670af75f8b`；test-seam `fe0db72e72b23c8df103312fb3c9b3faad152a465868ffe93c5ef378a50acadb`。

Nuke 楼层自动测试使用真实 DEM/真实 IPC：验证实际解码 PNG URL、自然尺寸 1024、真实 base Canvas 的 `drawImage` 参数与非空图像；首帧真实 chunk 的玩家 Z 均在主层，下层应画 0 人，主层恢复完整布局。反复 readback 会让 Chromium 切换 GPU/软件重采样，同一 PNG 的细小像素不同，故不声称跨后端逐像素一致。旧 Dust2 非空/DPR/布局断言保持不变。新增楼层测试等 overlay 的实际重绘完成，不用固定延时猜测完成时刻。开发时还抓到暂停按钮更新早于最后一帧的竞态：旧帧与最终暂停 tick 差 0.0704 tick，保留严格等值断言，改为先等 Canvas 与暂停时钟完全一致再观察稳定；相关失败日志保留为 replay-before-paused-frame-wait.log。

最终回放指标：Dust2 导入 5479.4ms、12 次 IPC p95 6.3ms、首帧 125.4ms、绘制 p95 0.2ms；Nuke 导入 4631.2ms、IPC p95 7.3ms、首帧 129ms、绘制 p95 0.2ms。两者 reportUnchanged=true。

## 自动化与原生交互分开记账

| 自动化验收 | 状态与证据范围 |
| --- | --- |
| 类型、业务与 Renderer/IPC 单元/VM/fixture | PASS，401 + 辅助 9；互斥、重复、异常/取消、报告/目标/session/worker 边界 |
| 真实 built Electron 报告、键盘、AX/Tooltip、五 Tab/滚动反向验证 | PASS，`report-smoke.log` 与 QA PNG |
| 完整回放、Nuke 楼层 | PASS，built-electron.json / built-nuke.json 与相应 PNG |
| 安装、ASAR、包内安全边界、真实报告、异常与卸载 | PASS，installed-smoke.log、run-wdO51G/lifecycle.json、native-*.json |
| CDP 视口 1024×640 / DPR 1、2 | 属于模拟验证，不代表物理显示器移动 |

| 原生/人工交互项目 | 实际状态 |
| --- | --- |
| Windows 原生文件选择器选择 `.demo/demo1.dem` | PASS；Computer Use 点击/键入/确认，无路径注入，观察 parsing 到实际 golden 报告 |
| 原生窗口边框调至最小尺寸 | PASS；第二次确切命中右下边框后只读观测 `innerWidth=1024, innerHeight=640`，无 Emulation；第一次只滚动页面，未算调窗成功 |
| 五 Tab、局部滚动、侧栏折叠、回放信息栏末项与底部控制 | PASS；同一原生 1024×640 窗口，Computer Use 输入与逐步截图；更广的末项/AX/键盘断言由真实 DOM 自动化承接 |
| 原生最大化/还原 | PASS；鼠标标题栏操作，1920×1032 → 1024×640，Canvas 669px → 277px，恢复清晰且控制区可见 |
| Nuke 多楼层 fixture | PASS；原生 chooser 选 `.demo/nuke.dem`，鼠标切下层/主层，雷达正确切换，0/10 玩家点位，截图保留 |
| Explorer 拖放 `demo1.dem` 与非 DEM 文件 | PASS（用户手工反馈）；用户明确确认“demo1 能出报告，非 DEM 拒绝后再拖 demo1 也能恢复”。用户未指定非 DEM 文件名。Agent 工具曾拒绝跨来源窗口拖动（`outside window bounds`），没有将 CDP File 冒充 Explorer，也没有声称保存了用户操作截图 |
| 不同缩放的物理显示器间移动 | **ACCEPTED / WAIVED（产品负责人 2026-10-17 决策）**；未进行物理实测，CDP DPR 变化不能替代；不再阻塞当前 UI / IPC 质量验收 |

用户已补充 Explorer 拖放、非 DEM 错误反馈及恢复的手工结果。产品负责人于 2026-10-17 明确接受跨物理显示器 DPI 未实测这一剩余风险：该验收项状态关闭为 **ACCEPTED / WAIVED**，不再阻塞当前 UI / IPC 质量验收。此决定是产品验收豁免，不代表物理显示器切换已被技术实测通过；CDP 模拟 DPR 仍不能替代真实跨屏测试。

原生输入使用 computer-use 技能的 `@oai/sky`，未混用 PowerShell UI Automation。工具误将 Electron 窗口归在 Codex appId 下，按唯一的 `CS2 Analyst` 返回窗口及实际截图确认目标；没有操作 Codex 聊天界面。`native-observations.json` 保存时间、状态、viewport、screen、所选 Tab、Canvas 与异常列表；PNG 是同一会话的 CDP 证据快照，原生截图和输入仍可在工具轨迹核验。原始 observations 包含首次未成功 resize 的 1280×800 观测，未将其写成 1024×640 PASS。

## 独立复审与交付状态

独立 reviewer 正式终审代码提交 `f225b0b9c5a10ddb676555eee24ffee518e38792`（相对本页起点），确认工作区干净，给出 **9.15/10**，无剩余确定性代码阻断。两个 P2 已修复并确认关闭。Reviewer 在该提交独立执行 18 项定向回归，18 passed / 0 failed / 0 skipped；读取完整验收日志、Dust2/Nuke 指标与安装 lifecycle，并独立只读复查卸载注册为空、CS2 Analyst 进程为空、两安装目标 EXE 不存在。401 项等完整场景基于执行日志核验，不冒称 reviewer 全量重跑。

| 维度 | 权重 | 得分 | 评分依据及剩余扣分原因 |
| --- | ---: | ---: | --- |
| IPC 安全边界与生命周期 | 20% | 9.4 | File、trusted sender/frame、互斥及失败/取消/session 清理有效；精确进程身份保护无关实例。异常进程树依赖 CIM 观测，未形成 OS 级进程容器保证 |
| 回放几何、DPR 与资源清理 | 20% | 9.0 | 内容盒/DPR/监听清理、真实播放与 Dust2/Nuke 验证完整；跨物理显示器 DPI 未实测，产品负责人已接受该剩余风险且不再阻塞本轮验收 |
| UI 可访问性与交互正确性 | 15% | 9.0 | 真实 DOM/AX/键盘/Tooltip/五 Tab/原生最小窗口/滚动及同场重导入通过；评分时 Explorer 手工结果尚未确认，此后用户补充成功反馈，未据此自行加分 |
| 自动化确定性及反向验证 | 20% | 9.2 | 条件等待、暂停帧同步、主错误保留及隐藏/裁切反向断言有效；部分深度复盘 fixture 依赖 React 私有 Fiber，有升级脆弱性 |
| 安装、打包与端到端验证 | 15% | 9.2 | 两包完整安装/ASAR/安全边界/报告/异常/卸载通过；真实 NSIS 超时故障注入覆盖有限，Explorer 现有用户反馈但无录屏 |
| 可维护性和验收文档 | 10% | 9.0 | 共享生命周期工具、范围有限的产品修复、诊断与状态记录清楚；部分 smoke 脚本仍密集，完整材料主要保留本机 |

加权分：`9.4×20% + 9.0×20% + 9.0×15% + 9.2×20% + 9.2×15% + 9.0×10% = 9.15`。代码质量达到目标，自动化安装验收通过；跨物理显示器 DPI 未实测，但已由产品负责人接受并豁免为非阻塞项。**当前 UI / IPC 质量验收 PASS（9.15/10）**。此豁免不等于全部物理设备场景均已实测，也不自动替代独立的 v0.1 发布验收结论。

代码修改文件：`apps/desktop/renderer/src/{store.ts,main.tsx}`、`apps/desktop/tests/{import-ipc.test.mjs,installed-smoke-lifecycle.test.mjs}`、`scripts/{installed-smoke-lifecycle.mjs,smoke-runtime.mjs,installed-app-smoke.mjs,desktop-report-smoke.mjs,replay-smoke.mjs,window-shell-checks.mjs,report-ux-checks.mjs,deep-review-ux-checks.mjs,final-installed-walkthrough.mjs}`。文档修改：本页、`ui-ipc-acceptance.md`、`windows-packaging.md`、`desktop-report.md`。
