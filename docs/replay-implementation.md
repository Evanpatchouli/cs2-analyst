# P6 实施与验收记录

2026-10-15，起点 `31124ff`。仅实施 P6；P3/P4/Deep Review 算法、阈值、golden 不变。

用户明确选择 `.demo/spirit-vs-faze-m3-dust2.dem` 作为本次真实验证样本：
SHA-256 `db90fe85aab023a1d2c8a5996182e6120d98ef494f02a070b17982b235e4958c`，557650967 字节。
缺少其他 DEM 不作为阻塞；未执行的其他地图/个人 DEM 验证不得称为通过。
用户确认资源仅用于本机个人、非商业开发与安装验证；公开分发许可保持未确认，不 push/发布资源或安装包。

## P6.0 — 本机个人非商业开发验证通过

新增 dem-parser 内部 `dev/replay-probe.mjs`，不进入生产导出或 Desktop：每候选独立 OS 进程，
读取一次 DEM，共享 bytes、基础 Match/事件查询，再执行三次独立采样以观察波动。
每个正式 round start/end 闭区间内，均匀采样与 freeze、完整事件、生命周期 tick 合并；
不可靠窗口不采集，超预算抛错，空计划不调用 native。
其 Match SHA 与现有 public `parse()` 独立结果相同。

实际数据见 [机器可读试验记录](./replay-feasibility.json)。Windows x64 / Ryzen 7 5700G / 32 GiB，
固定 Rust 1.90.0、MSVC 14.44.35207、SDK 10.0.26100.0 构建的生产 native，SHA
`64aa7e63117dbb1fc0c9c986bc32396bd58e6f5e42ffe6193621d82985065868`。
初始环境无 native；首次 verify 失败、默认 Rust 1.92.0 导致构建拒绝。补齐固定工具链后 3 个 Rust handle 测试与 native 校验通过。
未更改全局默认 Rust、未使用官方旧绑定回退。

| 候选 | 采样查询三次（秒） | 请求 tick / 返回玩家行 | 原始 JSON MiB | 试验进程峰值 MiB | 四个战斗窗位置误差 p95 / max（世界单位） |
| --- | --- | --- | --- | --- | --- |
| 8 Hz | 3.26 / 3.24 / 3.84 | 27466 / 274660 | 56.63 | 1485.35 | 1.85 / 12.40 |
| 16 Hz | 5.84 / 6.12 / 6.36 | 50302 / 503020 | 103.64 | 1980.47 | 0.58 / 9.68 |
| 32 Hz | 12.26 / 12.39 / 14.37 | 95888 / 958870 | 197.48 | 3134.62 | 0.20 / 5.84 |

8/16 Hz 无缺失请求 tick / 玩家行；32 Hz 有 1 个请求 tick、10 行玩家状态未返回，不能跨该缺失段插值。
这不构成其他 DEM 或 native 绝对 freshness 的保证。
四个分布回合的首杀前后各两秒，以真实逐 tick 状态为参考；剔除死亡、缺失、生命周期中断。
8 Hz 方向误差 p95 2.71°、max 21.69°。误差不是全场上限，采样方向也不表示视线/可见性。
20 秒原始 JSON 候选块最大 593918 / 911813 / 1554248 字节；查找并序列化 p95
与所有原始值保留在 JSON。这不是已实现的 DTO、IPC 或 UI seek 指标。
峰值是输入/native/重复查询/reference/JSON 的进程生命周期峰值，不是 Electron 峰值。

首版固定 **8 Hz + 精确事件/生命周期/边界 tick**，兼顾地图尺度下的位置误差与开销。
以下为后续验收目标，尚不是实测 PASS：

- 同一 Dust2 / 开发机：新增回放查询 ≤5 秒；完整导入 ≤15 秒；进程峰值 ≤2.5 GiB。
- 每会话最多 60000 个请求 tick，先检查预算再 native 查询；超限只降级回放，原报告保持可用。
- 按回合、必要时 20 秒分块；单块 JSON ≤1 MiB，超限进一步拆分；会话缓存序列化总量 ≤64 MiB。
- Renderer 最多保留当前块及两个邻块；首帧 ≤1.5 秒，暖缓存 seek p95 ≤250 ms。
- 10 名玩家 Canvas 绘制 p95 ≤16.7 ms；显示插值最大间隔 1/8 秒，缺失/死亡/重生/断连/回合边界不得跨越。
- 多点配准：原始自然尺寸上的出生区与两个安包区都落入独立辨认的区域；未确认地图版本始终标示示意。
- Nuke 的 Z=-495 共享边界保留未知；缺 Z、越界和未知楼层不画成同层接触。

