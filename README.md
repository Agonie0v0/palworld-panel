# Palworld Panel

一个面向《幻兽帕鲁》1.0 专用服务器的 Web 管理面板，支持 AMD64、ARM64、单机部署、Docker 面板和远程 Agent。

项目以 [zaigie/palworld-server-tool](https://github.com/zaigie/palworld-server-tool) 为主要功能与界面基线，并在此基础上增加服务器一键部署、Oracle ARM/box64、服务维护和面板/服务器分离部署能力。

默认面板端口：`19090`

## 功能

- 首次管理员初始化、24 小时 JWT 登录和备用 Panel Token 登录
- 服务器版本、FPS、帧时间、在线人数、运行时间和游戏天数
- 玩家列表、搜索、筛选、排序和玩家详情
- 玩家帕鲁、技能、背包物品和在线信息
- 公会列表、公会成员、公会等级和基地详情
- 完整世界地图瓦片、传送点、高塔、玩家和基地标记
- 玩家踢出、封禁、解封、白名单管理和自动踢出非白名单玩家
- 玩家定时同步、上线/下线检测和可自定义游戏内通知
- 游戏内广播、倒计时关服和 RCON 命令执行
- RCON 命令模板新增、编辑、删除和文件导入
- Cron 定时 RCON 任务新增、编辑、启停、手动执行和删除
- 存档定时解析、玩家/公会数据同步和解析状态检测
- 备份列表、定时/手动创建、按天清理、下载和删除
- PST 配置、目录选择、存档测试和 RCON 测试
- 常用游戏服参数和任意高级 `PalWorldSettings.ini` 参数写入
- 一键部署、启动、停止、重启、更新和手动备份
- 备份后重开世界、备份后卸载游戏服务器
- AMD64 原生服务端部署
- Oracle/Ampere ARM64 使用 box64 和 DepotDownloader 部署
- 桌面端和移动端界面
- Docker 面板部署
- 完整远程 Agent 分离部署和参考项目兼容的 PST `/sync` Agent 存档源
- 面板 HTTPS、REST HTTPS、可配置请求超时和 RCON Base64 模式
- 中文、英文、日文界面

## 选择部署方式

| 需求 | 推荐方式 |
| --- | --- |
| 面板和游戏服在同一台 AMD64/ARM64 Linux 机器 | 宿主机安装面板 |
| 希望在面板里直接一键安装 Palworld 服务端 | 宿主机安装面板 |
| 只想用 Docker 运行面板 | Docker 面板 |
| Docker 面板还要操作宿主机 systemd 或一键开服 | Docker 面板 + 宿主机 Agent |
| 面板和游戏服在不同机器 | 面板 + 游戏机 Agent |

Docker 容器本身不能直接管理宿主机的 systemd。需要一键开服、启停和更新宿主机服务时，请安装 Agent。这是容器权限边界，不是面板功能缺失。

## 单机一键部署

适用于 Ubuntu/Debian，支持 AMD64 和 ARM64。Oracle Cloud Ampere A1 推荐使用这种方式。

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

首次使用：

1. 创建管理员密码。
2. 进入“控制中心 -> 服务器运维”。
3. 确认安装目录、服务器名称、管理员密码和端口。
4. 点击“部署服务器”。
5. 部署完成后可直接启动、停止、重启、更新或备份。

安装脚本输出的 `Panel token` 可以直接填入管理认证框，作为忘记管理员密码时的备用登录方式。

ARM64 会自动使用 DepotDownloader 下载服务端，并通过 box64 运行；AMD64 使用 SteamCMD 和官方 Linux 服务端。

## Docker 部署面板

```bash
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel/deploy
export PANEL_TOKEN="请替换为足够长的随机字符串"
docker compose up -d --build
```

访问：

```text
http://服务器公网IP:19090
```

Docker 镜像包含完整前端、地图资源和存档解析器，首次构建时间会比普通 Node 镜像长。

如果 Docker 面板只连接已经运行的 Palworld 服务端，可以在“PST 配置”中填写 REST、RCON 和存档来源。如果还需要从面板一键安装或管理宿主机服务，请继续安装 Agent。

## Agent 分离部署

在游戏服务器机器执行：

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel
sudo AGENT_PORT=8081 bash scripts/install-agent.sh
```

记录脚本输出的 Agent 地址和 Token，然后在面板打开：

```text
控制中心 -> 服务器运维 -> Agent 模式
```

填写：

```text
启用 Agent：开启
运行模式：远程
Agent 地址：http://游戏服务器IP:8081
Agent Token：安装脚本输出的 Token
```

保存并点击“测试”。连接成功后，下列操作都会在游戏服务器机器执行：

- 一键部署和服务启停
- 更新、备份、重开世界和卸载
- REST/RCON 读取与命令执行
- 存档解析、玩家、公会、帕鲁和地图数据
- PST 目录浏览、存档测试、RCON 测试和配置保存

### 兼容参考项目 PST Agent

已有 `zaigie/palworld-server-tool` 的 `pst-agent` 时，无需安装本项目的完整 Agent。在“PST 配置”中将存档来源切换为 `pst-agent`，填写：

```text
http://游戏服务器IP:8081/sync
```

面板会按存档同步间隔下载并解析 Agent 返回的 `sav.zip`，定时备份也支持该来源。此模式只传输存档；服务器启停、一键部署和远程 RCON/REST 管理仍建议使用本项目的完整 Agent。

Docker 面板与 Agent 在同一台机器时，Agent 地址可以使用：

```text
http://host.docker.internal:8081
```

## Oracle Cloud 端口

需要同时在 Oracle Cloud 安全列表/NSG 和系统防火墙中放行端口。

| 端口 | 协议 | 用途 | 建议 |
| --- | --- | --- | --- |
| 19090 | TCP | Web 面板 | 只允许管理员来源更安全 |
| 8211 | UDP | 玩家连接 | 必须公网放行 |
| 8212 | TCP | Palworld REST API | 不建议公网开放 |
| 25575 | TCP | RCON | 不建议公网开放 |
| 8081 | TCP | Agent | 只允许面板机器访问 |

Ubuntu/Debian 可执行：

```bash
sudo bash scripts/firewall-ubuntu.sh
```

## 常用服务命令

```bash
sudo systemctl status palworld-panel
sudo systemctl status palworld
journalctl -u palworld-panel -f
journalctl -u palworld -f
```

更新宿主机面板：

```bash
cd palworld-panel
git pull
sudo bash scripts/install-panel.sh
```

更新 Docker 面板：

```bash
cd palworld-panel
git pull
cd deploy
docker compose up -d --build
```

更新 Agent：

```bash
cd palworld-panel
git pull
sudo bash scripts/install-agent.sh
```

安装脚本会保留已有配置。

## 默认数据位置

| 内容 | 路径 |
| --- | --- |
| 面板 | `/opt/palworld-panel` |
| 面板配置 | `/opt/palworld-panel/data/config.json` |
| 游戏服务端 | `/opt/palworld/server` |
| 存档备份 | `/opt/palworld/backups` |
| Agent | `/opt/palworld-agent` |

## 安全建议

- 首次部署后立即设置强管理员密码和 Palworld `AdminPassword`。
- 不要把 RCON、REST API 和 Agent 端口开放给所有公网 IP。
- 面板 Token 与游戏管理员密码使用不同的随机字符串。
- 定期下载备份到另一台机器或对象存储。
- 执行重开世界和卸载前，确认自动生成的备份已经存在。

## 开发与检查

```bash
npm ci
npm run check
npm test
pnpm --dir upstream-web install
pnpm --dir upstream-web test
pnpm --dir upstream-web build
docker compose -f deploy/docker-compose.yml config
```

## 致谢与许可证

本项目的管理界面、玩家与公会信息架构、RCON/备份工作流、地图方案和部分存档解析流程以 [zaigie/palworld-server-tool](https://github.com/zaigie/palworld-server-tool) 为主要基线。感谢 zaigie 和该项目贡献者长期维护并公开这些成果。

`palworld-server-tool` 使用 Apache License 2.0，版权声明为 `Copyright 2024 zaigie`。本仓库保留了对应的第三方许可证：[THIRD_PARTY_LICENSES/palworld-server-tool-LICENSE](THIRD_PARTY_LICENSES/palworld-server-tool-LICENSE)。其他依赖和解析器许可说明见 [NOTICE.md](NOTICE.md) 及各组件目录内的许可证文件。

本项目自身代码使用 MIT License；复制或派生自上游的内容继续遵守其原许可证。
