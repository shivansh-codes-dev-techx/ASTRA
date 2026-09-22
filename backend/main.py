from fastapi import FastAPI, HTTPException
import requests

from ml.risk_engine import calculate_risk


app = FastAPI(title="ASTRA API")


@app.get("/")
def home():
    return {
        "project": "ASTRA",
        "status": "Backend is running"
    }


@app.get("/weather")
def get_weather(latitude: float, longitude: float):

    url = "https://api.open-meteo.com/v1/forecast"

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation",
        "hourly": "precipitation_probability,precipitation",
        "forecast_days": 1
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()

    except requests.RequestException:
        raise HTTPException(
            status_code=502,
            detail="Unable to fetch weather data"
        )

    data = response.json()

    current = data["current"]
    hourly = data["hourly"]

    current_time = current["time"]

    if current_time in hourly["time"]:
        current_index = hourly["time"].index(current_time)
    else:
        current_index = 0

    rain_probability = hourly["precipitation_probability"][current_index]

    weather_data = {
        "temperature": current["temperature_2m"],
        "humidity": current["relative_humidity_2m"],
        "wind_speed": current["wind_speed_10m"],
        "rainfall": current["precipitation"],
        "rain_probability": rain_probability
    }

    try:
        risk = calculate_risk(weather_data)

    except ValueError as error:
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )

    return {
        "location": {
            "latitude": latitude,
            "longitude": longitude
        },
        "weather": weather_data,
        "risk": risk
    }