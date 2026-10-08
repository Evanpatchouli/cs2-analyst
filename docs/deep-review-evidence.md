# P5.7 Deep Review Evidence

v0.1 Final Acceptance: **PAUSED — Deep Review product gap discovered**。Current: **P5.7 Deep Review**。

- P5.7.0: **PARTIAL PASS — GOTV verified, personal DEM compatibility pending**。
- P5.7.1（当前任务）: Spatial Evidence Foundation 已实现并完成职业 GOTV 验证。正式 contract、采样策略、coverage、共享输入性能与个人兼容债务见 [P5.7.1 Spatial Evidence](./spatial-evidence.md)，测量见 [Nuke摘要](./deep-review-spatial-nuke.json)。未进入 P5.7.2。
- Personal DEM spatial compatibility = **UNVERIFIED**，不是本轮 blocker，但正式 Deep Review FINAL Acceptance 前至少用一份真实个人 DEM 补验。峰内存仍 UNKNOWN。

### P5.7.1 本轮执行结果

| 验证 | 结果 |
| --- | --- |
| pnpm typecheck | 11/11 tasks 成功 |
| pnpm build | 6/6 tasks 成功 |
| match-model tests | TypeScript contract tests PASS（新增独立test入口） |
| dem-parser tests | 38 PASS / 1 SKIP / 0 FAIL；含10个新合成测试与真实Nuke测试 |
| analytics tests | 48 PASS / 5 SKIP / 0 FAIL |
| findings tests | 16 PASS / 1 SKIP / 0 FAIL |
| desktop tests | 16 PASS / 1 SKIP / 0 FAIL |
| 独立review | 无actionable发现；核验public/native边界、旧parse与共享读取 |

所有8项SKIP因demo1.dem不存在，历史golden定义/fixture未修改，但未声称真实golden本轮PASS。Nuke同输入空间证据hash `a6b17927aa4cc534e1b9db48b87816e9b348404cb19c66c319dc44b5a7c874c0` 重复一致；完整包测试额外重跑亦一致（共享路径总3.652/3.593秒，性能波动不参与determinism）。报告E2E与installer/installed regression本轮未运行，无相关产品修改。以下历史表格仍只描述P5.7.0。

## P5.7.0 Evidence Feasibility Spike（以下为历史验证记录）

验证日期：2026-10-08。锁定本机 @laihoe/demoparser2 0.42.0，Windows x64，Node v24.21.0；AMD Ryzen 7 5700G with Radeon Graphics，16 logical CPUs，RAM 31.37 GiB。基线提交 d073aca5128cfdfd151654489c9ce73acdea8402。

**结论：Nuke 的关键事件空间基础可用；双样本验收未完成，不标记 P5.7.0 PASS。** demo1.dem 当前缺失；用户补充的路径仍是职业 Nuke，因此不能替代既有个人 DEM golden。个人/GOTV 差异、demo1 新增查询性能及真实 golden 本轮验证均为 UNKNOWN。以下所有新数字来自职业 DEM 本次运行；历史 demo1 数字仅引用原文档，绝不当作本轮运行证据。

本轮仅新增 dem-parser/dev 开发 probe、专用测试、本文与结构化测量附件。没有生产入口、DTO、match-model、P3 Analytics、Findings、Timeline、UI 或训练建议变更；DEM 不提交。

## 七项验收回答

| 问题 | 本轮证据与判断 |
| --- | --- |
| 关键事件 tick 是否能取得所有玩家空间状态？ | Nuke：3757 个事件/边界 tick，37570/37570 预期玩家行，全部10人；XYZ 有效100%。跨 DEM 稳定性 UNKNOWN。 |
| yaw/pitch/velocity/active weapon 是否足够？ | 事件 tick yaw/pitch 100%；存活行 weapon100%，死亡行 weapon 缺失。velocity 虽高 finite coverage，但依赖采样计划且存在一 tick 语义滞后，不能直接进入 required contract。 |
| GOTV 与个人 DEM 差异？ | UNKNOWN：只有 SourceTV Nuke 实测，缺 demo1。录制模式是 header 事实，文件名或玩家身份不参与算法。 |
| usercmd 是否可靠到进入正式算法？ | 否：GOTV 中有字段，但部分缺失、时间/新鲜度/客户端时钟映射未验证，subtick moves0覆盖；buttons/FIRE不等同weapon_fire。正式算法优先 entity state + game events；usercmd只能optional增强。 |
| sparse 时间/内存是否适合桌面？ | 本机秒级可执行，新增成本明显；见实测表。峰内存未可靠测量、不记录，因此内存 suitability UNKNOWN，不能宣称桌面资源验收PASS。 |
| P5.7.1 最小稳定 contract？ | 建议独立、可缺失的事件关联空间样本 + 每字段coverage/provenance；见后文。只建议，不实施。 |
| 哪些分析仍不能做？ | LOS、可补枪距离、地图可达性、战术责任/意图、精确输入/反应时间、稳定瞬时移动/停枪判定等均无充分证据。 |

## 样本与事件清单

| 项 | 职业 Nuke（本轮实测） | demo1（本轮） |
| --- | --- | --- |
| 文件 | .demo/spirit-vs-faze-m1-nuke.dem | .demo/demo1.dem 缺失 |
| bytes | 471606780（449.76 MiB） | UNKNOWN |
| SHA-256 | dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c | UNKNOWN；历史golden hash见 analytics-metrics.md |
| map | de_nuke | UNKNOWN（历史 de_dust2） |
| header.client_name | SourceTV Demo | UNKNOWN |
| tickRate | 64（沿用现有converter的game_time/tick推导） | UNKNOWN（历史64） |
| 正式回合 | 21 | UNKNOWN（历史24） |
| 玩家 | 10 | UNKNOWN（历史10） |

tickRate 是 parser 现有输出，不是本轮独立 server tick interval 验证。未知时不猜64。原始 round_start/round_freeze_end 各22次，转换后21回合；保留现有 converter 的热身/重开口径，不为比赛身份加入例外。domain事件数：bomb=138，weapon_fire=3260，damage=631，utility=404，flash=158，kill=145；包含现有 parser 保留的 post-round 事件。事件抽查选择另限正式start/end窗口。

