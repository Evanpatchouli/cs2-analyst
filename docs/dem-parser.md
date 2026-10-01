# DEM 解析（P1.5）

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
- 击杀转换为 `KillEvent`，保留 killer、victim、weapon、headshot。没有攻击者 SteamID 的环境死亡使用 `killer: "world"`；这个标识不对应玩家。
- `player_hurt → damage`、`weapon_fire → weapon_fire`；烟雾、HE、闪光、燃烧和诱饵的生效事件映射为 `utility`。事件按 tick 排序。
- `tickRate` 由事件的 `game_time` 与 tick 差计算，无法得到可靠的正整数值时省略，不使用默认值。

现有领域模型只有 `KillEvent` 定义了具体载荷；伤害、开火和投掷物事件目前保留 `type/tick`。本阶段不扩展模型、不采集位置轨迹。不具备唯一 SteamID 的机器人无法表示为独立 Player，涉及机器人受害者的击杀不输出。完整伤害数值、投掷物类型、位置、每回合阵营等后续需求应先扩展领域模型。

文件不存在、非 CS2 文件或原生解析失败时，Promise 拒绝，错误包含文件路径及原始 `cause`。原生模块加载发生在文件魔数检查之后。

## 验证

```powershell
pnpm install --frozen-lockfile
pnpm --filter @cs2-coach/dem-parser test
pnpm build
pnpm typecheck
```

包测试先构建 match-model 和 dem-parser，再使用 Node.js 内置测试运行器。覆盖两种实际回合格式、热身、换边、重开、环境死亡、输入校验、API 隔离和文件错误。

存在项目根目录 `.demo/demo1.dem` 时，测试自动执行本阶段本地验收样本的完整转换及重复解析一致性检查：`de_dust2`、64 tick、10 名玩家、24 个回合、182 次击杀、730 条伤害、4399 次开火、421 条投掷物事件。样本内容 ID 为 `f3c3173eae0cd100d15c81c3b734be792f9212256a9c99703b358d3434000852`。不将 DEM 二进制纳入源码仓库。

缺少该文件时，仅跳过真实 DEM 集成测试。使用其他 DEM 可指定绝对路径，此时验证一般模型约束及确定性，不使用本地样本的固定统计：

```powershell
$env:DEM_TEST_FILE = "E:/demos/another.dem"
pnpm --filter @cs2-coach/dem-parser test
Remove-Item Env:DEM_TEST_FILE
```

Turbo 的 build/typecheck 已包含这两个核心包；typecheck 在依赖包构建后进行，确保干净检出时也能解析生成的类型声明。

上游接口参考：[demoparser JavaScript 文档](https://github.com/LaihoE/demoparser/blob/main/documentation/js/README.md)。实际签名以锁定版本安装包的 `index.d.ts` 和真实文件输出为准。
