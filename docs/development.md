# 开发与构建

在项目根目录使用 PowerShell 7 执行命令。需要 Node.js 22.12+ 和 pnpm 10.0.0。

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 使用 electron-vite 构建主进程和 preload，启动渲染页面开发服务器，并打开 Electron 桌面窗口。关闭窗口后退出应用，停止开发命令使用 Ctrl+C。

根目录脚本通过本地 Turbo `^2.11.6` 调度工作区任务，无需全局安装 Turbo。`dev` 和 `start` 是持续运行且不缓存的任务，`test:smoke` 每次实际执行；构建缓存包含 `dist/**`，共享的 `tsconfig.base.json` 变化会使缓存失效。配置方式参考 [Turborepo 任务文档](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks)。

```powershell
pnpm typecheck
pnpm build
pnpm start
```

DEM parser 的安装、调用与测试见 [DEM 解析（P2.2）](./dem-parser.md)。核心包 `match-model`、`dem-parser` 和 `analytics` 已纳入根目录构建与类型检查；运行 parser 的测试使用 `pnpm --filter @cs2-coach/dem-parser test`，运行 analytics 的合成、覆盖与真实 DEM golden 测试使用 `pnpm --filter @cs2-coach/analytics test`。指标口径见 [P3 核心指标、KAST / Trade / Clutch 与覆盖机制](./analytics-metrics.md)。

桌面链路测试见 [桌面比赛报告](./desktop-report.md)：`pnpm --filter @cs2-coach/desktop test` 在 Node 中运行 parser → analytics → findings → report DTO 的集成测试；`pnpm --filter @cs2-coach/desktop test:report` 构建应用并通过 Electron 调试协议运行端到端 smoke（真实 demo1.dem 与损坏 DEM）；`pnpm test:smoke` 仍验证开发/生产模式的页面、preload 桥接与关闭流程。

`pnpm test:smoke` 会构建应用，并通过 Electron 调试协议验证开发模式和本地生产模式的 React 页面、preload 桥接、资源加载及窗口关闭。测试会临时打开桌面窗口，结束后清理测试进程。

构建产物位于 `apps/desktop/dist/`，包含 `electron/main.js`、`preload/index.cjs` 和 `renderer/index.html`。`pnpm start` 先通过 Turbo 完成构建或恢复构建缓存，再运行本地页面，无需启动开发服务器。当前构建生成可运行的应用代码，不生成安装包。

依赖使用明确的 `^版本号` 范围，实际安装版本由 `pnpm-lock.yaml` 固定。electron-vite 5 的 Vite peer 范围最高为 7，因此使用 Vite 7。根目录 `package.json` 的 `pnpm.onlyBuiltDependencies` 允许 esbuild 执行安装脚本。`dev` 和 `start` 在启动前调用 `install-electron` 准备 Electron 44 运行时，首次运行需要联网；已有运行时会跳过下载。
