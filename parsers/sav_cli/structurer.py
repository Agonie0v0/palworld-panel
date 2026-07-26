# SPDX-License-Identifier: Apache-2.0
# Derived from zaigie/palworld-server-tool sav_cli @ fb45624 (Apache-2.0).
# Runtime deps (palsav-flex/palooz/ooz) are GPL-3.0-or-later, so a Docker image
# built from the root Dockerfile includes these runtime components.
"""Decode a Palworld 1.0 save and structure it into player / guild JSON.

It uses the ``palsav`` parser from PalworldSaveTools, which ships Palworld 1.0
mappings (GroupSaveDataMap / character / item-container decoders) plus Oodle
(``PlM1``) decompression via the native ``palooz`` module.

The parser performs a full decode. A ~260KB compressed / ~4MB decompressed
Level.sav completes in a couple of seconds on the validated fixtures.
"""

import os
import struct
import uuid

from palsav.core import decompress_sav_to_gvas
from palsav.gvas import GvasFile
from palsav.paltypes import PALWORLD_TYPE_HINTS, PALWORLD_CUSTOM_PROPERTIES

from world_types import Player, Pal, Guild, BaseCamp, hexuid_to_decimal
from logger import log

# Global state shared by the current decode helpers.
wsd = None
gvas_file = None

PLAYER_CONTAINER_KEYS = [
    "CommonContainerId",
    "DropSlotContainerId",
    "EssentialContainerId",
    "FoodEquipContainerId",
    "PlayerEquipArmorContainerId",
    "WeaponLoadOutContainerId",
]

ZERO_GUID = "00000000-0000-0000-0000-000000000000"

WORK_BASE_TYPES = {
    "Progress",
    "TransportItemInBaseCamp",
    "ReviveCharacter",
    "LevelObject",
    "Repair",
    "Defense",
    "BootUp",
    "OnlyJoin",
    "OnlyJoinAndWalkAround",
    "RemoveMapObjectEffect",
    "MonsterFarm",
}

WORKER_EVENT_LABELS = {
    "DodgeWork": "偷懒",
    "DodgeWork_Sleep": "偷懒睡觉",
    "DodgeWork_Short": "短暂休息",
}

WORKER_SICK_LABELS = {
    "Cold": "感冒",
    "Sprain": "扭伤",
    "GastricUlcer": "胃溃疡",
    "Fracture": "骨折",
    "Weakness": "虚弱",
    "Depression": "抑郁",
    "DepressionSprain": "抑郁",
    "OverEating": "暴食症",
    "Overfull": "暴食症",
}

WORK_SUITABILITY_LABELS = {
    "EmitFlame": "生火",
    "Watering": "浇水",
    "Seeding": "播种",
    "GenerateElectricity": "发电",
    "Handcraft": "手工作业",
    "Collection": "采集",
    "Deforest": "伐木",
    "Mining": "采矿",
    "OilExtraction": "采油",
    "ProductMedicine": "制药",
    "Cool": "冷却",
    "Transport": "搬运",
    "MonsterFarm": "牧场",
}


class SaveBinaryReader:
    def __init__(self, data):
        self.data = memoryview(bytes(data))
        self.offset = 0

    def _read(self, size):
        if self.offset + size > len(self.data):
            raise ValueError("binary payload ended unexpectedly")
        chunk = self.data[self.offset:self.offset + size]
        self.offset += size
        return chunk

    def byte(self):
        return self._read(1)[0]

    def i32(self):
        return struct.unpack("<i", self._read(4))[0]

    def u32(self):
        return struct.unpack("<I", self._read(4))[0]

    def double(self):
        return struct.unpack("<d", self._read(8))[0]

    def float(self):
        return struct.unpack("<f", self._read(4))[0]

    def guid(self):
        return str(uuid.UUID(bytes_le=bytes(self._read(16)))).lower()

    def fstring(self):
        length = self.i32()
        if length == 0:
            return ""
        if length > 0:
            raw = bytes(self._read(length))
            if raw.endswith(b"\x00"):
                raw = raw[:-1]
            return raw.decode("utf-8", errors="replace")
        raw = bytes(self._read(abs(length) * 2))
        if raw.endswith(b"\x00\x00"):
            raw = raw[:-2]
        return raw.decode("utf-16-le", errors="replace")

    def vector(self):
        return {"x": self.double(), "y": self.double(), "z": self.double()}

    def quat(self):
        return {
            "x": self.double(),
            "y": self.double(),
            "z": self.double(),
            "w": self.double(),
        }

    def ftransform(self):
        return {
            "rotation": self.quat(),
            "translation": self.vector(),
            "scale": self.vector(),
        }

    def read_to_end(self):
        tail = self.data[self.offset:]
        self.offset = len(self.data)
        return bytes(tail)


