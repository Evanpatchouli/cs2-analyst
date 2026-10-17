# P7.0 地图热力图可行性与统计口径审查

- 阶段：P7.0（审查与方案确定，**不实现**热力图功能）。
- 实际基线：`main` / `HEAD` = `aae55e849ec8da35e4d946d2d883f25e7a88a58a`（2026-10-17 05:00:58 +0800，`docs(desktop): 记录独立终审及人工拖放验收`）。
  - 任务书给出的基线 `f0b3a224dbf15dff66d051ce69e02ff5a6d0caa4` 在本仓库不存在（`git merge-base` / `git log` 均报 `Not a valid commit name`）；以实际 `HEAD` 为准，工作区开始时干净。
- 真实 DEM 基线：`.demo/dust2.dem`，SHA-256 `db90fe85aab023a1d2c8a5996182e6120d98ef494f02a070b17982b235e4958c`，557650967 字节 —— 本次**重新计算并一致**。
- 审查环境：Windows x64，Node v26.3.0，pnpm 10.0.0，AMD Ryzen 7 5700G / 32 GiB，native `@cs2-analyst/demoparser-native` 0.42.0 绑定已构建。
- 本次结论所依据的历史数据明确标注来源（P6.0 / P6.4），不冒充本轮重新测量；本轮新增的 Dust2 只读实验单独记账。

---

## 1. 结论摘要

**P7.0 结论：CONDITIONAL GO（P7.0 自身验收 = PASS）。**

- **GO 的部分**：推荐的三个 MVP 图层中，玩家位置采样密度（候选 A）与击杀位置（候选 B）、死亡位置（候选 C）都能**完全复用现有 `parseWithReplay()` 已共享生成的 `Match` + `MatchReplay` + `MatchSpatialEvidence`**，不需要新增 native 查询、不需要新增第三方依赖、不需要修改 P3/P4/Deep Review/Timeline。
- **CONDITION**：结论只在“示意图上的位置分布”这一精度级别成立；DEM 与雷达底图的版本匹配仍为 `unconfirmed`，真实 DEM 验证范围仍只有 Dust2 一张图；停留时间不纳入 MVP。
- 因此 P7.1–P7.3 可在下方 §10 的范围内开工；任何超出该范围的精度/地图/战术主张都需要独立证据，不得本阶段提前宣称。

推荐 MVP 图层：

| 图层 | 判定 | 依据 |
| --- | --- | --- |
| A 玩家位置采样密度 | **现有数据支持，MVP 主图层** | 8 Hz 回放样本已是 `MatchReplay` 的一部分 |
| B 击杀位置（击杀者在精确击杀事件 tick 的位置） | **现有数据支持，独立事件图层** | `MatchSpatialEvidence` 的 kill `eventRef` + actor `at-event` 样本 |
| C 死亡位置（受害者在精确死亡事件 tick 的位置） | **现有数据支持，独立事件图层** | 同一 `eventRef` 的 target `at-event` 样本 |
| 停留时间 | **有条件支持，不纳入 MVP** | 8 Hz 离散观测不足以直接声称连续停留时间 |
| 投掷物区域/烟雾覆盖/火焰区域 | **当前不支持** | 只有离散生效点，无区域或轨迹 |
| 视线（LOS）/掩体/可见性/交战危险区/战术收益 | **明确排除** | 无 nav/collision mesh，且属产品红线 |

---

## 2. 当前数据链路（代码位置）

热力图**必须**复用下面这条已在生产的链路，不得新增 DEM 解析。

```text
Renderer  apps/desktop/renderer/src/replay-player.tsx
   │  window.cs2Analyst.replay.getChunk / 未来的 heatmap 请求
   ▼
preload   apps/desktop/preload/index.ts            （contextBridge，无路径/无 fs）
   │  ipcRenderer.invoke('replay:chunk' | 'replay:release')
   ▼
Main      apps/desktop/electron/main.ts            （trustedWindow + session/round/block 校验 + 4 在途上限）
   │  utilityProcess.fork('./report-worker.js')
   ▼
Worker    apps/desktop/electron/report-worker.ts   （只读一次 DEM，持有会话）
   │
   ├── Demoparser2Provider.parseWithReplay(filePath)          packages/dem-parser/src/providers/demoparser2.ts:36
   │        └── Demoparser2Adapter.parseEvidence(...)          packages/dem-parser/src/providers/demoparser2-adapter.ts:30
   │              ├── readInput()        只 readFile 一次，校验 PBDEMS2 头        (adapter.ts:63)
   │              ├── parseInput()       parseHeader/parsePlayerInfo/parseEvents
   │              │                       + boundary parseTicks → convertToMatch()  (adapter.ts:73)
   │              ├── planSpatialSampling() → 1 次 native.parseTicks(spatialFields) （spatial-evidence.ts:39）
   │              │        → buildSpatialEvidence() → MatchSpatialEvidence          (spatial-evidence.ts:100)
   │              └── planReplay() → 1 次 native.parseTicks(replayFields)           (providers/replay.ts:6)
   │                       → buildReplay() → MatchReplay                           (providers/replay.ts:35)
   │
   ├── buildDesktopReport(match, filePath, spatial)            apps/desktop/electron/report.ts:289
   │        （冻结的 Analytics + Findings V1 + Deep Review；本阶段不改）
   └── new ReplaySession(match, replay, sessionId)            apps/desktop/electron/replay-session.ts:37
            （回合分块 ≤1 MiB、会话缓存 ≤64 MiB、JSON-only DTO，按请求返回）
```

**关键事实（已核对源码，非推断）：**

1. `parseWithReplay()` 返回 `{ match, spatial, replay, replayUnavailableReason, replayMs, performance }`，其中 `replay` 为 `MatchReplay | null`（`packages/dem-parser/src/replay.ts`、`providers/demoparser2-adapter.ts:30-61`）。**Spatial 与 Replay 在同一次调用中共享同一次 `readFile` 与同一个 `Match`**，只额外各做一次 `native.parseTicks`。
2. `ReplayPlayerSample`（`packages/match-model/src/replay.ts:6`）逐字段：`position`（`[x,y,z]`，缺失为 `null`）、`actualTick`（该 tick 存在真实 native 行时为 `requestedTick`，否则 `null`）、`side`（采样时刻的 `team_num` 映射）、`alive`（`is_alive`，歧义/断连时为 `null`）、`segment`（同一玩家跨全场连续有效观测段，回合边界必断）、`stateAmbiguous`（同 tick 冲突）。
3. `buildReplay()` 只在 `row && position && alive===true && side!=='Unknown' && !stateAmbiguous` 时给 `segment` 赋值（`providers/replay.ts:91-96`）。所以 **`segment !== null` 等价于“一条可用的存活位置采样”**，这是热力图最干净的取舍钩子。
4. `planReplay()` 把每个正式回合窗口内的**所有事件 tick、生命周期 tick、边界 tick、以及 `tickRate/8` 均匀网格**合并进请求集（`providers/replay.ts:24-29`），上限 60000 唯一 tick / 600000 玩家样本，先检查预算再查询。
5. `MatchSpatialEvidence`（`packages/match-model/src/spatial.ts:55`）为每个事件保存 `eventRef`（round/type/tick/eventIndex）、`participants`（actor/target，未识别为 `null`）与 `samples`（`{role, sample}`，`relation` 为 `before-event|at-event|after-event|boundary`，`position` 缺失为 `null`，`actualTick` 精确或 `null`）。**kill 的 actor/target `at-event` 样本就是精确事件位置来源。**
6. 事件位置**禁止**用最近 Replay 帧替代（任务书要求）。Replay 帧在事件 tick 上也存在精确帧，但契约上以 `MatchSpatialEvidence` 为准，因为只有它带 `eventRef`/`relation`/逐样本 coverage。