当前 Main 在报告成功/失败时立即 kill worker；worker 仅 `once(message)`，没有持久会话。
P6.2 必须显式扩展会话生命周期，不能直接假定现有导入支持回放块请求。

已验证：probe 边界测试 3/3、资源检查器边界测试 2/2；parser 38 PASS / 2 SKIP（缺历史路径）；
`pnpm typecheck` 15/15、`pnpm build` 8/8。构建前一次 typecheck 因 native 尚未生成而失败，生成后重跑通过。
独立只读复核无阻塞，建议的未知 tick rate 参考窗处理已修正。

可复现（不会下载 DEM/扫描游戏）：

```powershell
node --test packages/dem-parser/dev/replay-sampling.test.mjs scripts/replay-resource-audit.test.mjs
foreach ($rate in @(8,16,32)) {
  node --expose-gc packages/dem-parser/dev/replay-probe.mjs .demo/spirit-vs-faze-m3-dust2.dem $rate ".tmp/p6-resources/replay-$rate.json"
}
```

资源调查已固定 DepotDownloader 3.4.0、Source2Viewer CLI 20.1；直接 Steam 匿名获取
app 730 / depot 2347770 / manifest 2312433566686574487 的 `pak01_dir.vpk` 成功，
仅据目录索引获取六个所需 VPK 分卷。未安装游戏、未扫描 Steam/CS2、未执行社区下载脚本。
资源获取现已完成：压缩传输约 574 MB，仅获取索引和 6 个分卷（解压后共 666849112 字节），
未获取地图/游戏可执行文件，不构成安装 CS2。工具、manifest、VPK、4 份原始 overview、5 张图片的尺寸/摘要
以及两社区来源交叉比对见 [资源记录](./replay-resources.json)。五张 PNG 均为 1024×1024，实际解码并视觉检查；
与 awpy 2000930 的图片逐字节相同，Murky 固定 commit 的 PNG 字节不同，未混用。
Steam 原始 manifest 成功验证下载可用性；社区元数据不被称为 Valve 官方 API。

[Dust2 配准记录](./replay-calibration.json)对从原始图片独立辨认的 T 出生区、CT 出生区、东西两个安包区域
作区域测试：5 个 T / 5 个 CT freeze-end 状态、7 个东侧与 5 个西侧精确 planted 玩家位置全部落在相应区域内。
覆盖顶部/底部、东西方向、比例与边缘；这是 4 区域一致性证据，不是像素精确地形或地图版本等价证明。
原始图片的 `rotate/zoom/inset` 是 overview 中保留的 HUD 配置，不机械应用到自然尺寸雷达；
实际区域对齐支持 X 正向右、Y 正向上、scale 4.4。朝向投影和多尺寸画布由 P6.1 纯函数测试。
Nuke 原始上下层范围分别为 [-495,10000] / [-10000,-495]，共享边界在 P6.1 保留未知。
Inferno/Mirage 只验证资源配套与装载，不声称真实 DEM 配准通过。

原始 DEM header patch_version=14055，资源当前 manifest 的 client/build version 没有可验证等价关系；
所有四图 DEM 版本匹配均为 unconfirmed。后续 UI 明示“地图版本未确认，仅示意”，不按地图名声称匹配。
个人本机开发/安装验证范围由用户明确确认；公开/商业分发许可 UNKNOWN，不在本任务中 push 或发布。
本阶段通过仅针对上述本机技术前置验证，不表示取得公开分发许可。

复现官方资源提取：固定工具包地址与摘要见资源 JSON；两个工具均不放入运行时/安装包。

```powershell
# 第一份 filelist 只包含 game/csgo/pak01_dir.vpk；随后按索引固定六个分卷：022/137/157/339/409/433。
dotnet .tmp/p6-resources/depotdownloader/DepotDownloader.dll -app 730 -depot 2347770 -manifest 2312433566686574487 -filelist .tmp/p6-resources/map-filelist.txt -dir .tmp/p6-depot -max-downloads 2
# 使用 replay-resources.json 中精确的图片/overview 筛选范围，保留原始路径。
.tmp/p6-resources/vrf/Source2Viewer-CLI.exe -i .tmp/p6-depot/game/csgo/pak01_dir.vpk -o '.tmp/p6-official/' -d -f '<exact filters from replay-resources.json>'
node scripts/replay-resource-audit.mjs .tmp/p6-official .tmp/p6-resources/official-audit.json
node scripts/replay-calibration.mjs
```

