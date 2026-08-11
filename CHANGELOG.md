# Changelog

## 0.8.9 - 2026-08-11

- Remove active-skill chips from overview Pal cards so the fixed card can show every work suitability and passive trait without summary counts or clipped rows.
- Keep work levels visible beside their icons and let passive names wrap inside a stable two-column detail grid.

## 0.8.8 - 2026-08-11

- Rebalance the overview Pal card interior so the fixed-size cards keep the complete status, wellbeing, work, active-skill, and passive sections visible without bottom clipping.
- Keep compact work badges, tier-colored passive markers, ellipsis-safe labels, and explicit overflow counts while preserving the existing five-column / three-row desktop density.

## 0.8.7 - 2026-08-11

- Normalize overview Pal card heights and keep the compact card layout stable across responsive breakpoints.
- Show up to three rows of Pal cards per overview page, with long passive lists summarized by an explicit overflow count.
- Share 30-second game-data caching between the overview and Pal status pages while preserving scheduled and manual refreshes.

## 0.8.2 - 2026-08-11

- Equalize every passive-skill card within its detail grid using the tallest natural content height, keeping long descriptions fully wrapped without clipping or fixed-height overflow.

## 0.8.1 - 2026-08-10

- Rework the overview's host and safeguard cards into compact horizontal telemetry bands so ultra-wide displays use their space without stretching sparse content vertically.
- Render passive-skill tiers as full neutral, negative, gold, or rainbow surfaces and remove the redundant visible tier-name pills while preserving accessible tier descriptions.

## 0.8.0 - 2026-08-10

- Hide the desktop sidebar scrollbar at rest and reveal it only when the navigation can be scrolled and receives pointer or keyboard interaction.
- Remove the ambiguous shift-coverage card and percentage, then rebalance the overview around host health, safeguards, Pal totals, and attention states.
- Remove the decorative arrow from overview Pal cards while preserving the full-card detail interaction and keyboard focus behavior.
- Add the game's work-suitability icons to both Pal detail views and render passive skills as negative, common, gold, or rainbow tiers from their game-data rank.

## 0.7.1 - 2026-08-09

- Compact the desktop navigation so standard high-resolution viewports can show the complete tool set without unnecessary scrolling.
- Give light and dark sidebars distinct theme-aware gradients and reduce the dashboard intro to a restrained command header.
- Move host, automation, and shift intelligence to the top of the overview for faster scanning.
- Add an explicit all-bases view and remove the twelve-Pal truncation from base habitats.
- Prevent long Pal trait descriptions from causing horizontal overflow in overview, status, and archive detail modals.

## 0.7.0 - 2026-08-09

- 全局界面重构为高分辨率友好的世界指挥中心：桌面侧栏、顶栏、页面留白、字号和交互热区会随屏幕尺寸扩展，2K/4K 下不再紧凑微小。
- 首页据点帕鲁从表格式信息改为场景化生态卡片，可在各据点间切换，并持续呈现无人在线时的工作、休整、饱食度、SAN 和异常状态。
- 首页新增世界运行轨道、主机生命线、守护程序与班次覆盖信息层，形成更具空间层次的沉浸式运维布局。
- 首页、帕鲁状态和帕鲁仓库的详情统一改为居中沉浸式档案，不再使用右侧抽屉；补全中文工作能力、键盘焦点、减少动态效果和图片回退处理。
- 完成亮色、深色、375px 手机、横屏、1024px、1440px 和 2K 屏幕的响应式验证。

## 0.6.0 - 2026-08-09

- 主页重构为实时世界运维台，明确无人在线时服务器与据点帕鲁仍会持续工作。
- 新增据点班次、工作帕鲁状态、当前任务、饱食度、SAN、异常关注和据点汇总，并可直接进入完整帕鲁状态页。
- 全局桌面与移动布局升级为高密度、可扫描的运维控制台，统一侧栏、顶栏、状态脉冲、资源余量和自动化信息层级。
- 完善窄屏、亮色/深色主题、键盘焦点和减少动态效果偏好的适配。

## 0.5.5 - 2026-08-09

- 修复 DepotDownloader 已安装最新 Linux manifest 后，旧 Build ID 缓存仍导致面板持续误报“可用更新”的问题。
- 更新或重启原生服务器时先停服再创建一致性存档备份；备份失败会恢复服务，残缺压缩包不会进入备份列表。
- 服务端更新完成后立即重新检测 Steam 版本状态。

本项目按语义化版本记录用户可见变更。面板当前版本和构建短哈希会显示在左上角。

## 0.5.4 - 2026-07-31