def _prop_value(prop, default=None):
    value = prop.get("value", default) if isinstance(prop, dict) else prop
    while (
        isinstance(value, dict)
        and "value" in value
        and set(value.keys()).issubset({"type", "value"})
    ):
        value = value["value"]
    return value


def _prop_values(prop):
    value = _prop_value(prop, [])
    if isinstance(value, dict):
        value = value.get("values", [])
    return list(value) if isinstance(value, (list, tuple)) else []


def _guid_text(prop):
    if isinstance(prop, dict) and "ID" in prop and "value" not in prop:
        prop = prop["ID"]
    value = _prop_value(prop, "")
    if isinstance(value, dict) and "ID" in value:
        value = _prop_value(value["ID"], "")
    return str(value or "").lower()


def _enum_token(prop):
    value = _prop_value(prop, "")
    return str(value or "").split("::")[-1]


def _raw_bytes(raw):
    value = _prop_value(raw, raw)
    if isinstance(value, bytes):
        return value
    if isinstance(value, bytearray):
        return bytes(value)
    if isinstance(value, dict) and "values" in value:
        return bytes(value["values"])
    if isinstance(value, (list, tuple)):
        return bytes(value)
    raise ValueError("RawData is not a binary payload")


def _safe_count(reader, maximum=100000):
    count = reader.u32()
    if count > maximum:
        raise ValueError(f"collection length is too large: {count}")
    return count


def _read_binary(raw):
    return SaveBinaryReader(_raw_bytes(raw))


def _instance_id_from_key(key):
    if not isinstance(key, dict):
        return ""
    for name in ("InstanceId", "InstanceID", "instance_id"):
        if name in key:
            return _guid_text(key[name])
    return ""


def _read_gvas(path):
    with open(path, "rb") as f:
        raw_gvas, _ = decompress_sav_to_gvas(f.read())
    return GvasFile.read(raw_gvas, PALWORLD_TYPE_HINTS, PALWORLD_CUSTOM_PROPERTIES)


def convert_sav(file):
    """Decode Level.sav into the module-global ``wsd`` (worldSaveData)."""
    global gvas_file, wsd
    gvas_file = _read_gvas(file)
    wsd = gvas_file.properties["worldSaveData"]["value"]
    return wsd


def _save_parameter(character_entry):
    return character_entry["value"]["RawData"]["value"]["object"]["SaveParameter"][
        "value"
    ]


def structure_player(dir_path, filetime: int = -1):
    if not wsd.get("CharacterSaveParameterMap"):
        return [], 0

    ticks = wsd["GameTimeSaveData"]["value"]["RealDateTimeTicks"]["value"]
    item_containers = _index_item_containers()

    players = []
    pals = []
    player_save_warnings = 0
    for c in wsd["CharacterSaveParameterMap"]["value"]:
        uid = c["key"]["PlayerUId"]["value"]
        instance_id = _instance_id_from_key(c.get("key", {}))
        sp = _save_parameter(c)
        if sp.get("IsPlayer") and sp["IsPlayer"]["value"]:
            sp["Items"], has_warning = getPlayerItems(
                uid, dir_path, item_containers
            )
            player_save_warnings += int(has_warning)
            players.append(Player(uid, sp).to_dict())
        else:
            if not sp.get("OwnerPlayerUId"):
                continue
            pals.append(Pal(sp, ticks, filetime, instance_id=instance_id).to_dict())

    # De-dup players by uid, keeping the highest-level record.
    unique_players_dict = {}
    for player in players:
        pid = player["player_uid"]
        if pid not in unique_players_dict or player["level"] > unique_players_dict[pid]["level"]:
            unique_players_dict[pid] = player
    unique_players = list(unique_players_dict.values())

    for pal in pals:
        for player in unique_players:
            if player["player_uid"] == pal["owner"]:
                pal.pop("owner")
                player["pals"].append(pal)
                break

    return (
        sorted(unique_players, key=lambda p: p["level"], reverse=True),
        player_save_warnings,
    )