提取 Inferno overview 曾因分卷尚在下载而锁定失败，CLI 错误时仍返回 0；等待下载完成后重试成功，
最终通过独立目录检查器确认全部九份文件，未把退出码 0 单独当作成功证据。

## P6.1 — 地图基础通过

`replay-map.ts` 的纯数值投影统一处理1024参考平面与自然图像尺寸、Canvas Y反向与记录 yaw；
Nuke根据版本元数据判层，-495/缺Z/越界保留未知。4个测试覆盖独立Dust2区域、倍尺寸、四向朝向、
Nuke层级边界、未知地图/缺图回退；desktop typecheck通过，独立复核无阻塞。

`node scripts/prepare-replay-maps.mjs .tmp/p6-official` 先核验全部原始overview/PNG摘要及参数，再准备5张本地图片。
远端仓库已核实为PUBLIC，用户要求完成后push代码；为遵守本机素材用途，PNG/raw overview不提交或推送。
图片位于受Git忽略的renderer assets目录，Vite按相对URL打包；空源码检出允许缺图并降级事件浏览，
不会热链或下载。归一数值元数据/摘要、准备工具及验证记录提交；公开素材分发许可仍未确认。

UI/真实离线装载在P6.3/P6.4验证。

## P6.2A — 独立领域/采样通过

新增match-model独立Replay契约及显式parseWithReplay()，同一次readInput/基础Match与事件查询复用，
独立8Hz+正式边界/精确事件/生命周期计划，60000唯一tick上限；旧parseWithSpatial仍保持原三字段与稀疏证据。
真实Dust2自动比较Match/Spatial完整内容hash相同，27466请求tick、无缺失玩家行；首轮采样归一化4.01秒，
全parser套件另一次2.95秒，进程生命周期峰值约1.49GiB（包含测试比较，不是app峰值）。

逐玩家segment保留缺失、生命期与跨回合断点；断连跨回合/未采样post-round间隙持续未知，仅本人spawn解除；
死亡后陈旧Pawn存活行记歧义，不能自行复活；same-tick冲突无顺序推断。未知时钟保留事件tick且tickRate=null。
6个新合成边界与1个指定真实DEM验证通过，parser全套45 PASS/2 SKIP，typecheck15/15、build8/8通过。
独立复核发现并已修复跨回合断连状态重置，回归覆盖；不更改旧golden或算法。

契约兼容性/进程方案见[Replay contract](./replay-contract.md)。

## P6.2B — 会话/分块传输通过

report-contract additive可选replay元数据、schema v1分块DTO与命名preload API已接入，原报告schema仍为2。
Utility一次共享输入生成原报告和回放，再只保留有界JSON块；Main报告返回后保留worker，
新文件实际导入/解析取消/会话释放/窗口关闭清理worker与pending，取消文件选择保留旧会话。
当前窗口主frame+当前随机sessionId+登记round/block校验，最多4个在途请求，旧返回不能污染新会话。
回放采样/缓存失败仅降级回放，成功报告保留。

真实Dust2缓存34757998字节（33.15MiB）、159块、最大371621字节（≤1MiB），低于64MiB预算。
逐块JSON与所有相邻guard frames比较、随机读取状态/炸弹基线一致，检查/投影合计1.55秒；
此项仍不是实际IPC/UI seek耗时。真实cache测试进程峰值约1.46GiB。
9个IPC/生命周期/缓存/worker合成测试通过，desktop typecheck/build通过，独立复核无阻塞。

完整desktop测试首次因旧Nuke硬性fixture要求失败（本机无`nuke.dem`），另有新测试mock缺方法已修正。
按用户只要求Dust2的范围，未修改旧测试：`node --test --test-skip-pattern='Nuke Desktop' apps/desktop/tests/*.test.mjs`
执行38 PASS/1 SKIP（demo1缺失），Nuke case显式过滤；随后新增在途请求限额测试另通过。
P6.3播放器与P6.4真实Electron/安装验收待完成。
