# Current Task

Status: complete — P4.1 Findings MVP PASS

基线：`6e04f91c`，P3 Analytics public contracts 保持冻结。

- 在 packages/findings 建立纯确定性 Findings Engine；生产只依赖 Analytics，parser 仅真实 golden 的 devDependency。
- Finding schema：id / ruleId / playerId / category / severity / title / summary / evidence / relatedRounds? / confidence。
- 六类规则：CT/T ADR落差、低被交易比例、Opening正负贡献、Utility直接敌伤与已证明闪光助攻支援、Team flash纪律、Clutch单次highlight。
- 每名玩家最多3个问题、2个positive；priority稳定，无AI、UI、插件DSL或Analytics契约修改。
- twinkle实际默认：CT68.25 vs T114.50 ADR；4/18=22.2%被交易；23闪光投掷/10非零队友效果；R24 1v3获胜；4首杀/0首死。
- low-impact/consistency 因冻结API无逐玩家回合combat evidence跳过；actual flash duration、逐枚利用率、位置责任与道具战术价值不猜。
- 验证：Findings17/17、Analytics53/53、parser28/28；真实DEM全部执行、0 skipped；pnpm typecheck / build PASS。独立审查完成，修复重复flash evidence排序边界。
- 文档：docs/findings-engine.md、roadmap、analysis-rules、architecture、analytics-metrics、handoff已同步。
- focused commit 后交接；不自动开始下一阶段。完整schema、阈值、门控、ranking、golden及gap见 [Findings Engine](../docs/findings-engine.md)。
