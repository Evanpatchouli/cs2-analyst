# Current Task

Status: complete — P5.2 Windows Packaging & Installable MVP PASS

基线：`58b0dc0`（P5.1 End-to-End Desktop Report PASS）；P3 Analytics 契约、P4 Findings 阈值与 P5.1 报告 UI 未改动。

- 打包：`apps/desktop` 接入 electron-builder 26 + NSIS；Windows x64、per-user、可选安装目录、桌面与开始菜单快捷方式、独立卸载器；应用名 `CS2 Coach`，版本沿用 `0.1.0`。配置 `apps/desktop/electron-builder.config.cjs`，流程编排 `apps/desktop/scripts/build-installer.mjs`。
- 产物：`apps/desktop/release/CS2-Coach-Setup-0.1.0.exe`（107.3 MB）；仅测试构建 `apps/desktop/release/test-seam/CS2-Coach-TestSeam-Setup-0.1.0.exe`。打包在系统临时目录完成，仓库只保留安装包。
- Utility Process 依赖：打包构建（`CS2_COACH_PACK=1`）把 5 个 `@cs2-coach/*` 包 inline 进 `dist/electron/report-worker.js`（75 kB），`@laihoe/demoparser2` 保持 external；`scripts/prepare-pack.mjs` 把 loader 与平台原生包复制到 `dist/electron/node_modules`，`asarUnpack: ["**/*.node"]` 让 3.9 MB `.node` 落到 `app.asar.unpacked`。非打包构建保持 external，`pnpm dev` / `start` / `test:report` 仍走 workspace symlink。
- 路径：report-worker / preload / renderer / native 全部相对 bundle 位置解析，兼容 `app.isPackaged === true`；构建期校验 worker 无 workspace external、生产 `main.js` 无 seam 变量。
- seam：`CS2_COACH_DEM_PATH` 仅非打包构建；`CS2_COACH_TEST_DEM_PATH` 仅 `CS2_COACH_TEST_SEAM=1` 构建，生产包中该分支被 define 消除并被构建脚本断言不存在。
- 安装版 E2E `scripts/installed-app-smoke.mjs`：静默安装/卸载、asar 条目白名单（仅 `dist/**` 与 `package.json`）、原生 unpacked、Renderer 无 Node、启动关闭、注入无效、demo1 报告、分析中途关闭无残留 worker、损坏 DEM 不白屏。
- 验证：`pnpm typecheck`、`pnpm build`、analytics 53/53、findings 17/17、dem-parser 28/28、desktop Node 集成 3/3、desktop `test:report`、`pnpm test:smoke`、installed-app smoke 全 PASS。
- 文档：新增 `docs/windows-packaging.md`；同步 roadmap、architecture、development、desktop-report、current-task、handoff。
- 非目标保持：代码签名、自动更新、GitHub Release、CI 发布、macOS/Linux、拖拽、timeline、图表、AI Coach 均未开始。
- focused commit 后交接；方案、安装包内容、路径与限制见 [Windows 打包与安装](../docs/windows-packaging.md)。
