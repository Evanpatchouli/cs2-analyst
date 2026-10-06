# P4.1 Findings MVP

P4.1 PASS。基线 `6e04f91c`，P3 Analytics public contracts 保持冻结。

生产入口：`generateFindings(analytics: MatchAnalytics, playerId?: string): Finding[]`。
只依赖 Analytics 公共类型，不读取 Match/DEM、不重算指标、不调用 AI。省略 playerId 时按 SteamID 字符串顺序输出每名玩家的 Findings；传入未知 ID 返回空数组。每名玩家独立限额。

## Schema 与事实边界

`Finding` 包含 `id / ruleId / playerId / category / severity / title / summary / evidence / relatedRounds? / confidence`。

- id 是 `[matchId, playerId, ruleId]` 的 JSON 编码，避免分隔符碰撞；ruleId 是稳定规则标识，clutch 附回合号。
- severity：high / medium / low / positive。MVP 不强行产出 high；单场中等问题不代表长期能力。
- evidence：`{ metric, value, unit, round?, tick? }[]`。metric 记录冻结 Analytics 字段路径；team `nonzeroEffects` 是 Findings 对 teammate.evidence 的正原始 duration 行计数。原始 duration 单独保存用于复查 >0，绝非实际致盲时间。
- confidence：medium 表示充分覆盖的确定性启发式解读；high 仅用于已证实的单次 clutch win。不是统计概率或未来胜率。
- title / summary 简述本场事实、确定性解读与复盘意义；不推断长期习惯、人格或未经验证的失败原因。
- 仅 event 类证据附 round/tick；聚合指标不虚构相关回合。每次返回新对象，不修改 Analytics。

## 规则、阈值与门控

这些阈值是保守 MVP 策略，未经跨地图/分段人群校准，不是职业或同段位基准。常量在 `findingThresholds`，无配置后台或 DSL。

| 规则 | 最小样本与触发条件 | 门控 / 解释边界 |
| --- | --- | --- |
| side-impact.ct-gap / t-gap | 每侧 >=8 回合；强侧 ADR - 弱侧 ADR >=25，且弱侧 ADR <=强侧的70% | 两侧标准 ADR 非 null，玩家没有 unresolved HP 或未知 sides 伤害，侧回合和=roundsPlayed；证据附双方 kills/deaths，但不让 K/D 单独触发 |
| trade.low-rate | tradeableDeaths >=8，tradeRate <30% | trade.complete、available、rate 非 null；记录实际 tradeWindow.seconds；存活队友不证明可补枪距离，也不归责个人站位 |
| opening.positive / negative | 可归属 duels >=4；winRate >=0.75 / <=0.25 | winRate 是 0..1 ratio；整场无 contested / unattributed opening；不把首杀效果扩大为整回合结果 |
| utility.damage-low / high | HE+fire throws >=8；有效敌伤/throw <10 / >=30 HP | 两类 counts 非 null，he/fire.complete，enemyDamage 非 null；低收益只描述直接敌伤，不能否定封路/拖延价值 |
| utility.flash-high | flash throws >=8，enemy victim effects >=12，effects/throw >=1.5，confirmed assists >=3 | enemy.complete、assistsComplete、assists 非 null、throws 非 null；效果数包含零 duration 行，助攻必须由 Analytics death flag 证明 |
| team-flash.frequent-effects | flash throws >=8，正原始 duration 的 teammate effects >=5，effects/throw >=0.3 | teammate.complete、throws 非 null；保存每行 victim/round/tick/raw duration；一个投掷可闪多人，比值不是误闪投掷百分比 |
| clutch.win.rN | 单条 opportunity 的 won===true 且 player 对应当前玩家 | Analytics resolver 已排除不可靠回合；其他回合缺证据不否定已证明的赢局；不推导长期 clutch 能力 |

这是六类规则（side / trade / opening / utility / discipline / clutch），utility 包含伤害和明确闪光支援分支。

side / trade / opening 额外拒绝缺正式窗口、未确认参与、名单 start 回退、unidentified roster。Opening 缺独立 complete，所以用公共 coverage issue 保守门控；一个别人的 contested round 也会抑制整场 opening 解读。Utility 按所需 metric 门控，不使用 `utility.coverage.complete`：实际 duration 未获证实不会污染已确认的 throws/damage/count/assist。

## 默认 Ranking

玩家按 SteamID 的 UTF-16 字符串顺序；不使用 locale、随机数、时钟或输入数组顺序。

问题先按 high → medium → low，再按 side-impact → trade → discipline → opening → utility，最后 ruleId 字符串消歧。每名玩家最多 3 个问题。

positive 另外保留最多 2 条：clutch 优先（对手数降序，同对手数回合升序），然后 opening，最后 utility（ruleId 消歧）。输出先问题，再亮点。超出限额的候选直接省略，无额外规则系统/API。

## demo1 / twinkle

真实 golden 只锁 match hash、稳定 ID、数值和回合/tick 证据，不锁标题/summary。P5.2.1 只改写用户可见的中文标题与 summary（去掉 trade/traded/tradeable、duration、win/loss 等直译），ruleId、阈值、排序、evidence 结构与数值完全不变。

| 默认顺序 | Finding | 稳定证据 |
| --- | --- | --- |
| 1 | CT 方 ADR 明显低于 T 方 | CT 68.25 ADR，10/10 K/D；T 114.50 ADR，15/10 K/D；各12回合 |
| 2 | 死亡后队友补枪偏少 | 18 → 4 次补枪 =22.222…%，完整 coverage，5秒补枪窗口 |
| 3 | 本场多次闪到队友 | 23 次闪光投掷，10 次明确闪到队友；R4/5/6/8/12/16/24 |
| 4 | R24 1v3 残局获胜 | 形成 tick135415，T，opponents3，won=true |
| 5 | 本场首杀对决贡献突出 | kills4/deaths0，duels4，winRate1 |

HE/fire 有效敌伤150 / throws21 =7.14 HP/throw，满足 low 直接收益候选，但被三个 medium 问题挤出默认结果。flash assists1，不触发高价值支援分支。没有 demo/玩家数值硬编码在生产实现中。

## Future Analytics gaps

- **Low-impact / consistency 跳过**：冻结 MatchAnalytics 没有逐玩家逐回合通用有效伤害、kill/assist 及其完整性输出。Utility 的逐事件 damage 不能冒充全部 combat evidence；multiKills 聚合不能证明零影响回合。需未来独立 Analytics 迭代，当前不反向修改 P3。
- **实际闪光时间、低 flash 利用率跳过**：原始 duration 不能证明连续致盲、死亡终止或重叠归属。enemy effects/throws 不能证明每枚投掷是否有效，零 duration 也不能推成成功致盲；不根据低 count 单独产出负面 flash 结论。
- **Utility 战术价值、trade 位置责任**：没有封路/拖延/距离/视线/站位证据，只输出可证明的直接结果，不解释为意识差或长期习惯。
- parser 没有源 feed completeness manifest；所有完整性沿用 P3 对当前 domain stream 的定义，不声称 DEM 全无丢事件。

## 验证

- Findings 17/17：16 synthetic +1 demo1 golden，0 skipped；threshold 两侧、最小样本、null/incomplete、positive/negative、排序/限额、输入不变与 determinism（含同 tick/victim 不同 raw duration 的重复行消歧）。
- Analytics 53/53；dem-parser 28/28；真实 DEM 全部执行，0 skipped。
- `pnpm typecheck`、`pnpm build` PASS。
- 独立 reviewer 检查 coverage、单位、边界、包依赖与 evidence。生产依赖只有 Analytics；parser 是真实 golden 的 devDependency。
