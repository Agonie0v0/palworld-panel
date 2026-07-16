# ARM 服务器快速部署

适合 Oracle Cloud ARM / Ampere A1 / Ubuntu。

## 1. 登录服务器

```bash
ssh ubuntu@你的服务器IP
```

## 2. 安装面板

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

## 3. 放行端口

Oracle Cloud 控制台放行：

| 端口 | 协议 | 用途 |
| --- | --- | --- |
| 8080 | TCP | 面板 |
| 8211 | UDP | 玩家进服 |

服务器本机执行：

```bash
sudo bash scripts/firewall-ubuntu.sh
```

## 4. 打开面板

浏览器访问：

```text
http://你的服务器IP:8080
```

输入安装脚本输出的 `Panel token`。

## 5. 一键部署服务端

在面板里点：

```text
部署 -> 检测 -> 部署 Palworld 服务端
```

ARM 机器会自动安装 `box64`，然后部署 Palworld 官方服务端。

## 6. 启动服务器

在面板里点：

```text
总览 -> 启动
```

如果部署时勾选了“部署完成后自动启动”，这一步可以跳过。

## 7. 修改参数

在面板里点：

```text
参数 -> 修改服务器名、管理员密码、倍率等 -> 保存并写入 -> 总览 -> 重启
```

第一次一定要把 `AdminPassword` 从：

```text
change-admin-password
```

改成你自己的强密码。

## 常用命令

查看面板：

```bash
sudo systemctl status palworld-panel
```

查看服务器：

```bash
sudo systemctl status palworld
```

看日志：

```bash
journalctl -u palworld -f
```
