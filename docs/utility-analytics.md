# P3.3 Utility Analytics

基线 `d73e05b`。实现仅在 `packages/analytics`，依赖 `match-model`；无 parser/domain 契约变更。字段依据为仓库当前 P2.1 [原始事件证据与映射](./combat-event-evidence.md)，不新增或猜测 demoparser2 字段。

## 指标与 lifecycle

`analyzeMatch().players[].utility` 使用共享 `buildCoverage()` 的完整正式闭区间 `[startTick, endTick]` 与 `playsIn(player)`；warmup 已由 parser 排除，post-round 不进入计算。伤害 ledger 仍读取窗口内全部 hurt，友伤、自伤、world 伤害参与 HP 轨迹但不归属敌伤。阵营关系取事件 sides，不取 `Player.team`。

| 字段 | 精确定义 |
| --- | --- |
| `throws.observed` | 计入窗口中该玩家 grenade `WeaponFireEvent` release 行数，按 HE / smoke / flash / fire / decoy 归一；是观测行数，出现歧义时并非可确认总投掷数。 |
| `throws.counts` | 同一口径可确认的次数；窗口/参与不可用或归属不明则 null。同玩家、同 tick、同归一类型重复 release 无唯一 ID，无法判断重复采集还是不同投掷，该类型 null，保留所有行，不武断去重。其他类型仍可确认。 |
| `throws.molotov/incendiary` | 原始 `molotov` / `incgrenade` release 分别计数，合并归入 fire。fire release 歧义同时门控两个子类型。 |
| `effects` | 独立保留 `UtilityEvent`，**不贡献投掷次数**；没有 release 的 detonate/start_burn/start_decoy 也不补推投掷。 |
| `he/fire.reportedEnemyDamage` | 合规敌伤原始 `healthDamage` 和（可能含 overkill），不是有效伤害。 |
| `he/fire.resolvedEnemyDamage` | 复用现有 `isEligibleDamage()` 和 `buildDamageLedger().loss()` 的可确认敌方实际 HP-loss 子集，额外排除同 ID 自伤。 |
| `he/fire.enemyDamage` | complete 时为 resolved 总和；缺武器、未知 sides、HP-chain unresolved 或上下文不完整时 null。 |
| `flash.enemy/teammate/self.count` | 每一条该玩家造成的 `FlashEvent` 受害者效果计一次，包括 duration=0；一个手雷可闪多人，故不是 flash throws 或独立玩家人数。self 优先按相同 ID，其他关系要求双方 side 已知。 |
| `flash.*.reportedDurationSeconds` | 原始逐受害者 `blindDurationSeconds` 求和，仅作为原始证据（可能重叠、跨 round_end），不能作为实际持续致盲时间。 |
| `flash.*.blindDurationSeconds` | P2.1 未证实 reset/refresh/expiry 与死亡时终止语义，有正 duration 即 null、durationComplete=false。没有正 duration 且该分类 coverage 完整时为 0。不会通过简单累加或 interval union 冒充实际时间。 |
| `flash.*.effectiveCount` | 默认 null，无默认“有效闪”阈值。调用者显式传 `effectiveFlashThresholdSeconds`（有限且 >=0）后，完整分类中 reported duration >= threshold 的**受害者事件数**；并不声称 actual blind time。阈值回显于 `flash.effectiveThresholdSeconds`。 |
| `flash.assists` | 正式窗口内 `KillEvent.assistedFlash === true`，且复用 `isEligibleAssist()`：assister 为该玩家且非 killer、已知敌方击杀、assister 与 killer 同侧。缺 flag / flash-assist sides 未知时 null；不通过“闪后击杀”推断，不要求额外 FlashEvent 来覆盖可靠 death flag。 |

武器仅匹配显式 domain identifier，允许去掉 `weapon_` 前缀：`hegrenade`、`smokegrenade`、`flashbang`、`molotov`、`incgrenade`、`inferno`、`decoy`。`inferno` 仅为 fire damage/effect，绝非 release。原始 event.weapon 与 round/tick 保存在 evidence；inferno 不能推断 Molotov/Incendiary 来源，不猜 release-effect 关联。entityId 是可复用的 demo-local index，不用于全局去重；同 tick 对不同受害者的 flash 效果仍分别计数。同 tick 重复 victim 行也仅视作观测行，不能据 entityId 猜唯一 grenade。

## Coverage 与重叠

Utility coverage 位于 `utility.coverage`，按 metric 提供 complete；不会改变 P3.1/P3.2 的全局 issue 及已有数值。`count`、`observed`、`reported*` 与 `resolved*` 都是观测/可解子集，消费方必须检查对应 complete；nullable 的 counts/enemyDamage/assists 是可确认总量接口。Utility 总 complete 还要求 actual duration 完整，因此 demo1 有闪光的玩家总 coverage 为 incomplete，但 throws、damage、flash count、assist 独立保持 complete。

