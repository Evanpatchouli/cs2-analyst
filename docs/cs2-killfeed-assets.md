# CS2 官方 kill-feed 资源

P5.6.3 从本机 CS2 资源读取，只改展示资源，不影响 DEM / Analytics / Findings / Timeline。原始 SVG 不编辑，资源目录 .gitattributes 的 *.svg -text 阻止跨平台换行转换，provenance.json 记录每个文件的 SHA-256 与 VPK 源路径；运行时只访问纳入 Renderer 的 assets。

## 正确来源

VPK：

`c:\steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\pak01_dir.vpk`

| 用途 | VPK 内已确认路径 | 项目路径 |
| --- | --- | --- |
| 武器 | panorama/images/icons/equipment/*.vsvg_c | renderer/src/assets/killfeed/weapons/*.svg |
| 爆头 | panorama/images/hud/deathnotice/icon_headshot.vsvg_c | renderer/src/assets/killfeed/death-notice/icon_headshot.svg |
| 闪光助攻 | panorama/images/icons/equipment/flashbang_assist.vsvg_c | renderer/src/assets/killfeed/death-notice/flashbang_assist.svg |

**HUD 源目录为 panorama/images/hud/deathnotice/。** 旧假定 panorama/images/icons/death_notice/ 错误。项目 death-notice 或本地导出 death_notice 名称只是输出组织，不是 VPK 的源目录。编译资源扩展名为 .vsvg_c，反编译后为 .svg，爆头文件名保留 icon_headshot。

## 定向提取（已安装的 CLI）

使用已经准备好的 ValveResourceFormat，不下载工具，不重跑全量 equipment。先用 -l 确认当前 VPK 清单，再对同一筛选范围反编译：

```powershell
$killfeedCli = 'C:\Users\evanpatchouli\Downloads\cs2-valve-icon-extractor\tools\vrf\Source2Viewer-CLI.exe'
$killfeedVpk = 'c:\steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\pak01_dir.vpk'
$killfeedExport = 'E:\cs2-coach\output\targeted-deathnotice'
$killfeedFilter = 'panorama/images/hud/deathnotice/,panorama/images/icons/equipment/flashbang_assist'
& $killfeedCli -i $killfeedVpk -e 'vsvg_c,vsvg' -f $killfeedFilter -l
New-Item -ItemType Directory -Path $killfeedExport -Force | Out-Null
& $killfeedCli -i $killfeedVpk -e 'vsvg_c,vsvg' -f $killfeedFilter -o ($killfeedExport + '\') -d
if ($LASTEXITCODE -ne 0) { throw '定向提取失败' }
```

2026-10-07 实际提取 10 张 HUD SVG：blind_kill、domination、icon_headshot、icon_suicide、inairkill、noscope、penetrate、revenge、smoke_kill、smokegrenade_impact，另有 equipment/flashbang_assist。它们保留完整源目录结构于 output/targeted-deathnotice，manifest.json 记录本次结果。只把 icon_headshot 与 flashbang_assist 用于当前 UI；其余9张 HUD SVG 留在本地备用，不入仓库或 installer，不新增对应判定。原始 output/equipment 继续复用，旧 manifest 的 deathNoticeCount=0 是错误筛选路径产生的历史结果，不表示 VPK 中没有 HUD 图标。

提取器本机 README、Extract-CS2-Icons.ps1 筛选路径与 cs2-coach-icon-map.json 爆头文件名也已修正；本项目不依赖这些外部脚本运行。

## 项目映射与回退

- 71 SVG、0 PNG：69武器、2 death notice；72个weapon identifier，24张刀图/26刀标识。Vite 静态 imports、相对base、assetsInlineLimit=0。
- 刀型各用实际官方文件，knife_bayonet → bayonet、kukri → knife_kukri；p2000 → hkp2000。
- 爆头与闪光助攻仅在原 DTO flag === true 时显示官方图片；没有自绘回退或新增判定。
- world 源 SVG 为空，未知 weapon / 未知刀型使用简单圆环 neutral fallback，label 和整行 aria-label 保留既有事实。
- img 高22px、自然宽度、object-fit contain、武器最大96px、notice最大24px、alt为空且aria-hidden；无图形编辑、背景板或阴影。
- provenance 的本机源路径只供文档追溯，不被运行时代码 import。

## 验证范围

Node 测试实际渲染组件并验证明确mapping、knife独立图、unknown accessible text、独立flag门控与官方资源SHA-256。dev/preview smoke解码所有图片；installed smoke核对ASAR内全部资源字节并解码生产安装版图片URL，test-seam使用同一组真实DEM UI断言。R24 AK-47/inferno、R22 posthumous HE与flash assist；R24没有爆头flag，另用真实R23 M4A1-S爆头死亡验证官方headshot，不篡改DTO来构造R24爆头。
