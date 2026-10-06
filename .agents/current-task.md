# Current Task

Status: complete — P5.2.1 Product Polish PASS

基线：`58a7abd`（P5.2 Windows Packaging & Installable MVP PASS）；不改 Analytics、不改 Findings 阈值/排序/契约、不做 UI 结构或功能改动。

- 发布目录：安装包统一归档到 `release/<version>/`（当前 `release/0.1.0/CS2-Coach-Setup-0.1.0.exe`），版本号取自 `apps/desktop/package.json`；测试 seam 产物移到 `.tmp/test-output/<version>/`，不再混入正式 release。`build-installer.mjs`、`installed-app-smoke.mjs`、`.gitignore` 与文档同步。
- 平台约束：roadmap / architecture / windows-packaging 明确 **Supported platform: Windows x64 only**；`prepare-pack.mjs` 移除 darwin/linux/arm64 triple 映射，非 win32-x64 直接报错，不再保留跨平台 packaging 逻辑。
- UI 术语中文化（纯展示层）：ADR（每回合平均有效伤害）、HS%（爆头率）、KAST（回合贡献率）、Trade rate（死亡后队友补枪率）、Trade kills（补枪击杀）、Opening（首杀对决）、Clutch（残局）；严重度徽章 high/medium/low/positive → 高/中/低/亮点。
- 道具区：Utility/Flash/Smoke/HE/Incendiary/Molotov/Decoy → 道具/闪光弹/烟雾弹/高爆手雷/燃烧弹/燃烧瓶/诱饵弹；HE 敌伤/燃烧敌伤 → 高爆手雷对敌伤害/燃烧伤害（单位改为“点”）；受闪说明改写为不含 duration 的自然中文。
- 残局面板标题改为“残局”，结果只显示“成功 / 失败 / 结果未知”，未新增“惜败”推断。
- Trade 文案：指标卡改为“死亡时仍有队友存活：18 / 队友成功补枪：4”，不再出现“可交易死亡”；`trade.low-rate` 标题改为“死亡后队友补枪偏少”，summary 改为自然中文并附“存活不等于具备补枪位置”的解释。
- Findings 文案：只改 title/summary；`side-impact.*` 改为“X 方 ADR 明显低于 Y 方”，utility 伤害/闪光与 team-flash 的直译（HE、duration、非零等）全部改写；ruleId、阈值、排序、evidence 结构、数值不变。
- Findings 证据展示层中文化：metric 路径映射为中文指标名，unit 映射为中文单位（flag → 是/否，ratio/percent → %），数据契约不变。
- 覆盖告警文案：`apps/desktop/electron/report.ts` 的 coverage notes 去掉 ADR / KAST / Trade / Clutch 直译。
- 验证：`pnpm typecheck`、`pnpm build`、analytics 53/53、findings 17/17、dem-parser 28/28、desktop Node 集成 3/3、desktop `test:report`、`pnpm test:smoke`、installed-app smoke 全 PASS；twinkle demo1 数值与 Findings ruleId 完全不变。
- 非目标保持：不改 Analytics、不加新规则、不加“惜败”判定、不做 timeline/历史/自动扫描/AI、无 UI 大改版。
- focused commit 后交接；发布目录与平台约束见 [Windows 打包与安装](../docs/windows-packaging.md)。