- `window-unavailable` / `participation-unconfirmed`：该回合不计算，所有 utility metric 不完整。当前策略保守：不能确认该回合参与（包括明确非参与）也不能给全场完整总量。
- `actor-unidentified`：窗口中 flash/utility 或已识别 utility damage 的 actor=null，不能排除属于该玩家，所有 utility metric 保守不完整。
- `roster-unidentified-players`：名单存在不可识别玩家，parser 可能省略对应 victim/shooter 事件，所有 utility metric 保守不完整；仍保留可识别事件的 observed evidence。
- `release-same-tick-ambiguous`：同玩家/tick/类型 release 多行，观测行保留、该类型 throws=null。
- `damage-weapon-missing`：该玩家 hurt.weapon 缺失，无法排除 HE/fire，两类不完整；`damage-side-unknown` / `damage-loss-unresolved` 只影响对应伤害类型。
- `flash-side-unknown`：非 self 效果关系未知，enemy/team count 不完整；self ID 仍可确认。
- `flash-assist-flag-missing` / `flash-assist-side-unknown`：该玩家的 death-assist 证据不足，assist 总量不可确认。
- `flash-assist-actor-unidentified`：非本人击杀、非自杀、非确认 teamkill 的 death.assistedFlash=true 却无 assister 身份，不能排除为该玩家助攻，assist=null。
- `flash-duration-unverified`：每条正 duration 行记一次，actual duration 不输出。
- `flash-overlap-possible`：在同回合、同 victim 的所有 thrower flash 行中，若之前或同 tick 的正 duration candidate interval 覆盖当前 tick，当前该玩家效果记一次（不按配对数累加）。这是 diagnostic，不能证明实际刷新行为或归属；其他玩家的 flash 也参与检查。duration 仍 null。
- `flash-clock-unavailable`：tickRate 非有限正数时不猜 candidate overlap，也不输出实际 duration；原始秒数与次数仍可保留。

Coverage 的“完整”仅相对于当前 parser 提供的 domain stream，不证明原始 DEM 事件全无丢失。parser 会省略无法识别 victim/shooter 的行，当前领域契约没有 feed-availability manifest；无法由事件缺席证明 source 完整。该限制沿用 P2.1，不新增虚假的采集覆盖声明。

## demo1.dem / twinkle golden

与 [P3 样本](./analytics-metrics.md) 相同 DEM、64 tick、24 正式回合；测试无硬编码生产规则。

| 指标 | 实现 | 人工参考 |
| --- | --- | --- |
| Flash / smoke / HE / incendiary / molotov / decoy throws | 23 / 14 / 10 / 9 / 2 / 1；fire=11 | 一致 |
| HE enemy HP loss | **96**；reported **112** | ≈98（差 -2，约 -2.0%） |
| Fire enemy HP loss | **54**；reported **49** | ≈54，一致 |
| Enemy effects / raw duration | **19 / 50.85360407829285s** | ≈19 / 50.9s，一致 |
| Teammate effects / raw duration | **10 / 24.592388570308685s** | ≈10 / 24.6s，一致 |
| Self effects / raw duration | **15 / 20.235921636223793s** | ≈15，一致 |
| Flash assists | **1**，R6 tick 28201 death flag=true | ≈1，一致 |
| Actual blind duration | **null**（三类均 durationComplete=false） | 人工累计数是 reported sum，不是去重后的连续时间 |

HE 精确对账：R2 tick5581=0；R8 tick43138=42；R11 tick59151 两名 victim=27+16；R16 tick83365=8；R17 tick91917=3，共 96。R17 reported=19，前序 HP chain 确认仅剩 3，overkill=16，故 reported112→effective96。另 R6 tick28456 的友伤27不计。与人工≈98 的余下2点无法由当前逐事件证据证明，不能擅自认定为某个舍入错误或调整 ledger 来迎合参考。Fire reported49→HP loss54 来自已复用的逐发整数余量确认；R24 自伤8不归属敌伤。

twinkle 正 duration 44 行；possible overlap 6 行：R4 team tick17194；R5 team tick23634/23723；R6 enemy 两名 victim 与 team 一名 victim tick28169。R5/R6 包含其他 thrower 的 preceding flash，说明只检查本人 flash 会漏掉重叠。原始总和保留用于人工对账，不展示为 actual blind duration。

## 验证

`pnpm --filter @cs2-coach/analytics test` 覆盖 release-only、stage 不重复计数、同 tick release 歧义、entity 复用、raw weapon 保留、enemy/friendly/self/world damage chain、overkill、broken chain、unknown weapon/side/actor、multi-victim/team/self flash、其他 thrower 重叠、unknown clock、显式阈值、death flag assist 与 proximity 拒绝、边界/参与门控、空事件、determinism 和真实 demo golden。

`pnpm --filter @cs2-coach/dem-parser test`、`pnpm typecheck`、`pnpm build` 为最终验收。未进入 Findings/UI/AI。

P3 Final Acceptance 追加跨模块 invariant 后，analytics **53/53 PASS**（P3.3 47 + Final Acceptance 5 synthetic + 1 real-demo cross-metric），dem-parser **28/28 PASS**，真实 DEM 均执行且 **0 skipped**；`pnpm typecheck`、`pnpm build` PASS，未变包使用 Turbo cache。独立审查提出的 unidentified roster 与缺失 flash assister 门控均已修复并加 regression。

Final Acceptance 下 utility 的既有 golden 不变：release counts、HE/fire effective、flash counts/duration、flash assist 均保持；新增 invariant 验证 HE/fire 有效伤害是玩家 `effectiveDamage` 的子集，且每一发的 `effectiveLoss` 之和等于 `resolvedEnemyDamage`。P3 Analytics Engine 至此 FINAL PASS，Analytics public contracts 冻结供 P4 Findings 使用。详见 [P3 核心指标文档](./analytics-metrics.md)。
