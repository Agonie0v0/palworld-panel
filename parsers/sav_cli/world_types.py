# SPDX-License-Identifier: Apache-2.0
# Derived from zaigie/palworld-server-tool sav_cli @ fb45624 (Apache-2.0).
# Runtime deps (palsav-flex/palooz/ooz) are GPL-3.0-or-later, so a Docker image
# built from the root Dockerfile includes these runtime components.
"""Structured player / pal / guild / base-camp views over a decoded Palworld
1.0 save.

These classes take the *fully decoded* palsav property trees (see
``structurer.py``) and flatten them into the JSON shape that
palworld-server-tool's backend consumes (``/player`` and ``/guild`` PUTs).

Field access paths were verified against real v1.0.0.100427 saves:

* HP is stored under ``Hp`` as a ``FixedPoint64`` struct whose integer lives at
  ``Hp.value.Value.value``.
* ``Level`` / talent / rank values are ``ByteProperty`` with the number nested
  at ``.value.value``.
* ``MaxHP`` / ``ShieldMaxHP`` / ``MaxSP`` are not persisted in 1.0 player saves
  (they are recomputed at runtime), so they default to 0 here.
"""

import datetime


ZERO_GUID = "00000000-0000-0000-0000-000000000000"


def _scalar_value(prop, default=None):
    """Unwrap the ``value`` layers used by palsav scalar properties.

    Property values are normally wrapped once, while Byte/Enum values have an
    additional typed wrapper.  Keep this deliberately conservative: a dict
    without a ``value`` member is not a scalar and therefore resolves to the
    caller's default instead of leaking a parser-internal object into JSON.
    """
    value = prop
    for _ in range(8):
        if value is None:
            return default
        if not isinstance(value, dict):
            return value
        if "value" not in value:
            return default
        value = value["value"]
    return default


def _optional_int(prop, default=None):
    value = _scalar_value(prop, default)
    if value is default or isinstance(value, bool):
        return default
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return default


def _optional_float(prop, default=None):
    value = _scalar_value(prop, default)
    if value is default or isinstance(value, bool):
        return default
    try:
        return float(value)
    except (TypeError, ValueError, OverflowError):
        return default


def _optional_bool(prop, default=None):
    value = _scalar_value(prop, default)
    if value is default:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1"}:
            return True
        if normalized in {"false", "0"}:
            return False
    return default


def _optional_string(prop, default=None):
    value = _scalar_value(prop, default)
    return value if isinstance(value, str) else default


def hexuid_to_decimal(uid):
    """First 8 hex chars of a UID -> decimal string.

    palsav yields its own ``archive.UUID`` type (not ``uuid.UUID``); stringifying
    always gives the canonical ``xxxxxxxx-....`` form, so taking the first
    hyphen-separated segment works for both palsav UUIDs and plain strings.
    """
    if uid is None:
        return ""
    hex_part = str(uid).split("-")[0]
    return str(int(hex_part, 16))


def _fixed_point(struct):
    """Extract the integer out of a FixedPoint64 HP/shield struct."""
    if not struct:
        return 0
    try:
        value_struct = struct["value"]
        return _optional_int(value_struct["Value"], 0)
    except (KeyError, TypeError):
        return 0


def _byte_value(prop, default=0):
    """Extract the number from a ByteProperty (value nested one level)."""
    return _optional_int(prop, default)


def _enum_value(prop, default=""):
    value = _scalar_value(prop, default)
    if not isinstance(value, str):
        return default
    return value.split("::")[-1]


def _list_values(prop):
    if not prop:
        return []
    value = prop
    for _ in range(8):
        if not isinstance(value, dict):
            break
        if "values" in value:
            value = value["values"]
            break
        if "value" not in value:
            return []
        value = value["value"]
    return list(value) if isinstance(value, (list, tuple)) else []


def _work_suitability_add_ranks(prop):
    """Return permanent work-suitability bonuses keyed by enum suffix."""
    result = {}
    for raw_row in _list_values(prop):
        row = raw_row
        for _ in range(8):
            if not isinstance(row, dict):
                break
            if "WorkSuitability" in row or "Rank" in row:
                break
            if "value" not in row:
                break
            row = row["value"]
        if not isinstance(row, dict):
            continue
        work = _enum_value(row.get("WorkSuitability"), None)
        rank = _optional_int(row.get("Rank"), None)
        if work and rank is not None:
            result[work] = rank
    return result


def _work_suitability_levels(*props):
    """Extract an explicit per-Pal work-suitability level map when present.

    Most saves only persist the species baseline plus
    ``GotWorkSuitabilityAddRankList`` bonuses. Newer/alternate save layouts
    may also include a list with the complete level for each Pal.
    """
    result = {}
    for prop in props:
        for raw_row in _list_values(prop):
            row = raw_row
            for _ in range(8):
                if not isinstance(row, dict):
                    break
                if any(key in row for key in ("WorkSuitability", "Suitability", "Id", "ID")):
                    break
                if "value" not in row:
                    break
                row = row["value"]
            if not isinstance(row, dict):
                continue
            work = _enum_value(
                row.get("WorkSuitability")
                or row.get("Suitability")
                or row.get("Id")
                or row.get("ID"),
                None,
            )
            level = _optional_int(
                row.get("Level") or row.get("Rank") or row.get("Value"),
                None,
            )
            if work and work != "None" and level is not None and level > 0:
                result[work] = level
    return result