**热力图新增的确定性投影应放在纯函数层**（本阶段不实现），输入 `MatchReplay` + `MatchSpatialEvidence` + `Match`，输出 JSON-only DTO；不进入 Analytics/Findings，不进 `Match`，不触碰 native。

---

## 3. 第一项审查：现有数据是否足够

### 3.1 玩家位置密度（候选 A）

**结论：现有数据充足，不需要新增 DEM 查询或解析能力。**

- 采样来源与频率：native 在**正式回合窗口 `[startTick, endTick]`** 内，按 `tickRate/8` 的 8 Hz 均匀网格 + 每个事件/生命周期/边界精确 tick 查询一次最终状态（`providers/replay.ts:6-32`）。8 Hz 的“真实含义”是**离散最终 tick 观测**，不是连续轨迹，也不是每 1/8 秒的插值。
- 哪些样本可用于位置分布统计：`segment !== null` 的样本；在 Dust2 实测中它精确等于 `alive===true` 的有效行（235604 = P6.0 记录的 aliveRows，见 §7）。
- 必须排除或单独标记：死亡但仍返回位置的陈旧 Pawn 行（Dust2 `deadWithPos = 39056`）、`actualTick===null`（缺失玩家行）、`position===null`、`alive===null`、`stateAmbiguous===true`、`side==='Unknown'`（构建时 `disconnect` 会强制 `position=null`，见 `providers/replay.ts:86`）。
- 阵营变化/死亡/重生/断连/跨回合断点：均可识别，且证据来自 `RoundPlayerLifecycleEvent`（`spawn`/`disconnect`/`side_change`，`packages/match-model/src/round.ts:41`）与 `segment` 的强制断点；同 tick 冲突保留 `stateAmbiguous`，不推断先后。
- 是否可直接复用而不调用 native：**是。** Worker 已持有 `MatchReplay`，聚合只做内存遍历。
- 架构是否允许低成本生成：**当前架构允许聚合，但不允许在导入后按任意筛选重新聚合**——`report-worker.ts` 在构建 `ReplaySession` 后**不保留** `match`/`spatial`/`replay`（`report-worker.ts:9,26`）。因此若要做筛选，必须在导入时预先算好，或显式保留领域数据。详见 §8。

### 3.2 击杀与死亡位置（候选 B/C）

逐条回答：

1. **能否取得击杀者在击杀事件时的位置？能，但必须走精确事件采样。** `MatchSpatialEvidence` 中 `eventRef.type==='kill'` 的条目，`participants` 里 `role==='actor'` 的 `playerId` 即击杀者；其 `samples` 中 `role==='actor' && sample.relation==='at-event'` 的 `sample.position` 就是击杀事件 tick 的位置。
2. **能否取得受害者在死亡事件时的位置？能。** 同一 `eventRef` 的 `role==='target'` `at-event` 样本。注意 `MatchEvent` 没有独立 “death” 类型，死亡就是 `type==='kill'` 的 `victim` 侧（`packages/match-model/src/event.ts:8-22`）。
3. `actor`/`target`/玩家身份/事件 tick/回合归属如何关联：`SpatialEventRef = { round, type, tick, eventIndex }`，`eventIndex` 是 `round.events` 原始下标（可区分同 tick 多事件，不表示 subtick 顺序）；`participants.playerId` 是 SteamID64 字符串或 `null`；`samples[].sample.actualTick` 必须等于 `event.tick` 才算精确。
4. 缺失/未知/world/不完整如何处理：`identity()` 只接受 `^[1-9]\d*$`，因此 `killer==='world'`、`planted_c4`、null 都变成 `participant-unidentified`，不制造 ID（`spatial-evidence.ts:25-37`）；无精确玩家行时 `actualTick=null` 且**绝不最近邻替代**（`spatial-evidence.ts:123-128`）。这些事件必须计入“无法定位事件数”，不能当作不存在。
5. 是否复用 `parseWithReplay()` 已共享生成的 Spatial：**是，且这正是推荐路径。** `parseWithReplay()` 内部已调用 `buildSpatialEvidence`，`result.spatial` 直接可用。

**实测佐证（本阶段，见 §7.2）**：Dust2 正式窗口内 162 个击杀事件，161 个击杀者 `at-event` 位置 `coverage.status==='complete'` 且 `actualTick===event.tick`；162 个受害者 `at-event` 位置齐全；1 个 `world` 击杀者无位置。**并且**对全部 161 个可比对样本，Spatial 的 actor `at-event` 位置与“事件 tick 的精确 Replay 帧”位置**逐点完全相等（0 处不一致）** —— 这证明两个精确来源一致，但契约仍以 Spatial 为准。

**图层分离**：击杀位置与死亡位置是**两个独立图层**，分别按击杀者/受害者聚合，不合并为未定义的“事件热度”。

### 3.3 数据缺口与最小修复建议

以下不是 P7.0 阻塞项，记录为 P7.1/P7.2 的实现约束或最小修复建议：

1. `MatchReplay` 没有显式记录“哪些帧属于 8 Hz 均匀网格、哪些是事件/生命周期补采”。均匀子集可由 `startTick`、`maxInterpolationTicks`（= step）、`tickRate` 反推，但属于隐式约定。**最小修复建议**：若 P7 需要 `uniform-8hz` 采样集，在 P7.1 契约里显式标注或提供读取函数，不修改 `MatchReplay` 必填字段。
2. `MatchReplay` 没有逐帧区分“缺失位置”与“存活但无位置/死亡”的原因码；`ReplayRound.coverage.missingPlayerSamples` 是一个混合计数。**最小修复建议**：热力图自己在投影中计数分类，不要求改领域契约。
3. `MatchSpatialEvidence.events` 包含正式回合窗口外的事件（实测 4 个窗口外击杀）。**必须**在事件图层里先按 `[round.startTick, round.endTick]` 过滤。
4. `report-worker.ts` 导入后不保留领域对象。**最小修复建议**：在 P7.2 于导入时一次性生成有界热力图投影并存入会话，或在会话对象中显式保留只读引用；不要为每次筛选重新解析。

