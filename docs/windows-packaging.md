# Windows 打包与安装（P5.2）

P5.2 把 P5.1 的桌面链路做成真正可安装、脱离 pnpm workspace 也能运行的 Windows 版本：

```text
Windows installer
→ 安装 CS2 Analyst
→ 开始菜单 / 桌面启动
→ 选择 .dem
→ Utility Process 解析 → Analytics → Findings
→ 与开发环境一致的报告
```

不引入发布系统：不签名、不自动更新、不做 GitHub Release。

> **Supported platform: Windows x64 only.** CS2 Analyst 只面向 Windows x64 构建、验证与分发。macOS / Linux 不是保留的默认目标，packaging 脚本不包含跨平台分支：`prepare-pack.mjs` 在非 win32-x64 上直接报错。

## 发布目录

安装包统一归档到项目根目录，并按版本分目录：

```text
release/
└── 0.1.0/
    └── CS2-Analyst-Setup-0.1.0.exe
```

- 版本号取自 `apps/desktop/package.json`，因此 `0.2.0` 会落到 `release/0.2.0/`。
- 测试 seam 产物是测试件，不进入正式 release 目录，放在 `.tmp/test-output/<version>/`（`.tmp` 已忽略）。
- 打包中间产物（`win-unpacked`）在系统临时目录，仓库里只保留最终安装包。

## 方案

- 打包工具：**electron-builder 26 + NSIS**，配置在 `apps/desktop/electron-builder.config.cjs`。
- 目标：Windows **x64**，per-user 安装（无需管理员），`oneClick: false` 且安装时可选择目录。
- 应用名 `CS2 Analyst`，版本沿用 `apps/desktop/package.json`（`0.1.0`），appId `com.evanpatchouli.cs2analyst`。
- 桌面与开始菜单快捷方式、独立卸载器（`Uninstall CS2 Analyst.exe`）。
- 复用工作区已安装的 Electron 运行时（`electronDist` 指向 `node_modules/electron/dist`），首次打包只需联网获取 NSIS 组件。
- 打包在系统临时目录完成，只把最终安装包复制到 `release/<version>/`：工作区文件 watcher 会占用新建的 `app.asar`，在仓库内原地重建会让 electron-builder 无法重置输出目录。

```powershell
pnpm --filter @cs2-analyst/desktop pack:win        # 生产安装包
pnpm --filter @cs2-analyst/desktop pack:win:test   # 仅测试构建启用安全 seam 的安装包
pnpm --filter @cs2-analyst/desktop test:installed  # 安装 → 驱动安装版 → 卸载 的 smoke
```

内部流程由 `apps/desktop/scripts/build-installer.mjs` 编排：`electron-vite build` → `scripts/prepare-pack.mjs` → 构建期校验 → `electron-builder`。

## Utility Process 的依赖处理

这是本轮的核心问题：开发环境里 `report-worker.js` 通过 pnpm workspace symlink 解析 `@cs2-analyst/*`，安装后这些链接不存在。

| 依赖 | 打包方式 |
| --- | --- |
| `@cs2-analyst/dem-parser` / `match-model` / `analytics` / `findings` / `report-contract` | **打进 worker bundle**（`report-worker.js` 约 77 kB），发布版不再有 `import "@cs2-analyst/..."` |
| `@laihoe/demoparser2` | **external**，运行期从 worker 同级 `node_modules` 解析 |
| `demoparser2.win32-x64-msvc.node` | **原生 addon**，随安装目录以 asar-unpacked 形式分发 |

- `electron.vite.config.ts`：`main.build.externalizeDeps = { exclude: [五个 workspace 包], include: ['@laihoe/demoparser2', '@laihoe/demoparser2-win32-x64-msvc'] }`。
- `apps/desktop/scripts/prepare-pack.mjs`：在 electron-vite build 之后，把 loader 包（`index.js` / `index.d.ts` / `package.json`）与平台原生包（`.node`，约 3.9 MB）复制到 `dist/electron/node_modules/`，与 worker bundle 同级。Node 从 worker 目录向上查找 `node_modules`，命中的就是这份随包分发的副本；loader 的 fallback `require('@laihoe/demoparser2-win32-x64-msvc')` 与开发环境走的是同一条代码路径。
- electron-builder `asarUnpack: ["**/*.node"]`：`.node` 落在 `resources/app.asar.unpacked/...`，因为原生绑定无法从 asar 内部 dlopen。
- 构建期校验（`build-installer.mjs`）会在打包前失败：worker bundle 仍 external 引用 workspace 包、worker 未引用原生 parser、或生产 `main.js` 含测试 seam 变量。

## 安装包内容

`app.asar` 只包含 `dist/**` 与 `package.json`；生产依赖不会进 asar（worker 与 renderer 都已 inline），因此不含 monorepo 源码、`pnpm store`、`.demo/demo1.dem`、`.git` 或开发 secrets。安装目录实测结构：

