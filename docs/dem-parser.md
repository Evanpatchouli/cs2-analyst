# DEM 解析（P2.2）

`packages/dem-parser` 在 Node.js / Electron 主进程中读取本地 CS2 DEM。当前实现使用 `@laihoe/demoparser2` 0.42.0 的平台原生模块，返回 `packages/match-model` 定义的 `Match`。

## 使用

```ts
import { Demoparser2Provider } from "@cs2-coach/dem-parser";

const parser = new Demoparser2Provider();
const match = await parser.parse("E:/demos/match.dem");
```

公开入口提供 `DemoParser` 接口和 `Demoparser2Provider`。上游函数、原始结果及 converter 均不从包入口导出。

转换路径：`Demoparser2Provider → Demoparser2Adapter → convertToMatch → Match`。只有 adapter 调用原生库；converter 验证原始结果并完成所有领域映射。无数据库、UI 或分析规则依赖。

原生 API 同步执行解析；`parse()` 的 Promise 接口不代表解析已移至后台线程。当前一次读取整个文件到内存，对同一份字节快照查询 header、玩家和事件，并生成 SHA-256 内容 ID；相同 DEM 的路径或文件名变化不改变 ID。大型文件的内存占用和主进程调度需要在后续导入集成阶段评估。

## 映射规则

- `map_name → Match.map`。缺少地图名称时报错，不生成占位 Match。
- SteamID64 全程保留为字符串，玩家按 ID 去重。元数据可能反映结束时阵营，因此 `Player.team` 优先表示玩家首次正式事件中的阵营；没有事件阵营时回退到元数据，无法识别时为 `Unknown`。这不是每回合阵营历史。
- 热身事件不计入回合。回合优先使用显式的一基 `round`，否则由 `round_start.total_rounds_played + 1` 定位；`round_end` 更新当前回合，支持真实 DEM 中的数值 `2/3` 和字符串 `T/CT` 胜方。
- 回合结束后的事件仍归入当前回合，直到下一次 `round_start`；未结束的回合胜方为 `null`。同编号的回合重开丢弃上一尝试，重复的同 tick 开始事件不清空记录。
- 击杀转换为 `KillEvent`，保留 killer、victim、weapon、headshot，补充事件阵营、assister、assisterSide、assistedFlash。双方身份与阵营已知时计算 teamkill，排除自杀。无法识别 killer 时保留旧 `"world"` 标识；它不对应玩家，也不能证明是环境死亡。
- `player_hurt → DamageEvent` 保留伤害、剩余 HP/护甲、武器、hitgroup、双方阵营；`weapon_fire → WeaponFireEvent` 保留 shooter、阵营、weapon、silenced，包含刀和投掷物释放。伤害可能包含过量伤害，不直接等于有效 HP 损失。
- 烟雾、HE、闪光、燃烧和诱饵生效事件映射为 `UtilityEvent`，保留种类、动作、thrower、阵营、实体索引及可用的单次效果坐标。`player_blind → FlashEvent` 保留逐受害者持续时间、攻击者、双方阵营及实体索引。
- 炸弹拾取、掉落、开始安放、完成安放、开始拆除、完成拆除和爆炸映射为 `BombEvent`。保留关联玩家、阵营及实际存在的 siteIndex/hasKit；siteIndex 不猜测为 A/B。
- 回合增加 startTick、freezeEndTick、endTick、endReason。事件按 tick 排序，同 tick 的 round_start 优先，其他同 tick 事件保留上游顺序，不将其解释为 subtick 顺序。
- `tickRate` 由事件的 `game_time` 与 tick 差计算，无法得到可靠的正整数值时省略，不使用默认值。

`MatchEvent` 现在是具体事件的可辨识联合类型。模型与完整原始字段映射见 [领域模型](./domain-model.md) 和 [P2.1 Combat Event Model 证据与限制](./combat-event-evidence.md)。安装包 `index.d.ts` 的事件结果为 `any`，因此转换契约以锁定版本真实 DEM 输出及捕获样本为证据，不使用上游原始类型定义领域模型。

仅在正式回合 start / freeze end / end 精确 tick 采集 team_num/is_alive 快照，不采集玩家位置轨迹或全量 tick 数据。无边界时不执行 parseTicks。没有唯一 SteamID 的机器人不能表示为独立 Player；无法识别受害者的击杀、伤害、闪光和无法识别 shooter 的开火不输出。新模型无法识别的 attacker/thrower/bomb player 使用 null。数值型 SteamID64 报错，避免精度损失。必要伤害数值或闪光时长缺失/非法时报错，不生成假零值。每回合状态、参与名单与已验证生命周期见 [P2.2 证据与限制](./round-state-evidence.md)。有效伤害策略、投掷物归一化与 trade 窗口仍需后续工作，本轮未实现 Analytics。

文件不存在、非 CS2 文件或原生解析失败时，Promise 拒绝，错误包含文件路径及原始 `cause`。原生模块加载发生在文件魔数检查之后。

## 验证

```powershell
pnpm install --frozen-lockfile
pnpm --filter @cs2-coach/dem-parser test
pnpm build
pnpm typecheck
```

包测试先构建 match-model 和 dem-parser，编译消费者类型契约断言，再使用 Node.js 内置测试运行器。覆盖真实字段样本映射、过量/无归属伤害、闪光助攻、投掷物/炸弹、未知字段、数值 SteamID 拒绝、两种回合格式、热身、换边、重开、回合起止、同 tick 开始、输入校验、API 隔离和文件错误。

存在项目根目录 `.demo/demo1.dem` 时，测试自动执行本阶段本地验收样本的完整转换及重复解析一致性检查：`de_dust2`、64 tick、10 名玩家、24 个回合、182 次击杀、730 条伤害、4399 次开火、421 条投掷物生效事件、282 条闪光受害者事件、125 条炸弹事件。样本内容 ID 为 `f3c3173eae0cd100d15c81c3b734be792f9212256a9c99703b358d3434000852`。统计包含保留的回合后事件，不等于 Analytics 指标。不将 DEM 二进制纳入源码仓库；只保留少量真实原始事件作为回归 fixture。

缺少该文件时，仅跳过真实 DEM 集成测试。使用其他 DEM 可指定绝对路径，此时验证一般模型约束及确定性，不使用本地样本的固定统计：

```powershell
$env:DEM_TEST_FILE = "E:/demos/another.dem"
pnpm --filter @cs2-coach/dem-parser test
Remove-Item Env:DEM_TEST_FILE
```

Turbo 的 build/typecheck 已包含这两个核心包；typecheck 在依赖包构建后进行，确保干净检出时也能解析生成的类型声明。

上游接口参考：[demoparser JavaScript 文档](https://github.com/LaihoE/demoparser/blob/main/documentation/js/README.md)。实际签名以锁定版本安装包的 `index.d.ts` 和真实文件输出为准。
