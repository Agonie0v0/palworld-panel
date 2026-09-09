# Palworld Panel · 幻兽帕鲁 Web 管理面板

<div align="center">

[![Release](https://img.shields.io/github/v/release/Agonie0v0/palworld-panel?label=release&color=00e5a3)](https://github.com/Agonie0v0/palworld-panel/releases)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#许可证与致谢)
[![Tests](https://img.shields.io/badge/tests-84%2F84%20passing-success.svg)](test/)
[![Security](https://img.shields.io/badge/security-audited%200%20vulns-brightgreen.svg)](#安全加固规范)

<p align="center">
  <b>面向幻兽帕鲁（Palworld）专用服务器的高性能全功能 Web 运维管理面板</b><br>
  整合服务器实时概览、据点帕鲁状态监控、全服库存与资产检索、自动容灾与自愈守护、参数可视化调优与跨端移动适配。
</p>

[✨ 核心特性](#-核心特性) • [📸 实机预览](#-实机预览) • [🚀 快速开始](#-快速开始) • [📡 架构与端口](#-架构与端口分配) • [🛡️ 安全加固](#-安全加固规范) • [💻 本地开发与测试](#-本地开发与验证)

</div>

---

## 📸 实机预览

> 生产环境实机运行截图，采用高对比度暗黑主题与流畅交互设计。

### 🖥️ 桌面端管理工作台

<div align="center">
  <p><b>服务器概览与据点帕鲁状态</b></p>
  <img src="docs/screenshots/desktop-overview.png" alt="桌面端概览与据点帕鲁" width="98%" style="border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</div>

<br>

<div align="center">
  <table width="100%">
    <tr>
      <td width="50%" align="center">
        <b>据点帕鲁状态与工作适性检索</b><br><br>
        <img src="docs/screenshots/desktop-pal-status.png" alt="桌面端帕鲁状态" width="100%" style="border-radius: 6px;" />
      </td>
      <td width="50%" align="center">
        <b>全服库存穿透与公会/背包容器定位</b><br><br>
        <img src="docs/screenshots/desktop-inventory.png" alt="桌面端全服库存" width="100%" style="border-radius: 6px;" />
      </td>
    </tr>
  </table>
</div>

### 📱 移动端管理视图

<div align="center">
  <table width="100%">
    <tr>
      <td width="33%" align="center">
        <b>移动端·服务器概览</b><br><br>
        <img src="docs/screenshots/mobile-overview.png" alt="移动端概览" width="90%" style="border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.4);" />
      </td>
      <td width="33%" align="center">
        <b>移动端·帕鲁状态</b><br><br>
        <img src="docs/screenshots/mobile-pal-status.png" alt="移动端帕鲁状态" width="90%" style="border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.4);" />
      </td>
      <td width="33%" align="center">
        <b>移动端·全服库存</b><br><br>
        <img src="docs/screenshots/mobile-inventory.png" alt="移动端全服库存与工具" width="90%" style="border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.4);" />
      </td>
    </tr>
  </table>
</div>

---

## ✨ 核心特性

- 🎛️ **现代暗黑界面与流畅交互 (Modern Dashboard & UX)**
  - 工业级高对比度暗黑界面与呼吸状态指示灯，实时监控服务器状态、FPS、网络延迟与主机负载（CPU / 内存 / 磁盘）。
  - 基于触感微交互美学打磨的弹簧过渡动效与毛玻璃质感，全屏与自适应响应式设计。
- 🐾 **据点帕鲁状态监控 (Base Pal Monitoring)**
  - 实时解析全地图所有据点的帕鲁工作分布、设施作业、饱食度与 SAN 心理状态。
  - 完整呈现 12 种工作适性等级、主动技能与正/负/金/彩虹词条层级展示。
  - 集成**离线物资产出评估**，计算服务离线期间基地设施的物资吞吐估算。
- 📦 **全服库存与资产检索 (Global Inventory & World Radar)**
  - 快速深度遍历全图公会箱、个人背包、地面掉落与容器，支持按分类、关键词与坐标精准追踪。
  - 世界地图联动：传送点、地下城、头目 Boss 刷新、油田钻机点与公会据点范围清晰标绘。
- 🛡️ **高可用自愈守护与自动容灾 (Autonomous Watchdog & Resilience)**
  - **内存泄漏熔断预警**：连续多次超额即平滑执行维护备份并热重启。
  - **异常宕机自动拉起**：检测服务端响应中断并自动恢复服务进程。
  - **滚动备份与异地容灾**：自动化计划快照、校验下载、一键恢复，并支持 WebDAV 远程同步。
  - **游戏内广播联动**：玩家进服/离服全局提示、维护前秒级倒计时通告。
- ⚙️ **可视化配置生成器 (Visual Pal Configurator)**
  - 内置带强类型校验、数值安全范围与枚举约束的配置编辑器。
  - 无缝生成与双向转换 `PalWorldSettings.ini` 与 `WorldOption.sav`。
- 🌐 **多模式弹性部署 (Universal Deployment)**
  - **systemd 原生守护**：Linux 服务原生管理，零容器开销，轻量高效。
  - **Docker Compose V2**：全隔离容器化交付，持久化卷映射，随拆随建。
  - **远程 Agent 架构**：面板管理端与游戏服务器跨主机分离，保障管理网络零信任。

---

## 🚀 快速开始

### 方案 A：Ubuntu / Debian 原生一键部署 (推荐)

运行自动化安装脚本，一键配置 Node.js 运行时、存档解析器与 systemd 后台守护：

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel
sudo PANEL_PORT=19090 bash scripts/install-panel.sh
```

- 安装完成后，在浏览器中打开 `http://服务器公网IP:19090`。
- 首次访问请记录控制台输出的随机高强度 `PANEL_TOKEN`，用于主管理员认证与紧急恢复。

### 方案 B：Docker Compose 容器化部署

```bash
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel/deploy
export PANEL_TOKEN="生成一段随机长字符串作为管理令牌"
docker compose up -d --build
```

- 面板数据与历史备份自动挂载到本地 Docker Volume。

### 方案 C：跨主机远程 Agent 部署

当面板服务器与 Palworld 游戏物理机分离时，在**游戏服务器**上运行：

```bash
git clone https://github.com/Agonie0v0/palworld-panel.git
cd palworld-panel
sudo AGENT_PORT=8081 bash scripts/install-agent.sh
```

- 在管理面板后台导航至「服务器运维 → Agent 分离部署」，输入远程 Agent 地址与专属交互 Token 即可完成纳管。

---

## 📡 架构与端口分配

Palworld Panel 遵循三维数据源解耦原则：
1. **REST API**：提供轻量实时的服务器在线状态、帧率与当前在线玩家列表。
2. **RCON 通道**：提供低延迟管理指令、热踢出/封禁与富文本游戏内广播。
3. **存档解析引擎**：以只读模式解析世界快照，还原据点、帕鲁、公会、背包与地块坐标。

| 端口 | 协议 | 适用组件 | 网络暴露建议 |
| :--- | :--- | :--- | :--- |
| **`19090`** | TCP | Web 管理面板 | 推荐配合 Nginx / Caddy 部署反向代理并启用 HTTPS |
| **`8211`** | UDP | Palworld 游戏客户端连接端口 | 对公网完全开放 |
| **`25575`** | TCP | Palworld RCON 管理端口 | 仅对 `127.0.0.1` 或内网安全组开放 |
| **`8212`** | TCP | Palworld 官方 REST API | 仅对 `127.0.0.1` 或内网安全组开放 |
| **`8081`** | TCP | 跨机远程同步 Agent | 仅放行控制面板所在主机的源 IP |

---

## 🛡️ 安全加固规范

当前发布版（`v1.2.0`）已完成深度源码级安全加固：

1. **常数时间令牌鉴权 (Constant-Time Verification)**
   - 静态管理 Token 及 API 凭证校验全面采用 `crypto.timingSafeEqual` 进行恒定时间比较，彻底阻断时序侧信道（Timing Attack）窃取令牌。
2. **路径穿越严格边界收敛 (Strict Path Containment)**
   - 静态资源托管（`serveStatic`）与备份下载（`safeBackupPath`）改写为基于 `path.relative` 的向上穿越检测，严格限定文件访问必须位于根目录范围内，防御符号链接与前缀截断绕过。
3. **零漏洞供应链审计 (Zero CVE / GHSA)**
   - 依赖项全面锁定，针对解压组件 `yauzl` 升级至最新安全版本（`^3.4.0`），通过 `npm audit` 零高危零中危认证。
4. **双向防呆与破坏性操作二次确认**
   - 针对服务器关机、世界存档重置、跨服覆盖等高危行为强制实施服务端与客户端双重确认提示。

---

## 🔄 升级与维护

### systemd 部署平滑升级

```bash
cd /opt/palworld-panel
git pull --ff-only
sudo PANEL_DIR=/opt/palworld-panel PANEL_PORT=19090 bash scripts/install-panel.sh
sudo systemctl status palworld-panel
```

*面板现有 `data/config.json` 与历史备份配置将完整保留。*

### Docker 容器平滑升级

```bash
cd /opt/palworld-panel/deploy
git pull --ff-only
docker compose down
docker compose up -d --build
```

---

## 💻 本地开发与验证

本项目具备完整的前后端分层测试体系：

```bash
# 1. 安装后端与前端依赖
npm install
pnpm --dir upstream-web install

# 2. 运行语法检查与全量自动化测试
npm run check
npm test              # 运行后端 47 项集成/单元测试
npm run test:web      # 运行前端 37 项组件测试
# 全部 84 项测试保证 100% 通过通过率

# 3. 构建全量静态前端产物 (含 pal-conf 配置器)
npm run build:web

# 4. 本地热重载开发启动
npm start             # 启动后端 (默认端口 19090)
cd upstream-web && pnpm dev
```

---

## 📂 项目结构指南

```text
palworld-panel/
├── src/                    # Node.js 面板核心：API 路由、RCON 桥接、鉴权与兼容层
├── upstream-web/           # Vue 3 + Vite + Pinia + Naive UI 现代化管理前端
│   ├── src/components/     # 帕鲁监控、全服库存、地图雷达等核心工作区组件
│   └── src/views/          # 桌面端 (PcHome) 与移动端 (MobileHome) 视图入口
├── vendor/pal-conf/        # 内置可视化服务器参数生成器
├── parsers/sav_cli/        # 高性能世界存档解算适配器
├── scripts/                # 自动化部署、Agent 构建与图鉴同步脚本
├── deploy/                 # Docker Compose 生产化部署编排配置
├── systemd/                # Linux systemd 服务守护模板
├── test/                   # 后端自动化测试套件
└── docs/screenshots/       # 生产环境实机高清截图资产
```

---

## 📜 许可证与致谢

- 本项目遵循 [MIT 许可证](LICENSE) 开源。
- 感谢以下优秀开源项目的启发与底层支持：
  - [zaigie/palworld-server-tool](https://github.com/zaigie/palworld-server-tool)：功能生态与兼容体验设计参考
  - [Bluefissure/pal-conf](https://github.com/Bluefissure/pal-conf)：出色的 Palworld 参数配置生成器 (MIT License)
  - [deafdudecomputers/PalworldSaveTools](https://github.com/deafdudecomputers/PalworldSaveTools)：高效的存档解析核心实现

> **Palworld Panel** 现已进入正式发布阶段，感谢所有 Palworld 服主与社区玩家的支持！
