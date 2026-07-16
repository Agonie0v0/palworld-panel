# Palworld Panel

这是一个《幻兽帕鲁》服务器管理面板。

目标流程很简单：

1. 先在 AMD64 或 ARM64 Linux 机器上部署 Web 面板。
2. 打开面板，在“部署”页一键安装 Palworld 服务端。
3. 之后在面板里管理开服、停服、参数、玩家、备份、RCON、REST API 和存档数据。

参考项目：[zaigie/palworld-server-tool](https://github.com/zaigie/palworld-server-tool)

## 最快部署

Ubuntu / Debian 服务器执行：

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel
sudo PANEL_PORT=8080 bash scripts/install-panel.sh
```

安装完成后会显示：

```text
Panel URL: http://SERVER_PUBLIC_IP:8080
Panel token: 一串随机字符
```

浏览器打开：

```text
http://你的服务器IP:8080
```

进入面板后：

```text
部署 -> 检测 -> 部署 Palworld 服务端
总览 -> 启动
```

修改参数：

```text
参数 -> 修改 -> 保存并写入 -> 总览 -> 重启
```

AMD64 和 ARM64 都用同一个面板安装脚本：

- AMD64：服务端原生运行
- ARM64：部署服务端时自动安装 box64

## 当前功能

已经实现：

- 面板可部署在 AMD64 / ARM64 Linux
- 面板里一键部署 Palworld 服务端
- 启动、停止、重启、更新服务器
- 修改常用 `PalWorldSettings.ini` 参数
- 手动备份
- 备份列表
- 删除备份
- 恢复备份
- 自动备份
- 自动广播
- RCON 控制台
- 广播、踢人、封禁、保存、平滑关服
- 读取 Palworld REST API 数据
- 白名单记录管理
- 内置参考项目同源 `sav_cli` 存档解析器
- 解析 `Level.sav` 和 `Players/`
- 展示玩家、公会、帕鲁、背包摘要
- Docker 部署面板
- Docker 模式管理已有 Palworld 容器

还需要继续补齐到参考项目同等体验：

- 首次管理员初始化流程
- 玩家详情页
- 公会详情页
- 帕鲁详情页
- 地图瓦片和玩家/基地标记
- RCON 命令模板库
- 定时 RCON 任务完整管理
- 备份下载
- 更完整的移动端体验
- 面板和服务器分离部署的 Agent 模式

## 面板部署方式

推荐方式是直接装到宿主机：

```bash
sudo PANEL_PORT=8080 bash scripts/install-panel.sh
```

这样面板可以调用系统命令，在“部署”页安装 Palworld 服务端和 systemd 服务。

Docker 方式也支持：

```bash
cd deploy
export PANEL_TOKEN="change-this-to-a-long-random-token"
docker compose up -d --build
```

但 Docker 面板不能直接给宿主机安装 systemd 服务端。Docker 面板更适合管理已经存在的 Palworld Docker 容器。

## 存档解析

项目内置了参考项目同源的 `sav_cli` 解析器。

ARM/AMD 面板安装脚本默认会安装解析器依赖。第一次安装会编译 Python 原生依赖，可能需要一些时间。

如果你只想先快速开服，可以跳过解析器：

```bash
sudo INSTALL_SAVE_PARSER=0 PANEL_PORT=8080 bash scripts/install-panel.sh
```

之后也可以单独安装：

```bash
sudo PARSER_DIR=/opt/palworld-panel/parsers/sav_cli bash /opt/palworld-panel/scripts/install-sav-parser.sh
```

## 端口

常用端口：

| 端口 | 协议 | 用途 |
| --- | --- | --- |
| 8080 | TCP | Web 面板 |
| 8211 | UDP | 玩家连接 |
| 8212 | TCP | Palworld REST API |
| 25575 | TCP | RCON |

Oracle Cloud 需要在安全列表或 NSG 里放行端口。

Ubuntu 本机防火墙可以执行：

```bash
sudo bash scripts/firewall-ubuntu.sh
```

## 本地开发检查

```bash
npm run check
node --check public/app.js
docker compose -f deploy/docker-compose.yml config
```

## 安全建议

- 面板 token 必须改成强随机字符串
- 面板端口最好只允许你的 IP 访问
- RCON 和 REST API 不建议直接开放给所有公网 IP
- 第一次开服后立刻修改管理员密码
- 定期备份存档
