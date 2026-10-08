# P5.7.6 Combat Execution Evidence

2026-10-08，基线 `1632e5e835e9bd75f1678d08a96b0854a73a45a4`。本轮提供确定性交火执行证据，供 P5.7.7 Findings V2 消费；不生成玩法结论。P5.7.0 **PARTIAL PASS**，P5.7.1–P5.7.5 **PASS**；P5.7.6 为当前任务。v0.1 Final Acceptance 继续 **PAUSED**。

## Production boundary

```ts
analyzeCombatExecution(match: Match, engagements?: EngagementAnalysis,
  impact?: KillImpactAnalysis, spatial?: MatchSpatialEvidence,
  options?: CombatExecutionOptions): CombatExecutionAnalysis
```

生产只修改 deep-review，依赖仍只有 match-model。独立 JSON-only contracts：WeaponFireRef / WeaponFireEvidence、ExecutionContactEvidence、PlayerEngagementExecution、OpponentExchangeEvidence、PlayerCombatExecutionSummary、CombatExecutionAnalysis。KillImpact 参数接受既有管线输出，但本层不使用人数/tags；死亡边界直接核对 Match 的正式回合 kill refs，不重复实现 KillImpact。缺失 KillImpact 不损害可核对的 contact 事实。未修改 P3 Analytics、Findings V1、report-contract、Timeline、Renderer、Electron 或 parser/model。

这不是 Aim Rating。只使用 weapon_fire、confirmed firearm damage/kill/death、contact tick 先后、reported damage、same-opponent return contact、几何距离及 event linkage。没有 usercmd/subtick input、instant velocity、recoil state、verified LOS、hitbox geometry 或 fire target assignment，不能从这些观察推出 aim skill、crosshair placement、recoil control、counter-strafe、movement shooting、纯人类 reaction time 或评分。不使用 entity shots_fired、velocity、buttons/FIRE bit、AI、LOS/nav/cover。

## Event eligibility and traceability

所有 contact refs 保留原 round/type/tick/eventIndex；WeaponFireRef 固定 type=weapon_fire，保留原 shooterId/weapon。eventIndex 是原 round.events 索引，只有引用与稳定展示用途，不证明 subtick 顺序。same tick 的代表引用按 eventIndex 稳定选择，所有先后语义只比较 tick；其余 refs 仍保留。

fire tick若不是nonnegative safe integer，无法构造有效稳定引用，入口抛RangeError，不让NaN/Infinity进入JSON或伪造替代tick。raw contact evidence独立从Match保留，即使Engagement缺失/冲突也不会静默丢unknown；linkage/context另行降级。

独立源验证核对 Engagement directContacts、group membership 与 Match 的 exact 原事件、身份、相反 CT/T event sides、weapon kind、fatal 和 reported damage。group ID 唯一、participant集合一致、contact唯一归属、group round/实际 min/max tick 一致；不存在 stale ref 或 orphan contact 时才支持完整缺失证据。不用全场 Player.team 回填阵营，不按空间或邻近事件猜关联。JSON key order 不影响 source field 验证。

主执行只统计 firearm。utility/melee/taser 不进入 firearm damage/kills/fire counts，只有 contact 排除诊断。unknown contact/fire 保留独立证据与源引用，unknown 不冒充 firearm；contact-weapon-unknown / fire-weapon-unknown 降低对应 coverage。没有在源中观察到 omission 不保证 native event feed 绝对完整；coverage complete 仅相对于已提供领域事件且没有发现缺口，真实源遗漏仍 UNKNOWN。

## Shooter-only fire association

weapon_fire 只有 shooter，不是 player→opponent shot。禁止用 yaw、距离、随后 damage 或最近 opponent 猜 target。

同 round、shooter 是 participant，fire tick 在 Engagement 闭区间内，形成 inside 候选。默认 `preContactFireWindowSeconds=1` 是 event association heuristic：fire 严格早于 startTick 且差 <= seconds×可靠 tickRate 时，形成 lead-in 候选。options 必须 finite >0，缺时钟不猜 64，只禁用 lead-in 和秒数；inside 的 tick 比较仍可保留。窗口不四舍五入扩大，tick 差直接与 seconds×tickRate 比较。

inside 与 lead-in 候选共同进行唯一性检查：只有一个候选才 inside-engagement / unique-lead-in；多个为 ambiguous，engagementId=null，保留 candidate IDs，不优先 inside、不取 nearest。ambiguousWeaponFireRefs 只标示该 context 是候选，可能在多个 context 出现；绝不是多重归属，不加入 confirmed fire counts。不在正式窗口或没有候选的 fire 保留为 unlinked。

