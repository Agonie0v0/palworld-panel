import json

import aiohttp

from astrbot.api.event import AstrMessageEvent, filter
from astrbot.api.star import Context, Star, register


@register(
    "palworld_panel",
    "Agonie0v0",
    "Palworld Panel binding, points, breeding, and one-time login",
    "1.1.0",
)
class PalworldPanelPlugin(Star):
    def __init__(self, context: Context, config):
        super().__init__(context)
        self.base_url = str(config.get("panel_url", "")).rstrip("/")
        self.api_key = str(config.get("api_key", ""))
        self.timeout = int(config.get("timeout_seconds", 15))
        raw_admins = config.get("admin_qqs", [])
        if isinstance(raw_admins, str):
            raw_admins = raw_admins.replace("，", ",").split(",")
        self.admin_qqs = {str(value).strip() for value in raw_admins if str(value).strip()}

    async def request(self, method, path, payload=None):
        if not self.base_url or not self.api_key:
            raise RuntimeError("请先在插件设置中填写面板地址和 integration API Key")
        headers = {"Authorization": f"Bearer {self.api_key}"}
        timeout = aiohttp.ClientTimeout(total=self.timeout)
        async with aiohttp.ClientSession(timeout=timeout, headers=headers) as session:
            async with session.request(method, f"{self.base_url}{path}", json=payload) as response:
                data = await response.json(content_type=None)
                if response.status >= 400 or not data.get("ok", False):
                    raise RuntimeError(data.get("error") or f"面板请求失败: HTTP {response.status}")
                return data

    @staticmethod
    def qq(event: AstrMessageEvent):
        return str(event.get_sender_id())

    @filter.command("帕鲁在线")
    async def online_players(self, event: AstrMessageEvent):
        try:
            data = await self.request("GET", "/api/advanced/astrbot/players")
            players = data.get("players", [])
            if not players:
                yield event.plain_result("当前没有在线玩家")
                return
            lines = [f"{row.get('name') or row['playerId']}  {row['playerId']}" for row in players]
            yield event.plain_result("在线玩家:\n" + "\n".join(lines))
        except Exception as error:
            yield event.plain_result(str(error))

    @filter.command("帕鲁绑定")
    async def bind(self, event: AstrMessageEvent, player_id: str):
        try:
            data = await self.request(
                "POST",
                "/api/advanced/astrbot/challenges",
                {"qq": self.qq(event), "playerId": player_id},
            )
            expires = data["challenge"]["expiresAt"]
            yield event.plain_result(f"验证码已发送到游戏内，过期时间戳: {expires}\n请发送: /帕鲁验证 6位验证码")
        except Exception as error:
            yield event.plain_result(str(error))

    @filter.command("帕鲁验证")
    async def verify(self, event: AstrMessageEvent, code: str):
        try:
            data = await self.request(
                "POST",
                "/api/advanced/astrbot/verify",
                {"qq": self.qq(event), "code": code},
            )
            yield event.plain_result(f"绑定成功: {data['binding']['playerId']}")
        except Exception as error:
            yield event.plain_result(str(error))

    @filter.command("帕鲁签到")
    async def check_in(self, event: AstrMessageEvent):
        try:
            data = await self.request(
                "POST",
                "/api/advanced/astrbot/check-in",
                {"qq": self.qq(event)},
            )
            account = data["account"]
            if account.get("alreadyCheckedIn"):
                yield event.plain_result(f"今天已经签到，当前积分: {account['points']}")
            else:
                yield event.plain_result(f"签到成功，获得 {account['reward']} 积分，当前积分: {account['points']}")
        except Exception as error:
            yield event.plain_result(str(error))

    @filter.command("帕鲁积分")
    async def points(self, event: AstrMessageEvent):
        try:
            data = await self.request(
                "GET",
                f"/api/advanced/astrbot/account?qq={self.qq(event)}",
            )
            account = data["account"]
            binding = account.get("binding")
            yield event.plain_result(
                f"积分: {account['points']}\n绑定: {binding['playerId'] if binding else '未绑定'}\n最后签到: {account.get('lastCheckIn') or '-'}"
            )
        except Exception as error:
            yield event.plain_result(str(error))

    @filter.command("帕鲁配种")
    async def breeding(self, event: AstrMessageEvent, target: str, max_steps: int = 4):
        try:
            data = await self.request(
                "POST",
                "/api/advanced/astrbot/solve",
                {"qq": self.qq(event), "target": target, "maxSteps": max_steps},
            )
            result = data["result"]
            if result.get("owned"):
                summary = "目标帕鲁已在当前存档中拥有"
            elif not result.get("tree"):
                summary = "在指定代数内没有找到路线"
            else:
                summary = json.dumps(result["tree"], ensure_ascii=False)
            yield event.plain_result(f"剩余积分: {data['points']}\n{summary}")
        except Exception as error:
            yield event.plain_result(str(error))

    @filter.command("帕鲁面板")
    async def login_link(self, event: AstrMessageEvent):
        try:
            data = await self.request(
                "POST",
                "/api/advanced/astrbot/login-link",
                {"qq": self.qq(event)},
            )
            yield event.plain_result(f"一次性只读面板链接:\n{data['url']}")
        except Exception as error:
            yield event.plain_result(str(error))

    @filter.command("帕鲁管理")
    async def admin(self, event: AstrMessageEvent, action: str, target_qq: str, value: str = ""):
        if self.qq(event) not in self.admin_qqs:
            yield event.plain_result("没有管理员权限")
            return
        action_map = {
            "绑定": "bind",
            "解绑": "unbind",
            "冻结": "freeze",
            "解冻": "unfreeze",
            "积分": "adjust",
            "bind": "bind",
            "unbind": "unbind",
            "freeze": "freeze",
            "unfreeze": "unfreeze",
            "points": "adjust",
        }
        normalized = action_map.get(action.lower())
        if not normalized:
            yield event.plain_result("用法: /帕鲁管理 <绑定|解绑|冻结|解冻|积分> <QQ> [玩家ID或积分变化]")
            return
        payload = {"action": normalized, "qq": target_qq, "actorQq": self.qq(event)}
        if normalized == "bind":
            payload["playerId"] = value
        elif normalized == "adjust":
            try:
                payload["change"] = int(value)
            except ValueError:
                yield event.plain_result("积分变化必须是整数，例如 +10 或 -5")
                return
            payload["reason"] = f"AstrBot admin {self.qq(event)}"
        try:
            data = await self.request("POST", "/api/advanced/astrbot/accounts/manage", payload)
            account = data["account"]
            binding = account.get("binding")
            yield event.plain_result(
                f"操作完成\nQQ: {account['qq']}\n绑定: {binding['playerId'] if binding else '未绑定'}\n积分: {account['points']}\n状态: {'冻结' if account.get('frozen') else '正常'}"
            )
        except Exception as error:
            yield event.plain_result(str(error))
