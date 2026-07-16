# Palworld Panel

一个支持 AMD64 和 ARM64 的《幻兽帕鲁》服务器管理面板。

安装面板后，可以直接在网页中部署 Palworld 服务端，并管理启动、停止、更新、参数、玩家、RCON、备份和存档数据。

项目参考：[zaigie/palworld-server-tool](https://github.com/zaigie/palworld-server-tool)

## 主要功能

- AMD64 原生运行 Palworld 服务端
- ARM64 通过 box64 运行 Palworld 服务端
- 网页一键部署、启动、停止、重启和更新
- 备份后重开新世界、一键卸载游戏服务端
- 修改 `PalWorldSettings.ini` 常用参数
- 查看在线玩家，执行广播、踢出、封禁和关服命令
- RCON 控制台、命令模板和定时任务
- 手动备份、自动备份、下载、恢复和删除
- Palworld REST API 数据查看
- `Level.sav`、玩家、公会、帕鲁和背包解析
- 玩家、公会和帕鲁详情
- 世界地图、玩家位置和基地标记
- 首次管理员初始化和账号密码登录
- 手机浏览器适配
- Docker 面板部署
- 面板与游戏服务器分离部署的 Agent 模式

## 方式一：单机部署

适合甲骨文 ARM、普通 AMD64 云服务器，以及“面板和游戏服务器安装在同一台机器”的情况。

这是最简单的部署方式，也是需要在网页中直接一键安装 Palworld 服务端时的推荐方式。

服务器要求：

- Ubuntu 或 Debian
- root 或 sudo 权限
- 建议至少 16 GB 内存
- 建议至少 40 GB 可用磁盘

执行：

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel
sudo PANEL_PORT=19090 bash scripts/install-panel.sh
```

安装结束后会显示面板地址和备用 Token：

```text
Panel URL: http://SERVER_PUBLIC_IP:19090
Panel token: 一串随机字符
```

浏览器打开：

```text
http://你的服务器IP:19090
```

第一次打开时：

1. 创建管理员账号和密码。
2. 打开“部署”页面。
3. 点击“检测”。
4. 填写服务器名称和管理员密码。
5. 点击“部署 Palworld 服务端”。
6. 部署完成后在“总览”页面启动服务器。

ARM64 机器会使用原生 DepotDownloader 下载服务端，并通过 box64 运行；AMD64 机器会使用 SteamCMD 和官方服务端。

## 方式二：Docker 面板 + 远程 Agent

适合下面这些情况：

- 面板想用 Docker 运行
- 面板和游戏服务器不在同一台机器
- 一个面板需要远程管理游戏服务器

Docker 容器不能直接操作宿主机的 systemd，所以要在游戏服务器上安装 Agent。

### 1. 部署 Docker 面板

```bash
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel/deploy
export PANEL_TOKEN="请修改成一个足够长的随机字符串"
docker compose up -d --build
```

面板地址：

```text
http://面板服务器IP:19090
```

### 2. 在游戏服务器安装 Agent

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel
sudo AGENT_PORT=8081 bash scripts/install-agent.sh
```

安装结束后会显示：

```text
Agent address: http://GAME_SERVER_IP:8081
Agent token: 一串随机字符
```

### 3. 面板连接 Agent

打开面板：

```text
自动化 -> Agent 分离部署
```

设置：

```text
启用 Agent 模式：开启
模式：远程 Agent
Agent 地址：http://游戏服务器IP:8081
Agent Token：安装脚本输出的 Token
```

点击“保存”，再点击“测试连接”。连接成功后，部署、启停、更新、参数、RCON、备份和存档解析都会在游戏服务器上执行。

## 服务器端口

| 端口 | 协议 | 用途 | 是否需要公网开放 |
| --- | --- | --- | --- |
| 19090 | TCP | Web 面板 | 只开放给管理员更安全 |
| 8211 | UDP | 玩家连接 | 需要 |
| 8212 | TCP | Palworld REST API | 不建议直接公网开放 |
| 25575 | TCP | RCON | 不建议直接公网开放 |
| 8081 | TCP | 远程 Agent | 只允许面板服务器访问 |

Oracle Cloud 还需要在安全列表或 NSG 中放行对应端口。

Ubuntu 防火墙可以执行：

```bash
sudo bash scripts/firewall-ubuntu.sh
```

## 常用操作

修改服务器参数：

```text
参数 -> 修改参数 -> 保存并写入 -> 总览 -> 重启
```

创建和下载备份：

```text
备份 -> 立即备份 -> 下载
```

重开新世界或卸载服务端：

```text
部署 -> 服务端维护 -> 备份并重开服 / 备份并卸载服务端
```

这两个操作都会先停止服务器并创建备份。重开服只清空世界存档；卸载只删除游戏服务端，面板和备份仍会保留。

查看存档数据：

```text
存档数据 -> 读取
```

管理定时 RCON：

```text
RCON -> 定时 RCON -> 新增
```

## 更新项目

宿主机面板：

```bash
cd palworld-panel
git pull
sudo bash scripts/install-panel.sh
```

Docker 面板：

```bash
cd palworld-panel
git pull
cd deploy
docker compose up -d --build
```

远程 Agent：

```bash
cd palworld-panel
git pull
sudo bash scripts/install-agent.sh
```

安装脚本会保留已有的面板配置和服务器配置。

## 数据位置

宿主机安装默认目录：

| 内容 | 默认位置 |
| --- | --- |
| 面板 | `/opt/palworld-panel` |
| 面板配置 | `/opt/palworld-panel/data/config.json` |
| Palworld 服务端 | `/opt/palworld/server` |
| 存档备份 | `/opt/palworld/backups` |
| Agent | `/opt/palworld-agent` |

Docker 面板配置保存在 `panel-data` volume 中，重建容器不会丢失管理员、RCON 任务、Agent 配置和白名单数据。

## 存档解析器

安装脚本默认安装项目内置的 `sav_cli` 存档解析器。首次安装需要编译 Python 依赖，耗时可能较长。

暂时跳过解析器：

```bash
sudo INSTALL_SAVE_PARSER=0 PANEL_PORT=19090 bash scripts/install-panel.sh
```

之后单独安装：

```bash
sudo PARSER_DIR=/opt/palworld-panel/parsers/sav_cli bash /opt/palworld-panel/scripts/install-sav-parser.sh
```

地图使用 Leaflet，并按需读取参考项目公开的地图瓦片。地图资源无法访问时，其他管理功能不受影响。

## 安全建议

- 管理员密码和 Panel Token 使用不同的强密码
- 面板端口只允许自己的 IP 访问
- Agent 的 8081 端口只允许面板服务器访问
- 不要把 RCON 和 REST API 直接开放给所有公网 IP
- 首次部署服务端后立即修改 `AdminPassword`
- 定期下载备份到其他机器保存

## 开发检查

```bash
npm run check
docker compose -f deploy/docker-compose.yml config
```

更多 ARM 部署说明见 [QUICKSTART_ARM.md](QUICKSTART_ARM.md)。
