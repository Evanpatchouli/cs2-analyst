# P5.7.1 Spatial Evidence Foundation

2026-10-08，基线 `1cb5eed78ebbdbc57edb436292125e52cb3d8cc2`。Foundation 已实现并完成职业 GOTV 验证，未进入 P5.7.2。完整实测摘要：[Nuke validation](./deep-review-spatial-nuke.json)。

## Contract / package boundaries

领域契约在 `packages/match-model/src/spatial.ts`；dem-parser 的显式入口 `Demoparser2Provider.parseWithSpatial(filePath, options?)` 返回 `{ match, spatial, performance }`。原 `parse()` 路径保持，Spatial 不进入 Renderer 或 frozen Analytics/report-contract。Match、MatchEvent 不变，无 cyclic reference；只有 dem-parser 内部 adapter 调用 native API，公开类型无 Buffer/native object。performance 独立于确定性证据。

- `MatchSpatialEvidence`：matchId（内容hash）、entity-state provenance / exact-only policy、sampling manifest、events 和整体 coverage。
- `SpatialEventRef`：round / type / tick / eventIndex；eventIndex 是原 `round.events` 索引，区分同 tick 多事件，不表示 subtick 顺序。边界使用 start / freeze_end / end。
- `SpatialEvidence`：eventRef、participants（actor/target SteamID string 或 null）、samples 和 coverage。samples 按 actor / target / relevant 关联；relevant 是 Match.players 中其余查询对象，不证明回合参与、队友、可见或可支援。未知 actor 不制造 ID。
- `SpatialSample`：requestedTick / actualTick、relation、playerId、nullable XYZ / yaw-pitch / health / alive、TeamSide、nullable activeWeapon、coverage 和分字段组 fields。
- **无精确玩家行时 actualTick=null**，不会复制 requestedTick；存在精确行但字段缺失时 actualTick 仍是真实 tick。返回的其他 tick 仅记录在 returnedTicks，绝不最近邻替代。
- relation 区分 before-event / at-event / after-event / boundary；death tick 仅称 **at-death-event state**，不是 pre-death aim。before/after 必须来自独立请求的实际 tick。
- required candidates 仅 X/Y/Z/yaw/pitch/health/is_alive/team_num。非法/缺失保持 null/Unknown，零值仍为零。XYZ/view 作为原子组归一；state 分开保留 nullable health/alive。team_num 0/1 归为 Unknown，不表示 CT/T 参与。activeWeapon 是 native display name，不是稳定武器identifier，也不回填 event.weapon。
- velocity、shots_fired、scoped/walking/airborne、aim punch、buttons/FIRE、usercmd 和 subtick 都不进入本轮查询/契约。

## Sampling

全部模型 round start / freeze_end / end 和 kill、damage、weapon_fire、utility、flash、bomb 唯一 tick 是 core，始终保留，包括原模型保留的 post-round 事件。默认 tickBudget=24000，指 unique requested ticks；core 超预算时允许超预算执行。

optional 仅 kill/damage/weapon_fire ±contextSeconds（默认0.125秒）；按可靠 tickRate 四舍五入，最小1tick，本样本±8ticks。只在已记录的 round start/end 闭区间采集，越界/窗口未知记 context-outside-round，不跨回合猜状态。未知 tickRate 禁用时间邻点并记 tick-rate-unknown；contextSeconds=0 可明确关闭邻点。

optional 去重并排除与 core 重叠者，按 tick 升序保留到剩余预算，用 omittedOptionalTicks 记录其余点。**只裁 optional，不对整个 wantedTicks 降采样**。此策略优先较早 context，消费者须检查逐样本 coverage，不能当均衡全场轨迹。一个事件的 before/after tick 若同时是其他事件 core，则仍保留。无 tick 时不调用 parseTicks，避免空数组触发上游全量采样。

## Coverage

sample / event / match 都有 complete / partial / unavailable。sample.fields 独立给出 position / view / state / weapon；complete 只表示所请求核心结构数据齐全，不证明实体 freshness 或游戏结论。

原因包括 requested-tick-missing、player-row-missing、position-missing、view-missing、state-missing、weapon-unavailable、sample-budget-truncated、context-outside-round、tick-rate-unknown、participant-unidentified、sampling-failed。位置/视角/状态缺失使核心降级；只有 weapon-unavailable 时核心仍可 complete，但 fields.weapon=unavailable，依赖武器的未来消费者必须独立门控。实际查询失败时保留 Match / 事件引用并将空间 coverage 标 unavailable；原 parser 失败仍拒绝 Promise。

