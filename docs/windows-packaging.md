# Windows 打包与安装（P5.2）

P5.2 把 P5.1 的桌面链路做成真正可安装、脱离 pnpm workspace 也能运行的 Windows 版本：

```text
Windows installer
→ 安装 CS2 Coach
→ 开始菜单 / 桌面启动
→ 选择 .dem
→ Utility Process 解析 → Analytics → Findings
→ 与开发环境一致的报告
```

不引入发布系统：不签名、不自动更新、不做 GitHub Release、不构建 macOS/Linux。

## 方案

- 打包工具：**electron-builder 26 + NSIS**，配置在 `apps/desktop/electron-builder.config.cjs`。
- 目标：Windows **x64**，per-user 安装（无需管理员），`oneClick: false` 且安装时可选择目录。
- 应用名 `CS2 Coach`，版本沿用 `apps/desktop/package.json`（`0.1.0`），appId `com.evanpatchouli.cs2coach`。
- 桌面与开始菜单快捷方式、独立卸载器（`Uninstall CS2 Coach.exe`）。
- 复用工作区已安装的 Electron 运行时（`electronDist` 指向 `node_modules/electron/dist`），首次打包只需联网获取 NSIS 组件。
- 打包在系统临时目录完成，只把最终安装包复制到 `apps/desktop/release/`：工作区文件 watcher 会占用新建的 `app.asar`，在仓库内原地重建会让 electron-builder 无法重置输出目录。

```powershell
pnpm --filter @cs2-coach/desktop pack:win        # 生产安装包
pnpm --filter @cs2-coach/desktop pack:win:test   # 仅测试构建启用安全 seam 的安装包
pnpm --filter @cs2-coach/desktop test:installed  # 安装 → 驱动安装版 → 卸载 的 smoke
```

内部流程由 `apps/desktop/scripts/build-installer.mjs` 编排：`electron-vite build` → `scripts/prepare-pack.mjs` → 构建期校验 → `electron-builder`。

## Utility Process 的依赖处理

这是本轮的核心问题：开发环境里 `report-worker.js` 通过 pnpm workspace symlink 解析 `@cs2-coach/*`，安装后这些链接不存在。

| 依赖 | 打包方式 |
| --- | --- |
| `@cs2-coach/dem-parser` / `match-model` / `analytics` / `findings` / `report-contract` | **打进 worker bundle**（`report-worker.js` 约 77 kB），发布版不再有 `import "@cs2-coach/..."` |
| `@laihoe/demoparser2` | **external**，运行期从 worker 同级 `node_modules` 解析 |
| `demoparser2.win32-x64-msvc.node` | **原生 addon**，随安装目录以 asar-unpacked 形式分发 |

- `electron.vite.config.ts`：`main.build.externalizeDeps = { exclude: [五个 workspace 包], include: ['@laihoe/demoparser2', '@laihoe/demoparser2-win32-x64-msvc'] }`。
- `apps/desktop/scripts/prepare-pack.mjs`：在 electron-vite build 之后，把 loader 包（`index.js` / `index.d.ts` / `package.json`）与平台原生包（`.node`，约 3.9 MB）复制到 `dist/electron/node_modules/`，与 worker bundle 同级。Node 从 worker 目录向上查找 `node_modules`，命中的就是这份随包分发的副本；loader 的 fallback `require('@laihoe/demoparser2-win32-x64-msvc')` 与开发环境走的是同一条代码路径。
- electron-builder `asarUnpack: ["**/*.node"]`：`.node` 落在 `resources/app.asar.unpacked/...`，因为原生绑定无法从 asar 内部 dlopen。
- 构建期校验（`build-installer.mjs`）会在打包前失败：worker bundle 仍 external 引用 workspace 包、worker 未引用原生 parser、或生产 `main.js` 含测试 seam 变量。

## 安装包内容

`app.asar` 只包含 `dist/**` 与 `package.json`；生产依赖不会进 asar（worker 与 renderer 都已 inline），因此不含 monorepo 源码、`pnpm store`、`.demo/demo1.dem`、`.git` 或开发 secrets。安装目录实测结构：

```text
CS2 Coach.exe
resources/app.asar                                    1.26 MB / 10 个条目
resources/app.asar.unpacked/dist/electron/node_modules/
  @laihoe/demoparser2-win32-x64-msvc/demoparser2.win32-x64-msvc.node   3.9 MB
Uninstall CS2 Coach.exe
```

Renderer bundle 不含 `demoparser2` / `laihoe` / `@cs2-coach/*`，桌面与开始菜单快捷方式由 NSIS 创建。

## 路径兼容

所有路径都相对打包后的 bundle 位置解析（`import.meta.url`），没有硬编码开发目录：