```text
CS2 Analyst.exe
resources/app.asar                                    1.26 MB / 10 个条目
resources/app.asar.unpacked/dist/electron/node_modules/
  @laihoe/demoparser2-win32-x64-msvc/demoparser2.win32-x64-msvc.node   3.9 MB
Uninstall CS2 Analyst.exe
```

Renderer bundle 不含 `demoparser2` / `laihoe` / `@cs2-analyst/*`，桌面与开始菜单快捷方式由 NSIS 创建。

## 路径兼容

所有路径都相对打包后的 bundle 位置解析（`import.meta.url`），没有硬编码开发目录：

- Main：`./report-worker.js`（Utility Process fork）
- Main：`../preload/index.cjs`
- Main：`../renderer/index.html`
- worker：`dist/electron/node_modules/@laihoe/...`（Node 模块解析）

`app.isPackaged === true` 下与开发环境行为一致，仅测试 seam 不同。

## 测试用路径注入

- `CS2_ANALYST_DEM_PATH`：**仅非打包构建**生效（`!app.isPackaged`）。
- `CS2_ANALYST_TEST_DEM_PATH`：只在 `CS2_ANALYST_TEST_SEAM=1` 的测试构建中编译进去；生产构建里 `__CS2_ANALYST_TEST_SEAM__` 被 `define` 成 `false`，Rollup 消除该死分支，`build-installer.mjs` 再断言生产 `main.js` 不含该变量。

因此正式安装版不存在任意路径注入能力，只能通过原生文件对话框选择 DEM；测试 seam 只用于自动化安装版 E2E。

## 安装版 E2E

`scripts/installed-app-smoke.mjs` 真正安装并运行安装版应用：

1. 静默安装生产安装包 → 校验 `CS2 Analyst.exe`、`resources/app.asar`、unpacked 原生绑定、asar 条目白名单、快捷方式、renderer 无 Node。
2. 启动安装版 → 校验 React 页面、preload 桥接、无 `window.require` / `window.process`，关闭后退出码为 0。
3. 带 `CS2_ANALYST_DEM_PATH` 与 `CS2_ANALYST_TEST_DEM_PATH` 启动生产版并点击“选择 DEM” → 15 秒内不得自动出报告，证明注入无效。
4. 卸载生产版。
5. 安装测试 seam 安装包 → 真实 `demo1.dem` 报告断言。
6. 分析进行中关闭窗口 → 不得残留 analysis worker（`tasklist` 无 `CS2 Analyst.exe`）。
7. 损坏 DEM → 显示错误且保留“重新选择 DEM”，不白屏。
8. 卸载测试 seam 安装包。

## 实测结果（2026-10-07）

| 项目 | 结果 |
| --- | --- |
| 生产安装包 | `release/0.1.0/CS2-Analyst-Setup-0.1.0.exe`，107.3 MB |
| 测试 seam 安装包 | `.tmp/test-output/0.1.0/CS2-Analyst-TestSeam-Setup-0.1.0.exe`，107.3 MB |
| 安装目录（本项目 smoke 使用） | `<repo>\.tmp\installed-smoke\app-production` / `app-test-seam`；默认安装位置为 `%LOCALAPPDATA%\Programs\CS2 Analyst` |
| `app.asar` | 1.26 MB，10 个条目，全部为 `dist/**` 与 `package.json` |
| 原生 parser | `resources/app.asar.unpacked/dist/electron/node_modules/@laihoe/demoparser2-win32-x64-msvc/demoparser2.win32-x64-msvc.node`，3.9 MB |
| worker bundle | `dist/electron/report-worker.js`，75 kB，无 `@cs2-analyst/*` external |
| 快捷方式 | 开始菜单 `…\Start Menu\Programs\CS2 Analyst.lnk` 与桌面 `…\Desktop\CS2 Analyst.lnk` |
| 安装版 demo1.dem | twinkle 25/20/4、ADR 91.38、KAST 75%、Trade 22.2%、R24 1v3 win、5 条 Findings、比分 13 : 11，与开发环境一致 |
| 损坏 DEM | 显示“无法分析此 DEM”并保留“重新选择 DEM”，不白屏 |
| 分析中途关闭 | 应用退出码 0，`tasklist` 无残留 `CS2 Analyst.exe`（含 Utility Process） |
| 注入防护 | 生产版带 `CS2_ANALYST_DEM_PATH` / `CS2_ANALYST_TEST_DEM_PATH` 启动并点击“选择 DEM”后 15 秒内不自动出报告 |
| 卸载 | 生产版与测试 seam 版静默卸载均成功，可执行文件移除 |

安装版 E2E 由 `pnpm --filter @cs2-analyst/desktop test:installed` 执行；它同时断言 `app.asar` 只含应用内容、renderer bundle 不含 Node/原生 parser、原生绑定以 unpacked 形式存在。

