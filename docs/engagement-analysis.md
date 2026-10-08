# P5.7.2 Engagement Engine

2026-10-08，基线 `f37db2e42bcf9e42d489d03c5e52ae625d7e0d4a`。实现与 Nuke GOTV 结构验证完成，产品验收待定；v0.1 Final Acceptance 继续 **PAUSED**。P5.7.0 **PARTIAL PASS**，P5.7.1 **PASS**。本轮无 coaching conclusion、评分或 Renderer 修改。

## Contract / architecture

新增 `@cs2-analyst/deep-review`，生产依赖只有 `@cs2-analyst/match-model`，纯 TypeScript、无 native/Electron/Renderer/AI。入口：

```ts
analyzeEngagements(match: Match, spatial?: MatchSpatialEvidence,
  options?: EngagementOptions): EngagementAnalysis
```

`dem-parser → match-model → analytics` 与 `match-model → deep-review` 两条独立分析支路；未来 Findings V2 可同时消费 MatchAnalytics 和 Deep Review，本轮不接入 findings 或 desktop。P3 public contracts/语义、Findings V1 保持冻结。生产 exports 只包含 deterministic 分析、weapon classifier 与独立 contract；敏感性报告只在测试中产生。

`EngagementAnalysis` 包含 matchId、available、config、directContacts、engagements、diagnostics 和独立的 eventSegmentation / spatialEnrichment coverage。directContacts 在时钟不可靠时仍保留。Engagement 包含稳定 ID、round、起止 tick、durationSeconds、排序后的 participantIds、原始 contacts、killCount/damageContactCount 与两种 coverage。Contact 是 JSON-only 值投影，不含 MatchEvent/native 引用，ID 全为 SteamID string，不使用昵称。

## 精确定义与 grouping heuristic

Engagement 是**由明确敌对玩家直接 combat contact 组成的确定性事件组**。它是产品分组启发式，不是官方 duel、完整 peek、战术阶段、LOS 或玩家心理上的“一波”。分组结果可复算，不能将启发式当作游戏引擎 ground truth。

按回合独立处理，将 contact 按 tick → 原 round.events eventIndex → event type fallback 稳定排序。两个 contact 可连接，当且仅当同 round、tick 差不大于 gapTicks、至少共享一个攻击者/受害者。最终输出该图的 connected components，使用 union-find 与每个 participant 的最后一个 contact，避免两两扫描。对同一参与者，若更早 contact 还在窗口内，它已通过连续的该参与者 contact 连到最新者，因而这种优化保持完整图语义。测试用独立两两图遍历核对合成数据与真实 Nuke 四个 gap。

A→B 后 B→C 可以连接；同时 A→B 与 D→E 无共享 participant 时保持分离；后续 contact 可以桥接先前两个 component。传递链总时长允许超过 contactGap：contactGap 是边的连接条件，**不是 Engagement 总时长上限**。严格禁止跨 round。

默认 `contactGapSeconds=3` 是 **product grouping heuristic**。必须 positive finite，否则 RangeError。`gapTicks=Math.round(seconds * match.tickRate)`，正数秒四舍五入为 0 tick 时仅能连接同 tick 共享参与者事件；溢出 safe integer 的转换抛 RangeError。tickRate 缺失、非 finite、<=0 或任何有效正式窗口跨度无法转换为 finite 秒时，contactGapTicks=null、available=false、engagements=[]，保留 directContacts，coverage 标 tick-rate-unreliable；不猜 64 或固定 tick gap。窗口跨度门控保证传递组时长不会输出 Infinity（JSON 会将其改为 null）；独立review复现该极小正时钟边界后已修复并补回归。

Stable ID 基于 escaped matchId / round / 首 contact tick、eventIndex、type / 稳定 component ordinal，无随机 UUID。重复输入 deepEqual/JSON hash 一致。round number 必须是唯一 safe integer，否则 RangeError，避免同一引用映射两个回合。

## Direct contact 与排除

候选只来自 damage/kill。要求正式 round.startTick..endTick 闭区间（两端均非负 safe integer 且有序）、event tick 有效、可识别非零数字 SteamID、双方不同、双方 event side 明确 CT/T 且相反，kill 不能 confirmed teamkill。不用 Match.players 的全场阵营回填 event side，不借 roster/位置猜攻击者或敌人。

保留 round/type/tick/eventIndex、攻击者/受害者、原 weapon identifier；damage 原样投影 reportedHealthDamage/healthRemaining（不 cap overkill、不重新实现 effective damage ledger）；kill 原样保留 fatal/headshot/assistedFlash，包括 false 和缺省区别。kill contact 本身保留 killer→attackerId，下一阶段可按 Engagement/player 数 kill 行。

