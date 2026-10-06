# P3.1 核心玩家指标与覆盖机制

本文记录第一批确定性玩家指标的**计算口径**、统一的 **coverage / eligibility** 规则，以及真实 `demo1.dem` 的 golden 结果与人工复盘对比。实现位于 `packages/analytics`，只依赖 `match-model` 领域类型，不引用 demoparser2 原始类型。

范围（P3.1）：K / D / A、K/D、HS%、rounds played、reported damage、ADR、CT/T split、multi-kill、opening kill / opening death。

非目标：KAST、Trade、Clutch、utility advanced metrics、Findings、AI、UI。

证据文件：`.demo/demo1.dem`，SHA-256 `f3c3173eae0cd100d15c81c3b734be792f9212256a9c99703b358d3434000852`，64 tick，`de_dust2`，10 名玩家，24 个正式回合。

复算命令：

```powershell
pnpm --filter @cs2-coach/analytics test
```

测试在缺少 DEM 时跳过真实样本，仅保留合成回归。

## 指标定义与计算口径

所有事件先经过统一回合窗口过滤：只有 `round_start` 与 `round_end` 都存在（`eventEligible`）的回合才参与事件类指标，且仅统计 `startTick <= tick <= endTick` 的事件。post-round 事件（parser 会保留到下一回合 start）因此被排除。

| 指标 | 口径 |
| --- | --- |
| `kills` | 有效窗口内 `killer === player` 且 `teamkill !== true` 的击杀。确认的 teamkill 不计；teamkill 状态未知仍计入并记录 coverage。 |
| `deaths` | 有效窗口内 `victim === player` 的死亡，包含被击杀、自杀与世界/环境死亡。teamkill 造成的死亡仍算死亡。 |
| `assists` | `assister === player`，且击杀是**可识别敌方击杀**（killer 非 `world`、killer/victim 双方 side 已知且敌对），并且 `assisterSide === killerSide`、`assister !== killer`。 |
| `kdRatio` | `kills / deaths`；`deaths === 0` 时为 `null`，不虚构数值。 |
| `headshotKills` / `headshotPercentage` | HS kills / 已知 headshot 状态的计入击杀 × 100；无已知状态时为 `null`。 |
| `roundsPlayed` | 有效窗口且所选快照 `participant === true` 的回合数，同时作为 ADR 分母。 |
| `reportedDamage` | 计入回合内 `DamageEvent` 中 `attacker === player` 且双方 side 已知且敌对的 `healthDamage` 之和。 |
| `adr` | `reportedDamage / roundsPlayed`；`roundsPlayed === 0` 时为 `null`。 |
| CT/T split | 每个计入回合按**该回合所选快照的 side**把 kill/death/assist/damage/round 归入 CT 或 T；绝不使用全局 `Player.team`。 |
| `multiKills` | 每个有效回合内该玩家的计入击杀数；`counts[2..5]` 为对应击杀数的回合数，key `5` 表示 5 杀及以上；`maxKillsInRound` 为最大单回合击杀。 |
| `opening` | 每个有效回合最早 tick 的击杀为该回合 opening duel。唯一最早击杀且为可识别敌方击杀时，killer 记 opening kill、victim 记 opening death；同一最早 tick 出现多杀记为 contested，不应归属玩家；最早击杀为 world/teamkill/side 未知记为 unattributed；回合内无击杀记为 absent。 |

### reported damage 口径（明确保留）

ADR 本轮固定采用 **reported damage**：直接累加 `player_hurt` 上报的 `dmg_health`，**不**修正为 effective HP loss。

- 不设 100 上限，保留 overkill。样本 tick 2287 上报 `dmg_health: 109`、`health: 0`，按 109 计入。
- 只计入敌方伤害；自伤与友伤剔除。友伤是否计入不改变“不修正 overdamage”的结论，只是伤害归属过滤。
- 样本缺少 pre-hurt HP 轨迹，因此无法在不猜测的前提下推导有效伤害；本轮不尝试。

### assist 口径（与复盘对齐的关键证据）

`player_death.assister_steamid` 在本样本中会记录“最后一名伤害过 victim 的队友”，**即使该玩家与 victim 同阵营**（友伤）。样本中 twinkle 有 2 个这样的记录：

