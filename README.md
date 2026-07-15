# Palworld One-click Panel

一个面向《幻兽帕鲁》1.0 的轻量开服面板：一键启动、停止、重启、更新、备份，并通过 WebUI 调整常用服务器参数。

参考项目：[zaigie/palworld-server-tool](https://github.com/zaigie/palworld-server-tool)

## 当前能力

- WebUI 控制服务器启动、停止、重启、更新、备份
- 查看运行状态、机器架构、端口和内存信息
- 保存常用 `PalWorldSettings.ini` 参数
- 读取 Palworld REST API 数据
- RCON 控制台
- 在线玩家操作：广播、踢出、封禁、保存、平滑关服
- 备份列表、删除、恢复
- 白名单记录管理
- 自动备份、自动广播、备份保留数量
- 存档数据页面：玩家、公会、帕鲁、背包、地图
- 外部 `Level.sav` 解析器挂载接口
- 支持 `systemd` 模式，适合部署在云服务器
- 提供 Oracle Cloud 圣何塞 ARM 机器安装脚本
- 无 npm 第三方依赖，Node.js 18+ 即可运行

## 对标 palworld-server-tool 的功能

参考项目的功能主要来自三类能力：

- 官方 REST API：服务器信息、在线玩家、指标等
- RCON：广播、踢人、封禁、保存、关服、自定义命令等
- `Level.sav` 存档解析：玩家、公会、帕鲁、背包、地图等离线数据

本项目已经内置 REST API、RCON、备份、自动化和管理页面。`Level.sav` 深度解析通过 `server.saveParserCommand` 接入外部解析器：解析器接收存档路径参数，向标准输出返回 JSON，面板会展示在“存档数据”页面。

推荐解析器输出结构：

```json
{
  "players": [],
  "guilds": [],
  "pals": [],
  "inventory": [],
  "map": {}
}
```

## 重要说明：Oracle ARM

Oracle Cloud Ampere A1 是 ARM64 架构，而 Palworld 官方 Linux dedicated server 通常按 x86_64 发布。这个项目的安装脚本会使用 `box64` 在 ARM64 上运行 x86_64 服务端。

这条路线适合个人服和轻量测试，但性能、稳定性和兼容性取决于当前 Palworld 服务端版本、系统镜像和 box64 版本。如果你要做高在线人数服务器，x86_64 云主机会更稳。

## 本地预览面板

```bash
npm start
```

打开：

```text
http://127.0.0.1:8080
```

第一次运行会自动创建：

```text
data/config.json
```

如果 `panel.token` 还是 `change-me`，本地会免登录。部署到公网前必须改掉。

## Oracle Cloud ARM 一键安装

推荐系统：Ubuntu 22.04 或 24.04 ARM64。

把项目上传到服务器后，在项目目录执行：

```bash
sudo PANEL_PORT=8080 bash scripts/install-oci-arm.sh
```

安装完成后会输出：

```text
Panel URL: http://SERVER_PUBLIC_IP:8080
Panel token: ...
```

启动 Palworld 服务端：

```bash
sudo systemctl start palworld
```

查看服务：

```bash
sudo systemctl status palworld
sudo systemctl status palworld-panel
```

## 端口

你需要同时放行云平台安全规则和服务器本机防火墙。

常用端口：

| 端口 | 协议 | 用途 |
| --- | --- | --- |
| 8080 | TCP | WebUI 面板 |
| 8211 | UDP | 玩家连接 |
| 8212 | TCP | Palworld REST API |
| 25575 | TCP | RCON |

Ubuntu 本机防火墙可执行：

```bash
sudo bash scripts/firewall-ubuntu.sh
```

Oracle Cloud 控制台里还需要在 VCN 的 Security List 或 Network Security Group 放行这些端口。

## 配置文件

面板配置在：

```text
data/config.json
```

服务器上默认在：

```text
/opt/palworld-panel/data/config.json
```

关键字段：

- `panel.port`：面板端口
- `panel.token`：面板访问令牌
- `server.settingsPath`：`PalWorldSettings.ini` 路径
- `server.saveDir`：存档目录
- `server.backupDir`：备份目录
- `server.restHost` / `server.restPort`：Palworld REST API 地址
- `server.rconHost` / `server.rconPort`：RCON 地址
- `server.saveParserCommand`：外部存档解析器命令
- `automation.backupIntervalMinutes`：自动备份间隔
- `automation.broadcastIntervalMinutes`：自动广播间隔
- `settings`：WebUI 写入的 Palworld 参数

## 常用管理命令

```bash
sudo systemctl start palworld
sudo systemctl stop palworld
sudo systemctl restart palworld
sudo systemctl restart palworld-panel
```

查看日志：

```bash
journalctl -u palworld -f
journalctl -u palworld-panel -f
```

## 安全建议

- 不要把面板端口直接开放给所有人，最好只允许你的 IP 访问
- `panel.token` 必须改成强随机字符串
- RCON 和 REST API 尽量只监听本机或仅允许可信 IP
- 定期点击面板备份，或额外加定时备份
- 第一次开服后先改管理员密码，再邀请玩家

## 下一步可以扩展

- 接入 RCON 命令窗口
- 读取 Palworld REST API，显示在线玩家和服务器指标
- 加定时备份和自动清理旧备份
- 支持多实例
- 加入 Docker Compose 模式
