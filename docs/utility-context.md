# P5.7.5 Utility Context

基线 `caa08865ae23ef4f2563aff8e4ed4cc0faefc86f`。本轮仅 `packages/deep-review` 增加 effect-level evidence；P3 Analytics、Findings V1、match-model/parser contracts、Renderer/Electron/packaging 全部保持冻结。P5.7.0 PARTIAL PASS，P5.7.1–P5.7.4 PASS；P5.7.5 实现与 GOTV 结构验证完成，产品验收待定。v0.1 Final Acceptance 继续 PAUSED。

## Effect contract / boundary

入口 `analyzeUtilityContext(match, optional spatial, optional killImpact)` 返回 JSON-only `UtilityContextAnalysis`。正常完整调用提供 `MatchSpatialEvidence` 与 `KillImpactAnalysis`；缺输入仅相应层降级。未实现可选 Engagement proximity，未引入 TeamplayAnalysis 依赖。

核心是 `UtilityEvent` 的 smoke/HE/flash detonate、fire start_burn、decoy start_decoy，**Effect Context，不是 Throw Trajectory**。保存全部 Match 里的效果行，包括 post-round 行；后者保留 origin/ref 但正式回合人数、空间和 bomb state unavailable。`UtilityEffectRef = {round,type:'utility',tick,eventIndex,utility,action}`；eventIndex 始终索引未改动的 round.events，并不表示 same-tick subtick 顺序。

每个 context 包含 throwerId/throwerSide/entityId、effect XYZ、roundContext、敌/友距离数组与 nearest、directOutcome、六层 coverage；没有 releaseRef。effect tick 不是非负 safe integer，或 round 不是正 safe integer 时直接 RangeError，避免 JSON 将 NaN/Infinity 转 null 破坏 ref；合法 tick 越出正式回合仍保留并降级。UtilityEvent.thrower 是已报告的 effect actor evidence。weapon_fire 没有稳定 grenade entity ID，不使用最近 release、FIFO 或时间窗口猜归属；本轮也没有任何独立可证明的 release-effect 输出。

## Spatial / alive / timing

- matchId + round/type/tick/eventIndex 精确 join；duplicate ref/actor conflict 拒绝。只接受 requestedTick=actualTick=effect.tick 的 at-event sample，不能 nearest tick/event。
- 原点仅来自 UtilityEvent.position；缺 XYZ 不用 thrower 位置或地图中心替代。
- 存活 truth 使用 KillImpact.RoundAliveState；先拒绝非JSON数值/undefined，再验证其与同一 Round 的 deterministic resolver 一致，JSON object key 顺序不影响等价。缺/stale/mismatched state 不猜人数。throwerSide 与可靠 roster 冲突时，actor partial、人数与敌我空间分类 unavailable，不静默选择任一阵营。
- 确定存活、完整 XYZ 的玩家输出 playerId、enemy/teammate relation、XY horizontalDistance、**绝对 Z 差** verticalDelta、XYZ directDistance，单位为 map units。队友不含 thrower，自身受闪仍单独保留。按 directDistance、SteamID 字符串升序稳定排序。
- Spatial is_alive 不决定先后或资格。deathTick=effect.tick 的玩家从确定存活位置候选排除，保存 sameTickAliveAmbiguousIds。人数为 null，保留 beforeAtomicGroup/afterAtomicGroup，coverage `same-tick-alive-ambiguous`；不任选一个当作生效瞬间。
- nearest 是完整观测位置子集中的最近者；缺玩家位置时 partial，不能声称全体最近。distance 不代表 LOS、投掷有效范围、可支援性、路径或命中可能性，尤其 Nuke 多楼层。
- finite positive tickRate 且正式回合持续秒数有限时，输出 secondsFromRoundStart；可靠 freezeEndTick 且 effect 不早于它时输出 secondsFromFreezeEnd。时钟未知不猜 64；缺 freeze end/越界/早于 freeze end 降级，不定义 early/late utility。

## Bomb context

仅消费 BombEvent 的 plant_start→planting、planted→planted、defuse_start→defusing、defused/exploded→resolved；正式回合初始 pre-plant，证据异常 unknown。pickup/drop 不改变阶段。状态是**已报告生命周期的最近确定阶段**；模型没有 plant/defuse abort，不保证 planting/defusing 行为持续，也不推断持续时长。

同 tick lifecycle+utility 一律 unknown/partial，并保留 bombBeforeSameTick 与 bombSameTickActions；不按数组次序确定先后。更早同 tick 不同生命周期 action 也不能排序，直到后续单独 observation 恢复状态。无效 lifecycle tick、回合边界不足为 unavailable。不映射 siteIndex 到 A/B；planted 仅描述 C4 阶段，不解释为守包烟/retake 火。