| 原生 parseEvents event_name | Nuke 行数（含原始请求流） | demo1 |
| --- | --- | --- |
| round_start | 22 | UNKNOWN |
| round_end | 21 | UNKNOWN |
| round_freeze_end | 22 | UNKNOWN |
| player_death | 145 | UNKNOWN |
| player_hurt | 631 | UNKNOWN |
| weapon_fire | 3270 | UNKNOWN |
| smokegrenade_detonate | 136 | UNKNOWN |
| hegrenade_detonate | 74 | UNKNOWN |
| flashbang_detonate | 88 | UNKNOWN |
| inferno_startburn | 105 | UNKNOWN |
| decoy_started | 1 | UNKNOWN |
| player_blind | 158 | UNKNOWN |
| bomb_pickup | 62 | UNKNOWN |
| bomb_dropped | 51 | UNKNOWN |
| bomb_beginplant | 9 | UNKNOWN |
| bomb_planted | 8 | UNKNOWN |
| bomb_begindefuse | 3 | UNKNOWN |
| bomb_defused | 1 | UNKNOWN |
| bomb_exploded | 5 | UNKNOWN |
| player_spawn | 210 | UNKNOWN |
| player_disconnect | 2 | UNKNOWN |
| player_team | 10 | UNKNOWN |

原生与domain不同是现有过滤和映射，不意味着整份DEM无漏事件。相同tick事件数可大于唯一tick数。只请求当前parser已有事件类，没有全场所有事件枚举或全tick dump。

## Sparse sampling

基于既有 Match 回合 start/freeze_end/end 与 kill、damage、weapon_fire、utility、flash、bomb 全部事件 tick 构造集合，去重排序。3,757 个唯一base ticks。类别唯一tick数：boundary=63，kill=144，damage=593，weapon_fire=3125，utility=404，flash=73，bomb=138（跨类有重叠），每类缺失预期玩家行均0。

- sparse：combat kill/hurt/fire 加 ±0.125s，按可靠tickRate取整；本样本±8ticks。增加5730个去重邻点，合计9487ticks。
- history：在sparse基础上，为每个wanted tick额外请求 t-2、t-1，增加11931个tick，合计21418ticks。整数邻接用来验证原生velocity前驱依赖，不假设未知tickRate对应时间。
- 上限 min(24000, floor(事件跨度ticks × 20%))；本样本跨度176850，上限24000，未触cap。溢出时确定性均匀选点并输出遗漏warning；**不得把截断报告视为完整coverage**，也不保证溢出后每个death/boundary仍保留。正式模型应显式partial并优先关键事件预算。
- 邻点只在0..最后事件tick内生成，不跨范围猜尾部状态。未知tickRate禁用时间offset；没有事件时不调用parseTicks（空wantedTicks可能意味着上游全量采样）。
- sparse实际返回9458个tick/94580行，29个请求邻点缺失；history返回21326个tick/213260行，92个请求邻点缺失。全部缺失发生在额外邻点/历史点；不能用最近tick冒充精确tick。
- 从第一个到最后一个base tick跨度占比：sparse5.36%、history12.11%。只临时持有有限返回行，写出coverage和少量抽查；不保存整场轨迹。

建议默认采用事件时刻+有限±0.125s的空间证据，保留budget与实际sampleTick。连续前驱只用于选定combat窗口的可选速度核验，不能因原生velocity数值非空就升级为可信状态。两个offset策略只是此次实验，不是Engagement设计或训练窗口。

## 字段coverage

以下主表使用history计划。row count是实际返回行；non-null包含存在值；valid对数值要求finite，health/shots要求非负整数，alive/scoped等要求boolean，yaw/pitch做范围检查，weapon要求非空字符串，team允许0..3但不证明参与。valid是结构/数值检验，**不证明语义准确性或新鲜度**。usercmd数组仅验证Array容器，不声称subtick内容及映射有效。buttons保留十进制字符串，不转浮点数。

逐玩家列分母为21418个请求tick，故含缺失行惩罚；actual-row有效率与请求coverage不可混用。完整逐SteamID row/non-null/valid/expected计数保存在 [结构化报告](./deep-review-evidence-nuke.json) 的 fields/baseFields/optionalCoverage.perPlayer。SteamID始终string。

| 必测字段 | row count | non-null | finite/valid | valid / returned rows | 逐玩家 valid / requested range | demo1 |
| --- | --- | --- | --- | --- | --- | --- |
| X | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| Y | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| Z | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| yaw | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| pitch | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| velocity_X | 213260 | 212320 | 212320 | 99.56% | 99.13%–99.13% | UNKNOWN |
| velocity_Y | 213260 | 212320 | 212320 | 99.56% | 99.13%–99.13% | UNKNOWN |
| velocity_Z | 213260 | 212320 | 212320 | 99.56% | 99.13%–99.13% | UNKNOWN |
| active_weapon_name | 213260 | 173097 | 173097 | 81.17% | 71.99%–86.96% | UNKNOWN |
| health | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| is_alive | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| team_num | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |

只看3757个事件/边界tick（不是辅助history行）：

| 字段 | valid / returned event rows | 有效率 |
| --- | --- | --- |
| X | 37570/37570 | 100.00% |
| Y | 37570/37570 | 100.00% |
| Z | 37570/37570 | 100.00% |
| yaw | 37570/37570 | 100.00% |
| pitch | 37570/37570 | 100.00% |
| velocity_X | 37520/37570 | 99.87% |
| velocity_Y | 37520/37570 | 99.87% |
| velocity_Z | 37520/37570 | 99.87% |
| active_weapon_name | 30223/37570 | 80.44% |
| health | 37570/37570 | 100.00% |
| is_alive | 37570/37570 | 100.00% |
| team_num | 37570/37570 | 100.00% |

history存活行173097条，weapon173097/173097；对应全部死亡行40163条均无weapon。事件tick总weapon覆盖80.44%主要是死亡状态，不是存活玩家无法查询。weapon_name是上游展示名称，可能为皮肤刀名；不可直接当稳定武器枚举或击杀武器，后者优先game event.weapon。死者视角/位置虽存在，不等于死亡前精准瞄准状态。

