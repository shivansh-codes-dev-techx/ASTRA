import { weatherData, riskData } from "../data/mockData";

export async function getWeatherData() {
  // Temporary mock implementation.
  // Replace with API call when backend contract is finalized.

  await new Promise((resolve) => setTimeout(resolve, 800));

  return {
    weather: weatherData,
    risk: riskData,
  };
}