- Main：`./report-worker.js`（Utility Process fork）
- Main：`../preload/index.cjs`
- Main：`../renderer/index.html`
- worker：`dist/electron/node_modules/@laihoe/...`（Node 模块解析）

`app.isPackaged === true` 下与开发环境行为一致，仅测试 seam 不同。

## 测试用路径注入

- `CS2_COACH_DEM_PATH`：**仅非打包构建**生效（`!app.isPackaged`）。
- `CS2_COACH_TEST_DEM_PATH`：只在 `CS2_COACH_TEST_SEAM=1` 的测试构建中编译进去；生产构建里 `__CS2_COACH_TEST_SEAM__` 被 `define` 成 `false`，Rollup 消除该死分支，`build-installer.mjs` 再断言生产 `main.js` 不含该变量。

因此正式安装版不存在任意路径注入能力，只能通过原生文件对话框选择 DEM；测试 seam 只用于自动化安装版 E2E。

## 安装版 E2E

`scripts/installed-app-smoke.mjs` 真正安装并运行安装版应用：

1. 静默安装生产安装包 → 校验 `CS2 Coach.exe`、`resources/app.asar`、unpacked 原生绑定、asar 条目白名单、快捷方式、renderer 无 Node。
2. 启动安装版 → 校验 React 页面、preload 桥接、无 `window.require` / `window.process`，关闭后退出码为 0。
3. 带 `CS2_COACH_DEM_PATH` 与 `CS2_COACH_TEST_DEM_PATH` 启动生产版并点击“选择 DEM” → 15 秒内不得自动出报告，证明注入无效。
4. 卸载生产版。
5. 安装测试 seam 安装包 → 真实 `demo1.dem` 报告断言。
6. 分析进行中关闭窗口 → 不得残留 analysis worker（`tasklist` 无 `CS2 Coach.exe`）。
7. 损坏 DEM → 显示错误且保留“重新选择 DEM”，不白屏。
8. 卸载测试 seam 安装包。

## 实测结果（2026-10-07）

| 项目 | 结果 |
| --- | --- |
| 生产安装包 | `apps/desktop/release/CS2-Coach-Setup-0.1.0.exe`，107.3 MB |
| 测试 seam 安装包 | `apps/desktop/release/test-seam/CS2-Coach-TestSeam-Setup-0.1.0.exe`，107.3 MB |
| 安装目录（本项目 smoke 使用） | `E:\cs2-coach\.tmp\installed-smoke\app-production` / `app-test-seam`；默认安装位置为 `%LOCALAPPDATA%\Programs\CS2 Coach` |
| `app.asar` | 1.26 MB，10 个条目，全部为 `dist/**` 与 `package.json` |
| 原生 parser | `resources/app.asar.unpacked/dist/electron/node_modules/@laihoe/demoparser2-win32-x64-msvc/demoparser2.win32-x64-msvc.node`，3.9 MB |
| worker bundle | `dist/electron/report-worker.js`，75 kB，无 `@cs2-coach/*` external |
| 快捷方式 | 开始菜单 `…\Start Menu\Programs\CS2 Coach.lnk` 与桌面 `…\Desktop\CS2 Coach.lnk` |
| 安装版 demo1.dem | twinkle 25/20/4、ADR 91.38、KAST 75%、Trade 22.2%、R24 1v3 win、5 条 Findings、比分 13 : 11，与开发环境一致 |
| 损坏 DEM | 显示“无法分析此 DEM”并保留“重新选择 DEM”，不白屏 |
| 分析中途关闭 | 应用退出码 0，`tasklist` 无残留 `CS2 Coach.exe`（含 Utility Process） |
| 注入防护 | 生产版带 `CS2_COACH_DEM_PATH` / `CS2_COACH_TEST_DEM_PATH` 启动并点击“选择 DEM”后 15 秒内不自动出报告 |
| 卸载 | 生产版与测试 seam 版静默卸载均成功，可执行文件移除 |

安装版 E2E 由 `pnpm --filter @cs2-coach/desktop test:installed` 执行；它同时断言 `app.asar` 只含应用内容、renderer bundle 不含 Node/原生 parser、原生绑定以 unpacked 形式存在。

## 已知限制

- 安装包未签名，首次运行可能触发 SmartScreen 提示。
- 只验证 Windows x64；`prepare-pack.mjs` 已列出 darwin/linux/arm64 的 triple 映射，但未实测。
- `disableAsarIntegrity: true`：electron-builder 的 ASAR integrity 重写会在 Electron 可执行文件刚复制完成时重写约 234 MB，与杀毒扫描竞争而间歇失败；Electron 只有在启用对应 fuse 时才校验该资源，本轮 unsigned 本地 MVP 关闭。
- 打包中间产物（`win-unpacked`）在系统临时目录，不进入仓库；仓库只保留 `installer`。