| 可选字段 | row count | non-null | finite/valid（结构） | valid / returned rows | 逐玩家 valid / requested range | demo1 |
| --- | --- | --- | --- | --- | --- | --- |
| shots_fired | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| is_scoped | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| is_walking | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| is_airborne | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| aim_punch_angle | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| flash_duration | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| buttons | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| FIRE | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| usercmd_viewangle_x | 213260 | 203868 | 203868 | 95.60% | 91.79%–98.41% | UNKNOWN |
| usercmd_viewangle_y | 213260 | 203868 | 203868 | 95.60% | 91.79%–98.41% | UNKNOWN |
| usercmd_viewangle_z | 213260 | 203868 | 203868 | 95.60% | 91.79%–98.41% | UNKNOWN |
| usercmd_buttonstate_1 | 213260 | 203868 | 203868 | 95.60% | 91.79%–98.41% | UNKNOWN |
| usercmd_buttonstate_2 | 213260 | 203868 | 203868 | 95.60% | 91.79%–98.41% | UNKNOWN |
| usercmd_buttonstate_3 | 213260 | 203868 | 203868 | 95.60% | 91.79%–98.41% | UNKNOWN |
| usercmd_consumed_server_angle_changes | 213260 | 203868 | 203868 | 95.60% | 91.79%–98.41% | UNKNOWN |
| usercmd_forward_move | 213260 | 203868 | 203868 | 95.60% | 91.79%–98.41% | UNKNOWN |
| usercmd_left_move | 213260 | 203868 | 203868 | 95.60% | 91.79%–98.41% | UNKNOWN |
| usercmd_impulse | 213260 | 203868 | 203868 | 95.60% | 91.79%–98.41% | UNKNOWN |
| usercmd_mouse_dx | 213260 | 203868 | 203868 | 95.60% | 91.79%–98.41% | UNKNOWN |
| usercmd_mouse_dy | 213260 | 203868 | 203868 | 95.60% | 91.79%–98.41% | UNKNOWN |
| usercmd_left_hand_desired | 213260 | 203868 | 203868 | 95.60% | 91.79%–98.41% | UNKNOWN |
| usercmd_weapon_select | 213260 | 203868 | 203868 | 95.60% | 91.79%–98.41% | UNKNOWN |
| usercmd_input_history | 213260 | 213260 | 213260 | 100.00% | 99.57%–99.57% | UNKNOWN |
| usercmd_subtick_moves | 213260 | 0 | 0 | 0.00% | 0.00%–0.00% | UNKNOWN |

shots/scoped/walking/airborne/aim punch/flash duration在此样本有变化、结构覆盖高；尚不能推断玩家意图、准确停止时刻、实际连续致盲或recoil控制质量。其跨录制类型语义与coverage仍UNKNOWN，因此保持optional。

## Velocity可行性边界

孤立tick10000请求velocity没有值；连续10000/10001/10002只有第三个tick出现finite值。这说明至少存在采样前驱依赖。history增加前两tick使base finite从37060/37570提高到37520/37570，但仍缺50行。

同tick跨计划可比较 93640 行，其中 61672 行的任一分量差>0.001（65.86%）；最大分量差 219209.265625。**原生velocity在稀疏计划上不能直接当瞬时速度。** 辅助history行自身也未保证前驱连续，不能把它们的finite零值当停止证据。

两种坐标差假设实测（仅base行，误差阈值0.01）：

- velocity(t) vs [position(t)-position(t-1)] × tickRate：37180可比行，25558不一致，最大误差331733.453125。
- velocity(t) vs [position(t-1)-position(t-2)] × tickRate：37020可比行，0不一致，最大误差0.00000762939453125。这只是前驱差分一致性，不是server原生速度ground truth。

例如独立7tick查询，SteamID `76561198995880877` 在24004/24005/24006的X分别692.2075805664062/692.2418823242188/692.3089599609375；velocity_X(24006)=2.1953125，匹配24004→24005差分，而非24005→24006。因此需要明确速度所代表的区间/来源，不能和同tick坐标不加说明地混用。

