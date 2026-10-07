# Current Task

Status: implemented — user-authorized commit — P5.6.5 Branding & App Icon；完整安装回归与部分原生视觉验收未完成。

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

