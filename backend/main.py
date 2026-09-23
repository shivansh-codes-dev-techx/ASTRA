from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
# HOME
# =========================================================

@app.get("/")
def home():
    return {
        "project": "ASTRA",
        "status": "Backend is running"
    }


# =========================================================
# WEATHER API
# =========================================================

@app.get("/weather")
def get_weather(latitude: float, longitude: float):

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

    # -----------------------------------------------------
    # Fetch data from Open-Meteo
    # -----------------------------------------------------

    try:
        response = requests.get(
            url,
            params=params,
            timeout=15
        )

        print("========================================")
        print("OPEN-METEO URL:")
        print(response.url)

        print("OPEN-METEO STATUS:")
        print(response.status_code)

        print("OPEN-METEO RESPONSE:")
        print(response.text)

        print("========================================")

        response.raise_for_status()

    except requests.RequestException as error:

        print("OPEN-METEO ERROR:")
        print(error)

        raise HTTPException(
            status_code=502,
            detail=f"Unable to fetch weather data: {error}"
        )

    # -----------------------------------------------------
    # Parse JSON
    # -----------------------------------------------------

    try:
        data = response.json()

    except ValueError as error:

        print("JSON PARSE ERROR:")
        print(error)

        raise HTTPException(
            status_code=502,
            detail="Open-Meteo returned invalid JSON."
        )

    # -----------------------------------------------------
    # Validate response
    # -----------------------------------------------------

    if "current" not in data:
        raise HTTPException(
            status_code=502,
            detail="Open-Meteo response is missing current weather data."
        )

    if "hourly" not in data:
        raise HTTPException(
            status_code=502,
            detail="Open-Meteo response is missing hourly weather data."
        )

    current = data["current"]
    hourly = data["hourly"]

    # -----------------------------------------------------
    # Find current hour
    # -----------------------------------------------------

    current_time = current.get("time")

    hourly_times = hourly.get("time", [])

    if current_time in hourly_times:
        current_index = hourly_times.index(current_time)
    else:
        current_index = 0

    # -----------------------------------------------------
    # Rain probability
    # -----------------------------------------------------

    rain_probability_list = hourly.get(
        "precipitation_probability",
        []
    )

    if rain_probability_list:
        rain_probability = (
            rain_probability_list[current_index]
            if current_index < len(rain_probability_list)
            else rain_probability_list[0]
        )
    else:
        rain_probability = 0

    # -----------------------------------------------------
    # Extract weather values
    # -----------------------------------------------------

    try:
        weather_data = {
            "temperature": current["temperature_2m"],
            "humidity": current["relative_humidity_2m"],
            "wind_speed": current["wind_speed_10m"],
            "rainfall": current["precipitation"],
            "rain_probability": rain_probability,
        }

    except KeyError as error:

        print("MISSING WEATHER FIELD:")
        print(error)

        raise HTTPException(
            status_code=502,
            detail=f"Open-Meteo response is missing field: {error}"
        )

    # -----------------------------------------------------
    # Calculate ASTRA risk
    # -----------------------------------------------------

    try:

        risk = calculate_risk(weather_data)

    except ValueError as error:

        print("RISK ENGINE ERROR:")
        print(error)

        raise HTTPException(
            status_code=500,
            detail=f"Risk engine error: {error}"
        )

    except Exception as error:

        print("UNEXPECTED RISK ENGINE ERROR:")
        print(error)

        raise HTTPException(
            status_code=500,
            detail=f"Unexpected risk engine error: {error}"
        )

    # -----------------------------------------------------
    # Final response
    # -----------------------------------------------------

    return {
        "location": {
            "latitude": latitude,
            "longitude": longitude
        },
        "weather": weather_data,
        "risk": risk
    }