
from backend.auth import router as auth_router
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import os
import time
import requests

from ml.risk_engine import calculate_risk
from backend.rides import router as rides_router
from backend.team_rides import router as team_rides_router

app = FastAPI(title="ASTRA API")
app.include_router(auth_router)
app.include_router(rides_router)
app.include_router(team_rides_router)
# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5176",
        "http://127.0.0.1:5176",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
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
            "chance_of_rain", 0
        )

    except (KeyError, TypeError, ValueError):
        rain_probability = 0

    return {
        "temperature": current.get("temp_c", 0),
        "humidity": current.get("humidity", 0),
        "wind_speed": current.get("wind_kph", 0),
        "rainfall": current.get("precip_mm", 0),
        "rain_probability": rain_probability,
    }


# =========================================================
# WEATHER ENDPOINT
# =========================================================

@app.get("/weather")
def get_weather(latitude: float, longitude: float):

    # 1. Check fresh cache
    cached_weather = get_cached_weather(
        latitude, longitude
    )

    if cached_weather is not None:
        try:
            risk = calculate_risk(cached_weather)
        except (ValueError, TypeError) as error:
            raise HTTPException(
                status_code=500,
                detail=f"Risk calculation failed: {error}",
            ) from error

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

    # 2. Try Open-Meteo
    try:
        weather_data = fetch_open_meteo(
            latitude, longitude
        )
        provider = "open-meteo"

    except Exception as error:
        print(f"Open-Meteo failed: {error}")

    # 3. Fall back to WeatherAPI
    if weather_data is None:
        try:
            weather_data = fetch_weatherapi(
                latitude, longitude
            )
            provider = "weatherapi"

        except Exception as error:
            print(f"WeatherAPI failed: {error}")

    # 4. Use stale cache if both providers fail
    if weather_data is None:
        stale_weather = get_stale_cached_weather(
            latitude, longitude
        )

        if stale_weather is not None:
            weather_data = stale_weather
            provider = "stale-cache"

    # 5. No data available
    if weather_data is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Weather providers are temporarily unavailable. "
                "Please try again shortly."
            ),
        )

    # 6. Save successful weather response
    save_weather_cache(
        latitude, longitude, weather_data
    )

    # 7. Calculate risk
    try:
        risk = calculate_risk(weather_data)

    except (ValueError, TypeError) as error:
        raise HTTPException(
            status_code=500,
            detail=f"Risk calculation failed: {error}",
        ) from error

    # 8. Return response
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
# HOME / HEALTH CHECK
# =========================================================

@app.get("/")
def home():
    return {
        "project": "ASTRA",
        "status": "Backend is running",
    }


# =========================================================
# AREA ALERTS (Open-Meteo-backed weather-risk signals)
# =========================================================
@app.get("/area-alerts")
def get_area_alerts(latitude: float, longitude: float):
    """Return location-specific weather-risk signals derived from ASTRA's weather/risk pipeline.

    These are model-derived weather-risk estimates, not official IMD warnings
    and not verified road incidents, traffic reports, waterlogging, or closures.
    """
    try:
        weather_response = get_weather(latitude, longitude)
    except HTTPException as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=f"Area weather-risk signals are unavailable: {error.detail}",
        ) from error

    weather = weather_response["weather"]
    risk = weather_response["risk"]
    score = int(risk.get("score", 0))
    level = str(risk.get("level", "UNKNOWN")).upper()
    factors = risk.get("factors", [])
    provider = weather_response.get("provider", "unknown")

    alerts = []
    if score > 30 or level in {"MODERATE", "HIGH", "EXTREME"}:
        alerts.append({
            "id": f"astra-weather-risk-{round(latitude, 3)}-{round(longitude, 3)}",
            "title": f"{level.title()} estimated weather risk",
            "description": (
                "; ".join(str(factor) for factor in factors)
                if factors else "ASTRA's weather-risk model indicates elevated conditions."
            ),
            "category": "weather_risk",
            "severity": level.lower(),
            "status": "model_estimate",
            "source": f"ASTRA risk engine using {provider} weather data",
            "location": {"latitude": latitude, "longitude": longitude},
            "issued_at": None,
            "valid_until": None,
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source_url": "https://open-meteo.com/",
            "risk_score": score,
            "factors": factors,
        })

    return {
        "alerts": alerts,
        "count": len(alerts),
        "source_status": "available",
        "source": "Open-Meteo weather data + ASTRA risk engine",
        "provider": provider,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "location": {"latitude": latitude, "longitude": longitude},
        "weather": weather,
        "risk": risk,
        "note": (
            "These are estimated weather-risk signals, not official weather warnings or verified road incidents. "
            "An empty alerts list does not confirm that roads are clear or that no hazard exists."
        ),
    }
