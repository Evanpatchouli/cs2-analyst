# UI / IPC 修复与独立验收（2026-10-17）

> 本页保留截至 `5825f965` 的历史结论。后续安全进程管理、同场重导入修复、安装版与原生窗口验收见 [UI / IPC 质量验收](./ui-ipc-quality-acceptance.md)。不要用下方历史的 NOT RUN 替代后续实际执行结果。

结论：代码修复及下列已执行自动验收通过；**不宣告最终发布 PASS**。安装版整套验收未完成，Windows 文件资源管理器拖放及原生精确调窗/跨显示器 DPI 仍需手工验收。

## 基线与实施

- 开始分支 `main`，HEAD 与指定基线 `f143169a7c82dcdf811d27425344ab6fc784c1c1` 完全一致，初始工作区干净，无用户未提交修改。
- 已读取根 AGENTS、路由、工作流及桌面/回放/fixture/打包文档。引用的 `.agents/workflows/feature-development.md` 不存在，使用实际 `.agents/workflows.md`。
- Windows x64，Node 26.3.0、Electron 44.5.1。核对已安装 Electron 类型定义及官方 [webUtils](https://www.electronjs.org/docs/latest/api/web-utils) / [contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge) 文档。
- 实现提交：`7779639`（IPC 边界）、`5f6775e`（地图/侧栏/交互验收）、`8eb5f3a`（回放隐藏祖先反向验收）。未改版本、tag 或发布远端产物。
- 本轮不改 parser、analytics、findings、deep-review 及报告数据语义；保留 Electron 隔离/沙箱配置。

## 修复前后

| 问题 | 最终行为 |
| --- | --- |
| Renderer 能先取路径，再提交任意绝对路径 | 仅公开 `importDroppedFile(File)`；preload 私下解析磁盘 File 并提交 IPC，移除 `getFilePath`/`importDemoFile` |
| 合成/无磁盘路径 File | preload 明确返回错误，不启动 Main 分析；由统一报告状态呈现错误 |
| 导入失败/取消与旧报告状态 | 保留报告与目标玩家；Main 发送 parsing 后才将旧回放标为不可用；迟到进度不重新进入 busy |
| 地图按父外框尺寸计算并强制至少 160px | 扣除四边 padding/border，使用实际可用内容区最大正方形；允许窄布局缩小 |
| Canvas 调整与监听 | 仅像素尺寸改变时重置/重绘背景；监听 DPR 改变，卸载移除 observer/媒体查询监听 |
| 折叠导入按钮无可靠名称 | 展开/折叠均提供当前操作 `aria-label`，Fluent Tooltip 显示实际操作，保留 native button/focus/disabled 行为 |
| 滚动断言只查 CSS 或无页面滚动 | 查 selected Tab 与唯一可见面板、实际滚动末端及末子项；回放单独验证地图内容边界和各区可达 |
| 隐藏面板/hidden 裁切假通过 | 真实 DOM 反向 probes 必须拒绝面板裁切、隐藏选中面板和窄布局裁切 rail；拒绝 scrollIntoView 程序化滚动 hidden 祖先掩盖问题 |

## 修改文件与目的

| 文件 | 目的 |
| --- | --- |
| `apps/desktop/preload/index.ts` | File 解析与导入合并，最小公开能力 |
| `packages/report-contract/src/index.ts` | 移除路径 API，声明 File 导入契约 |
| `apps/desktop/renderer/src/home.tsx` | DOM drop 只传 File，统一错误展示 |
| `apps/desktop/renderer/src/store.ts` | File 导入及旧报告状态保护 |
| `apps/desktop/renderer/src/main.tsx` | 接入新的 store 操作 |
| `apps/desktop/electron/main.ts` | 保留防线，提交精确原始路径，修正安全边界注释 |
| `apps/desktop/renderer/src/replay-player.tsx` | 内容盒尺寸、取消固定地图下限、DPR 监听与清理 |
| `apps/desktop/renderer/src/sidebar.tsx` | 导入可访问名称与 tooltip |
| `apps/desktop/tests/import-ipc.test.mjs` | VM/mock 的 preload、worker、互斥及 store 回归 |
| `apps/desktop/tests/app-shell.test.mjs` | 两种侧栏状态名称/禁用语义；源码布局正则改由实际 DOM 验收承接 |
| `scripts/window-shell-checks.mjs` | 页面/可见面板/滚动末端、AX 树、tooltip、合成 File 实际反馈 |
| `scripts/report-ux-checks.mjs` | 报告侧栏及滚动反向 probes，避免量取隐藏 Analysis 面板，补最小视口 |
| `scripts/deep-review-ux-checks.mjs` | 实际深度复盘导航后的滚动检查 |
| `scripts/desktop-report-smoke.mjs` | 真实磁盘 File 经过实际桥接/worker；键盘激活导入 |
| `scripts/replay-smoke.mjs` | 内容边界/DPR/重绘/可达/裁切反向断言，系统临时 profile 与异步清理保留主失败 |
| `docs/desktop-report.md` | 当前公开 API、布局与最小窗口规格 |
| `docs/windows-packaging.md` | 区分环境变量注入与合法 File 导入 |
| `docs/ui-ipc-acceptance.md` | 本次证据、限制与手工验收步骤 |

## 实际执行结果

下表为最终运行结果；不同命令测试集合重叠，不累加为独立用例总数。共享 checks 没有独立 CLI，由真实桌面 smoke 调用。

| 命令 | 最终结果 / 关键输出 |
| --- | --- |
| `pnpm --filter @cs2-analyst/report-contract build` | PASS，更新契约声明 |
| `pnpm --filter @cs2-analyst/desktop typecheck` | PASS |
| `pnpm typecheck` | PASS，Turbo 15/15 tasks，10 cached |
| `pnpm --filter @cs2-analyst/desktop build` | PASS，13/13 雷达资源校验，Main/preload/Renderer 构建成功 |
| `node --test apps/desktop/tests/app-shell.test.mjs apps/desktop/tests/import-ipc.test.mjs apps/desktop/tests/window-shell.test.mjs` | PASS，11 passed / 0 failed / 0 skipped（SSR/VM/mock） |
| `pnpm --filter @cs2-analyst/desktop test` | PASS，60 passed / 0 failed / 0 skipped，含真实 DEM/domain 集成；不等同于 60 个桌面交互用例 |
| `node scripts/desktop-report-smoke.mjs` | PASS，真实 DEM、损坏 DEM、非 DEM 三场景；调用 window-shell/report-ux/deep-review-ux checks |
| `node scripts/replay-smoke.mjs` | PASS，built-electron；12 次真实 chunk 请求 p95 10.8ms，导入 5590.6ms，首帧 76.5ms，绘制 p95 0.2ms；`reportUnchanged: true` |
| `pnpm --filter @cs2-analyst/desktop test:smoke` | PASS，dev / preview 两场景 |
| `pnpm --filter @cs2-analyst/desktop pack:win` | PASS，生产安装包 111.7 MB |
| `pnpm --filter @cs2-analyst/desktop pack:win:test` | PASS，测试安装包 111.7 MB |
| `pnpm --filter @cs2-analyst/desktop test:installed` | FAIL / 未完成，两次尝试均未进入安装版应用场景，见下文 |

报告 smoke 验证 demo1 原 golden：twinkle 25/20/4、ADR 91.38、KAST 75%、Trade 22.2%、R24 1v3、5 条 Findings、13:11；导航/目标玩家/面板状态/跳转仍通过。

回放已执行播放/暂停/倍速/回合切换/键盘 seek、Timeline/Findings 精确跳转、玩家切换、缓存上限、取消保留报告/重导入、session 释放、分析中关闭无 worker 残留。布局覆盖默认桌面、1024×640、额外 800×600、DPR 1/2、往返 resize、侧栏折叠/展开；尺寸循环为 **CDP viewport/DPR 模拟**。原生最小化/恢复和最大化/还原有实际 Electron 证据；精确原生窗口调尺寸及跨物理显示器 DPI 没有通过证据。Dust2 无多层楼层切换，楼层 UI 本轮 **NOT RUN**；原有 map/session/state Node 用例通过。

preload/IPC/store 的不可信 sender/frame、无效类型/路径、扩展名、重复导入、失败/取消/异常退出及报告保持有 VM/mock 证据。实际 Electron 合成 File 只证明错误反馈；实际磁盘 File 用 CDP `DOM.setFileInputFiles` 提供仓库 demo1，再经 DataTransfer/drop、Home、preload、Main、真实 Utility Process 到报告，**不是 Windows Explorer 拖放**。

## 失败尝试及限制

- 开发阶段发现并修复：旧契约 dist 类型声明、VM 导出 harness、隐藏 Analysis 面板量尺寸、窄布局滚动策略误判、profile 清理 EPERM 遮蔽主错误；最终相关运行通过。未以跳过/放宽断言解决，增加了反向断言。
- 原生调窗尝试：Electron CDP 不支持 `Browser.getWindowForTarget`；Win32 调窗未取得有效窗口结果。未把尝试算作通过，未保留该尝试代码。
- installed 第一次在旧 `.tmp/installed-smoke` 的 `rmSync` 遇到 EPERM，未启动安装版应用。第二次临时改用独立系统目录后，静默生产安装程序仍未返回，新安装目录未出现应用文件；发现已有生产卸载注册指向 `.tmp/v01-final/app-production`。未读取安装窗口提示，不能断言旧注册就是挂起根因。终止了本次启动的安装进程，安装退出码 4294967295。未自行删除旧安装/注册。临时安装脚本改动及尚未完成的生产 File 扩展已撤回，未提交或记 PASS。
- 安装版应用/ASAR/安装版拖放/卸载等整套场景均 **NOT RUN**。本地打包成功不证明安装验收成功。
- 本轮先有 PowerShell 原生调窗尝试，之后读取的 computer-use `docs/guidance.md` 要求 “Do not mix direct PowerShell UI Automation code in the same turn as Computer Use.” 因此未继续用该技能操作安装 UI。无需增加一个未经验证的绕行实现。
- 日志与报告截图：系统临时目录 `cs2-ui-ipc-qa`；回放指标/截图 `.tmp/p6-qa/built-electron.json` 及同目录 PNG，均未提交。

## 独立审查与发布状态

独立 reviewer 审阅实际基线 diff、IPC 调用链、worker/store 生命周期及最终测试脚本，并独立执行 11 个 Node 用例全部通过。发现 `scrollIntoView` 可掩盖 hidden 裁切的验收风险，修复并实际跑过反向 probe 后 reviewer 确认关闭；未发现剩余确定性代码阻断项。

代码质量评分 **8.5/10**：最小能力边界、内容盒算法与反向断言有证据，未改业务包或新增依赖；扣分来自安装/OS 拖放/物理 DPI 验收未闭环、现存脚本固定等待及源码/VM 测试技术债。**发布验收仍阻塞于未完成项目，不能给最终发布 PASS。**

## 精确手工验收步骤

1. 手工核实并处理旧测试安装与目录占用，再运行 `pnpm --filter @cs2-analyst/desktop test:installed`。确认生产/测试包安装、应用场景、路径注入防护、worker 清理及卸载全部通过；不要把旧测试目录中的历史应用当作本轮安装版。
2. 运行 `pnpm --filter @cs2-analyst/desktop build`，再运行 `pnpm --filter @cs2-analyst/desktop start`。在 Windows 文件资源管理器打开仓库 `.demo`，将 `demo1.dem` 真正用鼠标拖入首页中央卡片。确认高亮/放下复位、分析阶段、忙时导入禁用，最终报告匹配上述 twinkle golden；这一步才是 OS 级拖放证据。
3. 重新打开应用，将 `.demo/assist-raw.json` 拖入卡片：应提示“请选择 .dem 文件”，不生成报告。再次拖入 `demo1.dem` 应能成功恢复。已出报告后用“重新选择 DEM”再次导入，进入解析后取消：保留上一报告和玩家，旧回放应明确不可用；再次选择有效 DEM 应恢复新回放。
4. 使用鼠标将原生窗口调到 1024×640，下限不得更小。分别展开/折叠侧栏：用 Tab 到导入按钮，确认焦点、读屏名称及 tooltip 对应“选择 DEM/重新选择 DEM”，Enter 可启动选择。遍历五个 Tab，长内容能滚到末项，文档本身无多余滚动。报告数据、目标玩家与 Timeline 跳转保持正确。
5. 打开地图回放，调整窗口、折叠侧栏、最大化/还原：雷达完整处于边框/padding 内，底部播放时间轴始终可操作，玩家和事件末项可访问。验证播放/暂停/倍速/切回合/事件定位；使用 Nuke fixture 补验楼层切换。若有不同缩放的两台显示器，来回移动窗口核实 Canvas 清晰且坐标不偏移，控制台无 ResizeObserver 错误。
