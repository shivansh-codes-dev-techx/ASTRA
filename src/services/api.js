const API_BASE_URL = "http://127.0.0.1:8000";

export async function getWeatherByCity(city) {
  const response = await fetch(
    `${API_BASE_URL}/weather?city=${encodeURIComponent(city)}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch weather data");
  }

  return response.json();
}