所有 metadata 玩家都是查询候选；missing row 不证明玩家死亡或没有参与。缺失的 round boundary 仍由 Match 的 absent tick 表达，不制造未知 tick 的 eventRef。

## Nuke validation

测试 `packages/dem-parser/tests/spatial-real.test.mjs` 只用 SHA-256 锁定 fixture，不硬编码队伍、选手、比分或比赛结果：`dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c`。

| 项目 | 本轮实测 |
| --- | --- |
| event refs / kill refs / round boundaries | 4799 / 145 / 63 |
| identified / unidentified kill actors | 142 / 3（world / planted_c4，playerId=null） |
| at-event actor / target 核心完整 | 142/142 / 145/145 |
| before-event actor / target 核心完整 | 141/142 / 141/145；其余明确降级 |
| after-event actor / target 核心完整 | 125/142 / 125/145；越界不采集 |
| core / optional / requested ticks | 3757 / 5574 / 9331 |
| returned ticks / rows | 9303 / 93030 |
| core 完整 | 3757/3757 ticks，37570/37570玩家行 |
| optional missing / budget omitted | 28 ticks / 0 |
| 核心完整 / 预期唯一玩家样本 | 93030/93310（含缺失tick的280行） |
| 存活玩家 activeWeapon | 74843/74843（100%） |
| aggregate coverage | partial：可选tick缺失、越界context、未知actor；weapon缺失独立记录 |
| tickBudget=0 实测 | core全保留、核心完整；只裁optional |
| 同输入重复 | evidence hash一致；Match与原parse deepEqual |

## Performance

Windows x64，锁定 native 0.42.0，5700G 开发机。普通独立 parse=1.880秒。下表每行是同次顺序实测，不将独立中位数相加；parser包括读文件、hash、原解析和Match转换；spatial包括计划、一次新native parseTicks、归一。测试断言/JSON hash不计入。非冷启动、无硬件SLA。

| 运行 | parser秒 | spatial秒 | 同次总秒 |
| --- | --- | --- | --- |
| shared input #1 | 1.629 | 1.692 | 3.322 |
| shared input #2 | 1.611 | 1.595 | 3.205 |
| core-only（budget=0） | 1.892 | 1.173 | 3.064 |

adapter 每次新入口只 readFile 一次，在同一约449.76 MiB Buffer上完成原解析与空间查询，不额外 parseEvents、不重复读取DEM。原边界名单查询保持原行为，空间查询额外一次；调用数由代码/独立review确认，不冒充OS I/O测量。**Peak memory=UNKNOWN**；仍全量读DEM，稀疏返回不证明native/input内存按比例下降。

## Personal DEM compatibility debt

当前开发机没有可运行的个人 matchmaking DEM，**Personal DEM spatial compatibility = UNVERIFIED**。职业GOTV结果不证明个人DEM一致；不为凑验收寻找、下载或伪造个人DEM。

这不是P5.7.1 blocker，但 **Deep Review正式FINAL Acceptance前必须用至少一份真实个人DEM补验**：required field coverage、event tick completeness、active weapon、sampling performance、recording-mode differences。恢复原始demo1后还须独立重跑其历史数值golden。实体更新freshness、峰内存与其他录制模式仍UNKNOWN。

## Verification / scope

合成测试覆盖contracts、core/optional budget、requested与returned tick不同、missing player、required字段、nullable weapon、before/at/after、同tick ordinal、未知时钟、越界context、未知actor、determinism、sampling failure和空计划；match-model另有独立TypeScript contract tests。独立review未发现actionable问题。

本轮五包测试与typecheck/build执行结果见 [Deep Review](./deep-review-evidence.md)；demo1缺失的真实golden明确SKIP，不引用历史PASS作为本轮执行证据。本轮未执行report E2E或installer/installed regression，没有相关产品修改。P3 semantics、Findings V1、Timeline、桌面报告/report-contract、kill-feed、branding、packaging未修改。

无P5.7.1实现blocker。未实现新Findings、coaching conclusion、LOS、优势枪位、补枪判断、意图、停枪质量、反应时间、移动射击或Engagement clustering。

```powershell
pnpm --filter @cs2-analyst/match-model build
pnpm --filter @cs2-analyst/dem-parser build
$env:SPATIAL_REPORT_FILE = Join-Path $PWD 'docs/deep-review-spatial-nuke.json'
node --test packages/dem-parser/tests/spatial-real.test.mjs
Remove-Item Env:SPATIAL_REPORT_FILE
```
