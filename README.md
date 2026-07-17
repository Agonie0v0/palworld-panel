# Palworld Panel

面向《幻兽帕鲁》专用服务器服主的管理面板。用于部署、启动、维护和备份 Palworld 服务器，并管理参数、玩家、存档数据、RCON 与自动化任务。

支持 AMD64 与 ARM64，适用于单机部署、Docker 面板和远程 Agent 三种场景。界面提供简体中文和 English，以及亮色、深色主题。

默认端口：面板 `19090/TCP`，游戏 `8211/UDP`，RCON `25575/TCP`，REST API `8212/TCP`。

## 这是什么

Palworld Panel 是给服主使用的运维工具，不是玩家站点。它将日常管理集中到 WebUI：

- 一键部署、启动、停止、重启、更新或卸载 Palworld 服务端
- 修改 `PalWorldSettings.ini` 常用和高级参数
- 查看服务器 FPS、在线人数、CPU、内存、磁盘与进程状态
- 管理玩家、白名单、公会、地图、基地、帕鲁和存档数据
- 执行 RCON 命令，保存模板并配置定时任务
- 创建、下载、校验、恢复备份，并可同步至 WebDAV
- 管理本地模组、Steam Workshop、配种规划和多管理员账号

项目参考并感谢 [zaigie/palworld-server-tool](https://github.com/zaigie/palworld-server-tool)。

## 快速部署

推荐在 Ubuntu 或 Debian 主机上以 systemd 单机方式部署。面板和 Palworld 可以运行在同一台 AMD64 或 ARM64 主机上。

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel
sudo PANEL_PORT=19090 bash scripts/install-panel.sh
```

安装完成后访问：

```text
http://服务器公网IP:19090
```

首次打开时创建面板管理员密码。随后进入左侧的 **常用工具 -> 服务器运维**，填写服务器名称、管理员密码和端口，执行部署。

安装脚本会创建 `palworld-panel.service`，并默认安装存档解析器。请在云防火墙或安全组中放行 `19090/TCP`；游戏部署完成后再放行 `8211/UDP`。

### Oracle Cloud ARM64

Oracle Ampere A1 可使用一条命令同时安装面板和 Palworld 服务端：

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel
sudo PANEL_PORT=19090 SERVER_NAME="My Palworld Server" bash scripts/install-oci-arm.sh
```

ARM64 会使用 DepotDownloader 与 box64 安装并运行官方 x64 服务端。脚本会输出面板地址、面板 Token、游戏管理员密码和玩家连接端口。

### Docker 面板

Docker 适合只容器化面板本身的场景。若 Palworld 运行在宿主机 systemd 中，请配合后文的 Agent，而不要期待 Docker 容器直接管理宿主机服务。

```bash
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel/deploy
export PANEL_TOKEN="replace-with-a-long-random-token"
docker compose up -d --build
```

面板仍通过 `http://服务器公网IP:19090` 访问。配置和备份由 Docker 卷持久化。

## 首次配置

面板涉及四种不同凭据，不要混用：

| 凭据 | 用途 |
| --- | --- |
| 面板管理员密码 | 登录 WebUI 管理模式 |
| `PANEL_TOKEN` | 面板备用登录和 API Token |
| Palworld `AdminPassword` | 游戏内管理员、RCON/REST 配置 |
| `ServerPassword` | 玩家进入游戏服务器的密码 |

建议按这个顺序完成首次配置：

1. 创建面板管理员密码并登录。
2. 在 **服务器运维** 中部署或接管 Palworld 服务。
3. 在 **游戏参数** 中保存服务器名称、密码、端口和倍率。
4. 在 **PST 配置** 中测试 REST、RCON 和存档来源。
5. 保存游戏参数后按提示重启 Palworld 服务。

## 菜单说明

桌面端所有大工具都在中央工作区打开，不会因点击空白区域关闭。移动端保留底部导航和工具抽屉。

| 分组 | 功能 |
| --- | --- |
| 状态与玩家 | 概览、玩家、公会、地图。用于查看实时状态和世界状态。 |
| 日常服务器 | 服务器运维、游戏参数、配种实验室、模组管理、RCON、游戏内广播、白名单。 |
| 存档与备份 | 备份、存档源、世界数据。 |
| 维护与扩展 | 运维中心、Steam Workshop。 |
| 面板与权限 | PST 配置、多管理员与 API Key、关闭服务器。 |

### 服务器运维

部署、启动、停止、重启、更新和手动备份。这里也提供主机监控、守护策略、计划重启、内存阈值和 Agent 模式。重置世界与卸载服务器会要求确认。

### 游戏参数

编辑服务器名称、说明、密码、端口、难度、死亡惩罚和常用倍率。高级参数可以直接导入或编辑 `OptionSettings`。保存参数不会自动让游戏重新读取配置，按页面提示重启服务即可生效。

### 玩家、公会、地图与世界数据

玩家页提供搜索、详情、踢出、封禁、解封和白名单入口。公会页展示成员、会长和基地。地图显示玩家、基地与存档坐标。世界数据用于查看基地、箱子、帕鲁和物品。

这些详情依赖存档解析器；实时在线状态则依赖 REST API。

### RCON 与广播

RCON 支持直接执行命令、命令模板、文本导入、玩家/物品/帕鲁占位符和定时任务。广播用于向在线玩家发送维护、重启或自定义消息。

### 备份与存档源

可创建、下载、校验、删除和恢复备份，也可设置 WebDAV。存档源支持本机目录、导入 ZIP、远程 Agent 和兼容的 `pst-agent /sync` 来源。

恢复备份会覆盖当前世界数据，请先确认目标备份和服务器状态。

### 配种、模组与 Workshop

配种实验室基于 PalCalc 数据、存档素材和自定义素材库规划路线，并管理计算任务。模组管理用于本地 PAK 和配置目录；Workshop 用于搜索、订阅和启用 Steam Workshop 项目。

## 数据从哪里来

面板的功能来自三类连接，它们不是重复配置：

| 来源 | 负责内容 |
| --- | --- |
| REST API | 在线玩家、服务器状态、FPS 与实时信息 |
| RCON | 广播、踢人、封禁、命令和定时任务 |
| 存档解析器 | 历史玩家、公会、帕鲁、物品、基地和地图标记 |

若在线人数正常但玩家详情、公会或地图为空，优先检查 **存档源** 与解析器，而不是 RCON。

## 远程 Agent

当面板和游戏服务器不在同一台机器，或 Docker 面板需要管理宿主机服务时，在游戏服务器上安装 Agent：

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel
sudo AGENT_PORT=8081 bash scripts/install-agent.sh
```

安装后会输出 Agent 地址与 Token。在面板的 **服务器运维 -> Agent** 中选择远程模式，填入：

```text
http://游戏服务器IP:8081
```

只允许面板主机访问 `8081/TCP`，不要把 Agent Token 暴露到公网。

## 端口与安全

| 端口 | 协议 | 是否需要公网开放 |
| --- | --- | --- |
| 19090 | TCP | 是，仅服主访问面板 |
| 8211 | UDP | 是，玩家连接游戏 |
| 25575 | TCP | 否，RCON 建议仅本机或内网 |
| 8212 | TCP | 否，REST API 建议仅本机或内网 |
| 8081 | TCP | 仅 Agent 模式，限制为面板主机 |

生产环境应限制 `19090/TCP` 的来源 IP，或通过反向代理与 HTTPS 暴露面板。不要将 RCON、REST API 或 Agent 端口直接开放给所有公网来源。

## 更新与维护

### systemd 安装

```bash
cd /path/to/your/palworld-panel-clone
git pull
sudo PANEL_DIR=/opt/palworld-panel PANEL_PORT=19090 bash scripts/install-panel.sh
sudo systemctl status palworld-panel
```

安装脚本会保留 `/opt/palworld-panel/data/config.json`，因此不会覆盖现有面板配置。

面板服务日志：

```bash
sudo journalctl -u palworld-panel -f
```

Palworld 服务常用命令：

```bash
sudo systemctl status palworld
sudo systemctl restart palworld
sudo journalctl -u palworld -f
```

### Docker 安装

```bash
cd palworld-panel/deploy
git pull
docker compose up -d --build
docker compose logs -f palworld-panel
```

## 常见问题

**面板能打开，但操作提示未认证**

使用面板管理员密码登录；这不是 Palworld 的 `AdminPassword`。忘记管理员密码时，使用安装时输出的 `PANEL_TOKEN` 进行备用登录。

**玩家、公会、帕鲁或地图没有数据**

检查 **数据与保护 -> 存档源** 是否指向正确的 `Pal/Saved` 数据；再检查解析器：

```bash
sudo bash /opt/palworld-panel/scripts/install-sav-parser.sh
sudo systemctl restart palworld-panel
```

**广播、踢人或 RCON 命令失败**

在 **PST 配置** 中检查 RCON 主机、端口和 Palworld `AdminPassword`，确认 `RCONEnabled=True` 且服务端已重启。

**保存参数后游戏没有变化**

参数已写入配置文件后，需要在 **服务器运维** 中重启 Palworld 服务。

**ARM64 部署失败**

确认系统是 `aarch64/arm64`，并查看以下日志：

```bash
sudo journalctl -u palworld -n 200 --no-pager
```

## 开发

```bash
npm install
npm test
npm run check
npm run test:web
npm run build:web
```

前端开发：

```bash
cd upstream-web
npm install
npm run dev
```

## 致谢与许可证

- [zaigie/palworld-server-tool](https://github.com/zaigie/palworld-server-tool)：功能与兼容体验参考。
- [deafdudecomputers/PalworldSaveTools](https://github.com/deafdudecomputers/PalworldSaveTools)：存档解析依赖，相关组件遵循其许可证。

项目主体按 MIT 使用。第三方组件与许可证见 [NOTICE](NOTICE.md) 和 [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES)。