def tick2local(tick, real_date_time_ticks, filetime):
    ts = filetime + (tick - real_date_time_ticks) / 1e7
    t = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ%z").replace("+0000", "")


class Player:
    def __init__(self, uid, data):
        self.player_uid = hexuid_to_decimal(uid)
        self.nickname = data["NickName"]["value"] if data.get("NickName") else ""
        self.level = _byte_value(data.get("Level"), 1)
        self.exp = int(data["Exp"]["value"]) if data.get("Exp") else 0
        self.hp = _fixed_point(data.get("Hp"))
        self.max_hp = _fixed_point(data.get("MaxHP"))
        self.shield_hp = _fixed_point(data.get("ShieldHP"))
        self.shield_max_hp = _fixed_point(data.get("ShieldMaxHP"))
        self.max_status_point = _fixed_point(data.get("MaxSP"))
        self.status_point = {
            s["StatusName"]["value"]: s["StatusPoint"]["value"]
            for s in data["GotStatusPointList"]["value"]["values"]
        } if data.get("GotStatusPointList") else {}
        full_stomach = (
            float(data["FullStomach"]["value"]) if data.get("FullStomach") else 0
        )
        self.full_stomach = round(full_stomach, 2)
        self.pals = []
        self.items = (
            data["Items"]
            if data.get("Items") is not None
            else {
                "CommonContainerId": [],
                "DropSlotContainerId": [],
                "EssentialContainerId": [],
                "FoodEquipContainerId": [],
                "PlayerEquipArmorContainerId": [],
                "WeaponLoadOutContainerId": [],
            }
        )

        self.__order = [
            "player_uid",
            "nickname",
            "level",
            "exp",
            "hp",
            "max_hp",
            "shield_hp",
            "shield_max_hp",
            "max_status_point",
            "status_point",
            "full_stomach",
            "pals",
            "items",
        ]

    def to_dict(self):
        return {attr: getattr(self, attr) for attr in self.__order}