诊断以每个候选行只计一个排除原因为原则，顺序为：无效/缺失正式窗口 → 无效 event tick → pre-round → post-round → world/null/未知身份 → self → confirmed teamkill → 未知阵营 → 相同阵营 → utility。candidateContacts = includedContacts + 各 excluded 计数。utility 列只统计先通过身份/阵营等门控的敌对 utility；例如 world bomb 死亡记 unidentified，避免重复计数。不静默删除证据；未知 side/identity、无效窗口/tick 使整体事件覆盖降级。

武器类别：明确枪械 firearm，knife/knife_* / bayonet 为 melee，taser 为 taser，未知/缺省为 unknown。classifier 只规范大小写与 weapon_ 前缀，原字符串保持；独立最小领域 catalog 不读取 Renderer killfeed mapping。unknown 可作为 anchor，并记录 unknownWeaponKind、逐 contact weapon-kind-unknown coverage。

hegrenade / inferno / molotov / incgrenade / flashbang / smokegrenade / decoy / planted_c4 / c4 / bomb / bomb_explosion 为 utility；damage 和 kill 均不作为 anchor 或桥接，也不擅自归到附近 Engagement，后续 P5.7.5 独立分析。weapon_fire 只有 shooter，完全不用于对手 contact；不以 yaw、距离、最近敌人或其他信号猜 target。

## 同 tick / 重复行边界

hurt + death 均保留，攻击者/受害者相同且 gap 内自然进入同一 component，不能将两行当成两次独立交火。eventIndex 是原 round.events 索引，只用于引用身份/稳定排序，**不代表 subtick 或 causal order**。

两个相同内容甚至相同 JS object 出现在不同数组索引时仍是不同 evidence row；没有证明重复来源，不能删掉。repeatedEventRows 记录 eligible contact 中相同 type/tick/attacker/victim 的后续行，sameTickContacts 记录同回合共享 tick 的全部 eligible 行。killCount/damageContactCount 都是保留 contact 行数，不声明能从原始重复行恢复唯一游戏动作。

## Spatial exact join / coverage

先核对 matchId；只按 **round/type/tick/eventIndex 四键完全一致**联结。不同 match、缺引用、重复空间引用、participant role/SteamID 冲突分别记 match-mismatch/missing/duplicate-ref/participant-mismatch，均不择一猜测。未传空间为 not-provided。evidencePresent 表示同 match 的该 exact ref 存在，包括存在但有冲突的情况。

成功 exact join 投影 evidenceCoverage 和 actor/target 的 at-event、before-event 样本 coverage（含 requestedTick、actualTick、field groups）；缺样本为 null。at-event requestedTick 必须等于事件 tick；before-event 必须更早；实际 tick 非 null 必须与 requestedTick 一致。多条同 role/relation/player 样本不择一选取。所有 coverage/field/reason 均复制为值，不挂输入对象。不存在 nearest-tick、nearest-event、attacker/victim 猜 event 或跨 contract 数组位置匹配。

- **eventSegmentation**：只依赖正式窗口、身份/阵营、contact events、tickRate。整体 unavailable 表示不能运行时间分组或所有 round 窗口不可用；部分 round/evidence 缺失、unknown weapon 为 partial。已输出单个 Engagement 的 grouping coverage 可 complete，即使整体存在其他被排除的未知身份。
- **spatialEnrichment**：分别计 contacts/exactJoinedContacts/completeAtEventContacts/completeBeforeEventContacts。所有 contact 的双方 at 与 before 核心完整才 complete；至少存在一个实际样本但有缺项为 partial；无实际样本或空 contact 集合为 unavailable。activeWeapon 字段单独保留 coverage，不据其 nullable 值改变核心完整定义；沿用 P5.7.1 的字段门控。

Spatial unavailable/partial 不抑制事件分组。无距离优劣、补枪机会、LOS、站位、瞄准/决策/团队分数、winner、impactScore 或 qualityScore。空间状态只是可追溯上下文，不证明 entity freshness、可见性或玩家意图。

## Nuke structural report

固定本地 fixture `.demo/nuke.dem`，SHA-256 `dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c`。测试只锁 SHA 与结构 invariants，不硬编码队伍、选手、比分、赢家或战术故事。[可复算结构报告](./deep-review-engagement-nuke.json)。

| 项目 | 本轮结果 |
| --- | --- |
| 正式 round / parser-reported tickRate | 21 / 64 |
| candidate / included contact | 776 / 620 |
| damage / kill contact | 478 / 142 |
| excluded post-round / unidentified / self / team / utility | 9 / 11 / 2 / 12 / 122 |
| excluded window / invalid tick / pre-round / unknown side | 全部 0 |
| unknown weapon / repeated row | 0 / 0（保留/降级机制由合成案例覆盖） |
| same-tick contact rows | 301（保留原 eventIndex，不声称 subtick） |
| default 3s / gapTicks / Engagement | 3 / 192 / 107 |
| exact spatial join / 双方 at 核心完整 | 620/620 / 620/620 |
| 双方 before 核心完整 | 618/620，其余明确 partial |
| 全场 event coverage / spatial coverage | partial（unidentified 排除） / partial（before 缺项） |

