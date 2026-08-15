import unittest

from world_types import Pal


def byte_property(value):
    return {"type": "ByteProperty", "value": {"type": "None", "value": value}}


def enum_property(enum_type, value):
    return {
        "type": "EnumProperty",
        "value": {"type": enum_type, "value": value},
    }


class PalDetailParsingTests(unittest.TestCase):
    def test_parses_optional_detail_property_types(self):
        data = {
            "Hp": {
                "type": "StructProperty",
                "value": {
                    "Value": {"type": "Int64Property", "value": 123000}
                },
            },
            "Level": byte_property(42),
            "Rank_HP": byte_property(17),
            "RankUpExp": {
                "type": "UInt16Property",
                "value": {"type": "UInt16Property", "value": 9},
            },
            "FriendshipPoint": {"type": "IntProperty", "value": 45678},
            "bIsAwakening": {
                "type": "BoolProperty",
                "value": {"type": "BoolProperty", "value": True},
            },
            "FavoriteIndex": byte_property(3),
            "IsFavoritePal": {"type": "BoolProperty", "value": False},
            "bIsFavoritePal": {
                "type": "BoolProperty",
                "value": {"type": "BoolProperty", "value": True},
            },
            "PhysicalHealth": enum_property(
                "EPalStatusPhysicalHealthType",
                "EPalStatusPhysicalHealthType::Dying",
            ),
            "PalReviveTimer": {"type": "FloatProperty", "value": 22.5},
            "SkinName": {"type": "NameProperty", "value": "Skin_Golden"},
            "GotWorkSuitabilityAddRankList": {
                "type": "ArrayProperty",
                "array_type": "StructProperty",
                "value": {
                    "prop_name": "GotWorkSuitabilityAddRankList",
                    "prop_type": "StructProperty",
                    "values": [
                        {
                            "WorkSuitability": enum_property(
                                "EPalWorkSuitability",
                                "EPalWorkSuitability::Mining",
                            ),
                            "Rank": {"type": "IntProperty", "value": 2},
                        },
                        {
                            "value": {
                                "WorkSuitability": enum_property(
                                    "EPalWorkSuitability",
                                    "EPalWorkSuitability::Collection",
                                ),
                                "Rank": {
                                    "type": "IntProperty",
                                    "value": {"type": "IntProperty", "value": 1},
                                },
                            }
                        },
                    ],
                },
            },
        }

        pal = Pal(data, 0, 0).to_dict()

        self.assertEqual(pal["hp"], 123000)
        self.assertEqual(pal["level"], 42)
        self.assertEqual(pal["rank_hp"], 17)
        self.assertEqual(pal["rank_up_exp"], 9)
        self.assertEqual(pal["friendship_point"], 45678)
        self.assertIs(pal["is_awakening"], True)
        self.assertEqual(pal["favorite_index"], 3)
        self.assertIs(pal["is_favorite_pal"], True)
        self.assertEqual(pal["physical_health"], "Dying")
        self.assertEqual(pal["pal_revive_timer"], 22.5)
        self.assertEqual(pal["skin_name"], "Skin_Golden")
        self.assertEqual(
            pal["work_suitability_add_rank"], {"Mining": 2, "Collection": 1}
        )

    def test_missing_or_malformed_optional_details_remain_unknown(self):
        data = {
            "Rank_HP": {"type": "ByteProperty", "value": {"unexpected": 20}},
            "RankUpExp": {"type": "UInt16Property", "value": "invalid"},
            "FriendshipPoint": {"type": "IntProperty", "value": True},
            "bIsAwakening": {"type": "BoolProperty", "value": "invalid"},
            "FavoriteIndex": {"type": "ByteProperty", "value": {}},
            "PhysicalHealth": {"type": "EnumProperty", "value": {}},
            "PalReviveTimer": {"type": "FloatProperty", "value": "invalid"},
            "SkinName": {"type": "NameProperty", "value": 123},
            "GotWorkSuitabilityAddRankList": {
                "type": "ArrayProperty",
                "value": {
                    "values": [
                        {"Rank": {"type": "IntProperty", "value": 2}},
                        {
                            "WorkSuitability": enum_property(
                                "EPalWorkSuitability",
                                "EPalWorkSuitability::Mining",
                            ),
                            "Rank": {"type": "IntProperty", "value": "invalid"},
                        },
                    ]
                },
            },
        }

        pal = Pal(data, 0, 0).to_dict()

        for field in (
            "rank_hp",
            "rank_up_exp",
            "friendship_point",
            "is_awakening",
            "favorite_index",
            "is_favorite_pal",
            "physical_health",
            "pal_revive_timer",
            "skin_name",
        ):
            self.assertIsNone(pal[field], field)
        self.assertEqual(pal["work_suitability_add_rank"], {})

    def test_parses_explicit_work_suitability_levels_when_saved(self):
        data = {
            "WorkSuitabilityLevelList": {
                "type": "ArrayProperty",
                "value": {
                    "values": [
                        {
                            "WorkSuitability": enum_property(
                                "EPalWorkSuitability",
                                "EPalWorkSuitability::Cooling",
                            ),
                            "Level": {"type": "IntProperty", "value": 2},
                        },
                        {
                            "value": {
                                "Suitability": enum_property(
                                    "EPalWorkSuitability",
                                    "EPalWorkSuitability::Mining",
                                ),
                                "Rank": {"type": "IntProperty", "value": 5},
                            }
                        },
                    ]
                },
            }
        }

        pal = Pal(data, 0, 0).to_dict()

        self.assertEqual(pal["work_suitabilities"], {"Cooling": 2, "Mining": 5})

    def test_false_favorite_flags_are_not_treated_as_missing(self):
        pal = Pal(
            {
                "IsFavoritePal": {"type": "BoolProperty", "value": False},
                "bIsFavoritePal": {"type": "BoolProperty", "value": False},
            },
            0,
            0,
        ).to_dict()

        self.assertIs(pal["is_favorite_pal"], False)

    def test_positive_favorite_index_is_a_favorite_signal(self):
        pal = Pal({"FavoriteIndex": byte_property(2)}, 0, 0).to_dict()

        self.assertIs(pal["is_favorite_pal"], True)


if __name__ == "__main__":
    unittest.main()
