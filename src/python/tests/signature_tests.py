import unittest
from unittest import TestCase
from typing import Union

import numpy as np
import pandas as pd
from counterstrat_demoparser import DemoParser, WantedPropState

demo_path = "../parser/test_demo.dem"


class MyWantedPropState:
    def __init__(self, prop: str, state: Union[bool, str, int, float]):
        self.prop = prop
        self.state = state


class SignatureTest(TestCase):
    def test_demoparser_creation(self):
        DemoParser(demo_path)
        DemoParser(demo_path=demo_path)


    def test_parse_header_signature(self):
        parser = DemoParser(demo_path)
        header = parser.parse_header()
        self.assertIsInstance(header, dict)
        for key, value in header.items():
            self.assertIsInstance(key, str)
            self.assertIsInstance(value, str)

    def test_list_game_events_signature(self):
        parser = DemoParser(demo_path)
        game_events = parser.list_game_events()
        self.assertIsInstance(game_events, list)
        for event in game_events:
            self.assertIsInstance(event, str)

    def test_parse_weapons_signature(self):
        parser = DemoParser(demo_path)
        weapons = parser.parse_weapons()
        self.assertIsInstance(weapons, pd.DataFrame)
        for col in ["tick", "entity_id", "weapon", "x", "y", "z", "steamid", "name"]:
            self.assertIn(col, weapons.columns)
        parser.parse_weapons(extra=["m_nDropTick"], ticks=[100, 200])
        with self.assertRaises(TypeError):
            parser.parse_weapons(extra=[5])
        with self.assertRaises(TypeError):
            parser.parse_weapons(ticks="wrong")

    def test_parse_grenades_signature(self):
        parser = DemoParser(demo_path)
        grenades = parser.parse_grenades()
        self.assertIsInstance(grenades, pd.DataFrame)
        parser.parse_grenades(extra=["game_time"], grenades=True)
        parser.parse_grenades(extra=["game_time"], grenades=False)
        parser.parse_grenades(extra=["game_time"], grenades=False, ticks=[100, 200])
        with self.assertRaises(TypeError):
            parser.parse_grenades(extra=[5])
        with self.assertRaises(TypeError):
            parser.parse_grenades(extra="game_time")
        with self.assertRaises(TypeError):
            parser.parse_grenades(grenades="wrong")

    def test_parse_player_info_signature(self):
        parser = DemoParser(demo_path)
        player_info = parser.parse_player_info()
        self.assertIsInstance(player_info, pd.DataFrame)

    def test_parse_item_drops_signature(self):
        parser = DemoParser(demo_path)
        item_drops = parser.parse_item_drops()
        self.assertIsInstance(item_drops, pd.DataFrame)

    def test_parse_skins_signature(self):
        parser = DemoParser(demo_path)
        skins = parser.parse_skins()
        self.assertIsInstance(skins, pd.DataFrame)

    def test_parse_event_signature(self):
        parser = DemoParser(demo_path)

        event = parser.parse_event("player_death")
        self.assertIsInstance(event, pd.DataFrame)

        parser.parse_event(
            "player_death",
            player=["X", "Y"],
            other=["game_time", "total_rounds_played"],
        )
        parser.parse_event(
            "player_death",
            player=("X", "Y"),
            other=("game_time", "total_rounds_played"),
        )
        parser.parse_event("player_death", player=None, other=None)
        parser.parse_event("player_death", player=[], other=[])

        with self.assertRaises(TypeError):
            parser.parse_event("player_death", player=5, other=None)

        with self.assertRaises(TypeError):
            parser.parse_event("player_death", player=None, other=5)

        with self.assertRaises(TypeError):
            parser.parse_event("player_death", player="Test")

        with self.assertRaises(TypeError):
            parser.parse_event(5)

    def test_parse_events_signature(self):
        parser = DemoParser(demo_path)

        events = parser.parse_events(["player_death"])
        self.assertIsInstance(events, list)
        for event in events:
            self.assertIsInstance(event, tuple)
            self.assertIsInstance(event[0], str)
            self.assertIsInstance(event[1], pd.DataFrame)

        parser.parse_events(
            ["player_death"],
            player=["X", "Y"],
            other=["game_time", "total_rounds_played"],
        )
        parser.parse_events(
            ["player_death"],
            player=("X", "Y"),
            other=("game_time", "total_rounds_played"),
        )
        parser.parse_events(["player_death"], player=None, other=None)
        parser.parse_events(["player_death"], player=[], other=[])

        with self.assertRaises(TypeError):
            parser.parse_events(["player_death"], player=5, other=None)

        with self.assertRaises(TypeError):
            parser.parse_events(["player_death"], player=None, other=5)

        with self.assertRaises(TypeError):
            parser.parse_events(["player_death"], player="Test")

        with self.assertRaises(TypeError):
            parser.parse_events("player_death")

        with self.assertRaises(TypeError):
            parser.parse_events(5)

    def test_parse_voice_signature(self):
        parser = DemoParser(demo_path)
        voice = parser.parse_voice()
        self.assertIsInstance(voice, list)
        for entry in voice:
            self.assertEqual(set(entry.keys()), {"tick", "steamid", "bytes"})
            self.assertIsInstance(entry["tick"], int)
            self.assertIsInstance(entry["steamid"], int)
            self.assertIsInstance(entry["bytes"], bytes)

    def test_parse_ticks_signature(self):
        parser = DemoParser(demo_path)

        ticks = parser.parse_ticks(["X", "Y"])
        self.assertIsInstance(ticks, pd.DataFrame)

        parser.parse_ticks(["X", "Y"], players=[1, 2, 3], ticks=[1, 2, 3])
        parser.parse_ticks(["X", "Y"], players=None, ticks=None)
        parser.parse_ticks(["X", "Y"], players=[], ticks=[])
        parser.parse_ticks(
            ["X", "Y"],
            prop_states=[
                WantedPropState("is_alive", True),
                WantedPropState("is_bomb_planted", True),
            ],
        )

        parser.parse_ticks(
            ["X", "Y"],
            prop_states=[
                MyWantedPropState("is_alive", True),
                MyWantedPropState("is_bomb_planted", True),
            ],
        )

        with self.assertRaises(TypeError):
            parser.parse_ticks(["X", "Y"], players=5, ticks=None)

        with self.assertRaises(TypeError):
            parser.parse_ticks(["X", "Y"], players=None, ticks=5)

        with self.assertRaises(TypeError):
            parser.parse_ticks(["X", "Y"], players="Test")

        with self.assertRaises(TypeError):
            parser.parse_ticks(5)

        with self.assertRaises(AttributeError):
            parser.parse_ticks(
                ["X", "Y"], prop_states=[{"prop": "is_alive", "state": True}]
            )

    def test_pandas3_dtypes_and_null_sentinels(self):
        parser = DemoParser(demo_path)

        # Plain to_pandas path (parse_ticks): strings use pandas' str dtype, and
        # missing values are np.nan in both str and float columns.
        ticks = parser.parse_ticks(["active_weapon_name", "health"])
        self.assertEqual(str(ticks["active_weapon_name"].dtype), "str")
        self.assertTrue(ticks["active_weapon_name"].isna().any())
        str_missing = ticks["active_weapon_name"][ticks["active_weapon_name"].isna()].iloc[0]
        self.assertIsInstance(str_missing, float)
        self.assertTrue(np.isnan(str_missing))

        self.assertEqual(str(ticks["health"].dtype), "float64")
        self.assertTrue(ticks["health"].isna().any())
        self.assertTrue(np.isnan(ticks["health"][ticks["health"].isna()].iloc[0]))

        # use_pyarrow_extension_array path (parse_player_info / parse_skins):
        # columns keep their Arrow dtype and missing values are pd.NA.
        player_info = parser.parse_player_info()
        self.assertEqual(str(player_info["name"].dtype), "large_string[pyarrow]")
        self.assertEqual(str(player_info["steamid"].dtype), "uint64[pyarrow]")

        skins = parser.parse_skins()
        self.assertEqual(str(skins["custom_name"].dtype), "large_string[pyarrow]")
        self.assertTrue(skins["custom_name"].isna().any())
        self.assertIs(
            skins["custom_name"][skins["custom_name"].isna()].iloc[0],
            pd.NA,
        )

    def test_list_updated_fields(self):
        parser = DemoParser(demo_path)

        updated_fields = parser.list_updated_fields()
        self.assertIsInstance(updated_fields, list)
        # Populating this list requires the entity pass; an empty result means
        # parse_ents was not enabled, which is how the wasm binding diverged.
        self.assertTrue(updated_fields)
        for field in updated_fields:
            self.assertIsInstance(field, str)


if __name__ == "__main__":
    unittest.main()