---

## 4. 第二项审查：MVP 图层清单

- **纳入 MVP（默认全部关闭/按需开启）**：A 玩家位置采样密度（主图层）、B 击杀位置、C 死亡位置。B 与 C 必须能分别开关与筛选。
- **纳入但单独标注，且不纳入默认 MVP**：`uniform-8hz` 采样集变体（仅改变统计样本集，不改变图层定义）。
- **排除**：停留时间（§5.2）；投掷物效果区域、烟雾覆盖、火焰区域、投掷物飞行轨迹、抛物线（只有离散生效点，`UtilityEvent.position` 是效果原点，不是区域）；视线/掩体/可见性/交战危险区/战术收益（无 nav/collision/LOS 数据，且属明确产品红线）。
- 不得把稀疏事件证据或雷达底图解释成上述排除项。雷达底图只是示意图，不表示地形通视。

---

## 5. 第三项审查：统计契约（核心交付物）

### 5.0 公共定义

对回合 r：

- `window_r`（默认）= `[liveStart_r, endTick_r]`。
  - `liveStart_r = freezeEndTick_r`，当且仅当 `freezeEndTick_r` 是 `[startTick_r, endTick_r]` 内的安全整数；否则 `liveStart_r = startTick_r` 并把该回合标记 `freeze-boundary-unknown`。
  - 选项 `includeFreezeTime`（默认 `false`）为 `true` 时 `liveStart_r = startTick_r`。
  - 理由：freeze 时间是出生点站位，不属实战位移。Dust2 实测把 freeze 计入后，32×32 最大单元从 2430 暴涨到 11987（§7.3），会系统性污染出生区。
- `F_r` = `MatchReplay.rounds` 中回合 r 内 `requestedTick ∈ window_r` 的帧集合。
- `roster_r` = 回合 r 的 `freeze_end`（缺失时 `start`）`RoundStateSnapshot` 中 `participant===true` 的玩家数；无任何 observed 快照时回退为 `replay.players.length` 并记 `roster-approximate`。
- `expected_r = |F_r| × roster_r`。

### 5.1 玩家位置采样密度

**统计单位**：单个玩家在一个有效位置采样帧中的一次有效位置观测。

**有效位置采样（valid position sample）** 定义（以下全部成立）：

```text
sample.actualTick !== null        // 该 tick 存在真实 native 行
&& sample.position !== null       // X/Y/Z 全部有限
&& sample.alive === true
&& sample.stateAmbiguous === false
&& sample.side !== 'Unknown'
&& sample.segment !== null
```

（在当前 `buildReplay` 实现下，`segment !== null` 已蕴含其余条件；保留完整列表以便未来独立校验。）

**分类计数（全部必须输出，互斥且穷尽 expected）**：

```text
validPositionSamples   = 满足上述定义的样本数
deadObservations       = actualTick!==null 且 position!==null 且 alive!==true 的样本
missingObservations    = expected - validPositionSamples - deadObservations
                         （含 actualTick===null / position===null / alive===null /
                            stateAmbiguous===true / side==='Unknown'）
```

**公式与分母**：

```text
validPositionSamples   = Σ_{r ∈ scope} Σ_{f ∈ F_r} Σ_{s ∈ f.players} valid(s)
expectedOpportunities  = Σ_{r ∈ scope} expected_r
positionCoverage       = validPositionSamples / expectedOpportunities      (expected>0 时有定义；否则 unavailable)
positionCompleteness   = (validPositionSamples + deadObservations) / expectedOpportunities
aliveSampleShare       = validPositionSamples / (validPositionSamples + deadObservations)   (分母>0 时)
```

- `cellSampleCount(c)`：单元 c 内的有效位置采样数。
- `validPositionSamples`：当前统计范围内的有效位置采样总数。
- `cellSampleShare(c) = cellSampleCount(c) / validPositionSamples`，仅当 `validPositionSamples > 0`；为 0 时**未定义**，不是 0。
- `positionCoverage`：**注意其分母是“回放请求帧 × 回合名单”，不是时间长度**。它衡量的是“在已请求的采样机会中拿到有效存活位置的比例”，不是“玩家在场上时间的比例”。

**明确限制（不得伪造分母）**：
- 该分母依赖 `roster_r` 与 `|F_r|`。当 `freezeEndTick` 缺失或名单快照缺失时，`roster_r` 回退会偏大（用全场玩家数），必须显式输出 `rosterFallbackRounds` 与 `freezeBoundaryUnknownRounds`，不能当作精确分母。
- `|F_r|` 含额外的事件/生命周期补采帧，因此**帧不是等时间间隔**。位置采样密度**不等于**停留时间，也会在事件密集处轻微过采样。若需要近似时间比例口径，使用 `samplingSet='uniform-8hz'`（仅保留 `(tick - startTick) % step === 0`，`step = tickRate/8`），并声明其为近似。

**缺失与零的区分**：
- 缺失样本**不**表示玩家不在该位置；未知位置**不**记为零位置。
- 单元 `cellSampleCount(c)=0` 只表示“无有效样本落入该单元”，不表示“无人在此”。

**颜色归一化（必须显式，禁止静默改义）**：

```text
cellSampleShare(c) = cellSampleCount(c) / validPositionSamples
intensity(c)       = clamp(cellSampleShare(c) / maxCellSampleShare(scope), 0, 1)   // scope-relative linear
```

- MVP 采用 **scope-relative 线性归一化**（相对当前筛选范围），因为绝对计数随回合数变化。
- 图例**必须**同时显示：当前筛选描述、`validPositionSamples`、`maxCellSampleShare` 对应的单元与绝对计数、网格分辨率、采样集（`all-valid` / `uniform-8hz`）、窗口是否含 freeze。
- 切换筛选即重新归一化，图例同步更新；**禁止**在筛选变化时保留旧颜色含义。点击/悬停必须能读到该单元的绝对 `cellSampleCount`。
- 备选固定标尺（`absolute`）以绝对 `cellSampleCount` 映射颜色，跨筛选含义固定但单玩家筛选下几乎不可见；两者都必须标注清楚，不得混用。

### 5.2 停留时间

**结论：不纳入 MVP。**

- 8 Hz 是离散最终 tick 观测；相邻样本间的真实路径未知。`MatchReplay` 的文档明确“Native observations, never display interpolation and never an Analytics input”（`packages/match-model/src/replay.ts:5`），`replay-state.ts:13` 也声明插值纯展示、不回流分析。
- `F_r` 非等间隔；缺失/死亡/重生/断连/回合边界会切断 `segment`；`actualTick===null` 不能补。
- 若未来纳入，必须满足：以实际 tick 与 `tickRate` 计算；要求相邻两个有效样本处于同一非 null `segment`、同一 `side`、同一楼层、两端 `alive===true` 且 `actualTick` 精确；`t2 - t1 <= maxInterpolationTicks`；**不跨缺失区间累加**，不用最后位置无限延续；插值时间**不计入**；`tickRate===null` 时不输出秒数。以上作为 P7.3+ 的独立设计，不在本轮范围。