def _index_item_containers():
    """Map container-UUID string -> decoded slots list."""
    index = {}
    if not wsd.get("ItemContainerSaveData"):
        return index
    for container in wsd["ItemContainerSaveData"]["value"]:
        cid = str(container["key"]["ID"]["value"])
        index[cid] = container["value"]["Slots"]["value"]["values"]
    return index


def _slot_items(slots):
    items = []
    for slot in slots or []:
        raw = slot["RawData"]["value"]
        if not raw:
            continue
        static_id = raw["item"]["static_id"]
        if not static_id or static_id.lower() == "none":
            continue
        items.append(
            {
                "SlotIndex": raw["slot_index"],
                "ItemId": static_id.lower(),
                "StackCount": raw["count"],
            }
        )
    return items


def structure_item_containers():
    """Return every decoded world container for global storage inspection."""
    return [
        {"id": container_id, "items": _slot_items(slots)}
        for container_id, slots in _index_item_containers().items()
        if slots
    ]


def _parse_character_slot(raw):
    data = _prop_value(raw, raw)
    if isinstance(data, dict) and "values" not in data:
        instance_id = _guid_text(
            data.get("InstanceId")
            or data.get("InstanceID")
            or data.get("instance_id")
        )
        player_uid = _guid_text(
            data.get("PlayerUId")
            or data.get("PlayerUID")
            or data.get("player_uid")
        )
        return None if not instance_id or instance_id == ZERO_GUID else {
            "player_uid": player_uid,
            "instance_id": instance_id,
        }
    reader = _read_binary(raw)
    player_uid = reader.guid()
    instance_id = reader.guid()
    reader.byte()
    return None if instance_id == ZERO_GUID else {
        "player_uid": player_uid,
        "instance_id": instance_id,
    }


def _parse_character_container_slots(slots):
    members = []
    for slot_index, slot in enumerate(_prop_values(slots)):
        try:
            member = _parse_character_slot(slot.get("RawData") if isinstance(slot, dict) else slot)
            if member:
                members.append({**member, "slot": slot_index})
        except Exception:
            continue
    return members


def _parse_worker_container(raw):
    reader = _read_binary(raw)
    reader.guid()
    reader.ftransform()
    reader.byte()
    reader.byte()
    return reader.guid()


def _parse_work(raw, work_type):
    enum_name = str(work_type or "").split("::")[-1]
    if enum_name not in WORK_BASE_TYPES:
        return None
    reader = _read_binary(raw)
    work_id = reader.guid()
    reader.vector()
    reader.quat()
    reader.vector()
    reader.vector()
    reader.double()
    base_id = hexuid_to_decimal(reader.guid())
    owner_map_object_id = reader.guid()
    reader.guid()
    reader.byte()
    for _ in range(_safe_count(reader)):
        reader.vector()
        reader.vector()
    reader.byte()
    define_id = reader.fstring()
    return {
        "id": work_id,
        "base_id": base_id,
        "owner_map_object_id": owner_map_object_id,
        "define_id": define_id,
        "work_type": enum_name,
    }


def _parse_work_assignment(raw):
    reader = _read_binary(raw)
    reader.guid()
    reader.i32()
    reader.byte()
    reader.guid()
    instance_id = reader.guid()
    state = reader.byte()
    fixed = reader.u32() > 0
    return {"instance_id": instance_id, "state": state, "fixed": fixed}


def _index_character_parameters():
    characters = {}
    if not wsd.get("CharacterSaveParameterMap"):
        return characters
    for entry in wsd["CharacterSaveParameterMap"]["value"]:
        try:
            sp = _save_parameter(entry)
            if sp.get("IsPlayer") and sp["IsPlayer"]["value"]:
                continue
            instance_id = _instance_id_from_key(entry.get("key", {}))
            if instance_id:
                characters[instance_id] = sp
        except Exception:
            continue
    return characters


def _index_character_containers():
    containers = {}
    if not wsd.get("CharacterContainerSaveData"):
        return containers
    for row in wsd["CharacterContainerSaveData"]["value"]:
        try:
            container_id = _guid_text(row.get("key"))
            containers[container_id] = _parse_character_container_slots(
                row.get("value", {}).get("Slots")
            )
        except Exception:
            continue
    return containers