P5.6.1（2026-10-07）重新构建生产与测试 seam 安装包（均约 107.3 MB），补齐 P5.6 installed-app smoke，全 PASS。当前 ASAR 为 1.40 MB / 10 条目；原有安装、启动、注入防护、真实 DEM golden、损坏 DEM、中途关闭无残留 worker、卸载验证均通过，并新增安装版 Analysis Views（10 玩家、24 回合、CT/T golden）、Tab 往返保留 Timeline 展开状态，以及 Timeline / Analysis / Dropdown 长数字昵称原样展示断言。

## 已知限制

- 安装包未签名，首次运行可能触发 SmartScreen 提示。
- 仅支持 Windows x64：`prepare-pack.mjs` 固定 `win32-x64-msvc`，其他平台直接失败；NSIS 目标也只声明 `x64`。
- `disableAsarIntegrity: true`：electron-builder 的 ASAR integrity 重写会在 Electron 可执行文件刚复制完成时重写约 234 MB，与杀毒扫描竞争而间歇失败；Electron 只有在启用对应 fuse 时才校验该资源，本轮 unsigned 本地 MVP 关闭。
- 打包中间产物（`win-unpacked`）在系统临时目录，不进入仓库；仓库只保留 `installer`。

## 2026-10-08 — P5.6.5 Branding & App Icon — 已实现，用户授权提交（验收未全部完成）

- 正式产品名：CS2 Analyst；mark 为不带文字的 A/准星透明 PNG；lockup 为带 CS2-ANALYST 文字版。源文件来自用户 Downloads/cs2-analyst/logo.png 与 logo_with_appname.png，原图字节保留，项目路径为 apps/desktop/resources/branding/cs2-analyst-mark.png 与 cs2-analyst-logo.png。
- Windows icon 为真正 multi-resolution ICO：16/24/32/48/64/128/256；alpha 保留，原始画布完整保留，增加对称 4% safe area，独立 Lanczos 缩放。16/24/32 小尺寸图实查可辨，无重绘/改色/背景填充。
- titlebar：20px PNG mark + CS2 Analyst，object-fit:contain，40px 高度与 logo no-drag 保留；临时 target SVG 已删除。Renderer/favicon 使用 PNG，BrowserWindow dev/preview 使用相对 bundle 路径，安装版使用 extraResources runtime PNG；Windows/NSIS 使用同源 ICO。
- productName/executableName/shortcutName/uninstallDisplayName：CS2 Analyst。生产 App ID：com.evanpatchouli.cs2analyst；test seam：com.evanpatchouli.cs2analyst.testseam；Main AppUserModelId 同步。
- 用户追加要求全仓 rename：workspace 包统一 @cs2-analyst/*，bridge 为 window.cs2Analyst，环境变量/编译宏为 CS2_ANALYST_*；lockfile、脚本、测试、文档同步。物理 checkout 路径未搬迁。业务文件仅 import 标识替换，无 DEM/Analytics/Findings/Timeline/Analysis 算法修改，官方 kill-feed SVG 字节不变；provenance 提取目录改为项目相对 output 路径。
- PASS：pnpm typecheck 11/11、pnpm build 6/6、desktop 17/17、analytics 53/53、findings 17/17、dem-parser 28/28；test:report 真实/损坏/非 DEM 三场景；test:smoke dev/preview；pack:win、pack:win:test。真实 DEM golden 与 Findings 顺序未变。
- 产物：release/0.1.0/CS2-Analyst-Setup-0.1.0.exe（115186098 字节，109.9 MiB）；test seam .tmp/test-output/0.1.0/CS2-Analyst-TestSeam-Setup-0.1.0.exe（115186071 字节，109.8 MiB）。版本保持 0.1.0。ASAR 3.26 MiB / 82 条目 / 71 官方 SVG；runtime mark 与原图字节一致。
- 已实际验证：生产 EXE、installer、uninstaller 内嵌七尺寸图标 payload 与项目 ICO 一致；桌面/开始菜单快捷方式图标目标及 AppUserModelId；Programs/Apps DisplayName、DisplayIcon、卸载名称；DisplayIcon 指向 NSIS 安装的 uninstallerIcon.ico，字节与项目 ICO 相同。
- 未完成：完整 test:installed 首次在新增 DisplayIcon 路径断言失败（误以为应指向 EXE），已修正并对另一次生产安装验证通过，但完整生产/测试 seam installed regression 未重跑；任务栏/Alt+Tab/真实拖动视觉验收未完成，最终 rename 独立复审未完成。
- 用户按 Escape 停止 Computer Use，之后明确要求“没事，直接提交代码吧”；按此指令提交当前实现，不把整个 P5.6.5 冒记为 PASS。验收用生产安装版保留在 .tmp/branding-qa/installed-visual；installer/profile/logs 不入 Git。此前已完成一次壳层独立审查，未发现阻塞实现问题。