### 5.3 击杀与死亡位置分布

**事件筛选条件**：`round.events` 中 `type==='kill'` 且 `round.startTick <= event.tick <= round.endTick`（先过滤窗口，再套用玩家/阵营/回合筛选）。

**精确位置来源**：`MatchSpatialEvidence` 中与 `(round, type='kill', tick, eventIndex)` 完全匹配的 `SpatialEvidence`。

- 击杀位置 = `samples` 中 `role==='actor'` 且 `sample.relation==='at-event'` 的样本位置；
- 死亡位置 = `samples` 中 `role==='target'` 且 `sample.relation==='at-event'` 的样本位置；
- 两者都必须满足 `sample.actualTick === event.tick` 且 `sample.position !== null`。
- **禁止**最近 Replay 帧、插值、`replayDisplayFrame`、显示 DTO（`DesktopReplayFrame`）或任何展示层数据。

**公式**：

```text
scopeEvents(layer)          = 该图层筛选范围内的事件数（kill 层与 death 层同源，按不同主体）
locatableEvents(layer)      = 有有效 at-event 位置的事件数
unlocatableEvents(layer)    = scopeEvents - locatableEvents
eventPositionCoverage(layer)= locatableEvents / scopeEvents        (scopeEvents>0 时有定义)
cellEventCount(c, layer)    = 落入单元 c 的相关事件数
scopeMaxCellEvents(layer)   = max_c cellEventCount(c, layer)
```

**缺失处理**：无法定位的事件**只**影响 `eventPositionCoverage` 与可展示结果，**绝不**当作“该处没有击杀/死亡”。`unlocatableEvents` 必须按原因分解：`killer-unidentified`（`world`/null）、`victim-unidentified`、`player-row-missing`、`position-missing`、`sample-unavailable`、以及（先验排除的）`outside-round-window`。

**归一化**：与 §5.1 同样的 scope-relative 线性口径；事件图层点极少（Dust2：击杀 161、死亡 162，32×32 下最大单元仅 5 / 4），MVP 建议直接画点或极小硬核，不做 KDE/模糊。

### 5.4 空间聚合

**坐标空间**：雷达像素平面（底图自然参考尺寸，当前资源全部为 1024×1024），使用与回放相同的 `worldToRadar()`（`apps/desktop/renderer/src/replay-map.ts:25`）。

**网格定义**（确定性）：

```text
N        ∈ {16, 32, 64}（MVP 默认 32；128 仅评估用）
sx = map.width / N , sy = map.height / N
cx = floor(px / sx) , cy = floor(py / sy)      // 半开单元 [cx*sx,(cx+1)*sx)
若 px<0 || px>=map.width || py<0 || py>=map.height → outOfBounds（不平移、不钳制、不就近）
若坐标非有限 → invalid
单元格 = 行主序 cy*N + cx ；行 0 = 雷达顶部
```

**分辨率比较（Dust2 实测，见 §7.3）**：

| N | 位置层非空单元 | 位置层最大单元占比（含 freeze / 仅实战） | 评价 |
| --- | ---: | ---: | --- |
| 16 | 166 / 256 | 7.57% / 2.65% | 过粗，出生区与路线合并 |
| 32 | 507 / 1024 | 5.09% / 1.36% | **推荐 MVP 默认** |
| 64 | 1692 / 4096 | 2.54% / 0.66% | 可用高分辨率 |
| 128 | 5767 / 16384 | 2.47% / 0.53% | 过散，对 8 Hz 采样误差敏感 |

量化依据：Dust2 比例 4.4 世界单位/像素 ⇒ N=32 单元 = 140.8 世界单位，N=64 = 70.4，N=128 = 35.2。P6.0 在 4 个战斗窗测得 8 Hz 位置误差 p95 = 1.85、max = 12.40 世界单位（§7.4）。因此 N≤64 时最大误差远小于一个单元；N=128 时最大误差约为单元的 35%，存在边界翻转风险。**推荐 N≤64。**

**平滑**：MVP **不做**平滑，硬单元便于计数审计。若未来加入展示平滑，只能是**纯展示**（例如对渲染位图做有界 box blur），**不得**新增/移动原生位置样本、不得改变 `cellSampleCount`、`validPositionSamples`、`cellSampleShare`、`positionCoverage` 或事件分母；且必须在 UI 标注“展示已平滑，统计未变”。

**确定性**：相同 `matchId + samplingVersion + resourceId + window + samplingSet + 筛选 + N` 必须产生逐位相同的网格。本阶段实测同输入两次 32×32 聚合哈希一致（`14c22f958fc54166`）。

**楼层**：复用 `resolveMapLayer()`（`replay-map.ts:37`）。单层地图（`layers.length===1 && minZ===null`）返回该层；多层地图在 `z===null`、越界或**共享边界**（含边界区间重叠）时返回 `null`。`null` 必须保持未知；楼层筛选下未知 Z 的样本进入 `unknownLayer` 桶并计入覆盖说明，**不得**任意归入某一层。楼层归属使用**采样点自身的 Z**，不用插值 Z。

---

## 6. 第四项审查：筛选语义

对每项：输入字段 / 过滤规则 / 分母变化 / 未知行为 / 需要的测试。

| 筛选 | 输入字段 | 规则 | 分母变化 | 未知行为 | 需要的测试 |
| --- | --- | --- | --- | --- | --- |
| 全部玩家 / 单玩家 | `ReplayPlayerSample.playerId`；事件层 `KillEvent.killer`（B）/`victim`（C） | 位置层保留该玩家的有效样本；事件层按主体过滤 | 位置层 `expected` 改为该玩家的名单机会（§5.0，`player∈roster_r` 时为 `|F_r|`）；事件层 `scopeEvents` 只含该主体事件 | 玩家不在某回合名单 ⇒ 该回合对该玩家贡献 0 机会，且不得与“缺失”混淆 | 单玩家计数 = 全体计数求和（当名单固定）；非名单回合排除 |
| CT / T / 全部 | 位置层 `sample.side`；事件层 at-event `SpatialSample.side`，回退 `event.killerSide`/`victimSide` | 按采样时刻真实阵营过滤；**不得**用开局阵营 | 分母不变；分子为该阵营子集；另出 `sideUnknown` 桶 | `Unknown` 不计入 CT/T，单独计数并在覆盖说明中显示 | 换边后同玩家不同回合阵营正确；Unknown 不被强行归入 |
| 全部回合 / 指定回合或范围 | `ReplayRound.round` | 只取选中回合 | `expected`、`scopeEvents`、`validPositionSamples` 全部按选中回合重算 | 被排除的 `excludedRounds` 不参与 | 回合范围与单回合结果一致 |
| 图层开关 | A/B/C 独立 | 独立绘制，不互相影响 | 各自统计 | 某层不可用时其他层与报告不受影响 | 三层独立开关；缺 Spatial 时 A 仍可用，缺 Replay 时 B/C 仍可用（若 Spatial 存在） |
| 楼层 | 位置层 `position[2]`；事件层 at-event `position.z` | `resolveMapLayer(map, z)`；仅绘制选中层 | 分母不变；`unknownLayer` 单独计数 | `null`（缺 Z / 越界 / 共享边界）保持未知 | Nuke/Vertigo/Train 共享边界保持 null；缺 Z 不改层 |

