# P2.2 Round Participation & Player State

## 数据来源与契约

使用锁定的 `@laihoe/demoparser2` **0.42.0**。证据文件为 `.demo/demo1.dem`，SHA-256 `f3c3173eae0cd100d15c81c3b734be792f9212256a9c99703b358d3434000852`。安装包声明的原生结果仍是 `any`；原生字段和类型仅在 dem-parser 内使用。

从非热身 `round_start`、`round_freeze_end`、`round_end` 提取去重 tick，查询 `parseTicks(bytes, ["team_num", "is_alive"], ticks)`。仅查询精确边界，不请求位置、全量 tick 或用邻近 tick 替代缺失边界。没有边界时不调用 parseTicks，避免空筛选意外变成全量采集。原生解析仍会扫描 DEM；有界的是返回和保留的状态数据，而不是随机读取文件。

`Round.stateSnapshots` 保存 `start` / `freeze_end` / `end` 三类已录制边界的快照，含 tick、availability、players 和 unidentifiedPlayerCount。每个 `RoundPlayerState` 包含：

- `steamId`：字符串身份。
- `side`：该快照的 CT/T 阵营；无法识别为 `Unknown`，不回退到 `Player.team`。
- `participant`：该瞬间属于 CT/T 名单为 true，明确未分队/旁观者（原生 0/1）为 false，未知阵营为 null。它不是网络连接标志，也不定义整个回合的 Analytics 分母。
- `alive`：原生布尔存活状态；缺失或非布尔为 null，不用事件缺席、HP、metadata 或前一回合推断。

`freeze_end` 是完整竞技回合初始活跃状态的首选证据；`start` 另存冻结期起点，两者不互相冒充。录制缺少 freeze end 时，消费者应明确选择 start 作为降低覆盖的替代或放弃该指标。缺少 start 的部分回合不能自动视为完整回合。末局 `end` 快照支持存活终点核验，避免把 post-round death/disconnect 纳入结束时状态。

无返回行的边界为 `availability: "unavailable"`，不表示零参与者。`observed` 只证明此 tick 有原生状态行，**不承诺完整 roster**。无法用唯一 SteamID 表示的行记入 unidentifiedPlayerCount；机器人、缺失状态、未知阵营、部分录制需由 Analytics 做覆盖门控。名单来自状态表，包含没有任何战斗事件的玩家；旁观者仍可出现在快照中。某玩家缺行不等于已断连。

同 tick 同 SteamID 去重；矛盾状态拒绝转换。同编号重开仅保留最终尝试的边界与生命周期。warmup 不进入正式回合。没有录制的边界不生成虚构快照。

## 离散生命周期

`Round.playerLifecycle` 独立于 P2.1 combat `events`：

| 原生事件 | 领域证据 | 限制 |
| --- | --- | --- |
| `player_spawn` | `spawn`，tick、player、事件 side | 出生事件；样本 live spawn 的 user_is_alive 可为 false，而同 tick 边界快照为 true，所以不据此伪造初始 alive 或回合内复活 |
| `player_disconnect` | `disconnect`，tick、player | 只记录实际事件；身份不可识别时 player 为 null |
| `player_team` | `side_change`，tick、player、side、previousSide、可选 disconnect | 新旧侧使用原生 team/oldteam；user_team_num 在换边事件里可能是旧侧 |

死亡仍由既有 `KillEvent` 表达。生命周期按既有回合规则归属，同 tick round_start 优先；结束后的事件保留在该回合，但 Analytics 必须应用 endTick 窗口。出生与 side_change 不自动创建全局连接状态机。

## 真实 DEM 证据与不能保证的内容

样本有 24 个正式回合。检查首回合、换边回合 13 和末回合 24 的精确 start tick（65 / 67110 / 131657）均得到 10 个名单成员、5 CT / 5 T、全部 alive=true；与 +1 的状态相同。精确 end tick（3413 / 71396 / 140769）分别有 3 / 1 / 1 人存活。round 13/24 的 end+1 没有行，因此不能采用统一 +1 偏移。

72 个精确边界返回 720 行：start 与 freeze_end 各 240/240 人存活，end 总计 60 人存活、180 人死亡。原生样本包含 240 个 player_spawn（10 个热身、230 个正式回合）、10 个 player_team 和 10 个 player_disconnect。换边事件全部在 round 13 start tick；事件 user_team_num 是旧侧，team/oldteam 才提供换边方向。断连事件全部在末回合 endTick 之后（140858–141740），不能用作回合内断连场景已经验证的证明。

查询 `is_connected` 返回数字 0；`connected` 未返回字段。当前没有足够证据解释连接状态枚举，生产模型不映射它们。样本没有 `player_connect` 或 `player_connect_full` 实际行，因此没有新增 connect/reconnect 领域事件，也不从再次出现、spawn 或 side_change 猜重连。首回合 start 同 tick 的 10 个 spawn 被原生标记为热身，所以正式 roster 不能由 spawn 数量推断；边界快照仍提供该回合完整 10 人状态。样本没有验证回合内重生的场景。只有实际 spawn 证据，不标记推测的 respawn。

捕获的原始字段样本见 [round-state-native.json](../packages/dem-parser/tests/fixtures/round-state-native.json)。它是有界证据集，不是完整 DEM。没有把 DEM 二进制提交到 Git。

## P3 开工边界

P3 可以开始设计和实现有明确覆盖条件的 Analytics。该完整竞技样本具备参与名单、逐回合阵营、初始/终点存活状态、死亡时间线和离散生命周期，补齐了 P2.1 的主要 roster 缺口。P2.2 不计算任何指标。

- KAST / Survival：先定义参与分母、freeze_end 初始状态、end 存活判据、assist/trade 规则；未知终点状态不能按“没有死亡”判活。
- Clutch：用起始名单、死亡和已观察生命周期推进状态；遇到未识别玩家、缺边界、未知状态或无法证明的中途连接/重生覆盖时，降低覆盖或不输出结论。边界快照不证明回合中间从未变化。
- CT/T split：使用该回合选定快照阵营，不使用全局 Player.team；处理中途换边需显式规则。
- Trade / opening：选择有效回合时间窗口、参与范围、同 tick 策略和 trade 时窗；不能把 post-round 事件默认计入。
- ADR：P3.1 已选定策略——保留 reported damage 原始证据，并用 `healthRemaining` 重建 victim HP 轨迹得到 standard effective damage；见 [指标口径、覆盖机制与 demo1.dem golden](./analytics-metrics.md)。P2.2 自身不计算指标，也没有新增独立的 pre-hurt 快照。

要支持任意模式、带 bot、回合内断连/重连/重生或异常 DEM 的无条件精准指标，仍需额外真实样本和覆盖验证。

## 验证

运行 `pnpm --filter @cs2-analyst/dem-parser test`、`pnpm typecheck` 和 `pnpm build`。原 P2.1 的 182 kills、730 hurts、4399 weapon fires、421 utility effects、282 flash victims、125 bomb events 固定断言继续保留；生命周期不混入 combat union 或统计。真实 DEM 重复解析验证整个 Match 确定性。缺 DEM 时原始 fixture 与合成边界回归测试仍执行。

API 参考：[上游 JavaScript 文档](https://github.com/LaihoE/demoparser/blob/main/documentation/js/README.md)。该文档随上游变化；本实现的字段证据以安装版本和真实输出为准。