| 回合 | tick | killer（阵营） | victim（阵营） | assister（阵营） | 说明 |
| --- | --- | --- | --- | --- | --- |
| 6 | 28614 | Makoto Nijima（T） | 菠萝抽风（CT） | twinkle（CT） | assister 与 victim 同侧，友伤 |
| 9 | 51859 | tarkz（T） | 用户0001（CT） | twinkle（CT） | twinkle 在 tick 51854 对队友造成 43 友伤后敌人收尾 |

因此 assist 必须要求 `assisterSide === killerSide`。原始 `assister` 字段在该样本给出 twinkle 6 次助攻，符合验收口径的为 **4** 次，与人工复盘一致。其余 9 名玩家两者相同，说明这不是系统性偏差，而是友伤助攻的特例。

### 同 tick 策略

- 事件窗口对 `startTick` / `endTick` **闭区间**，同 tick 的 `round_start` 事件属于新回合（沿用 P2.1 约定）。
- multi-kill 统计同一回合内同 tick 的每个击杀，因为每个 `player_death` 是独立的击杀证据；不声称 tick 内的 subtick 先后。
- opening 在同一最早 tick 有多个击杀时不任选一个，而是标记 contested 并降低覆盖。

## 统一 coverage / eligibility 机制

所有指标共用 `buildCoverage(match)` 产出的资格上下文，不各自重复判断：

- `RoundWindow`：`startTick` / `endTick` / `freezeEndTick`、`eventEligible`、`excludedEventCount`、`includes(tick)`。`startTick` 或 `endTick` 缺失时该回合 `eventEligible === false`，不猜测事件归属。
- `RoundRoster`：优先取 `freeze_end` 且 `availability === "observed"` 的快照，缺失时退化到 `start`（`degraded: true`），两者都不可用时 `available === false`。名单缺失不视为空名单。
- `PlayerRoundState`：`inRoster` / `side` / `participant` / `alive`；`Unknown` side 归一为 `null`，不用事件或 `Player.team` 回填。
- 两层资格：事件总量（K/D/A、HS%、multi-kill、opening）只需完整窗口；参与类（rounds played、damage、ADR、CT/T split）额外要求 `participant === true`，保证 ADR 分子与分母覆盖同一批回合。
- 共享判定函数 `isEligibleKill` / `isEligibleAssist` / `isEligibleDamage` / `isIdentifiedEnemyKill`，指标只调用，不重新实现覆盖判断。

`CoverageSummary` 输出全局 issue 计数和逐回合摘要；`PlayerMetrics.coverage` 输出逐玩家降级信息。

| Coverage issue | 含义 |
| --- | --- |
| `round-start-missing` / `round-end-missing` | 回合缺少 start / end 边界，事件类指标不可用 |
| `freeze-end-missing` | 缺少 freeze end 边界 |
| `roster-snapshot-unavailable` | start 与 freeze_end 都无 observed 快照，参与与阵营未知 |
| `roster-snapshot-fallback-start` | freeze_end 不可用，退化使用 start 快照 |
| `roster-unidentified-players` | 快照含无法用唯一 SteamID 表示的行（bot/缺失身份） |
| `player-not-in-roster` | 观察到的快照中没有该玩家行（未知参与，不等于断连） |
| `player-side-unknown` | 该玩家该回合 side 为 Unknown |
| `player-participation-unknown` | participant 未知（非 true/false） |
| `player-alive-unknown` | 该回合 alive 未知（本轮无指标依赖，供 KAST/Clutch 使用） |
| `post-round-events-excluded` | 被有效窗口排除的事件数 |
| `kill-teamkill-status-unknown` | 计入击杀但 teamkill 状态未知的数量 |
| `kill-headshot-status-unknown` | 计入击杀但 headshot 状态未知的数量 |
| `damage-side-unknown` | 因 side 未知而弃用的伤害行数量 |
| `assist-side-mismatch` | 因 assister 不在 killer 侧而抑制的助攻数 |
| `opening-duel-contested` | 同最早 tick 多杀，opening 不归属 |
| `opening-duel-unattributed` | 最早击杀为 world/teamkill/side 未知 |
| `opening-duel-absent` | 回合窗口内无击杀 |

## demo1.dem golden 结果

### twinkle

| 指标 | 结果 |
| --- | --- |
| K / D / A | **25 / 20 / 4** |
| K/D | 1.25 |
| HS kills / HS% | **9** / 36% |
| rounds played | 24 |
| reported damage | 2644 |
| ADR | **110.17**（2644 / 24） |
| CT（12 回合） | 10 kills / 10 deaths / 3 assists / 1106 damage / ADR 92.17 |
| T（12 回合） | 15 kills / 10 deaths / 1 assist / 1538 damage / ADR 128.17 |
| multi-kill | 8 个多杀回合：2 杀 ×6、3 杀 ×1、4 杀 ×1、5 杀 ×0；单回合最多 4 |
| opening | 4 opening kills / 0 opening deaths / 4 duels / winRate 1.00 |