**事件层主体**：击杀位置按**击杀者**筛选（`killer`），死亡位置按**受害者**筛选（`victim`）。若实际事件契约要求不同处理，以 §5.3 的 `eventRef`/`role` 规则为准（actor=击杀者，target=受害者）。

**名单口径限制**：`player ∈ roster_r` 依赖 `RoundStateSnapshot`；缺失时无法精确计算单玩家机会，必须输出 `roster-approximate`，不得伪造精确分母。

---

## 7. 第五项审查：地图映射与 Dust2 真实数据验证

### 7.1 映射与资源身份（已核对）

- `worldToRadar()`（`replay-map.ts:25`）：`x = (world.x - posX)/scale × width/1024`，`y = (posY - world.y)/scale × height/1024`；HUD `rotate/zoom/inset` 有意不应用于原始未旋转底图。非有限值、`scale<=0`、尺寸非正返回 `null`。
- `replayMapDefinitions`（`replay-map.ts:12`）内建 10 图；**代码硬编码 `versionMatch: 'unconfirmed'`**（`replay-map.ts:7,23`）。`mapResourceState()` 在任一层图片缺失时返回 `unavailable`，齐全时返回 `unconfirmed`（`replay-map.ts:44`），**不会**返回“已确认”。
- Dust2 资源：`resourceId = valve-730-2347770-2312433566686574487-vrf20.1`；overview `97947e99…3820`（541 B，posX -2476 / posY 3239 / scale 4.4）；底图 `082829…354d`（1024×1024，175761 B）；`demVersionMatch: "unconfirmed"`；`registration: "four-region-pass; see replay-calibration.json"`（`docs/replay-resources.json:125-151`）。
- 来源：Valve app 730 / depot 2347770 / manifest 2312433566686574487，DepotDownloader 3.4.0 + Source2Viewer CLI 20.1；第三方再分发许可仍 `unconfirmed`（`docs/replay-resources.json:112-121`）。DEM header `patch_version=14055`，与 manifest 的 client/build version **无可验证等价关系**。
- 配准证据（`docs/replay-calibration.json`）：T 出生区 5 点、CT 出生区 5 点、东安包区 7 点、西安包区 5 点，共 22 点**全部落在**人工独立辨认区域内；`status = four-region-registration-pass`，`versionMatch = unconfirmed`，并明确“不是像素精确地形或地图版本等价证明”。

### 7.2 三个概念必须分开（本次结论）

1. **DEM 中是否存在有效位置**：Dust2 实测 **是**。274660 个玩家帧单元中 `position===null` 为 0、`actualTick===null` 为 0；`alive===null`、`stateAmbiguous`、`side==='Unknown'` 全为 0。
2. **世界坐标能否映射到当前雷达图**：**是**。235604 个有效位置与 161+162 个事件位置映射后 `outOfBounds===0`；`replay-map.test.mjs` 的 22 点四区域断言通过。
3. **DEM 与底图是否确认版本匹配 / 达到所声称几何精度**：**否，仍 `unconfirmed`**。四区域一致性不是像素级精度，也不是版本等价。

**因此**：现有证据足以支持“**示意地图上的位置分布**”（含相对结构、大致分区、图层对比），**不足以**支持像素级落点、精确区域边界、跨层可见性或任何战术结论。数据覆盖状态（§5 的 coverage）与地图对齐状态（`unconfirmed`）必须**在 UI 与 DTO 中分别表达**：采样 100% 完整也不能把未确认版本标成精确匹配；版本未确认也不应否定已有的四区域配准证据。

要提升到更高精度，至少还缺：能证明与 DEM 同 build 的地图资源；像素/地标级配准并量化误差；逐地图（而非只 Dust2）的真实 DEM 验证。

### 7.3 本阶段 Dust2 只读实验（新增证据）

**命令**（临时脚本在 `.tmp/`，不入库）：

```powershell
node .tmp/p7-heatmap-probe.mjs
node .tmp/p7-heatmap-probe2.mjs
node .tmp/p7-heatmap-probe3.mjs
```

**范围声明**：本实验为 P7.0 只读调查，调用生产 `parseWithReplay()`，不新增 native 查询、不修改生产代码；测量值含脚本自身计算，非 Electron/IPC 验收。

实测（Node v26.3.0 / 5700G / native 0.42.0；一次 `parseWithReplay` ≈ 7.4 s，进程生命周期峰值 RSS ≈ 1.479 GB）：

| 项目 | 实测 |
| --- | ---: |
| matchId / map / tickRate / players / rounds | = DEM SHA-256 / de_dust2 / 64 / 10 / 24 |
| samplingVersion | `native-0.42.0-backport363-replay8-v1` |
| hz / maxInterpolationTicks | 8 / 8 |
| 请求 tick（=帧数） | 27466 |
| 玩家帧单元 | 274660 |
| 有效位置采样 validPositionSamples | 235604 |
| 其中 freeze 窗内 / 实战窗内 | 57090 / 178514 |
| 死亡但仍有位置（deadObservations） | 39056 |
| 缺失位置/行/状态 | 0 / 0 / 0（posNull=actualTickNull=aliveNull=0，ambiguous=sideUnknown=0） |
| expectedLiveOpportunities（roster=10×21757 帧） | 217570 |
| positionCoverage = 178514/217570 | **0.8205** |
| positionCompleteness = (178514+39056)/217570 | **1.0000** |
| 名单来源 / 回退回合 / 未识别 | 每回合 freeze_end observed，roster=10 / 0 / 0 |
| 窗口内事件 tick 拥有精确帧 | 6023 / 6023，缺失 0；kill tick 162/162 |
| Spatial events / kill refs / boundaries | 6155 / 166 / 72 |
| 窗口内击杀 / 窗口外击杀 | 162 / 4 |
| 击杀者已识别 / world / teamkill | 161 / 1 / 0 |
| 击杀者 at-event 位置（status complete） | 161 / 161 |
| 受害者 at-event 位置 | 162 / 162 |
| Spatial actor at-event vs 精确事件帧 actor 位置 | 比对 161，不一致 0，缺失 0 |
| 位置层非空单元 N=16/32/64/128（含 freeze） | 166 / 507 / 1692 / 5767 |
| 位置层非空单元 N=16/32/64/128（仅实战） | 166 / 507 / 1692 / 5767 |
| 位置层最大单元占比 N=32（含 freeze / 仅实战） | 5.09% / 1.36% |
| 击杀点 32×32（点数/非空单元/最大单元） | 161 / 103 / 5 |
| 死亡点 32×32（点数/非空单元/最大单元） | 162 / 114 / 4 |
| 越界位置（位置层 / 事件层） | 0 / 0 |
| 同输入 32×32 两次聚合哈希 | `14c22f958fc54166`（一致） |
| 单玩家有效样本 min/max | 21295 / 25518（约 1.20 倍） |

