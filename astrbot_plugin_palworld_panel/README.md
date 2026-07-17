# AstrBot Palworld Panel Plugin

Install this directory as a local AstrBot plugin. In the plugin settings, set:

- `panel_url`: the externally reachable panel URL.
- `api_key`: an API key created in the panel with the `Bot integration` role.
- `admin_qqs`: QQ accounts allowed to use the administrator command. Add the
  same QQ accounts in the panel's AstrBot settings.

Commands:

Player binding codes are delivered through a short-lived RCON server announcement, so all online players can see the announcement.

- `/帕鲁在线`
- `/帕鲁绑定 <PlayerID>`
- `/帕鲁验证 <6位验证码>`
- `/帕鲁签到`
- `/帕鲁积分`
- `/帕鲁配种 <InternalName> [最大代数]`
- `/帕鲁面板`
- `/帕鲁管理 <绑定|解绑|冻结|解冻|积分> <QQ> [玩家ID或积分变化]`