全部 eligible contact 恰好归属一次、无重复 membership、不跨 round、无 post-round/utility anchors；每个引用映射回原事件，每个空间 projection 与 exact evidence 样本一致。同输入重复相同，去掉 spatial 后 ID/segmentation 一致。独立完整图 oracle 在四个 gap 全部一致。没有从真实样本中未发生的 unknown weapon/repeated row 情况推断已验证真实兼容。

## Gap sensitivity（开发验证，非生产 API）

median 为中位数（偶数取两个中央值均值），p95 为 nearest-rank `ceil(n*0.95)`，时长按事件 tick span / tickRate，singleton 是只有一行 contact，不等于一次 duel。所有 gap 都包含同一批 620 contact。

| Gap(s) | Engagement | Singleton | Multi-contact | Median(s) | P95(s) | Max(s) | Max participants | Max contacts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 116 | 13 | 103 | 0.234375 | 2.78125 | 8.09375 | 8 | 23 |
| 3 | 107 | 10 | 97 | 0.359375 | 3.1875 | 11.078125 | 9 | 29 |
| 4 | 99 | 8 | 91 | 0.5 | 4.46875 | 11.078125 | 10 | 35 |
| 5 | 96 | 8 | 88 | 0.4765625 | 5.1875 | 13.65625 | 10 | 35 |

结构上 gap 增大导致 component 数量非增，四个完整图 oracle 一致，无遗漏/重复/越界或算法异常。3s 最长组超过 3s 符合传递闭包定义；不能据此称战术合理或定为异常。本轮保持产品默认 3s，未按职业比赛故事调整定义。

## Personal DEM compatibility debt / unknowns

Personal DEM Engagement/spatial compatibility = **UNVERIFIED**。开发机缺少真实个人 matchmaking DEM，职业 GOTV 不替代个人模式验证；不寻找、下载或伪造样本。Deep Review FINAL Acceptance 前至少一份真实个人 DEM 补验正式窗口、身份/阵营、contact event/ref、spatial 核心字段、录制模式与性能。demo1 缺失，原历史数值 golden 仍需恢复原文件重跑。entity freshness、峰内存、其他地图/片段/异常录制仍 UNKNOWN；本轮无实现 blocker。

## Reproduce / regression

```powershell
pnpm install --offline --frozen-lockfile
$env:ENGAGEMENT_REPORT_FILE = Join-Path $PWD 'docs/deep-review-engagement-nuke.json'
pnpm --filter @cs2-analyst/deep-review test
Remove-Item Env:ENGAGEMENT_REPORT_FILE
pnpm typecheck
pnpm build
pnpm --filter @cs2-analyst/match-model test
pnpm --filter @cs2-analyst/dem-parser test
pnpm --filter @cs2-analyst/analytics test
pnpm --filter @cs2-analyst/findings test
pnpm --filter @cs2-analyst/desktop test
```

测试覆盖 single duel、hurt→death、无关同时 duel、参与者传递链/桥接、窗口阈值两侧与边界、same tick、team/self/world/unknown、utility damage/kill 与非桥接、unknown weapon、post/pre-round、缺/非法时钟、重复行/回合身份安全、四键 exact join、spatial 不可用仍可分组、确定性、输入不修改与独立图 oracle。TypeScript contract test 防止数字 SteamID、MatchEvent 引用和评分进入 contract。真实 Nuke 若本地文件不存在则显式 SKIP。

| 本轮最终验证 | 结果 |
| --- | --- |
| pnpm typecheck | 12/12 tasks成功 |
| pnpm build | 7/7 tasks成功 |
| match-model tests | TypeScript contract tests PASS |
| dem-parser tests | 38 PASS / 1 SKIP / 0 FAIL（含真实Nuke空间验证） |
| analytics tests | 48 PASS / 5 SKIP / 0 FAIL |
| findings tests | 16 PASS / 1 SKIP / 0 FAIL |
| deep-review tests | 20 PASS / 0 SKIP / 0 FAIL（19合成/算法案例 + 1真实Nuke），TypeScript contract tests PASS |
| desktop tests | 16 PASS / 1 SKIP / 0 FAIL |
| 独立review | 发现并修复1项极小tickRate时长溢出，独立复现修复通过；最终无未解决发现 |

全部8个SKIP均因demo1缺失，真实demo1 golden **未执行**，不得把Nuke或历史PASS当作本轮个人golden。初次离线安装因缓存缺metadata失败，保留现有锁定依赖、仅增加新package importer后 `pnpm install --offline --frozen-lockfile` 成功，无依赖升级。数值边界修复后重跑typecheck/build/deep-review tests，Nuke analysisHash与结构报告一致。源码生产import核查只有match-model类型与本包纯helper；UTF-8无BOM、git diff whitespace检查通过。不重跑 installer/report E2E，无相关生产修改。
