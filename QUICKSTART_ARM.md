# Oracle ARM 快速部署

适用于 Oracle Cloud Ampere A1、Ubuntu/Debian ARM64。

## 安装面板

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

## 放行端口

在 Oracle Cloud 安全列表或 NSG 中放行：

| 端口 | 协议 | 用途 |
| --- | --- | --- |
| 19090 | TCP | Web 面板 |
| 8211 | UDP | 玩家进服 |

系统防火墙可执行：

```bash
sudo bash scripts/firewall-ubuntu.sh
```

## 一键开服

首次打开面板后：

1. 创建管理员密码。
2. 打开“控制中心 -> 服务器运维”。
3. 设置服务器名称和强 `AdminPassword`。
4. 点击“部署服务器”。
5. 等待 DepotDownloader、box64 和 Palworld 服务端安装完成。

部署完成后，服务会以 `palworld.service` 运行。面板中可以直接启动、停止、重启、更新、备份、重开世界和卸载。

## 查看状态

```bash
sudo systemctl status palworld-panel
sudo systemctl status palworld
journalctl -u palworld-panel -f
journalctl -u palworld -f
```

安装脚本显示的 `Panel token` 可以直接作为管理认证密码使用。

完整功能和 Docker/Agent 部署说明见 [README.md](README.md)。
