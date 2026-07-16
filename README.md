# Palworld Panel

面向《幻兽帕鲁》1.0 的服务器 Web 管理面板，目标是对标 `zaigie/palworld-server-tool` 的管理体验，并支持 Oracle Cloud ARM 机器部署。

参考项目：[zaigie/palworld-server-tool](https://github.com/zaigie/palworld-server-tool)

## 不想看文档，直接 ARM 开服

在 Oracle Cloud ARM / Ubuntu 服务器上执行：

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel
sudo PANEL_PORT=8080 bash scripts/install-oci-arm.sh
```

然后浏览器打开：

```text
http://你的服务器IP:8080
```

输入脚本输出的 `Panel token`，进入面板后点：

```text
总览 -> 启动
```

参数管理：

```text
参数 -> 修改 -> 保存并写入 -> 总览 -> 重启
```

更短的说明见 [QUICKSTART_ARM.md](./QUICKSTART_ARM.md)。

## 功能完成度

已经内置并可直接使用：

- WebUI 启动、停止、重启、更新服务器
- WebUI 手动备份
- 备份列表、删除、恢复
- 常用 `PalWorldSettings.ini` 参数编辑
- Palworld REST API 数据读取入口
- RCON 控制台
- 玩家操作：广播、踢出、封禁、保存、平滑关服
- 白名单记录管理
- 自动备份、自动广播、备份保留数量
- Docker 模式：通过 Docker socket 管理同机 Palworld 容器
- systemd 模式：适合直接装在云服务器
- Oracle ARM 安装脚本：通过 `box64` 运行官方 x86_64 服务端
- 内置参考项目同源 `sav_cli` 存档解析器
- 解析 `Level.sav` 和 `Players/` 玩家存档
- 存档页展示玩家、公会、帕鲁、背包摘要

还需要继续补齐到参考项目同等体验的部分：

- 地图数据
- 更完整的玩家/公会/帕鲁详情页
- 参考项目级别的移动端细节体验

存档解析器来自参考项目的 `sav_cli` 思路，依赖 PalworldSaveTools 的 `palsav-flex/palooz`。ARM 一键安装默认会安装解析器依赖；如果只想先开服，可以跳过：

```bash
sudo INSTALL_SAVE_PARSER=0 PANEL_PORT=8080 bash scripts/install-oci-arm.sh
```

项目仍保留 `server.saveParserCommand` 接口。你也可以替换成自己的解析器，只要接收存档路径并输出 JSON。

推荐解析器输出：

```json
{
  "players": [],
  "guilds": [],
  "pals": [],
  "inventory": [],
  "map": {}
}
```

## Docker 部署

进入 `deploy` 目录：

```bash
cd deploy
```

设置面板令牌：

```bash
export PANEL_TOKEN="change-this-to-a-long-random-token"
```

启动面板：

```bash
docker compose up -d --build
```

访问：

```text
http://服务器IP:8080
```

第一次启动后，面板会在 Docker volume 中创建 `/data/config.json`。如果你想使用示例配置，可以把 `deploy/config.docker.example.json` 复制成容器内的 `/data/config.json`，或直接在面板里调整。

### Docker 模式如何管理 Palworld

面板容器默认挂载：

```yaml
/var/run/docker.sock:/var/run/docker.sock
```

所以它可以管理同一台机器上的 Palworld 容器。

在 `data/config.json` 里设置：

```json
{
  "server": {
    "mode": "docker",
    "containerName": "palworld",
    "rconHost": "host.docker.internal",
    "restHost": "host.docker.internal",
    "saveDir": "/palworld/Pal/Saved",
    "backupDir": "/backups"
  }
}
```

如果你的 Palworld 服务端也在 Docker 里，建议：

- Palworld 容器名固定为 `palworld`
- 开启 RCON：`25575/tcp`
- 开启 REST API：`8212/tcp`
- 开启玩家端口：`8211/udp`
- 把存档目录挂载到宿主机，再给面板容器挂载到 `/palworld`

### Docker 端口

| 端口 | 协议 | 用途 |
| --- | --- | --- |
| 8080 | TCP | WebUI 面板 |
| 8211 | UDP | Palworld 玩家连接 |
| 8212 | TCP | Palworld REST API |
| 25575 | TCP | RCON |

公网部署时，不建议把 RCON 和 REST API 直接开放给所有 IP。

## 本地运行

```bash
npm start
```

打开：

```text
http://127.0.0.1:8080
```

检查语法：

```bash
npm run check
node --check public/app.js
```

## Oracle Cloud ARM 直接安装

推荐系统：Ubuntu 22.04 或 24.04 ARM64。

在项目目录执行：

```bash
sudo PANEL_PORT=8080 bash scripts/install-oci-arm.sh
```

安装完成后启动服务端：

```bash
sudo systemctl start palworld
```

查看服务：

```bash
sudo systemctl status palworld
sudo systemctl status palworld-panel
```

Oracle Cloud Ampere A1 是 ARM64，Palworld 官方 Linux dedicated server 通常按 x86_64 发布。本项目的安装脚本使用 `box64` 兼容运行。个人服和测试服可以尝试，高在线人数建议使用 x86_64 云主机。

## 配置文件

默认配置：

```text
data/config.json
```

Docker 内配置：

```text
/data/config.json
```

关键字段：

- `panel.port`：面板端口
- `panel.token`：面板访问令牌
- `server.mode`：`systemd` 或 `docker`
- `server.containerName`：Docker 模式下 Palworld 容器名
- `server.imageName`：Docker 模式下更新镜像使用
- `server.settingsPath`：`PalWorldSettings.ini` 路径
- `server.saveDir`：存档目录
- `server.backupDir`：备份目录
- `server.restHost` / `server.restPort`：Palworld REST API 地址
- `server.rconHost` / `server.rconPort`：RCON 地址
- `server.saveParserCommand`：外部存档解析器命令
- `automation.backupIntervalMinutes`：自动备份间隔
- `automation.broadcastIntervalMinutes`：自动广播间隔

## 安全建议

- `panel.token` 必须改成强随机字符串
- 面板端口最好只允许你的 IP 访问
- RCON 和 REST API 尽量只允许本机或可信 IP 访问
- Docker 部署挂载 Docker socket 后，面板拥有管理 Docker 的能力，请只部署在可信机器上
- 第一次开服后先修改管理员密码
- 定期备份存档