### 全局一致性

| 项 | 结果 |
| --- | --- |
| parser 原始击杀（含 post-round） | 182 |
| 有效窗口内击杀（= 全部 death 数） | **180** |
| 计入助攻 | 57（原始 59，抑制 2 个友伤助攻） |
| 敌方 reported damage 合计 | 24600 |
| opening duel | 24 kills / 24 deaths（24 回合各 1 次） |
| 被排除 post-round 事件 | 117 |
| 覆盖不足 | 无：24/24 回合有完整窗口与 freeze_end 名单，无 unidentified / unknown side / unknown participation |

被排除的 2 个 post-round 击杀：tick 101061（正常击杀）与 tick 141061（twinkle 的 post-round world 自伤），均在 `round_end` 之后。

### 与人工复盘对比

| 复核项 | 人工复盘 | 本实现 | 结论 |
| --- | --- | --- | --- |
| K / D / A | 25 / 20 / 4 | 25 / 20 / 4 | 一致（需排除 post-round 与友伤助攻） |
| HS kills | 9 | 9 | 一致 |
| CT/T kills/deaths/damage | — | 10/10/1106 与 15/10/1538 | 需按逐回合快照 side 才能得到 |
| ADR / 分母 | — | 110.17 / 24 | 分母为有确认参与的完整回合 |
| opening | — | 4 / 0 | 4 次首杀、0 次首死 |
| multi-kill | — | 8 个多杀回合 | 2×6、3×1、4×1 |

K/D/A 的差异来源不是硬编码，而是两项可复现证据决策：post-round 排除（21 → 20 deaths；26 → 25 kills）与友伤助攻抑制（6 → 4 assists）。HS、CT/T、ADR、opening、multi-kill 直接由统一口径复算，无逐数值特判。

## 降级与跳过

本轮该样本覆盖完整，没有指标被降级或跳过：24 个回合全部 `eventEligible`，全部有 freeze_end 快照，0 个 unidentified、unknown side、unknown participation、teamkill 状态未知、headshot 状态未知。

机制上会被降级/跳过的情形已由合成测试覆盖：

- 缺 start/end：回合从事件类指标剔除，K/D 少计，coverage 记 `round-*-missing`。
- 无 observed 快照：参与未知，ADR 分母不含该回合，伤害不计入分子，记 `roster-snapshot-unavailable`。
- freeze_end 不可用：退化到 start，记 `roster-snapshot-fallback-start`。
- participant 非 true：rounds played 与伤害不计入，记 `player-participation-unknown` / 逐玩家 `skippedUnconfirmedParticipation`。
- side 未知：damage 弃用并记 `damage-side-unknown`。
- opening 同 tick 多杀 / 首杀为 world、teamkill：不归属玩家。

## P3.2 前仍缺什么

- **KAST / Survival**：需要“助攻或存活或被杀或 traded”的完整判定；存活部分要用 freeze_end 初始 alive + 死亡时间线 + end 快照推进，不能用“没有死亡”当作存活。
- **Trade**：需要 trade 时窗与 tick rate 策略；`tickRate` 未知时必须抑制时间型结论。同 tick 同时死亡、队伍存活数、lifecycle 中断都要显式规则。
- **Clutch**：需要可靠的起始存活名单、回合内死亡顺序、lifecycle（断连/重生）覆盖；当前样本没有验证回合内重生/重连场景。
- **Utility advanced**：需要投掷物类型归一（molotov vs incendiary）、stage 去重（release vs detonate）、闪光重叠解析；entity index 可复用，必须结合回合与 tick。
- **生存/连接状态**：`participant` 不是连接标志；断连/重连枚举语义仍未验证，跨回合连接状态机需要更多真实样本。
- **Bot / 部分录制**：无法用唯一 SteamID 表示的行只计入 unidentified，指标需按覆盖门控。

## 验证

```powershell
pnpm --filter @cs2-coach/analytics test   # 合成 + 覆盖 + 真实 DEM golden
pnpm --filter @cs2-coach/dem-parser test  # parser 回归
pnpm typecheck
pnpm build
```
