export function getAssistantResponse({
  question,
  location,
  weather,
  risk,
}) {
  const text = String(question || "").toLowerCase().trim();

  const riskLevel = risk?.level || "LOW";
  const riskScore = Number(risk?.score ?? 0);
  const rainfall = Number(weather?.rainfall ?? 0);
  const rainProbability = Number(weather?.rainProbability ?? 0);
  const windSpeed = Number(weather?.windSpeed ?? 0);
  const temperature = Number(weather?.temperature ?? 0);
  const humidity = Number(weather?.humidity ?? 0);

  const factors =
    Array.isArray(risk?.factors) && risk.factors.length
      ? risk.factors.join(", ")
      : "current weather conditions";

  if (!text) {
    return `Ask me about travel safety, rainfall, weather risk, wind, temperature, or current conditions in ${location}.`;
  }

  if (
    text.includes("travel") ||
    text.includes("safe") ||
    text.includes("drive") ||
    text.includes("road") ||
    text.includes("journey")
  ) {
    if (riskLevel === "EXTREME" || riskLevel === "HIGH") {
      return `Travel conditions in ${location} may be affected by the current ${riskLevel.toLowerCase()} weather risk. Rainfall is around ${rainfall} mm with a ${rainProbability}% chance of rain. Consider avoiding unnecessary travel and monitor official weather alerts.`;
    }

    return `Current conditions in ${location} show a ${riskLevel.toLowerCase()} weather risk. Rainfall is around ${rainfall} mm with a ${rainProbability}% chance of rain. Check local conditions before travelling.`;
  }

  if (
    text.includes("rain") ||
    text.includes("rainfall") ||
    text.includes("umbrella") ||
    text.includes("precipitation")
  ) {
    return `${location} currently has around ${rainfall} mm of rainfall with a ${rainProbability}% probability of rain. The current weather risk level is ${riskLevel}.`;
  }

  if (
    text.includes("risk") ||
    text.includes("danger") ||
    text.includes("weather") ||
    text.includes("alert")
  ) {
    return `${location} currently has a ${riskLevel} weather risk with a score of ${riskScore}/100. Main factors include: ${factors}.`;
  }

  if (
    text.includes("wind") ||
    text.includes("storm") ||
    text.includes("gust")
  ) {
    return `The current wind speed in ${location} is approximately ${windSpeed} km/h. The overall weather risk is ${riskLevel} with a score of ${riskScore}/100.`;
  }

  if (
    text.includes("temperature") ||
    text.includes("hot") ||
    text.includes("cold") ||
    text.includes("heat")
  ) {
    return `The current temperature in ${location} is ${temperature}°C. Humidity is ${humidity}% and the current weather risk level is ${riskLevel}.`;
  }

  if (
    text.includes("humidity") ||
    text.includes("humid")
  ) {
    return `The current humidity in ${location} is ${humidity}%. The current temperature is ${temperature}°C and the weather risk level is ${riskLevel}.`;
  }

  return `For ${location}, the current weather risk is ${riskLevel} with a score of ${riskScore}/100. Temperature is ${temperature}°C, rainfall is ${rainfall} mm, rain probability is ${rainProbability}%, wind speed is ${windSpeed} km/h, and humidity is ${humidity}%.`;
}