def _index_worker_assignments():
    assignments = {}
    if not wsd.get("WorkSaveData"):
        return assignments
    for work in _prop_values(wsd["WorkSaveData"]):
        try:
            work_type = _enum_token(work.get("WorkableType"))
            parsed = _parse_work(work.get("RawData"), work_type)
            if not parsed:
                continue
            facility = parsed.get("define_id") or "工作设施"
            for assignment_row in _prop_values(work.get("WorkAssignMap")):
                raw = assignment_row.get("value", {}).get("RawData")
                assignment = _parse_work_assignment(raw)
                assignments[assignment["instance_id"]] = {
                    **assignment,
                    "base_id": parsed["base_id"],
                    "facility": facility,
                    "work_id": parsed["id"],
                    "facility_instance_id": parsed["owner_map_object_id"],
                }
        except Exception:
            continue
    return assignments


def _worker_diseases(params):
    diseases = []
    worker_sick = _enum_token(params.get("WorkerSick"))
    if worker_sick and worker_sick not in {"None", "Normal"}:
        diseases.append(WORKER_SICK_LABELS.get(worker_sick, worker_sick))
    for key, value in params.items():
        lowered = key.lower()
        if key == "WorkerSick" or not any(token in lowered for token in ("sick", "disease", "injur")):
            continue
        if _prop_value(value):
            diseases.append(key)
    return list(dict.fromkeys(diseases))


def _worker_activity(params, assignment):
    event = _enum_token(params.get("BaseCampWorkerEventType"))
    if event and event != "None":
        return {
            "label": WORKER_EVENT_LABELS.get(event, "特殊状态"),
            "kind": "event",
            "detail": "来自存档记录的据点事件",
        }
    suitability = _enum_token(params.get("CurrentWorkSuitability"))
    if suitability and suitability != "None":
        label = WORK_SUITABILITY_LABELS.get(suitability, suitability)
        return {
            "label": f"正在{label}",
            "kind": "working",
            "detail": "来自存档记录的当前工作",
        }
    if assignment:
        facility = str(assignment.get("facility") or "工作设施")
        prefix = "固定于" if assignment.get("fixed") else "分配至"
        return {
            "label": f"{prefix}{facility}",
            "kind": "assigned",
            "detail": "来自存档记录的工作分配",
        }
    return {
        "label": "自主工作",
        "kind": "autonomous",
        "detail": "存档未记录具体任务或设施",
    }


def _worker_pal(instance_id, params, base, guild, assignment, real_date_time_ticks, filetime):
    pal = Pal(params, real_date_time_ticks, filetime, instance_id=instance_id).to_dict()
    conditions = _worker_diseases(params)
    full_stomach = float(_prop_value(params.get("FullStomach"), 0) or 0)
    sanity = float(_prop_value(params.get("SanityValue"), 100) or 0)
    if full_stomach < 20:
        conditions.append("饱食度偏低")
    if sanity < 50:
        conditions.append("SAN 偏低")
    if pal.get("hp", 0) <= 0:
        conditions.append("生命值为零")
    pal.update({
        "owner_uid": pal.get("owner", ""),
        "owner_name": "",
        "location_kind": "base",
        "location_key": f"base:{base['id']}",
        "base_id": base["id"],
        "base_name": base.get("display_name") or base.get("id"),
        "guild_name": guild.get("name") if guild else "",
        "activity": _worker_activity(params, assignment),
        "diseases": _worker_diseases(params),
        "conditions": list(dict.fromkeys(conditions)),
        "needs_attention": bool(conditions),
        "facility": assignment.get("facility") if assignment else "",
        "facility_instance_id": assignment.get("facility_instance_id") if assignment else "",
    })
    return pal


def getPlayerItems(player_uid, dir_path, item_containers):
    containers_data = {k: [] for k in PLAYER_CONTAINER_KEYS}

    player_sav_file = os.path.join(
        dir_path, str(player_uid).upper().replace("-", "") + ".sav"
    )
    if not os.path.exists(player_sav_file):
        return containers_data, True

    try:
        player_gvas = _read_gvas(player_sav_file).properties["SaveData"]["value"]
    except Exception as e:
        log(
            f"Skipped corrupted player save: {os.path.basename(player_sav_file)}: "
            f"{type(e).__name__}: {e}",
            "WARNING",
        )
        return containers_data, True

    inv = player_gvas.get("InventoryInfo")
    if inv is None:
        return containers_data, False

    for key in PLAYER_CONTAINER_KEYS:
        ref = inv["value"].get(key)
        if ref is None:
            continue
        container_id = str(ref["value"]["ID"]["value"])
        slots = item_containers.get(container_id)
        if slots is None:
            continue
        containers_data[key] = [
            {**item, "ContainerId": container_id}
            for item in _slot_items(slots)
        ]
    return containers_data, False