`weaponFireEventsBeforeFirstConfirmedContact` 只计唯一关联、严格早于首次确认 offensive contact 的 firearm fire rows。正式描述：“在首次确认攻击接触前观察到 N 次 firearm weapon_fire。”不能称 missed shots 或“空了 N 枪”。`fireToContactEvidence` 只有 observedFireEvents 和 confirmedOffensiveContacts 两个计数；damage与kill rows分别保留，不做去重为物理弹数，不输出 ratio/accuracy/hitRate。

首 fire 早于 offensive contact 且时钟可靠才发布 `firstFireToFirstConfirmedContactSeconds`；same tick 为 null + same-tick-fire-contact-ambiguous，不是0秒；contact更早为 null + contact-before-observed-fire，不推断 parser 错误。没有 offensive contact 时 before count 为 null。

## First contact and opponent exchanges

offensive contact 包含本人作为 attacker 的 firearm damage 与 killer 的 firearm kill；kill即使缺 hurt row 仍是 confirmed contact。defensive contact 是本人作为 victim 的 firearm damage/kill。

双方首 tick 均存在且 feed/linkage可靠：offensive更早 dealt-first、defensive更早 received-first、相等 same-tick。任何 feed/identity/window/linkage缺口为 unknown；只有单侧 contact 时也为 unknown，严格不为缺失方向填入虚构 tick。这不是 initiative、peek advantage 或 reaction win。

每个 player↔opponent / Engagement 输出独立方向 exchange：所有 pair contact refs、first dealt/received、reported damage两侧、damage row counts、firearm kill/death refs、return refs/outcome、首 contact 精确空间距离与 coverage。其他 opponent 的伤害不能充当此 pair 的 return。

## Return contact and absence gates

以 opponent→player 首次 confirmed firearm contact 为 origin，且没有更早 player→opponent contact，观察同 Engagement / round 中 player→同 opponent 的 strictly later firearm damage/kill。weapon_fire 不是 return contact。有 later kill 则 kill，否则 later damage；returnContactRef 是首次 later contact，returnOutcomeRef 是首次 later kill或首 damage，可能不同。

本人的任何正式死亡（包括另一对手/非枪械）定义边界，只有 death tick 之前的 contact 可确定是死亡前 return。origin 与本人死亡 same tick 时 same-tick-ambiguous；不说“没有机会”“0秒被秒”。later return 落在死亡 tick 时同样保留 sameTickReturnRefs 并标歧义。重复死亡/先死亡后origin的矛盾边界不发布 absence。pair deathRef 只指该 opponent 的 firearm death，完整 return 边界仍检查所有本人 raw death。

same-tick reverse contact不成为0秒 return；若存在 strictly later return，可以保留正向观察并降级 same-tick-contact-ambiguous。无 later、有same-tick为same-tick-ambiguous；无 confirmed return只有在正式窗口、源feed未发现缺口、双方身份/阵营、membership及clock可靠、无死亡same-tick歧义时才 none-observed。缺证据为 unavailable，不能因没看到contact就声称“没有还手”。不满足 received-origin关系的 pair 同样 unavailable，return统计分母明确是方向性 opponent exchanges。

`returnContactDelaySeconds` 是首 received 到首次 confirmed反向contact的事件时间差，不是 reaction time；包含游戏状态、peek/网络event tick、weapon state、decision/movement/aim等不可拆分因素。时钟不可靠为null。无 reliable feed时已有明确正向 later contact仍保留，coverage为partial；不存在正向contact时 unavailable。

reportedDamageDealt/Received 是 hurt healthDamage原始加总，保持 overkill，不重新实现 P3 effective HP ledger。非法/非finite伤害使总值null并记reported-damage-unavailable；不丢弃该confirmed contact。无score-like差值。

## Spatial and view-angle feasibility

首 pair confirmed contact 只通过 exact round/type/tick/eventIndex、actor/target role/ID 和 at-event requestedTick=actualTick=event.tick 联结。完整XYZ才计算 horizontalDistance、abs verticalDelta、directDistance；缺证据/重复引用/role冲突为null，并独立降级。没有nearest-tick、距离优劣分类、地图阈值或“合适射程”。distance complete只指位置和精确引用可用，不证明 LOS/entity freshness。