## Direct outcome linkage

**HE**：同 round、同已识别 thrower、归一 weapon=hegrenade、exact same tick，且候选 effect 唯一。未知 thrower 的同 tick HE 也可能属于该 actor，参与歧义检查。不同 attacker 不归属；多个候选拒绝 attribution。保留每条 damage ref/victim/reportedHealthDamage 与 enemy/team/self/unknown 分类；reportedEnemyDamage 是可确认敌伤观测子集，不截断 overkill、不重复实现 P3 effective HP ledger。

HE linkage exact/partial/unavailable。exact 无 damage 表示当前领域 feed 内没有确认直接伤害，不能证明 DEM 无遗漏。该 actor（或未知 actor）的未匹配 HE damage、缺 weapon damage 使同回合相关 contexts partial，防止假完整零；不同 tick 不扩大窗口，缺 side/非法数值也降级。unavailable 的 reportedEnemyDamage=null，不能冒充 0。partial 的数值仍只是已确认子集。coverage complete 只相对于 parser 提供的领域数据，当前没有 source-feed completeness manifest。

**Fire**：DamageEvent 没有 inferno entity linkage，start_burn 不含 fire lifetime/伤害 causal ID。始终 effect-level reportedEnemyDamage=null、linkage unavailable；不把后续同 actor 或最近 startburn 的伤害硬分配给某颗火，即便同 actor/round 只有一个 effect。位置/存活/敌我距离与伤害归属独立保留。

**Flash**：同 round、flashbang effect 的非空有效 entityId、FlashEvent 相同 entityId、attacker=thrower，且该 entityId 在 round 的 flash effects 中唯一。多 victim 行是正常一闪多人，不能因为多行判 reuse；effect 多行复用才拒绝关联。missing entity/reuse/mismatch 使 partial/unavailable，绝不 tick+actor 猜。跨回合 ID 可复用；该策略不尝试用 tick 窗口拆分回合内 reuse。保留每条敌/队友/自身/unknown effects 的 exact eventRef/victim/tick/rawBlindDurationSeconds，包含 0 duration；**raw duration != actual continuous blind time**。没有 refresh/expiry/死亡终止模型。

KillEvent.assistedFlash+assister 可证明玩家官方助攻，却无 grenade identity，不能证明是哪一个 effect。因此 `confirmedFlashAssists=null, assistLinkage='unavailable'`，不自行推断或分配；冻结 P3 aggregate assist 保持原样。

**Smoke / decoy**：directOutcome linkage not-applicable，coverage 表示此类没有本轮适用的直接伤害关联；仅保留上下文。不得说 blockedEnemy/cutSightline/siteSmoke/goodSmoke/badSmoke。

## Value / intent limits

HE 0 confirmed damage + 最近敌人 1200u，不能证明只想封路或扔歪；HE 0 confirmed damage + 100u 也不能判坏雷，因为墙体、高度、掩体、爆炸遮挡与 entity freshness 均未建模。最多描述“没有确认直接伤害”和完整度允许的距离事实；**敌人位置缺席不证明敌人不在场**。

Smoke/fire 直接伤害缺失或 0，不等于低战术价值。可以记录 planted、3v3、effect XYZ、N 个完整敌方位置、最近距离，不能判断好烟/坏烟、火封路或敌人因火绕路。本轮无 utilityScore/grenadeScore/smokeQuality/flashQuality、LOS/nav/map geometry/intent/AI。Findings V2 未来才能决定哪些证据足够解释；不会本轮继续实现。

## Coverage / diagnostics

actorAttribution、position、roundState、bombContext、spatialContext、directOutcome 六层各为 complete/partial/unavailable，reasons 去重排序；各层独立，fire outcome unavailable 不抹掉空间事实。缺 actor、unknown/conflicting side、缺 effect/player position、missing/external spatial、同 tick 存活或 bomb ambiguity、missing/reused entity、unmatched outcome、无可靠时钟/边界均明确降级。完整 reason union 见 `src/utility-contracts.ts`。

diagnostics 是开发自检，不是产品评分。`heExactDamageLinked` 计 exact 且有 damageEvents 的 effect 数，`heUnlinked` 计非 exact 的 HE context 数（含 partial completeness），**不是未关联 damage 行数**。flashExactLinked 计 exact effects（可没有 victim rows）；flashAmbiguous 计带 flash-link-ambiguous 的 effects。其余效果/位置/thrower/空间与 ambiguity 计数均为 effect 行数。

## Nuke research / automatic cases

本地 `.demo/nuke.dem` SHA-256：`dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c`。生产/自动选择没有硬编码队伍、玩家姓名、比分或故事。研究覆盖全部 Match round.events；候选 tick delta 分布是所有同 actor/round 的 **damage-effect pairs**，不是配对结果。

