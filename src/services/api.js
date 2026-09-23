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

  return {
    location: {
      latitude: data.location.latitude,
      longitude: data.location.longitude,
    },

    weather: {
      temperature: data.weather.temperature,
      humidity: data.weather.humidity,
      windSpeed: data.weather.wind_speed,
      rainfall: data.weather.rainfall,
      rainProbability:
        data.weather.rain_probability,
    },

    risk: {
      score: data.risk.score,
      level: data.risk.level,
      factors: data.risk.factors ?? [],
    },
  };
}