**关键解读**：Dust2 上 `positionCompleteness === 1.0`，`positionCoverage === 0.8205` 的缺口**恰好等于 39056 个死亡观测**；也就是说，本 fixture 的位置数据“缺失”为 0，覆盖率小于 1 是因为玩家已死亡，而不是数据缺口。这正好说明契约必须把 `deadObservations` 与 `missingObservations` 分开。

### 7.4 历史数据（来自 P6.0 实验，非本轮重新测量）

来源：`docs/replay-feasibility.json`（2026-10-15，同一 Dust2，Node v24.22.0，native `64aa7e63…`）。

| 候选 | 三次查询（秒） | 请求 tick / 玩家行 | 原始 JSON | 进程峰值 | 位置误差 p95 / max（世界单位） | yaw 误差 p95 / max |
| --- | --- | --- | --- | --- | --- | --- |
| 8 Hz | 3.26 / 3.24 / 3.84 | 27466 / 274660 | 59,385,485 B（≈56.6 MiB） | 1,520,996 KiB（≈1.45 GiB） | 1.85 / 12.40 | 2.71° / 21.69° |
| 16 Hz | 5.84 / 6.12 / 6.36 | 50302 / 503020 | 108,677,114 B | 2,028,004 KiB | 0.58 / 9.68 | 1.09° / 8.02° |
| 32 Hz | 12.26 / 12.39 / 14.37 | 95888 / 958870（1 tick / 10 行缺失） | 207,071,189 B | 3,209,848 KiB | 0.20 / 5.84 | 0.44° / 3.75° |

- `aliveRows = 235604`（8 Hz）与本轮 `validPositionSamples = 235604` 一致，交叉验证通过。
- 20 秒原始候选块：p95 524110 B、max 593918 B（8 Hz）；文档记录原始 JSON 约 **59.4 MB**、274660 行——据此，**必须预聚合**，不能把整场原始样本经 IPC 传给 Renderer。
- 位置误差来自 4 个分布战斗窗的最终 tick 参考，**不是全场上限**，也不构成插值精度证明；但足以支撑 §5.4 的网格分辨率判断。
- 历史数据来源为 P6.0 实验进程，不是本轮 Electron/IPC 实测。

---

## 8. 第六项审查：架构、性能与 IPC

### 8.1 分层与实现位置

沿用依赖方向 `dem-parser → match-model → 确定性数据投影 → report-contract / IPC → Renderer`：

| 层 | 职责 | 本轮建议 |
| --- | --- | --- |
| `dem-parser` | native 查询与采样 | **不改**。热力图不新增查询 |
| `match-model` | 领域契约 | 已有 `MatchReplay` / `MatchSpatialEvidence` 足够；**不新增领域字段** |
| 确定性投影（纯函数） | 由 `Match` + `MatchReplay` + `MatchSpatialEvidence` 计算单元计数与 coverage | 新建纯函数模块；**建议放在 `apps/desktop/electron/`，与 `report.ts` / `replay-session.ts` 同层**（Timeline/Analysis 已是 presenter 投影）。若未来出现非 Desktop 消费者（如 P8 后端/CLI），再把纯函数上移到领域包；本阶段**不新增 package** |
| Utility Process | 导入时调用纯函数一次，构建有界投影并存入会话 | 复用 worker 的内存对象；不重复解析 |
| `report-contract` | JSON-only DTO | **additive** 扩展：可选 `heatmap` 元数据 + 网格 DTO；`schemaVersion` 仍为 2；无 Buffer/native/函数 |
| Main / preload | 会话与受信请求 | 复用 `trustedWindow` + session/参数/在途上限校验模式 |
| Renderer | Canvas 2D 叠加、控件、图例 | 复用现有底图、`worldToRadar`、`resolveMapLayer`；不引入新渲染框架（无 PixiJS/WebGL） |

### 8.2 为什么必须预聚合（而不是传原始样本）

- 原始 8 Hz JSON ≈ 59.4 MB，274660 行；现有 `ReplaySession` 全量缓存 34,757,998 B / 159 块（P6.2 实测），说明原始粒度不可直接下发。
- 位置层 32×32 = 1024 个整数单元即可表达全图分布；单张网格 DTO 预计仅几 KB。事件层最多几百个点。IPC 成本可忽略。
- 内存：聚合只需每层一个 `N×N` 计数数组；不需要第二份原始样本。

### 8.3 会话生命周期约束（重要）

`report-worker.ts` 在构建 `ReplaySession` 后**只保留 `session`，不保留 `match`/`spatial`/`replay`**（`report-worker.ts:8-9,26`）。因此：

- 推荐在**导入时**（与 `new ReplaySession(...)` 同一处）一次性计算并存储有界热力图投影（各筛选维度的稀疏单元直方图 + coverage 元数据），之后按筛选求和；**不要**在导入后重新解析或依赖被释放的领域对象。
- 会话释放/重新导入/取消/窗口关闭时，热力图投影必须随会话一起清理（复用现有 `stopReplayWorker`/`ReplaySession.clear` 路径），不得跨会话污染。
- 热力图失败必须**独立降级**：报告与回放保持可用（与 `report-worker.ts:26-27` 的 replay 降级同模式）。

### 8.4 IPC 形态建议（P7.2 细化）

- 报告内附加 `DesktopHeatmapMetadata`（`schemaVersion`、`available`、`unavailableReason`、`matchId`、`resourceId`、`samplingVersion`、`grid.n`、`window.includeFreeze`、`samplingSet`、图层与 coverage、`normalization`）。
- 网格按筛选请求返回：新通道（例如 `heatmap:grid` / `heatmap:release`），复用 `replay:chunk` 的 trusted-window + sessionId + 参数范围 + 在途上限校验；单次网格体积极小。
- DTO 必须 JSON-only。禁止把 `MatchSpatialEvidence`、`MatchReplay` 或任何 native/Buffer 对象发给 Renderer。
- 备选（更小改动）：只在报告中预置默认范围（全部玩家/全部阵营/全部回合）的一层网格；筛选延后。无论哪种，都不得让热力图缺失影响既有报告/回放。

