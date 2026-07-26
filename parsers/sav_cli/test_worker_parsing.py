import unittest
import uuid
import sys
import types


def _install_parser_stubs():
    palsav = types.ModuleType("palsav")
    core = types.ModuleType("palsav.core")
    gvas = types.ModuleType("palsav.gvas")
    paltypes = types.ModuleType("palsav.paltypes")
    core.decompress_sav_to_gvas = lambda value: (value, None)
    gvas.GvasFile = type("GvasFile", (), {"read": staticmethod(lambda *_: None)})
    paltypes.PALWORLD_TYPE_HINTS = {}
    paltypes.PALWORLD_CUSTOM_PROPERTIES = {}
    sys.modules.setdefault("palsav", palsav)
    sys.modules.setdefault("palsav.core", core)
    sys.modules.setdefault("palsav.gvas", gvas)
    sys.modules.setdefault("palsav.paltypes", paltypes)


_install_parser_stubs()

from structurer import (
    _build_player_pal_locations,
    _container_id_from_module,
    _parse_map_model,
    _parse_worker_container,
    _player_progress,
    _worker_sanity,
    structure_inventory,
)


class WorkerParsingTests(unittest.TestCase):
    def test_structured_worker_director_container_id(self):
        container_id = uuid.UUID("6f354c6b-b5cf-4ef8-a3b9-dad6ed19fc89")
        raw = {
            "array_type": "ByteProperty",
            "type": "ArrayProperty",
            "custom_type": ".worldSaveData.BaseCampSaveData.WorkerDirector.RawData",
            "value": {"container_id": container_id},
        }

        self.assertEqual(_parse_worker_container(raw), str(container_id))

    def test_missing_worker_sanity_defaults_to_full(self):
        self.assertEqual(_worker_sanity({}), 100.0)
        self.assertEqual(_worker_sanity({"SanityValue": {"value": 42.5}}), 42.5)

    def test_player_progress_extracts_record_counts_and_coordinates(self):
        save = {
            "RecordData": {
                "value": {
                    "PaldeckUnlockFlag": {"value": [{"value": {"value": True}}, {"value": {"value": False}}]},
                    "PalCaptureCount": {"value": [{"value": {"value": 3}}, {"value": {"value": 4}}]},
                    "FastTravelPointUnlockFlag": {"value": [{"value": {"value": True}}]},
                    "NormalBossDefeatFlag": {"value": [{"value": {"value": True}}]},
                    "TowerBossDefeatFlag": {"value": [{"value": {"value": True}}]},
                    "FindAreaFlagMap": {"value": [{"value": {"value": True}}]},
                    "FixedDungeonClearCount": {"value": 8},
                    "OilrigClearCount": {"value": 2},
                }
            },
            "LastTransform": {"value": {"Translation": {"value": {"x": 22000, "y": -17000}}}},
            "TechnologyPoint": {"value": 11},
            "bossTechnologyPoint": {"value": 5},
            "UnlockedRecipeTechnologyNames": {"value": {"values": ["A", "B"]}},
            "PalStorageContainerId": {"value": "11111111-1111-1111-1111-111111111111"},
            "OtomoCharacterContainerId": {"value": "22222222-2222-2222-2222-222222222222"},
        }
        progress = _player_progress(save)
        self.assertEqual(progress["position"], {"x": -17, "y": 22})
        self.assertEqual(progress["captured_pals"], 7)
        self.assertEqual(progress["discovered_pals"], 1)
        self.assertEqual(progress["dungeons"], 8)
        self.assertEqual(progress["recipes"], 2)

    def test_player_pal_locations_include_terminal_and_party_positions(self):
        players = [{
            "player_uid": "123",
            "pal_storage_container_id": "storage",
            "party_container_id": "party",
        }]
        members = {
            "storage": [{"instance_id": "pal-a", "player_uid": "", "slot": 31}],
            "party": [{"instance_id": "pal-b", "player_uid": "", "slot": 2}],
        }
        locations = _build_player_pal_locations(members, players)
        self.assertEqual(locations["pal-a"], {"kind": "storage", "slot": 31, "page": 2, "row": 1, "column": 2})
        self.assertEqual(locations["pal-b"], {"kind": "party", "slot": 2, "position": 3})

    def test_inventory_aggregates_counts_and_keeps_exact_slots(self):
        containers = [
            {"id": "bag", "items": [{"ItemId": "wood", "StackCount": 20, "SlotIndex": 0}]},
            {"id": "chest", "items": [{"ItemId": "wood", "StackCount": 80, "SlotIndex": 4}]},
        ]
        locations = {
            "bag": {"kind": "player", "owner": "Alice", "label": "背包"},
            "chest": {"kind": "base", "owner": "据点 1", "label": "木箱", "base_id": "1"},
        }
        inventory = structure_inventory(containers, locations)
        self.assertEqual(inventory[0]["count"], 100)
        self.assertEqual(inventory[0]["locations"][1]["slot"], 4)
        self.assertEqual(inventory[0]["locations"][1]["owner"], "据点 1")

    def test_structured_map_module_container_id(self):
        container_id = uuid.UUID("337cab0e-907a-4080-abab-c39aa0e2cf99")
        raw = {
            "array_type": "ByteProperty",
            "type": "ArrayProperty",
            "value": {"target_container_id": container_id},
        }
        self.assertEqual(_container_id_from_module(raw), str(container_id))

    def test_structured_map_model_location(self):
        raw = {
            "value": {
                "instance_id": uuid.UUID("ca45b12d-179f-46f8-9a86-a2bc9ac47098"),
                "base_camp_id_belong_to": uuid.UUID("de7e3141-0000-0000-0000-000000000000"),
                "group_id_belong_to": uuid.UUID("464d5f3b-0000-0000-0000-000000000000"),
                "initital_transform_cache": {
                    "translation": {"x": -528044.9, "y": 62530.7, "z": 0}
                },
            }
        }
        model = _parse_map_model(raw)
        self.assertEqual(model["base_id"], str(int("de7e3141", 16)))
        self.assertEqual(model["group_id"], str(int("464d5f3b", 16)))
        self.assertEqual((model["x"], model["y"]), (63, -528))


if __name__ == "__main__":
    unittest.main()
