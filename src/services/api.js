const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000";

export async function getWeatherByCoordinates(
  latitude,
  longitude
) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  });

  const response = await fetch(
    `${API_BASE_URL}/weather?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(
      `Weather API failed with status ${response.status}`
    );
  }

  const data = await response.json();

  // Validate the response before accessing nested properties
  if (!data) {
    throw new Error("Weather API returned an empty response.");
  }

  if (!data.weather) {
    throw new Error(
      "Weather API response is missing weather data."
    );
  }

  if (!data.risk) {
    throw new Error(
      "Weather API response is missing risk data."
    );
  }

  return {
    location: {
      latitude:
        data.location?.latitude ?? latitude,
      longitude:
        data.location?.longitude ?? longitude,
    },

    weather: {
      temperature:
        data.weather.temperature ?? 0,

      humidity:
        data.weather.humidity ?? 0,

      windSpeed:
        data.weather.wind_speed ?? 0,

      rainfall:
        data.weather.rainfall ?? 0,

      rainProbability:
        data.weather.rain_probability ?? 0,
    },

    risk: {
      score:
        data.risk.score ?? 0,

      level:
        data.risk.level ?? "LOW",

      factors:
        Array.isArray(data.risk.factors)
          ? data.risk.factors
          : [],
    },
  };
}