View Alignment = **UNVERIFIED**。本轮没有建立可信 Source2/demoparser2 yaw/pitch coordinate convention，不运行多公式择最小角度，不生产化任何 angle contract。可选 angle probe 未执行，不宣称三图 angle distribution 已验证；三图验证只针对正式event/distance生产逻辑。damage-event alignment 本身也不等于 general crosshair placement quality。

## Three-map fixture matrix and structural verification

| Role | Fixture | SHA-256 | header map | ticks/s | rounds / players | bytes |
| --- | --- | --- | --- | --- | --- | --- |
| Primary | spirit-vs-faze-m1-nuke.dem | dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c | de_nuke | 64 | 21 / 10 | 471606780 |
| Cross-map A | falcons-vs-vitality-m2-inferno.dem | b61c040074f84f1f2c1b683642923243dbe123c2a0c70ed3c0670b0e4cd7a265 | de_inferno | 64 | 24 / 10 | 592871000 |
| Cross-map B | spirit-vs-faze-m3-dust2.dem | db90fe85aab023a1d2c8a5996182e6120d98ef494f02a070b17982b235e4958c | de_dust2 | 64 | 24 / 10 | 557650967 |

只使用仓库.demo指定同名文件，不下载/替换；缺失明确SKIP。SHA锁fixture身份，计数不是比赛golden；不锁队伍/姓名/比分/赢家。目标是检验单图假设、overlap/dense/sparse边界、空间coverage和linkage robustness，不比较职业选手水平或推出地图玩法结论。

每图一次parseWithSpatial，共享Match/Spatial，顺序执行Engagement→KillImpact→Teamplay→Utility→CombatExecution；重复确定性检查只重复纯分析，不重新读取/native parse，不公开Buffer。core ticks无budget丢失、Engagement不跨round、contacts唯一归属、alive counts非负、所有阶段refs可追溯、fire原引用且不重复归属、ambiguous不择一、pair不跨opponent、same-tick不声明顺序、无NaN/Infinity、JSON-only、确定性和输入不可变均由同一测试验证。距离用独立raw spatial oracle重算。

[Nuke详细结构抽样](./deep-review-execution-nuke.json) 自动按predicate选11类样本，含全部fire refs、linkage、roles、return outcomes、damage、distance、coverage与diagnostics；样本存在才选，缺类null。样本选择无硬编码选手/回合。[跨地图报告](./deep-review-execution-cross-map.json) 保存fixture身份、当前run数量、分布、开发距离median/p95/max、coverage、determinism hash和性能，均为开发观察，非生产golden。

## Aggregate and coverage

每个玩家输出 eligibleEngagements、四种first role计数、firearm kills/deaths、五种方向pair return计数、lead-in contexts、全部观察fire数（含unlinked/ambiguous）、唯一关联contexts中的confirmed offensive rows与coverage。fire总观察数不是关联数，return总数不是engagement数；没有rate/score。contexts的 observedFireEvents 只含唯一关联firearm rows。

eligible context包含firearm/unknown contact涉及的player，以及该Engagement唯一linked fire的shooter。因此只以melee contact成为participant、同时有linked firearm fire的玩家也保留shooter-only context；没有firearm pair contact时opponentExchanges为空、first contact refs为null，不猜target。eligibleEngagements是这类证据context数量，不是完整覆盖分母；消费方仍须检查coverage。summary/global fire coverage合并全部观察fire evidence（含unlinked），避免unknown或unidentified fire摘要伪complete。

coverage五层独立：engagementLinkage、fireEvidence、contactEvidence、returnContact、spatialContext。缺Spatial不改变event结果；未知weapon、unidentified/ref conflicts、缺feed、same-tick、clock等保留明确reasons。diagnostics统计contexts/pairs、fire观察/inside/lead-in/ambiguous/unlinked、roles、return outcomes、距离有无、unknown及排除类别；不成为评分。

## Compatibility debt and reproduce

Personal matchmaking DEM compatibility = **UNVERIFIED**。三图PASS只证明cross-map professional GOTV compatibility。Final Acceptance前仍须至少一份真实个人Perfect World/matchmaking DEM；demo1缺失，历史golden明确SKIP，不能由职业fixture替代。source feed completeness、entity freshness、其他录制模式、Peak memory继续UNKNOWN。无installer/Renderer E2E需求，因为相应模块未改。