class Pal:
    def __init__(self, data, real_date_time_ticks, filetime, instance_id=""):
        self.instance_id = str(instance_id or "")
        owner_prop = data.get("OwnerPlayerUId") or {}
        owner = owner_prop.get("value") if isinstance(owner_prop, dict) else owner_prop
        self.owner = "" if owner in (None, "", ZERO_GUID) else hexuid_to_decimal(owner)
        self.nickname = data["NickName"]["value"] if data.get("NickName") else ""
        self.level = _byte_value(data.get("Level"), 1)
        self.exp = int(data["Exp"]["value"]) if data.get("Exp") else 0
        self.hp = _fixed_point(data.get("Hp"))
        self.max_hp = _fixed_point(data.get("MaxHP"))
        self.gender = (
            data["Gender"]["value"]["value"].split("::")[-1]
            if data.get("Gender")
            else "Unknow"
        )
        self.is_lucky = data["IsRarePal"]["value"] if data.get("IsRarePal") else False
        self.is_boss = False

        if data.get("CharacterID"):
            typename = data["CharacterID"]["value"]
            typename_upper = typename.upper()
            if typename_upper[:5] == "BOSS_":
                typename_upper = typename_upper.replace("BOSS_", "")
                self.is_boss = not self.is_lucky
            self.is_tower = typename_upper.startswith("GYM_")
            self.type = typename
        else:
            self.is_tower = False
            self.type = "Unknow"

        self.workspeed = _byte_value(data.get("CraftSpeed"), 0)
        self.melee = _byte_value(data.get("Talent_HP"), 0)
        self.ranged = _byte_value(data.get("Talent_Shot"), 0)
        self.defense = _byte_value(data.get("Talent_Defense"), 0)
        self.rank = _byte_value(data.get("Rank"), 1)
        self.rank_up_exp = _optional_int(data.get("RankUpExp"), None)
        self.friendship_point = _optional_int(data.get("FriendshipPoint"), None)
        self.is_awakening = _optional_bool(data.get("bIsAwakening"), None)
        self.rank_attack = _byte_value(data.get("Rank_Attack"), 0)
        self.rank_defence = _byte_value(data.get("Rank_Defence"), 0)
        self.rank_craftspeed = _byte_value(data.get("Rank_CraftSpeed"), 0)
        self.rank_hp = _optional_int(data.get("Rank_HP"), None)
        self.favorite_index = _optional_int(data.get("FavoriteIndex"), None)
        favorite_flags = [
            value
            for value in (
                self.favorite_index > 0 if self.favorite_index is not None else None,
                _optional_bool(data.get("IsFavoritePal"), None),
                _optional_bool(data.get("bIsFavoritePal"), None),
            )
            if value is not None
        ]
        self.is_favorite_pal = any(favorite_flags) if favorite_flags else None
        self.physical_health = _enum_value(data.get("PhysicalHealth"), None)
        self.pal_revive_timer = _optional_float(data.get("PalReviveTimer"), None)
        self.skin_name = _optional_string(data.get("SkinName"), None)
        self.work_suitability_add_rank = _work_suitability_add_ranks(
            data.get("GotWorkSuitabilityAddRankList")
        )
        work_options = data.get("WorkSuitabilityOptionInfo")
        option_value = work_options.get("value", {}) if isinstance(work_options, dict) else {}
        self.work_suitabilities = _work_suitability_levels(
            data.get("WorkSuitabilityList"),
            data.get("WorkSuitabilityLevelList"),
            data.get("WorkSuitabilities"),
            option_value.get("WorkSuitabilityList") if isinstance(option_value, dict) else None,
            option_value.get("WorkSuitabilityLevelList") if isinstance(option_value, dict) else None,
        )
        self.skills = (
            data["PassiveSkillList"]["value"]["values"]
            if data.get("PassiveSkillList")
            else []
        )
        self.equipped_skills = [
            str(skill).split("::")[-1]
            for skill in _list_values(data.get("EquipWaza"))
        ]
        self.mastered_skills = [
            str(skill).split("::")[-1]
            for skill in _list_values(data.get("MasteredWaza"))
        ]
        full_stomach = (
            float(data["FullStomach"]["value"]) if data.get("FullStomach") else 0
        )
        self.full_stomach = round(full_stomach, 2)
        self.sanity = (
            round(float(data["SanityValue"]["value"]), 2)
            if data.get("SanityValue")
            else 100
        )
        self.current_work_suitability = _enum_value(data.get("CurrentWorkSuitability"))
        self.base_worker_event = _enum_value(data.get("BaseCampWorkerEventType"))
        self.worker_sick = _enum_value(data.get("WorkerSick"))
        work_options = data.get("WorkSuitabilityOptionInfo")
        option_value = work_options.get("value", {}) if isinstance(work_options, dict) else {}
        self.disabled_work = [
            str(item).split("::")[-1]
            for item in _list_values(option_value.get("OffWorkSuitabilityList"))
        ]

        self.__order = [
            "instance_id",
            "owner",
            "nickname",
            "level",
            "exp",
            "hp",
            "max_hp",
            "type",
            "gender",
            "is_lucky",
            "is_boss",
            "is_tower",
            "workspeed",
            "melee",
            "ranged",
            "defense",
            "rank",
            "rank_up_exp",
            "friendship_point",
            "is_awakening",
            "rank_hp",
            "rank_attack",
            "rank_defence",
            "rank_craftspeed",
            "favorite_index",
            "is_favorite_pal",
            "physical_health",
            "pal_revive_timer",
            "skin_name",
            "work_suitability_add_rank",
            "work_suitabilities",
            "skills",
            "equipped_skills",
            "mastered_skills",
            "full_stomach",
            "sanity",
            "current_work_suitability",
            "base_worker_event",
            "worker_sick",
            "disabled_work",
        ]

    def to_dict(self):
        return {attr: getattr(self, attr) for attr in self.__order}


class Guild:
    def __init__(self, data, real_date_time_ticks, filetime):
        self.name = data["guild_name"]
        self.base_camp_level = data["base_camp_level"]
        self.admin_player_uid = hexuid_to_decimal(data["admin_player_uid"])
        self.players = [
            {
                "player_uid": hexuid_to_decimal(player["player_uid"]),
                "nickname": player["player_info"]["player_name"],
                "last_online": (
                    tick2local(
                        player["player_info"]["last_online_real_time"],
                        real_date_time_ticks,
                        filetime,
                    )
                    if player["player_info"].get("last_online_real_time")
                    else ""
                ),
            }
            for player in data.get("players", [])
        ]
        self.base_ids = [hexuid_to_decimal(x) for x in data.get("base_ids", [])]
        self.base_camp = []
        self.__order = [
            "name",
            "base_camp_level",
            "admin_player_uid",
            "players",
            "base_ids",
            "base_camp",
        ]

    def to_dict(self):
        return {attr: getattr(self, attr) for attr in self.__order}


class BaseCamp:
    def __init__(self, data):
        self.id = hexuid_to_decimal(data["id"])
        self.state = data["state"]
        self.transform = {
            "x": data["transform"]["translation"]["x"],
            "y": data["transform"]["translation"]["y"],
            "z": data["transform"]["translation"]["z"],
            "rotation": {
                "x": data["transform"]["rotation"]["x"],
                "y": data["transform"]["rotation"]["y"],
                "z": data["transform"]["rotation"]["z"],
                "w": data["transform"]["rotation"]["w"],
            },
        }
        self.area_range = data["area_range"]
        self.group_id_belong_to = hexuid_to_decimal(data["group_id_belong_to"])
        self.owner_map_object_instance_id = hexuid_to_decimal(
            data["owner_map_object_instance_id"]
        )
        self.__order = [
            "id",
            "state",
            "transform",
            "area_range",
            "group_id_belong_to",
            "owner_map_object_instance_id",
        ]

    def to_dict(self):
        return {attr: getattr(self, attr) for attr in self.__order}
