# ARM 服务器快速部署

这是给 Oracle Cloud 圣何塞 ARM / Ampere A1 用的最短步骤。

## 1. 登录服务器

```bash
ssh ubuntu@你的服务器IP
```

## 2. 安装项目

如果服务器已经有这个项目目录：

```bash
cd palworld-panel
sudo PANEL_PORT=8080 bash scripts/install-oci-arm.sh
```

如果服务器还没有项目，先克隆：

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel
sudo PANEL_PORT=8080 bash scripts/install-oci-arm.sh
```

安装完成后会显示：

```text
Panel URL: http://SERVER_PUBLIC_IP:8080
Panel token: 一串随机字符
Default admin password: change-admin-password
```

## 3. 放行端口

Oracle Cloud 控制台的安全规则里放行：

| 端口 | 协议 | 用途 |
| --- | --- | --- |
| 8080 | TCP | 面板 |
| 8211 | UDP | 玩家进服 |

服务器本机防火墙执行：

```bash
sudo bash scripts/firewall-ubuntu.sh
```

## 4. 打开面板

浏览器访问：

```text
http://你的服务器IP:8080
```

输入安装脚本输出的 `Panel token`。

## 5. 一键开服

在面板里点：

```text
总览 -> 启动
```

改参数：

```text
参数 -> 修改服务器名称、管理员密码、倍率等 -> 保存并写入 -> 总览 -> 重启
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
