from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import os
import time
import requests

from ml.risk_engine import calculate_risk


app = FastAPI(title="ASTRA API")


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://astra-opal-delta.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# CACHE
# =========================================================

WEATHER_CACHE = {}

CACHE_DURATION = 300  # 5 minutes


def get_cache_key(latitude, longitude):
    return (
        round(float(latitude), 2),
        round(float(longitude), 2),
    )


def get_cached_weather(latitude, longitude):
    key = get_cache_key(latitude, longitude)

    cached = WEATHER_CACHE.get(key)

    if not cached:
        return None

    age = time.time() - cached["timestamp"]

    if age < CACHE_DURATION:
        return cached["data"]

    return None


def get_stale_cached_weather(latitude, longitude):
    key = get_cache_key(latitude, longitude)

    cached = WEATHER_CACHE.get(key)

    if cached:
        return cached["data"]

    return None


def save_weather_cache(latitude, longitude, data):
    key = get_cache_key(latitude, longitude)

    WEATHER_CACHE[key] = {
        "timestamp": time.time(),
        "data": data,
    }


# =========================================================
# OPEN-METEO
# =========================================================

def fetch_open_meteo(latitude, longitude):

    url = "https://api.open-meteo.com/v1/forecast"

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": (
            "temperature_2m,"
            "relative_humidity_2m,"
            "wind_speed_10m,"
            "precipitation"
        ),
        "hourly": (
            "precipitation_probability,"
            "precipitation"
        ),
        "forecast_days": 1,
    }

    response = requests.get(
        url,
        params=params,
        timeout=10,
    )

    response.raise_for_status()

    data = response.json()

    current = data["current"]
    hourly = data["hourly"]

    current_time = current["time"]

    if current_time in hourly["time"]:
        current_index = hourly["time"].index(current_time)
    else:
        current_index = 0

    rain_probability = (
        hourly["precipitation_probability"][current_index]
    )

    return {
        "temperature": current["temperature_2m"],
        "humidity": current["relative_humidity_2m"],
        "wind_speed": current["wind_speed_10m"],
        "rainfall": current["precipitation"],
        "rain_probability": rain_probability,
    }


# =========================================================
# WEATHERAPI FALLBACK
# =========================================================

def fetch_weatherapi(latitude, longitude):

    api_key = os.getenv("WEATHER_API_KEY")

    if not api_key:
        raise RuntimeError(
            "WEATHER_API_KEY is not configured"
        )

    url = "https://api.weatherapi.com/v1/forecast.json"

    params = {
        "key": api_key,
        "q": f"{latitude},{longitude}",
        "days": 1,
        "aqi": "no",
        "alerts": "no",
    }

    response = requests.get(
        url,
        params=params,
        timeout=10,
    )

    response.raise_for_status()

    data = response.json()

    current = data["current"]

    rain_probability = 0

    try:
        hourly = data["forecast"]["forecastday"][0]["hour"]

        current_epoch = current["last_updated_epoch"]

        closest_hour = min(
            hourly,
            key=lambda item: abs(
                item["time_epoch"] - current_epoch
            ),
        )

        rain_probability = closest_hour.get(
            "chance_of_rain",
            0
        )

    except (KeyError, TypeError, ValueError):
        rain_probability = 0

    return {
        "temperature": current.get(
            "temp_c",
            0
        ),
        "humidity": current.get(
            "humidity",
            0
        ),
        "wind_speed": current.get(
            "wind_kph",
            0
        ),
        "rainfall": current.get(
            "precip_mm",
            0
        ),
        "rain_probability": rain_probability,
    }


# =========================================================
# WEATHER ENDPOINT
# =========================================================

@app.get("/weather")
def get_weather(latitude: float, longitude: float):

    # -----------------------------------------------------
    # 1. CHECK CACHE
    # -----------------------------------------------------

    cached_weather = get_cached_weather(
        latitude,
        longitude
    )

    if cached_weather:

        risk = calculate_risk(cached_weather)

        return {
            "location": {
                "latitude": latitude,
                "longitude": longitude,
            },
            "weather": cached_weather,
            "risk": risk,
            "provider": "cache",
        }


    weather_data = None
    provider = None


    # -----------------------------------------------------
    # 2. TRY OPEN-METEO
    # -----------------------------------------------------

    try:

        weather_data = fetch_open_meteo(
            latitude,
            longitude
        )

        provider = "open-meteo"

    except requests.RequestException as error:

        print(
            f"Open-Meteo failed: {error}"
        )

    except Exception as error:

        print(
            f"Open-Meteo unexpected error: {error}"
        )


    # -----------------------------------------------------
    # 3. FALLBACK TO WEATHERAPI
    # -----------------------------------------------------

    if weather_data is None:

        try:

            weather_data = fetch_weatherapi(
                latitude,
                longitude
            )

            provider = "weatherapi"

        except requests.RequestException as error:

            print(
                f"WeatherAPI failed: {error}"
            )

        except Exception as error:

            print(
                f"WeatherAPI unexpected error: {error}"
            )


    # -----------------------------------------------------
    # 4. USE STALE CACHE IF BOTH PROVIDERS FAIL
    # -----------------------------------------------------

    if weather_data is None:

        stale_weather = get_stale_cached_weather(
            latitude,
            longitude
        )

        if stale_weather:

            weather_data = stale_weather
            provider = "stale-cache"


    # -----------------------------------------------------
    # 5. BOTH PROVIDERS FAILED
    # -----------------------------------------------------

    if weather_data is None:

        raise HTTPException(
            status_code=503,
            detail=(
                "Weather providers are temporarily "
                "unavailable. Please try again shortly."
            ),
        )


    # -----------------------------------------------------
    # 6. SAVE CACHE
    # -----------------------------------------------------

    save_weather_cache(
        latitude,
        longitude,
        weather_data
    )


    # -----------------------------------------------------
    # 7. CALCULATE ASTRA RISK
    # -----------------------------------------------------

    try:

        risk = calculate_risk(
            weather_data
        )

    except ValueError as error:

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )


    # -----------------------------------------------------
    # 8. FINAL RESPONSE
    # -----------------------------------------------------

    return {
        "location": {
            "latitude": latitude,
            "longitude": longitude,
        },
        "weather": weather_data,
        "risk": risk,
        "provider": provider,
    }


# =========================================================
# HOME
# =========================================================

@app.get("/")
def home():

    return {
        "project": "ASTRA",
        "status": "Backend is running",
    }