### 8.5 性能预算

区分“已实测”“来自 P6 历史”“待测预算”：

| 指标 | 数值 | 来源/状态 |
| --- | --- | --- |
| 单次 `parseWithReplay`（含 Spatial+Replay） | ≈7.4 s（本机） | 本轮 probe，含脚本计算；**不是** Electron 指标 |
| native/spatial history 8 Hz 查询 | 3.24–3.84 s | P6.0 历史 |
| 原始 8 Hz JSON | 59,385,485 B | P6.0 历史 |
| 现有回放会话缓存 | 34,757,998 B / 159 块 / max 371621 B | P6.2 历史 |
| built Electron 完整导入 | 8.03 s（安装版 8.30 s） | P6.4 历史 |
| 首帧 / 12 次 IPC p95 / Canvas p95 | 244.8 ms / 9.4 ms / 0.6 ms（安装版 94.7 / 8.3 / 0.3） | P6.4 历史 |
| parser Utility 进程生命周期峰值 | 1,505,501,184 B（安装版 1,509,363,712 B） | P6.4 历史 |
| **热力图额外解析开销** | **0（无新增 native 查询）** | 代码事实 |
| **聚合耗时（235604 样本，32×32）** | **待测预算** | P7.1 必须实测 |
| **热力图 DTO 体积（单层 32×32）** | **待测预算**（目测量级 KB） | P7.2 必须实测 |
| **Renderer 单帧热力图绘制增量** | **待测预算**；现有 Canvas p95 0.6 ms 为参照 | P7.3 必须实测 |
| **安装版热力图端到端** | **待测预算** | P7.3 必须实测 |

所有“待测预算”不得在 P7.1/P7.2/P7.3 之前写成已实现性能。

---

## 9. 第七项审查：回归与验收矩阵

### 9.1 统计正确性

| ID | 检查 | 数据 | 断言 | 阶段 |
| --- | --- | --- | --- | --- |
| S1 | 已知点位单元归属 | 合成 | 边界点归入半开单元；`floor(px/sx)` 精确 | P7.1 |
| S2 | 单元计数与总和 | 合成 | `Σ cellSampleCount = validPositionSamples` | P7.1 |
| S3 | 归一化与分母 | 合成 | `cellSampleShare`、`intensity`、`positionCoverage` 按 §5.1 公式 | P7.1 |
| S4 | 相同输入重复一致 | 合成 + 真实 Dust2 | 两次聚合哈希一致（本轮 32×32 = `14c22f958fc54166`） | P7.1 |
| S5 | 零值 vs 无效值 | 合成 | `validPositionSamples=0` 时 share 未定义，输出 `unavailable`，不是全 0 | P7.1 |
| S6 | 缺失样本不作为零位置 | 合成 | `actualTick/position=null` 不计入任何单元，计入 `missingObservations` | P7.1 |
| S7 | 缺失事件位置不伪装成无事件 | 合成 | `scopeEvents` 保留，`unlocatableEvents` 输出原因 | P7.1 |
| S8 | 阵营换边 / 玩家切换 / 回合筛选 | 合成 + 真实 | 阵营取采样时刻；换边后不同回合正确；范围=单回合一致 | P7.1 |
| S9 | 楼层未知与共享边界 | 合成（Nuke/Vertigo/Train 常量） | 缺 Z/边界保持 `null`，进 `unknownLayer`，不归层 | P7.1 |
| S10 | 不同地图尺寸/Canvas 缩放稳定 | 合成 | 2048 参考尺寸下网格按比例缩放不改变归属 | P7.1 |

### 9.2 数据与覆盖

| ID | 检查 | 数据 | 断言 | 阶段 |
| --- | --- | --- | --- | --- |
| D1 | Replay 部分玩家缺失 | 合成 | 缺失玩家的机会仍计入 expected，样本计入 missing | P7.1 |
| D2 | 部分位置字段缺失 | 合成 | `posNull` 不计零，coverage 下降 | P7.1 |
| D3 | 存活状态未知/歧义 | 合成 | `alive=null` / `stateAmbiguous` 排除并计数 | P7.1 |
| D4 | 死亡/重生/断连/跨回合间隙 | 合成 | 不跨 `segment`、不跨回合累计；dead≠missing | P7.1 |
| D5 | Spatial 精确事件样本缺失 | 合成 | 事件保留在 `scopeEvents`，location coverage 下降 | P7.1 |
| D6 | tickRate/回合边界不可靠 | 合成 | `tickRate=null` 不编秒；无效窗口回合计入 `excludedRounds` | P7.1 |
| D7 | 地图资源缺失/映射无效/版本未确认 | 合成 + 真实资源 | `unavailable` / `unconfirmed` 分别表达；缺图仍可看事件 | P7.1/P7.3 |
| D8 | 真实 Dust2 覆盖率与分母 | 真实 Dust2 | `expected=217570`、`valid=178514`、`coverage=0.8205`、`completeness=1.0`、kill 161/162、death 162/162 | P7.1 |

### 9.3 回归保护

| ID | 检查 | 断言 | 证据 |
| --- | --- | --- | --- |
| R1 | P3 Analytics golden 不变 | demo1 数值与既有断言不变 | 本阶段未改生产代码；`analytics` 53/53 通过 |
| R2 | P4 Findings V1 不变 | `ruleId` 顺序与结果不变 | `findings` 17/17 通过 |
| R3 | Deep Review 不变 | 结果与覆盖契约不变 | `deep-review` 210/210 通过 |
| R4 | Timeline / 报告 DTO / Replay 行为不变 | `report.test.mjs` / `replay-*` 通过 | `desktop` 73/73 通过 |
| R5 | UI/IPC 既有 PASS 与 DPI 豁免有效 | 9.15/10 PASS 保持；不重开 DPI 项 | §1 引用既有验收；本阶段不改 UI/IPC |

### 9.4 测试层级归属

- **可用合成数据完成**：S1–S10、D1–D6、R1–R4 的大部分（`dem-parser` / `desktop` 已有同类合成测试模式）。
- **必须使用真实 Dust2 DEM**：D8、S4（真实哈希）、P7.1 的真实聚合覆盖、P7.2 的真实缓存/IPC 行为。
- **必须进入 Electron**：渲染、图层切换、图例、IPC 往返、资源装载、报告/回放回归。
- **必须进入 Windows 安装版**：离线资源、asar 内热力图路径、安装版端到端与清理。
- **不得**用合成测试替代真实数据验收，**不得**把未执行项写成 PASS。

---

## 10. 后续阶段范围与通过条件

> 本阶段只确定范围；P7.1、P7.2、P7.3 **均未开始、均不得标记完成**。

