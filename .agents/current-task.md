# Current Task

Status: complete — PASS — P5.6.4 Custom Window Chrome，基线 b353b325b232334d4a01e75a25fc5853220dc017。

- Windows x64 / Electron / 0.1.0；frame:false，原安全开关不变，无 titleBarOverlay / native menu。
- Fluent UI v9 40px 全宽标题栏，原创20px currentColor target mark + CS2 Coach；46×40px 三窗口按钮 / 16px本地SVG / 双矩形还原。
- DesktopApi只新增window五项API；四IPC与report:import共用current-window/main-frame校验。Main通知真实maximize/unmaximize；Renderer订阅先于初始查询，清理监听、防落后响应。
- 持久标题栏在报告error boundary外；仅内容区滚动，不挤入窗口按钮。1120px内容上限与原间距不变。
- typecheck11/11、build6/6、desktop17/17、analytics53/53、findings17/17、parser28/28；dev/preview smoke通过。真实demo1/损坏/非DEM原脚本及完整pnpm test:report串行重跑通过；一次并行验证退出超时原因未证实，无产品修补。
- 实机双击max/restore、Win+↑↓、minimize/activate restore、三个hover、真实1280×800 / 900×760 / 800×600截图与无横向overflow通过；截图系统临时cs2-coach-p564-qa不入Git。
- 最终两pack均107.5MB；installed生产/测试两版完整链路全部通过（含caption close中途worker清理与卸载）。独立review修复错误页丢失标题栏P2，复审无actionable缺陷。
- 真实鼠标拖动由用户实测确认正常，补齐最后一项验收；Computer Use drag未取得位移证据，未把自动化失败冒记为成功。
- 全部验收完成，Roadmap PASS；唯一focused commit：feat(desktop): add custom Windows title bar，不amend/squash、不push。详细验证记录见docs/desktop-report.md与.agents/handoff.md。
