from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests
import time

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
# WEATHER CACHE
# =========================================================

# Cache weather responses for 5 minutes.
# Key = rounded latitude/longitude
weather_cache = {}

CACHE_DURATION = 300  # 5 minutes


def get_cache_key(latitude, longitude):
    return (
        round(latitude, 4),
        round(longitude, 4)
    )


def get_cached_weather(latitude, longitude):
    key = get_cache_key(latitude, longitude)

    cached = weather_cache.get(key)

    if not cached:
        return None

    age = time.time() - cached["timestamp"]

    if age < CACHE_DURATION:
        print(
            f"USING CACHE: {key} "
            f"(age={round(age)} seconds)"
        )

        return cached["data"]

    # Remove expired cache
    del weather_cache[key]

    return None


def save_weather_cache(latitude, longitude, data):
    key = get_cache_key(latitude, longitude)

    weather_cache[key] = {
        "timestamp": time.time(),
        "data": data
    }

    print(f"CACHE SAVED: {key}")


# =========================================================
# HOME
# =========================================================

@app.get("/")
def home():
    return {
        "project": "ASTRA",
        "status": "Backend is running"
    }


# =========================================================
# WEATHER
# =========================================================

@app.get("/weather")
def get_weather(latitude: float, longitude: float):

    # -----------------------------------------------------
    # 1. CHECK CACHE FIRST
    # -----------------------------------------------------

    cached_response = get_cached_weather(
        latitude,
        longitude
    )

    if cached_response is not None:
        return cached_response


    # -----------------------------------------------------
    # 2. OPEN-METEO URL
    # -----------------------------------------------------

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

        "forecast_days": 1
    }


    # -----------------------------------------------------
    # 3. CALL OPEN-METEO
    # -----------------------------------------------------

    try:

        response = requests.get(
            url,
            params=params,
            timeout=15
        )

        print("========================================")
        print("OPEN-METEO REQUEST")
        print("URL:", response.url)
        print("STATUS:", response.status_code)
        print("========================================")


        # -------------------------------------------------
        # HANDLE RATE LIMIT
        # -------------------------------------------------

        if response.status_code == 429:

            print(
                "OPEN-METEO RATE LIMIT HIT (429)"
            )

            # If we have an older cached value,
            # use it instead of breaking the app.
            key = get_cache_key(
                latitude,
                longitude
            )

            old_cache = weather_cache.get(key)

            if old_cache:

                print(
                    "Using stale cache because "
                    "Open-Meteo returned 429."
                )

                return old_cache["data"]

            raise HTTPException(
                status_code=503,
                detail=(
                    "Weather provider is temporarily "
                    "rate-limited. Please try again "
                    "in a few minutes."
                )
            )


        response.raise_for_status()


    except requests.Timeout:

        print("OPEN-METEO TIMEOUT")

        raise HTTPException(
            status_code=504,
            detail="Weather provider request timed out."
        )


    except requests.RequestException as error:

        print("OPEN-METEO ERROR:")
        print(error)

        raise HTTPException(
            status_code=502,
            detail=f"Unable to fetch weather data: {error}"
        )


    # -----------------------------------------------------
    # 4. PARSE JSON
    # -----------------------------------------------------

    try:

        data = response.json()

    except ValueError:

        raise HTTPException(
            status_code=502,
            detail="Open-Meteo returned invalid JSON."
        )


    # -----------------------------------------------------
    # 5. VALIDATE RESPONSE
    # -----------------------------------------------------

    if "current" not in data:

        raise HTTPException(
            status_code=502,
            detail=(
                "Open-Meteo response is missing "
                "current weather data."
            )
        )


    if "hourly" not in data:

        raise HTTPException(
            status_code=502,
            detail=(
                "Open-Meteo response is missing "
                "hourly weather data."
            )
        )


    current = data["current"]
    hourly = data["hourly"]


    # -----------------------------------------------------
    # 6. CURRENT TIME
    # -----------------------------------------------------

    current_time = current.get("time")

    hourly_times = hourly.get(
        "time",
        []
    )


    if current_time in hourly_times:

        current_index = hourly_times.index(
            current_time
        )

    else:

        current_index = 0


    # -----------------------------------------------------
    # 7. RAIN PROBABILITY
    # -----------------------------------------------------

    rain_probability_list = hourly.get(
        "precipitation_probability",
        []
    )


    if rain_probability_list:

        if current_index < len(
            rain_probability_list
        ):

            rain_probability = (
                rain_probability_list[
                    current_index
                ]
            )

        else:

            rain_probability = (
                rain_probability_list[0]
            )

    else:

        rain_probability = 0


    # -----------------------------------------------------
    # 8. WEATHER DATA
    # -----------------------------------------------------

    try:

        weather_data = {

            "temperature":
                current["temperature_2m"],

            "humidity":
                current["relative_humidity_2m"],

            "wind_speed":
                current["wind_speed_10m"],

            "rainfall":
                current["precipitation"],

            "rain_probability":
                rain_probability
        }


    except KeyError as error:

        print(
            "MISSING WEATHER FIELD:",
            error
        )

        raise HTTPException(
            status_code=502,
            detail=(
                f"Open-Meteo response is missing "
                f"field: {error}"
            )
        )


    # -----------------------------------------------------
    # 9. RISK ENGINE
    # -----------------------------------------------------

    try:

        risk = calculate_risk(
            weather_data
        )

    except ValueError as error:

        print(
            "RISK ENGINE ERROR:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail=f"Risk engine error: {error}"
        )


    except Exception as error:

        print(
            "UNEXPECTED RISK ENGINE ERROR:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail=(
                f"Unexpected risk engine error: "
                f"{error}"
            )
        )


    # -----------------------------------------------------
    # 10. FINAL RESPONSE
    # -----------------------------------------------------

    result = {

        "location": {
            "latitude": latitude,
            "longitude": longitude
        },

        "weather": weather_data,

        "risk": risk
    }


    # -----------------------------------------------------
    # 11. SAVE TO CACHE
    # -----------------------------------------------------

    save_weather_cache(
        latitude,
        longitude,
        result
    )


    return result