| 研究 | 实测 |
| --- | --- |
| HE detonation / HE damage | 74 / 15；15 行全部同 thrower/tick 唯一，delta={0:15}，0 ambiguity / 0 unlinked identified HE damage |
| HE contexts | 41 exact、33 partial、0 unavailable；9 个 exact effects 有伤害，15 条 damage refs |
| HE completeness 降级 | 17 条缺 weapon 的 damage 行，含未知 actor；保守传播到对应回合的 33 个 HE contexts，不推断它们是 world/fall/bomb |
| Fire starts / fire damage | 105 / 114；0 exact-same-tick，0 stable entity linkage；97 个 effects 属于 actor/round 单 effect，8 个属于双 effect 分组 |
| Fire candidate tick deltas | -13 到 437 ticks，27/40/53/…分散；完整 histogram 在 JSON，负 delta 也不改写或“修正”为关联 |
| Flash detonation / victim effects entity coverage | 88/88、158/158 |
| Flash strict unique entity+actor | 144 victim rows；80 exact effects |
| Flash round ID reuse | 8 effect rows，14 victim rows ambiguous；0 actor mismatch、0 unmatched entity；不通过时间窗口解歧义 |
| All effects | 404 = smoke136 + HE74 + flash88 + fire105 + decoy1；position404、thrower404 |
| Spatial / ambiguity | 403 complete、1 post-round unavailable；0 same-tick alive、0 same-tick bomb（特殊案例仅 synthetic） |
| Fire attribution unavailable | 105 effects，符合边界 |

`docs/deep-review-utility-nuke.json` 保存研究、完整 coverage、diagnostics、独立 oracle 和 10 类 context 抽样：HE confirmed damage/zero、HE 最小观察敌距、smoke/fire 有敌方位置、flash 敌/友、planted utility、最高敌方 Z 差、entity ambiguity。最小距离抽样不引入“附近/有效范围”阈值；没有结构案例才允许 null。

人工读取自动样本的数据复核（没有画面回放）：R4/t30875 HE reported enemy damage=73（60+13），最近 XYZ≈146.47u；R2/t16123 HE observed zero，最近≈741.08u；最小观察 HE 敌距 R7/t58504≈81.15u，reported43；R8/t70218 fire 为 planted、1v2、最近≈403.76u，但伤害仍 unavailable。最高 Z case 与 reuse case 保留全部位置事实，不解释价值或意图。这些 refs 是**自动选择后的观察记录**，不是生产/测试选择条件。

独立 Nuke 检查逐 effect refs、at-event geometry、alive counts、HE/flash 源行与唯一消费；404 spatial contexts、15 damage rows、144 flash rows，全通过。重复分析、JSON roundtrip、输入不可变、无 Spatial 时 outcome/roundContext 相同均通过。合成覆盖 missing/conflicting actors、HE 歧义与零、fire 边界、flash entity/reuse/team/self/raw duration、精确位置缺失、same-tick deaths/bomb、全部 bomb stages、时钟/边界、垂直/距离 tie、stale state、immutability/determinism。

## Regression / remaining debt

全仓 `pnpm typecheck` 12/12、`pnpm build` 7/7 PASS（Turbo 分别复用11/6个未变任务缓存）。六包回归：match-model TypeScript contracts PASS；dem-parser 38 PASS/1 SKIP、analytics 48/5、findings 16/1、deep-review **119/0**、desktop 16/1，0 FAIL。Deep Review 最终数值边界修复后重跑typecheck/build与全部119测试；35个新增synthetic和Nuke由独立review复核，最终 **PASS，无遗留finding**。修复项涵盖未知HE候选、side conflict、JSON key顺序、非法ref tick、NaN/null输入混同。生产import边界、UTF-8无BOM及whitespace检查通过。

本轮无 Renderer/Electron/packaging 修改，无 installer E2E。8个 SKIP 全因 demo1 缺失，不把历史 golden PASS 当作本轮验证。

**Personal DEM compatibility = UNVERIFIED**；职业 GOTV 不替代个人样本，Deep Review FINAL Acceptance 前仍须真实个人 DEM + 恢复 demo1 golden。source feed completeness、entity freshness、其他录制模式、peak memory、map geometry/LOS、effect-level flash assists 仍 UNKNOWN/不可用；这些限制不阻塞本轮保守 effect context。后续顺序为 P5.7.6 Combat Execution Evidence → P5.7.7 Findings V2 → P5.7.8 Deep Review Desktop UX。

重生成样本：

```powershell
pnpm --filter @cs2-analyst/deep-review build
$env:UTILITY_REPORT_FILE = Join-Path $PWD 'docs/deep-review-utility-nuke.json'
node --test packages/deep-review/tests/utility-nuke.test.mjs
```