[上游当前collect_data.rs](https://github.com/LaihoE/demoparser/blob/main/src/parser/src/second_pass/collect_data.rs) 解释velocity使用前两条位置记录，并包含维护history的实现。该链接是可变main，不能代表本机0.42.0已含所有修复；本轮判定依赖锁定版本真实实验，不升级依赖、不修改parser。

## usercmd/buttons风险

buttons/FIRE每条返回行均有有效结构，FIRE true共有25182行。交叉检查3260条domain weapon_fire（包括刀/投掷释放）：2162条event tick为true、1098条为false、unknown=0。不能据此反推缺失shot或input；按钮采样与事件证据不是同一口径。

usercmd标量203868/213260=95.60%返回行非空；逐玩家requested覆盖91.79%–98.41%。input_history数组213260条，但非空只有203747条；空数组不是“没有操作”的证明。usercmd_subtick_moves完全缺失（0/213260），标记optional evidence unavailable，不使核心probe失败。

当前字段名取自[上游字段清单](https://github.com/LaihoE/demoparser/blob/main/README.md)，以安装包真实返回验证；初次试探的usercmd_buttons/forwardmove等拼写不作为正式coverage证据。上游把buttons/FIRE映射为entity button mask；不能把它等同完整usercmd记录。

**设计决策：P5.7正式算法优先 entity state + game events；usercmd只能作为optional增强，不能用于required evidence、精确输入顺序/反应时间/射击触发条件。** 用户指令/客户端render tick与demo tick映射、值持久化/新鲜度、个人DEM覆盖均UNKNOWN。

## Performance与内存

本轮基线为完整现有 public provider.parse（读Buffer、hash、header、player info、events、边界ticks、converter）；不改parser。warm-cache连续3次 1.607 / 1.578 / 1.548 s，中位数1.578s。单独同参数parseEvents=0.423s；这是probe额外实验，不再加进生产基线两次。

主query只含12个必测字段，parseTicks使用同一bytes Buffer。下表新增占比=query median/(baseline median+query median)，总数是**两个独立中位数相加的估计**。native调用耗时不含报告统计、断言、GC或optional探索；非冷启动、无并行测试负载、非硬件SLA。

| 计划 | requested ticks | returned rows | tick跨度占比 | query三次秒 | query median秒 | baseline+query估计秒 | 新增查询占比（估计） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sparse | 9487 | 94580 | 5.36% | 1.547 / 1.527 / 1.527 | 1.527 | 3.105 | 49.18% |
| history | 21418 | 213260 | 12.11% | 3.076 / 3.367 / 3.440 | 3.367 | 4.945 | 68.09% |

以下另做一次完整顺序实测 provider.parse + 额外读取文件 + sparse query，**并未接入生产adapter**；因现有公共provider不暴露原始bytes，额外读取不可忽略。不能把此数称为优化后或共享Buffer生产路径。

| 计划 | parser秒 | 额外读秒 | query秒 | 实测顺序总秒 | query占实测总时间 |
| --- | --- | --- | --- | --- | --- |
| sparse | 1.957 | 0.518 | 1.866 | 4.341 | 42.98% |
| history | 1.939 | 0.486 | 3.556 | 5.981 | 59.46% |

optional实体字段组另耗2.759s，usercmd组另耗8.192s；未包含在主计划成本内。usercmd探索明显更慢，无必要时不应默认启用。Nuke秒级运行可供桌面后台任务实验，但仅此硬件/单样本，不能断言所有DEM交互延迟适合。

**峰内存不记录（UNKNOWN）。** 同步native调用阻塞进程内轮询，GC与native临时分配令前后RSS不等于峰值；本轮未进行独立外部high-water测量，也未把Node heap冒充进程峰值。大DEM仍全量读Buffer（本样本约449.76MiB），稀疏输出减少返回行不代表native扫描/输入内存按同率减少。桌面端内存门槛、低内存设备、并发多文件、极长/overtime/demo fragments均UNKNOWN。只记录瓶颈，不做优化。

## Combat事实抽查（自动选择）

从正式start/end窗口自动按tick顺序选择：3条普通单杀（该killer该回合仅1次确认敌杀、非grenade/fire、tick无并列），前2个存在同player≥2kill的回合，1条HE/fire damage，1组5秒内敌方互杀且复仇方与首个victim同side的trade-like序列。没有选手名、结果或比分硬编码；trade-like不是正式Trade归属或责任判断。

下列结构打印event与双方精确tick状态、前一tick状态、XYZ/yaw/pitch/native velocity/weapon/health/alive/team、最近**存活队友欧氏距离**（map units）、前后存活计数。null保留：死者event tick无weapon，不能用event.weapon伪装其active weapon；native velocity按前述区间风险理解。

aliveCounts来源明确区分freeze_end+death按tick整体推进与entity采样，不声称同ticksubtick先后。此抽查采用的R1/R2/R3在baseline后、抽查前无spawn/team/disconnect（报告脚本只做death推进；未来如存在生命周期异常必须unknown）；总体不能无条件复用death-only reconstruction。最近队友距离不表示LOS、可达、支援或可补枪距离。

```json
[{
  "category": "singleKills",
  "selectionIndex": 0,
  "round": 1,
  "eventTick": 4356,
  "event": {"type":"kill","tick":4356,"killer":"76561198386265483","victim":"76561197997351207","killerSide":"CT","victimSide":"T","weapon":"usp_silencer","headshot":true,"assistedFlash":false,"teamkill":false},
  "player": {"steamId":"76561198386265483","sampleTick":4356,"present":true,"position":[1823.2337646484375,-1606.91064453125,-415.46875],"yawPitch":[-144.11074829101562,0],"nativeVelocity":[77.359375,-50.8046875,0],"activeWeapon":"USP-S","health":15,"alive":true,"team":3},
  "opponent": {"steamId":"76561197997351207","sampleTick":4356,"present":true,"position":[800.98681640625,-2349.20654296875,-415.96875],"yawPitch":[64.66072082519531,-0.039825439453125],"nativeVelocity":[-220.19921875,2.109375,0],"activeWeapon":null,"health":0,"alive":false,"team":2},
  "beforeOneTick": [{"player":{"steamId":"76561198386265483","sampleTick":4355,"present":true,"position":[1822.3121337890625,-1606.4425048828125,-415.46875],"yawPitch":[-144.11074829101562,0],"nativeVelocity":[884.6484375,-761.2421875,0],"activeWeapon":"USP-S","health":15,"alive":true,"team":3},"opponent":{"steamId":"76561197997351207","sampleTick":4355,"present":true,"position":[800.98681640625,-2349.20654296875,-415.96875],"yawPitch":[64.77951049804688,-0.039825439453125],"nativeVelocity":[-1283.73046875,123.109375,0],"activeWeapon":"P250","health":100,"alive":true,"team":2}}],
  "nearestAliveTeammateEuclidean": {"atTick":4356,"player":{"steamId":"76561198045898864","distanceMapUnits":1326.7147523616725},"opponent":null,"beforeTick":4355,"playerBefore":{"steamId":"76561198045898864","distanceMapUnits":1327.3641260460479},"opponentBefore":{"steamId":"76561198068422762","distanceMapUnits":680.0274017219928}},
  "aliveCounts": {"source":"freeze_end baseline + all deaths strictly before / at tick; same-tick deaths applied as a group","before":{"CT":5,"T":5},"after":{"CT":5,"T":4},"entityAtEventTick":{"2":4,"3":5},"entityBeforeTick":{"2":5,"3":5},"entityAfterOffset":{"2":4,"3":5}}
},
{
  "category": "singleKills",
  "selectionIndex": 1,
  "round": 1,
  "eventTick": 5145,
  "event": {"type":"kill","tick":5145,"killer":"76561197991272318","victim":"76561198045898864","killerSide":"T","victimSide":"CT","weapon":"glock","headshot":false,"assister":"76561198068422762","assisterSide":"T","assistedFlash":false,"teamkill":false},
  "player": {"steamId":"76561197991272318","sampleTick":5145,"present":true,"position":[391.1380920410156,-814.0232543945312,-344.921875],"yawPitch":[-113.85955810546875,-35.279510498046875],"nativeVelocity":[-2.900390625,-83.33203125,-103],"activeWeapon":"Glock-18","health":100,"alive":true,"team":2},
  "opponent": {"steamId":"76561198045898864","sampleTick":5145,"present":true,"position":[359.02801513671875,-922.0549926757812,-255.96875],"yawPitch":[60.11273193359375,46.00318908691406],"nativeVelocity":[82.21484375,-77.26953125,0],"activeWeapon":null,"health":0,"alive":false,"team":3},
  "beforeOneTick": [{"player":{"steamId":"76561197991272318","sampleTick":5144,"present":true,"position":[391.1832580566406,-812.7212524414062,-343.109375],"yawPitch":[-113.08055877685547,-35.0848388671875],"nativeVelocity":[-15.306640625,-78.03515625,-90],"activeWeapon":"Glock-18","health":100,"alive":true,"team":2},"opponent":{"steamId":"76561198045898864","sampleTick":5144,"present":true,"position":[359.02801513671875,-922.0549926757812,-255.96875],"yawPitch":[55.369384765625,46.21879577636719],"nativeVelocity":[82.119140625,-66.59765625,-256],"activeWeapon":"USP-S","health":8,"alive":true,"team":3}}],
  "nearestAliveTeammateEuclidean": {"atTick":5145,"player":{"steamId":"76561198201620490","distanceMapUnits":90.90524268708928},"opponent":null,"beforeTick":5144,"playerBefore":{"steamId":"76561198201620490","distanceMapUnits":94.12627391459016},"opponentBefore":{"steamId":"76561199063238565","distanceMapUnits":542.2702055624173}},
  "aliveCounts": {"source":"freeze_end baseline + all deaths strictly before / at tick; same-tick deaths applied as a group","before":{"CT":5,"T":4},"after":{"CT":4,"T":4},"entityAtEventTick":{"2":4,"3":4},"entityBeforeTick":{"2":4,"3":5},"entityAfterOffset":{"2":4,"3":4}}
},
{
  "category": "singleKills",
  "selectionIndex": 2,
  "round": 1,
  "eventTick": 5247,
  "event": {"type":"kill","tick":5247,"killer":"76561198068422762","victim":"76561199063238565","killerSide":"T","victimSide":"CT","weapon":"glock","headshot":true,"assistedFlash":false,"teamkill":false},
  "player": {"steamId":"76561198068422762","sampleTick":5247,"present":true,"position":[689.1245727539062,-1576.60009765625,-415.96875],"yawPitch":[133.45883178710938,0.1318359375],"nativeVelocity":[85.34375,39.25,0],"activeWeapon":"Glock-18","health":100,"alive":true,"team":2},
  "opponent": {"steamId":"76561199063238565","sampleTick":5247,"present":true,"position":[380.0520324707031,-1246.7113037109375,-415.96875],"yawPitch":[-49.25445556640625,-0.4181671142578125],"nativeVelocity":[13.5859375,17.9609375,0],"activeWeapon":null,"health":0,"alive":false,"team":3},
  "beforeOneTick": [{"player":{"steamId":"76561198068422762","sampleTick":5246,"present":true,"position":[688.133544921875,-1576.941650390625,-415.96875],"yawPitch":[133.50277709960938,0.087890625],"nativeVelocity":[947.06640625,560.0859375,0],"activeWeapon":"Glock-18","health":100,"alive":true,"team":2},"opponent":{"steamId":"76561199063238565","sampleTick":5246,"present":true,"position":[380.0520324707031,-1246.7113037109375,-415.96875],"yawPitch":[-50.299530029296875,-0.2928466796875],"nativeVelocity":[536.1328125,497.1953125,0],"activeWeapon":"USP-S","health":100,"alive":true,"team":3}}],
  "nearestAliveTeammateEuclidean": {"atTick":5247,"player":{"steamId":"76561197989430253","distanceMapUnits":722.3432551106604},"opponent":null,"beforeTick":5246,"playerBefore":{"steamId":"76561197989430253","distanceMapUnits":722.6320679695622},"opponentBefore":{"steamId":"76561198081484775","distanceMapUnits":1144.3007444751802}},
  "aliveCounts": {"source":"freeze_end baseline + all deaths strictly before / at tick; same-tick deaths applied as a group","before":{"CT":4,"T":4},"after":{"CT":3,"T":4},"entityAtEventTick":{"2":4,"3":3},"entityBeforeTick":{"2":4,"3":4},"entityAfterOffset":{"2":4,"3":3}}
},
{
  "category": "multiKillRounds",
  "selectionIndex": 0,
  "round": 1,
  "eventTick": 5350,
  "event": {"type":"kill","tick":5350,"killer":"76561198201620490","victim":"76561198081484775","killerSide":"T","victimSide":"CT","weapon":"glock","headshot":true,"assister":"76561198068422762","assisterSide":"T","assistedFlash":false,"teamkill":false},
  "player": {"steamId":"76561198201620490","sampleTick":5350,"present":true,"position":[863.4052124023438,-741.905517578125,-399.968505859375],"yawPitch":[85.45956420898438,-30.8880615234375],"nativeVelocity":[-106.875,-60.42578125,0.00390625],"activeWeapon":"Glock-18","health":100,"alive":true,"team":2},
  "opponent": {"steamId":"76561198081484775","sampleTick":5350,"present":true,"position":[893.9070434570312,-298.05865478515625,-127.96875],"yawPitch":[-102.4310302734375,13.270797729492188],"nativeVelocity":[-36.0625,8.11328125,0],"activeWeapon":null,"health":0,"alive":false,"team":3},
  "beforeOneTick": [{"player":{"steamId":"76561198201620490","sampleTick":5349,"present":true,"position":[864.9436645507812,-740.892333984375,-399.968505859375],"yawPitch":[85.37167358398438,-30.799835205078125],"nativeVelocity":[-106.1875,-53,0.00390625],"activeWeapon":"Glock-18","health":100,"alive":true,"team":2},"opponent":{"steamId":"76561198081484775","sampleTick":5349,"present":true,"position":[893.9070434570312,-298.05865478515625,-127.96875],"yawPitch":[-102.52269744873047,13.3851318359375],"nativeVelocity":[-37.3515625,8.4140625,0],"activeWeapon":"USP-S","health":51,"alive":true,"team":3}}],
  "nearestAliveTeammateEuclidean": {"atTick":5350,"player":{"steamId":"76561197991272318","distanceMapUnits":88.50893316370515},"opponent":null,"beforeTick":5349,"playerBefore":{"steamId":"76561197991272318","distanceMapUnits":90.0864328727942},"opponentBefore":{"steamId":"76561198995880877","distanceMapUnits":239.09335945498177}},
  "aliveCounts": {"source":"freeze_end baseline + all deaths strictly before / at tick; same-tick deaths applied as a group","before":{"CT":3,"T":4},"after":{"CT":2,"T":4},"entityAtEventTick":{"2":4,"3":2},"entityBeforeTick":{"2":4,"3":3},"entityAfterOffset":{"2":4,"3":2}}
},
{
  "category": "multiKillRounds",
  "selectionIndex": 0,
  "round": 1,
  "eventTick": 6597,
  "event": {"type":"kill","tick":6597,"killer":"76561198201620490","victim":"76561198995880877","killerSide":"T","victimSide":"CT","weapon":"glock","headshot":true,"assistedFlash":false,"teamkill":false},
  "player": {"steamId":"76561198201620490","sampleTick":6597,"present":true,"position":[828.9163208007812,-397.3026123046875,-415.96875],"yawPitch":[-20.440399169921875,-63.18305969238281],"nativeVelocity":[-51.87109375,-161.078125,0],"activeWeapon":"Glock-18","health":100,"alive":true,"team":2},
  "opponent": {"steamId":"76561198995880877","sampleTick":6597,"present":true,"position":[966.9131469726562,-446.592041015625,-127.96875],"yawPitch":[150.55596923828125,63.710052490234375],"nativeVelocity":[43.37109375,66.15625,0],"activeWeapon":null,"health":0,"alive":false,"team":3},
  "beforeOneTick": [{"player":{"steamId":"76561198201620490","sampleTick":6596,"present":true,"position":[829.7733154296875,-394.68829345703125,-415.96875],"yawPitch":[-20.044219970703125,-62.347068786621094],"nativeVelocity":[-48.75390625,-154.2265625,0],"activeWeapon":"Glock-18","health":100,"alive":true,"team":2},"opponent":{"steamId":"76561198995880877","sampleTick":6596,"present":true,"position":[966.9131469726562,-446.592041015625,-127.96875],"yawPitch":[150.55596923828125,63.710052490234375],"nativeVelocity":[36.9296875,53.53515625,0],"activeWeapon":"Dual Berettas","health":100,"alive":true,"team":3}}],
  "nearestAliveTeammateEuclidean": {"atTick":6597,"player":{"steamId":"76561197991272318","distanceMapUnits":383.7330214747972},"opponent":null,"beforeTick":6596,"playerBefore":{"steamId":"76561197991272318","distanceMapUnits":386.4981171639527},"opponentBefore":{"steamId":"76561198386265483","distanceMapUnits":183.14429007588882}},
  "aliveCounts": {"source":"freeze_end baseline + all deaths strictly before / at tick; same-tick deaths applied as a group","before":{"CT":2,"T":4},"after":{"CT":1,"T":4},"entityAtEventTick":{"2":4,"3":1},"entityBeforeTick":{"2":4,"3":2},"entityAfterOffset":{"2":4,"3":1}}
},
{
  "category": "multiKillRounds",
  "selectionIndex": 1,
  "round": 2,
  "eventTick": 18395,
  "event": {"type":"kill","tick":18395,"killer":"76561198386265483","victim":"76561197989430253","killerSide":"CT","victimSide":"T","weapon":"deagle","headshot":true,"assistedFlash":false,"teamkill":false},
  "player": {"steamId":"76561198386265483","sampleTick":18395,"present":true,"position":[1214.5504150390625,-4.77874755859375,-415.96875],"yawPitch":[177.11163330078125,-0.137664794921875],"nativeVelocity":[2.6953125,39.5078125,0],"activeWeapon":"Desert Eagle","health":100,"alive":true,"team":3},
  "opponent": {"steamId":"76561197989430253","sampleTick":18395,"present":true,"position":[623.3444213867188,22.427186965942383,-415.96875],"yawPitch":[92.45062255859375,4.8181915283203125],"nativeVelocity":[228.796875,-35.2696533203125,0],"activeWeapon":null,"health":0,"alive":false,"team":2},
  "beforeOneTick": [{"player":{"steamId":"76561198386265483","sampleTick":18394,"present":true,"position":[1214.5352783203125,-4.9068603515625,-415.96875],"yawPitch":[177.02886962890625,-0.137664794921875],"nativeVelocity":[6.2421875,109.41796875,0],"activeWeapon":"Desert Eagle","health":100,"alive":true,"team":3},"opponent":{"steamId":"76561197989430253","sampleTick":18394,"present":true,"position":[623.3444213867188,22.427186965942383,-415.96875],"yawPitch":[91.8896484375,4.653045654296875],"nativeVelocity":[1431.4453125,-29.97021484375,0],"activeWeapon":"MAC-10","health":100,"alive":true,"team":2}}],
  "nearestAliveTeammateEuclidean": {"atTick":18395,"player":{"steamId":"76561198995880877","distanceMapUnits":733.9066309650711},"opponent":null,"beforeTick":18394,"playerBefore":{"steamId":"76561198995880877","distanceMapUnits":730.6627542002764},"opponentBefore":{"steamId":"76561197991272318","distanceMapUnits":407.11862406609436}},
  "aliveCounts": {"source":"freeze_end baseline + all deaths strictly before / at tick; same-tick deaths applied as a group","before":{"CT":5,"T":5},"after":{"CT":5,"T":4},"entityAtEventTick":{"2":4,"3":5},"entityBeforeTick":{"2":5,"3":5},"entityAfterOffset":{"2":4,"3":5}}
},
{
  "category": "multiKillRounds",
  "selectionIndex": 1,
  "round": 2,
  "eventTick": 18627,
  "event": {"type":"kill","tick":18627,"killer":"76561198386265483","victim":"76561198068422762","killerSide":"CT","victimSide":"T","weapon":"deagle","headshot":true,"assistedFlash":false,"teamkill":false},
  "player": {"steamId":"76561198386265483","sampleTick":18627,"present":true,"position":[1201.088623046875,22.56964683532715,-415.96875],"yawPitch":[177.85321044921875,0],"nativeVelocity":[-1.234375,-31.6781005859375,0],"activeWeapon":"Desert Eagle","health":100,"alive":true,"team":3},
  "opponent": {"steamId":"76561198068422762","sampleTick":18627,"present":true,"position":[160.85572814941406,59.65073013305664,-415.96875],"yawPitch":[-2.3119354248046875,0.3961944580078125],"nativeVelocity":[-0.8564453125,-18.109375,0],"activeWeapon":null,"health":0,"alive":false,"team":2},
  "beforeOneTick": [{"player":{"steamId":"76561198386265483","sampleTick":18626,"present":true,"position":[1201.115478515625,23.271657943725586,-415.96875],"yawPitch":[177.79791259765625,0],"nativeVelocity":[12.3828125,6.9619140625,0],"activeWeapon":"Desert Eagle","health":100,"alive":true,"team":3},"opponent":{"steamId":"76561198068422762","sampleTick":18626,"present":true,"position":[160.85572814941406,59.65073013305664,-415.96875],"yawPitch":[-2.707794189453125,0.5719757080078125],"nativeVelocity":[5.8095703125,105.146240234375,0],"activeWeapon":"Galil AR","health":85,"alive":true,"team":2}}],
  "nearestAliveTeammateEuclidean": {"atTick":18627,"player":{"steamId":"76561199063238565","distanceMapUnits":634.5963317443517},"opponent":null,"beforeTick":18626,"playerBefore":{"steamId":"76561199063238565","distanceMapUnits":636.3334320470352},"opponentBefore":{"steamId":"76561198201620490","distanceMapUnits":108.70863712066334}},
  "aliveCounts": {"source":"freeze_end baseline + all deaths strictly before / at tick; same-tick deaths applied as a group","before":{"CT":5,"T":4},"after":{"CT":5,"T":3},"entityAtEventTick":{"2":3,"3":5},"entityBeforeTick":{"2":4,"3":5},"entityAfterOffset":{"2":3,"3":5}}
},
{
  "category": "multiKillRounds",
  "selectionIndex": 1,
  "round": 2,
  "eventTick": 19955,
  "event": {"type":"kill","tick":19955,"killer":"76561198386265483","victim":"76561197997351207","killerSide":"CT","victimSide":"T","weapon":"deagle","headshot":false,"assistedFlash":false,"teamkill":false},
  "player": {"steamId":"76561198386265483","sampleTick":19955,"present":true,"position":[1890.1900634765625,-1746.61865234375,-415.96875],"yawPitch":[-167.01519775390625,0.412322998046875],"nativeVelocity":[15.21875,-39.53125,0],"activeWeapon":"Desert Eagle","health":21,"alive":true,"team":3},
  "opponent": {"steamId":"76561197997351207","sampleTick":19955,"present":true,"position":[398.77239990234375,-2093.15087890625,-415.96875],"yawPitch":[13.0242919921875,-0.079315185546875],"nativeVelocity":[1.654296875,-11.4375,0],"activeWeapon":null,"health":0,"alive":false,"team":2},
  "beforeOneTick": [{"player":{"steamId":"76561198386265483","sampleTick":19954,"present":true,"position":[1890.0579833984375,-1746.39697265625,-415.96875],"yawPitch":[-166.98773193359375,0.384857177734375],"nativeVelocity":[21.7421875,-64.9609375,0],"activeWeapon":"Desert Eagle","health":21,"alive":true,"team":3},"opponent":{"steamId":"76561197997351207","sampleTick":19954,"present":true,"position":[398.77239990234375,-2093.15087890625,-415.96875],"yawPitch":[13.0242919921875,-0.079315185546875],"nativeVelocity":[-4.8203125,12.625,0],"activeWeapon":"Galil AR","health":24,"alive":true,"team":2}}],
  "nearestAliveTeammateEuclidean": {"atTick":19955,"player":{"steamId":"76561198045898864","distanceMapUnits":790.0602116586718},"opponent":null,"beforeTick":19954,"playerBefore":{"steamId":"76561198045898864","distanceMapUnits":790.3214668505099},"opponentBefore":null},
  "aliveCounts": {"source":"freeze_end baseline + all deaths strictly before / at tick; same-tick deaths applied as a group","before":{"CT":5,"T":1},"after":{"CT":5,"T":0},"entityAtEventTick":{"2":0,"3":5},"entityBeforeTick":{"2":1,"3":5},"entityAfterOffset":{"2":0,"3":5}}
},
{
  "category": "utility",
  "selectionIndex": 0,
  "round": 2,
  "eventTick": 17355,
  "event": {"type":"damage","tick":17355,"attacker":"76561197997351207","victim":"76561198045898864","attackerSide":"T","victimSide":"CT","healthDamage":1,"armorDamage":0,"healthRemaining":99,"armorRemaining":0,"weapon":"inferno","hitgroup":"generic"},
  "player": {"steamId":"76561197997351207","sampleTick":17355,"present":true,"position":[152.85357666015625,-2050.90625,-415.96875],"yawPitch":[8.826141357421875,0.15826416015625],"nativeVelocity":[0,0,0],"activeWeapon":"Galil AR","health":100,"alive":true,"team":2},
  "opponent": {"steamId":"76561198045898864","sampleTick":17355,"present":true,"position":[1546.573486328125,-2378.92919921875,-559.96875],"yawPitch":[-167.90988159179688,-26.469146728515625],"nativeVelocity":[9.7109375,-158.15625,0],"activeWeapon":"USP-S","health":99,"alive":true,"team":3},
  "beforeOneTick": [{"player":{"steamId":"76561197997351207","sampleTick":17354,"present":true,"position":[152.85357666015625,-2050.90625,-415.96875],"yawPitch":[8.78631591796875,0.15826416015625],"nativeVelocity":[0,0,0],"activeWeapon":"Galil AR","health":100,"alive":true,"team":2},"opponent":{"steamId":"76561198045898864","sampleTick":17354,"present":true,"position":[1546.36669921875,-2376.343994140625,-559.96875],"yawPitch":[-166.3391876220703,-27.670440673828125],"nativeVelocity":[-62.7890625,-772.265625,0],"activeWeapon":"USP-S","health":100,"alive":true,"team":3}}],
  "nearestAliveTeammateEuclidean": {"atTick":17355,"player":{"steamId":"76561198201620490","distanceMapUnits":1138.5852342870394},"opponent":{"steamId":"76561199063238565","distanceMapUnits":604.0152038464005},"beforeTick":17354,"playerBefore":{"steamId":"76561198201620490","distanceMapUnits":1138.139617180928},"opponentBefore":{"steamId":"76561199063238565","distanceMapUnits":603.1998403245708}},
  "aliveCounts": {"source":"freeze_end baseline + all deaths strictly before / at tick; same-tick deaths applied as a group","before":{"CT":5,"T":5},"after":{"CT":5,"T":5},"entityAtEventTick":{"2":5,"3":5},"entityBeforeTick":{"2":5,"3":5},"entityAfterOffset":{"2":5,"3":5}}
},
{
  "category": "tradeLike",
  "selectionIndex": 0,
  "round": 3,
  "eventTick": 24006,
  "event": {"type":"kill","tick":24006,"killer":"76561198995880877","victim":"76561198068422762","killerSide":"CT","victimSide":"T","weapon":"galilar","headshot":false,"assistedFlash":false,"teamkill":false},
  "player": {"steamId":"76561198995880877","sampleTick":24006,"present":true,"position":[692.3089599609375,-177.97198486328125,-415.96875],"yawPitch":[146.35333251953125,4.7124481201171875],"nativeVelocity":[2.1953125,3.26953125,0],"activeWeapon":"Galil AR","health":100,"alive":true,"team":3},
  "opponent": {"steamId":"76561198068422762","sampleTick":24006,"present":true,"position":[358.2783508300781,39.505149841308594,-415.96875],"yawPitch":[-15.471832275390625,2.20001220703125],"nativeVelocity":[35.408203125,-52.10888671875,0],"activeWeapon":null,"health":0,"alive":false,"team":2},
  "beforeOneTick": [{"player":{"steamId":"76561198995880877","sampleTick":24005,"present":true,"position":[692.2418823242188,-178.072509765625,-415.96875],"yawPitch":[146.09927368164062,4.134979248046875],"nativeVelocity":[0,0,0],"activeWeapon":"Galil AR","health":100,"alive":true,"team":3},"opponent":{"steamId":"76561198068422762","sampleTick":24005,"present":true,"position":[357.71148681640625,40.360198974609375,-415.96875],"yawPitch":[-13.975982666015625,2.11212158203125],"nativeVelocity":[34.42578125,-49.641845703125,0],"activeWeapon":"Tec-9","health":28,"alive":true,"team":2}}],
  "nearestAliveTeammateEuclidean": {"atTick":24006,"player":{"steamId":"76561198045898864","distanceMapUnits":460.9923643712659},"opponent":null,"beforeTick":24005,"playerBefore":{"steamId":"76561198045898864","distanceMapUnits":457.82637258951144},"opponentBefore":{"steamId":"76561197989430253","distanceMapUnits":62.57189862913225}},
  "aliveCounts": {"source":"freeze_end baseline + all deaths strictly before / at tick; same-tick deaths applied as a group","before":{"CT":5,"T":4},"after":{"CT":5,"T":3},"entityAtEventTick":{"2":3,"3":5},"entityBeforeTick":{"2":4,"3":5},"entityAfterOffset":{"2":3,"3":5}}
},
{
  "category": "tradeLike",
  "selectionIndex": 0,
  "round": 3,
  "eventTick": 24073,
  "event": {"type":"kill","tick":24073,"killer":"76561197989430253","victim":"76561198995880877","killerSide":"T","victimSide":"CT","weapon":"p250","headshot":false,"assister":"76561198201620490","assisterSide":"T","assistedFlash":false,"teamkill":false},
  "player": {"steamId":"76561197989430253","sampleTick":24073,"present":true,"position":[424.48712158203125,159.30661010742188,-415.96875],"yawPitch":[-50.63667297363281,2.7390289306640625],"nativeVelocity":[19.537109375,-1.9755859375,0],"activeWeapon":"P250","health":6,"alive":true,"team":2},
  "opponent": {"steamId":"76561198995880877","sampleTick":24073,"present":true,"position":[698.0844116210938,-169.92437744140625,-415.96875],"yawPitch":[133.60198974609375,10.67218017578125],"nativeVelocity":[-2.4375,-2.328125,0],"activeWeapon":null,"health":0,"alive":false,"team":3},
  "beforeOneTick": [{"player":{"steamId":"76561197989430253","sampleTick":24072,"present":true,"position":[424.1691589355469,159.33856201171875,-415.96875],"yawPitch":[-50.63667297363281,2.7060699462890625],"nativeVelocity":[18.74609375,-1.92578125,0],"activeWeapon":"P250","health":6,"alive":true,"team":2},"opponent":{"steamId":"76561198995880877","sampleTick":24072,"present":true,"position":[698.0844116210938,-169.92437744140625,-415.96875],"yawPitch":[133.5789794921875,10.67218017578125],"nativeVelocity":[-4.94140625,-4.72265625,0],"activeWeapon":"Galil AR","health":8,"alive":true,"team":3}}],
  "nearestAliveTeammateEuclidean": {"atTick":24073,"player":{"steamId":"76561198201620490","distanceMapUnits":86.94824111370058},"opponent":null,"beforeTick":24072,"playerBefore":{"steamId":"76561198201620490","distanceMapUnits":86.59712513442074},"opponentBefore":{"steamId":"76561198081484775","distanceMapUnits":423.9693830044311}},
  "aliveCounts": {"source":"freeze_end baseline + all deaths strictly before / at tick; same-tick deaths applied as a group","before":{"CT":5,"T":3},"after":{"CT":4,"T":3},"entityAtEventTick":{"2":3,"3":4},"entityBeforeTick":{"2":3,"3":5},"entityAfterOffset":{"2":3,"3":4}}
}
]
```

完整邻点抽查和每玩家计数见 [结构化测量附件](./deep-review-evidence-nuke.json)。没有coaching conclusion。

## P5.7.0 时的 P5.7.1 建议（已由正式 contract 取代）

独立evidence contract，不能反向扩展冻结P3 Analytics或把原生属性直接传renderer。最小建议：

- source：match/content hash、parser版本、recording header、map、tickRate可缺失及来源。
- event reference：round number、event kind、event tick、同tick稳定event index；不制造subtick顺序。
- sample：requestedTick、actualTick、SteamID string、position XYZ、view yaw/pitch、health、alive、teamNum；每字段nullable并带observed/missing/invalid/unsupported、finite/range validation与provenance。requested tick有行不等于entity值在此tick更新， freshness未获证实。
- active weapon nullable；保留native display name/provenance与独立event.weapon，死后丢失不能算未知击杀武器。
- velocity默认optional/unverified；若以后验证差分，只保存明确start/end sample tick、deltaSeconds、来源与区间语义，缺邻点或跨重生/round/teleport禁止伪造零速。当前不设计或实现正式算法。
- sparse manifest：配置offset seconds/ticks、base/neighbor/history预算、requested/returned tick/row count、每玩家与字段coverage、omitted ticks、missing pairs、是否truncated。
- lifecycle与snapshot冲突应作为availability门控；不把所有metadata玩家自动当每回合参与者，不把team0/1当CT/T。
- optional observations：shots/scoped/walking/airborne/aim punch/flash duration/buttons/usercmd独立coverage及时钟/语义验证状态，不作为required条件。

这是 P5.7.0 时的候选建议；本轮用户已批准实现 P5.7.1 foundation，正式 contract 以上方链接为准。个人/GOTV兼容与资源验收仍未验证。

## 明确禁止的推断与UNKNOWN

禁止：坐标/欧氏距离→LOS或可补枪距离；视角→敌人已可见/看到/忽略；枪响+button→准确input/反应时间；未经验证velocity→counter-strafe/停枪质量；flash_duration→实际连续致盲；伤害或utility origin→战术封路效果；职业身份→基准/意图/责任；死亡坐标→战前peek轨迹；稀疏点→完整移动轨迹或地图热力图。

UNKNOWN：demo1所有新字段和性能、个人与GOTV差异、真实golden回归、独立server tick interval、实体更新freshness、usercmd client/server/render时钟与subtick对应、velocity与真实server速度的误差、峰内存与低内存设备表现、未覆盖地图/片段录制/异常生命周期的稳定性。

## 复算与回归

```powershell
pnpm --filter @cs2-analyst/dem-parser build
node --test packages/dem-parser/dev/evidence-probe.test.mjs
node --expose-gc packages/dem-parser/dev/evidence-probe.mjs .demo/spirit-vs-faze-m1-nuke.dem .tmp/nuke-evidence.json
# 补回原始demo1后（必须是现有golden内容，不能把Nuke改名）
node --expose-gc packages/dem-parser/dev/evidence-probe.mjs .demo/demo1.dem .tmp/demo1-evidence.json
pnpm typecheck
pnpm build
pnpm --filter @cs2-analyst/dem-parser test
pnpm --filter @cs2-analyst/analytics test
pnpm --filter @cs2-analyst/findings test
pnpm --filter @cs2-analyst/desktop test
```

| 本轮验证 | 结果 |
| --- | --- |
| probe test | 2/2 PASS（去重/多事件/时钟未知/预算溢出/空采样/SteamID/非法字段） |
| pnpm typecheck | 11/11 tasks成功 |
| pnpm build | 6/6 tasks成功 |
| dem-parser tests | 27 PASS，1 SKIP，0 FAIL |
| analytics tests | 48 PASS，5 SKIP，0 FAIL |
| findings tests | 16 PASS，1 SKIP，0 FAIL |
| desktop tests | 16 PASS，1 SKIP，0 FAIL |

跳过项均因demo1缺失；现有golden代码/fixture未修改，但不把“未修改”表述成“本轮真实golden运行通过”。另对Nuke通过DEM_TEST_FILE运行dem-parser tests：28 PASS，0 SKIP，0 FAIL，包含provider重复解析确定性；不替代demo1数值golden。生产package边界和public exports无改动。

独立review发现并已修复FIRE trueCount被另一optional组覆盖为0的开发报告bug；重跑probe后以本附件为准。review另指出velocity有限值不等于准确、cap降级、death-only计数与性能估计边界，均已显式记录。

P5.7.0 完成的是可复算的开发调查与UNKNOWN清单，状态为 PARTIAL PASS。P5.7.1 已正式建立最小可降级contract；个人DEM兼容和桌面资源门槛不由职业GOTV结果自动证明，仍需真实个人样本与外部峰内存测量。
