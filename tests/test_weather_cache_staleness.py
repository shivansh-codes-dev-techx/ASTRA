import importlib.util
import sys
import time
import types
import unittest
from pathlib import Path

from fastapi import APIRouter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MAIN_MODULE_NAME = "backend._isolated_main_for_weather_tests"
DEPENDENCY_MODULES = (
    "backend.auth",
    "backend.rides",
    "backend.team_rides",
    "backend.saved_rides",
    "backend.notifications",
    "backend.alert_sources",
    "backend.alert_sources.sachet",
    "ml",
    "ml.risk_engine",
)


def _module(name, **attributes):
    module = types.ModuleType(name)
    for key, value in attributes.items():
        setattr(module, key, value)
    return module


class WeatherCacheStalenessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._previous_modules = {
            name: sys.modules.get(name) for name in DEPENDENCY_MODULES
        }
        routers = {
            name: APIRouter()
            for name in (
                "backend.auth",
                "backend.rides",
                "backend.team_rides",
                "backend.saved_rides",
                "backend.notifications",
            )
        }
        stubs = {
            name: _module(name, router=router)
            for name, router in routers.items()
        }
        stubs["backend.alert_sources"] = _module(
            "backend.alert_sources", __path__=[]
        )
        stubs["backend.alert_sources.sachet"] = _module(
            "backend.alert_sources.sachet",
            fetch_sachet_alerts=lambda: {"alerts": []},
        )
        stubs["ml"] = _module("ml", __path__=[])
        stubs["ml.risk_engine"] = _module(
            "ml.risk_engine",
            calculate_risk=lambda _weather: {
                "score": 0,
                "level": "LOW",
                "factors": [],
            },
        )
        sys.modules.update(stubs)

        source_path = PROJECT_ROOT / "backend" / "main.py"
        spec = importlib.util.spec_from_file_location(
            MAIN_MODULE_NAME, source_path
        )
        cls.main = importlib.util.module_from_spec(spec)
        sys.modules[MAIN_MODULE_NAME] = cls.main
        try:
            spec.loader.exec_module(cls.main)
        finally:
            for name, previous in cls._previous_modules.items():
                if previous is None:
                    sys.modules.pop(name, None)
                else:
                    sys.modules[name] = previous

    @classmethod
    def tearDownClass(cls):
        sys.modules.pop(MAIN_MODULE_NAME, None)

    def setUp(self):
        self.main.WEATHER_CACHE = {}
        self.main.fetch_open_meteo = self._provider_failure
        self.main.fetch_weatherapi = self._provider_failure

    @staticmethod
    def _provider_failure(_latitude, _longitude):
        raise RuntimeError("Test provider unavailable")

    def test_stale_weather_is_marked_and_keeps_its_original_timestamp(self):
        latitude, longitude = 28.6, 77.2
        key = self.main.get_cache_key(latitude, longitude)
        original_timestamp = time.time() - 600
        weather = {
            "temperature": 24,
            "humidity": 50,
            "wind_speed": 12,
            "rainfall": 0,
            "rain_probability": 0,
        }
        self.main.WEATHER_CACHE[key] = {
            "timestamp": original_timestamp,
            "data": weather,
        }

        response = self.main.get_weather(latitude, longitude)

        self.assertEqual(response["provider"], "stale-cache")
        self.assertTrue(response["is_stale"])
        self.assertGreaterEqual(response["data_age_seconds"], 600)
        self.assertEqual(response["weather"], weather)
        self.assertEqual(
            self.main.WEATHER_CACHE[key]["timestamp"],
            original_timestamp,
        )

        repeated_response = self.main.get_weather(latitude, longitude)
        self.assertGreaterEqual(
            repeated_response["data_age_seconds"],
            response["data_age_seconds"],
        )
        self.assertTrue(repeated_response["is_stale"])

        area_alerts = self.main.get_area_alerts(latitude, longitude)
        self.assertTrue(area_alerts["is_stale"])
        self.assertGreaterEqual(area_alerts["data_age_seconds"], 600)