| 子阶段 | 范围 | 通过条件 |
| --- | --- | --- |
| **P7.1 统计投影与契约** | 新增纯函数确定性投影 + JSON-only 契约类型；实现 §5 的位置层与击杀/死亡层；coverage/分母/归一化；网格 N=16/32/64；无 UI、无 IPC | S1–S10、D1–D7 合成测试通过；D8 真实 Dust2 数值可复现；相同输入两次哈希一致；不修改 P3/P4/Deep Review |
| **P7.2 会话与 IPC 集成** | Utility Process 导入时构建有界热力图投影并入会话；`report-contract` additive 元数据 + 受信网格请求；独立降级；清理 | 报告与回放行为不变（R4）；会话释放/重导入/取消/关窗清理；热力图失败不影响报告；真实 Dust2 网格请求可复现；IPC 体积与在途上限实测 |
| **P7.3 Renderer 与筛选** | Canvas 2D 叠加、A/B/C 开关、玩家/阵营/回合/楼层筛选、图例、覆盖与“版本未确认”说明、独立降级 UI | 五 Tab/回放回归；图层与筛选语义（§6）符合；未知数据不伪造；Electron 与安装版端到端；性能预算实测 |

---

## 11. 风险、未验证事项与前置条件

**风险 / 未验证**：

1. **地图版本匹配未确认**：所有 10 图 `versionMatch='unconfirmed'`；只有 Dust2 有真实区域配准，且不是像素级证明。结果只能称“示意”。
2. **真实 DEM 范围仅 Dust2**：其他 9 图只有资源与合成层级验证，**不能**推断热力图可用或配准正确。
3. **楼层精度**：多层地图的 Z 边界来自 overview 元数据；共享边界、缺 Z、越界保持未知，热力图同样不得自动归层。
4. **采样偏差**：8 Hz + 事件补采帧非等间隔；位置采样密度在事件密集处轻微过采样，不是停留时间。
5. **分母脆弱性**：单玩家/名单机会依赖 `RoundStateSnapshot`；名单缺失时会退化为近似值。
6. **颜色归一化**：scope-relative 归一化会随筛选变化，必须在 UI 显式表达。
7. **个人/其他录制模式**：未在个人 DEM 上验证热力图链路；不同录制模式的实体 freshness 仍 UNKNOWN。
8. **Peak memory**：全部为进程生命周期峰值，不是整应用峰值；热力图自身内存待测。

**进入下一阶段的前置条件**：

- P7.1 必须先把 §5 的公式落成可执行测试，并复现本轮的 Dust2 数值。
- P7.1/P7.2 必须证明没有修改 P3/P4/Deep Review/Timeline 语义，且报告 DTO 仍为 JSON-only。
- P7.2 必须实测聚合耗时、DTO 体积、IPC 体积与内存。
- P7.3 必须完成 Electron 与安装版验收，并显式标注“版本未确认 / 仅示意”。
- 任何超出示意图精度的主张，必须先补相应地图的真实 DEM 配准证据。

---

## 12. 文档一致性记录（本次未修改，供后续修正）

- `docs/architecture.md:42` 仍写 “v0.1 Final Acceptance remains **PAUSED**；P5.7.0 is **PARTIAL PASS**；demo2 … block P5.7 FINAL acceptance”，与 `docs/roadmap.md` 的 “v0.1 FINAL PASS / P5.7 FINAL PASS / 个人兼容 gate PASS” 及 `docs/ui-ipc-quality-acceptance.md` 的 9.15/10 PASS 不一致（`architecture.md:128` 同）。属既有陈述，本阶段不改。
- `AGENTS.md` 引用 `.agents/workflows/feature-development.md`，该文件不存在（`docs/ui-ipc-quality-acceptance.md:3` 已记录）。
- 任务书给出的基线 `f0b3a224…` 在本仓库不存在；实际基线为 `aae55e8…`（§0）。

---

## 附录 A：本阶段执行的命令与结果

| 命令 | 结果 |
| --- | --- |
| `git rev-parse HEAD; git status --porcelain` | HEAD `aae55e8…`，开始时工作区干净 |
| `Get-FileHash .demo/dust2.dem -Algorithm SHA256` | `db90fe85…4958c`，与记录一致 |
| `node --test packages/dem-parser/tests/replay.test.mjs` | 7 pass / 0 fail |
| `node --test packages/dem-parser/tests/*.test.mjs` | 48 pass / 0 fail / 0 skip |
| `node --test packages/analytics/tests/*.test.mjs` | 53 pass / 0 fail |
| `node --test packages/findings/tests/*.test.mjs` | 17 pass / 0 fail |
| `node --test apps/desktop/tests/*.test.mjs` | 73 pass / 0 fail / 0 skip |
| `node --test packages/deep-review/tests/*.test.mjs` | 210 pass / 0 fail / 0 skip |
| `pnpm typecheck` | 15/15 successful |
| `node .tmp/p7-heatmap-probe{,2,3}.mjs` | 见 §7.3（临时脚本，未入库） |

**未执行项（如实记录）**：完整 Electron 热力图验收、Windows 安装版热力图验收、其他 9 张地图的真实 DEM 热力图验证、个人 DEM 热力图验证、跨物理显示器 DPI 项（既有豁免，未重开）。

---

## 附录 B：本轮 Dust2 只读实验原始结论（节选）

```text
fixture: matchId=db90fe85…4958c map=de_dust2 tickRate=64 players=10 rounds=24
replay : samplingVersion=native-0.42.0-backport363-replay8-v1 hz=8 maxInterpolationTicks=8
         requestedTicks=27466 playerFrameCells=274660
positionPopulation: valid=235604 validFreeze=57090 validLive=178514
         posNull=0 actualTickNull=0 aliveNull=0 ambiguous=0 sideUnknown=0
         deadWithPos=39056 segNullWithPos=39056 validShare=0.8578 freezeShare=0.2423
         roundsWithFreeze=24 roster=10/round (freeze_end observed) rosterFallback=0
coverage: expectedLive=217570 positionCoverage=0.8205 positionCompleteness=1.0000
eventTicks: allWithFrame=6023 allMissingFrame=0 killWithFrame=162 killMissingFrame=0
spatial : events=6155 killRefs=166 boundaries=72 coverage=partial
kills   : inWindow=162 outOfWindow=4 identifiedActor=161 world=1 teamkill=0
          actorAtEventPosition=161 actorExactTick=161 victimAtEventPosition=162
consistency: actorPosChecked=161 actorPosMismatch=0 actorPosVsReplayMissing=0
grid    : position N=32 nonZero=507 maxShare=0.0509(live 0.0136)  determinism=pass
          kill N=32 points=161 nonZero=103 max=5 ; death N=32 points=162 nonZero=114 max=4
outOfBounds: positions=0 events=0
```