- 在“服务器参数”页面新增服务器 FPS / Tick Rate 控制，可读取并选择 30、60、90 或 120 FPS。
- 保存 FPS 后可立即重启或稍后重启；立即重启继续执行存档自动备份，备份失败时不会停止服务器。
- 启动、重启和更新服务端时会同步写入 `PalWorldSettings.ini` 与 `Engine.ini`，避免停服阶段覆盖新参数。
- 为 Oracle 免费 ARM + Box64 环境增加稳定性建议：日常推荐 60 FPS，90 FPS 需观察负载，120 FPS 仅建议测试。

## 0.5.3 - 2026-07-29

- 修复 Palworld 在退出阶段将旧运行参数写回 `PalWorldSettings.ini`，导致面板保存的新参数在重启时被覆盖的问题。
- systemd 启动、重启和更新流程会在游戏进程完全停止后重新写入面板参数，再启动服务端。
- 保存服务器参数后可选择立即重启或稍后手动重启；所有重启操作都会先自动创建存档备份，备份失败时不会继续重启。

## 0.5.2 - 2026-07-29

- 顶栏服务端信息精简为当前版本号，不再将本机版本误标为“官方版本”。
- 服务器运维页分开显示当前版本、官方最新版本和更新状态，发现更新时给出明确提示。
- 新增 Steam 公开分支版本检测，默认每天自动检查，支持关闭或选择 6 小时至 7 天的检测频率，也可手动立即检测。
- 同时支持 SteamCMD Build ID 与 DepotDownloader Linux Manifest 比对，检测结果持久化保存。

## 0.5.1 - 2026-07-29

- 修复 ARM64 主机通过 DepotDownloader 更新后，服务端主程序丢失执行权限、systemd 持续重启的问题。
- 更新器改用 Palworld 服务账户写入文件，并在启动前校验主程序权限与服务存活状态。
- 面板顶部和服务器运维页明确显示官方服务端版本；服务离线时显示最近一次确认的版本。

## 0.5.0 - 2026-07-26

- 移除配种实验室入口，并将玩家数据、帕鲁仓库和全服库存移入「游戏管理」分组。
- 帕鲁状态改用与帕鲁仓库一致的图鉴元数据，新增当前任务、设施、工作能力等级、禁用工作、被动词条、已装备与已掌握主动技能、伙伴技能、个体值和详细抽屉。
- 新增无人在线时段物资增量估算，按据点仓库和公会箱的库存净变化记录当前时段及最近历史。
- 将 Workshop 改名为「创意工坊」，并作为页签合并到模组管理。

## 0.4.1 - 2026-07-26

- 修复 Palworld 1.0 结构化地图模块中的容器 ID 读取，使据点仓库和公会箱正确进入全服库存。

## 0.4.0 - 2026-07-26

- 新增独立的「玩家数据」「帕鲁仓库」「全服库存」工作区，并统一归入「存档数据」分组。
- 玩家数据新增图鉴、捕获、传送、探索区域、头目、地下城、科技点、配方、油田和存档坐标。
- 帕鲁仓库新增真实头像、玩家/据点归属、终端页位、队伍位置、工作适应性、被动、主动技能、伙伴技能、星级和个体值筛选。
- 全服库存按物品汇总数量，并展开到玩家背包、据点仓库、公会箱、容器 ID、槽位和坐标。
- 服务器运维打开时自动刷新状态；启动、停止、重启、更新、备份和部署统一显示实时任务日志。
- 服务器操作中的备份按钮改名为「创建存档备份」，避免与完整存档管理工作区混淆。

## 0.3.0 - 2026-07-26

- 「游戏管理」新增独立的帕鲁状态工作区，使用游戏内头像显示据点工作帕鲁。
- 新增据点筛选、状态搜索、只看需关注，以及饱食度、SAN、工作设施和异常状态展示。
- 「世界数据」移除工作帕鲁普通表格，继续作为原始存档数据浏览工具。
- 已保存的自定义侧栏会将新功能自动放入「游戏管理」分组。

## 0.2.0 - 2026-07-26

- 世界数据新增据点工作帕鲁列表、工作状态、饱食度、SAN 值和异常状态。
- 据点列表新增工作帕鲁数量与需关注数量。
- 侧栏版本标识改为 `v版本号 · 构建短哈希`，并可查看完整提交和安装时间。
- HTML 入口禁止缓存，更新后浏览器会及时加载新构建。

## 0.1.0

- 首个可安装版本，包含服务器部署、监控、玩家、参数、备份、RCON、模组与自动化管理。
