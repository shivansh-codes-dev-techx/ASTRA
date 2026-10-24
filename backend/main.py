from backend.saved_rides import router as saved_rides_router
from backend.auth import router as auth_router
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from backend.notifications import router as notifications_router

import os
import time
import requests
from urllib.parse import urlparse

from ml.risk_engine import calculate_risk
from backend.team_rides import router as team_rides_router
from backend.alert_sources.sachet import fetch_sachet_alerts

app = FastAPI(title="ASTRA API")
app.include_router(auth_router)
app.include_router(team_rides_router)
app.include_router(saved_rides_router)
app.include_router(notifications_router)
# =========================================================
# CORS
# =========================================================

allowed_origins = [
    "http://localhost:5176",
    "http://127.0.0.1:5176",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "https://astra-opal-delta.vercel.app",
]
public_url = os.getenv("ASTRA_PUBLIC_URL", "").strip()
public_url_parts = urlparse(public_url)
if (
    public_url_parts.netloc
    and not public_url_parts.username
    and not public_url_parts.password
    and (
        public_url_parts.scheme == "https"
        or (
            public_url_parts.scheme == "http"
            and public_url_parts.hostname in {"localhost", "127.0.0.1"}
        )
    )
):
    public_origin = f"{public_url_parts.scheme}://{public_url_parts.netloc}"
    if public_origin not in allowed_origins:
        allowed_origins.append(public_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-ASTRA-Verification-Required",
        "X-ASTRA-Verification-Pending",
    ],
)


# =========================================================
# CACHE
# =========================================================

WEATHER_CACHE = {}
CACHE_DURATION = 300  # 5 minutes
STALE_CACHE_MAX_AGE = 1800  # 30 minutes


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
        return {
            "data": cached["data"],
            "age_seconds": int(age),
        }

    return None

def get_stale_cached_weather(latitude, longitude):
    key = get_cache_key(latitude, longitude)
    cached = WEATHER_CACHE.get(key)

    if not cached:
        return None

    age = time.time() - cached["timestamp"]

    if age <= STALE_CACHE_MAX_AGE:
        return {
            "data": cached["data"],
            "age_seconds": int(age),
        }

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
    if not -90 <= latitude <= 90:
        raise HTTPException(
            status_code=422,
            detail="Latitude must be between -90 and 90.",
        )

    if not -180 <= longitude <= 180:
        raise HTTPException(
            status_code=422,
            detail="Longitude must be between -180 and 180.",
        )
    # 1. Check fresh cache
    cached_weather = get_cached_weather(
        latitude, longitude
    )

    if cached_weather is not None:
        try:
            risk = calculate_risk(cached_weather["data"])
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
            "weather": cached_weather["data"],
            "risk": risk,
            "provider": "cache",
            "data_age_seconds": cached_weather["age_seconds"],
            "is_stale": False,
        }


    weather_data = None
    provider = None
    data_age_seconds = 0
    is_stale = False

    # 2. Try Open-Meteo
    try:
        weather_data = fetch_open_meteo(
            latitude, longitude
        )
        provider = "open-meteo"

    except Exception as error:
        print(
            f"Open-Meteo failed: "
            f"{type(error).__name__}: {error}"
        )

    # 3. Fall back to WeatherAPI
    if weather_data is None:
        try:
            weather_data = fetch_weatherapi(
                latitude, longitude
            )
            provider = "weatherapi"

        except Exception as error:
            print(f"WeatherAPI failed ({type(error).__name__})")

    # 4. Use stale cache if both providers fail
    if weather_data is None:
        stale_weather = get_stale_cached_weather(
            latitude, longitude
        )

        if stale_weather is not None:
            weather_data = stale_weather["data"]
            provider = "stale-cache"
            data_age_seconds = stale_weather["age_seconds"]
            is_stale = True

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
    if not is_stale:
        save_weather_cache(latitude, longitude, weather_data)

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
        "data_age_seconds": data_age_seconds,
        "is_stale": is_stale,
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
    data_age_seconds = weather_response.get("data_age_seconds", 0)
    is_stale = weather_response.get("is_stale", False)

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
        "data_age_seconds": data_age_seconds,
        "is_stale": is_stale,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "location": {"latitude": latitude, "longitude": longitude},
        "weather": weather,
        "risk": risk,
        "note": (
            "These are estimated weather-risk signals, not official weather warnings or verified road incidents. "
            "An empty alerts list does not confirm that roads are clear or that no hazard exists."
        ),
    }

# =========================================================
# OFFICIAL DISASTER ALERTS — NDMA SACHET
# =========================================================

@app.get("/official-alerts")
def get_official_alerts():
    """Return official disaster-warning feed data from NDMA SACHET."""

    result = fetch_sachet_alerts()

    # Keep source health visible to API consumers.
    response = {
        "source": result.get("source", "NDMA SACHET"),
        "provider": result.get("provider", "SACHET RSS/CAP"),
        "source_status": result.get("source_status", "unavailable"),
        "checked_at": result.get("checked_at"),
        "cache_age_seconds": result.get("cache_age_seconds"),
        "count": result.get("count", 0),
        "error": result.get("error"),
        "alerts": [],
    }

    for item in result.get("alerts", []):
        alert = dict(item)

        # Explicitly distinguish official source records from
        # verified, current warnings.
        alert["category"] = "official_disaster_warning"

        if alert.get("detail_status") != "available":
            alert["verification_status"] = "details_pending"
            alert["is_active"] = None
        elif alert.get("is_active") is True:
            alert["verification_status"] = "official_cap_current"
        elif alert.get("is_active") is False:
            alert["verification_status"] = "expired_or_inactive"
        else:
            alert["verification_status"] = "activity_unknown"

        response["alerts"].append(alert)

    response["count"] = len(response["alerts"])
    return response