```powershell
pnpm --filter @cs2-analyst/deep-review build
$env:EXECUTION_NUKE_REPORT_FILE = Join-Path $PWD 'docs/deep-review-execution-nuke.json'
$env:EXECUTION_CROSS_MAP_REPORT_FILE = Join-Path $PWD 'docs/deep-review-execution-cross-map.json'
node --test packages/deep-review/tests/execution-cross-map.test.mjs
Remove-Item Env:EXECUTION_NUKE_REPORT_FILE
Remove-Item Env:EXECUTION_CROSS_MAP_REPORT_FILE
pnpm typecheck
pnpm build
pnpm --workspace-concurrency=1 -r --filter @cs2-analyst/match-model --filter @cs2-analyst/dem-parser --filter @cs2-analyst/analytics --filter @cs2-analyst/findings --filter @cs2-analyst/deep-review --filter @cs2-analyst/desktop test
```

本轮不进入P5.7.7；后续P5.7.7 Findings V2 → P5.7.8 Deep Review Desktop UX。

## Current run observations and final validation

计数均来自提交前最终生产管线run。return列分母为方向性pair；first-role列分母为player/Engagement contexts。unknown不解释为玩法问题。

| Map | Engagement / contexts / pairs | fire observed / inside / lead-in / ambiguous / unlinked | first dealt / received / same / unknown | return kill / damage / none / ambiguous / unavailable |
| --- | --- | --- | --- | --- |
| Nuke | 107 / 284 / 356 | 2690 / 1068 / 164 / 5 / 1453 | 50 / 37 / 3 / 194 | 29 / 26 / 63 / 49 / 189 |
| Inferno | 126 / 310 / 372 | 2881 / 938 / 234 / 0 / 1709 | 55 / 33 / 0 / 222 | 23 / 25 / 70 / 56 / 198 |
| Dust2 | 112 / 317 / 424 | 3119 / 1352 / 236 / 1 / 1530 | 54 / 27 / 0 / 236 | 13 / 26 / 80 / 69 / 236 |

三图exact首contact distance覆盖356/356、372/372、424/424方向pair（反向pair可能共享同一物理源行）；core ticks 3757/4605/4702均保留。首contact直线距离median/p95/max分别：Nuke 580.734/1331.618/2094.465，Inferno 604.965/1369.491/1565.497，Dust2 759.884/1538.961/2991.737；最大abs Z分别380.421/174.725/252.292，单位为原map units，只有开发诊断用途。unknown eligible contact/fire三图均0；存在未识别/缺weapon raw候选，使contact/return coverage partial。Nuke排除2melee/0taser/133utility，Inferno 0/0/199，Dust2 0/0/105（这些是正式窗口原候选计数，非Engagement候选排除口径）。

三图engagementLinkage/spatialContext complete，fireEvidence/contactEvidence/returnContact partial，所有具体reasons见JSON；unlinked不表示miss，same-tick与未知来源不制造负向结论。11类Nuke结构样本本次全部存在，包括received-first→none-observed；严格单侧unknown无需通过改变公式填样本。

| Map | parseWithSpatial(ms) | deep-review pipeline(ms) | combat execution(ms) |
| --- | --- | --- | --- |
| Nuke | 8062.989 | 865.485 | 181.705 |
| Inferno | 5520.871 | 753.782 | 158.166 |
| Dust2 | 4688.662 | 730.782 | 106.005 |

性能为完整回归run的wall-clock，受同时运行既有Nuke测试/系统负载影响，不是SLA或benchmark；pipeline包含execution，determinism/immutability/hash/oracle验证时间在该timing之外。Peak memory UNKNOWN。

| Validation | Result |
| --- | --- |
| pnpm typecheck | 12/12 tasks PASS（11未变任务缓存） |
| pnpm build | 7/7 tasks PASS（6未变任务缓存） |
| match-model | TypeScript contracts PASS |
| dem-parser | 38 PASS / 1 SKIP / 0 FAIL |
| analytics | 48 PASS / 5 SKIP / 0 FAIL |
| findings | 16 PASS / 1 SKIP / 0 FAIL |
| deep-review | 167 PASS / 0 SKIP / 0 FAIL，含44 execution synthetic、3地图+parent test，TypeScript contract guards PASS |
| desktop | 16 PASS / 1 SKIP / 0 FAIL |
| independent review | 3边界修复并补回归，最终复审PASS，无遗留阻断 |

全部8SKIP仅因demo1缺失，历史golden未执行。独立review发现非法fire tick非finite输出、unlinked unknown fire摘要coverage丢失、缺Engagement时raw unknown contact丢失，均修复并补测试；另补key-order和仅linked fire参与者context边界。source validation不复用Teamplay契约，本轮没有改变P5.7.4。UTF-8无BOM、whitespace与生产package boundary检查通过；无当前实现blocker。