def structure_base_camp():
    if not wsd.get("BaseCampSaveData"):
        return []
    bases = []
    for row in wsd["BaseCampSaveData"]["value"]:
        base = BaseCamp(row["value"]["RawData"]["value"]).to_dict()
        try:
            base["worker_container_id"] = _parse_worker_container(
                row["value"]["WorkerDirector"]["value"]["RawData"]
            )
        except Exception:
            base["worker_container_id"] = ""
        base["display_name"] = f"据点 {len(bases) + 1}"
        base["workers"] = []
        base["pal_count"] = 0
        base["worker_attention_count"] = 0
        bases.append(base)
    return bases


def _guild_by_base_id(guilds):
    output = {}
    for guild in guilds:
        for base_id in guild.get("base_ids", []):
            output[str(base_id)] = guild
    return output


def _base_camp_summary(base):
    return {
        "id": base["id"],
        "area": base.get("area_range", base.get("area")),
        "location_x": base.get("transform", {}).get("x", base.get("location_x")),
        "location_y": base.get("transform", {}).get("y", base.get("location_y")),
        "workers": base.get("workers", []),
        "pal_count": base.get("pal_count", 0),
        "worker_attention_count": base.get("worker_attention_count", 0),
    }


def attach_bases_to_guilds(guilds, bases):
    base_by_id = {str(base.get("id")): base for base in bases}
    for guild in guilds:
        guild["base_camp"] = [
            _base_camp_summary(base_by_id[base_id])
            for base_id in guild.get("base_ids", [])
            if base_id in base_by_id
        ]
    return guilds


def structure_base_workers(players, guilds, bases, filetime: int = -1):
    if not bases:
        return []
    ticks = wsd["GameTimeSaveData"]["value"]["RealDateTimeTicks"]["value"]
    characters = _index_character_parameters()
    containers = _index_character_containers()
    assignments = _index_worker_assignments()
    guilds_by_base = _guild_by_base_id(guilds)
    workers = []
    for base in bases:
        guild = guilds_by_base.get(str(base.get("id")))
        base_workers = []
        for slot in containers.get(str(base.get("worker_container_id", "")).lower(), []):
            instance_id = slot.get("instance_id")
            params = characters.get(instance_id)
            if not params:
                continue
            worker = _worker_pal(
                instance_id,
                params,
                base,
                guild,
                assignments.get(instance_id),
                ticks,
                filetime,
            )
            base_workers.append(worker)
            workers.append(worker)
        base["workers"] = sorted(
            base_workers,
            key=lambda row: (row.get("needs_attention") is not True, row.get("level", 0) * -1),
        )
        base["pal_count"] = len(base_workers)
        base["worker_attention_count"] = sum(
            1 for worker in base_workers if worker.get("needs_attention")
        )
    return workers


def structure_guild(filetime: int = -1):
    if not wsd.get("GroupSaveDataMap"):
        return []
    base_camps = structure_base_camp()
    ticks = wsd["GameTimeSaveData"]["value"]["RealDateTimeTicks"]["value"]
    groups = (
        g["value"]["RawData"]["value"]
        for g in wsd["GroupSaveDataMap"]["value"]
        if g["value"]["GroupType"]["value"]["value"] == "EPalGroupType::Guild"
    )
    sorted_guilds = sorted(
        (Guild(g, ticks, filetime).to_dict() for g in groups),
        key=lambda g: g["base_camp_level"],
        reverse=True,
    )
    for guild in sorted_guilds:
        for camp in base_camps:
            if camp["id"] in guild["base_ids"]:
                guild["base_camp"].append(
                    {
                        "id": camp["id"],
                        "area": camp["area_range"],
                        "location_x": camp["transform"]["x"],
                        "location_y": camp["transform"]["y"],
                    }
                )
    return list(sorted_guilds)
