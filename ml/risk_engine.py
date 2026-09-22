def calculate_risk(weather_data):
    required_fields = [
        "temperature",
        "rainfall",
        "rain_probability",
        "wind_speed",
        "humidity"
    ]

    # Validation
    for field in required_fields:
        if field not in weather_data:
            raise ValueError(f"Missing weather field: {field}")

    if not -50 <= weather_data["temperature"] <= 60:
        raise ValueError("Temperature must be between -50 and 60 °C")

    if weather_data["rainfall"] < 0:
        raise ValueError("Rainfall cannot be negative")

    if not 0 <= weather_data["rain_probability"] <= 100:
        raise ValueError("Rain probability must be between 0 and 100")

    if weather_data["wind_speed"] < 0:
        raise ValueError("Wind speed cannot be negative")

    if not 0 <= weather_data["humidity"] <= 100:
        raise ValueError("Humidity must be between 0 and 100")

    # Extract values
    rainfall = weather_data["rainfall"]
    rain_probability = weather_data["rain_probability"]
    wind_speed = weather_data["wind_speed"]
    humidity = weather_data["humidity"]

    # Rainfall risk: previous 15 minutes
    if rainfall < 2:
        rainfall_risk = 10
    elif rainfall < 5:
        rainfall_risk = 40
    elif rainfall < 10:
        rainfall_risk = 70
    else:
        rainfall_risk = 100

    # Rain probability risk
    probability_risk = rain_probability

    # Wind risk
    if wind_speed < 20:
        wind_risk = 10
    elif wind_speed < 40:
        wind_risk = 40
    elif wind_speed < 60:
        wind_risk = 70
    else:
        wind_risk = 100

    # Humidity risk
    if humidity < 60:
        humidity_risk = 10
    elif humidity < 80:
        humidity_risk = 40
    elif humidity < 90:
        humidity_risk = 70
    else:
        humidity_risk = 100

    # Weighted score
    score = (
        rainfall_risk * 0.40
        + probability_risk * 0.30
        + wind_risk * 0.20
        + humidity_risk * 0.10
    )

    score = round(score)

    # Risk level
    if score <= 30:
        level = "LOW"
    elif score <= 60:
        level = "MODERATE"
    elif score <= 80:
        level = "HIGH"
    else:
        level = "EXTREME"

    # Explainable factors
    factors = []

    if rainfall >= 5:
        factors.append("Heavy rainfall")

    if rain_probability >= 70:
        factors.append("High precipitation probability")

    if wind_speed >= 40:
        factors.append("Strong winds")

    if humidity >= 80:
        factors.append("High humidity")

    return {
        "score": score,
        "level": level,
        "factors": factors
    }