# P6 新会话实施提示词

下方为最初实施任务原文，现保留用于追溯。2026-10-15 已执行至P6.4，本机实际范围、结果和限制见
[实施记录](./replay-implementation.md)。执行中用户进一步明确：仅用现有`spirit-vs-faze-m3-dust2.dem`作真实验收，
初次验收素材仅本机个人非商业使用；完成后提交并推送代码。2026-10-16用户进一步明确将地图资源一并提交/推送，五张PNG与四份原overview纳入仓库。下方原文不覆盖这些后续指令。

```text
请在 C:\Users\31250\Work\cs2-analyst 中实施 P6「2D 地图回放」。本请求开始实施，不只做方案或资源调研；按可独立验证的子阶段持续推进。

先读取用户级 C:\Users\31250\.agents\agents.md、项目 AGENTS.md、适用的 .agents/workflows/ 与 .agents/routing/model-routing.md，以及：
- docs/replay-technical-route.md（本次实施的技术路线与验收依据）
- docs/roadmap.md、docs/architecture.md
- docs/spatial-evidence.md、docs/dem-parser.md、docs/desktop-report.md、docs/demo-fixtures.md
先确认 git status、现有源代码与实际 fixture，说明简短计划；历史文档旧状态不覆盖当前路线图和最新验收结论。

目标：官方雷达底图/overview 配置 + 独立连续回放采样与精确事件 + 按回合分块 IPC + Canvas 2D 播放；React/Fluent UI v9 控件；支持播放/暂停、倍速、seek、回合/玩家/楼层切换及现有证据联动。

这台机器没有安装 CS2，不存在可读取的本地游戏素材。不要扫描 Steam/CS2 目录，不擅自安装游戏。资源优先研究从 Valve 分发内容提取，工具可用 DepotDownloader、Source2Viewer；备选为固定版本的 awpy-data、cs2-map-icons。先重新核对来源及当前可用性，不称社区发布包为 Valve 官方接口。不运行未经审查的下载脚本，不默认 main/latest 或 README 假设正确。

按 docs/replay-technical-route.md 的 P6.0～P6.4 推进：先验证资源来源、配套文件、版本/摘要、Dust2 多点配准与采样性能，并固定验收预算，再实现地图基础、Nuke 楼层、回放契约/采样/有界缓存/传输、播放器、回归及安装版验收。Dust2 为首个纵向切片，Nuke/Inferno/Mirage 按路线验证；Train 不在范围内。未确认地图版本要明确标示，不能按地图名认定最新底图正确。

保留现有 parser/领域/分析边界：native 仅由 dem-parser 查询；领域契约归 match-model，展示 DTO 归 report-contract；解析/缓存放 Utility Process，Main/preload 校验会话和受信 IPC，Renderer 只投影/显示。调查现有 worker 生命周期再扩展。新增回放采样不冒充旧稀疏证据，不改 P3/P4/Deep Review 算法、阈值或 golden。按领域模型工作流说明必要新增契约和兼容影响，再按本路线实现；不进行无关重构。

位置插值仅作展示，不跨缺失段、死亡/重生/断连或回合边界，不写回分析事实；离散状态依据已验证事件/状态，保留 same-tick/未知；随机 seek 可重建目标块状态。道具只展示有证据的能力，不捏造轨迹、烟火边界、LOS 或战术结论。所有个人 DEM 处理在本地，不依赖 P8 后端，不加入热力图、AI、登录、历史库或 3D。

运行相关边界/集成测试、pnpm typecheck、pnpm build，验证真实 Electron 和相关 Windows 安装版：地图离线装载、无 CS2/源码目录依赖、原报告不回归、播放/seek/块边界、缺失数据、重复导入/取消/清理、IPC 安全及性能预算。真实样本缺失时说明，不自动下载 DEM，不用合成测试冒充真实验收。记录实际结果、未执行项目和阻塞，不虚构 PASS。

遵循项目的非平凡改动独立复核与提交要求：每个独立验证通过的工作单元创建聚焦 Git commit，按 P6 分段继续；不 push、amend 或启动其他阶段。同步路线图与实际实施记录，最终简短汇报完成阶段、修改文件、测试证据、提交及剩余限制。若确实需要偏离已确定路线，说明影响和原因后再讨论，不自行扩大范围。
```
